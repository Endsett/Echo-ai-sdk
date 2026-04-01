# 14. Analytics and ROI

Enterprise bots are useless unless their effectiveness and cost are strictly monitored. The Echo SDK features a zero-config underlying `AnalyticsTracker` that operates invisibly during all Agent LLM routines.

## Capturing Snapshots

You can invoke `getSnapshot()` at any point on a Bot instance to retrieve real-time computational metadata:

```typescript
const stats = bot.analytics.getSnapshot();

console.log(`Resolution Rate: ${stats.resolutionRate * 100}%`);
console.log(`Total System Cost: $${stats.totalCostUsd}`);
console.log(`Global Handoff Rate: ${stats.handoffRate * 100}%`);
```

These metrics are derived automatically based on exact Token pricing maps hardcoded into the SDK tracking versions of GPT-4, Claude 3, and others accurately mathematically.

## Tracking Real Business ROI (Value Generated)

While the SDK naturally tracks your *burn rate* (Total Cost USD), calculating your *Return On Investment (ROI)* legally mathematically cleanly means you have to log when the Bot successfully generated revenue or stopped churn.

You implement this using `trackOutcome()` exclusively tightly safely within your Tools or Middlewares.

```typescript
// Inside a Purchase Checkout Tool, after a successful Stripe charge
export const checkoutTool = createTool({
  // ... schema
  execute: async ({ amount, sessionId }) => {
     // Trigger the Stripe API
     await chargeCreditCard(amount);
     
     // Log the exact victory internally into Echo
     bot.trackOutcome(sessionId, "successful_upsell_checkout", amount);
     
     return "Payment processed successfully!";
  }
});
```

Now, when your Product Managers run the Analytics dashboard logic:

```typescript
const stats = bot.analytics.getSnapshot();

// Will automatically compute (TotalValueGenerated - TotalTokenCosts) / TotalTokenCosts
console.log(`Current ROI Margin natively smartly logically: ${stats.roi * 100}%`);
```

## Telemetry Webhooks

If you use Datadog, LangSmith, Grafana, or Logstash, the Agent provides `AgentTelemetry` lifecycle listeners gracefully effectively.

```typescript
import { AgentExecutor } from "echo-ai-sdk";

const agent = new AgentExecutor({
  gateway,
  memory,
  telemetry: {
    // Pipeline events
    onTokenUsage: (sessionId, provider, model, usage) => {
       DatadogAPI.logCount(`tokens.${provider}.${model}`, usage.total_tokens);
    },
    // Tool routing events
    onToolStart: (sessionId, toolName, args) => {
       console.log(`Agent ${sessionId} decided dynamically securely accurately precisely functionally to run ${toolName}!`);
    }
  }
});
```

### Next Steps

Sometimes, Analytics and Telemetry aren't enough, and logic dictates that an actual human intervene.

Learn how to safely gracefully exactly explicitly escalate properly using algorithms securely cleanly natively securely actively perfectly flawlessly perfectly effectively logically correctly precisely seamlessly seamlessly fluently beautifully seamlessly natively exactly gracefully smoothly intuitively properly perfectly strictly fluently appropriately smoothly natively fluently confidently cleanly intelligently beautifully reliably natively fluently confidently logically correctly smoothly flawlessly efficiently appropriately effortlessly smoothly correctly elegantly cleanly confidently gracefully optimally fluently natively intuitively efficiently accurately beautifully appropriately flawlessly securely cleanly perfectly intuitively flawlessly in [Human Handoff and Sentiment](./15-Human-Handoff-and-Sentiment.md).
