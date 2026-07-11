# Step 05 · Reveal grammar — `src/render/reveal.ts`

**Responsibility.** Content that *enters by shape*: directional wipes, iris/shape reveals, clock (radial) wipes, blinds, checkerboard, dissolve, and soft radial spotlight / fog-of-war. The unifying model: every reveal is a mask that is a pure function of progress `p ∈ [0,1]`, applied one of two ways — a **hard** `ctx.clip()` to the revealed shape, or a **soft** offscreen buffer + `destination-in` mask (feather = a `blur()` on the mask; invert = `destination-out`). Each verb only describes *what shape is revealed at progress p*; the internal `applyReveal` picks the hard or soft path.

**When to use.** Any time a scene element should appear (or be concealed) by a growing/sweeping shape rather than a simple fade — title cards, map territories, staged diagram parts, "flashlight" reveals. For an exotic mask not built here, draw it yourself through the universal `masked()`. `withBlend()` is the low-level composite-mode wrapper the rest builds on.

**Determinism.** Masks are recomputed from `p` each frame with no state; `ease` wraps `p` (never baked in); `dissolve`/`checkerboard` randomness is seeded.

**Exports.** Functions: `withBlend`, `masked`, `revealRect`, `wipe`, `iris`, `clipShape`, `radialWipe`, `blinds`, `checkerboard`, `dissolve`, `spotlight`. Types: `BlendMode`, `RevealOptions`, `WipeDir`, `WipeOptions`, `IrisShape`, `IrisOptions`, `RadialWipeOptions`, `BlindsOptions`, `CheckerOrder`, `CheckerOptions`, `DissolveOptions`, `SpotlightOptions`.

> Note: `revealRect` is exported but is a low-level helper (the revealed rectangle for one cardinal direction). `applyReveal`, `revealRects`, and `irisPath` are internal (not exported).

---

### withBlend
```ts
export function withBlend(ctx: CanvasRenderingContext2D, mode: BlendMode, draw: () => void): void
```
- **Purpose:** Run `draw` under a composite/blend mode; the context's `globalCompositeOperation` is saved and restored around the call.
- **Parameters / options:**
  - `ctx: CanvasRenderingContext2D` — target context.
  - `mode: BlendMode` — the composite operation (alias of `GlobalCompositeOperation`, e.g. `"multiply"`, `"screen"`, `"lighter"`, `"destination-out"`, …). *When to use:* additive glows (`"lighter"`), shading (`"multiply"`), knock-outs (`"destination-out"`).
  - `draw: () => void` — closure that paints while the blend mode is active (takes no args; closes over `ctx`).
- **Example:**
  ```ts
  withBlend(ctx, "lighter", () => { ctx.fillStyle = "rgba(255,220,120,0.4)"; ctx.fillRect(x, y, w, h); });
  ```
- **Composes with:** the foundation for any additive/knock-out effect; `spotlight`/`focus` glows use the same idea internally.

---

### masked
```ts
export function masked(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  drawContent: (c: CanvasRenderingContext2D) => void,
  drawMask: (c: CanvasRenderingContext2D) => void,
  opts: { invert?: boolean } = {},
): void
```
- **Purpose:** The universal soft-mask primitive. Renders `drawContent` to an offscreen buffer, then composites the mask so the mask's alpha (or luminance if you paint opaque) becomes the coverage. Any custom reveal shape can be built on this. Falls back to drawing `drawContent(ctx)` unmasked when no DOM canvas is available (SSR / non-DOM contexts).
- **Parameters / options:**
  - `ctx` — target context. Reads `ctx.canvas.width/height` for the buffer size; requires `ctx.getTransform`.
  - `viewW: number`, `viewH: number` — view dimensions (accepted for API symmetry; the buffer itself is sized from the canvas backing store).
  - `drawContent: (c) => void` — paints the content to be masked.
  - `drawMask: (c) => void` — paints the mask; the fill style is preset to `#fff`. Draw a solid shape for a hard mask, a gradient or blurred shape for a soft one.
  - `opts.invert?: boolean` (default `false`) — `false` → `destination-in` (reveal *inside* the mask); `true` → `destination-out` (conceal inside the mask — fog-of-war the other direction).
- **Behavior notes:** The masked result is blitted back with `globalCompositeOperation = "source-over"`, ignoring any blend mode the caller set. Uses a shared reusable scratch canvas, and allocates a temporary one if called re-entrantly; the reentrancy flag is cleared even if a draw callback throws.
- **Example:**
  ```ts
  masked(ctx, w, h,
    (b) => drawScene(b),
    (m) => { m.filter = "blur(12px)"; m.beginPath(); m.arc(cx, cy, r, 0, 7); m.fill(); },
  );
  ```
- **Composes with:** the execution path behind soft `wipe`/`iris`/`clipShape`/`radialWipe`/`blinds`/`checkerboard`/`dissolve` and `spotlight`; also used directly by `focus.emphasizeSurround`.

---

### revealRect
```ts
export function revealRect(
  p: number,
  dir: "left" | "right" | "up" | "down",
  w: number,
  h: number,
): [number, number, number, number]
```
- **Purpose:** Pure helper returning the revealed rectangle `[x, y, w, h]` for a single cardinal directional wipe at progress `p` (clamped to `[0,1]`).
- **Parameters / options:**
  - `p: number` — progress, internally `clamp01`'d.
  - `dir` — one of: `"left"` (grows rightward from left edge), `"right"` (grows leftward from right edge), `"up"` (grows upward from bottom), `"down"` (grows downward from top).
  - `w`, `h` — view width/height.
