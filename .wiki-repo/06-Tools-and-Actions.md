# 6. Tools and Actions

Large Language Models are limited sequentially by internet cut-off dates and read-only logic. A "Tool" (or what OpenAI dubs "Function Calling") allows your Agent Executor to pause generation, invoke Javascript APIs on your Node.js server, and parse the findings back into conversation logic.

Echo AI solves the historically complex problem of defining standard JSON schemas by using `zod`. `Echo` will automatically translate your `zod` object into a highly strict interface schema expected by OpenAI, Anthropic, or Local models.

## Leveraging `createTool`

You only need two imports: `zod` itself to construct variables, and `createTool` to map actions safely.

A basic internal calculator might look like this:

```typescript
import { z } from "zod";
import { createTool } from "echo-ai-sdk";

export const calculatorTool = createTool({
  name: "calculate_integers",
  description: "Calculate math formulas and multiply/divide values correctly.",
  schema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    numA: z.number().describe("The primary left-side numeral"),
    numB: z.number().describe("The right-side numeral")
  }),
  execute: async ({ operation, numA, numB }) => {
    switch(operation) {
      case "add": return numA + numB;
      case "subtract": return numA - numB;
      case "multiply": return numA * numB;
      case "divide": return numA / numB;
    }
  }
});
```

Because `operation` is strongly typed strictly inside `schema` to a `z.enum(["add", ...])`, when Echo parses the LLM output internally, it will refuse to pass bad execution data (like `operation: "exponential"`) and instead correct the LLM autonomously!

## Real World Application: Database Lookup

A more standard Enterprise example invokes remote Rest Endpoints:

```typescript
export const crmQueryTool = createTool({
  name: "query_customer_crm",
  description: "Check our internal Customer Database using their ID or strictly mapped Email handle.",
  schema: z.object({
    companyEmail: z.string().email().optional(),
    crmId: z.string().uuid().optional()
  }),
  execute: async ({ companyEmail, crmId }) => {
      // You must write code connecting to an external resource
      const data = await externalStripeLookup(crmId, companyEmail);
      
      if (!data) return "NO ACTIVE USER DETECTED IN CRM DATABASE.";

      return `Plan: ${data.plan_tier}. Monthly Spend: ${data.arr_usd}`;
  }
});
```

Whenever the LLM realizes the user wants real-time billing numbers, it will pause the chat, trigger `execute()` by feeding it the `zod` schema variables it detected implicitly, wait for the Javascript Promise tracking the payload to finish, and return to writing strings to the user containing the resulting `data.arr_usd` details!

## Providing Tools To Bots

When initializing your `CustomerSupportBot` or raw `ToolAgent`, pass the created toolkit logic easily.

```typescript
const agent = new ToolAgent({
  gateway: myGateway,
  tools: [crmQueryTool, calculatorTool]
});
```

### Next Steps

What if we want the Agent to stop acting autonomously during standard responses and *solely* return formatted code blocks matching our schemas?

Jump into [Structured Outputs](./07-Structured-Outputs.md).
