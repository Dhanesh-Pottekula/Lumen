# Step 10 · Particle system — `src/render/particles.ts`

**Responsibility.** One configurable, **deterministic** emitter that covers both *effects* (electrons / energy / sparks) and *ambience* (smoke / rain / snow / dust / confetti). A particle's full state at time `t` is computed **analytically** from its seed + birth time — never simulated step-by-step. Position is a closed form:

```
position = origin + v·age + ½·accel·age² + sinusoidal wander
```

so every frame is reproducible on scrub/seek. There is no hidden state between frames.

**When to use.** Whenever you want emitted matter that reads as motion but must stay seekable: rising fire/smoke, falling rain/snow, drifting dust, bursting sparks/confetti, or an energy halo around a point. Reach for a preset first; drop to a raw `EmitterConfig` only when you need a bespoke look.

---

## Types

### ParticleShape

```ts
type ParticleShape = "dot" | "ring" | "square" | "triangle" | "streak" | "spark" | "star";
```

The drawn glyph per particle (see `drawShape`). Effects:

- **`"dot"`** (default) — filled circle of radius `size`. The catch-all soft particle.
- **`"ring"`** — stroked circle of radius `size` (hollow). Uses `strokeStyle`.
- **`"square"`** — filled square, side `2·size`, centered, rotated by the particle's spin `angle`.
- **`"triangle"`** — filled 3-point polygon (radius `size`), rotated by spin `angle`.
- **`"star"`** — filled 10-vertex star; outer radius `size`, inner radius `size·0.45` on odd vertices, rotated by spin `angle`.
- **`"streak"`** — a stroked line from `(x,y)` to `(x - size·0.5, y + size·3)`; line width `max(1, size·0.5)`. Reads as a motion trail (rain, sparks).
- **`"spark"`** — a stroked plus/cross: horizontal segment `±size` and vertical segment `±size` through `(x,y)`.

### OriginShape

```ts
type OriginShape =
  | { kind: "point";  x: number; y: number }
  | { kind: "line";   x: number; y: number; x2: number; y2: number }
  | { kind: "rect";   x: number; y: number; w: number; h: number }
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "ring";   x: number; y: number; r: number };
```

Where each particle is born. Two random seeds `u, v ∈ [0,1)` sample the shape:

- **`"point"`** — always `(x, y)`. A single emission source.
- **`"line"`** — lerp along segment `(x,y)→(x2,y2)` by `u`. Even distribution along a line (e.g. the base of a flame).
- **`"rect"`** — `(x + u·w, y + v·h)`. Uniform fill of an axis-aligned rectangle (rain/snow spawn strip across the top).
- **`"circle"`** — filled disc: angle `= u·2π`, radius `= √v·r` (√ for uniform area density). Center `(x,y)`.
- **`"ring"`** — circle outline: angle `= u·2π`, fixed radius `r`. Center `(x,y)`. Particles born on the rim only.

### EmitterConfig

```ts
interface EmitterConfig {
  count: number;
  seed: number;
  origin: OriginShape;
  t0?: number;                         // default 0
  rate?: number;                       // particles/sec; omit ⇒ burst
  loop?: boolean;
  life: Range;                         // seconds
  angle?: number;                      // default -π/2 (up)
  spread?: number;                     // default π/3
  speed: Range;                        // px/sec
  accel?: [number, number];            // px/sec²
  wander?: { amp: number; freq: number };
  size: Range;                         // start size
  sizeEnd?: number;
  color: string | [string, string];   // constant or start→end hex
  alpha?: { in?: number; out?: number; max?: number };
  spin?: Range;                        // rad/sec
  shape?: ParticleShape;               // default "dot"
  blend?: GlobalCompositeOperation;
}
```

`Range` is `[number, number] | number`. A tuple is a per-particle interval sampled by a seeded PRNG; a bare number is a constant.

Every field:

- **`count: number`** (required) — number of particle *slots*. The emitter iterates `i = 0 … count-1`; each `i` is one particle (or, with `rate`, one staggered-birth particle; with `loop`, one recycled slot). Higher = denser, more draw cost.
- **`seed: number`** (required) — base RNG seed. Deterministic: same seed ⇒ same layout every render. Change it to get a different-but-stable arrangement. Presets use distinct default seeds so stacked effects don't align.
- **`origin: OriginShape`** (required) — spawn geometry (see `OriginShape` above).
- **`t0?: number`** (default `0`) — emission start time in seconds. For a burst, all particles are born at `t0`. For `rate` emission, particle `i` is born at `t0 + i/rate`. *When to use:* delay an effect to sync with a beat.
- **`rate?: number`** — particles per second for **continuous** emission (birth of particle `i` staggered to `t0 + i/rate`). **Omit** for a one-shot **burst** where all `count` particles are born at `t0`. *When to use:* `rate` for streams (fire, rain); omit for pops (confetti).
- **`loop?: boolean`** — recycle particles (ambient). When true, each slot re-lives its life repeatedly; on every cycle it is **re-seeded** (`prng(base + cyc·7919)`) so recycled particles get a *fresh* trajectory rather than a frozen replay. Spin uses the un-wrapped `rawAge` so rotation stays continuous across cycles. `life` is stable per particle across cycles. Without `loop`, a particle returns `null` (dead) once `age > life`. *When to use:* true for endless ambience (smoke, rain, snow, dust, fire, energy); false/omit for finite bursts (confetti).
- **`life: Range`** (required, seconds) — particle lifespan. Sampled once per particle (stable across loop cycles). Drives normalized progress `p = clamp01(age/life)` used by size, color, and alpha.
- **`angle?: number`** (default `-π/2`, i.e. straight up) — central emission direction in radians. Canvas y is downward, so `-π/2` is up, `+π/2` is down, `0` is right. *When to use:* `+π/2` for rain/snow falling, `-π/2` for rising fire/smoke.
- **`spread?: number`** (default `π/3`) — angular spread in radians. Actual emit angle is `angle + (rand-0.5)·spread`, i.e. `±spread/2` around `angle`. `2π` ⇒ omnidirectional (sparks, energy). Small (e.g. `0.04`) ⇒ nearly parallel (rain). *When to use:* wide for radial bursts, narrow for directed streams.
- **`speed: Range`** (required, px/sec) — initial speed, sampled per particle. Split into `vx = cos(ang)·spd`, `vy = sin(ang)·spd`.
- **`accel?: [number, number]`** (default `[0, 0]`, px/sec²) — constant acceleration `[ax, ay]` (gravity / buoyancy). Positive `ay` pulls **down** (rain, sparks, confetti fall); negative `ay` pushes **up** (fire/smoke buoyancy). Applied as `½·a·age²`.
- **`wander?: { amp: number; freq: number }`** — sinusoidal drift added on top of ballistic motion for a turbulent look. `amp` is displacement in px, `freq` in rad/sec. Adds `sin(age·freq + ph)·amp` to x and `cos(age·freq·0.9 + ph)·amp·0.5` to y (half-amplitude, slightly detuned frequency), with a per-particle phase `ph`. *When to use:* smoke swirl, snow flutter, dust haze.
- **`size: Range`** (required) — **start** size in px (radius for dots/rings; half-extent for squares/stars). Sampled per particle.
- **`sizeEnd?: number`** — if given, size **lerps from `size` (start) to `sizeEnd`** over life by `p`. Omit to keep size constant at the sampled start. *When to use:* shrink sparks/embers to nothing, or grow smoke puffs (`size: 6, sizeEnd: 26`).
- **`color: string | [string, string]`** (required) — a constant hex string, or a `[start, end]` hex pair interpolated over life via `hexLerp` (returns `rgb(...)`). *When to use:* pair for ember→ash / hot→cool fades (`["#ffd24a", "#e2452b"]`).
- **`alpha?: { in?: number; out?: number; max?: number }`** — opacity envelope over life. `in` (default `0.1`) = fade-**in** fraction of life; `out` (default `0.3`) = fade-**out** fraction; `max` (default `1`) = peak alpha. While `p < in`, alpha ramps `0→max`; while `p > 1-out`, it ramps `max→0`; otherwise it holds at `max`. *When to use:* lower `max` for subtle ambience (dust `0.28`, smoke `0.4`); longer `out` for gentle dissipation.
- **`spin?: Range`** (default `0`, rad/sec) — angular velocity. The particle's draw `angle = spin·rawAge` (continuous across loop cycles). Only visible on rotatable shapes (`square`, `triangle`, `star`). *When to use:* tumbling confetti (`[-8, 8]`).
- **`shape?: ParticleShape`** (default `"dot"`) — glyph (see `ParticleShape`).
- **`blend?: GlobalCompositeOperation`** — canvas composite op for the whole draw pass. Presets use `"lighter"` for additive glow (fire, sparks, dust, energy). Omit for normal alpha blending (smoke, rain, snow, confetti).

