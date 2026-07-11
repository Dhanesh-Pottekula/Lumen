# Step 07 · Callouts & leader lines — `src/render/callout.ts`

**Responsibility.** The annotation layer: a label that animates in and points at a coordinate with a leader line that draws on. Themed, deterministic, and seekable. A single `callout(frame, opts)` call covers the whole surface — container styling, 8-way placement (plus `auto`), leader routing (straight / elbow / curve), endpoint markers, subject markers drawn around the target, multi-line text wrapping, and a staged draw-on / label-fade / typewriter reveal.

**When to use.** Any time you want to label or point at a specific point in the scene. It always renders on the `annotation` layer, so it sits above content. Exotic variants are parameterizations of this one function rather than new functions.

## Exported types

### `Side`
```ts
type Side = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "auto";
```
Which side of the target the box sits on. Values:
- `"n"` — box directly above the target.
- `"s"` — box directly below.
- `"e"` — box to the right.
- `"w"` — box to the left.
- `"ne"` — up-and-right of the target.
- `"nw"` — up-and-left.
- `"se"` — down-and-right.
- `"sw"` — down-and-left.
- `"auto"` — resolved from the target's position in the view: if the target is in the top 40% of the view height it uses `"se"`/`"sw"` (right/left depending on horizontal half); if in the bottom 40% it uses `"ne"`/`"nw"`; otherwise `"e"`/`"w"`. Left half is decided by `tx < viewW * 0.5`.

### `LeaderRoute`
```ts
type LeaderRoute = "none" | "straight" | "elbow" | "curve";
```
How the leader line runs from the box edge to the target.
- `"none"` — no leader line drawn at all.
- `"straight"` — a single straight segment box-edge → target.
- `"elbow"` — one right-angle corner. Horizontal-first when the horizontal run is wider than the vertical run, else vertical-first.
- `"curve"` — a quadratic Bézier bulging perpendicular to the box→target line by `curveBend` view units (sampled as 21 points).

### `EndMarker`
```ts
type EndMarker = "none" | "dot" | "ring" | "arrow" | "crosshair";
```
Marker kind for the leader's endpoints (`targetMarker` at the target, `labelMarker` at the box).
- `"none"` — nothing.
- `"dot"` — filled circle, radius 3.4.
- `"ring"` — stroked circle, radius 5.
- `"arrow"` — an arrowhead (size 10) aligned to the leader's tip angle.
- `"crosshair"` — a small plus (`±6` in x and y).

### `Container`
```ts
type Container = "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
```
The box style behind the text.
- `"text"` — no box at all; text only (no fill, no border, no pop).
- `"pill"` — rounded rectangle, corner radius `min(box.h/2, 14)` (fully rounded ends). This is the default container.
- `"rect"` — rounded rectangle, corner radius 4.
- `"tag"` — rounded rectangle, corner radius 3.
- `"bubble"` — like a pill (radius `min(box.h/2,14)`) plus a small triangular pointer tail toward the target.
- `"badge"` — pill geometry, but sized to at least `fontPx + PAD*2` in both width and height (a compact chip for very short labels).

### `Subject`
```ts
type Subject = "none" | "circle" | "rect" | "bracket";
```
A marker drawn **around** the target (in addition to the endpoint marker), draws on with the leader (`leaderP`), stroked in `accent`.
- `"none"` — nothing.
- `"circle"` — a circle of radius `subjectR`, sweeping open clockwise from the top as `leaderP` goes 0→1.
- `"rect"` — a square of half-size `subjectR` centered on the target.
- `"bracket"` — four corner brackets (arm length `subjectR * 0.6`) framing the target.

### `CalloutOptions`
```ts
interface CalloutOptions {
  target: [number, number];
  text?: string;
  title?: string;         // optional bold first line
  side?: Side;
  offset?: number;        // gap from target to the box (default 90)
  container?: Container;
  route?: LeaderRoute;
  targetMarker?: EndMarker; // marker where the leader meets the target
  labelMarker?: EndMarker;  // marker where the leader meets the box
  subject?: Subject;        // marker drawn AROUND the target
  subjectR?: number;
  fontPx?: number;
  maxWidth?: number;        // wrap width in view units
  curveBend?: number;       // perpendicular control offset for route "curve"
  leaderP?: number;         // leader + subject draw-on (0..1)
  labelP?: number;          // box + text fade/pop (0..1)
  typeP?: number;           // optional typewriter over the body (0..1)
  color?: string;           // leader + border
  bg?: string;              // container fill
  ink?: string;             // text
  accent?: string;          // markers
  dash?: number[];
  seed?: number;
}
```

