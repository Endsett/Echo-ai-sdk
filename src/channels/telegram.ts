import fetch from "cross-fetch";
import { ChannelAdapter, ChannelConfig } from "./base";

/**
 * Pro-grade Telegram Adapter.
 * Uses the Telegram Bot API to connect your AI assistant to Telegram.
 */
export interface TelegramConfig extends ChannelConfig {
  token: string;
}

export class TelegramAdapter extends ChannelAdapter {
  private token: string;
  private polling: boolean = false;
  private offset: number = 0;

  constructor(config: TelegramConfig) {
    super(config);
    this.token = config.token;
  }

  async start(): Promise<void> {
    this.polling = true;
    this.runPollingLoop();
    console.log("[TelegramAdapter] Started polling for updates...");
  }

  async stop(): Promise<void> {
    this.polling = false;
  }

  private async runPollingLoop(): Promise<void> {
    while (this.polling) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`);
        const data = await response.json() as { ok: boolean; result: any[] };

        if (data.ok && data.result && data.result.length > 0) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            if (update.message?.text) {
              const chatId = update.message.chat.id.toString();
              const reply = await this.handleMessage(`tg_${chatId}`, update.message.text);
              await this.sendMessage(chatId, reply);
            }
          }
        }
      } catch (e: any) {
        console.error(`[TelegramAdapter] Error: ${e.message}`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }
}
