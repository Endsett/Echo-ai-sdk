export interface SpeakerProfile {
  id: string;
  name: string;
  embedding: number[];
  enrolledAt: Date;
}

export interface IdentificationResult {
  speakerId: string;
  speakerName: string;
  confidence: number;
  matched: boolean;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
}

/**
 * Abstract base class for Speaker Recognition providers.
 * Extend this to integrate speaker verification engines (Azure, custom models, etc.)
 */
export abstract class BaseSpeakerRecognizer {
  abstract get providerName(): string;
  abstract extractEmbedding(audio: Buffer): Promise<number[]>;
}

/**
 * In-memory voiceprint store for speaker enrollment and identification.
 * Uses cosine similarity for matching voice embeddings.
 */
export class VoiceprintStore {
  private profiles = new Map<string, SpeakerProfile>();
  public threshold: number;

  constructor(threshold: number = 0.75) {
    this.threshold = threshold;
  }

  enroll(id: string, name: string, embedding: number[]): SpeakerProfile {
    if (!id || !name) throw new Error("Speaker id and name are required.");
    if (!embedding || embedding.length === 0) throw new Error("Embedding vector cannot be empty.");

    const profile: SpeakerProfile = {
      id,
      name,
      embedding,
      enrolledAt: new Date(),
    };
    this.profiles.set(id, profile);
    return profile;
  }

  identify(embedding: number[]): IdentificationResult {
    let bestMatch: SpeakerProfile | null = null;
    let bestScore = -1;

    for (const profile of this.profiles.values()) {
      const score = this.cosineSimilarity(embedding, profile.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = profile;
      }
    }

    if (bestMatch && bestScore >= this.threshold) {
      return {
        speakerId: bestMatch.id,
        speakerName: bestMatch.name,
        confidence: bestScore,
        matched: true,
      };
    }

    return {
      speakerId: "unknown",
      speakerName: "Unknown Speaker",
      confidence: bestScore,
      matched: false,
    };
  }

  verify(speakerId: string, embedding: number[]): VerificationResult {
    const profile = this.profiles.get(speakerId);
    if (!profile) {
      return { verified: false, confidence: 0 };
    }

    const score = this.cosineSimilarity(embedding, profile.embedding);
    return {
      verified: score >= this.threshold,
      confidence: score,
    };
  }

  getProfile(id: string): SpeakerProfile | undefined {
    return this.profiles.get(id);
  }

  listSpeakers(): SpeakerProfile[] {
    return [...this.profiles.values()];
  }

  removeSpeaker(id: string): boolean {
    return this.profiles.delete(id);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }
}
