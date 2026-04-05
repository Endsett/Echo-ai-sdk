import { VertexAI } from "@google-cloud/vertexai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";
import { withRetries } from "../core/resilience";

export interface GcpVertexConfig {
  project: string;
  location: string;
  defaultModel?: string; // e.g. "gemini-1.5-pro-preview-0409"
}

export class GcpVertexProvider extends BaseProvider {
  private client: VertexAI;
  private defaultModel: string;

  constructor(config: GcpVertexConfig) {
    super();
    // VertexAI authenticates automatically if GOOGLE_APPLICATION_CREDENTIALS is set
    // or if running inside GCP (GCE, Cloud Run, Cloud Functions)
    this.client = new VertexAI({ project: config.project, location: config.location });
    this.defaultModel = config.defaultModel || "gemini-1.5-flash-preview-0409";
  }

  get providerName() {
    return "gcp_vertex";
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model_family === "smart" ? "gemini-1.5-pro-preview-0409" : this.defaultModel;
    const generativeModel = this.client.getGenerativeModel({
      model: model,
      generationConfig: {
        maxOutputTokens: request.max_tokens || 1024,
        temperature: request.temperature || 0.7,
      }
    });

    const systemInstruction = request.messages.find(m => m.role === "system")?.content || undefined;
    
    // Map standard roles to Vertex Content schema (user, model)
    const contents = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    try {
      const response = await withRetries(
        async () => {
          return await generativeModel.generateContent({
            contents,
            systemInstruction: systemInstruction ? { role: "system", parts: [{ text: systemInstruction }] } : undefined
          });
        },
        {
          maxRetries: 3,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          shouldRetry: (error: any) => {
            // Retry on resource exhaustion and transient errors
            return error.status === 429 ||
                   error.status === 503 ||
                   error.code === 'RESOURCE_EXHAUSTED' ||
                   error.code === 'UNAVAILABLE' ||
                   error.message?.includes('quota') ||
                   error.message?.includes('rate limit');
          }
        },
        "GCP Vertex invocation"
      );

      const responseText = response.response.candidates?.[0]?.content?.parts?.[0]?.text || null;
      
      return {
        content: responseText,
        usage: {
          prompt_tokens: response.response.usageMetadata?.promptTokenCount || 0,
          completion_tokens: response.response.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: response.response.usageMetadata?.totalTokenCount || 0,
        },
        provider_name: this.providerName,
        model_name: model,
      };
    } catch (e: any) {
      // Enhance error message with troubleshooting hints
      let errorMessage = `GCP Vertex invocation failed: ${e.message}`;
      
      if (e.code === 'RESOURCE_EXHAUSTED' || e.message?.includes('quota')) {
        errorMessage += `\nHint: API quota exceeded. Check your GCP quotas at https://console.cloud.google.com/iam-admin/quotas`;
      } else if (e.code === 'PERMISSION_DENIED') {
        errorMessage += `\nHint: Check your IAM permissions for Vertex AI API. Ensure 'Vertex AI User' role is granted.`;
      } else if (e.code === 'INVALID_ARGUMENT') {
        errorMessage += `\nHint: Invalid request. Check your model configuration and request parameters.`;
      } else if (e.code === 'UNAVAILABLE' || e.status === 503) {
        errorMessage += `\nHint: Vertex AI service temporarily unavailable. Please retry later.`;
      } else if (e.message?.includes('rate limit')) {
        errorMessage += `\nHint: Rate limit exceeded. Consider implementing exponential backoff.`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const model = request.model_family === "smart" ? "gemini-1.5-pro-preview-0409" : this.defaultModel;
    const generativeModel = this.client.getGenerativeModel({ model });

    const contents = request.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const stream = await generativeModel.generateContentStream({ contents });
    for await (const chunk of stream.stream) {
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
        yield chunk.candidates[0].content.parts[0].text;
      }
    }
  }
}
