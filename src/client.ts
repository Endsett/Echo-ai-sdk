import { settings } from "./core/config";
import { AIModelGateway } from "./gateway/router";
import { OpenAIProvider } from "./models/openai";
import { AnthropicProvider } from "./models/anthropic";
import { BaseProvider } from "./models/base";
import { ChatAgent, ToolAgent } from "./agents/prebuilt";
import { ToolContext } from "./tools/base";
import { ConfigurationError } from "./core/exceptions";

/**
 * Main entry point for the Echo AI SDK.
 * 
 * The EchoAI class provides a unified interface to interact with multiple AI providers.
 * It automatically detects available API keys from environment variables or allows manual provider injection.
 * 
 * @example
 * ```typescript
 * // Auto-detect providers from environment
 * const ai = new EchoAI();
 * 
 * // Or manually specify providers
 * const ai = new EchoAI({
 *   providers: [
 *     new OpenAIProvider(process.env.OPENAI_API_KEY),
 *     new AnthropicProvider(process.env.ANTHROPIC_API_KEY)
 *   ]
 * });
 * ```
 */
export class EchoAI {
  /** The AI model gateway that manages provider routing */
  public gateway: AIModelGateway;

  /**
   * Creates a new EchoAI instance.
   * 
   * @param options - Configuration options
   * @param options.providers - Optional array of AI providers to use. If not provided, will auto-detect from environment variables.
   * @throws {ConfigurationError} When no providers are configured
   */
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

  /**
   * Creates a new ChatAgent instance for conversational AI interactions.
   * 
   * @returns A ChatAgent instance configured with the AI gateway
   * 
   * @example
   * ```typescript
   * const ai = new EchoAI();
   * const agent = ai.createChatAgent();
   * const response = await agent.chat("Hello, how are you?");
   * console.log(response.content);
   * ```
   */
  createChatAgent(): ChatAgent {
    return new ChatAgent(this.gateway);
  }

  /**
   * Creates a new ToolAgent instance with function calling capabilities.
   * 
   * @param tools - An array of tool contexts that the agent can use
   * @returns A ToolAgent instance configured with the AI gateway and tools
   * @throws {ConfigurationError} When tools is not a valid array
   * 
   * @example
   * ```typescript
   * const ai = new EchoAI();
   * const tools = [createTool({
   *   name: "get_weather",
   *   description: "Get the current weather",
   *   schema: z.object({ location: z.string() }),
   *   handler: async ({ location }) => {
   *     return fetchWeather(location);
   *   }
   * })];
   * 
   * const agent = ai.createToolAgent(tools);
   * const response = await agent.chat("What's the weather in Tokyo?");
   * ```
   */
  createToolAgent(tools: ToolContext[]): ToolAgent {
    if (!tools || !Array.isArray(tools)) {
      throw new ConfigurationError("createToolAgent requires an array of tools.");
    }
    return new ToolAgent(this.gateway, tools);
  }
}
