import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeBase, chunkText } from "../src/rag/knowledge";
import { ConversationAnalytics } from "../src/analytics/tracker";
import { HandoffManager } from "../src/analytics/handoff";

describe("Tier 1 Perfection: RAG & Analytics", () => {
  it("should chunk text correctly with overlap", () => {
    const text = "This is a long sentence that should be split into multiple chunks. Split here. And here.";
    const chunks = chunkText(text, { chunkSize: 30, chunkOverlap: 5 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("should track analytics with token estimation and cost", () => {
    const analytics = new ConversationAnalytics();
    analytics.startConversation("ses_123", "gpt-4o-mini");
    
    // "Help" (4 chars) ≈ 1 token. Input rate for mini is 0.15 / 1M.
    analytics.recordQuery("ses_123", "Help"); 
    analytics.recordResponse("ses_123", "Sure thing!", 100);

    const stats = analytics.getSnapshot();
    expect(stats.totalConversations).toBe(1);
    expect(stats.totalTokensUsed).toBeGreaterThan(0);
    expect(stats.totalCostUsd).toBeGreaterThan(0);
  });

  it("should escalate on sentiment strikes", async () => {
    const handoff = new HandoffManager({ 
      negativeSentimentThreshold: 2,
      frustrationKeywords: ["garbage"] 
    });

    // Strike 1
    expect(handoff.shouldEscalate("s1", "This is garbage!")).toBe("frustration");
    // Strike 2 -> should trigger "sentiment" escalation
    expect(handoff.shouldEscalate("s1", "Still garbage!!")).toBe("sentiment");
  });

  it("should escalate on explicit request", () => {
    const handoff = new HandoffManager({});
    expect(handoff.shouldEscalate("s1", "I want to talk to a human")).toBe("explicit_request");
  });

  it("should persist RAG state across save/load", async () => {
    const kb = new KnowledgeBase({ openaiApiKey: "test" });
    // Mocking add instead of full ingest to avoid network
    const store = (kb as any).store;
    await store.add({ id: "1", content: "Persistence test", vector: [0.1, 0.2] });
    
    const path = "./rag_test.json";
    await kb.save(path);
    
    const newKb = new KnowledgeBase({ openaiApiKey: "test" });
    await newKb.load(path);
    expect((newKb as any).store.size).toBe(1);
    
    // Cleanup
    const fs = await import("node:fs/promises");
    await fs.unlink(path);
  });
});
