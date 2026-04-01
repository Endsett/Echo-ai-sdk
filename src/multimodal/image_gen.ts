import { HfInference } from "@huggingface/inference";
import { z } from "zod";
import { createTool, ToolContext } from "../tools/base";

export interface ImageGenConfig {
  apiKey: string;
  model?: string; // e.g. "stabilityai/stable-diffusion-xl-base-1.0"
}

export class HuggingFaceImageGen {
  private client: HfInference;
  private defaultModel: string;

  constructor(config: ImageGenConfig) {
    this.client = new HfInference(config.apiKey);
    this.defaultModel = config.model || "stabilityai/stable-diffusion-xl-base-1.0";
  }

  /**
   * Generates an image based on the prompt.
   * Returns standard image Blob.
   */
  async generate(prompt: string): Promise<Blob> {
    try {
      return await this.client.textToImage({
        model: this.defaultModel,
        inputs: prompt,
        parameters: {
          negative_prompt: "blurry, low quality, distorted"
        }
      }) as unknown as Blob;
    } catch (e: any) {
      throw new Error(`Image generation failed: ${e.message}`);
    }
  }

  /**
   * Generates a base64 encoded string compatible with markdown or HTML `img src`.
   */
  async generateBase64(prompt: string): Promise<string> {
    const blob = await this.generate(prompt);
    const buffer = await blob.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:${blob.type};base64,${base64}`;
  }

  /**
   * Exposes this generator as a ToolContext that the AgentExecutor can use dynamically.
   */
  asTool(): ToolContext {
    return createTool({
      name: "generate_image",
      description: "Generates an image of a product, concept, or visual requested by the user. Returns a markdown base64 image string that you must pass directly back to the user.",
      schema: z.object({
        prompt: z.string().describe("A highly detailed visual prompt for the image to generate")
      }),
      execute: async ({ prompt }) => {
        try {
          const b64 = await this.generateBase64(prompt);
          return `![Generated Image](${b64})`;
        } catch (e: any) {
          return `Failed to generate image: ${e.message}`;
        }
      }
    });
  }
}
