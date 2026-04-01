import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

export class AnthropicProvider extends BaseProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  get providerName() {
    return "anthropic";
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    // Anthropic separates system prompts from the messages array
    const systemMessage = request.messages.find(m => m.role === "system")?.content || undefined;
    const userMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

    const response = await this.client.messages.create({
      model: request.model_family === "smart" ? "claude-3-opus-20240229" : "claude-3-haiku-20240307",
      max_tokens: request.max_tokens || 1024,
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
    const systemMessage = request.messages.find(m => m.role === "system")?.content || undefined;
    const userMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));

    const stream = await this.client.messages.create({
      model: request.model_family === "smart" ? "claude-3-opus-20240229" : "claude-3-haiku-20240307",
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature,
      system: systemMessage,
      messages: userMessages as any,
      tools: request.tools as any,
      stream: true,
    } as any) as any;

    for await (const chunk of stream) {
      // @ts-ignore
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        // @ts-ignore
        yield chunk.delta.text;
      }
    }
  }
}
