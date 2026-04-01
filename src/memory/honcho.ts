import { Honcho, type HonchoConfig, type Peer, type Session, type SessionContext, type Message as HonchoMessage } from "@honcho-ai/sdk";
import { ChatMessage } from "../models";
import { ValidationError, ConfigurationError } from "../core/exceptions";
import type { BaseMemoryStore } from "./store";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HonchoMemoryConfig {
  /** Honcho API key. Falls back to HONCHO_API_KEY env var. */
  apiKey?: string;
  /** Honcho workspace ID. Falls back to HONCHO_WORKSPACE_ID env var or "default". */
  workspaceId?: string;
  /** Honcho environment. Defaults to "production". */
  environment?: "production" | "local";
  /** Custom base URL for self-hosted Honcho. */
  baseUrl?: string;
  /** Context window token limit for getMessages(). Defaults to 2000. */
  maxTokens?: number;
  /** Include Honcho's rolling summary in context. Defaults to true. */
  enableSummary?: boolean;
  /** ID to use for the assistant peer. Defaults to "assistant". */
  assistantPeerId?: string;
  /** ID to use for the user peer. Defaults to "user". */
  userPeerId?: string;
}

export interface SemanticSearchOptions {
  /** Number of semantically relevant conclusions to fetch. Default 10. */
  topK?: number;
  /** Max semantic distance 0-1.0. Default 0.8. */
  maxDistance?: number;
  /** Include most frequent conclusions alongside search results. Default true. */
  includeMostFrequent?: boolean;
  /** Cap total conclusions returned. Default 25. */
  maxConclusions?: number;
  /** Limit search to a specific session. */
  sessionScope?: string;
}

export interface MemorySearchResult {
  content: string;
  score: number;
  source: "honcho_conclusion" | "honcho_message" | "honcho_context";
  peerId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ContextOptions {
  /** Include rolling summary. */
  summary?: boolean;
  /** Token limit for context window. */
  tokens?: number;
  /** Peer whose representation to include. */
  peerTarget?: string;
  /** Perspective peer for representation. */
  peerPerspective?: string;
  /** Limit representation conclusions to this session only. */
  limitToSession?: boolean;
  /** Semantic search query for representation filtering. */
  searchQuery?: string;
  /** Number of search results. */
  searchTopK?: number;
  /** Max semantic distance. */
  searchMaxDistance?: number;
  /** Include most frequent conclusions. */
  includeMostFrequent?: boolean;
  /** Cap total conclusions. */
  maxConclusions?: number;
}

export interface SessionContextResult {
  messages: ChatMessage[];
  summary: string | null;
  peerRepresentation: string | null;
  peerCard: string[] | null;
}

// ─── Core Store ──────────────────────────────────────────────────────────────

/**
 * Production-grade memory store powered by Honcho's reasoning-based memory.
 *
 * Implements `BaseMemoryStore` for drop-in compatibility with `AgentExecutor`,
 * while exposing advanced capabilities:
 * - Cross-session semantic search
 * - Peer representations and insights
 * - Automatic rolling summaries for long conversations
 * - Continual learning that understands entities over time
 *
 * @example
 * ```typescript
 * const memory = new HonchoMemoryStore({
 *   apiKey: process.env.HONCHO_API_KEY,
 *   workspaceId: "my-app",
 * });
 *
 * // Drop-in for AgentExecutor
 * const agent = new AgentExecutor({ gateway, memory });
 *
 * // Semantic search across all sessions
 * const results = await memory.searchMemory("user", "coding preferences");
 *
 * // Ask Honcho for synthesized insights
 * const insight = await memory.getInsights("user", "What motivates this user?");
 * ```
 */
export class HonchoMemoryStore implements BaseMemoryStore {
  private client: Honcho;
  private config: Required<
    Pick<HonchoMemoryConfig, "maxTokens" | "enableSummary" | "assistantPeerId" | "userPeerId">
  >;

  // Lazy-initialized caches
  private _peers = new Map<string, Peer>();
  private _sessions = new Map<string, Session>();

