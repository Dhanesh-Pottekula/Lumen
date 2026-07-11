# Step 16 · Map / geo subsystem — `src/render/geo.ts`

**Responsibility.** A tiny projected-map toolkit: build an equirectangular projection from GeoJSON-shaped data, fill regions with draw-on borders, interpolate borders over time (morph), draw curved flow arrows between coordinates, place icon markers, and find feature centers for camera focus.

**When to use.** Reach for `geo` whenever a lesson needs a map: showing territory, animating borders-over-time (empires, plate boundaries, election maps), drawing migration/trade/attack flow arrows, pinning locations, or a fog-of-war reveal (compose with the reveal subsystem — geo itself only supplies the map primitives).

**Data model.** Everything is passed in — **no fetch, no network**. This keeps rendering deterministic and offline. A lesson bundles a small `GeoFeature[]` set (or an authored sample). Coordinates are `[lon, lat]` pairs (note: longitude first, then latitude), grouped into closed rings, grouped into features. North is up.

**Composition.** Region draw-on and flow arrows use the strokes subsystem (`strokeOn`, `smoothPath`, `arrowhead`); borders-over-time uses `morph`; markers use `drawIcon` from icons; `featureCenter` returns a lon/lat you project and hand to the camera for region zooms; fog-of-war composes with the reveal subsystem.

---

## Types

```ts
export type LonLat = [number, number]; // [lon, lat] — longitude first

export interface GeoFeature {
  id: string;
  rings: LonLat[][];             // one or more closed rings (first = outer, rest = holes)
  props?: Record<string, unknown>;
}

export interface Projection {
  project(ll: LonLat): Pt;       // Pt = [number, number] view-space point
  scale: number;                 // pixels per lon/lat unit
}

export interface RegionStyle {
  fill?: string;                 // fill color; omit for no fill
  stroke?: string;               // border color; omit for no border
  width?: number;                // border line width (default 1.5)
  p?: number;                    // draw-on progress 0..1 (default 1 = fully drawn)
  fillAlpha?: number;            // max fill opacity (default 1)
}
```

- `GeoFeature.rings[0]` is the outer ring. Additional rings are treated as holes via even-odd fill.
- `Projection.project` maps a `[lon, lat]` to a view-space `[x, y]`.

---

## `fitProjection`

```ts
export function fitProjection(
  features: GeoFeature[],
  area: { x: number; y: number; w: number; h: number },
  pad = 24
): Projection
```

Builds an equirectangular projection whose bounding box (over all rings of all `features`) is fit and centered inside `area`, north up.

- **`features`** — the feature set whose combined lon/lat extent defines the fit. All rings of all features are scanned for min/max lon/lat.
- **`area`** — the view-space rectangle `{x, y, w, h}` to fit into.
- **`pad`** *(default `24`)* — inner padding in pixels on each side; the data box is fit into `area` shrunk by `2*pad` in each dimension.
- **Returns** a `Projection`. `scale = min((w - 2*pad)/bboxWidth, (h - 2*pad)/bboxHeight)` (uniform scale, aspect preserved), with the projected box centered in `area`. Latitude is flipped so north is up (`oy + (maxLat - lat) * s`).
- **Degenerate cases.** If the feature set is empty or produces non-finite bounds, returns a harmless fallback `{ scale: 1, project: ([lon, lat]) => [area.x + lon, area.y + lat] }` (no NaNs). A zero-width or zero-height bbox is treated as `1` to avoid division by zero.
- **When.** Call once up front with your full feature set and the map rectangle; reuse the returned `Projection` for every draw/marker/arrow call so they share coordinates.

**Example**
```ts
const proj = fitProjection(features, { x: 40, y: 40, w: 840, h: 350 });
```

---

## `drawFeature`

```ts
export function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: GeoFeature,
  proj: Projection,
  style: RegionStyle = {}
): void
```

Draws one feature: the border strokes on with `p`, and the fill fades in only after `p > 0.3`.

