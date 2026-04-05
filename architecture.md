# Echo AI SDK Architecture

The Echo AI SDK is a modular, enterprise-grade framework designed to handle the entire lifecycle of Large Language Model (LLM) orchestration, from simple conversational agents to advanced multi-agent systems, multimodal interactions (Voice/Image), and production deployments.

This document serves as a high-level technical map of the SDK, explaining how each subsystem functions, when to use it, and where the source code is located.

## 1. The Core Client (`src/client.ts`)
**What it is:** The primary entry point. The `EchoAI` class is a high-level facade that auto-configures providers based on environment variables.
**When to use it:** Always. This is how you instantiate your interaction with the SDK.
**How it works:** It checks `process.env` (via `src/core/config`), initializes the `AIModelGateway`, and wraps factory methods to generate `ChatAgent` or `ToolAgent` instances natively.

## 2. Models & Providers (`src/models/`, `src/deployment/`)
**What it is:** The abstraction layer over specific AI vendor APIs.
**When to use it:** When you need to specify exactly *who* fulfills your completions (e.g., OpenAI, Anthropic, AWS Bedrock, GCP Vertex, Azure ML).
**How it works:** Each provider extends `BaseProvider`, conforming their unique REST APIs to Echo's strict internal schemas. The `deployment/` interfaces allow deploying to managed self-hosted instances (HuggingFace, SageMaker).

## 3. The AI Gateway (`src/gateway/`)
**What it is:** The resilience and routing layer.
**When to use it:** Required internally. You configure it when initializing `EchoAI` to handle multi-LLM failovers securely.
**How it works:** The `AIModelGateway` accepts an array of prioritized providers. If `Provider A` rate-limits or times out, it utilizes exponential backoff (`src/core/resilience`) and instantly reroutes the request to `Provider B`.

## 4. Agents & Orchestration (`src/agents/`)
**What it is:** The logic executors that utilize tools or process sequences.
**When to use it:** When you are building actual application logic.
**How it works:** 
- `ChatAgent`: Simple stateless chat responder.
- `ToolAgent`: Wraps the gateway to handle JSON schema (Zod) autonomous function executions.
- `AgentPipeline`: Processes inputs sequentially through multiple agents (e.g., Translate -> Summarize).
- `AgentRouter`: Regex or Intent-based dispatching of user inputs to specific specialized Agents.

## 5. Tools & Actions (`src/tools/`)
**What it is:** The "hands" of the LLM.
**When to use it:** When your agent needs to query a Database, call a REST API, or do math.
**How it works:** You define variables strongly typing with Zod schemas using `createTool`. The SDK intercepts LLM "function calls" and maps them reliably and natively into your asynchronous JavaScript callbacks.

## 6. Memory & State (`src/memory/`, `src/core/session`)
**What it is:** Tracking conversation history over time.
**When to use it:** Always, unless building a pure "one-shot" translation utility. 
**How it works:** 
- `InMemoryStore` / `FileSessionStore`: Standard array keeping.
- `HonchoMemoryStore`: True Semantic reasoning. Stores entities and continuously learns across sessions globally natively.
- `SessionManager`: Manages TTLs natively inside `src/core/session`.

## 7. RAG & Grounding (`src/rag/`)
**What it is:** Injecting specific local knowledge securely.
**When to use it:** When you need the bot to reference private documents (like local PDFs or Returns Policies).
**How it works:** The `KnowledgeBase` dynamically parses URLs/strings, creates embeddings via math, and allows `SemanticMemorySearch` algorithms to append the closest matching contexts securely to the `SystemPrompt`.

## 8. Voice & Multimodal (`src/voice/`, `src/multimodal/`)
**What it is:** Native Audio and Image synthesis.
**When to use it:** Telephone integrations, accessibility widgets, or generating assets.
**How it works:** `EchoVoice` securely wraps Whisper STT transcription natively. The `VoiceprintStore` enables identifying users mathematically using Cosine Similarity natively cleanly. `tts` directly outputs Opus audio buffers from text.

## 9. Analytics & Observability (`src/analytics/`)
**What it is:** Enterprise tracking. 
**When to use it:** When deploying to production strictly accurately securely cleanly.
**How it works:** Logs precise Token configurations, tracks actual Dollar Value USD securely. `AgentTelemetry` pushes lifecycle webhooks out to DataDog/LangSmith explicitly seamlessly. `Redact` algorithms prevent PII leakage seamlessly.

## 10. Channels (`src/channels/`)
**What it is:** Pre-built platform hooks.
**When to use it:** When making a Slack/Telegram bot directly logically explicitly.
**How it works:** Handles Express/Socket mappings securely smoothly flawlessly automatically seamlessly natively to your Agent routes appropriately.
