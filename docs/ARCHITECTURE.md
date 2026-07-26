# Architecture

```text
LessonSpec / JSON
       |
       v
schema + semantic validation
       |
       v
resolution (layout, anchors, timing, lifecycle)
       |
       v
keyframe + canonical-film checks
       |
       v
GCL film
       |
       v
deterministic Canvas 2D frames
       |
       +--> React player (optional)
       +--> Cartesia timing/audio (optional)
       +--> MP4/WebCodecs (optional)
```

## Package responsibilities

`@aira/lumen` owns the format and deterministic rendering behavior. It must
remain usable without React and without a network connection.

`@aira/lumen-react` owns UI state around the canvas. It consumes only the core
public API.

`@aira/lumen-cartesia` converts scene narration into audio and word timing.
Credentials are explicit function arguments. It is not part of validation or
rendering.

`@aira/lumen-mp4` owns browser export. It is isolated because WebCodecs support
and bundle cost differ from rendering support.

The private playground composes all four packages and contains example lessons.
It is never published.

## Stability rules

- Public packages may not import playground code.
- Example lessons may not be bundled into core.
- A lesson-specific visual belongs in Simple JSON or the documented visual
  catalog, not in renderer conditionals.
- Schema validation is followed by semantic validation; JSON Schema alone
  cannot guarantee reference, lifecycle, or geometry correctness.
- Identical input, time, viewport, and theme must produce the same frame.
