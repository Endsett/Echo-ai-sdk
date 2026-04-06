/**
 * Plugin System
 * Extensible plugin architecture for Echo AI SDK
 */

import { ToolContext } from "../tools/base";
import { BaseProvider } from "../models/base";
import { GatewayMiddleware } from "../gateway/middleware";

export interface EchoPlugin {
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  
  /**
   * Called when plugin is registered
   */
  onInit?(): void | Promise<void>;
  
  /**
   * Called before each request
   */
  onRequest?(req: any): any | Promise<any>;
  
  /**
   * Called after each response
   */
  onResponse?(res: any, req: any): any | Promise<any>;
  
  /**
   * Called when an error occurs
   */
  onError?(error: Error, context?: any): void | Promise<void>;
  
  /**
   * Called when plugin is unregistered
   */
  onShutdown?(): void | Promise<void>;
  
  /**
   * Tools provided by this plugin
   */
  getTools?(): ToolContext[];
  
  /**
   * Providers provided by this plugin
   */
  getProviders?(): BaseProvider[];
  
  /**
   * Middleware provided by this plugin
   */
  getMiddleware?(): GatewayMiddleware;
}

/**
 * Plugin manager for registering and managing plugins
 */
export class PluginManager {
  private plugins = new Map<string, EchoPlugin>();
  private tools: ToolContext[] = [];
  private providers: BaseProvider[] = [];
  private middlewares: GatewayMiddleware[] = [];

  /**
   * Register a plugin
   */
  async register(plugin: EchoPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }

    // Initialize plugin
    if (plugin.onInit) {
      await plugin.onInit();
    }

    // Collect tools
    if (plugin.getTools) {
      const tools = plugin.getTools();
      this.tools.push(...tools);
    }

    // Collect providers
    if (plugin.getProviders) {
      const providers = plugin.getProviders();
      this.providers.push(...providers);
    }

    // Collect middleware
    if (plugin.getMiddleware) {
      this.middlewares.push(plugin.getMiddleware());
    }

    this.plugins.set(plugin.name, plugin);
    console.log(`[PluginManager] Registered plugin: ${plugin.name} v${plugin.version}`);
  }

  /**
   * Unregister a plugin
   */
  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin '${name}' is not registered`);
    }

    if (plugin.onShutdown) {
      await plugin.onShutdown();
    }

    this.plugins.delete(name);
    console.log(`[PluginManager] Unregistered plugin: ${name}`);
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): EchoPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Check if plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all tools from plugins
   */
  getTools(): ToolContext[] {
    return [...this.tools];
  }

  /**
   * Get all providers from plugins
   */
  getProviders(): BaseProvider[] {
    return [...this.providers];
  }

  /**
   * Get all middleware from plugins
   */
  getMiddlewares(): GatewayMiddleware[] {
    return [...this.middlewares];
  }

  /**
   * Process request through all plugins
   */
  async processRequest(req: any): Promise<any> {
    let result = req;
    for (const plugin of this.plugins.values()) {
      if (plugin.onRequest) {
        result = await plugin.onRequest(result);
      }
    }
    return result;
  }

  /**
   * Process response through all plugins
   */
  async processResponse(res: any, req: any): Promise<any> {
    let result = res;
    for (const plugin of this.plugins.values()) {
      if (plugin.onResponse) {
        result = await plugin.onResponse(result, req);
      }
    }
    return result;
  }

  /**
   * Notify all plugins of an error
   */
  async notifyError(error: Error, context?: any): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.onError) {
        await plugin.onError(error, context);
      }
    }
  }

  /**
   * Clear all plugins
   */
  async clear(): Promise<void> {
    for (const [name] of this.plugins) {
      await this.unregister(name);
    }
  }
}

// Global plugin manager instance
export const globalPluginManager = new PluginManager();
