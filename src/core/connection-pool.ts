/**
 * HTTP connection pooling for improved performance and resource management
 * Reuses connections across requests to reduce latency and resource overhead
 */

import { Agent } from "https";
import { Agent as HttpAgent } from "http";

export interface ConnectionPoolOptions {
  /** Maximum number of connections to keep alive (default: 50) */
  maxSockets?: number;
  /** Maximum number of free sockets to keep in pool (default: 10) */
  maxFreeSockets?: number;
  /** Timeout in milliseconds for free sockets (default: 30000) */
  freeSocketTimeout?: number;
  /** Timeout in milliseconds for establishing connection (default: 10000) */
  connectTimeout?: number;
  /** Enable keep-alive (default: true) */
  keepAlive?: boolean;
  /** Keep-alive initial delay in milliseconds (default: 0) */
  keepAliveMsecs?: number;
  /** Enable session reuse (default: true) */
  sessionReuse?: boolean;
  /** Custom TLS options */
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
    maxVersion?: string;
  };
}

export interface PoolStats {
  totalSockets: number;
  freeSockets: number;
  pendingRequests: number;
  activeRequests: number;
  totalRequests: number;
  totalErrors: number;
  averageResponseTime: number;
}

/**
 * Connection pool manager for HTTP/HTTPS requests
 */
export class ConnectionPoolManager {
  private httpsAgent: Agent;
  private httpAgent: HttpAgent;
  private stats = {
    totalRequests: 0,
    totalErrors: 0,
    responseTimes: [] as number[],
    activeRequests: 0,
  };
  private readonly options: Required<ConnectionPoolOptions>;

  constructor(options: ConnectionPoolOptions = {}) {
    this.options = {
      maxSockets: options.maxSockets ?? 50,
      maxFreeSockets: options.maxFreeSockets ?? 10,
      freeSocketTimeout: options.freeSocketTimeout ?? 30000,
      connectTimeout: options.connectTimeout ?? 10000,
      keepAlive: options.keepAlive ?? true,
      keepAliveMsecs: options.keepAliveMsecs ?? 0,
      sessionReuse: options.sessionReuse ?? true,
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ...options.tls,
      },
    };

    // Create HTTPS agent
    this.httpsAgent = new Agent({
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.freeSocketTimeout,
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveMsecs,
      scheduling: 'fifo',
      rejectUnauthorized: this.options.tls.rejectUnauthorized,
      minVersion: this.options.tls.minVersion as any,
      maxVersion: this.options.tls.maxVersion as any,
    });

    // Create HTTP agent
    this.httpAgent = new HttpAgent({
      maxSockets: this.options.maxSockets,
      maxFreeSockets: this.options.maxFreeSockets,
      timeout: this.options.freeSocketTimeout,
      keepAlive: this.options.keepAlive,
      keepAliveMsecs: this.options.keepAliveMsecs,
      scheduling: 'fifo',
    });

