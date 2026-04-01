import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  tool_calls: z.array(z.record(z.any())).optional(),
  tool_call_id: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  tools: z.array(z.record(z.any())).optional(),
  model_family: z.enum(["fast", "smart", "capable"]).default("fast"),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().optional(),
  stream: z.boolean().default(false),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const UsageMetricsSchema = z.object({
  prompt_tokens: z.number().default(0),
  completion_tokens: z.number().default(0),
  total_tokens: z.number().default(0),
});
export type UsageMetrics = z.infer<typeof UsageMetricsSchema>;

export const ChatResponseSchema = z.object({
  content: z.string().nullable(),
  tool_calls: z.array(z.record(z.any())).nullable().optional(),
  usage: UsageMetricsSchema,
  provider_name: z.string(),
  model_name: z.string(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
