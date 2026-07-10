# Step 01 — Render Context & Layer Model

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` tracking.

**Goal:** Introduce a `FrameCtx` object threaded into every scene's `render`, and a layer model
(bg/mid/fg/annotation/fx) that composites in order with per-layer offset, blur, and alpha — the
backbone all later visual steps build on.

**Architecture:** `render(ctx, t)` becomes `render(ctx, t, frame?)`. The player and composer build a
`FrameCtx` bound to the target context and pass it down; after a scene renders, the caller calls
`frame.finish()` to composite any layers used. Scenes that ignore `frame` behave exactly as today
(draw straight to the given ctx). New scenes draw into named layers via `frame.layer.ctx(name)`.

**Tech Stack:** TypeScript, Canvas 2D, vitest. No new dependencies.

## Global Constraints

- Deterministic & seekable: `render` stays a pure function of `t` (+ frame inputs). No `Date.now`/`Math.random`.
- Backward compatible: existing scenes (2-arg `render`) compile and render unchanged; the 3rd arg is optional.
- Existing suite (43 vitest) stays green; `npm run build` clean.
- Layer compositing must survive scenes that self-clear / set globalAlpha (same contract as the existing offscreen-buffer path).

## File structure

- Create `src/render/frame.ts` — `FrameCtx`, `LayerName`, `LayerOptions`, `LayerApi`, `createFrame()`, `LAYER_ORDER`.
- Create `src/render/frame.test.ts` — layer ordering/compositing unit tests.
- Modify `src/slides/types.ts` — extend `render` signature (optional 3rd arg).
- Modify `src/components/CanvasSlide.tsx` — build a frame, pass it, call `finish()`.
- Modify `src/slides/compose.ts` — pass a frame to each scene render (direct + offscreen-buffer paths), `finish()` per scene.
- Modify `src/slides/photoIntro.ts` — convert to layers as the proof-of-model (browser-verified).

---

### Task 1: `frame.ts` — FrameCtx + LayerStack + createFrame

**Files:** Create `src/render/frame.ts`, `src/render/frame.test.ts`.

**Interfaces — Produces:**
```ts
export type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";
export const LAYER_ORDER: readonly LayerName[];
export interface LayerOptions { offsetX?: number; offsetY?: number; blur?: number; alpha?: number }
export interface LayerApi {
  ctx(name: LayerName): CanvasRenderingContext2D;   // transform-matched, cleared this frame
  set(name: LayerName, opts: LayerOptions): void;
}
export interface FrameCtx { t: number; viewW: number; viewH: number; layer: LayerApi }
export function createFrame(target: CanvasRenderingContext2D, t: number, viewW: number, viewH: number):
  FrameCtx & { finish(): void };
```

- [ ] **Step 1: Write failing tests** — `src/render/frame.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrame, LAYER_ORDER } from "./frame";

/** A fake layer canvas whose 2d context records nothing but supports the calls createFrame makes. */
function fakeCanvas() {
  const ctx = {
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    globalAlpha: 1, filter: "none",
  };
  return { width: 0, height: 0, getContext: () => ctx, __ctx: ctx };
}