- **Example:** `const [x, y, rw, rh] = revealRect(0.5, "left", 800, 450); // [0, 0, 400, 450]`
- **Composes with:** used internally by `wipe`'s rectangle computation; exposed for testing / custom clip math.

---

### wipe
```ts
export function wipe(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: WipeOptions = {},
): void
```
- **Purpose:** Reveal `draw` by sweeping an edge across the frame — directional, center-split, edges-in, or an arbitrary angle.
- **Parameters / options:**
  - `p: number` — raw progress; remapped through `opts.ease` if present.
  - `w`, `h` — view dimensions.
  - `draw: (c) => void` — content to reveal.
  - `opts.dir?: WipeDir` (default `"left"`) — sweep direction (see `WipeDir` values below). Ignored if `opts.angle` is set.
  - `opts.angle?: number` (radians) — arbitrary edge angle; **overrides `dir`**, enabling diagonals. Sweeps a half-plane whose normal is `angle`, projecting the frame corners to find the sweep range.
  - `opts.border?: { width: number; color: string }` — draws a stroked edge along the moving front while `0 < P < 1` (the sweeping line for `angle`; the rect outlines otherwise).
  - Plus all `RevealOptions`: `feather`, `invert`, `ease`.
- **Example:**
  ```ts
  wipe(ctx, p, 800, 450, (c) => drawTitle(c), { dir: "center-h", feather: 20, ease: easeInOut });
  wipe(ctx, p, 800, 450, drawMap, { angle: Math.PI / 6, border: { width: 3, color: "#fff" } });
  ```
- **Composes with:** `RevealOptions` easing; feather/invert route through `masked`.

---

### iris
```ts
export function iris(
  ctx: CanvasRenderingContext2D,
  p: number,
  cx: number,
  cy: number,
  maxR: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: IrisOptions = {},
): void
```
- **Purpose:** Reveal `draw` through a shape growing (or, with `close`, shrinking) from a center point — classic camera iris and shape-mask entrances.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `cx`, `cy` — center of the shape.
  - `maxR: number` — radius at full progress.
  - `draw` — content to reveal.
  - `opts.shape?: IrisShape` (default `"circle"`) — see `IrisShape` values below.
  - `opts.aspect?: number` (default `1`) — `ry/rx` for `"ellipse"`/`"rect"`.
  - `opts.sides?: number` (default `6` for polygon, `5` for star) — point count.
  - `opts.rotation?: number` (radians, default `0`) — rotate the shape.
  - `opts.innerRatio?: number` (default `0.5`) — star inner/outer radius ratio.
  - `opts.close?: boolean` (default `false`) — `false` → radius grows from `P` (opens); `true` → radius from `1−P` (closes/contracts).
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
- **Edge case:** when the computed radius `r <= 0`, nothing is drawn — except if `opts.invert` is set, in which case the full `draw` is shown (a fully-concealed shape reveals everything).
- **Example:**
  ```ts
  iris(ctx, p, 400, 225, 500, drawScene, { shape: "star", sides: 6, feather: 8 });
  iris(ctx, p, 400, 225, 500, drawScene, { close: true, invert: true }); // closing fog
  ```
- **Composes with:** feather/invert via `masked`; `RevealOptions.ease`.

---

### clipShape
```ts
export function clipShape(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { invert?: boolean; feather?: number } = {},
): void
```
- **Purpose:** Reveal `draw` through an arbitrary closed polygon defined by explicit points.
- **Parameters / options:**
  - `points: [number, number][]` — polygon vertices `[x, y]`. If fewer than 3 points, the call is a no-op (returns immediately).
  - `draw` — content to reveal.
  - `opts.invert?: boolean` (default `false`) — conceal inside the polygon instead of revealing.
  - `opts.feather?: number` (default `0`) — soft edge width in view units.
  - *Note:* this local `opts` type has only `invert` and `feather` (no `ease`); progress is not a parameter — the polygon is static.
- **Example:**
  ```ts
  clipShape(ctx, [[100,100],[300,120],[280,260],[120,240]], drawPhoto, { feather: 10 });
  ```
- **Composes with:** `masked` for soft/inverted edges (hard clip otherwise).

---

