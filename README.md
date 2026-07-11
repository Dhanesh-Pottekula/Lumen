# Lumen

**Lumen turns language models into animators.**

Instead of asking a model to generate pixels or video frames, Lumen gives it a small, well-specified JSON grammar to write: a lesson is a list of scenes, each scene a list of beats, each beat a primitive from a rich library — draw-on strokes, kinetic type, animated charts, LaTeX-style math, callouts and leader lines, particles, timelines, shape morphs, iconography, maps, camera moves, and scene transitions.

The engine compiles that JSON into a deterministic, seekable film rendered live on an HTML5 canvas. Because every visual is a pure function of time, the result is fully reproducible: scrub anywhere, resize freely, replay identically — with no rendering server, no export pipeline, and no video files to store or stream. Authoring is instant and the feedback loop is tight enough for a model to iterate.

Think **Manim for LLMs**: a formal, deterministic description language for explainer videos, plus a real-time player for the browser.

## How it works

The LLM emits a **storyboard** — scenes made of typed *beats*. `storyboardFilm()` compiles it into a seekable `CanvasSlideDefinition`, and the player renders `render(ctx, t)` live. Every frame is a pure function of `t`, so the same JSON always produces the same film.

- **Authoring format** — [`src/render/storyboard.ts`](src/render/storyboard.ts) (the `Beat` schema the model targets)
- **Player** — [`src/components/CanvasSlide.tsx`](src/components/CanvasSlide.tsx) (clock, seek, resize)
- **Primitive library** — [`src/render/`](src/render/) (strokes, charts, math, callouts, particles, camera, geo, morph, icons, …)
- **Step-by-step design docs** — [`docs/plans/`](docs/plans/)

## Develop

```bash
npm install
npm run dev      # Vite dev server
npm run build    # tsc --noEmit && vite build
```
