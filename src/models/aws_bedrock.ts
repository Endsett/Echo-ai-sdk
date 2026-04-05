import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";
import { withRetries } from "../core/resilience";

export interface AwsBedrockConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  defaultModel?: string;
}

export class AwsBedrockProvider extends BaseProvider {
  private client: BedrockRuntimeClient;
  private defaultModel: string;

  constructor(config: AwsBedrockConfig) {
    super();
    this.client = new BedrockRuntimeClient({
      region: config.region,
      credentials: config.credentials,
    });
    // Default to a widely available fast model on Bedrock like Claude 3 Haiku or Claude 2.1
    this.defaultModel = config.defaultModel || "anthropic.claude-3-haiku-20240307-v1:0";
  }

  get providerName() {
    return "aws_bedrock";
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const modelId = request.model_family === "smart" 
      ? "anthropic.claude-3-sonnet-20240229-v1:0" 
      : this.defaultModel;

    // Formatting messages specifically for Anthropic Claude 3 on Bedrock (Messages API format)
    // Note: Bedrock supports many models (Llama, Titan), but payload format varies by provider.
    // For this SDK, we default the Bedrock wrapper to Claude 3 structures.
    const systemMessage = request.messages.find(m => m.role === "system")?.content || "";
    const userMessages = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant",
      content: [{ type: "text", text: m.content }]
    }));

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: request.max_tokens || 1024,
      system: systemMessage,
      messages: userMessages,
      temperature: request.temperature || 0.7,
    };

    try {
      const response = await withRetries(
        async () => {
          const command = new InvokeModelCommand({
            modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(payload)
          });
          return await this.client.send(command);
        },
        {
          maxRetries: 3,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          shouldRetry: (error: any) => {
            // Retry on throttling and transient network errors
            return error.name === 'ThrottlingException' || 
                   error.name === 'ServiceUnavailable' ||
                   error.$retryable;
          }
        },
        "AWS Bedrock invocation"
      );
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      return {
        content: responseBody.content?.[0]?.text || null,
        usage: {
          prompt_tokens: responseBody.usage?.input_tokens || 0,
          completion_tokens: responseBody.usage?.output_tokens || 0,
          total_tokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
        },
        provider_name: this.providerName,
        model_name: modelId,
      };
    } catch (e: any) {
      // Enhance error message with troubleshooting hints
      let errorMessage = `AWS Bedrock invocation failed: ${e.message}`;
      
      if (e.name === 'ThrottlingException') {
        errorMessage += `\nHint: Rate limit exceeded. Try reducing request frequency or using a different model.`;
      } else if (e.name === 'ValidationException') {
        errorMessage += `\nHint: Check your request parameters and model ID (${modelId}).`;
      } else if (e.name === 'AccessDeniedException') {
        errorMessage += `\nHint: Check your IAM permissions for bedrock:InvokeModel.`;
      } else if (e.name === 'ServiceUnavailable') {
        errorMessage += `\nHint: AWS Bedrock service is temporarily unavailable. Please retry later.`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    // Basic implementation for stream yielding
    // Actual implementation would use InvokeModelWithResponseStreamCommand
    const res = await this.chatComplete(request);
    if (res.content) {
      yield res.content; // Fallback pseudo-stream for now
    }
  }
}
