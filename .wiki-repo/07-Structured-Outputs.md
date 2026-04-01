# 7. Structured Outputs

A common failure mode of LLMs is hallucinations in syntax format. Rather than begging the AI to format in properly indented JSON, Echo SDK offers `agent.executeStructured(...)`.

By feeding `executeStructured` a standard `zod` schema, you force the AI to return an object guaranteed geometrically to match your schema entirely natively.

## The Simple Approach

Ensure you're using a powerful model (e.g. `gpt-4-turbo` or `claude-3-opus`) when restricting complex architectures, to lessen syntax retries natively executing behind the scenes.

```typescript
import { z } from "zod";
import { ToolAgent } from "echo-ai-sdk";

// Define exactly what format we need the AI to output
const ReceiptAnalysisSchema = z.object({
  totalAmountParsed: z.number(),
  merchantName: z.string(),
  suspiciousCategorization: z.boolean(),
  lineItems: z.array(z.string())
});

const agent = new ToolAgent({ 
    gateway, 
    // This isn't required to have tools to output structured data
});

const fileData = await getPdfString("receipt_xyz.pdf");
```

Rather than using `agent.run()`, map exactly to your Schema using `agent.executeStructured()`:

```typescript
const result = await agent.executeStructured(
   "session_001", 
   `Analyze the following extracted receipt text:\n\n${fileData}`,
   ReceiptAnalysisSchema
);

// High-confidence, type-safe TS objects returned natively!
console.log(`Scanned Merchant: ${result.merchantName}`);
console.log(result.suspiciousCategorization === true ? "Fraud Alert!" : "Normal");

result.lineItems.forEach((it) => console.log(it));
```

## Schema Error Handling

If the `executeStructured` pipeline fundamentally cannot force the LLM to write exact format (due to context window failure or API outage limits), it will throw a strict `StructuredOutputError`.

```typescript
import { StructuredOutputError } from "echo-ai-sdk";

try {
  await agent.executeStructured(id, msg, Schema);
} catch (err) {
  if (err instanceof StructuredOutputError) {
    console.error("The LLM refused parsing valid JSON. Needs human fallback intervention.");
  }
}
```

### Next Steps

Now you know how to build a Single Agent capable of executing structured math (`Tools`) and outputting exact JSON (`Structured`). Let's make Agents interact with *other Agents!* 

Read [Multi-Agent Orchestration](./08-Multi-Agent-Orchestration.md) next.
