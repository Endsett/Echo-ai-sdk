import { ChatRequest, ChatResponse } from "../models/schemas";
import { StreamChunk } from "../core/streaming";

/**
 * Middleware interface for the AI Model Gateway.
 * Intercept, transform, or log requests/responses flowing through the gateway.
 */
export interface GatewayMiddleware {
  /** Called before a request is sent to any provider. Can modify the request. */
  onRequest?: (request: ChatRequest) => ChatRequest | Promise<ChatRequest>;
  /** Called after a successful response is received. Can modify the response. */
  onResponse?: (response: ChatResponse, request: ChatRequest) => ChatResponse | Promise<ChatResponse>;
  /** Called when a provider throws an error. */
  onError?: (error: Error, providerName: string) => void;
  /** Called for each streaming chunk in enhanced streaming mode. */
  onStreamChunk?: (chunk: StreamChunk, request: ChatRequest) => StreamChunk | Promise<StreamChunk>;
}

/**
 * Applies a middleware pipeline to requests and responses.
 */
export async function applyRequestMiddleware(
  middlewares: GatewayMiddleware[],
  request: ChatRequest
): Promise<ChatRequest> {
  let current = request;
  for (const mw of middlewares) {
    if (mw.onRequest) {
      current = await mw.onRequest(current);
    }
  }
  return current;
}

export async function applyResponseMiddleware(
  middlewares: GatewayMiddleware[],
  response: ChatResponse,
  request: ChatRequest
): Promise<ChatResponse> {
  let current = response;
  for (const mw of middlewares) {
    if (mw.onResponse) {
      current = await mw.onResponse(current, request);
    }
  }
  return current;
}