Fields, with defaults and meaning:
- `target: [number, number]` (required) — the point the callout labels/points at.
- `text?: string` — the body text; wrapped to `maxWidth` and, if `typeP < 1`, revealed with a typewriter.
- `title?: string` — optional first line, rendered bold (`700`). Not affected by the typewriter (only body lines are typed).
- `side?: Side` (default `"auto"`) — placement side; see `Side`.
- `offset?: number` (default `90`) — gap in view units from the target to the box; the box center is placed `offset + halfBox` away.
- `container?: Container` (default `"pill"`) — box style; see `Container`.
- `route?: LeaderRoute` (default `"straight"`) — leader routing; see `LeaderRoute`.
- `targetMarker?: EndMarker` (default `"dot"`) — marker at the target end of the leader; revealed only in the last 15% of `leaderP` (`(leaderP - 0.85) / 0.15`), in `accent`.
- `labelMarker?: EndMarker` (default `"none"`) — marker at the box end of the leader, in `accent`, alpha `leaderP`.
- `subject?: Subject` (default `"none"`) — marker drawn around the target; see `Subject`.
- `subjectR?: number` (default `22`) — radius/half-size of the subject marker in view units.
- `fontPx?: number` (default `14`) — text size in px; also drives line height (`fontPx * 1.32`) and padding math.
- `maxWidth?: number` (default `180`) — wrap width in view units for the body text.
- `curveBend?: number` (default `34`) — perpendicular control offset for `route: "curve"`.
- `leaderP?: number` (default `1`, clamped 0..1) — draw-on progress for the leader line and the subject marker.
- `labelP?: number` (default `1`, clamped 0..1) — fade/pop-in progress for the box and text. A subtle pop scale of `0.94 + 0.06 * labelP` is applied. If `labelP <= 0` the box/text are skipped entirely.
- `typeP?: number` (default `1`, clamped 0..1) — typewriter progress over body lines only; when `< 1` each non-title line shows its first `round(len * typeP)` characters.
- `color?: string` (default `theme.palette.muted`) — leader stroke and container border color.
- `bg?: string` (default `theme.palette.surface`) — container fill.
- `ink?: string` (default `theme.palette.ink`) — text color.
- `accent?: string` (default `theme.palette.accent`) — color of endpoint markers and subject markers.
- `dash?: number[]` — dash pattern for the leader stroke (passed through to `strokeOn`).
- `seed?: number` (default `round(target[0])`) — deterministic roughness seed for the leader stroke.

## Exported functions

### callout
```ts
export function callout(frame: FrameCtx, o: CalloutOptions): void
```
- **Purpose:** Draw one animated callout — subject marker, leader line + endpoint markers, container box, and (title + body) text — on the `annotation` layer.
- **Parameters / options:** `frame: FrameCtx` supplies the `annotation` ctx, the `theme`, and `viewW`/`viewH` (used for `"auto"` side resolution). `o: CalloutOptions` is documented in full above. Text is measured with the theme body font (`theme.type.body`); the title uses the same font at weight `700`. Box width is `textW + PAD*2` (with `PAD = 9`), except `"badge"` which floors width and height at `fontPx + PAD*2`. Line height is `fontPx * 1.32`. Draw order: subject marker → leader + markers → box (with pop) → text. Returns nothing.
- **Example:**
  ```ts
  callout(frame, {
    target: [cx, cy],
    title: "Nucleus",
    text: "Holds the cell's DNA.",
    side: "ne",
    container: "pill",
    route: "elbow",
    subject: "circle",
    subjectR: 26,
    leaderP: stepProgress(t, 0.2, 0.5),
    labelP: stepProgress(t, 0.5, 0.4),
    typeP: stepProgress(t, 0.8, 0.6),
  });
  ```
- **Composes with:** `stepProgress` / `beat` / `emphasis` from `sequence.ts` to drive `leaderP`, `labelP`, and `typeP` as functions of `t`. Uses `strokeOn`, `pointAt`, `Pt` from `strokes.ts` and `arrowhead` from `strokeVerbs.ts` internally.