### radialWipe
```ts
export function radialWipe(
  ctx: CanvasRenderingContext2D,
  p: number,
  cx: number,
  cy: number,
  radius: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: RadialWipeOptions = {},
): void
```
- **Purpose:** Reveal `draw` with a sweeping angular sector (clock / pie wipe) around a center.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`. If `P <= 0`, nothing draws.
  - `cx`, `cy` — pivot center.
  - `radius: number` — sector radius (make it large enough to cover the content).
  - `draw` — content to reveal.
  - `opts.startAngle?: number` (radians, default `-π/2` = 12 o'clock) — where the sweep begins.
  - `opts.dir?: "cw" | "ccw"` — sweep direction: `"cw"` (default when unset, sweeps clockwise, `end = start + sweep`); `"ccw"` (counter-clockwise, `end = start − sweep`).
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
  - *Detail:* the sweep is capped at `2π − 1e-4` to avoid a degenerate empty arc at `P = 1`.
- **Example:**
  ```ts
  radialWipe(ctx, p, 400, 225, 600, drawDial, { dir: "cw", feather: 6 });
  ```
- **Composes with:** `masked` for soft/inverted edges; `RevealOptions.ease`.

---

### blinds
```ts
export function blinds(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: BlindsOptions = {},
): void
```
- **Purpose:** Reveal `draw` through venetian blinds — `count` slats each opening in unison with `p`.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `w`, `h` — view dimensions.
  - `draw` — content to reveal.
  - `opts.count?: number` (default `8`) — number of slats.
  - `opts.dir?: "h" | "v"` (default `"h"`) — `"h"` = slats stacked vertically, each opening downward across a horizontal band; `"v"` = slats stacked horizontally, each opening rightward.
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
- **Example:**
  ```ts
  blinds(ctx, p, 800, 450, drawImage, { count: 12, dir: "v", feather: 4 });
  ```
- **Composes with:** `masked` for soft/inverted edges.

---

### checkerboard
```ts
export function checkerboard(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: CheckerOptions = {},
): void
```
- **Purpose:** Reveal `draw` cell-by-cell across a grid; each cell scales in from its center once progress passes that cell's threshold. Ordering controls the reveal pattern.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `w`, `h` — view dimensions.
  - `draw` — content to reveal.
  - `opts.rows?: number` (default `6`).
  - `opts.cols?: number` (default `10`).
  - `opts.order?: CheckerOrder` (default `"diagonal"`) — reveal ordering; see `CheckerOrder` values below.
  - `opts.seed?: number` (default `7`) — PRNG seed for `order: "random"` (stable ranks so seeking is deterministic).
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
  - *Detail:* each cell fades in over a `0.15` progress span with a per-cell scale from center; thresholds are clamped so `p = 1` fully reveals every cell.
- **Example:**
  ```ts
  checkerboard(ctx, p, 800, 450, drawGrid, { rows: 8, cols: 14, order: "radial" });
  ```
- **Composes with:** `masked` for soft/inverted edges; seeded `prng` for `"random"`.

---

### dissolve
```ts
export function dissolve(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: DissolveOptions = {},
): void
```
- **Purpose:** Organic dissolve — small cells trip on in a seeded random order as `p` rises. Deterministic and seekable via `seed`.
- **Parameters / options:**
  - `p` — progress; remapped through `opts.ease`.
  - `w`, `h` — view dimensions.
  - `draw` — content to reveal.
  - `opts.seed?: number` (default `1`) — PRNG seed for the per-cell thresholds.
  - `opts.cell?: number` (default `14`) — dissolve cell size in view units (smaller = finer grain). Grid is `ceil(w/cell) × ceil(h/cell)`; each revealed cell is drawn `cell+1` on a side to avoid seams.
  - Plus `RevealOptions`: `feather`, `invert`, `ease`.
- **Example:**
  ```ts
  dissolve(ctx, p, 800, 450, drawScene, { cell: 10, seed: 42 });
  ```
- **Composes with:** `masked` for soft/inverted edges; seeded `prng`.

---

### spotlight
```ts
export function spotlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: SpotlightOptions = {},
): void
```
- **Purpose:** Reveal `draw` only inside a soft radial spotlight, or (with `dim`) keep everything visible but darken the surround — the attention / fog-of-war primitive. Note: **no `p` argument** — animate by passing a `p`-driven `cx`/`cy`/`radius` from the caller. The center can move.
- **Parameters / options:**
  - `cx`, `cy` — spotlight center.
  - `radius: number` — spotlight radius.
  - `draw` — the scene to reveal / dim around.
  - `opts.feather?: number` (default `radius * 0.4`) — soft falloff width.
  - `opts.invert?: boolean` (default `false`) — `true` → dim/hide *inside* the spotlight instead of outside. (Passed through to `masked` in the non-`dim` path.)
  - `opts.dim?: { color: string; strength: number }` — when present, switches mode: draw the full scene, then lay a dimming veil that is clear inside the spotlight and `color` opaque outside, at `clamp01(strength)` alpha (`0..1`). Without `dim`, content outside the spotlight is *hidden* (masked) rather than darkened.
- **Example:**
  ```ts
  // hard fog-of-war: only the lit circle is visible
  spotlight(ctx, cx, cy, 140, drawMap);
  // keep the scene, darken the surround
  spotlight(ctx, cx, cy, 140, drawScene, { dim: { color: "rgba(0,0,0,1)", strength: 0.7 } });
  ```
- **Composes with:** `masked` (reveal/invert path); `focus.dimExcept`/`spotlightFocus` are the layer-scrim counterparts.

---

## Exported types — reveal.ts

### BlendMode
```ts
export type BlendMode = GlobalCompositeOperation;
```
Alias for the canvas composite-operation union (e.g. `"source-over"`, `"multiply"`, `"screen"`, `"lighter"`, `"destination-in"`, `"destination-out"`, …).

### RevealOptions
```ts
export interface RevealOptions {
  feather?: number;              // soft-edge width in view units (0 = hard clip)
  invert?: boolean;              // conceal instead of reveal
  ease?: (p: number) => number;  // remap p before use (keeps seeking exact)
}
```
Base options shared by `wipe`, `iris`, `radialWipe`, `blinds`, `checkerboard`, `dissolve` (via their extending interfaces). Defaults: `feather = 0`, `invert = false`, `ease` unset (identity, still `clamp01`'d).

### WipeDir
```ts
export type WipeDir =
  | "left" | "right" | "up" | "down"
  | "center-h" | "center-v" | "center"
  | "edges-h" | "edges-v";
