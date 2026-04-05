/**
 * Tree of Thoughts (ToT) Agent
 * Implements tree-based reasoning with multiple thought paths and evaluation
 */

import { ChatRequest, BaseProvider } from "../models";
import { AIModelGateway } from "../gateway/router";
import { BaseMemoryStore } from "../memory/store";
import { ToolContext } from "../tools/base";
import { AgentTelemetry } from "../core/telemetry";
import { logger } from "../core/logger";
import { withRetries } from "../core/resilience";
import { ValidationError, ToolExecutionError } from "../core/exceptions";

export interface ThoughtNode {
  id: string;
  content: string;
  parent?: string;
  children: string[];
  evaluation?: number;
  depth: number;
  isComplete: boolean;
  toolsUsed?: string[];
  timestamp: number;
}

export interface ToTOptions {
  /** Maximum tree depth (default: 4) */
  maxDepth?: number;
  /** Number of thoughts to generate at each level (default: 3) */
  breadth?: number;
  /** Number of top thoughts to keep for expansion (default: 2) */
  topK?: number;
  /** Evaluation method: "vote" | "score" | "self" (default: "score") */
  evaluationMethod?: "vote" | "score" | "self";
  /** Allow backtracking to parent nodes (default: true) */
  allowBacktrack?: boolean;
  /** Prompt template for ToT (default: built-in) */
  totPrompt?: string;
}

export class ToTAgent {
  private gateway: AIModelGateway | BaseProvider;
  private memory: BaseMemoryStore;
  private tools: Map<string, ToolContext>;
  private systemPrompt?: string;
  private telemetry?: AgentTelemetry;
  private options: Required<ToTOptions>;
  private nodes: Map<string, ThoughtNode> = new Map();
  private sessionId: string = "";

  constructor(options: {
    gateway: AIModelGateway | BaseProvider;
    memory: BaseMemoryStore;
    tools?: ToolContext[];
    systemPrompt?: string;
    telemetry?: AgentTelemetry;
    totOptions?: ToTOptions;
  }) {
    if (!options.gateway) throw new ValidationError("ToTAgent", "gateway is required.");
    if (!options.memory) throw new ValidationError("ToTAgent", "memory is required.");

    this.gateway = options.gateway;
    this.memory = options.memory;
    this.tools = new Map((options.tools || []).map(t => [t.name, t]));
    this.systemPrompt = options.systemPrompt;
    this.telemetry = options.telemetry;
    
    this.options = {
      maxDepth: options.totOptions?.maxDepth ?? 4,
      breadth: options.totOptions?.breadth ?? 3,
      topK: options.totOptions?.topK ?? 2,
      evaluationMethod: options.totOptions?.evaluationMethod ?? "score",
      allowBacktrack: options.totOptions?.allowBacktrack ?? true,
      totPrompt: options.totOptions?.totPrompt ?? this.getDefaultToTPrompt(),
    };
  }

  /**
   * Execute using Tree of Thoughts reasoning
   */
  async execute(sessionId: string, task: string): Promise<string> {
    if (!sessionId) throw new ValidationError("execute", "sessionId is required.");
    if (!task) throw new ValidationError("execute", "task is required.");

    this.telemetry?.onAgentStart?.(sessionId, task);
    logger.info(`Starting ToT execution for session ${sessionId}`);
    
    this.sessionId = sessionId;
    this.nodes.clear();
    
    // Initialize session
    await this.initializeSession(sessionId, task);
    
    // Build thought tree
    const finalNode = await this.buildThoughtTree(sessionId, task);
    
    // Extract final answer
    const finalAnswer = await this.extractAnswerFromNode(sessionId, finalNode);
    
    this.telemetry?.onAgentEnd?.(sessionId, finalAnswer);
    logger.info(`ToT execution completed for session ${sessionId}`);
    
    return finalAnswer;
  }

