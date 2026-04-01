import fetch from "cross-fetch";
export interface EndpointConfig {
    accountId: string;          // Hugging Face organization or username
    repository: string;         // e.g., "meta-llama/Meta-Llama-3-8B-Instruct"
    accelerator?: string;       // e.g., "gpu", "cpu"
    instanceSize?: string;      // e.g., "small", "medium", "large"
    instanceType?: string;      // e.g., "aws", "gcp" 
    framework?: "pytorch" | "tensorflow" | "custom";
}

/**
 * Manages Serverless / Dedicated Endpoints on Hugging Face API.
 * Uses REST API since @huggingface/inference is primarily for making queries.
 */
export class InferenceEndpointManager {
    private token: string;
    private baseUrl = "https://api.endpoints.huggingface.cloud/v2";

    constructor(token: string) {
        this.token = token;
    }

    private get headers() {
        return {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json"
        };
    }

    /**
     * Programmatically creates a dedicated inference endpoint.
     */
    async createEndpoint(name: string, config: EndpointConfig): Promise<any> {
        const url = `${this.baseUrl}/endpoint/${config.accountId}`;
        
        const payload = {
            name,
            repository: config.repository,
            compute: {
                accelerator: config.accelerator || "gpu",
                instanceSize: config.instanceSize || "small",
                instanceType: config.instanceType || "aws",
                scaling: {
                    minReplica: 0,
                    maxReplica: 1
                }
            },
            model: {
                framework: config.framework || "pytorch",
                image: {
                    huggingface: {}
                }
            }
        };

        const res = await fetch(url, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to create HF Endpoint: ${res.statusText} - ${err}`);
        }

        return await res.json();
    }

    /**
     * Retrieves the status of an existing endpoint (e.g. "pending", "running", "paused").
     */
    async getEndpointStatus(accountId: string, endpointName: string): Promise<string> {
        const url = `${this.baseUrl}/endpoint/${accountId}/${endpointName}`;
        const res = await fetch(url, { headers: this.headers });
        if (!res.ok) throw new Error("Could not fetch endpoint status");
        
        const data = await res.json() as any;
        return data.status.state; // pending, initializing, running, paused
    }

    /**
     * Pauses a running endpoint to save costs.
     */
    async pauseEndpoint(accountId: string, endpointName: string): Promise<void> {
        const url = `${this.baseUrl}/endpoint/${accountId}/${endpointName}/pause`;
        const res = await fetch(url, { method: "POST", headers: this.headers });
        if (!res.ok) throw new Error("Failed to pause endpoint");
    }

    /**
     * Resumes a paused endpoint.
     */
    async resumeEndpoint(accountId: string, endpointName: string): Promise<void> {
        const url = `${this.baseUrl}/endpoint/${accountId}/${endpointName}/resume`;
        const res = await fetch(url, { method: "POST", headers: this.headers });
        if (!res.ok) throw new Error("Failed to resume endpoint");
    }
}
