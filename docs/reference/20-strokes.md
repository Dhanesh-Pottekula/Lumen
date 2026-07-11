# Step 04 · Draw-on strokes — `src/render/strokes.ts`, `src/render/strokeVerbs.ts`

**Responsibility.** A single primitive — a normalized `[start, end]` window over a path's arc length — powers all self-drawing. `strokes.ts` is the geometry + style + renderer (arc-length tables, curve interpolation, variable-width fill, the one `strokeWindow` renderer). `strokeVerbs.ts` is the higher-level vocabulary (draw-on, passing-flash, border-then-fill, traced trails, circumscribe, markers, followers, staggered sequences), all thin wrappers over that window.

**When to use.** Any line or path that should draw itself over time: the spine for callouts, plots, maps, borders, arrows, underlines, and "circle the answer" highlights. Every function is pure in its progress input (`p` or `t`), so strokes are deterministic and seekable — the same `t` yields the same frame.

**Pipeline.** raw points → `smoothPath()` (optional curve interpolation) → dense polyline → `windowPolyline()` by arc length → optional roughen (hand-drawn) / taper (variable width) → stroked or filled onto a `CanvasRenderingContext2D`.

---

## `src/render/strokes.ts`

### Type: `Pt`

```ts
export type Pt = [number, number];
```

A 2-D point as an `[x, y]` tuple. Every path is a `Pt[]` polyline.

---

### Interface: `ArcTable`

```ts
export interface ArcTable {
  pts: Pt[];
  cum: number[];   // cumulative length up to each point
  length: number;  // total arc length
}
```

- `pts: Pt[]` — the polyline the table describes.
- `cum: number[]` — cumulative arc length up to each point (`cum[0] === 0`).
- `length: number` — total arc length of the polyline (`0` for a single point).

Arc-length tables are cached in a `WeakMap` keyed by the point-array's identity. Static paths (built once, redrawn every frame) hit the cache; per-frame arrays miss and are GC'd with the array. **Contract: treat point arrays as immutable once passed in** — mutating one in place staled the cached table.

---

### arcTable

```ts
export function arcTable(points: Pt[]): ArcTable
```

- **Purpose:** Build (or reuse from cache) a cumulative arc-length table for a polyline.
- **Parameters:** `points: Pt[]` — the polyline. Treat as immutable (see caching note above).
- **Returns:** `ArcTable`. O(n) on a cache miss, O(1) on a hit.
- **Example:**
  ```ts
  const t = arcTable(myPath);
  const total = t.length;
  ```
- **Composes with:** underpins `pointAt`, `windowPolyline`, `fillOutline`, and `pathLength`.

---

### Interface: `SamplePoint`

```ts
export interface SamplePoint {
  x: number;
  y: number;
  angle: number;  // tangent direction (radians)
}
```

- `x`, `y: number` — sampled position.
- `angle: number` — tangent direction in radians (`Math.atan2` of the local segment). For a single-point path, `angle` is `0`.

---

### pointAt

```ts
export function pointAt(points: Pt[], p: number): SamplePoint
```

- **Purpose:** Point + tangent at arc-length fraction `p` along a polyline. For tracers, markers, followers.
- **Parameters:**
  - `points: Pt[]` — the polyline.
  - `p: number` — arc-length fraction, `0..1` (clamped internally via `clamp01`).
- **Returns:** `SamplePoint` (`x`, `y`, `angle`).
- **Example:**
  ```ts
  const head = pointAt(path, 0.5); // midpoint by arc length + tangent
  ```
- **Composes with:** `tracerDot`, `handFollower`, and any custom marker riding the draw head.

---

### windowPolyline

```ts
export function windowPolyline(points: Pt[], start: number, end: number): Pt[]
```

- **Purpose:** The core primitive — the sub-polyline covering arc-length fractions `[start, end]`, with interpolated points at both cut ends. `windowPolyline(pts, 0, p)` is the draw-on shape.
- **Parameters:**
  - `points: Pt[]` — dense polyline (run `smoothPath` first for curves).
  - `start: number` — window start fraction, `0..1` (clamped).
  - `end: number` — window end fraction, `0..1` (clamped).
