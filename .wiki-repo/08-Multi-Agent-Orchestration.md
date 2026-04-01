# 8. Multi-Agent Orchestration

Echo natively assumes you will want to isolate agent behavior for scale. You don't want a "God Model" doing your Translations, and resolving code reviews, and modifying databases at the same time.

You orchestrate complex swarms of logic utilizing the `AgentPipeline` and `AgentRouter` engines.

## `AgentPipeline` — Sequential Processing

Pipelines process user inputs through iterative stages synchronously. The output text of Stage A directly becomes the invisible context of Stage B.

Imagine you want an application that receives a noisy email, translates it to French, Summarizes it, and Formats it elegantly into Markdown lists.

```typescript
import { AgentPipeline, ChatAgent } from "echo-ai-sdk";

// Create isolated agents with specific system prompts
const translator = new ChatAgent({ gateway, systemMessage: "Translate any text exclusively into French." });
const summarizer = new ChatAgent({ gateway, systemMessage: "Condense inputs heavily." });
const formatter = new ChatAgent({ gateway, systemMessage: "Format completely into Markdown standard lists." });

// Build the pipeline processing flow
const pipeline = new AgentPipeline()
  .addStage("translate", translator)
  .addStage("summarize", summarizer)
  .addStage("format", formatter);

async function demo() {
  const result = await pipeline.run("session-123", "We had a long meeting about Q3 profits... (noisy data)");
  
  // result is French, summarized, and bullet pointed automatically!
  console.log(result); 
}
```

## `AgentRouter` — Intent-Based Dispatching

Instead of forcing users to press buttons in a UI ("Press 1 for Sales, Press 2 for Support"), Echo AI introduces Intent routing. Evaluated quickly and locally using Regular Expressions, incoming chats bypass to highly-specific Tool agents inherently.

```typescript
import { AgentRouter, ToolAgent } from "echo-ai-sdk";

// The Support bot might hold tools capable of issuing database refunds
const supportAgent = new ToolAgent({ gateway, tools: [issueRefundTool] });

// The Sales bot might hold tools capable of booking calendar reservations
const salesAgent = new ToolAgent({ gateway, tools: [stripeCheckoutLink] });

// A harmless fallback bot
const generalAgent = new ChatAgent({ gateway, systemMessage: "Be a polite greeter." });

const router = new AgentRouter()
  // Maps anything matching the regex dynamically
  .addRoute("support", /help|issue|bug|refund|broken/i, supportAgent)
  .addRoute("sales", /pricing|demo|buy|purchase/i, salesAgent)
  .setFallback(generalAgent);

// Simulating Inputs:
await router.route("session1", "I need a refund on my last purchase!"); 
// Reroutes seamlessly to -> supportAgent

await router.route("session1", "Where can I book a massive demo?");
// Reroutes seamlessly to -> salesAgent
```

### Next Steps

Right now, if the user reconnects, your Agent loses history unless you configure strict Database stores natively tracking `sessionId` strings! This represents "Memory".

Investigate Memory solutions in [Chapter 9: Memory Management](./09-Memory-Management.md).