### labelBox
```ts
export function labelBox(text: string, cx: number, cy: number, fontPx: number): { x: number; y: number; w: number; h: number }
```
- **Purpose:** Pure-ish box layout that approximates a label's rectangle from text length alone, for callers that need geometry without a canvas `ctx`.
- **Parameters / options:** `text` — the label text (only its `.length` is used). `cx`, `cy` — the desired center. `fontPx` — font size. Width is `text.length * fontPx * 0.55 + PAD*2`; height is `fontPx + PAD*2` (`PAD = 9`). Returns the top-left `{x, y}` and size `{w, h}` centered on `(cx, cy)`.
- **Example:**
  ```ts
  const box = labelBox("Aorta", 400, 220, 14); // { x, y, w, h }
  ```
- **Composes with:** Layout/hit-testing outside the render pass; note `callout` itself measures text with a real `ctx` and does not use `labelBox`.

---

# Step 08 · Engagement grammar — `src/render/sequence.ts`

**Responsibility.** Pedagogical timing expressed as pure functions of `t`:
- progressive disclosure → `stepProgress`, `buildSteps`, `stepState`, `revealList`
- predict-and-reveal → `predictReveal`
- emphasis choreography → `emphasis`, `beat`, `punchScale`, `shakeOffset`, `flashAlpha` (+ the draw wrappers `withPunch`, `withShake`, `flashOverlay`)
- orchestration → `sequencer`

**When to use.** Whenever a lesson needs to stage content over time — cascading reveals of list items, a pose→pause→reveal beat, a punch/shake/flash accent, or an ordered sequence of beats. Everything is deterministic and seekable: envelopes read `0` away from their moment, so they are safe to call every frame. Visual effects (scale/shake/flash) are applied by the scene from the returned values.

## Exported types

### `StepItem`
```ts
interface StepItem {
  p: number;       // entrance progress 0..1
  focus: number;   // 1 current, dim (0.45) past, 0 future
  active: boolean;
}
```
Per-item weighting for a build list. `p` is entrance progress; `focus` is `1` for the current item, `dimPast` (default `0.45`) for completed items, `0` for not-yet-reached items; `active` is true only for the current item.

### `Beat`
```ts
interface Beat {
  at: number;
  dur?: number;
}
```
One beat for `sequencer`: `at` is its start time; `dur` (default `0.6` when consumed) is its progress duration.

## Exported functions

### stepProgress
```ts
export const stepProgress = (t: number, at: number, dur: number): number
```
- **Purpose:** Eased `0→1` for a single build step starting at `at` over `dur`.
- **Parameters / options:** `t` — current time. `at` — start time. `dur` — duration. Returns `easeOutCubic(clamp01((t - at) / dur))` — `0` before `at`, `1` after `at + dur`.
- **Example:** `const p = stepProgress(t, 0.5, 0.4);`
- **Composes with:** The building block for `buildSteps`, `stepState`, `predictReveal`, `sequencer`, and for driving `callout`'s `leaderP`/`labelP`/`typeP`.

### buildSteps
```ts
export function buildSteps(t: number, count: number, opts: { start?: number; step: number; dur?: number }): number[]
```
- **Purpose:** Per-item eased progress for `count` items entering in a staggered cascade.
- **Parameters / options:**
  - `t: number` — current time.
  - `count: number` — number of items.
  - `opts.start?: number` (default `0`) — time the first item begins.
  - `opts.step: number` (required) — delay between consecutive items.
  - `opts.dur?: number` (default `0.6`) — each item's entrance duration.
  - Returns an array of `count` progress values, item `i` = `stepProgress(t, start + i*step, dur)`.
- **Example:** `const ps = buildSteps(t, rows.length, { start: 0.2, step: 0.15 });`
- **Composes with:** Drive alpha/offset per row; use `stepState`/`revealList` instead when you also want past-item dimming.

### stepState
```ts
export function stepState(t: number, count: number, opts: { start?: number; step?: number; dur?: number; dimPast?: number }): {
  index: number;
  item(i: number): StepItem;
}
```
- **Purpose:** Build-list state that also tracks which item is "current" and how each should be weighted — current bright, completed dim, upcoming hidden. Great for worked examples.
- **Parameters / options:**
  - `t` — current time.
  - `count` — number of items.
  - `opts.start?` (default `0`) — first item's time.
  - `opts.step` (required) — delay between items.
  - `opts.dur?` (default `0.5`) — entrance duration.
  - `opts.dimPast?` (default `0.45`) — focus weight applied to already-completed items.
  - Returns `{ index, item(i) }`: `index` is the highest item whose `start + i*step` has passed (`-1` before any); `item(i)` returns a `StepItem` with `p = stepProgress(...)`, `active = (i === index)`, and `focus = active ? 1 : i < index ? dimPast : 0`.
