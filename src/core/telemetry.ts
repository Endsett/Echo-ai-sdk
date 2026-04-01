export interface AgentTelemetry {
  onAgentStart?: (sessionId: string, input: string) => void;
  onAgentIteration?: (sessionId: string, iteration: number) => void;
  onToolStart?: (sessionId: string, toolName: string, args: any) => void;
  onToolEnd?: (sessionId: string, toolName: string, result: string) => void;
  onTokenUsage?: (sessionId: string, provider: string, model: string, usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) => void;
  onAgentEnd?: (sessionId: string, output: string) => void;
}
