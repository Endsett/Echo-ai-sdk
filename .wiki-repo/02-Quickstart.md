# 2. Quickstart Guide

This guide covers getting a conversational bot up and running locally, and immediately publishing a chat widget for frontend interfaces.

## The Simplest Server

If you simply want an Echo agent responding to queries on a local port, you can accomplish this with just three lines of configuration.

```typescript
import { startChatServer, AIModelGateway, OpenAIProvider } from "echo-ai-sdk";

// 1. Initialize your preferred foundational model 
const provider = new OpenAIProvider(process.env.OPENAI_API_KEY!);

// 2. Wrap it in a Gateway to handle retries and execution
const gateway = new AIModelGateway([provider]);

// 3. Start the express server
startChatServer({
  gateway: gateway,
  companyName: "Acme Inc",
  companyDescription: "We sell premium widgets.",
  port: 3456
});
```

*When you hit `node index.js`, your server listens at `localhost:3456`.*

## Serving A Chat Widget

The Echo AI SDK has a built-in precompiled Web Component widget that you can automatically spit out and paste into any standard HTML page.

Create a throwaway script to generate the HTML required:

```typescript
import { ChatWidget } from "echo-ai-sdk";

const embedCode = ChatWidget.generate({
  serverEndpoint: "http://localhost:3456", // The port we ran above
  title: "Acme Support",
  subtitle: "We reply instantly ⚡",
  enableVoice: true, // Auto-attaches Microphone API
  theme: {
    primaryColor: "#6366f1",
    position: "bottom-right"
  }
});

console.log(embedCode);
```

### The Output

Pasting this directly into your existing unstyled site automatically renders a beautiful, accessible UI element:

```html
<!-- Paste inside the <body> tag -->
<script src="https://unpkg.com/echo-ai-sdk/dist/widget.js" data-endpoint="http://localhost:3456" data-color="#6366f1"></script>
<echo-chat-widget title="Acme Support"></echo-chat-widget>
```

You now have a fully functional RAG-ready Customer Support integration active over HTTP! 

### Next Steps
Now that you have a server running, let's explore exactly how requests are routed and load-balanced when you have multiple API keys, by looking at [The AI Gateway](./03-The-AI-Gateway.md).
