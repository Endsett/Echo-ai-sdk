import { ChatRequest, ChatResponse } from "./schemas";

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
}
