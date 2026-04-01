import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface ToolContext<T = any> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  execute: (args: T) => Promise<string | any>;
  getMcpSchema: () => any;
}

/**
 * Factory function to create strongly-typed tools utilizing Zod.
 * Automatically handles conversion to JSONSchema.
 */
export function createTool<T>(options: {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  execute: (args: T) => Promise<string | any>;
}): ToolContext<T> {
  return {
    name: options.name,
    description: options.description,
    schema: options.schema,
    execute: async (args: T) => {
      // Validate runtime args precisely
      const parsed = options.schema.parse(args);
      const result = await options.execute(parsed);
      return typeof result === "string" ? result : JSON.stringify(result);
    },
    getMcpSchema: () => {
      // Strips Zod-specific wrapers into standard JSONSchema 7
      const jsonSchema = zodToJsonSchema(options.schema as any, "toolParams");
      // Grab properties out of the definitions layer specifically for OpenAI tool shapes
      const parameters = (jsonSchema.definitions?.toolParams as any) || { type: "object", properties: {} };
      
      return {
        type: "function",
        function: {
          name: options.name,
          description: options.description,
          parameters: parameters
        }
      };
    }
  };
}
