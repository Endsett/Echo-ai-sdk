import { ChatRequest, ChatResponse } from "../models/schemas";
import { AIModelGateway } from "./router";

interface CacheEntry {
  response: ChatResponse;
  expiresAt: number;
}

/**
 * Wraps an AIModelGateway with a TTL-based in-memory response cache.
 * Identical requests within the TTL window are served instantly from cache,
 * eliminating redundant API calls and saving tokens.
 */
export class CachedGateway {
  private cache = new Map<string, CacheEntry>();

  constructor(
    private gateway: AIModelGateway,
    private ttlMs: number = 60_000 // Default: 1 minute
  ) {}

  private getCacheKey(request: ChatRequest): string {
    return JSON.stringify({
      messages: request.messages,
      model_family: request.model_family,
      tools: request.tools,
    });
  }

  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const key = this.getCacheKey(request);
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      console.log("[CachedGateway] Cache HIT. Returning cached response.");
      return cached.response;
    }

    // Cache MISS — call the real gateway
    console.log("[CachedGateway] Cache MISS. Forwarding to gateway.");
    const response = await this.gateway.chatComplete(request);

    // Store in cache
    this.cache.set(key, { response, expiresAt: now + this.ttlMs });

    // Evict expired entries lazily
    if (this.cache.size > 100) {
      for (const [k, v] of this.cache) {
        if (v.expiresAt <= now) this.cache.delete(k);
      }
    }

    return response;
  }

  /** Streaming is not cacheable, passthrough directly. */
  chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    return this.gateway.chatStream(request);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
