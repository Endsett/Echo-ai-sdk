import { z } from "zod";
import { ChatMessage, ChatRequest, BaseProvider } from "../models";
import { AIModelGateway } from "../gateway/router";
import { BaseMemoryStore } from "../memory/store";
import { ToolContext } from "../tools/base";
import { AgentTelemetry } from "../core/telemetry";
import { ToolExecutionError, AgentIterationLimitError, StructuredOutputError, ValidationError } from "../core/exceptions";

export class AgentExecutor {
  private gateway: AIModelGateway | BaseProvider;
  private memory: BaseMemoryStore;
  private tools: Map<string, ToolContext>;
  private systemPrompt?: string;
  private telemetry?: AgentTelemetry;

  constructor(options: {
    gateway: AIModelGateway | BaseProvider;
    memory: BaseMemoryStore;
    tools?: ToolContext[];
    systemPrompt?: string;
    telemetry?: AgentTelemetry;
  }) {
    if (!options.gateway) throw new ValidationError("AgentExecutor", "gateway is required.");
    if (!options.memory) throw new ValidationError("AgentExecutor", "memory is required.");

    this.gateway = options.gateway;
    this.memory = options.memory;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.systemPrompt = options.systemPrompt;
    this.telemetry = options.telemetry;
  }

  getMemory(): BaseMemoryStore {
    return this.memory;
  }

  async execute(sessionId: string, userInput: string, maxIterations: number = 5): Promise<string> {
    if (!sessionId) throw new ValidationError("execute", "sessionId is required.");
    if (!userInput) throw new ValidationError("execute", "userInput is required.");
    if (maxIterations < 1) throw new ValidationError("execute", "maxIterations must be at least 1.");

    this.telemetry?.onAgentStart?.(sessionId, userInput);
    
    const history = await this.memory.getMessages(sessionId);

    if (history.length === 0 && this.systemPrompt) {
      await this.memory.addMessage(sessionId, { role: "system", content: this.systemPrompt });
    }

    await this.memory.addMessage(sessionId, { role: "user", content: userInput });

    const mcpTools = Array.from(this.tools.values()).map(t => t.getMcpSchema());

    for (let i = 0; i < maxIterations; i++) {
      this.telemetry?.onAgentIteration?.(sessionId, i + 1);
      const currentHistory = await this.memory.getMessages(sessionId);

      const request: ChatRequest = {
        messages: currentHistory,
        tools: mcpTools.length > 0 ? mcpTools : undefined,
        model_family: "smart",
        temperature: 0.7,
        stream: false
      };

      let response;
      try {
        response = await this.gateway.chatComplete(request);
      } catch (e: any) {
        this.telemetry?.onAgentEnd?.(sessionId, `Gateway error: ${e.message}`);
        throw e; // Re-throw GatewayRoutingError to the caller
      }

      if (response.usage) {
        this.telemetry?.onTokenUsage?.(sessionId, response.provider_name || "unknown", response.model_name || "unknown", response.usage);
      }

      await this.memory.addMessage(sessionId, {
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls || undefined,
      });

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const output = response.content || "";
        this.telemetry?.onAgentEnd?.(sessionId, output);
        return output;
      }

      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function.name;
        const toolId = toolCall.id;
        
        let toolResult: string;
        
        if (!this.tools.has(toolName)) {
          toolResult = `Error: Tool '${toolName}' not found. Available tools: ${[...this.tools.keys()].join(", ")}`;
        } else {
          const tool = this.tools.get(toolName)!;
          try {
            const args = JSON.parse(toolCall.function.arguments);
            this.telemetry?.onToolStart?.(sessionId, toolName, args);
            toolResult = await tool.execute(args);
            this.telemetry?.onToolEnd?.(sessionId, toolName, toolResult);
          } catch (e: any) {
            const error = new ToolExecutionError(toolName, e.message);
            toolResult = error.message;
            this.telemetry?.onToolEnd?.(sessionId, toolName, toolResult);
          }
        }

        await this.memory.addMessage(sessionId, {
          role: "tool",
          content: toolResult,
          tool_call_id: toolId,
        });
      }
    }

    // If we exit the loop, we've exceeded the iteration limit
    const error = new AgentIterationLimitError(maxIterations);
    this.telemetry?.onAgentEnd?.(sessionId, error.message);
    throw error;
  }

  /**
   * Forces the LLM to output strictly structured JSON validated against the provided Zod schema.
   * Throws StructuredOutputError if the output cannot be parsed.
   */
  async executeStructured<T>(sessionId: string, userInput: string, schema: z.ZodType<T>, maxIterations: number = 8): Promise<T> {
    if (!schema) throw new ValidationError("executeStructured", "schema is required.");

    const rawOutput = await this.execute(
      sessionId,
      `${userInput}\n\nIMPORTANT: You MUST respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`,
      maxIterations
    );
    
    try {
      const jsonMatch = rawOutput.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      const cleaned = jsonMatch ? jsonMatch[0] : rawOutput;
      const parsed = JSON.parse(cleaned);
      return schema.parse(parsed);
    } catch (e: any) {
      throw new StructuredOutputError(rawOutput, e.message);
    }
  }
}
