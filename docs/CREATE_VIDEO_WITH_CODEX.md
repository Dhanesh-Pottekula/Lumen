# Create a Lumen video with Codex

1. Open the repository in Codex.
2. Give Codex the topic, audience, objective, facts, sources, and target
   duration.
3. Paste the prompt from
   [`prompts/codex-create-video.md`](../prompts/codex-create-video.md), followed
   by your lesson brief.
4. Let Codex inspect `AGENTS.md`, the authoring context, capabilities, and
   existing playground wiring.
5. Ask Codex to compile, visually review representative keyframes, and repair
   every diagnostic.
6. Run the playground and enter your own Cartesia key only if narration is
   needed.

Codex should edit the repository locally. No OpenAI API key or OpenAI runtime
SDK is needed in Lumen. The prompt builder API is useful when another tool
wants the same constrained prompt:

```ts
import { buildCodingAgentVideoPrompt } from "@aira/lumen";

const prompt = buildCodingAgentVideoPrompt("codex", {
  topic: "How eclipses happen",
  audience: "ages 11–13",
  objective: "Distinguish solar and lunar eclipses"
});
```
