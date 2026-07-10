# Step 12 — Plots, Charts & Data-Viz

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Data-viz primitives every subject needs: coordinate **axes/grid**, **animated function
plotting** (`y=f(x)`, parametric, polar), and **bar/line/pie charts** bound to data arrays.

**Architecture:** A `Scale` maps data coords → view pixels (like d3 scales, tiny + pure). Axes/grid
draw from scales; a function plot samples `f(x)` and draws-on via `strokeOn` (Step 04); charts map data
to rects/arcs/points with a per-series `stepProgress` (Step 08) for staggered reveals. Themed.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; themed; existing suite green; build clean.

## File structure
- Create `src/render/scale.ts` — `linearScale`, `niceTicks` (pure).
- Create `src/render/plot.ts` — `drawAxes`, `plotFunction`.
- Create `src/render/charts.ts` — `barChart`, `lineChart`, `pieChart`.
- Create tests: `scale.test.ts`, `plot.test.ts` (function sampling), `charts.test.ts` (bar geometry).

---

### Task 1: scales + ticks (pure)

**Interfaces — Produces:**
```ts
linearScale(domain: [number,number], range: [number,number]): (v:number)=>number
niceTicks(min:number, max:number, count:number): number[]
```

- [ ] **Step 1: Failing tests** — `src/render/scale.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linearScale, niceTicks } from "./scale";

describe("linearScale", () => {
  it("maps domain endpoints to range endpoints", () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(0)).toBe(0); expect(s(10)).toBe(100); expect(s(5)).toBe(50);
  });
  it("supports inverted range (screen y grows down)", () => {
    const s = linearScale([0, 1], [200, 0]);
    expect(s(0)).toBe(200); expect(s(1)).toBe(0);
  });
});

describe("niceTicks", () => {
  it("returns round, ascending ticks spanning the range", () => {
    const t = niceTicks(0, 10, 5);
    expect(t[0]).toBeLessThanOrEqual(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/scale.ts`:**

```ts
export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain, [r0, r1] = range;
  const m = (r1 - r0) / (d1 - d0 || 1);
  return (v: number) => r0 + (v - d0) * m;
}

export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}
```

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: linear scale + nice ticks`.

---

### Task 2: axes + animated function plot

**Interfaces — Produces:**
```ts
drawAxes(frame, box:{x,y,w,h}, xDomain, yDomain, opts?): void
plotFunction(frame, box, xDomain, yDomain, f:(x:number)=>number, p:number, opts?): void  // draws-on to p
```

- [ ] **Step 1:** `plot.ts` — build x/y scales from box+domains, draw themed axis lines + `niceTicks`
  labels (using `frame.theme`), then for `plotFunction` sample `f` across the box width into a point
  array and render with `strokeOn(ctx, pts, p, {color: theme.palette.accent, ...})` so the curve draws
  itself. Add a test that sampling `f(x)=x` over `[0,10]` yields a monotonic increasing pixel-y set
  (extract a pure `samplePoints(box,xDomain,yDomain,f,n)` and test it).
- [ ] **Step 2:** `npm run build && npm test` green.
- [ ] **Step 3: Browser verify** — a parabola drawing itself on themed axes; screenshot. — [ ] **Step 4:
  Commit** `feat: axes + animated function plotting`.

---

### Task 3: charts (bar/line/pie)

**Interfaces — Produces:** `barChart(frame, box, data:number[], p)`, `lineChart(frame, box, series, p)`,
`pieChart(frame, cx, cy, r, data:number[], p)`. Each uses `stepProgress`/`p` for grow-in.

- [ ] **Step 1:** Extract pure geometry helpers and test them: `barRects(box, data, p)` returns
  `{x,y,w,h}[]` where each bar's height = value·scale·`clamp01(p)`; `pieAngles(data)` returns
  cumulative `[start,end]` radians summing to 2π.
- [ ] **Step 2: Failing tests** — `src/render/charts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { barRects, pieAngles } from "./charts";

describe("barRects", () => {
  it("bar heights scale with p", () => {
    const box = { x: 0, y: 0, w: 100, h: 100 };
    const half = barRects(box, [10, 20], 0.5);
    const full = barRects(box, [10, 20], 1);
    expect(half[1].h).toBeCloseTo(full[1].h / 2);
  });
});

describe("pieAngles", () => {
  it("slices sum to 2π", () => {
    const a = pieAngles([1, 1, 2]);
    const total = a[a.length - 1][1] - a[0][0];
    expect(total).toBeCloseTo(Math.PI * 2);
  });
});
```

- [ ] **Step 3:** Implement `charts.ts`; run tests → PASS; browser-verify an animated bar chart; screenshot.
- [ ] **Step 4: Commit** `feat: animated bar/line/pie charts`.

## Self-review
- Scales/ticks/bar/pie geometry pure + tested; curves draw-on; themed. ✅

## What this unlocks
Graphs for maths/physics, data stories for history/biology; feeds live physics graphs (Step 18 demos).
