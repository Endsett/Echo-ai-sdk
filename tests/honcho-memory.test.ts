import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../src/models";

// ─── Mock the @honcho-ai/sdk module ────────────────────────────────────────

const mockContextResult = {
  summary: { content: "User discussed coding preferences and project architecture." },
  peerRepresentation: "User is a TypeScript developer who prefers functional patterns.",
  peerCard: ["developer", "typescript", "functional"],
  toOpenAI: vi.fn().mockReturnValue([
    { role: "user", content: "How do I use generics?" },
    { role: "assistant", content: "Generics allow you to write reusable code." },
  ]),
};

const mockSession = {
  context: vi.fn().mockResolvedValue(mockContextResult),
  addMessages: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue([
    { content: "I prefer TypeScript", peerId: "user", sessionId: "s1", metadata: {} },
  ]),
};

const mockPeer = {
  message: vi.fn().mockReturnValue({ content: "test" }),
  representation: vi.fn().mockResolvedValue(
    "User prefers TypeScript\nUser likes functional programming\nUser builds AI products"
  ),
  chat: vi.fn().mockResolvedValue("The user is interested in AI and coding."),
  getCard: vi.fn().mockResolvedValue(["developer", "ai-enthusiast"]),
  setCard: vi.fn().mockResolvedValue(["updated-card"]),
};

vi.mock("@honcho-ai/sdk", () => ({
  Honcho: class {
    peer = vi.fn().mockResolvedValue(mockPeer);
    session = vi.fn().mockResolvedValue(mockSession);
    search = vi.fn().mockResolvedValue([
      { content: "I prefer TypeScript", peerId: "user", sessionId: "s1", metadata: {} },
    ]);
  },
}));

// ─── Import after mocking ──────────────────────────────────────────────────

import {
  HonchoMemoryStore,
  SemanticMemorySearch,
  type SemanticSearchOptions,
} from "../src/memory";

// ─── HonchoMemoryStore Tests ───────────────────────────────────────────────

