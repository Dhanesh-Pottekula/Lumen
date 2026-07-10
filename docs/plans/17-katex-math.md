# Step 17 — KaTeX Math Typesetting (runtime)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Real typeset equations (fractions, integrals, matrices) on canvas, laid out **at runtime**
in the browser (no build step), cached, and able to draw-on.

**Architecture:** KaTeX renders a formula to an offscreen DOM/SVG in milliseconds; we rasterize it to
an `HTMLCanvas/Image` once, cache by `(latex, fontPx, color)`, and `drawImage` it into scenes — exactly
like the SVG asset pipeline. Because it's cached, per-frame cost is a blit. Draw-on uses a left-to-right
reveal (Step 05 `wipe`) over the cached image.

**Tech Stack:** TypeScript, KaTeX (npm), Canvas 2D, vitest.

## Global Constraints
- Runtime-only: layout happens in-browser on first use; no author-time gate. Instant on cache hit.
- Deterministic draw: reveal fraction from `t`.
- Existing suite green; build clean.

## File structure
- Add dependency `katex`.
- Create `src/render/mathtex.ts` — `renderMath(latex, opts)→cached image`, `drawMath(frame, latex, x, y, opts)`, `drawMathOn(frame, latex, x, y, p, opts)`.
- Create `src/render/mathtex.test.ts` — cache-key behavior (pure part), guarded for no-DOM.

---

### Task 1: cache key + guarded renderer

**Interfaces — Produces:**
```ts
mathCacheKey(latex: string, fontPx: number, color: string): string   // pure
renderMath(latex: string, opts:{fontPx:number; color:string}): HTMLCanvasElement | undefined  // undefined if no DOM
```

- [ ] **Step 1: Failing tests** — `src/render/mathtex.test.ts` (test only the pure key + the no-DOM guard):

```ts
import { describe, expect, it } from "vitest";
import { mathCacheKey, renderMath } from "./mathtex";

describe("mathCacheKey", () => {
  it("is stable and varies with each input", () => {
    expect(mathCacheKey("a^2", 20, "#fff")).toBe(mathCacheKey("a^2", 20, "#fff"));
    expect(mathCacheKey("a^2", 20, "#fff")).not.toBe(mathCacheKey("a^2", 24, "#fff"));
    expect(mathCacheKey("a^2", 20, "#fff")).not.toBe(mathCacheKey("b^2", 20, "#fff"));
  });
});

describe("renderMath (no DOM)", () => {
  it("returns undefined outside the browser instead of throwing", () => {
    expect(renderMath("a^2", { fontPx: 20, color: "#fff" })).toBeUndefined();
  });
});
```

- [ ] **Step 2:** `npm install katex`. Run tests → FAIL.
- [ ] **Step 3: Implement `src/render/mathtex.ts`:**

```ts
import katex from "katex";

const cache = new Map<string, HTMLCanvasElement>();
export function mathCacheKey(latex: string, fontPx: number, color: string) {
  return `${fontPx}|${color}|${latex}`;
}

/** Render LaTeX → an offscreen canvas, cached. Returns undefined outside the browser. */
export function renderMath(latex: string, opts: { fontPx: number; color: string }): HTMLCanvasElement | undefined {
  if (typeof document === "undefined") return undefined;
  const key = mathCacheKey(latex, opts.fontPx, opts.color);
  const hit = cache.get(key);
  if (hit) return hit;
  // Layout to an offscreen element, then draw to canvas via an SVG data URL image (sync-cached on load).
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-9999px";
  host.style.fontSize = `${opts.fontPx}px`;
  host.style.color = opts.color;
  document.body.appendChild(host);
  katex.render(latex, host, { throwOnError: false, displayMode: true });
  // Measure + snapshot: use html-to-canvas-free path — serialize the KaTeX HTML into an SVG
  // <foreignObject> data URL and load it into an Image, drawn onto a sized canvas.
  const rect = host.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(rect.width));
  const h = Math.max(1, Math.ceil(rect.height));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${opts.color};font-size:${opts.fontPx}px">${host.innerHTML}</div></foreignObject></svg>`;
  const img = new Image();
  img.onload = () => canvas.getContext("2d")!.drawImage(img, 0, 0);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  document.body.removeChild(host);
  cache.set(key, canvas);
  return canvas;
}
```
Notes for the implementer: KaTeX CSS must be loaded (import `katex/dist/katex.min.css` in the app
entry). `foreignObject`-in-SVG-image taints the canvas for pixel *reads*, but we only `drawImage` it
(never `getImageData`), so compositing is fine. The image decodes async — the cached canvas fills in on
load and the next frame blits it (a one-frame delay on first use only; acceptable and still instant).
`drawMath` blits the cached canvas at (x,y); `drawMathOn` wraps it in `wipe(...)` (Step 05) for draw-on.

- [ ] **Step 4: Run — PASS** (pure key + no-DOM guard).
- [ ] **Step 5:** Import `katex/dist/katex.min.css` in `src/main.tsx`. `npm run build` clean.
- [ ] **Step 6: Browser verify** — a fraction + an integral rendered on a themed scene, then a
  draw-on reveal; screenshot. — [ ] **Step 7: Commit** `feat: runtime KaTeX math rendering (cached, draw-on)`.

## Self-review
- Cache key pure/tested; renderer guarded for no-DOM; runtime layout, cached blit → instant; draw-on
  via reveal. ✅

## What this unlocks
The maths domain (equations, derivations) and any labelled formula in physics/chemistry.
