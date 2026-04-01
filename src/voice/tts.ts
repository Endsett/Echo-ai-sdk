export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | string;
export type TTSFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface TTSOptions {
  voice?: TTSVoice;
  speed?: number;        // 0.25 to 4.0
  format?: TTSFormat;
  model?: string;
}

export interface TTSResult {
  audio: Buffer;
  format: TTSFormat;
  durationMs?: number;
}

/**
 * Abstract base class for Text-to-Speech providers.
 * Extend this to integrate any TTS engine (OpenAI, ElevenLabs, Google, etc.)
 */
export abstract class BaseTTSProvider {
  abstract get providerName(): string;
  abstract synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}
