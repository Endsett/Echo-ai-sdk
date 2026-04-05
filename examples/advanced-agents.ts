/**
 * Examples demonstrating advanced agent capabilities
 * Shows parallel tool execution, ReAct, CoT, and Tree of Thoughts reasoning
 */

import {
  EchoAI,
  EnhancedAgentExecutor,
  ReActAgent,
  CoTAgent,
  ToTAgent,
  ToolDependency,
  ReasoningPattern,
  OpenAIProvider,
  FileMemoryStore,
  SearchTool,
  CalculatorTool,
  WeatherTool,
  AIModelGateway
} from "../src/index";

// Initialize the SDK
async function initializeSDK() {
  const echoAI = new EchoAI({
    apiKey: process.env.ECHO_AI_API_KEY,
    defaultProvider: new OpenAIProvider(process.env.OPENAI_API_KEY!)
  });

  return echoAI;
}

// Example 1: Enhanced Agent with Parallel Tool Execution
async function parallelToolExecution() {
  console.log("=== Parallel Tool Execution Example ===\n");
  
  const echoAI = await initializeSDK();
  const gateway = new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]);
  
  // Define tool dependencies
  const toolDependencies: ToolDependency[] = [
    {
      toolName: "weather",
      dependsOn: ["search"], // Weather tool needs location from search
      provides: ["weather_data"]
    },
    {
      toolName: "calculator",
      dependsOn: [], // Calculator has no dependencies
      provides: ["calculation_result"]
    }
  ];

  // Create enhanced executor with parallel execution
  const executor = new EnhancedAgentExecutor({
    gateway,
    memory: new FileMemoryStore("./memory"),
    tools: [new SearchTool(), new WeatherTool(), new CalculatorTool()],
    toolDependencies,
    systemPrompt: "You are a helpful assistant that can search, check weather, and calculate.",
    executionOptions: {
      enableParallel: true,
      maxParallelTools: 3,
      toolTimeout: 10000,
      streamToolResults: true
    }
  });

  const sessionId = "parallel-example";
  const task = "What's the weather in Tokyo and what's 15% of 2500?";

  try {
    // Execute with streaming
    for await (const chunk of executor.executeStream(sessionId, task)) {
      switch (chunk.type) {
        case "content":
          process.stdout.write(chunk.content);
          break;
        case "tool_call":
          console.log(`\n🔧 Tool called: ${chunk.toolCall.name}`);
          break;
        case "metadata":
          if (chunk.metadata?.toolGroupStart) {
            console.log(`\n🚀 Starting parallel execution of ${chunk.metadata.toolCount} tools`);
          }
          if (chunk.metadata?.toolEnd) {
            console.log(`✅ Tool ${chunk.metadata.toolName} completed in ${chunk.metadata.executionTime}ms`);
          }
          break;
      }
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Example 2: ReAct Agent with Reflection
async function reactAgentExample() {
  console.log("\n=== ReAct Agent with Reflection Example ===\n");
  
  const echoAI = await initializeSDK();
  
  const reactAgent = new ReActAgent({
    gateway: new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]),
    memory: new FileMemoryStore("./memory"),
    tools: [new SearchTool(), new CalculatorTool()],
    systemPrompt: "You are a research assistant that helps find and analyze information.",
    reactOptions: {
      maxSteps: 10,
      enableReflection: true,
      reflectOnFailures: true,
      confidenceThreshold: 0.7
    }
  });

  const sessionId = "react-example";
  const task = "Find the population of Tokyo and calculate what percentage of Japan's population it represents.";

  try {
    // Stream ReAct execution
    for await (const event of reactAgent.executeStream(sessionId, task)) {
      switch (event.type) {
        case "thought":
          console.log(`💭 Thought ${event.step}: ${event.content}`);
          break;
        case "action":
          console.log(`⚡ Action: ${event.content}`);
          break;
        case "observation":
          console.log(`👁️ Observation: ${event.content}`);
          break;
        case "reflection":
          console.log(`🤔 Reflection: ${event.content}`);
          break;
        case "final":
          console.log(`✅ Final Answer: ${event.content}`);
          break;
      }
    }

    // Show execution history
    const steps = reactAgent.getSteps();
    console.log(`\nExecution completed in ${steps.length} steps`);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Example 3: Chain of Thought Reasoning
async function cotAgentExample() {
  console.log("\n=== Chain of Thought Example ===\n");
  
  const echoAI = await initializeSDK();
  
  const cotAgent = new CoTAgent({
    gateway: new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]),
    memory: new FileMemoryStore("./memory"),
    tools: [new SearchTool(), new CalculatorTool()],
    systemPrompt: "You are a logical reasoning assistant.",
    cotOptions: {
      maxSteps: 8,
      showStepNumbers: true,
      requireConclusions: true,
      enableSelfQuestioning: true
    }
  });

  const sessionId = "cot-example";
  const task = "A train travels 300 km in 2 hours. If it maintains the same speed, how far will it travel in 5 hours? Show your work.";

  try {
    // Stream CoT reasoning
    for await (const event of cotAgent.executeStream(sessionId, task)) {
      switch (event.type) {
        case "step":
          console.log(`📝 ${event.content}`);
          break;
        case "reasoning":
          process.stdout.write(event.content);
          break;
        case "final":
          console.log(`\n✅ Final Answer: ${event.content}`);
          break;
      }
    }

    // Show reasoning steps
    const steps = cotAgent.getSteps();
    console.log(`\nReasoning completed with ${steps.length} steps`);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Example 4: Tree of Thoughts Reasoning
async function totAgentExample() {
  console.log("\n=== Tree of Thoughts Example ===\n");
  
  const echoAI = await initializeSDK();
  
  const totAgent = new ToTAgent({
    gateway: new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]),
    memory: new FileMemoryStore("./memory"),
    tools: [new SearchTool(), new CalculatorTool()],
    systemPrompt: "You are a creative problem solver.",
    totOptions: {
      maxDepth: 4,
      breadth: 3,
      topK: 2,
      evaluationMethod: "score",
      allowBacktrack: true
    }
  });

  const sessionId = "tot-example";
  const task = "Design a sustainable city transportation system for 1 million people.";

  try {
    // Stream ToT execution
    for await (const event of totAgent.executeStream(sessionId, task)) {
      switch (event.type) {
        case "thought":
          console.log(`🌳 ${event.content}`);
          break;
        case "evaluation":
          console.log(`⚖️ ${event.content}`);
          break;
        case "selection":
          console.log(`🎯 ${event.content}`);
          break;
        case "final":
          console.log(`🏆 ${event.content}`);
          break;
        case "tree":
          if (event.tree) {
            console.log("\n📊 Tree Structure:");
            console.log(JSON.stringify(event.tree, null, 2));
          }
          break;
      }
    }

    // Get the complete thought tree
    const tree = totAgent.getTree();
    console.log(`\nTree built with ${tree.size} nodes`);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Example 5: Mixed Reasoning Patterns
async function mixedReasoningExample() {
  console.log("\n=== Mixed Reasoning Patterns Example ===\n");
  
  const echoAI = await initializeSDK();
  const gateway = new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]);
  
  const executor = new EnhancedAgentExecutor({
    gateway,
    memory: new FileMemoryStore("./memory"),
    tools: [new SearchTool(), new CalculatorTool(), new WeatherTool()],
    systemPrompt: "You are an advanced AI assistant with multiple reasoning capabilities."
  });

  const sessionId = "mixed-example";
  const task = "Plan a weekend trip to a nearby city with good weather and calculate the total cost.";

  // Try different reasoning patterns
  const patterns: ReasoningPattern[] = [
    { type: "standard" },
    { type: "react" },
    { type: "cot" },
    { type: "self_correct" }
  ];

  for (const pattern of patterns) {
    console.log(`\n--- Using ${pattern.type.toUpperCase()} reasoning ---\n`);
    
    try {
      const result = await executor.execute(sessionId, task, 5, pattern);
      console.log(`Result: ${result}\n`);
    } catch (error: any) {
      console.error(`Error with ${pattern.type}:`, error.message);
    }
  }
}

