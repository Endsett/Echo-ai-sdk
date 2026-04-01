import { HfInference } from "@huggingface/inference";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

export class HuggingFaceProvider extends BaseProvider {
  private client: HfInference;
  private defaultModel: string;

  /**
   * Initialize the Hugging Face Inference provider.
   * @param apiKey Your classic Hugging Face access token (hf_abc123)
   * @param defaultModel The repo id, e.g. "meta-llama/Meta-Llama-3-8B-Instruct"
   */
  constructor(apiKey: string, defaultModel: string = "HuggingFaceH4/zephyr-7b-beta") {
    super();
    this.client = new HfInference(apiKey);
    this.defaultModel = defaultModel;
  }

  get providerName() {
    return "huggingface";
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model_family === "smart" ? this.defaultModel : "HuggingFaceH4/zephyr-7b-beta";

    // Format tools if any are passed. HF supports tool parsing natively on recent models.
    const tools = request.tools ? request.tools.map(t => ({
      type: "function",
      function: t.function
    })) : undefined;

    let response;
    
    // Note: To use dedicated endpoints, one would pass the Endpoint URL directly 
    // into the HfInference constructor via an endpoint argument or via request parameters in the SDK.
    try {
      response = await this.client.chatCompletion({
        model: model,
        messages: request.messages.map(m => ({
          role: m.role as "user"| "assistant" | "system",
          content: m.content
        })),
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens || 1024,
        tools: tools as any
      });
    } catch (e: any) {
        throw new Error(`Hugging Face inference error: ${e.message}`);
    }

    const message = response.choices[0].message;

    return {
      content: message.content || null,
      tool_calls: message.tool_calls ? message.tool_calls.map((tc: any) => ({
        id: tc.id || Math.random().toString(36).substring(7),
        function: {
          name: tc.function.name,
          arguments: typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments)
        }
      })) : undefined,
      usage: {
        prompt_tokens: 0, // HF doesn't always return exact usage easily across all community endpoints
        completion_tokens: 0,
        total_tokens: 0
      },
      provider_name: this.providerName,
      model_name: response.model || model,
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const model = request.model_family === "smart" ? this.defaultModel : "HuggingFaceH4/zephyr-7b-beta";
    
    const stream = this.client.chatCompletionStream({
        model: model,
        messages: request.messages.map(m => ({
          role: m.role as "user"| "assistant" | "system",
          content: m.content
        })),
        temperature: request.temperature || 0.7,
        max_tokens: request.max_tokens || 1024
    });

    for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
            yield chunk.choices[0].delta.content;
        }
    }
  }
}
