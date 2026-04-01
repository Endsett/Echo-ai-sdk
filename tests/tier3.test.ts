import { describe, it, expect } from "vitest";
import { PIIRedactor } from "../src/analytics/redact";
import { ExperimentManager, Experiment } from "../src/analytics/experiment";
import { CustomerSupportBot } from "../src/widget/bot";

describe("Tier 3: Compliance & Optimization", () => {
  describe("PII Redaction Engine", () => {
    it("should redact emails, phone numbers, CCs, and SSNs from text", () => {
      const redactor = new PIIRedactor();
      const input = "Hi, my email is john.doe@example.com and phone is +1-555-123-4567. My CC is 1234-5678-9012-3456 and SSN is 123-45-6789. Please help.";
      const scrubbed = redactor.redact(input);
      
      expect(scrubbed).not.toContain("john.doe@example.com");
      expect(scrubbed).toContain("[REDACTED_EMAIL]");
      expect(scrubbed).not.toContain("+1-555-123-4567");
      expect(scrubbed).toContain("[REDACTED_PHONE]");
      expect(scrubbed).not.toContain("1234-5678-9012-3456");
      expect(scrubbed).toContain("[REDACTED_CC]");
      expect(scrubbed).not.toContain("123-45-6789");
      expect(scrubbed).toContain("[REDACTED_SSN]");
    });
  });

  describe("A/B Testing Engine", () => {
    it("should deterministically assign sticky sessions", () => {
      const exp: Experiment = {
        name: "test_prompt",
        variants: [
          { id: "A", weight: 50, config: { prompt: "Be polite" } },
          { id: "B", weight: 50, config: { prompt: "Be concise" } }
        ]
      };
      const manager = new ExperimentManager([exp]);
      
      // Hash should be deterministic
      const variantUser1 = manager.assignVariant("test_prompt", "session_123");
      const variantUser1Again = manager.assignVariant("test_prompt", "session_123");
      expect(variantUser1).toEqual(variantUser1Again);
      expect(["A", "B"]).toContain(variantUser1);
    });
  });

  describe("CustomerSupportBot Integration", () => {
    it("should apply redaction in bot flow", async () => {
      const bot = new CustomerSupportBot({
        companyName: "TestCorp",
        enablePIIRedaction: true,
        gateway: { chatComplete: async () => ({ content: "Response" }) } as any,
      });

      bot.use(async (ctx) => {
        // Assert message is redacted BEFORE the executor runs
        expect(ctx.message).toContain("[REDACTED_EMAIL]");
        return "Intercepted"; // Stop the execution
      });

      const reply = await bot.chat("user_1", "My email is test@test.com");
      expect(reply).toBe("Intercepted");
    });
  });
});