    // Monitor agent events
    this.setupEventMonitoring();
  }

  /**
   * Get the appropriate agent for a URL
   */
  getAgent(url: string): Agent | HttpAgent {
    return url.startsWith('https:') ? this.httpsAgent : this.httpAgent;
  }

  /**
   * Create fetch options with connection pooling
   */
  createFetchOptions(url: string, options: RequestInit = {}): RequestInit {
    const agent = this.getAgent(url);
    
    return {
      ...options,
      // @ts-ignore - Node.js fetch supports agent option
      agent,
      // Add connection timeout
      signal: this.createTimeoutSignal(this.options.connectTimeout, options.signal),
    };
  }

  /**
   * Enhanced fetch with connection pooling and metrics
   */
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const startTime = Date.now();
    this.stats.totalRequests++;
    this.stats.activeRequests++;

    try {
      const fetchOptions = this.createFetchOptions(url, options);
      const response = await fetch(url, fetchOptions);
      
      // Record response time
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(responseTime);
      
      return response;
    } catch (error: any) {
      this.stats.totalErrors++;
      throw error;
    } finally {
      this.stats.activeRequests--;
    }
  }

  /**
   * Create a timeout signal that can be combined with existing signals
   */
  private createTimeoutSignal = (timeout: number, existingSignal?: AbortSignal | null): AbortSignal => {
    if (existingSignal?.aborted) {
      return existingSignal;
    }

    const controller = new AbortController();
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    // If there's an existing signal, abort when it aborts
    if (existingSignal) {
      const onAbort = () => {
        controller.abort();
        clearTimeout(timeoutId);
      };
      
      if (existingSignal.aborted) {
        onAbort();
      } else {
        existingSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    // Clean up timeout on abort
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });

    return controller.signal;
  };

  private recordResponseTime(time: number): void {
    this.stats.responseTimes.push(time);
    
    // Keep only last 100 measurements
    if (this.stats.responseTimes.length > 100) {
      this.stats.responseTimes.shift();
    }
  }

  private setupEventMonitoring(): void {
    // Monitor HTTPS agent
    this.httpsAgent.on('free', () => {
      // Connection returned to pool
    });

    this.httpsAgent.on('close', () => {
      // Connection closed
    });

    this.httpsAgent.on('error', (error) => {
      console.error('[ConnectionPool] HTTPS agent error:', error);
      this.stats.totalErrors++;
    });

    // Monitor HTTP agent
    this.httpAgent.on('free', () => {
      // Connection returned to pool
    });

    this.httpAgent.on('close', () => {
      // Connection closed
    });

    this.httpAgent.on('error', (error) => {
      console.error('[ConnectionPool] HTTP agent error:', error);
      this.stats.totalErrors++;
    });
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    const averageResponseTime = this.stats.responseTimes.length > 0
      ? this.stats.responseTimes.reduce((a, b) => a + b, 0) / this.stats.responseTimes.length
      : 0;

    return {
      totalSockets: (this.httpsAgent as any).sockets?.size || 0 + (this.httpAgent as any).sockets?.size || 0,
      freeSockets: (this.httpsAgent as any).freeSockets?.size || 0 + (this.httpAgent as any).freeSockets?.size || 0,
      pendingRequests: (this.httpsAgent as any).requests?.size || 0 + (this.httpAgent as any).requests?.size || 0,
      activeRequests: this.stats.activeRequests,
      totalRequests: this.stats.totalRequests,
      totalErrors: this.stats.totalErrors,
      averageResponseTime,
    };
  }

  /**
   * Destroy all connections and clean up
   */
  destroy(): void {
    this.httpsAgent.destroy();
    this.httpAgent.destroy();
  }
}

/**
 * Global connection pool instance
 */
export const globalConnectionPool = new ConnectionPoolManager();

/**
 * Fetch wrapper that uses the global connection pool
 */
export async function pooledFetch(url: string, options?: RequestInit): Promise<Response> {
  return globalConnectionPool.fetch(url, options);
}

/**
 * Create a provider-specific connection pool
 */
export function createProviderPool(providerName: string, options?: ConnectionPoolOptions): ConnectionPoolManager {
  // Provider-specific configuration could be added here
  // For now, just return a new pool with the given options
  return new ConnectionPoolManager(options);
}

/**
 * Connection pool factory for different use cases
 */
export class ConnectionPoolFactory {
  private static pools = new Map<string, ConnectionPoolManager>();

  /**
   * Get or create a named connection pool
   */
  static getPool(name: string, options?: ConnectionPoolOptions): ConnectionPoolManager {
    if (!this.pools.has(name)) {
      this.pools.set(name, new ConnectionPoolManager(options));
    }
    return this.pools.get(name)!;
  }

  /**
   * Get all pool statistics
   */
  static getAllStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {};
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats();
    }
    return stats;
  }

  /**
   * Destroy a specific pool
   */
  static destroyPool(name: string): void {
    const pool = this.pools.get(name);
    if (pool) {
      pool.destroy();
      this.pools.delete(name);
    }
  }

  /**
   * Destroy all pools
   */
  static destroyAll(): void {
    for (const pool of this.pools.values()) {
      pool.destroy();
    }
    this.pools.clear();
  }
}
