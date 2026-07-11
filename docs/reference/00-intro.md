<!-- ============================================================================
     LUMEN — LLM AUTHORING & ENGINE REFERENCE
     This document is assembled from per-module sections. It is the single source
     an LLM should read to author Lumen lessons. Everything here is extracted from
     the actual engine code in src/render and src/slides.
     ============================================================================ -->

# Lumen — Authoring & Engine Reference

Lumen turns structured data into **deterministic, seekable explainer videos** rendered live on an HTML5 canvas. There is no video file: a lesson is a **pure function of time** `t`, drawn ~60×/second. The same `t` always yields the same pixels, so a lesson scrubs, seeks, and reproduces exactly.

This document has three parts:

1. **Core contracts & shared systems** — the render model, layers, themes, timing, motion helpers, and composition. Read this first; every module builds on it.
2. **Per-step module references** — every drawing primitive (strokes, reveal, callouts, charts, particles, camera, geo, math, …) with exact signatures, options, defaults, and when to use them.
3. **The JSON authoring format** — the `Storyboard` grammar an LLM emits, a field-by-field beat reference, a functionality→beat cookbook, a full worked example, and the current gaps + recommended schema extensions.

---

## The two authoring paths (read this — it prevents confusion)

There are **two ways** a lesson can exist in Lumen:

| Path | What it is | Who uses it |
|---|---|---|
| **A. JSON storyboard** | A `Storyboard` object (scenes → typed *beats*) compiled by `storyboard.ts`. This is the **LLM target**. | An LLM emits JSON → `storyboardFilm(json)` → a seekable film. |
| **B. Hand-authored TypeScript** | A scene is a `CanvasSlideDefinition` whose `render(ctx, t, frame)` calls the primitive library directly. | Humans (and the current four demo lessons) for effects the JSON schema doesn't cover yet. |

Both paths draw with the **same primitive library** (Parts 1–2) and produce the **same** `CanvasSlideDefinition`, so they play identically. **The JSON format (Path A) currently exposes only a subset of the primitives.** Part 3 documents exactly what the JSON can do today and how to extend it to reach the rest.

---

## Hard rules (never violate — they are what make a lesson seekable)

1. **Purity.** A scene's `render(ctx, t)` must produce identical pixels for identical `t`. **Never** call `Date.now()`, `Math.random()`, `performance.now()`, or `new Date()` at render time. For randomness use the seeded `prng(seed)` helper (build a seeded array once, reuse it).
2. **Time is a parameter, not a clock.** All motion derives from the `t` passed in. There is no accumulated state, no timers, no `requestAnimationFrame` inside a scene.
3. **Everything is a pure function of `t`.** Particles, counters, camera moves, draw-on strokes — all are closed-form in `t`.
4. **`t` is scene-local.** Inside a scene, `t` runs `0 … scene.duration` (seconds). The compositor offsets scenes onto the film timeline for you.

## The coordinate space

Scenes declare a logical space via `viewW` / `viewH` and draw in those units; the player scales to the real canvas (HiDPI-aware). The four reference lessons use **`viewW = 920`, `viewH = 430`**. The storyboard interpreter uses **`920 × 430`**. Use these coordinates when placing beats: `x ∈ [0, 920]`, `y ∈ [0, 430]`, origin top-left, `y` increases downward.

## The timing primitive: `phase(t, start, end)`

Almost all timing is expressed with `phase`:

```ts
phase(t, start, end): number  // 0 before `start`, ramps 0→1 across [start, end], clamps to 1 after `end`
```

A beat/element becomes a self-contained animation by computing its own progress `p = phase(t, at, at + dur)` and drawing "at progress `p`". Before `at` it's invisible (0); during `[at, at+dur]` it animates; after, it holds complete (1). This is how a flat list of beats becomes a choreographed, seekable timeline with **no state**.

---

*(The sections that follow are the core systems, then one section per engine module, then the JSON authoring format.)*
