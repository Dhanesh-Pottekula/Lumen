# Step 04 — Draw-On / Stroke System (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Paths that **draw themselves** over time — the "teacher writing on the board" effect — as a
complete, composable vocabulary. Not just one `strokeOn`, but the full option surface the best
libraries expose (GSAP DrawSVG, Framer Motion, Rough.js, perfect-freehand, D3 curves, Manim, Motion
Canvas), so no capability is missing when a lesson needs it. Every option is optional and defaulted;
scenes pay only for what they use.

**The unifying insight.** Across every system surveyed, one primitive underlies everything: a
normalized **`[start, end]` window over a path's arc length**. Draw-on is `window(0, p)`; erase is
`window(p, 1)`; a passing-flash is a narrow sliding window; write is per-glyph border-then-fill with a
stagger. Build the window + a complete style surface once, and every "verb" is a thin, cheap wrapper.

**Architecture:** `src/render/strokes.ts` holds the geometry (arc-length window, curve interpolation),
the `StrokeStyle` surface, and the one renderer (`strokeWindow`). `src/render/strokeVerbs.ts` holds the
verbs, markers, followers, and orchestration — all wrappers over `strokeWindow`. Both reuse Step 03's
`motion.ts` (easings/`stagger`) and Step 02's `roughen` (hand-drawn), and draw onto a raw ctx or any
`FrameCtx` layer, so strokes inherit Step 03 layer bloom/shadow for free.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints

- Deterministic & seekable: window/progress derive from `t`; arc-length tables are recomputed purely;
  roughness uses a fixed seed per stroke (no per-frame crawl).
- Backward compatible; additive. `npm run build` clean.
- **Project overrides:** test files were removed — verify pure geometry with a scratch eval + the
  browser demo (not vitest). **Leave everything uncommitted** for review.

## File structure

- **New** `src/render/strokes.ts` — geometry core + `StrokeStyle` + `strokeWindow`/`strokeOn`.
- **New** `src/render/strokeVerbs.ts` — verbs, markers/followers, orchestration.
- **New** `src/slides/strokesDemo.ts` + a card in `App.tsx` — capability demo / living verification.

---

## The complete option surface (what "full capacity" means)

### Geometry & path construction (`strokes.ts`)
`arcTable` (cumulative length) · `windowPolyline(points, start, end)` (the core primitive) ·
`partialPolyline(points, p)` · `pointAt(points, p)` → `{x, y, angle}` (point + tangent, for
tracers/markers/followers) · `smoothPath(points, {curve, tension, alpha, closed, samples})` with
curve kinds **linear · cardinal · catmullRom · basis · natural · step · stepBefore · stepAfter**
(tension for cardinal, alpha for catmull-rom — 0.5 centripetal default, samples per segment).

### `StrokeStyle` (appearance)
- **Line:** `color` (string/gradient/pattern) · `width` · `cap` (butt/round/square) · `join`
  (miter/round/bevel) · `miterLimit`.
- **Dashes:** `dash[]` · `dashOffset` (animate for marching-ants).
- **Compositing:** `alpha` · `blend` (globalCompositeOperation) · `shadow {blur,color,dx,dy}`.
- **Hand-drawn:** `roughness` (+ `seed`) via `roughen`.
- **Variable width / brush:** `taperStart` · `taperEnd` · `widthProfile(t)→mult` · `minWidth` — any of
  these switches the renderer to outline-fill "brush" mode (normal-offset polygon).
- **Themed defaults:** unset `color`/`width`/`roughness` fall back to `theme.palette.ink` /
  `theme.lineStyle`.

### Verbs (`strokeVerbs.ts`, all built on the window)
`drawOn(p, {from: start|end|center|both})` · `erase(p)` · `passingFlash(p, {width, thinning})` (comet)
· `drawBorderThenFill(p, {fill, fillRule, split})` · `tracedPath(mover, t, {step, dissipate})` ·
`circumscribe(box, p, {shape, buff})`.

### Markers & followers
`arrowhead(at, {size,color,alpha})` (tangent-oriented, revealed on arrival) · `dot` · `tracerDot`
(pen tip at the draw head) · `handFollower` (image at head, for whiteboard style) · `pathLength`.

