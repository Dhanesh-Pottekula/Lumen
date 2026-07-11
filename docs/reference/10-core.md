# Core contracts & shared systems

This section documents the foundational contracts of the **Lumen** canvas animation engine: the shape of a scene, the per-frame layer/theme system threaded into every render, the motion-math library, and how standalone scenes are stitched into a film. Everything here is a **pure function of time** — that is the invariant the whole engine depends on.

---

## The render contract

A scene is a `CanvasSlideDefinition` (`src/slides/types.ts`):

```ts
interface CanvasSlideDefinition {
  duration: number;                                                          // timeline length in seconds
  viewW: number;                                                             // logical coordinate width
  viewH: number;                                                             // logical coordinate height
  render: (ctx: CanvasRenderingContext2D, t: number, frame?: FrameCtx) => void;
  captions?: CaptionSegment[];                                               // optional subtitles keyed to t
}
```

- `duration: number` — length of the scene's timeline in seconds. `t` is expected to run `0 → duration`.
- `viewW: number` / `viewH: number` — the logical coordinate space the `render` function draws in. The canvas is transformed so that `(0,0)` is top-left and `(viewW, viewH)` is bottom-right, regardless of device pixel ratio. **Scene coordinate convention in these lessons is `920 × 430`** (see `src/lessons/*.ts`, where `const W = 920; const H = 430;`). Every scene in a composed film must share the same `viewW`/`viewH` (enforced by `composeSlides`).
- `render(ctx, t, frame?)` — draws one frame at scene-local time `t` (seconds).
  - `ctx: CanvasRenderingContext2D` — the target 2D context, pre-transformed into view coordinates.
  - `t: number` — **scene-local seconds** (`0` at the scene's own start, not the film's). When composed, the composer passes `t - start` clamped to `[0, duration]`.
  - `frame?: FrameCtx` — optional shared per-frame state (layers, theme, camera, film grade). A scene may ignore it and draw straight to `ctx` (legacy path), or route drawing through `frame.layer` to get depth/theming/compositing.
- `captions?: CaptionSegment[]` — optional on-screen subtitle segments keyed to the timeline (see below).

### CaptionSegment

```ts
interface CaptionSegment {
  at: number;   // time (seconds) at which this caption becomes current
  text: string; // subtitle text
}
```

Each segment is shown from its `at` until the next segment's `at`. In a scene, `at` is scene-local; `composeSlides` rebases each caption to film time (`c.at + start`) and drops any that would spill past the next scene's start.

### Purity rules (non-negotiable)

`render` **MUST be pure**: the same `t` in must always produce the same pixels out. This is what makes a scene seekable and scrubbable like a video.

- **No `Date.now()`, no `performance.now()`, no `Math.random()`, no timers, no accumulated/mutable state across frames.**
- For anything that needs "randomness" (jitter, grain, personalities, scattered layouts), use the seeded PRNG `prng(seed)` from `motion.ts` / `anim.ts`. It is deterministic for a fixed seed.
- All time-derived motion must be a function of `t` (or of a `0→1` progress derived from `t`). Use the easing/staging/oscillator helpers below — they are all pure.

Because the contract holds, the engine can render frame `N` in isolation, seek to any `t`, or re-render for a crossfade buffer, and always get identical output.

---

## The layer model (FrameCtx)

`FrameCtx` (`src/render/frame.ts`) is the shared per-frame state threaded into `render`. It owns a lazily-created stack of offscreen layer canvases that composite onto the target context in a fixed order. Nothing in it reads a clock — it is fully deterministic.

```ts
interface FrameCtx {
  t: number;
  viewW: number;
  viewH: number;
  layer: LayerApi;
  theme: Theme;
  grade(opts?: { vignette?: number; grain?: number }): void;
  setCamera(cam: Camera | undefined): void;
}
```

