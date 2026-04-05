/**
 * Dynamic Agent Selection System
 * Intelligently selects the best agent for tasks based on multiple factors
 */

import { AgentProfile } from "./agent-team";
import { logger } from "../../core/logger";

export interface SelectionCriteria {
  taskType?: string;
  requiredCapabilities?: string[];
  reasoningPattern?: string;
  maxResponseTime?: number;
  priority?: "low" | "normal" | "high" | "urgent";
  costLimit?: number;
  securityLevel?: "low" | "medium" | "high";
  specialization?: string;
  excludeAgents?: string[];
  preferAgents?: string[];
}

export interface AgentScore {
  agentId: string;
  score: number;
  factors: {
    capabilityMatch: number;
    performance: number;
    availability: number;
    cost: number;
    specialization: number;
    load: number;
  };
  reasoning: string;
}

export interface SelectionStrategy {
  name: string;
  description: string;
  score: (agent: AgentProfile, criteria: SelectionCriteria) => number;
  weight: number;
}

export class DynamicAgentSelector {
  private strategies: Map<string, SelectionStrategy> = new Map();
  private performanceHistory: Map<string, {
    avgResponseTime: number;
    successRate: number;
    taskCount: number;
    lastUpdated: number;
  }> = new Map();

  constructor() {
    this.initializeDefaultStrategies();
  }

  /**
   * Select the best agent for a task
   */
  selectAgent(
    agents: AgentProfile[],
    criteria: SelectionCriteria,
    strategyName?: string
  ): AgentScore | null {
    // Filter available agents
    const candidates = this.filterCandidates(agents, criteria);
    
    if (candidates.length === 0) {
      logger.warn("No agents available for selection");
      return null;
    }

    // Score each candidate
    const scores = candidates.map(agent => 
      this.scoreAgent(agent, criteria, strategyName)
    );

    // Sort by score (descending)
    scores.sort((a, b) => b.score - a.score);

    // Return the best match
    return scores[0];
  }

  /**
   * Select multiple agents for parallel execution
   */
  selectAgents(
    agents: AgentProfile[],
    criteria: SelectionCriteria,
    count: number,
    strategyName?: string
  ): AgentScore[] {
    const candidates = this.filterCandidates(agents, criteria);
    
    if (candidates.length === 0) {
      return [];
    }

    const scores = candidates.map(agent => 
      this.scoreAgent(agent, criteria, strategyName)
    );

    scores.sort((a, b) => b.score - a.score);
    
    return scores.slice(0, Math.min(count, scores.length));
  }

