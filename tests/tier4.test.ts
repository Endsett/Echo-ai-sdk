import { describe, it, expect, vi } from "vitest";
import { HuggingFaceProvider } from "../src/models/huggingface";
import { InferenceEndpointManager } from "../src/deployment/huggingface_manager";
import { CustomerSupportBot } from "../src/widget/bot";

// Mock the HfInference fetch calls
vi.mock("@huggingface/inference", () => {
  return {
    HfInference: vi.fn().mockImplementation(() => {
      return {
        chatCompletion: async () => ({
          choices: [{ message: { content: "HF Response" } }],
          model: "mock-hf-model",
          usage: { input_tokens: 0, output_tokens: 0 }
        }),
        textToSpeech: async () => new Blob(["mock-audio"]),
        textToImage: async () => new Blob(["mock-image"])
      };
    })
  };
});

// Mock cross-fetch which InferenceEndpointManager uses internally
const mockFetch = vi.fn();
vi.mock("cross-fetch", () => ({
  default: (...args: unknown[]) => mockFetch(...args),
  __esModule: true
}));

describe("Tier 4: Next-Gen Modality & Deployments", () => {
  describe("HuggingFaceProvider", () => {
    it("should instantiate and format a chat complete request", async () => {
      const provider = new HuggingFaceProvider("hf_token", "meta-llama/Llama-3");
      const res = await provider.chatComplete({
        messages: [{ role: "user", content: "Hello" }]
      });
      expect(res.content).toBe("HF Response");
      expect(res.provider_name).toBe("huggingface");
    });
  });

  describe("InferenceEndpointManager", () => {
    it("should fetch endpoint status correctly via REST", async () => {
      // Mock the cross-fetch response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: { state: "running" } })
      });

      const manager = new InferenceEndpointManager("hf_token");
      const status = await manager.getEndpointStatus("my-org", "my-endpoint");
      expect(status).toBe("running");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.endpoints.huggingface.cloud/v2/endpoint/my-org/my-endpoint",
        expect.any(Object)
      );
    });
  });

  describe("Multimodal CustomerSupportBot Integration", () => {
    it("should inject image generation tool when enabled", () => {
      const bot = new CustomerSupportBot({
        companyName: "Test",
        gateway: new HuggingFaceProvider("token"),
        imageGen: { apiKey: "token" }
      });
      
      const tools = Array.from((bot as any).executor.tools.keys());
      expect(tools).toContain("generate_image");
    });

    it("should return audio buffer when chatWithVoice is called and TTS is enabled", async () => {
      const bot = new CustomerSupportBot({
        companyName: "Test",
        gateway: { 
            chatComplete: async () => ({ content: "Hello World" }) 
        } as any,
        tts: { apiKey: "token" }
      });

      const result = await bot.chatWithVoice("session_1", "Say hi");
      expect(result.text).toBe("Hello World");
      expect(result.audio).toBeDefined();
      expect(Buffer.isBuffer(result.audio)).toBe(true);
    });
  });
});
