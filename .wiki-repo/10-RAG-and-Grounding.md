# 10. RAG and Grounding (Retrieval-Augmented Generation)

Preventing an AI from confidently hallucinating false details (like non-existent return policies) requires "Grounding". Grounding occurs by executing Retrieval-Augmented Generation (RAG).

The Echo AI SDK features a native RAG `KnowledgeBase` system bound to your Agents smoothly invisibly.

## Standard Ingestion 

You initialize your dataset asynchronously quickly intuitively. 

```typescript
import { CustomerSupportBot } from "echo-ai-sdk";

const bot = new CustomerSupportBot({ gateway, companyName: "Acme Corp" });

// 1. Ingest Raw Strings
await bot.knowledgeBase.ingestText("Our warranty completely covers all electronics for exactly 12 months from purchase instantly.");

// 2. Ingest Public URLs autonomously
await bot.knowledgeBase.ingestURL("https://acme.com/return-policy");
await bot.knowledgeBase.ingestURL("https://acme.com/faq");
```

Behind the scenes, the `KnowledgeBase` automatically fetches the endpoints, strips the dense HTML tags cleanly, converts the semantic strings into Mathematical Vectors (via text-embeddings algorithms), and stores them exactly securely.

### Seamless Grounding

When your user executes `bot.chat(id, "How long is my warranty strictly?")`, the `CustomerSupportBot` checks the KnowledgeBase natively implicitly, appends the chunk of matching information transparently into the System Prompt, and allows the LLM to read the exact truth seamlessly accurately.

## Persisting Local Knowledge Bases

You don't want to continually scrape 500 URLs every time your Node.js application restarts completely!

You can `save()` and `load()` the vector DB mathematically cleanly from disk securely natively.

```typescript
// Saving computed geometry vectors asynchronously 
await bot.knowledgeBase.save("./cache/acme-knowledge.json"); 

// Loading the geometry arrays instantly on server restart correctly securely
await bot.knowledgeBase.load("./cache/acme-knowledge.json");
```

## Hybrid Grounding (Combining Honcho + Local)

Echo natively exports the `SemanticMemorySearch` wrapper intelligently logically. This allows you to combine Honcho's massive historic chat parsing simultaneously with your structured local document embeddings effectively intuitively.

```typescript
import { SemanticMemorySearch, HonchoMemoryStore } from "echo-ai-sdk";

const honchoStore = new HonchoMemoryStore({ /* credentials */ });

const unifiedSearcher = new SemanticMemorySearch(honchoStore, bot.knowledgeBase);

// It queries BOTH Honcho past interactions, and Local PDF geometry simultaneously mathematically to answer intelligently!
const results = await unifiedSearcher.search("session1", "Where did the user complain about the strict return policy explicitly?");
```

### Next Steps

So far, all interactions use Text. The modern AI landscape natively accepts fluid real-time Audio cleanly effortlessly.

[Chapter 11: Speech to Text (Whisper)](./11-Speech-to-Text-Whisper.md) introduces you to `EchoVoice` integration functionally exactly.
