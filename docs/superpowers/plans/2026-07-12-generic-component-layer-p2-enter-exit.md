# GCL Phase 2 — enter / exit vocabulary + reveal + pen follower

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Give every component a full entrance and (optional) exit from one vocabulary — fade, draw, wipe, iris, radialWipe, blinds, checkerboard, dissolve, clip, slam, word, typewriter, scramble, build, borderThenFill (enter) and fade, erase, wipe, iris, dissolve, slide, shrink (exit) — plus a pen/nib that rides a draw-on stroke. Reaches design-spec Family C + the `enter`/`exit` universal props.

**Architecture:** Entrances/exits compose AROUND each component's content draw. Three mechanisms: (1) **native** — the content primitive animates itself via its own progress (text slam/word/typewriter/scramble; draw-on via `strokeOn`/`drawOn`/chart-stagger); (2) **masked** — wrap the finished content in `reveal.ts`'s `masked(ctx,W,H,drawContent,drawMask)` where a pure per-component mask (a growing rect/circle/slats/cells/sector/polygon confined to the component's box, in ABSOLUTE view coords) gates visibility (works for wipe/iris/radialWipe/blinds/checkerboard/dissolve/clip, forward for enter and inverted for exit); (3) **transform** — slide/shrink via ctx translate/scale, and fade via alpha. A new `mask.ts` holds the pure mask geometry; a new `enterexit.ts` orchestrates; `compile.ts`'s per-component draw is refactored into a `paintContent` callback the orchestrator wraps.

**Tech Stack:** TypeScript, Canvas 2D; vitest for pure mask geometry + timing; browser preview for render.

## Global Constraints
- DO NOT COMMIT. Deterministic/seekable: no `Date.now`/`Math.random`/`performance.now`/`new Date()`; dissolve/checkerboard randomness via seeded `prng` only. Mask geometry is a pure function of (box, p, opts).
- REUSE-ONLY: only add/modify files under `src/render/gcl/`. Temp App.tsx verify card must be removed (zero diff).
- View 920×430. Exact primitive signatures: `.superpowers/sdd/p2-signatures.md` (reveal `masked`/verbs take `draw:(c)=>void`; strokeVerbs draw directly on `Pt[]`; `erase` = draw-on with `1-p`; `handFollower` needs an image). Also `.superpowers/sdd/p1-signatures.md`.
- Build on the existing gcl P1 code (schema/measure/layout/timing/compile/expr/index). Match its style.

---

### Task 1: Schema — enter/exit vocabulary

**Files:** Modify `src/render/gcl/schema.ts`

- [ ] **Step 1:** Replace the P0 `EnterSpec` with the full vocab and add `ExitSpec`; extend `Base` with `exit`.
```ts
export type EnterKind = "none" | "fade" | "draw" | "wipe" | "iris" | "radialWipe"
  | "blinds" | "checkerboard" | "dissolve" | "clip" | "slam" | "word" | "typewriter"
  | "scramble" | "build" | "borderThenFill";
export interface EnterSpec {
  type: EnterKind;
  dur?: number;
  dir?: "left" | "right" | "up" | "down";      // wipe/blinds
  shape?: "circle" | "ellipse" | "rect" | "diamond"; // iris
  count?: number;                               // blinds slats
  seed?: number;                                // dissolve/checkerboard
  points?: Vec2[];                              // clip polygon (absolute coords)
  pen?: boolean;                                // draw: ride a pen nib along the stroke
}
export type ExitKind = "none" | "fade" | "erase" | "wipe" | "iris" | "dissolve" | "slide" | "shrink";
export interface ExitSpec {
  type: ExitKind;
  out?: number;    // absolute start of the exit (seconds); default = scene end - dur
  until?: number;  // alt: exit finishes at this time
  dur?: number;    // default 0.6
  dir?: "left" | "right" | "up" | "down"; // wipe/slide direction
}
```
In `Base`, keep `enter?: EnterSpec` (type changes) and add `exit?: ExitSpec`.

- [ ] **Step 2:** `npx tsc --noEmit` → 0 (compile.ts may now have type errors where it read `enter?.type === "none"`; that's fine, Task 4 handles it — but if tsc fails, keep the `"none"` member so existing code still typechecks; it does).

---

### Task 2: Mask geometry (`mask.ts`) — pure, tested

**Files:** Create `src/render/gcl/mask.ts` + `mask.test.ts`

**Interfaces produced:**
```ts
import type { Box } from "./anchors";
export type MaskKind = "wipe" | "iris" | "radialWipe" | "blinds" | "checkerboard" | "dissolve" | "clip";
export interface MaskOpts { dir?: "left"|"right"|"up"|"down"; count?: number; seed?: number; points?: [number,number][]; shape?: "circle"|"ellipse"|"rect"|"diamond" }
// Returns the list of filled rectangles (absolute view coords) that make up the revealed region at progress p.
// For iris/radialWipe/clip, returns [] and callers use paintMask's path branch instead (see below).
export function maskRects(kind: MaskKind, box: Box, p: number, opts?: MaskOpts): [number, number, number, number][];
// Paints the revealed region for `kind` as solid white onto c (the mask buffer). Pure given inputs.
export function paintMask(c: CanvasRenderingContext2D, kind: MaskKind, box: Box, p: number, opts?: MaskOpts): void;
```
Geometry rules (p clamped 0..1; all absolute coords using box.x/y/w/h):
- **wipe**: one rect growing from `dir` edge (default "left"): left → `[box.x, box.y, box.w*p, box.h]`; right → `[box.x+box.w*(1-p), box.y, box.w*p, box.h]`; up/down analogous on height.
- **blinds**: `count ?? 6` slats across the box (horizontal by default); each slat rect `[box.x, box.y+i*sh, box.w, sh*p]` where `sh = box.h/count`.
- **checkerboard**: `rows=4, cols=6` cells; reveal cell k when `k/(rows*cols) < p` in row-major order; each revealed cell a full-size cell rect.
- **dissolve**: cells like checkerboard but reveal order shuffled by seeded `prng(seed ?? 1)` (compute a stable permutation once); reveal `floor(p*total)` cells.
- **iris**: returns `[]` from maskRects; paintMask fills a circle (or ellipse/rect/diamond per shape) centered at box center with radius `p * hypot(box.w,box.h)/2`.
- **radialWipe**: returns `[]`; paintMask fills a pie sector from `-π/2` sweeping `2π*p` around box center, radius covering the box.
- **clip**: returns `[]`; paintMask fills the `points` polygon (static; the caller animates by fading — for P2, reveal the polygon scaled by p about its centroid).

- [ ] **Step 1: Failing tests** (maskRects only — pure): wipe-left at p=0.5 → one rect of width box.w/2 at box.x; wipe-right at p=0.5 → rect starting at box.x+box.w/2; blinds count=4 → 4 rects each full width, height = box.h/4 * p; checkerboard p=0 → 0 rects, p=1 → 24 rects; dissolve is deterministic (same seed → identical rect set two calls); iris/radialWipe/clip → maskRects returns [].
- [ ] **Step 2: Run → fail. Step 3: Implement mask.ts. Step 4: Run → pass; tsc → 0.**

---

### Task 3: Exit timing helper (`timing.ts`)

**Files:** Modify `src/render/gcl/timing.ts` + `timing.test.ts`

**Interfaces produced:** `resolveExit(exit: ExitSpec | undefined, sceneDuration: number): { out: number; dur: number } | null` — `null` if no exit. `dur = exit.dur ?? 0.6`. `out = exit.out ?? (exit.until != null ? exit.until - dur : sceneDuration - dur)`. Clamp `out >= 0`.

- [ ] **Step 1: Failing tests**: no exit → null; `{type:"fade"}` with sceneDuration 10 → `{out:9.4,dur:0.6}`; `{type:"fade",out:3}` → out 3; `{type:"fade",until:5,dur:1}` → out 4.
- [ ] **Step 2–4: TDD to green.**

---

### Task 4: enter/exit orchestrator (`enterexit.ts`) + compile refactor

**Files:** Create `src/render/gcl/enterexit.ts`; modify `src/render/gcl/compile.ts`

**Interfaces produced (`enterexit.ts`):**
```ts
export interface EEContext { t: number; at: number; enterDur: number; exit: { out: number; dur: number } | null; box: Box; W: number; H: number }
// paintContent draws the component's finished content in absolute coords onto the given ctx.
export function applyEnterExit(layer: CanvasRenderingContext2D, enter: EnterSpec | undefined, ctx: EEContext, paintContent: (c: CanvasRenderingContext2D) => void, opts?: { native?: (c: CanvasRenderingContext2D, enterP: number) => void }): void;
export function isNativeEnter(kind: EnterKind | undefined): boolean; // slam/word/typewriter/scramble/draw/build/borderThenFill/none
```
Behavior:
- `enterP = phase(t, at, at+enterDur)`; `exitP = exit ? phase(t, exit.out, exit.out+exit.dur) : 0`.
- **native** entrances (`isNativeEnter`): call `opts.native(layer, enterP)` — the content animates itself (compile passes a native painter that threads enterP into drawSlam/strokeOn/etc.). No masking.
- **fade / none**: `withAlpha(layer, (enter?.type==="none"?1:enterP) * (1-exitP), () => paintContent(layer))`.
- **masked** entrances (wipe/iris/radialWipe/blinds/checkerboard/dissolve/clip): `masked(layer, W, H, (c)=>paintContent(c), (c)=>paintMask(c, kind, box, enterP, opts))`. If an exit of masked kind is active, drive a SECOND masked pass with the exit mask at `1-exitP` (conceal) — or simpler: multiply by exit fade. For P2, when BOTH enter-mask and exit run, apply enter mask for the enter window and, once `t >= exit.out`, switch to the exit treatment. Keep it readable: compute effective by phase windows (enter fully done before exit starts in practice).
- **exit** treatments (independent of enter, applied when `exit` set and `t >= exit.out - 0.001`):
  - fade → alpha `1-exitP` (covered by the alpha multiply above).
  - erase → handled natively in compile for stroke content; general fallback = fade.
  - wipe/iris/dissolve → `masked(...)` with the exit mask at `(1-exitP)` (region shrinks).
  - slide → `layer.translate` by `exitP * offscreen` in `dir`.
  - shrink → `layer.scale(1-exitP)` about box center.

**compile.ts refactor:**
- Extract the current per-component switch into `paintContent(c2, component, rc)` (draws finished content; for native-animatable types it accepts a `p` — see below).
- In the loop: compute `enterDur = c.enter?.dur ?? c dur`, `exitInfo = resolveExit(c.exit, duration)`. Call `applyEnterExit(layer, c.enter, {t,at,enterDur,exit:exitInfo,box,W,H}, (c2)=>paintFinal(c2,component,rc), { native:(c2,enterP)=>paintNative(c2,component,rc,enterP) })`.
- `paintNative` routes enterP into the content's own animation: text→slam/word/typewriter/scramble by `enter.type` (or the component's `mode`); equation→drawMath p=enterP; chart/shape/parametric/textPath→their p=enterP; stat→counter over enterDur; `borderThenFill`→`drawBorderThenFill`; `build`→ (single component: just enterP; the multi-item build belongs to `group`, P5).
- `paintFinal` draws the content at p=1 (finished) for masked/fade wrappers.
- `enter:"draw"` with `pen:true`: after the native draw-on, draw a pen NIB — a small filled triangle at `pointAt(pathPoints, enterP)` (no external image needed; use strokes.pointAt). Only meaningful for stroke/path/shape/parametric content that exposes a points array; for others ignore pen.

- [ ] **Step 1:** Implement enterexit.ts. **Step 2:** Refactor compile.ts. **Step 3:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass (existing tests green; add none here unless a pure helper needs it).
- [ ] **Step 4 (browser verify):** temp App scene with several components each using a different enter (iris, wipe, dissolve, draw+pen, slam) and a couple with exits (fade, shrink, wipe). Seek across the whole timeline; confirm each enters and exits correctly, no console errors, deterministic on re-seek; screenshot. REMOVE temp card (App.tsx zero diff).

---

## Self-Review
- Family C enter vocab (draw/wipe/iris/radialWipe/blinds/checkerboard/dissolve/clip/slam/word/typewriter/scramble/fade/build/borderThenFill): schema (Task 1) + orchestrator native/masked routing (Task 4). ✅
- exit (fade/erase/wipe/iris/dissolve/slide/shrink) + timing: Tasks 1,3,4. ✅
- pen follower: Task 4 nib (asset-free). Note: design spec mentioned `handFollower` (needs image) — we substitute an asset-free nib to avoid a missing-asset dependency; if a pen asset is later added, swap in `handFollower`. ✅ (documented deviation)
- Determinism: mask geometry pure; dissolve/checkerboard via seeded prng; masked() offscreen is deterministic; transforms pure. ✅
- Reuse-only: all under gcl/. ✅
- Risk: `masked` uses an offscreen buffer per masked component per frame (perf). Acceptable for the deterministic model; note in report if scenes get heavy.
