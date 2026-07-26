# Cartesia narration

Cartesia is optional. Lumen does not include a key, does not read `.env`, and
does not fall back to an AiRA-owned credential.

```ts
import { renderLessonSpec } from "@aira/lumen";
import {
  fullNarration,
  sceneFloors,
  synthesizeNarration
} from "@aira/lumen-cartesia";

const audio = await synthesizeNarration(fullNarration(lesson), {
  apiKey: keyEnteredByTheUser,
  voice: "female"
});

const rendered = renderLessonSpec(lesson, {
  sceneFloors: sceneFloors(lesson, audio.words),
  audioUrl: audio.audioUrl
});
```

## Browser demo

The private playground shows a password-style Cartesia-key screen before it
loads a narrated lesson. The key is held in React state and `sessionStorage`
for the current browser tab. It is not written to the repository.

This is suitable for local development, not for distributing permanent keys.

## Production

Use one of these patterns:

1. Generate narration on your backend and return the audio plus timestamps.
2. Issue a short-lived, tightly scoped credential if Cartesia supports that
   flow for your account.
3. Ask end users to supply their own key and clearly explain where it is sent.

Never embed a permanent secret in JavaScript, a Vite variable, a mobile bundle,
lesson JSON, logs, error telemetry, prompts, or example files.

## Data handling

Narration text is sent to Cartesia when synthesis is requested. Review
Cartesia's terms and privacy policy for your application. Lumen's local cache
uses IndexedDB; applications should provide a way to clear it on shared
devices.