- **Example:**
  ```ts
  const st = stepState(t, lines.length, { step: 0.5 });
  const s = st.item(2); // { p, active, focus }
  ```
- **Composes with:** `revealList` uses it internally; call it directly when you draw the rows yourself.

### revealList
```ts
export function revealList(
  ctx: CanvasRenderingContext2D,
  items: unknown[],
  t: number,
  opts: { start?: number; step: number; dur?: number; x: number; y: number; rowH: number; dimPast?: number; slide?: number },
  draw: (ctx: CanvasRenderingContext2D, item: unknown, i: number, x: number, y: number, alpha: number) => void,
): void
```
- **Purpose:** Render a vertical list with a staggered entrance (fade + slide-up) and past-item dimming; you provide the per-row draw callback.
- **Parameters / options:**
  - `ctx` — canvas context.
  - `items` — the list; `items.length` sets the count.
  - `t` — current time.
  - `opts.start?` (default `0` via `stepState`) — first row's time.
  - `opts.step` (required) — delay between rows.
  - `opts.dur?` (default `0.5` via `stepState`) — entrance duration.
  - `opts.x`, `opts.y` (required) — top-left origin.
  - `opts.rowH` (required) — vertical spacing between rows.
  - `opts.dimPast?` (default `0.45`) — completed-row weight.
  - `opts.slide?` (default `10`) — extra downward offset while a row enters (`(1 - p) * slide`, slides up as it settles).
  - `draw(ctx, item, i, x, y, alpha)` — invoked per visible row (skipped while `p <= 0`) inside a saved context with `globalAlpha` pre-multiplied; `alpha = p * weight`, where `weight` is `1` for the active row else `max(focus, 0.0001)`.
  - Returns nothing.
- **Example:**
  ```ts
  revealList(ctx, steps, t, { step: 0.4, x: 120, y: 200, rowH: 44 },
    (c, item, i, x, y, a) => { c.fillStyle = ink; c.fillText(String(item), x, y); });
  ```
- **Composes with:** Built on `stepState`; the highest-level "just show me a cascading list" helper.

### predictReveal
```ts
export function predictReveal(t: number, opts: { poseAt?: number; revealAt: number; dur?: number }): {
  question: number;
  thinking: number;
  answer: number;
  revealed: boolean;
}
```
- **Purpose:** A pose→pause→reveal beat: the question shows, a thinking gap elapses, then the answer lands.
- **Parameters / options:**
  - `t` — current time.
  - `opts.poseAt?` (default `0`) — when the question appears.
  - `opts.revealAt` (required) — when the answer appears.
  - `opts.dur?` (default `0.6`) — entrance duration for both question and answer.
  - Returns: `question` = `stepProgress(t, poseAt, dur)`; `thinking` = `clamp01((t - poseAt) / max(0.01, revealAt - poseAt))` (0→1 across the gap); `answer` = `stepProgress(t, revealAt, dur)`; `revealed` = `t >= revealAt`.
- **Example:**
  ```ts
  const pr = predictReveal(t, { poseAt: 0.3, revealAt: 2.0 });
  // fade the question with pr.question, the answer with pr.answer
  ```
- **Composes with:** Feed `question`/`answer` into `fadeText`/`drawWordReveal`; use `thinking` to animate a "…" or a progress hint.

### emphasis
```ts
export function emphasis(t: number, at: number, width = 0.6): number
```
- **Purpose:** A `0→1→0` parabolic bump centered at `at`, safe everywhere (returns `0` outside the window).
- **Parameters / options:** `t` — current time. `at` — peak time. `width` (default `0.6`) — half-life in seconds; value is `max(0, 1 - ((t-at)/width)^2)`.
- **Example:** `const e = emphasis(t, 1.5); // peaks at t=1.5`
- **Composes with:** Backing envelope for `punchScale`; multiply into alpha/scale/glow for a momentary accent.

### beat
```ts
export function beat(t: number, at: number, opts: { attack?: number; hold?: number; release?: number } = {}): number
```
- **Purpose:** A general ADSR-ish envelope: rises into `at` over `attack`, holds, then releases.
- **Parameters / options:**
  - `t`, `at` — current time and the moment the hold begins.
  - `opts.attack?` (default `0.15`) — rise duration ending at `at`.
  - `opts.hold?` (default `0.1`) — full-`1` hold after `at`.
  - `opts.release?` (default `0.5`) — fall duration.
  - Returns `0` before `at - attack`, a `smooth` rise to `1` by `at`, `1` through the hold, a `smooth` fall to `0`, then `0`.