  /**
   * Stream ToT execution with tree visualization
   */
  async *executeStream(sessionId: string, task: string): AsyncGenerator<{
    type: "thought" | "evaluation" | "selection" | "final" | "tree";
    content: string;
    depth?: number;
    nodeId?: string;
    tree?: any;
  }, void, unknown> {
    if (!sessionId) throw new ValidationError("executeStream", "sessionId is required.");
    
    this.sessionId = sessionId;
    this.nodes.clear();
    
    await this.initializeSession(sessionId, task);
    
    // Build tree with streaming updates
    const treeGenerator = this.buildThoughtTreeStream(sessionId, task);
    let finalNode: ThoughtNode | undefined;
    
    for await (const event of treeGenerator) {
      if (typeof event === 'object' && event !== null) {
        yield event;
      } else {
        finalNode = event;
      }
    }
    
    // Extract final answer
    const finalAnswer = await this.extractAnswerFromNode(sessionId, finalNode!);
    
    yield { 
      type: "final", 
      content: finalAnswer,
      tree: this.getTreeStructure()
    };
  }

  /**
   * Initialize session with ToT system prompt
   */
  private async initializeSession(sessionId: string, task: string): Promise<void> {
    const systemPrompt = this.systemPrompt || "You are a helpful AI assistant.";
    const totPrompt = `${systemPrompt}

${this.options.totPrompt}

Available tools: ${[...this.tools.keys()].join(", ")}

Think creatively and explore multiple approaches before selecting the best one.`;

    await this.memory.clearSession(sessionId);
    await this.memory.addMessage(sessionId, { role: "system", content: totPrompt });
    await this.memory.addMessage(sessionId, { role: "user", content: task });
  }

  /**
   * Build the thought tree
   */
  private async buildThoughtTree(sessionId: string, task: string): Promise<ThoughtNode> {
    // Generate initial thoughts
    const initialThoughts = await this.generateThoughts(sessionId, task, 0, undefined);
    
    // Add to tree
    const rootNodes: ThoughtNode[] = [];
    for (const thought of initialThoughts) {
      const node: ThoughtNode = {
        id: `node_0_${rootNodes.length}`,
        content: thought,
        parent: undefined,
        children: [],
        depth: 0,
        isComplete: false,
        timestamp: Date.now()
      };
      this.nodes.set(node.id, node);
      rootNodes.push(node);
    }

    // Evaluate initial thoughts
    await this.evaluateNodes(sessionId, rootNodes);

    // Expand tree
    let currentLevel = rootNodes;
    for (let depth = 1; depth < this.options.maxDepth; depth++) {
      // Select top thoughts to expand
      const selectedNodes = this.selectTopNodes(currentLevel);
      
      if (selectedNodes.length === 0) break;

      // Generate child thoughts
      const nextLevel: ThoughtNode[] = [];
      for (const parent of selectedNodes) {
        const childThoughts = await this.generateThoughts(sessionId, parent.content, depth, parent);
        
        for (const thought of childThoughts) {
          const node: ThoughtNode = {
            id: `node_${depth}_${nextLevel.length}`,
            content: thought,
            parent: parent.id,
            children: [],
            depth,
            isComplete: false,
            timestamp: Date.now()
          };
          
          this.nodes.set(node.id, node);
          parent.children.push(node.id);
          nextLevel.push(node);
        }
      }

      // Evaluate new thoughts
      await this.evaluateNodes(sessionId, nextLevel);
      currentLevel = nextLevel;

      // Check if any thought is complete
      const completeThoughts = currentLevel.filter(n => n.isComplete);
      if (completeThoughts.length > 0) {
        return completeThoughts[0];
      }
    }

    // Return best thought at max depth
    return this.selectBestNode(currentLevel);
  }

