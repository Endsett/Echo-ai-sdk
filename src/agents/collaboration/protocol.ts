/**
 * Agent Communication Protocol
 * Defines standardized message formats and communication patterns
 */

import { z } from "zod";
import { AgentMessage } from "./agent-team";

// Message schema definitions
export const MessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.union([z.string(), z.array(z.string())]),
  type: z.enum(["request", "response", "broadcast", "delegate", "handoff", "heartbeat", "discovery"]),
  content: z.any(),
  timestamp: z.number(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  metadata: z.record(z.any()).optional(),
  correlationId: z.string().optional(),
  expiresAt: z.number().optional(),
  signature: z.string().optional()
});

export type ValidatedMessage = z.infer<typeof MessageSchema>;

// Protocol-specific message types
export interface TaskRequest {
  taskId: string;
  taskType: string;
  payload: any;
  requirements?: {
    capabilities?: string[];
    maxResponseTime?: number;
    securityLevel?: "low" | "medium" | "high";
  };
}

export interface TaskResponse {
  taskId: string;
  status: "accepted" | "rejected" | "completed" | "failed";
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface AgentDiscovery {
  agentId: string;
  capabilities: string[];
  status: "available" | "busy" | "offline";
  load: {
    current: number;
    maximum: number;
  };
  metadata?: Record<string, any>;
}

export interface HandoffRequest {
  taskId: string;
  reason: string;
  context: any;
  targetCapabilities?: string[];
}

export interface Heartbeat {
  agentId: string;
  status: string;
  timestamp: number;
  metrics?: {
    cpuUsage?: number;
    memoryUsage?: number;
    activeTasks?: number;
    queueSize?: number;
  };
}

// Communication patterns
export interface CommunicationPattern {
  name: string;
  description: string;
  messageFlow: string[];
  requirements: string[];
  useCases: string[];
}

export const COMMUNICATION_PATTERNS: CommunicationPattern[] = [
  {
    name: "Request-Response",
    description: "Direct synchronous communication between two agents",
    messageFlow: ["request", "response"],
    requirements: ["direct_addressing"],
    useCases: ["simple queries", "state requests", "configuration updates"]
  },
  {
    name: "Publish-Subscribe",
    description: "Asynchronous broadcasting to multiple subscribers",
    messageFlow: ["broadcast"],
    requirements: ["topic_routing", "message_filtering"],
    useCases: ["event notifications", "status updates", "alerts"]
  },
  {
    name: "Delegate-Return",
    description: "Task delegation with result return",
    messageFlow: ["delegate", "response"],
    requirements: ["task_tracking", "load_balancing"],
    useCases: ["work distribution", "specialized processing"]
  },
  {
    name: "Handoff-Chain",
    description: "Sequential task handoffs between agents",
    messageFlow: ["delegate", "handoff", "response"],
    requirements: ["state_preservation", "context_transfer"],
    useCases: ["multi-stage processing", "workflow steps"]
  }
];

// Message routing and filtering
export interface MessageFilter {
  type?: string[];
  from?: string[];
  to?: string[];
  priority?: string[];
  contentSchema?: z.ZodSchema;
  custom?: (message: AgentMessage) => boolean;
}

export interface RoutingRule {
  id: string;
  condition: (message: AgentMessage) => boolean;
  action: "forward" | "block" | "transform" | "log";
  target?: string;
  transform?: (message: AgentMessage) => AgentMessage;
}

// Security and authentication
export interface SecurityContext {
  agentId: string;
  credentials: {
    type: "token" | "certificate" | "shared_secret";
    value: string;
    expires?: number;
  };
  permissions: string[];
  trustLevel: "low" | "medium" | "high";
}

export interface MessageSecurity {
  encrypt: boolean;
  sign: boolean;
  validateSignature: boolean;
  allowedSenders?: string[];
  requiredPermissions?: string[];
}

// Quality of Service
export interface QoS {
  deliveryGuarantee: "at_most_once" | "at_least_once" | "exactly_once";
  maxLatency?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
    maxDelayMs: number;
  };
  priority: 0 | 1 | 2 | 3; // 0 = lowest, 3 = highest
}

// Protocol implementation
export class AgentProtocol {
  private static instance: AgentProtocol;
  private routingRules: Map<string, RoutingRule> = new Map();
  private securityContexts: Map<string, SecurityContext> = new Map();
  private messageFilters: MessageFilter[] = [];

  private constructor() {}

  static getInstance(): AgentProtocol {
    if (!AgentProtocol.instance) {
      AgentProtocol.instance = new AgentProtocol();
    }
    return AgentProtocol.instance;
  }

  /**
   * Validate a message against the protocol schema
   */
  validateMessage(message: any): ValidatedMessage {
    return MessageSchema.parse(message);
  }

