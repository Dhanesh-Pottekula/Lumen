# GCL Phase 3 — Motion + Camera

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add cinematic motion — a scene-level camera (pan/zoom/rotate to anchors, over time) and per-component object motion (move/fall/orbit/along/spin/trace/morph) plus idle oscillation — reaching design-spec Family B, all deterministic/seekable.

**Architecture:** Camera is resolved once per scene into a pure `cameraAt(t): Camera` from `{type:"camera"}` directives and applied via `frame.setCamera` (recomputed each frame; latest-started move wins; neutral outside windows). Per-component motion computes a pure `motionTransform(spec, box, t) → { dx, dy, rot, scale }` applied to the layer around the component's placement before its content (and enter/exit) paints; `oscillate` adds an idle offset; `morph` is content-level for shape components; `trace` also draws a trail via `tracerDot`/`tracedPath`.

**Tech Stack:** TS, Canvas 2D; vitest for pure motion/camera math; browser preview for render.

## Global Constraints
- DO NOT COMMIT. Deterministic/seekable: no `Date.now`/`Math.random`/`performance.now`/`new Date()`. camera + motion are pure functions of t. REUSE-ONLY: only add/modify under `src/render/gcl/`; temp App.tsx removed (zero diff). View 920×430.
- Exact signatures: `.superpowers/sdd/p3-signatures.md` (Camera model, focusOn/move/pushIn/lerpCamera/centerCamera; makePath.at takes ARC-LENGTH not fraction → use `path.at(p*path.length)`; morph/drawMorph; tracerDot/tracedPath). Build on existing gcl P0–P2 code.
- Motion composes with enter/exit: apply the motion transform to the layer, THEN run `applyEnterExit(...)` inside it. Oscillation adds to the motion offset.

---

### Task 1: Schema — camera directive + motion/oscillate props

**Files:** Modify `src/render/gcl/schema.ts`

- [ ] **Step 1:** Add the camera directive to the `Component`/`Item` stream and motion props to `Base`.
```ts
// camera directive (a component-position item in the flat stream)
| (Base & { type: "camera"; to?: Position; zoom?: number; rot?: number; kind?: "move" | "pushIn" })
```
Add to `Base`:
```ts
motion?: MotionSpec;
oscillate?: OscillateSpec;
```
```ts
export type MotionSpec =
  | { kind: "move"; to: Position; from?: Position; at?: number; cue?: number; start?: "with"|"after"|number; dur?: number }
  | { kind: "fall"; to?: Position; from?: Position; gravity?: number; at?: number; dur?: number; bounce?: number }
  | { kind: "orbit"; center: Position; radius?: number; rx?: number; ry?: number; from?: number; turns?: number; at?: number; dur?: number }
  | { kind: "along"; path: Vec2[]; loop?: boolean; at?: number; dur?: number }
  | { kind: "spin"; omega?: number; at?: number; dur?: number }
  | { kind: "trace"; path: Vec2[]; color?: string; dissipate?: number; at?: number; dur?: number }
  | { kind: "morph"; toShape: "circle"|"polygon"|"star"|"heart"; sides?: number; at?: number; dur?: number };
export interface OscillateSpec { axis?: "x"|"y"|"rot"|"scale"; amp: number; period: number; mode?: "breathe"|"wobble"|"pulse" }
```
- [ ] **Step 2:** `npx tsc --noEmit` → 0.

---

### Task 2: Camera resolver (`camera.ts` in gcl) — pure, tested

**Files:** Create `src/render/gcl/camera.ts` + `camera.test.ts`

**Interfaces produced:**
```ts
import type { Camera } from "../camera";
export interface CamDirective { at: number; dur: number; focal: [number, number]; zoom: number; rot: number; kind: "move"|"pushIn" }
// Resolve the camera at time t from a list of directives (already timed + anchor-resolved to focal points).
export function cameraAt(directives: CamDirective[], t: number, viewW: number, viewH: number): Camera;
```
Algorithm (pure): start from neutral `centerCamera(viewW,viewH)`. Walk directives in `at` order; the "current target" after directive i is `focusOn(focal.x, focal.y, zoom, rot)`. For the directive whose window `[at, at+dur]` contains t (or the latest one that has started), interpolate from the PREVIOUS target to this target via `move(prevCam, thisCam, t, at, dur)` (or `pushIn` when kind==="pushIn"). Before the first directive starts → neutral. After a directive completes and before the next starts → hold that directive's target. If the result `isNeutral`, return neutral. Deterministic.

- [ ] **Step 1: Failing tests** — no directives → neutral; one directive `{at:0,dur:2,focal:[300,200],zoom:2}` at t=2 → camera x≈300,y≈200,zoom≈2; at t=0 → neutral (start of move); two sequential directives → at end holds the second's target; camera at t before first directive → neutral.
- [ ] **Step 2: fail. Step 3: implement (import Camera, centerCamera, focusOn, move, pushIn, lerpCamera, isNeutral from ../camera). Step 4: pass; tsc 0.**

---

