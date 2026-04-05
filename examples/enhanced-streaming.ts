/**
 * Example demonstrating enhanced streaming capabilities of Echo AI SDK
 * Shows backpressure handling, structured chunks, and error recovery
 */

import { 
  EchoAI, 
  AIModelGateway, 
  OpenAIProvider,
  StreamChunk,
  StreamOptions,
  IntelligentCache,
  createCacheMiddleware,
  CircuitBreaker,
  ProviderHealthChecker,
  streamToSSE
} from "echo-ai-sdk";

// Initialize the SDK with enhanced features
async function setupEnhancedGateway() {
  // Create providers
  const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY!);
  
  // Create gateway with multiple providers for failover
  const gateway = new AIModelGateway([openaiProvider]);
  
  // Add intelligent caching
  const cache = new IntelligentCache({
    defaultTtl: 300000, // 5 minutes
    maxSize: 1000,
    enableSemanticHashing: true,
    semanticThreshold: 0.85,
  });
  
  gateway.use(createCacheMiddleware(cache));
  
  // Add circuit breaker for resilience
  const breaker = new CircuitBreaker(
    async (request: any) => gateway.chatComplete(request),
    {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      onStateChange: (from, to) => {
        console.log(`Circuit breaker: ${from} -> ${to}`);
      },
    }
  );
  
  // Add health checking
  const healthChecker = new ProviderHealthChecker([openaiProvider], {
    checkInterval: 30000,
    onStatusChange: (provider, status, details) => {
      console.log(`Provider ${provider} status: ${status}`, details);
    },
  });
  
  healthChecker.start();
  
  return { gateway, cache, breaker, healthChecker };
}

// Example 1: Basic enhanced streaming
async function basicEnhancedStreaming() {
  const { gateway } = await setupEnhancedGateway();
  
  console.log("=== Basic Enhanced Streaming ===");
  
  const request = {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Tell me a short story about AI." }
    ],
    model_family: "smart" as const,
    temperature: 0.7,
  };
  
  try {
    for await (const chunk of gateway.chatStreamEnhanced(request)) {
      switch (chunk.type) {
        case "content":
          process.stdout.write(chunk.content);
          break;
        case "metadata":
          if (chunk.metadata?.usage) {
            console.log("\n\nUsage:", chunk.metadata.usage);
          }
          break;
        case "error":
          console.error("\nError:", chunk.error);
          break;
      }
    }
  } catch (error: any) {
    console.error("Stream failed:", error.message);
  }
}

// Example 2: Streaming with backpressure control
async function streamingWithBackpressure() {
  const { gateway } = await setupEnhancedGateway();
  
  console.log("\n=== Streaming with Backpressure Control ===");
  
  const request = {
    messages: [
      { role: "user", content: "Write a detailed explanation of quantum computing." }
    ],
    model_family: "smart" as const,
  };
  
  const options: StreamOptions = {
    maxBufferSize: 10, // Small buffer to demonstrate backpressure
    chunkTimeout: 5000,
    autoRetry: true,
    maxRetries: 3,
  };
  
  const stream = gateway.chatStreamEnhanced(request, options);
  
  // Simulate a slow consumer
  for await (const chunk of stream) {
    if (chunk.type === "content") {
      console.log("Received chunk:", chunk.content.slice(0, 50) + "...");
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Example 3: Tool calling with enhanced streaming
async function toolCallingStreaming() {
  const { gateway } = await setupEnhancedGateway();
  
  console.log("\n=== Tool Calling with Enhanced Streaming ===");
  
  const request = {
    messages: [
      { role: "user", content: "What's the weather in Tokyo and Paris?" }
    ],
    model_family: "smart" as const,
    tools: [{
      type: "function",
      function: {
        name: "get_weather",
        description: "Get the current weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" }
          },
          required: ["location"]
        }
      }
    }],
  };
  
  for await (const chunk of gateway.chatStreamEnhanced(request)) {
    switch (chunk.type) {
      case "content":
        process.stdout.write(chunk.content);
        break;
      case "tool_call":
        console.log("\n🔧 Tool called:", chunk.toolCall);
        // Simulate tool execution
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log("✓ Tool execution completed");
        break;
      case "error":
        console.error("\n❌ Error:", chunk.error);
        break;
    }
  }
}

// Example 4: Server-Sent Events streaming
async function serverSentEvents() {
  const { gateway } = await setupEnhancedGateway();
  
  console.log("\n=== Server-Sent Events Streaming ===");
  
  const request = {
    messages: [
      { role: "user", content: "Count from 1 to 10" }
    ],
    model_family: "smart" as const,
  };
  
  const stream = gateway.chatStreamEnhanced(request);
  const sseStream = streamToSSE(stream);
  
  console.log("SSE stream:");
  for await (const sseChunk of sseStream) {
    console.log(sseChunk);
  }
}

// Example 5: Parallel streaming with multiple requests
async function parallelStreaming() {
  const { gateway } = await setupEnhancedGateway();
  
  console.log("\n=== Parallel Streaming ===");
  
  const requests = [
    {
      messages: [{ role: "user", content: "Explain photosynthesis" }],
      model_family: "fast" as const,
    },
    {
      messages: [{ role: "user", content: "Explain gravity" }],
      model_family: "fast" as const,
    },
    {
      messages: [{ role: "user", content: "Explain electricity" }],
      model_family: "fast" as const,
    },
  ];
  
  // Start all streams in parallel
  const streams = requests.map(req => gateway.chatStreamEnhanced(req));
  
  // Process streams as they complete
  for (let i = 0; i < streams.length; i++) {
    console.log(`\n--- Stream ${i + 1} ---`);
    try {
      for await (const chunk of streams[i]) {
        if (chunk.type === "content") {
          process.stdout.write(chunk.content);
        }
      }
    } catch (error: any) {
      console.error(`Stream ${i + 1} failed:`, error.message);
    }
  }
}

// Example 6: Streaming with custom middleware
async function streamingWithMiddleware() {
  const { gateway } = await setupEnhancedGateway();
  
  console.log("\n=== Streaming with Custom Middleware ===");
  
  // Add custom middleware for streaming chunks
  gateway.use({
    onStreamChunk: async (chunk, request) => {
      // Log all chunks
      console.log(`[${chunk.type}]`, {
        hasContent: !!chunk.content,
        provider: chunk.metadata?.provider,
      });
      
      // Transform content chunks to uppercase
      if (chunk.type === "content" && chunk.content) {
        return {
          ...chunk,
          content: chunk.content.toUpperCase(),
        };
      }
      
      return chunk;
    },
  });
  
  const request = {
    messages: [
      { role: "user", content: "Say hello world in lowercase" }
    ],
    model_family: "fast" as const,
  };
  
  for await (const chunk of gateway.chatStreamEnhanced(request)) {
    if (chunk.type === "content") {
      process.stdout.write(chunk.content);
    }
  }
}

// Run all examples
async function runExamples() {
  console.log("Echo AI SDK - Enhanced Streaming Examples\n");
  
  await basicEnhancedStreaming();
  await streamingWithBackpressure();
  await toolCallingStreaming();
  await serverSentEvents();
  await parallelStreaming();
  await streamingWithMiddleware();
  
  console.log("\n✅ All examples completed!");
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  basicEnhancedStreaming,
  streamingWithBackpressure,
  toolCallingStreaming,
  serverSentEvents,
  parallelStreaming,
  streamingWithMiddleware,
};