### Orchestration
`strokeSequence(paths, t, {start, step, dur, from, style})` — staggered multi-path cascade via
`motion.stagger` (step 0 = all at once, large = strictly sequential).

### Timing & determinism
Progress is any easing of `t` (reuses `motion.ts`); geometry-independent because it's arc-length
normalized; tables cached per call; seeds fixed → frame-exact on any seek.

---

### Task 1: Geometry core — `strokes.ts`

- [ ] Implement `arcTable`, `windowPolyline` (interpolated cuts at both ends), `partialPolyline`
  (= `window(0,p)`), `pointAt` (point + tangent), and `smoothPath` with all curve kinds above
  (centripetal Catmull-Rom via Barry-Goldman with ε-guards for coincident points; natural spline via
  the Thomas algorithm per axis).
- [ ] **Verify:** scratch eval — `windowPolyline(L,0,0.5)` on `[[0,0],[10,0],[10,10]]` → `[[0,0],[10,0]]`;
  `pointAt` returns a sane tangent; each curve returns a denser polyline. Build clean.

### Task 2: `StrokeStyle` + renderer — `strokes.ts`

- [ ] Implement the full `StrokeStyle` interface, `resolve()` (theme defaults), `strokeWindow`
  (dash/roughness/blend/shadow + variable-width `fillOutline` mode), and `strokeOn`.
- [ ] **Verify:** scratch eval strokes a window without throwing under a dpr-scaled transform; build clean.

### Task 3: Verbs, markers, orchestration — `strokeVerbs.ts`

- [ ] Implement `drawOn`/`erase`/`passingFlash`/`drawBorderThenFill`/`tracedPath`/`circumscribe`,
  `arrowhead`/`dot`/`tracerDot`/`handFollower`/`pathLength`, and `strokeSequence`.
- [ ] **Verify:** build clean.

### Task 4: Demo scene + card + browser verify

- [ ] `src/slides/strokesDemo.ts` — one seekable scene exercising draw-on+arrowhead+tracer, a
  Catmull-Rom curve, a tapered brush, a passing-flash comet, border-then-fill, a dissipating traced
  path, circumscribe, and a staggered ray sequence. Add a card to `App.tsx`.
- [ ] **Browser verify:** scrub the demo; confirm each verb; confirm the other two films don't regress.
  Screenshot. **Leave uncommitted.**

> **Latent-bug fix folded in here (important):** the player's first `draw(0)` can run before the canvas
> is laid out (`clientWidth/Height === 0`), producing a 0×0 layer canvas and an `InvalidStateError` from
> `finish()`'s `drawImage`. This is a pre-existing race (it was the real cause of the intermittent
> "blank card" seen in Step 03, not HMR). Fix with two guards: bail out of `CanvasSlide.draw` when the
> canvas has no size (the `ResizeObserver` redraws once it does), and skip compositing in
> `frame.finish()` when the target canvas area is 0.

---

## Self-review checklist

- One primitive (`windowPolyline`), every verb a thin wrapper. ✅
- Full option surface present and defaulted; hand-drawn + variable-width both supported. ✅
- Deterministic/seekable; arc-length normalized; seeds fixed. ✅
- Strokes compose with Step 03 layer FX (bloom/shadow) and Step 02 themes. ✅
- 0-size-canvas race guarded. ✅

## Post-review refinements (folded in)

- `arcTable` memoised by array identity (WeakMap) — static paths cost O(1)/frame instead of O(n) on
  every `windowPolyline`/`pointAt`/`fillOutline` call.
- Variable-width brush gets **round end-caps** (`cap:"round"`, default) via a disc at each non-tapered
  end; tapered-to-a-point ends skip it automatically.
- `basis` spline doubles its endpoints (no end kink) instead of forcing a final point.
- `passingFlash({ glow: true })` composites the sliver additively (`lighter`) for a light-sweep.
- Doc note: `dash` is stroke-only (ignored in brush mode, where `cap` selects round vs. flat ends).

## What this unlocks

Self-drawing diagrams, arrows, geometry, and (with Step 17) equations. Direct dependency of callouts
(07, leader lines), plots/charts (12, axes + curves plotting on), maps (16, routes/borders drawing on),
and math (17). The stroke vocabulary is the engine's core "construction" verb set.
