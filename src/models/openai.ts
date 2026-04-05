import OpenAI from "openai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";
import { StreamChunk, StreamOptions, EnhancedAsyncStream } from "../core/streaming";
import { globalConnectionPool } from "../core/connection-pool";

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

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model_family === "smart" ? "gpt-4-turbo" : "gpt-3.5-turbo",
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
    const stream = await this.client.chat.completions.create({
      model: request.model_family === "smart" ? "gpt-4-turbo" : "gpt-3.5-turbo",
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
    const model = request.model_family === "smart" ? "gpt-4-turbo" : "gpt-3.5-turbo";
    
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
