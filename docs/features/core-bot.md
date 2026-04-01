# Core Bot & Omnichannel Architecture

The core philosophy of the Echo AI SDK hinges upon separating the *Model Hardware* from the *Chat Logic*. 

## The `CustomerSupportBot` Engine
Located within `src/widget/bot.ts`, this singleton processes:
1. **Middleware intercepts**: Pre-evaluating strings.
2. **Experiment variants**: Mapping A/B tests to the current user (see [Analytics & PII](./analytics-pii.md)).
3. **Tool resolution**: Executing infinite autonomous multi-tool loops against your APIs reliably.

## Omnichannel Adapters
Enterprise tools cannot live purely in a web-chat interface. Echo provides robust channel mapping configurations.

### Connecting to Slack
Use `SlackAdapter` to map `CustomerSupportBot` sessions straight into workplace DMs or Channels.
```typescript
import { SlackAdapter } from "echo-ai-sdk-ts";

const slack = new SlackAdapter({
  botToken: "xoxb-...",
  signingSecret: "xyz..."
}, mySupportBot);

slack.start(); // Initiates listening server
```

### Connecting to Telegram
Similarly, you can map the bot exclusively to consumer platforms utilizing the standard polling routines.
```typescript
import { TelegramAdapter } from "echo-ai-sdk-ts";

const telegram = new TelegramAdapter({
  token: "12345:ABC-DEF..."
}, mySupportBot);

telegram.start();
```

*For multimodality details regarding sending Voice APIs natively across these channels, visit the [Multimodal Features](./multimodal.md) file.*
