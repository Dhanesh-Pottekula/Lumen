# Step 14 — Shape / Path Morphing

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Interpolate one shape/path into another (reactant→product, shape→shape, border→border) —
change shown as continuous transformation, not a cut. Also the resampler the map subsystem needs.

**Architecture:** `resample(points, n)` makes any polyline have exactly `n` arc-length-even vertices,
so two shapes get corresponding points; `morph(a, b, p)` lerps them. Both pure. `drawMorph` renders.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; existing suite green; build clean.

## File structure
- Create `src/render/morph.ts` — `resample`, `morph`, `drawMorph`.
- Create `src/render/morph.test.ts` — resample count/spacing + morph endpoints.

---

### Task 1: resample + morph (pure)

**Interfaces — Produces:**
```ts
resample(points: [number,number][], n: number): [number,number][]  // n evenly-spaced-by-arc-length points
morph(a: [number,number][], b: [number,number][], p: number): [number,number][]  // requires equal length
```

- [ ] **Step 1: Failing tests** — `src/render/morph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { morph, resample } from "./morph";

describe("resample", () => {
  it("returns exactly n points", () => {
    const line: [number, number][] = [[0, 0], [10, 0]];
    expect(resample(line, 5)).toHaveLength(5);
  });
  it("evenly spaces a straight line", () => {
    const line: [number, number][] = [[0, 0], [10, 0]];
    const r = resample(line, 3);
    expect(r[0]).toEqual([0, 0]);
    expect(r[1][0]).toBeCloseTo(5);
    expect(r[2][0]).toBeCloseTo(10);
  });
});

describe("morph", () => {
  it("p=0 → a, p=1 → b, midpoint averages", () => {
    const a: [number, number][] = [[0, 0], [10, 0]];
    const b: [number, number][] = [[0, 10], [10, 10]];
    expect(morph(a, b, 0)).toEqual(a);
    expect(morph(a, b, 1)).toEqual(b);
    expect(morph(a, b, 0.5)[0]).toEqual([0, 5]);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/morph.ts`:**

```ts
import { clamp01, lerp } from "../slides/anim";

export function resample(points: [number, number][], n: number): [number, number][] {
  if (points.length === 0 || n <= 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => [points[0][0], points[0][1]]);
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = cum[cum.length - 1] || 1;
  const out: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < target) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const f = (target - cum[i - 1]) / seg;
    out.push([lerp(points[i - 1][0], points[i][0], f), lerp(points[i - 1][1], points[i][1], f)]);
  }
  return out;
}

export function morph(a: [number, number][], b: [number, number][], p: number): [number, number][] {
  const q = clamp01(p);
  const n = Math.min(a.length, b.length);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([lerp(a[i][0], b[i][0], q), lerp(a[i][1], b[i][1], q)]);
  return out;
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5:** `drawMorph(ctx, a, b, p, style)` — resample both to a common N, `morph`, then stroke/fill.
  Browser-verify a square morphing into a circle; screenshot. — [ ] **Step 6: Commit**
  `feat: shape resample + morph`.

## Self-review
- `resample` exact count + even spacing; `morph` endpoints exact; both pure & tested. ✅

## What this unlocks
Molecule→molecule, shape transformations for maths/geometry, and — critically — the
**border-over-time resampling** the map subsystem (16) depends on.
