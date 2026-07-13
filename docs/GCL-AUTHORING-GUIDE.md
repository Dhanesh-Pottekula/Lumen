# GCL Authoring Guide

The Generic Component Layer (GCL) lets you author a Lumen lesson as **data** — a flat list of scene
markers and components — instead of hand-written `render(ctx, t, frame)` code. You write *meaning*
(what appears, when, and how it moves/enters/points at things); `renderFilm(film)` compiles it into a
seekable, deterministic `CanvasSlideDefinition`.

This guide documents the **actual implemented schema** (`src/render/gcl/schema.ts`), not an aspirational
spec. If something isn't listed here, it isn't authorable yet.

```ts
import { renderFilm } from "../../render/gcl";
import type { Film } from "../../render/gcl";

export const myFilm: Film = [
  { type: "scene", theme: "TEXTBOOK", narration: ["First sentence.", "Second sentence."] },
  { type: "heading", id: "title", text: "MY LESSON", cue: 0 },
  { type: "stat", value: 42, label: "the answer", cue: 1 },
];

export const mySlide = renderFilm(myFilm);
```

View is always **920×430**. Nothing here reads a clock or `Math.random` — every field is a pure
function of the film + `t`; a seeded `seed` field controls any pseudo-randomness (particles, dissolve
order) so a scene renders byte-identical on re-seek.

---

## 0. How to define things — the preference order

When you need *something* to appear on screen, there are several ways to make it happen. They are not
equally good. Prefer, **in this order**:

1. **`prop`** — a named catalog object (`{ type: "prop", name: "cannon" }`). Zero geometry to author;
   it's pre-drawn, pre-anchored, and just needs `at`/`size`/`angle`/`color`.
2. **Formula** — `parametric` (for curves/paths) or `chart: "function"` / `chart: "riemann"` (for
   plots). Describe the *math*, not a list of points; the engine samples it.
3. **Physics `motion`** — `fall` / `orbit` / `along` / `spin` / `trace`. Describe the *behavior*
   (gravity, orbit radius, path to follow) and let the engine compute the per-frame position; don't
   hand-animate keyframes yourself.
4. **Anchors & sub-anchors** — `at: "id"` or `at: "id.part"`. Position things *relative to other
   things* by name, not by pixel guesswork.
5. **Raw pixels** (`shape: "path"` with literal `points: Vec2[]`, or a literal `at: [x, y]`) — **last
   resort**, for final nudging only.

**Why:** raw pixel coordinates are fragile — they don't track another component if it moves or
resizes, don't survive a theme/layout change, and don't scale if the view size ever changes. A `prop`,
a formula, an anchor reference, or a physics `motion` spec all *describe intent*, so they keep working
correctly across edits. Reach for literal points/coordinates only when nothing above can express what
you need (e.g. a truly bespoke silhouette), and even then keep the point list as small as possible.

---

## 1. The flat-stream format

A `Film` is `(SceneMarker | Component)[]`. The **first item must be a `{ type: "scene" }` marker**.
Every item after a scene marker (until the next one) belongs to that scene. `parseFilm` groups the
flat list into scenes; `compileScene` compiles each one; `renderFilm` composes them all with
`composeSlides` (cross-fades/transitions between scenes, one continuous seekable timeline).

### Scene marker

```ts
{
  type: "scene",
  duration?: number,          // explicit scene length in seconds; else derived from content/narration timing
  theme?: "TEXTBOOK" | "PARCHMENT" | "BLUEPRINT" | "CHALKBOARD",
  narration?: string[],       // one string per sentence — index IS the `cue` number components reference
  bg?: [string, string],      // background gradient override (top, bottom)
}
```

`renderFilm` picks the whole rendered slide's theme from the **first** scene's `theme` (falls back to
`TEXTBOOK`); later scenes' `theme` fields still affect their own visuals but the theme passed to
`composeSlides` is fixed at the first scene.

---

## 2. Universal props (on every component)

Every component extends `Base`:

