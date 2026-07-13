# Generic Component Layer — Phase 0 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the skeleton of the generic component layer so a trivial flat-stream film (a `scene` with a `heading` + a `stat`, narration-cued) parses, resolves positions/timings, compiles to existing primitives, and renders seekably.

**Architecture:** A new folder `src/render/gcl/` holds the layer: a flat-stream **schema**, a **parser** (flat → grouped scenes), an **anchor resolver** (id/slot/coords → pixels), a **timing engine** (cue/start/at → times), a **compiler** (component → existing primitive calls, producing a `CanvasSlideDefinition`), and an **index** (`renderFilm` → `composeSlides`). It reuses `render/*` and `slides/compose` UNCHANGED and stays a pure function of `t`.

**Tech Stack:** TypeScript, Canvas 2D, React 19, Vite. Pure-logic units tested with **vitest** (`npx vitest run`); the render path verified in the browser preview.

## Global Constraints

- **Determinism/purity:** no `Date.now`/`Math.random`/`performance.now`/`new Date()` at render; randomness only via `prng(seed)` from `src/slides/anim`. Same input + `t` → same pixels.
- **View space:** `viewW = 920`, `viewH = 430`. Origin top-left, `y` down.
- **Reuse only:** do NOT modify anything under `src/render/*` (except adding the new `gcl/` folder) or `src/slides/compose.ts`. The layer compiles down to those.
- **Leave uncommitted:** per project convention, do NOT `git commit`. End each task by running its verification and leaving changes in the working tree for review.
- **No new dependencies.**

---

### Task 1: Schema types (`gcl/schema.ts`)

**Files:**
- Create: `src/render/gcl/schema.ts`

**Interfaces:**
- Consumes: `ThemeName` concept (a string union) — defined here, not imported.
- Produces: `Vec2`, `Slot`, `Position`, `Base`, `SceneMarker`, `Component`, `Item`, `Film`, and the P0 component variants `heading` and `stat`.

- [ ] **Step 1: Write the schema file**