```
Effect of each value:
- `"left"` — edge sweeps rightward from the left.
- `"right"` — edge sweeps leftward from the right.
- `"up"` — band grows upward from the bottom.
- `"down"` — band grows downward from the top.
- `"center-h"` — a horizontal band grows outward from the vertical midline (full height, width `w·p`).
- `"center-v"` — a vertical band grows outward from the horizontal midline (full width, height `h·p`).
- `"center"` — a rectangle grows from the center in both axes (`w·p × h·p`).
- `"edges-h"` — two bands grow inward from the left and right edges (two rects).
- `"edges-v"` — two bands grow inward from the top and bottom edges (two rects).

### WipeOptions
```ts
export interface WipeOptions extends RevealOptions {
  dir?: WipeDir;                          // default "left"
  angle?: number;                         // arbitrary edge angle in radians (overrides dir; enables diagonals)
  border?: { width: number; color: string }; // stroke the moving front while 0<P<1
}
```

### IrisShape
```ts
export type IrisShape = "circle" | "ellipse" | "rect" | "diamond" | "polygon" | "star";
```
- `"circle"` — full circle of radius `r`.
- `"ellipse"` — `rx = r`, `ry = r·aspect`, rotated by `rotation`.
- `"rect"` — axis-aligned rectangle, half-extents `r` × `r·aspect`.
- `"diamond"` — 4-sided polygon (square rotated 45°).
- `"polygon"` — regular polygon with `sides` sides (default `6`).
- `"star"` — `sides`-pointed star (default `5`), alternating outer radius `r` and inner radius `r·innerRatio`.

### IrisOptions
```ts
export interface IrisOptions extends RevealOptions {
  shape?: IrisShape;    // default "circle"
  aspect?: number;      // ry/rx for ellipse/rect (default 1)
  sides?: number;       // polygon/star point count (default 6 / 5)
  rotation?: number;    // radians (default 0)
  innerRatio?: number;  // star inner/outer radius (default 0.5)
  close?: boolean;      // radius from p (open, default) vs from 1−p (close)
}
```

### RadialWipeOptions
```ts
export interface RadialWipeOptions extends RevealOptions {
  startAngle?: number;    // radians (default -π/2, i.e. 12 o'clock)
  dir?: "cw" | "ccw";     // sweep direction (default: clockwise when unset)
}
```

### BlindsOptions
```ts
export interface BlindsOptions extends RevealOptions {
  count?: number;   // number of slats (default 8)
  dir?: "h" | "v";  // slats stacked vertically (h) or horizontally (v); default "h"
}
```

### CheckerOrder
```ts
export type CheckerOrder = "rowcol" | "diagonal" | "radial" | "random";
```
- `"rowcol"` — reveal in reading order, row by row then column.
- `"diagonal"` — reveal along diagonals (top-left toward bottom-right). **Default** for `checkerboard`.
- `"radial"` — reveal outward from the grid center.
- `"random"` — reveal in a seeded random order (`seed`).

### CheckerOptions
```ts
export interface CheckerOptions extends RevealOptions {
  rows?: number;         // default 6
  cols?: number;         // default 10
  order?: CheckerOrder;  // default "diagonal"
  seed?: number;         // for order "random" (default 7)
}
```

### DissolveOptions
```ts
export interface DissolveOptions extends RevealOptions {
  seed?: number;  // default 1
  cell?: number;  // dissolve cell size in view units (default 14)
}
```

### SpotlightOptions
```ts
export interface SpotlightOptions {
  feather?: number;                          // soft falloff width (default radius * 0.4)
  invert?: boolean;                          // true → dim/hide inside instead of outside
  dim?: { color: string; strength: number }; // dim the surround instead of hiding it (0..1)
}
```
*Note:* `SpotlightOptions` does **not** extend `RevealOptions` — it has no `ease` and no `p`; animate via caller-supplied center/radius.

---

# Step 06 · Attention direction — `src/render/focus.ts`

**Responsibility.** Guiding the eye — the #1 teaching skill — with a broad-but-small toolkit that reuses earlier steps (reveal's `masked`, stroke arrowheads via `strokeVerbs`, motion oscillators via `motion`). Grouped by intent:

- **Isolate** → `dimExcept`, `spotlightFocus`
- **Mark** → `highlightRing`, `focusRings`, `flash`, `focusBox`, `indicate`
- **Point** → `pointerArrow`, `bouncePointer`
- **De-emphasize** → `ghost`, `emphasizeSurround`
- **Magnify** → `magnify` (loupe)
- **Motion emphasis** → `wiggle`, `pulseScale`
- **More markers & pointers** → `sparkFlash`, `cornerBrackets`, `convergingArrows`, `vignetteTo`

**When to use.** After content is on screen, to point the learner at the part that matters right now: dim everything else, ring/box the target, point an arrow, briefly flash or scale it, or magnify a detail. Everything is a pure function of `t` (elapsed seconds) or `p` (progress `0→1`), so it is deterministic and seekable.

**Default accent color:** `ACCENT = "#ffd24a"` (used by most markers/pointers unless overridden).

**Exports.** Pure helpers: `ringRadius`, `scrimAlpha`. Functions: `dimExcept`, `spotlightFocus`, `highlightRing`, `focusRings`, `flash`, `focusBox`, `indicate`, `pointerArrow`, `bouncePointer`, `ghost`, `emphasizeSurround`, `magnify`, `wiggle`, `pulseScale`, `sparkFlash`, `cornerBrackets`, `convergingArrows`, `vignetteTo`. Types: `Hole`, `DimOptions`, `RingOptions`, `FocusRingsOptions`, `FocusBoxOptions`.

---

### ringRadius
```ts
export const ringRadius: (base: number, p: number) => number
```
- **Purpose:** Pure helper — a ring radius that grows from `base` up to `base * 1.6` as `p` goes `0→1` (`base + clamp01(p) * base * 0.6`).
- **Parameters / options:** `base` — base radius; `p` — progress (clamped `0..1`).
- **Example:** `const r = ringRadius(40, 0.5); // 52`
- **Composes with:** kept for continuity / testing; hand-rolled ring animations.