### Task 3: Motion transform (`motion.ts` in gcl) — pure, tested

**Files:** Create `src/render/gcl/motion.ts` + `motion.test.ts`

**Interfaces produced:**
```ts
import type { Box } from "./anchors";
export interface MotionTransform { dx: number; dy: number; rot: number; scale: number; trail?: [number, number][] }
// box = the component's resting placement; resolveFocal maps a Position→point (caller binds it to the layout boxes)
export function motionTransform(spec: MotionSpec | undefined, box: Box, t: number, resolveFocal: (pos: unknown) => [number, number]): MotionTransform;
export function oscillateOffset(osc: OscillateSpec | undefined, t: number): { dx: number; dy: number; rot: number; scale: number };
```
Rules (τ = time since motion start; p = phase over [at,at+dur] where windowed):
- move: current pos = lerp(from||boxCenter, to, easeInOutCubic(p)); dx/dy = pos − boxCenter.
- fall: parabolic — `y = y0 + 0.5*g*τ²` (g default 900 px/s²) from `from` toward `to`; x lerps; optional bounce.
- orbit: angle = from + turns*2π*p (or ω*τ); pos = center + (rx||radius)cosθ, (ry||radius)sinθ; dx/dy from boxCenter.
- along: pos = makePath(path).at(p * length); dx/dy from boxCenter.
- spin: rot = (omega ?? 2π) * τ (continuous if no dur; else over window).
- trace: pos like along; ALSO emit `trail` = sampled points 0..p along path (caller draws via tracerDot/tracedPath).
- morph: no transform (content-level; handled in the shape painter) → returns identity.
- oscillate: breathe/wobble/pulse on the chosen axis (x/y → dx/dy; rot; scale) — additive.

- [ ] **Step 1: Failing tests** — move to [300,y] over [0,1] at p=1 lands dx so boxCenter+dx=300; fall increases dy with τ² (dy at t=1 == 4× dy at t=0.5 for constant g from rest); orbit at p=0 vs p=0.25 differ by ~90°; spin rot grows linearly; along at p=0 → path start, p=1 → path end; oscillate wobble axis x is 0 at t=0 (sin) and periodic; morph → identity.
- [ ] **Step 2–4: TDD to green; tsc 0.**

---

### Task 4: Wire camera + motion into compile.ts

**Files:** Modify `src/render/gcl/compile.ts`

- [ ] **Step 1: Camera.** Parse `{type:"camera"}` items out of the component list (they are directives, not drawn). Time them with the same `resolveTiming`/narration cue logic. After layout is computed (so anchors resolve), build `CamDirective[]` (resolve each `to` via the layout box/slot/coords → focal point) and, in `render`, call `frame.setCamera(cameraAt(directives, t, W, H))`. Camera directives are excluded from the draw loop and from layout auto-flow.
- [ ] **Step 2: Motion.** In the per-component draw loop, compute `mt = motionTransform(c.motion, box, t, resolveFocal)` and `osc = oscillateOffset(c.oscillate, t)`. Wrap the existing `applyEnterExit(...)` call in a transform: `layer.save(); layer.translate(mt.dx+osc.dx, mt.dy+osc.dy); ` then rotate/scale about the box center by `mt.rot+osc.rot` / `mt.scale*(1+osc.scale)`; call applyEnterExit; `layer.restore()`. If `mt.trail`, draw it via `tracerDot(layer, mt.trail, 1, {color})` (or the trail as a polyline).
- [ ] **Step 3: morph.** For a `shape` component with `motion.kind==="morph"`, in its painter draw `drawMorph(layer, shapeAPts, shapeBPts, p, {...})` where A = the shape's own points, B = the target shape (toShape/sides) at the same center/r, p = phase over the motion window.
- [ ] **Step 4:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.
- [ ] **Step 5 (browser verify):** temp App scenes: (a) a camera scene that pushes in on an id then pans to a slot; (b) a motion scene with an icon falling (fall), a shape orbiting (orbit), a dot moving along a path with trace trail, a spinning polygon, an oscillating (breathe) stat, and a circle morphing to a star. Seek across timelines; confirm each moves correctly, camera pans/zooms, deterministic on re-seek, no console errors; screenshots. REMOVE temp cards (App.tsx zero diff).

---

## Self-Review
- Family B: move/fall/orbit/along/spin/trace/morph → MotionSpec (Task 1) + motionTransform (Task 3) + wiring (Task 4). camera (focusOn/move/pushIn/lerpCamera) → Task 2 + Task 4. oscillate idle → Task 3. ✅
- Determinism: camera + motion pure fns of t; recomputed per frame; makePath uses arc-length correctly. ✅
- Composition with enter/exit: motion transform wraps applyEnterExit. ✅
- Reuse-only: all under gcl/; reuses ../camera, ../morph, ../strokeVerbs, ../../slides/anim. ✅
- Risk: motion+camera+enter/exit+oscillate stacking transforms — verify visually that combined transforms don't fight (motion outer, enter/exit inner). Noted for browser verify.