- **Returns:** `Pt[]`.
  - Empty input → `[]`.
  - Zero-length path → the single start point.
  - `end <= start` → a single interpolated point at `start`.
  - Otherwise → `[startCut, ...interiorPoints, endCut]`.
- **Example:**
  ```ts
  const drawn = windowPolyline(path, 0, 0.4);      // first 40%
  const middle = windowPolyline(path, 0.3, 0.7);   // sliding window
  ```
- **Composes with:** consumed by `strokeWindow`; the basis of every verb.

---

### partialPolyline

```ts
export const partialPolyline = (points: Pt[], p: number): Pt[]
```

- **Purpose:** First `p` (`0..1`) of a polyline by arc length — draw-on convenience. Equals `windowPolyline(points, 0, p)`.
- **Parameters:** `points: Pt[]`; `p: number` (`0..1`).
- **Returns:** `Pt[]`.
- **Composes with:** shorthand over `windowPolyline`.

---

### Type: `CurveKind`

```ts
export type CurveKind =
  | "linear"
  | "cardinal"
  | "catmullRom"
  | "basis"
  | "natural"
  | "step"
  | "stepBefore"
  | "stepAfter";
```

The interpolation family used by `smoothPath`. Allowed values:

- `"linear"` — no interpolation; points used as-is (straight segments).
- `"cardinal"` — cardinal spline (Hermite tangents scaled by `1 − tension`). Passes through every point. Honors `tension`.
- `"catmullRom"` — Catmull-Rom spline with knot parameterisation `alpha`. Passes through every point.
- `"basis"` — uniform cubic B-spline. Very smooth; does **not** pass through interior points (good for organic blobs). Endpoints are doubled so the curve nearly meets the first/last control point.
- `"natural"` — natural cubic spline (2nd derivative zero at the ends), solved per axis via the Thomas algorithm. Passes through points.
- `"step"` — orthogonal steps with the riser at the segment midpoint.
- `"stepBefore"` — vertical move first, then horizontal (riser before the point).
- `"stepAfter"` — horizontal move first, then vertical (riser after the point).

---

### Interface: `CurveOptions`

```ts
export interface CurveOptions {
  curve?: CurveKind;
  tension?: number;
  alpha?: number;
  closed?: boolean;
  samples?: number;
}
```

- `curve?: CurveKind` (default `"linear"`) — which interpolation family (see `CurveKind`).
- `tension?: number` (default `0`) — cardinal only: `0` = loose/round … `1` = straight.
- `alpha?: number` (default `0.5`) — catmullRom only: `0` = uniform, `0.5` = centripetal (no cusps, best default), `1` = chordal.
- `closed?: boolean` (default `false`) — treat the path as a loop; wraps control points and appends the first point at the end. Ignored by `"step*"` kinds.
- `samples?: number` (default `16`) — points generated per input segment for smooth curves. Higher = smoother/denser.

---

### smoothPath

```ts
export function smoothPath(points: Pt[], opts: CurveOptions = {}): Pt[]
```

- **Purpose:** Interpolate a control-point list into a dense polyline using the chosen curve. Feeds `windowPolyline` for uniform-speed draw-on.
- **Parameters:** `points: Pt[]`; `opts: CurveOptions` (all fields above).
- **Returns:** `Pt[]` dense polyline.
  - `"linear"`, or fewer than 3 input points → points returned as-is (with the first point appended when `closed`).
  - `"step" | "stepBefore" | "stepAfter"` → the step polyline (ignores `closed`).
  - `"cardinal" | "catmullRom" | "basis" | "natural"` → sampled dense curve; `"natural"` appends the first point when `closed`.
- **Example:**
  ```ts
  const smooth = smoothPath(controlPts, { curve: "catmullRom", alpha: 0.5, samples: 24 });
  const loop   = smoothPath(controlPts, { curve: "cardinal", tension: 0.2, closed: true });
  strokeOn(ctx, smooth, p, style, theme);
  ```
- **Composes with:** run before `strokeWindow`/`strokeOn`/`drawOn` whenever the path is a curve rather than an explicit dense polyline.

---

### Interface: `StrokeStyle`

