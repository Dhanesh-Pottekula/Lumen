# GCL Phase 5 — Particles / flow / glow + Group container

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add atmosphere (particles, flow, glow) and the **group** container — arrange children as a unit (row/stack/grid), stagger their build, share an entrance, clip them, and (via the group's own Base props) move/reveal/emphasize the whole group. Reaches design-spec Families E + F.

**Architecture:** particles/flow/glow are simple stream components compiling to `emit`/`radialGlow`. The **group** is a `Base` component with `children: Component[]`; because it extends `Base`, its own enter/exit/motion/emphasis already wrap the whole group through the existing compile chain — the new work is (1) refactoring compile's per-component draw into a reusable `drawComponentInstance(...)` the group calls per child, (2) a group layout (row/stack/grid) placing children within the group box, (3) group-specific powers: `build` (stagger child entrances), `childEnter` (default entrance for children), `clip` (clip children to the group box).

**Tech Stack:** TS, Canvas 2D; vitest for pure group-layout + emitter-resolution helpers; browser preview for render.

## Global Constraints
- DO NOT COMMIT. Deterministic/seekable: no `Date.now`/`Math.random`/`performance.now`/`new Date()`; particles via `emit`/`particleAt` (already pure/seeded — pass `t - startTime`). REUSE-ONLY: only add/modify under `src/render/gcl/`; temp App.tsx removed (zero diff), temp verify .ts deleted. View 920×430.
- Exact signatures: `.superpowers/sdd/p5-signatures.md` — CRITICAL: `rainEmitter`/`snowEmitter` take `(viewW,viewH,seed)`; the other 6 presets take `(x,y,seed)`. `emit(ctx,cfg,t)` is pure. `radialGlow(ctx,x,y,r,color,alpha)`, `withGlow(ctx,{blur,color},draw)`. Build on existing gcl P0–P4.

---

### Task 1: Schema — particles/flow/glow + group

**Files:** Modify `src/render/gcl/schema.ts`

- [ ] **Step 1:** Add the new component variants.
```ts
| (Base & { type: "particles"; preset?: "fire"|"smoke"|"sparks"|"rain"|"snow"|"dust"|"confetti"|"energy"; seed?: number; config?: Record<string, unknown> })
| (Base & { type: "flow"; from: Position; to: Position; color?: string; rate?: number; seed?: number })
| (Base & { type: "glow"; r?: number; color?: string })
| (Base & { type: "group"; children: Component[]; layout?: "row"|"stack"|"grid"; gap?: number; cols?: number; build?: { step?: number }; childEnter?: EnterSpec; clip?: boolean })
```
Note: `Component` is now recursive (group.children: Component[]). Ensure the type still compiles (it's a discriminated union referencing itself — fine in TS).
- [ ] **Step 2:** `npx tsc --noEmit` → 0.

---

### Task 2: Emitter resolver + group layout (pure, tested)

**Files:** Create `src/render/gcl/particles.ts` + `particles.test.ts`; extend `src/render/gcl/layout.ts` (+ layout.test.ts).

- [ ] **Step 1 (emitter resolver, TDD):** `src/render/gcl/particles.ts`:
```ts
import type { EmitterConfig } from "../particles";
// Resolve a preset name + resolved point + view size + seed → EmitterConfig, handling the rain/snow (W,H) vs (x,y) split.
export function resolveEmitter(preset: string | undefined, x: number, y: number, viewW: number, viewH: number, seed: number): EmitterConfig;
```
rain/snow → `rainEmitter(viewW, viewH, seed)` / `snowEmitter(viewW, viewH, seed)`; all others → `<preset>Emitter(x, y, seed)`; unknown/undefined → default to `sparksEmitter(x,y,seed)`.
Tests: preset "rain" produces a config whose origin rect width == viewW; preset "fire" origin is at/near (x,y); unknown → sparks. (Assert a couple of `EmitterConfig` fields.)
- [ ] **Step 2 (group layout, TDD):** In `layout.ts` add `layoutGroup(children: Component[], groupBox: Box, opts: { layout?: "row"|"stack"|"grid"; gap?: number; cols?: number }): Placement[]` — measure each child (measureComponent), arrange: stack (default) = vertical centered column; row = horizontal centered; grid = `cols` columns wrapping. Return per-child placements (cx,cy,w,h) in ABSOLUTE coords within groupBox. Pure.
Tests: stack of 2 → second below first, both centered on groupBox center x; row of 2 → side by side, same y; grid cols=2 of 4 → 2×2.
- [ ] **Step 3:** Run → fail → implement → pass; tsc 0.

---

### Task 3: Refactor compile draw into a reusable per-component instance

**Files:** Modify `src/render/gcl/compile.ts`

- [ ] **Step 1:** Extract the entire per-component render (motion transform → subject modifiers → applyEnterExit → paintContent/paintNative/paintFinal, plus trace trail) into a single function:
```ts
function drawComponentInstance(frame: FrameCtx, c: Component, placement: Placement, timing: { at: number; dur: number; exit: ... }, t: number, cueTimes: number[], resolveFocal: ...): void
```
The existing main loop calls this per component. Behavior must be byte-identical to today (run existing tests + browser to confirm no regression). This is the seam the group renders children through.
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass (no behavior change).

---

### Task 4: Compile handlers — particles/flow/glow + group

**Files:** Modify `src/render/gcl/compile.ts`

- [ ] **Step 1 (particles/flow/glow):**
  - particles: resolve `at`→(x,y) via placement; `cfg = resolveEmitter(c.preset, x, y, W, H, c.seed ?? 1)` (merge `c.config` overrides if present); `emit(fxLayer, cfg, t - at)`. Layer default fx.
  - flow: resolve `from`/`to`→points; build an emitter with `origin:{kind:"line", x:from.x,y:from.y,x2:to.x,y2:to.y}`, angle toward `to`, `rate:c.rate`, color; `emit(fxLayer, cfg, t-at)`.
  - glow: `radialGlow(fxLayer, cx, cy, c.r ?? 60, c.color ?? "#ffd24a", phase(t,at,at+dur))`.
- [ ] **Step 2 (group):** Add a `group` case that renders children. In the main loop, a group is a normal component: its placement/measure = the arranged-children bounding box; its own motion/enter/exit/emphasis wrap the whole group via the existing chain. The group's `paintContent` (finished-state) and native painter both call `renderGroup`:
```ts
function renderGroup(frame, group, groupBox, t, cueTimes): void {
  const kids = group.children;
  const placements = layoutGroup(kids, groupBox, group);
  if (group.clip) { layer.save(); clip to groupBox; }
  kids.forEach((kid, i) => {
    // child timing: build → group.at + i*(build.step ?? 0.5); else child's own (resolveTiming over kids relative to group.at)
    // apply group.childEnter as the child's enter if the child has none
    const kt = childTiming(...);
    drawComponentInstance(frame, withDefaultEnter(kid, group.childEnter), placements[i], kt, t, cueTimes, resolveFocal);
  });
  if (group.clip) layer.restore();
}
```
  measureComponent must handle `group` → bounding box of `layoutGroup`. Group children are timed relative to the group's start.
- [ ] **Step 3:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.
- [ ] **Step 4 (browser verify):** temp scenes: (a) atmosphere — a `particles preset:"snow"` full-frame, a `glow`, and a `flow` between two ids; (b) a `group layout:"stack" build:{step:0.4}` of three bullet texts that build in one-by-one; (c) a `group layout:"row"` of three stat cards that the group `move`s in together and `emphasis:{kind:"punch"}` as a unit; (d) a `group clip:true` demonstrating child clipping. Seek; confirm particles/flow/glow render, group builds/arranges/moves as a unit, deterministic, no console errors; screenshots. REMOVE temp cards (App.tsx zero diff).

---

## Self-Review
- Family E: particles (8 presets + config), flow (particles along a line), glow (radialGlow) — Task 1 + Task 4 Step 1. ✅
- Family F group: layout row/stack/grid (Task 2), children rendered via reusable instance (Task 3), build stagger + childEnter + clip (Task 4 Step 2), and whole-group move/reveal/emphasis via the group's own Base props (free, existing chain). ✅
- Determinism: emit/particleAt pure+seeded (t-at); group layout pure; children re-seekable. ✅
- rain/snow (W,H) vs (x,y) split handled in resolveEmitter. ✅
- Reuse-only: all under gcl/; reuses ../particles, ../../slides/anim (radialGlow/withGlow). ✅
- Risk: recursion (group in group) — drawComponentInstance handles a group child by recursing into renderGroup; ensure timing/anchor context threads through. Nested groups should work but verify at least one level in browser.