describe("HonchoMemoryStore", () => {
  let store: HonchoMemoryStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new HonchoMemoryStore({ apiKey: "test-key-123" });
  });

  describe("Constructor", () => {
    it("should create store with explicit API key", () => {
      const s = new HonchoMemoryStore({ apiKey: "my-key" });
      expect(s).toBeInstanceOf(HonchoMemoryStore);
    });

    it("should create store with env var API key", () => {
      process.env.HONCHO_API_KEY = "env-key";
      const s = new HonchoMemoryStore();
      expect(s).toBeInstanceOf(HonchoMemoryStore);
      delete process.env.HONCHO_API_KEY;
    });

    it("should throw ConfigurationError without API key", () => {
      delete process.env.HONCHO_API_KEY;
      expect(() => new HonchoMemoryStore({})).toThrow("API key");
    });

    it("should accept custom config options", () => {
      const s = new HonchoMemoryStore({
        apiKey: "key",
        workspaceId: "ws-123",
        environment: "local",
        maxTokens: 4000,
        enableSummary: false,
        assistantPeerId: "bot",
        userPeerId: "human",
      });
      expect(s).toBeInstanceOf(HonchoMemoryStore);
    });
  });

  describe("getMessages()", () => {
    it("should return formatted ChatMessage array from Honcho context", async () => {
      const messages = await store.getMessages("session-1");

      expect(messages.length).toBeGreaterThan(0);
      // Should include summary as system message
      const systemMsgs = messages.filter((m) => m.role === "system");
      expect(systemMsgs.length).toBeGreaterThanOrEqual(1);
      // Should include conversation messages
      const userMsgs = messages.filter((m) => m.role === "user");
      expect(userMsgs.length).toBeGreaterThanOrEqual(1);
    });

    it("should include conversation summary as system message when enabled", async () => {
      const messages = await store.getMessages("session-1");
      const summaryMsg = messages.find((m) =>
        m.content.includes("[Conversation Summary]")
      );
      expect(summaryMsg).toBeDefined();
      expect(summaryMsg!.role).toBe("system");
    });

    it("should include peer representation as system context", async () => {
      const messages = await store.getMessages("session-1");
      const contextMsg = messages.find((m) =>
        m.content.includes("[User Context]")
      );
      expect(contextMsg).toBeDefined();
      expect(contextMsg!.role).toBe("system");
    });

    it("should throw ValidationError for empty sessionId", async () => {
      await expect(store.getMessages("")).rejects.toThrow("non-empty string");
    });

    it("should return empty array when session has no messages", async () => {
      mockSession.context.mockRejectedValueOnce({ message: "not found", status: 404 });
      const messages = await store.getMessages("empty-session");
      expect(messages).toEqual([]);
    });
  });

  describe("addMessage()", () => {
    it("should add a user message to the session", async () => {
      const msg: ChatMessage = { role: "user", content: "Hello there" };
      await store.addMessage("session-1", msg);

      expect(mockPeer.message).toHaveBeenCalledWith("Hello there", expect.any(Object));
      expect(mockSession.addMessages).toHaveBeenCalled();
    });

    it("should add an assistant message to the session", async () => {
      const msg: ChatMessage = { role: "assistant", content: "Hi! How can I help?" };
      await store.addMessage("session-1", msg);

      expect(mockSession.addMessages).toHaveBeenCalled();
    });

    it("should store tool metadata for tool messages", async () => {
      const msg: ChatMessage = {
        role: "tool",
        content: '{"result": 42}',
        tool_call_id: "call_abc123",
      };
      await store.addMessage("session-1", msg);

      expect(mockPeer.message).toHaveBeenCalledWith(
        '{"result": 42}',
        expect.objectContaining({
          metadata: expect.objectContaining({
            role: "tool",
            tool_call_id: "call_abc123",
          }),
        })
      );
    });

    it("should throw ValidationError for empty sessionId", async () => {
      const msg: ChatMessage = { role: "user", content: "test" };
      await expect(store.addMessage("", msg)).rejects.toThrow("non-empty string");
    });

    it("should throw ValidationError for invalid message", async () => {
      await expect(
        store.addMessage("session-1", null as any)
      ).rejects.toThrow("valid role and content");
    });
  });

  describe("clearSession()", () => {
    it("should delete the session from Honcho", async () => {
      await store.clearSession("session-1");
      expect(mockSession.delete).toHaveBeenCalled();
    });

    it("should not throw for non-existent session", async () => {
      mockSession.delete.mockRejectedValueOnce(new Error("not found"));
      await expect(store.clearSession("nonexistent")).resolves.toBeUndefined();
    });

    it("should no-op for empty sessionId", async () => {
      await expect(store.clearSession("")).resolves.toBeUndefined();
    });
  });

  describe("searchMemory()", () => {
    it("should return semantic search results from Honcho", async () => {
      const results = await store.searchMemory("user", "coding preferences");

      expect(results.length).toBeGreaterThan(0);
      // Should contain conclusion-sourced results
      const conclusions = results.filter((r) => r.source === "honcho_conclusion");
      expect(conclusions.length).toBeGreaterThan(0);
    });

    it("should sort results by score descending", async () => {
      const results = await store.searchMemory("user", "typescript");

      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });

    it("should deduplicate results by content", async () => {
      const results = await store.searchMemory("user", "coding");
      const contents = results.map((r) => r.content);
      const unique = new Set(contents);
      expect(contents.length).toBe(unique.size);
    });

    it("should pass search options through to Honcho", async () => {
      const opts: SemanticSearchOptions = {
        topK: 5,
        maxDistance: 0.7,
        includeMostFrequent: false,
        maxConclusions: 10,
      };
      await store.searchMemory("user", "preferences", opts);

      expect(mockPeer.representation).toHaveBeenCalledWith(
        expect.objectContaining({
          searchQuery: "preferences",
          searchTopK: 5,
          searchMaxDistance: 0.7,
          includeMostFrequent: false,
          maxConclusions: 10,
        })
      );
    });

    it("should throw ValidationError for missing peerId", async () => {
      await expect(store.searchMemory("", "query")).rejects.toThrow("peerId is required");
    });

    it("should throw ValidationError for missing query", async () => {
      await expect(store.searchMemory("user", "")).rejects.toThrow("query is required");
    });

    it("should gracefully handle empty peer representation", async () => {
      mockPeer.representation.mockResolvedValueOnce(null);
      const results = await store.searchMemory("user", "something");
      // Should still have message-based results
      expect(results).toBeDefined();
    });
  });

  describe("getInsights()", () => {
    it("should return synthesized insight from Honcho", async () => {
      const insight = await store.getInsights("user", "What motivates this user?");
      expect(insight).toBe("The user is interested in AI and coding.");
    });

    it("should return fallback message when no insights available", async () => {
      mockPeer.chat.mockResolvedValueOnce("");
      const insight = await store.getInsights("user", "What does this user do?");
      expect(insight).toContain("No insights available");
    });

    it("should throw ValidationError for missing peerId", async () => {
      await expect(store.getInsights("", "question")).rejects.toThrow("peerId is required");
    });

    it("should throw ValidationError for missing question", async () => {
      await expect(store.getInsights("user", "")).rejects.toThrow("question is required");
    });
  });

  describe("getContext()", () => {
    it("should return full session context with all fields", async () => {
      const ctx = await store.getContext("session-1");

      expect(ctx.messages).toBeDefined();
      expect(ctx.messages.length).toBeGreaterThan(0);
      expect(ctx.summary).toBe("User discussed coding preferences and project architecture.");
      expect(ctx.peerRepresentation).toBe("User is a TypeScript developer who prefers functional patterns.");
      expect(ctx.peerCard).toEqual(["developer", "typescript", "functional"]);
    });

    it("should throw ValidationError for missing sessionId", async () => {
      await expect(store.getContext("")).rejects.toThrow("sessionId is required");
    });
  });

  describe("getPeerCard() / setPeerCard()", () => {
    it("should get the peer card", async () => {
      const card = await store.getPeerCard("user");
      expect(card).toEqual(["developer", "ai-enthusiast"]);
    });

    it("should set the peer card", async () => {
      const result = await store.setPeerCard("user", ["new-fact"]);
      expect(result).toEqual(["updated-card"]);
      expect(mockPeer.setCard).toHaveBeenCalledWith(["new-fact"]);
    });
  });

  describe("searchSession()", () => {
    it("should search messages within a specific session", async () => {
      const results = await store.searchSession("session-1", "TypeScript");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe("honcho_message");
    });
  });

  describe("getHonchoClient()", () => {
    it("should expose the underlying Honcho client", () => {
      const client = store.getHonchoClient();
      expect(client).toBeDefined();
      expect(client).toHaveProperty("peer");
    });
  });
});

