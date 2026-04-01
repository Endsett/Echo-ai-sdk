import { CustomerSupportBot, SupportBotConfig } from "./bot";

export interface ServerConfig extends SupportBotConfig {
  port?: number;
  corsOrigins?: string | string[];
}

/**
 * Creates a complete Express-compatible request handler for the chatbot.
 * Handles /chat, /analytics, /handoff, and /knowledge ingestion.
 */
export function createChatHandler(bot: CustomerSupportBot) {
  return async (req: any, res: any) => {
    try {
      const { sessionId, message, action, data, score } = req.body;

      // Basic Chat
      if (!action || action === "chat") {
        if (!sessionId || !message) {
          return res.status(400).json({ error: "sessionId and message are required." });
        }
        // Auto-init session in analytics if first seen
        bot.initSession(sessionId);
        const reply = await bot.chat(sessionId, message);
        return res.json({ reply, sessionId });
      }

      // CSAT Recording
      if (action === "csat") {
        if (!sessionId || score === undefined) return res.status(400).json({ error: "sessionId and score are required." });
        bot.analytics.recordCSAT(sessionId, score);
        return res.json({ status: "success" });
      }

      // Analytics Export (Secure this in real apps!)
      if (action === "stats") {
        return res.json(bot.analytics.getSnapshot());
      }

      // Knowledge Ingestion
      if (action === "ingest") {
        if (!bot.knowledgeBase) return res.status(400).json({ error: "KnowledgeBase not configured." });
        const { text, url } = data || {};
        const count = url ? await bot.knowledgeBase.ingestURL(url) : await bot.knowledgeBase.ingestText(text);
        return res.json({ status: "success", chunks: count });
      }

      res.status(400).json({ error: "Invalid action." });
    } catch (e: any) {
      console.error("[ChatHandler Error]", e);
      res.status(500).json({ error: e.message });
    }
  };
}

/**
 * Quick-start: Spins up a minimal Express server with the chatbot endpoints.
 * Requires `express` and `cors` to be installed in the consumer's project.
 */
export async function startChatServer(config: ServerConfig): Promise<void> {
  let express: any;
  let cors: any;
  
  try {
    express = require("express");
    cors = require("cors");
  } catch {
    throw new Error(
      "startChatServer requires 'express' and 'cors'. Install with: npm install express cors @types/express"
    );
  }

  const app = express();
  const port = config.port || 3456;

  app.use(cors({ origin: config.corsOrigins || "*" }));
  app.use(express.json());

  const bot = new CustomerSupportBot(config);
  const handler = createChatHandler(bot);

  app.post("/chat", handler);

  app.get("/health", (_: any, res: any) => {
    res.json({ status: "ok", greeting: bot.greeting });
  });

  app.listen(port, () => {
    console.log(`🤖 Echo AI Chatbot server running on http://localhost:${port}`);
    console.log(`   POST /chat  — Send messages`);
    console.log(`   GET  /health — Health check`);
  });
}