  /**
   * Filter agents based on basic criteria
   */
  private filterCandidates(agents: AgentProfile[], criteria: SelectionCriteria): AgentProfile[] {
    return agents.filter(agent => {
      // Check status
      if (agent.status !== "active") {
        return false;
      }

      // Check exclusions
      if (criteria.excludeAgents?.includes(agent.id)) {
        return false;
      }

      // Check capacity
      if (agent.currentLoad >= agent.maxConcurrentTasks) {
        return false;
      }

      // Check required capabilities
      if (criteria.requiredCapabilities?.length) {
        const hasCapability = criteria.requiredCapabilities.every(cap =>
          agent.capabilities.some(ac => ac.name === cap)
        );
        if (!hasCapability) return false;
      }

      // Check reasoning pattern
      if (criteria.reasoningPattern) {
        const hasPattern = agent.capabilities.some(ac =>
          ac.reasoningPatterns.includes(criteria.reasoningPattern!)
        );
        if (!hasPattern) return false;
      }

      // Check specialization
      if (criteria.specialization) {
        const hasSpecialization = agent.capabilities.some(ac =>
          ac.specialties.includes(criteria.specialization!)
        );
        if (!hasSpecialization) return false;
      }

      // Check response time requirement
      if (criteria.maxResponseTime) {
        const performance = this.performanceHistory.get(agent.id);
        if (performance && performance.avgResponseTime > criteria.maxResponseTime) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Score an agent based on criteria
   */
  private scoreAgent(
    agent: AgentProfile,
    criteria: SelectionCriteria,
    strategyName?: string
  ): AgentScore {
    const strategy = strategyName 
      ? this.strategies.get(strategyName)
      : this.getDefaultStrategy();

    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    const factors = {
      capabilityMatch: this.calculateCapabilityMatch(agent, criteria),
      performance: this.calculatePerformanceScore(agent),
      availability: this.calculateAvailabilityScore(agent),
      cost: this.calculateCostScore(agent, criteria),
      specialization: this.calculateSpecializationScore(agent, criteria),
      load: this.calculateLoadScore(agent)
    };

    // Apply strategy weights
    let totalScore = strategy.score(agent, criteria);
    
    // Apply preference bonuses
    if (criteria.preferAgents?.includes(agent.id)) {
      totalScore *= 1.2; // 20% bonus
    }

    return {
      agentId: agent.id,
      score: Math.round(totalScore * 100) / 100,
      factors,
      reasoning: this.generateReasoning(agent, criteria, factors)
    };
  }

  /**
   * Calculate capability match score
   */
  private calculateCapabilityMatch(agent: AgentProfile, criteria: SelectionCriteria): number {
    if (!criteria.requiredCapabilities?.length) return 1.0;

    const matchedCapabilities = agent.capabilities.filter(cap =>
      criteria.requiredCapabilities!.includes(cap.name)
    ).length;

    return matchedCapabilities / criteria.requiredCapabilities.length;
  }

  /**
   * Calculate performance score based on history
   */
  private calculatePerformanceScore(agent: AgentProfile): number {
    const history = this.performanceHistory.get(agent.id);
    
    if (!history) {
      // Use agent's reported performance if available
      const agentPerf = agent.capabilities.reduce((acc, cap) => {
        if (cap.performance) {
          acc += cap.performance.successRate;
        }
        return acc;
      }, 0) / (agent.capabilities.length || 1);

      return agentPerf || 0.5; // Default to 0.5 if no performance data
    }

    // Weight success rate more heavily
    return (history.successRate * 0.7 + (1 - history.avgResponseTime / 10000) * 0.3);
  }

  /**
   * Calculate availability score
   */
  private calculateAvailabilityScore(agent: AgentProfile): number {
    const loadRatio = agent.currentLoad / agent.maxConcurrentTasks;
    return 1 - loadRatio; // Higher score for less load
  }

  /**
   * Calculate cost score (lower cost = higher score)
   */
  private calculateCostScore(agent: AgentProfile, criteria: SelectionCriteria): number {
    if (!criteria.costLimit) return 1.0;

    // Assume cost is stored in metadata (implementation dependent)
    const agentCost = agent.metadata?.costPerTask || 0;
    
    if (agentCost > criteria.costLimit) {
      return 0; // Disqualify if over limit
    }

    // Higher score for lower cost
    return 1 - (agentCost / criteria.costLimit);
  }

  /**
   * Calculate specialization score
   */
  private calculateSpecializationScore(agent: AgentProfile, criteria: SelectionCriteria): number {
    if (!criteria.specialization) return 1.0;

    const specializations = agent.capabilities.flatMap(cap => cap.specialties);
    const matchCount = specializations.filter(s => s === criteria.specialization).length;
    
    return Math.min(matchCount / 3, 1.0); // Cap at 1.0
  }

  /**
   * Calculate load score (prefer agents with optimal load)
   */
  private calculateLoadScore(agent: AgentProfile): number {
    const loadRatio = agent.currentLoad / agent.maxConcurrentTasks;
    
    // Optimal load is around 50-70%
    if (loadRatio < 0.5) return 0.8;
    if (loadRatio < 0.7) return 1.0;
    if (loadRatio < 0.9) return 0.6;
    return 0.3;
  }

  /**
   * Generate reasoning for the selection
   */
  private generateReasoning(
    agent: AgentProfile,
    criteria: SelectionCriteria,
    factors: AgentScore["factors"]
  ): string {
    const reasons = [];
    
    if (factors.capabilityMatch > 0.8) {
      reasons.push("Strong capability match");
    }
    
    if (factors.performance > 0.8) {
      reasons.push("Excellent performance history");
    }
    
    if (factors.availability > 0.7) {
      reasons.push("Good availability");
    }
    
    if (factors.specialization > 0.5) {
      reasons.push("Relevant specialization");
    }
    
    if (factors.load > 0.8) {
      reasons.push("Optimal load level");
    }

    if (reasons.length === 0) {
      reasons.push("Meets basic requirements");
    }

    return reasons.join(", ");
  }

  /**
   * Update performance history for an agent
   */
  updatePerformanceHistory(
    agentId: string,
    responseTime: number,
    success: boolean
  ): void {
    const history = this.performanceHistory.get(agentId) || {
      avgResponseTime: 0,
      successRate: 0,
      taskCount: 0,
      lastUpdated: 0
    };

    // Update running averages
    history.taskCount++;
    history.avgResponseTime = 
      (history.avgResponseTime * (history.taskCount - 1) + responseTime) / history.taskCount;
    
    const successCount = Math.round(history.successRate * (history.taskCount - 1)) + (success ? 1 : 0);
    history.successRate = successCount / history.taskCount;
    
    history.lastUpdated = Date.now();
    
    this.performanceHistory.set(agentId, history);
  }

  /**
   * Add a custom selection strategy
   */
  addStrategy(strategy: SelectionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Get all available strategies
   */
  getStrategies(): SelectionStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get default strategy
   */
  private getDefaultStrategy(): SelectionStrategy {
    return this.strategies.get("balanced")!;
  }

  /**
   * Initialize default strategies
   */
  private initializeDefaultStrategies(): void {
    // Balanced strategy - considers all factors equally
    this.strategies.set("balanced", {
      name: "balanced",
      description: "Balanced approach considering all factors equally",
      weight: 1.0,
      score: (agent, criteria) => {
        const selector = this as DynamicAgentSelector;
        return (
          selector.calculateCapabilityMatch(agent, criteria) * 0.25 +
          selector.calculatePerformanceScore(agent) * 0.20 +
          selector.calculateAvailabilityScore(agent) * 0.20 +
          selector.calculateCostScore(agent, criteria) * 0.15 +
          selector.calculateSpecializationScore(agent, criteria) * 0.10 +
          selector.calculateLoadScore(agent) * 0.10
        );
      }
    });

    // Performance-first strategy
    this.strategies.set("performance_first", {
      name: "performance_first",
      description: "Prioritizes agent performance and reliability",
      weight: 1.0,
      score: (agent, criteria) => {
        const selector = this as DynamicAgentSelector;
        return (
          selector.calculatePerformanceScore(agent) * 0.50 +
          selector.calculateCapabilityMatch(agent, criteria) * 0.30 +
          selector.calculateAvailabilityScore(agent) * 0.20
        );
      }
    });

    // Cost-optimized strategy
    this.strategies.set("cost_optimized", {
      name: "cost_optimized",
      description: "Prioritizes lower cost while meeting requirements",
      weight: 1.0,
      score: (agent, criteria) => {
        const selector = this as DynamicAgentSelector;
        return (
          selector.calculateCostScore(agent, criteria) * 0.40 +
          selector.calculateCapabilityMatch(agent, criteria) * 0.30 +
          selector.calculateAvailabilityScore(agent) * 0.30
        );
      }
    });

    // Speed-optimized strategy
    this.strategies.set("speed_optimized", {
      name: "speed_optimized",
      description: "Prioritizes fastest response time",
      weight: 1.0,
      score: (agent, criteria) => {
        const selector = this as DynamicAgentSelector;
        const history = selector.performanceHistory.get(agent.id);
        const speedScore = history 
          ? 1 - (history.avgResponseTime / 10000)
          : 0.5;
        
        return (
          speedScore * 0.50 +
          selector.calculateAvailabilityScore(agent) * 0.30 +
          selector.calculateCapabilityMatch(agent, criteria) * 0.20
        );
      }
    });

    // Load-balancing strategy
    this.strategies.set("load_balanced", {
      name: "load_balanced",
      description: "Distributes tasks evenly across agents",
      weight: 1.0,
      score: (agent, criteria) => {
        const selector = this as DynamicAgentSelector;
        return (
          selector.calculateLoadScore(agent) * 0.50 +
          selector.calculateAvailabilityScore(agent) * 0.30 +
          selector.calculateCapabilityMatch(agent, criteria) * 0.20
        );
      }
    });
  }

  /**
   * Get performance history for all agents
   */
  getPerformanceHistory(): Map<string, {
    avgResponseTime: number;
    successRate: number;
    taskCount: number;
    lastUpdated: number;
  }> {
    return new Map(this.performanceHistory);
  }

  /**
   * Clear performance history
   */
  clearPerformanceHistory(): void {
    this.performanceHistory.clear();
  }

  /**
   * Get agent rankings
   */
  rankAgents(
    agents: AgentProfile[],
    criteria: SelectionCriteria,
    strategyName?: string
  ): AgentScore[] {
    const candidates = this.filterCandidates(agents, criteria);
    
    const scores = candidates.map(agent => 
      this.scoreAgent(agent, criteria, strategyName)
    );

    scores.sort((a, b) => b.score - a.score);
    
    return scores;
  }
}
