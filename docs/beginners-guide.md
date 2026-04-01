# Beginner's Guide to Echo AI SDK

Welcome to the beginner's guide! This document will walk you through initializing your very first **Customer Support AI Agent**. The SDK is built to be extremely declarative and easy to read.

## Prerequisite
Install the core SDK along with your preferred AI vendor runtime (e.g., OpenAI):
```bash
npm install echo-ai-sdk-ts openai
```

## Step 1: Initialize the Gateway
The gateway sits between the Echo ecosystem and the underlying foundational AI model (GPT-4, Claude 3, Gemini, etc.).

```typescript
import { OpenAIProvider } from "echo-ai-sdk-ts";

// Automatically uses process.env.OPENAI_API_KEY
const gateway = new OpenAIProvider("sk-your-api-key"); 
```

## Step 2: Create the Bot
The `CustomerSupportBot` handles sessions, tool logic, and memory effortlessly so you don't have to write prompt-engineering loops.

```typescript
import { CustomerSupportBot } from "echo-ai-sdk-ts";

const bot = new CustomerSupportBot({
  gateway,
  companyName: "Acme Corp",
  enablePIIRedaction: true, // Hides Social Security Numbers / Credit Cards automatically 
  greeting: "Hi there! Welcome to Acme Corp. How can I assist you today?"
});
```

## Step 3: Start Chatting!
Pass in a unique `sessionId` to keep track of concurrent users interacting with your system.

```typescript
async function run() {
  const sessionId = "user-12345";
  
  // Track the session starting
  bot.initSession(sessionId);

  // Send a message
  const reply = await bot.chat(sessionId, "I want to refund order #998");
  
  console.log("Bot says:", reply);
}

run();
```

---

## What's Next?
Once you possess a functional text bot, proceed to the [Developer's Guide](./developers-guide.md) to explore connecting the bot to **Slack**, enabling **Text-to-Speech (TTS)**, or provisioning custom **Hugging Face** endpoints.
