import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

/**
 * Anthropic provider model tiers
 * - fast: claude-haiku-4-20250514 (fastest, most cost-effective)
 * - smart: claude-sonnet-4-20250514 (high quality, good balance)
 * - capable: claude-opus-4-20250514 (highest quality)
 * - reasoning: claude-opus-4-20250514 (best reasoning capabilities)
 */
export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  get providerName() {
    return "anthropic";
  }

  /**
   * Get the appropriate model based on model family tier
   */
  private getModel(modelFamily: string): string {
    // If explicit model is specified, use it directly
    if (modelFamily.startsWith("claude-")) {
      return modelFamily;
    }

    switch (modelFamily) {
      case "fast":
        return "claude-haiku-4-20250514";
      case "smart":
        return "claude-sonnet-4-20250514";
      case "capable":
      case "reasoning":
        return "claude-opus-4-20250514";
      default:
        return "claude-sonnet-4-20250514";
    }
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const model = this.getModel(request.model_family || "smart");
    
    // Anthropic separates system prompts from the messages array
    const systemMessage = request.messages.find(m => m.role === "system")?.content || undefined;
    const userMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

    const response = await this.client.messages.create({
      model,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      system: systemMessage,
      messages: userMessages as any,
      tools: request.tools as any,
    } as any);

    const textContent = (response.content as any[]).find(c => c.type === "text");
    const toolCalls = (response.content as any[]).filter(c => c.type === "tool_use");

    return {
      content: textContent ? textContent.text : null,
      tool_calls: toolCalls.length > 0 ? toolCalls.map(tc => ({
        id: tc.id,
        function: { name: tc.name, arguments: JSON.stringify(tc.input) }
      })) : undefined,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      provider_name: this.providerName,
      model_name: response.model,
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const model = this.getModel(request.model_family || "smart");
    
    const systemMessage = request.messages.find(m => m.role === "system")?.content || undefined;
    const userMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

    const stream = await this.client.messages.create({
      model,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      system: systemMessage,
      messages: userMessages as any,
      tools: request.tools as any,
      stream: true,
    } as any) as any;

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield chunk.delta.text;
      }
    }
  }
}
