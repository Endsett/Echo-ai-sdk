import fetch from "cross-fetch";
import * as crypto from "node:crypto";

/**
 * Advanced Human Handoff Manager.
 * Detects escalation triggers (frustration, sentiment, max turns) 
 * and dispatches to external helpdesks via webhooks with HMAC security.
 */

export type EscalationTrigger = "explicit_request" | "low_confidence" | "frustration" | "sentiment" | "max_turns" | "keyword";

export interface HandoffEvent {
  sessionId: string;
  trigger: EscalationTrigger;
  conversationHistory: { role: string; content: string }[];
  customerMessage: string;
  summary?: string;          // AI-generated summary of the problem
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface HandoffConfig {
  webhookUrl?: string;
  webhookSecret?: string;
  maxTurnsBeforeHandoff?: number;
  negativeSentimentThreshold?: number; // Escalates after X negative turns
  frustrationKeywords?: string[];
  explicitKeywords?: string[];
  onHandoff?: (event: HandoffEvent) => void | Promise<void>;
  offlineMessage?: string;
}

export class HandoffManager {
  private webhookUrl?: string;
  private webhookSecret?: string;
  private maxTurns: number;
  private sentimentThreshold: number;
  private frustrationKeywords: string[];
  private explicitKeywords: string[];
  private onHandoff?: (event: HandoffEvent) => void | Promise<void>;
  public offlineMessage: string;
  private turnCounts = new Map<string, number>();
  private negativeStrikes = new Map<string, number>();

  constructor(config: HandoffConfig) {
    this.webhookUrl = config.webhookUrl;
    this.webhookSecret = config.webhookSecret;
    this.maxTurns = config.maxTurnsBeforeHandoff || 10;
    this.sentimentThreshold = config.negativeSentimentThreshold || 3;
    this.onHandoff = config.onHandoff;
    this.offlineMessage = config.offlineMessage ||
      "Our team is currently offline. We've saved your conversation and will get back to you via email within 24 hours.";

    this.frustrationKeywords = config.frustrationKeywords || [
      "this is useless", "terrible", "worst", "hate this", "f**k", "stupid bot",
      "not helpful", "waste of time", "garbage", "trash", "awful", "horrible"
    ];

    this.explicitKeywords = config.explicitKeywords || [
      "talk to a human", "human agent", "speak to someone", "real person",
      "customer service", "live agent", "transfer me", "connect me",
      "speak to a representative", "help desk", "support team"
    ];
  }

  /** Detect negative sentiment in a message (simple rule-based). */
  private isNegative(message: string): boolean {
    const lower = message.toLowerCase();
    const hasNegativeWords = this.frustrationKeywords.some(kw => lower.includes(kw));
    const hasLotsOfExclamations = (message.match(/!/g) || []).length > 2;
    const isMostlyCaps = message.length > 5 && message === message.toUpperCase();
    
    return hasNegativeWords || hasLotsOfExclamations || isMostlyCaps;
  }

  /** Check if a message should trigger handoff. Returns the trigger type or null. */
  shouldEscalate(sessionId: string, message: string): EscalationTrigger | null {
    const lower = message.toLowerCase();

    // 1. Explicit human request
    if (this.explicitKeywords.some(kw => lower.includes(kw))) {
      return "explicit_request";
    }

    // 2. Frustration detection (strikes)
    if (this.isNegative(message)) {
      const strikes = (this.negativeStrikes.get(sessionId) || 0) + 1;
      this.negativeStrikes.set(sessionId, strikes);
      if (strikes >= this.sentimentThreshold) return "sentiment";
      return "frustration";
    }

    // 3. Max turns exceeded
    const turns = (this.turnCounts.get(sessionId) || 0) + 1;
    this.turnCounts.set(sessionId, turns);
    if (turns >= this.maxTurns) {
      return "max_turns";
    }

    return null;
  }

  /** Execute the handoff: fire webhook, invoke callback, return user message. */
  async escalate(
    sessionId: string,
    trigger: EscalationTrigger,
    conversationHistory: { role: string; content: string }[],
    customerMessage: string,
    summary?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const event: HandoffEvent = {
      sessionId,
      trigger,
      conversationHistory,
      customerMessage,
      summary,
      timestamp: Date.now(),
      metadata,
    };

    if (this.webhookUrl) await this.dispatchWebhook(event);
    if (this.onHandoff) await this.onHandoff(event);

    this.turnCounts.delete(sessionId);
    this.negativeStrikes.delete(sessionId);

    const triggerMessages: Record<EscalationTrigger, string> = {
      explicit_request: "I'm connecting you with a member of our support team now. They'll have the full context of our conversation. Please hold for a moment! 🙋",
      frustration: "I understand this is frustrating, and I want to make sure you get the best help. Let me connect you with a team member who can assist you directly. 🤝",
      sentiment: "I can see you're having a tough time getting the answer you need. I'm transferring you to a human agent who can take it from here. 🤝",
      low_confidence: "This is a great question that I want to make sure gets answered perfectly. Let me bring in a specialist from our team. 🎯",
      max_turns: "It seems like this needs a more detailed look. Let me transfer you to our support team who can dive deeper into this for you. 📋",
      keyword: "Let me connect you with the right team member to help with this. One moment! 🔄",
    };

    return triggerMessages[trigger];
  }

  private async dispatchWebhook(event: HandoffEvent): Promise<void> {
    const body = JSON.stringify(event);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (this.webhookSecret) {
      const hmac = crypto.createHmac("sha256", this.webhookSecret);
      hmac.update(body);
      headers["X-Webhook-Signature"] = `sha256=${hmac.digest("hex")}`;
    }

    try {
      await fetch(this.webhookUrl!, { method: "POST", headers, body });
    } catch (e: any) {
      console.error(`[HandoffManager] Webhook dispatch failed: ${e.message}`);
    }
  }
}
