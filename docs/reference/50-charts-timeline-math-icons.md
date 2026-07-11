# Step 12 · Plots, charts & counters — `src/render/charts.ts`

**Responsibility.** Data-viz primitives: a coordinate mapper (`makePlot`), axes/grid, animated function plotting, and bar / line / area / scatter / pie charts bound to data. Everything animates from a progress value `p` (or `t` for staggered cascades) and is deterministic/seekable. Reuses `strokes` (draw-on), `sequence`-style stagger, and `type-motion` (`formatNumber` for formatted labels).

**When to use.** Whenever a lesson needs quantitative graphics: a plotted equation `y = f(x)`, a bar/line/scatter/pie of tabular data, or a value counter tied to a chart. Build one `Plot` (the coordinate frame) with `makePlot`, draw `axes` into it, then draw any number of series into the same `Plot`.

Everything is drawn directly to a `CanvasRenderingContext2D`. Default colors are the engine's dark-theme palette (teal `#5cc8ae`, amber `#e8a13c`, slate inks).

---

### makePlot

```ts
export function makePlot(area: PlotArea, xDomain: [number, number], yDomain: [number, number]): Plot
```

```ts
export interface PlotArea { x: number; y: number; w: number; h: number; }

export interface Plot extends PlotArea {
  xDomain: [number, number];
  yDomain: [number, number];
  sx(v: number): number;   // data x → pixel x
  sy(v: number): number;   // data y → pixel y
}
```

- **Purpose:** Create the coordinate frame that maps data-space values to pixels. Returns a `Plot` object whose `sx`/`sy` you use everywhere else.
- **Parameters / options:**
  - `area: PlotArea` — the pixel rectangle the plot occupies. `x, y` = top-left corner; `w, h` = width/height in px. The returned `Plot` spreads these fields, so `plot.x/y/w/h` are available.
  - `xDomain: [number, number]` — `[x0, x1]` data range mapped across `area.w`. `x0` maps to the left edge, `x1` to the right.
  - `yDomain: [number, number]` — `[y0, y1]` data range mapped across `area.h`. **`y` is inverted:** `y0` maps to the bottom (`area.y + area.h`), `y1` to the top. So `sy(y0)` is the baseline.
  - Returned methods:
    - `sx(v)` = `area.x + ((v - x0) / (x1 - x0 || 1)) * area.w`. Division guarded by `|| 1` so a zero-width domain won't divide by zero.
    - `sy(v)` = `area.y + area.h - ((v - y0) / (y1 - y0 || 1)) * area.h`.
- **Example:**
  ```ts
  const plot = makePlot({ x: 120, y: 80, w: 700, h: 380 }, [0, 10], [0, 100]);
  const px = plot.sx(5);   // horizontal center
  const py = plot.sy(50);  // vertical center
  ```
- **Composes with:** every other function in this module takes a `Plot`. `sy(plot.yDomain[0])` is the shared value-baseline used by `barChart` and `lineChart`'s area fill.

---

### niceTicks

```ts
export function niceTicks([a, b]: [number, number], count = 5): number[]
```

- **Purpose:** Compute "nice" evenly-spaced tick values across a domain, snapped to 1/2/5 × 10ⁿ steps. Used as the default tick set for `axes` and `timelineAxis`.
- **Parameters / options:**
  - `[a, b]: [number, number]` — the domain. Order-independent (internally sorted via `Math.min`/`Math.max`).
  - `count = 5` — target number of ticks (approximate; actual count depends on the chosen step). `Math.max(1, count)` guards against 0.
- **Behavior:** picks a step from `{1, 2, 5} × 10^floor(log10(span/count))`, starts at the first multiple ≥ the low end, and emits values through the high end (inclusive, with a `1e-9` epsilon). Each value is re-snapped via `Math.round(v/step)*step`.
- **Example:**
  ```ts
  niceTicks([0, 100]);      // [0, 20, 40, 60, 80, 100]
  niceTicks([0, 10], 4);    // e.g. [0, 2.5, 5, 7.5, 10] → snapped
  ```
- **Composes with:** `axes` defaults `xTicks`/`yTicks` to `niceTicks(plot.xDomain)` / `niceTicks(plot.yDomain)`; `timelineAxis` uses `niceTicks([tl.from, tl.to], 6)`.

---

### axes

```ts
export function axes(ctx: CanvasRenderingContext2D, plot: Plot, o: AxesOptions = {}): void
```

```ts
export interface AxesOptions {
  color?: string;
  gridColor?: string;
  ink?: string;
  xTicks?: number[];
  yTicks?: number[];
  grid?: boolean;
  xLabel?: string;
  yLabel?: string;
  fmt?: NumberFormat;
  fontPx?: number;
  p?: number; // reveal 0..1 (axes wipe in)
}
```