### Particle

```ts
interface Particle {
  x: number;      // world position
  y: number;
  age: number;    // seconds since birth (wrapped into current cycle when looping)
  p: number;      // 0..1 progress through life
  size: number;   // resolved size at this instant
  color: string;  // resolved color (constant, or hexLerp result "rgb(...)")
  alpha: number;  // resolved opacity from the envelope
  angle: number;  // current spin angle = spin·rawAge
}
```

The pure result of `particleAt`. You normally never build one by hand; `emit` produces and draws them for you.

---

## Functions

### particleAt

```ts
function particleAt(cfg: EmitterConfig, i: number, t: number): Particle | null
```

- **Purpose:** Closed-form, pure state of particle `i` at absolute time `t`. Returns `null` if the particle is not alive (not yet born, or dead when not looping).
- **Parameters:**
  - `cfg: EmitterConfig` — the emitter definition.
  - `i: number` — particle index `0 … count-1`. Combined with `seed` into `base = seed·100003 + i·97 + 1` for its stable PRNG stream.
  - `t: number` — absolute time in seconds.
- **Behavior:** Computes `birth` (`t0 + i/rate` if `rate`, else `t0`), returns `null` when `t < birth`. When not looping, returns `null` once `rawAge > life`; when looping, wraps age into the current cycle and re-seeds per cycle. Then samples origin, angle (`angle ± spread/2`), speed, applies ballistic + wander position, resolves size/color/alpha/spin.
- **Example:**
  ```ts
  const p = particleAt(fireEmitter(200, 300), 0, 1.5);
  if (p) console.log(p.x, p.y, p.alpha);
  ```
- **Composes with:** used internally by `emit`; call directly if you need to attach other geometry to a particle's live position.

### emit

```ts
function emit(ctx: CanvasRenderingContext2D, cfg: EmitterConfig, t: number): void
```

- **Purpose:** Draw **all** live particles of `cfg` at time `t`. This is the normal entry point.
- **Parameters:**
  - `ctx` — 2D canvas context.
  - `cfg` — emitter definition.
  - `t` — absolute time in seconds.
- **Behavior:** Saves ctx, applies `cfg.blend` if set, iterates `i = 0 … count-1`, skips particles that are `null` or have `alpha ≤ 0`, sets `globalAlpha = clamp01(alpha)`, `fillStyle` and `strokeStyle` to the particle color, then draws the shape (default `"dot"`). Restores ctx.
- **Example:**
  ```ts
  emit(ctx, smokeEmitter(cx, cy), t);
  ```
- **Composes with:** any preset or hand-built `EmitterConfig`; call once per emitter per frame. Stack multiple `emit` calls (with distinct seeds) for layered effects.

---

## Presets

Each preset is a factory returning a ready `EmitterConfig`. All accept a `seed` with a distinct default so overlapping effects don't align.

### fireEmitter

```ts
const fireEmitter = (x: number, y: number, seed = 1): EmitterConfig
```
Rising flame. Emits from a 32px-wide **line** centered at `(x,y)`, `count 60`, `rate 40`, looping. Life `0.6–1.1s`, upward (`-π/2`, spread `0.5`), speed `40–90`, buoyancy `accel [0,-30]`, wander `{amp 6, freq 8}`. Size `7→2` start shrinking to `sizeEnd 1`, color `#ffd24a→#e2452b`, alpha `{in 0.1, out 0.5, max 0.85}`, `shape "dot"`, `blend "lighter"`. Produces a licking additive-glow flame anchored at `(x,y)`.

### smokeEmitter

```ts
const smokeEmitter = (x: number, y: number, seed = 2): EmitterConfig
```
Slow rising smoke. **Circle** origin `r 10` at `(x,y)`, `count 40`, `rate 14`, looping. Life `2–3.5s`, up (`-π/2`, spread `0.4`), speed `12–26`, slight buoyancy `[0,-6]`, wander `{amp 14, freq 1.2}`. Size grows `6→26` (`sizeEnd 26`), color `#8a94a0→#3a4650`, alpha `{in 0.2, out 0.6, max 0.4}`, `shape "dot"`, normal blend. Produces expanding, thinning grey puffs.

