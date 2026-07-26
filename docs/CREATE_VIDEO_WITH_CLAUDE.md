# Create a Lumen video with Claude Code

1. Open the repository in Claude Code.
2. Supply the topic, audience, objective, factual constraints, sources, and
   target duration.
3. Paste
   [`prompts/claude-create-video.md`](../prompts/claude-create-video.md), then
   add the lesson brief.
4. Claude Code should read `CLAUDE.md`,
   `docs/SIMPLE-JSON-LLM-CONTEXT.md`, and live capabilities before authoring.
5. Require a compile-and-repair loop and visual review of start, midpoint,
   transition, and final frames.
6. Preview locally. Supply your own Cartesia key only when narration is wanted.

Lumen does not use the Anthropic API at runtime. Applications that separately
send prompt-builder output to Anthropic own that integration and its credential
handling.

```ts
import { buildCodingAgentVideoPrompt } from "@aira/lumen";

const prompt = buildCodingAgentVideoPrompt("claude", {
  topic: "How eclipses happen",
  audience: "ages 11–13",
  objective: "Distinguish solar and lunar eclipses"
});
```
