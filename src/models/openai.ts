import OpenAI from "openai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
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
          name: tc.function.name,
          arguments: tc.function.arguments,
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
}
