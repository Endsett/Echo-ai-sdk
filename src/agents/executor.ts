import { z } from "zod";
import { ChatRequest, BaseProvider } from "../models";
import { AIModelGateway } from "../gateway/router";
import { BaseMemoryStore } from "../memory/store";
import { ToolContext } from "../tools/base";
import { AgentTelemetry } from "../core/telemetry";
import { logger } from "../core/logger";
import { withRetries } from "../core/resilience";
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
    logger.info(`Starting execution for session ${sessionId}`);
    
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

      await this.memory.addMessage(sessionId, {
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls || undefined,
      });

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const output = response.content || "";
        this.telemetry?.onAgentEnd?.(sessionId, output);
        logger.info(`Execution finished for session ${sessionId}`);
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
            logger.debug(`Executing tool ${toolName}`, args);
            toolResult = await tool.execute(args);
            this.telemetry?.onToolEnd?.(sessionId, toolName, toolResult);
          } catch (e: any) {
            const error = new ToolExecutionError(toolName, e.message);
            toolResult = error.message;
            this.telemetry?.onToolEnd?.(sessionId, toolName, toolResult);
            logger.error(`Tool ${toolName} failed`, { error: e.message });
          }
        }

        await this.memory.addMessage(sessionId, {
          role: "tool",
          content: toolResult,
          tool_call_id: toolId,
        });
      }
    }

    const error = new AgentIterationLimitError(maxIterations);
    this.telemetry?.onAgentEnd?.(sessionId, error.message);
    logger.warn(`Iteration limit reached for session ${sessionId}`);
    throw error;
  }

  /**
   * Real-time streaming generator. Yields text chunks and tool lifecycle events.
   */
  async *executeStream(sessionId: string, userInput: string, maxIterations: number = 5): AsyncGenerator<{ type: "text" | "tool_start" | "tool_end" | "error"; content: string; toolName?: string }, void, unknown> {
    if (!sessionId) throw new ValidationError("executeStream", "sessionId is required.");
    
    this.telemetry?.onAgentStart?.(sessionId, userInput);
    
    // Check history and init memory
    const history = await this.memory.getMessages(sessionId);
    if (history.length === 0 && this.systemPrompt) {
      await this.memory.addMessage(sessionId, { role: "system", content: this.systemPrompt });
    }
    await this.memory.addMessage(sessionId, { role: "user", content: userInput });

    const mcpTools = Array.from(this.tools.values()).map(t => t.getMcpSchema());

    for (let i = 0; i < maxIterations; i++) {
        this.telemetry?.onAgentIteration?.(sessionId, i + 1);
        const currentHistory = await this.memory.getMessages(sessionId);

        // First we have to call chatComplete non-streaming if there are tools to guarantee structured payload.
        // Wait, realistically, many LLMs support streaming tools. For Echo SDK, base chatComplete resolves them entirely or supports streaming them.
        // For absolute stability in this rewrite: we'll call standard chunk streams if we don't have tools.
        // If we do have tools, we default to standard execute loop but yield events, or if the gateway supports tool streams.
        // Let's rely on standard wait-and-yield execution for tools, and stream chat when purely replying.
        const request: ChatRequest = {
            messages: currentHistory,
            tools: mcpTools.length > 0 ? mcpTools : undefined,
            model_family: "smart",
            temperature: 0.7,
            stream: mcpTools.length === 0 // only stream text directly if no tools are strictly needed in this loop
        };

        if (request.stream && this.gateway.chatStream) {
            let fullReply = "";
            for await (const chunk of this.gateway.chatStream(request)) {
                fullReply += chunk;
                yield { type: "text", content: chunk };
            }
            await this.memory.addMessage(sessionId, { role: "assistant", content: fullReply });
            this.telemetry?.onAgentEnd?.(sessionId, fullReply);
            return;
        }

        const response = await withRetries(
            () => this.gateway.chatComplete(request),
            { maxRetries: 3, initialDelayMs: 1000 },
            "AIModelGateway.chatComplete(stream fallback)"
        ).catch((e: any) => {
            this.telemetry?.onAgentEnd?.(sessionId, `Gateway error: ${e.message}`);
            throw e;
        });

        await this.memory.addMessage(sessionId, {
            role: "assistant",
            content: response.content || "",
            tool_calls: response.tool_calls || undefined,
        });

        if (!response.tool_calls || response.tool_calls.length === 0) {
            yield { type: "text", content: response.content || "" };
            this.telemetry?.onAgentEnd?.(sessionId, response.content || "");
            return;
        }

        for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function.name;
            const toolId = toolCall.id;
            
            yield { type: "tool_start", toolName, content: `Starting ${toolName}...` };
            
            let toolResult: string;
            if (!this.tools.has(toolName)) {
                toolResult = `Error: Tool '${toolName}' not found.`;
            } else {
                const tool = this.tools.get(toolName)!;
                try {
                const args = JSON.parse(toolCall.function.arguments);
                this.telemetry?.onToolStart?.(sessionId, toolName, args);
                toolResult = await tool.execute(args);
                this.telemetry?.onToolEnd?.(sessionId, toolName, toolResult);
                } catch (e: any) {
                toolResult = new ToolExecutionError(toolName, e.message).message;
                this.telemetry?.onToolEnd?.(sessionId, toolName, toolResult);
                }
            }
            
            yield { type: "tool_end", toolName, content: `Finished ${toolName}` };

            await this.memory.addMessage(sessionId, {
                role: "tool",
                content: toolResult,
                tool_call_id: toolId,
            });
        }
    }
    
    yield { type: "error", content: "Iteration limit reached." };
    throw new AgentIterationLimitError(maxIterations);
  }

  /**
   * Forces the LLM to output strictly structured JSON validated against the provided Zod schema.
   * Includes self-healing: if the parsed JSON fails Zod validation, iterates the LLM to correct itself.
   */
  async executeStructured<T>(sessionId: string, userInput: string, schema: z.ZodType<T>, maxRetries: number = 3): Promise<T> {
    if (!schema) throw new ValidationError("executeStructured", "schema is required.");

    let currentInput = `${userInput}\n\nIMPORTANT: You MUST respond ONLY with valid JSON. No markdown, no explanation, just the JSON object.`;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const rawOutput = await this.execute(sessionId, currentInput, 3);
        
        try {
            const jsonMatch = rawOutput.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            const cleaned = jsonMatch ? jsonMatch[0] : rawOutput;
            const parsed = JSON.parse(cleaned);
            return schema.parse(parsed);
        } catch (e: any) {
            logger.warn(`Structured extraction failed on attempt ${attempt + 1}/${maxRetries}. Prompting LLM to self-heal.`, { error: e.message });
            currentInput = `Your previous JSON response was invalid or missing required fields. Please correct it based on this exact schema error:\n${e.message}\n\nProvide ONLY the corrected raw JSON block.`;
            if (attempt === maxRetries - 1) {
                throw new StructuredOutputError(rawOutput, e.message);
            }
        }
    }
    throw new Error("Unreachable");
  }
}