- **Example:** `const b = beat(t, 2.0, { attack: 0.2, hold: 0.3, release: 0.6 });`
- **Composes with:** A longer, flatter accent than `emphasis`; multiply into any visual property that should sustain.

### punchScale
```ts
export const punchScale = (t: number, at: number, amp = 0.2, width = 0.4): number
```
- **Purpose:** Scale multiplier for a "punch" pop at `at`.
- **Parameters / options:** `t`, `at` — time and peak. `amp` (default `0.2`) — peak overshoot. `width` (default `0.4`) — `emphasis` width. Returns `1 + amp * emphasis(t, at, width)`.
- **Example:** `ctx.scale(punchScale(t, 1.0), punchScale(t, 1.0));`
- **Composes with:** Used internally by `withPunch`; apply directly around a manual `ctx.scale`.

### shakeOffset
```ts
export function shakeOffset(t: number, at: number, mag: number, opts: { dur?: number; freq?: number } = {}): [number, number]
```
- **Purpose:** A decaying shake offset around `at` — deterministic pseudo-jitter from `t`.
- **Parameters / options:**
  - `t`, `at` — time and the shake's center.
  - `mag` (required) — peak magnitude in px.
  - `opts.dur?` (default `0.5`) — decay window; `k = max(0, 1 - |t-at|/dur)`.
  - `opts.freq?` (default `90`) — oscillation frequency.
  - Returns `[sin(t*freq)*mag*k, cos(t*freq*1.22)*mag*k]`; `[0,0]` outside the window.
- **Example:** `const [dx, dy] = shakeOffset(t, 1.2, 6);`
- **Composes with:** Used internally by `withShake`; add the offset to a manual `ctx.translate`.

### flashAlpha
```ts
export const flashAlpha = (t: number, at: number, dur = 0.25): number
```
- **Purpose:** A quick `0→1→0` flash within `dur` of `at`.
- **Parameters / options:** `t`, `at` — time and peak. `dur` (default `0.25`) — half-window. Returns `max(0, 1 - |t-at|/dur)`.
- **Example:** `ctx.globalAlpha *= flashAlpha(t, 1.0);`
- **Composes with:** Used internally by `flashOverlay` and by `drawSlam`'s impact ring; multiply into any glow/overlay alpha.

### withPunch
```ts
export function withPunch(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, at: number, draw: (c: CanvasRenderingContext2D) => void, opts: { amp?: number; width?: number } = {}): void
```
- **Purpose:** Run `draw` with a punch scale about `(cx, cy)` at `at`.
- **Parameters / options:** `ctx`, `cx`, `cy` — context and pivot. `t`, `at` — time and peak. `draw(c)` — the render callback. `opts.amp?` (default `0.2`), `opts.width?` (default `0.4`) — forwarded to `punchScale`. Saves/translates/scales/restores around `draw`.
- **Example:** `withPunch(ctx, cx, cy, t, 1.0, (c) => drawGlyph(c), { amp: 0.3 });`
- **Composes with:** Wraps `punchScale`; the drop-in way to pop a glyph/shape.

### withShake
```ts
export function withShake(ctx: CanvasRenderingContext2D, t: number, at: number, draw: (c: CanvasRenderingContext2D) => void, opts: { mag?: number; dur?: number; freq?: number } = {}): void
```
- **Purpose:** Run `draw` shaken around `at`.
- **Parameters / options:** `ctx` — context. `t`, `at` — time and center. `draw(c)` — render callback. `opts.mag?` (default `6`), plus `dur`/`freq` forwarded to `shakeOffset`. Saves/translates by the offset/restores around `draw`.
- **Example:** `withShake(ctx, t, 1.2, (c) => drawImpact(c), { mag: 8 });`
- **Composes with:** Wraps `shakeOffset`; pair with `flashOverlay`/`punchScale` for an impact.

