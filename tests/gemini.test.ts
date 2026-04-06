import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../src/models/gemini";

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      constructor(public config: { apiKey: string }) {}
      
      models = {
        generateContent: async () => ({
          text: "Hello from Gemini!",
          usageMetadata: {
            promptTokenCount: 15,
            candidatesTokenCount: 25,
          }
        }),
        generateContentStream: async () => {
          return {
            async *[Symbol.asyncIterator]() {
              yield { text: "Hello " };
              yield { text: "from " };
              yield { text: "Gemini!" };
            }
          };
        }
      };
    }
  };
});

describe("Gemini Provider", () => {
  it("should return correct provider name", () => {
    const provider = new GeminiProvider("test-key");
    expect(provider.providerName).toBe("gemini");
  });

  it("should generate content correctly", async () => {
    const provider = new GeminiProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "Hello" }],
      model_family: "smart"
    });

    expect(response.content).toBe("Hello from Gemini!");
    expect(response.provider_name).toBe("gemini");
    expect(response.model_name).toBe("gemini-2.5-pro");
  });

  it("should use flash model for fast tier", async () => {
    const provider = new GeminiProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "Hello" }],
      model_family: "fast"
    });

    expect(response.model_name).toBe("gemini-2.5-flash");
  });

  it("should use pro model for reasoning tier", async () => {
    const provider = new GeminiProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "Reason about this" }],
      model_family: "reasoning"
    });

    expect(response.model_name).toBe("gemini-2.5-pro");
  });

  it("should stream content correctly", async () => {
    const provider = new GeminiProvider("test-key");
    const stream = provider.chatStream({
      messages: [{ role: "user", content: "Hello" }],
      model_family: "fast"
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe("Hello from Gemini!");
  });
});