// Example 6: Tool Dependency Management
async function dependencyExample() {
  console.log("\n=== Tool Dependency Management Example ===\n");
  
  // Create tools with dependencies
  const tools = [
    new SearchTool(),
    new WeatherTool(),
    new CalculatorTool()
  ];

  const toolDependencies: ToolDependency[] = [
    {
      toolName: "weather",
      dependsOn: ["search"], // Weather needs location from search
      provides: ["weather_data"]
    },
    {
      toolName: "calculator",
      dependsOn: ["weather"], // Calculator might use weather data
      provides: ["calculation_result"]
    }
  ];

  const executor = new EnhancedAgentExecutor({
    gateway: new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]),
    memory: new FileMemoryStore("./memory"),
    tools,
    toolDependencies,
    executionOptions: {
      enableParallel: true,
      maxParallelTools: 2
    }
  });

  const sessionId = "dependency-example";
  const task = "What's the temperature in Paris and convert it to Fahrenheit?";

  try {
    for await (const chunk of executor.executeStream(sessionId, task)) {
      if (chunk.type === "metadata") {
        if (chunk.metadata?.toolGroupStart) {
          console.log(`\n🔗 Dependency-aware execution group: ${chunk.metadata.tools?.join(" → ")}`);
        }
      } else if (chunk.type === "content") {
        process.stdout.write(chunk.content);
      }
    }
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

// Run all examples
async function runExamples() {
  console.log("Echo AI SDK - Advanced Agents Examples\n");
  
  try {
    await parallelToolExecution();
    await reactAgentExample();
    await cotAgentExample();
    await totAgentExample();
    await mixedReasoningExample();
    await dependencyExample();
    
    console.log("\n✅ All examples completed!");
  } catch (error: any) {
    console.error("\n❌ Example failed:", error.message);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  parallelToolExecution,
  reactAgentExample,
  cotAgentExample,
  totAgentExample,
  mixedReasoningExample,
  dependencyExample
};
