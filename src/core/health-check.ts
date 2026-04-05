/**
 * Provider health check system for monitoring AI provider availability
 * Provides proactive health monitoring and automatic provider blacklisting
 */

import { BaseProvider } from "../models/base";
import { ChatRequest } from "../models/schemas";

export interface HealthCheckOptions {
  /** Interval in milliseconds between health checks (default: 30000) */
  checkInterval?: number;
  /** Timeout in milliseconds for each health check (default: 5000) */
  timeout?: number;
  /** Number of consecutive failures before marking as unhealthy (default: 3) */
  failureThreshold?: number;
  /** Number of consecutive successes before marking as healthy (default: 2) */
  successThreshold?: number;
  /** Health check request to send (default: simple ping) */
  healthCheckRequest?: ChatRequest;
  /** Callback for health status changes */
  onStatusChange?: (provider: string, status: HealthStatus, details?: any) => void;
}

export enum HealthStatus {
  HEALTHY = "healthy",
  UNHEALTHY = "unhealthy",
  DEGRADED = "degraded",
  UNKNOWN = "unknown"
}

export interface ProviderHealth {
  provider: string;
  status: HealthStatus;
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  averageResponseTime: number;
  lastError?: string;
  uptime: number; // Percentage of uptime in the last hour
}

export interface HealthCheckResult {
  provider: string;
  status: HealthStatus;
  responseTime: number;
  error?: string;
  timestamp: number;
}

/**
 * Health checker for monitoring AI provider availability
 */
export class ProviderHealthChecker {
  private healthMap = new Map<string, ProviderHealth>();
  private checkIntervals = new Map<string, NodeJS.Timeout>();
  private responseTimeHistory = new Map<string, number[]>();
  private readonly options: Required<HealthCheckOptions>;

  constructor(
    private providers: BaseProvider[],
    options: HealthCheckOptions = {}
  ) {
    this.options = {
      checkInterval: options.checkInterval ?? 30000,
      timeout: options.timeout ?? 5000,
      failureThreshold: options.failureThreshold ?? 3,
      successThreshold: options.successThreshold ?? 2,
      healthCheckRequest: options.healthCheckRequest ?? {
        messages: [{ role: "user" as const, content: "Hi" }],
        model_family: "fast" as const,
        max_tokens: 5,
        temperature: 0.7,
        stream: false,
      },
      onStatusChange: options.onStatusChange ?? (() => {}),
    };

    // Initialize health for all providers
    for (const provider of this.providers) {
      this.initializeProviderHealth(provider);
    }
  }

  private initializeProviderHealth(provider: BaseProvider): void {
    const health: ProviderHealth = {
      provider: provider.providerName,
      status: HealthStatus.UNKNOWN,
      lastCheck: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      averageResponseTime: 0,
      uptime: 100,
    };
    this.healthMap.set(provider.providerName, health);
    this.responseTimeHistory.set(provider.providerName, []);
  }

  /**
   * Start health checking for all providers
   */
  start(): void {
    for (const provider of this.providers) {
      this.startCheckingProvider(provider);
    }
  }

  /**
   * Stop health checking
   */
  stop(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
  }

  /**
   * Start checking a specific provider
   */
  private startCheckingProvider(provider: BaseProvider): void {
    const interval = setInterval(
      () => this.checkProvider(provider),
      this.options.checkInterval
    );
    this.checkIntervals.set(provider.providerName, interval);
    
    // Check immediately
    this.checkProvider(provider);
  }

