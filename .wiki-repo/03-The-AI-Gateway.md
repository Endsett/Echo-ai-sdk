# 3. The AI Gateway

The core concept that separates Echo AI SDK from standard un-orchestrated libraries is the `AIModelGateway`. 

The Gateway solves three massive enterprise issues:
1. **Model Fallbacks**: If OpenAI goes down, the Gateway instantly reroutes logic to Anthropic.
2. **Rate Limiting**: Incorporates battle-tested Jitter / Exponential Backoff arrays automatically.
3. **Provider Agnostic**: The rest of your application interacts blindly with the Gateway. Changing from `GPT-4` to `Claude 3 Opus` simply involves passing a different provider string into the request context.

## Initializing The Gateway

You instantiate the gateway by feeding it an array of prioritized providers.

```typescript
import { AIModelGateway, OpenAIProvider, AnthropicProvider } from "echo-ai-sdk";

// Define our providers
const gpt = new OpenAIProvider(process.env.OPENAI_API_KEY!);
const claude = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);

// Construct Gateway: OpenAI takes primary traffic, Anthropic acts as fallback
const gateway = new AIModelGateway([gpt, claude]);
```

## Basic Requests

When issuing a raw `chatComplete` request directly to the Gateway, you use standard generic Message objects:

```typescript
const request = {
   messages: [
     { role: "system", content: "You are a poetic assistant." },
     { role: "user", content: "Tell me a story about coding." }
   ],
   model_family: "fast" // Let the Gateway decide the specifics
};

const res = await gateway.chatComplete(request);
console.log(res.messages[0].content);
```

### `model_family`

Notice we specified `model_family: "fast"` rather than `gpt-4-turbo`. The Gateway maps `fast` to `gpt-3.5-turbo` or `claude-3-haiku` implicitly depending on what provider is actively serving traffic. 

Available options:
- `fast`: Best for simple tasks and high-throughput.
- `balanced`: Best for standard agent operations.
- `advanced`: Extreme reasoning capabilities (GPT-4, Claude 3 Opus).

## Explicit Failover Exceptions

If *all* providers in your gateway are rate-limited, fail, or network timeout, the Gateway throws a heavily-typed exception you can catch to trigger catastrophic panic mode in your pipelines.

```typescript
import { GatewayRoutingError } from "echo-ai-sdk";

try {
  await gateway.chatComplete(request);
} catch (e) {
  if (e instanceof GatewayRoutingError) {
    console.error("CRITICAL ALARM: All LLM vendors are currently unavailable.");
    pagerDuty.sendAlert("LLM Outage");
  }
}
```

## Caching

A frequent way to save API costs is to prevent exact-matching duplicate requests from hitting remote vendors. The `CachedGateway` wraps the standard Gateway to store identically-hashed payloads for a specific TTl.

```typescript
import { CachedGateway } from "echo-ai-sdk";

// Wrap our gateway and hold responses in memory for 2_minutes (120,000ms)
const cachedGateway = new CachedGateway(gateway, 120_000);

// Request 1: Takes 4.5 seconds (hits OpenAI)
const res1 = await cachedGateway.chatComplete(request); 

// Request 2 (identical): Takes 0.001 seconds (hits Cache)
const res2 = await cachedGateway.chatComplete(request); 
```

### Next Steps

Now that we are connected to the APIs reliably, we should formalize how we construct the strings we send them. Learn how to version prompts in [Prompts and Completions](./04-Prompts-and-Completions.md).
