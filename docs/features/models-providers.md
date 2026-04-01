# Model Providers & Hyperscalers

The `echo-ai-sdk-ts` relies on the `AIModelGateway` schema, enforcing a strict boundary for LLM interaction models capable of function-calling.

## Standard Cloud Vendor Integration
Depending on your enterprise contracts, you can leverage native SDK objects immediately:

- **OpenAI**: `OpenAIProvider`
- **Anthropic**: `AnthropicProvider` (Claude 3.5 Opus / Sonnet natively parses tool calls)
- **AWS Bedrock**: `AwsBedrockProvider`
- **GCP Vertex AI**: `GcpVertexProvider` (Connects seamlessly to the Gemini APIs)
- **Azure OpenAI**: `AzureOpenAiProvider` (Best for HIPAA compliant, strict data-residency environments using `DefaultAzureCredential`).

### Dynamic Routing
By utilizing the gateway, developers can switch their LLM vendor out with a single variable toggle. No parsing or payload adjustments are needed inside the core toolsets! Echo AI unifies the prompt architecture, tool invocation logic, and system chunk payloads natively.

*If you need to deploy completely sandboxed, custom Hugging Face Deep Learning boxes instead of utilizing standard vendor APIs, consult the [Cloud Deployments Guide](./cloud-deployments.md).*
