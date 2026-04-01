import fetch from "cross-fetch";
import OpenAI from "openai";
import { ValidationError } from "../core/exceptions";
import * as fs from "node:fs/promises";

export interface VectorEntry {
  id: string;
  content: string;
  vector: number[];
  metadata?: Record<string, any>;
}

export interface SearchResult {
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Calculates the cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Enhanced in-memory vector store with persistence and similarity thresholding.
 */
export class MemoryVectorStore {
  private entries: VectorEntry[] = [];

  /** Add a single vector entry. */
  async add(entry: VectorEntry): Promise<void> {
    if (!entry.id || !entry.content || !entry.vector?.length) {
      throw new ValidationError("MemoryVectorStore.add", "id, content, and vector are required.");
    }
    // Upsert
    this.entries = this.entries.filter(e => e.id !== entry.id);
    this.entries.push(entry);
  }

  /** Add multiple vector entries at once. */
  async addBatch(entries: VectorEntry[]): Promise<void> {
    for (const entry of entries) await this.add(entry);
  }

  /** Retrieve top K results above a minimum similarity score. */
  async search(queryVector: number[], k: number = 5, minScore: number = 0.3): Promise<SearchResult[]> {
    const scored = this.entries.map(entry => ({
      content: entry.content,
      score: cosineSimilarity(queryVector, entry.vector),
      metadata: entry.metadata,
    }));

    return scored
      .filter(e => e.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Save the entire store to a JSON file. */
  async saveToFile(path: string): Promise<void> {
    const data = JSON.stringify(this.entries);
    await fs.writeFile(path, data, "utf8");
  }

  /** Load store entries from a JSON file. */
  async loadFromFile(path: string): Promise<void> {
    try {
      const data = await fs.readFile(path, "utf8");
      this.entries = JSON.parse(data);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      this.entries = [];
    }
  }

  /** Clear all stored vectors. */
  clear(): void {
    this.entries = [];
  }

  get size(): number {
    return this.entries.length;
  }
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export function chunkText(text: string, options?: ChunkOptions): string[] {
  const size = options?.chunkSize || 500;
  const overlap = options?.chunkOverlap || 50;
  if (text.length <= size) return [text.trim()].filter(Boolean);
  const separators = ["\n\n", "\n", ". ", ", ", " "];
  return recursiveChunk(text, separators, size, overlap);
}

function recursiveChunk(text: string, separators: string[], size: number, overlap: number): string[] {
  if (text.length <= size) return [text.trim()].filter(Boolean);
  const [sep, ...remainingSeps] = separators;
  if (!sep) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size - overlap) {
      chunks.push(text.slice(i, i + size).trim());
    }
    return chunks.filter(Boolean);
  }

  const parts = text.split(sep);
  const finalChunks: string[] = [];
  let currentGroup = "";

  for (const part of parts) {
    if (part.length > size) {
      if (currentGroup.trim()) finalChunks.push(currentGroup.trim());
      currentGroup = "";
      const subChunks = recursiveChunk(part, remainingSeps, size, overlap);
      finalChunks.push(...subChunks);
    } else {
      const candidate = currentGroup ? currentGroup + sep + part : part;
      if (candidate.length > size && currentGroup) {
        finalChunks.push(currentGroup.trim());
        currentGroup = currentGroup.slice(-overlap) + sep + part;
      } else {
        currentGroup = candidate;
      }
    }
  }
  if (currentGroup.trim()) finalChunks.push(currentGroup.trim());
  return finalChunks;
}

export interface KnowledgeBaseConfig {
  openaiApiKey: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  topK?: number;
  minScore?: number;
}

export class KnowledgeBase {
  private store: MemoryVectorStore;
  private openai: OpenAI;
  private embeddingModel: string;
  private chunkOpts: ChunkOptions;
  private topK: number;
  private minScore: number;
  private docCounter = 0;

  constructor(config: KnowledgeBaseConfig) {
    if (!config.openaiApiKey) throw new ValidationError("KnowledgeBase", "openaiApiKey is required.");
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.embeddingModel = config.embeddingModel || "text-embedding-3-small";
    this.chunkOpts = { chunkSize: config.chunkSize || 500, chunkOverlap: config.chunkOverlap || 50 };
    this.topK = config.topK || 5;
    this.minScore = config.minScore || 0.3;
    this.store = new MemoryVectorStore();
  }

  async ingestText(text: string, source?: string): Promise<number> {
    const chunks = chunkText(text, this.chunkOpts);
    const embeddings = await this.embedBatch(chunks);
    for (let i = 0; i < chunks.length; i++) {
      await this.store.add({
        id: `doc_${this.docCounter++}_${Date.now()}`,
        content: chunks[i],
        vector: embeddings[i],
        metadata: { source: source || "text", chunkIndex: i },
      });
    }
    return chunks.length;
  }

  async ingestURL(url: string): Promise<number> {
    const response = await fetch(url);
    const html = await response.text();
    const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                     .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                     .replace(/<[^>]+>/g, " ")
                     .replace(/\s+/g, " ")
                     .trim();
    return this.ingestText(text, url);
  }

  async query(question: string, topK?: number): Promise<string> {
    const queryVector = await this.embed(question);
    const results = await this.store.search(queryVector, topK || this.topK, this.minScore);
    if (results.length === 0) return "";
    return results
      .map((r, i) => `[Source ${i + 1} (${(r.score * 100).toFixed(0)}% match)]: ${r.content}`)
      .join("\n\n");
  }

  async save(path: string): Promise<void> { await this.store.saveToFile(path); }
  async load(path: string): Promise<void> { await this.store.loadFromFile(path); }

  private async embed(text: string): Promise<number[]> {
    const res = await this.openai.embeddings.create({ model: this.embeddingModel, input: text });
    return res.data[0].embedding;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await this.openai.embeddings.create({ model: this.embeddingModel, input: texts });
    return res.data.map(d => d.embedding);
  }
}
