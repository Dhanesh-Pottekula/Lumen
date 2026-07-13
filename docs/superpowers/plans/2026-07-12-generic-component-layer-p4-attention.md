# GCL Phase 4 — Attention family

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let an author point at, isolate, and emphasize things — callout, highlight, spotlight, dim, pointer, box/brackets, encircle, converge, spark, vignette, focusRings (overlays pointing at an anchor) plus emphasis, ghost, magnify, predict (modifiers on a subject). Reaches design-spec Family D.

**Architecture:** Two forms. (1) **Overlay attention** — a new `{type:"attention", verb, target, ...}` stream item that resolves its `target` anchor (id via the layout `boxes` map, or slot/coords) to a point/box and draws a (B)-class indicator on the annotation/fx layer (callout gets the `FrameCtx`). (2) **Subject modifiers** — optional `emphasis`/`ghost`/`magnify`/`predict` props on ANY component, applied in that component's own draw wrapper via the (A)-class verbs (withPunch/withShake/pulseScale/wiggle/ghost/magnify), composing with the existing motion→enterexit→content chain.

**Tech Stack:** TS, Canvas 2D; vitest for pure target-resolution helper; browser preview for the visual verbs.

## Global Constraints
- DO NOT COMMIT. Deterministic/seekable: no `Date.now`/`Math.random`/`performance.now`/`new Date()`. REUSE-ONLY: only add/modify under `src/render/gcl/`; temp App.tsx removed (zero diff), temp verify .ts deleted. View 920×430.
- Exact signatures: `.superpowers/sdd/p4-signatures.md` — note the (A) wrap-subject vs (B) overlay split, that time-driven verbs take `t` while progress verbs take `p=phase(t,at,at+dur)`, that `callout` takes `FrameCtx` (not raw ctx) and draws on annotation, and that box-verbs (focusBox/cornerBrackets/circumscribe) want a box while others want a center point + radius. Build on existing gcl P0–P3.

---

### Task 1: Schema — attention component + subject-modifier props

**Files:** Modify `src/render/gcl/schema.ts`

- [ ] **Step 1:** Add the attention item and modifier props.
```ts
export type AttnVerb = "callout" | "highlight" | "spotlight" | "dim" | "pointer" | "box"
  | "brackets" | "encircle" | "converge" | "spark" | "vignette" | "rings";
| (Base & { type: "attention"; verb: AttnVerb; target: Position; from?: Position; // pointer needs 2 pts
            text?: string; title?: string; side?: string; route?: string; container?: string; color?: string; radius?: number })
```
Add to `Base`:
```ts
emphasis?: { kind?: "punch" | "shake" | "pulse" | "wiggle"; at?: number; cue?: number; amp?: number };
ghost?: number;   // 0..1 residual opacity (de-emphasize this element)
magnify?: { zoom?: number; r?: number };
predict?: { revealAt?: number; revealCue?: number; poseAt?: number };
```
- [ ] **Step 2:** `npx tsc --noEmit` → 0.

---

### Task 2: Target resolver (`attention.ts`) — pure helper + overlay dispatch

**Files:** Create `src/render/gcl/attention.ts` + `attention.test.ts`

**Interfaces produced:**
```ts
import type { Box } from "./anchors";
export interface AttnGeom { cx: number; cy: number; r: number; box: Box }
// Resolve a target anchor to a drawable geometry (point+radius+box). boxes = layout id→Box map; resolvePt = slot/coord resolver.
export function attnGeom(target: unknown, boxes: Map<string, Box>, viewW: number, viewH: number): AttnGeom;
```
`attnGeom`: if `target` is an id in `boxes` → that box, cx/cy = center, r = hypot(w,h)/2. Else resolve as slot/coords → a zero-size box at that point, r = default 40.

- [ ] **Step 1: Failing tests** — id target → box center + r from box size; slot "center" → cx 460, cy 215, small default box; coords [300,200] → cx 300 cy 200.
- [ ] **Step 2–4: TDD to green.**

---

### Task 3: Overlay attention handler in compile.ts

**Files:** Modify `src/render/gcl/compile.ts`