### flashOverlay
```ts
export function flashOverlay(ctx: CanvasRenderingContext2D, t: number, at: number, w: number, h: number, opts: { color?: string; dur?: number } = {}): void
```
- **Purpose:** A full-view color flash at `at` (draw on the fx layer).
- **Parameters / options:** `ctx` — context. `t`, `at` — time and peak. `w`, `h` — view size (fills `0,0,w,h`). `opts.color?` (default `"rgba(255,255,255,0.6)"`), `opts.dur?` (default `0.25`, forwarded to `flashAlpha`). No-op when alpha `<= 0`.
- **Example:** `flashOverlay(fxCtx, t, 1.0, viewW, viewH, { color: "rgba(255,220,120,0.5)" });`
- **Composes with:** Wraps `flashAlpha`; the scene-wide accent to punctuate a beat.

### sequencer
```ts
export function sequencer(beats: Beat[]): {
  progress: (t: number) => number[];
  activeIndex: (t: number) => number;
}
```
- **Purpose:** Turn an ordered list of beats into per-beat progress and the current active index.
- **Parameters / options:** `beats: Beat[]` — each `{ at, dur? }`. Returns `progress(t)` = per-beat `stepProgress(t, b.at, b.dur ?? 0.6)`, and `activeIndex(t)` = index of the last beat whose `at` has passed (`-1` before the first).
- **Example:**
  ```ts
  const seq = sequencer([{ at: 0 }, { at: 1.2 }, { at: 2.5, dur: 0.4 }]);
  const ps = seq.progress(t);
  const active = seq.activeIndex(t);
  ```
- **Composes with:** Higher-level than raw `stepProgress`; use for a fixed choreography of named beats.

---

# Step 09 · Kinetic typography — `src/render/type-motion.ts`

**Responsibility.** Text and numbers as animated citizens: counters / number tickers, word-by-word and typewriter reveals, big-number "slams", scramble/decode, and text-along-a-path. Split into pure value/format helpers and themed draw helpers. All deterministic and seekable.

**When to use.** Whenever a lesson animates the appearance or value of text — a metric counting up, a headline typing in, a date slamming down, an answer decoding, or a caption running along a curve.

## Exported types

### `NumberFormat`
```ts
interface NumberFormat {
  decimals?: number;
  commas?: boolean;
  prefix?: string;
  suffix?: string;
}
```
Formatting options for `formatNumber` / `drawCounter`.
- `decimals?` (default `0`) — fixed decimal places.
- `commas?` (default `true`) — insert thousands separators in the integer part.
- `prefix?` (default `""`) — string prepended after the sign (e.g. a currency symbol).
- `suffix?` (default `""`) — string appended (e.g. `"%"`).

> Note: there is no `NumberFormat` union of named styles like "currency"/"percent". Those presets are exposed as the helper functions `formatCurrency` and `formatPercent`, which are thin wrappers over `formatNumber` (`prefix` and `suffix` respectively).

### `WordMode`
```ts
type WordMode = "fade" | "rise" | "pop";
```
Per-word entrance style for `drawWordReveal`.
- `"fade"` — alpha in only (no offset, no scale).
- `"rise"` — fade in while rising up by `(1 - p) * 14` px. This is the default.
- `"pop"` — fade in while scaling from an `easeOutBack(p)` overshoot to full size, pivoting on the word's center.

## Value & format helpers (pure)

### counterValue
```ts
export function counterValue(t: number, at: number, dur: number, from: number, to: number, ease: (p: number) => number = easeOutCubic): number
```
- **Purpose:** Eased interpolation `from → to` over `[at, at+dur]`, clamped.
- **Parameters / options:** `t` — time. `at` — start. `dur` — duration. `from`, `to` — endpoints. `ease` (default `easeOutCubic`) — easing applied to the clamped progress. Returns `from + (to - from) * ease(clamp01((t-at)/dur))`.
- **Example:** `const v = counterValue(t, 0.5, 1.2, 0, 1000000);`
- **Composes with:** Feed the result to `formatNumber` / `drawCounter`.

### formatNumber
```ts
export function formatNumber(n: number, opts: NumberFormat = {}): string
```
- **Purpose:** Format a number to a display string with decimals, thousands separators, prefix, and suffix.
- **Parameters / options:** `n` — value. `opts` — a `NumberFormat` (see above). Rounds `|n|` to `decimals`; adds a leading `-` only when the rounded value is non-zero (avoids `"-0"`); inserts commas into the integer part when `commas`; wraps as `${sign}${prefix}${body}${suffix}`.
- **Example:** `formatNumber(-1234.5, { decimals: 1, prefix: "$" }); // "-$1,234.5"`
- **Composes with:** Used by `drawCounter`; base for `formatCurrency`/`formatPercent`.

