import OpenAI from "openai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";
import { StreamChunk, StreamOptions, EnhancedAsyncStream } from "../core/streaming";
import { globalConnectionPool } from "../core/connection-pool";

/**
 * OpenAI provider model tiers
 * - fast: gpt-4.1-mini (cost-effective, fast responses)
 * - smart: gpt-4.1 (high quality)
 * - capable: gpt-4.1 (highest quality, same as smart for OpenAI)
 * - reasoning: o4-mini (reasoning capabilities)
 */
export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ 
      apiKey,
      // Note: OpenAI SDK doesn't directly support custom agents
      // Connection pooling will be handled at the fetch level
    });
  }

  get providerName() {
    return "openai";
  }

  /**
   * Get the appropriate model based on model family tier
   */
  private getModel(modelFamily: string): string {
    // If explicit model is specified, use it directly
    if (modelFamily.startsWith("gpt-") || modelFamily.startsWith("o")) {
      return modelFamily;
    }

    switch (modelFamily) {
      case "fast":
        return "gpt-4.1-mini";
      case "smart":
      case "capable":
        return "gpt-4.1";
      case "reasoning":
        return "o4-mini";
      default:
        return "gpt-4.1-mini";
    }
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const model = this.getModel(request.model_family || "fast");
    
    const response = await this.client.chat.completions.create({
      model,
      messages: request.messages as any,
      temperature: request.temperature,
      tools: request.tools as any,
      max_tokens: request.max_tokens,
    });

    const choice = response.choices[0];
    
    return {
      content: choice.message.content,
      tool_calls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        function: {
          name: (tc as any).function.name,
          arguments: (tc as any).function.arguments,
        }
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
      provider_name: this.providerName,
      model_name: response.model,
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const model = this.getModel(request.model_family || "fast");
    
    const stream = await this.client.chat.completions.create({
      model,
      messages: request.messages as any,
      temperature: request.temperature,
      tools: request.tools as any,
      max_tokens: request.max_tokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  get supportsEnhancedStreaming(): boolean {
    return true;
  }

  async *chatStreamEnhanced(request: ChatRequest, options: StreamOptions = {}): AsyncGenerator<StreamChunk, void, unknown> {
    const model = this.getModel(request.model_family || "fast");
    
    const streamGenerator = async function* (this: OpenAIProvider) {
      const stream = await this.client.chat.completions.create({
        model,
        messages: request.messages as any,
        temperature: request.temperature,
        tools: request.tools as any,
        max_tokens: request.max_tokens,
        stream: true,
      });

      const toolCallBuffer: Record<string, { id: string; name: string; arguments: string }> = {};
      
      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        // Handle content chunks
        const content = choice.delta?.content;
        if (content) {
          yield {
            type: "content" as const,
            content,
            metadata: {
              provider: this.providerName,
              model,
            }
          };
        }

        // Handle tool call chunks
        const delta = choice.delta;
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            if (index === undefined) continue;

            if (!toolCallBuffer[index]) {
              toolCallBuffer[index] = {
                id: toolCall.id || `call_${Date.now()}_${index}`,
                name: toolCall.function?.name || "",
                arguments: "",
              };
            }

            if (toolCall.function?.name) {
              toolCallBuffer[index].name = toolCall.function.name;
            }

            if (toolCall.function?.arguments) {
              toolCallBuffer[index].arguments += toolCall.function.arguments;
            }

            // Emit complete tool call when we have all parts
            if (toolCallBuffer[index].name && toolCallBuffer[index].arguments) {
              yield {
                type: "tool_call" as const,
                toolCall: {
                  id: toolCallBuffer[index].id,
                  name: toolCallBuffer[index].name,
                  arguments: toolCallBuffer[index].arguments,
                },
                metadata: {
                  provider: this.providerName,
                  model,
                }
              };
              
              // Clear the buffer for this tool call
              delete toolCallBuffer[index];
            }
          }
        }

        // Handle finish reason and usage
        if (choice.finish_reason) {
          yield {
            type: "metadata" as const,
            metadata: {
              provider: this.providerName,
              model,
              finish_reason: choice.finish_reason,
              usage: chunk.usage ? {
                prompt_tokens: chunk.usage.prompt_tokens || 0,
                completion_tokens: chunk.usage.completion_tokens || 0,
                total_tokens: chunk.usage.total_tokens || 0,
              } : undefined,
            }
          };
        }
      }
    }.bind(this);

    // Wrap with enhanced stream for backpressure and error handling
    const enhancedStream = new EnhancedAsyncStream(streamGenerator, options);
    yield* enhancedStream;
  }
}
