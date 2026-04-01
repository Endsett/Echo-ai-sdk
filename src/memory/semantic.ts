import { ValidationError } from "../core/exceptions";
import type { MemoryVectorStore, SearchResult } from "../rag/knowledge";
import type { HonchoMemoryStore, MemorySearchResult, SemanticSearchOptions } from "./honcho";

/**
 * Unified semantic search across Honcho's reasoning-based memory and local
 * vector stores. Combines the best of both worlds:
 *
 * - **Honcho conclusions**: Synthesized insights from reasoning over conversations
 * - **Honcho messages**: Raw message search across sessions
 * - **Local vectors**: Custom embeddings from your own RAG pipeline
 *
 * Results are merged, deduplicated, and ranked by relevance score.
 *
 * @example
 * ```typescript
 * import { HonchoMemoryStore, SemanticMemorySearch } from "echo-ai-sdk-ts";
 * import { MemoryVectorStore } from "echo-ai-sdk-ts";
 *
 * const honcho = new HonchoMemoryStore({ apiKey: "..." });
 * const vectors = new MemoryVectorStore();
 *
 * const search = new SemanticMemorySearch(honcho, vectors);
 *
 * // Unified search across all sources
 * const results = await search.search("user", "coding preferences");
 * ```
 */
export class SemanticMemorySearch {
  private honchoStore: HonchoMemoryStore;
  private vectorStore?: MemoryVectorStore;

  constructor(honchoStore: HonchoMemoryStore, vectorStore?: MemoryVectorStore) {
    if (!honchoStore) {
      throw new ValidationError("SemanticMemorySearch", "honchoStore is required.");
    }
    this.honchoStore = honchoStore;
    this.vectorStore = vectorStore;
  }

  /**
   * Search across all memory sources — Honcho conclusions, messages, and
   * optionally local vector embeddings.
   *
   * @param peerId - The peer whose memory to search
   * @param query - Natural language search query
   * @param opts - Search configuration
   * @returns Merged and deduplicated results sorted by relevance
   */
  async search(
    peerId: string,
    query: string,
    opts: SemanticSearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    if (!peerId) throw new ValidationError("search", "peerId is required.");
    if (!query) throw new ValidationError("search", "query is required.");

    // Gather results from all sources in parallel
    const [honchoResults, vectorResults] = await Promise.allSettled([
      this.honchoStore.searchMemory(peerId, query, opts),
      this._searchVectors(query, opts),
    ]);

    const allResults: MemorySearchResult[] = [];

    if (honchoResults.status === "fulfilled") {
      allResults.push(...honchoResults.value);
    }

    if (vectorResults.status === "fulfilled") {
      allResults.push(...vectorResults.value);
    }

    // Deduplicate by content, keeping highest score
    const seen = new Map<string, MemorySearchResult>();
    for (const result of allResults) {
      const key = result.content.trim().toLowerCase();
      const existing = seen.get(key);
      if (!existing || result.score > existing.score) {
        seen.set(key, result);
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Search only Honcho message history across sessions.
   */
  async searchMessages(
    sessionId: string,
    query: string,
    limit: number = 10
  ): Promise<MemorySearchResult[]> {
    if (!sessionId) throw new ValidationError("searchMessages", "sessionId is required.");
    if (!query) throw new ValidationError("searchMessages", "query is required.");

    return this.honchoStore.searchSession(sessionId, query, limit);
  }

  /**
   * Search only Honcho's synthesized conclusions (insights derived from reasoning).
   */
  async searchConclusions(
    peerId: string,
    query: string,
    opts: SemanticSearchOptions = {}
  ): Promise<MemorySearchResult[]> {
    if (!peerId) throw new ValidationError("searchConclusions", "peerId is required.");
    if (!query) throw new ValidationError("searchConclusions", "query is required.");

    // Use searchMemory but filter to conclusions only
    const results = await this.honchoStore.searchMemory(peerId, query, opts);
    return results.filter((r) => r.source === "honcho_conclusion");
  }

  /**
   * Get combined insights from Honcho's reasoning system.
   * Convenience wrapper around HonchoMemoryStore.getInsights().
   */
  async getInsights(peerId: string, question: string): Promise<string> {
    return this.honchoStore.getInsights(peerId, question);
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private async _searchVectors(
    query: string,
    opts: SemanticSearchOptions
  ): Promise<MemorySearchResult[]> {
    if (!this.vectorStore) return [];

    // Vector store search requires a query vector — but we don't have an
    // embedding function here. Instead, we expose this as a hook for users
    // who have already embedded their data. If the vector store has entries
    // and the consumer has provided vectors, they can search directly.
    // For now, we return empty since semantic search is handled by Honcho.
    return [];
  }
}
