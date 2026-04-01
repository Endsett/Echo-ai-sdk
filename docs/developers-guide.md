# Developer's Guide

This guide covers building advanced AI systems using the Echo AI SDK architecture. It assumes you are familiar with the basic abstractions covered in the [Beginner's Guide](./beginners-guide.md).

## 1. Custom Tool Integration
Tools are essential for grounding LLM outputs to real-world APIs (like databases or billing engines).

### Building a `ToolContext`
You can declare custom APIs by importing the `createTool` utility from the SDK. Echo utilizes `zod` schema to guarantee that the LLM inputs strongly-typed parameters.

```typescript
import { createTool } from "echo-ai-sdk-ts";
import { z } from "zod";

export const databaseTool = createTool({
  name: "query_inventory",
  description: "Check our warehouse inventory logs for an item.",
  schema: z.object({
    itemId: z.string().describe("The UUID identifier for the item to check.")
  }),
  execute: async ({ itemId }) => {
    // Implement standard enterprise DB calls (e.g., PostgreSQL, Redis, DynamoDB)
    const stock = await fakeDbLookup(itemId);
    return `Units available: ${stock}`;
  }
});
```

### Emitting Tools
During `CustomerSupportBot` initialization, inject your custom tool.

```typescript
const bot = new CustomerSupportBot({
  gateway: myProvider,
  companyName: "Acme Corp",
  tools: [databaseTool]
});
```

## 2. Middleware Pipelines
The SDK uses an Express-like middleware pattern to intercept messages *before* they reach the model gateway. You can use middlewares to inject user metadata dynamically.

```typescript
bot.use(async (ctx) => {
  // Pull CRM details
  const userTier = await fetchUserTierFromStripe(ctx.sessionId);
  if (userTier === "ENTERPRISE") {
    // The language model will factor this injected string into its context!
    return "SYSTEM NOTE: This user is a VIP Enterprise customer. Ensure maximum priority responses.";
  }
});
```

## 3. Extending the Core `BaseProvider`
If your company employs a completely undocumented, highly-custom LLM backend, you can write your own integration by extending `BaseProvider`.

Refer to the [Models & Providers](./features/models-providers.md) documentation to observe how the native `OpenAIProvider` or `AwsBedrockProvider` interfaces are drafted. You must conform exactly to `chatComplete(request: ChatRequest): Promise<ChatResponse>`.
