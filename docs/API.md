# Public API

The `0.1` public surface is intentionally small. Imports from internal
`dist/*` paths are unsupported.

## `@aira/lumen`

### `compileLessonSpec(input, timing?)`

Parses strings, validates unknown input, resolves layout and timing, checks
keyframes, and compiles the canonical film. It returns:

```ts
type CompileLessonResult =
  | {
      valid: true;
      lesson: LessonSpec;
      resolved: ResolvedLesson;
      gcl: Film;
      warnings: Diagnostic[];
    }
  | { valid: false; errors: Diagnostic[] };
```

### `renderLessonSpec(input, timing?)`

Runs the compiler and returns a `CanvasSlideDefinition` ready to draw.
Schema, reference, lifecycle, motion, and safety findings block rendering.
Layout overflow/collision findings remain advisory because the resolver
auto-fits those cases.

### `drawSlideFrame(context, slide, seconds, theme)`

Draws one deterministic frame into a `CanvasRenderingContext2D`. The caller
owns the animation clock and canvas pixel ratio.

### Schema and capabilities

- `LESSON_INPUT_SCHEMA`
- `LESSON_SPEC_SCHEMA`
- `getSimpleJsonCapabilities()`
- `availableVisualAssets()`
- `resolveVisualAsset()`

Use capabilities to constrain an authoring model. Do not copy token lists into
a prompt and allow them to drift.

### Prompt helpers

- `buildLessonPlanningPrompt`
- `buildLessonGenerationPrompt`
- `buildLessonRepairPrompt`
- `buildLessonVisualReviewPrompt`
- `buildCodingAgentVideoPrompt("codex" | "claude", request)`
- `CODEX_VIDEO_AUTHORING_PROMPT`
- `CLAUDE_VIDEO_AUTHORING_PROMPT`

These helpers return strings and structured payloads. They do not connect to
OpenAI, Anthropic, Cartesia, or any network service.

### Themes

`TEXTBOOK`, `BLUEPRINT`, `CHALKBOARD`, and `PARCHMENT`.

## `@aira/lumen-react`

### `CanvasSlide`

React player with play/pause, seeking, responsive canvas sizing, captions, and
synchronized `slide.audioUrl` playback.

```tsx
<CanvasSlide
  slide={result.slide}
  title="Lesson title"
  tag="Visual explanation"
  speakerLabel="Teacher"
  canvasLabel="Animated lesson"
/>
```

Import `@aira/lumen-react/style.css` once.

## `@aira/lumen-cartesia`

- `synthesizeNarration(text, { apiKey, voice?, modelId? })`
- `fullNarration(lesson)`
- `sceneFloors(lesson, wordTimestamps)`
- `alignSceneNarration(lesson, wordTimestamps)`
- audio cache helpers

The adapter never reads an environment variable. `apiKey` is required.

## `@aira/lumen-mp4`

Exports `canExportMp4()` and
`exportLessonMp4(slide, audioBlob, options?)`. It requires browser WebCodecs.
Audio muxing depends on browser codec support; use a server media pipeline for
cross-browser production guarantees.

## Diagnostics

Every diagnostic has a stable `code`, JSON `path`, human-readable `message`,
and optional received/expected context. Treat errors as data and show the path
to lesson authors; do not discard them behind a generic rendering failure.