### sparksEmitter

```ts
const sparksEmitter = (x: number, y: number, seed = 3): EmitterConfig
```
Radial spark burst-stream. **Point** origin at `(x,y)`, `count 50`, `rate 30`, looping. Life `0.4–0.9s`, omnidirectional (`spread 2π`), speed `80–200`, strong gravity `accel [0,260]`. Size `2→0.5` (`sizeEnd 0.5`), color `#fff4c0→#e8a13c`, alpha `{in 0.05, out 0.4, max 1}`, `shape "streak"`, `blend "lighter"`. Produces short, falling glowing streaks.

### rainEmitter

```ts
const rainEmitter = (viewW: number, viewH: number, seed = 4): EmitterConfig
```
Full-width rain. **Rect** spawn strip across the top (`x 0, y -20, w viewW, h 10`), `count 120`, `rate 120`, looping. Life `1.4–2s`, downward (`π/2 + 0.12`, near-parallel `spread 0.04`), speed scaled to view height `viewH·0.7 – viewH·0.9`, `accel [0,40]`. Size `7`, solid color `#7fb0d8`, alpha `{in 0.05, out 0.2, max 0.5}`, `shape "streak"`. Produces slanted falling streaks across the whole frame.

### snowEmitter

```ts
const snowEmitter = (viewW: number, viewH: number, seed = 5): EmitterConfig
```
Full-width snow. **Rect** top strip (`x 0, y -20, w viewW, h 10`), `count 90`, `rate 40`, looping. Life `5–8s`, down (`π/2`, spread `0.2`), gentle speed `30–60`, `accel [0,4]`, wander `{amp 26, freq 0.8}` for flutter. Size `2–4`, white `#ffffff`, alpha `{in 0.1, out 0.2, max 0.8}`, `shape "dot"`. Produces soft drifting flakes.

### dustEmitter

```ts
const dustEmitter = (x: number, y: number, seed = 6): EmitterConfig
```
Ambient hovering dust. **Circle** origin `r 40` at `(x,y)`, `count 40`, `rate 12`, looping. Life `3–6s`, up-ish (`-π/2`, wide `spread π`), very slow speed `4–14`, tiny buoyancy `[0,-2]`, wander `{amp 18, freq 0.6}`. Size `1–2.5`, color `#c8b98a`, alpha `{in 0.3, out 0.4, max 0.28}` (faint), `shape "dot"`, `blend "lighter"`. Produces a subtle glowing motes haze.

### confettiEmitter

```ts
const confettiEmitter = (x: number, y: number, seed = 7): EmitterConfig
```
One-shot confetti burst (**no `rate`, no `loop`** → burst at `t0 0`). **Point** origin at `(x,y)`, `count 70`. Life `1.6–2.6s`, up-and-out (`-π/2`, wide `spread 0.8π`), speed `180–340`, gravity `accel [0,320]`, tumbling `spin [-8,8]`. Size `4–7`, color `#5cc8ae→#e8a13c`, alpha `{in 0.02, out 0.25, max 1}`, `shape "square"`, normal blend. Produces spinning squares that shoot up and fall — fire once on a beat.

### energyEmitter

```ts
const energyEmitter = (x: number, y: number, seed = 8): EmitterConfig
```
Radiating energy halo. **Point** origin at `(x,y)`, `count 40`, `rate 26`, looping. Life `0.7–1.2s`, omnidirectional (`spread 2π`), speed `30–70`, no gravity, wander `{amp 8, freq 5}`. Size `3→1` (`sizeEnd 0.5`), color `#8fe8ff→#5cc8ae`, alpha `{in 0.1, out 0.4, max 0.9}`, `shape "dot"`, `blend "lighter"`. Produces a shimmering cyan-green aura around a point (electrons/energy source).

---

# Step 11 · Camera & transitions — `src/render/camera.ts`

**Responsibility.** A view transform (pan / zoom / rotate) applied to the **whole world** at composite time. Scenes draw in normal view coords; the camera moves the world around them. It is **pure** — `camera(t)` derives entirely from `t` — so it stays seekable. Zoom interpolates **geometrically (log)** so a dolly feels linear in perceived scale. Passing **no camera (undefined)** means no transform, so existing films are unaffected.

