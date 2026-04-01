import { settings } from "../core/config";
import { ConfigurationError } from "../core/exceptions";
import { BaseSTTProvider, STTOptions, TranscriptionResult } from "./stt";
import { BaseTTSProvider, TTSOptions, TTSResult } from "./tts";
import { BaseSpeakerRecognizer, VoiceprintStore, IdentificationResult, VerificationResult } from "./speaker";
import { OpenAIWhisperSTT } from "./openai-stt";
import { OpenAITTS } from "./openai-tts";

/**
 * Unified voice client providing one-liner access to STT, TTS, and Speaker Recognition.
 * Auto-configures OpenAI providers from environment variables.
 */
export class EchoVoice {
  public stt: BaseSTTProvider;
  public tts: BaseTTSProvider;
  public speakers: VoiceprintStore;
  private recognizer?: BaseSpeakerRecognizer;

  constructor(options?: {
    stt?: BaseSTTProvider;
    tts?: BaseTTSProvider;
    recognizer?: BaseSpeakerRecognizer;
    speakerThreshold?: number;
  }) {
    // Auto-detect from env if not provided
    if (options?.stt) {
      this.stt = options.stt;
    } else if (settings.hasOpenAI) {
      this.stt = new OpenAIWhisperSTT(settings.openaiApiKey);
    } else {
      throw new ConfigurationError(
        "No STT provider configured. Set OPENAI_API_KEY or pass a custom stt provider."
      );
    }

    if (options?.tts) {
      this.tts = options.tts;
    } else if (settings.hasOpenAI) {
      this.tts = new OpenAITTS(settings.openaiApiKey);
    } else {
      throw new ConfigurationError(
        "No TTS provider configured. Set OPENAI_API_KEY or pass a custom tts provider."
      );
    }

    this.recognizer = options?.recognizer;
    this.speakers = new VoiceprintStore(options?.speakerThreshold || 0.75);
  }

  // ──── Speech-to-Text ────

  /** Transcribe audio to text. */
  async transcribe(audio: Buffer, options?: STTOptions): Promise<TranscriptionResult> {
    return this.stt.transcribe(audio, options);
  }

  // ──── Text-to-Speech ────

  /** Convert text to audio. Returns a raw Buffer of the audio file. */
  async speak(text: string, options?: TTSOptions): Promise<TTSResult> {
    return this.tts.synthesize(text, options);
  }

  // ──── Speaker Recognition ────

  /**
   * Enroll a speaker by providing their audio sample.
   * Requires a BaseSpeakerRecognizer to extract embeddings.
   */
  async enrollSpeaker(id: string, name: string, audio: Buffer): Promise<void> {
    if (!this.recognizer) {
      throw new ConfigurationError(
        "Speaker recognition requires a BaseSpeakerRecognizer. Pass one via `new EchoVoice({ recognizer })`."
      );
    }
    const embedding = await this.recognizer.extractEmbedding(audio);
    this.speakers.enroll(id, name, embedding);
  }

  /**
   * Identify who is speaking from an audio sample.
   * Returns the best matching speaker profile.
   */
  async identifySpeaker(audio: Buffer): Promise<IdentificationResult> {
    if (!this.recognizer) {
      throw new ConfigurationError("Speaker recognition requires a BaseSpeakerRecognizer.");
    }
    const embedding = await this.recognizer.extractEmbedding(audio);
    return this.speakers.identify(embedding);
  }

  /**
   * Verify if an audio sample belongs to a specific enrolled speaker.
   */
  async verifySpeaker(speakerId: string, audio: Buffer): Promise<VerificationResult> {
    if (!this.recognizer) {
      throw new ConfigurationError("Speaker recognition requires a BaseSpeakerRecognizer.");
    }
    const embedding = await this.recognizer.extractEmbedding(audio);
    return this.speakers.verify(speakerId, embedding);
  }
}