```ts
export interface StrokeStyle {
  // appearance
  color?: string | CanvasGradient | CanvasPattern;
  width?: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  miterLimit?: number;
  // dashes
  dash?: number[];
  dashOffset?: number;
  // compositing
  alpha?: number;
  blend?: GlobalCompositeOperation;
  shadow?: { blur: number; color: string; dx?: number; dy?: number };
  // hand-drawn
  roughness?: number;
  seed?: number;
  // variable width
  taperStart?: number;
  taperEnd?: number;
  widthProfile?: (t: number) => number;
  minWidth?: number;
}
```

Appearance:
- `color?: string | CanvasGradient | CanvasPattern` — stroke/fill color. Default resolves to `theme.palette.ink`, else `"#ffffff"`.
- `width?: number` — line width. Default resolves to `theme.lineStyle.width`, else `2`.
- `cap?: CanvasLineCap` (default `"round"`) — line cap. In variable-width/brush mode, `"round"` (the default) draws round disc end-caps; any other value gives flat butt ends.
- `join?: CanvasLineJoin` (default `"round"`) — line join (stroke mode only).
- `miterLimit?: number` — miter limit; applied only when set (stroke mode only).

Dashes (stroke mode only — ignored in variable-width/brush mode):
- `dash?: number[]` — dash pattern passed to `setLineDash`.
- `dashOffset?: number` (default `0`) — dash phase offset.

Compositing:
- `alpha?: number` — multiplies the current `globalAlpha` (clamped `0..1`).
- `blend?: GlobalCompositeOperation` — canvas composite operation (e.g. `"lighter"`).
- `shadow?: { blur: number; color: string; dx?: number; dy?: number }` — drop shadow; `dx`/`dy` default `0`.

Hand-drawn:
- `roughness?: number` (default `0`, or `theme.lineStyle.roughness`) — per-point jitter via the theme's `roughen()`.
- `seed?: number` (default `1`) — fixes the jitter so it doesn't crawl between frames.

Variable width — **any of these switches the renderer to outline-fill "brush" mode** (dashes ignored; `cap` selects round vs. flat end-caps):
- `taperStart?: number` — px length over which width tapers up from `0` at the very start.
- `taperEnd?: number` — px length over which width tapers down to `0` at the very end.
- `widthProfile?: (t: number) => number` — `t` `0..1` along the drawn span → width multiplier.
- `minWidth?: number` — floor so a variable-width stroke never fully vanishes.

---

### strokeWindow

```ts
export function strokeWindow(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  start: number,
  end: number,
  style: StrokeStyle = {},
  theme?: Theme,
): void
```

- **Purpose:** Stroke the arc-length window `[start, end]` of `points` with `style`. The one renderer every verb uses.
- **Parameters:**
  - `ctx` — target 2-D context (a raw ctx or any FrameCtx layer).
  - `points: Pt[]` — should already be a dense polyline (run `smoothPath` first for curves).
  - `start`, `end: number` — window fractions `0..1`.
  - `style: StrokeStyle` (default `{}`) — see `StrokeStyle`; unset fields resolve from `theme`.
  - `theme?: Theme` — supplies default `color`, `width`, `roughness` and the `roughen()` used for hand-drawn jitter.
