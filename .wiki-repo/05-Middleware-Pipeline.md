# 5. Middleware Pipeline

A major challenge when deploying LLMs to production is ensuring strict audit logs, compliance redactions, and modifying contexts dynamically based on active users.

Echo AI tackles this using an Express-style middleware architecture via standard Node hook routing.

## The `bot.use()` Philosophy

When you instantiate a `CustomerSupportBot` or orchestrate an `AgentPipeline`, requests are processed down an internal pipeline stack *before* ever hitting the API vendor, and *after* returning from the API vendor.

### Modifying Incoming User Messages

If you want to inject data into the agent's context dynamically, you simply register a callback:

```typescript
bot.use(async (ctx) => {
  // Inspect incoming messages
  if (ctx.message.toLowerCase().includes("vip")) {
    
    // Returning a string inside a middleware hook implicitly 
    // forces the Bot to concatenate it to the system prompt!
    return "SYSTEM ADMIN NOTE: This user explicitly requested VIP escalation. Treat urgently.";
  }
});
```

### Auditing The Gateway Level

You can attach middlewares globally to your `AIModelGateway` to enforce behavior logic to all requests regardless of the `Bot` resolving them.

```typescript
import { AIModelGateway } from "echo-ai-sdk";

const gateway = new AIModelGateway([...providers]);

gateway.use({
  onRequest: (req) => {
    console.log(`[Audit] Sending request comprised of ${req.messages.length} messages`);
    
    // Always return req to continue the pipeline modifications
    return req;
  },
  onResponse: (res, req) => {
    console.log(`[Audit] Response completed, burned ${res.usage?.total_tokens} total tokens`);
    
    // Must return the response object to the executor
    return res;
  },
  onError: (err, provider) => {
    // Notify infrastructure team of the LLM going offline
    console.error(`[Alert] ${provider} failed exactly with reason: ${err.message}`);
  }
});
```

## Telemetry Integrations 

Inside the `AgentExecutor` environment, you can register global event handlers out-of-the-box using the `telemetry` configuration option binding logic to `onTokenUsage` and `onToolStart`. 
See [Analytics and ROI](./14-Analytics-and-ROI.md) for more details.

### Next Steps

The middleware modifies messages seamlessly, but how does the core agent actually interact with your enterprise logic? Check out [Chapter 6: Tools and Actions](./06-Tools-and-Actions.md).