### scrimAlpha
```ts
export const scrimAlpha: (p: number) => number
```
- **Purpose:** Pure helper — scrim opacity that fades out as `p` rises: `1 - clamp01(p)`.
- **Parameters / options:** `p` — progress (clamped `0..1`).
- **Example:** `ctx.globalAlpha = scrimAlpha(0.25); // 0.75`
- **Composes with:** manual scrim/dim fades.

---

### dimExcept
```ts
export function dimExcept(ctx: CanvasRenderingContext2D, holes: Hole[], opts: DimOptions = {}): void
```
- **Purpose:** Darken the whole view except one or more holes (circles or rounded rects) — the spotlight / coach-mark scrim. **MUST be drawn on an isolated, initially-transparent layer** (e.g. `frame.layer.ctx("fx")`) so the `destination-out` holes cut the scrim, not the scene beneath.
- **Parameters / options:**
  - `holes: Hole[]` — one or more holes to keep bright (see `Hole` type). Circular holes get a radial-gradient soft edge; rect holes get a blurred fill for the soft edge.
  - `opts.intensity?: number` (default `0.6`) — scrim darkness `0..1`. If `<= 0`, the function returns immediately (no scrim).
  - `opts.color?: string` (default `"#0b0f14"`, near-black) — scrim color.
  - `opts.feather?: number` (default `24`) — soft hole-edge width in view units. For rect holes the blur applied is `feather * dpr * 0.4`.
- **Example:**
  ```ts
  const fx = frame.layer.ctx("fx");
  dimExcept(fx, [{ cx: 300, cy: 200, r: 90 }], { intensity: 0.7, feather: 30 });
  ```
- **Composes with:** `spotlightFocus` (single-hole convenience); the layer scrim counterpart to `reveal.spotlight`.

---

### spotlightFocus
```ts
export function spotlightFocus(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, opts: DimOptions = {}): void
```
- **Purpose:** Single-circle spotlight scrim convenience — calls `dimExcept(ctx, [{ cx, cy, r }], opts)`. Draw on an isolated layer.
- **Parameters / options:** `cx`, `cy`, `r` — the one bright circular hole; `opts: DimOptions` — same as `dimExcept` (`intensity`, `color`, `feather`).
- **Example:** `spotlightFocus(fx, 400, 225, 100, { intensity: 0.65 });`
- **Composes with:** `dimExcept`.

---

### highlightRing
```ts
export function highlightRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, opts: RingOptions = {}): void
```
- **Purpose:** A stroked ring around a target that gently pulses in radius over time — a persistent "look here" marker.
- **Parameters / options:**
  - `cx`, `cy`, `r` — center and base radius.
  - `t: number` — time in seconds (drives the pulse via `wobble`).
  - `opts.color?: string` (default `ACCENT` `#ffd24a`) — stroke color.
  - `opts.width?: number` (default `3`) — line width.
  - `opts.amp?: number` (default `4`) — pulse amplitude in view units (`0` = steady, no pulse).
  - `opts.period?: number` (default `1.4`) — pulse period in seconds.
  - `opts.alpha?: number` (default `1`) — stroke alpha (clamped `0..1`).
- **Example:** `highlightRing(ctx, 400, 225, 60, t, { color: "#4af", amp: 6 });`
- **Composes with:** `motion.wobble`; pairs with `dimExcept`/`focusBox` for a full coach-mark.

---

### focusRings
```ts
export function focusRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, opts: FocusRingsOptions = {}): void
```
- **Purpose:** Manim-style "FocusOn" — concentric rings that converge onto the target as `p` goes `0→1`, appearing then fading as each lands.
- **Parameters / options:**
  - `cx`, `cy` — convergence target.
  - `p: number` — progress `0..1`.
  - `opts.count?: number` (default `3`) — number of rings (each staggered by `0.08` in progress).
  - `opts.maxR?: number` (default `120`) — starting (outer) radius.
  - `opts.targetR?: number` (default `10`) — landing (inner) radius.
  - `opts.color?: string` (default `ACCENT`) — stroke color.
  - `opts.width?: number` (default `2.5`) — line width.
  - Per-ring alpha follows `sin(rp·π)` so each ring appears then fades as it converges.
- **Example:** `focusRings(ctx, 400, 225, p, { count: 4, maxR: 160 });`
- **Composes with:** `motion.lerp`; a one-shot attention beat (drive `p` over a short window).

---

