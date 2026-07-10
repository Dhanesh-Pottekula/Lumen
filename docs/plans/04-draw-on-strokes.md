# Step 04 — Draw-On / Stroke System

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Paths that **draw themselves** over time — the "teacher writing on the board" effect — with
themed line width and hand-drawn roughness. The single most engaging teaching visual.

**Architecture:** A pure `strokeOn(ctx, points, p, style)` that renders the first `p` (0→1) fraction of
a polyline by arc-length, so a diagram/arrow/letter appears to be drawn. Built on `makePath`
(arc-length param, already in `anim.ts`) and `roughen` (Step 02). Progress `p` is any eased function
of `t`, keeping it seekable.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints

- Deterministic: `p` derives from `t`; roughness uses a fixed seed per stroke.
- Existing suite green; `npm run build` clean.

## File structure

- Create `src/render/strokes.ts` — `strokeOn`, `partialPolyline` (pure geometry), `strokePath`.
- Create `src/render/strokes.test.ts` — partial-length geometry tests.
- (Consumers arrive in later steps: callouts, plots, math.)

---

### Task 1: `partialPolyline` — the pure geometry

**Interfaces — Produces:** `partialPolyline(points: [number,number][], p: number): [number,number][]`
— returns the sub-polyline covering the first `clamp01(p)` of total arc length, including a final
interpolated point at the exact cut.

- [ ] **Step 1: Failing tests** — `src/render/strokes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { partialPolyline } from "./strokes";

const L: [number, number][] = [[0, 0], [10, 0], [10, 10]]; // total length 20

describe("partialPolyline", () => {
  it("p=0 → just the start point", () => {
    expect(partialPolyline(L, 0)).toEqual([[0, 0]]);
  });
  it("p=1 → the full polyline", () => {
    expect(partialPolyline(L, 1)).toEqual(L);
  });
  it("p=0.5 → half arc length, cut mid-second-segment start", () => {
    // 50% of 20 = 10 → exactly the corner
    expect(partialPolyline(L, 0.5)).toEqual([[0, 0], [10, 0]]);
  });
  it("p=0.75 → interpolated point halfway up the vertical segment", () => {
    expect(partialPolyline(L, 0.75)).toEqual([[0, 0], [10, 0], [10, 5]]);
  });
  it("clamps out-of-range p", () => {
    expect(partialPolyline(L, -1)).toEqual([[0, 0]]);
    expect(partialPolyline(L, 2)).toEqual(L);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/strokes.ts`:**

```ts
import { clamp01, roughen } from "../slides/anim"; // clamp01 from anim
// NOTE: roughen lives in ../render/theme — import from there:
// import { roughen } from "./theme";

/** First `p` (0..1) of a polyline by arc length, with an interpolated final point. */
export function partialPolyline(points: [number, number][], p: number): [number, number][] {
  p = clamp01(p);
  if (points.length === 0) return [];
  if (p <= 0) return [[points[0][0], points[0][1]]];
  // cumulative lengths
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  if (total === 0 || p >= 1) return points.map((q) => [q[0], q[1]]);
  const target = p * total;
  const out: [number, number][] = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i++) {
    if (cum[i] <= target) {
      out.push([points[i][0], points[i][1]]);
    } else {
      const seg = cum[i] - cum[i - 1];
      const f = (target - cum[i - 1]) / seg;
      out.push([
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
      ]);
      break;
    }
  }
  return out;
}
```
(Correct the import: `clamp01` from `../slides/anim`, `roughen` from `./theme`.)

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: partialPolyline arc-length geometry`.

---

### Task 2: `strokeOn` — draw-on renderer

**Interfaces — Produces:**
```ts
strokeOn(ctx, points: [number,number][], p: number,
  style?: { color?: string; width?: number; roughness?: number; seed?: number; cap?: CanvasLineCap }): void
```

- [ ] **Step 1:** Implement in `strokes.ts`:

```ts
export function strokeOn(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  p: number,
  style: { color?: string; width?: number; roughness?: number; seed?: number; cap?: CanvasLineCap } = {},
) {
  let pts = partialPolyline(points, p);
  if (pts.length < 2) return;
  if (style.roughness) pts = roughen(pts, style.roughness, style.seed ?? 1);
  ctx.save();
  ctx.strokeStyle = style.color ?? "#fff";
  ctx.lineWidth = style.width ?? 2;
  ctx.lineCap = style.cap ?? "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 2:** Add a `strokeOn` render test using a stub ctx that records `moveTo`/`lineTo` counts
  (assert that at `p=0.5` fewer segments are drawn than at `p=1`).
- [ ] **Step 3:** `npm run build && npm test` — green.
- [ ] **Step 4: Browser verify** — temporary demo: a diagram arrow/curve that draws itself as `t` sweeps; screenshot mid-draw. Remove the temp demo or keep behind a demo card.
- [ ] **Step 5: Commit** `feat: strokeOn draw-on renderer with themed roughness`.

---

## Self-review checklist

- `partialPolyline` exact at endpoints/corners/interpolated cut; clamped; tested. ✅
- `strokeOn` deterministic, themed width/roughness. ✅

## What this unlocks

Self-drawing diagrams, arrows, geometry, and (with Step 17) equations — used by callouts (07),
plots (12), maths (17), and maps (16, drawing routes/borders on).
