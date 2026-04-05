/**
 * Chain of Thought (CoT) Agent
 * Implements step-by-step reasoning with explicit thinking process
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

export interface CoTStep {
  stepNumber: number;
  reasoning: string;
  conclusion?: string;
  toolsUsed?: string[];
  timestamp: number;
}

export interface CoTOptions {
  /** Maximum number of reasoning steps (default: 8) */
  maxSteps?: number;
  /** Show step numbers in output (default: true) */
  showStepNumbers?: boolean;
  /** Require conclusion for each step (default: true) */
  requireConclusions?: boolean;
  /** Enable self-questioning (default: true) */
  enableSelfQuestioning?: boolean;
  /** Prompt template for CoT (default: built-in) */
  cotPrompt?: string;
}

export class CoTAgent {
  private gateway: AIModelGateway | BaseProvider;
  private memory: BaseMemoryStore;
  private tools: Map<string, ToolContext>;
  private systemPrompt?: string;
  private telemetry?: AgentTelemetry;
  private options: Required<CoTOptions>;
  private steps: CoTStep[] = [];

  constructor(options: {
    gateway: AIModelGateway | BaseProvider;
    memory: BaseMemoryStore;
    tools?: ToolContext[];
    systemPrompt?: string;
    telemetry?: AgentTelemetry;
    cotOptions?: CoTOptions;
  }) {
    if (!options.gateway) throw new ValidationError("CoTAgent", "gateway is required.");
    if (!options.memory) throw new ValidationError("CoTAgent", "memory is required.");

    this.gateway = options.gateway;
    this.memory = options.memory;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.systemPrompt = options.systemPrompt;
    this.telemetry = options.telemetry;
    
    this.options = {
      maxSteps: options.cotOptions?.maxSteps ?? 8,
      showStepNumbers: options.cotOptions?.showStepNumbers ?? true,
      requireConclusions: options.cotOptions?.requireConclusions ?? true,
      enableSelfQuestioning: options.cotOptions?.enableSelfQuestioning ?? true,
      cotPrompt: options.cotOptions?.cotPrompt ?? this.getDefaultCoTPrompt(),
    };
  }

  /**
   * Execute using Chain of Thought reasoning
   */
  async execute(sessionId: string, task: string): Promise<string> {
    if (!sessionId) throw new ValidationError("execute", "sessionId is required.");
    if (!task) throw new ValidationError("execute", "task is required.");

    this.telemetry?.onAgentStart?.(sessionId, task);
    logger.info(`Starting CoT execution for session ${sessionId}`);
    
    // Initialize session
    await this.initializeSession(sessionId, task);
    this.steps = [];

    // Generate reasoning steps
    const reasoning = await this.generateReasoning(sessionId);
    
    // Parse and execute steps
    const finalAnswer = await this.processReasoning(sessionId, reasoning);
    
    this.telemetry?.onAgentEnd?.(sessionId, finalAnswer);
    logger.info(`CoT execution completed for session ${sessionId}`);
    
    return finalAnswer;
  }

  /**
   * Stream CoT execution with real-time reasoning display
   */
  async *executeStream(sessionId: string, task: string): AsyncGenerator<{
    type: "step" | "reasoning" | "final";
    content: string;
    stepNumber?: number;
  }, void, unknown> {
    if (!sessionId) throw new ValidationError("executeStream", "sessionId is required.");
    
    await this.initializeSession(sessionId, task);
    this.steps = [];

    // Generate and stream reasoning
    const reasoningStream = this.generateReasoningStream(sessionId);
    let fullReasoning = "";
    
    for await (const chunk of reasoningStream) {
      fullReasoning += chunk;
      yield { type: "reasoning", content: chunk };
    }

    // Process the complete reasoning
    const finalAnswer = await this.processReasoning(sessionId, fullReasoning);
    yield { type: "final", content: finalAnswer };
  }

  /**
   * Initialize session with CoT system prompt
   */
  private async initializeSession(sessionId: string, task: string): Promise<void> {
    const systemPrompt = this.systemPrompt || "You are a helpful AI assistant.";
    const cotPrompt = `${systemPrompt}

${this.options.cotPrompt}

Available tools: ${[...this.tools.keys()].join(", ")}

Think step by step and explain your reasoning clearly before providing the final answer.`;

    await this.memory.clearSession(sessionId);
    await this.memory.addMessage(sessionId, { role: "system", content: cotPrompt });
    await this.memory.addMessage(sessionId, { role: "user", content: task });
  }

  /**
   * Generate complete reasoning chain
   */
  private async generateReasoning(sessionId: string): Promise<string> {
    const history = await this.memory.getMessages(sessionId);
    
    const request: ChatRequest = {
      messages: history,
      tools: this.tools.size > 0 ? Array.from(this.tools.values()).map(t => t.getMcpSchema()) : undefined,
      model_family: "smart",
      temperature: 0.8, // Higher temperature for creative reasoning
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete(request),
      { maxRetries: 3, initialDelayMs: 1000 },
      "CoTAgent.generateReasoning"
    );

    return response.content || "";
  }

  /**
   * Generate reasoning with streaming
   */
  private async *generateReasoningStream(sessionId: string): AsyncGenerator<string, void, unknown> {
    const history = await this.memory.getMessages(sessionId);
    
    if (this.gateway.chatStream) {
      const request: ChatRequest = {
        messages: history,
        tools: this.tools.size > 0 ? Array.from(this.tools.values()).map(t => t.getMcpSchema()) : undefined,
        model_family: "smart",
        temperature: 0.8,
        stream: true,
      };

      for await (const chunk of this.gateway.chatStream(request)) {
        yield chunk;
      }
    } else {
      // Fallback to non-streaming
      const reasoning = await this.generateReasoning(sessionId);
      yield reasoning;
    }
  }

