/**
 * Agent Team - Multi-agent collaboration framework
 * Enables multiple agents to work together on complex tasks
 */

import { EventEmitter } from "events";
import { BaseMemoryStore } from "../../memory/store";
import { AgentTelemetry } from "../../core/telemetry";
import { logger } from "../../core/logger";
import { ValidationError } from "../../core/exceptions";

export interface AgentMessage {
  id: string;
  from: string;
  to: string | string[];
  type: "request" | "response" | "broadcast" | "delegate" | "handoff" | "heartbeat" | "discovery";
  content: any;
  timestamp: number;
  priority?: "low" | "normal" | "high" | "urgent";
  metadata?: Record<string, any>;
  correlationId?: string;
  expiresAt?: number;
  signature?: string;
}

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  reasoningPatterns: string[];
  specialties: string[];
  performance?: {
    avgResponseTime: number;
    successRate: number;
    taskComplexity: number;
  };
}

export interface AgentProfile {
  id: string;
  name: string;
  type: string;
  capabilities: AgentCapability[];
  status: "active" | "busy" | "offline";
  currentLoad: number;
  maxConcurrentTasks: number;
  metadata?: Record<string, any>;
}

export interface TeamConfig {
  name: string;
  description?: string;
  maxConcurrentTasks?: number;
  loadBalancingStrategy?: "round_robin" | "least_loaded" | "capability_based" | "performance_based";
  communicationProtocol?: "direct" | "brokered" | "pub_sub";
  enableMonitoring?: boolean;
}

export class AgentTeam extends EventEmitter {
  private agents: Map<string, AgentProfile> = new Map();
  private messageQueue: AgentMessage[] = [];
  private activeTasks: Map<string, any> = new Map();
  private config: Required<TeamConfig>;
  private memory: BaseMemoryStore;
  private telemetry?: AgentTelemetry;

  constructor(
    config: TeamConfig,
    memory: BaseMemoryStore,
    telemetry?: AgentTelemetry
  ) {
    super();
    this.config = {
      name: config.name,
      description: config.description || "",
      maxConcurrentTasks: config.maxConcurrentTasks ?? 10,
      loadBalancingStrategy: config.loadBalancingStrategy ?? "capability_based",
      communicationProtocol: config.communicationProtocol ?? "direct",
      enableMonitoring: config.enableMonitoring ?? true,
    };
    this.memory = memory;
    this.telemetry = telemetry;
  }

  /**
   * Register an agent with the team
   */
  registerAgent(profile: AgentProfile): void {
    if (!profile.id || !profile.name) {
      throw new ValidationError("AgentTeam", "Agent profile must have id and name");
    }

    this.agents.set(profile.id, profile);
    this.emit("agentRegistered", profile);
    logger.info(`Agent ${profile.name} (${profile.id}) registered with team ${this.config.name}`);
  }

