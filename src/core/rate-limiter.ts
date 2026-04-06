/**
 * Rate Limiter
 * Token bucket algorithm for rate limiting provider requests
 */

export interface RateLimitConfig {
  /** Requests per minute */
  rpm?: number;
  /** Tokens per minute */
  tpm?: number;
  /** Burst capacity */
  burst?: number;
}

export interface RateLimiterOptions {
  /** Per-provider rate limits */
  providerLimits?: Record<string, RateLimitConfig>;
  /** Default rate limits */
  defaultLimits?: RateLimitConfig;
  /** Enable queueing when rate limited */
  enableQueue?: boolean;
  /** Max queue size */
  maxQueueSize?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  rpm: number;
  tpm?: number;
  burst: number;
  queue: Array<() => void>;
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private options: Required<RateLimiterOptions>;

  constructor(options: RateLimiterOptions = {}) {
    this.options = {
      providerLimits: {},
      defaultLimits: { rpm: 60, burst: 10 },
      enableQueue: true,
      maxQueueSize: 100,
      ...options
    };
  }

  /**
   * Get or create token bucket for provider
   */
  private getBucket(provider: string): TokenBucket {
    if (!this.buckets.has(provider)) {
      const limits = this.options.providerLimits[provider] || this.options.defaultLimits;
      this.buckets.set(provider, {
        tokens: limits.burst || 10,
        lastRefill: Date.now(),
        rpm: limits.rpm || 60,
        tpm: limits.tpm,
        burst: limits.burst || 10,
        queue: []
      });
    }
    return this.buckets.get(provider)!;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = (elapsedMs / 60000) * bucket.rpm;
    
    bucket.tokens = Math.min(bucket.burst, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(provider: string, tokenCount: number = 1): Promise<boolean> {
    const bucket = this.getBucket(provider);
    this.refill(bucket);

    // Check if we have enough tokens
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    // Rate limited - queue if enabled
    if (this.options.enableQueue && bucket.queue.length < this.options.maxQueueSize) {
      return new Promise((resolve) => {
        bucket.queue.push(() => resolve(true));
        
        // Schedule processing
        const waitTime = (1 / bucket.rpm) * 60000;
        setTimeout(() => this.processQueue(bucket), waitTime);
      });
    }

    return false;
  }

  /**
   * Process queued requests
   */
  private processQueue(bucket: TokenBucket): void {
    this.refill(bucket);
    
    while (bucket.queue.length > 0 && bucket.tokens >= 1) {
      const resolve = bucket.queue.shift()!;
      bucket.tokens -= 1;
      resolve();
    }
  }

  /**
   * Get current rate limit status
   */
  getStatus(provider: string): {
    availableTokens: number;
    queuedRequests: number;
    isLimited: boolean;
  } {
    const bucket = this.getBucket(provider);
    this.refill(bucket);

    return {
      availableTokens: Math.floor(bucket.tokens),
      queuedRequests: bucket.queue.length,
      isLimited: bucket.tokens < 1
    };
  }

  /**
   * Update rate limits for a provider
   */
  setProviderLimits(provider: string, limits: RateLimitConfig): void {
    const bucket = this.getBucket(provider);
    bucket.rpm = limits.rpm || bucket.rpm;
    bucket.tpm = limits.tpm || bucket.tpm;
    bucket.burst = limits.burst || bucket.burst;
    bucket.tokens = Math.min(bucket.tokens, bucket.burst);
  }

  /**
   * Reset bucket for a provider
   */
  reset(provider: string): void {
    this.buckets.delete(provider);
  }

  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear();
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();