### flash
```ts
export function flash(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: number, opts: { color?: string } = {}): void
```
- **Purpose:** A quick additive radial flash that fades as `p→1` — a beat of emphasis. Uses `globalCompositeOperation = "lighter"`.
- **Parameters / options:**
  - `cx`, `cy`, `r` — center and radius of the flash.
  - `p: number` — progress; alpha is `1 - clamp01(p)` (returns immediately when `p >= 1`).
  - `opts.color?: string` (default `"rgba(255,240,180,0.9)"`) — inner gradient color (fades to transparent at the rim).
- **Example:** `flash(ctx, 400, 225, 80, p);`
- **Composes with:** additive-blend beats; contrast with `sparkFlash` (radiating lines) for the same moment.

---

### focusBox
```ts
export function focusBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, opts: FocusBoxOptions = {}): void
```
- **Purpose:** An animated rounded box around a target rect — padding, optional breathing, and optional marching-ant dashes.
- **Parameters / options:**
  - `x`, `y`, `w`, `h` — the target rectangle (box is drawn around it with padding).
  - `t: number` — time in seconds (drives breathing + dash spin).
  - `opts.color?: string` (default `ACCENT`) — stroke color.
  - `opts.width?: number` (default `2.5`) — line width.
  - `opts.pad?: number` (default `6`) — padding around the rect (breathing is added on top).
  - `opts.corner?: number` (default `8`) — corner radius.
  - `opts.amp?: number` (default `2`) — breathing amplitude in view units (`0` = static).
  - `opts.period?: number` (default `1.4`) — breathing period in seconds.
  - `opts.dash?: number[]` — dash pattern (via `setLineDash`); omit for a solid box.
  - `opts.dashSpin?: number` — marching-ants speed in px/sec (`lineDashOffset = -t·dashSpin`); `0` or unset = still. Only meaningful when `dash` is set.
- **Example:** `focusBox(ctx, 120, 80, 200, 60, t, { dash: [8, 6], dashSpin: 30 });`
- **Composes with:** `motion.wobble`; pairs with `cornerBrackets` for reticle looks.

---

