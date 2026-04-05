/**
 * Enhanced AgentExecutor with parallel tool execution, advanced reasoning patterns,
 * and improved streaming capabilities
 */

import { z } from "zod";
import { ChatRequest, BaseProvider } from "../models";
import { AIModelGateway } from "../gateway/router";
import { BaseMemoryStore } from "../memory/store";
import { ToolContext } from "../tools/base";
import { AgentTelemetry } from "../core/telemetry";
import { logger } from "../core/logger";
import { withRetries } from "../core/resilience";
import { ToolExecutionError, AgentIterationLimitError, StructuredOutputError, ValidationError } from "../core/exceptions";
import { StreamChunk } from "../core/streaming";

export interface ToolDependency {
  toolName: string;
  dependsOn: string[];
  provides: string[];
}

export interface ParallelExecutionOptions {
  /** Enable parallel tool execution when possible (default: true) */
  enableParallel?: boolean;
  /** Maximum number of tools to execute in parallel (default: 3) */
  maxParallelTools?: number;
  /** Default timeout for each tool in milliseconds (default: 30000) */
  toolTimeout?: number;
  /** Enable streaming tool results (default: false) */
  streamToolResults?: boolean;
}

export interface ReasoningPattern {
  type: "standard" | "react" | "cot" | "tot" | "self_correct";
  options?: Record<string, any>;
}

export interface ToolExecutionResult {
  toolName: string;
  toolId: string;
  result: string;
  executionTime: number;
  success: boolean;
  error?: string;
}

export class EnhancedAgentExecutor {
  private gateway: AIModelGateway | BaseProvider;
  private memory: BaseMemoryStore;
  private tools: Map<string, ToolContext>;
  private toolDependencies: Map<string, ToolDependency>;
  private systemPrompt?: string;
  private telemetry?: AgentTelemetry;
  private executionOptions: Required<ParallelExecutionOptions>;

  constructor(options: {
    gateway: AIModelGateway | BaseProvider;
    memory: BaseMemoryStore;
    tools?: ToolContext[];
    toolDependencies?: ToolDependency[];
    systemPrompt?: string;
    telemetry?: AgentTelemetry;
    executionOptions?: ParallelExecutionOptions;
  }) {
    if (!options.gateway) throw new ValidationError("EnhancedAgentExecutor", "gateway is required.");
    if (!options.memory) throw new ValidationError("EnhancedAgentExecutor", "memory is required.");

    this.gateway = options.gateway;
    this.memory = options.memory;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.toolDependencies = new Map(
      (options.toolDependencies || []).map(d => [d.toolName, d])
    );
    this.systemPrompt = options.systemPrompt;
    this.telemetry = options.telemetry;
    
    this.executionOptions = {
      enableParallel: options.executionOptions?.enableParallel ?? true,
      maxParallelTools: options.executionOptions?.maxParallelTools ?? 3,
      toolTimeout: options.executionOptions?.toolTimeout ?? 30000,
      streamToolResults: options.executionOptions?.streamToolResults ?? false,
    };
  }

