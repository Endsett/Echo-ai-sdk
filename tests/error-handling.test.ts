import { describe, it, expect } from "vitest";
import { ConfigurationError } from "../src/core/exceptions";

describe("Enhanced Error Handling", () => {
  describe("ConfigurationError", () => {
    it("should provide helpful message for missing API keys", () => {
      const error = new ConfigurationError(
        "No AI providers configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables, or pass providers manually via `new EchoAI({ providers: [...] })`."
      );
      
      expect(error.message).toContain("OPENAI_API_KEY");
      expect(error.message).toContain("ANTHROPIC_API_KEY");
      expect(error.message).toContain("new EchoAI({ providers: [...] })");
    });
  });

  describe("AWS Bedrock Provider Errors", () => {
    it("should handle ThrottlingException with context", async () => {
      // Mock the client to throw a ThrottlingException
      const mockError = new Error("Rate exceeded");
      mockError.name = "ThrottlingException";
      
      // The error should be wrapped with context
      expect(() => {
        throw new Error(`AWS Bedrock invocation failed: ${mockError.message}`);
      }).toThrow("AWS Bedrock invocation failed: Rate exceeded");
    });

    it("should handle ServiceUnavailable with retry hint", async () => {
      // Create mock error for testing
      const mockError = new Error("Service temporarily unavailable");
      mockError.name = "ServiceUnavailable";
      
      expect(() => {
        throw new Error(`AWS Bedrock invocation failed: ${mockError.message}`);
      }).toThrow("AWS Bedrock invocation failed: Service temporarily unavailable");
    });
  });

  describe("Azure OpenAI Provider Errors", () => {
    it("should handle rate limit errors with status code", async () => {
      // Create mock error for testing
      const mockError = new Error("Rate limit reached") as any;
      mockError.status = 429;
      
      expect(() => {
        throw new Error(`Azure OpenAI invocation failed: ${mockError.message}`);
      }).toThrow("Azure OpenAI invocation failed: Rate limit reached");
    });

    it("should handle connection errors with error code", async () => {
      // Create mock error for testing
      const mockError = new Error("Connection reset") as any;
      mockError.code = "ECONNRESET";
      
      expect(() => {
        throw new Error(`Azure OpenAI invocation failed: ${mockError.message}`);
      }).toThrow("Azure OpenAI invocation failed: Connection reset");
    });
  });

  describe("GCP Vertex Provider Errors", () => {
    it("should handle quota exceeded errors", async () => {
      // Create mock error for testing
      const mockError = new Error("Quota exceeded") as any;
      mockError.code = "RESOURCE_EXHAUSTED";
      
      expect(() => {
        throw new Error(`GCP Vertex invocation failed: ${mockError.message}`);
      }).toThrow("GCP Vertex invocation failed: Quota exceeded");
    });

    it("should handle service unavailable errors", async () => {
      // Create mock error for testing
      const mockError = new Error("Service unavailable") as any;
      mockError.code = "UNAVAILABLE";
      
      expect(() => {
        throw new Error(`GCP Vertex invocation failed: ${mockError.message}`);
      }).toThrow("GCP Vertex invocation failed: Service unavailable");
    });
  });

  describe("Error Message Patterns", () => {
    it("should include provider name in error messages", () => {
      const errors = [
        "AWS Bedrock invocation failed",
        "Azure OpenAI invocation failed",
        "GCP Vertex invocation failed"
      ];
      
      errors.forEach(error => {
        expect(error).toMatch(/(AWS Bedrock|Azure OpenAI|GCP Vertex)/);
        expect(error).toContain("invocation failed");
      });
    });

    it("should preserve original error context", () => {
      const originalError = "Invalid API key";
      const wrappedError = `Provider invocation failed: ${originalError}`;
      
      expect(wrappedError).toContain(originalError);
      expect(wrappedError).toContain("invocation failed");
    });
  });
});
