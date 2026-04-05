/**
 * ReAct (Reasoning and Acting) Agent with Reflection
 * Implements the ReAct pattern with self-reflection capabilities for improved reasoning
 */

import { z } from "zod";
import { ChatRequest, BaseProvider } from "../models";
import { AIModelGateway } from "../gateway/router";
import { BaseMemoryStore } from "../memory/store";
import { ToolContext } from "../tools/base";
import { AgentTelemetry } from "../core/telemetry";
import { logger } from "../core/logger";
import { withRetries } from "../core/resilience";
import { ValidationError, ToolExecutionError } from "../core/exceptions";

export interface ReActStep {
  thought: string;
  action: string;
  actionInput?: string;
  observation?: string;
  reflection?: string;
  timestamp: number;
}

export interface ReActOptions {
  /** Maximum number of reasoning steps (default: 10) */
  maxSteps?: number;
  /** Enable reflection after each step (default: true) */
  enableReflection?: boolean;
  /** Reflection prompt template (default: built-in) */
  reflectionPrompt?: string;
  /** Force reflection on failures (default: true) */
  reflectOnFailures?: boolean;
  /** Minimum confidence to proceed without reflection (0-1, default: 0.7) */
  confidenceThreshold?: number;
}

export class ReActAgent {
  private gateway: AIModelGateway | BaseProvider;
  private memory: BaseMemoryStore;
  private tools: Map<string, ToolContext>;
  private systemPrompt?: string;
  private telemetry?: AgentTelemetry;
  private options: Required<ReActOptions>;
  private steps: ReActStep[] = [];

  constructor(options: {
    gateway: AIModelGateway | BaseProvider;
    memory: BaseMemoryStore;
    tools?: ToolContext[];
    systemPrompt?: string;
    telemetry?: AgentTelemetry;
    reactOptions?: ReActOptions;
  }) {
    if (!options.gateway) throw new ValidationError("ReActAgent", "gateway is required.");
    if (!options.memory) throw new ValidationError("ReActAgent", "memory is required.");

    this.gateway = options.gateway;
    this.memory = options.memory;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.systemPrompt = options.systemPrompt;
    this.telemetry = options.telemetry;
    
    this.options = {
      maxSteps: options.reactOptions?.maxSteps ?? 10,
      enableReflection: options.reactOptions?.enableReflection ?? true,
      reflectionPrompt: options.reactOptions?.reflectionPrompt ?? this.getDefaultReflectionPrompt(),
      reflectOnFailures: options.reactOptions?.reflectOnFailures ?? true,
      confidenceThreshold: options.reactOptions?.confidenceThreshold ?? 0.7,
    };
  }

  /**
   * Execute using ReAct pattern with reflection
   */
  async execute(sessionId: string, task: string): Promise<string> {
    if (!sessionId) throw new ValidationError("execute", "sessionId is required.");
    if (!task) throw new ValidationError("execute", "task is required.");

    this.telemetry?.onAgentStart?.(sessionId, task);
    logger.info(`Starting ReAct execution for session ${sessionId}`);
    
    // Initialize session
    await this.initializeSession(sessionId, task);
    this.steps = [];

    // Main reasoning loop
    for (let step = 0; step < this.options.maxSteps; step++) {
      const reactStep = await this.performReActStep(sessionId, step);
      this.steps.push(reactStep);

      // Check if we've reached the final answer
      if (reactStep.action.toLowerCase() === "finish" || reactStep.action.toLowerCase() === "final") {
        const finalAnswer = reactStep.actionInput || reactStep.thought;
        this.telemetry?.onAgentEnd?.(sessionId, finalAnswer);
        logger.info(`ReAct execution completed for session ${sessionId} in ${step + 1} steps`);
        return finalAnswer;
      }

      // Execute action if it's a tool
      if (reactStep.action.toLowerCase() !== "think") {
        const observation = await this.executeAction(sessionId, reactStep);
        reactStep.observation = observation;

        // Add observation to memory
        await this.memory.addMessage(sessionId, {
          role: "assistant",
          content: `Observation: ${observation}`
        });

        // Reflect on the result
        if (this.options.enableReflection) {
          const shouldReflect = 
            this.options.reflectOnFailures && this.isFailure(observation) ||
            await this.shouldReflect(reactStep);

          if (shouldReflect) {
            const reflection = await this.reflect(sessionId, reactStep);
            reactStep.reflection = reflection;
            
            await this.memory.addMessage(sessionId, {
              role: "assistant",
              content: `Reflection: ${reflection}`
            });
          }
        }
      }
    }

    // If we reach here, we didn't find a solution
    const summary = this.summarizeSteps();
    this.telemetry?.onAgentEnd?.(sessionId, `Max steps reached. Summary: ${summary}`);
    throw new Error(`ReAct agent failed to complete task in ${this.options.maxSteps} steps. Last action: ${this.steps[this.steps.length - 1]?.action}`);
  }

