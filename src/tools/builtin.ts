import { z } from "zod";
import { Parser } from "expr-eval";
import { createTool } from "./base";

export const calculatorTool = createTool({
  name: "calculator",
  description: "Useful for performing mathematical calculations. Provide a valid JavaScript mathematical expression as a string.",
  schema: z.object({
    expression: z.string().describe("The mathematical expression to evaluate, e.g., '10 + 5' or 'Math.PI * 4'.")
  }),
  execute: async ({ expression }) => {
    try {
      // evaluate completely sandboxes expressions without dynamic eval engine execution
      const result = Parser.evaluate(expression);
      return String(result);
    } catch (e: any) {
      return `Calculation error: ${e.message}`;
    }
  }
});

export const dateTimeTool = createTool({
  name: "get_current_datetime",
  description: "Returns the current date and time.",
  schema: z.object({}),
  execute: async () => {
    return new Date().toISOString();
  }
});

export const webSearchTool = createTool({
  name: "web_search",
  description: "Executes a web search query and returns snippet results. Use this when you need current information from the internet.",
  schema: z.object({
    query: z.string().describe("The search query.")
  }),
  execute: async ({ query }) => {
    // Dummy Search Implementation
    return `[Dummy search results for '${query}': Revenue up 15%, market bullish.]`;
  }
});