**When to use.** Whenever a scene needs to reframe over time: dolly into a detail, pan between regions, or add a slow push for emphasis. A `Camera` centers world point `(x, y)` in the frame at `zoom`, rotated by `rot`.

**How it's applied.** The camera is handed to the compositor via `frame.setCamera()` at composite time. For layer scenes, the compositor applies the device-space equivalent in `finish()`; for non-layer scenes, `applyCamera` multiplies it into the ctx transform directly. Depth-of-field and parallax are **not** camera fields — they emerge from per-layer options (e.g. a layer's own depth/blur/parallax settings) as the camera moves; the camera only supplies the shared view transform those layers react to.

---

## Types

### Camera

```ts
interface Camera {
  x: number;    // world point centered in the frame (view coords)
  y: number;
  zoom: number;
  rot: number;  // radians
}
```

- **`x, y`** — the world point that will sit at the center of the frame.
- **`zoom`** — scale factor; `1` = neutral, `>1` = zoomed in, `<1` = zoomed out. Log-interpolated (floored at `1e-3` internally to avoid `log(0)` → NaN).
- **`rot`** — frame rotation in radians.

---

## Functions

### centerCamera

```ts
const centerCamera = (viewW: number, viewH: number): Camera
```
- **Purpose:** The neutral camera for a view size — centers the whole frame at zoom 1.
- **Returns:** `{ x: viewW/2, y: viewH/2, zoom: 1, rot: 0 }`.
- **When to use:** as the `from` end of a move, or the resting/default view.
- **Composes with:** `move`, `lerpCamera`, `isNeutral`.

### lerpCamera

```ts
function lerpCamera(a: Camera, b: Camera, p: number): Camera
```
- **Purpose:** Interpolate two cameras at progress `p`. `x`, `y`, `rot` are linear; **`zoom` is log-interpolated** (`exp(lerp(log a.zoom, log b.zoom, p))`) so a 1→4 dolly feels linear in perceived scale.
- **Parameters:** `a, b: Camera` — endpoints; `p: number` — 0..1 progress (not clamped or eased here — caller supplies eased `p`).
- **Example:**
  ```ts
  const cam = lerpCamera(centerCamera(w, h), focusOn(cx, cy, 3), smooth(t));
  ```
- **Composes with:** `move` and `pushIn` build on this; feed it an eased/clamped `p` yourself if calling directly.

### focusOn

```ts
const focusOn = (x: number, y: number, zoom = 1, rot = 0): Camera
```
- **Purpose:** Build a camera focused on `(x, y)` at `zoom` (and optional `rot`).
- **Parameters:** `x, y` — focal world point; `zoom` (default `1`); `rot` (default `0`, radians).
- **Example:** `focusOn(300, 200, 2.5)`.
- **Composes with:** the `to` end of `move`/`lerpCamera`.

### move

```ts
function move(from: Camera, to: Camera, t: number, at: number, dur: number): Camera
```
- **Purpose:** Smoothly move from `from` to `to` over the window `[at, at+dur]`, returning the camera at time `t`.
- **Parameters:** `from, to: Camera` — endpoints; `t` — current time; `at` — start time; `dur` — duration (seconds).
- **Behavior:** returns `lerpCamera(from, to, smooth(clamp01((t-at)/dur)))` — clamped and eased with `smooth`, so it holds at `from` before `at` and at `to` after `at+dur`.
- **Example:**
  ```ts
  const cam = move(centerCamera(w, h), focusOn(cx, cy, 3), t, 2, 1.5);
  frame.setCamera(cam);
  ```
- **Composes with:** `centerCamera`/`focusOn` for endpoints; `frame.setCamera`.

### pushIn

```ts
function pushIn(viewW: number, viewH: number, cx: number, cy: number, fromZoom: number, toZoom: number, t: number, at: number, dur: number): Camera
```
- **Purpose:** A push-in / dolly onto `(cx, cy)`: zoom `fromZoom → toZoom` over `[at, at+dur]`, centered on the point. As it zooms in, the center **drifts** from the frame center toward the focal point.
- **Parameters:** `viewW, viewH` — view size; `cx, cy` — focal point; `fromZoom, toZoom` — zoom endpoints; `t, at, dur` — timing.
- **Behavior:** `p = smooth(clamp01((t-at)/dur))`; zoom log-interpolated; `x = lerp(viewW/2, cx, p)`, `y = lerp(viewH/2, cy, p)`, `rot 0`.
- **Example:**
  ```ts
  const cam = pushIn(w, h, cx, cy, 1, 2.5, t, 0, 2);
  ```