- `t: number` — the same scene-local time passed to `render`.
- `viewW` / `viewH` — the view dimensions (mirror the scene's).
- `layer: LayerApi` — the layer drawing/compositing API (below).
- `theme: Theme` — the active art-direction theme (below). Ask it for roles (`theme.palette.ink`, `theme.palette.accent`, …) instead of hard-coding colors.
- `grade(opts?)` — paint the filmic pass (vignette + tonal grade + deterministic grain) onto the `fx` layer. `vignette` default `0.3`, `grain` default `0.04`. Seekable (grain is re-seeded per ~12 fps tick from `t`). The `fx` layer is forced `screenspace` so the grade never pans/zooms with a camera. *Usually you don't call this per-scene — the composer applies it film-wide via `filmGrade`.*
- `setCamera(cam)` — set the frame camera (pan/zoom/rotate), applied to all non-`screenspace` layers at composite time. Pass `undefined` for no camera. A camera that is effectively neutral is skipped automatically (see `isNeutral` in `src/render/camera.ts`).

> The caller (player/composer) creates the frame via `createFrame(target, t, viewW, viewH, theme?, camera?)` and calls `finish()` after `render` returns. `finish()` composites any layers that were used; if the scene never touched a layer, `finish()` is a no-op and the scene's direct `ctx` drawing stands.

### LayerApi

```ts
interface LayerApi {
  ctx(name: LayerName): CanvasRenderingContext2D;
  set(name: LayerName, opts: LayerOptions): void;
  clear(name: LayerName): void;
}
```

- `ctx(name)` — returns the drawing context for a named layer. The layer canvas is lazily created on first request, its transform matched to the target (so scene coords map 1:1), and cleared for this frame. On creation, the layer's composite options are **seeded from the theme's per-role FX defaults** (`theme.fx.layers[name]`), so simply routing drawing to a layer inherits that role's cinematic treatment (bloom/shadow) for free.
- `set(name, opts)` — merge `LayerOptions` into a layer's composite options (shallow merge over the existing/seeded options).
- `clear(name)` — reset a layer's composite options to none. The escape hatch to opt out of theme-seeded FX (e.g. a scene that wants a crisp foreground with no inherited bloom).

### LayerName and layer roles

```ts
type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";
const LAYER_ORDER = ["bg", "mid", "fg", "annotation", "fx"]; // composite order, back → front
```

Layers composite in `LAYER_ORDER` (back to front). Conventional roles:

- `bg` — backdrop / sky / distant scenery. Often given a small parallax `offset` and/or `blur` for depth.
- `mid` — the main subjects. In `TEXTBOOK`/`PARCHMENT` themes this role gets a soft drop shadow by default (depth).
- `fg` — energy, particles, foreground elements up front. In `TEXTBOOK`/`CHALKBOARD` this role gets a bloom (`glow`) by default.
- `annotation` — labels, callouts, arrows, measurement lines drawn over the art (unstyled by default themes).
- `fx` — the filmic overlay (vignette/grade/grain). `grade()` forces this layer `screenspace`. Composited last (front-most).

### LayerOptions — every field

```ts
interface LayerOptions {
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  alpha?: number;
  scale?: number;
  rotate?: number;
  blend?: GlobalCompositeOperation;
  filter?: string;
  glow?: { strength: number; blur: number };
  shadow?: { blur: number; color: string; dx?: number; dy?: number };
  screenspace?: boolean;
}
```

- `offsetX: number` (default `0`) — view-space horizontal parallax offset applied to the whole layer at composite. *Use to push background layers slightly opposite a camera or to fake depth.*
- `offsetY: number` (default `0`) — view-space vertical parallax offset. *Same as `offsetX`, vertical.*
- `blur: number` (default `0`) — Gaussian blur in **device pixels** applied at composite. *Use for depth-of-field / soft distant `bg` layers, or a dreamy `fg`.*
- `alpha: number` (default `1`) — layer opacity multiplier at composite. *Use to fade a whole layer in/out as one unit (e.g. drive it with `phase(t, …)`).*
- `scale: number` (default `1`) — uniform zoom about the layer's center. *Use for a subtle push-in on one layer, or a slow ken-burns on `bg`.*
- `rotate: number` (default `0`) — rotation in **radians** about the layer's center. *Use for tilt/dutch-angle effects on a single layer.*
- `blend: GlobalCompositeOperation` (default none / `source-over`) — composite mode for the layer, e.g. `"lighter"` (additive glow), `"multiply"` (shadow/tint). *Use when a layer should add light or darken what's behind it rather than paint over.*
- `filter: string` (default none) — extra CSS filter string, e.g. `"saturate(0.6) brightness(1.1)"`. Combined with `blur` (blur is prepended). *Use for per-layer color grading / desaturating a background.*
- `glow: { strength: number; blur: number }` (default none) — cinematic bloom. After the layer is drawn, a blurred additive (`"lighter"`) copy of the same layer is laid over it; the bloom is self-colored (takes the layer's own colors). `strength` scales the bloom's alpha (multiplied by the layer's `alpha`); `blur` is in **view units** (dpr-scaled at composite). Skipped when `strength <= 0`. *Use for energy/particles/chalk/light sources on `fg` or `mid`.*
- `shadow: { blur: number; color: string; dx?: number; dy?: number }` (default none) — native drop shadow cast by the layer's drawn shapes. `blur`, `dx`, `dy` are in **view units** (dpr-scaled); `dx`/`dy` default `0`. *Use to lift subjects off the background (the default `mid` treatment in `TEXTBOOK`/`PARCHMENT`).*
- `screenspace: boolean` (default `false`) — skip the frame camera for this layer, keeping it fixed in screen space. *Use for fixed UI, titles, subtitles, HUD, or the filmic grade — anything that must not pan/zoom with the world.*

### Compositing order in `finish()`

For each `name` in `LAYER_ORDER` that was used:

1. **Primary pass** — composite in device pixels: apply `alpha`, `blend`, combined `blur`+`filter`, native `shadow`, then the camera (unless `screenspace`), then the layer geometry (`offsetX/Y`, `scale`, `rotate`), then draw the layer canvas.
2. **Bloom pass** (only if `glow.strength > 0`) — a second draw of the same layer canvas with `globalCompositeOperation = "lighter"`, alpha `= alpha * glow.strength`, and `blur(glow.blur * dpr)`, under the same camera + geometry. This adds the self-colored bloom over the primary.

`finish()` no-ops if the target canvas has zero size (not yet laid out).

---

## Themes

A `Theme` (`src/render/theme.ts`) is art direction expressed as plain data — like CSS variables for the canvas. It rides on `FrameCtx` so scenes request roles instead of literal colors; swapping the theme reskins a whole film.

```ts
interface Theme {
  name: string;
  palette: Palette;
  texture: TextureKind;                              // "none" | "parchment" | "blueprint" | "chalkboard"
  lineStyle: { width: number; roughness: number };   // roughness 0 = crisp, ~2 = hand-drawn
  type: { display: string; body: string; mono: string };
  fx: {
    glow: boolean;
    grain: number;
    vignette: number;
    layers?: Partial<Record<LayerName, LayerOptions>>;
  };
}

type Palette = {
  bg: string; surface: string; ink: string; accent: string; muted: string; danger: string;
};
type TextureKind = "none" | "parchment" | "blueprint" | "chalkboard";
```

- `name: string` — human label for the theme.
- `palette` — the six semantic color roles:
  - `bg` — page/backdrop base color (painted by `paintTexture`).
  - `surface` — panels, cards, filled shapes sitting on top of `bg`.
  - `ink` — primary text/line color.
  - `accent` — highlights, the "brand" color, active states.
  - `muted` — secondary text, de-emphasized lines, gridlines.
  - `danger` — errors, warnings, negative quantities.
- `texture: TextureKind` — which backdrop texture `paintTexture` lays over `bg`: `"none"`, `"parchment"` (warm gradient + aged edges + fibre grain), `"blueprint"` (fine + heavy grid lines), `"chalkboard"` (white chalk dust speckle).
- `lineStyle.width: number` — default stroke width for themed lines/labels.
- `lineStyle.roughness: number` — hand-drawn jitter amount; `0` = crisp, `~2` = hand-drawn. Feeds `roughen()` (below).
- `type.display` / `type.body` / `type.mono` — font-family strings for headings, body text, and monospace respectively.
- `fx.glow: boolean` — whether the theme's aesthetic favors bloom (advisory flag scenes can read).
- `fx.grain: number` — grain intensity for the filmic grade (used as `grade({ grain })` default at film level).
- `fx.vignette: number` — vignette darkness for the filmic grade.
- `fx.layers?: Partial<Record<LayerName, LayerOptions>>` — **per-role FX applied automatically to each layer at composite time.** This is the single knob that reskins a whole film's cinematic feel: any scene that routes drawing to a layer inherits that role's treatment (bloom/shadow/etc.) for free. Omit a role for no default treatment.

### Presets

Four presets are exported. Their `fx.layers` defaults are what give each its "feel":

| Preset | Character | Texture | lineStyle | Per-role FX defaults (`fx.layers`) |
|---|---|---|---|---|
| **`TEXTBOOK`** | Clean dark modern textbook; teal accent on slate. The default. | `none` | `width 2, roughness 0` (crisp) | `mid`: soft drop shadow (`blur 9`, `rgba(0,0,0,0.28)`, `dy 3`); `fg`: gentle bloom (`strength 0.3, blur 6`) |
| **`PARCHMENT`** | Ink-on-aged-paper; warm browns, serif type, hand-drawn lines. | `parchment` | `width 2.4, roughness 1.6` | `mid`: warm print-depth shadow (`blur 6`, `rgba(74,47,26,0.3)`, `dy 2`); no bloom (paper doesn't glow) |
| **`BLUEPRINT`** | Technical drawing on blue; crisp cyan lines, grid backdrop. Clarity over cinematics. | `blueprint` | `width 1.6, roughness 0` | none (no bloom, no shadow) |
| **`CHALKBOARD`** | Chalk on slate; bright warm-yellow strokes that bloom like chalk dust. | `chalkboard` | `width 2.6, roughness 1.2` | `fg`: strong bloom (`strength 0.5, blur 9`); `mid`: bloom (`strength 0.35, blur 7`) |

Palettes (for reference):

- `TEXTBOOK` — bg `#16222c`, surface `#1e2c38`, ink `#eef5ef`, accent `#5cc8ae`, muted `#93a4b0`, danger `#e24b4a`. Sans display/body, `grain 0.04`, `vignette 0.3`, `glow true`.
- `PARCHMENT` — bg `#efe2c4`, surface `#e6d3a8`, ink `#4a2f1a`, accent `#9a3b2e`, muted `#8a7048`, danger `#8c2b1e`. Georgia/serif display+body, `grain 0.06`, `vignette 0.42`, `glow false`.
- `BLUEPRINT` — bg `#0d2b52`, surface `#123a6b`, ink `#dbe9ff`, accent `#7fd0ff`, muted `#7f9fce`, danger `#ff8a8a`. Sans, `grain 0.03`, `vignette 0.3`, `glow true`.
- `CHALKBOARD` — bg `#1f2a26`, surface `#26332e`, ink `#eaf3ec`, accent `#ffe08a`, muted `#9db3a6`, danger `#ff9a9a`. Sans, `grain 0.08`, `vignette 0.36`, `glow false`.

**When to pick which:** `TEXTBOOK` for general STEM/modern explainers (default). `PARCHMENT` for history, literature, classical/period subjects. `BLUEPRINT` for engineering, architecture, systems/diagrams needing precision. `CHALKBOARD` for math derivations and lecture-hall/classroom feel.

### roughen()

```ts
function roughen(points: [number, number][], roughness: number, seed: number): [number, number][]
```

Returns a new point array with each point jittered by a seeded per-point offset for a hand-drawn look. `roughness <= 0` returns the points unchanged (still a fresh copy). Uses `prng(seed)`, so it is deterministic for a fixed seed. *Use to give polylines/paths the theme's `lineStyle.roughness` character; pass a stable per-shape seed so the wobble doesn't flicker frame to frame.*

```ts
const wobbly = roughen(pts, theme.lineStyle.roughness, 42);
```

### paintTexture() (`src/render/texture.ts`)

```ts
function paintTexture(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number): void
```

Fills the whole view with `theme.palette.bg`, then lays the theme's texture over it (parchment gradient + aged edges + fibre grain; blueprint fine + heavy grids; chalkboard dust speckle; `none` = plain fill). Deterministic — grain uses a seeded PRNG so scrubbing stays exact. Called by the player before the scene renders; scenes normally don't call it themselves.

---

## Motion & easing (motion.ts / anim.ts)

The pure motion-math lives in `src/render/motion.ts`. `src/slides/anim.ts` re-exports all of it (so `import { phase, lerp, prng } from "./anim"` works) and adds the canvas-aware drawing helpers. Every function here is deterministic — no clocks, no state, no `Math.random()`.

### Core numeric helpers

```ts
const clamp01 = (v: number): number
```
Clamps `v` into `[0, 1]`. *Use to bound any raw progress before feeding an easing that assumes `[0,1]`.*

```ts
const lerp = (a: number, b: number, p: number): number
```
Linear interpolation: `a + (b - a) * p`. *Use to map a `0→1` progress onto a value range (positions, sizes, colors via channels).*

```ts
const cycle = (v: number): number
```
Fractional part — loops `v` into `[0, 1)` (`v - floor(v)`). *Use for repeating cycles driven by `t`, e.g. `cycle(t / period)` to get a looping phase.*

### Easings — shape a `0→1` progress (all clamp their input)

```ts
const smooth = (p: number): number
```
Smoothstep (`p*p*(3-2p)`). Gentle acceleration + deceleration — the default "nice" curve. *Use as the go-to easing for most reveals/moves.*

```ts
const easeOutCubic = (p: number): number
```
`1 - (1-p)^3`. Fast start, soft landing. *Use for elements that shoot in and settle (decelerating entrances).*

```ts
const easeInOutCubic = (p: number): number
```
Symmetric cubic ease-in-out. Stronger easing than `smooth`. *Use for deliberate, weighty transitions where you want more hold at the ends.*

```ts
const easeOutBack = (p: number): number
```
Ease-out with a slight overshoot past `1` then settle. *Use for lively "pop" reveals (badges, icons appearing).*

```ts
const spring = (p: number): number
```
Springy `0→1`: fast rise then a gentle damped settle toward `1`. Clamped — no drift past bounds. *Use for bouncy/organic arrivals; compose it with `phase`, e.g. `spring(phase(t, 2, 4))`.*

### Staging — turn scene time `t` into staged progress

```ts
const phase = (t: number, a: number, b: number): number
```
**The central timing primitive.** Returns the smoothstep-eased `0→1` progress of `t` across the window `[a, b]`:
- `t <= a` → `0` (before the window: nothing yet).
- `a < t < b` → ramps smoothly `0 → 1`.
- `t >= b` → `1` (after the window: fully done, held).

It is `smooth((t - a) / (b - a))`, so the clamping of `smooth` gives the before/after hold behavior. This is how you author every timed reveal, move, or fade in a scene: pick a start and end second, and drive a value with `lerp(from, to, phase(t, start, end))`.

```ts
// Fade a title in over seconds 0.5→1.5, then hold; slide it up 20px in the same window.
const p = phase(t, 0.5, 1.5);
fadeText(ctx, "Newton's Law", cx, cy - lerp(0, 20, p), p, theme.type.display, theme.palette.ink);
```

```ts
const stagger = (t: number, i: number, opts: { start?: number; step: number; dur: number }): number
```
Staggered/cascaded reveal for item `i`. Item `i` runs its own window `[start + i*step, start + i*step + dur]` and returns that item's eased `0→1` (via `phase`). `opts.start` defaults to `0`. *Use for lists, letters, bars, dots entering one after another without hand-authoring each window.*

```ts
items.forEach((item, i) => {
  const a = stagger(t, i, { start: 1.0, step: 0.15, dur: 0.5 });
  // draw item with alpha/offset driven by a
});
```

### Oscillators — continuous deterministic motion for idle life & repetition

```ts
const breathe = (t: number, period: number, amount: number): number
```
Gentle oscillation around `1` (mean), amplitude `amount`, `period` in seconds: `1 + sin(2π·t/period)·amount`. *Use as a multiplier for idle "breathing" scale/size so static subjects feel alive.*

```ts
const pulse = (t: number, period: number): number
```
`0→1→0` pulse via cosine, `period` seconds: `(1 - cos(2π·t/period)) / 2`. Always in `[0,1]`. *Use for blinking, heartbeats, attention flashes (drive an alpha or glow strength).*

```ts
const wobble = (t: number, period: number, amount: number): number
```
Signed oscillation around `0` (mean), amplitude `amount`, `period` seconds: `sin(2π·t/period)·amount`. *Use for sway/jitter/nudge offsets added to a position.*

### Deterministic pseudo-randomness

```ts
function prng(seed: number): () => number
```
Seeded PRNG (mulberry32). Returns a generator function; each call yields the next number in `[0, 1)`. Deterministic for a fixed `seed`. **This is the only source of "randomness" allowed in a scene** — use it for personalities, scattered layouts, star fields, grain, etc.

```ts
const rnd = prng(7);
const stars = Array.from({ length: 40 }, () => ({ x: rnd() * viewW, y: rnd() * viewH }));
```

### Canvas-aware drawing helpers (`anim.ts` only)

```ts
interface PathPoint { x: number; y: number; angle: number }
function makePath(points: [number, number][]): { length: number; at(d: number): PathPoint }
```
Builds an arc-length-parameterised polyline. `length` is the total path length; `at(d)` returns the point (and tangent `angle` in radians) a distance `d` along the path (clamped to `[0, length]`). *Use to walk a dot/marker along a route at constant speed: `path.at(phase(t, a, b) * path.length)`.*

```ts
function fadeText(ctx, text, x, y, alpha, font, color, align: CanvasTextAlign = "center"): void
```
Draws `text` at `(x, y)` with `globalAlpha = clamp01(alpha)`, given `font` and `color`, saving/restoring alpha/font/fill/align around it. No-op when `alpha <= 0`. *Use for every fading text label; drive `alpha` with `phase`.*

```ts
function radialGlow(ctx, x, y, r, color, alpha = 1): void
```
Additive radial-gradient glow blob centered at `(x, y)`, radius `r`, fading `color → transparent`. Uses `"lighter"` compositing so overlapping light adds up. No-op if `alpha <= 0` or `r <= 0`. Save/restored. *Use for suns, beams, electrons, energy — anything that emits light.*

```ts
function withGlow(ctx, opts: { blur; color; offsetX?; offsetY? }, draw: () => void): void
```
Runs `draw()` with a native canvas shadow (`shadowBlur`/`shadowColor`/offsets) set, then restores. Offsets default `0`. *Use for soft halos/shadows around arbitrary drawing without manual save/restore.*

```ts
function withAlpha(ctx, alpha: number, draw: () => void): void
```
Runs `draw()` with `globalAlpha *= clamp01(alpha)`, save/restored. No-op at `alpha <= 0`. *Use to fade a group of draw calls as one unit.*

```ts
function drawSvg(ctx, img, cx, cy, w, h, opts: { alpha?; rotate? } = {}): void
```
Draws an image (`CanvasImageSource`) centered at `(cx, cy)` at `w × h`, with optional `alpha` (default `1`) and `rotate` (radians). No-op when `img` is falsy or `alpha <= 0`, so scenes can call it with an optional/lazy-loaded asset. *Use for placing pre-rendered SVG/bitmap assets.*

---

## Composition (compose.ts)

`composeSlides` (`src/slides/compose.ts`) stitches standalone scenes into one film on a single timeline. Consecutive scenes overlap by `crossfade` seconds; each renders at its own local time inside a fade-in × fade-out alpha envelope. The result is a plain `CanvasSlideDefinition`, so the composed film is still a pure, seekable function of `t`.

```ts
function composeSlides(scenes: CanvasSlideDefinition[], options?: ComposeOptions): CanvasSlideDefinition
```

- `scenes` — one or more scenes. **All must share the same `viewW`/`viewH`** as `scenes[0]` (throws otherwise). Empty array throws.
- Returns a `CanvasSlideDefinition` whose `duration` is the total film length, with merged, rebased `captions`.

### ComposeOptions

```ts
interface ComposeOptions {
  crossfade?: number;      // default 2.5
  progressDots?: boolean;  // default true
  filmGrade?: boolean;     // default false
  theme?: Theme;           // default TEXTBOOK
  transition?: TransitionKind; // default "crossfade"
}
```

- `crossfade: number` (default `2.5`) — seconds of overlap between consecutive scenes. Clamped to `>= 0`; if it exceeds half the shortest scene's duration it is clamped to `shortest/2` (with a console warning). *Lower it for snappier cuts, raise it for dreamier dissolves.*
- `progressDots: boolean` (default `true`) — draw one progress dot per scene along the bottom (only meaningful for 2+ scene films). Active dot is amber (`#e8a13c`), completed dots teal (`#5cc8ae`), upcoming dots grey (`#39434d`). *Turn off for a clean full-bleed film.*
- `filmGrade: boolean` (default `false`) — apply the filmic overlay (vignette + grain + tonal grade) to the final composited frame, driven by the theme's `fx.vignette`/`fx.grain`. *Turn on for a cinematic finish; leave off for flat/diagrammatic clarity.*
- `theme: Theme` (default `TEXTBOOK`) — art-direction theme passed to every scene's `FrameCtx` and used for the film grade. *Set to reskin the whole film at once.*
- `transition: TransitionKind` (default `"crossfade"`) — scene-to-scene transition style (below).

### TransitionKind

```ts
type TransitionKind = "crossfade" | "zoom-through" | "whip-pan";
```

All three still run under the alpha crossfade envelope; the non-default kinds add an extra transform to the entering/leaving scene buffer:

- `"crossfade"` — pure opacity dissolve, no extra transform. The default, calmest transition.
- `"zoom-through"` — the entering scene starts slightly large (`scale 1.14 → 1`) and settles; the leaving scene grows as it exits (`scale 1 → 1.5`). Reads as diving through one scene into the next. *Use for a punchy, forward-momentum feel.*
- `"whip-pan"` — the entering scene slides in from the right and the leaving scene slides off to the left (`±55%` of canvas width). Reads as a fast horizontal camera whip. *Use for lateral "and now, over here…" transitions.*

### pace()

```ts
function pace(scene: CanvasSlideDefinition, newDuration: number): CanvasSlideDefinition
```

Re-paces a scene to play over a different (usually longer) `newDuration`, stretching its **entire internal timeline uniformly**. It returns a new scene with the new `duration` whose `render` calls the original with `t * (originalDuration / newDuration)`. So the scene animates over the full new length at the same relative timing — nothing freezes, no end-behavior is skipped, it just plays a touch slower (or faster). Pure: same `t` in, same pixels out. *Use to fit a scene to its narration length before composing.*

```ts
const fitted = pace(orbitScene, audioDurations.orbit); // stretch to match the voiceover
const film = composeSlides([intro, fitted, outro], { theme: TEXTBOOK, filmGrade: true });
```

### How scene windows & crossfades work

Windows are laid out with an advancing cursor so each scene starts `crossfade` seconds before the previous one ends:

- Scene `i`'s window is `start_i = start_{i-1} + (duration_{i-1} - crossfade)`, with `start_0 = 0`. Its fade-out `end_i = start_i + duration_i`.
- **Film duration** `= sum(durations) - (n - 1) * crossfade` (the cursor after all scenes, plus the trailing `crossfade` — algebraically the same).
- A scene's **local time** is `t - start_i`, clamped to `[0, duration_i]`.
- **Fade envelope:** `alpha = fadeIn * fadeOut`, where `fadeIn = phase(t, start, start + crossfade)` and `fadeOut = 1 - phase(t, end - crossfade, end)`. The **first scene has no fade-in and the last no fade-out** (they hold on a full frame — the film opens/closes solid, and scene-internal animation handles intro/outro). Only interior boundaries actually cross-dissolve.
- During a crossfade the composer renders each active scene into a **shared offscreen buffer** and composites that buffer under the envelope alpha, so a scene's own `clearRect`/absolute `globalAlpha` calls only affect the buffer — never defeating the fade. (Single-scene films and environments without buffer support fall back to a direct `withAlpha` render.)
- Captions from each scene are rebased to film time (`c.at + start_i`) and any that would spill past the next scene's start are dropped.
