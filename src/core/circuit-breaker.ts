/**
 * Circuit Breaker implementation for preventing cascading failures
 * Provides automatic failover and recovery monitoring for external service calls
 */

export enum CircuitState {
  CLOSED = "closed",      // Normal operation, requests pass through
  OPEN = "open",          // Circuit is open, requests fail fast
  HALF_OPEN = "half_open" // Testing if service has recovered
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN (default: 60000) */
  recoveryTimeout?: number;
  /** Time in milliseconds to wait before transitioning from HALF_OPEN to CLOSED (default: 10000) */
  halfOpenTimeout?: number;
  /** Percentage of successes required in HALF_OPEN to close circuit (default: 50) */
  successThreshold?: number;
  /** Minimum number of requests in HALF_OPEN state before evaluating (default: 3) */
  monitoringRequests?: number;
  /** Function to determine if an error counts as a failure */
  isFailure?: (error: any) => boolean;
  /** Callback for state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Callback for failures */
  onFailure?: (error: any, metadata?: any) => void;
  /** Callback for successes */
  onSuccess?: (result: any, metadata?: any) => void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
  rejectionCount: number;
}

/**
 * Circuit Breaker that wraps function calls and prevents cascading failures
 */
export class CircuitBreaker<T extends (...args: any[]) => Promise<any>> {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime?: number;
  private rejectionCount = 0;
  private halfOpenRequests = 0;
  private halfOpenSuccesses = 0;

  private readonly options: Required<CircuitBreakerOptions>;

  constructor(
    private fn: T,
    options: CircuitBreakerOptions = {}
  ) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      recoveryTimeout: options.recoveryTimeout ?? 60000,
      halfOpenTimeout: options.halfOpenTimeout ?? 10000,
      successThreshold: options.successThreshold ?? 50,
      monitoringRequests: options.monitoringRequests ?? 3,
      isFailure: options.isFailure ?? this.defaultIsFailure,
      onStateChange: options.onStateChange ?? (() => {}),
      onFailure: options.onFailure ?? (() => {}),
      onSuccess: options.onSuccess ?? (() => {}),
    };
  }

  private defaultIsFailure(error: any): boolean {
    // Don't count validation errors as circuit failures
    if (error.name === 'ValidationError') return false;
    // Count rate limits and server errors as failures
    return error.status >= 500 || error.code === 'rate_limit_exceeded' || error.code === 'timeout';
  }

  /**
   * Execute the wrapped function with circuit breaker protection
   */
  async execute(...args: Parameters<T>): Promise<ReturnType<T>> {
    // Check if circuit is OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime!) {
        this.rejectionCount++;
        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN. Rejected ${this.rejectionCount} requests. Next attempt at ${new Date(this.nextAttemptTime!).toISOString()}`
        );
      }
      // Try to transition to HALF_OPEN
      this.transitionTo(CircuitState.HALF_OPEN);
    }

    try {
      const result = await this.fn(...args);
      this.onSuccess(result);
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(result: any): void {
    this.lastSuccessTime = Date.now();
    this.successes++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests++;
      this.halfOpenSuccesses++;

      // Check if we have enough requests to evaluate
      if (this.halfOpenRequests >= this.options.monitoringRequests) {
        const successRate = (this.halfOpenSuccesses / this.halfOpenRequests) * 100;
        if (successRate >= this.options.successThreshold) {
          // Service has recovered, close the circuit
          this.transitionTo(CircuitState.CLOSED);
          this.resetCounters();
        } else {
          // Still failing, open circuit again
          this.transitionTo(CircuitState.OPEN);
        }
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failures = Math.max(0, this.failures - 1);
    }

    this.options.onSuccess(result, { state: this.state, successes: this.successes });
  }

  private onFailure(error: any): void {
    this.lastFailureTime = Date.now();
    this.failures++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately opens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've exceeded the failure threshold
      if (this.failures >= this.options.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }

    if (this.options.isFailure(error)) {
      this.options.onFailure(error, { state: this.state, failures: this.failures });
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Set timing for state transitions
    if (newState === CircuitState.OPEN) {
      this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenRequests = 0;
      this.halfOpenSuccesses = 0;
    }

    this.options.onStateChange(oldState, newState);
  }

  private resetCounters(): void {
    this.failures = 0;
    this.successes = 0;
    this.halfOpenRequests = 0;
    this.halfOpenSuccesses = 0;
    this.rejectionCount = 0;
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      rejectionCount: this.rejectionCount,
    };
  }

  /**
   * Force the circuit into a specific state (for testing)
   */
  setState(state: CircuitState): void {
    this.transitionTo(state);
  }

  /**
   * Reset the circuit breaker to CLOSED state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.resetCounters();
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Factory function to create a circuit breaker
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: CircuitBreakerOptions
): CircuitBreaker<T> {
  return new CircuitBreaker(fn, options);
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker<any>>();

  register<T extends (...args: any[]) => Promise<any>>(
    name: string,
    fn: T,
    options?: CircuitBreakerOptions
  ): CircuitBreaker<T> {
    const breaker = new CircuitBreaker(fn, options);
    this.breakers.set(name, breaker);
    return breaker;
  }

  get(name: string): CircuitBreaker<any> | undefined {
    return this.breakers.get(name);
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  reset(name?: string): void {
    if (name) {
      this.breakers.get(name)?.reset();
    } else {
      for (const breaker of this.breakers.values()) {
        breaker.reset();
      }
    }
  }
}

// Global registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
