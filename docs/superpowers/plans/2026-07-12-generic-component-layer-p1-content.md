# GCL Phase 1 — Content Family + Layout + Narration Timing

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Extend the GCL so an author can place the full content vocabulary (text, equation, icon, legend, stat, chart, shape, parametric, textPath, image, map, timeline) and have the system auto-lay-them-out and time them to narration — reaching the design spec's Family A.

**Architecture:** Add three pure engines under `src/render/gcl/` — `measure.ts` (component → size), `layout.ts` (auto-placement + id boxes), and narration timing in `timing.ts` — and grow `schema.ts` + `compile.ts` to cover every content component, compiling each to the exact existing primitive (see `.superpowers/sdd/p1-signatures.md`).

**Tech Stack:** TypeScript, Canvas 2D, vitest for pure logic, browser preview for render.

## Global Constraints

- DO NOT COMMIT. Leave work uncommitted.
- Deterministic/seekable: no `Date.now`/`Math.random`/`performance.now`/`new Date()`; randomness only via `prng`. Layout/measure/timing are pure functions of their inputs (NOT of wall-clock, NOT of `t`).
- REUSE-ONLY: only add/modify files under `src/render/gcl/`. Never modify `render/*` (outside gcl) or `slides/*`.
- View space 920×430.
- **Measurement must be ctx-free** (analytic) so it runs in node/vitest: estimate text width as `text.length * fontPx * 0.52`; use `measureMath(src,size)` (already ctx-free) for equations. Do NOT call `ctx.measureText` in measure/layout.
- Exact primitive signatures: read `.superpowers/sdd/p1-signatures.md`. Do not guess.
- Reference the P0 code already in `src/render/gcl/` (schema/parse/anchors/timing/compile/index) and follow its style.

---

### Task 1: Schema — content component variants

**Files:** Modify `src/render/gcl/schema.ts`

**Interfaces produced:** the `Component` union gains these variants (all extend `Base`). Add shared optional style fields to variants as shown. Keep P0's `heading`/`stat` (heading stays; treat it as sugar for `text` role:"title" — keep both).

- [ ] **Step 1: Extend the Component union**

Add these variants (fields beyond `Base`):
```ts
// text: role drives default size/weight/placement; mode drives kinetic entrance
| (Base & { type: "text"; text: string; role?: "title" | "body" | "bullet" | "caption"; mode?: "fade" | "word" | "typewriter" | "slam" | "scramble"; size?: number; color?: string; align?: CanvasTextAlign })
| (Base & { type: "textPath"; text: string; path: Vec2[]; size?: number; color?: string })
| (Base & { type: "equation"; tex: string; size?: number; color?: string; align?: "left" | "center" | "right" })
// stat stays as defined in P0 but ALSO accept fmt passthrough:
| (Base & { type: "stat"; value: number; unit?: string; label?: string; size?: number; color?: string; commas?: boolean; decimals?: number; prefix?: string })
| (Base & { type: "chart"; chart: "bar" | "line" | "area" | "scatter" | "pie" | "function";
            data?: { label: string; value: number; color?: string }[];   // bar/pie
            series?: [number, number][];                                   // line/area/scatter
            fn?: string;                                                   // function (safe-expr in x)
            xDomain?: [number, number]; yDomain?: [number, number];
            w?: number; h?: number; color?: string; donut?: number; axes?: boolean; xLabel?: string; yLabel?: string })
| (Base & { type: "shape"; shape: "circle" | "polygon" | "star" | "heart" | "path" | "disc";
            r?: number; sides?: number; points?: Vec2[]; fill?: string; stroke?: string; width?: number })
| (Base & { type: "parametric"; fx: string; fy: string; uDomain?: [number, number]; samples?: number; color?: string; width?: number })
| (Base & { type: "icon"; name: string; size?: number; color?: string; filled?: boolean })
| (Base & { type: "image"; src: string; w: number; h: number; rotate?: number })
| (Base & { type: "legend"; categories: string[]; rowH?: number })
| (Base & { type: "map"; features: { id: string; rings: [number, number][][] }[];
            markers?: { lon: number; lat: number; label?: string; icon?: string }[];
            flows?: { from: [number, number]; to: [number, number]; color?: string }[]; w?: number; h?: number })
| (Base & { type: "timeline"; from: number; to: number; events?: { at: number; label: string; above?: boolean }[]; eras?: { from: number; to: number; label: string; color?: string }[]; playhead?: number; w?: number; h?: number })
```
Add to `Base` (used by layout): `size?` stays per-variant; add nothing else — `at`, `layer`, `cue`, `start`, `dur`, `enter`, `id` already exist.

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → exit 0.

