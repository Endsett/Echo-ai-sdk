import { GoogleGenAI } from "@google/genai";
import { BaseProvider } from "./base";
import { ChatRequest, ChatResponse } from "./schemas";

/**
 * Google Gemini provider model tiers
 * - fast: gemini-2.5-flash (fast, cost-effective)
 * - smart: gemini-2.5-pro (high quality)
 * - capable: gemini-2.5-pro (highest quality, same as smart for Gemini)
 * - reasoning: gemini-2.5-pro (best reasoning capabilities)
 */
export class GeminiProvider extends BaseProvider {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenAI({ apiKey });
  }

  get providerName() {
    return "gemini";
  }

  /**
   * Get the appropriate model based on model family tier
   */
  private getModel(modelFamily: string): string {
    // If explicit model is specified, use it directly
    if (modelFamily.startsWith("gemini-")) {
      return modelFamily;
    }

    switch (modelFamily) {
      case "fast":
        return "gemini-2.5-flash";
      case "smart":
      case "capable":
      case "reasoning":
        return "gemini-2.5-pro";
      default:
        return "gemini-2.5-flash";
    }
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const modelName = this.getModel(request.model_family || "fast");
    
    // Convert messages to Gemini format
    const contents = request.messages.map(m => ({
      role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
      parts: [{ text: m.content }]
    }));

    const result = await this.client.models.generateContent({
      model: modelName,
      contents,
      config: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.max_tokens ?? 2048,
      }
    });

    const text = result.text || "";
    
    // Gemini uses different usage format
    const usage = result.usageMetadata || {};

    return {
      content: text || null,
      tool_calls: undefined, // Gemini supports tools but structure differs
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
      },
      provider_name: this.providerName,
      model_name: modelName,
    };
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const modelName = this.getModel(request.model_family || "fast");
    
    const contents = request.messages.map(m => ({
      role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
      parts: [{ text: m.content }]
    }));

    const result = await this.client.models.generateContentStream({
      model: modelName,
      contents,
      config: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.max_tokens ?? 2048,
      }
    });

    for await (const chunk of result) {
      const text = chunk.text;
      if (text) {
        yield text;
      }
    }
  }
}
