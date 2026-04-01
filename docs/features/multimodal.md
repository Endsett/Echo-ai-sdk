# Multimodal Features

Enterprise chatbots eventually outgrow text. The Echo AI SDK unifies textual intelligence with natively bridged audio and visual generation, providing a truly interactive experience.

## Text-to-Speech (TTS) Pipeline
Leveraging Hugging Face's open-source repositories, the framework natively synthesizes real-time speech buffers utilizing the `HuggingFaceTTS` module.

### Configuration
Provide a Hugging Face token in the Bot config:

```typescript
const bot = new CustomerSupportBot({
  gateway: new AnthropicProvider("..."),
  companyName: "Acme Corp",
  tts: {
    apiKey: "hf_...",
    // Optional: override the default model
    model: "espnet/kan-bayashi_ljspeech_vits" 
  }
});
```

### Emitting Audio
Instead of calling `bot.chat(sessionId, message)`, utilize the voice-native pipeline. Your webhook will asynchronously receive both the string payload and the corresponding audio buffer!

```typescript
const { text, audio } = await bot.chatWithVoice("session1", "What is my balance?");
// Route 'audio' to an AWS IVR instance or Web Browser <audio src="..." /> blob
```

## Image Synthesis (`HuggingFaceImageGen`)
When a customer needs physical representation (e.g., "Show me the blue sports car layout"), text models inevitably fail. 
By enabling `imageGen` inside the Bot configuration schema, the `CustomerSupportBot` secretly equips itself with a `generate_image` tool!

If the conversational context requires visualization, the LLM will invoke the tool, asynchronously ping a Stable Diffusion (or custom) HF endpoint, and stream standard Markdown `![Image](base64...)` syntaxes downstream back to your client channels beautifully.
