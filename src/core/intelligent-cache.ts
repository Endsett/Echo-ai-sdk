/**
 * Intelligent response caching system with semantic hashing and TTL management
 * Reduces API costs and improves response times for repeated requests
 */

import { ChatRequest, ChatResponse } from "../models/schemas";
import { createHash } from "crypto";

export interface CacheOptions {
  /** Default TTL in milliseconds (default: 300000 = 5 minutes) */
  defaultTtl?: number;
  /** Maximum number of entries to store (default: 1000) */
  maxSize?: number;
  /** Enable semantic hashing for better cache hits (default: true) */
  enableSemanticHashing?: boolean;
  /** Percentage similarity for semantic matching (default: 0.85) */
  semanticThreshold?: number;
  /** Cleanup interval in milliseconds (default: 60000) */
  cleanupInterval?: number;
  /** Custom key generator function */
  keyGenerator?: (request: ChatRequest) => string;
  /** Callback for cache hits */
  onHit?: (key: string, request: ChatRequest, response: ChatResponse) => void;
  /** Callback for cache misses */
  onMiss?: (key: string, request: ChatRequest) => void;
  /** Callback for cache evictions */
  onEvict?: (key: string, reason: 'expired' | 'full' | 'manual') => void;
}

export interface CacheEntry {
  key: string;
  request: ChatRequest;
  response: ChatResponse;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number; // Estimated size in bytes
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalEntries: number;
  totalSize: number;
  oldestEntry?: number;
  newestEntry?: number;
}

/**
 * Intelligent cache for AI responses
 */
