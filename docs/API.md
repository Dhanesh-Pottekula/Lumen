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
Schema, reference, lifecycle, motion, and safety findings block the scene
they are in; the rest of the film still draws. Layout overflow/collision
findings remain advisory because the resolver auto-fits those cases. It is
the same as adding every scene, in order, to `createFilmCompiler`.

### `createFilmCompiler(header, options?)`

Builds a film one scene at a time, as scenes arrive. `header` is the
`LessonSpec` without `scenes`; `options` are those of `renderLessonSpec`.

```ts
interface FilmCompiler {
  add(scene: SceneSpec, floor?: number): AddResult;
  slide(): CanvasSlideDefinition; // .scenes holds a timing for every added scene
  count(): number;
}
type AddResult = SceneTiming & {
  valid: boolean;
  index: number;
  warnings: Diagnostic[];
  errors?: Diagnostic[];
};
```

`add` compiles only the new scene, from what the scene before it left on
screen (the end poses of the pictures it declares again, and the category
colours), and appends it to the timeline. No scene already added ever
changes; only the progress dots along the top edge, which count the scenes
so far, are redrawn. A scene that cannot be drawn returns `valid: false`
and still takes its index, with a zero-length `dropped` timing, so scene
indices always match the order scenes were sent in.

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
