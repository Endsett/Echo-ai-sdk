/**
 * Model Context Protocol (MCP) Client
 * Connects to remote MCP servers and discovers tools
 */

import { ToolContext } from "../tools/base";
import { z } from "zod";

export interface MCPClientOptions {
  /** Server URL for SSE transport */
  serverUrl?: string;
  /** Command for stdio transport */
  command?: string;
  /** Arguments for stdio transport */
  args?: string[];
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCP Client for connecting to MCP servers and discovering tools
 */
export class MCPClient {
  private options: MCPClientOptions;
  private connected = false;

  constructor(options: MCPClientOptions) {
    this.options = {
      timeout: 30000,
      ...options
    };
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    // TODO: Implement actual MCP protocol connection
    // For now, stub implementation
    this.connected = true;
    console.log(`[MCP] Connected to server`);
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    console.log(`[MCP] Disconnected from server`);
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      throw new Error("MCP client not connected");
    }

    // TODO: Implement actual tool listing via MCP protocol
    return [];
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.connected) {
      throw new Error("MCP client not connected");
    }

    // TODO: Implement actual tool calling via MCP protocol
    return { content: [{ type: "text", text: "Tool result" }] };
  }

  /**
   * Convert MCP tools to Echo ToolContext format
   */
  async discoverTools(): Promise<ToolContext[]> {
    const mcpTools = await this.listTools();
    
    return mcpTools.map((mcpTool) => {
      // Convert JSON Schema to Zod schema
      const schema = this.jsonSchemaToZod(mcpTool.inputSchema);

      return {
        name: mcpTool.name,
        description: mcpTool.description,
        schema,
        execute: async (args: any) => {
          const result = await this.callTool(mcpTool.name, args);
          return this.formatToolResult(result);
        },
        getMcpSchema: () => ({
          type: "function",
          function: {
            name: mcpTool.name,
            description: mcpTool.description,
            parameters: mcpTool.inputSchema
          }
        })
      };
    });
  }

  /**
   * Simple JSON Schema to Zod converter (basic implementation)
   */
  private jsonSchemaToZod(schema: any): z.ZodTypeAny {
    if (!schema || schema.type === "object") {
      const properties = schema?.properties || {};
      const required = schema?.required || [];
      
      const shape: Record<string, z.ZodTypeAny> = {};
      
      for (const [key, propSchema] of Object.entries(properties)) {
        const zodType = this.convertPropertySchema(propSchema as any);
        shape[key] = required.includes(key) ? zodType : zodType.optional();
      }
      
      return z.object(shape);
    }
    
    return z.any();
  }

  private convertPropertySchema(prop: any): z.ZodTypeAny {
    switch (prop.type) {
      case "string":
        return z.string();
      case "number":
      case "integer":
        return z.number();
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(this.convertPropertySchema(prop.items || {}));
      case "object":
        return this.jsonSchemaToZod(prop);
      default:
        return z.any();
    }
  }

  private formatToolResult(result: any): string {
    if (typeof result === "string") return result;
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
    }
    return JSON.stringify(result);
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
