# Step 03 — Motion & FX Completion (scalable base)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Turn the cinematic base into a *system*, not a per-scene chore. Two levers, both reused by
every later step: (1) a composable **motion library** every primitive imports, and (2) **FX as a
property of layers + the theme**, applied automatically at composite time — so every scene, current
and future, inherits bloom / soft-shadow / film-grade / idle micro-motion **for free, with zero
per-scene edits**.

**The scalability reframe.** The obvious version of this step hand-applies `withGlow`/`radialGlow` to
each of the 7 photosynthesis scenes. That is the un-scalable seam: every new element and every new
scene would need the same manual glow calls forever. Instead we make polish *inherited*:

- **Glow / drop-shadow** become `LayerOptions` fields. `createFrame` seeds each layer's options from
  `theme.fx.layers`, and `finish()` renders them. Because Steps 01–02 already route all scenes through
  `bg/mid/fg/annotation`, they get the treatment automatically. New scenes do too.
- **Film grade** (vignette + grade + grain) moves onto the `fx` layer via `frame.grade()`, applied
  once to the whole composited film — a global pass, correctly, rather than per-scene.
- **Per-element helpers** (`withGlow`, `radialGlow`) stay available for special cases, but are no
  longer the mechanism for baseline polish.

**Architecture:** `src/render/motion.ts` (new) holds the pure motion math; `src/slides/anim.ts`
re-exports it so all existing `import { … } from "./anim"` keep working. `src/render/frame.ts` gains
layer-native `glow`/`shadow` in `finish()` plus a `grade()` method on the `fx` layer, and seeds layer
defaults from the theme. `src/render/theme.ts` gains `fx.layers` — the one knob that reskins a whole
film's cinematic feel. `src/slides/compose.ts` drops its inline `drawFilmGrade` and grades via a
film-level frame.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints

- Deterministic & seekable; motion helpers are pure functions of `t`/progress. Grain seeded by
  `floor(t·12)` so scrubbing stays exact.
- Backward compatible: existing films keep working. FX is additive and theme-gated (`strength`/`grain`/
  `vignette` of 0, or an omitted `fx.layers` role, = no treatment). Legacy scenes that draw straight to
  `ctx` (no layers) are unaffected — `finish()` is a no-op for them.