- **Behavior:** Windows the polyline; returns early if fewer than 2 points result. Applies roughen (if `roughness`), alpha/blend/shadow, then either variable-width `fillOutline` (when any taper/`widthProfile` is set) or a plain stroked path. Wrapped in `ctx.save()/restore()`.
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeWindow(ctx, path, 0.2, 0.8, { color: "#4af", width: 3 }, theme);
  ```
- **Composes with:** the base of `drawOn`, `passingFlash`, `drawBorderThenFill`, `tracedPath`, `circumscribe`, `strokeSequence`, `strokeOn`.

---

### strokeOn

```ts
export const strokeOn = (
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  style?: StrokeStyle,
  theme?: Theme,
) => void
```

- **Purpose:** Draw-on convenience — the first `p` (`0..1`) of `points`. Equals `strokeWindow(ctx, points, 0, p, …)`.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`); `style?: StrokeStyle`; `theme?: Theme`.
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeOn(ctx, path, progress, { color: "#fff", width: 2 }, theme);
  ```
- **Composes with:** shorthand over `strokeWindow`; use `drawOn` for from-end/center/both variants.

---

## `src/render/strokeVerbs.ts`

### Type: `StrokeFrom`

```ts
export type StrokeFrom = "start" | "end" | "center" | "both";
```

Direction a draw-on grows. Allowed values:
- `"start"` — grows from the head (window `0 → p`). Default.
- `"end"` — grows from the tail (window `1 − p → 1`).
- `"center"` — grows outward from the middle (`0.5 − p/2 → 0.5 + p/2`).
- `"both"` — grows inward from both ends simultaneously.

---

### Interface: `DrawOptions`

```ts
export interface DrawOptions {
  from?: StrokeFrom;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `from?: StrokeFrom` (default `"start"`) — growth direction.
- `style?: StrokeStyle` — stroke style.
- `theme?: Theme` — theme for style defaults.

---

### drawOn

```ts
export function drawOn(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: DrawOptions = {}): void
```

- **Purpose:** Draw the first `p` (`0..1`) of a path, optionally growing from the end, center, or both ends.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`, clamped); `opts: DrawOptions` (`from`, `style`, `theme`).
- **Returns:** `void`.
- **Example:**
  ```ts
  drawOn(ctx, path, p, { from: "center", style: { color: "#fff" }, theme });
  ```
- **Composes with:** wraps `strokeWindow`; used by `strokeSequence`; inverted by `erase`.

---

### erase

```ts
export function erase(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: DrawOptions = {}): void
```

- **Purpose:** Un-draw — the reverse of `drawOn`. At `p=0` fully drawn, at `p=1` gone (retracts from the tail by default).
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`, clamped); `opts: DrawOptions`. Calls `drawOn(ctx, points, 1 − p, opts)`.
- **Returns:** `void`.
- **Example:**
  ```ts
  erase(ctx, path, p, { from: "start", theme }); // retracts as p rises
  ```
- **Composes with:** inverse of `drawOn`; shares its `from` semantics.

---

### Interface: `FlashOptions`

```ts
export interface FlashOptions {
  width?: number;
  thinning?: boolean;
  glow?: boolean;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `width?: number` (default `0.15`) — sliver length as a fraction of the path (`0..1`).
- `thinning?: boolean` — taper the sliver toward its tail (comet look); sets `widthProfile = (t) => t`.
- `glow?: boolean` — composite the sliver additively (`"lighter"`) for a light-sweep look, unless `style.blend` is already set.
- `style?: StrokeStyle` — base style (shallow-copied).
- `theme?: Theme` — theme for style defaults.

---

### passingFlash

```ts
export function passingFlash(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: FlashOptions = {}): void
```

- **Purpose:** A short bright sliver that sweeps the path from start to end as `p` goes `0 → 1`, then exits.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`); `opts: FlashOptions`. The head travels `0 → 1+width` so the sliver fully enters and leaves; returns early if the window collapses.
- **Returns:** `void`.
- **Example:**
  ```ts
  passingFlash(ctx, path, p, { width: 0.2, thinning: true, glow: true, style: { color: "#8ff" }, theme });
  ```
- **Composes with:** built on `strokeWindow`; `thinning`/`glow` inject `widthProfile`/`blend` into the style.

---

### Interface: `BorderThenFillOptions`

```ts
export interface BorderThenFillOptions {
  style?: StrokeStyle;
  fill?: string | CanvasGradient | CanvasPattern;
  fillRule?: CanvasFillRule;
  split?: number;
  theme?: Theme;
}
```

- `style?: StrokeStyle` — outline stroke style.
- `fill?: string | CanvasGradient | CanvasPattern` — fill applied after the border draws; omit for outline-only.
- `fillRule?: CanvasFillRule` (default `"nonzero"`) — fill rule.
- `split?: number` (default `0.6`) — fraction of `p` spent drawing the border before the fill fades in.
- `theme?: Theme` — theme for style defaults.

---

### drawBorderThenFill

```ts
export function drawBorderThenFill(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: BorderThenFillOptions = {}): void
```

- **Purpose:** Draw a closed shape's outline on, then fade its fill in — the "Write"/region-reveal primitive.
- **Parameters:** `ctx`; `points: Pt[]` (the closed outline); `p: number` (`0..1`); `opts: BorderThenFillOptions`. Border draws over `p ∈ [0, split]`; if `fill` is set and `p > split`, the fill fades in over the remaining span.
- **Returns:** `void`.
- **Example:**
  ```ts
  drawBorderThenFill(ctx, shape, p, { style: { color: "#fff" }, fill: "#1c2c4a", split: 0.5, theme });
  ```
