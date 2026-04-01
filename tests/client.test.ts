import { describe, it, expect } from "vitest";
import { z } from "zod";
import { EchoAI, createTool, ChatAgent, ToolAgent, AgentExecutor } from "../src";
import { PromptTemplate, PromptRegistry, PromptVersionError } from "../src/prompts";
import { InMemoryStore } from "../src/memory/store";
import { ConfigurationError, ValidationError } from "../src/core/exceptions";
import { VoiceprintStore } from "../src/voice/speaker";

describe("EchoAI SDK", () => {
  it("should throw ConfigurationError when no API keys are provided", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => new EchoAI()).toThrowError(ConfigurationError);
  });

  it("should initialize successfully with OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "test-key";
    
    const client = new EchoAI();
    expect(client).toBeDefined();
    expect(client.gateway).toBeDefined();
    expect(client.gateway.providers.length).toBe(1);

    const chatAgent = client.createChatAgent();
    expect(chatAgent).toBeInstanceOf(ChatAgent);

    const toolAgent = client.createToolAgent([]);
    expect(toolAgent).toBeInstanceOf(ToolAgent);
  });

  it("should correctly convert a Zod tool to an MCP Schema", () => {
    const dummyTool = createTool({
      name: "fetch_weather",
      description: "Gets the weather for a city.",
      schema: z.object({
        city: z.string().describe("The city name"),
        days: z.number().optional().default(1)
      }),
      execute: async ({ city }) => `It is sunny in ${city}`
    });

    const mcpSchema = dummyTool.getMcpSchema();
    expect(mcpSchema.type).toBe("function");
    expect(mcpSchema.function.name).toBe("fetch_weather");
    expect(mcpSchema.function.parameters.type).toBe("object");
    expect(mcpSchema.function.parameters.properties.city.type).toBe("string");
  });
});

describe("PromptTemplate & Registry", () => {
  it("should render a template with variables", () => {
    const tmpl = new PromptTemplate({
      name: "greet",
      version: "1.0.0",
      template: "Hello {{name}}, welcome to {{product}}!",
      requiredVars: ["name", "product"]
    });

    expect(tmpl.render({ name: "Alice", product: "EchoMind" })).toBe("Hello Alice, welcome to EchoMind!");
  });

  it("should throw on missing required variables", () => {
    const tmpl = new PromptTemplate({
      name: "test",
      version: "1.0.0",
      template: "Hello {{name}}!",
      requiredVars: ["name"]
    });

    expect(() => tmpl.render({})).toThrow("missing required variables");
  });

  it("should throw PromptVersionError on invalid version format", () => {
    expect(() => new PromptTemplate({
      name: "bad",
      version: "not-a-version",
      template: "test"
    })).toThrow(PromptVersionError);
  });

  it("should manage versions in the registry", () => {
    const registry = new PromptRegistry();
    const v1 = new PromptTemplate({ name: "hello", version: "1.0.0", template: "Hi v1" });
    const v2 = new PromptTemplate({ name: "hello", version: "2.0.0", template: "Hi v2" });

    registry.register(v1);
    registry.register(v2);

    expect(registry.getTemplate("hello").template).toBe("Hi v2"); // v2 is active
    registry.setActiveVersion("hello", "1.0.0");
    expect(registry.getTemplate("hello").template).toBe("Hi v1"); // Rolled back
    expect(registry.listVersions("hello")).toEqual(["1.0.0", "2.0.0"]);
  });
});

describe("InMemoryStore", () => {
  it("should store and retrieve messages", async () => {
    const store = new InMemoryStore();
    await store.addMessage("s1", { role: "user", content: "Hello" });
    const msgs = await store.getMessages("s1");
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toBe("Hello");
  });

  it("should enforce maxHistory cap", async () => {
    const store = new InMemoryStore(2);
    await store.addMessage("s1", { role: "user", content: "1" });
    await store.addMessage("s1", { role: "assistant", content: "2" });
    await store.addMessage("s1", { role: "user", content: "3" });
    const msgs = await store.getMessages("s1");
    expect(msgs.length).toBe(2);
    expect(msgs[0].content).toBe("2"); // Oldest message evicted
  });

  it("should clear a session", async () => {
    const store = new InMemoryStore();
    await store.addMessage("s1", { role: "user", content: "Hi" });
    await store.clearSession("s1");
    const msgs = await store.getMessages("s1");
    expect(msgs.length).toBe(0);
  });

  it("should throw ValidationError for invalid maxHistory", () => {
    expect(() => new InMemoryStore(0)).toThrow(ValidationError);
  });
});

describe("VoiceprintStore", () => {
  it("should enroll and identify a speaker", () => {
    const store = new VoiceprintStore(0.9);

    store.enroll("s1", "Alice", [1, 0, 0, 0]);
    store.enroll("s2", "Bob", [0, 1, 0, 0]);

    const result = store.identify([1, 0, 0, 0]);
    expect(result.matched).toBe(true);
    expect(result.speakerName).toBe("Alice");
    expect(result.confidence).toBeCloseTo(1.0);
  });

  it("should verify a specific speaker", () => {
    const store = new VoiceprintStore(0.9);

    store.enroll("s1", "Alice", [1, 0, 0, 0]);

    const pass = store.verify("s1", [1, 0, 0, 0]);
    expect(pass.verified).toBe(true);

    const fail = store.verify("s1", [0, 1, 0, 0]);
    expect(fail.verified).toBe(false);
  });

  it("should reject unknown speakers below threshold", () => {
    const store = new VoiceprintStore(0.9);

    store.enroll("s1", "Alice", [1, 0, 0, 0]);

    const result = store.identify([0, 0, 1, 0]);
    expect(result.matched).toBe(false);
    expect(result.speakerName).toBe("Unknown Speaker");
  });

  it("should list and remove speakers", () => {
    const store = new VoiceprintStore();

    store.enroll("s1", "Alice", [1, 0]);
    store.enroll("s2", "Bob", [0, 1]);

    expect(store.listSpeakers().length).toBe(2);
    store.removeSpeaker("s1");
    expect(store.listSpeakers().length).toBe(1);
  });
});