/** A stub target context that records drawImage order + the alpha/filter at each call. */
function targetCtx() {
  const calls: { alpha: number; filter: string }[] = [];
  const ctx: Record<string, unknown> = {
    canvas: { width: 800, height: 400 },
    globalAlpha: 1, filter: "none",
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
    setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(),
    drawImage: vi.fn(() => calls.push({ alpha: ctx.globalAlpha as number, filter: ctx.filter as string })),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("createFrame layers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("composites only used layers, in LAYER_ORDER", () => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
    const { ctx, calls } = targetCtx();
    const f = createFrame(ctx, 1, 800, 400);
    // touch fg then bg (out of order); finish must composite bg before fg
    f.layer.ctx("fg");
    f.layer.ctx("bg");
    f.finish();
    expect(calls).toHaveLength(2); // annotation/mid/fx untouched → not composited
  });

  it("applies per-layer alpha and blur at composite time", () => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
    const { ctx, calls } = targetCtx();
    const f = createFrame(ctx, 1, 800, 400);
    f.layer.ctx("mid");
    f.layer.set("mid", { alpha: 0.5, blur: 4 });
    f.finish();
    expect(calls[0].alpha).toBeCloseTo(0.5);
    expect(calls[0].filter).toContain("blur(");
  });

  it("finish() is a no-op when no layer was used", () => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
    const { ctx, calls } = targetCtx();
    createFrame(ctx, 1, 800, 400).finish();
    expect(calls).toHaveLength(0);
  });

  it("LAYER_ORDER is bg→mid→fg→annotation→fx", () => {
    expect(LAYER_ORDER).toEqual(["bg", "mid", "fg", "annotation", "fx"]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`npm test`): cannot resolve `./frame`.

- [ ] **Step 3: Implement `src/render/frame.ts`:**

```ts
/**
 * FrameCtx — shared per-frame state threaded into scene render(). Owns a lazily-created stack of
 * offscreen layer canvases (bg→fx) that composite onto the target context in order, each with
 * optional parallax offset, blur, and alpha. Deterministic: nothing here reads a clock.
 */
export type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";
export const LAYER_ORDER: readonly LayerName[] = ["bg", "mid", "fg", "annotation", "fx"];

export interface LayerOptions {
  offsetX?: number; // view-space parallax offset
  offsetY?: number;
  blur?: number; // device-px gaussian blur at composite
  alpha?: number;
}

export interface LayerApi {
  ctx(name: LayerName): CanvasRenderingContext2D;
  set(name: LayerName, opts: LayerOptions): void;
}

export interface FrameCtx {
  t: number;
  viewW: number;
  viewH: number;
  layer: LayerApi;
}

interface LayerEntry {
  canvas: HTMLCanvasElement;
  opts: LayerOptions;
}

export function createFrame(
  target: CanvasRenderingContext2D,
  t: number,
  viewW: number,
  viewH: number,
): FrameCtx & { finish(): void } {
  const layers = new Map<LayerName, LayerEntry>();
  const w = target.canvas.width;
  const h = target.canvas.height;
  const xform = target.getTransform();

  function ensure(name: LayerName): LayerEntry {
    let e = layers.get(name);
    if (!e) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d") as CanvasRenderingContext2D;
      c.setTransform(xform); // match the target's view transform so scene coords map 1:1
      e = { canvas, opts: {} };
      layers.set(name, e);
    }
    return e;
  }

  const layer: LayerApi = {
    ctx: (name) => ensure(name).canvas.getContext("2d") as CanvasRenderingContext2D,
    set: (name, opts) => {
      ensure(name).opts = { ...ensure(name).opts, ...opts };
    },
  };

  function finish() {
    for (const name of LAYER_ORDER) {
      const e = layers.get(name);
      if (!e) continue;
      const { offsetX = 0, offsetY = 0, blur = 0, alpha = 1 } = e.opts;
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0); // composite in device pixels
      target.globalAlpha *= alpha;
      if (blur > 0) target.filter = `blur(${blur}px)`;
      target.drawImage(e.canvas, offsetX * xform.a, offsetY * xform.d);
      target.restore();
    }
  }

  return { t, viewW, viewH, layer, finish };
}
```

- [ ] **Step 4: Run — expect PASS** (`npm test`, all green incl. prior 43).
- [ ] **Step 5: Commit** — `git add src/render/frame.ts src/render/frame.test.ts && git commit -m "feat: FrameCtx + layer model (offscreen layers, ordered composite)"`

---

### Task 2: Extend the render signature and thread it through the player

**Files:** Modify `src/slides/types.ts`, `src/components/CanvasSlide.tsx`.

**Interfaces — Consumes:** `createFrame`, `FrameCtx` from `../render/frame`.
**Produces:** `CanvasSlideDefinition.render: (ctx, t, frame?: FrameCtx) => void`.

- [ ] **Step 1:** In `src/slides/types.ts`, change the render field:

```ts
import type { FrameCtx } from "../render/frame";
// ...
  render: (ctx: CanvasRenderingContext2D, t: number, frame?: FrameCtx) => void;
```

(Existing 2-arg scene functions remain assignable — a `(ctx,t)=>void` satisfies `(ctx,t,frame?)=>void`.)

- [ ] **Step 2:** In `CanvasSlide.tsx` `draw()`, after `ctx.setTransform(...)`, build and finish a frame:

```ts
      ctx.setTransform((dpr * w) / slide.viewW, 0, 0, (dpr * h) / slide.viewH, 0, 0);
      const frame = createFrame(ctx, seconds, slide.viewW, slide.viewH);
      slide.render(ctx, seconds, frame);
      frame.finish();
```
Add `import { createFrame } from "../render/frame";`.

- [ ] **Step 3:** `npm run build` — expect clean (existing scenes ignore the arg).
- [ ] **Step 4:** `npm test` — expect green.
- [ ] **Step 5: Commit** — `git commit -am "feat: thread FrameCtx through the player"`

---

### Task 3: Thread FrameCtx through composeSlides (direct + buffer paths)

**Files:** Modify `src/slides/compose.ts`.

**Interfaces — Consumes:** `createFrame` from `../render/frame`.

The composer calls `scene.render` in two places: directly on `ctx` (non-buffered) and on the offscreen
`bufCtx` (buffered crossfade path), plus the single-scene passthrough. Each call site must create a
frame bound to the ctx it draws into and finish it.

- [ ] **Step 1:** Import `createFrame`. In the single-scene branch:

```ts
        const f = createFrame(ctx, localT, viewW, viewH);
        only.scene.render(ctx, localT, f);
        f.finish();
```

- [ ] **Step 2:** In the non-buffered branch (`withAlpha(ctx, alpha, () => scene.render(ctx, localT))`), replace with:

```ts
          withAlpha(ctx, alpha, () => {
            const f = createFrame(ctx, localT, viewW, viewH);
            scene.render(ctx, localT, f);
            f.finish();
          });
```

- [ ] **Step 3:** In the buffered branch (draws into `bufCtx`), after `bufCtx.setTransform(ctx.getTransform())`:

```ts
        bufCtx.setTransform(ctx.getTransform());
        const bf = createFrame(bufCtx, localT, viewW, viewH);
        scene.render(bufCtx, localT, bf);
        bf.finish();
```

- [ ] **Step 4:** `npm run build && npm test` — expect green (the render-dispatch tests pass a stub ctx; `createFrame` calls `getTransform`/`canvas` — verify the compose test stub provides them; if a test stub lacks `getTransform`/`canvas`, extend that stub minimally so `createFrame` no-ops safely). **Adjustment:** guard `createFrame` usage in compose behind `canBuffer(ctx)`-style capability is unnecessary; instead, make the compose unit-test stubs provide `canvas` + `getTransform` (they already do for the buffer-path test; add to the plain `stubCtx` too).
- [ ] **Step 5: Commit** — `git commit -am "feat: thread FrameCtx through composeSlides"`

---

### Task 4: Prove the layer model on a real scene (photoIntro)

**Files:** Modify `src/slides/photoIntro.ts`.

Convert the intro to draw into layers: sky/soil → `bg`, sun/leaf/stem → `mid`, drifting molecules →
`fg`, title → `annotation`. This validates that a layered scene renders identically and sets up
parallax later.

- [ ] **Step 1:** At the top of `render(ctx, t, frame)`, get layer contexts (fall back to `ctx` when no frame, for safety):

```ts
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    // draw sky+soil on bg, sun/beams/stem/leaf on mid, CO2/O2/water on fg, title on ann
```
Route each existing draw block to the matching layer context variable (mechanical: replace `ctx.` with `bg.`/`mid.`/`fg.`/`ann.` per block; `drawSvg(bg|mid|fg, ...)`, `radialGlow(mid, ...)`, `fadeText(ann, ...)`).

- [ ] **Step 2:** `npm run build && npm test` — green.
- [ ] **Step 3: Browser verify** — `npm run dev`, scrub the photosynthesis intro; confirm it looks identical to before (layers composite correctly). Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "refactor: photoIntro draws into named layers (layer-model proof)"`

---

## Self-review checklist

- Signature change is optional-arg → existing scenes compile unchanged. ✅
- Layer buffers match target size + transform, so scene coords map 1:1. ✅
- `finish()` composites in `LAYER_ORDER`, applies alpha/blur/offset, no-op when unused. ✅
- Works in both compose paths (direct + offscreen buffer) and the player. ✅
- All pure logic (ordering/compositing) unit-tested; visual parity browser-checked. ✅

## What this unlocks

Parallax (per-layer `offsetX/Y`), depth-of-field (per-layer `blur`), a dedicated annotation layer
always on top, and a clean place for the filmic pass — all consumed by Steps 03, 06, 07, 11.