- Escape hatch: a scene that wants to opt **out** of an inherited layer treatment calls
  `frame.layer.clear(name)` before drawing (resets that layer's composite options to none).
- `npm run build` clean.
- **This project's standing overrides:** test files were removed — verify pure math by build + a scratch
  eval, and visuals in the browser. **Do not commit** — leave everything uncommitted for review.

## File structure

- **New** `src/render/motion.ts` — pure motion math (see Task 1).
- Modify `src/slides/anim.ts` — import `clamp01`/`lerp` from motion; re-export the whole motion surface.
- Modify `src/render/frame.ts` — `LayerOptions.glow`/`.shadow`; `finish()` applies them; `createFrame`
  seeds layer defaults from `theme.fx.layers`; add `frame.grade()` (fx-layer filmic pass).
- Modify `src/render/theme.ts` — `Theme.fx.layers?: Partial<Record<LayerName, LayerOptions>>` + per-preset
  defaults; import `prng` from `./motion` (drop the `../slides/anim` dependency).
- Modify `src/slides/compose.ts` — delete inline `drawFilmGrade`; grade via a film-level frame.
- Modify a couple of `photo*.ts` scenes — `breathe()` showcase only (not required for polish).

---

### Task 1: Motion library — `src/render/motion.ts`

**Interfaces — Produces (all pure, deterministic):**
`clamp01`, `lerp`, `cycle`, `smooth`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack`, `phase`, `prng`
(moved from `anim.ts`) plus new: `spring(p)`, `breathe(t, period, amount)`, `pulse(t, period)`,
`wobble(t, period, amount)`, `stagger(t, i, {start?, step, dur})`.

- [ ] **Step 1:** Create `motion.ts` with the helpers above. Key shapes:
  - `spring(p) = 1 - e^(-6p)·cos(4p)`, clamped — fast rise, damped settle, no overshoot past bounds.
  - `breathe(t, period, amount) = 1 + sin(2π·t/period)·amount` — mean 1, for idle "breath".
  - `pulse(t, period) = (1 - cos(2π·t/period))/2` — 0→1→0, for beats/attention.
  - `wobble(t, period, amount) = sin(2π·t/period)·amount` — mean 0, for sway/nudge.
  - `stagger(t, i, {start=0, step, dur}) = phase(t, start + i·step, start + i·step + dur)` — cascades.
- [ ] **Step 2:** In `anim.ts`, `import { clamp01, lerp } from "../render/motion"` (used by the drawing
  helpers) and `export { … } from "../render/motion"` for the whole surface. Keep the canvas-aware
  helpers (`fadeText`, `radialGlow`, `withGlow`, `withAlpha`, `drawSvg`, `makePath`) in `anim.ts`.
- [ ] **Step 3: Verify** — `npm run build` clean; a scratch eval of `spring(0)≈0`, `spring(1)≈1`,
  `breathe(0,4,.1)≈1`. **Leave uncommitted.**

---

### Task 2: Layer-native FX + `grade()` in `frame.ts`

**Interfaces — Produces:**
`LayerOptions.glow?: { strength, blur }` (self-colored bloom) and `.shadow?: { blur, color, dx?, dy? }`
(native drop shadow); `frame.grade(opts?: { vignette?, grain? })` (filmic pass on the `fx` layer).

- [ ] **Step 1:** Extend `LayerOptions` with `glow` and `shadow` (blur/offsets documented as view units,
  dpr-scaled at composite). Add `grade` to `FrameCtx` and the `createFrame` return type.
- [ ] **Step 2:** In `ensure(name)`, seed a new layer's opts from `theme.fx.layers?.[name] ?? {}` so any
  scene that routes to a layer inherits its treatment.
- [ ] **Step 3:** In `finish()`, per layer, let `dpr = xform.a`:
  - **Shadow:** before the primary `drawImage`, set `shadowBlur = blur·dpr`, `shadowColor`,
    `shadowOffset{X,Y} = {dx,dy}·dpr`. The transparent layer canvas casts the shadow from its shapes.
  - **Bloom:** after the primary pass, a second pass — `globalCompositeOperation="lighter"`,
    `globalAlpha *= alpha·strength`, `filter = blur(${blur·dpr}px)`, same geometry — draws a blurred
    additive copy of the layer over itself. Factor the center-scale/rotate/offset into a shared
    `applyGeometry()` helper used by both passes.
- [ ] **Step 4:** Add `grade({ vignette, grain })` — draws vignette + top-down grade + deterministic
  grain (`prng(floor(t·12)+1)`, 90 dots) into `layer.ctx("fx")` in view units. `finish()` composites
  `fx` last, so it lands on top. Import `prng` from `./motion`.
- [ ] **Step 5: Verify** — build clean; scratch eval renders a layer with glow+shadow and a `grade()`
  pass without throwing. **Leave uncommitted.**

---

### Task 3: Theme FX role defaults — `theme.ts`

**Interfaces — Produces:** `Theme.fx.layers?: Partial<Record<LayerName, LayerOptions>>`.

- [ ] **Step 1:** `import type { LayerName, LayerOptions } from "./frame"` (type-only; the theme↔frame
  cycle is types-only and erases at build). Add `layers` to the `fx` type.
- [ ] **Step 2:** Per-preset defaults expressing each medium's feel:
  - **TEXTBOOK:** `mid` soft drop shadow (depth), `fg` gentle bloom (energy/particles).
  - **PARCHMENT:** warm `mid` shadow (print depth), no bloom (paper doesn't glow).
  - **BLUEPRINT:** none — crisp technical lines, clarity over cinematics.
  - **CHALKBOARD:** strong `fg` + moderate `mid` bloom (chalk dust catching light).
- [ ] **Step 3: Verify** — build clean. **Leave uncommitted.**

---

### Task 4: Composer grades via a film-level frame — `compose.ts`

- [ ] **Step 1:** Delete the inline `drawFilmGrade` and its `prng` import.
- [ ] **Step 2:** Add `applyFilmGrade(ctx, viewW, viewH, t, theme)` → one `createFrame` bound to the main
  `ctx`, `film.grade({ vignette: theme.fx.vignette, grain: theme.fx.grain })`, `film.finish()`. Call it
  where `filmGrade` was applied in both the single-window and multi-window render paths (after the scene
  loop / progress dots). Keep `filmGrade` as the on/off switch; the *values* now come from the theme.
- [ ] **Step 3: Verify** — build clean; the photosynthesis film still shows vignette+grain; Coimbatore
  (composed without `filmGrade`) is unchanged. **Leave uncommitted.**

---

### Task 5: `breathe()` showcase + browser verification

- [ ] **Step 1:** Add a barely-there `breathe()` idle scale to one or two otherwise-static `drawSvg`
  heroes (e.g. `breathe(t, 7, 0.012)` on the chloroplast cutaway; `breathe(t, 8, 0.01)` on the leaf
  cell) by multiplying the drawn `w/h`. Not required for polish — bloom/shadow are already automatic —
  purely to prove nothing is perfectly frozen.
- [ ] **Step 2:** `npm run build` clean.
- [ ] **Step 3: Browser verify** — scrub all 7 photosynthesis scenes: confirm fg bloom (sun, electrons,
  CO₂ halos), mid drop-shadow depth (chloroplast/cell), and the framing vignette/grade. Confirm the
  Coimbatore card still renders with no regression and the console is clean. Screenshot.
- [ ] **Step 4:** **Leave everything uncommitted for review** (project standing constraint).

> **HMR note:** after editing `frame.ts`/`theme.ts`/`anim.ts`/`compose.ts` together, Vite HMR can land in
> a stale state that renders blank even though the code is correct. If the app goes blank, **restart the
> dev server** (a clean reload) before diagnosing — verify the films render standalone via a scratch
> eval first to rule out a real error.

---

## Self-review checklist

- Motion math is pure, composable, and the single source every later step imports. ✅
- FX is a layer/theme concern, inherited automatically — no per-scene glow calls for baseline polish. ✅
- Film grade is a global fx-layer pass, theme-driven; no behavioral regression to existing films. ✅
- Backward compatible: additive, theme-gated, legacy raw-`ctx` scenes unaffected. ✅

## What this unlocks

A uniformly cinematic base every future scene inherits with zero effort, a `theme.fx.layers` knob that
reskins the whole film's feel from one object, and a motion library (`spring`/`breathe`/`pulse`/
`wobble`/`stagger`) that Steps 04–19 (draw-on, reveals, kinetic type, particles, camera) build on.