---

### Task 2: Measurement engine (`measure.ts`)

**Files:** Create `src/render/gcl/measure.ts` + `measure.test.ts`

**Interfaces produced:** `Size { w: number; h: number }`, `measureComponent(c: Component): Size` — pure, ctx-free.

Sizing rules (deterministic, analytic):
- text: `fontPx = size ?? roleSize(role)` where title=30, body=20, bullet=18, caption=14. `w = estimateTextWidth(text, fontPx)`, `h = fontPx * 1.3`. `estimateTextWidth = text.length * fontPx * 0.52`.
- heading: like text title.
- stat: `w = estimateTextWidth(String(value)+unit, size??44)`, `h = (size??44)*1.5` (counts label line).
- equation: `const m = measureMath(tex, size ?? 30); return { w: m.w, h: m.h }`.
- icon: `{ w: size??28, h: size??28 }`.
- legend: `{ w: 160, h: categories.length * (rowH??20) }`.
- chart: `{ w: w ?? 360, h: h ?? 220 }`.
- shape/disc: `{ w: (r??60)*2, h: (r??60)*2 }` (path: bbox of points).
- parametric: `{ w: 300, h: 220 }`.
- image: `{ w, h }`.
- map: `{ w: w ?? 520, h: h ?? 300 }`.
- timeline: `{ w: w ?? 720, h: h ?? 120 }`.
- textPath: bbox of path points.

- [ ] **Step 1: Write failing tests** — assert: text title width ≈ `len*30*0.52`, height 39; icon default 28×28; legend of 3 rows = 60 tall; chart default 360×220; equation uses measureMath (assert w>0, h>0 for `"x^2"`).
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `measureComponent`** per the rules above (import `measureMath` from `../mathtext`).
- [ ] **Step 4: Run → pass. `npx tsc --noEmit` → 0.**

---

### Task 3: Layout engine (`layout.ts`)

**Files:** Create `src/render/gcl/layout.ts` + `layout.test.ts`

**Interfaces produced:**
```ts
export interface Placement { index: number; cx: number; cy: number; w: number; h: number }
export interface LayoutResult { placements: Placement[]; boxes: Map<string, Box> } // Box from ./anchors
export function layoutScene(components: Component[], viewW: number, viewH: number): LayoutResult
```

Algorithm (pure, deterministic):
1. Measure every component (`measureComponent`).
2. Split into **anchored** (has explicit `at`) and **auto** (no `at`).
3. Anchored: `cx,cy = resolvePosition(c.at, {viewW,viewH,boxes:emptyForNow})` (coords/slots only in this pass; id→id anchoring resolved in a second pass after auto boxes exist). Place centered on that point.
4. Auto: flow in a centered vertical stack. Title-role text pins to top band (y≈70). Remaining auto components stack centered in the middle band with `gap=18`, vertically centered as a group. A single wide component (chart/map/timeline, w>viewW*0.5) centers alone.
5. Build `boxes` map: for every component with an `id`, `boxes.set(id, {x:cx-w/2,y:cy-h/2,w,h})`.
6. Second pass: re-resolve anchored components whose `at` is an id, now that boxes exist.

Keep it simple but functional — the "template matching" from the spec is a later refinement; a good centered-stack + top-pinned-title + id-anchoring is the P1 bar.

- [ ] **Step 1: Failing tests** — (a) two auto body texts stack vertically, both centered on x=460, second below first; (b) a title-role text pins near top (cy<120); (c) a component with `at:[300,200]` places its center at 300,200; (d) `boxes` contains an entry for a component with `id`; (e) a component with `at:"other"` (an id) centers on that other component's box center.
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `layoutScene`** (import `measureComponent`, `resolvePosition`, types).
- [ ] **Step 4: Run → pass. tsc → 0.**

---

### Task 4: Narration timing (`timing.ts` extension)

**Files:** Modify `src/render/gcl/timing.ts` + `timing.test.ts`

**Interfaces produced:** `narrationTiming(narration: string[], opts?: { wps?: number; min?: number; lead?: number }): number[]` — returns the cumulative START time (seconds) of each sentence. Duration of sentence i = `max(min ?? 1.6, wordCount / (wps ?? 2.6))`; start[0]=0; start[i]=start[i-1]+dur[i-1]. Pure.

Keep `resolveTiming` as-is (P0). `compileScene` will call `narrationTiming` to build `cueTimes` instead of the 2.8s stub.

