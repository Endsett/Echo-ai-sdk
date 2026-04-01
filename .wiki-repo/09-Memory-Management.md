# 9. Memory Management

By default, Large Language Models have zero memory. Every request you send to it is evaluated in a vacuum asynchronously.

To build interactive assistants that learn about your users, you must store historic messages mapped to specific `sessionIds`. Echo AI provides multiple tiers of Memory scaling securely locally up to Enterprise scale reasoning.

## Basic Implementations

### `InMemoryStore`
Perfect for testing logic and sandbox hacking.

```typescript
import { InMemoryStore, ToolAgent } from "echo-ai-sdk";

// Holds arrays of ChatMessages entirely inside Node RAM (Will reset on crash)
const memory = new InMemoryStore();
const agent = new ToolAgent({ gateway, memory });

// Automatically reads/writes to memory internally
await agent.run("user_123", "Hi, my name is Alex!"); 
await agent.run("user_123", "What is my name?"); // -> "Your name is Alex."
```

### `FileSessionStore`
Useful for Desktop deployments or primitive self-hosting.

```typescript
import { FileSessionStore, CustomerSupportBot } from "echo-ai-sdk";

// Writes user context natively into JSON schemas strictly safely inside `./sessions/user_123.json`
const memory = new FileSessionStore("./sessions");
const bot = new CustomerSupportBot({ gateway, memory });
```

## Production Enterprise Memory (Honcho Integration)

A massive problem with basic stores is that after a user chats for weeks, the sheer size of the array exceeds the token limits of the LLM model, causing sudden massive failures or enormous billing latency.

Additionally, searching for exact keywords in a FileStore doesn't understand context.

Echo AI natively embraces [Honcho.dev](https://honcho.dev/) as a drop-in replacement, providing your Agent with true semantic reasoning, entity extraction, and continuous learning.

### The `HonchoMemoryStore` Setup

```typescript
import { HonchoMemoryStore, AgentExecutor } from "echo-ai-sdk";

// 1. Initialize Honcho utilizing your API keys safely.
const memory = new HonchoMemoryStore({
  apiKey: process.env.HONCHO_API_KEY,   // Create an account and paste keys in .env
  workspaceId: "prod-customer-service", // Isolate multiple applications cleanly
});

// 2. Drop it perfectly natively into the Executor
const agent = new AgentExecutor({ gateway, memory, tools });
```

### Unlocking Entity Summarization

Once Honcho is listening to your context, you can manually ask it what it understands about your application traffic globally.

Instead of writing complex SQL to figure out what users like, ask directly natively via semantic NLP queries:

```typescript
// Queries the Honcho reasoning arrays and filters across all previous User conversations.
const insight = await memory.getInsights("user_123", "What topics does this user ask about most frequently?");

console.log(insight); 
// -> "The user consistently requests guidance deploying scalable Docker architecture."
```

### Finding Context Intelligently

Search context via semantic meaning rather than exact keyword matches smoothly cleanly.

```typescript
// Grabs the mathematically top 5 most relevant messages matching Semantic meaning
const results = await memory.searchMemory("user_123", "Docker issues", {
  topK: 5,
  maxDistance: 0.7, 
});
```

### Next Steps
While Semantic Memory handles parsing massive historic chat logs fluidly elegantly, how do you inject thousands of pages of existing PDFs or Text logs into the system immediately?

Review [Chapter 10: RAG and Grounding](./10-RAG-and-Grounding.md).
