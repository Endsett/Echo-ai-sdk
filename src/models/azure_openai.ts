import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

export interface AzureOpenAIConfig {
  endpoint: string; // e.g. "https://my-resource.openai.azure.com/"
  apiKey: string;
  deploymentName?: string; // The specific deployment ID of the model you provisioned on Azure
}

export class AzureOpenAiProvider extends BaseProvider {
  private client: OpenAIClient;
  private deploymentName: string;

  constructor(config: AzureOpenAIConfig) {
    super();
    this.client = new OpenAIClient(config.endpoint, new AzureKeyCredential(config.apiKey));
    this.deploymentName = config.deploymentName || "gpt-35-turbo";
  }

  get providerName() {
    return "azure_openai";
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await this.client.getChatCompletions(
        this.deploymentName,
        request.messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        {
          maxTokens: request.max_tokens || 1024,
          temperature: request.temperature || 0.7,
        }
      );

      const message = response.choices[0].message;

      return {
        content: message?.content || null,
        tool_calls: message?.toolCalls ? message.toolCalls.map((tc: any) => ({
          id: tc.id,
          function: {
            name: tc.function?.name,
            arguments: tc.function?.arguments
          }
        })) : undefined,
        usage: {
          prompt_tokens: response.usage?.promptTokens || 0,
          completion_tokens: response.usage?.completionTokens || 0,
          total_tokens: response.usage?.totalTokens || 0,
        },
        provider_name: this.providerName,
        model_name: this.deploymentName,
      };
    } catch (e: any) {
        throw new Error(`Azure OpenAI invocation failed: ${e.message}`);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.streamChatCompletions(
      this.deploymentName,
      request.messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      {
        maxTokens: request.max_tokens || 1024,
        temperature: request.temperature || 0.7,
      }
    );

    for await (const chunk of stream) {
      for (const choice of chunk.choices) {
        if (choice.delta?.content) {
          yield choice.delta.content;
        }
      }
    }
  }
}
