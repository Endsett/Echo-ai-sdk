/**
 * Agent Orchestrator - Coordinates multiple agents and manages complex workflows
 * Implements various orchestration patterns for multi-agent systems
 */

import { EventEmitter } from "events";
import { BaseMemoryStore } from "../../memory/store";
import { AgentTelemetry } from "../../core/telemetry";
import { logger } from "../../core/logger";
import { ValidationError } from "../../core/exceptions";
import { AgentTeam, AgentProfile, AgentMessage } from "./agent-team";

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  agentType?: string;
  agentId?: string;
  requiredCapabilities: string[];
  inputSchema?: any;
  outputSchema?: any;
  parallelizable?: boolean;
  dependencies?: string[];
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  orchestrationPattern: "sequential" | "parallel" | "pipeline" | "map_reduce" | "dynamic";
  errorHandling: "fail_fast" | "continue_on_error" | "retry_with_fallback";
  metadata?: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startTime: number;
  endTime?: number;
  currentStep?: string;
  results: Map<string, any>;
  errors: Array<{ stepId: string; error: Error; timestamp: number }>;
  context: Record<string, any>;
}

export interface OrchestrationConfig {
  maxConcurrentWorkflows?: number;
  defaultTimeout?: number;
  enableMonitoring?: boolean;
  persistenceEnabled?: boolean;
  checkpointInterval?: number;
}

export class AgentOrchestrator extends EventEmitter {
  private teams: Map<string, AgentTeam> = new Map();
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private config: Required<OrchestrationConfig>;
  private memory: BaseMemoryStore;
  private telemetry?: AgentTelemetry;

  constructor(
    config: OrchestrationConfig = {},
    memory: BaseMemoryStore,
    telemetry?: AgentTelemetry
  ) {
    super();
    this.config = {
      maxConcurrentWorkflows: config.maxConcurrentWorkflows ?? 10,
      defaultTimeout: config.defaultTimeout ?? 30000,
      enableMonitoring: config.enableMonitoring ?? true,
      persistenceEnabled: config.persistenceEnabled ?? true,
      checkpointInterval: config.checkpointInterval ?? 5000,
    };
    this.memory = memory;
    this.telemetry = telemetry;

    // Start checkpoint timer if enabled
    if (this.config.checkpointInterval > 0) {
      setInterval(() => this.saveCheckpoints(), this.config.checkpointInterval);
    }
  }

  /**
   * Register an agent team
   */
  registerTeam(team: AgentTeam): void {
    this.teams.set(team.getConfig().name, team);
    
    // Forward team events
    team.on("messageReceived", this.handleAgentMessage.bind(this));
    team.on("taskCompleted", this.handleTaskCompletion.bind(this));
    
    this.emit("teamRegistered", team);
    logger.info(`Team ${team.getConfig().name} registered with orchestrator`);
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.validateWorkflow(workflow);
    this.workflows.set(workflow.id, workflow);
    this.emit("workflowRegistered", workflow);
    logger.info(`Workflow ${workflow.name} (${workflow.id}) registered`);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    input: any,
    context: Record<string, any> = {},
    teamName?: string
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const execution: WorkflowExecution = {
      id: this.generateExecutionId(),
      workflowId,
      status: "pending",
      startTime: Date.now(),
      results: new Map(),
      errors: [],
      context: { ...context, input }
    };

    this.executions.set(execution.id, execution);
    this.emit("workflowStarted", execution);

    try {
      execution.status = "running";
      
      switch (workflow.orchestrationPattern) {
        case "sequential":
          await this.executeSequential(execution, workflow, teamName);
          break;
        case "parallel":
          await this.executeParallel(execution, workflow, teamName);
          break;
        case "pipeline":
          await this.executePipeline(execution, workflow, teamName);
          break;
        case "map_reduce":
          await this.executeMapReduce(execution, workflow, teamName);
          break;
        case "dynamic":
          await this.executeDynamic(execution, workflow, teamName);
          break;
      }

      execution.status = "completed";
      execution.endTime = Date.now();
      this.emit("workflowCompleted", execution);
      
      return execution.id;
    } catch (error: any) {
      execution.status = "failed";
      execution.endTime = Date.now();
      this.emit("workflowFailed", execution);
      throw error;
    }
  }