  /**
   * Stream ReAct execution with real-time updates
   */
  async *executeStream(sessionId: string, task: string): AsyncGenerator<{
    type: "thought" | "action" | "observation" | "reflection" | "final";
    content: string;
    step: number;
  }, void, unknown> {
    if (!sessionId) throw new ValidationError("executeStream", "sessionId is required.");
    
    await this.initializeSession(sessionId, task);
    this.steps = [];

    for (let step = 0; step < this.options.maxSteps; step++) {
      // Get thought
      const thought = await this.generateThought(sessionId, step);
      yield { type: "thought", content: thought, step };

      // Get action
      const { action, actionInput } = await this.generateAction(sessionId, thought);
      yield { type: "action", content: `${action}${actionInput ? `: ${actionInput}` : ""}`, step };

      const reactStep: ReActStep = {
        thought,
        action,
        actionInput,
        timestamp: Date.now()
      };

      if (action.toLowerCase() === "finish" || action.toLowerCase() === "final") {
        const finalAnswer = actionInput || thought;
        yield { type: "final", content: finalAnswer, step };
        return;
      }

      // Execute action
      if (action.toLowerCase() !== "think") {
        const observation = await this.executeAction(sessionId, reactStep);
        reactStep.observation = observation;
        yield { type: "observation", content: observation, step };

        // Add to memory
        await this.memory.addMessage(sessionId, {
          role: "assistant",
          content: `Observation: ${observation}`
        });

        // Reflect if needed
        if (this.options.enableReflection) {
          const shouldReflect = 
            this.options.reflectOnFailures && this.isFailure(observation) ||
            await this.shouldReflect(reactStep);

          if (shouldReflect) {
            const reflection = await this.reflect(sessionId, reactStep);
            reactStep.reflection = reflection;
            yield { type: "reflection", content: reflection, step };

            await this.memory.addMessage(sessionId, {
              role: "assistant",
              content: `Reflection: ${reflection}`
            });
          }
        }
      }

      this.steps.push(reactStep);
    }

    throw new Error(`ReAct agent failed to complete task in ${this.options.maxSteps} steps`);
  }

  /**
   * Initialize session with ReAct system prompt
   */
  private async initializeSession(sessionId: string, task: string): Promise<void> {
    const systemPrompt = this.systemPrompt || "You are a helpful AI assistant.";
    const reactPrompt = `${systemPrompt}

You are using the ReAct (Reasoning and Acting) pattern. For each step, you must:
1. Think about what you need to do
2. Choose an action (tool name or "finish")
3. Provide input for the action

Available tools: ${[...this.tools.keys()].join(", ")}

Example format:
Thought: I need to find information about X
Action: search
Action Input: X
Observation: [Tool result]
Thought: Based on the observation, I should...
Action: finish
Action Input: [Final answer]`;

    await this.memory.clearSession(sessionId);
    await this.memory.addMessage(sessionId, { role: "system", content: reactPrompt });
    await this.memory.addMessage(sessionId, { role: "user", content: task });
  }

  /**
   * Perform a single ReAct step
   */
  private async performReActStep(sessionId: string, stepNumber: number): Promise<ReActStep> {
    const thought = await this.generateThought(sessionId, stepNumber);
    const { action, actionInput } = await this.generateAction(sessionId, thought);

    return {
      thought,
      action,
      actionInput,
      timestamp: Date.now()
    };
  }

  /**
   * Generate thought for current step
   */
  private async generateThought(sessionId: string, stepNumber: number): Promise<string> {
    const history = await this.memory.getMessages(sessionId);
    const prompt = `Step ${stepNumber + 1}. Based on the conversation so far, what is your current thought process?`;

    const request: ChatRequest = {
      messages: [...history, { role: "user", content: prompt }],
      model_family: "smart",
      temperature: 0.7,
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete(request),
      { maxRetries: 3, initialDelayMs: 1000 },
      "ReActAgent.generateThought"
    );

    return response.content || "";
  }