- **`style.p`** *(default `1`, clamped 0..1)* — draw-on progress. Below `0.3` no fill is shown; the fill alpha ramps from 0 at `p=0.3` to full at `p=1` via `clamp01((p - 0.3)/0.7)`.
- **`style.fill`** — fill color. Fill uses all rings with `"evenodd"` so inner rings cut holes. Skipped entirely if unset or `p <= 0.3`.
- **`style.fillAlpha`** *(default `1`)* — multiplies the computed fade alpha to cap fill opacity.
- **`style.stroke`** — border color. Skipped if unset. The outer ring is closed (`[...outer, outer[0]]`) and drawn with `strokeOn(ctx, border, p, …)`.
- **`style.width`** *(default `1.5`)* — border line width.
- **When.** Use for a single region you want to animate on independently, or as the per-feature primitive behind `drawMap`.

**Example**
```ts
drawFeature(ctx, feature, proj, { fill: "#2c3f55", stroke: "#8fb4d6", p });
```

---

## `drawMap`

```ts
export function drawMap(
  ctx: CanvasRenderingContext2D,
  features: GeoFeature[],
  proj: Projection,
  styleFor: (f: GeoFeature, i: number) => RegionStyle
): void
```

Draws every feature, calling `styleFor(feature, index)` per feature to pick its `RegionStyle`, then delegating to `drawFeature`.

- **`styleFor`** — callback returning the style for each feature; use it to vary fill/stroke by semantics (e.g. by `feature.props`) and to pass a per-feature `p` for staggered draw-on.
- **When.** Draw a whole map in one call while keeping per-region styling and timing under your control.

**Example**
```ts
drawMap(ctx, features, proj, (f, i) => ({
  fill: f.props?.color as string,
  stroke: "#dfe9f3",
  p: clamp01((t - i * 0.1) / 0.8),
}));
```

---

## `borderAt`

```ts
export function borderAt(
  ringsA: LonLat[],
  ringsB: LonLat[],
  p: number,
  proj: Projection
): Pt[]
```

Interpolates a feature's **outer border** between two keyframe rings (borders-over-time). Both rings are projected, then blended with `morph(a, b, p, { closed: true, align: true, n: 96 })`.

- **`ringsA` / `ringsB`** — the start and end outer rings (as `LonLat[]`, not full features).
- **`p`** — morph progress 0..1.
- **Returns** the interpolated projected polyline (`Pt[]`, 96 resampled points, closed and vertex-aligned) — you then stroke or fill it yourself.
- **When.** Animate a changing frontier: pass two snapshots of a nation's border and sweep `p` across a scene.

**Example**
```ts
const ring = borderAt(empire1200.rings[0], empire1250.rings[0], p, proj);
strokeOn(ctx, [...ring, ring[0]], 1, { color: "#e8a13c", width: 2 });
```

---

## `flowArrow`

```ts
export function flowArrow(
  ctx: CanvasRenderingContext2D,
  from: LonLat,
  to: LonLat,
  proj: Projection,
  p: number,
  opts: { color?: string; width?: number; bend?: number } = {}
): void
```

Draws a curved (quadratic-feel, Catmull-Rom sampled) flow arrow from one coordinate to another, drawing on to `p`, with an arrowhead that fades in near the end.

- **`from` / `to`** — endpoint coordinates (`LonLat`), projected internally.
- **`p`** — draw-on progress 0..1 (clamped). The path strokes on with `strokeOn`.
- **`opts.bend`** *(default `0.22`)* — sideways bow of the control point as a fraction of the endpoint distance; controls curvature.
- **`opts.color`** *(default `"#e8a13c"`)* — stroke and arrowhead color.
- **`opts.width`** *(default `2.5`)* — stroke width.
- **Arrowhead.** Only drawn once `p > 0.9`; size `11`, alpha ramps `clamp01((p - 0.9)/0.1)`, angle taken from the last path segment.
- **When.** Migration, trade routes, invasions, wind/current flows — any directed connection between two map points.

