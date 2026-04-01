import { settings } from "./core/config";
import { AIModelGateway } from "./gateway/router";
import { OpenAIProvider } from "./models/openai";
import { AnthropicProvider } from "./models/anthropic";
import { BaseProvider } from "./models/base";
import { ChatAgent, ToolAgent } from "./agents/prebuilt";
import { ToolContext } from "./tools/base";
import { ConfigurationError } from "./core/exceptions";

export class EchoAI {
  public gateway: AIModelGateway;

  constructor(options?: { providers?: BaseProvider[] }) {
    let providers: BaseProvider[];

    if (options?.providers && options.providers.length > 0) {
      // Manual provider injection (for testing or custom setups)
      providers = options.providers;
    } else {
      // Auto-detect from environment variables
      providers = [];
      if (settings.hasOpenAI) {
        providers.push(new OpenAIProvider(settings.openaiApiKey));
      }
      if (settings.hasAnthropic) {
        providers.push(new AnthropicProvider(settings.anthropicApiKey));
      }
    }

    if (providers.length === 0) {
      throw new ConfigurationError(
        "No AI providers configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables, or pass providers manually via `new EchoAI({ providers: [...] })`."
      );
    }

    this.gateway = new AIModelGateway(providers);
  }

  createChatAgent(): ChatAgent {
    return new ChatAgent(this.gateway);
  }

  createToolAgent(tools: ToolContext[]): ToolAgent {
    if (!tools || !Array.isArray(tools)) {
      throw new ConfigurationError("createToolAgent requires an array of tools.");
    }
    return new ToolAgent(this.gateway, tools);
  }
}
