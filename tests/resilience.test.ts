import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetries } from "../src/core/resilience";

describe("Resilience Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("withRetries", () => {
    it("should succeed on first attempt", async () => {
      const mockOperation = vi.fn().mockResolvedValue("success");
      
      const result = await withRetries(mockOperation, {}, "Test operation");
      
      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure and eventually succeed", async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error("First failure"))
        .mockRejectedValueOnce(new Error("Second failure"))
        .mockResolvedValue("success");
      
      const result = await withRetries(
        mockOperation,
        { 
          maxRetries: 3, 
          initialDelayMs: 10, // Small delay for tests
          factor: 2 
        },
        "Test operation"
      );
      
      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it("should fail after max retries", async () => {
      const error = new Error("Persistent failure");
      const mockOperation = vi.fn().mockRejectedValue(error);
      
      await expect(
        withRetries(
          mockOperation,
          { 
            maxRetries: 2, 
            initialDelayMs: 10 // Small delay for tests
          },
          "Test operation"
        )
      ).rejects.toThrow("Persistent failure");
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should respect custom shouldRetry function", async () => {
      const retryableError = new Error("Retryable");
      const nonRetryableError = new Error("Non-retryable");
      
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(nonRetryableError);
      
      await expect(
        withRetries(
          mockOperation,
          {
            maxRetries: 3,
            initialDelayMs: 10,
            shouldRetry: (error) => error.message === "Retryable"
          },
          "Test operation"
        )
      ).rejects.toThrow("Non-retryable");
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it("should respect max delay", async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockResolvedValue("success");
      
      const result = await withRetries(
        mockOperation,
        { 
          maxRetries: 3, 
          initialDelayMs: 10, 
          maxDelayMs: 15, // Lower than exponential would reach
          factor: 2 
        },
        "Test operation"
      );
      
      expect(result).toBe("success");
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it("should log retry attempts", async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error("First failure"))
        .mockResolvedValue("success");
      
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      
      await withRetries(
        mockOperation,
        { maxRetries: 2, initialDelayMs: 10 },
        "Test operation"
      );
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test operation failed (Attempt 1/2). Retrying in 10ms...")
      );
      
      consoleSpy.mockRestore();
    });

    it("should log final failure", async () => {
      const error = new Error("Final failure");
      const mockOperation = vi.fn().mockRejectedValue(error);
      
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      await expect(
        withRetries(
          mockOperation,
          { maxRetries: 2, initialDelayMs: 10 },
          "Test operation"
        )
      ).rejects.toThrow("Final failure");
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test operation failed after 3 attempts")
      );
      
      consoleSpy.mockRestore();
    });
  });
});
