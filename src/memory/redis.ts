import Redis from "ioredis";
import type { RedisOptions } from "ioredis";
import { ChatMessage } from "../models";
import { ValidationError } from "../core/exceptions";
import type { BaseMemoryStore } from "./store";

export interface RedisMemoryConfig extends RedisOptions {
  ttlSeconds?: number;
}

/**
 * A robust, production-ready distributed session store utilizing `ioredis`. 
 * Replaces the InMemoryStore, giving stateless, containerized SDK clients persistent conversational memory.
 */
export class RedisMemoryStore implements BaseMemoryStore {
  private client: Redis;
  private ttlSeconds: number;

  constructor(options: RedisMemoryConfig) {
    this.client = new Redis(options);
    this.ttlSeconds = options.ttlSeconds ?? 86400; // default 24hr expiration
  }

  private key(sessionId: string): string {
    return `echo:memory:session:${sessionId}`;
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!sessionId) throw new ValidationError("getMessages", "sessionId is required");
    
    const count = await this.client.llen(this.key(sessionId));
    if (count === 0) return [];

    const data = await this.client.lrange(this.key(sessionId), 0, -1);
    return data.map(str => JSON.parse(str));
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    if (!sessionId) throw new ValidationError("addMessage", "sessionId is required");
    const k = this.key(sessionId);
    
    await this.client.rpush(k, JSON.stringify(message));
    // Reset TTL every time session is interacted with
    await this.client.expire(k, this.ttlSeconds);
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId));
  }
  
  /**
   * Closes the backend redis connection cleanly for shutdowns.
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
