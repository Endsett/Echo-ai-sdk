/**
 * Central Tool Registry
 * Unified registration, discovery, and management of tools
 */

import { ToolContext } from "../tools/base";
import { MCPClient } from "../mcp/client";

export interface ToolMetadata {
  tags?: string[];
  category?: string;
  author?: string;
  version?: string;
  requiresAuth?: boolean;
}

export interface RegisteredTool {
  context: ToolContext;
  metadata: ToolMetadata;
  namespace?: string;
}

/**
 * Central tool registry for discovering and managing tools
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();
  private namespaces = new Map<string, ToolContext[]>();

  /**
   * Register a tool in the registry
   */
  register(name: string, tool: ToolContext, metadata: ToolMetadata = {}, namespace?: string): void {
    const key = namespace ? `${namespace}.${name}` : name;
    
    this.tools.set(key, {
      context: tool,
      metadata,
      namespace
    });

    if (namespace) {
      if (!this.namespaces.has(namespace)) {
        this.namespaces.set(namespace, []);
      }
      this.namespaces.get(namespace)!.push(tool);
    }

    console.log(`[ToolRegistry] Registered tool: ${key}`);
  }

  /**
   * Get a tool by name (optionally with namespace)
   */
  get(name: string, namespace?: string): ToolContext | undefined {
    const key = namespace ? `${namespace}.${name}` : name;
    return this.tools.get(key)?.context;
  }

  /**
   * Check if a tool exists
   */
  has(name: string, namespace?: string): boolean {
    const key = namespace ? `${namespace}.${name}` : name;
    return this.tools.has(key);
  }

  /**
   * Remove a tool from the registry
   */
  unregister(name: string, namespace?: string): boolean {
    const key = namespace ? `${namespace}.${name}` : name;
    const tool = this.tools.get(key);
    
    if (tool) {
      this.tools.delete(key);
      
      if (namespace && this.namespaces.has(namespace)) {
        const nsTools = this.namespaces.get(namespace)!;
        const index = nsTools.indexOf(tool.context);
        if (index > -1) {
          nsTools.splice(index, 1);
        }
      }
      
      console.log(`[ToolRegistry] Unregistered tool: ${key}`);
      return true;
    }
    
    return false;
  }

  /**
   * List all registered tools
   */
  list(namespace?: string): ToolContext[] {
    if (namespace) {
      return this.namespaces.get(namespace) || [];
    }
    
    return Array.from(this.tools.values()).map(t => t.context);
  }

  /**
   * Search tools by tags or name
   */
  search(query: string, namespace?: string): ToolContext[] {
    const allTools = namespace 
      ? Array.from(this.tools.values()).filter(t => t.namespace === namespace)
      : Array.from(this.tools.values());

    return allTools
      .filter(t => {
        const nameMatch = t.context.name.toLowerCase().includes(query.toLowerCase());
        const descMatch = t.context.description.toLowerCase().includes(query.toLowerCase());
        const tagMatch = t.metadata.tags?.some(tag => 
          tag.toLowerCase().includes(query.toLowerCase())
        );
        return nameMatch || descMatch || tagMatch;
      })
      .map(t => t.context);
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): ToolContext[] {
    return Array.from(this.tools.values())
      .filter(t => t.metadata.category === category)
      .map(t => t.context);
  }

  /**
   * Load tools from an MCP server
   */
  async loadFromMCP(serverUrl: string, namespace: string): Promise<void> {
    const client = new MCPClient({ serverUrl });
    
    try {
      await client.connect();
      const tools = await client.discoverTools();
      
      tools.forEach(tool => {
        this.register(tool.name, tool, { tags: ["mcp", namespace] }, namespace);
      });
      
      console.log(`[ToolRegistry] Loaded ${tools.length} tools from MCP server: ${serverUrl}`);
    } catch (e) {
      console.error(`[ToolRegistry] Failed to load tools from ${serverUrl}:`, e);
      throw e;
    }
  }

  /**
   * Clear all tools or just a namespace
   */
  clear(namespace?: string): void {
    if (namespace) {
      const tools = this.namespaces.get(namespace);
      tools?.forEach(tool => {
        const key = `${namespace}.${tool.name}`;
        this.tools.delete(key);
      });
      this.namespaces.delete(namespace);
      console.log(`[ToolRegistry] Cleared namespace: ${namespace}`);
    } else {
      this.tools.clear();
      this.namespaces.clear();
      console.log("[ToolRegistry] Cleared all tools");
    }
  }

  /**
   * Get all namespaces
   */
  getNamespaces(): string[] {
    return Array.from(this.namespaces.keys());
  }

  /**
   * Get registry statistics
   */
  getStats(): { total: number; namespaces: string[] } {
    return {
      total: this.tools.size,
      namespaces: this.getNamespaces()
    };
  }
}

// Global singleton instance
export const globalToolRegistry = new ToolRegistry();