- **Composes with:** `frame.setCamera`; a self-contained alternative to `move` when you only need a centered dolly (no rotation).

### applyCamera

```ts
function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number): void
```
- **Purpose:** Multiply a camera into the current ctx transform. Used by **non-layer** scenes; the layer compositor applies the device-space equivalent in `finish()` instead.
- **Behavior:** `translate(viewW/2, viewH/2)` → `rotate(cam.rot)` → `scale(cam.zoom, cam.zoom)` → `translate(-cam.x, -cam.y)`.
- **When to use:** only in scenes that draw directly to a ctx without the layer compositor; layer scenes should use `frame.setCamera` and let `finish()` apply it.
- **Composes with:** wrap your scene draws between `ctx.save()`/`ctx.restore()` around this.

### isNeutral

```ts
function isNeutral(cam: Camera, viewW: number, viewH: number): boolean
```
- **Purpose:** True when a camera is effectively the neutral view, so the compositor can **skip** applying it. Uses an epsilon so a camera animated *back* to neutral (via float error in log/lerp) still takes the skip path.
- **Test:** `|zoom-1| < 1e-6` AND `|rot| < 1e-6` AND `|x - viewW/2| < 0.5` AND `|y - viewH/2| < 0.5`.
- **Composes with:** the compositor's fast path; you rarely call it directly.

---

# Step 14 · Shape morph — `src/render/morph.ts`

**Responsibility.** Turn one shape into another by (1) **resampling** both to a common point count evenly by arc length, (2) **aligning** their point correspondence to minimize travel, and (3) **interpolating**. Works for closed shapes (reactant→product, border→border) and open paths. Deterministic; reuses the arc-length sampler (`pointAt`) from `strokes`.

**When to use.** Any "A becomes B" transform on outlines: a molecule reshaping, a country border sliding to another, an icon tweening, or a shape blooming from circle → star → heart. Feed it two point lists (`Pt[] = [x, y][]`), often from the shape generators below.

---

## Types

### MorphOptions

```ts
interface MorphOptions {
  n?: number;                    // resample resolution (default 64)
  closed?: boolean;              // default true
  align?: boolean;               // default true (closed shapes)
  ease?: (p: number) => number;  // default easeInOutCubic
}
```

