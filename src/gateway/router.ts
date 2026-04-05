import { BaseProvider } from "../models";
import { ChatRequest, ChatResponse } from "../models/schemas";
import { GatewayRoutingError } from "../core/exceptions";
import { GatewayMiddleware, applyRequestMiddleware, applyResponseMiddleware } from "./middleware";

/**
 * Gateway that manages multiple AI providers with automatic failover and middleware support.
 * 
 * The AIModelGateway provides intelligent routing between providers, retry logic,
 * and middleware capabilities for request/response transformation and logging.
 * 
 * @example
 * ```typescript
 * const gateway = new AIModelGateway([
 *   new OpenAIProvider(process.env.OPENAI_API_KEY),
 *   new AnthropicProvider(process.env.ANTHROPIC_API_KEY)
 * ]);
 * 
 * // Add logging middleware
 * gateway.use({
 *   onRequest: (req) => console.log('Request:', req),
 *   onResponse: (res) => console.log('Response:', res.content)
 * });
 * 
 * const response = await gateway.chatComplete({
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class AIModelGateway {
  /** Array of registered middleware functions */
  private middlewares: GatewayMiddleware[] = [];

  /**
   * Creates a new AIModelGateway instance.
   * 
   * @param providers - Array of AI providers to use for routing
   * @throws {Error} When no providers are provided
   */
  constructor(public providers: BaseProvider[]) {
    if (providers.length === 0) {
      throw new Error("Gateway requires at least one configured provider.");
    }
  }

  /**
   * Register middleware to intercept, transform, or log requests/responses.
   * Middleware is executed in registration order.
   * 
   * @param middleware - The middleware function to register
   * @returns The gateway instance for method chaining
   * 
   * @example
   * ```typescript
   * gateway.use({
   *   onRequest: async (req) => {
   *     // Transform request before sending
   *     req.messages[0].content = req.messages[0].content.toUpperCase();
   *     return req;
   *   },
   *   onResponse: async (res, req) => {
   *     // Log response
   *     console.log(`Got response: ${res.content}`);
   *     return res;
   *   },
   *   onError: (error, providerName) => {
   *     console.error(`Provider ${providerName} failed:`, error);
   *   }
   * });
   * ```
   */
  use(middleware: GatewayMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Sends a chat completion request through the gateway.
   * 
   * The gateway will try each provider in order with up to 3 attempts per provider.
   * If a provider fails, it will automatically failover to the next provider.
   * 
   * @param request - The chat completion request
   * @returns A promise that resolves to the chat response
   * @throws {GatewayRoutingError} When all providers fail
   * 
   * @example
   * ```typescript
   * const response = await gateway.chatComplete({
   *   messages: [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'Explain quantum computing.' }
   *   ],
   *   max_tokens: 1000,
   *   temperature: 0.7
   * });
   * ```
   */
  async chatComplete(request: ChatRequest): Promise<ChatResponse> {
    const errors: string[] = [];
    const processedRequest = await applyRequestMiddleware(this.middlewares, request);

    for (const provider of this.providers) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[Gateway] Routing request to ${provider.providerName} (Attempt ${attempt}/3)`);
          const response = await provider.chatComplete(processedRequest);
          const processedResponse = await applyResponseMiddleware(this.middlewares, response, processedRequest);
          return processedResponse;
        } catch (e: any) {
          console.warn(`[Gateway] Provider ${provider.providerName} attempt ${attempt} failed: ${e.message}`);
          errors.push(`[${provider.providerName} - Attempt ${attempt}] ${e.message}`);
          
          for (const mw of this.middlewares) {
            mw.onError?.(e, provider.providerName);
          }

          if (attempt < 3) {
            const backoffMs = Math.pow(attempt, 2) * 500;
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }
    }

    throw new GatewayRoutingError(errors);
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string, void, unknown> {
    const errors: string[] = [];
    const processedRequest = await applyRequestMiddleware(this.middlewares, request);

    for (const provider of this.providers) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[Gateway] Routing stream to ${provider.providerName} (Attempt ${attempt}/3)`);
          
          const stream = provider.chatStream(processedRequest);
          const firstIter = await stream.next();
          
          if (!firstIter.done) {
            yield firstIter.value;
          } else {
            return;
          }

          for await (const chunk of stream) {
            yield chunk;
          }
          return;

        } catch (e: any) {
          console.warn(`[Gateway] Provider ${provider.providerName} stream attempt ${attempt} failed: ${e.message}`);
          errors.push(`[${provider.providerName} - Attempt ${attempt}] ${e.message}`);

          for (const mw of this.middlewares) {
            mw.onError?.(e, provider.providerName);
          }

          if (attempt < 3) {
            const backoffMs = Math.pow(attempt, 2) * 500;
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }
    }

    throw new GatewayRoutingError(errors);
  }
}
