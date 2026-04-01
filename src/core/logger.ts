export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: Record<string, any>;
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
        console.debug(out);
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