  /**
   * Execute with parallel tool support and enhanced reasoning
   */
  async execute(
    sessionId: string, 
    userInput: string, 
    maxIterations: number = 5,
    reasoningPattern: ReasoningPattern = { type: "standard" }
  ): Promise<string> {
    if (!sessionId) throw new ValidationError("execute", "sessionId is required.");
    if (!userInput) throw new ValidationError("execute", "userInput is required.");
    if (maxIterations < 1) throw new ValidationError("execute", "maxIterations must be at least 1.");

    this.telemetry?.onAgentStart?.(sessionId, userInput);
    logger.info(`Starting enhanced execution for session ${sessionId} with pattern: ${reasoningPattern.type}`);
    
    const history = await this.memory.getMessages(sessionId);

    if (history.length === 0 && this.systemPrompt) {
      const enhancedPrompt = this.buildEnhancedSystemPrompt(reasoningPattern);
      await this.memory.addMessage(sessionId, { role: "system", content: enhancedPrompt });
    }

    await this.memory.addMessage(sessionId, { role: "user", content: userInput });

    for (let i = 0; i < maxIterations; i++) {
      this.telemetry?.onAgentIteration?.(sessionId, i + 1);
      
      const currentHistory = await this.memory.getMessages(sessionId);
      const prompt = this.buildReasoningPrompt(currentHistory, reasoningPattern, i);
      
      const request: ChatRequest = {
        messages: [...currentHistory.slice(0, -1), { role: "user", content: prompt }],
        tools: this.tools.size > 0 ? Array.from(this.tools.values()).map(t => t.getMcpSchema()) : undefined,
        model_family: "smart",
        temperature: this.getTemperatureForPattern(reasoningPattern),
        stream: this.executionOptions.streamToolResults
      };

      const response = await withRetries(
        () => this.gateway.chatComplete(request),
        { maxRetries: 3, initialDelayMs: 1000 },
        "AIModelGateway.chatComplete"
      ).catch((e: any) => {
        this.telemetry?.onAgentEnd?.(sessionId, `Gateway error: ${e.message}`);
        throw e;
      });

      if (response.usage) {
        this.telemetry?.onTokenUsage?.(sessionId, response.provider_name || "unknown", response.model_name || "unknown", response.usage);
      }

      // Process the response based on reasoning pattern
      const processedContent = this.processResponse(response.content || "", reasoningPattern);
      
      await this.memory.addMessage(sessionId, {
        role: "assistant",
        content: processedContent,
        tool_calls: response.tool_calls || undefined,
      });

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const output = this.extractFinalAnswer(processedContent, reasoningPattern);
        this.telemetry?.onAgentEnd?.(sessionId, output);
        logger.info(`Enhanced execution finished for session ${sessionId}`);
        return output;
      }

      // Execute tools in parallel where possible
      const toolResults = await this.executeToolsParallel(sessionId, response.tool_calls);
      
      // Add tool results to memory
      for (const result of toolResults) {
        await this.memory.addMessage(sessionId, {
          role: "tool",
          content: result.result,
          tool_call_id: result.toolId,
        });
      }

      // Check for self-correction opportunity
      if (reasoningPattern.type === "self_correct" && this.shouldSelfCorrect(toolResults)) {
        await this.addSelfCorrectionPrompt(sessionId, toolResults);
      }
    }

