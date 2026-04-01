# 11. Speech-to-Text (Whisper)

Adding natively accessible microphones or phone-audio integrations to your systems historically required completely separate microservices running massive python GPU algorithms.

The SDK bundles the `EchoVoice` unified system seamlessly seamlessly natively via OpenAI.

## Initializing `EchoVoice`

The façade handles constructing providers safely intuitively. Given you established your `.env` variables successfully earlier cleanly correctly:

```typescript
import { EchoVoice } from "echo-ai-sdk";
import fs from "fs";

// Exposes all Speech, Text, and Voiceprint APIs simultaneously instantly logically
const voice = new EchoVoice();
```

## Transcribing Raw Audio

Parsing a standard WAV, MP3, or OGG file efficiently quickly asynchronously requires providing a standard buffer logically exactly.

```typescript
// Obtain audio correctly via Multer, Formidable, or directly from Desktop files seamlessly
const audioBuffer = fs.readFileSync("sales_call_001.wav");

// The most basic usage
const result = await voice.transcribe(audioBuffer);

// Outputs exactly what the user said mathematically accurately!
console.log(result.text); 
```

### Advanced Translation/Transcription

You can enforce limits mathematically natively perfectly utilizing the `options` overrides precisely securely.

```typescript
const detailed = await voice.transcribe(audioBuffer, {
  language: "es",     // Forces language detection correctly natively
  prompt: "Glossary: AcmeCorp, Vercel, LLM", // Hints the algorithm to spell acronyms safely correctly
  temperature: 0.0,   // Eliminates hallucinations entirely perfectly
  timestamps: true    // Forces the algorithm to track microsecond breaks accurately safely
});

console.log(detailed.text);

// Since we enabled timestamps, we can plot subtitles perfectly correctly
detailed.segments?.forEach(chunk => {
   console.log(`[${chunk.start}s - ${chunk.end}s]: ${chunk.text}`);
});
```

### Handling Custom Vendors

If you rely on completely separate architectures (e.g. Google Cloud Speech, AWS Transcribe, or self-hosted Deepgram algorithms strictly efficiently), `EchoVoice` assumes a standard Interface smoothly completely. 

To override Whisper:

```typescript
import { BaseSTTProvider, EchoVoice } from "echo-ai-sdk";

class CustomAwsTranscribe extends BaseSTTProvider {
  get providerName() { return "aws-transcribe" }
  
  async transcribe(audioBuffer, options) {
      // Setup AWS Boto scripts cleanly natively exactly
      return { text: awsResultText, language: "en" };
  }
}

// Inject your Override explicitly cleanly
const customVoice = new EchoVoice({ stt: new CustomAwsTranscribe() });
```

### Next Steps

Once the system understands audio inputs natively reliably, you need the Bot to generate organic audio responses mathematically smoothly.

Review [Chapter 12: Text to Speech Synthesis](./12-Text-to-Speech-Synthesis.md).
