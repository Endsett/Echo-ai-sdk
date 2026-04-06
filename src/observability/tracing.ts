/**
 * OpenTelemetry Tracing Integration
 * Provides distributed tracing for AI operations
 */

import { GatewayMiddleware } from "../gateway/middleware";

export interface TracingOptions {
  /** Service name for traces */
  serviceName?: string;
  /** Whether to capture request/response bodies */
  capturePayloads?: boolean;
  /** Custom attributes to add to all spans */
  defaultAttributes?: Record<string, any>;
}

/**
 * Tracing middleware for the gateway
 * Creates spans for each request/response cycle
 */
export class TracingMiddleware implements GatewayMiddleware {
  private options: TracingOptions;
  private activeSpans = new Map<string, any>();

  constructor(options: TracingOptions = {}) {
    this.options = {
      serviceName: "echo-ai-sdk",
      capturePayloads: false,
      ...options
    };
  }

  /**
   * Start a span for tracking an operation
   */
  startSpan(name: string, attributes?: Record<string, any>): string {
    const spanId = Math.random().toString(36).substring(2, 15);
    const span = {
      id: spanId,
      name,
      startTime: Date.now(),
      attributes: {
        ...this.options.defaultAttributes,
        ...attributes,
        "service.name": this.options.serviceName,
      },
      status: "ok"
    };
    
    this.activeSpans.set(spanId, span);
    return spanId;
  }

  /**
   * End a span and optionally export it
   */
  endSpan(spanId: string, error?: Error): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    const endTime = Date.now();
    span.duration = endTime - span.startTime;
    
    if (error) {
      span.status = "error";
      span.attributes["error.message"] = error.message;
      span.attributes["error.type"] = error.name;
    }

    // Log span for now (in production, this would export to OpenTelemetry collector)
    console.log(`[Trace] ${span.name} - ${span.duration}ms - ${span.status}`, span.attributes);
    
    this.activeSpans.delete(spanId);
  }

  /**
   * Add attributes to an active span
   */
  addSpanAttributes(spanId: string, attributes: Record<string, any>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      Object.assign(span.attributes, attributes);
    }
  }

  async onRequest(req: any): Promise<any> {
    const spanId = this.startSpan("gateway.request", {
      "message.count": req.messages?.length,
      "model.family": req.model_family,
      "temperature": req.temperature,
      "has.tools": !!req.tools?.length,
    });

    // Attach span ID to request for correlation
    req._traceSpanId = spanId;

    if (this.options.capturePayloads && req.messages) {
      this.addSpanAttributes(spanId, {
        "request.messages": JSON.stringify(req.messages).substring(0, 1000)
      });
    }

    return req;
  }

  async onResponse(res: any, req: any): Promise<any> {
    const spanId = req._traceSpanId;
    if (spanId) {
      this.addSpanAttributes(spanId, {
        "response.provider": res.provider_name,
        "response.model": res.model_name,
        "tokens.prompt": res.usage?.prompt_tokens,
        "tokens.completion": res.usage?.completion_tokens,
        "tokens.total": res.usage?.total_tokens,
      });

      if (this.options.capturePayloads && res.content) {
        this.addSpanAttributes(spanId, {
          "response.content": res.content.substring(0, 500)
        });
      }

      this.endSpan(spanId);
    }

    return res;
  }

  onError(error: Error, provider: string): void {
    console.log(`[Trace] Provider error from ${provider}: ${error.message}`);
  }

  onStreamChunk(chunk: any, req: any): any {
    // Track streaming chunks if needed
    return chunk;
  }
}