  /**
   * Build thought tree with streaming
   */
  private async *buildThoughtTreeStream(
    sessionId: string, 
    task: string
  ): AsyncGenerator<any, ThoughtNode, unknown> {
    const initialThoughts = await this.generateThoughts(sessionId, task, 0, undefined);
    
    yield { type: "thought", content: "Generating initial thoughts..." };
    
    const rootNodes: ThoughtNode[] = [];
    for (let i = 0; i < initialThoughts.length; i++) {
      const thought = initialThoughts[i];
      yield { type: "thought", content: `Thought ${i + 1}: ${thought}`, depth: 0 };
      
      const node: ThoughtNode = {
        id: `node_0_${i}`,
        content: thought,
        parent: undefined,
        children: [],
        depth: 0,
        isComplete: false,
        timestamp: Date.now()
      };
      this.nodes.set(node.id, node);
      rootNodes.push(node);
    }

    yield { type: "evaluation", content: "Evaluating initial thoughts..." };
    await this.evaluateNodes(sessionId, rootNodes);

    let currentLevel = rootNodes;
    for (let depth = 1; depth < this.options.maxDepth; depth++) {
      yield { type: "selection", content: `Selecting top thoughts for depth ${depth}...` };
      
      const selectedNodes = this.selectTopNodes(currentLevel);
      if (selectedNodes.length === 0) break;

      const nextLevel: ThoughtNode[] = [];
      for (const parent of selectedNodes) {
        yield { 
          type: "thought", 
          content: `Expanding: ${parent.content.substring(0, 100)}...`,
          depth,
          nodeId: parent.id
        };
        
        const childThoughts = await this.generateThoughts(sessionId, parent.content, depth, parent);
        
        for (const thought of childThoughts) {
          const node: ThoughtNode = {
            id: `node_${depth}_${nextLevel.length}`,
            content: thought,
            parent: parent.id,
            children: [],
            depth,
            isComplete: false,
            timestamp: Date.now()
          };
          
          this.nodes.set(node.id, node);
          parent.children.push(node.id);
          nextLevel.push(node);
        }
      }

      yield { type: "evaluation", content: `Evaluating thoughts at depth ${depth}...` };
      await this.evaluateNodes(sessionId, nextLevel);
      currentLevel = nextLevel;

      const completeThoughts = currentLevel.filter(n => n.isComplete);
      if (completeThoughts.length > 0) {
        yield { 
          type: "final", 
          content: `Found complete solution at depth ${depth}`,
          nodeId: completeThoughts[0].id
        };
        return completeThoughts[0];
      }
    }

    return this.selectBestNode(currentLevel);
  }

  /**
   * Generate thoughts for a given context
   */
  private async generateThoughts(
    sessionId: string,
    context: string,
    depth: number,
    parentNode?: ThoughtNode
  ): Promise<string[]> {
    const history = await this.memory.getMessages(sessionId);
    
    let prompt = `Generate ${this.options.breadth} different thoughts or approaches to: "${context}"`;
    
    if (parentNode) {
      prompt += `\nPrevious thought: "${parentNode.content}"`;
    }
    
    if (depth > 0) {
      prompt += `\nThis is at depth ${depth} of the reasoning tree. Be creative but practical.`;
    }

    const request: ChatRequest = {
      messages: [...history, { role: "user", content: prompt }],
      tools: this.tools.size > 0 ? Array.from(this.tools.values()).map(t => t.getMcpSchema()) : undefined,
      model_family: "smart",
      temperature: 0.9, // High temperature for diverse thoughts
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete(request),
      { maxRetries: 3, initialDelayMs: 1000 },
      "ToTAgent.generateThoughts"
    );

    // Parse thoughts from response
    const thoughts = this.parseThoughts(response.content || "");
    
    // Execute tools if needed
    if (thoughts.length > 0 && parentNode) {
      await this.executeToolsInThoughts(sessionId, thoughts, parentNode);
    }
    
    return thoughts;
  }

