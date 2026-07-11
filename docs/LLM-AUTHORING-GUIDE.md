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
<!-- Auto-assembled from docs/reference/*.md. Regenerate by re-running the doc build. -->

## Table of contents

- **Core** — the render contract, layer model (FrameCtx), themes, motion/easing, composition (`composeSlides`, `pace`, transitions)
- **Step 04 · Draw-on strokes** — self-drawing paths, curves, brush, verbs (drawOn, tracedPath, handFollower…)
- **Step 05 · Reveal grammar** — wipes, iris, dissolve, spotlight, `masked` soft-mask, blend
- **Step 06 · Attention direction** — dim/spotlight, rings, boxes/brackets, pointers, magnify, converge
- **Step 07 · Callouts & leaders** — containers, leader routing, markers, typewriter body
- **Step 08 · Engagement grammar** — build-steps, predict-reveal, punch/shake/flash, sequencer
- **Step 09 · Kinetic typography** — counters, number formatting, typewriter, word-reveal, slam, scramble, text-on-path
- **Step 10 · Particle system** — `emit`/`particleAt`, `EmitterConfig`, 8 presets
- **Step 11 · Camera & transitions** — pan/zoom/rotate, log-zoom, DOF/parallax
- **Step 12 · Plots, charts & counters** — makePlot, axes, plotFunction, bar/line/scatter/pie
- **Step 13 · Timeline** — date axis, eras, events, playhead
- **Step 14 · Shape morph** — resample/align/morph, shape generators
- **Step 15 · Iconography & color semantics** — 30 icons, fillable set, color registry, legend
- **Step 16 · Map / geo subsystem** — projection, draw-on borders, borders-over-time, flow arrows, markers
- **Step 17 · Math typesetting** — LaTeX subset, full symbol table
- **Step 19 · The storyboard JSON interpreter** — beat kinds, scene/storyboard types, renderBeat trace
- **The JSON authoring format** — the LLM target: field-by-field beat reference + worked example + gaps
- **Authoring cookbook & schema-extension guide** — workflow, "I want X → beat", extending the schema

---
# Core contracts & shared systems

This section documents the foundational contracts of the **Lumen** canvas animation engine: the shape of a scene, the per-frame layer/theme system threaded into every render, the motion-math library, and how standalone scenes are stitched into a film. Everything here is a **pure function of time** — that is the invariant the whole engine depends on.

---

## The render contract

A scene is a `CanvasSlideDefinition` (`src/slides/types.ts`):

```ts
interface CanvasSlideDefinition {
  duration: number;                                                          // timeline length in seconds
  viewW: number;                                                             // logical coordinate width
  viewH: number;                                                             // logical coordinate height
  render: (ctx: CanvasRenderingContext2D, t: number, frame?: FrameCtx) => void;
  captions?: CaptionSegment[];                                               // optional subtitles keyed to t
}
```

- `duration: number` — length of the scene's timeline in seconds. `t` is expected to run `0 → duration`.
- `viewW: number` / `viewH: number` — the logical coordinate space the `render` function draws in. The canvas is transformed so that `(0,0)` is top-left and `(viewW, viewH)` is bottom-right, regardless of device pixel ratio. **Scene coordinate convention in these lessons is `920 × 430`** (see `src/lessons/*.ts`, where `const W = 920; const H = 430;`). Every scene in a composed film must share the same `viewW`/`viewH` (enforced by `composeSlides`).
- `render(ctx, t, frame?)` — draws one frame at scene-local time `t` (seconds).
  - `ctx: CanvasRenderingContext2D` — the target 2D context, pre-transformed into view coordinates.
  - `t: number` — **scene-local seconds** (`0` at the scene's own start, not the film's). When composed, the composer passes `t - start` clamped to `[0, duration]`.
  - `frame?: FrameCtx` — optional shared per-frame state (layers, theme, camera, film grade). A scene may ignore it and draw straight to `ctx` (legacy path), or route drawing through `frame.layer` to get depth/theming/compositing.
- `captions?: CaptionSegment[]` — optional on-screen subtitle segments keyed to the timeline (see below).

### CaptionSegment

```ts
interface CaptionSegment {
  at: number;   // time (seconds) at which this caption becomes current
  text: string; // subtitle text
}
```

Each segment is shown from its `at` until the next segment's `at`. In a scene, `at` is scene-local; `composeSlides` rebases each caption to film time (`c.at + start`) and drops any that would spill past the next scene's start.

### Purity rules (non-negotiable)

`render` **MUST be pure**: the same `t` in must always produce the same pixels out. This is what makes a scene seekable and scrubbable like a video.

- **No `Date.now()`, no `performance.now()`, no `Math.random()`, no timers, no accumulated/mutable state across frames.**
- For anything that needs "randomness" (jitter, grain, personalities, scattered layouts), use the seeded PRNG `prng(seed)` from `motion.ts` / `anim.ts`. It is deterministic for a fixed seed.
- All time-derived motion must be a function of `t` (or of a `0→1` progress derived from `t`). Use the easing/staging/oscillator helpers below — they are all pure.

Because the contract holds, the engine can render frame `N` in isolation, seek to any `t`, or re-render for a crossfade buffer, and always get identical output.

---

## The layer model (FrameCtx)

`FrameCtx` (`src/render/frame.ts`) is the shared per-frame state threaded into `render`. It owns a lazily-created stack of offscreen layer canvases that composite onto the target context in a fixed order. Nothing in it reads a clock — it is fully deterministic.

```ts
interface FrameCtx {
  t: number;
  viewW: number;
  viewH: number;
  layer: LayerApi;
  theme: Theme;
  grade(opts?: { vignette?: number; grain?: number }): void;
  setCamera(cam: Camera | undefined): void;
}
```

- `t: number` — the same scene-local time passed to `render`.
- `viewW` / `viewH` — the view dimensions (mirror the scene's).
- `layer: LayerApi` — the layer drawing/compositing API (below).
- `theme: Theme` — the active art-direction theme (below). Ask it for roles (`theme.palette.ink`, `theme.palette.accent`, …) instead of hard-coding colors.
- `grade(opts?)` — paint the filmic pass (vignette + tonal grade + deterministic grain) onto the `fx` layer. `vignette` default `0.3`, `grain` default `0.04`. Seekable (grain is re-seeded per ~12 fps tick from `t`). The `fx` layer is forced `screenspace` so the grade never pans/zooms with a camera. *Usually you don't call this per-scene — the composer applies it film-wide via `filmGrade`.*
- `setCamera(cam)` — set the frame camera (pan/zoom/rotate), applied to all non-`screenspace` layers at composite time. Pass `undefined` for no camera. A camera that is effectively neutral is skipped automatically (see `isNeutral` in `src/render/camera.ts`).

> The caller (player/composer) creates the frame via `createFrame(target, t, viewW, viewH, theme?, camera?)` and calls `finish()` after `render` returns. `finish()` composites any layers that were used; if the scene never touched a layer, `finish()` is a no-op and the scene's direct `ctx` drawing stands.

### LayerApi

```ts
interface LayerApi {
  ctx(name: LayerName): CanvasRenderingContext2D;
  set(name: LayerName, opts: LayerOptions): void;
  clear(name: LayerName): void;
}
```

- `ctx(name)` — returns the drawing context for a named layer. The layer canvas is lazily created on first request, its transform matched to the target (so scene coords map 1:1), and cleared for this frame. On creation, the layer's composite options are **seeded from the theme's per-role FX defaults** (`theme.fx.layers[name]`), so simply routing drawing to a layer inherits that role's cinematic treatment (bloom/shadow) for free.
- `set(name, opts)` — merge `LayerOptions` into a layer's composite options (shallow merge over the existing/seeded options).
- `clear(name)` — reset a layer's composite options to none. The escape hatch to opt out of theme-seeded FX (e.g. a scene that wants a crisp foreground with no inherited bloom).

### LayerName and layer roles

```ts
type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";
const LAYER_ORDER = ["bg", "mid", "fg", "annotation", "fx"]; // composite order, back → front
```

Layers composite in `LAYER_ORDER` (back to front). Conventional roles:

- `bg` — backdrop / sky / distant scenery. Often given a small parallax `offset` and/or `blur` for depth.
- `mid` — the main subjects. In `TEXTBOOK`/`PARCHMENT` themes this role gets a soft drop shadow by default (depth).
- `fg` — energy, particles, foreground elements up front. In `TEXTBOOK`/`CHALKBOARD` this role gets a bloom (`glow`) by default.
- `annotation` — labels, callouts, arrows, measurement lines drawn over the art (unstyled by default themes).
- `fx` — the filmic overlay (vignette/grade/grain). `grade()` forces this layer `screenspace`. Composited last (front-most).

### LayerOptions — every field

```ts
interface LayerOptions {
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  alpha?: number;
  scale?: number;
  rotate?: number;
  blend?: GlobalCompositeOperation;
  filter?: string;
  glow?: { strength: number; blur: number };
  shadow?: { blur: number; color: string; dx?: number; dy?: number };
  screenspace?: boolean;
}
```

- `offsetX: number` (default `0`) — view-space horizontal parallax offset applied to the whole layer at composite. *Use to push background layers slightly opposite a camera or to fake depth.*
- `offsetY: number` (default `0`) — view-space vertical parallax offset. *Same as `offsetX`, vertical.*
- `blur: number` (default `0`) — Gaussian blur in **device pixels** applied at composite. *Use for depth-of-field / soft distant `bg` layers, or a dreamy `fg`.*
- `alpha: number` (default `1`) — layer opacity multiplier at composite. *Use to fade a whole layer in/out as one unit (e.g. drive it with `phase(t, …)`).*
- `scale: number` (default `1`) — uniform zoom about the layer's center. *Use for a subtle push-in on one layer, or a slow ken-burns on `bg`.*
- `rotate: number` (default `0`) — rotation in **radians** about the layer's center. *Use for tilt/dutch-angle effects on a single layer.*
- `blend: GlobalCompositeOperation` (default none / `source-over`) — composite mode for the layer, e.g. `"lighter"` (additive glow), `"multiply"` (shadow/tint). *Use when a layer should add light or darken what's behind it rather than paint over.*
- `filter: string` (default none) — extra CSS filter string, e.g. `"saturate(0.6) brightness(1.1)"`. Combined with `blur` (blur is prepended). *Use for per-layer color grading / desaturating a background.*
- `glow: { strength: number; blur: number }` (default none) — cinematic bloom. After the layer is drawn, a blurred additive (`"lighter"`) copy of the same layer is laid over it; the bloom is self-colored (takes the layer's own colors). `strength` scales the bloom's alpha (multiplied by the layer's `alpha`); `blur` is in **view units** (dpr-scaled at composite). Skipped when `strength <= 0`. *Use for energy/particles/chalk/light sources on `fg` or `mid`.*
- `shadow: { blur: number; color: string; dx?: number; dy?: number }` (default none) — native drop shadow cast by the layer's drawn shapes. `blur`, `dx`, `dy` are in **view units** (dpr-scaled); `dx`/`dy` default `0`. *Use to lift subjects off the background (the default `mid` treatment in `TEXTBOOK`/`PARCHMENT`).*
- `screenspace: boolean` (default `false`) — skip the frame camera for this layer, keeping it fixed in screen space. *Use for fixed UI, titles, subtitles, HUD, or the filmic grade — anything that must not pan/zoom with the world.*

### Compositing order in `finish()`

For each `name` in `LAYER_ORDER` that was used:

1. **Primary pass** — composite in device pixels: apply `alpha`, `blend`, combined `blur`+`filter`, native `shadow`, then the camera (unless `screenspace`), then the layer geometry (`offsetX/Y`, `scale`, `rotate`), then draw the layer canvas.
2. **Bloom pass** (only if `glow.strength > 0`) — a second draw of the same layer canvas with `globalCompositeOperation = "lighter"`, alpha `= alpha * glow.strength`, and `blur(glow.blur * dpr)`, under the same camera + geometry. This adds the self-colored bloom over the primary.

`finish()` no-ops if the target canvas has zero size (not yet laid out).

---

## Themes

A `Theme` (`src/render/theme.ts`) is art direction expressed as plain data — like CSS variables for the canvas. It rides on `FrameCtx` so scenes request roles instead of literal colors; swapping the theme reskins a whole film.

```ts
interface Theme {
  name: string;
  palette: Palette;
  texture: TextureKind;                              // "none" | "parchment" | "blueprint" | "chalkboard"
  lineStyle: { width: number; roughness: number };   // roughness 0 = crisp, ~2 = hand-drawn
  type: { display: string; body: string; mono: string };
  fx: {
    glow: boolean;
    grain: number;
    vignette: number;
    layers?: Partial<Record<LayerName, LayerOptions>>;
  };
}

type Palette = {
  bg: string; surface: string; ink: string; accent: string; muted: string; danger: string;
};
type TextureKind = "none" | "parchment" | "blueprint" | "chalkboard";
```

- `name: string` — human label for the theme.
- `palette` — the six semantic color roles:
  - `bg` — page/backdrop base color (painted by `paintTexture`).
  - `surface` — panels, cards, filled shapes sitting on top of `bg`.
  - `ink` — primary text/line color.
  - `accent` — highlights, the "brand" color, active states.
  - `muted` — secondary text, de-emphasized lines, gridlines.
  - `danger` — errors, warnings, negative quantities.
- `texture: TextureKind` — which backdrop texture `paintTexture` lays over `bg`: `"none"`, `"parchment"` (warm gradient + aged edges + fibre grain), `"blueprint"` (fine + heavy grid lines), `"chalkboard"` (white chalk dust speckle).
- `lineStyle.width: number` — default stroke width for themed lines/labels.
- `lineStyle.roughness: number` — hand-drawn jitter amount; `0` = crisp, `~2` = hand-drawn. Feeds `roughen()` (below).
- `type.display` / `type.body` / `type.mono` — font-family strings for headings, body text, and monospace respectively.
- `fx.glow: boolean` — whether the theme's aesthetic favors bloom (advisory flag scenes can read).
- `fx.grain: number` — grain intensity for the filmic grade (used as `grade({ grain })` default at film level).
- `fx.vignette: number` — vignette darkness for the filmic grade.
- `fx.layers?: Partial<Record<LayerName, LayerOptions>>` — **per-role FX applied automatically to each layer at composite time.** This is the single knob that reskins a whole film's cinematic feel: any scene that routes drawing to a layer inherits that role's treatment (bloom/shadow/etc.) for free. Omit a role for no default treatment.

### Presets

Four presets are exported. Their `fx.layers` defaults are what give each its "feel":

| Preset | Character | Texture | lineStyle | Per-role FX defaults (`fx.layers`) |
|---|---|---|---|---|
| **`TEXTBOOK`** | Clean dark modern textbook; teal accent on slate. The default. | `none` | `width 2, roughness 0` (crisp) | `mid`: soft drop shadow (`blur 9`, `rgba(0,0,0,0.28)`, `dy 3`); `fg`: gentle bloom (`strength 0.3, blur 6`) |
| **`PARCHMENT`** | Ink-on-aged-paper; warm browns, serif type, hand-drawn lines. | `parchment` | `width 2.4, roughness 1.6` | `mid`: warm print-depth shadow (`blur 6`, `rgba(74,47,26,0.3)`, `dy 2`); no bloom (paper doesn't glow) |
| **`BLUEPRINT`** | Technical drawing on blue; crisp cyan lines, grid backdrop. Clarity over cinematics. | `blueprint` | `width 1.6, roughness 0` | none (no bloom, no shadow) |
| **`CHALKBOARD`** | Chalk on slate; bright warm-yellow strokes that bloom like chalk dust. | `chalkboard` | `width 2.6, roughness 1.2` | `fg`: strong bloom (`strength 0.5, blur 9`); `mid`: bloom (`strength 0.35, blur 7`) |

Palettes (for reference):

- `TEXTBOOK` — bg `#16222c`, surface `#1e2c38`, ink `#eef5ef`, accent `#5cc8ae`, muted `#93a4b0`, danger `#e24b4a`. Sans display/body, `grain 0.04`, `vignette 0.3`, `glow true`.
- `PARCHMENT` — bg `#efe2c4`, surface `#e6d3a8`, ink `#4a2f1a`, accent `#9a3b2e`, muted `#8a7048`, danger `#8c2b1e`. Georgia/serif display+body, `grain 0.06`, `vignette 0.42`, `glow false`.
- `BLUEPRINT` — bg `#0d2b52`, surface `#123a6b`, ink `#dbe9ff`, accent `#7fd0ff`, muted `#7f9fce`, danger `#ff8a8a`. Sans, `grain 0.03`, `vignette 0.3`, `glow true`.
- `CHALKBOARD` — bg `#1f2a26`, surface `#26332e`, ink `#eaf3ec`, accent `#ffe08a`, muted `#9db3a6`, danger `#ff9a9a`. Sans, `grain 0.08`, `vignette 0.36`, `glow false`.

**When to pick which:** `TEXTBOOK` for general STEM/modern explainers (default). `PARCHMENT` for history, literature, classical/period subjects. `BLUEPRINT` for engineering, architecture, systems/diagrams needing precision. `CHALKBOARD` for math derivations and lecture-hall/classroom feel.

### roughen()

```ts
function roughen(points: [number, number][], roughness: number, seed: number): [number, number][]
```

Returns a new point array with each point jittered by a seeded per-point offset for a hand-drawn look. `roughness <= 0` returns the points unchanged (still a fresh copy). Uses `prng(seed)`, so it is deterministic for a fixed seed. *Use to give polylines/paths the theme's `lineStyle.roughness` character; pass a stable per-shape seed so the wobble doesn't flicker frame to frame.*

```ts
const wobbly = roughen(pts, theme.lineStyle.roughness, 42);
```

### paintTexture() (`src/render/texture.ts`)

```ts
function paintTexture(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number): void
```

Fills the whole view with `theme.palette.bg`, then lays the theme's texture over it (parchment gradient + aged edges + fibre grain; blueprint fine + heavy grids; chalkboard dust speckle; `none` = plain fill). Deterministic — grain uses a seeded PRNG so scrubbing stays exact. Called by the player before the scene renders; scenes normally don't call it themselves.

---

## Motion & easing (motion.ts / anim.ts)

The pure motion-math lives in `src/render/motion.ts`. `src/slides/anim.ts` re-exports all of it (so `import { phase, lerp, prng } from "./anim"` works) and adds the canvas-aware drawing helpers. Every function here is deterministic — no clocks, no state, no `Math.random()`.

### Core numeric helpers

```ts
const clamp01 = (v: number): number
```
Clamps `v` into `[0, 1]`. *Use to bound any raw progress before feeding an easing that assumes `[0,1]`.*

```ts
const lerp = (a: number, b: number, p: number): number
```
Linear interpolation: `a + (b - a) * p`. *Use to map a `0→1` progress onto a value range (positions, sizes, colors via channels).*

```ts
const cycle = (v: number): number
```
Fractional part — loops `v` into `[0, 1)` (`v - floor(v)`). *Use for repeating cycles driven by `t`, e.g. `cycle(t / period)` to get a looping phase.*

### Easings — shape a `0→1` progress (all clamp their input)

```ts
const smooth = (p: number): number
```
Smoothstep (`p*p*(3-2p)`). Gentle acceleration + deceleration — the default "nice" curve. *Use as the go-to easing for most reveals/moves.*

```ts
const easeOutCubic = (p: number): number
```
`1 - (1-p)^3`. Fast start, soft landing. *Use for elements that shoot in and settle (decelerating entrances).*

```ts
const easeInOutCubic = (p: number): number
```
Symmetric cubic ease-in-out. Stronger easing than `smooth`. *Use for deliberate, weighty transitions where you want more hold at the ends.*

```ts
const easeOutBack = (p: number): number
```
Ease-out with a slight overshoot past `1` then settle. *Use for lively "pop" reveals (badges, icons appearing).*

```ts
const spring = (p: number): number
```
Springy `0→1`: fast rise then a gentle damped settle toward `1`. Clamped — no drift past bounds. *Use for bouncy/organic arrivals; compose it with `phase`, e.g. `spring(phase(t, 2, 4))`.*

### Staging — turn scene time `t` into staged progress

```ts
const phase = (t: number, a: number, b: number): number
```
**The central timing primitive.** Returns the smoothstep-eased `0→1` progress of `t` across the window `[a, b]`:
- `t <= a` → `0` (before the window: nothing yet).
- `a < t < b` → ramps smoothly `0 → 1`.
- `t >= b` → `1` (after the window: fully done, held).

It is `smooth((t - a) / (b - a))`, so the clamping of `smooth` gives the before/after hold behavior. This is how you author every timed reveal, move, or fade in a scene: pick a start and end second, and drive a value with `lerp(from, to, phase(t, start, end))`.

```ts
// Fade a title in over seconds 0.5→1.5, then hold; slide it up 20px in the same window.
const p = phase(t, 0.5, 1.5);
fadeText(ctx, "Newton's Law", cx, cy - lerp(0, 20, p), p, theme.type.display, theme.palette.ink);
```

```ts
const stagger = (t: number, i: number, opts: { start?: number; step: number; dur: number }): number
```
Staggered/cascaded reveal for item `i`. Item `i` runs its own window `[start + i*step, start + i*step + dur]` and returns that item's eased `0→1` (via `phase`). `opts.start` defaults to `0`. *Use for lists, letters, bars, dots entering one after another without hand-authoring each window.*

```ts
items.forEach((item, i) => {
  const a = stagger(t, i, { start: 1.0, step: 0.15, dur: 0.5 });
  // draw item with alpha/offset driven by a
});
```

### Oscillators — continuous deterministic motion for idle life & repetition

```ts
const breathe = (t: number, period: number, amount: number): number
```
Gentle oscillation around `1` (mean), amplitude `amount`, `period` in seconds: `1 + sin(2π·t/period)·amount`. *Use as a multiplier for idle "breathing" scale/size so static subjects feel alive.*

```ts
const pulse = (t: number, period: number): number
```
`0→1→0` pulse via cosine, `period` seconds: `(1 - cos(2π·t/period)) / 2`. Always in `[0,1]`. *Use for blinking, heartbeats, attention flashes (drive an alpha or glow strength).*

```ts
const wobble = (t: number, period: number, amount: number): number
```
Signed oscillation around `0` (mean), amplitude `amount`, `period` seconds: `sin(2π·t/period)·amount`. *Use for sway/jitter/nudge offsets added to a position.*

### Deterministic pseudo-randomness

```ts
function prng(seed: number): () => number
```
Seeded PRNG (mulberry32). Returns a generator function; each call yields the next number in `[0, 1)`. Deterministic for a fixed `seed`. **This is the only source of "randomness" allowed in a scene** — use it for personalities, scattered layouts, star fields, grain, etc.

```ts
const rnd = prng(7);
const stars = Array.from({ length: 40 }, () => ({ x: rnd() * viewW, y: rnd() * viewH }));
```

### Canvas-aware drawing helpers (`anim.ts` only)

```ts
interface PathPoint { x: number; y: number; angle: number }
function makePath(points: [number, number][]): { length: number; at(d: number): PathPoint }
```
Builds an arc-length-parameterised polyline. `length` is the total path length; `at(d)` returns the point (and tangent `angle` in radians) a distance `d` along the path (clamped to `[0, length]`). *Use to walk a dot/marker along a route at constant speed: `path.at(phase(t, a, b) * path.length)`.*

```ts
function fadeText(ctx, text, x, y, alpha, font, color, align: CanvasTextAlign = "center"): void
```
Draws `text` at `(x, y)` with `globalAlpha = clamp01(alpha)`, given `font` and `color`, saving/restoring alpha/font/fill/align around it. No-op when `alpha <= 0`. *Use for every fading text label; drive `alpha` with `phase`.*

```ts
function radialGlow(ctx, x, y, r, color, alpha = 1): void
```
Additive radial-gradient glow blob centered at `(x, y)`, radius `r`, fading `color → transparent`. Uses `"lighter"` compositing so overlapping light adds up. No-op if `alpha <= 0` or `r <= 0`. Save/restored. *Use for suns, beams, electrons, energy — anything that emits light.*

```ts
function withGlow(ctx, opts: { blur; color; offsetX?; offsetY? }, draw: () => void): void
```
Runs `draw()` with a native canvas shadow (`shadowBlur`/`shadowColor`/offsets) set, then restores. Offsets default `0`. *Use for soft halos/shadows around arbitrary drawing without manual save/restore.*

```ts
function withAlpha(ctx, alpha: number, draw: () => void): void
```
Runs `draw()` with `globalAlpha *= clamp01(alpha)`, save/restored. No-op at `alpha <= 0`. *Use to fade a group of draw calls as one unit.*

```ts
function drawSvg(ctx, img, cx, cy, w, h, opts: { alpha?; rotate? } = {}): void
```
Draws an image (`CanvasImageSource`) centered at `(cx, cy)` at `w × h`, with optional `alpha` (default `1`) and `rotate` (radians). No-op when `img` is falsy or `alpha <= 0`, so scenes can call it with an optional/lazy-loaded asset. *Use for placing pre-rendered SVG/bitmap assets.*

---

## Composition (compose.ts)

`composeSlides` (`src/slides/compose.ts`) stitches standalone scenes into one film on a single timeline. Consecutive scenes overlap by `crossfade` seconds; each renders at its own local time inside a fade-in × fade-out alpha envelope. The result is a plain `CanvasSlideDefinition`, so the composed film is still a pure, seekable function of `t`.

```ts
function composeSlides(scenes: CanvasSlideDefinition[], options?: ComposeOptions): CanvasSlideDefinition
```

- `scenes` — one or more scenes. **All must share the same `viewW`/`viewH`** as `scenes[0]` (throws otherwise). Empty array throws.
- Returns a `CanvasSlideDefinition` whose `duration` is the total film length, with merged, rebased `captions`.

### ComposeOptions

```ts
interface ComposeOptions {
  crossfade?: number;      // default 2.5
  progressDots?: boolean;  // default true
  filmGrade?: boolean;     // default false
  theme?: Theme;           // default TEXTBOOK
  transition?: TransitionKind; // default "crossfade"
}
```

- `crossfade: number` (default `2.5`) — seconds of overlap between consecutive scenes. Clamped to `>= 0`; if it exceeds half the shortest scene's duration it is clamped to `shortest/2` (with a console warning). *Lower it for snappier cuts, raise it for dreamier dissolves.*
- `progressDots: boolean` (default `true`) — draw one progress dot per scene along the bottom (only meaningful for 2+ scene films). Active dot is amber (`#e8a13c`), completed dots teal (`#5cc8ae`), upcoming dots grey (`#39434d`). *Turn off for a clean full-bleed film.*
- `filmGrade: boolean` (default `false`) — apply the filmic overlay (vignette + grain + tonal grade) to the final composited frame, driven by the theme's `fx.vignette`/`fx.grain`. *Turn on for a cinematic finish; leave off for flat/diagrammatic clarity.*
- `theme: Theme` (default `TEXTBOOK`) — art-direction theme passed to every scene's `FrameCtx` and used for the film grade. *Set to reskin the whole film at once.*
- `transition: TransitionKind` (default `"crossfade"`) — scene-to-scene transition style (below).

### TransitionKind

```ts
type TransitionKind = "crossfade" | "zoom-through" | "whip-pan";
```

All three still run under the alpha crossfade envelope; the non-default kinds add an extra transform to the entering/leaving scene buffer:

- `"crossfade"` — pure opacity dissolve, no extra transform. The default, calmest transition.
- `"zoom-through"` — the entering scene starts slightly large (`scale 1.14 → 1`) and settles; the leaving scene grows as it exits (`scale 1 → 1.5`). Reads as diving through one scene into the next. *Use for a punchy, forward-momentum feel.*
- `"whip-pan"` — the entering scene slides in from the right and the leaving scene slides off to the left (`±55%` of canvas width). Reads as a fast horizontal camera whip. *Use for lateral "and now, over here…" transitions.*

### pace()

```ts
function pace(scene: CanvasSlideDefinition, newDuration: number): CanvasSlideDefinition
```

Re-paces a scene to play over a different (usually longer) `newDuration`, stretching its **entire internal timeline uniformly**. It returns a new scene with the new `duration` whose `render` calls the original with `t * (originalDuration / newDuration)`. So the scene animates over the full new length at the same relative timing — nothing freezes, no end-behavior is skipped, it just plays a touch slower (or faster). Pure: same `t` in, same pixels out. *Use to fit a scene to its narration length before composing.*

```ts
const fitted = pace(orbitScene, audioDurations.orbit); // stretch to match the voiceover
const film = composeSlides([intro, fitted, outro], { theme: TEXTBOOK, filmGrade: true });
```

### How scene windows & crossfades work

Windows are laid out with an advancing cursor so each scene starts `crossfade` seconds before the previous one ends:

- Scene `i`'s window is `start_i = start_{i-1} + (duration_{i-1} - crossfade)`, with `start_0 = 0`. Its fade-out `end_i = start_i + duration_i`.
- **Film duration** `= sum(durations) - (n - 1) * crossfade` (the cursor after all scenes, plus the trailing `crossfade` — algebraically the same).
- A scene's **local time** is `t - start_i`, clamped to `[0, duration_i]`.
- **Fade envelope:** `alpha = fadeIn * fadeOut`, where `fadeIn = phase(t, start, start + crossfade)` and `fadeOut = 1 - phase(t, end - crossfade, end)`. The **first scene has no fade-in and the last no fade-out** (they hold on a full frame — the film opens/closes solid, and scene-internal animation handles intro/outro). Only interior boundaries actually cross-dissolve.
- During a crossfade the composer renders each active scene into a **shared offscreen buffer** and composites that buffer under the envelope alpha, so a scene's own `clearRect`/absolute `globalAlpha` calls only affect the buffer — never defeating the fade. (Single-scene films and environments without buffer support fall back to a direct `withAlpha` render.)
- Captions from each scene are rebased to film time (`c.at + start_i`) and any that would spill past the next scene's start are dropped.
# Step 04 · Draw-on strokes — `src/render/strokes.ts`, `src/render/strokeVerbs.ts`

**Responsibility.** A single primitive — a normalized `[start, end]` window over a path's arc length — powers all self-drawing. `strokes.ts` is the geometry + style + renderer (arc-length tables, curve interpolation, variable-width fill, the one `strokeWindow` renderer). `strokeVerbs.ts` is the higher-level vocabulary (draw-on, passing-flash, border-then-fill, traced trails, circumscribe, markers, followers, staggered sequences), all thin wrappers over that window.

**When to use.** Any line or path that should draw itself over time: the spine for callouts, plots, maps, borders, arrows, underlines, and "circle the answer" highlights. Every function is pure in its progress input (`p` or `t`), so strokes are deterministic and seekable — the same `t` yields the same frame.

**Pipeline.** raw points → `smoothPath()` (optional curve interpolation) → dense polyline → `windowPolyline()` by arc length → optional roughen (hand-drawn) / taper (variable width) → stroked or filled onto a `CanvasRenderingContext2D`.

---

## `src/render/strokes.ts`

### Type: `Pt`

```ts
export type Pt = [number, number];
```

A 2-D point as an `[x, y]` tuple. Every path is a `Pt[]` polyline.

---

### Interface: `ArcTable`

```ts
export interface ArcTable {
  pts: Pt[];
  cum: number[];   // cumulative length up to each point
  length: number;  // total arc length
}
```

- `pts: Pt[]` — the polyline the table describes.
- `cum: number[]` — cumulative arc length up to each point (`cum[0] === 0`).
- `length: number` — total arc length of the polyline (`0` for a single point).

Arc-length tables are cached in a `WeakMap` keyed by the point-array's identity. Static paths (built once, redrawn every frame) hit the cache; per-frame arrays miss and are GC'd with the array. **Contract: treat point arrays as immutable once passed in** — mutating one in place staled the cached table.

---

### arcTable

```ts
export function arcTable(points: Pt[]): ArcTable
```

- **Purpose:** Build (or reuse from cache) a cumulative arc-length table for a polyline.
- **Parameters:** `points: Pt[]` — the polyline. Treat as immutable (see caching note above).
- **Returns:** `ArcTable`. O(n) on a cache miss, O(1) on a hit.
- **Example:**
  ```ts
  const t = arcTable(myPath);
  const total = t.length;
  ```
- **Composes with:** underpins `pointAt`, `windowPolyline`, `fillOutline`, and `pathLength`.

---

### Interface: `SamplePoint`

```ts
export interface SamplePoint {
  x: number;
  y: number;
  angle: number;  // tangent direction (radians)
}
```

- `x`, `y: number` — sampled position.
- `angle: number` — tangent direction in radians (`Math.atan2` of the local segment). For a single-point path, `angle` is `0`.

---

### pointAt

```ts
export function pointAt(points: Pt[], p: number): SamplePoint
```

- **Purpose:** Point + tangent at arc-length fraction `p` along a polyline. For tracers, markers, followers.
- **Parameters:**
  - `points: Pt[]` — the polyline.
  - `p: number` — arc-length fraction, `0..1` (clamped internally via `clamp01`).
- **Returns:** `SamplePoint` (`x`, `y`, `angle`).
- **Example:**
  ```ts
  const head = pointAt(path, 0.5); // midpoint by arc length + tangent
  ```
- **Composes with:** `tracerDot`, `handFollower`, and any custom marker riding the draw head.

---

### windowPolyline

```ts
export function windowPolyline(points: Pt[], start: number, end: number): Pt[]
```

- **Purpose:** The core primitive — the sub-polyline covering arc-length fractions `[start, end]`, with interpolated points at both cut ends. `windowPolyline(pts, 0, p)` is the draw-on shape.
- **Parameters:**
  - `points: Pt[]` — dense polyline (run `smoothPath` first for curves).
  - `start: number` — window start fraction, `0..1` (clamped).
  - `end: number` — window end fraction, `0..1` (clamped).
- **Returns:** `Pt[]`.
  - Empty input → `[]`.
  - Zero-length path → the single start point.
  - `end <= start` → a single interpolated point at `start`.
  - Otherwise → `[startCut, ...interiorPoints, endCut]`.
- **Example:**
  ```ts
  const drawn = windowPolyline(path, 0, 0.4);      // first 40%
  const middle = windowPolyline(path, 0.3, 0.7);   // sliding window
  ```
- **Composes with:** consumed by `strokeWindow`; the basis of every verb.

---

### partialPolyline

```ts
export const partialPolyline = (points: Pt[], p: number): Pt[]
```

- **Purpose:** First `p` (`0..1`) of a polyline by arc length — draw-on convenience. Equals `windowPolyline(points, 0, p)`.
- **Parameters:** `points: Pt[]`; `p: number` (`0..1`).
- **Returns:** `Pt[]`.
- **Composes with:** shorthand over `windowPolyline`.

---

### Type: `CurveKind`

```ts
export type CurveKind =
  | "linear"
  | "cardinal"
  | "catmullRom"
  | "basis"
  | "natural"
  | "step"
  | "stepBefore"
  | "stepAfter";
```

The interpolation family used by `smoothPath`. Allowed values:

- `"linear"` — no interpolation; points used as-is (straight segments).
- `"cardinal"` — cardinal spline (Hermite tangents scaled by `1 − tension`). Passes through every point. Honors `tension`.
- `"catmullRom"` — Catmull-Rom spline with knot parameterisation `alpha`. Passes through every point.
- `"basis"` — uniform cubic B-spline. Very smooth; does **not** pass through interior points (good for organic blobs). Endpoints are doubled so the curve nearly meets the first/last control point.
- `"natural"` — natural cubic spline (2nd derivative zero at the ends), solved per axis via the Thomas algorithm. Passes through points.
- `"step"` — orthogonal steps with the riser at the segment midpoint.
- `"stepBefore"` — vertical move first, then horizontal (riser before the point).
- `"stepAfter"` — horizontal move first, then vertical (riser after the point).

---

### Interface: `CurveOptions`

```ts
export interface CurveOptions {
  curve?: CurveKind;
  tension?: number;
  alpha?: number;
  closed?: boolean;
  samples?: number;
}
```

- `curve?: CurveKind` (default `"linear"`) — which interpolation family (see `CurveKind`).
- `tension?: number` (default `0`) — cardinal only: `0` = loose/round … `1` = straight.
- `alpha?: number` (default `0.5`) — catmullRom only: `0` = uniform, `0.5` = centripetal (no cusps, best default), `1` = chordal.
- `closed?: boolean` (default `false`) — treat the path as a loop; wraps control points and appends the first point at the end. Ignored by `"step*"` kinds.
- `samples?: number` (default `16`) — points generated per input segment for smooth curves. Higher = smoother/denser.

---

### smoothPath

```ts
export function smoothPath(points: Pt[], opts: CurveOptions = {}): Pt[]
```

- **Purpose:** Interpolate a control-point list into a dense polyline using the chosen curve. Feeds `windowPolyline` for uniform-speed draw-on.
- **Parameters:** `points: Pt[]`; `opts: CurveOptions` (all fields above).
- **Returns:** `Pt[]` dense polyline.
  - `"linear"`, or fewer than 3 input points → points returned as-is (with the first point appended when `closed`).
  - `"step" | "stepBefore" | "stepAfter"` → the step polyline (ignores `closed`).
  - `"cardinal" | "catmullRom" | "basis" | "natural"` → sampled dense curve; `"natural"` appends the first point when `closed`.
- **Example:**
  ```ts
  const smooth = smoothPath(controlPts, { curve: "catmullRom", alpha: 0.5, samples: 24 });
  const loop   = smoothPath(controlPts, { curve: "cardinal", tension: 0.2, closed: true });
  strokeOn(ctx, smooth, p, style, theme);
  ```
- **Composes with:** run before `strokeWindow`/`strokeOn`/`drawOn` whenever the path is a curve rather than an explicit dense polyline.

---

### Interface: `StrokeStyle`

```ts
export interface StrokeStyle {
  // appearance
  color?: string | CanvasGradient | CanvasPattern;
  width?: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  miterLimit?: number;
  // dashes
  dash?: number[];
  dashOffset?: number;
  // compositing
  alpha?: number;
  blend?: GlobalCompositeOperation;
  shadow?: { blur: number; color: string; dx?: number; dy?: number };
  // hand-drawn
  roughness?: number;
  seed?: number;
  // variable width
  taperStart?: number;
  taperEnd?: number;
  widthProfile?: (t: number) => number;
  minWidth?: number;
}
```

Appearance:
- `color?: string | CanvasGradient | CanvasPattern` — stroke/fill color. Default resolves to `theme.palette.ink`, else `"#ffffff"`.
- `width?: number` — line width. Default resolves to `theme.lineStyle.width`, else `2`.
- `cap?: CanvasLineCap` (default `"round"`) — line cap. In variable-width/brush mode, `"round"` (the default) draws round disc end-caps; any other value gives flat butt ends.
- `join?: CanvasLineJoin` (default `"round"`) — line join (stroke mode only).
- `miterLimit?: number` — miter limit; applied only when set (stroke mode only).

Dashes (stroke mode only — ignored in variable-width/brush mode):
- `dash?: number[]` — dash pattern passed to `setLineDash`.
- `dashOffset?: number` (default `0`) — dash phase offset.

Compositing:
- `alpha?: number` — multiplies the current `globalAlpha` (clamped `0..1`).
- `blend?: GlobalCompositeOperation` — canvas composite operation (e.g. `"lighter"`).
- `shadow?: { blur: number; color: string; dx?: number; dy?: number }` — drop shadow; `dx`/`dy` default `0`.

Hand-drawn:
- `roughness?: number` (default `0`, or `theme.lineStyle.roughness`) — per-point jitter via the theme's `roughen()`.
- `seed?: number` (default `1`) — fixes the jitter so it doesn't crawl between frames.

Variable width — **any of these switches the renderer to outline-fill "brush" mode** (dashes ignored; `cap` selects round vs. flat end-caps):
- `taperStart?: number` — px length over which width tapers up from `0` at the very start.
- `taperEnd?: number` — px length over which width tapers down to `0` at the very end.
- `widthProfile?: (t: number) => number` — `t` `0..1` along the drawn span → width multiplier.
- `minWidth?: number` — floor so a variable-width stroke never fully vanishes.

---

### strokeWindow

```ts
export function strokeWindow(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  start: number,
  end: number,
  style: StrokeStyle = {},
  theme?: Theme,
): void
```

- **Purpose:** Stroke the arc-length window `[start, end]` of `points` with `style`. The one renderer every verb uses.
- **Parameters:**
  - `ctx` — target 2-D context (a raw ctx or any FrameCtx layer).
  - `points: Pt[]` — should already be a dense polyline (run `smoothPath` first for curves).
  - `start`, `end: number` — window fractions `0..1`.
  - `style: StrokeStyle` (default `{}`) — see `StrokeStyle`; unset fields resolve from `theme`.
  - `theme?: Theme` — supplies default `color`, `width`, `roughness` and the `roughen()` used for hand-drawn jitter.
- **Behavior:** Windows the polyline; returns early if fewer than 2 points result. Applies roughen (if `roughness`), alpha/blend/shadow, then either variable-width `fillOutline` (when any taper/`widthProfile` is set) or a plain stroked path. Wrapped in `ctx.save()/restore()`.
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeWindow(ctx, path, 0.2, 0.8, { color: "#4af", width: 3 }, theme);
  ```
- **Composes with:** the base of `drawOn`, `passingFlash`, `drawBorderThenFill`, `tracedPath`, `circumscribe`, `strokeSequence`, `strokeOn`.

---

### strokeOn

```ts
export const strokeOn = (
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  style?: StrokeStyle,
  theme?: Theme,
) => void
```

- **Purpose:** Draw-on convenience — the first `p` (`0..1`) of `points`. Equals `strokeWindow(ctx, points, 0, p, …)`.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`); `style?: StrokeStyle`; `theme?: Theme`.
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeOn(ctx, path, progress, { color: "#fff", width: 2 }, theme);
  ```
- **Composes with:** shorthand over `strokeWindow`; use `drawOn` for from-end/center/both variants.

---

## `src/render/strokeVerbs.ts`

### Type: `StrokeFrom`

```ts
export type StrokeFrom = "start" | "end" | "center" | "both";
```

Direction a draw-on grows. Allowed values:
- `"start"` — grows from the head (window `0 → p`). Default.
- `"end"` — grows from the tail (window `1 − p → 1`).
- `"center"` — grows outward from the middle (`0.5 − p/2 → 0.5 + p/2`).
- `"both"` — grows inward from both ends simultaneously.

---

### Interface: `DrawOptions`

```ts
export interface DrawOptions {
  from?: StrokeFrom;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `from?: StrokeFrom` (default `"start"`) — growth direction.
- `style?: StrokeStyle` — stroke style.
- `theme?: Theme` — theme for style defaults.

---

### drawOn

```ts
export function drawOn(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: DrawOptions = {}): void
```

- **Purpose:** Draw the first `p` (`0..1`) of a path, optionally growing from the end, center, or both ends.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`, clamped); `opts: DrawOptions` (`from`, `style`, `theme`).
- **Returns:** `void`.
- **Example:**
  ```ts
  drawOn(ctx, path, p, { from: "center", style: { color: "#fff" }, theme });
  ```
- **Composes with:** wraps `strokeWindow`; used by `strokeSequence`; inverted by `erase`.

---

### erase

```ts
export function erase(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: DrawOptions = {}): void
```

- **Purpose:** Un-draw — the reverse of `drawOn`. At `p=0` fully drawn, at `p=1` gone (retracts from the tail by default).
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`, clamped); `opts: DrawOptions`. Calls `drawOn(ctx, points, 1 − p, opts)`.
- **Returns:** `void`.
- **Example:**
  ```ts
  erase(ctx, path, p, { from: "start", theme }); // retracts as p rises
  ```
- **Composes with:** inverse of `drawOn`; shares its `from` semantics.

---

### Interface: `FlashOptions`

```ts
export interface FlashOptions {
  width?: number;
  thinning?: boolean;
  glow?: boolean;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `width?: number` (default `0.15`) — sliver length as a fraction of the path (`0..1`).
- `thinning?: boolean` — taper the sliver toward its tail (comet look); sets `widthProfile = (t) => t`.
- `glow?: boolean` — composite the sliver additively (`"lighter"`) for a light-sweep look, unless `style.blend` is already set.
- `style?: StrokeStyle` — base style (shallow-copied).
- `theme?: Theme` — theme for style defaults.

---

### passingFlash

```ts
export function passingFlash(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: FlashOptions = {}): void
```

- **Purpose:** A short bright sliver that sweeps the path from start to end as `p` goes `0 → 1`, then exits.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`); `opts: FlashOptions`. The head travels `0 → 1+width` so the sliver fully enters and leaves; returns early if the window collapses.
- **Returns:** `void`.
- **Example:**
  ```ts
  passingFlash(ctx, path, p, { width: 0.2, thinning: true, glow: true, style: { color: "#8ff" }, theme });
  ```
- **Composes with:** built on `strokeWindow`; `thinning`/`glow` inject `widthProfile`/`blend` into the style.

---

### Interface: `BorderThenFillOptions`

```ts
export interface BorderThenFillOptions {
  style?: StrokeStyle;
  fill?: string | CanvasGradient | CanvasPattern;
  fillRule?: CanvasFillRule;
  split?: number;
  theme?: Theme;
}
```

- `style?: StrokeStyle` — outline stroke style.
- `fill?: string | CanvasGradient | CanvasPattern` — fill applied after the border draws; omit for outline-only.
- `fillRule?: CanvasFillRule` (default `"nonzero"`) — fill rule.
- `split?: number` (default `0.6`) — fraction of `p` spent drawing the border before the fill fades in.
- `theme?: Theme` — theme for style defaults.

---

### drawBorderThenFill

```ts
export function drawBorderThenFill(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: BorderThenFillOptions = {}): void
```

- **Purpose:** Draw a closed shape's outline on, then fade its fill in — the "Write"/region-reveal primitive.
- **Parameters:** `ctx`; `points: Pt[]` (the closed outline); `p: number` (`0..1`); `opts: BorderThenFillOptions`. Border draws over `p ∈ [0, split]`; if `fill` is set and `p > split`, the fill fades in over the remaining span.
- **Returns:** `void`.
- **Example:**
  ```ts
  drawBorderThenFill(ctx, shape, p, { style: { color: "#fff" }, fill: "#1c2c4a", split: 0.5, theme });
  ```
- **Composes with:** border via `strokeWindow`; the fill is drawn directly onto `ctx` (own `save`/`restore`).

---

### Interface: `TracedPathOptions`

```ts
export interface TracedPathOptions {
  step?: number;
  dissipate?: number;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `step?: number` (default `0.03`) — sampling interval in the mover's own time units.
- `dissipate?: number` — if set, only the last `dissipate` time-units of trail are kept (comet tail); otherwise the trail starts from `0`.
- `style?: StrokeStyle` — trail stroke style.
- `theme?: Theme` — theme for style defaults.

---

### tracedPath

```ts
export function tracedPath(
  ctx: CanvasRenderingContext2D,
  mover: (tt: number) => Pt,
  t: number,
  opts: TracedPathOptions = {},
): void
```

- **Purpose:** Draw the trail a moving point leaves behind.
- **Parameters:**
  - `ctx` — target context.
  - `mover: (tt: number) => Pt` — **must be a pure function of time** so the trail is reproduced exactly on any seek.
  - `t: number` — current time.
  - `opts: TracedPathOptions` — `step`, `dissipate`, `style`, `theme`.
- **Behavior:** Samples on a fixed global grid (so tail vertices stay put as `t` advances — no shimmer) from `0` (or `t − dissipate`) up to the current `t`, then appends the exact head at `t`. Strokes the whole trail (window `0 → 1`) once it has ≥2 points.
- **Returns:** `void`.
- **Example:**
  ```ts
  tracedPath(ctx, (tt) => orbit(tt), t, { dissipate: 1.5, style: { color: "#fa0" }, theme });
  ```
- **Composes with:** `strokeWindow` for rendering; pair with `pointAt`/`tracerDot` to mark the head.

---

### Interface: `CircumscribeOptions`

```ts
export interface CircumscribeOptions {
  shape?: "rect" | "ellipse";
  buff?: number;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `shape?: "rect" | "ellipse"` (default rectangle) — loop shape. `"ellipse"` draws a 48-segment ellipse; any other value (or omitted) draws a rectangle.
- `buff?: number` (default `8`) — padding around the box on all sides.
- `style?: StrokeStyle` — loop stroke style; its `alpha` is multiplied by the fade.
- `theme?: Theme` — theme for style defaults.

---

### circumscribe

```ts
export function circumscribe(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: number,
  opts: CircumscribeOptions = {},
): void
```

- **Purpose:** A temporary highlight loop that draws around a box then fades — "circle the answer".
- **Parameters:** `ctx`; `box: { x; y; w; h }`; `p: number` (`0 → 1`); `opts: CircumscribeOptions`. First half of `p` (`0 → 0.5`) draws the loop on; second half (`0.5 → 1`) fades it out via `style.alpha`.
- **Returns:** `void`.
- **Example:**
  ```ts
  circumscribe(ctx, { x, y, w, h }, p, { shape: "ellipse", buff: 12, style: { color: "#ffd54a", width: 3 }, theme });
  ```
- **Composes with:** built on `strokeWindow`.

---

### arrowhead

```ts
export function arrowhead(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; angle: number },
  opts: { size?: number; color?: string; alpha?: number } = {},
): void
```

- **Purpose:** Draw a filled arrowhead at a sampled point, rotated to its tangent. Reveal via `alpha` on arrival.
- **Parameters:**
  - `at: { x; y; angle }` — position and tangent (radians), e.g. from `pointAt`.
  - `opts.size?: number` (default `12`) — arrowhead length in px.
  - `opts.color?: string` (default `"#fff"`) — fill color.
  - `opts.alpha?: number` (default `1`, clamped) — opacity; returns early if `≤ 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  arrowhead(ctx, pointAt(path, 1), { size: 14, color: "#fff", alpha: p });
  ```
- **Composes with:** feed it `pointAt(points, p)` to cap a draw-on head or an arrow's tip.

---

### dot

```ts
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void
```

- **Purpose:** A filled dot at a point — path endpoint marker or waypoint.
- **Parameters:** `x`, `y: number` — center; `r: number` — radius; `color: string` — fill; `alpha = 1` (clamped) — opacity, returns early if `≤ 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  dot(ctx, 100, 200, 5, "#fff", 0.9);
  ```
- **Composes with:** the primitive behind `tracerDot`.

---

### tracerDot

```ts
export function tracerDot(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  opts: { r?: number; color?: string; alpha?: number } = {},
): void
```

- **Purpose:** A dot riding the current draw head at progress `p` — a pen/tracer tip.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`, positioned via `pointAt`); `opts.r?: number` (default `4`); `opts.color?: string` (default `"#fff"`); `opts.alpha?: number` (default `1`).
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeOn(ctx, path, p, style, theme);
  tracerDot(ctx, path, p, { r: 5, color: "#8ff" });
  ```
- **Composes with:** pair with `strokeOn`/`drawOn` to mark the pen tip; built on `pointAt` + `dot`.

---

### handFollower

```ts
export function handFollower(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  img: CanvasImageSource,
  opts: { w?: number; h?: number; offsetX?: number; offsetY?: number; alpha?: number } = {},
): void
```

- **Purpose:** Draw an image (hand/pen/chalk) at the draw head, oriented to the path tangent.
- **Parameters:**
  - `points: Pt[]`; `p: number` (`0..1`, positioned via `pointAt`).
  - `img: CanvasImageSource` — the image to draw.
  - `opts.w?: number` (default `48`) — draw width; `opts.h?: number` (default `48`) — draw height.
  - `opts.offsetX?: number` (default `0`), `opts.offsetY?: number` (default `0`) — draw offset from the head, after translate+rotate.
  - `opts.alpha?: number` (default `1`, clamped) — opacity; returns early if `≤ 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  handFollower(ctx, path, p, penImg, { w: 56, h: 56, offsetX: -8, offsetY: -48 });
  ```
- **Composes with:** ride it alongside `drawOn`/`strokeOn`; positioned by `pointAt`.

---

### pathLength

```ts
export const pathLength = (points: Pt[]): number
```

- **Purpose:** Total arc length of a polyline — convenience for callers that pace draw speed by length. Equals `arcTable(points).length`.
- **Parameters:** `points: Pt[]`.
- **Returns:** `number` — total arc length.
- **Example:**
  ```ts
  const speed = 300;                     // px/sec
  const dur = pathLength(path) / speed;  // seconds to draw at constant speed
  ```
- **Composes with:** derive `p` or `dur` for `drawOn`/`strokeSequence`.

---

### Interface: `SequenceOptions`

```ts
export interface SequenceOptions {
  start?: number;
  step: number;
  dur: number;
  from?: StrokeFrom;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `start?: number` (default `0`) — time the first path begins.
- `step: number` (**required**) — stagger between consecutive paths. `0` → all at once; large → strictly sequential.
- `dur: number` (**required**) — draw duration of each path.
- `from?: StrokeFrom` — growth direction passed to each `drawOn`.
- `style?: StrokeStyle` — stroke style for all paths.
- `theme?: Theme` — theme for style defaults.

---

### strokeSequence

```ts
export function strokeSequence(ctx: CanvasRenderingContext2D, paths: Pt[][], t: number, opts: SequenceOptions): void
```

- **Purpose:** Draw many paths one after another with a staggered cascade. Each path's progress is `stagger(t, i, …)`, so the whole cascade stays seekable.
- **Parameters:** `ctx`; `paths: Pt[][]` — the polylines; `t: number` — current time; `opts: SequenceOptions` — `start`, `step`, `dur`, `from`, `style`, `theme`. Each path is drawn via `drawOn` only when its progress `p > 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeSequence(ctx, [pathA, pathB, pathC], t, { step: 0.4, dur: 0.8, from: "start", style: { color: "#fff" }, theme });
  ```
- **Composes with:** loops `drawOn` over the paths using `motion.stagger` for timing.
```
# Step 05 · Reveal grammar — `src/render/reveal.ts`

**Responsibility.** Content that *enters by shape*: directional wipes, iris/shape reveals, clock (radial) wipes, blinds, checkerboard, dissolve, and soft radial spotlight / fog-of-war. The unifying model: every reveal is a mask that is a pure function of progress `p ∈ [0,1]`, applied one of two ways — a **hard** `ctx.clip()` to the revealed shape, or a **soft** offscreen buffer + `destination-in` mask (feather = a `blur()` on the mask; invert = `destination-out`). Each verb only describes *what shape is revealed at progress p*; the internal `applyReveal` picks the hard or soft path.

**When to use.** Any time a scene element should appear (or be concealed) by a growing/sweeping shape rather than a simple fade — title cards, map territories, staged diagram parts, "flashlight" reveals. For an exotic mask not built here, draw it yourself through the universal `masked()`. `withBlend()` is the low-level composite-mode wrapper the rest builds on.

**Determinism.** Masks are recomputed from `p` each frame with no state; `ease` wraps `p` (never baked in); `dissolve`/`checkerboard` randomness is seeded.

**Exports.** Functions: `withBlend`, `masked`, `revealRect`, `wipe`, `iris`, `clipShape`, `radialWipe`, `blinds`, `checkerboard`, `dissolve`, `spotlight`. Types: `BlendMode`, `RevealOptions`, `WipeDir`, `WipeOptions`, `IrisShape`, `IrisOptions`, `RadialWipeOptions`, `BlindsOptions`, `CheckerOrder`, `CheckerOptions`, `DissolveOptions`, `SpotlightOptions`.

> Note: `revealRect` is exported but is a low-level helper (the revealed rectangle for one cardinal direction). `applyReveal`, `revealRects`, and `irisPath` are internal (not exported).

---

### withBlend
```ts
export function withBlend(ctx: CanvasRenderingContext2D, mode: BlendMode, draw: () => void): void
```
- **Purpose:** Run `draw` under a composite/blend mode; the context's `globalCompositeOperation` is saved and restored around the call.
- **Parameters / options:**
  - `ctx: CanvasRenderingContext2D` — target context.
  - `mode: BlendMode` — the composite operation (alias of `GlobalCompositeOperation`, e.g. `"multiply"`, `"screen"`, `"lighter"`, `"destination-out"`, …). *When to use:* additive glows (`"lighter"`), shading (`"multiply"`), knock-outs (`"destination-out"`).
  - `draw: () => void` — closure that paints while the blend mode is active (takes no args; closes over `ctx`).
- **Example:**
  ```ts
  withBlend(ctx, "lighter", () => { ctx.fillStyle = "rgba(255,220,120,0.4)"; ctx.fillRect(x, y, w, h); });
  ```
- **Composes with:** the foundation for any additive/knock-out effect; `spotlight`/`focus` glows use the same idea internally.

---

### masked
```ts
export function masked(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  drawContent: (c: CanvasRenderingContext2D) => void,
  drawMask: (c: CanvasRenderingContext2D) => void,
  opts: { invert?: boolean } = {},
): void
```
- **Purpose:** The universal soft-mask primitive. Renders `drawContent` to an offscreen buffer, then composites the mask so the mask's alpha (or luminance if you paint opaque) becomes the coverage. Any custom reveal shape can be built on this. Falls back to drawing `drawContent(ctx)` unmasked when no DOM canvas is available (SSR / non-DOM contexts).
- **Parameters / options:**
  - `ctx` — target context. Reads `ctx.canvas.width/height` for the buffer size; requires `ctx.getTransform`.
  - `viewW: number`, `viewH: number` — view dimensions (accepted for API symmetry; the buffer itself is sized from the canvas backing store).
  - `drawContent: (c) => void` — paints the content to be masked.
  - `drawMask: (c) => void` — paints the mask; the fill style is preset to `#fff`. Draw a solid shape for a hard mask, a gradient or blurred shape for a soft one.
  - `opts.invert?: boolean` (default `false`) — `false` → `destination-in` (reveal *inside* the mask); `true` → `destination-out` (conceal inside the mask — fog-of-war the other direction).
- **Behavior notes:** The masked result is blitted back with `globalCompositeOperation = "source-over"`, ignoring any blend mode the caller set. Uses a shared reusable scratch canvas, and allocates a temporary one if called re-entrantly; the reentrancy flag is cleared even if a draw callback throws.
- **Example:**
  ```ts
  masked(ctx, w, h,
    (b) => drawScene(b),
    (m) => { m.filter = "blur(12px)"; m.beginPath(); m.arc(cx, cy, r, 0, 7); m.fill(); },
  );
  ```
- **Composes with:** the execution path behind soft `wipe`/`iris`/`clipShape`/`radialWipe`/`blinds`/`checkerboard`/`dissolve` and `spotlight`; also used directly by `focus.emphasizeSurround`.

---

### revealRect
```ts
export function revealRect(
  p: number,
  dir: "left" | "right" | "up" | "down",
  w: number,
  h: number,
): [number, number, number, number]
```
- **Purpose:** Pure helper returning the revealed rectangle `[x, y, w, h]` for a single cardinal directional wipe at progress `p` (clamped to `[0,1]`).
- **Parameters / options:**
  - `p: number` — progress, internally `clamp01`'d.
  - `dir` — one of: `"left"` (grows rightward from left edge), `"right"` (grows leftward from right edge), `"up"` (grows upward from bottom), `"down"` (grows downward from top).
  - `w`, `h` — view width/height.
- **Example:** `const [x, y, rw, rh] = revealRect(0.5, "left", 800, 450); // [0, 0, 400, 450]`
- **Composes with:** used internally by `wipe`'s rectangle computation; exposed for testing / custom clip math.

---

### wipe
```ts
export function wipe(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: WipeOptions = {},
): void
```
- **Purpose:** Reveal `draw` by sweeping an edge across the frame — directional, center-split, edges-in, or an arbitrary angle.
- **Parameters / options:**
  - `p: number` — raw progress; remapped through `opts.ease` if present.
  - `w`, `h` — view dimensions.
  - `draw: (c) => void` — content to reveal.
  - `opts.dir?: WipeDir` (default `"left"`) — sweep direction (see `WipeDir` values below). Ignored if `opts.angle` is set.
  - `opts.angle?: number` (radians) — arbitrary edge angle; **overrides `dir`**, enabling diagonals. Sweeps a half-plane whose normal is `angle`, projecting the frame corners to find the sweep range.
  - `opts.border?: { width: number; color: string }` — draws a stroked edge along the moving front while `0 < P < 1` (the sweeping line for `angle`; the rect outlines otherwise).
  - Plus all `RevealOptions`: `feather`, `invert`, `ease`.
- **Example:**
  ```ts
  wipe(ctx, p, 800, 450, (c) => drawTitle(c), { dir: "center-h", feather: 20, ease: easeInOut });
  wipe(ctx, p, 800, 450, drawMap, { angle: Math.PI / 6, border: { width: 3, color: "#fff" } });
  ```
- **Composes with:** `RevealOptions` easing; feather/invert route through `masked`.

---

### iris
```ts
export function iris(
  ctx: CanvasRenderingContext2D,
  p: number,
  cx: number,
  cy: number,
  maxR: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: IrisOptions = {},
): void
```
- **Purpose:** Reveal `draw` through a shape growing (or, with `close`, shrinking) from a center point — classic camera iris and shape-mask entrances.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `cx`, `cy` — center of the shape.
  - `maxR: number` — radius at full progress.
  - `draw` — content to reveal.
  - `opts.shape?: IrisShape` (default `"circle"`) — see `IrisShape` values below.
  - `opts.aspect?: number` (default `1`) — `ry/rx` for `"ellipse"`/`"rect"`.
  - `opts.sides?: number` (default `6` for polygon, `5` for star) — point count.
  - `opts.rotation?: number` (radians, default `0`) — rotate the shape.
  - `opts.innerRatio?: number` (default `0.5`) — star inner/outer radius ratio.
  - `opts.close?: boolean` (default `false`) — `false` → radius grows from `P` (opens); `true` → radius from `1−P` (closes/contracts).
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
- **Edge case:** when the computed radius `r <= 0`, nothing is drawn — except if `opts.invert` is set, in which case the full `draw` is shown (a fully-concealed shape reveals everything).
- **Example:**
  ```ts
  iris(ctx, p, 400, 225, 500, drawScene, { shape: "star", sides: 6, feather: 8 });
  iris(ctx, p, 400, 225, 500, drawScene, { close: true, invert: true }); // closing fog
  ```
- **Composes with:** feather/invert via `masked`; `RevealOptions.ease`.

---

### clipShape
```ts
export function clipShape(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { invert?: boolean; feather?: number } = {},
): void
```
- **Purpose:** Reveal `draw` through an arbitrary closed polygon defined by explicit points.
- **Parameters / options:**
  - `points: [number, number][]` — polygon vertices `[x, y]`. If fewer than 3 points, the call is a no-op (returns immediately).
  - `draw` — content to reveal.
  - `opts.invert?: boolean` (default `false`) — conceal inside the polygon instead of revealing.
  - `opts.feather?: number` (default `0`) — soft edge width in view units.
  - *Note:* this local `opts` type has only `invert` and `feather` (no `ease`); progress is not a parameter — the polygon is static.
- **Example:**
  ```ts
  clipShape(ctx, [[100,100],[300,120],[280,260],[120,240]], drawPhoto, { feather: 10 });
  ```
- **Composes with:** `masked` for soft/inverted edges (hard clip otherwise).

---

### radialWipe
```ts
export function radialWipe(
  ctx: CanvasRenderingContext2D,
  p: number,
  cx: number,
  cy: number,
  radius: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: RadialWipeOptions = {},
): void
```
- **Purpose:** Reveal `draw` with a sweeping angular sector (clock / pie wipe) around a center.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`. If `P <= 0`, nothing draws.
  - `cx`, `cy` — pivot center.
  - `radius: number` — sector radius (make it large enough to cover the content).
  - `draw` — content to reveal.
  - `opts.startAngle?: number` (radians, default `-π/2` = 12 o'clock) — where the sweep begins.
  - `opts.dir?: "cw" | "ccw"` — sweep direction: `"cw"` (default when unset, sweeps clockwise, `end = start + sweep`); `"ccw"` (counter-clockwise, `end = start − sweep`).
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
  - *Detail:* the sweep is capped at `2π − 1e-4` to avoid a degenerate empty arc at `P = 1`.
- **Example:**
  ```ts
  radialWipe(ctx, p, 400, 225, 600, drawDial, { dir: "cw", feather: 6 });
  ```
- **Composes with:** `masked` for soft/inverted edges; `RevealOptions.ease`.

---

### blinds
```ts
export function blinds(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: BlindsOptions = {},
): void
```
- **Purpose:** Reveal `draw` through venetian blinds — `count` slats each opening in unison with `p`.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `w`, `h` — view dimensions.
  - `draw` — content to reveal.
  - `opts.count?: number` (default `8`) — number of slats.
  - `opts.dir?: "h" | "v"` (default `"h"`) — `"h"` = slats stacked vertically, each opening downward across a horizontal band; `"v"` = slats stacked horizontally, each opening rightward.
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
- **Example:**
  ```ts
  blinds(ctx, p, 800, 450, drawImage, { count: 12, dir: "v", feather: 4 });
  ```
- **Composes with:** `masked` for soft/inverted edges.

---

### checkerboard
```ts
export function checkerboard(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: CheckerOptions = {},
): void
```
- **Purpose:** Reveal `draw` cell-by-cell across a grid; each cell scales in from its center once progress passes that cell's threshold. Ordering controls the reveal pattern.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `w`, `h` — view dimensions.
  - `draw` — content to reveal.
  - `opts.rows?: number` (default `6`).
  - `opts.cols?: number` (default `10`).
  - `opts.order?: CheckerOrder` (default `"diagonal"`) — reveal ordering; see `CheckerOrder` values below.
  - `opts.seed?: number` (default `7`) — PRNG seed for `order: "random"` (stable ranks so seeking is deterministic).
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
  - *Detail:* each cell fades in over a `0.15` progress span with a per-cell scale from center; thresholds are clamped so `p = 1` fully reveals every cell.
- **Example:**
  ```ts
  checkerboard(ctx, p, 800, 450, drawGrid, { rows: 8, cols: 14, order: "radial" });
  ```
- **Composes with:** `masked` for soft/inverted edges; seeded `prng` for `"random"`.

---

### dissolve
```ts
export function dissolve(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: DissolveOptions = {},
): void
```
- **Purpose:** Organic dissolve — small cells trip on in a seeded random order as `p` rises. Deterministic and seekable via `seed`.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `w`, `h` — view dimensions.
  - `draw` — content to reveal.
  - `opts.seed?: number` (default `1`) — PRNG seed for the per-cell thresholds.
  - `opts.cell?: number` (default `14`) — dissolve cell size in view units (smaller = finer grain). Grid is `ceil(w/cell) × ceil(h/cell)`; each revealed cell is drawn `cell+1` on a side to avoid seams.
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
- **Example:**
  ```ts
  dissolve(ctx, p, 800, 450, drawScene, { cell: 10, seed: 42 });
  ```
- **Composes with:** `masked` for soft/inverted edges; seeded `prng`.

---

### spotlight
```ts
export function spotlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: SpotlightOptions = {},
): void
```
- **Purpose:** Reveal `draw` only inside a soft radial spotlight, or (with `dim`) keep everything visible but darken the surround — the attention / fog-of-war primitive. Note: **no `p` argument** — animate by passing a `p`-driven `cx`/`cy`/`radius` from the caller. The center can move.
- **Parameters / options:**
  - `cx`, `cy` — spotlight center.
  - `radius: number` — spotlight radius.
  - `draw` — the scene to reveal / dim around.
  - `opts.feather?: number` (default `radius * 0.4`) — soft falloff width.
  - `opts.invert?: boolean` (default `false`) — `true` → dim/hide *inside* the spotlight instead of outside. (Passed through to `masked` in the non-`dim` path.)
  - `opts.dim?: { color: string; strength: number }` — when present, switches mode: draw the full scene, then lay a dimming veil that is clear inside the spotlight and `color` opaque outside, at `clamp01(strength)` alpha (`0..1`). Without `dim`, content outside the spotlight is *hidden* (masked) rather than darkened.
- **Example:**
  ```ts
  // hard fog-of-war: only the lit circle is visible
  spotlight(ctx, cx, cy, 140, drawMap);
  // keep the scene, darken the surround
  spotlight(ctx, cx, cy, 140, drawScene, { dim: { color: "rgba(0,0,0,1)", strength: 0.7 } });
  ```
- **Composes with:** `masked` (reveal/invert path); `focus.dimExcept`/`spotlightFocus` are the layer-scrim counterparts.

---

## Exported types — reveal.ts

### BlendMode
```ts
export type BlendMode = GlobalCompositeOperation;
```
Alias for the canvas composite-operation union (e.g. `"source-over"`, `"multiply"`, `"screen"`, `"lighter"`, `"destination-in"`, `"destination-out"`, …).

### RevealOptions
```ts
export interface RevealOptions {
  feather?: number;              // soft-edge width in view units (0 = hard clip)
  invert?: boolean;              // conceal instead of reveal
  ease?: (p: number) => number;  // remap p before use (keeps seeking exact)
}
```
Base options shared by `wipe`, `iris`, `radialWipe`, `blinds`, `checkerboard`, `dissolve` (via their extending interfaces). Defaults: `feather = 0`, `invert = false`, `ease` unset (identity, still `clamp01`'d).

### WipeDir
```ts
export type WipeDir =
  | "left" | "right" | "up" | "down"
  | "center-h" | "center-v" | "center"
  | "edges-h" | "edges-v";
```
Effect of each value:
- `"left"` — edge sweeps rightward from the left.
- `"right"` — edge sweeps leftward from the right.
- `"up"` — band grows upward from the bottom.
- `"down"` — band grows downward from the top.
- `"center-h"` — a horizontal band grows outward from the vertical midline (full height, width `w·p`).
- `"center-v"` — a vertical band grows outward from the horizontal midline (full width, height `h·p`).
- `"center"` — a rectangle grows from the center in both axes (`w·p × h·p`).
- `"edges-h"` — two bands grow inward from the left and right edges (two rects).
- `"edges-v"` — two bands grow inward from the top and bottom edges (two rects).

### WipeOptions
```ts
export interface WipeOptions extends RevealOptions {
  dir?: WipeDir;                          // default "left"
  angle?: number;                         // arbitrary edge angle in radians (overrides dir; enables diagonals)
  border?: { width: number; color: string }; // stroke the moving front while 0<P<1
}
```

### IrisShape
```ts
export type IrisShape = "circle" | "ellipse" | "rect" | "diamond" | "polygon" | "star";
```
- `"circle"` — full circle of radius `r`.
- `"ellipse"` — `rx = r`, `ry = r·aspect`, rotated by `rotation`.
- `"rect"` — axis-aligned rectangle, half-extents `r` × `r·aspect`.
- `"diamond"` — 4-sided polygon (square rotated 45°).
- `"polygon"` — regular polygon with `sides` sides (default `6`).
- `"star"` — `sides`-pointed star (default `5`), alternating outer radius `r` and inner radius `r·innerRatio`.

### IrisOptions
```ts
export interface IrisOptions extends RevealOptions {
  shape?: IrisShape;    // default "circle"
  aspect?: number;      // ry/rx for ellipse/rect (default 1)
  sides?: number;       // polygon/star point count (default 6 / 5)
  rotation?: number;    // radians (default 0)
  innerRatio?: number;  // star inner/outer radius (default 0.5)
  close?: boolean;      // radius from p (open, default) vs from 1−p (close)
}
```

### RadialWipeOptions
```ts
export interface RadialWipeOptions extends RevealOptions {
  startAngle?: number;    // radians (default -π/2, i.e. 12 o'clock)
  dir?: "cw" | "ccw";     // sweep direction (default: clockwise when unset)
}
```

### BlindsOptions
```ts
export interface BlindsOptions extends RevealOptions {
  count?: number;   // number of slats (default 8)
  dir?: "h" | "v";  // slats stacked vertically (h) or horizontally (v); default "h"
}
```

### CheckerOrder
```ts
export type CheckerOrder = "rowcol" | "diagonal" | "radial" | "random";
```
- `"rowcol"` — reveal in reading order, row by row then column.
- `"diagonal"` — reveal along diagonals (top-left toward bottom-right). **Default** for `checkerboard`.
- `"radial"` — reveal outward from the grid center.
- `"random"` — reveal in a seeded random order (`seed`).

### CheckerOptions
```ts
export interface CheckerOptions extends RevealOptions {
  rows?: number;         // default 6
  cols?: number;         // default 10
  order?: CheckerOrder;  // default "diagonal"
  seed?: number;         // for order "random" (default 7)
}
```

### DissolveOptions
```ts
export interface DissolveOptions extends RevealOptions {
  seed?: number;  // default 1
  cell?: number;  // dissolve cell size in view units (default 14)
}
```

### SpotlightOptions
```ts
export interface SpotlightOptions {
  feather?: number;                          // soft falloff width (default radius * 0.4)
  invert?: boolean;                          // true → dim/hide inside instead of outside
  dim?: { color: string; strength: number }; // dim the surround instead of hiding it (0..1)
}
```
*Note:* `SpotlightOptions` does **not** extend `RevealOptions` — it has no `ease` and no `p`; animate via caller-supplied center/radius.

---

# Step 06 · Attention direction — `src/render/focus.ts`

**Responsibility.** Guiding the eye — the #1 teaching skill — with a broad-but-small toolkit that reuses earlier steps (reveal's `masked`, stroke arrowheads via `strokeVerbs`, motion oscillators via `motion`). Grouped by intent:

- **Isolate** → `dimExcept`, `spotlightFocus`
- **Mark** → `highlightRing`, `focusRings`, `flash`, `focusBox`, `indicate`
- **Point** → `pointerArrow`, `bouncePointer`
- **De-emphasize** → `ghost`, `emphasizeSurround`
- **Magnify** → `magnify` (loupe)
- **Motion emphasis** → `wiggle`, `pulseScale`
- **More markers & pointers** → `sparkFlash`, `cornerBrackets`, `convergingArrows`, `vignetteTo`

**When to use.** After content is on screen, to point the learner at the part that matters right now: dim everything else, ring/box the target, point an arrow, briefly flash or scale it, or magnify a detail. Everything is a pure function of `t` (elapsed seconds) or `p` (progress `0→1`), so it is deterministic and seekable.

**Default accent color:** `ACCENT = "#ffd24a"` (used by most markers/pointers unless overridden).

**Exports.** Pure helpers: `ringRadius`, `scrimAlpha`. Functions: `dimExcept`, `spotlightFocus`, `highlightRing`, `focusRings`, `flash`, `focusBox`, `indicate`, `pointerArrow`, `bouncePointer`, `ghost`, `emphasizeSurround`, `magnify`, `wiggle`, `pulseScale`, `sparkFlash`, `cornerBrackets`, `convergingArrows`, `vignetteTo`. Types: `Hole`, `DimOptions`, `RingOptions`, `FocusRingsOptions`, `FocusBoxOptions`.

---

### ringRadius
```ts
export const ringRadius: (base: number, p: number) => number
```
- **Purpose:** Pure helper — a ring radius that grows from `base` up to `base * 1.6` as `p` goes `0→1` (`base + clamp01(p) * base * 0.6`).
- **Parameters / options:** `base` — base radius; `p` — progress (clamped `0..1`).
- **Example:** `const r = ringRadius(40, 0.5); // 52`
- **Composes with:** kept for continuity / testing; hand-rolled ring animations.

### scrimAlpha
```ts
export const scrimAlpha: (p: number) => number
```
- **Purpose:** Pure helper — scrim opacity that fades out as `p` rises: `1 - clamp01(p)`.
- **Parameters / options:** `p` — progress (clamped `0..1`).
- **Example:** `ctx.globalAlpha = scrimAlpha(0.25); // 0.75`
- **Composes with:** manual scrim/dim fades.

---

### dimExcept
```ts
export function dimExcept(ctx: CanvasRenderingContext2D, holes: Hole[], opts: DimOptions = {}): void
```
- **Purpose:** Darken the whole view except one or more holes (circles or rounded rects) — the spotlight / coach-mark scrim. **MUST be drawn on an isolated, initially-transparent layer** (e.g. `frame.layer.ctx("fx")`) so the `destination-out` holes cut the scrim, not the scene beneath.
- **Parameters / options:**
  - `holes: Hole[]` — one or more holes to keep bright (see `Hole` type). Circular holes get a radial-gradient soft edge; rect holes get a blurred fill for the soft edge.
  - `opts.intensity?: number` (default `0.6`) — scrim darkness `0..1`. If `<= 0`, the function returns immediately (no scrim).
  - `opts.color?: string` (default `"#0b0f14"`, near-black) — scrim color.
  - `opts.feather?: number` (default `24`) — soft hole-edge width in view units. For rect holes the blur applied is `feather * dpr * 0.4`.
- **Example:**
  ```ts
  const fx = frame.layer.ctx("fx");
  dimExcept(fx, [{ cx: 300, cy: 200, r: 90 }], { intensity: 0.7, feather: 30 });
  ```
- **Composes with:** `spotlightFocus` (single-hole convenience); the layer scrim counterpart to `reveal.spotlight`.

---

### spotlightFocus
```ts
export function spotlightFocus(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, opts: DimOptions = {}): void
```
- **Purpose:** Single-circle spotlight scrim convenience — calls `dimExcept(ctx, [{ cx, cy, r }], opts)`. Draw on an isolated layer.
- **Parameters / options:** `cx`, `cy`, `r` — the one bright circular hole; `opts: DimOptions` — same as `dimExcept` (`intensity`, `color`, `feather`).
- **Example:** `spotlightFocus(fx, 400, 225, 100, { intensity: 0.65 });`
- **Composes with:** `dimExcept`.

---

### highlightRing
```ts
export function highlightRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, opts: RingOptions = {}): void
```
- **Purpose:** A stroked ring around a target that gently pulses in radius over time — a persistent "look here" marker.
- **Parameters / options:**
  - `cx`, `cy`, `r` — center and base radius.
  - `t: number` — time in seconds (drives the pulse via `wobble`).
  - `opts.color?: string` (default `ACCENT` `#ffd24a`) — stroke color.
  - `opts.width?: number` (default `3`) — line width.
  - `opts.amp?: number` (default `4`) — pulse amplitude in view units (`0` = steady, no pulse).
  - `opts.period?: number` (default `1.4`) — pulse period in seconds.
  - `opts.alpha?: number` (default `1`) — stroke alpha (clamped `0..1`).
- **Example:** `highlightRing(ctx, 400, 225, 60, t, { color: "#4af", amp: 6 });`
- **Composes with:** `motion.wobble`; pairs with `dimExcept`/`focusBox` for a full coach-mark.

---

### focusRings
```ts
export function focusRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, opts: FocusRingsOptions = {}): void
```
- **Purpose:** Manim-style "FocusOn" — concentric rings that converge onto the target as `p` goes `0→1`, appearing then fading as each lands.
- **Parameters / options:**
  - `cx`, `cy` — convergence target.
  - `p: number` — progress `0..1`.
  - `opts.count?: number` (default `3`) — number of rings (each staggered by `0.08` in progress).
  - `opts.maxR?: number` (default `120`) — starting (outer) radius.
  - `opts.targetR?: number` (default `10`) — landing (inner) radius.
  - `opts.color?: string` (default `ACCENT`) — stroke color.
  - `opts.width?: number` (default `2.5`) — line width.
  - Per-ring alpha follows `sin(rp·π)` so each ring appears then fades as it converges.
- **Example:** `focusRings(ctx, 400, 225, p, { count: 4, maxR: 160 });`
- **Composes with:** `motion.lerp`; a one-shot attention beat (drive `p` over a short window).

---

### flash
```ts
export function flash(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: number, opts: { color?: string } = {}): void
```
- **Purpose:** A quick additive radial flash that fades as `p→1` — a beat of emphasis. Uses `globalCompositeOperation = "lighter"`.
- **Parameters / options:**
  - `cx`, `cy`, `r` — center and radius of the flash.
  - `p: number` — progress; alpha is `1 - clamp01(p)` (returns immediately when `p >= 1`).
  - `opts.color?: string` (default `"rgba(255,240,180,0.9)"`) — inner gradient color (fades to transparent at the rim).
- **Example:** `flash(ctx, 400, 225, 80, p);`
- **Composes with:** additive-blend beats; contrast with `sparkFlash` (radiating lines) for the same moment.

---

### focusBox
```ts
export function focusBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, opts: FocusBoxOptions = {}): void
```
- **Purpose:** An animated rounded box around a target rect — padding, optional breathing, and optional marching-ant dashes.
- **Parameters / options:**
  - `x`, `y`, `w`, `h` — the target rectangle (box is drawn around it with padding).
  - `t: number` — time in seconds (drives breathing + dash spin).
  - `opts.color?: string` (default `ACCENT`) — stroke color.
  - `opts.width?: number` (default `2.5`) — line width.
  - `opts.pad?: number` (default `6`) — padding around the rect (breathing is added on top).
  - `opts.corner?: number` (default `8`) — corner radius.
  - `opts.amp?: number` (default `2`) — breathing amplitude in view units (`0` = static).
  - `opts.period?: number` (default `1.4`) — breathing period in seconds.
  - `opts.dash?: number[]` — dash pattern (via `setLineDash`); omit for a solid box.
  - `opts.dashSpin?: number` — marching-ants speed in px/sec (`lineDashOffset = -t·dashSpin`); `0` or unset = still. Only meaningful when `dash` is set.
- **Example:** `focusBox(ctx, 120, 80, 200, 60, t, { dash: [8, 6], dashSpin: 30 });`
- **Composes with:** `motion.wobble`; pairs with `cornerBrackets` for reticle looks.

---

### indicate
```ts
export function indicate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { scale?: number } = {},
): void
```
- **Purpose:** Manim-style "Indicate" — briefly scale a target (rendered via the `draw` callback) up and back down about its center to call it out. Bump follows `sin(clamp01(p)·π)` (`0→1→0`).
- **Parameters / options:**
  - `cx`, `cy` — scale pivot (the target's center).
  - `p: number` — progress `0..1` over the indicate window.
  - `draw: (c) => void` — re-renders the target (drawn under the transient scale).
  - `opts.scale?: number` (default `0.18`) — peak extra scale (so max scale ≈ `1.18`).
  - *Note:* the docstring mentions a tint, but the implementation only applies the scale bump.
- **Example:** `indicate(ctx, 400, 225, p, (c) => drawIcon(c), { scale: 0.25 });`
- **Composes with:** `pulseScale` (continuous) vs `indicate` (one-shot).

---

### pointerArrow
```ts
export function pointerArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  p: number,
  opts: { color?: string; width?: number; size?: number } = {},
): void
```
- **Purpose:** A draw-on arrow from a source point to the target; the shaft draws on as `p` rises and the arrowhead appears on arrival.
- **Parameters / options:**
  - `fromX`, `fromY` — arrow tail (source).
  - `toX`, `toY` — arrow tip (target).
  - `p: number` — progress `0..1`; the shaft is drawn via `drawOn` up to `P`; the head alpha ramps in over the last 15% (`clamp01((P - 0.85)/0.15)`).
  - `opts.color?: string` (default `ACCENT`) — shaft + head color.
  - `opts.width?: number` (default `3`) — shaft width.
  - `opts.size?: number` (default `12`) — arrowhead size.
- **Example:** `pointerArrow(ctx, 100, 400, 320, 210, p, { color: "#4af" });`
- **Composes with:** `strokeVerbs.drawOn`, `strokeVerbs.arrowhead`, `strokes.pointAt`.

---

### bouncePointer
```ts
export function bouncePointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  opts: { size?: number; color?: string; gap?: number } = {},
): void
```
- **Purpose:** A downward-pointing triangle above the target that bounces to draw the eye. Bounce is `|sin(t·3)| · 8` px.
- **Parameters / options:**
  - `x`, `y` — the target point the pointer hovers above.
  - `t: number` — time in seconds (drives the bounce).
  - `opts.size?: number` (default `16`) — triangle size.
  - `opts.color?: string` (default `ACCENT`) — fill color.
  - `opts.gap?: number` (default `22`) — vertical gap between the target and the pointer's resting position.
- **Example:** `bouncePointer(ctx, 400, 200, t);`
- **Composes with:** standalone "look here" marker; contrast `pointerArrow` (directional, progress-driven).

---

### ghost
```ts
export function ghost(ctx: CanvasRenderingContext2D, alpha: number, draw: (c: CanvasRenderingContext2D) => void): void
```
- **Purpose:** Draw `draw` at reduced opacity — ghost non-focal content. Multiplies the current `globalAlpha` by `clamp01(alpha)`.
- **Parameters / options:**
  - `alpha: number` — opacity multiplier `0..1`.
  - `draw: (c) => void` — content to render dimmed.
- **Example:** `ghost(ctx, 0.3, (c) => drawBackground(c));`
- **Composes with:** the manual de-emphasis counterpart to `dimExcept`/`emphasizeSurround`.

---

### emphasizeSurround
```ts
export function emphasizeSurround(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  focusPath: (c: CanvasRenderingContext2D) => void,
  drawScene: (c: CanvasRenderingContext2D) => void,
  opts: { filter?: string } = {},
): void
```
- **Purpose:** Draw the scene crisp, then overlay a filtered (grayscale/blurred) copy everywhere EXCEPT the focus shape — de-emphasizing the surround while keeping the focus sharp. `drawScene` **must be a pure re-render** (it is called twice).
- **Parameters / options:**
  - `viewW`, `viewH` — view dimensions (passed to `masked`).
  - `focusPath: (c) => void` — issues the path commands for the sharp focus region (filled as the mask).
  - `drawScene: (c) => void` — renders the full scene; called once crisp and once filtered.
  - `opts.filter?: string` (default `"grayscale(1) brightness(0.85)"`) — CSS filter applied to the surround copy.
  - Internally uses `masked(..., { invert: true })` so the filtered copy shows everywhere except inside `focusPath`.
- **Example:**
  ```ts
  emphasizeSurround(ctx, 800, 450,
    (c) => { c.beginPath(); c.arc(400, 225, 120, 0, 7); },
    (c) => drawScene(c),
    { filter: "blur(4px) grayscale(1)" });
  ```
- **Composes with:** `reveal.masked`; a stronger cousin of `ghost`/`dimExcept`.

---

### magnify
```ts
export function magnify(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  zoom: number,
  drawScene: (c: CanvasRenderingContext2D) => void,
  opts: { ringColor?: string | null; ringWidth?: number } = {},
): void
```
- **Purpose:** A circular loupe at `(cx, cy)` that redraws the scene scaled up by `zoom` (clipped to the lens circle), with an optional lens ring. `drawScene` is a pure re-render.
- **Parameters / options:**
  - `cx`, `cy` — lens center (also the zoom pivot).
  - `r: number` — lens radius.
  - `zoom: number` — magnification factor.
  - `drawScene: (c) => void` — renders the scene inside the lens.
  - `opts.ringColor?: string | null` (default `"#eef5ef"`) — lens-ring stroke color; pass `null` to draw **no ring** (the ring block is skipped only when `ringColor === null`).
  - `opts.ringWidth?: number` (default `2`) — ring line width.
- **Example:** `magnify(ctx, 400, 225, 70, 2.5, (c) => drawScene(c));`
- **Composes with:** standalone detail inspector; pair with `bouncePointer`/`pointerArrow` to point at what's magnified.

---

### wiggle
```ts
export function wiggle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { amp?: number; freq?: number } = {},
): void
```
- **Purpose:** Wrap a draw in a small rotational jiggle about `(cx, cy)` — a "look at me" wiggle. Rotation is `sin(t·freq) · amp` radians.
- **Parameters / options:**
  - `cx`, `cy` — rotation pivot.
  - `t: number` — time in seconds.
  - `draw: (c) => void` — content to jiggle.
  - `opts.amp?: number` (default `0.05`) — rotation amplitude in radians.
  - `opts.freq?: number` (default `8`) — angular frequency.
- **Example:** `wiggle(ctx, 400, 225, t, (c) => drawIcon(c), { amp: 0.08 });`
- **Composes with:** `pulseScale` (scale variant); one-shot `indicate`.

---

### pulseScale
```ts
export function pulseScale(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { amp?: number; period?: number } = {},
): void
```
- **Purpose:** Wrap a draw in a continuous scale pulse about `(cx, cy)` — a heartbeat of emphasis. Scale is `1 + wobble(t, period, amp)`.
- **Parameters / options:**
  - `cx`, `cy` — scale pivot.
  - `t: number` — time in seconds.
  - `draw: (c) => void` — content to pulse.
  - `opts.amp?: number` (default `0.06`) — scale amplitude.
  - `opts.period?: number` (default `0.8`) — pulse period in seconds.
- **Example:** `pulseScale(ctx, 400, 225, t, (c) => drawIcon(c), { amp: 0.1 });`
- **Composes with:** `motion.wobble`; continuous counterpart to one-shot `indicate`.

---

### sparkFlash
```ts
export function sparkFlash(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  opts: { count?: number; length?: number; inner?: number; color?: string; width?: number } = {},
): void
```
- **Purpose:** Manim-style "Flash" — lines burst outward from a point like a spark, then fade as `p→1`. Uses additive blend (`"lighter"`); alpha is `1 - clamp01(p)`.
- **Parameters / options:**
  - `cx`, `cy` — spark origin.
  - `p: number` — progress; alpha fades with `1-p` and the ray length grows with `clamp01(p·1.4)` (returns immediately when `p >= 1`).
  - `opts.count?: number` (default `12`) — number of rays.
  - `opts.length?: number` (default `24`) — max ray length (reached as `p` rises).
  - `opts.inner?: number` (default `8`) — inner gap radius where rays start.
  - `opts.color?: string` (default `"#fff4c0"`) — stroke color.
  - `opts.width?: number` (default `2.5`) — stroke width (round caps).
- **Example:** `sparkFlash(ctx, 400, 225, p, { count: 16, length: 32 });`
- **Composes with:** `flash` (radial glow) for the same accent moment.

---

### cornerBrackets
```ts
export function cornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { pad?: number; length?: number; color?: string; width?: number; p?: number } = {},
): void
```
- **Purpose:** Four L-shaped corner brackets framing a target rect (camera-reticle look), with an optional snap-in animation via `p`.
- **Parameters / options:**
  - `x`, `y`, `w`, `h` — the target rectangle.
  - `opts.pad?: number` (default `6`) — padding between the rect and the brackets.
  - `opts.length?: number` (default `16`) — length of each bracket leg.
  - `opts.color?: string` (default `ACCENT`) — stroke color.
  - `opts.width?: number` (default `2.5`) — line width (round caps).
  - `opts.p?: number` (default `1`) — snap-in progress `0..1`: brackets start `(1-p)·22` px further out and fade in (`globalAlpha = snap`). Use `1` (default) for a static frame.
- **Example:** `cornerBrackets(ctx, 120, 80, 200, 120, { p: snapProgress });`
- **Composes with:** `focusBox` (box variant); reticle pairing with `magnify`.

---

### convergingArrows
```ts
export function convergingArrows(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  opts: { count?: number; ring?: number; targetR?: number; len?: number; color?: string; width?: number; rotation?: number } = {},
): void
```
- **Purpose:** Several arrows arranged around the target pointing inward, sliding toward it as `p` goes `0→1`.
- **Parameters / options:**
  - `cx`, `cy` — convergence center.
  - `p: number` — progress `0..1`; each arrow tip moves from radius `ring` in to `targetR` (`lerp(ring, targetR, P)`).
  - `opts.count?: number` (default `4`) — number of arrows.
  - `opts.ring?: number` (default `90`) — starting (outer) tip radius.
  - `opts.targetR?: number` (default `20`) — final (inner) tip radius.
  - `opts.len?: number` (default `26`) — arrow shaft length (tail sits `len` beyond the tip).
  - `opts.color?: string` (default `ACCENT`) — stroke/head color.
  - `opts.width?: number` (default `3`) — shaft width.
  - `opts.rotation?: number` (radians, default `0`) — rotate the whole arrangement.
- **Example:** `convergingArrows(ctx, 400, 225, p, { count: 6, ring: 120 });`
- **Composes with:** `strokeVerbs.drawOn`, `strokeVerbs.arrowhead`; a directional cousin of `focusRings`.

---

### vignetteTo
```ts
export function vignetteTo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  opts: { strength?: number; inner?: number; outer?: number; color?: string } = {},
): void
```
- **Purpose:** Asymmetric edge vignette whose clear center sits on the focus — a soft cousin of the spotlight (darkens the frame edges, leaving the focus bright).
- **Parameters / options:**
  - `cx`, `cy` — center of the clear region.
  - `opts.strength?: number` (default `0.5`) — vignette opacity `0..1`. If `<= 0`, returns immediately.
  - `opts.inner?: number` (default `180`) — radius where darkening begins (clear inside this).
  - `opts.outer?: number` (default `620`) — radius of full darkness.
  - `opts.color?: string` (default `"rgba(0,0,0,1)"`) — vignette color at the rim.
- **Example:** `vignetteTo(ctx, 400, 225, { strength: 0.6, inner: 200 });`
- **Composes with:** `reveal.spotlight` (hard mask) / `dimExcept` (scrim) as softer/harder alternatives.

---

## Exported types — focus.ts

### Hole
```ts
export type Hole =
  | { cx: number; cy: number; r: number }
  | { x: number; y: number; w: number; h: number; corner?: number };
```
A bright region cut out of a `dimExcept` scrim. Two variants:
- **Circle:** `{ cx, cy, r }` — center and radius (soft radial-gradient edge).
- **Rounded rect:** `{ x, y, w, h, corner? }` — top-left, size, and optional `corner` radius (default `8`; blurred soft edge). Discriminated by the presence of `r`.

### DimOptions
```ts
export interface DimOptions {
  intensity?: number;  // scrim darkness 0..1 (default 0.6)
  color?: string;      // scrim color (default "#0b0f14", near-black)
  feather?: number;    // soft hole edge in view units (default 24)
}
```
Used by `dimExcept` and `spotlightFocus`.

### RingOptions
```ts
export interface RingOptions {
  color?: string;   // default ACCENT (#ffd24a)
  width?: number;   // default 3
  amp?: number;     // pulse amplitude in view units (default 4; 0 = steady)
  period?: number;  // pulse period seconds (default 1.4)
  alpha?: number;   // default 1
}
```
Used by `highlightRing`.

### FocusRingsOptions
```ts
export interface FocusRingsOptions {
  count?: number;    // default 3
  maxR?: number;     // default 120
  targetR?: number;  // default 10
  color?: string;    // default ACCENT
  width?: number;    // default 2.5
}
```
Used by `focusRings`.

### FocusBoxOptions
```ts
export interface FocusBoxOptions {
  color?: string;    // default ACCENT
  width?: number;    // default 2.5
  pad?: number;      // default 6
  corner?: number;   // default 8
  amp?: number;      // breathing amplitude (default 2; 0 = static)
  period?: number;   // default 1.4
  dash?: number[];   // dash pattern; omit for solid
  dashSpin?: number; // marching-ants speed px/sec (0 = still)
}
```
Used by `focusBox`.

> Note: the `opts` objects for `flash`, `indicate`, `pointerArrow`, `bouncePointer`, `ghost`, `emphasizeSurround`, `magnify`, `wiggle`, `pulseScale`, `sparkFlash`, `cornerBrackets`, `convergingArrows`, and `vignetteTo` are inline (anonymous) object types, not named exported interfaces — their fields are documented per-function above.
# Step 07 · Callouts & leader lines — `src/render/callout.ts`

**Responsibility.** The annotation layer: a label that animates in and points at a coordinate with a leader line that draws on. Themed, deterministic, and seekable. A single `callout(frame, opts)` call covers the whole surface — container styling, 8-way placement (plus `auto`), leader routing (straight / elbow / curve), endpoint markers, subject markers drawn around the target, multi-line text wrapping, and a staged draw-on / label-fade / typewriter reveal.

**When to use.** Any time you want to label or point at a specific point in the scene. It always renders on the `annotation` layer, so it sits above content. Exotic variants are parameterizations of this one function rather than new functions.

## Exported types

### `Side`
```ts
type Side = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "auto";
```
Which side of the target the box sits on. Values:
- `"n"` — box directly above the target.
- `"s"` — box directly below.
- `"e"` — box to the right.
- `"w"` — box to the left.
- `"ne"` — up-and-right of the target.
- `"nw"` — up-and-left.
- `"se"` — down-and-right.
- `"sw"` — down-and-left.
- `"auto"` — resolved from the target's position in the view: if the target is in the top 40% of the view height it uses `"se"`/`"sw"` (right/left depending on horizontal half); if in the bottom 40% it uses `"ne"`/`"nw"`; otherwise `"e"`/`"w"`. Left half is decided by `tx < viewW * 0.5`.

### `LeaderRoute`
```ts
type LeaderRoute = "none" | "straight" | "elbow" | "curve";
```
How the leader line runs from the box edge to the target.
- `"none"` — no leader line drawn at all.
- `"straight"` — a single straight segment box-edge → target.
- `"elbow"` — one right-angle corner. Horizontal-first when the horizontal run is wider than the vertical run, else vertical-first.
- `"curve"` — a quadratic Bézier bulging perpendicular to the box→target line by `curveBend` view units (sampled as 21 points).

### `EndMarker`
```ts
type EndMarker = "none" | "dot" | "ring" | "arrow" | "crosshair";
```
Marker kind for the leader's endpoints (`targetMarker` at the target, `labelMarker` at the box).
- `"none"` — nothing.
- `"dot"` — filled circle, radius 3.4.
- `"ring"` — stroked circle, radius 5.
- `"arrow"` — an arrowhead (size 10) aligned to the leader's tip angle.
- `"crosshair"` — a small plus (`±6` in x and y).

### `Container`
```ts
type Container = "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
```
The box style behind the text.
- `"text"` — no box at all; text only (no fill, no border, no pop).
- `"pill"` — rounded rectangle, corner radius `min(box.h/2, 14)` (fully rounded ends). This is the default container.
- `"rect"` — rounded rectangle, corner radius 4.
- `"tag"` — rounded rectangle, corner radius 3.
- `"bubble"` — like a pill (radius `min(box.h/2,14)`) plus a small triangular pointer tail toward the target.
- `"badge"` — pill geometry, but sized to at least `fontPx + PAD*2` in both width and height (a compact chip for very short labels).

### `Subject`
```ts
type Subject = "none" | "circle" | "rect" | "bracket";
```
A marker drawn **around** the target (in addition to the endpoint marker), draws on with the leader (`leaderP`), stroked in `accent`.
- `"none"` — nothing.
- `"circle"` — a circle of radius `subjectR`, sweeping open clockwise from the top as `leaderP` goes 0→1.
- `"rect"` — a square of half-size `subjectR` centered on the target.
- `"bracket"` — four corner brackets (arm length `subjectR * 0.6`) framing the target.

### `CalloutOptions`
```ts
interface CalloutOptions {
  target: [number, number];
  text?: string;
  title?: string;         // optional bold first line
  side?: Side;
  offset?: number;        // gap from target to the box (default 90)
  container?: Container;
  route?: LeaderRoute;
  targetMarker?: EndMarker; // marker where the leader meets the target
  labelMarker?: EndMarker;  // marker where the leader meets the box
  subject?: Subject;        // marker drawn AROUND the target
  subjectR?: number;
  fontPx?: number;
  maxWidth?: number;        // wrap width in view units
  curveBend?: number;       // perpendicular control offset for route "curve"
  leaderP?: number;         // leader + subject draw-on (0..1)
  labelP?: number;          // box + text fade/pop (0..1)
  typeP?: number;           // optional typewriter over the body (0..1)
  color?: string;           // leader + border
  bg?: string;              // container fill
  ink?: string;             // text
  accent?: string;          // markers
  dash?: number[];
  seed?: number;
}
```

Fields, with defaults and meaning:
- `target: [number, number]` (required) — the point the callout labels/points at.
- `text?: string` — the body text; wrapped to `maxWidth` and, if `typeP < 1`, revealed with a typewriter.
- `title?: string` — optional first line, rendered bold (`700`). Not affected by the typewriter (only body lines are typed).
- `side?: Side` (default `"auto"`) — placement side; see `Side`.
- `offset?: number` (default `90`) — gap in view units from the target to the box; the box center is placed `offset + halfBox` away.
- `container?: Container` (default `"pill"`) — box style; see `Container`.
- `route?: LeaderRoute` (default `"straight"`) — leader routing; see `LeaderRoute`.
- `targetMarker?: EndMarker` (default `"dot"`) — marker at the target end of the leader; revealed only in the last 15% of `leaderP` (`(leaderP - 0.85) / 0.15`), in `accent`.
- `labelMarker?: EndMarker` (default `"none"`) — marker at the box end of the leader, in `accent`, alpha `leaderP`.
- `subject?: Subject` (default `"none"`) — marker drawn around the target; see `Subject`.
- `subjectR?: number` (default `22`) — radius/half-size of the subject marker in view units.
- `fontPx?: number` (default `14`) — text size in px; also drives line height (`fontPx * 1.32`) and padding math.
- `maxWidth?: number` (default `180`) — wrap width in view units for the body text.
- `curveBend?: number` (default `34`) — perpendicular control offset for `route: "curve"`.
- `leaderP?: number` (default `1`, clamped 0..1) — draw-on progress for the leader line and the subject marker.
- `labelP?: number` (default `1`, clamped 0..1) — fade/pop-in progress for the box and text. A subtle pop scale of `0.94 + 0.06 * labelP` is applied. If `labelP <= 0` the box/text are skipped entirely.
- `typeP?: number` (default `1`, clamped 0..1) — typewriter progress over body lines only; when `< 1` each non-title line shows its first `round(len * typeP)` characters.
- `color?: string` (default `theme.palette.muted`) — leader stroke and container border color.
- `bg?: string` (default `theme.palette.surface`) — container fill.
- `ink?: string` (default `theme.palette.ink`) — text color.
- `accent?: string` (default `theme.palette.accent`) — color of endpoint markers and subject markers.
- `dash?: number[]` — dash pattern for the leader stroke (passed through to `strokeOn`).
- `seed?: number` (default `round(target[0])`) — deterministic roughness seed for the leader stroke.

## Exported functions

### callout
```ts
export function callout(frame: FrameCtx, o: CalloutOptions): void
```
- **Purpose:** Draw one animated callout — subject marker, leader line + endpoint markers, container box, and (title + body) text — on the `annotation` layer.
- **Parameters / options:** `frame: FrameCtx` supplies the `annotation` ctx, the `theme`, and `viewW`/`viewH` (used for `"auto"` side resolution). `o: CalloutOptions` is documented in full above. Text is measured with the theme body font (`theme.type.body`); the title uses the same font at weight `700`. Box width is `textW + PAD*2` (with `PAD = 9`), except `"badge"` which floors width and height at `fontPx + PAD*2`. Line height is `fontPx * 1.32`. Draw order: subject marker → leader + markers → box (with pop) → text. Returns nothing.
- **Example:**
  ```ts
  callout(frame, {
    target: [cx, cy],
    title: "Nucleus",
    text: "Holds the cell's DNA.",
    side: "ne",
    container: "pill",
    route: "elbow",
    subject: "circle",
    subjectR: 26,
    leaderP: stepProgress(t, 0.2, 0.5),
    labelP: stepProgress(t, 0.5, 0.4),
    typeP: stepProgress(t, 0.8, 0.6),
  });
  ```
- **Composes with:** `stepProgress` / `beat` / `emphasis` from `sequence.ts` to drive `leaderP`, `labelP`, and `typeP` as functions of `t`. Uses `strokeOn`, `pointAt`, `Pt` from `strokes.ts` and `arrowhead` from `strokeVerbs.ts` internally.

### labelBox
```ts
export function labelBox(text: string, cx: number, cy: number, fontPx: number): { x: number; y: number; w: number; h: number }
```
- **Purpose:** Pure-ish box layout that approximates a label's rectangle from text length alone, for callers that need geometry without a canvas `ctx`.
- **Parameters / options:** `text` — the label text (only its `.length` is used). `cx`, `cy` — the desired center. `fontPx` — font size. Width is `text.length * fontPx * 0.55 + PAD*2`; height is `fontPx + PAD*2` (`PAD = 9`). Returns the top-left `{x, y}` and size `{w, h}` centered on `(cx, cy)`.
- **Example:**
  ```ts
  const box = labelBox("Aorta", 400, 220, 14); // { x, y, w, h }
  ```
- **Composes with:** Layout/hit-testing outside the render pass; note `callout` itself measures text with a real `ctx` and does not use `labelBox`.

---

# Step 08 · Engagement grammar — `src/render/sequence.ts`

**Responsibility.** Pedagogical timing expressed as pure functions of `t`:
- progressive disclosure → `stepProgress`, `buildSteps`, `stepState`, `revealList`
- predict-and-reveal → `predictReveal`
- emphasis choreography → `emphasis`, `beat`, `punchScale`, `shakeOffset`, `flashAlpha` (+ the draw wrappers `withPunch`, `withShake`, `flashOverlay`)
- orchestration → `sequencer`

**When to use.** Whenever a lesson needs to stage content over time — cascading reveals of list items, a pose→pause→reveal beat, a punch/shake/flash accent, or an ordered sequence of beats. Everything is deterministic and seekable: envelopes read `0` away from their moment, so they are safe to call every frame. Visual effects (scale/shake/flash) are applied by the scene from the returned values.

## Exported types

### `StepItem`
```ts
interface StepItem {
  p: number;       // entrance progress 0..1
  focus: number;   // 1 current, dim (0.45) past, 0 future
  active: boolean;
}
```
Per-item weighting for a build list. `p` is entrance progress; `focus` is `1` for the current item, `dimPast` (default `0.45`) for completed items, `0` for not-yet-reached items; `active` is true only for the current item.

### `Beat`
```ts
interface Beat {
  at: number;
  dur?: number;
}
```
One beat for `sequencer`: `at` is its start time; `dur` (default `0.6` when consumed) is its progress duration.

## Exported functions

### stepProgress
```ts
export const stepProgress = (t: number, at: number, dur: number): number
```
- **Purpose:** Eased `0→1` for a single build step starting at `at` over `dur`.
- **Parameters / options:** `t` — current time. `at` — start time. `dur` — duration. Returns `easeOutCubic(clamp01((t - at) / dur))` — `0` before `at`, `1` after `at + dur`.
- **Example:** `const p = stepProgress(t, 0.5, 0.4);`
- **Composes with:** The building block for `buildSteps`, `stepState`, `predictReveal`, `sequencer`, and for driving `callout`'s `leaderP`/`labelP`/`typeP`.

### buildSteps
```ts
export function buildSteps(t: number, count: number, opts: { start?: number; step: number; dur?: number }): number[]
```
- **Purpose:** Per-item eased progress for `count` items entering in a staggered cascade.
- **Parameters / options:**
  - `t: number` — current time.
  - `count: number` — number of items.
  - `opts.start?: number` (default `0`) — time the first item begins.
  - `opts.step: number` (required) — delay between consecutive items.
  - `opts.dur?: number` (default `0.6`) — each item's entrance duration.
  - Returns an array of `count` progress values, item `i` = `stepProgress(t, start + i*step, dur)`.
- **Example:** `const ps = buildSteps(t, rows.length, { start: 0.2, step: 0.15 });`
- **Composes with:** Drive alpha/offset per row; use `stepState`/`revealList` instead when you also want past-item dimming.

### stepState
```ts
export function stepState(t: number, count: number, opts: { start?: number; step?: number; dur?: number; dimPast?: number }): {
  index: number;
  item(i: number): StepItem;
}
```
- **Purpose:** Build-list state that also tracks which item is "current" and how each should be weighted — current bright, completed dim, upcoming hidden. Great for worked examples.
- **Parameters / options:**
  - `t` — current time.
  - `count` — number of items.
  - `opts.start?` (default `0`) — first item's time.
  - `opts.step` (required) — delay between items.
  - `opts.dur?` (default `0.5`) — entrance duration.
  - `opts.dimPast?` (default `0.45`) — focus weight applied to already-completed items.
  - Returns `{ index, item(i) }`: `index` is the highest item whose `start + i*step` has passed (`-1` before any); `item(i)` returns a `StepItem` with `p = stepProgress(...)`, `active = (i === index)`, and `focus = active ? 1 : i < index ? dimPast : 0`.
- **Example:**
  ```ts
  const st = stepState(t, lines.length, { step: 0.5 });
  const s = st.item(2); // { p, active, focus }
  ```
- **Composes with:** `revealList` uses it internally; call it directly when you draw the rows yourself.

### revealList
```ts
export function revealList(
  ctx: CanvasRenderingContext2D,
  items: unknown[],
  t: number,
  opts: { start?: number; step: number; dur?: number; x: number; y: number; rowH: number; dimPast?: number; slide?: number },
  draw: (ctx: CanvasRenderingContext2D, item: unknown, i: number, x: number, y: number, alpha: number) => void,
): void
```
- **Purpose:** Render a vertical list with a staggered entrance (fade + slide-up) and past-item dimming; you provide the per-row draw callback.
- **Parameters / options:**
  - `ctx` — canvas context.
  - `items` — the list; `items.length` sets the count.
  - `t` — current time.
  - `opts.start?` (default `0` via `stepState`) — first row's time.
  - `opts.step` (required) — delay between rows.
  - `opts.dur?` (default `0.5` via `stepState`) — entrance duration.
  - `opts.x`, `opts.y` (required) — top-left origin.
  - `opts.rowH` (required) — vertical spacing between rows.
  - `opts.dimPast?` (default `0.45`) — completed-row weight.
  - `opts.slide?` (default `10`) — extra downward offset while a row enters (`(1 - p) * slide`, slides up as it settles).
  - `draw(ctx, item, i, x, y, alpha)` — invoked per visible row (skipped while `p <= 0`) inside a saved context with `globalAlpha` pre-multiplied; `alpha = p * weight`, where `weight` is `1` for the active row else `max(focus, 0.0001)`.
  - Returns nothing.
- **Example:**
  ```ts
  revealList(ctx, steps, t, { step: 0.4, x: 120, y: 200, rowH: 44 },
    (c, item, i, x, y, a) => { c.fillStyle = ink; c.fillText(String(item), x, y); });
  ```
- **Composes with:** Built on `stepState`; the highest-level "just show me a cascading list" helper.

### predictReveal
```ts
export function predictReveal(t: number, opts: { poseAt?: number; revealAt: number; dur?: number }): {
  question: number;
  thinking: number;
  answer: number;
  revealed: boolean;
}
```
- **Purpose:** A pose→pause→reveal beat: the question shows, a thinking gap elapses, then the answer lands.
- **Parameters / options:**
  - `t` — current time.
  - `opts.poseAt?` (default `0`) — when the question appears.
  - `opts.revealAt` (required) — when the answer appears.
  - `opts.dur?` (default `0.6`) — entrance duration for both question and answer.
  - Returns: `question` = `stepProgress(t, poseAt, dur)`; `thinking` = `clamp01((t - poseAt) / max(0.01, revealAt - poseAt))` (0→1 across the gap); `answer` = `stepProgress(t, revealAt, dur)`; `revealed` = `t >= revealAt`.
- **Example:**
  ```ts
  const pr = predictReveal(t, { poseAt: 0.3, revealAt: 2.0 });
  // fade the question with pr.question, the answer with pr.answer
  ```
- **Composes with:** Feed `question`/`answer` into `fadeText`/`drawWordReveal`; use `thinking` to animate a "…" or a progress hint.

### emphasis
```ts
export function emphasis(t: number, at: number, width = 0.6): number
```
- **Purpose:** A `0→1→0` parabolic bump centered at `at`, safe everywhere (returns `0` outside the window).
- **Parameters / options:** `t` — current time. `at` — peak time. `width` (default `0.6`) — half-life in seconds; value is `max(0, 1 - ((t-at)/width)^2)`.
- **Example:** `const e = emphasis(t, 1.5); // peaks at t=1.5`
- **Composes with:** Backing envelope for `punchScale`; multiply into alpha/scale/glow for a momentary accent.

### beat
```ts
export function beat(t: number, at: number, opts: { attack?: number; hold?: number; release?: number } = {}): number
```
- **Purpose:** A general ADSR-ish envelope: rises into `at` over `attack`, holds, then releases.
- **Parameters / options:**
  - `t`, `at` — current time and the moment the hold begins.
  - `opts.attack?` (default `0.15`) — rise duration ending at `at`.
  - `opts.hold?` (default `0.1`) — full-`1` hold after `at`.
  - `opts.release?` (default `0.5`) — fall duration.
  - Returns `0` before `at - attack`, a `smooth` rise to `1` by `at`, `1` through the hold, a `smooth` fall to `0`, then `0`.
- **Example:** `const b = beat(t, 2.0, { attack: 0.2, hold: 0.3, release: 0.6 });`
- **Composes with:** A longer, flatter accent than `emphasis`; multiply into any visual property that should sustain.

### punchScale
```ts
export const punchScale = (t: number, at: number, amp = 0.2, width = 0.4): number
```
- **Purpose:** Scale multiplier for a "punch" pop at `at`.
- **Parameters / options:** `t`, `at` — time and peak. `amp` (default `0.2`) — peak overshoot. `width` (default `0.4`) — `emphasis` width. Returns `1 + amp * emphasis(t, at, width)`.
- **Example:** `ctx.scale(punchScale(t, 1.0), punchScale(t, 1.0));`
- **Composes with:** Used internally by `withPunch`; apply directly around a manual `ctx.scale`.

### shakeOffset
```ts
export function shakeOffset(t: number, at: number, mag: number, opts: { dur?: number; freq?: number } = {}): [number, number]
```
- **Purpose:** A decaying shake offset around `at` — deterministic pseudo-jitter from `t`.
- **Parameters / options:**
  - `t`, `at` — time and the shake's center.
  - `mag` (required) — peak magnitude in px.
  - `opts.dur?` (default `0.5`) — decay window; `k = max(0, 1 - |t-at|/dur)`.
  - `opts.freq?` (default `90`) — oscillation frequency.
  - Returns `[sin(t*freq)*mag*k, cos(t*freq*1.22)*mag*k]`; `[0,0]` outside the window.
- **Example:** `const [dx, dy] = shakeOffset(t, 1.2, 6);`
- **Composes with:** Used internally by `withShake`; add the offset to a manual `ctx.translate`.

### flashAlpha
```ts
export const flashAlpha = (t: number, at: number, dur = 0.25): number
```
- **Purpose:** A quick `0→1→0` flash within `dur` of `at`.
- **Parameters / options:** `t`, `at` — time and peak. `dur` (default `0.25`) — half-window. Returns `max(0, 1 - |t-at|/dur)`.
- **Example:** `ctx.globalAlpha *= flashAlpha(t, 1.0);`
- **Composes with:** Used internally by `flashOverlay` and by `drawSlam`'s impact ring; multiply into any glow/overlay alpha.

### withPunch
```ts
export function withPunch(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, at: number, draw: (c: CanvasRenderingContext2D) => void, opts: { amp?: number; width?: number } = {}): void
```
- **Purpose:** Run `draw` with a punch scale about `(cx, cy)` at `at`.
- **Parameters / options:** `ctx`, `cx`, `cy` — context and pivot. `t`, `at` — time and peak. `draw(c)` — the render callback. `opts.amp?` (default `0.2`), `opts.width?` (default `0.4`) — forwarded to `punchScale`. Saves/translates/scales/restores around `draw`.
- **Example:** `withPunch(ctx, cx, cy, t, 1.0, (c) => drawGlyph(c), { amp: 0.3 });`
- **Composes with:** Wraps `punchScale`; the drop-in way to pop a glyph/shape.

### withShake
```ts
export function withShake(ctx: CanvasRenderingContext2D, t: number, at: number, draw: (c: CanvasRenderingContext2D) => void, opts: { mag?: number; dur?: number; freq?: number } = {}): void
```
- **Purpose:** Run `draw` shaken around `at`.
- **Parameters / options:** `ctx` — context. `t`, `at` — time and center. `draw(c)` — render callback. `opts.mag?` (default `6`), plus `dur`/`freq` forwarded to `shakeOffset`. Saves/translates by the offset/restores around `draw`.
- **Example:** `withShake(ctx, t, 1.2, (c) => drawImpact(c), { mag: 8 });`
- **Composes with:** Wraps `shakeOffset`; pair with `flashOverlay`/`punchScale` for an impact.

### flashOverlay
```ts
export function flashOverlay(ctx: CanvasRenderingContext2D, t: number, at: number, w: number, h: number, opts: { color?: string; dur?: number } = {}): void
```
- **Purpose:** A full-view color flash at `at` (draw on the fx layer).
- **Parameters / options:** `ctx` — context. `t`, `at` — time and peak. `w`, `h` — view size (fills `0,0,w,h`). `opts.color?` (default `"rgba(255,255,255,0.6)"`), `opts.dur?` (default `0.25`, forwarded to `flashAlpha`). No-op when alpha `<= 0`.
- **Example:** `flashOverlay(fxCtx, t, 1.0, viewW, viewH, { color: "rgba(255,220,120,0.5)" });`
- **Composes with:** Wraps `flashAlpha`; the scene-wide accent to punctuate a beat.

### sequencer
```ts
export function sequencer(beats: Beat[]): {
  progress: (t: number) => number[];
  activeIndex: (t: number) => number;
}
```
- **Purpose:** Turn an ordered list of beats into per-beat progress and the current active index.
- **Parameters / options:** `beats: Beat[]` — each `{ at, dur? }`. Returns `progress(t)` = per-beat `stepProgress(t, b.at, b.dur ?? 0.6)`, and `activeIndex(t)` = index of the last beat whose `at` has passed (`-1` before the first).
- **Example:**
  ```ts
  const seq = sequencer([{ at: 0 }, { at: 1.2 }, { at: 2.5, dur: 0.4 }]);
  const ps = seq.progress(t);
  const active = seq.activeIndex(t);
  ```
- **Composes with:** Higher-level than raw `stepProgress`; use for a fixed choreography of named beats.

---

# Step 09 · Kinetic typography — `src/render/type-motion.ts`

**Responsibility.** Text and numbers as animated citizens: counters / number tickers, word-by-word and typewriter reveals, big-number "slams", scramble/decode, and text-along-a-path. Split into pure value/format helpers and themed draw helpers. All deterministic and seekable.

**When to use.** Whenever a lesson animates the appearance or value of text — a metric counting up, a headline typing in, a date slamming down, an answer decoding, or a caption running along a curve.

## Exported types

### `NumberFormat`
```ts
interface NumberFormat {
  decimals?: number;
  commas?: boolean;
  prefix?: string;
  suffix?: string;
}
```
Formatting options for `formatNumber` / `drawCounter`.
- `decimals?` (default `0`) — fixed decimal places.
- `commas?` (default `true`) — insert thousands separators in the integer part.
- `prefix?` (default `""`) — string prepended after the sign (e.g. a currency symbol).
- `suffix?` (default `""`) — string appended (e.g. `"%"`).

> Note: there is no `NumberFormat` union of named styles like "currency"/"percent". Those presets are exposed as the helper functions `formatCurrency` and `formatPercent`, which are thin wrappers over `formatNumber` (`prefix` and `suffix` respectively).

### `WordMode`
```ts
type WordMode = "fade" | "rise" | "pop";
```
Per-word entrance style for `drawWordReveal`.
- `"fade"` — alpha in only (no offset, no scale).
- `"rise"` — fade in while rising up by `(1 - p) * 14` px. This is the default.
- `"pop"` — fade in while scaling from an `easeOutBack(p)` overshoot to full size, pivoting on the word's center.

## Value & format helpers (pure)

### counterValue
```ts
export function counterValue(t: number, at: number, dur: number, from: number, to: number, ease: (p: number) => number = easeOutCubic): number
```
- **Purpose:** Eased interpolation `from → to` over `[at, at+dur]`, clamped.
- **Parameters / options:** `t` — time. `at` — start. `dur` — duration. `from`, `to` — endpoints. `ease` (default `easeOutCubic`) — easing applied to the clamped progress. Returns `from + (to - from) * ease(clamp01((t-at)/dur))`.
- **Example:** `const v = counterValue(t, 0.5, 1.2, 0, 1000000);`
- **Composes with:** Feed the result to `formatNumber` / `drawCounter`.

### formatNumber
```ts
export function formatNumber(n: number, opts: NumberFormat = {}): string
```
- **Purpose:** Format a number to a display string with decimals, thousands separators, prefix, and suffix.
- **Parameters / options:** `n` — value. `opts` — a `NumberFormat` (see above). Rounds `|n|` to `decimals`; adds a leading `-` only when the rounded value is non-zero (avoids `"-0"`); inserts commas into the integer part when `commas`; wraps as `${sign}${prefix}${body}${suffix}`.
- **Example:** `formatNumber(-1234.5, { decimals: 1, prefix: "$" }); // "-$1,234.5"`
- **Composes with:** Used by `drawCounter`; base for `formatCurrency`/`formatPercent`.

### formatCurrency
```ts
export const formatCurrency = (n: number, symbol = "$", decimals = 0): string
```
- **Purpose:** Currency preset — `formatNumber(n, { decimals, prefix: symbol })`.
- **Parameters / options:** `n` — value. `symbol` (default `"$"`) — currency prefix. `decimals` (default `0`).
- **Example:** `formatCurrency(2500000); // "$2,500,000"`
- **Composes with:** Shorthand over `formatNumber` for money values.

### formatPercent
```ts
export const formatPercent = (n: number, decimals = 0): string
```
- **Purpose:** Percent preset — `formatNumber(n, { decimals, suffix: "%" })`.
- **Parameters / options:** `n` — value. `decimals` (default `0`).
- **Example:** `formatPercent(87.5, 1); // "87.5%"`
- **Composes with:** Shorthand over `formatNumber` for rates.

### wordsShown
```ts
export function wordsShown(text: string, p: number): string
```
- **Purpose:** The first `ceil(p · wordCount)` words of the text (whitespace-split, empties dropped), rejoined by single spaces.
- **Parameters / options:** `text` — source. `p` — progress (clamped 0..1).
- **Example:** `wordsShown("one two three four", 0.5); // "one two"`
- **Composes with:** Pair with `stepProgress` to reveal a caption word-by-word without per-word styling.

### charsShown
```ts
export function charsShown(text: string, p: number): string
```
- **Purpose:** The first `round(p · length)` characters of the text.
- **Parameters / options:** `text` — source. `p` — progress (clamped 0..1).
- **Example:** `charsShown("Hello", 0.6); // "Hel"`
- **Composes with:** Used by `drawTypewriter`; the pure primitive behind character reveals.

### scrambleText
```ts
export function scrambleText(text: string, p: number, seed = 1): string
```
- **Purpose:** Scramble→resolve: characters lock into place left-to-right as `p` goes 0→1; unresolved characters are random glyphs. Spaces are always preserved.
- **Parameters / options:** `text` — source. `p` — progress (clamped 0..1); `floor(p · length)` leading chars are locked. `seed` (default `1`) — deterministic seed; the RNG re-rolls roughly per frame-tick via `seed + floor(p*60)`. Random glyphs are drawn from `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@"`.
- **Example:** `scrambleText("SECRET", 0.5); // "SEC" + 3 random glyphs`
- **Composes with:** Used by `drawScramble`; the pure primitive behind decode reveals.

## Draw helpers

All draw helpers take a `TextStyle` (internal, not exported):
```ts
interface TextStyle {
  font: string;                 // full CSS font string
  color: string;
  align?: CanvasTextAlign;      // where applicable
  alpha?: number;               // default 1, pre-multiplied into globalAlpha
}
```

### drawCounter
```ts
export function drawCounter(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, style: TextStyle, fmt: NumberFormat = {}): void
```
- **Purpose:** Draw a counting number; value comes from `counterValue`, formatting from `NumberFormat`.
- **Parameters / options:** `ctx`, `x`, `y` — context and position. `value` — the number to show. `style` — `TextStyle`; `align` defaults to `"center"`. `fmt` — `NumberFormat` passed to `formatNumber`.
- **Example:**
  ```ts
  drawCounter(ctx, cx, cy, counterValue(t, 0.5, 1.2, 0, 2500000),
    { font: "600 48px Inter", color: ink }, { commas: true, prefix: "$" });
  ```
- **Composes with:** `counterValue` for the value; `formatCurrency`/`formatPercent` are equivalent format presets.

### drawTypewriter
```ts
export function drawTypewriter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: number, style: TextStyle, opts: { cursor?: boolean; t?: number } = {}): void
```
- **Purpose:** Typewriter — reveals `charsShown(text, p)` with an optional blinking cursor.
- **Parameters / options:** `ctx`, `text`, `x`, `y` — context, text, position. `p` — reveal progress. `style` — `TextStyle`; `align` defaults to `"start"`. `opts.cursor?` — show a `"|"` cursor while `p < 1`. `opts.t?` — time used to blink the cursor (`floor(t*2) % 2 === 0`); when omitted the cursor is steady.
- **Example:** `drawTypewriter(ctx, "Loading…", 120, 200, stepProgress(t, 0, 1), { font: "20px Inter", color: ink }, { cursor: true, t });`
- **Composes with:** Drive `p` with `stepProgress`; built on `charsShown`.

### drawWordReveal
```ts
export function drawWordReveal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, style: TextStyle, opts: { start?: number; step?: number; dur?: number; mode?: WordMode; space?: number } = {}): void
```
- **Purpose:** Word-by-word reveal with a per-word staggered entrance (fade / rise-up / pop), left-aligned from `x`.
- **Parameters / options:**
  - `ctx`, `text`, `x`, `y` — context, text, origin (`textAlign` is forced to `"start"`).
  - `t` — current time.
  - `style` — `TextStyle` (its `alpha` multiplies each word's alpha).
  - `opts.start?` (default `0`) — first word's time.
  - `opts.step?` (default `0.12`) — delay between words.
  - `opts.dur?` (default `0.35`) — each word's entrance duration.
  - `opts.mode?` (default `"rise"`) — a `WordMode`; see the type above.
  - `opts.space?` (default `ctx.measureText(" ").width`) — extra gap between words.
  - Per word: `p = easeOutCubic(clamp01((t - (start + i*step))/dur))`; drawn only while `p > 0`.
- **Example:** `drawWordReveal(ctx, "Learn by doing", 120, 300, t, { font: "28px Inter", color: ink }, { mode: "pop", step: 0.15 });`
- **Composes with:** A styled alternative to `wordsShown`; timing mirrors `buildSteps`.

### drawSlam
```ts
export function drawSlam(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, t: number, at: number, style: TextStyle, opts: { dur?: number; from?: number } = {}): void
```
- **Purpose:** Big-number / date "slam" — text enters oversized and settles to full size with an overshoot, plus an impact flash ring. Always centered.
- **Parameters / options:** `ctx`, `text`, `cx`, `cy` — context, text, center. `t`, `at` — time and slam moment. `style` — `TextStyle` (`textAlign` forced `"center"`). `opts.dur?` (default `0.55`) — settle duration. `opts.from?` (default `1.8`) — starting scale. Scale is `lerp(from, 1, easeOutBack(p))`; alpha ramps via `clamp01(p*3)`; a stroked ring flashes at `at + dur*0.55` (via `flashAlpha`, expanding from radius ~60). No-op while `p <= 0`.
- **Example:** `drawSlam(ctx, "1969", cx, cy, t, 1.0, { font: "800 96px Inter", color: accent });`
- **Composes with:** Pairs naturally with `flashOverlay`/`withShake` for extra impact; imports `flashAlpha` internally.

### drawScramble
```ts
export function drawScramble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, at: number, style: TextStyle, opts: { dur?: number; seed?: number } = {}): void
```
- **Purpose:** Decode/scramble reveal in place.
- **Parameters / options:** `ctx`, `text`, `x`, `y` — context, text, position. `t`, `at` — time and start. `style` — `TextStyle`; `align` defaults to `"center"`. `opts.dur?` (default `1`) — decode duration. `opts.seed?` (default `1`) — forwarded to `scrambleText`. `p = clamp01((t-at)/dur)`; no-op while `p <= 0`.
- **Example:** `drawScramble(ctx, "ANSWER", cx, cy, t, 2.0, { font: "600 40px Inter", color: ink });`
- **Composes with:** Built on `scrambleText`; use to "decode" a reveal answer.

### drawTextAlongPath
```ts
export function drawTextAlongPath(ctx: CanvasRenderingContext2D, text: string, points: Pt[], p: number, style: TextStyle, opts: { spacing?: number } = {}): void
```
- **Purpose:** Lay text glyph-by-glyph along a path, revealing the first `p` fraction; each glyph is positioned and rotated to follow the path.
- **Parameters / options:** `ctx`, `text` — context and text. `points: Pt[]` — the path polyline (sampled via `pointAt`). `p` — reveal fraction; `round(p · length)` glyphs shown. `style` — `TextStyle` (`textAlign` `"center"`, baseline temporarily `"middle"` then restored to `"alphabetic"`). `opts.spacing?` (default `1`) — multiplier on the along-path distribution (glyph `i` sits at fraction `(i/(len-1)) * spacing`, clamped).
- **Example:** `drawTextAlongPath(ctx, "orbit", curvePts, stepProgress(t, 0, 1), { font: "18px Inter", color: ink });`
- **Composes with:** Uses `pointAt`/`Pt` from `strokes.ts`; drive `p` with `stepProgress`. Pair with a stroked path so text tracks the drawn line.
# Step 10 · Particle system — `src/render/particles.ts`

**Responsibility.** One configurable, **deterministic** emitter that covers both *effects* (electrons / energy / sparks) and *ambience* (smoke / rain / snow / dust / confetti). A particle's full state at time `t` is computed **analytically** from its seed + birth time — never simulated step-by-step. Position is a closed form:

```
position = origin + v·age + ½·accel·age² + sinusoidal wander
```

so every frame is reproducible on scrub/seek. There is no hidden state between frames.

**When to use.** Whenever you want emitted matter that reads as motion but must stay seekable: rising fire/smoke, falling rain/snow, drifting dust, bursting sparks/confetti, or an energy halo around a point. Reach for a preset first; drop to a raw `EmitterConfig` only when you need a bespoke look.

---

## Types

### ParticleShape

```ts
type ParticleShape = "dot" | "ring" | "square" | "triangle" | "streak" | "spark" | "star";
```

The drawn glyph per particle (see `drawShape`). Effects:

- **`"dot"`** (default) — filled circle of radius `size`. The catch-all soft particle.
- **`"ring"`** — stroked circle of radius `size` (hollow). Uses `strokeStyle`.
- **`"square"`** — filled square, side `2·size`, centered, rotated by the particle's spin `angle`.
- **`"triangle"`** — filled 3-point polygon (radius `size`), rotated by spin `angle`.
- **`"star"`** — filled 10-vertex star; outer radius `size`, inner radius `size·0.45` on odd vertices, rotated by spin `angle`.
- **`"streak"`** — a stroked line from `(x,y)` to `(x - size·0.5, y + size·3)`; line width `max(1, size·0.5)`. Reads as a motion trail (rain, sparks).
- **`"spark"`** — a stroked plus/cross: horizontal segment `±size` and vertical segment `±size` through `(x,y)`.

### OriginShape

```ts
type OriginShape =
  | { kind: "point";  x: number; y: number }
  | { kind: "line";   x: number; y: number; x2: number; y2: number }
  | { kind: "rect";   x: number; y: number; w: number; h: number }
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "ring";   x: number; y: number; r: number };
```

Where each particle is born. Two random seeds `u, v ∈ [0,1)` sample the shape:

- **`"point"`** — always `(x, y)`. A single emission source.
- **`"line"`** — lerp along segment `(x,y)→(x2,y2)` by `u`. Even distribution along a line (e.g. the base of a flame).
- **`"rect"`** — `(x + u·w, y + v·h)`. Uniform fill of an axis-aligned rectangle (rain/snow spawn strip across the top).
- **`"circle"`** — filled disc: angle `= u·2π`, radius `= √v·r` (√ for uniform area density). Center `(x,y)`.
- **`"ring"`** — circle outline: angle `= u·2π`, fixed radius `r`. Center `(x,y)`. Particles born on the rim only.

### EmitterConfig

```ts
interface EmitterConfig {
  count: number;
  seed: number;
  origin: OriginShape;
  t0?: number;                         // default 0
  rate?: number;                       // particles/sec; omit ⇒ burst
  loop?: boolean;
  life: Range;                         // seconds
  angle?: number;                      // default -π/2 (up)
  spread?: number;                     // default π/3
  speed: Range;                        // px/sec
  accel?: [number, number];            // px/sec²
  wander?: { amp: number; freq: number };
  size: Range;                         // start size
  sizeEnd?: number;
  color: string | [string, string];   // constant or start→end hex
  alpha?: { in?: number; out?: number; max?: number };
  spin?: Range;                        // rad/sec
  shape?: ParticleShape;               // default "dot"
  blend?: GlobalCompositeOperation;
}
```

`Range` is `[number, number] | number`. A tuple is a per-particle interval sampled by a seeded PRNG; a bare number is a constant.

Every field:

- **`count: number`** (required) — number of particle *slots*. The emitter iterates `i = 0 … count-1`; each `i` is one particle (or, with `rate`, one staggered-birth particle; with `loop`, one recycled slot). Higher = denser, more draw cost.
- **`seed: number`** (required) — base RNG seed. Deterministic: same seed ⇒ same layout every render. Change it to get a different-but-stable arrangement. Presets use distinct default seeds so stacked effects don't align.
- **`origin: OriginShape`** (required) — spawn geometry (see `OriginShape` above).
- **`t0?: number`** (default `0`) — emission start time in seconds. For a burst, all particles are born at `t0`. For `rate` emission, particle `i` is born at `t0 + i/rate`. *When to use:* delay an effect to sync with a beat.
- **`rate?: number`** — particles per second for **continuous** emission (birth of particle `i` staggered to `t0 + i/rate`). **Omit** for a one-shot **burst** where all `count` particles are born at `t0`. *When to use:* `rate` for streams (fire, rain); omit for pops (confetti).
- **`loop?: boolean`** — recycle particles (ambient). When true, each slot re-lives its life repeatedly; on every cycle it is **re-seeded** (`prng(base + cyc·7919)`) so recycled particles get a *fresh* trajectory rather than a frozen replay. Spin uses the un-wrapped `rawAge` so rotation stays continuous across cycles. `life` is stable per particle across cycles. Without `loop`, a particle returns `null` (dead) once `age > life`. *When to use:* true for endless ambience (smoke, rain, snow, dust, fire, energy); false/omit for finite bursts (confetti).
- **`life: Range`** (required, seconds) — particle lifespan. Sampled once per particle (stable across loop cycles). Drives normalized progress `p = clamp01(age/life)` used by size, color, and alpha.
- **`angle?: number`** (default `-π/2`, i.e. straight up) — central emission direction in radians. Canvas y is downward, so `-π/2` is up, `+π/2` is down, `0` is right. *When to use:* `+π/2` for rain/snow falling, `-π/2` for rising fire/smoke.
- **`spread?: number`** (default `π/3`) — angular spread in radians. Actual emit angle is `angle + (rand-0.5)·spread`, i.e. `±spread/2` around `angle`. `2π` ⇒ omnidirectional (sparks, energy). Small (e.g. `0.04`) ⇒ nearly parallel (rain). *When to use:* wide for radial bursts, narrow for directed streams.
- **`speed: Range`** (required, px/sec) — initial speed, sampled per particle. Split into `vx = cos(ang)·spd`, `vy = sin(ang)·spd`.
- **`accel?: [number, number]`** (default `[0, 0]`, px/sec²) — constant acceleration `[ax, ay]` (gravity / buoyancy). Positive `ay` pulls **down** (rain, sparks, confetti fall); negative `ay` pushes **up** (fire/smoke buoyancy). Applied as `½·a·age²`.
- **`wander?: { amp: number; freq: number }`** — sinusoidal drift added on top of ballistic motion for a turbulent look. `amp` is displacement in px, `freq` in rad/sec. Adds `sin(age·freq + ph)·amp` to x and `cos(age·freq·0.9 + ph)·amp·0.5` to y (half-amplitude, slightly detuned frequency), with a per-particle phase `ph`. *When to use:* smoke swirl, snow flutter, dust haze.
- **`size: Range`** (required) — **start** size in px (radius for dots/rings; half-extent for squares/stars). Sampled per particle.
- **`sizeEnd?: number`** — if given, size **lerps from `size` (start) to `sizeEnd`** over life by `p`. Omit to keep size constant at the sampled start. *When to use:* shrink sparks/embers to nothing, or grow smoke puffs (`size: 6, sizeEnd: 26`).
- **`color: string | [string, string]`** (required) — a constant hex string, or a `[start, end]` hex pair interpolated over life via `hexLerp` (returns `rgb(...)`). *When to use:* pair for ember→ash / hot→cool fades (`["#ffd24a", "#e2452b"]`).
- **`alpha?: { in?: number; out?: number; max?: number }`** — opacity envelope over life. `in` (default `0.1`) = fade-**in** fraction of life; `out` (default `0.3`) = fade-**out** fraction; `max` (default `1`) = peak alpha. While `p < in`, alpha ramps `0→max`; while `p > 1-out`, it ramps `max→0`; otherwise it holds at `max`. *When to use:* lower `max` for subtle ambience (dust `0.28`, smoke `0.4`); longer `out` for gentle dissipation.
- **`spin?: Range`** (default `0`, rad/sec) — angular velocity. The particle's draw `angle = spin·rawAge` (continuous across loop cycles). Only visible on rotatable shapes (`square`, `triangle`, `star`). *When to use:* tumbling confetti (`[-8, 8]`).
- **`shape?: ParticleShape`** (default `"dot"`) — glyph (see `ParticleShape`).
- **`blend?: GlobalCompositeOperation`** — canvas composite op for the whole draw pass. Presets use `"lighter"` for additive glow (fire, sparks, dust, energy). Omit for normal alpha blending (smoke, rain, snow, confetti).

### Particle

```ts
interface Particle {
  x: number;      // world position
  y: number;
  age: number;    // seconds since birth (wrapped into current cycle when looping)
  p: number;      // 0..1 progress through life
  size: number;   // resolved size at this instant
  color: string;  // resolved color (constant, or hexLerp result "rgb(...)")
  alpha: number;  // resolved opacity from the envelope
  angle: number;  // current spin angle = spin·rawAge
}
```

The pure result of `particleAt`. You normally never build one by hand; `emit` produces and draws them for you.

---

## Functions

### particleAt

```ts
function particleAt(cfg: EmitterConfig, i: number, t: number): Particle | null
```

- **Purpose:** Closed-form, pure state of particle `i` at absolute time `t`. Returns `null` if the particle is not alive (not yet born, or dead when not looping).
- **Parameters:**
  - `cfg: EmitterConfig` — the emitter definition.
  - `i: number` — particle index `0 … count-1`. Combined with `seed` into `base = seed·100003 + i·97 + 1` for its stable PRNG stream.
  - `t: number` — absolute time in seconds.
- **Behavior:** Computes `birth` (`t0 + i/rate` if `rate`, else `t0`), returns `null` when `t < birth`. When not looping, returns `null` once `rawAge > life`; when looping, wraps age into the current cycle and re-seeds per cycle. Then samples origin, angle (`angle ± spread/2`), speed, applies ballistic + wander position, resolves size/color/alpha/spin.
- **Example:**
  ```ts
  const p = particleAt(fireEmitter(200, 300), 0, 1.5);
  if (p) console.log(p.x, p.y, p.alpha);
  ```
- **Composes with:** used internally by `emit`; call directly if you need to attach other geometry to a particle's live position.

### emit

```ts
function emit(ctx: CanvasRenderingContext2D, cfg: EmitterConfig, t: number): void
```

- **Purpose:** Draw **all** live particles of `cfg` at time `t`. This is the normal entry point.
- **Parameters:**
  - `ctx` — 2D canvas context.
  - `cfg` — emitter definition.
  - `t` — absolute time in seconds.
- **Behavior:** Saves ctx, applies `cfg.blend` if set, iterates `i = 0 … count-1`, skips particles that are `null` or have `alpha ≤ 0`, sets `globalAlpha = clamp01(alpha)`, `fillStyle` and `strokeStyle` to the particle color, then draws the shape (default `"dot"`). Restores ctx.
- **Example:**
  ```ts
  emit(ctx, smokeEmitter(cx, cy), t);
  ```
- **Composes with:** any preset or hand-built `EmitterConfig`; call once per emitter per frame. Stack multiple `emit` calls (with distinct seeds) for layered effects.

---

## Presets

Each preset is a factory returning a ready `EmitterConfig`. All accept a `seed` with a distinct default so overlapping effects don't align.

### fireEmitter

```ts
const fireEmitter = (x: number, y: number, seed = 1): EmitterConfig
```
Rising flame. Emits from a 32px-wide **line** centered at `(x,y)`, `count 60`, `rate 40`, looping. Life `0.6–1.1s`, upward (`-π/2`, spread `0.5`), speed `40–90`, buoyancy `accel [0,-30]`, wander `{amp 6, freq 8}`. Size `7→2` start shrinking to `sizeEnd 1`, color `#ffd24a→#e2452b`, alpha `{in 0.1, out 0.5, max 0.85}`, `shape "dot"`, `blend "lighter"`. Produces a licking additive-glow flame anchored at `(x,y)`.

### smokeEmitter

```ts
const smokeEmitter = (x: number, y: number, seed = 2): EmitterConfig
```
Slow rising smoke. **Circle** origin `r 10` at `(x,y)`, `count 40`, `rate 14`, looping. Life `2–3.5s`, up (`-π/2`, spread `0.4`), speed `12–26`, slight buoyancy `[0,-6]`, wander `{amp 14, freq 1.2}`. Size grows `6→26` (`sizeEnd 26`), color `#8a94a0→#3a4650`, alpha `{in 0.2, out 0.6, max 0.4}`, `shape "dot"`, normal blend. Produces expanding, thinning grey puffs.

### sparksEmitter

```ts
const sparksEmitter = (x: number, y: number, seed = 3): EmitterConfig
```
Radial spark burst-stream. **Point** origin at `(x,y)`, `count 50`, `rate 30`, looping. Life `0.4–0.9s`, omnidirectional (`spread 2π`), speed `80–200`, strong gravity `accel [0,260]`. Size `2→0.5` (`sizeEnd 0.5`), color `#fff4c0→#e8a13c`, alpha `{in 0.05, out 0.4, max 1}`, `shape "streak"`, `blend "lighter"`. Produces short, falling glowing streaks.

### rainEmitter

```ts
const rainEmitter = (viewW: number, viewH: number, seed = 4): EmitterConfig
```
Full-width rain. **Rect** spawn strip across the top (`x 0, y -20, w viewW, h 10`), `count 120`, `rate 120`, looping. Life `1.4–2s`, downward (`π/2 + 0.12`, near-parallel `spread 0.04`), speed scaled to view height `viewH·0.7 – viewH·0.9`, `accel [0,40]`. Size `7`, solid color `#7fb0d8`, alpha `{in 0.05, out 0.2, max 0.5}`, `shape "streak"`. Produces slanted falling streaks across the whole frame.

### snowEmitter

```ts
const snowEmitter = (viewW: number, viewH: number, seed = 5): EmitterConfig
```
Full-width snow. **Rect** top strip (`x 0, y -20, w viewW, h 10`), `count 90`, `rate 40`, looping. Life `5–8s`, down (`π/2`, spread `0.2`), gentle speed `30–60`, `accel [0,4]`, wander `{amp 26, freq 0.8}` for flutter. Size `2–4`, white `#ffffff`, alpha `{in 0.1, out 0.2, max 0.8}`, `shape "dot"`. Produces soft drifting flakes.

### dustEmitter

```ts
const dustEmitter = (x: number, y: number, seed = 6): EmitterConfig
```
Ambient hovering dust. **Circle** origin `r 40` at `(x,y)`, `count 40`, `rate 12`, looping. Life `3–6s`, up-ish (`-π/2`, wide `spread π`), very slow speed `4–14`, tiny buoyancy `[0,-2]`, wander `{amp 18, freq 0.6}`. Size `1–2.5`, color `#c8b98a`, alpha `{in 0.3, out 0.4, max 0.28}` (faint), `shape "dot"`, `blend "lighter"`. Produces a subtle glowing motes haze.

### confettiEmitter

```ts
const confettiEmitter = (x: number, y: number, seed = 7): EmitterConfig
```
One-shot confetti burst (**no `rate`, no `loop`** → burst at `t0 0`). **Point** origin at `(x,y)`, `count 70`. Life `1.6–2.6s`, up-and-out (`-π/2`, wide `spread 0.8π`), speed `180–340`, gravity `accel [0,320]`, tumbling `spin [-8,8]`. Size `4–7`, color `#5cc8ae→#e8a13c`, alpha `{in 0.02, out 0.25, max 1}`, `shape "square"`, normal blend. Produces spinning squares that shoot up and fall — fire once on a beat.

### energyEmitter

```ts
const energyEmitter = (x: number, y: number, seed = 8): EmitterConfig
```
Radiating energy halo. **Point** origin at `(x,y)`, `count 40`, `rate 26`, looping. Life `0.7–1.2s`, omnidirectional (`spread 2π`), speed `30–70`, no gravity, wander `{amp 8, freq 5}`. Size `3→1` (`sizeEnd 0.5`), color `#8fe8ff→#5cc8ae`, alpha `{in 0.1, out 0.4, max 0.9}`, `shape "dot"`, `blend "lighter"`. Produces a shimmering cyan-green aura around a point (electrons/energy source).

---

# Step 11 · Camera & transitions — `src/render/camera.ts`

**Responsibility.** A view transform (pan / zoom / rotate) applied to the **whole world** at composite time. Scenes draw in normal view coords; the camera moves the world around them. It is **pure** — `camera(t)` derives entirely from `t` — so it stays seekable. Zoom interpolates **geometrically (log)** so a dolly feels linear in perceived scale. Passing **no camera (undefined)** means no transform, so existing films are unaffected.

**When to use.** Whenever a scene needs to reframe over time: dolly into a detail, pan between regions, or add a slow push for emphasis. A `Camera` centers world point `(x, y)` in the frame at `zoom`, rotated by `rot`.

**How it's applied.** The camera is handed to the compositor via `frame.setCamera()` at composite time. For layer scenes, the compositor applies the device-space equivalent in `finish()`; for non-layer scenes, `applyCamera` multiplies it into the ctx transform directly. Depth-of-field and parallax are **not** camera fields — they emerge from per-layer options (e.g. a layer's own depth/blur/parallax settings) as the camera moves; the camera only supplies the shared view transform those layers react to.

---

## Types

### Camera

```ts
interface Camera {
  x: number;    // world point centered in the frame (view coords)
  y: number;
  zoom: number;
  rot: number;  // radians
}
```

- **`x, y`** — the world point that will sit at the center of the frame.
- **`zoom`** — scale factor; `1` = neutral, `>1` = zoomed in, `<1` = zoomed out. Log-interpolated (floored at `1e-3` internally to avoid `log(0)` → NaN).
- **`rot`** — frame rotation in radians.

---

## Functions

### centerCamera

```ts
const centerCamera = (viewW: number, viewH: number): Camera
```
- **Purpose:** The neutral camera for a view size — centers the whole frame at zoom 1.
- **Returns:** `{ x: viewW/2, y: viewH/2, zoom: 1, rot: 0 }`.
- **When to use:** as the `from` end of a move, or the resting/default view.
- **Composes with:** `move`, `lerpCamera`, `isNeutral`.

### lerpCamera

```ts
function lerpCamera(a: Camera, b: Camera, p: number): Camera
```
- **Purpose:** Interpolate two cameras at progress `p`. `x`, `y`, `rot` are linear; **`zoom` is log-interpolated** (`exp(lerp(log a.zoom, log b.zoom, p))`) so a 1→4 dolly feels linear in perceived scale.
- **Parameters:** `a, b: Camera` — endpoints; `p: number` — 0..1 progress (not clamped or eased here — caller supplies eased `p`).
- **Example:**
  ```ts
  const cam = lerpCamera(centerCamera(w, h), focusOn(cx, cy, 3), smooth(t));
  ```
- **Composes with:** `move` and `pushIn` build on this; feed it an eased/clamped `p` yourself if calling directly.

### focusOn

```ts
const focusOn = (x: number, y: number, zoom = 1, rot = 0): Camera
```
- **Purpose:** Build a camera focused on `(x, y)` at `zoom` (and optional `rot`).
- **Parameters:** `x, y` — focal world point; `zoom` (default `1`); `rot` (default `0`, radians).
- **Example:** `focusOn(300, 200, 2.5)`.
- **Composes with:** the `to` end of `move`/`lerpCamera`.

### move

```ts
function move(from: Camera, to: Camera, t: number, at: number, dur: number): Camera
```
- **Purpose:** Smoothly move from `from` to `to` over the window `[at, at+dur]`, returning the camera at time `t`.
- **Parameters:** `from, to: Camera` — endpoints; `t` — current time; `at` — start time; `dur` — duration (seconds).
- **Behavior:** returns `lerpCamera(from, to, smooth(clamp01((t-at)/dur)))` — clamped and eased with `smooth`, so it holds at `from` before `at` and at `to` after `at+dur`.
- **Example:**
  ```ts
  const cam = move(centerCamera(w, h), focusOn(cx, cy, 3), t, 2, 1.5);
  frame.setCamera(cam);
  ```
- **Composes with:** `centerCamera`/`focusOn` for endpoints; `frame.setCamera`.

### pushIn

```ts
function pushIn(viewW: number, viewH: number, cx: number, cy: number, fromZoom: number, toZoom: number, t: number, at: number, dur: number): Camera
```
- **Purpose:** A push-in / dolly onto `(cx, cy)`: zoom `fromZoom → toZoom` over `[at, at+dur]`, centered on the point. As it zooms in, the center **drifts** from the frame center toward the focal point.
- **Parameters:** `viewW, viewH` — view size; `cx, cy` — focal point; `fromZoom, toZoom` — zoom endpoints; `t, at, dur` — timing.
- **Behavior:** `p = smooth(clamp01((t-at)/dur))`; zoom log-interpolated; `x = lerp(viewW/2, cx, p)`, `y = lerp(viewH/2, cy, p)`, `rot 0`.
- **Example:**
  ```ts
  const cam = pushIn(w, h, cx, cy, 1, 2.5, t, 0, 2);
  ```
- **Composes with:** `frame.setCamera`; a self-contained alternative to `move` when you only need a centered dolly (no rotation).

### applyCamera

```ts
function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void
```
- **Purpose:** Multiply a camera into the current ctx transform. Used by **non-layer** scenes; the layer compositor applies the device-space equivalent in `finish()` instead.
- **Behavior:** `translate(viewW/2, viewH/2)` → `rotate(cam.rot)` → `scale(cam.zoom, cam.zoom)` → `translate(-cam.x, -cam.y)`.
- **When to use:** only in scenes that draw directly to a ctx without the layer compositor; layer scenes should use `frame.setCamera` and let `finish()` apply it.
- **Composes with:** wrap your scene draws between `ctx.save()`/`ctx.restore()` around this.

### isNeutral

```ts
function isNeutral(cam: Camera, viewW: number, viewH: number): boolean
```
- **Purpose:** True when a camera is effectively the neutral view, so the compositor can **skip** applying it. Uses an epsilon so a camera animated *back* to neutral (via float error in log/lerp) still takes the skip path.
- **Test:** `|zoom-1| < 1e-6` AND `|rot| < 1e-6` AND `|x - viewW/2| < 0.5` AND `|y - viewH/2| < 0.5`.
- **Composes with:** the compositor's fast path; you rarely call it directly.

---

# Step 14 · Shape morph — `src/render/morph.ts`

**Responsibility.** Turn one shape into another by (1) **resampling** both to a common point count evenly by arc length, (2) **aligning** their point correspondence to minimize travel, and (3) **interpolating**. Works for closed shapes (reactant→product, border→border) and open paths. Deterministic; reuses the arc-length sampler (`pointAt`) from `strokes`.

**When to use.** Any "A becomes B" transform on outlines: a molecule reshaping, a country border sliding to another, an icon tweening, or a shape blooming from circle → star → heart. Feed it two point lists (`Pt[] = [x, y][]`), often from the shape generators below.

---

## Types

### MorphOptions

```ts
interface MorphOptions {
  n?: number;                    // resample resolution (default 64)
  closed?: boolean;              // default true
  align?: boolean;               // default true (closed shapes)
  ease?: (p: number) => number;  // default easeInOutCubic
}
```

- **`n`** (default `64`) — number of points both shapes are resampled to. Higher = smoother morph, more cost.
- **`closed`** (default `true`) — treat inputs as closed loops (auto-appends the first point if the path isn't already closed) vs. open paths.
- **`align`** (default `true`, closed only) — rotate B's point ordering to the offset that best matches A, minimizing total travel (avoids the shape "spinning" during the morph).
- **`ease`** (default `easeInOutCubic`) — easing applied to progress `p` before interpolation.

`Pt` is imported from `./strokes` and is a `[x, y]` tuple.

---

## Functions

### resample

```ts
function resample(points: Pt[], n: number, closed = true): Pt[]
```
- **Purpose:** Resample a polyline to exactly `n` points, evenly spaced by arc length.
- **Parameters:** `points: Pt[]` — source polyline; `n` — target count; `closed` (default `true`) — if the path isn't already closed, appends the first point so sampling wraps.
- **Behavior:** Empty input or `n ≤ 0` → `[]`. Single point → `n` copies of it. Otherwise samples `pointAt(src, frac)` where `frac = i/n` (closed) or `i/(n-1)` (open).
- **Example:** `resample(myBorder, 64)`.
- **Composes with:** used internally by `morph`; call directly to normalize a path's point count.

### align

```ts
function align(a: Pt[], b: Pt[]): Pt[]
```
- **Purpose:** Rotate `b`'s point ordering to the offset that best matches `a` (minimum total squared distance). **Closed shapes only.**
- **Parameters:** `a, b: Pt[]` — same-length (uses `min(a.length, b.length)`) point lists.
- **Behavior:** Tries each rotational offset `k`, sampling roughly 16 points (`step = max(1, floor(n/16))`) for the cost, and returns `b` re-indexed by the best offset.
- **Example:** `align(resample(a, 64), resample(b, 64))`.
- **Composes with:** `morph` calls it when `align` (default true) and `closed`.

### morph

```ts
function morph(a: Pt[], b: Pt[], p: number, o: MorphOptions = {}): Pt[]
```
- **Purpose:** The interpolated point list between shapes `a` and `b` at progress `p`.
- **Parameters:** `a, b: Pt[]` — endpoint shapes; `p` — 0..1 progress (clamped internally); `o: MorphOptions` — see above.
- **Behavior:** Resamples both to `n`, aligns `b` to `a` if closed+align, applies `ease(clamp01(p))`, then lerps each point pair. Returns the morphed `Pt[]`.
- **Example:**
  ```ts
  const pts = morph(circleShape(cx, cy, 40), starShape(cx, cy, 40), t);
  ```
- **Composes with:** feed the result to your own path drawing, or use `drawMorph` to draw in one call.

### drawMorph

```ts
function drawMorph(
  ctx: CanvasRenderingContext2D,
  a: Pt[],
  b: Pt[],
  p: number,
  style: { fill?: string; stroke?: string; width?: number; closed?: boolean; align?: boolean; n?: number } = {},
): void
```
- **Purpose:** Compute the morph and draw it (fill and/or stroke) in one call.
- **Parameters:**
  - `a, b: Pt[]` — endpoint shapes; `p` — progress.
  - `style.fill?: string` — fill color; omit to skip fill.
  - `style.stroke?: string` — stroke color; omit to skip stroke.
  - `style.width?: number` (default `2`) — stroke line width. Stroke uses `lineJoin "round"`.
  - `style.closed?: boolean` (default `true`) — close the path (and morph as closed).
  - `style.align?: boolean` — passed through to `morph` (default true inside `morph`).
  - `style.n?: number` — resample resolution passed to `morph`.
- **Behavior:** Builds the path from `morph(...)` points (`moveTo` first, `lineTo` rest, `closePath` if closed), then fills and/or strokes as styled. Wrapped in `save`/`restore`.
- **Example:**
  ```ts
  drawMorph(ctx, circleShape(cx, cy, 40), heartShape(cx, cy, 40), t, { fill: "#e8a13c", stroke: "#fff", width: 3 });
  ```
- **Composes with:** any of the shape generators as `a`/`b`.

---

## Shape generators

All are centered at `(cx, cy)` and return `Pt[]` — handy sources for morphs.

### polygonShape

```ts
function polygonShape(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): Pt[]
```
- **Purpose:** A regular `sides`-gon of radius `r`, first vertex at angle `rot` (default `-π/2` = pointing up).
- **Parameters:** `cx, cy` — center; `r` — circumradius; `sides` — vertex count; `rot` (default `-π/2`) — start angle.
- **Example:** `polygonShape(cx, cy, 40, 6)` — a hexagon.

### circleShape

```ts
function circleShape(cx: number, cy: number, r: number, n = 48): Pt[]
```
- **Purpose:** A circle approximated as an `n`-gon (default `n = 48`) via `polygonShape`.
- **Example:** `circleShape(cx, cy, 40)`.

### starShape

```ts
function starShape(cx: number, cy: number, r: number, points = 5, inner = 0.45): Pt[]
```
- **Purpose:** A star with `points` outer spikes (default `5`), alternating outer radius `r` and inner radius `r·inner` (default `inner = 0.45`) across `points·2` vertices, first vertex up (`-π/2`).
- **Parameters:** `points` — number of star points; `inner` — inner-to-outer radius ratio (smaller = spikier).
- **Example:** `starShape(cx, cy, 40, 6, 0.5)`.

### heartShape

```ts
function heartShape(cx: number, cy: number, r: number, n = 48): Pt[]
```
- **Purpose:** A heart outline of `n` points (default `48`), from the classic parametric heart curve, scaled to radius `r` and vertically flipped to point down (canvas y-down).
- **Parameters:** `cx, cy` — center; `r` — scale; `n` — point count.
- **Example:** `heartShape(cx, cy, 40)`.

---

**Composes with (all generators):** `resample`, `align`, `morph`, `drawMorph` — pass any two as the `a`/`b` endpoints of a morph.
# Step 12 · Plots, charts & counters — `src/render/charts.ts`

**Responsibility.** Data-viz primitives: a coordinate mapper (`makePlot`), axes/grid, animated function plotting, and bar / line / area / scatter / pie charts bound to data. Everything animates from a progress value `p` (or `t` for staggered cascades) and is deterministic/seekable. Reuses `strokes` (draw-on), `sequence`-style stagger, and `type-motion` (`formatNumber` for formatted labels).

**When to use.** Whenever a lesson needs quantitative graphics: a plotted equation `y = f(x)`, a bar/line/scatter/pie of tabular data, or a value counter tied to a chart. Build one `Plot` (the coordinate frame) with `makePlot`, draw `axes` into it, then draw any number of series into the same `Plot`.

Everything is drawn directly to a `CanvasRenderingContext2D`. Default colors are the engine's dark-theme palette (teal `#5cc8ae`, amber `#e8a13c`, slate inks).

---

### makePlot

```ts
export function makePlot(area: PlotArea, xDomain: [number, number], yDomain: [number, number]): Plot
```

```ts
export interface PlotArea { x: number; y: number; w: number; h: number; }

export interface Plot extends PlotArea {
  xDomain: [number, number];
  yDomain: [number, number];
  sx(v: number): number;   // data x → pixel x
  sy(v: number): number;   // data y → pixel y
}
```

- **Purpose:** Create the coordinate frame that maps data-space values to pixels. Returns a `Plot` object whose `sx`/`sy` you use everywhere else.
- **Parameters / options:**
  - `area: PlotArea` — the pixel rectangle the plot occupies. `x, y` = top-left corner; `w, h` = width/height in px. The returned `Plot` spreads these fields, so `plot.x/y/w/h` are available.
  - `xDomain: [number, number]` — `[x0, x1]` data range mapped across `area.w`. `x0` maps to the left edge, `x1` to the right.
  - `yDomain: [number, number]` — `[y0, y1]` data range mapped across `area.h`. **`y` is inverted:** `y0` maps to the bottom (`area.y + area.h`), `y1` to the top. So `sy(y0)` is the baseline.
  - Returned methods:
    - `sx(v)` = `area.x + ((v - x0) / (x1 - x0 || 1)) * area.w`. Division guarded by `|| 1` so a zero-width domain won't divide by zero.
    - `sy(v)` = `area.y + area.h - ((v - y0) / (y1 - y0 || 1)) * area.h`.
- **Example:**
  ```ts
  const plot = makePlot({ x: 120, y: 80, w: 700, h: 380 }, [0, 10], [0, 100]);
  const px = plot.sx(5);   // horizontal center
  const py = plot.sy(50);  // vertical center
  ```
- **Composes with:** every other function in this module takes a `Plot`. `sy(plot.yDomain[0])` is the shared value-baseline used by `barChart` and `lineChart`'s area fill.

---

### niceTicks

```ts
export function niceTicks([a, b]: [number, number], count = 5): number[]
```

- **Purpose:** Compute "nice" evenly-spaced tick values across a domain, snapped to 1/2/5 × 10ⁿ steps. Used as the default tick set for `axes` and `timelineAxis`.
- **Parameters / options:**
  - `[a, b]: [number, number]` — the domain. Order-independent (internally sorted via `Math.min`/`Math.max`).
  - `count = 5` — target number of ticks (approximate; actual count depends on the chosen step). `Math.max(1, count)` guards against 0.
- **Behavior:** picks a step from `{1, 2, 5} × 10^floor(log10(span/count))`, starts at the first multiple ≥ the low end, and emits values through the high end (inclusive, with a `1e-9` epsilon). Each value is re-snapped via `Math.round(v/step)*step`.
- **Example:**
  ```ts
  niceTicks([0, 100]);      // [0, 20, 40, 60, 80, 100]
  niceTicks([0, 10], 4);    // e.g. [0, 2.5, 5, 7.5, 10] → snapped
  ```
- **Composes with:** `axes` defaults `xTicks`/`yTicks` to `niceTicks(plot.xDomain)` / `niceTicks(plot.yDomain)`; `timelineAxis` uses `niceTicks([tl.from, tl.to], 6)`.

---

### axes

```ts
export function axes(ctx: CanvasRenderingContext2D, plot: Plot, o: AxesOptions = {}): void
```

```ts
export interface AxesOptions {
  color?: string;
  gridColor?: string;
  ink?: string;
  xTicks?: number[];
  yTicks?: number[];
  grid?: boolean;
  xLabel?: string;
  yLabel?: string;
  fmt?: NumberFormat;
  fontPx?: number;
  p?: number; // reveal 0..1 (axes wipe in)
}
```

- **Purpose:** Draw the L-shaped axis (left + bottom lines), optional grid, tick labels, and optional axis titles for a `Plot`.
- **Parameters / options:**
  - `color: string` (default `"#5b6b78"`) — axis line color; also grid stroke fallback role.
  - `gridColor: string` (default `"rgba(255,255,255,0.06)"`) — grid line color; *use to* tune grid contrast.
  - `ink: string` (default `"#93a4b0"`) — color of tick labels and axis titles.
  - `xTicks: number[]` (default `niceTicks(plot.xDomain)`) — explicit x tick values.
  - `yTicks: number[]` (default `niceTicks(plot.yDomain)`) — explicit y tick values.
  - `grid: boolean` (default falsy → off) — when true, draws vertical + horizontal grid lines at every tick.
  - `xLabel: string` (default none) — centered title under the x axis (at `y + h + 34`).
  - `yLabel: string` (default none) — title rotated -90° to the left of the y axis (at `x - 40`).
  - `fmt: NumberFormat` (default undefined → plain) — passed to `formatNumber` for tick labels (from `type-motion`; e.g. currency/percent/compact formatting).
  - `fontPx: number` (default `11`) — tick/label font size; font family is `-apple-system, sans-serif`.
  - `p: number` (default `1`, clamped 0..1) — reveal fraction. Multiplies `globalAlpha`, so the whole axis group fades/wipes in as `p` goes 0→1.
- **Layout constants:** x tick labels at `y + h + 16`; y tick labels right-aligned at `x - 8` (`+4` baseline). Axis line width `1.5`, grid width `1`.
- **Example:**
  ```ts
  axes(ctx, plot, { grid: true, xLabel: "time (s)", yLabel: "velocity", p: reveal });
  ```
- **Composes with:** call once per `Plot` before drawing series. Share the same `p` with series draw-ons to stage a full reveal.

---

### plotFunction

```ts
export function plotFunction(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  fn: (x: number) => number,
  p: number,
  opts: { color?: string; width?: number; samples?: number } = {},
): void
```

- **Purpose:** Sample and draw `y = fn(x)` across the plot's x-domain, revealing the first `p` fraction of the curve (draw-on via `strokeOn`).
- **Parameters / options:**
  - `fn: (x: number) => number` — the function in data space; sampled at `samples + 1` evenly-spaced x values across `plot.xDomain`.
  - `p: number` — draw-on fraction 0..1 (handled by `strokeOn`, which reveals the first `p` of the polyline length).
  - `opts.color: string` (default `"#5cc8ae"`) — stroke color.
  - `opts.width: number` (default `2.5`) — stroke width in px.
  - `opts.samples: number` (default `120`) — number of segments; higher = smoother curve, more cost.
- **Example:**
  ```ts
  plotFunction(ctx, plot, (x) => Math.sin(x), reveal, { color: "#6db0e8", samples: 200 });
  ```
- **Composes with:** `strokes.strokeOn` for the reveal; draw after `axes`.

---

### barChart

```ts
export function barChart(ctx: CanvasRenderingContext2D, plot: Plot, data: Datum[], o: BarOptions): void
```

```ts
export interface Datum {
  label: string;
  value: number;
  color?: string;
}

export interface BarOptions {
  t: number;
  start?: number;
  step?: number;
  dur?: number;
  color?: string;
  ink?: string;
  gap?: number;         // fraction of slot that is gap (0..1)
  showValues?: boolean;
  fmt?: NumberFormat;
}
```

- **Purpose:** Draw bars that grow up from the value-baseline (`sy(yDomain[0])`) in a staggered cascade. Bar heights come from the plot's `yDomain`.
- **Parameters / options:**
  - `data: Datum[]` — one bar per datum. `Datum.label` = x-axis label under the bar; `Datum.value` = bar height in data space; `Datum.color` (optional) = per-bar override.
  - `o.t: number` (**required**) — the master progress clock driving the cascade.
  - `o.start: number` (default `0`) — global delay before the first bar animates.
  - `o.step: number` (default `0.15`) — per-bar stagger; bar `i` starts at `start + i*step`.
  - `o.dur: number` (default `0.5`) — per-bar grow duration. Each bar's local progress `gp = clamp01((t - start - i*step) / dur)`.
  - `o.color: string` (default `"#5cc8ae"`) — bar fill fallback when `Datum.color` is absent.
  - `o.ink: string` (default `"#93a4b0"` for the label, `"#cdd8e2"` reset for values) — label/value text color.
  - `o.gap: number` (default `0.35`) — fraction of each slot left empty as spacing. Bar width `bw = (w/data.length) * (1 - gap)`.
  - `o.showValues: boolean` (default falsy) — when true, draws the formatted numeric value above each bar, fading in with `gp`.
  - `o.fmt: NumberFormat` (default plain) — number format for the value labels.
- **Details:** bars use `roundRect` with top corners rounded `[4,4,0,0]`. Bar top is clamped so `value` below the baseline can't invert the bar (`Math.min(base, lerp(base, full, gp))`). Label font `600 11px`.
- **Example:**
  ```ts
  barChart(ctx, plot, [
    { label: "A", value: 30 },
    { label: "B", value: 55, color: "#e8a13c" },
  ], { t, showValues: true, fmt: "compact" });
  ```
- **Composes with:** a `Plot` whose `yDomain` includes 0 as the baseline; `type-motion.formatNumber` for value labels.

---

### lineChart

```ts
export function lineChart(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  series: [number, number][],
  p: number,
  o: LineOptions = {},
): void
```

```ts
export interface LineOptions {
  color?: string;
  width?: number;
  area?: boolean;        // fill under the line
  areaColor?: string;
  markers?: boolean;
  markerColor?: string;
}
```

- **Purpose:** Draw a line series bound to `[x, y]` data, drawing on to `p`, with optional area fill and point markers.
- **Parameters / options:**
  - `series: [number, number][]` — data-space points; mapped through `plot.sx`/`plot.sy`.
  - `p: number` — draw-on fraction 0..1 (via `strokeOn`).
  - `o.color: string` (default `"#5cc8ae"`) — line stroke color.
  - `o.width: number` (default `2.5`) — line width.
  - `o.area: boolean` (default falsy) — when true, fills the region under the revealed portion of the line down to the value-baseline `sy(yDomain[0])` (not the plot floor). The revealed sub-path uses `Math.max(2, ceil(pts.length * p))` points; fill drawn at `globalAlpha *= 0.9`.
  - `o.areaColor: string` (default `"rgba(92,200,174,0.18)"`) — area fill color.
  - `o.markers: boolean` (default falsy) — when true, draws a radius-3 dot at each revealed point (`ceil(pts.length * p)` points).
  - `o.markerColor: string` (default `o.color` → `"#5cc8ae"`) — marker fill color.
- **Example:**
  ```ts
  lineChart(ctx, plot, [[0,0],[1,4],[2,3],[3,7]], reveal,
    { area: true, markers: true, color: "#6db0e8" });
  ```
- **Composes with:** `strokes.strokeOn`; draw after `axes`. For a plotted equation use `plotFunction` instead.

---

### scatter

```ts
export function scatter(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  points: [number, number][],
  t: number,
  o: { color?: string; r?: number; start?: number; step?: number } = {},
): void
```

- **Purpose:** Draw scatter points that pop in one-by-one in a staggered cascade, each scaling up from 0.
- **Parameters / options:**
  - `points: [number, number][]` — data-space points.
  - `t: number` — master progress clock.
  - `o.color: string` (default `"#e8a13c"`) — point fill color.
  - `o.r: number` (default `4`) — full point radius in px. Actual radius is `r * gp`, so points grow in.
  - `o.start: number` (default `0`) — global delay.
  - `o.step: number` (default `0.03`) — per-point stagger; point `i` local progress `gp = clamp01((t - start - i*step) / 0.3)` (fixed 0.3s per-point duration). Alpha = `gp`.
- **Example:**
  ```ts
  scatter(ctx, plot, cloud, t, { color: "#a06be8", r: 5, step: 0.02 });
  ```
- **Composes with:** a `Plot` frame; pair with `axes`.

---

### pie

```ts
export function pie(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  data: Datum[],
  p: number,
  o: PieOptions = {},
): void
```

```ts
export interface PieOptions {
  donut?: number;      // inner radius fraction (0 = pie, 0.6 = donut)
  labels?: boolean;
  ink?: string;
  startAngle?: number;
}
```

- **Purpose:** Draw pie/donut wedges that sweep in as `p` 0→1, sized proportional to each datum's share of the total. **Does not use a `Plot`** — takes an explicit center and radius.
- **Parameters / options:**
  - `cx, cy, r: number` — center (px) and outer radius (px).
  - `data: Datum[]` — one wedge per datum; `Datum.value` is the share, `Datum.color` an optional override. `Datum.label` is not drawn (labels show the percentage instead).
  - `p: number` — 0..1 sweep progress; each wedge sweeps `frac * 2π * p`.
  - `o.donut: number` (default `0`) — inner-radius fraction. `0` = solid pie; e.g. `0.6` = donut with hole at `0.6*r`. Non-zero switches the wedge to an annular sector.
  - `o.labels: boolean` (default falsy) — when true and `p > 0.7`, draws each wedge's rounded percentage (`Math.round(frac*100)%`) at the wedge midpoint, fading in over `p` 0.7→1.0. Label color is fixed `#0e141a`, font `600 11px`.
  - `o.ink: string` — declared in the interface but **not read** by the implementation (percentage label color is hardcoded `#0e141a`).
  - `o.startAngle: number` (default `-Math.PI / 2`, i.e. 12 o'clock) — angle of the first wedge's start edge.
  - **Default palette** (when no `Datum.color`): `["#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b", "#a06be8", "#38ef7d"]`, cycled by index.
- **Example:**
  ```ts
  pie(ctx, 400, 250, 120, [
    { label: "x", value: 60 },
    { label: "y", value: 40 },
  ], reveal, { donut: 0.55, labels: true });
  ```
- **Composes with:** standalone; combine with `icons.legend`/`colorSemantics` for a labeled key.

---

# Step 13 · Timeline — `src/render/timeline.ts`

**Responsibility.** A timeline primitive: a date axis, eras (colored bands), events (markers + labels) on one or more parallel tracks, and a moving playhead. Dates are plain numbers (years; **negative = BCE**). Deterministic/seekable; reuses `strokes` (axis draw-on) and stagger (event/era cascade). Depends on `niceTicks` from `charts.ts`.

**When to use.** History/geology/process lessons that lay concepts along a date axis: dynasties as eras, key moments as events, and a "now" playhead sweeping across. Build one `Timeline` with `makeTimeline`, then layer `timelineAxis`, `eras`, `events`, `playhead` into it.

---

### makeTimeline

```ts
export function makeTimeline(
  area: { x: number; y: number; w: number; h: number },
  from: number, to: number,
  tracks = 1,
): Timeline
```

```ts
export interface Timeline {
  x: number; y: number; w: number; h: number;
  from: number; to: number; tracks: number;
  sx(date: number): number;     // date → pixel x
  trackY(track: number): number; // track index → pixel y
}
```

- **Purpose:** Create the timeline coordinate frame mapping dates (years) to pixel x, and track indices to pixel y.
- **Parameters / options:**
  - `area` — pixel rectangle (`x, y` top-left; `w, h` size). Spread onto the returned object.
  - `from, to: number` — date range in years. Negative = BCE. `from` maps to the left edge, `to` to the right.
  - `tracks: number` (default `1`) — number of parallel horizontal tracks (lanes for events/eras).
  - Methods:
    - `sx(d)` = `area.x + ((d - from) / (to - from || 1)) * area.w` (zero-span guarded).
    - `trackY(i)` — clamps `i` into `[0, tracks-1]`. For a single track returns the vertical center (`area.y + area.h*0.5`). For multiple tracks, distributes across `0.28 → 0.78` of `area.h` (`0.28 + (k/(tracks-1))*0.5`).
- **Example:**
  ```ts
  const tl = makeTimeline({ x: 100, y: 120, w: 760, h: 260 }, -500, 1500, 2);
  const px = tl.sx(1066);   // pixel x for year 1066 CE
  const py = tl.trackY(0);  // top track baseline
  ```
- **Composes with:** every other timeline function takes a `Timeline`.

---

### formatYear

```ts
export function formatYear(y: number): string
```

- **Purpose:** Format a year with a BCE/CE suffix.
- **Behavior:** `y < 0` → `` `${Math.abs(Math.round(y))} BCE` `` (e.g. `-500` → `"500 BCE"`); otherwise → `` `${Math.round(y)} CE` `` (e.g. `1066` → `"1066 CE"`). Year `0` is rendered `"0 CE"`.
- **Example:** `formatYear(-323); // "323 BCE"`
- **Composes with:** used internally by `timelineAxis` (tick labels) and `playhead` (handle label).

---

### timelineAxis

```ts
export function timelineAxis(ctx: CanvasRenderingContext2D, tl: Timeline, o: AxisOptions = {}): void
```

```ts
export interface AxisOptions {
  p?: number;             // axis draw-on
  color?: string;
  ink?: string;
  ticks?: number[];
  fontPx?: number;
  baselineFrac?: number;  // where the axis sits within h (default 0.5)
}
```

- **Purpose:** Draw the horizontal baseline (draw-on) plus tick marks and BCE/CE year labels.
- **Parameters / options:**
  - `o.p: number` (default `1`, clamped) — axis draw-on fraction. The baseline reveals via `strokeOn`; ticks only appear once the axis has swept past them (`tl.sx(v) > tl.x + tl.w*p + 2` are skipped), and the whole label group is multiplied by `globalAlpha *= p`.
  - `o.color: string` (default `"#5b6b78"`) — baseline + tick color.
  - `o.ink: string` (default `"#93a4b0"`) — year-label text color.
  - `o.ticks: number[]` (default `niceTicks([tl.from, tl.to], 6)`) — explicit tick years.
  - `o.fontPx: number` (default `11`) — label font size (`-apple-system, sans-serif`).
  - `o.baselineFrac: number` (default `0.5`) — vertical position of the baseline within `h`; the baseline y is `tl.y + tl.h*baselineFrac`.
- **Details:** ticks drawn as 8px vertical marks (`by-4 → by+4`); labels centered below at `by + 18` via `formatYear`. Baseline stroke width `2`.
- **Example:**
  ```ts
  timelineAxis(ctx, tl, { p: reveal, baselineFrac: 0.6 });
  ```
- **Composes with:** `strokes.strokeOn`, `charts.niceTicks`, `formatYear`. Draw first, then `eras`/`events`/`playhead`.

---

### eras

```ts
export function eras(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  list: Era[],
  p: number,
  opts: { height?: number; start?: number; step?: number } = {},
): void
```

```ts
export interface Era {
  from: number;
  to: number;
  label: string;
  color?: string;
  track?: number;
}
```

- **Purpose:** Draw colored era bands that grow horizontally from their start edge as `p` 0→1, in a staggered cascade, with a label that fades in.
- **Parameters / options:**
  - `list: Era[]` — each band spans `Era.from → Era.to` (years) on `Era.track` (default `0`). `Era.color` overrides the palette; `Era.label` is centered in the band.
  - `p: number` — master 0..1 progress driving the cascade.
  - `opts.height: number` (default `22`) — band height in px (centered on the track y).
  - `opts.start` — declared in the signature but **not used** in the era-progress formula (per-band progress is `clamp01((P - i*step) / max(1e-3, 1 - i*step))`).
  - `opts.step: number` (default `0.12`) — per-era stagger.
  - **Default palette:** `["#2f6b57", "#8a5a2b", "#3a5a7a", "#6b3a5a"]`, cycled by index.
- **Details:** band width grows as `(x1 - x0) * ep`; drawn with `roundRect` radius `5` at `globalAlpha = 0.9 * ep`. Label (`600 11px`, color `#eef5ef`) appears only when `ep > 0.6`, fading over `ep` 0.6→1.0.
- **Example:**
  ```ts
  eras(ctx, tl, [
    { from: -221, to: 206, label: "Qin/Han", track: 0 },
    { from: 618, to: 907, label: "Tang", color: "#3a5a7a", track: 1 },
  ], reveal);
  ```
- **Composes with:** a multi-track `Timeline` when `Era.track` varies; draw after `timelineAxis`.

---

### events

```ts
export function events(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  list: TimelineEvent[],
  t: number,
  opts: { start?: number; step?: number; ink?: string } = {},
): void
```

```ts
export interface TimelineEvent {
  at: number;
  label: string;
  track?: number;
  color?: string;
  above?: boolean;   // label above (default) or below the marker
}
```

- **Purpose:** Draw event markers (a stem + dot pin) with labels appearing in a staggered cascade.
- **Parameters / options:**
  - `list: TimelineEvent[]` — `at` = year of the event; `label` = text; `track` (default `0`) = which lane's baseline the pin sits on; `color` overrides the marker color.
  - `above: boolean` — controls label/stem direction. Default (undefined or `true`) points **up** (`dir = -1`, label above). Only `above === false` flips it **down** (`dir = 1`, label below).
  - `t: number` — master progress clock.
  - `opts.start: number` (default `0`) — global delay.
  - `opts.step: number` (default `0.25`) — per-event stagger; event `i` local progress `ep = clamp01((t - start - i*step) / 0.4)`.
  - `opts.ink: string` (default `"#eef5ef"`) — label text color.
- **Details:** stem length grows to `26*ep`; dot radius `3.5`; marker stroke/fill defaults `"#e8a13c"`. Label offset from the dot: `stem + 4` (up) or `stem + 12` (down). Font `600 11px`, centered.
- **Example:**
  ```ts
  events(ctx, tl, [
    { at: 1066, label: "Hastings" },
    { at: 1215, label: "Magna Carta", above: false, color: "#6db0e8" },
  ], t);
  ```
- **Composes with:** a `Timeline`; stack multiple tracks + `above` to avoid label collisions.

---

### playhead

```ts
export function playhead(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  atDate: number,
  opts: { color?: string; label?: boolean } = {},
): void
```

- **Purpose:** Draw a vertical "now" marker at `atDate` — a full-height line with a triangular handle at the top, optionally labeled with the year.
- **Parameters / options:**
  - `atDate: number` — the year the playhead sits at (mapped via `tl.sx`). Animate this to sweep the timeline.
  - `opts.color: string` (default `"#5cc8ae"`) — line, handle, and label-chip color.
  - `opts.label: boolean` (default falsy) — when true, draws a colored chip above the top edge (`tl.y - 18`) containing `formatYear(atDate)` in dark ink (`#0e141a`, font `700 10px`). Chip width = text width + 10.
- **Details:** line spans the full timeline height (`tl.y → tl.y + tl.h`), width `2`; handle is a downward triangle from the top edge to `tl.y + 8`.
- **Example:**
  ```ts
  playhead(ctx, tl, lerp(tl.from, tl.to, t), { label: true });
  ```
- **Composes with:** `formatYear`; draw last so it sits above eras/events.

---

# Step 17 · Math typesetting — `src/render/mathtext.ts`

**Responsibility.** A compact, canvas-native math typesetter for the LaTeX subset a lesson actually needs: text runs, super/subscripts, fractions, square roots, and a symbol dictionary (Greek, operators, arrows, ∑ ∫ ∏ …). Fully deterministic and offline — no KaTeX/DOM/font pipeline — so it renders and scrubs reliably. `drawMath` supports a left-to-right draw-on reveal.

**When to use.** Any display math in a lesson: chemistry/physics/algebra formulas. Use `measureMath` to lay out (get a box you can position), `drawMath` to render at a point with alignment and an optional writing-on animation. **It is a pragmatic subset, not full LaTeX** — see the explicit "supported / not supported" list below.

Math text uses a serif font (`"Georgia", "Times New Roman", serif`); single Latin letters are auto-italicized (as math variables).

---

### Supported LaTeX-subset syntax

The tokenizer/parser handles **exactly** the following, and nothing else:

- **Backslash commands** `\name` — a run of ASCII letters after `\`. If `name` is a key in `SYMBOLS` (below) it renders the symbol; otherwise the command name is rendered as literal text (unknown commands are **not** dropped — `\foo` prints "foo"). A single non-letter after `\` (e.g. `\,`, `\{`) is captured as a one-char command and, not being in `SYMBOLS`, prints that character literally.
- **Superscript** `^` — raises the next argument. The base is the previously-parsed atom; the exponent is one argument. Exponent rendered at `size * 0.72`.
- **Subscript** `_` — lowers the next argument, at `size * 0.72`.
- **Groups** `{ … }` — group multiple atoms into a single argument/run (e.g. `x^{2n}`, `\frac{a+b}{c}`).
- **`\frac{num}{den}`** — a fraction with a drawn bar. Numerator/denominator shrink to `SCRIPT = 0.85` of the current size.
- **`\sqrt{body}`** — a square root with a drawn radical. (Only the plain form; **no** index/nth-root `\sqrt[n]{...}` — the `[n]` would parse as literal characters.)
- **Argument rules:** after `^ _ \frac \sqrt`, an argument is either a single `{group}` or exactly one token/command (including a nested `\frac`/`\sqrt`). So `x^2` takes just `2`; `x^{2n}` takes the group.
- **Spaces** — literal space characters are **skipped** (spacing comes from layout, not source spaces).
- **Letters vs symbols** — a single ASCII letter atom is drawn italic (math-variable style); digits/punctuation/symbols are upright.

**NOT supported** (these will render as literal text or be ignored, never as structured math):
- Any command not in the `SYMBOLS` table (renders as its literal name — e.g. `\mathbf`, `\text`, `\vec`, `\hat`, `\overline`, `\left`, `\right`, `\begin`/`\end`, matrices, `\sqrt[n]`).
- Environments, alignment, matrices, cases, arrays.
- Delimiter auto-sizing (`\left(` … `\right)`), big operators with limits attached above/below (∑ etc. render as a plain glyph; `_`/`^` on them attach as ordinary sub/superscripts, not limits).
- Multi-argument macros beyond `\frac`; accents; `\text{}`; color/font commands.
- Nested-index roots; over/underbraces; integrals-with-limits stacking.

---

### The full SYMBOLS dictionary

Every key (use as `\key`) and its glyph:

**Greek letters**
| key | glyph | key | glyph | key | glyph |
|---|---|---|---|---|---|
| `alpha` | α | `beta` | β | `gamma` | γ |
| `delta` | δ | `Delta` | Δ | `epsilon` | ε |
| `zeta` | ζ | `eta` | η | `theta` | θ |
| `Theta` | Θ | `lambda` | λ | `mu` | μ |
| `nu` | ν | `xi` | ξ | `pi` | π |
| `Pi` | Π | `rho` | ρ | `sigma` | σ |
| `Sigma` | Σ | `tau` | τ | `phi` | φ |
| `Phi` | Φ | `chi` | χ | `psi` | ψ |
| `omega` | ω | `Omega` | Ω | | |

**Operators / relations**
| key | glyph | key | glyph | key | glyph |
|---|---|---|---|---|---|
| `times` | × | `cdot` | · | `div` | ÷ |
| `pm` | ± | `mp` | ∓ | `leq` | ≤ |
| `geq` | ≥ | `neq` | ≠ | `approx` | ≈ |
| `equiv` | ≡ | `propto` | ∝ | `deg` | ° |

**Arrows**
| key | glyph | key | glyph |
|---|---|---|---|
| `to` | → | `rightarrow` | → |
| `Rightarrow` | ⇒ | `leftarrow` | ← |
| `leftrightarrow` | ↔ | | |

**Big operators / calculus / misc**
| key | glyph | key | glyph | key | glyph |
|---|---|---|---|---|---|
| `infty` | ∞ | `partial` | ∂ | `nabla` | ∇ |
| `int` | ∫ | `sum` | ∑ | `prod` | ∏ |
| `cdots` | ⋯ | `ldots` | … | | |

**Set / logic**
| key | glyph | key | glyph |
|---|---|---|---|
| `in` | ∈ | `forall` | ∀ |
| `exists` | ∃ | `angle` | ∠ |
| `perp` | ⊥ | `cup` | ∪ |
| `cap` | ∩ | | |

That is the **complete** table — any `\key` not listed here is printed as literal text.

---

### measureMath

```ts
export function measureMath(src: string, size: number): {
  w: number;
  h: number;
  render: (ctx: CanvasRenderingContext2D, xTop: number, yTop: number) => void;
}
```

- **Purpose:** Parse and lay out an expression at font `size`, returning its pixel `w`/`h` and a `render` callback whose origin is the **top-left** of the box. Use to position math precisely before drawing.
- **Parameters / options:**
  - `src: string` — the LaTeX-subset source.
  - `size: number` — base font size in px.
  - Returns `w`, `h` (`= box.ascent + box.descent`), and `render(ctx, xTop, yTop)` which internally offsets the baseline by `box.ascent`.
- **Note:** width measurement uses a shared offscreen canvas (`document.createElement("canvas")`); if `document` is unavailable it falls back to an estimate `str.length * size * 0.5`.
- **Example:**
  ```ts
  const m = measureMath("E = mc^2", 32);
  m.render(ctx, 100, 80);   // top-left at (100, 80)
  ```
- **Composes with:** `drawMath` calls it internally; call it yourself for custom layout/alignment.

---

### drawMath

```ts
export function drawMath(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number, y: number,
  style: MathStyle = {},
): void
```

```ts
export interface MathStyle {
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  p?: number;      // draw-on: reveal left→right
  alpha?: number;
}
```

- **Purpose:** Render an expression at `(x, y)` with alignment, color, opacity, and an optional left-to-right reveal.
- **Parameters / options:**
  - `size: number` (default `28`) — base font size in px.
  - `color: string` (default `"#eef5ef"`) — fill color; also drives the fraction bar / radical stroke (they read the current `fillStyle`).
  - `align` — horizontal anchoring at `x`. Union values:
    - `"left"` (default when unset) — `x` is the left edge.
    - `"center"` — `x` is the horizontal center (`ax = x - w/2`).
    - `"right"` — `x` is the right edge (`ax = x - w`).
    - Vertically, `y` is always the **center** (`ay = y - h/2`).
  - `p: number` (default `1`, clamped) — draw-on reveal fraction. When `p < 1`, a clip rect exposes the leftmost `w*p` (with 4px padding), so the expression "writes on" left→right.
  - `alpha: number` (default `1`, clamped) — multiplies `globalAlpha`.
- **Example:**
  ```ts
  drawMath(ctx, "\\frac{\\partial f}{\\partial x} = 2x", 480, 240,
    { align: "center", size: 34, color: "#5cc8ae", p: reveal });
  ```
  (Remember to escape backslashes in TS/JS string literals: `\\frac`, `\\partial`.)
- **Composes with:** `measureMath` (internally); share `p` with other draw-ons to stage a reveal.

---

# Step 15 · Iconography & color semantics — `src/render/icons.ts`

**Responsibility.** A reusable vector icon kit plus a color-semantics registry with auto-legend. Icons are pure path functions drawn in a unit box (`[-0.5, 0.5]²`), so they scale/theme cleanly and can draw-on. The color registry maps category names → consistent colors (assigned deterministically, cached) so the same concept keeps its color across a whole lesson; `legend()` renders the key.

**When to use.** Whenever a lesson needs a small symbolic glyph (a leaf, bolt, flask, warning) or a consistent color-per-category scheme with a legend. Icons are drawn centered at a point at a pixel size; color semantics keep e.g. "carbon" the same color on every slide.

---

### The IconName union — all 30 icons

```ts
export type IconName =
  | "arrow" | "check" | "cross" | "plus" | "minus" | "star" | "heart" | "circle" | "square" | "triangle"
  | "gear" | "bolt" | "drop" | "sun" | "leaf" | "flame" | "factory" | "home" | "person" | "book"
  | "flask" | "atom" | "clock" | "pin" | "warning" | "info" | "search" | "cloud" | "mountain" | "seed";
```

Complete list (30): `arrow`, `check`, `cross`, `plus`, `minus`, `star`, `heart`, `circle`, `square`, `triangle`, `gear`, `bolt`, `drop`, `sun`, `leaf`, `flame`, `factory`, `home`, `person`, `book`, `flask`, `atom`, `clock`, `pin`, `warning`, `info`, `search`, `cloud`, `mountain`, `seed`.

`iconNames` is exported as the runtime array of these keys: `export const iconNames = Object.keys(ICONS) as IconName[];`

---

### The FILLABLE set

Only these icons are genuine closed shapes and honor `filled: true` (16 total):

```ts
"star", "heart", "circle", "square", "triangle", "gear", "bolt", "drop",
"flame", "factory", "pin", "warning", "cloud", "mountain", "seed", "book", "flask"
```

Every **other** icon (`arrow`, `check`, `cross`, `plus`, `minus`, `sun`, `leaf`, `home`, `person`, `atom`, `clock`, `info`, `search`) is an open/stroke-only glyph and is **always stroked**, even if the caller passes `filled: true` — so a caller can't fill an open path into a blob.

---

### drawIcon

```ts
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  x: number, y: number,
  size: number,
  style: IconStyle = {},
): void
```

```ts
export interface IconStyle {
  color?: string;
  filled?: boolean;
  width?: number;
  alpha?: number;
}
```

- **Purpose:** Draw an icon centered at `(x, y)` at pixel `size`, filled or stroked, themed by `color`.
- **Parameters / options:**
  - `name: IconName` — which glyph (see the union above). Unknown name → no-op (`if (!fn) return`).
  - `x, y: number` — center point (px). The unit path is `translate(x,y)`-then-`scale(size,size)`.
  - `size: number` — glyph size in px (the icon roughly fills a `size × size` box).
  - `style.color: string` (default `"#eef5ef"`) — sets both `strokeStyle` and `fillStyle`.
  - `style.filled: boolean` (default falsy) — fill instead of stroke, **but only if `name` is in FILLABLE**; otherwise it's stroked regardless.
  - `style.width: number` (default `2`) — stroke width in px. Compensated for scale (`width / size`) so it stays constant on screen at any `size`. `lineJoin`/`lineCap` are `"round"`.
  - `style.alpha: number` (default `1`, clamped) — multiplies `globalAlpha`.
- **Example:**
  ```ts
  drawIcon(ctx, "leaf", 200, 150, 40, { color: "#38ef7d" });          // stroked (open glyph)
  drawIcon(ctx, "warning", 260, 150, 36, { color: "#e8a13c", filled: true }); // filled (FILLABLE)
  ```
- **Composes with:** `colorSemantics().colorFor(cat)` for the color; `legend`'s `icon` option calls `drawIcon` per row.

---

### colorSemantics / colorFor / legend

```ts
export const SEMANTIC_PALETTE = [
  "#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b", "#a06be8",
  "#38ef7d", "#e8c14a", "#e2452b", "#4ad6c8", "#b0884a",
]; // 10 colors

export function colorSemantics(palette: string[] = SEMANTIC_PALETTE): {
  colorFor(category: string): string;
  legend(
    ctx: CanvasRenderingContext2D,
    categories: string[],
    x: number, y: number,
    opts?: { rowH?: number; swatch?: number; font?: string; ink?: string; icon?: (cat: string) => IconName },
  ): void;
}
```

- **Purpose:** A color registry — each category name gets a stable color from the palette on first use (assigned sequentially, so distinct up to palette size) and cached. Same category → same color everywhere in the lesson. Includes a `legend` renderer.
- **`colorSemantics(palette)`:**
  - `palette: string[]` (default `SEMANTIC_PALETTE`, 10 colors) — the color pool.
  - Returns an object with `colorFor` and `legend`, backed by an internal `Map`. Create **one** instance per lesson (or shared scope) so the cache persists; a new instance restarts assignments.
- **`colorFor(category)`:** returns the cached color, or assigns `palette[map.size % palette.length]` on first sight (wraps around after the palette is exhausted, so category 11 reuses color 1).
- **`legend(ctx, categories, x, y, opts)`:** draws a vertical swatch+label key starting at `(x, y)`.
  - `categories: string[]` — rows, top to bottom. Each row calls `colorFor(cat)` (so it also registers colors).
  - `opts.rowH: number` (default `20`) — vertical spacing between rows (px).
  - `opts.swatch: number` (default `11`) — swatch size (px square, or icon size `swatch + 4` when `icon` given).
  - `opts.font: string` (default `"12px -apple-system, sans-serif"`) — label font.
  - `opts.ink: string` (default `"#cdd8e2"`) — label text color.
  - `opts.icon: (cat: string) => IconName` (optional) — when provided, each row draws a **filled** icon (via `drawIcon`, `filled: true`) in the category's color instead of a square swatch. Label text is at `x + swatch + 8`.
- **Example:**
  ```ts
  const sem = colorSemantics();
  const cColor = sem.colorFor("carbon");   // "#5cc8ae"
  const oColor = sem.colorFor("oxygen");   // "#e8a13c"
  sem.legend(ctx, ["carbon", "oxygen"], 40, 60, {
    icon: (c) => (c === "carbon" ? "atom" : "circle"),
  });
  ```
- **Composes with:** `drawIcon` (for iconized legends and elsewhere in a slide); feed `colorFor` results into `Datum.color`, `Era.color`, `TimelineEvent.color`, chart/plot colors, etc. so categories stay color-consistent across charts, timelines, and icons.
# Step 16 · Map / geo subsystem — `src/render/geo.ts`

**Responsibility.** A tiny projected-map toolkit: build an equirectangular projection from GeoJSON-shaped data, fill regions with draw-on borders, interpolate borders over time (morph), draw curved flow arrows between coordinates, place icon markers, and find feature centers for camera focus.

**When to use.** Reach for `geo` whenever a lesson needs a map: showing territory, animating borders-over-time (empires, plate boundaries, election maps), drawing migration/trade/attack flow arrows, pinning locations, or a fog-of-war reveal (compose with the reveal subsystem — geo itself only supplies the map primitives).

**Data model.** Everything is passed in — **no fetch, no network**. This keeps rendering deterministic and offline. A lesson bundles a small `GeoFeature[]` set (or an authored sample). Coordinates are `[lon, lat]` pairs (note: longitude first, then latitude), grouped into closed rings, grouped into features. North is up.

**Composition.** Region draw-on and flow arrows use the strokes subsystem (`strokeOn`, `smoothPath`, `arrowhead`); borders-over-time uses `morph`; markers use `drawIcon` from icons; `featureCenter` returns a lon/lat you project and hand to the camera for region zooms; fog-of-war composes with the reveal subsystem.

---

## Types

```ts
export type LonLat = [number, number]; // [lon, lat] — longitude first

export interface GeoFeature {
  id: string;
  rings: LonLat[][];             // one or more closed rings (first = outer, rest = holes)
  props?: Record<string, unknown>;
}

export interface Projection {
  project(ll: LonLat): Pt;       // Pt = [number, number] view-space point
  scale: number;                 // pixels per lon/lat unit
}

export interface RegionStyle {
  fill?: string;                 // fill color; omit for no fill
  stroke?: string;               // border color; omit for no border
  width?: number;                // border line width (default 1.5)
  p?: number;                    // draw-on progress 0..1 (default 1 = fully drawn)
  fillAlpha?: number;            // max fill opacity (default 1)
}
```

- `GeoFeature.rings[0]` is the outer ring. Additional rings are treated as holes via even-odd fill.
- `Projection.project` maps a `[lon, lat]` to a view-space `[x, y]`.

---

## `fitProjection`

```ts
export function fitProjection(
  features: GeoFeature[],
  area: { x: number; y: number; w: number; h: number },
  pad = 24
): Projection
```

Builds an equirectangular projection whose bounding box (over all rings of all `features`) is fit and centered inside `area`, north up.

- **`features`** — the feature set whose combined lon/lat extent defines the fit. All rings of all features are scanned for min/max lon/lat.
- **`area`** — the view-space rectangle `{x, y, w, h}` to fit into.
- **`pad`** *(default `24`)* — inner padding in pixels on each side; the data box is fit into `area` shrunk by `2*pad` in each dimension.
- **Returns** a `Projection`. `scale = min((w - 2*pad)/bboxWidth, (h - 2*pad)/bboxHeight)` (uniform scale, aspect preserved), with the projected box centered in `area`. Latitude is flipped so north is up (`oy + (maxLat - lat) * s`).
- **Degenerate cases.** If the feature set is empty or produces non-finite bounds, returns a harmless fallback `{ scale: 1, project: ([lon, lat]) => [area.x + lon, area.y + lat] }` (no NaNs). A zero-width or zero-height bbox is treated as `1` to avoid division by zero.
- **When.** Call once up front with your full feature set and the map rectangle; reuse the returned `Projection` for every draw/marker/arrow call so they share coordinates.

**Example**
```ts
const proj = fitProjection(features, { x: 40, y: 40, w: 840, h: 350 });
```

---

## `drawFeature`

```ts
export function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: GeoFeature,
  proj: Projection,
  style: RegionStyle = {}
): void
```

Draws one feature: the border strokes on with `p`, and the fill fades in only after `p > 0.3`.

- **`style.p`** *(default `1`, clamped 0..1)* — draw-on progress. Below `0.3` no fill is shown; the fill alpha ramps from 0 at `p=0.3` to full at `p=1` via `clamp01((p - 0.3)/0.7)`.
- **`style.fill`** — fill color. Fill uses all rings with `"evenodd"` so inner rings cut holes. Skipped entirely if unset or `p <= 0.3`.
- **`style.fillAlpha`** *(default `1`)* — multiplies the computed fade alpha to cap fill opacity.
- **`style.stroke`** — border color. Skipped if unset. The outer ring is closed (`[...outer, outer[0]]`) and drawn with `strokeOn(ctx, border, p, …)`.
- **`style.width`** *(default `1.5`)* — border line width.
- **When.** Use for a single region you want to animate on independently, or as the per-feature primitive behind `drawMap`.

**Example**
```ts
drawFeature(ctx, feature, proj, { fill: "#2c3f55", stroke: "#8fb4d6", p });
```

---

## `drawMap`

```ts
export function drawMap(
  ctx: CanvasRenderingContext2D,
  features: GeoFeature[],
  proj: Projection,
  styleFor: (f: GeoFeature, i: number) => RegionStyle
): void
```

Draws every feature, calling `styleFor(feature, index)` per feature to pick its `RegionStyle`, then delegating to `drawFeature`.

- **`styleFor`** — callback returning the style for each feature; use it to vary fill/stroke by semantics (e.g. by `feature.props`) and to pass a per-feature `p` for staggered draw-on.
- **When.** Draw a whole map in one call while keeping per-region styling and timing under your control.

**Example**
```ts
drawMap(ctx, features, proj, (f, i) => ({
  fill: f.props?.color as string,
  stroke: "#dfe9f3",
  p: clamp01((t - i * 0.1) / 0.8),
}));
```

---

## `borderAt`

```ts
export function borderAt(
  ringsA: LonLat[],
  ringsB: LonLat[],
  p: number,
  proj: Projection
): Pt[]
```

Interpolates a feature's **outer border** between two keyframe rings (borders-over-time). Both rings are projected, then blended with `morph(a, b, p, { closed: true, align: true, n: 96 })`.

- **`ringsA` / `ringsB`** — the start and end outer rings (as `LonLat[]`, not full features).
- **`p`** — morph progress 0..1.
- **Returns** the interpolated projected polyline (`Pt[]`, 96 resampled points, closed and vertex-aligned) — you then stroke or fill it yourself.
- **When.** Animate a changing frontier: pass two snapshots of a nation's border and sweep `p` across a scene.

**Example**
```ts
const ring = borderAt(empire1200.rings[0], empire1250.rings[0], p, proj);
strokeOn(ctx, [...ring, ring[0]], 1, { color: "#e8a13c", width: 2 });
```

---

## `flowArrow`

```ts
export function flowArrow(
  ctx: CanvasRenderingContext2D,
  from: LonLat,
  to: LonLat,
  proj: Projection,
  p: number,
  opts: { color?: string; width?: number; bend?: number } = {}
): void
```

Draws a curved (quadratic-feel, Catmull-Rom sampled) flow arrow from one coordinate to another, drawing on to `p`, with an arrowhead that fades in near the end.

- **`from` / `to`** — endpoint coordinates (`LonLat`), projected internally.
- **`p`** — draw-on progress 0..1 (clamped). The path strokes on with `strokeOn`.
- **`opts.bend`** *(default `0.22`)* — sideways bow of the control point as a fraction of the endpoint distance; controls curvature.
- **`opts.color`** *(default `"#e8a13c"`)* — stroke and arrowhead color.
- **`opts.width`** *(default `2.5`)* — stroke width.
- **Arrowhead.** Only drawn once `p > 0.9`; size `11`, alpha ramps `clamp01((p - 0.9)/0.1)`, angle taken from the last path segment.
- **When.** Migration, trade routes, invasions, wind/current flows — any directed connection between two map points.

**Example**
```ts
flowArrow(ctx, [-7, 52], [2, 41], proj, p, { color: "#e24b4a", bend: 0.3 });
```

---

## `geoMarker`

```ts
export function geoMarker(
  ctx: CanvasRenderingContext2D,
  ll: LonLat,
  proj: Projection,
  opts: { icon?: IconName; color?: string; label?: string; size?: number; alpha?: number } = {}
): void
```

Places an icon pin (and optional label) at a coordinate.

- **`ll`** — the marker coordinate (`LonLat`).
- **`opts.icon`** *(default `"pin"`)* — the `IconName` to draw (from the icons subsystem).
- **`opts.color`** *(default `"#e24b4a"`)* — icon color; drawn `filled: true`.
- **`opts.size`** *(default `16`)* — icon size in pixels. The icon is vertically offset up by `size/2` so the tip sits on the point.
- **`opts.alpha`** *(default `1`, clamped)* — opacity. If `<= 0` the whole call is a no-op (nothing drawn).
- **`opts.label`** — optional text drawn below the pin at `y + 14` with `fadeText`, font `"600 11px -apple-system, sans-serif"`, color `#eef5ef`, using the same `alpha`.
- **When.** Mark cities, events, or targets on the map; fade in with `alpha`.

**Example**
```ts
geoMarker(ctx, [37.6, 55.75], proj, { label: "Moscow", alpha: p });
```

---

## `featureCenter`

```ts
export function featureCenter(feature: GeoFeature): LonLat
```

Returns the bounding-box center (in lon/lat) of a feature's **outer ring** — a convenient camera-focus target once projected.

- **Returns** `[(minLon+maxLon)/2, (minLat+maxLat)/2]` over `feature.rings[0]`. If the feature has no outer ring or it is empty, returns `[0, 0]`.
- **When.** Get a region's center to project and feed to the camera subsystem for a region zoom.

**Example**
```ts
const [cx, cy] = proj.project(featureCenter(feature)); // view-space focus point
```

---

# Step 19 · The storyboard JSON interpreter — `src/render/storyboard.ts`

**Responsibility.** A declarative lesson format. Scenes and beats are plain data (JSON); the interpreter renders each beat with a primitive from earlier steps, gated by its own time window. This is the target format for LLM-generated lessons: **emit JSON, get a seekable, composed film.**

Every beat is time-gated by `p = phase(t, at, at + dur)`. A beat draws nothing before its `at` (guard: `if (t < beat.at) return;`).

## `Base` — fields shared by every beat

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `at` | `number` | required | — | Scene-relative start time (seconds) at which the beat begins. |
| `dur` | `number` | optional | `1` (per-beat; see notes) | Duration of the beat's animation window. Used as `phase(t, at, at + dur)`. Some beats use a different fallback (see below). |
| `layer` | `"bg" \| "mid" \| "fg" \| "annotation" \| "fx"` | optional | `defaultLayer(kind)` | Compositor layer the beat draws to. |

**`dur` fallbacks by beat** (when `dur` is omitted): most beats fall back to `1` (via `phase(t, at, at + (dur ?? 1))`). Exceptions: `counter` uses `dur ?? 2`; `callout` uses `dur ?? 1.5`. The `layer` selection uses `beat.dur ?? 1` only for the shared `p`; per-beat overrides above apply where noted.

## `defaultLayer(kind)` — layer each beat kind draws to when `layer` is omitted

| Beat kind(s) | Default layer |
|---|---|
| `particles` | `"fg"` |
| `text`, `math`, `callout`, `counter` | `"annotation"` |
| `ring` | `"fg"` |
| `rect` | `"bg"` |
| everything else (`bars`, `pie`, `line`, `icon`) | `"mid"` |

---

## The `Beat` discriminated union

Discriminated on `kind`. Every beat also has the `Base` fields above. Below, one table per kind; **Default** blank means required with no default.

### `kind: "text"`
Renders animated text. Mode chooses the primitive.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position. |
| `y` | `number` | required | — | Y position (baseline). |
| `text` | `string` | required | — | The text content. |
| `size` | `number` | optional | `22` | Font size in px; font is `700 {size}px -apple-system, sans-serif`. |
| `color` | `string` | optional | `"#eef5ef"` | Text color. |
| `align` | `CanvasTextAlign` | optional | `"center"` | Text alignment (only used in `plain` mode). |
| `mode` | `"plain" \| "word" \| "slam"` | optional | *plain* (falls through) | Animation style. |

- `mode === "word"` → `drawWordReveal(...)` with `{ start: beat.at, step: 0.12, mode: "rise" }` (words rise in, 0.12s stagger).
- `mode === "slam"` → `drawSlam(...)` anchored at `beat.at`.
- otherwise → `fadeText(ctx, text, x, y, p, font, color, align)` (fade in over `p`).

### `kind: "math"`
Renders a TeX expression via `drawMath`.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position. |
| `y` | `number` | required | — | Y position. |
| `tex` | `string` | required | — | TeX/LaTeX source. |
| `size` | `number` | optional | `30` | Font size passed to `drawMath`. |
| `color` | `string` | optional | *(drawMath default)* | Color; passed through as `beat.color` (undefined → drawMath's own default). |
| `align` | `"left" \| "center" \| "right"` | optional | `"center"` | Horizontal alignment. |

Calls `drawMath(ctx, tex, x, y, { size, color, align, p })` — reveal driven by `p`.

### `kind: "counter"`
An animated number rolling from `from` to `to`.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position (center-aligned). |
| `y` | `number` | required | — | Y position. |
| `from` | `number` | required | — | Start value. |
| `to` | `number` | required | — | End value. |
| `size` | `number` | optional | `40` | Font size; font `800 {size}px -apple-system, sans-serif`. |
| `color` | `string` | optional | `"#5cc8ae"` | Number color. |
| `fmt` | `NumberFormat` | optional | *(none)* | Number-format spec passed to `drawCounter`. |

Value = `counterValue(t, at, dur ?? 2, from, to)`; drawn with `drawCounter(..., { font, color, align: "center" }, fmt)`. Note the **2s** default duration.

### `kind: "bars"`
An animated bar chart.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Plot left. |
| `y` | `number` | required | — | Plot top. |
| `w` | `number` | required | — | Plot width. |
| `h` | `number` | required | — | Plot height. |
| `data` | `Datum[]` | required | — | Bar data (from charts). |
| `ymax` | `number` | required | — | Top of the y-domain (y-domain is `[0, ymax]`). |
| `color` | `string` | optional | *(chart default)* | Bar color. |

Calls `barChart(ctx, makePlot({x,y,w,h}, [0,1], [0,ymax]), data, { t, start: at, step: 0.18, color, showValues: true })`. Bars grow with a 0.18s stagger; values shown.

### `kind: "pie"`
An animated pie / donut chart.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Center X. |
| `y` | `number` | required | — | Center Y. |
| `r` | `number` | required | — | Radius. |
| `data` | `Datum[]` | required | — | Slice data. |
| `donut` | `number` | optional | *(none)* | Inner-radius ratio for a donut hole (passed as `donut`). |

Calls `pie(ctx, x, y, r, data, p, { donut, labels: true })` — sweeps in with `p`, labels on.

### `kind: "line"`
An animated line/area chart over an explicit domain.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Plot left. |
| `y` | `number` | required | — | Plot top. |
| `w` | `number` | required | — | Plot width. |
| `h` | `number` | required | — | Plot height. |
| `series` | `[number, number][]` | required | — | Data points as `[x, y]` pairs. |
| `xDomain` | `[number, number]` | required | — | X axis domain. |
| `yDomain` | `[number, number]` | required | — | Y axis domain. |
| `area` | `boolean` | optional | *(falsy)* | Fill under the line if true. |
| `color` | `string` | optional | *(chart default)* | Line color. |

Calls `lineChart(ctx, makePlot({x,y,w,h}, xDomain, yDomain), series, p, { area, color, markers: true })` — draws on with `p`, point markers on.

### `kind: "icon"`
A single icon.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position. |
| `y` | `number` | required | — | Y position. |
| `name` | `IconName` | required | — | Icon to draw. |
| `size` | `number` | optional | `28` | Icon size. |
| `color` | `string` | optional | *(icon default)* | Icon color. |
| `filled` | `boolean` | optional | *(icon default)* | Filled vs outline. |

Calls `drawIcon(ctx, name, x, y, size ?? 28, { color, filled, alpha: p })` — fades in via `p`.

### `kind: "callout"`
A leader-line annotation with label, pointing at a target.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Target X (leader points here). |
| `y` | `number` | required | — | Target Y. |
| `text` | `string` | required | — | Body text. |
| `title` | `string` | optional | *(none)* | Optional title line. |
| `side` | `Side` | optional | *(callout default)* | Which side the label sits on. |
| `route` | `LeaderRoute` | optional | *(callout default)* | Leader-line routing style. |
| `container` | `Container` | optional | *(callout default)* | Label container style. |

Uses `dur ?? 1.5`. Calls `callout(frame, { target: [x,y], text, title, side, route, container, leaderP: p, labelP: phase(t, at + Math.min(0.4, cd*0.3), at + cd) })`. The leader draws on first (`leaderP`), then the label fades in (`labelP` starts slightly after the beat).

### `kind: "particles"`
A particle emitter from a named preset.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Emitter X. |
| `y` | `number` | required | — | Emitter Y. |
| `preset` | `"fire" \| "smoke" \| "sparks" \| "energy" \| "confetti"` | required | — | Emitter preset (see PRESETS). |
| `seed` | `number` | optional | `1` | Passed as the emitter's `s` (size/seed) argument. |

Calls `emit(ctx, PRESETS[preset](x, y, seed ?? 1), t - at)` — the emitter plays with local time `t - at`.

### `kind: "ring"`
A focus ring — either converging rings or a pulsing highlight ring.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Center X. |
| `y` | `number` | required | — | Center Y. |
| `r` | `number` | required | — | Ring radius (used only when `converge` is falsy). |
| `color` | `string` | optional | *(focus default)* | Ring color. |
| `converge` | `boolean` | optional | *(falsy)* | If true, `focusRings(ctx, x, y, p, { color })` (rings converge inward); else `highlightRing(ctx, x, y, r, t, { color })` (pulsing ring). |

### `kind: "rect"`
A filled (optionally rounded) rectangle. Note: `color` is **required** here (unlike other beats).

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Left. |
| `y` | `number` | required | — | Top. |
| `w` | `number` | required | — | Width. |
| `h` | `number` | required | — | Height. |
| `color` | `string` | **required** | — | Fill color. |
| `radius` | `number` | optional | `0` | Corner radius (`ctx.roundRect`). |

Drawn with `globalAlpha *= p` so it fades in over the beat window.

**Unknown kinds.** If a beat's `kind` matches none of the above, the interpreter logs `console.warn('storyboard: unknown beat kind "…"')` and draws nothing (runtime diagnostic for malformed / LLM-emitted beats).

---

## `renderBeat` — beat → primitive mapping (summary)

`renderBeat(frame, beat, t)` computes `p = phase(t, beat.at, beat.at + (beat.dur ?? 1))`, returns early if `t < beat.at`, resolves the layer (`beat.layer ?? defaultLayer(kind)`), grabs `ctx = frame.layer.ctx(layerName)`, then switches on `kind`:

| Beat kind | Underlying function(s) | How `p` drives it |
|---|---|---|
| `text` | `drawWordReveal` / `drawSlam` / `fadeText` | word/slam use `t` & `at`; plain fades over `p`. |
| `math` | `drawMath` | passed `p` for reveal. |
| `counter` | `counterValue` + `drawCounter` | value interpolated by `counterValue(t, at, dur ?? 2, from, to)`. |
| `bars` | `makePlot` + `barChart` | animated by `t`/`start`/`step` (not `p`). |
| `pie` | `pie` | sweep driven by `p`. |
| `line` | `makePlot` + `lineChart` | draw-on driven by `p`. |
| `icon` | `drawIcon` | `alpha: p`. |
| `callout` | `callout` | `leaderP: p`, `labelP` a delayed phase. |
| `particles` | `PRESETS[preset]` + `emit` | local time `t - at`. |
| `ring` | `focusRings` (converge) / `highlightRing` | converge uses `p`; highlight uses `t`. |
| `rect` | `ctx.roundRect` + fill | `globalAlpha *= p`. |

## `PRESETS` — valid particle preset names

```ts
const PRESETS: Record<string, (x, y, s) => EmitterConfig> = {
  fire, smoke, sparks, energy,
  confetti: (x, y, s) => ({ ...confettiEmitter(x, y, s), rate: 22, loop: true }),
};
```

Valid `preset` values: **`"fire"`**, **`"smoke"`**, **`"sparks"`**, **`"energy"`**, **`"confetti"`**. Each maps to the matching emitter factory (`fireEmitter`, `smokeEmitter`, `sparksEmitter`, `energyEmitter`); `confetti` wraps `confettiEmitter` with `rate: 22, loop: true`.

---

## Scene & storyboard types

```ts
export interface StoryScene {
  duration: number;              // scene length (seconds)
  bg?: [string, string];         // linear gradient stops [top, bottom]; default ["#141c24", "#0f151b"]
  captions?: CaptionSegment[];   // caption track for the scene
  beats: Beat[];                 // the beats to render
}

export interface Storyboard extends ComposeOptions {
  scenes: StoryScene[];          // plus all ComposeOptions fields (transitions, etc.)
}
```

- **`StoryScene.duration`** — required; scene length in seconds.
- **`StoryScene.bg`** — optional gradient stops; default `["#141c24", "#0f151b"]` (dark top→bottom vertical gradient over the full 920×430 frame).
- **`StoryScene.captions`** — optional `CaptionSegment[]`.
- **`StoryScene.beats`** — the beats.
- **`Storyboard`** — a `StoryScene[]` plus every field of `ComposeOptions` (spread into the compose call; e.g. scene transitions).

---

## `storyboardScene`

```ts
export function storyboardScene(scene: StoryScene): CanvasSlideDefinition
```

Compiles one `StoryScene` into a `CanvasSlideDefinition`.

- Fixed frame: **`viewW = 920`, `viewH = 430`**.
- Carries over `scene.duration` and `scene.captions`.
- **Requires the layer model.** In `render`, if `frame` is absent it just `clearRect`s and returns (nothing drawn) — storyboards only work with the frame/layer compositor.
- Draws the background gradient on the `"bg"` layer (from `scene.bg`), then calls `renderBeat(frame, beat, t)` for every beat in order.

**Example**
```ts
const slide = storyboardScene({ duration: 6, beats: [{ kind: "text", at: 0, x: 460, y: 120, text: "Hello" }] });
```

## `storyboardFilm`

```ts
export function storyboardFilm(story: Storyboard): CanvasSlideDefinition
```

Compiles a whole storyboard into a single composed, seekable film.

- Destructures `{ scenes, ...opts }` from `story`.
- Maps each scene through `storyboardScene`, then `composeSlides(sceneSlides, opts)` — so every non-`scenes` field on the storyboard is forwarded to the composer as `ComposeOptions`.
- **When.** This is the top-level entry point for a JSON-authored lesson: build a `Storyboard` object and pass it here to get the final slide/film.

**Example**
```ts
const film = storyboardFilm({
  scenes: [scene1, scene2],
  // ...ComposeOptions (e.g. transition settings)
});
```
# The JSON authoring format (the LLM target)

This is the schema an LLM emits. It is interpreted by `src/render/storyboard.ts`. A whole lesson is a **`Storyboard`**: a list of **scenes**, each a list of **beats**. `storyboardFilm(storyboard)` compiles it into a seekable film; `storyboardScene(scene)` compiles a single scene.

```ts
storyboardFilm(story: Storyboard): CanvasSlideDefinition   // JSON → playable, seekable film
```

## Top-level shape

```ts
interface Storyboard extends ComposeOptions {
  scenes: StoryScene[];
}

interface StoryScene {
  duration: number;              // seconds this scene lasts (its local timeline is 0 … duration)
  bg?: [string, string];         // background vertical gradient [topColor, bottomColor]; default ["#141c24","#0f151b"]
  captions?: { at: number; text: string }[];  // optional subtitle cues (NOTE: the demo player currently hides these)
  beats: Beat[];                 // the timed drawing instructions
}
```

`ComposeOptions` (inherited by `Storyboard`, so you can set them at the top level alongside `scenes`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `crossfade` | number | `2.5` | Seconds consecutive scenes overlap. |
| `progressDots` | boolean | `true` | Draw one dot per scene along the bottom. |
| `filmGrade` | boolean | `false` | Apply a filmic vignette + grain + grade to the whole film. |
| `transition` | `"crossfade" \| "zoom-through" \| "whip-pan"` | `"crossfade"` | Scene-to-scene transition style. |
| `theme` | Theme | `TEXTBOOK` | Art-direction theme (see themes section). |

**Scene timing on the film timeline:** scene 0 starts at 0; each next scene starts `previousDuration − crossfade` later (scenes overlap by `crossfade`). Film length = `Σ durations − (n−1) × crossfade`.

## The beat: shared fields

Every beat has these (from `Base`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `kind` | string | — | **required.** Which beat type (table below). |
| `at` | number | — | **required.** Scene-local time (seconds) the beat starts. Before `at`, the beat draws nothing. |
| `dur` | number | `1` (varies by kind) | How long the beat's entrance animation takes. Progress is `p = phase(t, at, at + dur)`. |
| `layer` | `"bg"\|"mid"\|"fg"\|"annotation"\|"fx"` | per-kind (see below) | Which compositing layer to draw on. Usually omit and accept the default. |

**Default layer per kind** (`defaultLayer`): `particles → fg`; `ring → fg`; `text, math, callout, counter → annotation`; `rect → bg`; everything else (`bars, pie, line, icon`) → `mid`.

## Beat catalogue

Below, every beat `kind` with all its fields. `x, y` are in the 920×430 space. `p` denotes the beat's own `phase(t, at, at+dur)` progress.

### `text` — a text line (plain / word-by-word / slam)
```jsonc
{ "kind": "text", "at": 0.2, "dur": 1, "x": 460, "y": 80,
  "text": "PHOTOSYNTHESIS", "size": 22, "color": "#eef5ef",
  "align": "center", "mode": "slam" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `text` | string | — | The string to show. |
| `x,y` | number | — | Anchor position. |
| `size` | number | `22` | Font pixel size (weight is 700 bold). |
| `color` | string | `"#eef5ef"` | Text color. |
| `align` | `"left"\|"center"\|"right"\|"start"\|"end"` | `"center"` | Horizontal anchor (CanvasTextAlign). Applies to `plain` mode. |
| `mode` | `"plain"\|"word"\|"slam"` | `"plain"` | `plain` = fade in; `word` = reveal word-by-word rising in; `slam` = impact drop-in. |

### `math` — a typeset equation (LaTeX subset)
```jsonc
{ "kind": "math", "at": 1, "dur": 1.5, "x": 460, "y": 240,
  "tex": "6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2", "size": 30, "align": "center" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `tex` | string | — | LaTeX-subset string. Supports `\frac{}{}`, `\sqrt{}`, `^`, `_`, and a symbol dictionary (Greek, ∑ ∫ ∏ → ± ≤ …). See the math section for the full supported set. |
| `size` | number | `30` | Font size. |
| `color` | string | theme ink | Color. |
| `align` | `"left"\|"center"\|"right"` | `"center"` | Anchor. |
| — | | | The equation **writes on left→right** driven by `p`. |

### `counter` — an animated number
```jsonc
{ "kind": "counter", "at": 1, "dur": 2, "x": 460, "y": 200, "from": 0, "to": 24000000, "fmt": { "commas": true } }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `from`,`to` | number | — | Start and end values; counts `from`→`to` across `dur` (default dur here is `2`). |
| `size` | number | `40` | Font size (weight 800). |
| `color` | string | `"#5cc8ae"` | Color. |
| `fmt` | NumberFormat object | plain integer | Formatting **options object** (not a string). Fields: `decimals?: number`, `commas?: boolean`, `prefix?: string`, `suffix?: string`. Examples: thousands → `{ "commas": true }`; money → `{ "prefix": "$", "commas": true }`; percent → `{ "suffix": "%" }`; 1 decimal → `{ "decimals": 1 }`. See the kinetic-type section for exact fields. |

### `bars` — an animated bar chart
```jsonc
{ "kind": "bars", "at": 1, "x": 120, "y": 90, "w": 300, "h": 220,
  "data": [{ "label": "A", "value": 8, "color": "#5cc8ae" }], "ymax": 10, "color": "#5cc8ae" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y,w,h` | number | — | Plot rectangle (top-left + size). |
| `data` | `Datum[]` | — | `Datum = { label: string; value: number; color?: string }`. |
| `ymax` | number | — | Top of the value axis. |
| `color` | string | — | Default bar color (overridden per-datum). |
| — | | | Bars grow in, **staggered** (0.18s apart), with values shown. |

### `pie` — an animated pie / donut
```jsonc
{ "kind": "pie", "at": 2, "dur": 2, "x": 460, "y": 240, "r": 90,
  "data": [{ "label": "N2", "value": 78 }], "donut": 0.5 }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | Center. |
| `r` | number | — | Radius. |
| `data` | `Datum[]` | — | Slices. |
| `donut` | number | none | 0–1 inner-hole fraction; omit for a full pie. Labels are on. Wedges sweep in with `p`. |

### `line` — an animated line / area chart
```jsonc
{ "kind": "line", "at": 1, "dur": 2, "x": 120, "y": 60, "w": 320, "h": 220,
  "series": [[0,0],[1,1],[2,4],[3,9]], "xDomain": [0,3], "yDomain": [0,10], "area": true, "color": "#6db0e8" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y,w,h` | number | — | Plot rectangle. |
| `series` | `[number,number][]` | — | Data points `[x,y]`. |
| `xDomain`,`yDomain` | `[number,number]` | — | Axis ranges. |
| `area` | boolean | `false` | Fill under the line. |
| `color` | string | — | Line color. Markers are on; the line draws on with `p`. |

### `icon` — a vector glyph
```jsonc
{ "kind": "icon", "at": 0.5, "dur": 1, "x": 200, "y": 200, "name": "leaf", "size": 40, "color": "#38ef7d", "filled": true }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | IconName | — | One of the 30 icon names (see icons section for the full list). |
| `x,y` | number | — | Center. |
| `size` | number | `28` | Pixel size. |
| `color` | string | theme ink | Color. |
| `filled` | boolean | `false` | Fill vs stroke (only "fillable" icons fill; open glyphs always stroke). Fades in with `p`. |

### `callout` — a label that points at something
```jsonc
{ "kind": "callout", "at": 1, "dur": 1.5, "x": 300, "y": 180,
  "text": "chloroplast", "title": "Organelle", "side": "top", "route": "elbow", "container": "bubble" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | The **target** point the callout points at. |
| `text` | string | — | Body text (typewriter reveal). |
| `title` | string | none | Optional bold heading. |
| `side` | Side | auto | Placement relative to target (see callout section for values, e.g. `top/bottom/left/right/auto`). |
| `route` | `"straight"\|"elbow"\|"curve"` | — | Leader-line routing. |
| `container` | `"pill"\|"rect"\|"tag"\|"bubble"\|"badge"` | — | Note container style. |
| — | | | Leader draws on with `p`; label types on shortly after. |

### `particles` — a particle burst/stream (preset)
```jsonc
{ "kind": "particles", "at": 2, "x": 460, "y": 240, "preset": "confetti", "seed": 7 }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | Emitter origin. |
| `preset` | `"fire"\|"smoke"\|"sparks"\|"energy"\|"confetti"` | — | Which preset (only these 5 are exposed as beats). `confetti` loops. |
| `seed` | number | `1` | PRNG seed → deterministic but variable pattern. |
| — | | | Runs on local time `t − at` (so it starts when the beat starts). |

### `ring` — a highlight ring / converging focus
```jsonc
{ "kind": "ring", "at": 1, "x": 300, "y": 180, "r": 40, "color": "#e8a13c", "converge": false }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | Center. |
| `r` | number | — | Radius (used when `converge` is false). |
| `color` | string | — | Ring color. |
| `converge` | boolean | `false` | `true` = animated rings converging inward (attention grab); `false` = a steady highlight ring. |

### `rect` — a filled rectangle (panel / band / backdrop)
```jsonc
{ "kind": "rect", "at": 0, "dur": 0.5, "x": 0, "y": 0, "w": 920, "h": 60, "color": "#1b2733", "radius": 8 }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y,w,h` | number | — | Rectangle. |
| `color` | string | — | **required** fill color. |
| `radius` | number | `0` | Corner radius. Fades in with `p`. |

---

## How beats map to primitives (interpreter trace)

`renderBeat` gates each beat with `p = phase(t, at, at + (dur ?? 1))`, skips if `t < at`, picks the layer, then calls:

| kind | Underlying call (module) |
|---|---|
| `text` | `drawWordReveal` / `drawSlam` / `fadeText` (type-motion) |
| `math` | `drawMath(...,{ p })` (mathtext) |
| `counter` | `drawCounter(..., counterValue(t, at, dur ?? 2, from, to), fmt)` (type-motion) |
| `bars` | `barChart(makePlot(...,[0,1],[0,ymax]), data, { t, start:at, step:0.18, showValues })` (charts) |
| `pie` | `pie(x,y,r,data,p,{ donut, labels:true })` (charts) |
| `line` | `lineChart(makePlot(...,xDomain,yDomain), series, p, { area, markers:true })` (charts) |
| `icon` | `drawIcon(name,x,y,size,{ color, filled, alpha:p })` (icons) |
| `callout` | `callout(frame,{ target:[x,y], text, title, side, route, container, leaderP:p, labelP })` (callout) |
| `particles` | `emit(PRESETS[preset](x,y,seed), t − at)` (particles) |
| `ring` | `focusRings(...)` if `converge` else `highlightRing(...)` (focus) |
| `rect` | `roundRect` fill at `globalAlpha *= p` |

---

## Minimal complete example

```jsonc
{
  "transition": "crossfade",
  "filmGrade": true,
  "scenes": [
    {
      "duration": 6,
      "bg": ["#101820", "#0a0f14"],
      "beats": [
        { "kind": "text", "at": 0.3, "x": 460, "y": 70, "text": "THE WATER CYCLE", "mode": "slam", "size": 30 },
        { "kind": "icon", "at": 1.2, "x": 300, "y": 240, "name": "sun", "size": 60, "color": "#e8c14a" },
        { "kind": "icon", "at": 1.8, "x": 460, "y": 240, "name": "cloud", "size": 60, "color": "#9fb4c4", "filled": true },
        { "kind": "icon", "at": 2.4, "x": 620, "y": 240, "name": "drop", "size": 60, "color": "#6db0e8", "filled": true },
        { "kind": "callout", "at": 3.2, "dur": 1.6, "x": 460, "y": 240, "text": "evaporation → condensation → rain", "container": "bubble", "route": "elbow", "side": "bottom" }
      ]
    },
    {
      "duration": 5,
      "beats": [
        { "kind": "counter", "at": 0.4, "dur": 2, "x": 460, "y": 200, "from": 0, "to": 97, "fmt": "percent" },
        { "kind": "text", "at": 0.4, "x": 460, "y": 250, "text": "of Earth's water is in the oceans" }
      ]
    }
  ]
}
```

---

## What the JSON can and cannot do today (READ THIS)

The current `Beat` union exposes only a **subset** of the engine. An LLM emitting JSON can use exactly these effects:

- **Available now:** `text` (plain/word/slam), `math`, `counter`, `bars`, `pie`, `line`, `icon`, `callout`, `particles` (5 presets), `ring`, `rect`, plus scene `bg` gradient, `transition`, `filmGrade`, `theme`.

- **NOT expressible in JSON yet** (these exist as primitives but have no beat kind): draw-on **strokes** (step 04), the full **reveal** grammar (wipes/iris/dissolve/spotlight, step 05), most **focus/attention** tools (step 06, only `ring` is exposed), the engagement **build-steps/predict-reveal/punch/shake** (step 08), most **kinetic type** (only counter + text modes), the **camera** (step 11), the **timeline** (step 13), **morph** (step 14), the **geo/map** subsystem (step 16), and per-particle custom `EmitterConfig` (only 5 presets exposed).

If a lesson needs those, either (a) author it as hand-authored TypeScript (Path B), or (b) extend the `Beat` union — see the cookbook section for the recommended new beat kinds and exactly which primitive each should call.
# Authoring cookbook & schema-extension guide

## How to author a lesson (workflow)

1. **Break the topic into 4–7 scenes**, each one idea. Give each a `duration` (10–24s is typical; longer if narrated in depth).
2. **Pick a theme** for the whole film via top-level `theme` (TEXTBOOK for clean/clinical, BLUEPRINT for technical/graphs, CHALKBOARD for dark/space, PARCHMENT for history/maps).
3. **Lay beats on each scene's local timeline** (`at` in seconds, `0…duration`). Stagger them — don't start everything at `at: 0`. A title slams at ~0.3s, supporting elements enter over the next several seconds, a callout lands after the thing it labels exists.
4. **Let each beat's `dur`** control how long its entrance takes; after `at + dur` it holds.
5. **Choose a transition** (`crossfade` default; `zoom-through` for momentum; `whip-pan` for "meanwhile, elsewhere").
6. **Set `filmGrade: true`** for a cinematic finish.

## "I want to show X" → beat to use

| Goal | Beat / field |
|---|---|
| A title that lands hard | `text` `mode:"slam"` |
| Reveal a sentence word-by-word | `text` `mode:"word"` |
| A quiet label / paragraph | `text` `mode:"plain"` |
| An equation / formula / chemistry | `math` (LaTeX subset) |
| A number climbing (population, %, money) | `counter` + `fmt` |
| Compare categories | `bars` |
| Show proportions of a whole | `pie` (+ `donut`) |
| A trend / function / growth over a range | `line` (+ `area`) |
| A concept symbol (sun, leaf, atom, gear…) | `icon` |
| Point at a part and name it | `callout` (+ `container`, `route`, `side`) |
| Fire / smoke / sparks / energy / celebration | `particles` (5 presets) |
| Draw attention to a spot | `ring` (`converge:true` to grab, `false` to mark) |
| A panel, band, or colored backdrop | `rect` |
| Background mood | scene `bg: [top, bottom]` |

## Pacing tips for the model

- **One concept per scene.** If a scene has more than ~6 beats it's probably two scenes.
- **Give text room.** Don't stack two text beats on the same `y`.
- **Callouts come after their target.** Place the `icon`/shape first, then the `callout` pointing at its `x,y` a beat later.
- **Counters need `dur`.** A `counter` with `dur: 2` counts over two seconds; too short looks like a static number.
- **Keep within 920×430.** Leave ~40px margins.

---

## Extending the JSON schema (to reach the uncovered primitives)

The current `Beat` union covers the common cases. To expose the rest of the engine to the LLM, add new beat kinds to `Beat` in `src/render/storyboard.ts` and a matching `case` in `renderBeat`. Below is the **recommended mapping** — the beat shape to add and the exact primitive it should call. (This is guidance for extending the engine, and also documents what each effect *would* look like as JSON.)

| Proposed beat kind | Fields | Calls (module) | Notes |
|---|---|---|---|
| `stroke` | `points: [x,y][]`, `curve?`, `color?`, `width?`, `brush?` | `drawOn` (strokes) | A self-drawing line/shape; `p` drives the draw-on. |
| `wipe` / `iris` / `dissolve` | `x,y,w,h` or region, plus content | `wipe`/`iris`/`dissolve` (reveal) | Reveal grammar; these wrap *other* drawing, so they need a child-beat design or a "reveal region" model. |
| `spotlight` | `x,y,r` | `spotlight` (reveal) / `isolate` (focus) | Dim everything but a region. |
| `pointer` | `x,y`, `angle?`, `from?` | `pointerArrow` (focus) | An arrow that draws toward a point. |
| `build` | `items: Beat[][]`, `step` | `buildSteps` (sequence) | Progressive disclosure: current bright, prior dimmed. |
| `emphasis` | `at`, `kind:"punch"\|"shake"\|"flash"` wrapping a target | `withPunch`/`withShake`/`flashOverlay` (sequence) | Land a key moment. |
| `typewriter` / `scramble` / `textPath` | text + params | `drawTypewriter`/`drawScramble`/`drawTextAlongPath` (type-motion) | The kinetic-type modes not exposed by `text`. |
| `emitter` | full `EmitterConfig` | `emit` (particles) | Custom particles beyond the 5 presets (rain/snow/dust + all knobs). |
| `camera` | `x,y,zoom,rot`, `dur` | `frame.setCamera(lerpCamera(...))` (camera) | Pan/zoom/rotate the world; **scene-level**, not a normal beat — set once per scene and animate with `p`. |
| `timeline` | `range`, `eras[]`, `events[]` | `makeTimeline`+`eras`+`events`+`playhead` (timeline) | History date axis. |
| `morph` | `fromShape`, `toShape` | `drawMorph` (morph) | One shape flowing into another. |
| `map` | `features`, `styleFor`, projection | `fitProjection`+`drawMap`+`flowArrow`+`geoMarker`+`borderAt` (geo) | The whole geo subsystem; needs `GeoFeature` data in the beat. |

**Two design notes for whoever extends it:**

1. **Reveal/emphasis wrap other drawing.** `wipe`, `spotlight`, `withPunch`, etc. take a *draw callback*. To express them as flat beats you need either a "group" beat (a beat whose payload is a list of child beats it wraps) or a region-based model. The simplest first extension is the non-wrapping ones: `stroke`, `pointer`, `emitter`, `morph`, `camera`, `timeline`, `map`.
2. **Camera is per-scene, applied at composite.** It's set via `frame.setCamera(...)` and affects all non-`screenspace` layers. Model it as a scene-level field (e.g. `scene.camera: keyframes`) rather than a beat, or as a single beat evaluated before the others.

Each new `case` follows the same pattern as the existing ones: compute `p = phase(t, at, at+dur)`, get `ctx = frame.layer.ctx(layer)`, call the primitive with `p`. Keep it pure (no `Date.now`/`Math.random`).