### formatCurrency
```ts
export const formatCurrency = (n: number, symbol = "$", decimals = 0): string
```
- **Purpose:** Currency preset — `formatNumber(n, { decimals, prefix: symbol })`.
- **Parameters / options:** `n` — value. `symbol` (default `"$"`) — currency prefix. `decimals` (default `0`).
- **Example:** `formatCurrency(2500000); // "$2,500,000"`
- **Composes with:** Shorthand over `formatNumber` for money values.

### formatPercent
```ts
export const formatPercent = (n: number, decimals = 0): string
```
- **Purpose:** Percent preset — `formatNumber(n, { decimals, suffix: "%" })`.
- **Parameters / options:** `n` — value. `decimals` (default `0`).
- **Example:** `formatPercent(87.5, 1); // "87.5%"`
- **Composes with:** Shorthand over `formatNumber` for rates.

### wordsShown
```ts
export function wordsShown(text: string, p: number): string
```
- **Purpose:** The first `ceil(p · wordCount)` words of the text (whitespace-split, empties dropped), rejoined by single spaces.
- **Parameters / options:** `text` — source. `p` — progress (clamped 0..1).
- **Example:** `wordsShown("one two three four", 0.5); // "one two"`
- **Composes with:** Pair with `stepProgress` to reveal a caption word-by-word without per-word styling.

### charsShown
```ts
export function charsShown(text: string, p: number): string
```
- **Purpose:** The first `round(p · length)` characters of the text.
- **Parameters / options:** `text` — source. `p` — progress (clamped 0..1).
- **Example:** `charsShown("Hello", 0.6); // "Hel"`
- **Composes with:** Used by `drawTypewriter`; the pure primitive behind character reveals.

### scrambleText
```ts
export function scrambleText(text: string, p: number, seed = 1): string
```
- **Purpose:** Scramble→resolve: characters lock into place left-to-right as `p` goes 0→1; unresolved characters are random glyphs. Spaces are always preserved.
- **Parameters / options:** `text` — source. `p` — progress (clamped 0..1); `floor(p · length)` leading chars are locked. `seed` (default `1`) — deterministic seed; the RNG re-rolls roughly per frame-tick via `seed + floor(p*60)`. Random glyphs are drawn from `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@"`.
- **Example:** `scrambleText("SECRET", 0.5); // "SEC" + 3 random glyphs`
- **Composes with:** Used by `drawScramble`; the pure primitive behind decode reveals.

## Draw helpers

All draw helpers take a `TextStyle` (internal, not exported):
```ts
interface TextStyle {
  font: string;                 // full CSS font string
  color: string;
  align?: CanvasTextAlign;      // where applicable
  alpha?: number;               // default 1, pre-multiplied into globalAlpha
}
```

### drawCounter
```ts
export function drawCounter(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, style: TextStyle, fmt: NumberFormat = {}): void
```
- **Purpose:** Draw a counting number; value comes from `counterValue`, formatting from `NumberFormat`.
- **Parameters / options:** `ctx`, `x`, `y` — context and position. `value` — the number to show. `style` — `TextStyle`; `align` defaults to `"center"`. `fmt` — `NumberFormat` passed to `formatNumber`.
- **Example:**
  ```ts
  drawCounter(ctx, cx, cy, counterValue(t, 0.5, 1.2, 0, 2500000),
    { font: "600 48px Inter", color: ink }, { commas: true, prefix: "$" });
  ```
- **Composes with:** `counterValue` for the value; `formatCurrency`/`formatPercent` are equivalent format presets.

### drawTypewriter
```ts
export function drawTypewriter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: number, style: TextStyle, opts: { cursor?: boolean; t?: number } = {}): void
```
- **Purpose:** Typewriter — reveals `charsShown(text, p)` with an optional blinking cursor.
- **Parameters / options:** `ctx`, `text`, `x`, `y` — context, text, position. `p` — reveal progress. `style` — `TextStyle`; `align` defaults to `"start"`. `opts.cursor?` — show a `"|"` cursor while `p < 1`. `opts.t?` — time used to blink the cursor (`floor(t*2) % 2 === 0`); when omitted the cursor is steady.
- **Example:** `drawTypewriter(ctx, "Loading…", 120, 200, stepProgress(t, 0, 1), { font: "20px Inter", color: ink }, { cursor: true, t });`
- **Composes with:** Drive `p` with `stepProgress`; built on `charsShown`.