  constructor(options: HonchoMemoryConfig = {}) {
    const apiKey = options.apiKey ?? process.env.HONCHO_API_KEY;
    if (apiKey == null) {
      throw new ConfigurationError(
        "HonchoMemoryStore requires an API key. Provide `apiKey` in config or set HONCHO_API_KEY env var."
      );
    }

    const honchoConfig: HonchoConfig = {
      apiKey: apiKey,
      workspaceId: (options.workspaceId ?? process.env.HONCHO_WORKSPACE_ID) || "default",
    };

    if (options.environment) {
      honchoConfig.environment = options.environment;
    }
    if (options.baseUrl != null) {
      honchoConfig.baseURL = options.baseUrl;
    }

    this.client = new Honcho(honchoConfig);

    this.config = {
      maxTokens: options.maxTokens ?? 2000,
      enableSummary: options.enableSummary ?? true,
      assistantPeerId: options.assistantPeerId ?? "assistant",
      userPeerId: options.userPeerId ?? "user",
    };
  }

  // ─── BaseMemoryStore Implementation ──────────────────────────────────────

  /**
   * Get messages for a session, using Honcho's context window with smart truncation.
   *
   * Returns messages formatted as `ChatMessage[]` compatible with the Echo SDK
   * model layer. When summary mode is enabled, older messages are compressed
   * into a system-level summary to maximize context within token limits.
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new ValidationError("getMessages", "sessionId must be a non-empty string.");
    }

    try {
      const session = await this._getOrCreateSession(sessionId);
      const assistantPeer = await this._getOrCreatePeer(this.config.assistantPeerId);

      const ctx = await session.context({
        summary: this.config.enableSummary,
        tokens: this.config.maxTokens,
        peerPerspective: assistantPeer,
      });

      return this._sessionContextToMessages(ctx, assistantPeer);
    } catch (err: any) {
      // If session has no messages yet, return empty
      if (err?.message?.includes("not found") || err?.status === 404) {
        return [];
      }
      throw err;
    }
  }

  /**
   * Add a message to a Honcho session.
   *
   * Maps the Echo SDK `ChatMessage` roles to Honcho peers:
   * - "user" → user peer
   * - "assistant" → assistant peer
   * - "system" → stored as metadata (system prompts are handled separately)
   * - "tool" → stored as user peer message with tool metadata
   */
  async addMessage(sessionId: string, message: ChatMessage): Promise<void> {
    if (!sessionId || typeof sessionId !== "string") {
      throw new ValidationError("addMessage", "sessionId must be a non-empty string.");
    }
    if (!message || !message.role || message.content === undefined) {
      throw new ValidationError("addMessage", "message must have a valid role and content.");
    }

    const session = await this._getOrCreateSession(sessionId);

    // Map role to peer
    const peerId = this._roleToPeerId(message.role);
    const peer = await this._getOrCreatePeer(peerId);

    // Build metadata for tool messages
    const metadata: Record<string, unknown> = {};
    if (message.role === "tool") {
      metadata.role = "tool";
      if (message.tool_call_id) metadata.tool_call_id = message.tool_call_id;
    }
    if (message.role === "system") {
      metadata.role = "system";
    }
    if (message.tool_calls) {
      metadata.tool_calls = message.tool_calls;
    }

    const msgInput = peer.message(message.content, {
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    await session.addMessages(msgInput);
  }

  /**
   * Clear a session by deleting it from Honcho.
   */
  async clearSession(sessionId: string): Promise<void> {
    if (!sessionId) return;

    try {
      const session = await this._getOrCreateSession(sessionId);
      await session.delete();
    } catch {
      // Session may not exist; that's fine
    } finally {
      this._sessions.delete(sessionId);
    }
  }

  // ─── Extended Honcho-Powered Methods ─────────────────────────────────────

  /**
   * Semantic search across a peer's memory using Honcho's reasoning system.
   *
   * Searches conclusions (synthesized insights) that Honcho has derived from
   * conversations. This is NOT keyword search — it uses Honcho's built-in
   * semantic similarity to find relevant memories.
   *
   * @example
   * ```typescript
   * const results = await memory.searchMemory("user", "coding preferences", {
   *   topK: 5,
   *   maxDistance: 0.7,
   * });
   * ```
   */
  async searchMemory(
    peerId: string,
    query: string,
    opts: SemanticSearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    if (!peerId) throw new ValidationError("searchMemory", "peerId is required.");
    if (!query) throw new ValidationError("searchMemory", "query is required.");

    const results: MemorySearchResult[] = [];

    // 1. Search via peer representation (conclusion-based semantic search)
    try {
      const peer = await this._getOrCreatePeer(peerId);
      const representation = await peer.representation({
        searchQuery: query,
        searchTopK: opts.topK ?? 10,
        searchMaxDistance: opts.maxDistance ?? 0.8,
        includeMostFrequent: opts.includeMostFrequent ?? true,
        maxConclusions: opts.maxConclusions ?? 25,
        ...(opts.sessionScope ? { session: opts.sessionScope } : {}),
      });

      if (representation) {
        // Parse the representation into individual conclusions
        const conclusions = representation
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        conclusions.forEach((c, i) => {
          results.push({
            content: c,
            score: 1 - (i * 0.05), // Approximate score based on order
            source: "honcho_conclusion",
            peerId,
          });
        });
      }
    } catch {
      // Peer may not have conclusions yet
    }

    // 2. Search messages directly
    try {
      const messages = await this.client.search(query, { limit: opts.topK ?? 10 });

      messages.forEach((msg) => {
        results.push({
          content: msg.content,
          score: 0.7, // Message search doesn't return scores directly
          source: "honcho_message",
          peerId: msg.peerId,
          sessionId: msg.sessionId,
          metadata: msg.metadata,
        });
      });
    } catch {
      // Search may fail if no messages exist
    }

    // Sort by score descending and deduplicate
    return results
      .sort((a, b) => b.score - a.score)
      .filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.content === item.content)
      );
  }