  /**
   * Execute workflow steps sequentially
   */
  private async executeSequential(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    teamName?: string
  ): Promise<void> {
    for (const step of workflow.steps) {
      execution.currentStep = step.id;
      
      try {
        const result = await this.executeStep(execution, step, teamName);
        execution.results.set(step.id, result);
      } catch (error: any) {
        if (workflow.errorHandling === "fail_fast") {
          throw error;
        } else {
          execution.errors.push({
            stepId: step.id,
            error,
            timestamp: Date.now()
          });
        }
      }
    }
  }

  /**
   * Execute workflow steps in parallel
   */
  private async executeParallel(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    teamName?: string
  ): Promise<void> {
    const promises = workflow.steps.map(async (step) => {
      execution.currentStep = step.id;
      
      try {
        const result = await this.executeStep(execution, step, teamName);
        execution.results.set(step.id, result);
        return { stepId: step.id, result };
      } catch (error: any) {
        if (workflow.errorHandling === "fail_fast") {
          throw error;
        } else {
          execution.errors.push({
            stepId: step.id,
            error,
            timestamp: Date.now()
          });
          return { stepId: step.id, error };
        }
      }
    });

    await Promise.all(promises);
  }

  /**
   * Execute workflow as a pipeline (output of one step feeds into next)
   */
  private async executePipeline(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    teamName?: string
  ): Promise<void> {
    let pipelineData = execution.context.input;

    for (const step of workflow.steps) {
      execution.currentStep = step.id;
      
      const stepInput = { ...execution.context, pipelineData };
      const result = await this.executeStep(execution, step, teamName, stepInput);
      execution.results.set(step.id, result);
      pipelineData = result;
    }
  }

  /**
   * Execute Map-Reduce pattern
   */
  private async executeMapReduce(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    teamName?: string
  ): Promise<void> {
    // Separate map and reduce steps
    const mapSteps = workflow.steps.filter(s => s.name.toLowerCase().includes("map"));
    const reduceSteps = workflow.steps.filter(s => s.name.toLowerCase().includes("reduce"));

    // Execute map steps in parallel
    const mapResults = await Promise.all(
      mapSteps.map(async (step) => {
        const result = await this.executeStep(execution, step, teamName);
        return { stepId: step.id, result };
      })
    );

    // Combine map results
    const combinedData = mapResults.reduce((acc, curr) => {
      acc[curr.stepId] = curr.result;
      return acc;
    }, {} as Record<string, any>);

    // Execute reduce steps with combined data
    for (const step of reduceSteps) {
      const reduceInput = { ...execution.context, mapResults: combinedData };
      const result = await this.executeStep(execution, step, teamName, reduceInput);
      execution.results.set(step.id, result);
    }
  }