- **Purpose:** Draw the L-shaped axis (left + bottom lines), optional grid, tick labels, and optional axis titles for a `Plot`.
- **Parameters / options:**
  - `color: string` (default `"#5b6b78"`) — axis line color; also grid stroke fallback role.
  - `gridColor: string` (default `"rgba(255,255,255,0.06)"`) — grid line color; *use to* tune grid contrast.
  - `ink: string` (default `"#93a4b0"`) — color of tick labels and axis titles.
  - `xTicks: number[]` (default `niceTicks(plot.xDomain)`) — explicit x tick values.
  - `yTicks: number[]` (default `niceTicks(plot.yDomain)`) — explicit y tick values.
  - `grid: boolean` (default falsy → off) — when true, draws vertical + horizontal grid lines at every tick.
  - `xLabel: string` (default none) — centered title under the x axis (at `y + h + 34`).
  - `yLabel: string` (default none) — title rotated -90° to the left of the y axis (at `x - 40`).
  - `fmt: NumberFormat` (default undefined → plain) — passed to `formatNumber` for tick labels (from `type-motion`; e.g. currency/percent/compact formatting).
  - `fontPx: number` (default `11`) — tick/label font size; font family is `-apple-system, sans-serif`.
  - `p: number` (default `1`, clamped 0..1) — reveal fraction. Multiplies `globalAlpha`, so the whole axis group fades/wipes in as `p` goes 0→1.
- **Layout constants:** x tick labels at `y + h + 16`; y tick labels right-aligned at `x - 8` (`+4` baseline). Axis line width `1.5`, grid width `1`.
- **Example:**
  ```ts
  axes(ctx, plot, { grid: true, xLabel: "time (s)", yLabel: "velocity", p: reveal });
  ```
- **Composes with:** call once per `Plot` before drawing series. Share the same `p` with series draw-ons to stage a full reveal.

---

### plotFunction

```ts
export function plotFunction(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  fn: (x: number) => number,
  p: number,
  opts: { color?: string; width?: number; samples?: number } = {},
): void
```

- **Purpose:** Sample and draw `y = fn(x)` across the plot's x-domain, revealing the first `p` fraction of the curve (draw-on via `strokeOn`).
- **Parameters / options:**
  - `fn: (x: number) => number` — the function in data space; sampled at `samples + 1` evenly-spaced x values across `plot.xDomain`.
  - `p: number` — draw-on fraction 0..1 (handled by `strokeOn`, which reveals the first `p` of the polyline length).
  - `opts.color: string` (default `"#5cc8ae"`) — stroke color.
  - `opts.width: number` (default `2.5`) — stroke width in px.
  - `opts.samples: number` (default `120`) — number of segments; higher = smoother curve, more cost.
- **Example:**
  ```ts
  plotFunction(ctx, plot, (x) => Math.sin(x), reveal, { color: "#6db0e8", samples: 200 });
  ```
- **Composes with:** `strokes.strokeOn` for the reveal; draw after `axes`.

---

### barChart

```ts
export function barChart(ctx: CanvasRenderingContext2D, plot: Plot, data: Datum[], o: BarOptions): void
```

```ts
export interface Datum {
  label: string;
  value: number;
  color?: string;
}

export interface BarOptions {
  t: number;
  start?: number;
  step?: number;
  dur?: number;
  color?: string;
  ink?: string;
  gap?: number;         // fraction of slot that is gap (0..1)
  showValues?: boolean;
  fmt?: NumberFormat;
}
```

- **Purpose:** Draw bars that grow up from the value-baseline (`sy(yDomain[0])`) in a staggered cascade. Bar heights come from the plot's `yDomain`.
- **Parameters / options:**
  - `data: Datum[]` — one bar per datum. `Datum.label` = x-axis label under the bar; `Datum.value` = bar height in data space; `Datum.color` (optional) = per-bar override.
  - `o.t: number` (**required**) — the master progress clock driving the cascade.
  - `o.start: number` (default `0`) — global delay before the first bar animates.
  - `o.step: number` (default `0.15`) — per-bar stagger; bar `i` starts at `start + i*step`.
  - `o.dur: number` (default `0.5`) — per-bar grow duration. Each bar's local progress `gp = clamp01((t - start - i*step) / dur)`.
  - `o.color: string` (default `"#5cc8ae"`) — bar fill fallback when `Datum.color` is absent.
  - `o.ink: string` (default `"#93a4b0"` for the label, `"#cdd8e2"` reset for values) — label/value text color.
  - `o.gap: number` (default `0.35`) — fraction of each slot left empty as spacing. Bar width `bw = (w/data.length) * (1 - gap)`.
  - `o.showValues: boolean` (default falsy) — when true, draws the formatted numeric value above each bar, fading in with `gp`.
  - `o.fmt: NumberFormat` (default plain) — number format for the value labels.