  /**
   * Generate action based on thought
   */
  private async generateAction(sessionId: string, thought: string): Promise<{ action: string; actionInput?: string }> {
    const history = await this.memory.getMessages(sessionId);
    const prompt = `Based on your thought: "${thought}"

What action should you take? Respond in the format:
Action: [tool name or "finish"]
Action Input: [input for the tool, or nothing if "finish"]`;

    const request: ChatRequest = {
      messages: [...history, { role: "user", content: prompt }],
      model_family: "smart",
      temperature: 0.3, // Lower temperature for structured output
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete(request),
      { maxRetries: 3, initialDelayMs: 1000 },
      "ReActAgent.generateAction"
    );

    const content = response.content || "";
    const actionMatch = content.match(/Action:\s*(.+)/i);
    const inputMatch = content.match(/Action Input:\s*(.+)/i);

    const action = actionMatch ? actionMatch[1].trim() : "think";
    const actionInput = inputMatch ? inputMatch[1].trim() : undefined;

    return { action, actionInput };
  }

  /**
   * Execute the specified action
   */
  private async executeAction(sessionId: string, step: ReActStep): Promise<string> {
    const { action, actionInput } = step;

    if (action.toLowerCase() === "think" || !actionInput) {
      return "Continuing to think...";
    }

    const tool = this.tools.get(action);
    if (!tool) {
      return `Error: Tool '${action}' not found. Available tools: ${[...this.tools.keys()].join(", ")}`;
    }

    try {
      const args = JSON.parse(actionInput);
      this.telemetry?.onToolStart?.(sessionId, action, args);
      
      const result = await tool.execute(args);
      this.telemetry?.onToolEnd?.(sessionId, action, result);
      
      return result;
    } catch (e: any) {
      const error = new ToolExecutionError(action, e.message);
      this.telemetry?.onToolEnd?.(sessionId, action, error.message);
      return error.message;
    }
  }

  /**
   * Check if an observation indicates failure
   */
  private isFailure(observation: string): boolean {
    const failureIndicators = [
      "error", "failed", "unable", "cannot", "not found", 
      "invalid", "incorrect", "missing", "denied"
    ];
    
    return failureIndicators.some(indicator => 
      observation.toLowerCase().includes(indicator)
    );
  }

  /**
   * Determine if reflection is needed
   */
  private async shouldReflect(step: ReActStep): Promise<boolean> {
    // Simple heuristic-based reflection decision
    // In a more sophisticated implementation, this could use the LLM itself
    const thoughtLength = step.thought.length;
    const hasComplexity = step.thought.includes("?") || step.thought.includes("maybe");
    
    return thoughtLength > 200 || hasComplexity;
  }

  /**
   * Reflect on the current step
   */
  private async reflect(sessionId: string, step: ReActStep): Promise<string> {
    const history = await this.memory.getMessages(sessionId);
    
    const reflectionPrompt = `${this.options.reflectionPrompt}

Current step:
Thought: ${step.thought}
Action: ${step.action}
Action Input: ${step.actionInput || ""}
Observation: ${step.observation || ""}

Please reflect on this step and provide insights for improvement.`;

    const request: ChatRequest = {
      messages: [...history, { role: "user", content: reflectionPrompt }],
      model_family: "smart",
      temperature: 0.5,
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete(request),
      { maxRetries: 3, initialDelayMs: 1000 },
      "ReActAgent.reflect"
    );

    return response.content || "";
  }

  /**
   * Get default reflection prompt
   */
  private getDefaultReflectionPrompt(): string {
    return `Reflect on the previous step:
- Was the thought process clear and logical?
- Was the chosen action appropriate?
- Was the action input correct?
- What could be improved?
- Should we try a different approach?`;
  }

  /**
   * Summarize all steps taken
   */
  private summarizeSteps(): string {
    return this.steps.map((step, i) => 
      `Step ${i + 1}: ${step.action} - ${step.observation || "No observation"}`
    ).join("\n");
  }

  /**
   * Get execution history
   */
  getSteps(): ReActStep[] {
    return [...this.steps];
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.steps = [];
  }

  getMemory(): BaseMemoryStore {
    return this.memory;
  }
}