**Example**
```ts
flowArrow(ctx, [-7, 52], [2, 41], proj, p, { color: "#e24b4a", bend: 0.3 });
```

---

## `geoMarker`

```ts
export function geoMarker(
  ctx: CanvasRenderingContext2D,
  ll: LonLat,
  proj: Projection,
  opts: { icon?: IconName; color?: string; label?: string; size?: number; alpha?: number } = {}
): void
```

Places an icon pin (and optional label) at a coordinate.

- **`ll`** — the marker coordinate (`LonLat`).
- **`opts.icon`** *(default `"pin"`)* — the `IconName` to draw (from the icons subsystem).
- **`opts.color`** *(default `"#e24b4a"`)* — icon color; drawn `filled: true`.
- **`opts.size`** *(default `16`)* — icon size in pixels. The icon is vertically offset up by `size/2` so the tip sits on the point.
- **`opts.alpha`** *(default `1`, clamped)* — opacity. If `<= 0` the whole call is a no-op (nothing drawn).
- **`opts.label`** — optional text drawn below the pin at `y + 14` with `fadeText`, font `"600 11px -apple-system, sans-serif"`, color `#eef5ef`, using the same `alpha`.
- **When.** Mark cities, events, or targets on the map; fade in with `alpha`.

**Example**
```ts
geoMarker(ctx, [37.6, 55.75], proj, { label: "Moscow", alpha: p });
```

---

## `featureCenter`

```ts
export function featureCenter(feature: GeoFeature): LonLat
```

Returns the bounding-box center (in lon/lat) of a feature's **outer ring** — a convenient camera-focus target once projected.

- **Returns** `[(minLon+maxLon)/2, (minLat+maxLat)/2]` over `feature.rings[0]`. If the feature has no outer ring or it is empty, returns `[0, 0]`.
- **When.** Get a region's center to project and feed to the camera subsystem for a region zoom.

**Example**
```ts
const [cx, cy] = proj.project(featureCenter(feature)); // view-space focus point
```

---

# Step 19 · The storyboard JSON interpreter — `src/render/storyboard.ts`

**Responsibility.** A declarative lesson format. Scenes and beats are plain data (JSON); the interpreter renders each beat with a primitive from earlier steps, gated by its own time window. This is the target format for LLM-generated lessons: **emit JSON, get a seekable, composed film.**

Every beat is time-gated by `p = phase(t, at, at + dur)`. A beat draws nothing before its `at` (guard: `if (t < beat.at) return;`).

## `Base` — fields shared by every beat

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `at` | `number` | required | — | Scene-relative start time (seconds) at which the beat begins. |
| `dur` | `number` | optional | `1` (per-beat; see notes) | Duration of the beat's animation window. Used as `phase(t, at, at + dur)`. Some beats use a different fallback (see below). |
| `layer` | `"bg" \| "mid" \| "fg" \| "annotation" \| "fx"` | optional | `defaultLayer(kind)` | Compositor layer the beat draws to. |

**`dur` fallbacks by beat** (when `dur` is omitted): most beats fall back to `1` (via `phase(t, at, at + (dur ?? 1))`). Exceptions: `counter` uses `dur ?? 2`; `callout` uses `dur ?? 1.5`. The `layer` selection uses `beat.dur ?? 1` only for the shared `p`; per-beat overrides above apply where noted.

## `defaultLayer(kind)` — layer each beat kind draws to when `layer` is omitted

| Beat kind(s) | Default layer |
|---|---|
| `particles` | `"fg"` |
| `text`, `math`, `callout`, `counter` | `"annotation"` |
| `ring` | `"fg"` |
| `rect` | `"bg"` |
| everything else (`bars`, `pie`, `line`, `icon`) | `"mid"` |

---

## The `Beat` discriminated union

Discriminated on `kind`. Every beat also has the `Base` fields above. Below, one table per kind; **Default** blank means required with no default.

