import fetch from "cross-fetch";
import { ValidationError } from "../core/exceptions";

export interface APIConnectorConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  authToken?: string;
  timeout?: number;
}

export interface FetchResult {
  status: number;
  data: any;
  ok: boolean;
}

/**
 * Connects the chatbot to your website's API to fetch live data.
 * The bot can query your endpoints to answer customer questions with real data.
 */
export class APIConnector {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: APIConnectorConfig) {
    if (!config.baseUrl) throw new ValidationError("APIConnector", "baseUrl is required.");
    
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout || 10000;
    this.headers = {
      "Content-Type": "application/json",
      ...config.headers,
    };
    if (config.authToken) {
      this.headers["Authorization"] = `Bearer ${config.authToken}`;
    }
  }

  async get(endpoint: string): Promise<FetchResult> {
    return this.request("GET", endpoint);
  }

  async post(endpoint: string, body: any): Promise<FetchResult> {
    return this.request("POST", endpoint, body);
  }

  private async request(method: string, endpoint: string, body?: any): Promise<FetchResult> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => response.text());
      return { status: response.status, data, ok: response.ok };
    } catch (e: any) {
      return { status: 0, data: `Request failed: ${e.message}`, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
}
