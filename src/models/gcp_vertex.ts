import { VertexAI } from "@google-cloud/vertexai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

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
      const response = await generativeModel.generateContent({
        contents,
        systemInstruction: systemInstruction ? { role: "system", parts: [{ text: systemInstruction }] } : undefined
      });

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
        throw new Error(`GCP Vertex invocation failed: ${e.message}`);
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
