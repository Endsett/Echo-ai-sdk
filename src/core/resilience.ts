import { logger } from "./logger";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Standard exponential backoff wrapper for transient networks or rate limits.
 */
export async function withRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  operationName: string = "Operation"
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let delay = options.initialDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 10000;
  const factor = options.factor ?? 2;
  const shouldRetry = options.shouldRetry ?? (() => true);

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (attempt > maxRetries || !shouldRetry(error)) {
        logger.error(`${operationName} failed after ${attempt} attempts`, { error: error.message });
        throw error;
      }
      
      logger.warn(`${operationName} failed (Attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, { error: error.message });
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }
  
  throw new Error("Unreachable");
}
