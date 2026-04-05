/**
 * Multi-Agent Collaboration Module
 * Exports all collaboration and orchestration components
 */

// Core collaboration components
export { AgentTeam } from "./agent-team";
export type {
  AgentMessage,
  AgentCapability,
  AgentProfile,
  TeamConfig
} from "./agent-team";

// Orchestration system
export { AgentOrchestrator } from "./orchestrator";
export type {
  WorkflowStep,
  WorkflowDefinition,
  WorkflowExecution,
  OrchestrationConfig
} from "./orchestrator";

// Communication protocol
export { AgentProtocol, agentProtocol } from "./protocol";
export type {
  ValidatedMessage,
  TaskRequest,
  TaskResponse,
  AgentDiscovery,
  HandoffRequest,
  Heartbeat,
  CommunicationPattern,
  MessageFilter,
  RoutingRule,
  SecurityContext,
  MessageSecurity,
  QoS
} from "./protocol";

// Dynamic agent selection
export { DynamicAgentSelector } from "./selector";
export type {
  SelectionCriteria,
  AgentScore,
  SelectionStrategy
} from "./selector";