  /**
   * Parse thoughts from response
   */
  private parseThoughts(content: string): string[] {
    const thoughts: string[] = [];
    
    // Try different parsing strategies
    const patterns = [
      /\d+[.\)]\s*([^0-9\n]+)/g,  // Numbered list
      /-\s*([^-]+)/g,            // Bullet points
      /Thought:\s*([^\n]+)/gi    // Labeled thoughts
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const thought = match[1].trim();
        if (thought && thought.length > 10) {
          thoughts.push(thought);
        }
      }
    }

    // If no structured format found, split by paragraphs
    if (thoughts.length === 0) {
      const paragraphs = content.split('\n\n').filter(p => p.trim());
      thoughts.push(...paragraphs.slice(0, this.options.breadth));
    }

    return thoughts.slice(0, this.options.breadth);
  }

  /**
   * Execute tools mentioned in thoughts
   */
  private async executeToolsInThoughts(
    sessionId: string,
    thoughts: string[],
    parentNode: ThoughtNode
  ): Promise<void> {
    for (const thought of thoughts) {
      const toolCalls = this.extractToolCalls(thought);
      
      if (toolCalls.length > 0) {
        parentNode.toolsUsed = parentNode.toolsUsed || [];
        
        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(toolCall.tool, toolCall.input);
          parentNode.toolsUsed.push(toolCall.tool);
          
          await this.memory.addMessage(sessionId, {
            role: "assistant",
            content: `Tool ${toolCall.tool} result: ${result}`
          });
        }
      }
    }
  }

  /**
   * Extract tool calls from text
   */
  private extractToolCalls(text: string): Array<{ tool: string; input: string }> {
    const toolCalls: Array<{ tool: string; input: string }> = [];
    
    const patterns = [
      /(\w+)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /use\s+(\w+)\s+with\s+['"]([^'"]+)['"]/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const tool = match[1];
        const input = match[2];
        
        if (this.tools.has(tool)) {
          toolCalls.push({ tool, input });
        }
      }
    }

    return toolCalls;
  }

  /**
   * Execute a tool call
   */
  private async executeToolCall(toolName: string, input: string): Promise<string> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return `Error: Tool '${toolName}' not found`;
    }

    try {
      let args: any;
      try {
        args = JSON.parse(input);
      } catch {
        args = { query: input };
      }

      this.telemetry?.onToolStart?.(this.sessionId, toolName, args);
      
      const result = await tool.execute(args);
      this.telemetry?.onToolEnd?.(this.sessionId, toolName, result);
      
      return result;
    } catch (e: any) {
      const error = new ToolExecutionError(toolName, e.message);
      return error.message;
    }
  }

  /**
   * Evaluate nodes based on the selected method
   */
  private async evaluateNodes(sessionId: string, nodes: ThoughtNode[]): Promise<void> {
    switch (this.options.evaluationMethod) {
      case "score":
        await this.scoreNodes(sessionId, nodes);
        break;
      case "vote":
        await this.voteNodes(sessionId, nodes);
        break;
      case "self":
        await this.selfEvaluateNodes(sessionId, nodes);
        break;
    }
  }

  /**
   * Score nodes numerically
   */
  private async scoreNodes(sessionId: string, nodes: ThoughtNode[]): Promise<void> {
    for (const node of nodes) {
      const prompt = `Rate this thought on a scale of 0-100 based on correctness, creativity, and likelihood of success:

Thought: "${node.content}"

Score (0-100):`;

      const request: ChatRequest = {
        messages: await this.memory.getMessages(sessionId),
        model_family: "smart",
        temperature: 0.3,
        stream: false
      };

      const response = await withRetries(
        () => this.gateway.chatComplete({ ...request, messages: [...request.messages, { role: "user", content: prompt }] }),
        { maxRetries: 3, initialDelayMs: 1000 },
        "ToTAgent.scoreNodes"
      );

      const scoreMatch = response.content?.match(/(\d+)/);
      node.evaluation = scoreMatch ? parseInt(scoreMatch[1]) / 100 : 0.5;
    }
  }

  /**
   * Vote between nodes
   */
  private async voteNodes(sessionId: string, nodes: ThoughtNode[]): Promise<void> {
    if (nodes.length <= 1) {
      nodes[0].evaluation = 1.0;
      return;
    }

    const thoughtsList = nodes.map((n, i) => `${i + 1}. ${n.content}`).join('\n');
    const prompt = `Which of these thoughts is most promising? Reply with just the number:

${thoughtsList}`;

    const request: ChatRequest = {
      messages: await this.memory.getMessages(sessionId),
      model_family: "smart",
      temperature: 0.3,
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete({ ...request, messages: [...request.messages, { role: "user", content: prompt }] }),
      { maxRetries: 3, initialDelayMs: 1000 },
      "ToTAgent.voteNodes"
    );

    const voteMatch = response.content?.match(/(\d+)/);
    const selected = voteMatch ? parseInt(voteMatch[1]) - 1 : 0;
    
    // Give highest score to selected, lower to others
    nodes.forEach((node, i) => {
      node.evaluation = i === selected ? 1.0 : 0.3;
    });
  }

  /**
   * Self-evaluate nodes
   */
  private async selfEvaluateNodes(sessionId: string, nodes: ThoughtNode[]): Promise<void> {
    for (const node of nodes) {
      const prompt = `Evaluate this thought and provide a confidence score (0-100):

"${node.content}"

Is this thought complete and correct? If so, respond "COMPLETE" with a score.
If not, provide just the score.`;

      const request: ChatRequest = {
        messages: await this.memory.getMessages(sessionId),
        model_family: "smart",
        temperature: 0.3,
        stream: false
      };

      const response = await withRetries(
        () => this.gateway.chatComplete({ ...request, messages: [...request.messages, { role: "user", content: prompt }] }),
        { maxRetries: 3, initialDelayMs: 1000 },
        "ToTAgent.selfEvaluateNodes"
      );

      const content = response.content || "";
      node.isComplete = content.toLowerCase().includes("complete");
      
      const scoreMatch = content.match(/(\d+)/);
      node.evaluation = scoreMatch ? parseInt(scoreMatch[1]) / 100 : 0.5;
    }
  }

  /**
   * Select top K nodes to expand
   */
  private selectTopNodes(nodes: ThoughtNode[]): ThoughtNode[] {
    return nodes
      .sort((a, b) => (b.evaluation || 0) - (a.evaluation || 0))
      .slice(0, this.options.topK);
  }

  /**
   * Select best node from final level
   */
  private selectBestNode(nodes: ThoughtNode[]): ThoughtNode {
    return nodes.reduce((best, current) => 
      (current.evaluation || 0) > (best.evaluation || 0) ? current : best
    );
  }

  /**
   * Extract answer from final node
   */
  private async extractAnswerFromNode(sessionId: string, node: ThoughtNode): Promise<string> {
    const prompt = `Based on this final thought, provide a clear answer:

"${node.content}"

Final Answer:`;

    const request: ChatRequest = {
      messages: await this.memory.getMessages(sessionId),
      model_family: "smart",
      temperature: 0.5,
      stream: false
    };

    const response = await withRetries(
      () => this.gateway.chatComplete({ ...request, messages: [...request.messages, { role: "user", content: prompt }] }),
      { maxRetries: 3, initialDelayMs: 1000 },
      "ToTAgent.extractAnswer"
    );

    return response.content || node.content;
  }

  /**
   * Get tree structure for visualization
   */
  private getTreeStructure(): any {
    const buildNode = (id: string): any => {
      const node = this.nodes.get(id);
      if (!node) return null;
      
      return {
        id: node.id,
        content: node.content,
        evaluation: node.evaluation,
        children: node.children.map(buildNode).filter(Boolean)
      };
    };

    return Array.from(this.nodes.values())
      .filter((n: ThoughtNode) => !n.parent)
      .map((n: ThoughtNode) => buildNode(n.id))
      .filter(Boolean);
  }

  /**
   * Get default ToT prompt
   */
  private getDefaultToTPrompt(): string {
    return `You are using Tree of Thoughts reasoning. 
Generate multiple possible approaches, evaluate them, and select the best path.
Think creatively and consider different perspectives before making decisions.`;
  }

  /**
   * Get the complete thought tree
   */
  getTree(): Map<string, ThoughtNode> {
    return new Map(this.nodes);
  }

  getMemory(): BaseMemoryStore {
    return this.memory;
  }
}
