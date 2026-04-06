import OpenAI from "openai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

/**
 * DeepSeek provider
 * DeepSeek uses an OpenAI-compatible API
 * - fast: deepseek-chat (fast conversational model)
 * - smart: deepseek-chat (high quality)
 * - capable: deepseek-reasoner (reasoning specialist)
 * - reasoning: deepseek-reasoner (best reasoning capabilities)
 */
export class DeepSeekProvider extends BaseProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ 
      apiKey,
      baseURL: "https://api.deepseek.com/v1"
    });
  }

  get providerName() {
    return "deepseek";
  }

  /**
   * Get the appropriate model based on model family tier
   */
  private getModel(modelFamily: string): string {
    // If explicit model is specified, use it directly
    if (modelFamily.startsWith("deepseek-")) {
      return modelFamily;
    }

    switch (modelFamily) {
      case "fast":
      case "smart":
        return "deepseek-chat";
      case "capable":
      case "reasoning":
        return "deepseek-reasoner";
      default:
        return "deepseek-chat";
    }
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const model = this.getModel(request.model_family || "smart");
    
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
    const model = this.getModel(request.model_family || "smart");
    
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
}
