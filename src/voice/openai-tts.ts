import OpenAI from "openai";
import { BaseTTSProvider, TTSResult, TTSOptions } from "./tts";

export class OpenAITTS extends BaseTTSProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    super();
    this.client = new OpenAI({ apiKey });
  }

  get providerName() {
    return "openai-tts";
  }

  async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("[OpenAITTS] Text cannot be empty.");
    }

    const format = options?.format || "mp3";
    const voice = options?.voice || "alloy";
    const speed = options?.speed || 1.0;
    const model = options?.model || "tts-1";

    const response = await this.client.audio.speech.create({
      model,
      voice: voice as any,
      input: text,
      speed,
      response_format: format as any,
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    return {
      audio: audioBuffer,
      format,
    };
  }
}