- **Details:** bars use `roundRect` with top corners rounded `[4,4,0,0]`. Bar top is clamped so `value` below the baseline can't invert the bar (`Math.min(base, lerp(base, full, gp))`). Label font `600 11px`.
- **Example:**
  ```ts
  barChart(ctx, plot, [
    { label: "A", value: 30 },
    { label: "B", value: 55, color: "#e8a13c" },
  ], { t, showValues: true, fmt: "compact" });
  ```
- **Composes with:** a `Plot` whose `yDomain` includes 0 as the baseline; `type-motion.formatNumber` for value labels.

---

### lineChart

```ts
export function lineChart(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  series: [number, number][],
  p: number,
  o: LineOptions = {},
): void
```

```ts
export interface LineOptions {
  color?: string;
  width?: number;
  area?: boolean;        // fill under the line
  areaColor?: string;
  markers?: boolean;
  markerColor?: string;
}
```

- **Purpose:** Draw a line series bound to `[x, y]` data, drawing on to `p`, with optional area fill and point markers.
- **Parameters / options:**
  - `series: [number, number][]` — data-space points; mapped through `plot.sx`/`plot.sy`.
  - `p: number` — draw-on fraction 0..1 (via `strokeOn`).
  - `o.color: string` (default `"#5cc8ae"`) — line stroke color.
  - `o.width: number` (default `2.5`) — line width.
  - `o.area: boolean` (default falsy) — when true, fills the region under the revealed portion of the line down to the value-baseline `sy(yDomain[0])` (not the plot floor). The revealed sub-path uses `Math.max(2, ceil(pts.length * p))` points; fill drawn at `globalAlpha *= 0.9`.
  - `o.areaColor: string` (default `"rgba(92,200,174,0.18)"`) — area fill color.
  - `o.markers: boolean` (default falsy) — when true, draws a radius-3 dot at each revealed point (`ceil(pts.length * p)` points).
  - `o.markerColor: string` (default `o.color` → `"#5cc8ae"`) — marker fill color.
- **Example:**
  ```ts
  lineChart(ctx, plot, [[0,0],[1,4],[2,3],[3,7]], reveal,
    { area: true, markers: true, color: "#6db0e8" });
  ```
- **Composes with:** `strokes.strokeOn`; draw after `axes`. For a plotted equation use `plotFunction` instead.

---

### scatter

```ts
export function scatter(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  points: [number, number][],
  t: number,
  o: { color?: string; r?: number; start?: number; step?: number } = {},
): void
```

- **Purpose:** Draw scatter points that pop in one-by-one in a staggered cascade, each scaling up from 0.
- **Parameters / options:**
  - `points: [number, number][]` — data-space points.
  - `t: number` — master progress clock.
  - `o.color: string` (default `"#e8a13c"`) — point fill color.
  - `o.r: number` (default `4`) — full point radius in px. Actual radius is `r * gp`, so points grow in.
  - `o.start: number` (default `0`) — global delay.
  - `o.step: number` (default `0.03`) — per-point stagger; point `i` local progress `gp = clamp01((t - start - i*step) / 0.3)` (fixed 0.3s per-point duration). Alpha = `gp`.
- **Example:**
  ```ts
  scatter(ctx, plot, cloud, t, { color: "#a06be8", r: 5, step: 0.02 });
  ```
- **Composes with:** a `Plot` frame; pair with `axes`.

---

### pie

```ts
export function pie(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  data: Datum[],
  p: number,
  o: PieOptions = {},
): void
```

```ts
export interface PieOptions {
  donut?: number;      // inner radius fraction (0 = pie, 0.6 = donut)
  labels?: boolean;
  ink?: string;
  startAngle?: number;
}
```

