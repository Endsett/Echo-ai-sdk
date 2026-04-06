import { describe, it, expect, vi } from "vitest";
import { DeepSeekProvider } from "../src/models/deepseek";

vi.mock("openai", () => {
  return {
    default: class {
      baseURL: string;
      constructor(public config: { apiKey: string; baseURL: string }) {
        this.baseURL = config.baseURL;
      }
      
      chat = {
        completions: {
          create: async ({ model }: { model: string }) => ({
            model,
            choices: [
              {
                message: {
                  content: "DeepSeek response",
                  tool_calls: null
                }
              }
            ],
            usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
          })
        }
      };
    }
  };
});

describe("DeepSeek Provider", () => {
  it("should return correct provider name", () => {
    const provider = new DeepSeekProvider("test-key");
    expect(provider.providerName).toBe("deepseek");
  });

  it("should use deepseek-chat for fast tier", async () => {
    const provider = new DeepSeekProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "Hello" }],
      model_family: "fast"
    } as any);

    expect(response.model_name).toBe("deepseek-chat");
    expect(response.provider_name).toBe("deepseek");
  });

  it("should use deepseek-chat for smart tier", async () => {
    const provider = new DeepSeekProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "Hello" }],
      model_family: "smart"
    } as any);

    expect(response.model_name).toBe("deepseek-chat");
  });

  it("should use deepseek-reasoner for reasoning tier", async () => {
    const provider = new DeepSeekProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "Reason this" }],
      model_family: "reasoning"
    } as any);

    expect(response.model_name).toBe("deepseek-reasoner");
  });
});