### drawWordReveal
```ts
export function drawWordReveal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, style: TextStyle, opts: { start?: number; step?: number; dur?: number; mode?: WordMode; space?: number } = {}): void
```
- **Purpose:** Word-by-word reveal with a per-word staggered entrance (fade / rise-up / pop), left-aligned from `x`.
- **Parameters / options:**
  - `ctx`, `text`, `x`, `y` — context, text, origin (`textAlign` is forced to `"start"`).
  - `t` — current time.
  - `style` — `TextStyle` (its `alpha` multiplies each word's alpha).
  - `opts.start?` (default `0`) — first word's time.
  - `opts.step?` (default `0.12`) — delay between words.
  - `opts.dur?` (default `0.35`) — each word's entrance duration.
  - `opts.mode?` (default `"rise"`) — a `WordMode`; see the type above.
  - `opts.space?` (default `ctx.measureText(" ").width`) — extra gap between words.
  - Per word: `p = easeOutCubic(clamp01((t - (start + i*step))/dur))`; drawn only while `p > 0`.
- **Example:** `drawWordReveal(ctx, "Learn by doing", 120, 300, t, { font: "28px Inter", color: ink }, { mode: "pop", step: 0.15 });`
- **Composes with:** A styled alternative to `wordsShown`; timing mirrors `buildSteps`.

### drawSlam
```ts
export function drawSlam(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, t: number, at: number, style: TextStyle, opts: { dur?: number; from?: number } = {}): void
```
- **Purpose:** Big-number / date "slam" — text enters oversized and settles to full size with an overshoot, plus an impact flash ring. Always centered.
- **Parameters / options:** `ctx`, `text`, `cx`, `cy` — context, text, center. `t`, `at` — time and slam moment. `style` — `TextStyle` (`textAlign` forced `"center"`). `opts.dur?` (default `0.55`) — settle duration. `opts.from?` (default `1.8`) — starting scale. Scale is `lerp(from, 1, easeOutBack(p))`; alpha ramps via `clamp01(p*3)`; a stroked ring flashes at `at + dur*0.55` (via `flashAlpha`, expanding from radius ~60). No-op while `p <= 0`.
- **Example:** `drawSlam(ctx, "1969", cx, cy, t, 1.0, { font: "800 96px Inter", color: accent });`
- **Composes with:** Pairs naturally with `flashOverlay`/`withShake` for extra impact; imports `flashAlpha` internally.

### drawScramble
```ts
export function drawScramble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, at: number, style: TextStyle, opts: { dur?: number; seed?: number } = {}): void
```
- **Purpose:** Decode/scramble reveal in place.
- **Parameters / options:** `ctx`, `text`, `x`, `y` — context, text, position. `t`, `at` — time and start. `style` — `TextStyle`; `align` defaults to `"center"`. `opts.dur?` (default `1`) — decode duration. `opts.seed?` (default `1`) — forwarded to `scrambleText`. `p = clamp01((t-at)/dur)`; no-op while `p <= 0`.
- **Example:** `drawScramble(ctx, "ANSWER", cx, cy, t, 2.0, { font: "600 40px Inter", color: ink });`
- **Composes with:** Built on `scrambleText`; use to "decode" a reveal answer.

### drawTextAlongPath
```ts
export function drawTextAlongPath(ctx: CanvasRenderingContext2D, text: string, points: Pt[], p: number, style: TextStyle, opts: { spacing?: number } = {}): void
```
- **Purpose:** Lay text glyph-by-glyph along a path, revealing the first `p` fraction; each glyph is positioned and rotated to follow the path.
- **Parameters / options:** `ctx`, `text` — context and text. `points: Pt[]` — the path polyline (sampled via `pointAt`). `p` — reveal fraction; `round(p · length)` glyphs shown. `style` — `TextStyle` (`textAlign` `"center"`, baseline temporarily `"middle"` then restored to `"alphabetic"`). `opts.spacing?` (default `1`) — multiplier on the along-path distribution (glyph `i` sits at fraction `(i/(len-1)) * spacing`, clamped).
- **Example:** `drawTextAlongPath(ctx, "orbit", curvePts, stepProgress(t, 0, 1), { font: "18px Inter", color: ink });`
- **Composes with:** Uses `pointAt`/`Pt` from `strokes.ts`; drive `p` with `stepProgress`. Pair with a stroked path so text tracks the drawn line.
