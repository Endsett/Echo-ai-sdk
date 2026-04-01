import { describe, it, expect, vi } from "vitest";
import { CustomerSupportBot } from "../src/widget/bot";
import { FileSessionStore } from "../src/core/session";
import { TelegramAdapter } from "../src/channels/telegram";
import * as fs from "node:fs/promises";

describe("Tier 2: Omnichannel & Outcome Billing", () => {
  it("should track business outcomes and calculate ROI", async () => {
    const bot = new CustomerSupportBot({
      companyName: "TestCorp",
      gateway: { chatComplete: async () => ({ content: "Hello", provider_name: "test", model_name: "test", usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }) } as any,
    });

    // 1. Record some outcomes
    bot.trackOutcome("ses_1", "lead_captured", 50.0); // $50 lead
    bot.trackOutcome("ses_1", "sale_completed", 200.0); // $200 sale
    
    // 2. Mock a chat to generate some cost
    await bot.chat("ses_1", "I want to buy something");

    const stats = bot.analytics.getSnapshot();
    expect(stats.totalValueGeneratedUsd).toBe(250.0);
    expect(stats.roi).toBeGreaterThan(0);
  });

  it("should persist session history to file store", async () => {
    const store = new FileSessionStore("./test_sessions");
    const bot = new CustomerSupportBot({
      companyName: "TestCorp",
      sessionStore: store,
      gateway: { chatComplete: async () => ({ content: "Response", provider_name: "test", model_name: "test" }) } as any,
    });

    await bot.chat("user_123", "Hello bot");
    
    // Create new bot instance with same store
    const bot2 = new CustomerSupportBot({
      companyName: "TestCorp",
      sessionStore: store,
      gateway: { chatComplete: async () => ({ content: "Response", provider_name: "test", model_name: "test" }) } as any,
    });
    
    const session = await store.get("user_123");
    expect(session).not.toBeNull();
    expect(session.history.length).toBeGreaterThan(0);

    // Cleanup
    await store.clear();
    await fs.rm("./test_sessions", { recursive: true, force: true });
  });

  it("should normalize sessions across channels", async () => {
    const bot = new CustomerSupportBot({ 
      companyName: "Test",
      gateway: { chatComplete: async () => ({ content: "Hi" }) } as any 
    });
    const tg = new TelegramAdapter({ bot, token: "test_token" });
    
    // Accessing protected member for testing
    const reply = await (tg as any).handleMessage("12345", "Hi");
    expect(reply).toBeDefined();
    
    const stats = bot.analytics.getSnapshot();
    expect(stats.totalConversations).toBe(1);
  });
});