```ts
// src/render/gcl/schema.ts
/** The generic-component-layer authoring schema (Phase 0 subset). Flat stream of scene markers + components. */

export type Vec2 = [number, number];

/** Named layout slots inside the 920×430 view. */
export type Slot =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right"
  | "ground" | "sky";

/** A position: a slot name, an [x,y] coord pair, or another component's id (anchor). */
export type Position = Slot | Vec2 | string;

export type ThemeName = "TEXTBOOK" | "PARCHMENT" | "BLUEPRINT" | "CHALKBOARD";

/** How a component enters (Phase 0: fade or instant; full vocabulary in a later phase). */
export interface EnterSpec { type: "fade" | "none"; dur?: number }

/** Fields shared by every component. Most are plumbed now, exercised in later phases. */
export interface Base {
  id?: string;
  at?: Position;
  cue?: number;                    // narration sentence index this appears with
  start?: "with" | "after" | number; // relative or absolute start (overrides cue)
  dur?: number;                    // entrance duration
  enter?: EnterSpec;
  layer?: "bg" | "mid" | "fg" | "annotation" | "fx";
}

export type Component =
  | (Base & { type: "heading"; text: string; size?: number; color?: string })
  | (Base & { type: "stat"; value: number; unit?: string; label?: string; size?: number; color?: string; commas?: boolean });

export interface SceneMarker {
  type: "scene";
  duration?: number;               // explicit scene length (else derived from timing)
  theme?: ThemeName;
  narration?: string[];            // one string per sentence; index = cue
  bg?: [string, string];
}

export type Item = SceneMarker | Component;
export type Film = Item[];

/** Type guard: is this item a scene marker? */
export function isScene(item: Item): item is SceneMarker {
  return item.type === "scene";
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (no errors).

---

### Task 2: Parser — flat stream → grouped scenes (`gcl/parse.ts`)

**Files:**
- Create: `src/render/gcl/parse.ts`
- Test: `src/render/gcl/parse.test.ts`

**Interfaces:**
- Consumes: `Item`, `SceneMarker`, `Component`, `isScene`, `Film` from `./schema`.
- Produces: `ParsedScene { marker: SceneMarker; components: Component[] }` and `parseFilm(film: Film): ParsedScene[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/render/gcl/parse.test.ts
import { describe, expect, it } from "vitest";
import { parseFilm } from "./parse";
import type { Film } from "./schema";

describe("parseFilm", () => {
  it("groups components under their scene markers", () => {
    const film: Film = [
      { type: "scene", theme: "TEXTBOOK" },
      { type: "heading", text: "A" },
      { type: "stat", value: 1 },
      { type: "scene", theme: "PARCHMENT" },
      { type: "heading", text: "B" },
    ];
    const scenes = parseFilm(film);
    expect(scenes).toHaveLength(2);
    expect(scenes[0].marker.theme).toBe("TEXTBOOK");
    expect(scenes[0].components.map((c) => c.type)).toEqual(["heading", "stat"]);
    expect(scenes[1].components).toHaveLength(1);
  });

  it("throws if the film does not start with a scene marker", () => {
    expect(() => parseFilm([{ type: "heading", text: "x" }])).toThrow();
  });

  it("returns an empty array for an empty film", () => {
    expect(parseFilm([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/gcl/parse.test.ts`
Expected: FAIL — "Cannot find module './parse'".

- [ ] **Step 3: Write the parser**

```ts
// src/render/gcl/parse.ts
import { isScene, type Component, type Film, type SceneMarker } from "./schema";

export interface ParsedScene {
  marker: SceneMarker;
  components: Component[];
}

/** Group a flat film into scenes. The first item MUST be a scene marker. */
export function parseFilm(film: Film): ParsedScene[] {
  if (film.length === 0) return [];
  if (!isScene(film[0])) throw new Error("gcl: film must begin with a { type: 'scene' } marker");
  const scenes: ParsedScene[] = [];
  let current: ParsedScene | null = null;
  for (const item of film) {
    if (isScene(item)) {
      current = { marker: item, components: [] };
      scenes.push(current);
    } else {
      current!.components.push(item);
    }
  }
  return scenes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/gcl/parse.test.ts`
Expected: PASS (3 passing).

---

### Task 3: Anchor resolver — position → pixels (`gcl/anchors.ts`)

**Files:**
- Create: `src/render/gcl/anchors.ts`
- Test: `src/render/gcl/anchors.test.ts`

**Interfaces:**
- Consumes: `Position`, `Vec2`, `Slot` from `./schema`.
- Produces: `Box { x; y; w; h }`, `AnchorCtx { viewW; viewH; boxes: Map<string, Box> }`, and `resolvePosition(pos: Position | undefined, ctx: AnchorCtx, fallback?: Vec2): Vec2`.

- [ ] **Step 1: Write the failing test**

```ts
// src/render/gcl/anchors.test.ts
import { describe, expect, it } from "vitest";
import { resolvePosition, type AnchorCtx } from "./anchors";

const ctx: AnchorCtx = { viewW: 920, viewH: 430, boxes: new Map([["leaf", { x: 100, y: 100, w: 200, h: 100 }]]) };

describe("resolvePosition", () => {
  it("maps the center slot to the view center", () => {
    expect(resolvePosition("center", ctx)).toEqual([460, 215]);
  });
  it("maps top-left to the top-left region", () => {
    const [x, y] = resolvePosition("top-left", ctx);
    expect(x).toBeLessThan(460);
    expect(y).toBeLessThan(215);
  });
  it("passes raw coordinates through unchanged", () => {
    expect(resolvePosition([300, 200], ctx)).toEqual([300, 200]);
  });
  it("resolves an id to that box's center", () => {
    expect(resolvePosition("leaf", ctx)).toEqual([200, 150]);
  });
  it("uses the fallback when position is undefined", () => {
    expect(resolvePosition(undefined, ctx, [7, 8])).toEqual([7, 8]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/gcl/anchors.test.ts`
Expected: FAIL — "Cannot find module './anchors'".

- [ ] **Step 3: Write the anchor resolver**

```ts
// src/render/gcl/anchors.ts
import type { Position, Slot, Vec2 } from "./schema";

export interface Box { x: number; y: number; w: number; h: number }

export interface AnchorCtx {
  viewW: number;
  viewH: number;
  boxes: Map<string, Box>; // component id → bounding box (filled by the layout engine)
}

const SLOTS: Record<Slot, [number, number]> = {
  "top-left": [0.18, 0.18], top: [0.5, 0.14], "top-right": [0.82, 0.18],
  left: [0.16, 0.5], center: [0.5, 0.5], right: [0.84, 0.5],
  "bottom-left": [0.18, 0.82], bottom: [0.5, 0.86], "bottom-right": [0.82, 0.82],
  ground: [0.5, 0.92], sky: [0.5, 0.1],
};

function isVec2(v: Position): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

/** Resolve a Position (slot name | [x,y] | component id) to a view-space point. */
export function resolvePosition(pos: Position | undefined, ctx: AnchorCtx, fallback: Vec2 = [ctx.viewW / 2, ctx.viewH / 2]): Vec2 {
  if (pos === undefined) return fallback;
  if (isVec2(pos)) return pos;
  if (pos in SLOTS) {
    const [fx, fy] = SLOTS[pos as Slot];
    return [fx * ctx.viewW, fy * ctx.viewH];
  }
  const box = ctx.boxes.get(pos);
  if (box) return [box.x + box.w / 2, box.y + box.h / 2];
  console.warn(`gcl: unknown position "${pos}" — using fallback`);
  return fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/gcl/anchors.test.ts`
Expected: PASS (5 passing).

---

### Task 4: Timing engine — cue/start → times (`gcl/timing.ts`)

**Files:**
- Create: `src/render/gcl/timing.ts`
- Test: `src/render/gcl/timing.test.ts`

**Interfaces:**
- Consumes: `Component` from `./schema`.
- Produces: `Timed { at: number; dur: number }` and `resolveTiming(components: Component[], opts: { gap?: number; defaultDur?: number; cueTimes?: number[] }): Timed[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/render/gcl/timing.test.ts
import { describe, expect, it } from "vitest";
import { resolveTiming } from "./timing";
import type { Component } from "./schema";

describe("resolveTiming", () => {
  it("sequences components with a fixed gap by default", () => {
    const cs: Component[] = [
      { type: "heading", text: "A" },
      { type: "heading", text: "B" },
    ];
    const t = resolveTiming(cs, { gap: 1, defaultDur: 0.5 });
    expect(t[0].at).toBe(0);
    expect(t[1].at).toBe(1);
    expect(t[0].dur).toBe(0.5);
  });

  it("places 'with' at the same time as the previous", () => {
    const cs: Component[] = [
      { type: "heading", text: "A" },
      { type: "stat", value: 1, start: "with" },
    ];
    const t = resolveTiming(cs, { gap: 1 });
    expect(t[1].at).toBe(t[0].at);
  });

  it("honors an explicit numeric start", () => {
    const cs: Component[] = [{ type: "heading", text: "A", start: 3.5 }];
    expect(resolveTiming(cs, {})[0].at).toBe(3.5);
  });

  it("maps a cue index to its narration timestamp", () => {
    const cs: Component[] = [{ type: "heading", text: "A", cue: 2 }];
    const t = resolveTiming(cs, { cueTimes: [0, 4, 9] });
    expect(t[0].at).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/render/gcl/timing.test.ts`
Expected: FAIL — "Cannot find module './timing'".

- [ ] **Step 3: Write the timing engine**

```ts
// src/render/gcl/timing.ts
import type { Component } from "./schema";

export interface Timed { at: number; dur: number }

/**
 * Resolve each component's start time & entrance duration. Priority for `at`:
 *   explicit numeric `start` → `cue` (via cueTimes) → `start:"with"/"after"` → sequential gap.
 */
export function resolveTiming(
  components: Component[],
  opts: { gap?: number; defaultDur?: number; cueTimes?: number[] },
): Timed[] {
  const gap = opts.gap ?? 1.2;
  const defaultDur = opts.defaultDur ?? 0.6;
  const out: Timed[] = [];
  let cursor = 0;
  components.forEach((c, i) => {
    const dur = c.dur ?? defaultDur;
    let at: number;
    if (typeof c.start === "number") at = c.start;
    else if (c.cue !== undefined && opts.cueTimes && opts.cueTimes[c.cue] !== undefined) at = opts.cueTimes[c.cue];
    else if (c.start === "with" && i > 0) at = out[i - 1].at;
    else if (c.start === "after" && i > 0) at = out[i - 1].at + out[i - 1].dur;
    else { at = cursor; cursor += gap; }
    out.push({ at, dur });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/render/gcl/timing.test.ts`
Expected: PASS (4 passing).

---

### Task 5: Compiler — scene → CanvasSlideDefinition (`gcl/compile.ts`)

**Files:**
- Create: `src/render/gcl/compile.ts`

**Interfaces:**
- Consumes: `ParsedScene` from `./parse`; `resolvePosition`, `AnchorCtx`, `Box` from `./anchors`; `resolveTiming`, `Timed` from `./timing`; existing `fadeText` from `../../slides/anim`, `drawCounter`, `counterValue`, `drawSlam` from `../type-motion`; `phase` from `../../slides/anim`; `CanvasSlideDefinition` from `../../slides/types`; `FrameCtx` from `../frame`.
- Produces: `compileScene(scene: ParsedScene): CanvasSlideDefinition`.

- [ ] **Step 1: Write the compiler**

```ts
// src/render/gcl/compile.ts
import { fadeText, phase } from "../../slides/anim";
import { counterValue, drawCounter, drawSlam } from "../type-motion";
import type { CanvasSlideDefinition } from "../../slides/types";
import type { ParsedScene } from "./parse";
import { resolvePosition, type AnchorCtx, type Box } from "./anchors";
import { resolveTiming } from "./timing";

const W = 920;
const H = 430;

/** Compile one parsed scene into a seekable CanvasSlideDefinition. Phase 0: heading + stat. */
export function compileScene(scene: ParsedScene): CanvasSlideDefinition {
  const { marker, components } = scene;
  // Narration cue timestamps: Phase 0 estimates ~2.8s per sentence (TTS wiring comes in a later phase).
  const cueTimes = (marker.narration ?? []).map((_s, i) => i * 2.8);
  const timings = resolveTiming(components, { cueTimes });
  const lastEnd = timings.reduce((m, t) => Math.max(m, t.at + t.dur), 0);
  const duration = marker.duration ?? Math.max(4, lastEnd + 1.5);

  // Fixed anchor context for Phase 0 (real layout engine fills boxes in Phase 1).
  const boxes = new Map<string, Box>();
  const anchorCtx: AnchorCtx = { viewW: W, viewH: H, boxes };

  return {
    duration,
    viewW: W,
    viewH: H,
    render(ctx, t, frame) {
      if (!frame) { ctx.clearRect(0, 0, W, H); return; }
      const bg = frame.layer.ctx("bg");
      const [c0, c1] = marker.bg ?? ["#141c24", "#0f151b"];
      const g = bg.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      bg.fillStyle = g;
      bg.fillRect(0, 0, W, H);

      components.forEach((c, i) => {
        const { at, dur } = timings[i];
        if (t < at) return;
        const p = phase(t, at, at + dur);
        const layer = frame.layer.ctx(c.layer ?? "annotation");
        const [x, y] = resolvePosition(c.at, anchorCtx, defaultSlot(c, i));
        if (c.type === "heading") {
          const size = c.size ?? 30;
          const font = `700 ${size}px -apple-system, sans-serif`;
          if (c.enter?.type === "none") fadeText(layer, c.text, x, y, 1, font, c.color ?? "#eef5ef", "center");
          else drawSlam(layer, c.text, x, y, t, at, { font, color: c.color ?? "#eef5ef" });
        } else if (c.type === "stat") {
          const font = `800 ${c.size ?? 44}px -apple-system, sans-serif`;
          drawCounter(layer, x, y, counterValue(t, at, dur || 1.5, 0, c.value), { font, color: c.color ?? "#5cc8ae", align: "center" }, { commas: c.commas ?? true, suffix: c.unit ? ` ${c.unit}` : "" });
          if (c.label) fadeText(layer, c.label, x, y + (c.size ?? 44) * 0.6, p, "600 14px -apple-system, sans-serif", "#9db3a6", "center");
        }
      });
    },
  };
}

/** Sensible default placement when a component has no explicit `at`. */
function defaultSlot(c: ParsedScene["components"][number], index: number): [number, number] {
  if (c.type === "heading") return [W / 2, 70];
  return [W / 2, 150 + index * 40];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

### Task 6: Public API + browser render verification (`gcl/index.ts`)

**Files:**
- Create: `src/render/gcl/index.ts`
- Modify (temporary, for verification only): `src/App.tsx`

**Interfaces:**
- Consumes: `parseFilm` from `./parse`, `compileScene` from `./compile`, `composeSlides` from `../../slides/compose`, `Film` from `./schema`, `CanvasSlideDefinition` from `../../slides/types`; theme presets from `../theme`.
- Produces: `renderFilm(film: Film): CanvasSlideDefinition`.

- [ ] **Step 1: Write the public entry**

```ts
// src/render/gcl/index.ts
import { composeSlides } from "../../slides/compose";
import { BLUEPRINT, CHALKBOARD, PARCHMENT, TEXTBOOK, type Theme } from "../theme";
import type { CanvasSlideDefinition } from "../../slides/types";
import { compileScene } from "./compile";
import { parseFilm } from "./parse";
import type { Film, ThemeName } from "./schema";

export type { Film } from "./schema";

const THEMES: Record<ThemeName, Theme> = { TEXTBOOK, PARCHMENT, BLUEPRINT, CHALKBOARD };

/** Compile a flat-stream film into one composed, seekable CanvasSlideDefinition. */
export function renderFilm(film: Film): CanvasSlideDefinition {
  const scenes = parseFilm(film);
  const themeName = scenes[0]?.marker.theme;
  const theme = themeName ? THEMES[themeName] : TEXTBOOK;
  return composeSlides(scenes.map(compileScene), { theme, filmGrade: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Add a temporary verification card to App.tsx**

Add at the top of `src/App.tsx` (imports) and as the first card inside `<main>`:

```tsx
import { renderFilm } from "./render/gcl";

const p0Demo = renderFilm([
  { type: "scene", theme: "TEXTBOOK", narration: ["Meet the empire.", "It spanned 24 million square kilometres."] },
  { type: "heading", text: "THE MONGOL EMPIRE", cue: 0 },
  { type: "stat", value: 24000000, unit: "km²", label: "at its peak", cue: 1 },
]);
```
```tsx
<CanvasSlide slide={p0Demo} title={<>🧪 GCL P0 — heading + stat</>} tag={<>flat stream → parse → compile → render</>} />
```

- [ ] **Step 4: Build + browser-verify**

Run: `npx tsc --noEmit && npx vite build 2>&1 | tail -2`
Expected: TSC exit 0, build succeeds.

Then in the preview: restart the dev server, seek the P0 card to ~t=5, and confirm the heading slams in and the stat counts toward "24,000,000 km²" with its label, on a clean background, no console errors. Capture a screenshot as proof.

- [ ] **Step 5: Remove the temporary card**

Revert the `src/App.tsx` additions from Step 3 (the demo card + import), leaving the `gcl/` layer in place. Re-run `npx tsc --noEmit` (expect exit 0).

---

## Self-Review

**Spec coverage (P0 scope):**
- Flat-stream format + parser → Task 1 (schema) + Task 2 (parseFilm). ✅
- Universal-prop plumbing (id, at, cue/start, dur, enter, layer) → Task 1 `Base`; exercised by Tasks 4–5. (move/oscillate/expr/fx are declared in the design but deferred to their feature phases — intentionally out of P0 scope; noted.) ✅
- Anchor resolver (ids + slots + coords) → Task 3. ✅
- Timing engine (cue/start/at) → Task 4. ✅
- Compiler skeleton emitting existing primitives → Task 5 (heading→`drawSlam`, stat→`drawCounter`). ✅
- Determinism-preserving render via existing engine → Task 5 uses `frame.layer`, `phase`; Task 6 uses `composeSlides`. ✅
- P0 deliverable (heading + stat, narration-cued, renders seekably) → Task 6. ✅

**Placeholder scan:** none — every step has full code or an exact command.

**Type consistency:** `parseFilm`→`ParsedScene`→`compileScene`; `AnchorCtx`/`resolvePosition`/`Box` consistent across Tasks 3 & 5; `Timed`/`resolveTiming` consistent across Tasks 4 & 5; `renderFilm(Film)` in Task 6 consumes Task 2/5 outputs. Consistent.

**Notes:** `move`/`oscillate`/`expr`/`fx` universal props are declared in `Base` (Task 1) but not yet consumed — their behavior lands in later phases; declaring them now keeps the schema stable so later phases are additive. Narration→real TTS timestamps is stubbed (2.8s/sentence) in P0 and replaced by the timing engine's TTS wiring in Phase 1.