  /**
   * Ask Honcho for synthesized insights about a peer.
   *
   * Uses Honcho's dialectic endpoint to query the reasoning system about what
   * it knows about a specific entity. This produces human-readable insights
   * synthesized from all conversations.
   *
   * @example
   * ```typescript
   * const insight = await memory.getInsights("user", "What motivates this user?");
   * // "Based on conversations, the user is motivated by building products that
   * //  help people. They value user feedback and are working on a finance app..."
   * ```
   */
  async getInsights(peerId: string, question: string): Promise<string> {
    if (!peerId) throw new ValidationError("getInsights", "peerId is required.");
    if (!question) throw new ValidationError("getInsights", "question is required.");

    const peer = await this._getOrCreatePeer(peerId);
    const response = await peer.chat(question);
    return response || "No insights available yet. More conversations are needed.";
  }

  /**
   * Get rich conversation context from a session, including summary,
   * peer representation, and peer card.
   *
   * This is lower-level than `getMessages()` and exposes the full
   * Honcho context structure for advanced use cases.
   */
  async getContext(
    sessionId: string,
    opts: ContextOptions = {}
  ): Promise<SessionContextResult> {
    if (!sessionId) throw new ValidationError("getContext", "sessionId is required.");

    const session = await this._getOrCreateSession(sessionId);
    const assistantPeer = await this._getOrCreatePeer(this.config.assistantPeerId);

    const contextOpts: Parameters<Session["context"]>[0] = {
      summary: opts.summary ?? this.config.enableSummary,
      tokens: opts.tokens ?? this.config.maxTokens,
      peerPerspective: assistantPeer,
    };

    if (opts.peerTarget) {
      contextOpts.peerTarget = opts.peerTarget;
    }
    if (opts.limitToSession !== undefined) {
      contextOpts.limitToSession = opts.limitToSession;
    }
    if (opts.searchQuery || opts.searchTopK || opts.maxConclusions) {
      contextOpts.representationOptions = {
        searchQuery: opts.searchQuery,
        searchTopK: opts.searchTopK,
        searchMaxDistance: opts.searchMaxDistance,
        includeMostFrequent: opts.includeMostFrequent,
        maxConclusions: opts.maxConclusions,
      };
    }

    const ctx = await session.context(contextOpts);

    return {
      messages: this._sessionContextToMessages(ctx, assistantPeer),
      summary: ctx.summary?.content || null,
      peerRepresentation: ctx.peerRepresentation,
      peerCard: ctx.peerCard,
    };
  }