    const error = new AgentIterationLimitError(maxIterations);
    this.telemetry?.onAgentEnd?.(sessionId, error.message);
    logger.warn(`Iteration limit reached for session ${sessionId}`);
    throw error;
  }

  /**
   * Enhanced streaming with parallel tool execution and structured chunks
   */
  async *executeStream(
    sessionId: string,
    userInput: string,
    maxIterations: number = 5,
    reasoningPattern: ReasoningPattern = { type: "standard" }
  ): AsyncGenerator<StreamChunk, void, unknown> {
    if (!sessionId) throw new ValidationError("executeStream", "sessionId is required.");
    
    this.telemetry?.onAgentStart?.(sessionId, userInput);
    
    // Initialize memory
    const history = await this.memory.getMessages(sessionId);
    if (history.length === 0 && this.systemPrompt) {
      const enhancedPrompt = this.buildEnhancedSystemPrompt(reasoningPattern);
      await this.memory.addMessage(sessionId, { role: "system", content: enhancedPrompt });
    }
    await this.memory.addMessage(sessionId, { role: "user", content: userInput });

    for (let i = 0; i < maxIterations; i++) {
      this.telemetry?.onAgentIteration?.(sessionId, i + 1);
      const currentHistory = await this.memory.getMessages(sessionId);
      const prompt = this.buildReasoningPrompt(currentHistory, reasoningPattern, i);

      // Use enhanced streaming if available
      if (this.gateway.chatStreamEnhanced) {
        const request: ChatRequest = {
          messages: [...currentHistory.slice(0, -1), { role: "user", content: prompt }],
          tools: this.tools.size > 0 ? Array.from(this.tools.values()).map(t => t.getMcpSchema()) : undefined,
          model_family: "smart",
          temperature: this.getTemperatureForPattern(reasoningPattern),
        };

        let fullContent = "";
        let toolCalls: any[] = [];
        
        for await (const chunk of this.gateway.chatStreamEnhanced(request)) {
          switch (chunk.type) {
            case "content":
              fullContent += chunk.content || "";
              yield {
                type: "content",
                content: chunk.content,
                metadata: { 
                  usage: undefined,
                  model: undefined,
                  provider: undefined,
                  iteration: i + 1, 
                  reasoning: reasoningPattern.type 
                }
              };
              break;
            case "tool_call":
              toolCalls.push(chunk.toolCall);
              yield {
                type: "tool_call",
                toolCall: chunk.toolCall,
                metadata: { 
                  usage: undefined,
                  model: undefined,
                  provider: undefined,
                  iteration: i + 1 
                }
              };
              break;
            case "error":
              yield {
                type: "error",
                error: chunk.error,
                metadata: { 
                  usage: undefined,
                  model: undefined,
                  provider: undefined,
                  iteration: i + 1 
                }
              };
              break;
          }
        }

        await this.memory.addMessage(sessionId, {
          role: "assistant",
          content: fullContent,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        if (toolCalls.length === 0) {
          const finalAnswer = this.extractFinalAnswer(fullContent, reasoningPattern);
          yield {
            type: "metadata",
            metadata: { 
              usage: undefined,
              model: undefined,
              provider: undefined,
              finished: true, 
              finalAnswer, 
              reasoning: reasoningPattern.type 
            }
          };
          return;
        }

        // Execute tools and stream results
        yield* this.streamToolExecution(sessionId, toolCalls);
      } else {
        // Fallback to regular streaming
        yield* this.fallbackStream(sessionId, userInput, maxIterations, reasoningPattern);
        return;
      }
    }
    
    yield {
      type: "error",
      error: { message: "Iteration limit reached", retryable: false }
    };
    throw new AgentIterationLimitError(maxIterations);
  }

  /**
   * Execute tools in parallel based on dependencies
   */
  private async executeToolsParallel(
    sessionId: string,
    toolCalls: any[]
  ): Promise<ToolExecutionResult[]> {
    if (!this.executionOptions.enableParallel || toolCalls.length === 1) {
      // Execute sequentially
      return this.executeToolsSequential(sessionId, toolCalls);
    }

    // Build dependency graph
    const executionGroups = this.buildExecutionGroups(toolCalls);
    const results: ToolExecutionResult[] = [];

    // Execute each group in order
    for (const group of executionGroups) {
      const groupResults = await Promise.allSettled(
        group.map(toolCall => this.executeSingleTool(sessionId, toolCall))
      );

      for (const result of groupResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            toolName: "unknown",
            toolId: "unknown",
            result: "",
            executionTime: 0,
            success: false,
            error: result.reason?.message || "Unknown error"
          });
        }
      }
    }

    return results;
  }

  /**
   * Build execution groups based on tool dependencies
   */
  private buildExecutionGroups(toolCalls: any[]): any[][] {
    const groups: any[][] = [];
    const processed = new Set<string>();
    const remaining = new Set(toolCalls.map(tc => tc.function.name));

    while (remaining.size > 0) {
      const currentGroup: any[] = [];
      
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        
        if (processed.has(toolName) || !remaining.has(toolName)) continue;
        
        const dependency = this.toolDependencies.get(toolName);
        const canExecute = !dependency || 
          dependency.dependsOn.every(dep => processed.has(dep));
        
        if (canExecute) {
          currentGroup.push(toolCall);
          processed.add(toolName);
          remaining.delete(toolName);
        }
      }
      
      if (currentGroup.length === 0) {
        // Circular dependency or missing dependency, execute remaining sequentially
        groups.push(Array.from(remaining).map(name => 
          toolCalls.find(tc => tc.function.name === name)!
        ));
        break;
      }
      
      // Limit group size
      if (currentGroup.length > this.executionOptions.maxParallelTools) {
        groups.push(currentGroup.slice(0, this.executionOptions.maxParallelTools));
        groups.push(currentGroup.slice(this.executionOptions.maxParallelTools));
      } else {
        groups.push(currentGroup);
      }
    }

    return groups;
  }

  /**
   * Execute a single tool with timeout
   */
  private async executeSingleTool(
    sessionId: string,
    toolCall: any
  ): Promise<ToolExecutionResult> {
    const toolName = toolCall.function.name;
    const toolId = toolCall.id;
    const startTime = Date.now();
    
    if (!this.tools.has(toolName)) {
      return {
        toolName,
        toolId,
        result: `Error: Tool '${toolName}' not found. Available tools: ${[...this.tools.keys()].join(", ")}`,
        executionTime: Date.now() - startTime,
        success: false
      };
    }

    const tool = this.tools.get(toolName)!;
    
    try {
      const args = JSON.parse(toolCall.function.arguments);
      this.telemetry?.onToolStart?.(sessionId, toolName, args);
      
      // Execute with timeout
      const result = await this.executeWithTimeout(
        tool.execute(args),
        this.executionOptions.toolTimeout,
        toolName
      );
      
      const executionTime = Date.now() - startTime;
      this.telemetry?.onToolEnd?.(sessionId, toolName, result);
      
      return {
        toolName,
        toolId,
        result,
        executionTime,
        success: true
      };
    } catch (e: any) {
      const executionTime = Date.now() - startTime;
      const error = new ToolExecutionError(toolName, e.message);
      this.telemetry?.onToolEnd?.(sessionId, toolName, error.message);
      
      return {
        toolName,
        toolId,
        result: error.message,
        executionTime,
        success: false,
        error: e.message
      };
    }
  }

  /**
   * Execute tools sequentially (fallback)
   */
  private async executeToolsSequential(
    sessionId: string,
    toolCalls: any[]
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    
    for (const toolCall of toolCalls) {
      const result = await this.executeSingleTool(sessionId, toolCall);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation '${operationName}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Stream tool execution results
   */
  private async *streamToolExecution(
    sessionId: string,
    toolCalls: any[]
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const executionGroups = this.buildExecutionGroups(toolCalls);
    
    for (const group of executionGroups) {
      // Signal start of parallel execution
      yield {
        type: "metadata",
        metadata: { 
          usage: undefined,
          toolGroupStart: true,
          toolCount: group.length,
          tools: group.map(tc => tc.function.name)
        }
      };

      // Execute tools in parallel within the group
      const toolPromises = group.map(async (toolCall) => {
        const toolName = toolCall.function.name;
        const toolId = toolCall.id;
        
        const result = await this.executeSingleTool(sessionId, toolCall);
        
        // Add to memory
        await this.memory.addMessage(sessionId, {
          role: "tool",
          content: result.result,
          tool_call_id: toolId,
        });

        return result;
      });

      // Wait for all tools in group to complete
      const results = await Promise.all(toolPromises);
      
      yield {
        type: "metadata",
        metadata: { 
          usage: undefined,
          toolGroupEnd: true,
          results: results.map(r => ({
            toolName: r.toolName,
            success: r.success,
            executionTime: r.executionTime
          }))
        }
      };
    }
  }

  /**
   * Build enhanced system prompt based on reasoning pattern
   */
  private buildEnhancedSystemPrompt(reasoningPattern: ReasoningPattern): string {
    const basePrompt = this.systemPrompt || "You are a helpful AI assistant.";
    
    switch (reasoningPattern.type) {
      case "react":
        return `${basePrompt}

You are using the ReAct (Reasoning and Acting) pattern. Follow this format for each step:

Thought: [Your reasoning about what to do next]
Action: [The tool to use or "final" if done]
Action Input: [Input for the tool, or nothing if "final"]
Observation: [Result of the tool]

After Observation, provide the next Thought.`;

      case "cot":
        return `${basePrompt}

You are using Chain of Thought reasoning. Think step by step and explain your reasoning process before providing the final answer.

Format:
1. [First step of reasoning]
2. [Second step of reasoning]
...
Final Answer: [Your final response]`;

      case "tot":
        return `${basePrompt}

You are using Tree of Thoughts reasoning. Consider multiple possible approaches and evaluate them before proceeding.

Format:
Thought 1: [First possible approach]
Evaluation 1: [Pros/cons of approach 1]
Thought 2: [Second possible approach]
Evaluation 2: [Pros/cons of approach 2]
...
Selected Approach: [Which approach you'll use]
Reasoning: [Why you selected it]`;

      case "self_correct":
        return `${basePrompt}

You have self-correction capabilities. After each response, review your own work for errors or improvements.

Format:
Response: [Your initial response]
Self-Correction: [Review and improve if needed]
Final Response: [Corrected response]`;

      default:
        return basePrompt;
    }
  }

  /**
   * Build reasoning prompt for current iteration
   */
  private buildReasoningPrompt(
    history: any[],
    reasoningPattern: ReasoningPattern,
    iteration: number
  ): string {
    const lastMessage = history[history.length - 1];
    
    if (reasoningPattern.type === "react" && iteration > 0) {
      return `Based on the previous observations, continue with the next Thought and Action.`;
    }
    
    return lastMessage?.content || "";
  }

  /**
   * Get temperature based on reasoning pattern
   */
  private getTemperatureForPattern(reasoningPattern: ReasoningPattern): number {
    switch (reasoningPattern.type) {
      case "cot":
      case "tot":
        return 0.8; // Higher temperature for creative reasoning
      case "self_correct":
        return 0.5; // Lower temperature for accuracy
      default:
        return 0.7;
    }
  }

  /**
   * Process response based on reasoning pattern
   */
  private processResponse(content: string, reasoningPattern: ReasoningPattern): string {
    // Add pattern-specific processing if needed
    return content;
  }

  /**
   * Extract final answer from response
   */
  private extractFinalAnswer(content: string, reasoningPattern: ReasoningPattern): string {
    // Extract final answer based on pattern
    switch (reasoningPattern.type) {
      case "cot":
        const match = content.match(/Final Answer:\s*(.+)/i);
        return match ? match[1].trim() : content;
      case "self_correct":
        const finalMatch = content.match(/Final Response:\s*(.+)/i);
        return finalMatch ? finalMatch[1].trim() : content;
      default:
        return content;
    }
  }

  /**
   * Check if self-correction is needed
   */
  private shouldSelfCorrect(toolResults: ToolExecutionResult[]): boolean {
    return toolResults.some(r => !r.success);
  }

  /**
   * Add self-correction prompt to memory
   */
  private async addSelfCorrectionPrompt(
    sessionId: string,
    toolResults: ToolExecutionResult[]
  ): Promise<void> {
    const failedTools = toolResults.filter(r => !r.success);
    const correctionPrompt = `Some tools failed. Please review and correct:
${failedTools.map(f => `- ${f.toolName}: ${f.error}`).join('\n')}

Please try again or provide an alternative approach.`;

    await this.memory.addMessage(sessionId, {
      role: "user",
      content: correctionPrompt
    });
  }

  /**
   * Fallback streaming for older gateways
   */
  private async *fallbackStream(
    sessionId: string,
    userInput: string,
    maxIterations: number,
    reasoningPattern: ReasoningPattern
  ): AsyncGenerator<StreamChunk, void, unknown> {
    // Implement fallback streaming logic
    const result = await this.execute(sessionId, userInput, maxIterations, reasoningPattern);
    yield {
      type: "content",
      content: result,
      metadata: { 
        usage: undefined,
        fallback: true, 
        reasoning: reasoningPattern.type 
      }
    };
  }

  getMemory(): BaseMemoryStore {
    return this.memory;
  }
}
