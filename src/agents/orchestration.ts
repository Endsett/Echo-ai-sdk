import { AgentExecutor } from "./executor";

/**
 * Chains multiple agents sequentially.
 * The output of one agent becomes the input of the next.
 * Perfect for pipelines like: Summarize → Translate → Format.
 */
export class AgentPipeline {
  private agents: { executor: AgentExecutor; label: string }[] = [];

  addStage(label: string, executor: AgentExecutor): this {
    this.agents.push({ executor, label });
    return this;
  }

  async run(sessionId: string, initialInput: string): Promise<string> {
    let currentOutput = initialInput;

    for (const { executor, label } of this.agents) {
      console.log(`[AgentPipeline] Running stage: ${label}`);
      currentOutput = await executor.execute(
        `${sessionId}_${label}`,
        currentOutput
      );
    }

    return currentOutput;
  }
}

/**
 * Routes user input to the most appropriate agent based on intent classification.
 * Useful for building multi-skill assistants (e.g., support bot vs. sales bot).
 */
export class AgentRouter {
  private routes: { pattern: RegExp; executor: AgentExecutor; label: string }[] = [];
  private fallback?: AgentExecutor;

  addRoute(label: string, pattern: RegExp, executor: AgentExecutor): this {
    this.routes.push({ pattern, executor, label });
    return this;
  }

  setFallback(executor: AgentExecutor): this {
    this.fallback = executor;
    return this;
  }

  async route(sessionId: string, userInput: string): Promise<string> {
    for (const { pattern, executor, label } of this.routes) {
      if (pattern.test(userInput)) {
        console.log(`[AgentRouter] Matched route: ${label}`);
        return executor.execute(sessionId, userInput);
      }
    }

    if (this.fallback) {
      console.log("[AgentRouter] No route matched, using fallback agent.");
      return this.fallback.execute(sessionId, userInput);
    }

    return "I'm not sure how to help with that. Please try rephrasing.";
  }
}