// ─── SemanticMemorySearch Tests ────────────────────────────────────────────

describe("SemanticMemorySearch", () => {
  let store: HonchoMemoryStore;
  let search: SemanticMemorySearch;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new HonchoMemoryStore({ apiKey: "test-key-123" });
    search = new SemanticMemorySearch(store);
  });

  describe("Constructor", () => {
    it("should create with HonchoMemoryStore only", () => {
      const s = new SemanticMemorySearch(store);
      expect(s).toBeInstanceOf(SemanticMemorySearch);
    });

    it("should throw ValidationError without honchoStore", () => {
      expect(() => new SemanticMemorySearch(null as any)).toThrow("honchoStore is required");
    });
  });

  describe("search()", () => {
    it("should return merged results from Honcho", async () => {
      const results = await search.search("user", "coding preferences");

      expect(results.length).toBeGreaterThan(0);
      // Results should be sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
      }
    });

    it("should deduplicate results by content", async () => {
      const results = await search.search("user", "something");
      const contents = results.map((r) => r.content.trim().toLowerCase());
      const unique = new Set(contents);
      expect(contents.length).toBe(unique.size);
    });

    it("should throw ValidationError for missing peerId", async () => {
      await expect(search.search("", "query")).rejects.toThrow("peerId is required");
    });

    it("should throw ValidationError for missing query", async () => {
      await expect(search.search("user", "")).rejects.toThrow("query is required");
    });

    it("should gracefully handle Honcho errors", async () => {
      // If Honcho searchMemory fails, the allSettled should still return
      vi.spyOn(store, "searchMemory").mockRejectedValueOnce(new Error("net error"));
      const results = await search.search("user", "test");
      // Should return empty or partial results, not throw
      expect(results).toBeDefined();
    });
  });

  describe("searchMessages()", () => {
    it("should search messages in a specific session", async () => {
      const results = await search.searchMessages("session-1", "TypeScript");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe("honcho_message");
    });

    it("should throw ValidationError for missing sessionId", async () => {
      await expect(search.searchMessages("", "query")).rejects.toThrow("sessionId is required");
    });

    it("should throw ValidationError for missing query", async () => {
      await expect(search.searchMessages("session-1", "")).rejects.toThrow("query is required");
    });
  });

  describe("searchConclusions()", () => {
    it("should return only conclusion-sourced results", async () => {
      const results = await search.searchConclusions("user", "coding");
      for (const r of results) {
        expect(r.source).toBe("honcho_conclusion");
      }
    });

    it("should throw ValidationError for missing peerId", async () => {
      await expect(search.searchConclusions("", "query")).rejects.toThrow("peerId is required");
    });
  });

  describe("getInsights()", () => {
    it("should delegate to HonchoMemoryStore.getInsights()", async () => {
      const insight = await search.getInsights("user", "What does the user value?");
      expect(insight).toBe("The user is interested in AI and coding.");
    });
  });
});

// ─── BaseMemoryStore Drop-in Compatibility ─────────────────────────────────

describe("BaseMemoryStore compatibility", () => {
  it("HonchoMemoryStore should implement all required BaseMemoryStore methods", () => {
    const store = new HonchoMemoryStore({ apiKey: "test-key" });
    // Core required methods
    expect(typeof store.getMessages).toBe("function");
    expect(typeof store.addMessage).toBe("function");
    expect(typeof store.clearSession).toBe("function");
    // Optional extended methods
    expect(typeof store.searchMemory).toBe("function");
    expect(typeof store.getInsights).toBe("function");
  });

  it("HonchoMemoryStore should be assignable to BaseMemoryStore", () => {
    const store = new HonchoMemoryStore({ apiKey: "test-key" });
    // Type-level compatibility test — if this compiles, it passes
    const asBase: import("../src/memory/store").BaseMemoryStore = store;
    expect(asBase).toBeDefined();
  });
});