  /**
   * Add a routing rule
   */
  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.set(rule.id, rule);
  }

  /**
   * Remove a routing rule
   */
  removeRoutingRule(ruleId: string): void {
    this.routingRules.delete(ruleId);
  }

  /**
   * Apply routing rules to a message
   */
  applyRouting(message: AgentMessage): {
    action: "forward" | "block" | "transform" | "log";
    transformedMessage?: AgentMessage;
    target?: string;
  } {
    for (const rule of this.routingRules.values()) {
      if (rule.condition(message)) {
        if (rule.action === "transform" && rule.transform) {
          return {
            action: "transform",
            transformedMessage: rule.transform(message),
            target: rule.target
          };
        }
        return {
          action: rule.action,
          target: rule.target
        };
      }
    }

    return { action: "forward" };
  }

  /**
   * Add message filter
   */
  addMessageFilter(filter: MessageFilter): void {
    this.messageFilters.push(filter);
  }

  /**
   * Check if message passes all filters
   */
  passesFilters(message: AgentMessage): boolean {
    return this.messageFilters.every(filter => {
      // Type filter
      if (filter.type && !filter.type.includes(message.type)) {
        return false;
      }

      // From filter
      if (filter.from && !filter.from.includes(message.from)) {
        return false;
      }

      // To filter
      if (filter.to) {
        const targets = Array.isArray(message.to) ? message.to : [message.to];
        if (!targets.some(t => filter.to!.includes(t))) {
          return false;
        }
      }

      // Priority filter
      if (filter.priority && message.priority && !filter.priority.includes(message.priority)) {
        return false;
      }

      // Content schema filter
      if (filter.contentSchema) {
        try {
          filter.contentSchema.parse(message.content);
        } catch {
          return false;
        }
      }

      // Custom filter
      if (filter.custom && !filter.custom(message)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Register security context for an agent
   */
  registerSecurityContext(context: SecurityContext): void {
    this.securityContexts.set(context.agentId, context);
  }

  /**
   * Authenticate a message
   */
  authenticateMessage(message: AgentMessage, security: MessageSecurity): boolean {
    // Check allowed senders
    if (security.allowedSenders && !security.allowedSenders.includes(message.from)) {
      return false;
    }

    // Check permissions
    if (security.requiredPermissions) {
      const context = this.securityContexts.get(message.from);
      if (!context || !security.requiredPermissions.every(p => context.permissions.includes(p))) {
        return false;
      }
    }

    // Validate signature if required
    if (security.validateSignature && message.signature) {
      // TODO: Implement signature validation
      return true;
    }

    return true;
  }

  /**
   * Create a standardized task request
   */
  createTaskRequest(
    from: string,
    to: string | string[],
    task: TaskRequest,
    priority?: AgentMessage["priority"]
  ): AgentMessage {
    return {
      id: this.generateMessageId(),
      from,
      to,
      type: "delegate",
      content: task,
      timestamp: Date.now(),
      priority,
      correlationId: task.taskId
    };
  }

  /**
   * Create a task response
   */
  createTaskResponse(
    from: string,
    to: string,
    originalMessage: AgentMessage,
    response: TaskResponse
  ): AgentMessage {
    return {
      id: this.generateMessageId(),
      from,
      to,
      type: "response",
      content: response,
      timestamp: Date.now(),
      correlationId: originalMessage.correlationId
    };
  }

  /**
   * Create a discovery message
   */
  createDiscoveryMessage(
    from: string,
    discovery: AgentDiscovery
  ): AgentMessage {
    return {
      id: this.generateMessageId(),
      from,
      to: "broadcast",
      type: "discovery",
      content: discovery,
      timestamp: Date.now()
    };
  }

  /**
   * Create a heartbeat message
   */
  createHeartbeat(
    from: string,
    heartbeat: Heartbeat
  ): AgentMessage {
    return {
      id: this.generateMessageId(),
      from,
      to: "broadcast",
      type: "heartbeat",
      content: heartbeat,
      timestamp: Date.now()
    };
  }

  /**
   * Create a handoff request
   */
  createHandoffRequest(
    from: string,
    to: string,
    handoff: HandoffRequest
  ): AgentMessage {
    return {
      id: this.generateMessageId(),
      from,
      to,
      type: "handoff",
      content: handoff,
      timestamp: Date.now(),
      priority: "high",
      correlationId: handoff.taskId
    };
  }

  /**
   * Apply QoS settings to a message
   */
  applyQoS(message: AgentMessage, qos: QoS): AgentMessage {
    const updated = { ...message };
    
    // Set priority
    updated.priority = this.qosToPriority(qos.priority);
    
    // Set expiration for latency requirements
    if (qos.maxLatency) {
      updated.expiresAt = Date.now() + qos.maxLatency;
    }

    // Add retry policy to metadata
    if (qos.retryPolicy) {
      updated.metadata = {
        ...updated.metadata,
        retryPolicy: qos.retryPolicy,
        deliveryGuarantee: qos.deliveryGuarantee
      };
    }

    return updated;
  }

  /**
   * Convert QoS priority to message priority
   */
  private qosToPriority(qosPriority: number): AgentMessage["priority"] {
    switch (qosPriority) {
      case 3: return "urgent";
      case 2: return "high";
      case 1: return "normal";
      case 0: return "low";
      default: return "normal";
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all communication patterns
   */
  getCommunicationPatterns(): CommunicationPattern[] {
    return COMMUNICATION_PATTERNS;
  }

  /**
   * Get routing rules
   */
  getRoutingRules(): RoutingRule[] {
    return Array.from(this.routingRules.values());
  }

  /**
   * Clear all routing rules and filters
   */
  clear(): void {
    this.routingRules.clear();
    this.securityContexts.clear();
    this.messageFilters = [];
  }
}

// Export singleton instance
export const agentProtocol = AgentProtocol.getInstance();
