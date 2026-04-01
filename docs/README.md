# Echo AI SDK Documentation Hub

Welcome to the official documentation for the **Echo AI SDK**. This SDK is designed for enterprise-grade customer support, offering robust multimodal AI integrations, PII compliance, omnichannel pipelines, and hyperscaler deployments out-of-the-box.

## 📖 Table of Contents

Whether you are just starting out or architecting a planet-scale AI infrastructure, navigate to the guide that best suits your needs:

### Getting Started Portals
- **[Beginner's Guide](./beginners-guide.md)**: A step-by-step tutorial on bootstrapping your first support bot. Start here if you are new to the framework.
- **[Developer's Guide](./developers-guide.md)**: Advanced architectural designs, extending the core classes, and building custom tool contexts.

### Feature Deep-Dives
- **[Core Bot & Omnichannel](./features/core-bot.md)**: Understanding the `CustomerSupportBot`, connecting Telegram/Slack adapters, and middleware pipelines.
- **[Model Providers (LLMs)](./features/models-providers.md)**: Routing requests across OpenAI, Anthropic, AWS Bedrock, GCP Vertex, and Azure.
- **[Analytics, ROI & PII Compliance](./features/analytics-pii.md)**: Utilizing `ExperimentManager` for A/B testing, ROI outcome trackers, and automated PII Redaction.
- **[Multimodal (TTS & Images)](./features/multimodal.md)**: Interacting with audio generation (`HuggingFaceTTS`) and image synthesis workflows natively within chats.
- **[Cloud Native Deployments](./features/cloud-deployments.md)**: Spinning up dedicated instances on Hugging Face Serverless Endpoints, SageMaker, Vertex AI, or Azure ML directly via the SDK.

---

*For codebase contributions or licensing details, please refer to the primary repository `README.md` and `LICENSE` in the parent directory.*