| Prop | Type | Meaning |
|---|---|---|
| `id` | `string` | Name it so other components/attention/motion/camera can anchor to it, or so it publishes sub-anchors (§4). |
| `at` | `Position` | Where it sits: a **slot** name, an `[x, y]` coord pair, another component's **id** (its box center), or `"<id>.<subanchor>"` (§4). Omit it and the layout engine auto-flows the component (titles pin to the top band; everything else stacks/centers). Auto-flow measures text-bearing components with an analytic width estimate (not pixel-exact `ctx.measureText`), so auto-flowed positions are approximate — use an explicit `at` when you need precise placement. |
| `cue` | `number` | The narration sentence index (0-based) this component appears with — its start time = that sentence's timestamp. |
| `start` | `"with" \| "after" \| number` | Alternative/override timing: `"with"` the previous component, `"after"` it finishes, or an absolute/relative number of seconds. Overrides `cue` when set. |
| `dur` | `number` | Entrance duration override. |
| `enter` | `EnterSpec` | How it appears (§5). |
| `exit` | `ExitSpec` | How it leaves (§5). |
| `layer` | `"bg" \| "mid" \| "fg" \| "annotation" \| "fx"` | Force a specific paint layer (else each component type has a sensible default — e.g. shapes → `mid`, particles/flow/glow → `fx`, text/equations → `annotation`). |
| `motion` | `MotionSpec` | Per-component object motion — move/fall/orbit/along/spin/trace/morph (§6). |
| `oscillate` | `OscillateSpec` | Idle continuous breathe/wobble/pulse layered additively on top of placement/motion. |
| `emphasis` | `{ kind, at?, cue?, amp? }` | A one-shot punch/shake/pulse/wiggle on the component itself. |
| `ghost` | `number` (0..1) | Residual opacity — de-emphasize this element without removing it. |
| `magnify` | `{ zoom?, r? }` | A local lens/zoom effect on this component. |
| `predict` | `{ revealAt?, revealCue?, poseAt? }` | Pose-then-reveal gating (show a "?" state, then resolve). |

### Positions (`Position` = `Slot \| [number, number] \| string`)

Slots (fractions of the 920×430 view): `"top-left" | "top" | "top-right" | "left" | "center" | "right" |
"bottom-left" | "bottom" | "bottom-right" | "ground" | "sky"`.

An `id` string resolves to that component's placed box center. Unknown ids/positions log a console
warning and fall back to view-center — always safe, never throws.

---

## 3. Component catalog

Every component has `type` plus the fields below (all also carry the universal `Base` props above).

### Content

