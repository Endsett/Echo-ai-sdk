export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: Record<string, any>;
  duration?: number;
  requestId?: string;
}

export class SDKLogger {
  private levelValue(level: LogLevel): number {
    switch (level) {
      case "debug": return 0;
      case "info": return 1;
      case "warn": return 2;
      case "error": return 3;
    }
  }

  constructor(private minLevel: LogLevel = "info") {}

  /**
   * Start a performance timer for the given operation
   * 
   * @param operation - Name of the operation being timed
   * @returns A timer object that can be used to end the timing
   * 
   * @example
   * ```typescript
   * const timer = logger.startTimer("API Request");
   * await makeRequest();
   * timer.end({ endpoint: "/chat" });
   * ```
   */
  startTimer(operation: string) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    this.debug(`Starting ${operation}`, { requestId });
    
    return {
      end: (context?: Record<string, any>) => {
        const duration = Date.now() - startTime;
        this.info(`Completed ${operation} in ${duration}ms`, {
          ...context,
          duration,
          requestId
        });
      }
    };
  }

  /**
   * Log request details in debug mode
   */
  logRequest(provider: string, request: any, requestId?: string) {
    if (this.minLevel === "debug") {
      this.debug(`[${provider}] Request`, {
        requestId,
        messages: request.messages?.length || 0,
        maxTokens: request.max_tokens,
        temperature: request.temperature,
        model: request.model_family || "default"
      });
    }
  }

  /**
   * Log response details in debug mode
   */
  logResponse(provider: string, response: any, requestId?: string) {
    if (this.minLevel === "debug") {
      this.debug(`[${provider}] Response`, {
        requestId,
        contentLength: response.content?.length || 0,
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
        model: response.model_name
      });
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>) {
    if (this.levelValue(level) >= this.levelValue(this.minLevel)) {
      const entry: LogEntry = {
        level,
        timestamp: new Date().toISOString(),
        message,
        context
      };
      
      const out = JSON.stringify(entry);
      if (level === "error") {
        console.error(out);
      } else if (level === "warn") {
        console.warn(out);
      } else if (level === "debug") {
        if (process.env.NODE_ENV !== "production") {
          console.debug(out);
        }
      } else {
        console.info(out);
      }
    }
  }

  debug(message: string, context?: Record<string, any>) { this.log("debug", message, context); }
  info(message: string, context?: Record<string, any>) { this.log("info", message, context); }
  warn(message: string, context?: Record<string, any>) { this.log("warn", message, context); }
  error(message: string, context?: Record<string, any>) { this.log("error", message, context); }
}

export const logger = new SDKLogger(
  (process.env.ECHO_LOG_LEVEL as LogLevel) || "info"
);