  /**
   * Get the peer card — a distilled, structured summary of what Honcho
   * knows about a specific entity.
   */
  async getPeerCard(peerId: string): Promise<string[]> {
    const peer = await this._getOrCreatePeer(peerId);
    const card = await peer.getCard();
    return card || [];
  }

  /**
   * Set/override the peer card with explicit facts.
   */
  async setPeerCard(peerId: string, card: string[]): Promise<string[]> {
    const peer = await this._getOrCreatePeer(peerId);
    const result = await peer.setCard(card);
    return result || [];
  }

  /**
   * Search messages within a specific session.
   */
  async searchSession(
    sessionId: string,
    query: string,
    limit: number = 10
  ): Promise<MemorySearchResult[]> {
    const session = await this._getOrCreateSession(sessionId);
    const messages = await session.search(query, { limit });

    return messages.map((msg) => ({
      content: msg.content,
      score: 0.8,
      source: "honcho_message" as const,
      peerId: msg.peerId,
      sessionId: msg.sessionId,
      metadata: msg.metadata,
    }));
  }

  /**
   * Get the underlying Honcho client for advanced usage.
   */
  getHonchoClient(): Honcho {
    return this.client;
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private async _getOrCreatePeer(peerId: string): Promise<Peer> {
    if (!this._peers.has(peerId)) {
      const peer = await this.client.peer(peerId);
      this._peers.set(peerId, peer);
    }
    return this._peers.get(peerId)!;
  }

  private async _getOrCreateSession(sessionId: string): Promise<Session> {
    if (!this._sessions.has(sessionId)) {
      const session = await this.client.session(sessionId);
      this._sessions.set(sessionId, session);
    }
    return this._sessions.get(sessionId)!;
  }

  /**
   * Ensure both user and assistant peers are registered in a session.
   */
  private async _ensureSessionPeers(session: Session): Promise<void> {
    const userPeer = await this._getOrCreatePeer(this.config.userPeerId);
    const assistantPeer = await this._getOrCreatePeer(this.config.assistantPeerId);

    try {
      await session.addPeers([userPeer, assistantPeer]);
    } catch {
      // Peers may already be in the session
    }
  }

  private _roleToPeerId(role: string): string {
    switch (role) {
      case "assistant":
        return this.config.assistantPeerId;
      case "user":
      case "system":
      case "tool":
      default:
        return this.config.userPeerId;
    }
  }

  /**
   * Convert Honcho's SessionContext to Echo SDK ChatMessage array.
   */
  private _sessionContextToMessages(
    ctx: SessionContext,
    assistantPeer: Peer
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // If there's a summary, prepend it as a system message
    if (ctx.summary) {
      messages.push({
        role: "system",
        content: `[Conversation Summary]: ${ctx.summary.content}`,
      });
    }

    // If there's a peer representation, include as system context
    if (ctx.peerRepresentation) {
      messages.push({
        role: "system",
        content: `[User Context]: ${ctx.peerRepresentation}`,
      });
    }

    // Convert Honcho messages to ChatMessage format
    const openaiMessages = ctx.toOpenAI(assistantPeer);
    for (const msg of openaiMessages) {
      const role = msg.role as ChatMessage["role"];
      // Only include standard roles
      if (["user", "assistant", "system", "tool"].includes(role)) {
        messages.push({ role, content: msg.content });
      } else {
        messages.push({ role: "user", content: msg.content });
      }
    }

    return messages;
  }
}