- [ ] **Step 1:** Treat `{type:"attention"}` items like camera directives — exclude from layout auto-flow (they have no measured content) but DO time them (resolveTiming/cue). In the draw loop, for an attention item compute `g = attnGeom(c.target, laid.boxes, W, H)`, `p = phase(t, at, at+dur)`, and dispatch by `verb`:
  - callout → `callout(frame, { target:[g.cx,g.cy], text:c.text, title:c.title, side:c.side, route:c.route, container:c.container, color:c.color, leaderP:p, labelP: phase(t, at+dur*0.3, at+dur) })`.
  - highlight → `highlightRing(layer, g.cx, g.cy, c.radius ?? g.r, t, {color:c.color})`.
  - spotlight → `spotlightFocus(fxLayer, g.cx, g.cy, c.radius ?? g.r)` (on the fx layer so the scrim sits above content).
  - dim → `dimExcept(fxLayer, [{cx:g.cx,cy:g.cy,r:c.radius ?? g.r}])`.
  - pointer → resolve `from` too; `pointerArrow(layer, fromPt.x, fromPt.y, g.cx, g.cy, p, {color:c.color})` (default from = above target).
  - box → `focusBox(layer, g.box.x, g.box.y, g.box.w, g.box.h, t, {color:c.color})`.
  - brackets → `cornerBrackets(layer, g.box.x, g.box.y, g.box.w, g.box.h, {color:c.color, p})`.
  - encircle → `circumscribe(layer, {x:g.box.x,y:g.box.y,w:g.box.w,h:g.box.h}, p, {color:c.color})`.
  - converge → `convergingArrows(layer, g.cx, g.cy, p, {color:c.color})`.
  - spark → `sparkFlash(layer, g.cx, g.cy, p, {color:c.color})`.
  - vignette → `vignetteTo(fxLayer, g.cx, g.cy, {})`.
  - rings → `focusRings(layer, g.cx, g.cy, p, {color:c.color})`.
  Attention default layer = "annotation" (spotlight/dim/vignette use "fx"). Attention items are NOT measured by layout; give them a benign placement so the loop's placement access doesn't crash (either handle before the placement lookup, or push a dummy placement for them in layout).
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.
- [ ] **Step 3 (browser verify):** temp scene with a base component (e.g. a labeled shape with an id) plus attention items: a callout to it, a highlight ring, brackets, encircle, converge, spark, a pointer, and a spotlight/dim + vignette. Seek; confirm each points/isolates correctly, no console errors; screenshot.

---

### Task 4: Subject modifiers (emphasis / ghost / magnify / predict) in compile.ts

**Files:** Modify `src/render/gcl/compile.ts`

- [ ] **Step 1:** In the per-component wrapper chain (currently motion transform → applyEnterExit → content), add subject modifiers around the content draw:
  - `ghost` (number): wrap with `ghost(layer, c.ghost, (c2)=>paint(c2))` — draws the subject faint.
  - `emphasis` ({kind}): resolve its beat time `emAt` (at/cue). Wrap by kind: punch→`withPunch(layer, box.cx, box.cy, t, emAt, draw, {amp})`; shake→`withShake(layer, t, emAt, draw, {mag:amp})`; pulse→`pulseScale(layer, box.cx, box.cy, t, draw, {amp})`; wiggle→`wiggle(layer, box.cx, box.cy, t, draw, {amp})`.
  - `magnify` ({zoom,r}): wrap with `magnify(layer, box.cx, box.cy, r ?? hypot/2, zoom ?? 1.6, (c2)=>paint(c2))` — a loupe over the element.
  - `predict` ({revealAt}): gate the subject — before `revealAt`, draw a "?" placeholder (fadeText "?" at box center) using `predictReveal(t,{revealAt,poseAt}).thinking` for a subtle pulse; at/after revealAt, draw the real content (optionally with a small pop). Use `predictReveal` for the envelope.
  Order: ghost/magnify/emphasis wrap the content; predict decides whether content or placeholder is drawn. These compose inside the motion transform and outside/around enter-exit as appropriate (emphasis/ghost around the final content; keep it readable — a single modifier is the common case).
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.
- [ ] **Step 3 (browser verify):** temp scene with components using each modifier: a stat with `emphasis:{kind:"punch",cue:1}`, a shape with `ghost:0.3`, a shape with `magnify:{zoom:2}`, and a stat with `predict:{revealCue:2}`. Seek; confirm punch/ghost/magnify/predict behave, deterministic, no console errors; screenshot. REMOVE temp cards (App.tsx zero diff).

---

## Self-Review
- Family D overlays (callout/highlight/spotlight/dim/pointer/box/brackets/encircle/converge/spark/vignette/rings): schema (Task 1) + handler (Task 3). ✅
- Subject modifiers (emphasis punch/shake/pulse/wiggle, ghost, magnify, predict): schema (Task 1) + wrapper (Task 4). ✅
- Determinism: overlays are pure fns of t; modifiers wrap deterministic content; predict via predictReveal (pure). ✅
- callout gets FrameCtx. spotlight/dim/vignette on fx layer (above content). ✅
- Reuse-only: all under gcl/; reuses ../focus, ../callout, ../sequence, ../strokeVerbs. ✅
- Risk: attention items must not break the layout/placement 1:1 index assumption — handle them (like camera) before the placement lookup. Note for implementer.