- [ ] **Step 1: Failing tests** — sentence "a b c d e f" (6 words) at wps 2 → dur 3; a 2-word sentence hits the `min` floor; start times are cumulative; empty array → `[]`.
- [ ] **Step 2: Run → fail. Step 3: Implement. Step 4: Run → pass.**

---

### Task 5: Compiler — core content handlers + engine wiring

**Files:** Modify `src/render/gcl/compile.ts`

Rewire `compileScene`:
1. Compute `cueTimes = narrationTiming(marker.narration ?? [])`.
2. `const t0 = resolveTiming(components, { cueTimes })` (unchanged).
3. Compute layout ONCE, lazily, inside `render` on first call and cache it in a closure var (`let laid: LayoutResult | null = null; if (!laid) laid = layoutScene(components, W, H)`). Layout is pure/ctx-free so this stays seekable. Use `laid.placements[i]` for each component's `cx,cy,w,h` INSTEAD of `resolvePosition`+`defaultSlot` (layout now owns placement; but still honor explicit `at` because layout already applied it).
4. For each component, `p = phase(t, at, at+dur)`, `layer = frame.layer.ctx(c.layer ?? defaultLayerFor(type))`, then dispatch by `type`.

Handlers to implement in THIS task (core): `text`, `heading` (alias title text), `stat` (extend with fmt: decimals/prefix/commas/unit-suffix), `equation`, `icon`, `legend`.
- text: pick primitive by `mode` — fade→`fadeText(layer,text,cx,cy,p,font,color,align)`; word→`drawWordReveal(layer,text, leftX, cy, t, {font,color}, {start:at,mode:"rise"})`; typewriter→`drawTypewriter(layer,text,leftX,cy,p,{font,color},{cursor:true,t})`; slam→`drawSlam(layer,text,cx,cy,t,at,{font,color})`; scramble→`drawScramble(layer,text,cx,cy,t,at,{font,color})`. `font = weight+size` where title `700 30px`, body `500 20px`, bullet `500 18px`, caption `500 14px`, all `-apple-system, sans-serif`. `leftX = cx - w/2` for left-flowing modes.
- equation: `drawMath(layer, tex, cx, cy, { size, color, align, p })`.
- icon: `drawIcon(layer, name as IconName, cx, cy, size??28, { color, filled, alpha: p })` (guard unknown name: skip if not in iconNames).
- legend: `colorSemantics().legend(layer, categories, cx-w/2, cy-h/2, { rowH })`.
- stat: as P0 but fmt `{ commas, decimals, prefix, suffix: unit?` ` + unit` }`.

Provide `defaultLayerFor(type)`: text/heading/equation/stat/legend/icon → "annotation"; chart/shape/parametric/map/timeline → "mid"; image → "bg". (chart handlers land in Task 6.)

- [ ] **Step 1:** Implement the wiring + core handlers. Add a `TODO`-free `default:` that `console.warn`s unknown types (rich types handled in Task 6 will exist by then).
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass (existing tests still green).
- [ ] **Step 3 (browser verify):** temporarily add to `App.tsx` an informational scene:
```ts
renderFilm([
  { type:"scene", theme:"BLUEPRINT", narration:["Energy cannot be created or destroyed.","It only changes form.","This is conservation of energy."] },
  { type:"text", text:"Conservation of Energy", role:"title", cue:0 },
  { type:"equation", tex:"E = mc^2", cue:1 },
  { type:"text", text:"Energy only changes form.", role:"body", cue:2 },
  { type:"icon", name:"bolt", filled:true, color:"#e8c14a" },
])
```
Seek to end; confirm title pinned top, equation + body stacked/centered, icon placed, timed to narration, no console errors; screenshot. Then REMOVE the temp card (App.tsx back to zero diff).

---

### Task 6: Compiler — rich content handlers

**Files:** Modify `src/render/gcl/compile.ts`; create `src/render/gcl/expr.ts` + `expr.test.ts` (CONFIRMED: no safe evaluator exists in the repo — build one).

**Task 6a — safe expression evaluator (`expr.ts`), do this FIRST via TDD:**
`export function compileExpr(src: string): (vars: Record<string, number>) => number`. Shunting-yard parse to RPN once, then a pure evaluator closure. NO `eval`/`Function`. Support:
- operators `+ - * / ^` (^, right-assoc), unary minus, parentheses;
- functions `sin cos tan asin acos atan exp log ln sqrt abs floor ceil round sign min max pow` (log = base-10, ln = natural);
- constants `pi`, `e`; variables (any identifier not a function/constant, e.g. `x`, `u`, `t`, `p`) read from `vars` (missing → 0);
- implicit multiplication (`2x`, `2(x+1)`, `)(`); scientific notation (`1e3`, `2.5e-2`).
- On parse error return a function that yields `NaN` (never throw at render).
Tests: `compileExpr("x^2")({x:3})===9`; `compileExpr("2x+1")({x:4})===9` (implicit mult); `compileExpr("sin(0)")({})===0`; `compileExpr("pi")({})≈Math.PI`; `compileExpr("1e3")({})===1000`; `compileExpr("-x")({x:5})===-5`; `compileExpr("(((")({})` is `NaN`. Determinism: no state between calls.

**Task 6b — rich handlers** (use `compileExpr` for `chart:function` and `parametric`):

Handlers: `chart`, `shape`, `parametric`, `textPath`, `image`, `map`, `timeline`. Use the placement box `{cx,cy,w,h}` to build plot/timeline areas (`area = {x:cx-w/2,y:cy-h/2,w,h}`).
- chart bar: `barChart(layer, makePlot(area,[0,1],[0,ymax]), data, { t, start:at, showValues:true, color })` (ymax from data max).
- chart line/area: `lineChart(layer, makePlot(area,xDomain,yDomain), series, p, { area: chart==="area", color, markers:true })` + `axes` if `axes!==false`.
- chart scatter: `scatter(layer, plot, series, t, { color, start:at })` + axes.
- chart pie: `pie(layer, cx, cy, Math.min(w,h)/2, data, p, { donut, labels:true })`.
- chart function: `plotFunction(layer, plot, x=>evalExpr(fn,{x}), p, { color })` + axes.
- shape circle/polygon/star/heart: build points via `circleShape/polygonShape/starShape/heartShape` centered at cx,cy radius r; then `strokeOn(layer, pts, p, { color: stroke, width })` and/or fill (if `fill`, build a Path2D from pts and fill with alpha p). disc: `radialGlow`-style gradient disc (radialGlow(layer,cx,cy,r,fill??color,p) then a filled circle). path: `strokeOn(layer, smoothPath(points,{curve:"catmullRom"}), p, {color:stroke,width})`.
- parametric: sample u over uDomain (default [0,1], samples default 120), points `[evalExpr(fx,{u}), evalExpr(fy,{u})]`, `strokeOn(layer, pts, p, {color,width})`.
- textPath: `drawTextAlongPath(layer, text, path, p, { font:`500 ${size??18}px -apple-system, sans-serif`, color })`.
- image: needs a preloaded HTMLImageElement — for P1, guard: if `frame`/document available, lazily `new Image()` load and `drawSvg(layer, img, cx, cy, w, h, {alpha:p, rotate})`; cache the image in a closure keyed by src. If image not yet loaded, skip (draws next frame). Determinism note: image load is async but pixels for a given loaded state are pure; acceptable (documented) — a scene re-seek after load is stable.
- map: `const proj = fitProjection(features, area); drawMap(layer, features, proj, ()=>({stroke:"#...",fill:"#...",p})); markers via geoMarker; flows via flowArrow(...,p)`.
- timeline: `const tl = makeTimeline(area, from, to); timelineAxis(layer, tl, {p}); eras(layer, tl, eras??[], p); events(layer, tl, events??[], t, {start:at}); if playhead!=null playhead(layer, tl, playhead, {label:true})`.

- [ ] **Step 1:** Determine expr evaluator (search; import or wrap). Implement all rich handlers.
- [ ] **Step 2:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.
- [ ] **Step 3 (browser verify):** temp scene exercising a bar chart, a star shape, a parametric sine curve, and a timeline; seek; confirm each renders with no console errors; screenshot; REMOVE temp card.

---

## Self-Review
- Family A coverage: text/textPath/stat/equation/chart/shape/parametric/icon/image/legend/map/timeline — all have a schema variant (Task 1) and a compile handler (Tasks 5–6). ✅ (`table` is P6.)
- Layout engine (measure + auto-flow + id boxes): Tasks 2–3. ✅
- Narration timing (weighted): Task 4, wired in Task 5. ✅
- Determinism: measure/layout/timing pure & ctx-free; layout cached in closure (independent of t); expr via safe evaluator; image load documented. ✅
- Reuse-only: all changes under gcl/. ✅
- Placeholder scan: expr evaluator is "search-then-import" (Task 6 Step 1) — a real decision point, not a placeholder.