- **`n`** (default `64`) — number of points both shapes are resampled to. Higher = smoother morph, more cost.
- **`closed`** (default `true`) — treat inputs as closed loops (auto-appends the first point if the path isn't already closed) vs. open paths.
- **`align`** (default `true`, closed only) — rotate B's point ordering to the offset that best matches A, minimizing total travel (avoids the shape "spinning" during the morph).
- **`ease`** (default `easeInOutCubic`) — easing applied to progress `p` before interpolation.

`Pt` is imported from `./strokes` and is a `[x, y]` tuple.

---

## Functions

### resample

```ts
function resample(points: Pt[], n: number, closed = true): Pt[]
```
- **Purpose:** Resample a polyline to exactly `n` points, evenly spaced by arc length.
- **Parameters:** `points: Pt[]` — source polyline; `n` — target count; `closed` (default `true`) — if the path isn't already closed, appends the first point so sampling wraps.
- **Behavior:** Empty input or `n ≤ 0` → `[]`. Single point → `n` copies of it. Otherwise samples `pointAt(src, frac)` where `frac = i/n` (closed) or `i/(n-1)` (open).
- **Example:** `resample(myBorder, 64)`.
- **Composes with:** used internally by `morph`; call directly to normalize a path's point count.

### align

```ts
function align(a: Pt[], b: Pt[]): Pt[]
```
- **Purpose:** Rotate `b`'s point ordering to the offset that best matches `a` (minimum total squared distance). **Closed shapes only.**
- **Parameters:** `a, b: Pt[]` — same-length (uses `min(a.length, b.length)`) point lists.
- **Behavior:** Tries each rotational offset `k`, sampling roughly 16 points (`step = max(1, floor(n/16))`) for the cost, and returns `b` re-indexed by the best offset.
- **Example:** `align(resample(a, 64), resample(b, 64))`.
- **Composes with:** `morph` calls it when `align` (default true) and `closed`.

### morph

```ts
function morph(a: Pt[], b: Pt[], p: number, o: MorphOptions = {}): Pt[]
```
- **Purpose:** The interpolated point list between shapes `a` and `b` at progress `p`.
- **Parameters:** `a, b: Pt[]` — endpoint shapes; `p` — 0..1 progress (clamped internally); `o: MorphOptions` — see above.
- **Behavior:** Resamples both to `n`, aligns `b` to `a` if closed+align, applies `ease(clamp01(p))`, then lerps each point pair. Returns the morphed `Pt[]`.
- **Example:**
  ```ts
  const pts = morph(circleShape(cx, cy, 40), starShape(cx, cy, 40), t);
  ```
- **Composes with:** feed the result to your own path drawing, or use `drawMorph` to draw in one call.

### drawMorph

```ts
function drawMorph(
  ctx: CanvasRenderingContext2D,
  a: Pt[],
  b: Pt[],
  p: number,
  style: { fill?: string; stroke?: string; width?: number; closed?: boolean; align?: boolean; n?: number } = {},
): void
```
- **Purpose:** Compute the morph and draw it (fill and/or stroke) in one call.
- **Parameters:**
  - `a, b: Pt[]` — endpoint shapes; `p` — progress.
  - `style.fill?: string` — fill color; omit to skip fill.
  - `style.stroke?: string` — stroke color; omit to skip stroke.
  - `style.width?: number` (default `2`) — stroke line width. Stroke uses `lineJoin "round"`.
  - `style.closed?: boolean` (default `true`) — close the path (and morph as closed).
  - `style.align?: boolean` — passed through to `morph` (default true inside `morph`).
  - `style.n?: number` — resample resolution passed to `morph`.
- **Behavior:** Builds the path from `morph(...)` points (`moveTo` first, `lineTo` rest, `closePath` if closed), then fills and/or strokes as styled. Wrapped in `save`/`restore`.
- **Example:**
  ```ts
  drawMorph(ctx, circleShape(cx, cy, 40), heartShape(cx, cy, 40), t, { fill: "#e8a13c", stroke: "#fff", width: 3 });
  ```
- **Composes with:** any of the shape generators as `a`/`b`.

---

## Shape generators

All are centered at `(cx, cy)` and return `Pt[]` — handy sources for morphs.

### polygonShape

```ts
function polygonShape(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): Pt[]
```
- **Purpose:** A regular `sides`-gon of radius `r`, first vertex at angle `rot` (default `-π/2` = pointing up).
- **Parameters:** `cx, cy` — center; `r` — circumradius; `sides` — vertex count; `rot` (default `-π/2`) — start angle.
- **Example:** `polygonShape(cx, cy, 40, 6)` — a hexagon.

### circleShape

```ts
function circleShape(cx: number, cy: number, r: number, n = 48): Pt[]
```
- **Purpose:** A circle approximated as an `n`-gon (default `n = 48`) via `polygonShape`.
- **Example:** `circleShape(cx, cy, 40)`.

### starShape

```ts
function starShape(cx: number, cy: number, r: number, points = 5, inner = 0.45): Pt[]
```
- **Purpose:** A star with `points` outer spikes (default `5`), alternating outer radius `r` and inner radius `r·inner` (default `inner = 0.45`) across `points·2` vertices, first vertex up (`-π/2`).
- **Parameters:** `points` — number of star points; `inner` — inner-to-outer radius ratio (smaller = spikier).
- **Example:** `starShape(cx, cy, 40, 6, 0.5)`.

### heartShape

```ts
function heartShape(cx: number, cy: number, r: number, n = 48): Pt[]
```
- **Purpose:** A heart outline of `n` points (default `48`), from the classic parametric heart curve, scaled to radius `r` and vertically flipped to point down (canvas y-down).
- **Parameters:** `cx, cy` — center; `r` — scale; `n` — point count.
- **Example:** `heartShape(cx, cy, 40)`.

---

**Composes with (all generators):** `resample`, `align`, `morph`, `drawMorph` — pass any two as the `a`/`b` endpoints of a morph.
