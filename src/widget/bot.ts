import { createTool, ToolContext } from "../tools/base";
import { z } from "zod";
import { AgentExecutor } from "../agents/executor";
import { AIModelGateway } from "../gateway/router";
import { InMemoryStore, BaseMemoryStore } from "../memory/store";
import { APIConnector, APIConnectorConfig } from "./connector";
import { AgentTelemetry } from "../core/telemetry";
import { KnowledgeBase, KnowledgeBaseConfig } from "../rag";
import { ConversationAnalytics } from "../analytics/tracker";
import { HandoffManager, HandoffConfig } from "../analytics/handoff";
import { SessionStore, MemorySessionStore } from "../core/session";
import { OutcomeTracker } from "../analytics/outcome";
import { PIIRedactor } from "../analytics/redact";
import { ExperimentManager, Experiment } from "../analytics/experiment";
import { HuggingFaceTTS, TTSConfig } from "../multimodal/tts";
import { HuggingFaceImageGen, ImageGenConfig } from "../multimodal/image_gen";

export interface SupportBotConfig {
  gateway: AIModelGateway;
  companyName: string;
  companyDescription?: string;
  apiConnector?: APIConnectorConfig;
  knowledgeBase?: KnowledgeBaseConfig;
  handoff?: HandoffConfig;
  memory?: BaseMemoryStore;
  telemetry?: AgentTelemetry;
  customTools?: ToolContext[];
  sessionStore?: SessionStore;
  greeting?: string;
  systemPrompt?: string;
  maxIterations?: number;
  enablePIIRedaction?: boolean;
  experiments?: Experiment[];
  tts?: TTSConfig;
  imageGen?: ImageGenConfig;
}

export type BotMiddleware = (ctx: { sessionId: string; message: string; bot: CustomerSupportBot }) => Promise<void | string>;

/**
 * Pre-configured customer support chatbot agent.
 * Connects to your website API, answers questions, uses a RAG knowledge base,
 * tracks analytics, and handles human handoffs.
 */
export class CustomerSupportBot {
  private executor: AgentExecutor;
  private connector?: APIConnector;
  public knowledgeBase?: KnowledgeBase;
  public analytics: ConversationAnalytics;
  public outcomeTracker: OutcomeTracker;
  public sessionStore: SessionStore;
  public handoff?: HandoffManager;
  public piiRedactor?: PIIRedactor;
  public experimentManager?: ExperimentManager;
  public ttsEngine?: HuggingFaceTTS;
  public imageGenEngine?: HuggingFaceImageGen;
  public greeting: string;
  private defaultSystemPrompt: string;
  private middlewares: BotMiddleware[] = [];

  constructor(config: SupportBotConfig) {
    this.outcomeTracker = new OutcomeTracker();
    this.analytics = new ConversationAnalytics(this.outcomeTracker);
    this.sessionStore = config.sessionStore || new MemorySessionStore();
    
    if (config.knowledgeBase) {
      this.knowledgeBase = new KnowledgeBase(config.knowledgeBase);
    }

    if (config.handoff) {
      this.handoff = new HandoffManager(config.handoff);
    }

    if (config.enablePIIRedaction) {
      this.piiRedactor = new PIIRedactor();
    }

    if (config.experiments && config.experiments.length > 0) {
      this.experimentManager = new ExperimentManager(config.experiments);
    }

    if (config.tts) {
      this.ttsEngine = new HuggingFaceTTS(config.tts);
    }

    const tools: ToolContext[] = [];

    if (config.imageGen) {
      this.imageGenEngine = new HuggingFaceImageGen(config.imageGen);
      tools.push(this.imageGenEngine.asTool());
    }

    // ... (tool building logic same as before)
    if (config.apiConnector) {
      this.connector = new APIConnector(config.apiConnector);
      const connector = this.connector;
      tools.push(createTool({
        name: "query_website_api",
        description: `Fetches live data from the ${config.companyName} website API. Use this to find real-time product info, pricing, order status, FAQs, and any live data the customer asks about.`,
        schema: z.object({
          endpoint: z.string().describe("The API endpoint path, e.g., '/products', '/orders/123', '/faq'"),
          method: z.enum(["GET", "POST"]).default("GET").describe("HTTP method"),
          body: z.any().optional().describe("Request body for POST requests"),
        }),
        execute: async ({ endpoint, method, body }) => {
          const result = method === "POST" 
            ? await connector.post(endpoint, body)
            : await connector.get(endpoint);
          
          if (!result.ok) return `API returned error (${result.status}): ${JSON.stringify(result.data)}`;
          return JSON.stringify(result.data, null, 2);
        }
      }));
    }

    if (config.customTools) tools.push(...config.customTools);

    const defaultSystemPrompt = `You are a friendly and professional AI customer support agent for ${config.companyName}.
${config.companyDescription ? `About the company: ${config.companyDescription}` : ""}

Your role:
- Answer customer questions helpfully and accurately
- Use the query_website_api tool to fetch live data when the customer asks about products, orders, pricing, policies, or anything that requires real-time information
- Use the provided context from the knowledge base to answer factual questions
- Be concise but thorough
- If you can't find an answer, politely suggest contacting human support
- Always maintain a warm, professional tone
- Never make up data — always verify through the API or context when available`;

    this.defaultSystemPrompt = config.systemPrompt || defaultSystemPrompt;

    this.executor = new AgentExecutor({
      gateway: config.gateway,
      memory: config.memory || new InMemoryStore(100),
      tools,
      systemPrompt: this.defaultSystemPrompt,
      telemetry: config.telemetry,
    });

    this.greeting = config.greeting || `Hello! 👋 Welcome to ${config.companyName}. How can I help you today?`;
  }

