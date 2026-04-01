# 1. Installation & Environment Setup

Welcome to the **Echo AI SDK**, the all-in-one AI platform for orchestrating chat, voice, agents, and customer support chatbots.

This guide will walk you through installing the SDK and configuring the necessary API keys to begin building.

## Prerequisites

- Node.js version 18 or higher (Node 20+ strongly recommended).
- TypeScript 5.0+ if using a TS environment.
- An Active API Key from your preferred AI vendor (OpenAI, Anthropic, Google Cloud Vertex, AWS Bedrock, or Hugging Face).

## Installation

You can install the primary SDK using NPM, Yarn, or pnpm.

```bash
npm install echo-ai-sdk zod
```

If you plan on standing up an actual Server or an automated Support Widget, you'll optionally want `express` and `cors` to easily bind your bot to internet traffic:

```bash
npm install express cors
```

### Provider Packages

The `echo-ai-sdk` provides an abstract gateway, meaning you must install the specific runtime dependencies for whichever language model provider you want to utilize. This drastically keeps package sizes down if you only intend to use one provider.

For **OpenAI** (GPT-4, Whisper, TTS):
```bash
npm install openai
```

For **Anthropic** (Claude 3):
```bash
npm install @anthropic-ai/sdk
```

For **Honcho** (Semantic Memory Tracking):
```bash
npm install @honcho-ai/sdk
```

---

## Environment Configuration

Echo AI seamlessly attempts to detect and load keys from `process.env`. If you utilize standard configuration naming, the SDK requires minimal initialization boilerplate. 

Create a `.env` file at the root of your project:

```env
# Primary LLM API Keys
OPENAI_API_KEY=sk-xxxx...
ANTHROPIC_API_KEY=sk-ant-api03...

# Honcho (For production semantic memory and reasoning)
HONCHO_API_KEY=hm-xxxx...

# External Services 
SLACK_BOT_TOKEN=xoxb-xxxx...
SLACK_SIGNING_SECRET=xxx...
TG_TOKEN=xxx:yyy
```

### Next Steps

Now that your dependencies are mapped and your secrets are secured, move on to [Chapter 2: Quickstarts](./02-Quickstart.md) to stand up an interactive chatbot immediately!