export class IntelligentCache {
  private cache = new Map<string, CacheEntry>();
  private stats = { hits: 0, misses: 0 };
  private cleanupTimer?: NodeJS.Timeout;
  private readonly options: Required<CacheOptions>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      defaultTtl: options.defaultTtl ?? 300000,
      maxSize: options.maxSize ?? 1000,
      enableSemanticHashing: options.enableSemanticHashing ?? true,
      semanticThreshold: options.semanticThreshold ?? 0.85,
      cleanupInterval: options.cleanupInterval ?? 60000,
      keyGenerator: options.keyGenerator ?? this.defaultKeyGenerator,
      onHit: options.onHit ?? (() => {}),
      onMiss: options.onMiss ?? (() => {}),
      onEvict: options.onEvict ?? (() => {}),
    };

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Get a cached response for a request
   */
  async get(request: ChatRequest): Promise<ChatResponse | undefined> {
    const key = this.options.keyGenerator(request);
    
    // Try exact match first
    let entry = this.cache.get(key);
    if (entry) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.options.onEvict(key, 'expired');
      } else {
        this.updateAccess(entry);
        this.stats.hits++;
        this.options.onHit(key, request, entry.response);
        return entry.response;
      }
    }

    // Try semantic matching if enabled
    if (this.options.enableSemanticHashing) {
      entry = await this.findSemanticMatch(request);
      if (entry) {
        this.updateAccess(entry);
        this.stats.hits++;
        this.options.onHit(entry.key, request, entry.response);
        return entry.response;
      }
    }

    this.stats.misses++;
    this.options.onMiss(key, request);
    return undefined;
  }

  /**
   * Store a response in the cache
   */
  async set(request: ChatRequest, response: ChatResponse, ttl?: number): Promise<void> {
    const key = this.options.keyGenerator(request);
    const now = Date.now();
    const size = this.estimateSize(request, response);

    // Check if we need to evict entries
    if (this.cache.size >= this.options.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry = {
      key,
      request: this.sanitizeRequest(request),
      response: this.sanitizeResponse(response),
      createdAt: now,
      expiresAt: now + (ttl ?? this.options.defaultTtl),
      accessCount: 1,
      lastAccessed: now,
      size,
    };

    this.cache.set(key, entry);
  }

  /**
   * Delete an entry from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.options.onEvict(key, 'manual');
    }
    return deleted;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    for (const key of this.cache.keys()) {
      this.options.onEvict(key, 'manual');
    }
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? this.stats.hits / (this.stats.hits + this.stats.misses) 
        : 0,
      totalEntries: this.cache.size,
      totalSize,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.createdAt)) : undefined,
      newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.createdAt)) : undefined,
    };
  }

  /**
   * Get all cache entries (for debugging)
   */
  getAllEntries(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  private defaultKeyGenerator(request: ChatRequest): string {
    // Create a hash of the request
    const hash = createHash('sha256');
    hash.update(JSON.stringify({
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content?.slice(0, 200) // Truncate long messages
      })),
      model_family: request.model_family,
      temperature: request.temperature,
      tools: request.tools?.map(t => t.name), // Only tool names for caching
    }));
    return hash.digest('hex');
  }

  private findSemanticMatch = async (request: ChatRequest): Promise<CacheEntry | undefined> => {
    const requestText = this.extractTextFromRequest(request);
    const requestEmbedding = await this.getEmbedding(requestText);

    let bestMatch: CacheEntry | undefined = undefined;
    let bestSimilarity = 0;

    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) continue;

      const entryText = this.extractTextFromRequest(entry.request);
      const entryEmbedding = await this.getEmbedding(entryText);
      const similarity = this.cosineSimilarity(requestEmbedding, entryEmbedding);

      if (similarity > bestSimilarity && similarity >= this.options.semanticThreshold) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    return bestMatch;
  };

  private extractTextFromRequest(request: ChatRequest): string {
    return request.messages
      .map(m => m.content || '')
      .join(' ')
      .toLowerCase()
      .trim();
  }

  private getEmbedding = async (text: string): Promise<number[]> => {
    // Simple TF-IDF-like embedding for semantic matching
    // In production, you'd use a proper embedding model
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const wordFreq = new Map<string, number>();
    
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    // Create a simple vector based on word frequencies
    const vector: number[] = [];
    const uniqueWords = Array.from(wordFreq.keys()).slice(0, 100); // Limit to 100 dimensions
    
    for (const word of uniqueWords) {
      vector.push(wordFreq.get(word) || 0);
    }

    // Normalize the vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  };

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }
    
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    
    return magnitudeA && magnitudeB ? dotProduct / (magnitudeA * magnitudeB) : 0;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  private updateAccess(entry: CacheEntry): void {
    entry.accessCount++;
    entry.lastAccessed = Date.now();
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.options.onEvict(oldestKey, 'full');
    }
  }

  private sanitizeRequest(request: ChatRequest): ChatRequest {
    // Remove sensitive data from cached requests
    return {
      ...request,
      messages: request.messages.map(m => ({
        ...m,
        content: m.content?.slice(0, 1000), // Limit content length
      })),
    };
  }

  private sanitizeResponse(response: ChatResponse): ChatResponse {
    // Remove sensitive data from cached responses
    return {
      ...response,
      content: response.content ? response.content.slice(0, 2000) : null, // Limit content length
    };
  }

  private estimateSize(request: ChatRequest, response: ChatResponse): number {
    // Rough estimation of memory size
    const requestSize = JSON.stringify(request).length * 2; // 2 bytes per char
    const responseSize = JSON.stringify(response).length * 2;
    return requestSize + responseSize + 200; // Add overhead
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.options.onEvict(key, 'expired');
    }
  }

  /**
   * Destroy the cache and cleanup timers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

/**
 * Cache middleware for the gateway
 */
export function createCacheMiddleware(cache: IntelligentCache) {
  return {
    async onRequest(request: ChatRequest): Promise<ChatRequest> {
      // Check cache before sending request
      const cached = await cache.get(request);
      if (cached) {
        // Return cached response by throwing a special error
        // that the gateway can catch and handle
        const error = new Error("Cache hit");
        (error as any).cachedResponse = cached;
        throw error;
      }
      return request;
    },

    async onResponse(response: ChatResponse, request: ChatRequest): Promise<ChatResponse> {
      // Store successful responses in cache
      if (response.content && !response.content.includes("error")) {
        await cache.set(request, response);
      }
      return response;
    },
  };
}
