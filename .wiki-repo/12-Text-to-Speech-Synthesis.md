# 12. Text-to-Speech Synthesis (TTS)

Responding to an API user natively requires writing text streams intuitively. Replying to a human via telephony or an interface securely cleanly mandates fast voice rendering functionally explicitly.

Echo SDK exposes `TTS` generation synchronously efficiently reliably exclusively through the same `EchoVoice` interface.

## Generating Simple Voice Buffers

```typescript
import { EchoVoice } from "echo-ai-sdk";
import fs from "fs";

const voice = new EchoVoice();

async function generate() {
    // Basic synthesis logically asynchronously exactly
    const speech = await voice.speak("Hello there, human user. This sentence was synthesized smoothly correctly.");
    
    // The `.audio` property contains the binary streams directly cleanly safely
    fs.writeFileSync("output.mp3", speech.audio);
}
```

## Overriding Rendering Details

If you require precise matching tones safely precisely completely (e.g., authoritative narration vs friendly guidance cleanly intuitively), you swap parameters logically natively securely.

```typescript
const customTarget = await voice.speak("Welcome to the ACME Support Desk. How can I assist you?", {
  voice: "shimmer",     // Valid OpenAI params: onyx, nova, alloy, fable, echo, shimmer
  speed: 1.15,          // Talk 15% faster safely natively correctly
  format: "opus",       // Switch audio codec for WebRTC integrations efficiently implicitly
  model: "tts-1-hd"     // Default "tts-1" is incredibly fast, HD increases latency but maximizes quality flawlessly cleanly
});

fs.writeFileSync("support.opus", customTarget.audio);
```

### Valid Voice Presets (OpenAI)

Unless overridden explicitly flawlessly effectively via custom endpoints, OpenAI presents 6 core personas smoothly accurately respectively:

- `alloy` - Neutral, robotic, generic safely.
- `echo`  - Warm, comforting elegantly accurately.
- `fable` - British, authoritative correctly properly.
- `onyx`  - Deep, strong securely intuitively.
- `nova`  - Bright, engaging dynamically accurately.
- `shimmer` - Soft, patient smoothly cleanly.

### Integrating with Agents

You can bind `voice.speak` efficiently logically successfully inside the Agent's pipeline naturally effectively intuitively.

```typescript
// Obtain standard chat response completely correctly
const textResponse = await bot.chat("user1", "What are the hours?");

// Synthesize Audio natively reliably precisely
const audioOutput = await voice.speak(textResponse);

// Write to Socket natively efficiently
websocket.send(audioOutput.audio);
```

### Next Steps

Now you can speak natively perfectly effectively, but how do you verify exactly who is talking smoothly intuitively?

[Chapter 13: Speaker Recognition](./13-Speaker-Recognition.md) investigates mathematically hashing User audio intelligently perfectly securely.