  /**
   * Unregister an agent from the team
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      this.emit("agentUnregistered", agent);
      logger.info(`Agent ${agent.name} (${agentId}) unregistered from team ${this.config.name}`);
    }
  }

  /**
   * Send a message between agents
   */
  async sendMessage(message: AgentMessage): Promise<void> {
    if (!message.id) {
      message.id = this.generateMessageId();
    }
    message.timestamp = Date.now();

    if (this.config.communicationProtocol === "direct") {
      await this.sendDirectMessage(message);
    } else {
      await this.queueMessage(message);
    }

    this.emit("messageSent", message);
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(
    from: string,
    type: AgentMessage["type"],
    content: any,
    priority?: AgentMessage["priority"]
  ): Promise<void> {
    const message: AgentMessage = {
      id: this.generateMessageId(),
      from,
      to: Array.from(this.agents.keys()).filter(id => id !== from),
      type,
      content,
      timestamp: Date.now(),
      priority
    };

    await this.sendMessage(message);
  }

  /**
   * Delegate a task to the best available agent
   */
  async delegateTask(
    from: string,
    task: any,
    requirements?: {
      capabilities?: string[];
      reasoningPattern?: string;
      maxResponseTime?: number;
    }
  ): Promise<string> {
    const bestAgent = this.selectBestAgent(requirements);
    
    if (!bestAgent) {
      throw new Error("No suitable agent available for task delegation");
    }

    const message: AgentMessage = {
      id: this.generateMessageId(),
      from,
      to: bestAgent.id,
      type: "delegate",
      content: task,
      timestamp: Date.now(),
      priority: "normal",
      metadata: { requirements }
    };

    await this.sendMessage(message);
    this.activeTasks.set(message.id, {
      assignedTo: bestAgent.id,
      status: "delegated",
      delegatedAt: Date.now()
    });

    return message.id;
  }

  /**
   * Hand off a task from one agent to another
   */
  async handoffTask(
    taskId: string,
    fromAgent: string,
    toAgent: string,
    reason?: string
  ): Promise<void> {
    const task = this.activeTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const message: AgentMessage = {
      id: this.generateMessageId(),
      from: fromAgent,
      to: toAgent,
      type: "handoff",
      content: { taskId, taskData: task, reason },
      timestamp: Date.now(),
      priority: "high"
    };

    await this.sendMessage(message);
    task.assignedTo = toAgent;
    task.status = "handed_off";
    task.handoffAt = Date.now();
  }

  /**
   * Get the best agent for a task based on requirements
   */
  private selectBestAgent(requirements?: {
    capabilities?: string[];
    reasoningPattern?: string;
    maxResponseTime?: number;
  }): AgentProfile | null {
    const availableAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === "active")
      .filter(agent => agent.currentLoad < agent.maxConcurrentTasks);

    if (availableAgents.length === 0) {
      return null;
    }

    // Filter by capability requirements
    let candidates = availableAgents;
    if (requirements?.capabilities?.length) {
      candidates = candidates.filter(agent =>
        requirements.capabilities!.some(cap =>
          agent.capabilities.some(ac => ac.name === cap)
        )
      );
    }

    // Filter by reasoning pattern
    if (requirements?.reasoningPattern) {
      candidates = candidates.filter(agent =>
        agent.capabilities.some(ac =>
          ac.reasoningPatterns.includes(requirements.reasoningPattern!)
        )
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    // Select based on load balancing strategy
    switch (this.config.loadBalancingStrategy) {
      case "least_loaded":
        return candidates.reduce((best, current) =>
          current.currentLoad < best.currentLoad ? current : best
        );

      case "performance_based":
        return candidates.reduce((best, current) => {
          const bestScore = this.calculatePerformanceScore(best);
          const currentScore = this.calculatePerformanceScore(current);
          return currentScore > bestScore ? current : best;
        });

      case "capability_based":
      default:
        // Select agent with most matching capabilities
        return candidates.reduce((best, current) => {
          const bestMatches = this.countCapabilityMatches(best, requirements);
          const currentMatches = this.countCapabilityMatches(current, requirements);
          return currentMatches > bestMatches ? current : best;
        });
    }
  }

  /**
   * Calculate performance score for an agent
   */
  private calculatePerformanceScore(agent: AgentProfile): number {
    let score = 0;
    
    for (const capability of agent.capabilities) {
      if (capability.performance) {
        score += (
          (1 / capability.performance.avgResponseTime) * 0.3 +
          capability.performance.successRate * 0.4 +
          capability.performance.taskComplexity * 0.3
        );
      }
    }

    // Factor in current load
    const loadFactor = 1 - (agent.currentLoad / agent.maxConcurrentTasks);
    score *= loadFactor;

    return score;
  }

  /**
   * Count how many capabilities match requirements
   */
  private countCapabilityMatches(
    agent: AgentProfile,
    requirements?: { capabilities?: string[] }
  ): number {
    if (!requirements?.capabilities?.length) return 0;
    
    return agent.capabilities.filter(cap =>
      requirements.capabilities!.includes(cap.name)
    ).length;
  }

  /**
   * Send direct message to agent(s)
   */
  private async sendDirectMessage(message: AgentMessage): Promise<void> {
    const targets = Array.isArray(message.to) ? message.to : [message.to];
    
    for (const targetId of targets) {
      const agent = this.agents.get(targetId);
      if (agent && agent.status === "active") {
        this.emit("messageReceived", { ...message, to: targetId });
        
        // Update agent load
        if (message.type === "delegate") {
          agent.currentLoad++;
          this.emit("agentLoadChanged", agent);
        }
      }
    }
  }

  /**
   * Queue message for brokered communication
   */
  private async queueMessage(message: AgentMessage): Promise<void> {
    this.messageQueue.push(message);
    
    // Process queue asynchronously
    setImmediate(() => this.processMessageQueue());
  }

  /**
   * Process the message queue
   */
  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.sendDirectMessage(message);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get team statistics
   */
  getTeamStats(): {
    totalAgents: number;
    activeAgents: number;
    busyAgents: number;
    offlineAgents: number;
    totalCapacity: number;
    usedCapacity: number;
    activeTasks: number;
  } {
    const agents = Array.from(this.agents.values());
    
    return {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === "active").length,
      busyAgents: agents.filter(a => a.status === "busy").length,
      offlineAgents: agents.filter(a => a.status === "offline").length,
      totalCapacity: agents.reduce((sum, a) => sum + a.maxConcurrentTasks, 0),
      usedCapacity: agents.reduce((sum, a) => sum + a.currentLoad, 0),
      activeTasks: this.activeTasks.size
    };
  }

  /**
   * Get all agent profiles
   */
  getAgents(): AgentProfile[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get specific agent profile
   */
  getAgent(agentId: string): AgentProfile | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentProfile["status"]): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      this.emit("agentStatusChanged", agent);
    }
  }

  /**
   * Update agent load
   */
  updateAgentLoad(agentId: string, load: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentLoad = Math.max(0, Math.min(load, agent.maxConcurrentTasks));
      this.emit("agentLoadChanged", agent);
    }
  }

  /**
   * Complete a task
   */
  completeTask(taskId: string, result?: any): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      const agent = this.agents.get(task.assignedTo);
      if (agent) {
        agent.currentLoad = Math.max(0, agent.currentLoad - 1);
        this.emit("agentLoadChanged", agent);
      }
      
      this.activeTasks.delete(taskId);
      this.emit("taskCompleted", { taskId, result });
    }
  }

  /**
   * Get configuration
   */
  getConfig(): TeamConfig {
    return { ...this.config };
  }
}
