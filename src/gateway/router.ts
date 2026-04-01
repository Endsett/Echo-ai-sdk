import { BaseProvider } from "../models";
import { ChatRequest, ChatResponse } from "../models/schemas";
import { GatewayRoutingError } from "../core/exceptions";
import { GatewayMiddleware, applyRequestMiddleware, applyResponseMiddleware } from "./middleware";

export class AIModelGateway {
  private middlewares: GatewayMiddleware[] = [];

  constructor(public providers: BaseProvider[]) {
    if (providers.length === 0) {
      throw new Error("Gateway requires at least one configured provider.");
    }
  }

  /**
   * Register middleware to intercept, transform, or log requests/responses.
   * Middleware is executed in registration order.
   */
  use(middleware: GatewayMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

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