  /**
   * Execute workflow with dynamic agent selection
   */
  private async executeDynamic(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    teamName?: string
  ): Promise<void> {
    for (const step of workflow.steps) {
      execution.currentStep = step.id;
      
      // Dynamically select best agent for each step
      const team = teamName ? this.teams.get(teamName) : this.getDefaultTeam();
      if (!team) {
        throw new Error(`No team available for dynamic execution`);
      }

      // Select agent based on step requirements
      const bestAgent = team.getAgents().find(agent =>
        agent.capabilities.some(cap =>
          step.requiredCapabilities.includes(cap.name)
        )
      );

      if (!bestAgent) {
        throw new Error(`No agent found for step ${step.id} with required capabilities`);
      }

      const result = await this.executeStep(execution, step, teamName, undefined, bestAgent.id);
      execution.results.set(step.id, result);
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    execution: WorkflowExecution,
    step: WorkflowStep,
    teamName?: string,
    input?: any,
    agentId?: string
  ): Promise<any> {
    const team = teamName ? this.teams.get(teamName) : this.getDefaultTeam();
    if (!team) {
      throw new Error(`No team available for step execution`);
    }

    const taskId = await team.delegateTask(
      "orchestrator",
      {
        stepId: step.id,
        stepName: step.name,
        input: input || execution.context,
        workflowExecutionId: execution.id
      },
      {
        capabilities: step.requiredCapabilities,
        maxResponseTime: step.timeout || this.config.defaultTimeout
      }
    );

    // Wait for task completion
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Step ${step.id} timed out`));
      }, step.timeout || this.config.defaultTimeout);

      const onTaskCompleted = (event: any) => {
        if (event.taskId === taskId) {
          clearTimeout(timeout);
          team.off("taskCompleted", onTaskCompleted);
          resolve(event.result);
        }
      };

      team.on("taskCompleted", onTaskCompleted);
    });
  }

  /**
   * Handle incoming agent messages
   */
  private async handleAgentMessage(message: AgentMessage): Promise<void> {
    // Route message based on type and content
    switch (message.type) {
      case "response":
        // Handle workflow step responses
        if (message.content?.workflowExecutionId) {
          const execution = this.executions.get(message.content.workflowExecutionId);
          if (execution) {
            this.emit("stepResponse", { execution, message });
          }
        }
        break;
      
      case "handoff":
        // Handle task handoffs between agents
        await this.handleHandoff(message);
        break;
    }
  }

  /**
   * Handle task handoffs
   */
  private async handleHandoff(message: AgentMessage): Promise<void> {
    const { taskId, taskData, reason } = message.content;
    
    // Find the team and update task assignment
    for (const team of this.teams.values()) {
      const agents = team.getAgents();
      const fromAgent = agents.find(a => a.id === message.from);
      const toAgent = agents.find(a => a.id === (message.to as string));
      
      if (fromAgent && toAgent) {
        // Update loads
        team.updateAgentLoad(message.from, fromAgent.currentLoad - 1);
        team.updateAgentLoad(message.to as string, toAgent.currentLoad + 1);
        
        this.emit("taskHandedOff", {
          taskId,
          from: message.from,
          to: message.to,
          reason
        });
        
        logger.info(`Task ${taskId} handed off from ${message.from} to ${message.to}: ${reason}`);
        break;
      }
    }
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompletion(event: any): Promise<void> {
    const { taskId, result } = event;
    
    // Find and update the execution
    for (const execution of this.executions.values()) {
      if (execution.currentStep && result?.stepId === execution.currentStep) {
        execution.results.set(result.stepId, result);
        this.emit("stepCompleted", { execution, stepId: result.stepId, result });
        break;
      }
    }
  }

  /**
   * Validate workflow definition
   */
  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.id || !workflow.name || !workflow.steps.length) {
      throw new ValidationError("Workflow", "Invalid workflow definition");
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const step of workflow.steps) {
      if (this.hasCircularDependency(step, workflow, visited, recursionStack)) {
        throw new ValidationError("Workflow", `Circular dependency detected for step ${step.id}`);
      }
    }
  }

  /**
   * Check for circular dependencies in workflow steps
   */
  private hasCircularDependency(
    step: WorkflowStep,
    workflow: WorkflowDefinition,
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
    if (recursionStack.has(step.id)) {
      return true;
    }

    if (visited.has(step.id)) {
      return false;
    }

    visited.add(step.id);
    recursionStack.add(step.id);

    if (step.dependencies) {
      for (const depId of step.dependencies) {
        const depStep = workflow.steps.find(s => s.id === depId);
        if (depStep && this.hasCircularDependency(depStep, workflow, visited, recursionStack)) {
          return true;
        }
      }
    }

    recursionStack.delete(step.id);
    return false;
  }

  /**
   * Save checkpoints for running executions
   */
  private async saveCheckpoints(): Promise<void> {
    if (!this.config.persistenceEnabled) return;

    const runningExecutions = Array.from(this.executions.values())
      .filter(e => e.status === "running");

    for (const execution of runningExecutions) {
      await this.memory.addMessage(
        `checkpoint_${execution.id}`,
        {
          role: "system",
          content: JSON.stringify({
            type: "checkpoint",
            execution,
            timestamp: Date.now()
          })
        }
      );
    }
  }

  /**
   * Get default team
   */
  private getDefaultTeam(): AgentTeam | undefined {
    return this.teams.values().next().value;
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get workflow execution status
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get all workflow executions
   */
  getExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Cancel a workflow execution
   */
  cancelExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === "running") {
      execution.status = "cancelled";
      execution.endTime = Date.now();
      this.emit("workflowCancelled", execution);
    }
  }

  /**
   * Get workflow definition
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflow definitions
   */
  getWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get orchestration statistics
   */
  getStats(): {
    totalTeams: number;
    totalWorkflows: number;
    runningExecutions: number;
    completedExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  } {
    const executions = Array.from(this.executions.values());
    const completedExecutions = executions.filter(e => e.status === "completed");
    
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.endTime! - e.startTime), 0) / completedExecutions.length
      : 0;

    return {
      totalTeams: this.teams.size,
      totalWorkflows: this.workflows.size,
      runningExecutions: executions.filter(e => e.status === "running").length,
      completedExecutions: completedExecutions.length,
      failedExecutions: executions.filter(e => e.status === "failed").length,
      averageExecutionTime
    };
  }
}
