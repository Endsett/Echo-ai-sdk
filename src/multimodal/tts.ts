import { HfInference } from "@huggingface/inference";

export interface TTSConfig {
  apiKey: string;
  model?: string; // e.g. "espnet/kan-bayashi_ljspeech_vits"
}

export class HuggingFaceTTS {
  private client: HfInference;
  private defaultModel: string;

  constructor(config: TTSConfig) {
    this.client = new HfInference(config.apiKey);
    this.defaultModel = config.model || "espnet/kan-bayashi_ljspeech_vits";
  }

  /**
   * Converts an AI text response into a spoken audio Blob.
   * Useful for voice-enabled chatbots or IVR systems.
   */
  async generateAudio(text: string): Promise<Blob> {
    try {
      const audioBlob = await this.client.textToSpeech({
        model: this.defaultModel,
        inputs: text
      });
      return audioBlob;
    } catch (e: any) {
      throw new Error(`TTS generation failed: ${e.message}`);
    }
  }

  /**
   * Helper syntax for Node.js backends needing buffers instead of Blobs.
   */
  async generateBuffer(text: string): Promise<Buffer> {
    const blob = await this.generateAudio(text);
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
