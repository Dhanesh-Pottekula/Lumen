# Step 16 — Map / Geo Subsystem (history)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Animated history maps — continents/borders from GeoJSON, region fills, **borders that change
over time**, troop/trade **flow arrows**, **battle markers**, and **fog-of-war** — all seekable and
instant.

**Architecture:** Static GeoJSON (simplified) loaded as data. A `projection(lon,lat)→[x,y]` maps to
view space. Time is an **interpolation input**: `year(t)` selects/blends dated border keyframes
(resampled to matching vertex counts via Step 14). Everything else (fills, fronts, flows, markers, fog)
keys off `year(t)`. Reuses reveal (05), particles/flows (10), camera (11), morph/resample (14),
semantics/icons (15).

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic: all state derives from `year(t)`. No accumulation.
- GeoJSON is static + instant-loaded (via a small fetch or bundled import); no build step.
- Existing suite green; build clean.

## File structure
- Create `src/geo/projection.ts` — `equirectangular`, `mercator`, `fitProjection`.
- Create `src/geo/geojson.ts` — types + `ringToPoints(ring, projection)`.
- Create `src/geo/borders.ts` — `borderAt(keyframes, year)` (resample + morph).
- Create `src/render/map.ts` — `drawRegions`, `flowArrow`, `battleMarker`, `fogReveal`, `MapScene` helper.
- Create tests: `projection.test.ts`, `borders.test.ts`.
- Create `public/geo/*.json` — a starter simplified basemap + a demo border keyframe set (e.g., Europe 1914/1916/1918).

---

### Task 1: projection (pure)

**Interfaces — Produces:**
```ts
equirectangular(lon:number, lat:number, box:{x,y,w,h}, bounds:{west,east,south,north}): [number,number]
```

- [ ] **Step 1: Failing tests** — `src/geo/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { equirectangular } from "./projection";

const box = { x: 0, y: 0, w: 1000, h: 500 };
const bounds = { west: -10, east: 40, south: 35, north: 60 };

describe("equirectangular", () => {
  it("west/north maps to top-left, east/south to bottom-right", () => {
    expect(equirectangular(-10, 60, box, bounds)).toEqual([0, 0]);
    expect(equirectangular(40, 35, box, bounds)).toEqual([1000, 500]);
  });
  it("center maps to the middle", () => {
    const [x, y] = equirectangular(15, 47.5, box, bounds);
    expect(x).toBeCloseTo(500); expect(y).toBeCloseTo(250);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/geo/projection.ts`:**

```ts
export function equirectangular(
  lon: number, lat: number,
  box: { x: number; y: number; w: number; h: number },
  bounds: { west: number; east: number; south: number; north: number },
): [number, number] {
  const x = box.x + ((lon - bounds.west) / (bounds.east - bounds.west)) * box.w;
  const y = box.y + ((bounds.north - lat) / (bounds.north - bounds.south)) * box.h;
  return [x, y];
}
```

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: equirectangular projection`.

---

### Task 2: borders-over-time (pure)

**Interfaces — Produces:**
```ts
interface BorderKeyframe { year: number; ring: [number,number][] }  // already projected or lon/lat
borderAt(keys: BorderKeyframe[], year: number, n: number): [number,number][]  // resampled+morphed outline
```

- [ ] **Step 1: Failing tests** — `src/geo/borders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { borderAt } from "./borders";

const keys = [
  { year: 1914, ring: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] },
  { year: 1918, ring: [[0, 0], [20, 0], [20, 10], [0, 10]] as [number, number][] },
];

describe("borderAt", () => {
  it("returns the exact keyframe at a keyframe year", () => {
    const r = borderAt(keys, 1914, 4);
    expect(r).toHaveLength(4);
    // resampled 1914 square still spans x 0..10
    expect(Math.max(...r.map((p) => p[0]))).toBeCloseTo(10);
  });
  it("blends between keyframes (1916 = halfway → x spans ~15)", () => {
    const r = borderAt(keys, 1916, 8);
    expect(Math.max(...r.map((p) => p[0]))).toBeGreaterThan(10);
    expect(Math.max(...r.map((p) => p[0]))).toBeLessThan(20);
  });
  it("clamps outside the keyframe range", () => {
    expect(borderAt(keys, 1900, 4)).toEqual(borderAt(keys, 1914, 4));
    expect(borderAt(keys, 2000, 4)).toEqual(borderAt(keys, 1918, 4));
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/geo/borders.ts`** using `resample` + `morph` (Step 14):

```ts
import { morph, resample } from "../render/morph";

export interface BorderKeyframe { year: number; ring: [number, number][] }

export function borderAt(keys: BorderKeyframe[], year: number, n: number): [number, number][] {
  if (keys.length === 0) return [];
  const sorted = [...keys].sort((a, b) => a.year - b.year);
  if (year <= sorted[0].year) return resample(sorted[0].ring, n);
  if (year >= sorted[sorted.length - 1].year) return resample(sorted[sorted.length - 1].ring, n);
  let i = 1;
  while (i < sorted.length && sorted[i].year < year) i++;
  const a = sorted[i - 1], b = sorted[i];
  const p = (year - a.year) / (b.year - a.year);
  return morph(resample(a.ring, n), resample(b.ring, n), p);
}
```

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: borders-over-time via keyframe interpolation`.

---

### Task 3: map rendering + demo scene

**Files:** `src/render/map.ts`, `public/geo/*.json`, a demo scene + App card.

- [ ] **Step 1:** Implement `drawRegions(frame, features, projection, semantics)` (fill + themed
  stroke), `flowArrow(frame, path, p)` (reuse `strokeOn` + moving dashes + arrowhead), `battleMarker`
  (icon + `emphasis` punch on its date), `fogReveal(frame, reachedRegions)` (a `multiply` dark scrim
  minus revealed regions via `clipShape`/`destination-out`).
- [ ] **Step 2:** Add a starter simplified basemap `public/geo/europe.json` and a border keyframe set
  `public/geo/europe-borders.json` (1914/1916/1918 for one or two powers — hand-simplified, few points).
- [ ] **Step 3:** Build a `WWI` demo scene: basemap + `borderAt(...)` filled regions animating with
  `year(t)`, a couple of `flowArrow`s, `battleMarker`s on dates, `fogReveal`, and a `camera` push to a
  front. Add it as an App card (themed `PARCHMENT`).
- [ ] **Step 4:** `npm run build && npm test` green.
- [ ] **Step 5: Browser verify** — scrub the years; borders grow/shrink, battles pop on their dates,
  fog clears; screenshot 1914 / 1916 / 1918. — [ ] **Step 6: Commit** `feat: map rendering + WWI demo`.

## Self-review
- Projection + borderAt pure & tested; time is interpolation not accumulation → seekable; fills/flows/
  markers/fog key off `year(t)`; themed. ✅

## What this unlocks
The whole history domain — continents, empires, wars — as living, scrubbable maps.
