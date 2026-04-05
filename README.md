# Echo AI SDK

The all-in-one AI platform for chat, voice, agents, and **embeddable customer support chatbots**.

![npm](https://img.shields.io/npm/v/echo-ai-sdk) 
![license](https://img.shields.io/npm/l/echo-ai-sdk) 
![typescript](https://img.shields.io/badge/Language-TypeScript-blue)

## CI/CD Status

### Build & Test
![CI](https://github.com/Endsett/Echo-ai-sdk/workflows/CI/badge.svg)
![Tests](https://github.com/Endsett/Echo-ai-sdk/workflows/Test/badge.svg)
![Coverage](https://codecov.io/gh/Endsett/Echo-ai-sdk/branch/main/graph/badge.svg)

### Quality & Security
![CodeQL](https://github.com/Endsett/Echo-ai-sdk/workflows/CodeQL/badge.svg)
![Security Scan](https://github.com/Endsett/Echo-ai-sdk/workflows/Security/badge.svg)
![Dependency Review](https://github.com/Endsett/Echo-ai-sdk/workflows/Dependency%20Review/badge.svg)

### Release & Publishing
![Release](https://github.com/Endsett/Echo-ai-sdk/workflows/Release/badge.svg)
![npm](https://img.shields.io/npm/dt/echo-ai-sdk)
![GitHub release](https://img.shields.io/github/release/Endsett/Echo-ai-sdk)

### Code Quality
![ESLint](https://img.shields.io/badge/ESLint-passing-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4)

### Performance
![Bundle Size](https://img.shields.io/bundlephobia/minzip/echo-ai-sdk)
![Dependencies](https://img.shields.io/librariesio/dependent-repositories/npm/echo-ai-sdk)

## 🚀 Deploy an AI Chatbot on Your Website in 5 Minutes

```bash
npm install echo-ai-sdk zod openai express cors
```

### Step 1: Create Your Server (3 lines)

```typescript
import { startChatServer, AIModelGateway, OpenAIProvider } from "echo-ai-sdk";

startChatServer({
  gateway: new AIModelGateway([new OpenAIProvider(process.env.OPENAI_API_KEY!)]),
  companyName: "Acme Inc",
  companyDescription: "We sell premium widgets and gadgets.",
  apiConnector: {                          // Optional: connect to your website API
    baseUrl: "https://api.acme.com/v1",
    authToken: process.env.API_TOKEN
  },
  port: 3456
});
```

### Step 2: Embed the Widget on Your Website (1 line)

```typescript
import { ChatWidget } from "echo-ai-sdk";

const embedCode = ChatWidget.generate({
  serverEndpoint: "https://your-server.com",
  title: "Acme Support",
  subtitle: "We reply instantly ⚡",
  enableVoice: true,          // Enable microphone input
  theme: {
    primaryColor: "#6366f1",
    position: "bottom-right"
  }
});

// Paste `embedCode` into your HTML, or serve it dynamically
console.log(embedCode);
```

### Step 3: Done! 🎉

Your website now has a fully functional AI chatbot with **Tier 1 Enterprise Features**:

#### 🧠 RAG Knowledge Base (Eliminate Hallucinations)
Ground your AI in your own data (PDFs, URLs, text).
```typescript
await bot.knowledgeBase.ingestURL("https://acme.com/shipping-policy");
await bot.knowledgeBase.ingestText("Our warranty lasts 2 years...");
```

#### 📊 Conversation Analytics
Track resolution rates, CSAT, token costs, and response times.
```typescript
const stats = bot.analytics.getSnapshot();
console.log(`Resolution Rate: ${stats.resolutionRate * 100}%`);
```

#### 🤝 Human Handoff
Auto-escalate to human agents when the bot detects frustration or explicit requests.
```typescript
const bot = new CustomerSupportBot({
  handoff: {
    webhookUrl: "https://your-helpdesk.com/handoff",
    webhookSecret: "secure_token_123"
  }
});
```

### 🌟 Tier 1 Perfection Features

#### 🧠 RAG Persistence
Ground your bot in your data and keep it there across restarts.
```typescript
await bot.knowledgeBase.ingestText("Your knowledge text here...");
await bot.knowledgeBase.save("./knowledge-base.json"); // Save to disk
await bot.knowledgeBase.load("./knowledge-base.json"); // Load back
```

#### 📊 High-Precision Analytics & Cost Control
Track every penny with accurate token estimation and pricing maps.
```typescript
const stats = bot.analytics.getSnapshot();
console.log(`Total Cost: $${stats.totalCostUsd}`);
console.log(`Handoff Rate: ${stats.handoffRate * 100}%`);
```

#### 🤝 Sentiment-Aware Human Handoff
Detect frustration before it's too late. The bot tracks "negative strikes" and auto-summarizes problems for human agents.
```typescript
const bot = new CustomerSupportBot({
  handoff: {
    webhookUrl: "https://your-helpdesk.com/webhook",
    negativeSentimentThreshold: 3, // Escalates after 3 angry turns
  }
});
```

#### 🔌 Middleware API
Hook into every chat turn to add custom logic, logging, or transformations.
```typescript
bot.use(async ({ sessionId, message }) => {
  console.log(`[Turn] ${sessionId}: ${message}`);
});
```


### 🚀 Tier 2 Pro-Grade Features

#### 🌐 Omnichannel Sync
Connect your bot to Slack and Telegram while maintaining a single user context.
```typescript
import { TelegramAdapter, SlackAdapter } from "echo-ai-sdk";

const tg = new TelegramAdapter({ bot, token: "TG_TOKEN" });
await tg.start();

const slack = new SlackAdapter({ bot, signingSecret: "...", token: "..." });
await slack.start();
```

#### 💾 Persistent Session Store
Move beyond memory. Use `FileSessionStore` for local persistence or implement `SessionStore` for Redis.
```typescript
import { FileSessionStore } from "echo-ai-sdk";
const bot = new CustomerSupportBot({
  sessionStore: new FileSessionStore("./sessions"),
});
```

#### 🧠 Honcho Memory — Semantic, Reasoning-Based Agent Memory
Replace simple in-memory chat history with [Honcho's](https://honcho.dev) production-grade memory system. Your agents gain **cross-session context**, **semantic search**, **entity understanding**, and **continual learning** — all as a drop-in `BaseMemoryStore`.

```typescript
import { HonchoMemoryStore, AgentExecutor } from "echo-ai-sdk";

// Drop-in replacement for InMemoryStore
const memory = new HonchoMemoryStore({
  apiKey: process.env.HONCHO_API_KEY,
  workspaceId: "my-app",
});

const agent = new AgentExecutor({ gateway, memory, tools });

// Agents now automatically persist and recall context across sessions!
```

**Semantic Search** — Find memories by meaning, not keywords:
```typescript
const results = await memory.searchMemory("user", "coding preferences", {
  topK: 5,
  maxDistance: 0.7,
});
// → Synthesized conclusions like "User prefers TypeScript with functional patterns"
```

**Peer Insights** — Ask Honcho what it knows about a user:
```typescript
const insight = await memory.getInsights("user", "What motivates this user?");
// → "The user is motivated by building AI products that help people..."
```

**Unified Semantic Search** — Combine Honcho reasoning with local vector stores:
```typescript
import { SemanticMemorySearch, HonchoMemoryStore } from "echo-ai-sdk";

const search = new SemanticMemorySearch(honchoStore, optionalVectorStore);
const results = await search.search("user", "project architecture");
```

#### 📈 Outcome-Based Billing & ROI
Track the *real value* of your AI by recording business outcomes.
```typescript
// Inside a tool or middleware
bot.trackOutcome(sessionId, "lead_captured", 50.0);

const stats = bot.analytics.getSnapshot();
console.log(`ROI: ${stats.roi * 100}%`);
console.log(`Value Generated: $${stats.totalValueGeneratedUsd}`);
```

---

### 🚀 Tier 3 Advanced Agent Capabilities

#### 🤖 Advanced Reasoning Agents
Go beyond simple tool execution with sophisticated reasoning patterns:

```typescript
import { ReActAgent, CoTAgent, ToTAgent } from "echo-ai-sdk";

// ReAct with Reflection - Thinks before acting
const reactAgent = new ReActAgent({
  gateway,
  memory,
  tools: [searchTool, calculatorTool],
  reactOptions: {
    enableReflection: true,
    confidenceThreshold: 0.8
  }
});

// Chain of Thought - Step-by-step reasoning
const cotAgent = new CoTAgent({
  gateway,
  memory,
  tools: [analysisTool],
  cotOptions: {
    maxSteps: 10,
    requireConclusions: true
  }
});

// Tree of Thoughts - Explores multiple solution paths
const totAgent = new ToTAgent({
  gateway,
  memory,
  tools: [creativeTool],
  totOptions: {
    maxDepth: 4,
    breadth: 3,
    evaluationMethod: "score"
  }
});

// Stream reasoning process
for await (const event of reactAgent.executeStream(sessionId, task)) {
  console.log(`${event.type}: ${event.content}`);
}
```

#### ⚡ Enhanced Parallel Execution
Execute tools simultaneously with dependency resolution:

```typescript
import { EnhancedAgentExecutor, ToolDependency } from "echo-ai-sdk";

const executor = new EnhancedAgentExecutor({
  gateway,
  memory,
  tools: [searchTool, weatherTool, calculatorTool],
  toolDependencies: [
    { toolName: "weather", dependsOn: ["search"] } // Weather needs search results first
  ],
  executionOptions: {
    enableParallel: true,
    maxParallelTools: 5,
    toolTimeout: 10000,
    streamToolResults: true
  }
});

// Tools execute in parallel when possible
const result = await executor.execute(sessionId, complexTask);
```

#### 🔄 Multi-Agent Collaboration
Coordinate multiple agents for complex workflows:

```typescript
import { AgentTeam, AgentOrchestrator, DynamicAgentSelector } from "echo-ai-sdk";

// Create an agent team
const team = new AgentTeam({
  name: "ResearchTeam",
  loadBalancingStrategy: "capability_based",
  communicationProtocol: "direct"
}, memory);

// Register specialized agents
team.registerAgent({
  id: "researcher",
  name: "Research Specialist",
  capabilities: [{ 
    name: "research",
    tools: ["search"],
    reasoningPatterns: ["react"],
    specialties: ["academic_research"]
  }],
  status: "active",
  currentLoad: 0,
  maxConcurrentTasks: 3
});

// Delegate tasks to best agent
const taskId = await team.delegateTask("coordinator", {
  query: "Latest AI research papers",
  analysis: "summarize"
}, {
  capabilities: ["research"],
  maxResponseTime: 5000
});

// Orchestrate complex workflows
const orchestrator = new AgentOrchestrator({}, memory);
const workflow = {
  id: "research_pipeline",
  steps: [
    { id: "collect", requiredCapabilities: ["research"] },
    { id: "analyze", requiredCapabilities: ["analysis"] },
    { id: "summarize", requiredCapabilities: ["summarization"] }
  ],
  orchestrationPattern: "sequential"
};

const executionId = await orchestrator.executeWorkflow(
  workflow.id,
  { topic: "quantum computing" }
);
```

#### 🎯 Dynamic Agent Selection
Automatically select the best agent based on capabilities, performance, and cost:

```typescript
const selector = new DynamicAgentSelector();

// Select best agent for task
const selection = selector.selectAgent(agents, {
  requiredCapabilities: ["analysis", "computation"],
  maxResponseTime: 3000,
  costLimit: 0.10,
  priority: "high"
}, "performance_first");

console.log(`Selected: ${selection.agentId} (score: ${selection.score})`);
console.log(`Reasoning: ${selection.reasoning}`);
```

---

## Installation

```sh
npm install echo-ai-sdk zod
```

You'll need the respective provider SDKs if you wish to utilize them:

```sh
npm install openai @anthropic-ai/sdk
```

## Quick Start (The Facade)

The quickest way to get started is by instantiating the `EchoAI` client. It automatically sniffs your `process.env` for `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` and constructs the highly available gateway.

```typescript
import { EchoAI, calculatorTool } from "echo-ai-sdk";

// Assumes process.env.OPENAI_API_KEY is populated.
const ai = new EchoAI();

const agent = ai.createToolAgent([calculatorTool]);

async function run() {
    const response = await agent.run("session_xyz", "What is 750 multiplied by 14?");
    console.log(response); // AI answers via calculating transparently!
}
run();
```

## Advanced Usage

### Building Your Own Type-Safe Tools

Using standard Zod schemas, we expose `createTool` to automatically synthesize MCP-compliant JSON schemas out-of-the-box.

```typescript
import { z } from "zod";
import { createTool } from "echo-ai-sdk";

export const databaseTool = createTool({
  name: "query_db",
  description: "Execute read-only queries against the replica DB.",
  schema: z.object({
    sql: z.string().describe("The SQL Query syntax.")
  }),
  execute: async ({ sql }) => {
    // Implement your database logic
    return await db.query(sql);
  }
});
```

### Direct Gateway Access (With Retry Backoff!)

If you don't need the Agent Loop and simply want resilient generation or streaming, the Gateway natively features 3-tier exponential backoff under the hood!

```typescript
import { AIModelGateway, OpenAIProvider, ChatRequest } from "echo-ai-sdk";

const gateway = new AIModelGateway([
   new OpenAIProvider(process.env.OPENAI_API_KEY),
   // Add AnthropicProvider to handle OpenAI 500 API errors sequentially
]);

const req: ChatRequest = {
   messages: [{ role: "user", content: "Tell me a story." }],
   model_family: "fast"
};

const stream = gateway.chatStream(req);

for await(const token of stream) {
   process.stdout.write(token);
}
```

### Structured Outputs (Enforcing Zod Schemas)
Need the AI to respond in a strict format?
```typescript
import { z } from 'zod';

const myCustomSchema = z.object({
  analysis: z.string(),
  riskScore: z.number().min(1).max(10)
});

// Forces the agent to output the exact JSON object you requested!
const result = await agent.executeStructured("session123", "Analyze these financial docs...", myCustomSchema);
console.log(result.riskScore); // 100% Type-Safe Numbers!
```

### Telemetry & Tracking
Expose hooks to pipe your LLM metrics safely straight to platforms like Datadog, Grafana, or LangSmith.

```typescript
import { AgentExecutor } from "echo-ai-sdk";

const executor = new AgentExecutor({
  gateway,
  memory,
  tools,
  telemetry: {
    onTokenUsage: (sessionId, provider, model, usage) => console.log(`Burned ${usage.total_tokens} tokens on ${model}!`),
    onToolStart: (sessionId, toolName, args) => console.log(`Agent executing ${toolName}!`)
  }
});
```

## Error Handling

Echo AI SDK embraces explicit semantic exceptions overriding generic javascript errors.

```typescript
import { GatewayRoutingError } from "echo-ai-sdk";

try {
  await gateway.chatComplete(req);
} catch (e) {
  if (e instanceof GatewayRoutingError) {
    console.error("All providers went down. Terminal panic.");
  }
}
```

### Prompt Templates & Registry

Version your prompts like code. Supports immutable registrations, semantic versioning, and instant A/B rollbacks.

```typescript
import { PromptTemplate, PromptRegistry } from "echo-ai-sdk";

const registry = new PromptRegistry();

registry.register(new PromptTemplate({
  name: "greet",
  version: "1.0.0",
  template: "Hello {{name}}, welcome to {{product}}!",
  requiredVars: ["name", "product"]
}));

const prompt = registry.getTemplate("greet");
console.log(prompt.render({ name: "Alex", product: "EchoMind" }));
// → "Hello Alex, welcome to EchoMind!"
```

### Gateway Middleware

Intercept, transform, or log every request and response flowing through the gateway.

```typescript
import { AIModelGateway } from "echo-ai-sdk";

const gateway = new AIModelGateway([...providers]);

gateway.use({
  onRequest: (req) => {
    console.log(`[Audit] Sending ${req.messages.length} messages`);
    return req;
  },
  onResponse: (res, req) => {
    console.log(`[Audit] Used ${res.usage?.total_tokens} tokens`);
    return res;
  },
  onError: (err, provider) => {
    console.error(`[Alert] ${provider} failed: ${err.message}`);
  }
});
```

### Multi-Agent Orchestration

#### AgentPipeline — Sequential Chaining
Chain agents where each stage's output feeds into the next:

```typescript
import { AgentPipeline } from "echo-ai-sdk";

const pipeline = new AgentPipeline()
  .addStage("summarize", summaryAgent)
  .addStage("translate", translatorAgent)
  .addStage("format", formatterAgent);

const result = await pipeline.run("session1", "Raw meeting transcript...");
```

#### AgentRouter — Intent-Based Dispatch
Route user input to specialized agents based on regex patterns:

```typescript
import { AgentRouter } from "echo-ai-sdk";

const router = new AgentRouter()
  .addRoute("support", /help|issue|bug/i, supportAgent)
  .addRoute("sales", /pricing|demo|buy/i, salesAgent)
  .setFallback(generalAgent);

const answer = await router.route("session1", "I need help with billing");
```

### Response Caching

Eliminate redundant API calls with TTL-based caching:

```typescript
import { CachedGateway } from "echo-ai-sdk";

const cached = new CachedGateway(gateway, 120_000); // 2-minute TTL
const response = await cached.chatComplete(req); // Cache MISS → calls API
const again = await cached.chatComplete(req);     // Cache HIT → instant!
```

## 🎤 Voice Features (v1.2.0)

Echo AI SDK provides plug-and-play **Speech-to-Text**, **Text-to-Speech**, and **Speaker Recognition** — all through a single unified client.

### Quick Start — EchoVoice

```typescript
import { EchoVoice } from "echo-ai-sdk";
import fs from "fs";

// Auto-detects OPENAI_API_KEY for Whisper STT & TTS
const voice = new EchoVoice();
```

---

### Speech-to-Text (STT)

Convert audio files to text using OpenAI Whisper:

```typescript
const audioBuffer = fs.readFileSync("meeting.wav");

// Basic transcription
const result = await voice.transcribe(audioBuffer);
console.log(result.text); // → "Welcome to today's meeting..."

// With language hint and timestamps
const detailed = await voice.transcribe(audioBuffer, {
  language: "en",
  timestamps: true,
  temperature: 0.0
});

for (const segment of detailed.segments!) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`);
}
```

#### STT Options Reference

| Option | Type | Description |
|---|---|---|
| `language` | `string` | ISO language code (e.g., `"en"`, `"es"`, `"ja"`) |
| `prompt` | `string` | Guide the model's style or vocabulary |
| `temperature` | `number` | 0.0 (deterministic) to 1.0 (creative) |
| `timestamps` | `boolean` | Enable word-level timing segments |

#### TranscriptionResult Type

```typescript
interface TranscriptionResult {
  text: string;              // Full transcribed text
  language?: string;         // Detected language
  duration?: number;         // Audio duration in seconds
  segments?: {               // Time-aligned segments
    start: number;
    end: number;
    text: string;
    confidence?: number;
  }[];
}
```

---

### Text-to-Speech (TTS)

Convert text to lifelike audio:

```typescript
// Basic synthesis
const speech = await voice.speak("Hello, welcome to EchoMind!");
fs.writeFileSync("greeting.mp3", speech.audio);

// With voice selection and options
const custom = await voice.speak("Breaking news: AI is everywhere.", {
  voice: "nova",        // alloy | echo | fable | onyx | nova | shimmer
  speed: 1.2,           // 0.25x to 4.0x
  format: "opus",       // mp3 | opus | aac | flac | wav | pcm
  model: "tts-1-hd"     // tts-1 (fast) or tts-1-hd (quality)
});
fs.writeFileSync("news.opus", custom.audio);
```

#### TTS Options Reference

| Option | Type | Default | Description |
|---|---|---|---|
| `voice` | `TTSVoice` | `"alloy"` | Voice persona |
| `speed` | `number` | `1.0` | Playback speed (0.25–4.0) |
| `format` | `TTSFormat` | `"mp3"` | Output audio format |
| `model` | `string` | `"tts-1"` | `tts-1` (fast) or `tts-1-hd` (quality) |

#### Available Voices

| Voice | Tone |
|---|---|
| `alloy` | Balanced, neutral |
| `echo` | Warm, conversational |
| `fable` | British, narrative |
| `onyx` | Deep, authoritative |
| `nova` | Energetic, young |
| `shimmer` | Soft, gentle |

---

### Speaker Recognition

Enroll speakers, then identify or verify them from new audio samples. Powered by cosine similarity over voice embeddings.

#### Direct VoiceprintStore Usage (No API Required)

```typescript
import { VoiceprintStore } from "echo-ai-sdk";

const store = new VoiceprintStore(0.80); // 80% match threshold

// Enroll speakers with pre-computed embeddings
store.enroll("spk_001", "Alice", [0.12, 0.84, 0.33, ...]);
store.enroll("spk_002", "Bob",   [0.91, 0.15, 0.67, ...]);

// Identify an unknown speaker
const match = store.identify(unknownEmbedding);
if (match.matched) {
  console.log(`Identified: ${match.speakerName} (${(match.confidence * 100).toFixed(1)}%)`);
} else {
  console.log("Unknown speaker");
}

// Verify a specific speaker
const verification = store.verify("spk_001", audioEmbedding);
console.log(`Verified: ${verification.verified}, Confidence: ${verification.confidence}`);

// Manage speakers
store.listSpeakers();           // → [SpeakerProfile, ...]
store.removeSpeaker("spk_001"); // Remove enrollment
```

#### With EchoVoice Facade (Automatic Embedding Extraction)

```typescript
import { EchoVoice, BaseSpeakerRecognizer } from "echo-ai-sdk";

// Implement your own embedding extractor
class MySpeakerModel extends BaseSpeakerRecognizer {
  get providerName() { return "my-model"; }
  async extractEmbedding(audio: Buffer): Promise<number[]> {
    // Call your ML model, Azure Speaker API, or custom service
    return [0.12, 0.84, 0.33, /* ... */];
  }
}

const voice = new EchoVoice({ recognizer: new MySpeakerModel() });

// Enroll from raw audio
await voice.enrollSpeaker("spk_001", "Alice", aliceAudioBuffer);

// Identify from new audio
const who = await voice.identifySpeaker(unknownAudioBuffer);
console.log(who.speakerName); // → "Alice"

// Verify a specific person
const check = await voice.verifySpeaker("spk_001", testAudioBuffer);
console.log(check.verified); // → true
```

---

### Bring Your Own Provider

All voice components are fully pluggable. Implement the abstract base classes to use any provider:

```typescript
import { BaseSTTProvider, BaseTTSProvider, EchoVoice } from "echo-ai-sdk";

// Custom Deepgram STT
class DeepgramSTT extends BaseSTTProvider {
  get providerName() { return "deepgram"; }
  async transcribe(audio: Buffer, options?) {
    // Your Deepgram integration
    return { text: "transcribed text" };
  }
}

// Custom ElevenLabs TTS
class ElevenLabsTTS extends BaseTTSProvider {
  get providerName() { return "elevenlabs"; }
  async synthesize(text: string, options?) {
    // Your ElevenLabs integration
    return { audio: Buffer.from([]), format: "mp3" as const };
  }
}

// Plug them in
const voice = new EchoVoice({
  stt: new DeepgramSTT(),
  tts: new ElevenLabsTTS()
});
```

---

## Complete API Reference

### Core Classes

| Class | Description |
|---|---|
| `EchoAI` | Main client facade for LLM chat & agents |
| `EchoVoice` | Unified voice client (STT + TTS + Speaker Recognition) |
| `AIModelGateway` | Multi-provider gateway with failover & backoff |
| `AgentExecutor` | ReAct autonomous agent loop with tool execution |
| `CachedGateway` | TTL-based response caching wrapper |

### Agent Classes

| Class | Description |
|---|---|
| `ChatAgent` | Simple conversational agent |
| `ToolAgent` | Agent with tool-calling capabilities |
| `AgentPipeline` | Sequential multi-agent chaining |
| `AgentRouter` | Intent-based agent routing |

### Voice Classes

| Class | Description |
|---|---|
| `OpenAIWhisperSTT` | Whisper-based speech-to-text |
| `OpenAITTS` | OpenAI text-to-speech (6 voices) |
| `VoiceprintStore` | Speaker enrollment & cosine similarity matching |
| `BaseSTTProvider` | Abstract STT provider (extend for custom) |
| `BaseTTSProvider` | Abstract TTS provider (extend for custom) |
| `BaseSpeakerRecognizer` | Abstract speaker embedding extractor |

### Error Classes

| Exception | When It Fires |
|---|---|
| `GatewayRoutingError` | All providers exhausted |
| `ConfigurationError` | Missing API keys or invalid setup |
| `ValidationError` | Invalid inputs to any public API |
| `ToolExecutionError` | Tool fails during agent loop |
| `AgentIterationLimitError` | Agent exceeds max iterations |
| `StructuredOutputError` | LLM output fails JSON parsing |
| `PromptVersionError` | Invalid semver or duplicate prompt version |

### Utilities

| Class/Function | Description |
|---|---|
| `createTool` | Zod-to-MCP tool factory |
| `PromptTemplate` | Versioned prompt with mustache rendering |
| `PromptRegistry` | Prompt version management with A/B rollback |
| `InMemoryStore` | Session-based conversation memory |
| `HonchoMemoryStore` | Production-grade Honcho-powered semantic memory store |
| `SemanticMemorySearch` | Unified search across Honcho reasoning + local vectors |
| `AgentTelemetry` | Lifecycle hooks interface for APM integration |

## License
MIT © EchoMind Team
