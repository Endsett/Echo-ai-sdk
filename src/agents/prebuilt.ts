import { AIModelGateway } from "../gateway/router";
import { BaseMemoryStore, InMemoryStore } from "../memory/store";
import { ToolContext } from "../tools/base";
import { AgentExecutor } from "./executor";

export class ChatAgent {
  private _executor: AgentExecutor;

  constructor(gateway: AIModelGateway, memory?: BaseMemoryStore) {
    this._executor = new AgentExecutor({
      gateway,
      memory: memory || new InMemoryStore(),
    });
  }

  async chat(sessionId: string, userInput: string): Promise<string> {
    return await this._executor.execute(sessionId, userInput, 1);
  }
}

export class ToolAgent {
  private _executor: AgentExecutor;

  constructor(gateway: AIModelGateway, tools: ToolContext[], memory?: BaseMemoryStore) {
    this._executor = new AgentExecutor({
      gateway,
      memory: memory || new InMemoryStore(),
      tools,
    });
  }

  async run(sessionId: string, userInput: string, maxIterations: number = 5): Promise<string> {
    return await this._executor.execute(sessionId, userInput, maxIterations);
  }
}