### indicate
```ts
export function indicate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { scale?: number } = {},
): void
```
- **Purpose:** Manim-style "Indicate" — briefly scale a target (rendered via the `draw` callback) up and back down about its center to call it out. Bump follows `sin(clamp01(p)·π)` (`0→1→0`).
- **Parameters / options:**
  - `cx`, `cy` — scale pivot (the target's center).
  - `p: number` — progress `0..1` over the indicate window.
  - `draw: (c) => void` — re-renders the target (drawn under the transient scale).
  - `opts.scale?: number` (default `0.18`) — peak extra scale (so max scale ≈ `1.18`).
  - *Note:* the docstring mentions a tint, but the implementation only applies the scale bump.
- **Example:** `indicate(ctx, 400, 225, p, (c) => drawIcon(c), { scale: 0.25 });`
- **Composes with:** `pulseScale` (continuous) vs `indicate` (one-shot).

---

### pointerArrow
```ts
export function pointerArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  p: number,
  opts: { color?: string; width?: number; size?: number } = {},
): void
```
- **Purpose:** A draw-on arrow from a source point to the target; the shaft draws on as `p` rises and the arrowhead appears on arrival.
- **Parameters / options:**
  - `fromX`, `fromY` — arrow tail (source).
  - `toX`, `toY` — arrow tip (target).
  - `p: number` — progress `0..1`; the shaft is drawn via `drawOn` up to `P`; the head alpha ramps in over the last 15% (`clamp01((P - 0.85)/0.15)`).
  - `opts.color?: string` (default `ACCENT`) — shaft + head color.
  - `opts.width?: number` (default `3`) — shaft width.
  - `opts.size?: number` (default `12`) — arrowhead size.
- **Example:** `pointerArrow(ctx, 100, 400, 320, 210, p, { color: "#4af" });`
- **Composes with:** `strokeVerbs.drawOn`, `strokeVerbs.arrowhead`, `strokes.pointAt`.

---

### bouncePointer
```ts
export function bouncePointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  opts: { size?: number; color?: string; gap?: number } = {},
): void
```
- **Purpose:** A downward-pointing triangle above the target that bounces to draw the eye. Bounce is `|sin(t·3)| · 8` px.
- **Parameters / options:**
  - `x`, `y` — the target point the pointer hovers above.
  - `t: number` — time in seconds (drives the bounce).
  - `opts.size?: number` (default `16`) — triangle size.
  - `opts.color?: string` (default `ACCENT`) — fill color.
  - `opts.gap?: number` (default `22`) — vertical gap between the target and the pointer's resting position.
- **Example:** `bouncePointer(ctx, 400, 200, t);`
- **Composes with:** standalone "look here" marker; contrast `pointerArrow` (directional, progress-driven).

---

### ghost
```ts
export function ghost(ctx: CanvasRenderingContext2D, alpha: number, draw: (c: CanvasRenderingContext2D) => void): void
```
- **Purpose:** Draw `draw` at reduced opacity — ghost non-focal content. Multiplies the current `globalAlpha` by `clamp01(alpha)`.
- **Parameters / options:**
  - `alpha: number` — opacity multiplier `0..1`.
  - `draw: (c) => void` — content to render dimmed.
- **Example:** `ghost(ctx, 0.3, (c) => drawBackground(c));`
- **Composes with:** the manual de-emphasis counterpart to `dimExcept`/`emphasizeSurround`.

---

### emphasizeSurround
```ts
export function emphasizeSurround(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  focusPath: (c: CanvasRenderingContext2D) => void,
  drawScene: (c: CanvasRenderingContext2D) => void,
  opts: { filter?: string } = {},
): void
```
- **Purpose:** Draw the scene crisp, then overlay a filtered (grayscale/blurred) copy everywhere EXCEPT the focus shape — de-emphasizing the surround while keeping the focus sharp. `drawScene` **must be a pure re-render** (it is called twice).
- **Parameters / options:**
  - `viewW`, `viewH` — view dimensions (passed to `masked`).
  - `focusPath: (c) => void` — issues the path commands for the sharp focus region (filled as the mask).
  - `drawScene: (c) => void` — renders the full scene; called once crisp and once filtered.
  - `opts.filter?: string` (default `"grayscale(1) brightness(0.85)"`) — CSS filter applied to the surround copy.
  - Internally uses `masked(..., { invert: true })` so the filtered copy shows everywhere except inside `focusPath`.
- **Example:**
  ```ts
  emphasizeSurround(ctx, 800, 450,
    (c) => { c.beginPath(); c.arc(400, 225, 120, 0, 7); },
    (c) => drawScene(c),
    { filter: "blur(4px) grayscale(1)" });
  ```
- **Composes with:** `reveal.masked`; a stronger cousin of `ghost`/`dimExcept`.

---

### magnify
```ts
export function magnify(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  zoom: number,
  drawScene: (c: CanvasRenderingContext2D) => void,
  opts: { ringColor?: string | null; ringWidth?: number } = {},
): void
```
- **Purpose:** A circular loupe at `(cx, cy)` that redraws the scene scaled up by `zoom` (clipped to the lens circle), with an optional lens ring. `drawScene` is a pure re-render.
- **Parameters / options:**
  - `cx`, `cy` — lens center (also the zoom pivot).
  - `r: number` — lens radius.
  - `zoom: number` — magnification factor.
  - `drawScene: (c) => void` — renders the scene inside the lens.
  - `opts.ringColor?: string | null` (default `"#eef5ef"`) — lens-ring stroke color; pass `null` to draw **no ring** (the ring block is skipped only when `ringColor === null`).
  - `opts.ringWidth?: number` (default `2`) — ring line width.
- **Example:** `magnify(ctx, 400, 225, 70, 2.5, (c) => drawScene(c));`
- **Composes with:** standalone detail inspector; pair with `bouncePointer`/`pointerArrow` to point at what's magnified.

---

### wiggle
```ts
export function wiggle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { amp?: number; freq?: number } = {},
): void
```
- **Purpose:** Wrap a draw in a small rotational jiggle about `(cx, cy)` — a "look at me" wiggle. Rotation is `sin(t·freq) · amp` radians.
- **Parameters / options:**
  - `cx`, `cy` — rotation pivot.
  - `t: number` — time in seconds.
  - `draw: (c) => void` — content to jiggle.
  - `opts.amp?: number` (default `0.05`) — rotation amplitude in radians.
  - `opts.freq?: number` (default `8`) — angular frequency.
- **Example:** `wiggle(ctx, 400, 225, t, (c) => drawIcon(c), { amp: 0.08 });`
- **Composes with:** `pulseScale` (scale variant); one-shot `indicate`.

---

### pulseScale
```ts
export function pulseScale(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { amp?: number; period?: number } = {},
): void
```
- **Purpose:** Wrap a draw in a continuous scale pulse about `(cx, cy)` — a heartbeat of emphasis. Scale is `1 + wobble(t, period, amp)`.
- **Parameters / options:**
  - `cx`, `cy` — scale pivot.
  - `t: number` — time in seconds.
  - `draw: (c) => void` — content to pulse.
  - `opts.amp?: number` (default `0.06`) — scale amplitude.
  - `opts.period?: number` (default `0.8`) — pulse period in seconds.
- **Example:** `pulseScale(ctx, 400, 225, t, (c) => drawIcon(c), { amp: 0.1 });`
- **Composes with:** `motion.wobble`; continuous counterpart to one-shot `indicate`.

---

### sparkFlash
```ts
export function sparkFlash(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  opts: { count?: number; length?: number; inner?: number; color?: string; width?: number } = {},
): void
```
- **Purpose:** Manim-style "Flash" — lines burst outward from a point like a spark, then fade as `p→1`. Uses additive blend (`"lighter"`); alpha is `1 - clamp01(p)`.
- **Parameters / options:**
  - `cx`, `cy` — spark origin.
  - `p: number` — progress; alpha fades with `1-p` and the ray length grows with `clamp01(p·1.4)` (returns immediately when `p >= 1`).
  - `opts.count?: number` (default `12`) — number of rays.
  - `opts.length?: number` (default `24`) — max ray length (reached as `p` rises).
  - `opts.inner?: number` (default `8`) — inner gap radius where rays start.
  - `opts.color?: string` (default `"#fff4c0"`) — stroke color.
  - `opts.width?: number` (default `2.5`) — stroke width (round caps).
- **Example:** `sparkFlash(ctx, 400, 225, p, { count: 16, length: 32 });`
- **Composes with:** `flash` (radial glow) for the same accent moment.

---

### cornerBrackets
```ts
export function cornerBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { pad?: number; length?: number; color?: string; width?: number; p?: number } = {},
): void
```
- **Purpose:** Four L-shaped corner brackets framing a target rect (camera-reticle look), with an optional snap-in animation via `p`.
- **Parameters / options:**
  - `x`, `y`, `w`, `h` — the target rectangle.
  - `opts.pad?: number` (default `6`) — padding between the rect and the brackets.
  - `opts.length?: number` (default `16`) — length of each bracket leg.
  - `opts.color?: string` (default `ACCENT`) — stroke color.
  - `opts.width?: number` (default `2.5`) — line width (round caps).
  - `opts.p?: number` (default `1`) — snap-in progress `0..1`: brackets start `(1-p)·22` px further out and fade in (`globalAlpha = snap`). Use `1` (default) for a static frame.
- **Example:** `cornerBrackets(ctx, 120, 80, 200, 120, { p: snapProgress });`
- **Composes with:** `focusBox` (box variant); reticle pairing with `magnify`.

---

### convergingArrows
```ts
export function convergingArrows(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  p: number,
  opts: { count?: number; ring?: number; targetR?: number; len?: number; color?: string; width?: number; rotation?: number } = {},
): void
```
- **Purpose:** Several arrows arranged around the target pointing inward, sliding toward it as `p` goes `0→1`.
- **Parameters / options:**
  - `cx`, `cy` — convergence center.
  - `p: number` — progress `0..1`; each arrow tip moves from radius `ring` in to `targetR` (`lerp(ring, targetR, P)`).
  - `opts.count?: number` (default `4`) — number of arrows.
  - `opts.ring?: number` (default `90`) — starting (outer) tip radius.
  - `opts.targetR?: number` (default `20`) — final (inner) tip radius.
  - `opts.len?: number` (default `26`) — arrow shaft length (tail sits `len` beyond the tip).
  - `opts.color?: string` (default `ACCENT`) — stroke/head color.
  - `opts.width?: number` (default `3`) — shaft width.
  - `opts.rotation?: number` (radians, default `0`) — rotate the whole arrangement.
- **Example:** `convergingArrows(ctx, 400, 225, p, { count: 6, ring: 120 });`
- **Composes with:** `strokeVerbs.drawOn`, `strokeVerbs.arrowhead`; a directional cousin of `focusRings`.

---

### vignetteTo
```ts
export function vignetteTo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  opts: { strength?: number; inner?: number; outer?: number; color?: string } = {},
): void
```
- **Purpose:** Asymmetric edge vignette whose clear center sits on the focus — a soft cousin of the spotlight (darkens the frame edges, leaving the focus bright).
- **Parameters / options:**
  - `cx`, `cy` — center of the clear region.
  - `opts.strength?: number` (default `0.5`) — vignette opacity `0..1`. If `<= 0`, returns immediately.
  - `opts.inner?: number` (default `180`) — radius where darkening begins (clear inside this).
  - `opts.outer?: number` (default `620`) — radius of full darkness.
  - `opts.color?: string` (default `"rgba(0,0,0,1)"`) — vignette color at the rim.
- **Example:** `vignetteTo(ctx, 400, 225, { strength: 0.6, inner: 200 });`
- **Composes with:** `reveal.spotlight` (hard mask) / `dimExcept` (scrim) as softer/harder alternatives.

---

## Exported types — focus.ts

### Hole
```ts
export type Hole =
  | { cx: number; cy: number; r: number }
  | { x: number; y: number; w: number; h: number; corner?: number };
```
A bright region cut out of a `dimExcept` scrim. Two variants:
- **Circle:** `{ cx, cy, r }` — center and radius (soft radial-gradient edge).
- **Rounded rect:** `{ x, y, w, h, corner? }` — top-left, size, and optional `corner` radius (default `8`; blurred soft edge). Discriminated by the presence of `r`.

### DimOptions
```ts
export interface DimOptions {
  intensity?: number;  // scrim darkness 0..1 (default 0.6)
  color?: string;      // scrim color (default "#0b0f14", near-black)
  feather?: number;    // soft hole edge in view units (default 24)
}
```
Used by `dimExcept` and `spotlightFocus`.

### RingOptions
```ts
export interface RingOptions {
  color?: string;   // default ACCENT (#ffd24a)
  width?: number;   // default 3
  amp?: number;     // pulse amplitude in view units (default 4; 0 = steady)
  period?: number;  // pulse period seconds (default 1.4)
  alpha?: number;   // default 1
}
```
Used by `highlightRing`.

### FocusRingsOptions
```ts
export interface FocusRingsOptions {
  count?: number;    // default 3
  maxR?: number;     // default 120
  targetR?: number;  // default 10
  color?: string;    // default ACCENT
  width?: number;    // default 2.5
}
```
Used by `focusRings`.

### FocusBoxOptions
```ts
export interface FocusBoxOptions {
  color?: string;    // default ACCENT
  width?: number;    // default 2.5
  pad?: number;      // default 6
  corner?: number;   // default 8
  amp?: number;      // breathing amplitude (default 2; 0 = static)
  period?: number;   // default 1.4
  dash?: number[];   // dash pattern; omit for solid
  dashSpin?: number; // marching-ants speed px/sec (0 = still)
}
```
Used by `focusBox`.

> Note: the `opts` objects for `flash`, `indicate`, `pointerArrow`, `bouncePointer`, `ghost`, `emphasizeSurround`, `magnify`, `wiggle`, `pulseScale`, `sparkFlash`, `cornerBrackets`, `convergingArrows`, and `vignetteTo` are inline (anonymous) object types, not named exported interfaces — their fields are documented per-function above.