  /** Register a middleware function to run before every chat turn. */
  use(middleware: BotMiddleware): void {
    this.middlewares.push(middleware);
  }

  /** Record a business outcome for ROI tracking. */
  trackOutcome(sessionId: string, type: string, valueUsd: number = 0, metadata?: Record<string, any>): void {
    this.outcomeTracker.record(sessionId, type, valueUsd, metadata);
  }

  /** Process a customer message and return the bot's response. */
  async chat(sessionId: string, message: string): Promise<string> {
    const activeMessage = this.piiRedactor ? this.piiRedactor.redact(message) : message;

    let variantId: string | undefined;
    if (this.experimentManager) {
      variantId = this.experimentManager.assignVariant("default_experiment", sessionId) || undefined;
      // If variant has a custom prompt, apply it
      if (variantId) {
        const config = this.experimentManager.getVariantConfig("default_experiment", variantId);
        if (config && config.systemPrompt) {
          // Temporarily override for this session if supported, or apply globally if standardizing.
          // Note: Full dynamic session-based prompts usually require passing it per-execution.
          // For now, we update the executor's prompt before execution if it differs (simplified).
          (this.executor as any).systemPrompt = config.systemPrompt;
        } else {
          (this.executor as any).systemPrompt = this.defaultSystemPrompt;
        }
      }
    }

    this.analytics.startConversation(sessionId, "gpt-4o-mini", variantId);
    this.analytics.recordQuery(sessionId, activeMessage);
    const startTime = Date.now();

    // 0. Run middlewares
    for (const mw of this.middlewares) {
      const result = await mw({ sessionId, message: activeMessage, bot: this });
      if (typeof result === "string") return result; 
    }

    // 1. Check for handoff triggers
    if (this.handoff) {
      const trigger = this.handoff.shouldEscalate(sessionId, activeMessage);
      if (trigger) {
        const history = await (this.executor as any).memory.getMessages(sessionId);
        
        let summary = "Customer needs assistance.";
        try {
          summary = await (this.executor as any).gateway.chat([
            { role: "system", content: "Summarize the customer's problem in one concise sentence for a human support agent context." },
            ...history,
            { role: "user", content: activeMessage }
          ]);
        } catch {}

        const reply = await this.handoff.escalate(sessionId, trigger, history, activeMessage, summary);
        this.analytics.markHandedOff(sessionId);
        return reply;
      }
    }

    // 2. Inject RAG context
    let enhancedMessage = activeMessage;
    if (this.knowledgeBase) {
      const context = await this.knowledgeBase.query(activeMessage);
      if (context) {
        enhancedMessage = `Context from Knowledge Base:\n${context}\n\nUser Question: ${activeMessage}`;
      }
    }

    // 3. Execute chat
    try {
      const reply = await this.executor.execute(sessionId, enhancedMessage, 8);
      
      this.analytics.recordResponse(sessionId, reply, Date.now() - startTime);
      
      // PERSISTENCE: Save session state to store after each turn
      const history = await this.executor.getMemory().getMessages(sessionId);
      await this.sessionStore.set(sessionId, { history, lastUpdated: Date.now() });

      return reply;
    } catch (e: any) {
      if (this.handoff) {
        return this.handoff.escalate(sessionId, "low_confidence", [], activeMessage, `Error: ${e.message}`);
      }
      throw e;
    }
  }

  /**
   * Process a customer message and return both text and a spoken audio Buffer using the TTS engine.
   */
  async chatWithVoice(sessionId: string, message: string): Promise<{ text: string, audio?: Buffer }> {
    const text = await this.chat(sessionId, message);
    let audio: Buffer | undefined = undefined;

    if (this.ttsEngine && text) {
      // Stripping markdown like base64 images before reading aloud
      const cleanText = text.replace(/!\[.*?\]\(.*?\)/g, "").trim();
      if (cleanText) {
        audio = await this.ttsEngine.generateBuffer(cleanText);
      }
    }

    return { text, audio };
  }

  /** Start tracking analytics for a new session. */
  initSession(sessionId: string): void {
    this.analytics.startConversation(sessionId);
  }
}
