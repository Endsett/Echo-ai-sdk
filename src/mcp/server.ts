/**
 * Model Context Protocol (MCP) Server
 * Exposes Echo tools as an MCP-compliant server
 */

import { ToolContext } from "../tools/base";
import http from "http";

export interface MCPServerOptions {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** Transport type */
  transport: "stdio" | "sse";
  /** Port for SSE transport */
  port?: number;
}

/**
 * MCP Server to expose Echo tools over MCP protocol
 */
export class MCPServer {
  private options: MCPServerOptions;
  private tools: ToolContext[] = [];
  private server?: http.Server;

  constructor(options: MCPServerOptions) {
    this.options = {
      port: 3000,
      ...options
    };
  }

  /**
   * Register tools to be exposed via MCP
   */
  registerTools(tools: ToolContext[]): void {
    this.tools.push(...tools);
    console.log(`[MCP Server] Registered ${tools.length} tools`);
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.options.transport === "stdio") {
      await this.startStdioServer();
    } else {
      await this.startSSEServer();
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
    console.log("[MCP Server] Stopped");
  }

  private async startStdioServer(): Promise<void> {
    console.log(`[MCP Server] Starting stdio transport`);
    
    // Read from stdin and respond to MCP protocol messages
    process.stdin.on("data", (data) => {
      const message = data.toString().trim();
      if (!message) return;

      try {
        const request = JSON.parse(message);
        this.handleMCPRequest(request);
      } catch (e) {
        console.error("[MCP Server] Failed to parse request:", e);
      }
    });

    // Send initialization response
    this.sendMCPResponse({
      jsonrpc: "2.0",
      id: 0,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: this.options.name,
          version: this.options.version
        }
      }
    });
  }

  private async startSSEServer(): Promise<void> {
    const port = this.options.port!;
    
    this.server = http.createServer((req, res) => {
      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === "/sse") {
        // SSE endpoint for streaming
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        // Send server info
        res.write(`data: ${JSON.stringify({
          jsonrpc: "2.0",
          id: 0,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: {
              name: this.options.name,
              version: this.options.version
            }
          }
        })}\n\n`);
      } else if (req.url === "/tools/list" && req.method === "GET") {
        // List tools endpoint
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          tools: this.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.getMcpSchema().function.parameters
          }))
        }));
      } else if (req.url?.startsWith("/tools/call/") && req.method === "POST") {
        // Tool call endpoint
        const toolName = req.url.replace("/tools/call/", "");
        const tool = this.tools.find(t => t.name === toolName);

        if (!tool) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Tool not found" }));
          return;
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
          try {
            const args = JSON.parse(body);
            const result = await tool.execute(args);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              content: [{ type: "text", text: result }]
            }));
          } catch (e: any) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        console.log(`[MCP Server] SSE transport listening on port ${port}`);
        resolve();
      });
    });
  }

  private handleMCPRequest(request: any): void {
    switch (request.method) {
      case "tools/list":
        this.sendMCPResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            tools: this.tools.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.getMcpSchema().function.parameters
            }))
          }
        });
        break;
      
      case "tools/call":
        this.handleToolCall(request);
        break;
      
      default:
        this.sendMCPResponse({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: "Method not found"
          }
        });
    }
  }

  private async handleToolCall(request: any): Promise<void> {
    const { name, arguments: args } = request.params || {};
    const tool = this.tools.find(t => t.name === name);

    if (!tool) {
      this.sendMCPResponse({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32602,
          message: `Tool '${name}' not found`
        }
      });
      return;
    }

    try {
      const result = await tool.execute(args);
      this.sendMCPResponse({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          content: [{ type: "text", text: result }]
        }
      });
    } catch (e: any) {
      this.sendMCPResponse({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32603,
          message: e.message
        }
      });
    }
  }

  private sendMCPResponse(response: any): void {
    console.log(JSON.stringify(response));
  }

  get registeredTools(): ToolContext[] {
    return [...this.tools];
  }
}
