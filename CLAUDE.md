# Lumen instructions for Claude Code

Lumen converts validated Simple JSON into deterministic educational video.
Claude Code may author and repair lesson JSON, but the shipped renderer must
not depend on Claude or any other LLM at runtime.

Follow these repository boundaries:

- Public renderer and validation live in `packages/core`.
- React, Cartesia, and MP4 integrations remain optional companion packages.
- Example lessons and UI belong in the private `apps/playground` application.
- Never put API keys in source, `.env` examples, generated output, or logs.

For lesson work, read `docs/SIMPLE-JSON-LLM-CONTEXT.md`, inspect
`getSimpleJsonCapabilities()`, author only supported version 1 fields, repair
all diagnostics, and visually review representative keyframes. Prefer diagrams,
motion, charts, maps, and timelines over paragraphs. Temporary guides must be
hidden when their explanation ends.

Before reporting success, run:

```bash
npm run typecheck
npm run build
npm run pack:audit
```

Do not publish, commit, or push unless the user explicitly requests it.
