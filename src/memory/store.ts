import { ChatMessage } from "../models";
import { ValidationError } from "../core/exceptions";

export interface BaseMemoryStore {
  getMessages(sessionId: string): Promise<ChatMessage[]>;
  addMessage(sessionId: string, message: ChatMessage): Promise<void>;
  clearSession(sessionId: string): Promise<void>;

  /** Optional: Semantic search across memory (implemented by HonchoMemoryStore). */
  searchMemory?(peerId: string, query: string, opts?: any): Promise<any[]>;

  /** Optional: Ask the memory system for synthesized insights about a peer. */
  getInsights?(peerId: string, question: string): Promise<string>;
}

export class InMemoryStore implements BaseMemoryStore {
  private memory = new Map<string, ChatMessage[]>();

  constructor(public maxHistory: number = 50) {
    if (maxHistory < 1) {
      throw new ValidationError("InMemoryStore", "maxHistory must be at least 1.");
    }
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new ValidationError("getMessages", "sessionId must be a non-empty string.");
    }
    return [...(this.memory.get(sessionId) || [])]; // Return copies to prevent mutation
  }

  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new ValidationError("addMessage", "sessionId must be a non-empty string.");
    }
    if (!message || !message.role || !message.content === undefined) {
      throw new ValidationError("addMessage", "message must have a valid role and content.");
    }

    if (!this.memory.has(sessionId)) {
      this.memory.set(sessionId, []);
    }
    const history = this.memory.get(sessionId)!;
    history.push({ ...message }); // Store a copy

    if (history.length > this.maxHistory) {
      this.memory.set(sessionId, history.slice(history.length - this.maxHistory));
    }
  }

  async clearSession(sessionId: string): Promise<void> {
    this.memory.delete(sessionId);
  }

  /** Returns the number of active sessions in memory. */
  get sessionCount(): number {
    return this.memory.size;
  }
}