  /**
   * Process reasoning and execute tools if needed
   */
  private async processReasoning(sessionId: string, reasoning: string): Promise<string> {
    // Parse reasoning into steps
    const steps = this.parseReasoningSteps(reasoning);
    
    // Execute each step
    for (const step of steps) {
      await this.executeStep(sessionId, step);
    }

    // Extract final answer
    return this.extractFinalAnswer(reasoning);
  }

  /**
   * Parse reasoning into individual steps
   */
  private parseReasoningSteps(reasoning: string): CoTStep[] {
    const steps: CoTStep[] = [];
    const lines = reasoning.split('\n');
    let currentStep: CoTStep | null = null;
    let stepNumber = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect step start
      const stepMatch = trimmed.match(/^(\d+)[.\)]\s*(.+)$/);
      if (stepMatch) {
        // Save previous step
        if (currentStep) {
          steps.push(currentStep);
        }
        
        // Start new step
        stepNumber = parseInt(stepMatch[1]);
        currentStep = {
          stepNumber,
          reasoning: stepMatch[2],
          timestamp: Date.now()
        };
      } else if (currentStep && trimmed) {
        // Continue current step
        currentStep.reasoning += " " + trimmed;
      }
    }

    // Save last step
    if (currentStep) {
      steps.push(currentStep);
    }

    // If no numbered steps found, treat whole reasoning as one step
    if (steps.length === 0) {
      steps.push({
        stepNumber: 1,
        reasoning,
        timestamp: Date.now()
      });
    }

    return steps;
  }

  /**
   * Execute a single reasoning step
   */
  private async executeStep(sessionId: string, step: CoTStep): Promise<void> {
    // Check for tool usage in reasoning
    const toolCalls = this.extractToolCalls(step.reasoning);
    
    if (toolCalls.length > 0) {
      step.toolsUsed = [];
      
      for (const toolCall of toolCalls) {
        const result = await this.executeToolCall(toolCall.tool, toolCall.input, sessionId);
        step.toolsUsed.push(toolCall.tool);
        
        // Add tool result to memory
        await this.memory.addMessage(sessionId, {
          role: "assistant",
          content: `Tool ${toolCall.tool} result: ${result}`
        });
      }
    }

    // Add step to memory
    const stepText = this.options.showStepNumbers 
      ? `Step ${step.stepNumber}: ${step.reasoning}`
      : step.reasoning;
    
    await this.memory.addMessage(sessionId, {
      role: "assistant",
      content: stepText
    });

    this.steps.push(step);
  }

  /**
   * Extract tool calls from reasoning text
   */
  private extractToolCalls(reasoning: string): Array<{ tool: string; input: string }> {
    const toolCalls: Array<{ tool: string; input: string }> = [];
    
    // Look for patterns like "use search tool with 'query'" or "search('query')"
    const patterns = [
      /(\w+)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /use\s+(\w+)\s+(?:tool\s+)?with\s+['"]([^'"]+)['"]/gi,
      /(\w+):\s*['"]([^'"]+)['"]/g
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(reasoning)) !== null) {
        const tool = match[1];
        const input = match[2];
        
        if (this.tools.has(tool)) {
          toolCalls.push({ tool, input });
        }
      }
    }

    return toolCalls;
  }

  /**
   * Execute a tool call
   */
  private async executeToolCall(toolName: string, input: string, sessionId: string): Promise<string> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool '${toolName}' not found`;
    }

    try {
      // Try to parse input as JSON, fallback to string
      let args: any;
      try {
        args = JSON.parse(input);
      } catch {
        args = { query: input };
      }

      this.telemetry?.onToolStart?.(sessionId, toolName, args);
      
      const result = await tool.execute(args);
      this.telemetry?.onToolEnd?.(sessionId, toolName, result);
      
      return result;
    } catch (e: any) {
      const error = new ToolExecutionError(toolName, e.message);
      return error.message;
    }
  }

  /**
   * Extract final answer from reasoning
   */
  private extractFinalAnswer(reasoning: string): string {
    // Look for final answer patterns
    const patterns = [
      /Final Answer:\s*(.+)/i,
      /Conclusion:\s*(.+)/i,
      /Therefore,\s*(.+)/i,
      /In conclusion,\s*(.+)/i,
      /Answer:\s*(.+)/i
    ];

    for (const pattern of patterns) {
      const match = reasoning.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no explicit final answer, return the last paragraph
    const paragraphs = reasoning.split('\n\n').filter(p => p.trim());
    return paragraphs[paragraphs.length - 1] || reasoning;
  }

  /**
   * Get default CoT prompt
   */
  private getDefaultCoTPrompt(): string {
    return `You are using Chain of Thought reasoning. Please think step by step and explain your reasoning process clearly.

For each step:
1. State what you're trying to figure out
2. Explain your reasoning process
3. Show any calculations or logical steps
4. Draw a conclusion for that step

Use tools when needed by specifying the tool name and input.

Format your response with numbered steps (1., 2., 3., etc.) and end with a clear Final Answer.

Example:
1. First, I need to understand what the user is asking for. They want to know...
2. To answer this, I should search for information about...
3. Based on the search results, I can see that...
Final Answer: [Your final answer]`;
  }

  /**
   * Get reasoning steps
   */
  getSteps(): CoTStep[] {
    return [...this.steps];
  }

  /**
   * Clear reasoning history
   */
  clearHistory(): void {
    this.steps = [];
  }

  getMemory(): BaseMemoryStore {
    return this.memory;
  }
}
