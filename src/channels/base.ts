import { CustomerSupportBot } from "../widget/bot";

/**
 * Base configuration for any channel adapter.
 */
export interface ChannelConfig {
  bot: CustomerSupportBot;
  enabled?: boolean;
}

/**
 * Unified interface for messaging channels (Slack, Telegram, WhatsApp).
 */
export abstract class ChannelAdapter {
  protected bot: CustomerSupportBot;

  constructor(config: ChannelConfig) {
    this.bot = config.bot;
  }

  /** Initialize the channel listener/connection. */
  abstract start(): Promise<void>;

  /** Stop the channel listener. */
  abstract stop(): Promise<void>;

  /** 
   * Normalize incoming messages from different platforms 
   * and route them to the core bot brain.
   */
  protected async handleMessage(sessionId: string, text: string): Promise<string> {
    return this.bot.chat(sessionId, text);
  }
}
