/**
 * Multi-Agent Collaboration Examples
 * Demonstrates agent teams, orchestration, and dynamic selection
 */

import {
  EchoAI,
  AgentTeam,
  AgentOrchestrator,
  DynamicAgentSelector,
  EnhancedAgentExecutor,
  ReActAgent,
  CoTAgent,
  OpenAIProvider,
  FileMemoryStore,
  SearchTool,
  CalculatorTool,
  WeatherTool,
  TranslationTool,
  CodeAnalysisTool,
  AIModelGateway,
  AgentProfile,
  WorkflowDefinition,
  SelectionCriteria
} from "../src/index";

// Initialize shared resources
async function initializeSharedResources() {
  const gateway = new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]);
  const memory = new FileMemoryStore("./memory");
  
  return { gateway, memory };
}

// Example 1: Basic Agent Team Setup
async function basicAgentTeam() {
  console.log("=== Basic Agent Team Setup ===\n");
  
  const { gateway, memory } = await initializeSharedResources();
  
  // Create an agent team
  const team = new AgentTeam(
    {
      name: "ResearchTeam",
      description: "Team for research and analysis tasks",
      maxConcurrentTasks: 5,
      loadBalancingStrategy: "capability_based"
    },
    memory
  );

  // Register agents with different capabilities
  const agents = [
    {
      id: "researcher",
      name: "Research Agent",
      type: "ReActAgent",
      capabilities: [
        {
          name: "search",
          description: "Web search capabilities",
          tools: ["search"],
          reasoningPatterns: ["react"],
          specialties: ["research", "fact_checking"],
          performance: { avgResponseTime: 2000, successRate: 0.95, taskComplexity: 0.7 }
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 3
    },
    {
      id: "analyst",
      name: "Analysis Agent",
      type: "CoTAgent",
      capabilities: [
        {
          name: "analysis",
          description: "Data analysis capabilities",
          tools: ["calculator"],
          reasoningPatterns: ["cot"],
          specialties: ["data_analysis", "statistics"],
          performance: { avgResponseTime: 1500, successRate: 0.90, taskComplexity: 0.8 }
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 2
    },
    {
      id: "translator",
      name: "Translation Agent",
      type: "EnhancedAgentExecutor",
      capabilities: [
        {
          name: "translation",
          description: "Language translation",
          tools: ["translation"],
          reasoningPatterns: ["standard"],
          specialties: ["translation", "localization"],
          performance: { avgResponseTime: 1000, successRate: 0.98, taskComplexity: 0.5 }
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 4
    }
  ];

  // Register agents with the team
  agents.forEach(agent => team.registerAgent(agent));
  
  // Display team statistics
  console.log("Team Statistics:");
  console.log(JSON.stringify(team.getTeamStats(), null, 2));
  
  // Listen for team events
  team.on("messageReceived", (message) => {
    console.log(`\n📨 Message from ${message.from} to ${Array.isArray(message.to) ? message.to.join(", ") : message.to}`);
    console.log(`   Type: ${message.type}`);
  });
  
  team.on("agentLoadChanged", (agent) => {
    console.log(`\n⚖️ Agent ${agent.name} load changed: ${agent.currentLoad}/${agent.maxConcurrentTasks}`);
  });
  
  return team;
}

// Example 2: Dynamic Agent Selection
async function dynamicSelection() {
  console.log("\n=== Dynamic Agent Selection ===\n");
  
  const { gateway, memory } = await initializeSharedResources();
  
  // Create agent profiles
  const agents: AgentProfile[] = [
    {
      id: "fast_agent",
      name: "Fast Agent",
      type: "EnhancedAgentExecutor",
      capabilities: [
        {
          name: "quick_task",
          description: "Fast task execution",
          tools: ["calculator"],
          reasoningPatterns: ["standard"],
          specialties: ["simple_tasks"],
          performance: { avgResponseTime: 500, successRate: 0.85, taskComplexity: 0.3 }
        }
      ],
      status: "active" as const,
      currentLoad: 1,
      maxConcurrentTasks: 5,
      metadata: { costPerTask: 0.01 }
    },
    {
      id: "reliable_agent",
      name: "Reliable Agent",
      type: "ReActAgent",
      capabilities: [
        {
          name: "complex_task",
          description: "Complex task handling",
          tools: ["search", "calculator"],
          reasoningPatterns: ["react", "cot"],
          specialties: ["complex_analysis"],
          performance: { avgResponseTime: 3000, successRate: 0.98, taskComplexity: 0.9 }
        }
      ],
      status: "active" as const,
      currentLoad: 2,
      maxConcurrentTasks: 3,
      metadata: { costPerTask: 0.05 }
    },
    {
      id: "specialist_agent",
      name: "Specialist Agent",
      type: "CoTAgent",
      capabilities: [
        {
          name: "specialized_task",
          description: "Specialized domain tasks",
          tools: ["weather"],
          reasoningPatterns: ["cot"],
          specialties: ["weather_analysis"],
          performance: { avgResponseTime: 2000, successRate: 0.95, taskComplexity: 0.7 }
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 2,
      metadata: { costPerTask: 0.03 }
    }
  ];
  
  // Create selector
  const selector = new DynamicAgentSelector();
  
  // Test different selection scenarios
  const scenarios: Array<{ name: string; criteria: SelectionCriteria }> = [
    {
      name: "Fast simple task",
      criteria: {
        requiredCapabilities: ["quick_task"],
        maxResponseTime: 1000,
        priority: "normal"
      }
    },
    {
      name: "Complex analysis",
      criteria: {
        requiredCapabilities: ["complex_task"],
        reasoningPattern: "react",
        priority: "high"
      }
    },
    {
      name: "Weather specialization",
      criteria: {
        requiredCapabilities: ["specialized_task"],
        specialization: "weather_analysis",
        priority: "normal"
      }
    },
    {
      name: "Cost-sensitive task",
      criteria: {
        requiredCapabilities: ["quick_task", "complex_task"],
        costLimit: 0.02,
        priority: "low"
      }
    }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n🎯 Scenario: ${scenario.name}`);
    const selection = selector.selectAgent(agents, scenario.criteria);
    
    if (selection) {
      console.log(`   Selected: ${selection.agentId}`);
      console.log(`   Score: ${selection.score}`);
      console.log(`   Reasoning: ${selection.reasoning}`);
      console.log(`   Factors:`, selection.factors);
    } else {
      console.log("   No suitable agent found");
    }
  }
  
  // Test multiple agent selection
  console.log("\n🔄 Selecting 2 agents for parallel execution:");
  const multiSelection = selector.selectAgents(
    agents,
    { requiredCapabilities: ["quick_task"] },
    2
  );
  
  multiSelection.forEach((selection, index) => {
    console.log(`   ${index + 1}. ${selection.agentId} (score: ${selection.score})`);
  });
  
  return selector;
}

// Example 3: Workflow Orchestration
async function workflowOrchestration() {
  console.log("\n=== Workflow Orchestration ===\n");
  
  const { gateway, memory } = await initializeSharedResources();
  
  // Create orchestrator
  const orchestrator = new AgentOrchestrator(
    {
      maxConcurrentWorkflows: 5,
      defaultTimeout: 30000,
      enableMonitoring: true,
      persistenceEnabled: true
    },
    memory
  );
  
  // Create and register a team
  const team = new AgentTeam(
    {
      name: "ProcessingTeam",
      loadBalancingStrategy: "performance_based"
    },
    memory
  );
  
  // Register agents
  const agents: AgentProfile[] = [
    {
      id: "collector",
      name: "Data Collector",
      type: "EnhancedAgentExecutor",
      capabilities: [
        {
          name: "data_collection",
          description: "Collects data from various sources",
          tools: ["search"],
          reasoningPatterns: ["standard"],
          specialties: ["data_collection"]
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 3
    },
    {
      id: "processor",
      name: "Data Processor",
      type: "CoTAgent",
      capabilities: [
        {
          name: "data_processing",
          description: "Processes and analyzes data",
          tools: ["calculator"],
          reasoningPatterns: ["cot"],
          specialties: ["data_processing"]
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 2
    },
    {
      id: "summarizer",
      name: "Report Summarizer",
      type: "ReActAgent",
      capabilities: [
        {
          name: "summarization",
          description: "Creates summaries and reports",
          tools: [],
          reasoningPatterns: ["react"],
          specialties: ["summarization", "reporting"]
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 2
    }
  ];
  
  agents.forEach(agent => team.registerAgent(agent));
  orchestrator.registerTeam(team);
  
  // Define a workflow
  const dataAnalysisWorkflow: WorkflowDefinition = {
    id: "data_analysis_pipeline",
    name: "Data Analysis Pipeline",
    description: "Collects, processes, and summarizes data",
    steps: [
      {
        id: "collect",
        name: "Collect Data",
        description: "Collect relevant data",
        requiredCapabilities: ["data_collection"],
        timeout: 10000
      },
      {
        id: "process",
        name: "Process Data",
        description: "Process and analyze the collected data",
        requiredCapabilities: ["data_processing"],
        dependencies: ["collect"],
        timeout: 15000
      },
      {
        id: "summarize",
        name: "Create Summary",
        description: "Create a summary of the analysis",
        requiredCapabilities: ["summarization"],
        dependencies: ["process"],
        timeout: 10000
      }
    ],
    orchestrationPattern: "sequential",
    errorHandling: "continue_on_error"
  };
  
  // Register workflow
  orchestrator.registerWorkflow(dataAnalysisWorkflow);
  
  // Execute workflow
  console.log("🚀 Starting workflow execution...");
  const executionId = await orchestrator.executeWorkflow(
    "data_analysis_pipeline",
    {
      query: "latest AI trends 2024",
      analysisType: "statistical"
    },
    {
      requestId: "req_123",
      priority: "high"
    },
    "ProcessingTeam"
  );
  
  // Monitor execution
  const checkExecution = () => {
    const execution = orchestrator.getExecution(executionId);
    if (execution) {
      console.log(`\n📊 Execution Status: ${execution.status}`);
      console.log(`   Current Step: ${execution.currentStep || "N/A"}`);
      console.log(`   Results: ${execution.results.size} steps completed`);
      
      if (execution.errors.length > 0) {
        console.log(`   Errors: ${execution.errors.length}`);
      }
      
      if (execution.status === "completed") {
        console.log("\n✅ Workflow completed successfully!");
        console.log("Results:");
        execution.results.forEach((value, key) => {
          console.log(`   ${key}: ${JSON.stringify(value).substring(0, 100)}...`);
        });
      }
    }
  };
  
  // Check periodically
  const interval = setInterval(checkExecution, 2000);
  
  // Stop checking after 30 seconds
  setTimeout(() => {
    clearInterval(interval);
    checkExecution();
  }, 30000);
  
  return orchestrator;
}

// Example 4: Advanced Communication Patterns
async function communicationPatterns() {
  console.log("\n=== Advanced Communication Patterns ===\n");
  
  const { gateway, memory } = await initializeSharedResources();
  
  // Create a specialized team for communication
  const team = new AgentTeam(
    {
      name: "CommunicationTeam",
      communicationProtocol: "brokered"
    },
    memory
  );
  
  // Register agents
  const coordinator: AgentProfile = {
    id: "coordinator",
    name: "Coordinator",
    type: "EnhancedAgentExecutor",
    capabilities: [
      {
        name: "coordination",
        description: "Coordinates team activities",
        tools: [],
        reasoningPatterns: ["standard"],
        specialties: ["coordination", "planning"]
      }
    ],
    status: "active" as const,
    currentLoad: 0,
    maxConcurrentTasks: 5
  };
  
  const worker1: AgentProfile = {
    id: "worker1",
    name: "Worker 1",
    type: "ReActAgent",
    capabilities: [
      {
        name: "task_execution",
        description: "Executes assigned tasks",
        tools: ["calculator"],
        reasoningPatterns: ["react"],
        specialties: ["computation", "analysis"]
      }
    ],
    status: "active" as const,
    currentLoad: 0,
    maxConcurrentTasks: 3
  };
  
  const worker2: AgentProfile = {
    id: "worker2",
    name: "Worker 2",
    type: "CoTAgent",
    capabilities: [
      {
        name: "task_execution",
        description: "Executes assigned tasks",
        tools: ["search"],
        reasoningPatterns: ["cot"],
        specialties: ["research", "fact_checking"]
      }
    ],
    status: "active" as const,
    currentLoad: 0,
    maxConcurrentTasks: 3
  };
  
  [coordinator, worker1, worker2].forEach(agent => team.registerAgent(agent));
  
  // Demonstrate different communication patterns
  
  // 1. Broadcast message
  console.log("1️⃣ Broadcasting message to all agents...");
  await team.broadcast(
    "coordinator",
    "broadcast",
    {
      type: "announcement",
      message: "Starting new project phase",
      timestamp: Date.now()
    },
    "high"
  );
  
  // 2. Delegate task
  console.log("\n2️⃣ Delegating task to best agent...");
  const taskId = await team.delegateTask(
    "coordinator",
    {
      task: "Calculate compound interest for 5 years at 5% rate",
      priority: "normal"
    },
    {
      capabilities: ["task_execution"],
      maxResponseTime: 5000
    }
  );
  
  console.log(`   Task delegated with ID: ${taskId}`);
  
  // 3. Handoff between agents
  console.log("\n3️⃣ Handing off task between agents...");
  await team.handoffTask(
    taskId,
    "worker1",
    "worker2",
    "Worker 2 has better research capabilities"
  );
  
  // 4. Monitor team events
  team.on("messageSent", (message) => {
    console.log(`\n📤 Message sent: ${message.type} from ${message.from}`);
  });
  
  team.on("taskCompleted", (event) => {
    console.log(`\n✅ Task ${event.taskId} completed`);
    if (event.result) {
      console.log(`   Result: ${JSON.stringify(event.result).substring(0, 100)}...`);
    }
  });
  
  // Display final team state
  setTimeout(() => {
    console.log("\n📈 Final Team Statistics:");
    console.log(JSON.stringify(team.getTeamStats(), null, 2));
  }, 5000);
  
  return team;
}

// Example 5: Performance Monitoring and Optimization
async function performanceMonitoring() {
  console.log("\n=== Performance Monitoring and Optimization ===\n");
  
  const selector = new DynamicAgentSelector();
  
  // Simulate performance data
  const performanceData = [
    { agentId: "agent_a", responseTime: 1200, success: true },
    { agentId: "agent_b", responseTime: 800, success: true },
    { agentId: "agent_a", responseTime: 1500, success: false },
    { agentId: "agent_c", responseTime: 2000, success: true },
    { agentId: "agent_b", responseTime: 900, success: true },
    { agentId: "agent_a", responseTime: 1100, success: true },
    { agentId: "agent_c", responseTime: 2500, success: false },
    { agentId: "agent_b", responseTime: 700, success: true }
  ];
  
  // Update performance history
  performanceData.forEach(data => {
    selector.updatePerformanceHistory(data.agentId, data.responseTime, data.success);
  });
  
  // Display performance metrics
  console.log("📊 Performance History:");
  const history = selector.getPerformanceHistory();
  
  history.forEach((metrics, agentId) => {
    console.log(`\n${agentId}:`);
    console.log(`   Average Response Time: ${metrics.avgResponseTime.toFixed(0)}ms`);
    console.log(`   Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`   Total Tasks: ${metrics.taskCount}`);
  });
  
  // Test selection with performance consideration
  const agents: AgentProfile[] = [
    {
      id: "agent_a",
      name: "Agent A",
      type: "EnhancedAgentExecutor",
      capabilities: [
        {
          name: "task",
          description: "General task execution",
          tools: [],
          reasoningPatterns: ["standard"],
          specialties: ["general"]
        }
      ],
      status: "active" as const,
      currentLoad: 1,
      maxConcurrentTasks: 3
    },
    {
      id: "agent_b",
      name: "Agent B",
      type: "ReActAgent",
      capabilities: [
        {
          name: "task",
          description: "General task execution",
          tools: [],
          reasoningPatterns: ["react"],
          specialties: ["general"]
        }
      ],
      status: "active" as const,
      currentLoad: 2,
      maxConcurrentTasks: 3
    },
    {
      id: "agent_c",
      name: "Agent C",
      type: "CoTAgent",
      capabilities: [
        {
          name: "task",
          description: "General task execution",
          tools: [],
          reasoningPatterns: ["cot"],
          specialties: ["general"]
        }
      ],
      status: "active" as const,
      currentLoad: 0,
      maxConcurrentTasks: 3
    }
  ];
  
  console.log("\n🎯 Agent Selection with Performance History:");
  
  const strategies = ["balanced", "performance_first", "speed_optimized", "load_balanced"];
  
  strategies.forEach(strategy => {
    const selection = selector.selectAgent(
      agents,
      { requiredCapabilities: ["task"] },
      strategy
    );
    
    console.log(`\n${strategy} strategy:`);
    if (selection) {
      console.log(`   Selected: ${selection.agentId}`);
      console.log(`   Score: ${selection.score}`);
      console.log(`   Reasoning: ${selection.reasoning}`);
    }
  });
  
  return selector;
}

// Run all examples
async function runExamples() {
  console.log("Echo AI SDK - Multi-Agent Collaboration Examples\n");
  
  try {
    await basicAgentTeam();
    await dynamicSelection();
    await workflowOrchestration();
    await communicationPatterns();
    await performanceMonitoring();
    
    console.log("\n✅ All examples completed successfully!");
  } catch (error: any) {
    console.error("\n❌ Example failed:", error.message);
    console.error(error.stack);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  basicAgentTeam,
  dynamicSelection,
  workflowOrchestration,
  communicationPatterns,
  performanceMonitoring
};