### `kind: "text"`
Renders animated text. Mode chooses the primitive.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position. |
| `y` | `number` | required | — | Y position (baseline). |
| `text` | `string` | required | — | The text content. |
| `size` | `number` | optional | `22` | Font size in px; font is `700 {size}px -apple-system, sans-serif`. |
| `color` | `string` | optional | `"#eef5ef"` | Text color. |
| `align` | `CanvasTextAlign` | optional | `"center"` | Text alignment (only used in `plain` mode). |
| `mode` | `"plain" \| "word" \| "slam"` | optional | *plain* (falls through) | Animation style. |

- `mode === "word"` → `drawWordReveal(...)` with `{ start: beat.at, step: 0.12, mode: "rise" }` (words rise in, 0.12s stagger).
- `mode === "slam"` → `drawSlam(...)` anchored at `beat.at`.
- otherwise → `fadeText(ctx, text, x, y, p, font, color, align)` (fade in over `p`).

### `kind: "math"`
Renders a TeX expression via `drawMath`.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position. |
| `y` | `number` | required | — | Y position. |
| `tex` | `string` | required | — | TeX/LaTeX source. |
| `size` | `number` | optional | `30` | Font size passed to `drawMath`. |
| `color` | `string` | optional | *(drawMath default)* | Color; passed through as `beat.color` (undefined → drawMath's own default). |
| `align` | `"left" \| "center" \| "right"` | optional | `"center"` | Horizontal alignment. |

Calls `drawMath(ctx, tex, x, y, { size, color, align, p })` — reveal driven by `p`.

### `kind: "counter"`
An animated number rolling from `from` to `to`.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position (center-aligned). |
| `y` | `number` | required | — | Y position. |
| `from` | `number` | required | — | Start value. |
| `to` | `number` | required | — | End value. |
| `size` | `number` | optional | `40` | Font size; font `800 {size}px -apple-system, sans-serif`. |
| `color` | `string` | optional | `"#5cc8ae"` | Number color. |
| `fmt` | `NumberFormat` | optional | *(none)* | Number-format spec passed to `drawCounter`. |

Value = `counterValue(t, at, dur ?? 2, from, to)`; drawn with `drawCounter(..., { font, color, align: "center" }, fmt)`. Note the **2s** default duration.

### `kind: "bars"`
An animated bar chart.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Plot left. |
| `y` | `number` | required | — | Plot top. |
| `w` | `number` | required | — | Plot width. |
| `h` | `number` | required | — | Plot height. |
| `data` | `Datum[]` | required | — | Bar data (from charts). |
| `ymax` | `number` | required | — | Top of the y-domain (y-domain is `[0, ymax]`). |
| `color` | `string` | optional | *(chart default)* | Bar color. |

Calls `barChart(ctx, makePlot({x,y,w,h}, [0,1], [0,ymax]), data, { t, start: at, step: 0.18, color, showValues: true })`. Bars grow with a 0.18s stagger; values shown.

### `kind: "pie"`
An animated pie / donut chart.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Center X. |
| `y` | `number` | required | — | Center Y. |
| `r` | `number` | required | — | Radius. |
| `data` | `Datum[]` | required | — | Slice data. |
| `donut` | `number` | optional | *(none)* | Inner-radius ratio for a donut hole (passed as `donut`). |

Calls `pie(ctx, x, y, r, data, p, { donut, labels: true })` — sweeps in with `p`, labels on.

### `kind: "line"`
An animated line/area chart over an explicit domain.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Plot left. |
| `y` | `number` | required | — | Plot top. |
| `w` | `number` | required | — | Plot width. |
| `h` | `number` | required | — | Plot height. |
| `series` | `[number, number][]` | required | — | Data points as `[x, y]` pairs. |
| `xDomain` | `[number, number]` | required | — | X axis domain. |
| `yDomain` | `[number, number]` | required | — | Y axis domain. |
| `area` | `boolean` | optional | *(falsy)* | Fill under the line if true. |
| `color` | `string` | optional | *(chart default)* | Line color. |

Calls `lineChart(ctx, makePlot({x,y,w,h}, xDomain, yDomain), series, p, { area, color, markers: true })` — draws on with `p`, point markers on.

### `kind: "icon"`
A single icon.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | X position. |
| `y` | `number` | required | — | Y position. |
| `name` | `IconName` | required | — | Icon to draw. |
| `size` | `number` | optional | `28` | Icon size. |
| `color` | `string` | optional | *(icon default)* | Icon color. |
| `filled` | `boolean` | optional | *(icon default)* | Filled vs outline. |

Calls `drawIcon(ctx, name, x, y, size ?? 28, { color, filled, alpha: p })` — fades in via `p`.

### `kind: "callout"`
A leader-line annotation with label, pointing at a target.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Target X (leader points here). |
| `y` | `number` | required | — | Target Y. |
| `text` | `string` | required | — | Body text. |
| `title` | `string` | optional | *(none)* | Optional title line. |
| `side` | `Side` | optional | *(callout default)* | Which side the label sits on. |
| `route` | `LeaderRoute` | optional | *(callout default)* | Leader-line routing style. |
| `container` | `Container` | optional | *(callout default)* | Label container style. |

Uses `dur ?? 1.5`. Calls `callout(frame, { target: [x,y], text, title, side, route, container, leaderP: p, labelP: phase(t, at + Math.min(0.4, cd*0.3), at + cd) })`. The leader draws on first (`leaderP`), then the label fades in (`labelP` starts slightly after the beat).

### `kind: "particles"`
A particle emitter from a named preset.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Emitter X. |
| `y` | `number` | required | — | Emitter Y. |
| `preset` | `"fire" \| "smoke" \| "sparks" \| "energy" \| "confetti"` | required | — | Emitter preset (see PRESETS). |
| `seed` | `number` | optional | `1` | Passed as the emitter's `s` (size/seed) argument. |

Calls `emit(ctx, PRESETS[preset](x, y, seed ?? 1), t - at)` — the emitter plays with local time `t - at`.

### `kind: "ring"`
A focus ring — either converging rings or a pulsing highlight ring.

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Center X. |
| `y` | `number` | required | — | Center Y. |
| `r` | `number` | required | — | Ring radius (used only when `converge` is falsy). |
| `color` | `string` | optional | *(focus default)* | Ring color. |
| `converge` | `boolean` | optional | *(falsy)* | If true, `focusRings(ctx, x, y, p, { color })` (rings converge inward); else `highlightRing(ctx, x, y, r, t, { color })` (pulsing ring). |

### `kind: "rect"`
A filled (optionally rounded) rectangle. Note: `color` is **required** here (unlike other beats).

| Field | Type | Optional? | Default | Meaning |
|---|---|---|---|---|
| `x` | `number` | required | — | Left. |
| `y` | `number` | required | — | Top. |
| `w` | `number` | required | — | Width. |
| `h` | `number` | required | — | Height. |
| `color` | `string` | **required** | — | Fill color. |
| `radius` | `number` | optional | `0` | Corner radius (`ctx.roundRect`). |

Drawn with `globalAlpha *= p` so it fades in over the beat window.

**Unknown kinds.** If a beat's `kind` matches none of the above, the interpreter logs `console.warn('storyboard: unknown beat kind "…"')` and draws nothing (runtime diagnostic for malformed / LLM-emitted beats).

---

## `renderBeat` — beat → primitive mapping (summary)

`renderBeat(frame, beat, t)` computes `p = phase(t, beat.at, beat.at + (beat.dur ?? 1))`, returns early if `t < beat.at`, resolves the layer (`beat.layer ?? defaultLayer(kind)`), grabs `ctx = frame.layer.ctx(layerName)`, then switches on `kind`:

| Beat kind | Underlying function(s) | How `p` drives it |
|---|---|---|
| `text` | `drawWordReveal` / `drawSlam` / `fadeText` | word/slam use `t` & `at`; plain fades over `p`. |
| `math` | `drawMath` | passed `p` for reveal. |
| `counter` | `counterValue` + `drawCounter` | value interpolated by `counterValue(t, at, dur ?? 2, from, to)`. |
| `bars` | `makePlot` + `barChart` | animated by `t`/`start`/`step` (not `p`). |
| `pie` | `pie` | sweep driven by `p`. |
| `line` | `makePlot` + `lineChart` | draw-on driven by `p`. |
| `icon` | `drawIcon` | `alpha: p`. |
| `callout` | `callout` | `leaderP: p`, `labelP` a delayed phase. |
| `particles` | `PRESETS[preset]` + `emit` | local time `t - at`. |
| `ring` | `focusRings` (converge) / `highlightRing` | converge uses `p`; highlight uses `t`. |
| `rect` | `ctx.roundRect` + fill | `globalAlpha *= p`. |

## `PRESETS` — valid particle preset names

```ts
const PRESETS: Record<string, (x, y, s) => EmitterConfig> = {
  fire, smoke, sparks, energy,
  confetti: (x, y, s) => ({ ...confettiEmitter(x, y, s), rate: 22, loop: true }),
};
```

Valid `preset` values: **`"fire"`**, **`"smoke"`**, **`"sparks"`**, **`"energy"`**, **`"confetti"`**. Each maps to the matching emitter factory (`fireEmitter`, `smokeEmitter`, `sparksEmitter`, `energyEmitter`); `confetti` wraps `confettiEmitter` with `rate: 22, loop: true`.

---

## Scene & storyboard types

```ts
export interface StoryScene {
  duration: number;              // scene length (seconds)
  bg?: [string, string];         // linear gradient stops [top, bottom]; default ["#141c24", "#0f151b"]
  captions?: CaptionSegment[];   // caption track for the scene
  beats: Beat[];                 // the beats to render
}

export interface Storyboard extends ComposeOptions {
  scenes: StoryScene[];          // plus all ComposeOptions fields (transitions, etc.)
}
```

- **`StoryScene.duration`** — required; scene length in seconds.
- **`StoryScene.bg`** — optional gradient stops; default `["#141c24", "#0f151b"]` (dark top→bottom vertical gradient over the full 920×430 frame).
- **`StoryScene.captions`** — optional `CaptionSegment[]`.
- **`StoryScene.beats`** — the beats.
- **`Storyboard`** — a `StoryScene[]` plus every field of `ComposeOptions` (spread into the compose call; e.g. scene transitions).

---

## `storyboardScene`

```ts
export function storyboardScene(scene: StoryScene): CanvasSlideDefinition
```

Compiles one `StoryScene` into a `CanvasSlideDefinition`.

- Fixed frame: **`viewW = 920`, `viewH = 430`**.
- Carries over `scene.duration` and `scene.captions`.
- **Requires the layer model.** In `render`, if `frame` is absent it just `clearRect`s and returns (nothing drawn) — storyboards only work with the frame/layer compositor.
- Draws the background gradient on the `"bg"` layer (from `scene.bg`), then calls `renderBeat(frame, beat, t)` for every beat in order.

**Example**
```ts
const slide = storyboardScene({ duration: 6, beats: [{ kind: "text", at: 0, x: 460, y: 120, text: "Hello" }] });
```

## `storyboardFilm`

```ts
export function storyboardFilm(story: Storyboard): CanvasSlideDefinition
```

Compiles a whole storyboard into a single composed, seekable film.

- Destructures `{ scenes, ...opts }` from `story`.
- Maps each scene through `storyboardScene`, then `composeSlides(sceneSlides, opts)` — so every non-`scenes` field on the storyboard is forwarded to the composer as `ComposeOptions`.
- **When.** This is the top-level entry point for a JSON-authored lesson: build a `Storyboard` object and pass it here to get the final slide/film.

**Example**
```ts
const film = storyboardFilm({
  scenes: [scene1, scene2],
  // ...ComposeOptions (e.g. transition settings)
});
```
