export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface STTOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
  timestamps?: boolean;
}

/**
 * Abstract base class for Speech-to-Text providers.
 * Extend this to integrate any STT engine (Whisper, Deepgram, AssemblyAI, etc.)
 */
export abstract class BaseSTTProvider {
  abstract get providerName(): string;
  abstract transcribe(audio: Buffer, options?: STTOptions): Promise<TranscriptionResult>;
}