  /**
   * Perform health check on a provider
   */
  private async checkProvider(provider: BaseProvider): Promise<void> {
    const startTime = Date.now();
    const providerName = provider.providerName;
    const health = this.healthMap.get(providerName)!;

    try {
      // Race between the health check and timeout
      const result = await Promise.race([
        this.performHealthCheck(provider),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("Health check timeout")), this.options.timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;
      this.recordSuccess(providerName, responseTime);
      
      health.lastCheck = Date.now();
      health.averageResponseTime = this.calculateAverageResponseTime(providerName);
      
      // Update status based on response time
      if (responseTime > 3000) {
        this.updateStatus(providerName, HealthStatus.DEGRADED, "Slow response time");
      } else {
        this.updateStatus(providerName, HealthStatus.HEALTHY);
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      this.recordFailure(providerName, error.message);
      
      health.lastCheck = Date.now();
      health.lastError = error.message;
      health.averageResponseTime = this.calculateAverageResponseTime(providerName);
      
      this.updateStatus(providerName, HealthStatus.UNHEALTHY, error.message);
    }
  }

  /**
   * Perform the actual health check request
   */
  private async performHealthCheck(provider: BaseProvider): Promise<any> {
    // Use a minimal request for health check
    const request = { ...this.options.healthCheckRequest };
    
    // Try streaming first if available, fallback to regular request
    if (provider.chatStream) {
      const stream = provider.chatStream(request);
      await stream.next(); // Just get the first chunk
      return true;
    } else {
      return await provider.chatComplete(request);
    }
  }

  private recordSuccess(providerName: string, responseTime: number): void {
    const health = this.healthMap.get(providerName)!;
    health.consecutiveSuccesses++;
    health.consecutiveFailures = 0;

    // Update response time history
    const history = this.responseTimeHistory.get(providerName)!;
    history.push(responseTime);
    
    // Keep only last 100 measurements
    if (history.length > 100) {
      history.shift();
    }

    // Calculate uptime (simplified - based on recent checks)
    const recentChecks = history.length;
    const successfulChecks = health.consecutiveSuccesses;
    health.uptime = recentChecks > 0 ? (successfulChecks / recentChecks) * 100 : 100;
  }

  private recordFailure(providerName: string, error: string): void {
    const health = this.healthMap.get(providerName)!;
    health.consecutiveFailures++;
    health.consecutiveSuccesses = 0;

    // Update uptime
    const history = this.responseTimeHistory.get(providerName)!;
    const recentChecks = Math.max(history.length, health.consecutiveFailures);
    health.uptime = recentChecks > 0 ? ((recentChecks - health.consecutiveFailures) / recentChecks) * 100 : 0;
  }

  private calculateAverageResponseTime(providerName: string): number {
    const history = this.responseTimeHistory.get(providerName)!;
    if (history.length === 0) return 0;
    
    const sum = history.reduce((a, b) => a + b, 0);
    return sum / history.length;
  }

  private updateStatus(providerName: string, newStatus: HealthStatus, details?: string): void {
    const health = this.healthMap.get(providerName)!;
    const oldStatus = health.status;
    
    // Determine if status should change based on thresholds
    if (newStatus === HealthStatus.HEALTHY) {
      if (health.consecutiveSuccesses >= this.options.successThreshold) {
        health.status = HealthStatus.HEALTHY;
      }
    } else if (newStatus === HealthStatus.UNHEALTHY) {
      if (health.consecutiveFailures >= this.options.failureThreshold) {
        health.status = HealthStatus.UNHEALTHY;
      }
    } else {
      health.status = newStatus;
    }

    // Notify of status change
    if (oldStatus !== health.status) {
      this.options.onStatusChange(providerName, health.status, details);
    }
  }

  /**
   * Get health status for all providers
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.healthMap.values());
  }

  /**
   * Get health status for a specific provider
   */
  getHealth(providerName: string): ProviderHealth | undefined {
    return this.healthMap.get(providerName);
  }

  /**
   * Get only healthy providers
   */
  getHealthyProviders(): BaseProvider[] {
    return this.providers.filter(p => {
      const health = this.healthMap.get(p.providerName);
      return health?.status === HealthStatus.HEALTHY || health?.status === HealthStatus.DEGRADED;
    });
  }

  /**
   * Add a new provider to monitor
   */
  addProvider(provider: BaseProvider): void {
    this.providers.push(provider);
    this.initializeProviderHealth(provider);
    this.startCheckingProvider(provider);
  }

  /**
   * Remove a provider from monitoring
   */
  removeProvider(providerName: string): void {
    const index = this.providers.findIndex(p => p.providerName === providerName);
    if (index !== -1) {
      this.providers.splice(index, 1);
    }
    
    const interval = this.checkIntervals.get(providerName);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(providerName);
    }
    
    this.healthMap.delete(providerName);
    this.responseTimeHistory.delete(providerName);
  }

  /**
   * Force an immediate health check for all providers
   */
  async checkAll(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    
    for (const provider of this.providers) {
      try {
        const startTime = Date.now();
        await this.performHealthCheck(provider);
        const responseTime = Date.now() - startTime;
        
        results.push({
          provider: provider.providerName,
          status: HealthStatus.HEALTHY,
          responseTime,
          timestamp: Date.now(),
        });
      } catch (error: any) {
        results.push({
          provider: provider.providerName,
          status: HealthStatus.UNHEALTHY,
          responseTime: 0,
          error: error.message,
          timestamp: Date.now(),
        });
      }
    }
    
    return results;
  }
}