- **Purpose:** Draw pie/donut wedges that sweep in as `p` 0→1, sized proportional to each datum's share of the total. **Does not use a `Plot`** — takes an explicit center and radius.
- **Parameters / options:**
  - `cx, cy, r: number` — center (px) and outer radius (px).
  - `data: Datum[]` — one wedge per datum; `Datum.value` is the share, `Datum.color` an optional override. `Datum.label` is not drawn (labels show the percentage instead).
  - `p: number` — 0..1 sweep progress; each wedge sweeps `frac * 2π * p`.
  - `o.donut: number` (default `0`) — inner-radius fraction. `0` = solid pie; e.g. `0.6` = donut with hole at `0.6*r`. Non-zero switches the wedge to an annular sector.
  - `o.labels: boolean` (default falsy) — when true and `p > 0.7`, draws each wedge's rounded percentage (`Math.round(frac*100)%`) at the wedge midpoint, fading in over `p` 0.7→1.0. Label color is fixed `#0e141a`, font `600 11px`.
  - `o.ink: string` — declared in the interface but **not read** by the implementation (percentage label color is hardcoded `#0e141a`).
  - `o.startAngle: number` (default `-Math.PI / 2`, i.e. 12 o'clock) — angle of the first wedge's start edge.
  - **Default palette** (when no `Datum.color`): `["#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b", "#a06be8", "#38ef7d"]`, cycled by index.
- **Example:**
  ```ts
  pie(ctx, 400, 250, 120, [
    { label: "x", value: 60 },
    { label: "y", value: 40 },
  ], reveal, { donut: 0.55, labels: true });
  ```
- **Composes with:** standalone; combine with `icons.legend`/`colorSemantics` for a labeled key.

---

# Step 13 · Timeline — `src/render/timeline.ts`

**Responsibility.** A timeline primitive: a date axis, eras (colored bands), events (markers + labels) on one or more parallel tracks, and a moving playhead. Dates are plain numbers (years; **negative = BCE**). Deterministic/seekable; reuses `strokes` (axis draw-on) and stagger (event/era cascade). Depends on `niceTicks` from `charts.ts`.

**When to use.** History/geology/process lessons that lay concepts along a date axis: dynasties as eras, key moments as events, and a "now" playhead sweeping across. Build one `Timeline` with `makeTimeline`, then layer `timelineAxis`, `eras`, `events`, `playhead` into it.

---

### makeTimeline

```ts
export function makeTimeline(
  area: { x: number; y: number; w: number; h: number },
  from: number, to: number,
  tracks = 1,
): Timeline
```

```ts
export interface Timeline {
  x: number; y: number; w: number; h: number;
  from: number; to: number; tracks: number;
  sx(date: number): number;     // date → pixel x
  trackY(track: number): number; // track index → pixel y
}
```

- **Purpose:** Create the timeline coordinate frame mapping dates (years) to pixel x, and track indices to pixel y.
- **Parameters / options:**
  - `area` — pixel rectangle (`x, y` top-left; `w, h` size). Spread onto the returned object.
  - `from, to: number` — date range in years. Negative = BCE. `from` maps to the left edge, `to` to the right.
  - `tracks: number` (default `1`) — number of parallel horizontal tracks (lanes for events/eras).
  - Methods:
    - `sx(d)` = `area.x + ((d - from) / (to - from || 1)) * area.w` (zero-span guarded).
    - `trackY(i)` — clamps `i` into `[0, tracks-1]`. For a single track returns the vertical center (`area.y + area.h*0.5`). For multiple tracks, distributes across `0.28 → 0.78` of `area.h` (`0.28 + (k/(tracks-1))*0.5`).
- **Example:**
  ```ts
  const tl = makeTimeline({ x: 100, y: 120, w: 760, h: 260 }, -500, 1500, 2);
  const px = tl.sx(1066);   // pixel x for year 1066 CE
  const py = tl.trackY(0);  // top track baseline
  ```
- **Composes with:** every other timeline function takes a `Timeline`.

---

### formatYear

```ts
export function formatYear(y: number): string
```

- **Purpose:** Format a year with a BCE/CE suffix.
- **Behavior:** `y < 0` → `` `${Math.abs(Math.round(y))} BCE` `` (e.g. `-500` → `"500 BCE"`); otherwise → `` `${Math.round(y)} CE` `` (e.g. `1066` → `"1066 CE"`). Year `0` is rendered `"0 CE"`.
- **Example:** `formatYear(-323); // "323 BCE"`
- **Composes with:** used internally by `timelineAxis` (tick labels) and `playhead` (handle label).

---

### timelineAxis

```ts
export function timelineAxis(ctx: CanvasRenderingContext2D, tl: Timeline, o: AxisOptions = {}): void
```

```ts
export interface AxisOptions {
  p?: number;             // axis draw-on
  color?: string;
  ink?: string;
  ticks?: number[];
  fontPx?: number;
  baselineFrac?: number;  // where the axis sits within h (default 0.5)
}
```

- **Purpose:** Draw the horizontal baseline (draw-on) plus tick marks and BCE/CE year labels.
- **Parameters / options:**
  - `o.p: number` (default `1`, clamped) — axis draw-on fraction. The baseline reveals via `strokeOn`; ticks only appear once the axis has swept past them (`tl.sx(v) > tl.x + tl.w*p + 2` are skipped), and the whole label group is multiplied by `globalAlpha *= p`.
  - `o.color: string` (default `"#5b6b78"`) — baseline + tick color.
  - `o.ink: string` (default `"#93a4b0"`) — year-label text color.
  - `o.ticks: number[]` (default `niceTicks([tl.from, tl.to], 6)`) — explicit tick years.
  - `o.fontPx: number` (default `11`) — label font size (`-apple-system, sans-serif`).
  - `o.baselineFrac: number` (default `0.5`) — vertical position of the baseline within `h`; the baseline y is `tl.y + tl.h*baselineFrac`.
- **Details:** ticks drawn as 8px vertical marks (`by-4 → by+4`); labels centered below at `by + 18` via `formatYear`. Baseline stroke width `2`.
- **Example:**
  ```ts
  timelineAxis(ctx, tl, { p: reveal, baselineFrac: 0.6 });
  ```
- **Composes with:** `strokes.strokeOn`, `charts.niceTicks`, `formatYear`. Draw first, then `eras`/`events`/`playhead`.

---

### eras

```ts
export function eras(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  list: Era[],
  p: number,
  opts: { height?: number; start?: number; step?: number } = {},
): void
```

```ts
export interface Era {
  from: number;
  to: number;
  label: string;
  color?: string;
  track?: number;
}
```

- **Purpose:** Draw colored era bands that grow horizontally from their start edge as `p` 0→1, in a staggered cascade, with a label that fades in.
- **Parameters / options:**
  - `list: Era[]` — each band spans `Era.from → Era.to` (years) on `Era.track` (default `0`). `Era.color` overrides the palette; `Era.label` is centered in the band.
  - `p: number` — master 0..1 progress driving the cascade.
  - `opts.height: number` (default `22`) — band height in px (centered on the track y).
  - `opts.start` — declared in the signature but **not used** in the era-progress formula (per-band progress is `clamp01((P - i*step) / max(1e-3, 1 - i*step))`).
  - `opts.step: number` (default `0.12`) — per-era stagger.
  - **Default palette:** `["#2f6b57", "#8a5a2b", "#3a5a7a", "#6b3a5a"]`, cycled by index.
- **Details:** band width grows as `(x1 - x0) * ep`; drawn with `roundRect` radius `5` at `globalAlpha = 0.9 * ep`. Label (`600 11px`, color `#eef5ef`) appears only when `ep > 0.6`, fading over `ep` 0.6→1.0.
- **Example:**
  ```ts
  eras(ctx, tl, [
    { from: -221, to: 206, label: "Qin/Han", track: 0 },
    { from: 618, to: 907, label: "Tang", color: "#3a5a7a", track: 1 },
  ], reveal);
  ```
- **Composes with:** a multi-track `Timeline` when `Era.track` varies; draw after `timelineAxis`.

---

### events

```ts
export function events(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  list: TimelineEvent[],
  t: number,
  opts: { start?: number; step?: number; ink?: string } = {},
): void
```

```ts
export interface TimelineEvent {
  at: number;
  label: string;
  track?: number;
  color?: string;
  above?: boolean;   // label above (default) or below the marker
}
```

- **Purpose:** Draw event markers (a stem + dot pin) with labels appearing in a staggered cascade.
- **Parameters / options:**
  - `list: TimelineEvent[]` — `at` = year of the event; `label` = text; `track` (default `0`) = which lane's baseline the pin sits on; `color` overrides the marker color.
  - `above: boolean` — controls label/stem direction. Default (undefined or `true`) points **up** (`dir = -1`, label above). Only `above === false` flips it **down** (`dir = 1`, label below).
  - `t: number` — master progress clock.
  - `opts.start: number` (default `0`) — global delay.
  - `opts.step: number` (default `0.25`) — per-event stagger; event `i` local progress `ep = clamp01((t - start - i*step) / 0.4)`.
  - `opts.ink: string` (default `"#eef5ef"`) — label text color.
- **Details:** stem length grows to `26*ep`; dot radius `3.5`; marker stroke/fill defaults `"#e8a13c"`. Label offset from the dot: `stem + 4` (up) or `stem + 12` (down). Font `600 11px`, centered.
- **Example:**
  ```ts
  events(ctx, tl, [
    { at: 1066, label: "Hastings" },
    { at: 1215, label: "Magna Carta", above: false, color: "#6db0e8" },
  ], t);
  ```
- **Composes with:** a `Timeline`; stack multiple tracks + `above` to avoid label collisions.

---

### playhead

```ts
export function playhead(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  atDate: number,
  opts: { color?: string; label?: boolean } = {},
): void
```

- **Purpose:** Draw a vertical "now" marker at `atDate` — a full-height line with a triangular handle at the top, optionally labeled with the year.
- **Parameters / options:**
  - `atDate: number` — the year the playhead sits at (mapped via `tl.sx`). Animate this to sweep the timeline.
  - `opts.color: string` (default `"#5cc8ae"`) — line, handle, and label-chip color.
  - `opts.label: boolean` (default falsy) — when true, draws a colored chip above the top edge (`tl.y - 18`) containing `formatYear(atDate)` in dark ink (`#0e141a`, font `700 10px`). Chip width = text width + 10.
- **Details:** line spans the full timeline height (`tl.y → tl.y + tl.h`), width `2`; handle is a downward triangle from the top edge to `tl.y + 8`.
- **Example:**
  ```ts
  playhead(ctx, tl, lerp(tl.from, tl.to, t), { label: true });
  ```
- **Composes with:** `formatYear`; draw last so it sits above eras/events.

---

# Step 17 · Math typesetting — `src/render/mathtext.ts`

**Responsibility.** A compact, canvas-native math typesetter for the LaTeX subset a lesson actually needs: text runs, super/subscripts, fractions, square roots, and a symbol dictionary (Greek, operators, arrows, ∑ ∫ ∏ …). Fully deterministic and offline — no KaTeX/DOM/font pipeline — so it renders and scrubs reliably. `drawMath` supports a left-to-right draw-on reveal.

**When to use.** Any display math in a lesson: chemistry/physics/algebra formulas. Use `measureMath` to lay out (get a box you can position), `drawMath` to render at a point with alignment and an optional writing-on animation. **It is a pragmatic subset, not full LaTeX** — see the explicit "supported / not supported" list below.

Math text uses a serif font (`"Georgia", "Times New Roman", serif`); single Latin letters are auto-italicized (as math variables).

---

### Supported LaTeX-subset syntax

The tokenizer/parser handles **exactly** the following, and nothing else:

- **Backslash commands** `\name` — a run of ASCII letters after `\`. If `name` is a key in `SYMBOLS` (below) it renders the symbol; otherwise the command name is rendered as literal text (unknown commands are **not** dropped — `\foo` prints "foo"). A single non-letter after `\` (e.g. `\,`, `\{`) is captured as a one-char command and, not being in `SYMBOLS`, prints that character literally.
- **Superscript** `^` — raises the next argument. The base is the previously-parsed atom; the exponent is one argument. Exponent rendered at `size * 0.72`.
- **Subscript** `_` — lowers the next argument, at `size * 0.72`.
- **Groups** `{ … }` — group multiple atoms into a single argument/run (e.g. `x^{2n}`, `\frac{a+b}{c}`).
- **`\frac{num}{den}`** — a fraction with a drawn bar. Numerator/denominator shrink to `SCRIPT = 0.85` of the current size.
- **`\sqrt{body}`** — a square root with a drawn radical. (Only the plain form; **no** index/nth-root `\sqrt[n]{...}` — the `[n]` would parse as literal characters.)
- **Argument rules:** after `^ _ \frac \sqrt`, an argument is either a single `{group}` or exactly one token/command (including a nested `\frac`/`\sqrt`). So `x^2` takes just `2`; `x^{2n}` takes the group.
- **Spaces** — literal space characters are **skipped** (spacing comes from layout, not source spaces).
- **Letters vs symbols** — a single ASCII letter atom is drawn italic (math-variable style); digits/punctuation/symbols are upright.

**NOT supported** (these will render as literal text or be ignored, never as structured math):
- Any command not in the `SYMBOLS` table (renders as its literal name — e.g. `\mathbf`, `\text`, `\vec`, `\hat`, `\overline`, `\left`, `\right`, `\begin`/`\end`, matrices, `\sqrt[n]`).
- Environments, alignment, matrices, cases, arrays.
- Delimiter auto-sizing (`\left(` … `\right)`), big operators with limits attached above/below (∑ etc. render as a plain glyph; `_`/`^` on them attach as ordinary sub/superscripts, not limits).
- Multi-argument macros beyond `\frac`; accents; `\text{}`; color/font commands.
- Nested-index roots; over/underbraces; integrals-with-limits stacking.

---

### The full SYMBOLS dictionary

Every key (use as `\key`) and its glyph:

**Greek letters**
| key | glyph | key | glyph | key | glyph |
|---|---|---|---|---|---|
| `alpha` | α | `beta` | β | `gamma` | γ |
| `delta` | δ | `Delta` | Δ | `epsilon` | ε |
| `zeta` | ζ | `eta` | η | `theta` | θ |
| `Theta` | Θ | `lambda` | λ | `mu` | μ |
| `nu` | ν | `xi` | ξ | `pi` | π |
| `Pi` | Π | `rho` | ρ | `sigma` | σ |
| `Sigma` | Σ | `tau` | τ | `phi` | φ |
| `Phi` | Φ | `chi` | χ | `psi` | ψ |
| `omega` | ω | `Omega` | Ω | | |

**Operators / relations**
| key | glyph | key | glyph | key | glyph |
|---|---|---|---|---|---|
| `times` | × | `cdot` | · | `div` | ÷ |
| `pm` | ± | `mp` | ∓ | `leq` | ≤ |
| `geq` | ≥ | `neq` | ≠ | `approx` | ≈ |
| `equiv` | ≡ | `propto` | ∝ | `deg` | ° |

**Arrows**
| key | glyph | key | glyph |
|---|---|---|---|
| `to` | → | `rightarrow` | → |
| `Rightarrow` | ⇒ | `leftarrow` | ← |
| `leftrightarrow` | ↔ | | |

**Big operators / calculus / misc**
| key | glyph | key | glyph | key | glyph |
|---|---|---|---|---|---|
| `infty` | ∞ | `partial` | ∂ | `nabla` | ∇ |
| `int` | ∫ | `sum` | ∑ | `prod` | ∏ |
| `cdots` | ⋯ | `ldots` | … | | |

**Set / logic**
| key | glyph | key | glyph |
|---|---|---|---|
| `in` | ∈ | `forall` | ∀ |
| `exists` | ∃ | `angle` | ∠ |
| `perp` | ⊥ | `cup` | ∪ |
| `cap` | ∩ | | |

That is the **complete** table — any `\key` not listed here is printed as literal text.

---

### measureMath

```ts
export function measureMath(src: string, size: number): {
  w: number;
  h: number;
  render: (ctx: CanvasRenderingContext2D, xTop: number, yTop: number) => void;
}
```

- **Purpose:** Parse and lay out an expression at font `size`, returning its pixel `w`/`h` and a `render` callback whose origin is the **top-left** of the box. Use to position math precisely before drawing.
- **Parameters / options:**
  - `src: string` — the LaTeX-subset source.
  - `size: number` — base font size in px.
  - Returns `w`, `h` (`= box.ascent + box.descent`), and `render(ctx, xTop, yTop)` which internally offsets the baseline by `box.ascent`.
- **Note:** width measurement uses a shared offscreen canvas (`document.createElement("canvas")`); if `document` is unavailable it falls back to an estimate `str.length * size * 0.5`.
- **Example:**
  ```ts
  const m = measureMath("E = mc^2", 32);
  m.render(ctx, 100, 80);   // top-left at (100, 80)
  ```
- **Composes with:** `drawMath` calls it internally; call it yourself for custom layout/alignment.

---

### drawMath

```ts
export function drawMath(
  ctx: CanvasRenderingContext2D,
  src: string,
  x: number, y: number,
  style: MathStyle = {},
): void
```

```ts
export interface MathStyle {
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  p?: number;      // draw-on: reveal left→right
  alpha?: number;
}
```

- **Purpose:** Render an expression at `(x, y)` with alignment, color, opacity, and an optional left-to-right reveal.
- **Parameters / options:**
  - `size: number` (default `28`) — base font size in px.
  - `color: string` (default `"#eef5ef"`) — fill color; also drives the fraction bar / radical stroke (they read the current `fillStyle`).
  - `align` — horizontal anchoring at `x`. Union values:
    - `"left"` (default when unset) — `x` is the left edge.
    - `"center"` — `x` is the horizontal center (`ax = x - w/2`).
    - `"right"` — `x` is the right edge (`ax = x - w`).
    - Vertically, `y` is always the **center** (`ay = y - h/2`).
  - `p: number` (default `1`, clamped) — draw-on reveal fraction. When `p < 1`, a clip rect exposes the leftmost `w*p` (with 4px padding), so the expression "writes on" left→right.
  - `alpha: number` (default `1`, clamped) — multiplies `globalAlpha`.
- **Example:**
  ```ts
  drawMath(ctx, "\\frac{\\partial f}{\\partial x} = 2x", 480, 240,
    { align: "center", size: 34, color: "#5cc8ae", p: reveal });
  ```
  (Remember to escape backslashes in TS/JS string literals: `\\frac`, `\\partial`.)
- **Composes with:** `measureMath` (internally); share `p` with other draw-ons to stage a reveal.

---

# Step 15 · Iconography & color semantics — `src/render/icons.ts`

**Responsibility.** A reusable vector icon kit plus a color-semantics registry with auto-legend. Icons are pure path functions drawn in a unit box (`[-0.5, 0.5]²`), so they scale/theme cleanly and can draw-on. The color registry maps category names → consistent colors (assigned deterministically, cached) so the same concept keeps its color across a whole lesson; `legend()` renders the key.

**When to use.** Whenever a lesson needs a small symbolic glyph (a leaf, bolt, flask, warning) or a consistent color-per-category scheme with a legend. Icons are drawn centered at a point at a pixel size; color semantics keep e.g. "carbon" the same color on every slide.

---

### The IconName union — all 30 icons

```ts
export type IconName =
  | "arrow" | "check" | "cross" | "plus" | "minus" | "star" | "heart" | "circle" | "square" | "triangle"
  | "gear" | "bolt" | "drop" | "sun" | "leaf" | "flame" | "factory" | "home" | "person" | "book"
  | "flask" | "atom" | "clock" | "pin" | "warning" | "info" | "search" | "cloud" | "mountain" | "seed";
```

Complete list (30): `arrow`, `check`, `cross`, `plus`, `minus`, `star`, `heart`, `circle`, `square`, `triangle`, `gear`, `bolt`, `drop`, `sun`, `leaf`, `flame`, `factory`, `home`, `person`, `book`, `flask`, `atom`, `clock`, `pin`, `warning`, `info`, `search`, `cloud`, `mountain`, `seed`.

`iconNames` is exported as the runtime array of these keys: `export const iconNames = Object.keys(ICONS) as IconName[];`

---

### The FILLABLE set

Only these icons are genuine closed shapes and honor `filled: true` (16 total):

```ts
"star", "heart", "circle", "square", "triangle", "gear", "bolt", "drop",
"flame", "factory", "pin", "warning", "cloud", "mountain", "seed", "book", "flask"
```

Every **other** icon (`arrow`, `check`, `cross`, `plus`, `minus`, `sun`, `leaf`, `home`, `person`, `atom`, `clock`, `info`, `search`) is an open/stroke-only glyph and is **always stroked**, even if the caller passes `filled: true` — so a caller can't fill an open path into a blob.

---

### drawIcon

```ts
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: IconName,
  x: number, y: number,
  size: number,
  style: IconStyle = {},
): void
```

```ts
export interface IconStyle {
  color?: string;
  filled?: boolean;
  width?: number;
  alpha?: number;
}
```

- **Purpose:** Draw an icon centered at `(x, y)` at pixel `size`, filled or stroked, themed by `color`.
- **Parameters / options:**
  - `name: IconName` — which glyph (see the union above). Unknown name → no-op (`if (!fn) return`).
  - `x, y: number` — center point (px). The unit path is `translate(x,y)`-then-`scale(size,size)`.
  - `size: number` — glyph size in px (the icon roughly fills a `size × size` box).
  - `style.color: string` (default `"#eef5ef"`) — sets both `strokeStyle` and `fillStyle`.
  - `style.filled: boolean` (default falsy) — fill instead of stroke, **but only if `name` is in FILLABLE**; otherwise it's stroked regardless.
  - `style.width: number` (default `2`) — stroke width in px. Compensated for scale (`width / size`) so it stays constant on screen at any `size`. `lineJoin`/`lineCap` are `"round"`.
  - `style.alpha: number` (default `1`, clamped) — multiplies `globalAlpha`.
- **Example:**
  ```ts
  drawIcon(ctx, "leaf", 200, 150, 40, { color: "#38ef7d" });          // stroked (open glyph)
  drawIcon(ctx, "warning", 260, 150, 36, { color: "#e8a13c", filled: true }); // filled (FILLABLE)
  ```
- **Composes with:** `colorSemantics().colorFor(cat)` for the color; `legend`'s `icon` option calls `drawIcon` per row.

---

### colorSemantics / colorFor / legend

```ts
export const SEMANTIC_PALETTE = [
  "#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b", "#a06be8",
  "#38ef7d", "#e8c14a", "#e2452b", "#4ad6c8", "#b0884a",
]; // 10 colors

export function colorSemantics(palette: string[] = SEMANTIC_PALETTE): {
  colorFor(category: string): string;
  legend(
    ctx: CanvasRenderingContext2D,
    categories: string[],
    x: number, y: number,
    opts?: { rowH?: number; swatch?: number; font?: string; ink?: string; icon?: (cat: string) => IconName },
  ): void;
}
```

- **Purpose:** A color registry — each category name gets a stable color from the palette on first use (assigned sequentially, so distinct up to palette size) and cached. Same category → same color everywhere in the lesson. Includes a `legend` renderer.
- **`colorSemantics(palette)`:**
  - `palette: string[]` (default `SEMANTIC_PALETTE`, 10 colors) — the color pool.
  - Returns an object with `colorFor` and `legend`, backed by an internal `Map`. Create **one** instance per lesson (or shared scope) so the cache persists; a new instance restarts assignments.
- **`colorFor(category)`:** returns the cached color, or assigns `palette[map.size % palette.length]` on first sight (wraps around after the palette is exhausted, so category 11 reuses color 1).
- **`legend(ctx, categories, x, y, opts)`:** draws a vertical swatch+label key starting at `(x, y)`.
  - `categories: string[]` — rows, top to bottom. Each row calls `colorFor(cat)` (so it also registers colors).
  - `opts.rowH: number` (default `20`) — vertical spacing between rows (px).
  - `opts.swatch: number` (default `11`) — swatch size (px square, or icon size `swatch + 4` when `icon` given).
  - `opts.font: string` (default `"12px -apple-system, sans-serif"`) — label font.
  - `opts.ink: string` (default `"#cdd8e2"`) — label text color.
  - `opts.icon: (cat: string) => IconName` (optional) — when provided, each row draws a **filled** icon (via `drawIcon`, `filled: true`) in the category's color instead of a square swatch. Label text is at `x + swatch + 8`.
- **Example:**
  ```ts
  const sem = colorSemantics();
  const cColor = sem.colorFor("carbon");   // "#5cc8ae"
  const oColor = sem.colorFor("oxygen");   // "#e8a13c"
  sem.legend(ctx, ["carbon", "oxygen"], 40, 60, {
    icon: (c) => (c === "carbon" ? "atom" : "circle"),
  });
  ```
- **Composes with:** `drawIcon` (for iconized legends and elsewhere in a slide); feed `colorFor` results into `Datum.color`, `Era.color`, `TimelineEvent.color`, chart/plot colors, etc. so categories stay color-consistent across charts, timelines, and icons.
