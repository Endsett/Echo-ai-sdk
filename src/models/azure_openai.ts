import { AzureOpenAI } from "openai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";
import { withRetries } from "../core/resilience";

export interface AzureOpenAIConfig {
  endpoint: string; // e.g. "https://my-resource.openai.azure.com/"
  apiKey: string;
  deploymentName?: string; // The specific deployment ID of the model you provisioned on Azure
}

export class AzureOpenAiProvider extends BaseProvider {
  private client: AzureOpenAI;
  private deploymentName: string;

  constructor(config: AzureOpenAIConfig) {
    super();
    this.client = new AzureOpenAI({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      apiVersion: "2024-02-15-preview"
    });
    this.deploymentName = config.deploymentName || "gpt-35-turbo";
  }

  get providerName() {
    return "azure_openai";
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    try {
      const response = await withRetries(
        async () => {
          return await this.client.chat.completions.create({
            model: this.deploymentName,
            messages: request.messages.map(m => ({
              role: m.role as "user" | "assistant" | "system",
              content: m.content
            })),
            max_tokens: request.max_tokens || 1024,
            temperature: request.temperature || 0.7,
          });
        },
        {
          maxRetries: 3,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          shouldRetry: (error: any) => {
            // Retry on rate limits and transient errors
            return error.status === 429 || 
                   error.status === 502 ||
                   error.status === 503 ||
                   error.status === 504 ||
                   error.code === 'ECONNRESET' ||
                   error.code === 'ETIMEDOUT';
          }
        },
        "Azure OpenAI invocation"
      );

      const message = response.choices[0].message;

      return {
        content: message?.content || null,
        tool_calls: message?.tool_calls ? message.tool_calls.map((tc: any) => ({
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments
          }
        })) : undefined,
        usage: {
          prompt_tokens: response.usage?.prompt_tokens || 0,
          completion_tokens: response.usage?.completion_tokens || 0,
          total_tokens: response.usage?.total_tokens || 0,
        },
        provider_name: this.providerName,
        model_name: this.deploymentName,
      };
    } catch (e: any) {
      // Enhance error message with troubleshooting hints
      let errorMessage = `Azure OpenAI invocation failed: ${e.message}`;
      
      if (e.status === 401) {
        errorMessage += `\nHint: Invalid API key. Check your Azure OpenAI key and endpoint configuration.`;
      } else if (e.status === 404) {
        errorMessage += `\nHint: Deployment '${this.deploymentName}' not found. Check the deployment name and endpoint.`;
      } else if (e.status === 429) {
        errorMessage += `\nHint: Rate limit exceeded. Consider implementing retry logic or upgrading your deployment.`;
      } else if (e.status === 503) {
        errorMessage += `\nHint: Service temporarily unavailable. Please retry later.`;
      } else if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') {
        errorMessage += `\nHint: Network connection issue. Check your network connectivity and firewall settings.`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: this.deploymentName,
      messages: request.messages.map(m => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content
      })),
      max_tokens: request.max_tokens || 1024,
      temperature: request.temperature || 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      for (const choice of chunk.choices) {
        if (choice.delta?.content) {
          yield choice.delta.content;
        }
      }
    }
  }
}
