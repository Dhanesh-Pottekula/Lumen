# Getting started

## 1. Install

For a browser canvas application:

```bash
npm install @aira/lumen
```

For React:

```bash
npm install @aira/lumen @aira/lumen-react react react-dom
```

Narration and MP4 export are optional:

```bash
npm install @aira/lumen-cartesia @aira/lumen-mp4
```

## 2. Define a lesson

A lesson is plain data. It contains scenes, visual objects, and ordered beats.
Use TypeScript's `LessonSpec` type while authoring, but JSON received over a
network is also accepted.

```ts
import type { LessonSpec } from "@aira/lumen";

export const lesson: LessonSpec = {
  version: "1",
  title: "A falling object",
  theme: "textbook",
  scenes: [{
    id: "fall",
    composition: "hero",
    narration: "Watch the ball move downward as gravity changes its velocity.",
    objects: [
      {
        id: "ball",
        kind: "shape",
        shape: "circle",
        color: "#ef6461",
        placement: { mode: "zone", zone: "main" }
      }
    ],
    beats: [{
      id: "show",
      pace: "slow",
      actions: [{
        do: "show",
        targets: ["ball"],
        entrance: "fade"
      }]
    }]
  }]
};
```

## 3. Compile before rendering

```ts
import { renderLessonSpec } from "@aira/lumen";

const result = renderLessonSpec(lesson);
if (!result.valid) {
  console.table(result.errors);
  throw new Error("Invalid Lumen lesson");
}
```

Compilation is the trust boundary. It checks the JSON Schema, cross-object
references, object lifecycle, SVG subset, expressions, motion geometry, and
deterministic keyframes.

## 4. Render

Use `drawSlideFrame` in a vanilla `requestAnimationFrame` loop, or pass the
compiled slide to `CanvasSlide` from `@aira/lumen-react`. Complete examples are
in [`examples/vanilla`](../examples/vanilla) and
[`examples/react`](../examples/react).

## 5. Add narration only when needed

Install `@aira/lumen-cartesia` and pass a key supplied by your application at
runtime. For browser demos, the included playground asks for a key and keeps it
in `sessionStorage`. Production applications should call Cartesia through a
backend. See [CARTESIA.md](CARTESIA.md).
