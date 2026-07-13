# GCL Phase 6 — Table primitive + sub-anchors + harvest

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add the one genuinely missing primitive — `table` — give rich components **sub-anchors** so attention/motion/callout can target their parts (a chart's peak, a map's region, a shape's edge, a timeline's event), and harvest a couple of bespoke lesson visuals into reusable named primitives. Reaches design-spec Family A's `table` + the §11 sub-anchor risk + §10 harvest.

**Architecture:** `table` is a new self-contained draw primitive kept in `src/render/gcl/table.ts` (reuse-only: we do NOT add to render/*), driven by a `{type:"table"}` component. Sub-anchors are computed by a pure `subAnchors(component, box)` that returns named points; the layout engine registers them into the shared `boxes` map under `"<id>.<handle>"` keys, so the EXISTING anchor resolver / `attnGeom` resolve them with zero new plumbing. Harvest adds a polished `disc`/planet shape and a `riemann` chart mode as representative extractions.

**Tech Stack:** TS, Canvas 2D; vitest for table geometry + subAnchors (pure); browser preview for render.

## Global Constraints
- DO NOT COMMIT. Deterministic/seekable: no `Date.now`/`Math.random`/`performance.now`/`new Date()`. REUSE-ONLY: only add/modify under `src/render/gcl/`; temp App.tsx removed (zero diff). View 920×430.
- Sub-anchor geometry must be PURE + ctx-free (uses makePlot/fitProjection which are pure) so it runs in layout without a canvas. Build on existing gcl P0–P5.
- Reference `.superpowers/sdd/p1-signatures.md` (makePlot/pie/fitProjection/featureCenter/makeTimeline for sub-anchor math; chart/shape/map/timeline handlers already exist in compile.ts).

---

### Task 1: `table` primitive + component

**Files:** Create `src/render/gcl/table.ts` + `table.test.ts`; modify `schema.ts`, `measure.ts`, `compile.ts`.

- [ ] **Step 1:** Schema — add:
```ts
| (Base & { type: "table"; rows: string[][]; header?: boolean; w?: number; rowH?: number; colColor?: string; ink?: string })
```
- [ ] **Step 2 (TDD, pure geometry):** `table.ts`:
```ts
export interface TableStyle { header?: boolean; rowH?: number; ink?: string; grid?: string; headerBg?: string; p?: number }
// Pure: return the cell rects for a table so tests + sub-anchors can reason without a canvas.
export function tableCells(rows: string[][], x: number, y: number, w: number, rowH: number): { r: number; c: number; x: number; y: number; w: number; h: number }[];
export function drawTable(ctx: CanvasRenderingContext2D, rows: string[][], x: number, y: number, w: number, style?: TableStyle): void;
```
`tableCells`: equal column widths `w/cols`, row height `rowH`, row `r` at `y + r*rowH`. `drawTable`: draw grid lines, header row (bold + `headerBg`) if `style.header`, cells revealed progressively by `style.p` (reveal `floor(p*rows.length)` rows, last row fading). Deterministic.
Tests (tableCells): 2×3 table → 6 cells with correct x/y/w/h; column widths = w/3; row 1 y = y+rowH.
- [ ] **Step 3:** measure.ts — `table` → `{ w: c.w ?? 420, h: rows.length * (rowH ?? 34) }`.
- [ ] **Step 4:** compile.ts — `table` handler: `drawTable(layer, c.rows, box.x, box.y, box.w, { header:c.header, rowH:c.rowH, ink:c.ink, p })`.
- [ ] **Step 5:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.

---

### Task 2: Sub-anchors

**Files:** Create `src/render/gcl/subanchors.ts` + `subanchors.test.ts`; modify `layout.ts`.

- [ ] **Step 1 (TDD, pure):** `subanchors.ts`:
```ts
import type { Box } from "./anchors";
// Named points a rich component publishes, in absolute view coords, given its placement box.
export function subAnchors(c: Component, box: Box): Record<string, [number, number]>;
```
Handles:
- chart bar/line/area/scatter: `bar0..barN` / `pt0..ptN` at each datum's plotted (sx,sy) via `makePlot(area, domain, ...)`; plus `peak` = the max-value datum's point, `first`/`last`.
- chart pie: `slice0..sliceN` at each slice's mid-angle midpoint.
- shape circle/polygon/star: `top`/`bottom`/`left`/`right`/`center` cardinal points; `v0..vN` vertices (polygon/star).
- map: `<featureId>` → `featureCenter` projected via `fitProjection(features, area)`; plus each marker id.
- timeline: `<year>` or `ev0..evN` at each event's `tl.sx(at)`.
- others: `{ center: boxCenter }` only.
All PURE (makePlot/fitProjection/makeTimeline are ctx-free). 
Tests: a bar chart with data [{value:1},{value:5},{value:2}] → `peak` equals the x of index 1; shape circle → `top` is above center by r; map → a feature id resolves to a point inside its box.
- [ ] **Step 2:** layout.ts — after registering a component's own `id` box, also compute `subAnchors(c, box)` and register each as `"<id>.<handle>"` → a tiny Box centered at that point in the `boxes` map. (Only for components with an `id`.) Now `target:"chart1.peak"`, `motion.to:"map1.persia"`, `callout target:"shape1.top"` all resolve through the existing resolver.
- [ ] **Step 3:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.

---

### Task 3: Harvest — disc/planet + riemann chart mode

**Files:** modify `src/render/gcl/compile.ts`, `schema.ts` (extend existing `shape`/`chart` unions minimally).

- [ ] **Step 1:** `disc` polish — the existing `shape:"disc"` handler: render a shaded sphere (radial gradient light→dark + `radialGlow` rim) instead of a flat disc, so it reads as a planet/cell/atom body. Optional `shine?` and two-color `fill` (`[light,dark]`). Deterministic.
- [ ] **Step 2:** `riemann` chart mode — add `chart:"riemann"` (or `shape:"riemann"`): draw `n` rectangles under a function `fn` over `[a,b]` (reuse `compileExpr`), building in one-by-one (stagger), the classic calculus visual harvested from the calculus lesson. Fields: `fn`, `xDomain`, `n`, `color`.
- [ ] **Step 3:** measure handles the new modes (disc uses r; riemann uses chart default box).
- [ ] **Step 4:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.
- [ ] **Step 5 (browser verify):** temp scene: a `table` (with header, building rows); a bar chart with an `id`, plus a `callout target:"<chartid>.peak"` and a `highlight target:"<chartid>.bar2"` (proving sub-anchors); a `disc` planet; a `riemann` sum. Seek; confirm the table builds, the callout/highlight land on the correct chart parts, disc shades, riemann builds; deterministic, no console errors; screenshots. REMOVE temp cards (App.tsx zero diff).

---

## Self-Review
- `table` (new primitive, in gcl/ per reuse-only) + component + measure + handler: Task 1. ✅
- Sub-anchors (chart/shape/map/timeline parts → `<id>.<handle>` resolvable by attention/motion/callout): Task 2, wired through the EXISTING resolver (no new plumbing). ✅
- Harvest (disc/planet, riemann): Task 3 — representative bespoke→named primitives; pattern documented for extending. ✅
- Determinism: table + subAnchors pure/ctx-free; riemann via compileExpr (pure). ✅
- Reuse-only: table primitive lives in gcl/table.ts (render/* untouched). ✅
- Note: full harvest of every bespoke lesson visual (neuron membrane, orbit rig) is deliberately NOT exhaustive here — P6 harvests the two clearest reusable ones and leaves the pattern; the 4 lessons are re-authored in P7 to prove coverage, which will surface any remaining must-harvest visual.
