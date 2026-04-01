# Analytics, ROI & PII Compliance

Security and ROI tracking differentiate the Echo AI SDK from amateur wrappers. This SDK provides native classes to anonymize user data and map conversation effectiveness.

## Automated PII Redaction
If your deployment processes healthcare (HIPAA) or financial (PCI/SSN) data, the `enablePIIRedaction` configuration will ensure strict proxy scrubbing *before* sending payloads to LLMs.

### Usage
```typescript
const bot = new CustomerSupportBot({
  gateway: new OpenAIProvider(process.env.OPENAI_API_KEY),
  companyName: "Acme Finance",
  enablePIIRedaction: true 
});
```
*Under the hood, `PIIRedactor` uses deterministic RegEx sequences to sanitize strings like `(555) 123-4567` into `[PHONE REDACTED]` and standardizes email extraction seamlessly.*

## A/B Testing (`ExperimentManager`)
When deploying new system prompts or features, you can split traffic dynamically. The `ExperimentManager` utilizes deterministic session hashing to ensure users consistently experience their assigned variant.

### Configuring Variants
Define your variants during bot initialization:

```typescript
import { CustomerSupportBot } from "echo-ai-sdk-ts";

const bot = new CustomerSupportBot({
  gateway: myGateway,
  companyName: "Acme",
  experiments: [
    {
      id: "greeting_style_test_v1",
      variants: [
        { id: "control", weight: 0.5 },
        { id: "enthusiastic", weight: 0.5, systemPromptOverride: "Greet the user with extreme enthusiasm!" }
      ]
    }
  ]
});
```

When tracking the bot's success internally, the `ConversationAnalytics` module will categorize metrics (Resolution Rate, ROI, Call Volume) uniquely by assigned variant!
