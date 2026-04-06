import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../src/models/openai";

vi.mock("openai", () => {
  return {
    default: class {
      chat = {
        completions: {
          create: async () => ({
            model: "gpt-4.1",
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: "call_123",
                      type: "function",
                      function: {
                        name: "get_weather",
                        arguments: "{\"location\":\"LA\"}"
                      }
                    }
                  ]
                }
              }
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
          })
        }
      };
    }
  };
});

describe("OpenAI Provider Tool Call Extraction", () => {
  it("should verify OpenAI tool call mapping correctly extracts function name and arguments at runtime", async () => {
    const provider = new OpenAIProvider("test-key");
    const response = await provider.chatComplete({
      messages: [{ role: "user", content: "What is the weather in LA?" }],
      tools: [{ type: "function", function: { name: "get_weather", description: "Get weather", parameters: {} } }]
    } as any);

    expect(response.tool_calls).toBeDefined();
    expect(response.tool_calls![0].id).toBe("call_123");
    expect(response.tool_calls![0].function.name).toBe("get_weather");
    expect(response.tool_calls![0].function.arguments).toBe("{\"location\":\"LA\"}");
  });
});