- **Composes with:** border via `strokeWindow`; the fill is drawn directly onto `ctx` (own `save`/`restore`).

---

### Interface: `TracedPathOptions`

```ts
export interface TracedPathOptions {
  step?: number;
  dissipate?: number;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `step?: number` (default `0.03`) — sampling interval in the mover's own time units.
- `dissipate?: number` — if set, only the last `dissipate` time-units of trail are kept (comet tail); otherwise the trail starts from `0`.
- `style?: StrokeStyle` — trail stroke style.
- `theme?: Theme` — theme for style defaults.

---

### tracedPath

```ts
export function tracedPath(
  ctx: CanvasRenderingContext2D,
  mover: (tt: number) => Pt,
  t: number,
  opts: TracedPathOptions = {},
): void
```

- **Purpose:** Draw the trail a moving point leaves behind.
- **Parameters:**
  - `ctx` — target context.
  - `mover: (tt: number) => Pt` — **must be a pure function of time** so the trail is reproduced exactly on any seek.
  - `t: number` — current time.
  - `opts: TracedPathOptions` — `step`, `dissipate`, `style`, `theme`.
- **Behavior:** Samples on a fixed global grid (so tail vertices stay put as `t` advances — no shimmer) from `0` (or `t − dissipate`) up to the current `t`, then appends the exact head at `t`. Strokes the whole trail (window `0 → 1`) once it has ≥2 points.
- **Returns:** `void`.
- **Example:**
  ```ts
  tracedPath(ctx, (tt) => orbit(tt), t, { dissipate: 1.5, style: { color: "#fa0" }, theme });
  ```
- **Composes with:** `strokeWindow` for rendering; pair with `pointAt`/`tracerDot` to mark the head.

---

### Interface: `CircumscribeOptions`

```ts
export interface CircumscribeOptions {
  shape?: "rect" | "ellipse";
  buff?: number;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `shape?: "rect" | "ellipse"` (default rectangle) — loop shape. `"ellipse"` draws a 48-segment ellipse; any other value (or omitted) draws a rectangle.
- `buff?: number` (default `8`) — padding around the box on all sides.
- `style?: StrokeStyle` — loop stroke style; its `alpha` is multiplied by the fade.
- `theme?: Theme` — theme for style defaults.

---

### circumscribe

```ts
export function circumscribe(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: number,
  opts: CircumscribeOptions = {},
): void
```

- **Purpose:** A temporary highlight loop that draws around a box then fades — "circle the answer".
- **Parameters:** `ctx`; `box: { x; y; w; h }`; `p: number` (`0 → 1`); `opts: CircumscribeOptions`. First half of `p` (`0 → 0.5`) draws the loop on; second half (`0.5 → 1`) fades it out via `style.alpha`.
- **Returns:** `void`.
- **Example:**
  ```ts
  circumscribe(ctx, { x, y, w, h }, p, { shape: "ellipse", buff: 12, style: { color: "#ffd54a", width: 3 }, theme });
  ```
- **Composes with:** built on `strokeWindow`.

---

### arrowhead

```ts
export function arrowhead(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; angle: number },
  opts: { size?: number; color?: string; alpha?: number } = {},
): void
```

- **Purpose:** Draw a filled arrowhead at a sampled point, rotated to its tangent. Reveal via `alpha` on arrival.
- **Parameters:**
  - `at: { x; y; angle }` — position and tangent (radians), e.g. from `pointAt`.
  - `opts.size?: number` (default `12`) — arrowhead length in px.
  - `opts.color?: string` (default `"#fff"`) — fill color.
  - `opts.alpha?: number` (default `1`, clamped) — opacity; returns early if `≤ 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  arrowhead(ctx, pointAt(path, 1), { size: 14, color: "#fff", alpha: p });
  ```
- **Composes with:** feed it `pointAt(points, p)` to cap a draw-on head or an arrow's tip.

---

### dot

```ts
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void
```

- **Purpose:** A filled dot at a point — path endpoint marker or waypoint.
- **Parameters:** `x`, `y: number` — center; `r: number` — radius; `color: string` — fill; `alpha = 1` (clamped) — opacity, returns early if `≤ 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  dot(ctx, 100, 200, 5, "#fff", 0.9);
  ```
- **Composes with:** the primitive behind `tracerDot`.

---

### tracerDot

```ts
export function tracerDot(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  opts: { r?: number; color?: string; alpha?: number } = {},
): void
```

- **Purpose:** A dot riding the current draw head at progress `p` — a pen/tracer tip.
- **Parameters:** `ctx`; `points: Pt[]`; `p: number` (`0..1`, positioned via `pointAt`); `opts.r?: number` (default `4`); `opts.color?: string` (default `"#fff"`); `opts.alpha?: number` (default `1`).
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeOn(ctx, path, p, style, theme);
  tracerDot(ctx, path, p, { r: 5, color: "#8ff" });
  ```
- **Composes with:** pair with `strokeOn`/`drawOn` to mark the pen tip; built on `pointAt` + `dot`.

---

### handFollower

```ts
export function handFollower(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  img: CanvasImageSource,
  opts: { w?: number; h?: number; offsetX?: number; offsetY?: number; alpha?: number } = {},
): void
```

- **Purpose:** Draw an image (hand/pen/chalk) at the draw head, oriented to the path tangent.
- **Parameters:**
  - `points: Pt[]`; `p: number` (`0..1`, positioned via `pointAt`).
  - `img: CanvasImageSource` — the image to draw.
  - `opts.w?: number` (default `48`) — draw width; `opts.h?: number` (default `48`) — draw height.
  - `opts.offsetX?: number` (default `0`), `opts.offsetY?: number` (default `0`) — draw offset from the head, after translate+rotate.
  - `opts.alpha?: number` (default `1`, clamped) — opacity; returns early if `≤ 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  handFollower(ctx, path, p, penImg, { w: 56, h: 56, offsetX: -8, offsetY: -48 });
  ```
- **Composes with:** ride it alongside `drawOn`/`strokeOn`; positioned by `pointAt`.

---

### pathLength

```ts
export const pathLength = (points: Pt[]): number
```

- **Purpose:** Total arc length of a polyline — convenience for callers that pace draw speed by length. Equals `arcTable(points).length`.
- **Parameters:** `points: Pt[]`.
- **Returns:** `number` — total arc length.
- **Example:**
  ```ts
  const speed = 300;                     // px/sec
  const dur = pathLength(path) / speed;  // seconds to draw at constant speed
  ```
- **Composes with:** derive `p` or `dur` for `drawOn`/`strokeSequence`.

---

### Interface: `SequenceOptions`

```ts
export interface SequenceOptions {
  start?: number;
  step: number;
  dur: number;
  from?: StrokeFrom;
  style?: StrokeStyle;
  theme?: Theme;
}
```

- `start?: number` (default `0`) — time the first path begins.
- `step: number` (**required**) — stagger between consecutive paths. `0` → all at once; large → strictly sequential.
- `dur: number` (**required**) — draw duration of each path.
- `from?: StrokeFrom` — growth direction passed to each `drawOn`.
- `style?: StrokeStyle` — stroke style for all paths.
- `theme?: Theme` — theme for style defaults.

---

### strokeSequence

```ts
export function strokeSequence(ctx: CanvasRenderingContext2D, paths: Pt[][], t: number, opts: SequenceOptions): void
```

- **Purpose:** Draw many paths one after another with a staggered cascade. Each path's progress is `stagger(t, i, …)`, so the whole cascade stays seekable.
- **Parameters:** `ctx`; `paths: Pt[][]` — the polylines; `t: number` — current time; `opts: SequenceOptions` — `start`, `step`, `dur`, `from`, `style`, `theme`. Each path is drawn via `drawOn` only when its progress `p > 0`.
- **Returns:** `void`.
- **Example:**
  ```ts
  strokeSequence(ctx, [pathA, pathB, pathC], t, { step: 0.4, dur: 0.8, from: "start", style: { color: "#fff" }, theme });
  ```
- **Composes with:** loops `drawOn` over the paths using `motion.stagger` for timing.
```
