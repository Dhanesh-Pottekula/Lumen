# @aira/lumen

Deterministic Simple JSON compiler and Canvas 2D renderer for educational
videos.

```bash
npm install @aira/lumen
```

```ts
import { renderLessonSpec } from "@aira/lumen";

const result = renderLessonSpec(lessonJson);
if (!result.valid) console.error(result.errors);
```

The package contains the schema, semantic validators, compiler, renderer,
capability discovery, visual catalog, and provider-neutral Codex/Claude prompt
builders. It contains no React, narration provider, MP4, LLM SDK, application
shell, or example lesson.

See the repository [README](../../README.md), [public API](../../docs/API.md),
and [authoring context](../../docs/SIMPLE-JSON-LLM-CONTEXT.md).
