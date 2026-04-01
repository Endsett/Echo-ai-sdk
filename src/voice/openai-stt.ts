import OpenAI from "openai";
import { BaseSTTProvider, TranscriptionResult, STTOptions } from "./stt";
import { File } from "buffer";

export class OpenAIWhisperSTT extends BaseSTTProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  get providerName() {
    return "openai-whisper";
  }

  async transcribe(audio: Buffer, options?: STTOptions): Promise<TranscriptionResult> {
    const file = new File([audio], "audio.wav", { type: "audio/wav" });

    if (options?.timestamps) {
      const response = await this.client.audio.transcriptions.create({
        model: "whisper-1",
        file: file as any,
        language: options?.language,
        prompt: options?.prompt,
        temperature: options?.temperature,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      } as any);

      const result = response as any;
      return {
        text: result.text,
        language: result.language,
        duration: result.duration,
        segments: result.segments?.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          confidence: s.avg_logprob ? Math.exp(s.avg_logprob) : undefined,
        })),
      };
    }

    const response = await this.client.audio.transcriptions.create({
      model: "whisper-1",
      file: file as any,
      language: options?.language,
      prompt: options?.prompt,
      temperature: options?.temperature,
    });

    return {
      text: response.text,
    };
  }
}
