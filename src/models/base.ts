import { ChatRequest, ChatResponse } from "./schemas";
import { StreamChunk, StreamOptions, EnhancedAsyncStream } from "../core/streaming";

export abstract class BaseProvider {
  /** The unique identifier of the provider (e.g., 'openai', 'anthropic'). */
  abstract get providerName(): string;

  /**
   * Translates a universal ChatRequest into the provider-specific payload,
   * executes the request, and formats it back to a standard ChatResponse.
   */
  abstract chatComplete(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Same as chatComplete but yields text chunks asynchronously.
   */
  abstract chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown>;

  /**
   * Enhanced streaming with structured chunks, backpressure, and error handling.
   */
  async* chatStreamEnhanced(request: ChatRequest, options?: StreamOptions): AsyncGenerator<StreamChunk, void, unknown> {
    // Default implementation wraps chatStream
    try {
      for await (const chunk of this.chatStream(request)) {
        yield {
          type: "content",
          content: chunk,
          metadata: {}
        };
      }
    } catch (error: any) {
      yield {
        type: "error",
        error: {
          message: error.message,
          code: error.code,
          retryable: false
        }
      };
    }
  }

  /**
   * Check if the provider supports enhanced streaming
   */
  get supportsEnhancedStreaming(): boolean {
    return false;
  }

  /**
   * Default implementation that wraps text stream into enhanced chunks
   */
  protected async *wrapTextStream(stream: AsyncGenerator<string>, provider: string, model?: string): AsyncGenerator<StreamChunk, void, unknown> {
    for await (const content of stream) {
      yield {
        type: "content",
        content,
        metadata: {
          provider,
          model,
        }
      };
    }
  }
}