| `type` | Key fields | Notes |
|---|---|---|
| `heading` | `text`, `size?`, `color?` | Large title text. |
| `text` | `text`, `role?` (`title\|body\|bullet\|caption` — drives default size/placement), `mode?` (`fade\|word\|typewriter\|slam\|scramble` — kinetic entrance), `size?`, `color?`, `align?` | If `mode` is omitted it's inferred from `enter.type` when that names a kinetic kind, else plain fade. |
| `textPath` | `text`, `path: Vec2[]`, `size?`, `color?` | Text set along a polyline. |
| `equation` | `tex`, `size?`, `color?`, `align?` | LaTeX-ish subset via the built-in math typesetter. |
| `stat` | `value`, `unit?`, `label?`, `size?`, `color?`, `commas?`, `decimals?`, `prefix?` | Animated counting-up number. |
| `chart` | `chart: "bar"\|"line"\|"area"\|"scatter"\|"pie"\|"function"\|"riemann"`, plus `data?` (bar/pie), `series?` (line/area/scatter), `fn?`+`xDomain?`+`n?` (function/riemann), `yDomain?`, `w?`, `h?`, `color?`, `donut?`, `axes?`, `xLabel?`, `yLabel?` | `fn` is a safe-expression string in `x` (e.g. `"x*x"`, `"sin(x)*2"`, `"1/(x*x)"`). `riemann` is the harvested Riemann-sum visual: `n` rectangles under `fn` over `xDomain`, built in one at a time. |
| `shape` | `shape: "circle"\|"polygon"\|"star"\|"heart"\|"path"\|"disc"`, `r?`, `sides?`, `points?` (path), `fill?` (string, or `[light, dark]` tuple for `disc`'s shaded-sphere gradient), `stroke?`, `width?`, `shine?` (disc: render as a lit sphere with a rim glow) | |
| `parametric` | `fx`, `fy`, `uDomain?`, `samples?`, `color?`, `width?` | `fx(u)`/`fy(u)` are safe-expression strings **evaluated relative to the component's own placed center** — the actual point is `[cx + fx(u), cy + fy(u)]`, not an absolute view coordinate. |
| `icon` | `name`, `size?`, `color?`, `filled?` | One of the built-in icon set. |
| `image` | `src`, `w`, `h`, `rotate?` | `src` is typically a data URI (SVG). |
| `legend` | `categories: string[]`, `rowH?` | Auto-assigns its own semantic colors per category (no per-category color override field exists yet — see the coverage audit). |
| `map` | `features: {id, rings: [number,number][][]}[]`, `markers?: {lon,lat,label?,icon?}[]`, `flows?: {from,to,color?}[]`, `w?`, `h?` | Coordinates are `[lon, lat]`; the map fits its own projection to the feature bounds. Each feature and labeled marker publishes a sub-anchor (§4). |
| `timeline` | `from`, `to`, `events?: {at,label,above?}[]`, `eras?: {from,to,label,color?}[]`, `playhead?`, `w?`, `h?` | A horizontal axis with era bands, event ticks, and an optional playhead marker. |
| `table` | `rows: string[][]`, `header?`, `w?`, `rowH?`, `colColor?`, `ink?` | Plain data grid. |

### Vector / SVG / prop (Family G)

Three ways to draw finished art, in order of preference (see §0):

| `type` | Key fields | Notes |
|---|---|---|
| `prop` | `name`, `size?`, `angle?` (**degrees**), `color?`, `w?`, `h?` | A named object pulled from the reusable prop catalog (`src/render/gcl/props.ts`). **Prefer this over `vector`/`svg`** whenever the catalog already has what you need — zero geometry to author, and it publishes sub-anchors (§4). Current catalog names: `cannon`, `tree`, `apple`, `planet`, `arrow`, `star`. Example: `{ type: "prop", name: "cannon", at: "ground", size: 1.2, angle: -8 }`. |
| `vector` | `d` (raw SVG path string), `fill?`, `stroke?`, `width?`, `w?`, `h?`, `scale?`, `rotate?` (**radians**) | A raw Path2D path drawn directly by the canvas — deterministic, scalable, themeable (recolor via `fill`/`stroke`), and cheap. Use this for a bespoke shape the prop catalog doesn't cover. Example: `{ type: "vector", d: "M0 0 L20 0 L10 -20 Z", fill: "#e0a030", at: "center" }`. |
| `svg` | `markup` (inline `<svg>...</svg>` string), `w`, `h`, `rotate?` | Rasterizes the given SVG markup to an image (async-loaded, cached). Heavier and non-recolorable at draw time — reach for this only for finished multi-color/gradient artwork that `vector`/`prop` can't express. Example: `{ type: "svg", markup: "<svg viewBox='0 0 24 24'>...</svg>", w: 40, h: 40, at: "top-right" }`. |

Note the unit mismatch: `prop.angle` is in **degrees**, `vector.rotate` is in **radians**.

### Motion, camera, attention (directives — not laid out or drawn as content themselves)

- `camera`: `{ type: "camera", to?: Position, zoom?, rot?, kind?: "move" | "pushIn" }` — excluded from
  layout auto-flow; multiple camera directives in a scene resolve to one continuous `cameraAt(t)`
  (latest-started directive wins; neutral outside any window).
- `attention`: `{ type: "attention", verb, target: Position, from?: Position, text?, title?, side?,
  route?, container?, color?, radius? }` — a `(B)`-class indicator pointing at a resolved anchor.
  `verb` is one of: `callout | highlight | spotlight | dim | pointer | box | brackets | encircle |
  converge | spark | vignette | rings`. `pointer` needs `from` (its second point). `side` (callout):
  `n|s|e|w|ne|nw|se|sw|auto`. `route` (callout): `none|straight|elbow|curve`. `container` (callout):
  `text|pill|rect|tag|bubble|badge`.

### Atmosphere

- `particles`: `{ preset?: "fire"|"smoke"|"sparks"|"rain"|"snow"|"dust"|"confetti"|"energy", seed?,
  config? }` — a one-shot/looping emitter at the component's resolved position. Always seed it for
  determinism.
- `flow`: `{ from: Position, to: Position, color?, rate?, seed? }` — a particle stream between two
  anchors (e.g. a conquest/trade route on a map).
- `glow`: `{ r?, color? }` — a radial glow at the component's position.

### Group container

```ts
{
  type: "group", id?, at?, children: Component[],
  layout?: "row" | "stack" | "grid", gap?: number, cols?: number,
  build?: { step?: number },       // stagger children's entrance by `step` seconds each
  childEnter?: EnterSpec,          // default entrance for children that declare none of their own
  clip?: boolean,                  // clip all child painting to the group's own box
}
```

A group is itself a `Base` component — its own `enter`/`exit`/`motion`/`emphasis` wrap the *whole*
group. Children are ordinary components (including nested groups); an explicit `cue`/`start` on a
child still overrides the group's `build` stagger for that child. **Caveat:** a masked enter
(`wipe`/`iris`/`blinds`/`checkerboard`/`dissolve`/`clip`) on the group itself does not currently
capture the children into the reveal — see `docs/GCL-COVERAGE-AUDIT.md`'s known-gaps section. Prefer
`fade`/`none`/`build` for a group's own `enter`.

---

## 4. Sub-anchors (`"<id>.<subanchor>"`)

Rich components publish named points inside their own placement box, computed once at layout time
(pure geometry, no canvas needed) and registered into the same anchor map ordinary `id`s use. Target
them from `at`, `attention.target`, `motion` positions, etc.

| Component | Sub-anchors |
|---|---|
| `chart` (bar) | `center`, `bar0..barN`, `peak` (max value), `first`, `last` |
| `chart` (riemann) | `center`, `bar0..barN` (rectangle top-centers), `peak`, `first`, `last` |
| `chart` (line/area/scatter) | `center`, `pt0..ptN`, `peak` (max y), `first`, `last` |
| `chart` (pie) | `center`, `slice0..sliceN` (wedge mid-angle points) |
| `chart` (function) | `center` **only** — no per-sample sub-anchors (there's no discrete "data" for a continuous function; target the component's own `id`/`center` instead of `.peak`/`.last`) |
| `shape` | `center`, `top`, `bottom`, `left`, `right`, plus `v0..vN` (vertices) for `polygon`/`star`/`heart`/`path` |
| `map` | `center`, `<featureId>` (each feature's projected bbox center), `<markerLabel>` (each labeled marker's icon position) |
| `timeline` | `center`, `ev0..evN` (each event's x position on the axis) |
| `prop` | Per-catalog-entry named handles (local points scaled by `size`, rotated by `angle`, placed at `at`) — see the exact list below |
| everything else (text, stat, icon, table, `vector`, `svg`, group, …) | `center` only |

**Prop sub-anchors** (from `src/render/gcl/props.ts`'s `PROP_ANCHORS`, exact handle names):

| Prop | Handles |
|---|---|
| `cannon` | `muzzle`, `breech`, `wheels`, `center` |
| `tree` | `top`, `trunk`, `center` |
| `apple` | `stem`, `center` |
| `planet` | `center`, `ring` |
| `arrow` | `tip`, `tail` |
| `star` | `center` |

A prop with no entry in `PROP_ANCHORS` falls back to `{ center }` only. Example: `at: "cannon1.muzzle"`
to spawn `particles`/`flow` right at the barrel's tip, or `attention.target: "tree1.top"` to point at
the canopy.

**Static, not live:** sub-anchors (and a component's own id-box) are computed once at layout time from
the component's *authored* position — they do **not** track a component's live `motion` position frame
to frame. Don't target a sub-anchor (or plain `id`) of a component that has `motion` and expect the
attention/callout to follow it as it moves; it will stay pinned to where the component was laid out,
not where it currently is mid-animation.

---

## 5. Enter / exit vocabulary

`enter.type` — one of:
`none | fade | draw | wipe | iris | radialWipe | blinds | checkerboard | dissolve | clip | slam | word |
typewriter | scramble | build | borderThenFill`.

- **Native** kinds (`slam`, `word`, `typewriter`, `scramble`, `draw`, `build`, `borderThenFill`, `none`)
  animate the content's own progress-driven draw path directly.
- **Masked** kinds (`wipe`, `iris`, `radialWipe`, `blinds`, `checkerboard`, `dissolve`, `clip`) draw the
  *finished* content into an offscreen buffer and reveal it through an animated mask shape.
- `fade` cross-fades the finished content in via opacity.

`enter` extra fields: `dur?`, `dir?` (`left|right|up|down` — wipe/blinds), `shape?`
(`circle|ellipse|rect|diamond` — iris), `count?` (blinds slat count), `seed?` (dissolve/checkerboard
order), `points?: Vec2[]` (clip polygon, absolute coords), `pen?: boolean` (draw: ride an **asset-free
nib** — a small filled triangle oriented along the stroke's tangent, drawn directly; no bitmap/hand
asset is loaded).

`exit.type` — one of: `none | fade | erase | wipe | iris | dissolve | slide | shrink`. Extra fields:
`out?` (absolute start of the exit; default = scene end − `dur`), `until?` (exit finishes at this
time instead), `dur?` (default 0.6), `dir?` (wipe/slide direction). `erase` is the natural exit for
drawn strokes/paths (un-draws them); everything else fades/wipes/dissolves/slides/shrinks the
finished content out.

### When to add `exit`

Scenes auto-clear at scene boundaries — everything from scene *N* is gone once scene *N+1* starts, so
you never need an `exit` just to end a scene. `exit` is only for clutter control **within** a single
long scene: give it to any component that

- is a **setup element superseded by a payoff** later in the same scene (e.g. a placeholder shape
  before the real chart appears),
- is a **temporary state marker** (a "loading"/intermediate label, a scratch annotation) that stops
  being true partway through the scene, or
- is a **label/callout that's already been answered** (a question mark or prompt that the next beat
  resolves) and would otherwise sit on screen looking stale.

If you don't add `exit`, the component just stays visible for the rest of the scene — which is
correct and desired most of the time. Only reach for `exit` when leaving it up would visually clutter
or contradict a later beat in the *same* scene.

---

## 6. Motion (`motion: MotionSpec`)

| `kind` | Fields | Behavior |
|---|---|---|
| `move` | `to`, `from?`, `at?`, `cue?`, `start?`, `dur?` | Straight-line move between two anchors. |
| `fall` | `to?`, `from?`, `gravity?`, `at?`, `dur?`, `bounce?` | Gravity-accelerated drop, optional bounce. |
| `orbit` | `center`, `radius?` (or `rx?`/`ry?` for an ellipse), `from?` (start angle), `turns?`, `at?`, `dur?` | Circular/elliptical orbit around an anchor. |
| `along` | `path: Vec2[]`, `loop?`, `at?`, `dur?` | Rides an explicit polyline. |
| `spin` | `omega?`, `at?`, `dur?` | Continuous rotation about its own center. |
| `trace` | `path: Vec2[]`, `color?`, `dissipate?`, `at?`, `dur?` | Leaves a fading trail while moving (a comet/ghost-path effect). |
| `morph` | `toShape: "circle"\|"polygon"\|"star"\|"heart"`, `sides?`, `at?`, `dur?` | Morphs a `shape`'s outline into a different shape over time (e.g. an open parabola into a closed orbit). |

`oscillate` (separate from `motion`, layered additively): `{ axis?: "x"|"y"|"rot"|"scale", amp, period,
mode?: "breathe"|"wobble"|"pulse" }` — a continuous idle animation on top of whatever position `at`/
`motion` computes.

---

## 7. Camera

```ts
{ type: "camera", to?: Position, zoom?: number, rot?: number, kind?: "move" | "pushIn" }
```

Multiple camera directives in one scene are timed the same as any component (`cue`/`start`) and merge
into a single `cameraAt(t)`: the most recently started directive wins, animating from the previous
directive's target (or neutral, if it's the first) to its own. `kind: "pushIn"` dollies zoom while
holding the focal point; `kind: "move"` (default) glides the whole camera (position + zoom + rotation)
to the new target — this is how a "whip-pan" reads: two `move` directives close together with a big
positional jump.

---

## 8. Worked examples (excerpted from the 4 re-authored lessons)

**Membrane diagram + sub-anchor callout** (`src/lessons/gcl/neuron.ts`):
```ts
{ type: "shape", id: "axon", shape: "path", stroke: "#cfe0e6", width: 4.2, at: [0, 0], cue: 1,
  points: [[222, 224], [340, 218], [480, 216], [620, 218], [760, 216], [812, 216]],
  enter: { type: "draw" } },
{ type: "attention", verb: "callout", target: "axon.v3", title: "axon + myelin",
  text: "carries the pulse away", side: "n", route: "elbow", color: "#e8c98a", cue: 2 },
{ type: "camera", to: "soma", zoom: 1.15, kind: "pushIn", cue: 2 },
```

**Apple fall + cannonball-to-orbit morph** (`src/lessons/gcl/gravity.ts`):
```ts
{ type: "shape", id: "apple", shape: "circle", r: 11, fill: "#d1453f", at: [276, 150], cue: 1,
  motion: { kind: "fall", to: "bottom", gravity: 340, bounce: 0.2, at: 3, dur: 1.8 } },
...
{ type: "shape", id: "orbitShot", shape: "circle", r: 124, stroke: "#ffe08a", at: [620, 290], cue: 2,
  enter: { type: "draw" }, motion: { kind: "morph", toShape: "circle", at: 0, dur: 1.6 } },
{ type: "shape", id: "cannonball", shape: "circle", r: 6, fill: "#fff2c8", at: [620, 166], cue: 2,
  motion: { kind: "orbit", center: "earth2", radius: 124, turns: 2, at: 1.8, dur: 8 } },
```

**Riemann build + converging stat + ∫ equation** (`src/lessons/gcl/calculus.ts`):
```ts
{ type: "chart", id: "riemann4", chart: "riemann", cue: 1, at: "left",
  fn: "x*x", xDomain: [0, 2], n: 4, yDomain: [0, 4.2] },
{ type: "group", id: "buildRects", cue: 1, at: "right", layout: "stack", gap: 4,
  build: { step: 0.7 }, childEnter: { type: "fade", dur: 0.5 },
  children: [
    { type: "text", text: "rect 1 rises", role: "caption" },
    { type: "text", text: "rect 2 rises", role: "caption" },
  ] },
{ type: "equation", id: "intDef", tex: "\\int_0^2 x^2\\,dx", size: 34, align: "center", cue: 1,
  at: "center", enter: { type: "word" } },
```

**Cannon prop + muzzle sub-anchor + formula trajectory + timed exit** (`src/lessons/gcl/gravity.ts`) —
prefers `prop` (§0 rule 1) over hand-drawn geometry, and a `parametric` formula (§0 rule 2) over
literal trajectory points, anchored at the prop's own `.muzzle` sub-anchor (§0 rule 4):
```ts
{ type: "prop", id: "cannon2", name: "cannon", at: [600, 175], size: 1.1, angle: 0, cue: 0,
  enter: { type: "fade" }, exit: { type: "fade", out: 8.6, dur: 0.8 } },
// formula parabola anchored at the muzzle: u=0 is the muzzle itself, since fx(0)=fy(0)=0 and
// parametric points are offset by the resolved `at`.
{ type: "parametric", id: "shot1", at: "cannon2.muzzle", fx: "-140*u", fy: "-190*u + 430*u*u",
  uDomain: [0, 1], color: "#9db3a6", width: 2.2, cue: 1,
  enter: { type: "draw", dur: 1 }, exit: { type: "fade", out: 8.6, dur: 0.8 } },
```

**Map + flow + timeline eras/events** (`src/lessons/gcl/mongol.ts`):
```ts
{ type: "map", id: "map2", cue: 0, at: "center",
  features: [{ id: "border1260", rings: [BORDER_1260] }],
  markers: [{ lon: 102.5, lat: 47.2, label: "karakorum", icon: "pin" }],
  flows: [{ from: [102.5, 47.2], to: [44.4, 33.3], color: "#9a3b2e" }] },
{ type: "timeline", id: "tl1", from: 1206, to: 1368, cue: 1, at: "center",
  events: [{ at: 1260, label: "peak extent" }],
  eras: [{ from: 1260, to: 1368, label: "Pax Mongolica", color: "#3b6b9a" }],
  playhead: 1260 },
```

---

## 9. Practical tips (learned re-authoring the 4 lessons)

- **Avoid top-band collisions.** A `heading`/title-role `text` with no `at` auto-pins to the top band.
  If you also place an `equation`/`chart`/other component at the explicit `"top"` slot in the same
  scene, they will visually overlap. Give one of them an explicit different slot (e.g. `"top-left"`).
- **Don't target `.peak`/`.last`/`.barN` on a `function`-mode chart.** Only `bar`, `riemann`,
  `line`/`area`/`scatter`, and `pie` publish per-datum sub-anchors; `function` charts only publish
  `center` (there's no discrete data to index).
- **Seed everything with randomness** (`particles.seed`, `enter.seed` for dissolve/checkerboard) so a
  scene renders identically on every re-seek.
- **`legend` has no per-category color override.** It always assigns its own semantic palette; if you
  need the legend's colors to match hand-picked region/series colors, note the mismatch is currently
  unavoidable (see the coverage audit's known gaps).
- **Reach for the catalog before drawing.** If you're about to hand-write a multi-part `shape`/`vector`
  for something like a tree, cannon, apple, planet, arrow, or star — check `PROP_CATALOG` (§3, §0)
  first; a `prop` is one line and comes with sub-anchors for free.
- **`prop.angle` is degrees; `vector.rotate` is radians.** Easy to transpose — double-check which
  component you're rotating.
- **Don't over-`exit`.** Scenes clear automatically at scene boundaries (§5's "When to add `exit`");
  adding `exit` to every component "just in case" is unnecessary churn — only add it where leaving the
  element up within the same scene would look wrong.
