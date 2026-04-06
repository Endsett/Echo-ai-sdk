/**
 * Metrics Collector
 * Collects and exports metrics for AI operations
 */

export interface MetricData {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface MetricsCollectorOptions {
  /** Export interval in milliseconds */
  exportIntervalMs?: number;
  /** Enable console logging of metrics */
  logToConsole?: boolean;
  /** Custom export handler */
  onExport?: (metrics: MetricData[]) => void;
}

/**
 * Collects metrics for AI operations including latency, token usage, and costs
 */
export class MetricsCollector {
  private metrics: MetricData[] = [];
  private options: MetricsCollectorOptions;
  private exportTimer?: NodeJS.Timeout;

  constructor(options: MetricsCollectorOptions = {}) {
    this.options = {
      exportIntervalMs: 60000,
      logToConsole: true,
      ...options
    };

    this.startExportTimer();
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, tags?: Record<string, string>): void {
    const metric: MetricData = {
      name,
      value,
      timestamp: Date.now(),
      tags
    };

    this.metrics.push(metric);

    if (this.options.logToConsole) {
      console.log(`[Metric] ${name}: ${value}`, tags ? JSON.stringify(tags) : "");
    }
  }

  /**
   * Record request latency
   */
  recordLatency(durationMs: number, provider: string, model?: string): void {
    this.record("gateway.latency", durationMs, {
      provider,
      model: model || "unknown"
    });
  }

  /**
   * Record token usage
   */
  recordTokens(
    promptTokens: number,
    completionTokens: number,
    provider: string,
    model: string
  ): void {
    this.record("tokens.prompt", promptTokens, { provider, model });
    this.record("tokens.completion", completionTokens, { provider, model });
    this.record("tokens.total", promptTokens + completionTokens, { provider, model });
  }

  /**
   * Record estimated cost
   */
  recordCost(usdCost: number, provider: string, model: string): void {
    this.record("cost.usd", usdCost, { provider, model });
  }

  /**
   * Record error occurrence
   */
  recordError(errorType: string, provider: string): void {
    this.record("errors.count", 1, {
      type: errorType,
      provider
    });
  }

  /**
   * Record request count
   */
  recordRequest(provider: string, success: boolean): void {
    this.record("requests.count", 1, {
      provider,
      status: success ? "success" : "error"
    });
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): MetricData[] {
    return [...this.metrics];
  }

  /**
   * Get aggregated statistics
   */
  getStats(): {
    totalRequests: number;
    avgLatency: number;
    totalTokens: number;
    errorRate: number;
    totalCost: number;
  } {
    const requests = this.metrics.filter(m => m.name === "requests.count");
    const latencies = this.metrics.filter(m => m.name === "gateway.latency");
    const tokens = this.metrics.filter(m => m.name === "tokens.total");
    const errors = this.metrics.filter(m => m.name === "errors.count");
    const costs = this.metrics.filter(m => m.name === "cost.usd");

    const totalRequests = requests.length;
    const totalErrors = errors.reduce((sum, m) => sum + m.value, 0);
    
    return {
      totalRequests,
      avgLatency: latencies.length > 0
        ? latencies.reduce((sum, m) => sum + m.value, 0) / latencies.length
        : 0,
      totalTokens: tokens.reduce((sum, m) => sum + m.value, 0),
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      totalCost: costs.reduce((sum, m) => sum + m.value, 0)
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Export metrics and clear buffer
   */
  export(): MetricData[] {
    const exported = this.getMetrics();
    this.clear();
    
    if (this.options.onExport) {
      this.options.onExport(exported);
    }
    
    return exported;
  }

  /**
   * Stop the collector and export remaining metrics
   */
  stop(): MetricData[] {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = undefined;
    }
    return this.export();
  }

  private startExportTimer(): void {
    if (this.options.exportIntervalMs && this.options.exportIntervalMs > 0) {
      this.exportTimer = setInterval(() => {
        this.export();
      }, this.options.exportIntervalMs);
    }
  }
}

// Global metrics collector instance
export const globalMetrics = new MetricsCollector();
