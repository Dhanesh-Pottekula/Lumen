<!--
  SINGLE-FILE LLM AUTHORING CONTEXT for Lumen Simple JSON v1.
  This file = Part I (how to generate) + Part II (the complete format reference, appended verbatim
  from SIMPLE-JSON-AUTHORING-GUIDE.md). Hand this whole file to the lesson-authoring model.
  Regenerate the cheat-sheet in §I.7 from `getSimpleJsonCapabilities()` if the schema changes.
-->

# Simple JSON — Complete LLM Authoring Context (v1)

You generate short, deterministic, animated teaching videos. You do this by writing **one Simple JSON
lesson object**. A compiler turns your JSON into low-level render instructions and then into a
seekable canvas film — you never write pixels, colors, timings, or drawing code. You describe
**educational intent** (objects, relationships, ordered actions) in semantic terms and the compiler
supplies every coordinate, color, font size, animation second, camera value, and physics constant.

This document has two parts:

- **Part I (below)** — how to generate: your task, the output contract, how your output is judged, how
  to plan, how to choose and draw visuals/SVGs, and a one-page cheat-sheet of every option.
- **Part II** — the complete field-by-field reference (every object, action, field, and default).
  Consult it for exact fields whenever Part I points you to a kind or action.

---

## I.1 Your task and output contract

Author one complete Lumen Simple JSON **version 1** lesson.

**Output exactly one JSON object and nothing else** — no Markdown, no code fences, no comments, no
prose, no JavaScript, no imports. The first character is `{` and the last is `}`.

Hard rules (these are enforced by the compiler; violating them fails the lesson):

1. **Obey the JSON Schema exactly.** Never invent fields, tokens, assets, anchors, icons, or SVG
   elements. Everything you use must appear in the capabilities/schema you are given.
2. **Strict JSON.** Double-quoted keys and strings, no trailing commas, no `undefined`, no comments.
3. **Stable unique IDs.** IDs match `^[a-z][a-z0-9-]*$` (lowercase, start with a letter). Every
   reference must resolve to an existing object, SVG part, asset anchor, chart anchor, map place, or
   timeline event.
4. **Declared ≠ visible.** An object listed in a scene starts hidden unless its `initial` is
   `"visible"` or a `show` action reveals it. You must `show` an object before you target it.
5. **Show and hide are lifecycle events.** Any temporary object or temporary SVG part that becomes
   visible **must** be hidden before the scene ends, or you get `TEMPORARY_VISUAL_PERSISTS`.
6. **Beats are sequential; actions inside one beat run in parallel.** Order teaching steps as beats;
   put things that should happen together in the same beat.
7. **Chart data by chart kind:** `bar`/`pie`/`donut` need `data`; `line`/`area`/`scatter` need
   `series`; `function`/`riemann` need `function`.
8. **Motion fields by motion kind:** `move`/`fall` need `to`; `orbit` needs `around`; `along` needs
   `along`; `spin` needs no destination. One motion per object per scene. The authored resting
   position **is** motion frame zero — put an orbiting object on its visible ring, and an along-path
   object at one endpoint.
9. **Screen-fixed content:** use `role: "hud"` for readouts, or `space: "screen"` for other
   camera-independent content. Everything else lives in world space and moves with the camera.
10. **Keep important objects in separate composition zones.** Use `anchor` placement for exact
    attachment, `relative` placement for labels. Never crowd several large objects into one zone.
11. **Prefer a named visual asset when one exists.** For custom diagrams use one `svg-artwork` whose
    root-level named `<g>` elements are meaningful, independently targetable parts (see §I.6).
12. **SVG uses only the supplied tags/attributes.** Put every drawn root child inside a named `<g>`.
    Avoid transforms on groups you will target; use explicit coordinates.
13. **Curves use the safe expression language, not JavaScript. Equations use only supplied math-text
    commands.**
14. **Attention and effects must communicate a teaching relationship.** Never add decorative
    particles, sparks, fire, confetti, or repeated glow.
15. **One scene teaches one claim.** Show the evidence first, then label or summarize it. Prefer
    visual change over sentences describing change.
16. **Keep text concise:** headings under 8 words, labels under 12 words, callout bodies under 18
    words.

---

## I.2 How your output is judged (so aim for zero-touch)

Your JSON is not sent straight to the renderer. It runs a quality gate:

```
request → visual plan → your Simple JSON draft
  → structural + semantic compilation  (must return valid:true)
  → diagnostic repair loop             (must return zero warnings)
  → deterministic keyframe render      (every review frame must render)
  → visual review                      (must be approved with no errors)
  → publish
```

A lesson is publishable only when **compilation returns zero errors and zero warnings**, every review
frame renders, and the visual reviewer approves. Write as if there is no repair pass: satisfy every
rule above the first time. The reviewer specifically checks that each frame visually proves its scene
claim; that moving objects are attached to their path/ring/target at the first and last motion frames;
that temporary guides disappear; that labels sit on the correct visible part without covering it; that
equations/units/chart values/motion are mutually consistent; and that nothing is clipped, inverted,
mis-scaled, overlapping unrelated content, or off-frame.

---

## I.3 Plan before you write

Before emitting JSON, plan the lesson so every scene teaches **exactly one claim through visible
evidence**. For each scene decide: the single claim; the visual evidence that proves it; what changes
over time; the labels; the facts (with units); and the source URLs (only URLs supplied in the
request — never invent citations). Then:

- Prefer diagrams, position, comparison, motion, charts, maps, and timelines over paragraphs.
- Use text only for titles, concise labels, equations, values, and conclusions you cannot read
  directly from the visual.
- One focal relationship per scene, plus at most two simultaneous supporting relationships.
- Distinguish permanent subject matter from temporary teaching marks (arrows, projections, traces,
  guides) — and clean the temporary ones up.
- Respect any complexity budget (max scenes, objects per scene, simultaneous visuals, words per
  frame). Count simultaneously visible focal/supporting visuals, not background layers.

---

## I.4 The lesson shape at a glance

```
lesson
└── scenes (played in order)
    ├── objects  (what CAN appear in the scene)
    └── beats    (what happens, in order)
        └── actions (show, move, label, camera, attention, effect, …)  ← parallel within a beat
```

Minimal complete lesson:

```json
{
  "version": "1",
  "title": "Area under a curve",
  "theme": "blueprint",
  "scenes": [
    {
      "composition": "equation-plot",
      "objects": [
        { "id": "title", "kind": "text", "text": "Area under a curve", "role": "hero",
          "placement": { "mode": "zone", "zone": "title" } },
        { "id": "curve", "kind": "curve", "function": "x^2", "domain": [0, 3],
          "placement": { "mode": "zone", "zone": "main" } }
      ],
      "beats": [
        { "actions": [ { "do": "show", "target": "title" } ] },
        { "actions": [ { "do": "show", "target": "curve", "pace": "slow" } ] }
      ]
    }
  ]
}
```

Top-level fields: `version` (always `"1"`), `title`, `theme` (see cheat-sheet), optional narration
metadata, and `scenes[]`. Each scene has a `composition` (a layout intent), `objects[]`, and `beats[]`.
Full field lists are in Part II §4–§5.

---

## I.5 Targets and references (how you point at things)

A **target** is a string naming an object or a meaningful point on it:

- `"cannon"` — the whole object.
- `"cannon.muzzle"` — a named part/anchor of it (asset anchors, SVG part ids, chart/map/timeline
  anchors). Generic anchors on any object: `center`, `top`, `bottom`, `left`, `right`.
- Chart example: `"plot.peak"`; map example: `"map.beijing"`; timeline example: `"tl.1206"`.

You may only target something that is currently shown. Part II §7 lists every anchor family; the
cheat-sheet lists each visual asset's anchors.

---

## I.6 Choosing and drawing a picture (visual / SVG decision guide)

This is the part most authors get wrong. There are four ways to put a drawn picture on screen. Pick in
this order:

**1. `visual` — a named premade asset (always prefer this when one fits).**
A reusable, semantically-anchored illustration. Tint with `color`, face it with `orientation`.
```json
{ "id": "cannon", "kind": "visual", "asset": "physics.cannon", "orientation": "right",
  "placement": { "mode": "zone", "zone": "main-left" } }
```
Its anchors (e.g. `cannon.muzzle`, `cannon.wheels`) are meaningful targets. The available assets and
their anchors are in the cheat-sheet (§I.7). Use this whenever a named asset represents your object.

**2. `svg-artwork` — one custom SVG (recommended for any custom multi-part diagram).**
Write one ordinary `<svg viewBox='…'>`. **Every root-level `<g id="…">` automatically becomes a
targetable part** named `object.groupId`:
```json
{ "id": "neuron", "kind": "svg-artwork", "size": "large",
  "placement": { "mode": "zone", "zone": "main" },
  "svg": "<svg viewBox='0 0 620 220'><g id='dendrites'><path d='…'/></g><g id='soma'><circle cx='165' cy='110' r='49'/></g><g id='axon'><path d='…'/></g></svg>" }
```
→ gives you `neuron.dendrites`, `neuron.soma`, `neuron.axon` as real targets. Rules:
- Root `viewBox` is required (four finite numbers, positive width/height). Every drawn element must
  sit inside a named root `<g>` — no bare root shapes, no unnamed root groups.
- **Do not put transforms on a group you will target**; use explicit coordinates, or the compiler
  can only infer a whole-viewBox box and targeting it raises `IMPRECISE_SVG_BOUNDS`.
- Disposable teaching layers (an arrow, a projected shot) go in `temporaryParts: ["shot-slow", …]`
  and **must** be hidden before the scene ends.
- Only the sanitized tag/attribute subset is allowed; only local `url(#id)` references; timing comes
  from beats, never native SVG animation. Limits: ≤ 48,000 chars, ≤ 220 elements. (Subset in §I.7.)

**3. `svg-composite` — advanced normalized artwork (only when you need exact per-part bounds).**
Parts share one `viewBox`; each part declares its own `bounds`, so parts can't drift and each is a
precise target. Use for multi-color/gradient/clipped artwork or when you need exact addressable bounds
the artwork can't infer. Set `temporary: true` on a part to auto-clean it. (Full fields: Part II §9.7.)

**4. `vector` — one raw path (custom stroke geometry).**
A single Path2D `d` string with `fill`/`stroke`/`strokeWidth`/`scale`/`rotate`. Use when you need one
piece of exact custom geometry, stroke **draw-on**, or **runtime recoloring** — things `svg-artwork`
does not do.

Quick chooser: named asset exists → **visual**; custom diagram with a few meaningful parts →
**svg-artwork**; needs exact bounds / gradients / clips / many independently-addressable parts →
**svg-composite**; one custom stroke that must draw on or recolor → **vector**.

---

## I.7 Complete option cheat-sheet (live values)

Every value below is generated from the compiler's `getSimpleJsonCapabilities()` — these are the only
legal tokens. Part II explains how each behaves.

| Category | Legal values |
|---|---|
| **Themes** | `textbook`, `parchment`, `blueprint`, `chalkboard` |
| **Compositions** | `hero`, `hero-diagram`, `equation`, `overview-detail`, `split`, `comparison`, `process`, `equation-plot`, `data`, `map`, `timeline`, `table`, `custom-relational` |
| **Object kinds** | `text`, `equation`, `stat`, `visual`, `vector`, `svg-artwork`, `svg-composite`, `line`, `shape`, `curve`, `chart`, `legend`, `map`, `timeline`, `table`, `group` |
| **Actions (`do`)** | `show`, `hide`, `camera`, `label`, `tour`, `motion`, `emphasize`, `attention`, `effect` |
| **Placement modes** | `zone`, `relative`, `anchor` |
| **Zones** | `title`, `main`, `main-left`, `main-right`, `support`, `footer`, `background`, `overlay`, `hud` |
| **Relative relations** | `above`, `below`, `left-of`, `right-of`, `near` |
| **Roles** | `background`, `support`, `primary`, `hero`, `annotation`, `hud` |
| **Sizes** | `tiny`, `small`, `medium`, `large`, `hero`, `fill` |
| **Initial state** | `hidden`, `visible` |
| **Spaces** | `world`, `screen` |
| **Paces** | `instant`, `quick`, `normal`, `slow`, `dramatic` |
| **Entrances** | `instant`, `fade`, `draw`, `wipe`, `iris`, `slam`, `word-by-word`, `typewriter`, `scramble` |
| **Exits** | `instant`, `fade`, `erase`, `wipe`, `iris`, `dissolve`, `slide`, `shrink` |
| **Camera shots** | `overview`, `wide`, `medium`, `close`, `detail` |
| **Camera movement** | `cut`, `move`, `push` |
| **Label styles** | `text`, `pill`, `rect`, `tag`, `bubble`, `badge` |
| **Motions** | `move`, `fall`, `orbit`, `along`, `spin` |
| **Emphasis** | `punch`, `shake`, `pulse`, `wiggle` |
| **Strength / intensity** | `subtle`, `normal`, `strong` |
| **Attention verbs** | `callout`, `highlight`, `spotlight`, `dim`, `pointer`, `box`, `brackets`, `encircle`, `converge`, `spark`, `vignette`, `rings` |
| **Particle presets** | `fire`, `smoke`, `sparks`, `rain`, `snow`, `dust`, `confetti`, `energy` |

**Visual assets** (`kind: "visual"`, `asset:` value → targetable anchors):

| Asset | Anchors |
|---|---|
| `biology.ion-channel` | center, top, bottom, left, right, pore |
| `biology.neuron.cell` | center, top, bottom, left, right, soma, dendriteTip1–4, axonRoot |
| `biology.neuron.full` | center, top, bottom, left, right, soma, dendriteTip1–4, axonRoot, axonEnd, terminalTop, terminalMiddle, terminalBottom |
| `nature.apple` | center, top, bottom, left, right, stem |
| `nature.tree` | center, top, bottom, left, right, trunk |
| `physics.cannon` | center, top, bottom, left, right, muzzle, breech, wheels |
| `physics.planet` | center, top, bottom, left, right, ring |
| `symbols.arrow` | center, top, bottom, left, right, tip, tail |
| `symbols.star` | center, top, bottom, left, right |

**Map icons** (`map` places): `arrow, check, cross, plus, minus, star, heart, circle, square, triangle,
gear, bolt, drop, sun, leaf, flame, factory, home, person, book, flask, atom, clock, pin, warning,
info, search, cloud, mountain, seed`.

**SVG subset** (for `svg-artwork` / `svg-composite`): limits ≤ 48,000 characters, ≤ 220 elements.
Tags: `svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient,
radialGradient, stop, clipPath, mask, title, desc`. Attributes: `xmlns, viewBox, preserveAspectRatio,
role, aria-label, id, d, x, y, x1, y1, x2, y2, cx, cy, r, rx, ry, width, height, points, fill, stroke,
stroke-width, stroke-linecap, stroke-linejoin, stroke-miterlimit, opacity, fill-opacity, stroke-opacity,
transform, gradientUnits, gradientTransform, offset, stop-color, stop-opacity, clip-path, mask,
fill-rule, clip-rule`. Public parts = root-level `<g id="…">`. Only local `url(#id)` refs; no scripts,
handlers, external resources, `foreignObject`, `style` attributes, or nested `<svg>`.

**Math:** curve/plot expressions use the safe expression language (Part II §10 — variables, operators,
constants, functions), not JavaScript. Equation text uses only the supplied math-text commands (66 of
them; e.g. `\frac`, `\sqrt`, `\sum`, `\int`, Greek letters — full list in the capabilities payload).

---

## I.8 Common mistakes to avoid (maps to compiler diagnostics)

- Targeting an object you never `show`ed, or before its show beat → reference / lifecycle error.
- A temporary object or `temporaryParts`/`temporary` SVG part left visible at scene end →
  `TEMPORARY_VISUAL_PERSISTS`. Add the `hide`.
- Orbit/along motion whose authored resting position isn't already on the ring/path (frame zero must
  match the geometry) → motion-continuity warning.
- Transformed or unmeasurable SVG group used as a target → `IMPRECISE_SVG_BOUNDS`. Use explicit
  coordinates or an `svg-composite` part with exact `bounds`.
- Crowding several large objects into one zone, or overlong text → overflow / collision warnings.
  Re-zone, shorten, resize, or re-time reveals.
- Inventing a field, token, asset, anchor, icon, chart kind, or SVG tag not in the cheat-sheet →
  schema error. If it isn't listed, it doesn't exist.
- Decorative particles/glow/camera motion that don't encode the subject → visual-review rejection.

When a diagnostic comes back: fix it at its JSON path; never delete an educationally necessary visual
to silence a reference error, and never shrink the whole scene to solve overflow — repair the specific
cause.

---

# Part II — Complete field-by-field format reference

Everything below is the authoritative reference for every top-level field, scene field, placement
mode, target/anchor family, object kind, action, and the math expression language, with worked
examples. When Part I told you to "see Part II §N," this is where to look.

## 1. The mental model

A lesson is organized like this:

```text
lesson
└── scenes (played in order)
    ├── objects (what can appear in that scene)
    └── beats (what happens, in order)
        └── actions (show, move, label, camera, and so on)
```

- An **object** is content: a title, equation, cannon, curve, chart, line, map, timeline, or table.
- A **placement** says where an object belongs without asking for pixel coordinates.
- A **beat** is one step in the explanation.
- An **action** says what happens during a beat.
- A **target** names an object or a meaningful point on an object.
- The **compiler** converts this description into deterministic GCL and then into a seekable canvas film.

Simple JSON deliberately does not expose hard-coded colors, x/y positions, font sizes, animation seconds, zoom values, particle counts, or physics constants. Those values come from semantic choices such as `theme`, `composition`, `zone`, `role`, `size`, `pace`, and `shot`.

---

## 2. Minimal complete lesson

This is the smallest useful generative lesson:

```json
{
  "version": "1",
  "title": "A First Lesson",
  "theme": "textbook",
  "scenes": [
    {
      "id": "opening",
      "composition": "hero",
      "objects": [
        {
          "id": "title",
          "kind": "text",
          "text": "HELLO, SIMPLE JSON",
          "textRole": "heading",
          "placement": { "mode": "zone", "zone": "title" }
        }
      ],
      "beats": [
        {
          "id": "reveal",
          "pace": "normal",
          "actions": [
            { "do": "show", "targets": ["title"], "entrance": "fade" }
          ]
        }
      ]
    }
  ]
}
```

What happens:

1. The `hero` composition selects a layout template.
2. The title is assigned to the `title` zone.
3. Its exact position, font size, color, and layer are derived automatically.
4. The first beat fades it in at the `normal` pace.

---

## 3. Non-negotiable rules

These rules prevent most authoring errors.

### 3.1 Use strict JSON

Use double quotes around keys and strings. Do not use comments, trailing commas, JavaScript expressions, `undefined`, or TypeScript syntax.

### 3.2 Unknown fields are errors

The schema is strict. A misspelled field such as `placment`, or an invented field such as `color`, is rejected instead of silently ignored.

### 3.3 IDs have a restricted form

Scene, object, and beat IDs must:

- begin with a letter;
- contain only letters, numbers, `_`, or `-`;
- match `^[A-Za-z][A-Za-z0-9_-]*$`.

Examples:

```json
[
  "title",
  "curve-1",
  "step_2",
  "EarthOrbit"
]
```

`1-title`, `curve point`, and `earth.orbit` are not valid IDs. Dots are reserved for anchor references such as `cannon.muzzle`.

Scene IDs must be unique across the lesson. Object IDs and beat IDs must be unique within their scene.

### 3.4 Declared does not mean visible

An object is rendered only when either:

- it has `"initial": "visible"`; or
- a `show` action introduces it.

If neither is true, the object exists for validation and layout but is omitted from the rendered film.

### 3.5 Show before targeting

Labels, camera actions, attention effects, motion references, and effects should target an object only after it is visible. Targeting an object before it becomes visible produces a warning; targeting an object that never becomes visible is an error.

### 3.6 Show and hide are lifecycle events

Within one scene:

- an initially visible object must not be shown again;
- an object may be shown at most once;
- an object may be hidden at most once;
- an object cannot be hidden before it is shown.

### 3.7 Beats are sequential; actions inside a beat are parallel

Beats run in array order. All actions inside the same beat start together. Put actions in separate beats when one must finish before the next begins.

---

## 4. Top-level generative lesson fields

```json
{
  "version": "1",
  "title": "Lesson title",
  "theme": "blueprint",
  "scenes": [
    {
      "id": "opening",
      "composition": "hero",
      "objects": [
        {
          "id": "title",
          "kind": "text",
          "text": "Lesson title",
          "textRole": "heading",
          "initial": "visible"
        }
      ],
      "beats": [
        {
          "id": "hold",
          "pace": "instant",
          "actions": [
            {
              "do": "emphasize",
              "target": "title",
              "emphasis": "pulse",
              "strength": "subtle"
            }
          ]
        }
      ]
    }
  ]
}
```

| Field | Required | Type | Allowed values / rule | Meaning |
|---|---:|---|---|---|
| `version` | yes | string | exactly `"1"` | Simple JSON schema version. |
| `title` | yes | string | non-empty | Human-facing lesson title. |
| `theme` | yes | string | `textbook`, `parchment`, `blueprint`, `chalkboard` | Art direction for the whole lesson. |
| `scenes` | yes | array | at least one scene | Ordered film sections. |

No other top-level fields are accepted in generative mode.

### 4.1 Themes

| Theme | Visual character | Good uses |
|---|---|---|
| `textbook` | Clean dark canvas, light ink, teal accent | General education, biology, modern explainers |
| `parchment` | Warm paper, serif type, ink-like roughness | History, maps, classical subjects |
| `blueprint` | Blue technical grid, crisp cyan lines | Physics, engineering, geometry |
| `chalkboard` | Dark slate, chalk texture, warm accent | Mathematics, classroom explanations |

The theme supplies semantic colors. Authors choose roles and categories, not hex values.

---

## 5. Scene fields

```json
{
  "id": "curve-question",
  "composition": "equation-plot",
  "objects": [],
  "beats": []
}
```

| Field | Required | Type | Rule | Meaning |
|---|---:|---|---|---|
| `id` | yes | string | valid ID | Unique scene name. |
| `composition` | yes | string | one composition token | Layout strategy for the scene. |
| `objects` | yes | array | at least one object | Content available in this scene. |
| `beats` | yes | array | at least one beat | Ordered animation and explanation steps. |

Scenes play in the order listed. A scene's duration is calculated from its beats; authors do not enter seconds.

### 5.1 Compositions

All compositions provide the same named zones, but move their centers to suit the content pattern.

| Composition | Intended structure |
|---|---|
| `hero` | One dominant central idea or object |
| `hero-diagram` | One large diagram with a title and supporting labels |
| `equation` | A formula-led scene |
| `overview-detail` | Broad subject on one side, detailed explanation on the other |
| `split` | Two balanced sides |
| `comparison` | Side-by-side contrast |
| `process` | A sequence or transformation |
| `equation-plot` | Plot on the left, equation or explanation on the right |
| `data` | Charts, statistics, and legends |
| `map` | Geographic content and supporting facts |
| `timeline` | Time axis, events, and eras |
| `table` | Tabular content |
| `custom-relational` | Objects connected by lines and relationships |

Composition is not a content restriction. A `chart` can appear in `split`, for example. It changes the default layout geometry.

---

## 6. Placement: modes and zones

Placement is semantic. It answers “where should this object go relative to the scene or another object?”

There are exactly three placement modes.

### 6.1 `zone`

```json
{
  "mode": "zone",
  "zone": "main-left"
}
```

Use one of the composition's predefined regions. `mode` selects the placement strategy; `zone` names the region within that strategy.

| Zone | Meaning |
|---|---|
| `title` | Top heading region |
| `main` | Primary subject region |
| `main-left` | Left half's primary region |
| `main-right` | Right half's primary region |
| `support` | Supporting explanation or secondary content |
| `footer` | Bottom caption / conclusion region |
| `background` | Behind the main content |
| `overlay` | Annotation over the scene |
| `hud` | Screen-fixed status or readout region, normally upper-right |

Objects assigned to the same zone are automatically stacked downward with spacing. A zone is currently a center point followed by automatic stacking, not a collision-proof bounding rectangle. Do not put many large objects in one zone; use multiple zones or relative placement.

Layout budget for the 920×430 safe frame:

| Region | Recommended budget | Authoring guidance |
|---|---:|---|
| `title` | up to 800×58 | One heading, normally under eight words. |
| `main` | up to 700×280 | One primary diagram, map, chart, table, or SVG. |
| `main-left` / `main-right` | about 360×260 each | Use for a real comparison or cause/effect pair. |
| `support` / `footer` | up to 700×60 | A concise label, conclusion, or small timeline—not a paragraph. |
| `hud` | about 180×90 | One compact screen-fixed stat or legend. |

These are authoring budgets, not clipping rectangles. Final boxes are computed from object kind and semantic size. General overflow and simultaneous-visibility collision diagnostics are authoritative; change placement, text, size, or reveal timing until the lesson has zero warnings.

### 6.2 `relative`

```json
{
  "mode": "relative",
  "target": "formula",
  "relation": "below"
}
```

Place an object relative to another object or one of its anchors.

| Field | Required | Options | Meaning |
|---|---:|---|---|
| `mode` | yes | exactly `relative` | Select relative placement. |
| `target` | yes | object ID or anchor target | Reference object / point. |
| `relation` | yes | `above`, `below`, `left-of`, `right-of`, `near` | Direction from the target. |

The compiler adds spacing automatically. The target may be declared before or after the placed object; forward references are supported. Circular placement dependencies are rejected.

### 6.3 `anchor`

```json
{
  "mode": "anchor",
  "target": "cannon.muzzle"
}
```

Place the object's center exactly on an object or anchor target. This is useful for attaching an apple to a tree branch, placing an arrow at a cannon's muzzle, or aligning a marker with a chart point.

| Field | Required | Meaning |
|---|---:|---|
| `mode` | yes | exactly `anchor` |
| `target` | yes | object ID or anchor target |

### 6.4 Automatic placement when `placement` is omitted

The compiler chooses a zone using these rules, in order:

1. `role: "background"` → `background`
2. `role: "support"` → `support`
3. `role: "annotation"` → `overlay`
4. `role: "hud"` or `space: "screen"` → `hud`
5. heading/title text → `title`
6. everything else → `main`

Explicit placement is recommended when a scene contains more than one or two objects.

---

## 7. Targets and anchors

A target is a string in one of two forms:

```json
[
  "cannon",
  "cannon.muzzle"
]
```

- `cannon` targets the whole object, usually its center.
- `cannon.muzzle` targets a named anchor on that object.

### 7.1 Generic anchors

Every object supports:

```json
[
  "center",
  "top",
  "bottom",
  "left",
  "right"
]
```

For an object named `formula`, use `formula.center`, `formula.top`, and so on.

### 7.2 Visual asset anchors

| Asset | Specific anchors in addition to the generic anchors |
|---|---|
| `physics.cannon` | `muzzle`, `breech`, `wheels` |
| `nature.tree` | `top`, `trunk` |
| `nature.apple` | `stem` |
| `physics.planet` | `ring` |
| `symbols.arrow` | `tip`, `tail` |
| `symbols.star` | none beyond `center` |
| `biology.neuron.cell` | `soma`, `dendriteTip1`, `dendriteTip2`, `dendriteTip3`, `dendriteTip4`, `axonRoot` |
| `biology.neuron.full` | all cell anchors plus `axonEnd`, `terminalTop`, `terminalMiddle`, `terminalBottom` |
| `biology.ion-channel` | `pore`, `top`, `bottom` |

All currently available asset names are:

```json
[
  "biology.ion-channel",
  "biology.neuron.cell",
  "biology.neuron.full",
  "nature.apple",
  "nature.tree",
  "physics.cannon",
  "physics.planet",
  "symbols.arrow",
  "symbols.star"
]
```

### 7.3 Chart anchors

Every chart has the generic anchors plus:

- `first`, `last`, and `peak`;
- `bar0`, `bar1`, ... for `bar` and `riemann` charts;
- `slice0`, `slice1`, ... for `pie` and `donut` charts;
- `pt0`, `pt1`, ... for other chart types.

Riemann anchor counts follow the rectangle choice: `few` = 4, `several` = 8, `many` = 16, `dense` = 32.

### 7.4 Map anchors

A map can be targeted by:

- feature `id` values;
- place `name` values;
- marker `label` values;
- generic anchors.

For a map object named `world`, a feature with ID `india` is referenced as `world.india` in Simple JSON.

### 7.5 Timeline anchors

Timeline events are `ev0`, `ev1`, ... in their array order, plus the generic anchors.

---

## 8. Shared fields on every object

Every object has `id` and `kind`. The following fields are shared and optional.

```json
{
  "id": "subject",
  "kind": "visual",
  "asset": "physics.planet",
  "role": "hero",
  "placement": { "mode": "zone", "zone": "main" },
  "size": "large",
  "initial": "hidden",
  "space": "world",
  "temporary": false
}
```

| Field | Required | Options | Default / meaning |
|---|---:|---|---|
| `id` | yes | valid ID | Unique within the scene. |
| `kind` | yes | one object kind | Selects the object's fields and renderer. |
| `role` | no | `background`, `support`, `primary`, `hero`, `annotation`, `hud` | Defaults to `primary`; controls semantic color, layer, and sometimes placement/size. `hud` is screen-fixed. |
| `placement` | no | a placement object | Derived from role/kind when omitted. |
| `size` | no | `tiny`, `small`, `medium`, `large`, `hero`, `fill` | Semantic scale; derived when omitted. |
| `initial` | no | `hidden`, `visible` | Omitted behaves as hidden unless a `show` action exists. |
| `space` | no | `world`, `screen` | `world` follows camera; `screen` stays fixed. `role: "hud"` implies the same fixed behavior. |
| `temporary` | no | boolean | When `true`, validation requires a later `hide`; use it for projections, guides, arrows, and other teaching marks. |

### 8.1 Roles

| Role | Color behavior | Drawing layer | Typical use |
|---|---|---|---|
| `background` | muted | background | scenery, context |
| `support` | muted | middle | secondary explanation |
| `primary` | accent | middle | normal focal content |
| `hero` | accent | foreground | dominant subject |
| `annotation` | ink | annotation | explanatory marks and labels |
| `hud` | ink | annotation | screen-fixed readout |

### 8.2 Automatic size defaults

- `role: "hero"` → `hero`
- `role: "support"` or `role: "annotation"` → `small`
- heading/title text → `large`
- line → `small`
- everything else → `medium`

Use semantic sizes to communicate hierarchy. Do not think of them as fixed pixels: their numeric scale depends on the object kind.

---

## 9. Object catalogue

There are 16 object kinds. For finished artwork, an LLM should normally use `visual` to select audited
premade artwork, `vector` for one raw Path2D geometry layer, or `svg-artwork` for one conventional SVG
whose root-level named groups become independently targetable parts. `svg-composite` remains the
advanced normalized form. Internal GCL `prop` and direct single-image `svg` components are not Simple
JSON object kinds.

### 9.1 `text`

```json
{
  "id": "title",
  "kind": "text",
  "text": "THE AREA UNDER A CURVE",
  "textRole": "heading",
  "placement": { "mode": "zone", "zone": "title" }
}
```

| Field | Required | Options / type | Meaning |
|---|---:|---|---|
| `text` | yes | non-empty string | Text to display. |
| `textRole` | no | `heading`, `title`, `body`, `bullet`, `caption` | Typography and semantic hierarchy. |

`heading` uses the dedicated heading renderer. `title` is prominent text. `body`, `bullet`, and `caption` use normal text rendering with their semantic role.

### 9.2 `equation`

```json
{
  "id": "formula",
  "kind": "equation",
  "value": "f(x)=x^2",
  "placement": { "mode": "zone", "zone": "main-right" }
}
```

| Field | Required | Type | Meaning |
|---|---:|---|---|
| `value` | yes | non-empty string | Math-text expression to typeset. |

The equation renderer is a deterministic math-text subset, not full LaTeX. Plain characters,
balanced `{...}` groups, superscript `^`, and subscript `_` are supported. Commands are limited to:

- Greek: `\alpha`, `\beta`, `\gamma`, `\delta`, `\Delta`, `\epsilon`, `\zeta`, `\eta`, `\theta`, `\Theta`, `\lambda`, `\mu`, `\nu`, `\xi`, `\pi`, `\Pi`, `\rho`, `\sigma`, `\Sigma`, `\tau`, `\phi`, `\Phi`, `\chi`, `\psi`, `\omega`, `\Omega`;
- arithmetic/relations: `\times`, `\cdot`, `\div`, `\pm`, `\mp`, `\leq`, `\geq`, `\neq`, `\approx`, `\equiv`, `\propto`, `\in`, `\forall`, `\exists`, `\angle`, `\perp`, `\cup`, `\cap`;
- arrows/calculus: `\to`, `\rightarrow`, `\Rightarrow`, `\leftarrow`, `\leftrightarrow`, `\infty`, `\partial`, `\nabla`, `\int`, `\sum`, `\prod`, `\lim`, `\ln`;
- structure/text: `\frac{...}{...}`, `\sqrt{...}`, `\text{...}`, `\cdots`, `\ldots`, `\deg` and the spacing commands `\,`, `\;`, `\ `.

Unsupported commands or unbalanced groups produce `UNSUPPORTED_MATH_COMMAND` before rendering.

### 9.3 `stat`

```json
{
  "id": "speed",
  "kind": "stat",
  "from": 0,
  "value": 29.8,
  "unit": "km/s",
  "label": "Earth's orbital speed",
  "decimals": 1,
  "commas": false,
  "prefix": "",
  "placement": { "mode": "zone", "zone": "support" }
}
```

| Field | Required | Type / limits | Meaning |
|---|---:|---|---|
| `value` | yes | number | Final displayed value. |
| `from` | no | number | Starting value for the count animation. |
| `unit` | no | string | Suffix/unit such as `km/s` or `%`. |
| `label` | no | string | Descriptive caption. |
| `decimals` | no | integer `0`–`8` | Decimal places. |
| `commas` | no | boolean | Add thousands separators. |
| `prefix` | no | string | Text before the value, such as `$`. |

### 9.4 `visual`

```json
{
  "id": "cannon",
  "kind": "visual",
  "asset": "physics.cannon",
  "color": "#5cc8ae",
  "orientation": "left",
  "role": "hero",
  "placement": { "mode": "zone", "zone": "main-left" }
}
```

| Field | Required | Options | Meaning |
|---|---:|---|---|
| `asset` | yes | one registered asset name | Reusable semantic illustration. |
| `color` | no | non-empty CSS color string | Overrides the asset's primary tint when the asset supports tinting. |
| `orientation` | no | `left`, `right`, `up`, `down` | Desired facing direction, relative to the artwork's authored facing. Omit it to keep the authored direction. |

One visual may be internally composed from many paths, but it remains one selectable object. Available
assets and their attachment points are listed in section 7.2.

### 9.5 `vector`

```json
{
  "id": "custom-neuron",
  "kind": "vector",
  "d": "M-60 0 C-83-32-101-43-126-53 M-32 0 C5-4 48 5 98 0",
  "stroke": "#7fb7c8",
  "strokeWidth": 3,
  "width": 200,
  "height": 129,
  "scale": 0.65,
  "rotate": 0,
  "placement": { "mode": "zone", "zone": "main-left" }
}
```

| Field | Required | Options / limits | Meaning |
|---|---:|---|---|
| `d` | yes | non-empty Path2D path string | Raw custom geometry. |
| `fill` | no | non-empty CSS color string | Interior color. |
| `stroke` | no | non-empty CSS color string | Outline color. |
| `strokeWidth` | no | number greater than `0`, at most `20` | Outline width. |
| `width` | no | number greater than `0`, at most `920` | Layout and targeting width. |
| `height` | no | number greater than `0`, at most `430` | Layout and targeting height. |
| `scale` | no | number greater than `0`, at most `10` | Drawing scale. |
| `rotate` | no | radians from `-6.284` to `6.284` | Drawing rotation. |

Use `vector` when the JSON author needs exact custom geometry. Use `visual` when a named premade
asset already represents the object and its semantic attachment points matter.

### 9.6 `svg-artwork` — recommended for LLM-authored SVG

```json
{
  "id": "neuron",
  "kind": "svg-artwork",
  "size": "large",
  "placement": { "mode": "zone", "zone": "main" },
  "svg": "<svg viewBox='0 0 620 220'><g id='dendrites'><path d='...' /></g><g id='soma'><circle cx='165' cy='110' r='49' /></g><g id='axon'><path d='...' /></g></svg>"
}
```

| Field | Required | Options / limits | Meaning |
|---|---:|---|---|
| `svg` | yes | one sanitized root `<svg>`, at most 48,000 characters | Complete conventional SVG artwork. |
| root `viewBox` | yes | four finite numbers with positive width/height | Internal drawing coordinates and aspect ratio. |
| root-level `<g id="…">` | yes | at least one; valid unique IDs | Paint layers and public target names. |
| `size` | no | normal semantic size token | Display size; the compiler preserves the viewBox ratio. |

The LLM writes one ordinary SVG. Every root-level named group becomes a part automatically:

```text
<g id="soma">…</g>  →  neuron.soma
<g id="axon">…</g>  →  neuron.axon
```

Shared `<defs>` may stay once at the root; the compiler copies them into each generated layer. Paint
order follows the order of the named groups. The compiler derives display width and height from
`size` and infers focused bounds for ordinary SVG geometry and absolute or relative
`M/L/H/V/C/S/Q/T/A/Z` path commands. Curve and arc bounds are conservative envelopes. Transformed or
otherwise unmeasurable groups fall back to the complete viewBox. Authors do not provide `parts`,
`bounds`, `width`, or `height`.

SVG scripts, handlers, external references, style attributes, nested SVG roots, unnamed root groups,
and root-level drawing elements outside a named group are rejected. Timing remains controlled by
beats, not by native SVG animation.

Exact SVG capability subset (matching `getSimpleJsonCapabilities()`):

- tags: `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `title`, `desc`;
- attributes: `xmlns`, `viewBox`, `preserveAspectRatio`, `role`, `aria-label`, `id`, `d`, `x`, `y`, `x1`, `y1`, `x2`, `y2`, `cx`, `cy`, `r`, `rx`, `ry`, `width`, `height`, `points`, `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `opacity`, `fill-opacity`, `stroke-opacity`, `transform`, `gradientUnits`, `gradientTransform`, `offset`, `stop-color`, `stop-opacity`, `clip-path`, `mask`, `fill-rule`, `clip-rule`;
- limits: at most 48,000 markup characters and 220 elements.

Names are matched case-insensitively by the sanitizer. Only local paint references such as
`url(#gradient-id)` are allowed.

### 9.7 `svg-composite` — advanced normalized form

```json
{
  "id": "neuron",
  "kind": "svg-composite",
  "viewBox": [0, 0, 620, 220],
  "width": 620,
  "height": 220,
  "placement": { "mode": "zone", "zone": "main" },
  "parts": [
    {
      "id": "soma",
      "bounds": [111, 56, 108, 108],
      "svg": "<circle cx='165' cy='110' r='49' fill='#5cc8ae' />"
    },
    {
      "id": "axon",
      "bounds": [204, 55, 408, 112],
      "svg": "<path d='M205 110 L607 110' stroke='#cfe0e6' stroke-width='6' />"
    }
  ]
}
```

| Field | Required | Options / limits | Meaning |
|---|---:|---|---|
| `viewBox` | yes | `[x, y, width, height]`; positive width/height | Shared coordinate system for every part. |
| `width` | yes | number greater than `0`, at most `920` | Final composite layout width. |
| `height` | yes | number greater than `0`, at most `430` | Final composite layout height. |
| `parts` | yes | `1`–`32` part objects | Ordered paint layers. Later parts paint above earlier parts. |
| `parts[].id` | yes | valid ID, unique inside the composite | Creates target `<composite>.<part>`. |
| `parts[].svg` | yes | sanitized SVG element markup | One or more SVG elements. Do not include a root `<svg>` element. |
| `parts[].bounds` | yes | `[x, y, width, height]` inside `viewBox` | Padded crop and accurate target box for this part. |
| `parts[].initial` | no | `hidden`, `visible` | Overrides the composite's initial visibility for this part. |

All parts use the same coordinate system, so they cannot drift when composed. The compiler wraps each
fragment in its own SVG using the part bounds, places it at the matching location in the parent box,
and exposes it as a real target. `neuron.soma`, `neuron.axon`, and `neuron.axon.center` are therefore
valid targets. Showing or hiding `neuron` applies to every part; showing `neuron.soma` affects only the
soma.

For conventional `svg-artwork`, declare disposable teaching layers once on the artwork:

```json
{
  "id": "cannon-art",
  "kind": "svg-artwork",
  "temporaryParts": ["shot-slow", "shot-fast"],
  "svg": "<svg viewBox='0 0 760 270'>...</svg>"
}
```

Every named part in `temporaryParts` that becomes visible must later appear in a `hide` action. The
validator returns `TEMPORARY_VISUAL_PERSISTS` when an LLM forgets the cleanup. For `svg-composite`, set
`temporary: true` directly on a part. For standalone objects, set `temporary: true` on the object.

SVG scripts, event handlers, external resources, remote `url(...)` values, `foreignObject`, style
attributes, XML entities, and unsupported SVG elements/attributes are rejected. Timing must come from
beats, not native SVG animation. Use `vector` when stroke draw-on or runtime recoloring matters; use
`svg-composite` for multi-color, gradient, clipped, or independently addressable authored artwork.

Named SVG-part bounds are also used for anchors, labels, attention, and motion. The parser records
whether each inferred box is exact, conservative, or a whole-viewBox fallback. A fallback is allowed
for paint-only decoration, but targeting or spatially placing that part produces
`IMPRECISE_SVG_BOUNDS`. Remove the transform/special geometry, wrap a simpler target group around the
part, or declare an explicit `svg-composite` part with accurate `bounds`.

### 9.8 `line`

```json
{
  "id": "trajectory",
  "kind": "line",
  "from": "cannon.muzzle",
  "to": "target.center",
  "form": "arrow",
  "role": "annotation"
}
```

| Field | Required | Options | Meaning |
|---|---:|---|---|
| `from` | yes | target string | Start anchor. |
| `to` | yes | target string | End anchor. |
| `form` | no | `straight`, `elbow`, `curved`, `arrow`, `traced` | Path style. |

The endpoints are resolved after all objects are placed. `arrow` adds an arrowhead. `elbow` makes an orthogonal connector. `curved` and `traced` use a curved path. A line's default entrance is `draw` when shown.

### 9.9 `shape`

```json
{
  "id": "orbit",
  "kind": "shape",
  "shape": "circle",
  "appearance": "outline",
  "size": "large",
  "placement": { "mode": "zone", "zone": "main" }
}
```

| Field | Required | Options / limits | Meaning |
|---|---:|---|---|
| `shape` | yes | `circle`, `polygon`, `star`, `heart`, `disc` | Geometry. |
| `sides` | no | integer `3`–`12` | Number of sides for a polygon. |
| `appearance` | no | `solid`, `outline`, `shaded` | Fill treatment. |

`disc` is shaded and receives a highlight by default.

### 9.10 `curve`

```json
{
  "id": "parabola",
  "kind": "curve",
  "x": "u",
  "y": "u^2",
  "domain": [0, 2],
  "appearance": "solid",
  "placement": { "mode": "zone", "zone": "main-left" }
}
```

| Field | Required | Options / type | Meaning |
|---|---:|---|---|
| `x` | yes | expression string | Parametric x expression, normally using `u`. |
| `y` | yes | expression string | Parametric y expression, normally using `u`. |
| `domain` | no | exactly two numbers | Range of `u`. |
| `appearance` | no | `solid`, `dashed` | Stroke treatment. |

Use `curve` for free parametric geometry. Use a `chart` with `chart: "function"` when axes, domains, or data-point anchors are important.

### 9.11 `chart`

```json
{
  "id": "curve",
  "kind": "chart",
  "chart": "function",
  "function": "x^2",
  "xDomain": [0, 2],
  "yDomain": [0, 4.2],
  "axes": true,
  "xLabel": "x",
  "yLabel": "f(x)",
  "size": "large",
  "placement": { "mode": "zone", "zone": "main-left" }
}
```

| Field | Required | Options / type | Meaning |
|---|---:|---|---|
| `chart` | yes | `bar`, `line`, `area`, `scatter`, `pie`, `donut`, `function`, `riemann` | Chart renderer. |
| `data` | yes for `bar`/`pie`/`donut` | non-empty category-data array | Bar/pie/donut-style values. Forbidden on other chart variants. |
| `series` | yes for `line`/`area`/`scatter` | at least two `[x, y]` pairs | Sampled data. Forbidden on other chart variants. |
| `function` | yes for `function`/`riemann` | expression string | Equation in variable `x`. Forbidden on data/series variants. |
| `rectangles` | no | `few`, `several`, `many`, `dense` | Riemann rectangle density. |
| `xDomain` | no | exactly two numbers | Horizontal domain. |
| `yDomain` | no | exactly two numbers | Vertical domain. |
| `axes` | no | boolean | Whether to draw axes. |
| `xLabel` | no | string | Horizontal axis label. |
| `yLabel` | no | string | Vertical axis label. |

Category data has this form:

```json
{
  "label": "Oxygen",
  "value": 21,
  "category": "gas-oxygen"
}
```

| Datum field | Required | Meaning |
|---|---:|---|
| `label` | yes | Visible category label. |
| `value` | yes | Numeric value. |
| `category` | no | Stable semantic color key. Equal category strings receive consistent theme-derived colors. |

Recommended fields by chart type:

| Chart | Supply |
|---|---|
| `bar` | `data`; optional domains/axes/labels |
| `pie`, `donut` | `data` |
| `line`, `area`, `scatter` | `series`; optional domains/axes/labels |
| `function` | `function`; normally `xDomain`, `yDomain`, `axes`, labels |
| `riemann` | `function`; normally domains, `rectangles`, axes, labels |

The structural schema is a discriminated union keyed by `chart`. A chart with the wrong payload is rejected before layout or rendering. Domains must be strictly increasing, and expressions must parse and produce at least one finite value over the authored domain.

Rectangle counts are deterministic: `few` = 4, `several` = 8, `many` = 16, `dense` = 32. A `donut` is rendered as a pie with an automatic inner hole.

### 9.12 `legend`

```json
{
  "id": "legend",
  "kind": "legend",
  "categories": ["gas-oxygen", "gas-nitrogen"],
  "placement": { "mode": "zone", "zone": "support" }
}
```

| Field | Required | Rule | Meaning |
|---|---:|---|---|
| `categories` | yes | non-empty, unique strings | Semantic category keys and labels. |

Use the same category strings in charts, maps, timelines, and legends for consistent colors.

### 9.13 `map`

```json
{
  "id": "campaign-map",
  "kind": "map",
  "features": [
    {
      "id": "region-a",
      "category": "allied",
      "rings": [
        [[70, 20], [90, 35], [78, 55], [55, 42]]
      ]
    }
  ],
  "places": [
    { "name": "Capital", "lon": 74, "lat": 36 }
  ],
  "markers": [
    { "lon": 74, "lat": 36, "label": "Capital", "icon": "star", "category": "city" }
  ],
  "flows": [
    { "from": "Capital", "to": [90, 40], "category": "advance", "bend": "right", "pace": "slow" }
  ],
  "stagger": "quick",
  "placement": { "mode": "zone", "zone": "main" }
}
```

Map coordinates are geographic-like `[longitude, latitude]` pairs. Longitude must be from −180 to 180 and latitude from −90 to 90. A ring is an array of at least three coordinate pairs and must contain at least three distinct points.

| Field | Required | Type / options | Meaning |
|---|---:|---|---|
| `features` | yes | non-empty feature array | Filled geographic regions. |
| `markers` | no | marker array | Points with optional label/icon/category. |
| `places` | no | place array | Named coordinates that flows and targets can reference. |
| `flows` | no | flow array | Animated movement between named places or coordinate pairs. |
| `outline` | no | one ring | External boundary. |
| `growth` | no | at least two rings | Sequential boundary-growth frames. |
| `growthPace` | no | pace token | Speed of growth animation; defaults to `slow`. |
| `stagger` | no | pace token | Stagger feature entrances; default visual behavior is unstaggered unless supplied. |

A feature:

| Field | Required | Meaning |
|---|---:|---|
| `id` | yes | Valid ID and targetable map anchor. |
| `rings` | yes | One or more polygon rings. |
| `category` | no | Semantic color key. |

A marker:

| Field | Required | Meaning |
|---|---:|---|
| `lon` | yes | Horizontal geographic coordinate. |
| `lat` | yes | Vertical geographic coordinate. |
| `label` | no | Visible label and targetable anchor. |
| `icon` | no | One of `arrow`, `check`, `cross`, `plus`, `minus`, `star`, `heart`, `circle`, `square`, `triangle`, `gear`, `bolt`, `drop`, `sun`, `leaf`, `flame`, `factory`, `home`, `person`, `book`, `flask`, `atom`, `clock`, `pin`, `warning`, `info`, `search`, `cloud`, `mountain`, `seed`. |
| `category` | no | Semantic color key. |

A place:

| Field | Required | Meaning |
|---|---:|---|
| `name` | yes | Non-empty targetable place name. |
| `lon` | yes | Longitude-like coordinate. |
| `lat` | yes | Latitude-like coordinate. |

A flow:

| Field | Required | Options / type | Meaning |
|---|---:|---|---|
| `from` | yes | place name or `[lon, lat]` | Start. |
| `to` | yes | place name or `[lon, lat]` | Destination. |
| `category` | no | string | Semantic color key. |
| `bend` | no | `left`, `right`, `direct` | Arc direction. |
| `pace` | no | pace token | Flow animation speed; defaults to `normal`. |

### 9.14 `timeline`

```json
{
  "id": "history",
  "kind": "timeline",
  "from": 1200,
  "to": 1300,
  "events": [
    { "at": 1206, "label": "Unification", "side": "above" },
    { "at": 1271, "label": "New dynasty", "side": "below" }
  ],
  "eras": [
    { "from": 1206, "to": 1271, "label": "Expansion", "category": "empire" }
  ],
  "playhead": { "from": 1200, "to": 1300, "pace": "slow" },
  "placement": { "mode": "zone", "zone": "main" }
}
```

| Field | Required | Type / options | Meaning |
|---|---:|---|---|
| `from` | yes | number | Axis start. |
| `to` | yes | number | Axis end. |
| `events` | no | event array | Labeled points in time. |
| `eras` | no | era array | Labeled ranges. |
| `playhead` | no | number or animated object | Fixed or moving time cursor. |

An event requires `at` and `label`; `side` may be `above` or `below` and defaults visually to above.

An era requires `from`, `to`, and `label`; optional `category` controls its semantic color.

Playhead forms:

```json
[
  1271,
  { "from": 1200, "to": 1300, "pace": "dramatic" }
]
```

The first is fixed. The second animates from one value to another. Timeline events can be targeted as `history.ev0`, `history.ev1`, and so on.

### 9.15 `table`

```json
{
  "id": "comparison",
  "kind": "table",
  "header": true,
  "rows": [
    ["Property", "Earth", "Moon"],
    ["Gravity", "9.81 m/s²", "1.62 m/s²"],
    ["Atmosphere", "Yes", "Almost none"]
  ],
  "placement": { "mode": "zone", "zone": "main" }
}
```

| Field | Required | Type | Meaning |
|---|---:|---|---|
| `rows` | yes | non-empty array of non-empty string arrays | Table cells. |
| `header` | no | boolean | Treat the first row as a header. |

Keep row lengths consistent even though the structural schema does not require equal lengths.

### 9.16 `group`

```json
{
  "id": "three-ideas",
  "kind": "group",
  "layout": "row",
  "build": "quick",
  "clip": false,
  "children": [
    { "id": "one", "kind": "shape", "shape": "circle", "appearance": "solid" },
    { "id": "two", "kind": "shape", "shape": "star", "appearance": "solid" },
    { "id": "three", "kind": "shape", "shape": "heart", "appearance": "solid" }
  ],
  "placement": { "mode": "zone", "zone": "main" }
}
```

| Field | Required | Options / limits | Meaning |
|---|---:|---|---|
| `children` | yes | non-empty object array | Nested Simple JSON objects. |
| `layout` | no | `row`, `stack`, `grid` | Automatic child arrangement. |
| `columns` | no | integer `1`–`6` | Column count for grid-like layouts. |
| `build` | no | pace token | Stagger child entrances. Without it, children enter together. |
| `clip` | no | boolean | Clip children to the group bounds. |

Children use the same content schema, but their placement and visibility are controlled by the group. Child IDs must be unique inside the group. Do not put `placement`, `initial`, `space`, or `temporary` on a child; place and animate the group itself. Nested child data still receives the same chart, equation, timeline, map, and expression validation as top-level objects.

---

## 10. Mathematical expression language

`curve.x`, `curve.y`, and `chart.function` use a safe deterministic expression evaluator. They are not JavaScript.

### 10.1 Variables

- Use `x` in a function or Riemann chart.
- Use `u` in parametric curves.
- Other identifier names are accepted as variables, but an unset variable evaluates as `0`; use the expected variable to avoid mistakes.

### 10.2 Operators

```json
[
  "+",
  "-",
  "*",
  "/",
  "^"
]
```

`^` means exponentiation. Unary `-` and unary `+` are supported. Implicit multiplication is also supported, so `2x`, `2(x+1)`, and `(x+1)(x-1)` work, although explicit `*` is clearer for human readers.

### 10.3 Constants

```json
[
  "pi",
  "e"
]
```

### 10.4 Functions

```json
[
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "exp",
  "log",
  "ln",
  "sqrt",
  "abs",
  "floor",
  "ceil",
  "round",
  "sign",
  "min",
  "max",
  "pow"
]
```

`log` is base 10; `ln` is the natural logarithm. `min` and `max` accept multiple arguments; `pow(a,b)` is equivalent to `a^b`.

Examples:

```json
[
  "x^2",
  "sin(x)",
  "2*x + 3",
  "sqrt(abs(x))",
  "pow(x, 3) - 2*x",
  "2*pi*u"
]
```

An invalid expression does not crash the renderer; it evaluates to `NaN` and usually draws nothing. That graceful behavior can look like a missing object, so validate expressions carefully.

---

## 11. Beats and timing

A beat is one ordered step in a scene:

```json
{
  "id": "introduce",
  "pace": "normal",
  "actions": [
    { "do": "show", "targets": ["title", "diagram"], "entrance": "fade" },
    { "do": "camera", "target": "diagram", "shot": "wide", "movement": "move" }
  ]
}
```

| Field | Required | Options / rule | Meaning |
|---|---:|---|---|
| `id` | yes | valid ID, unique in scene | Beat name. |
| `pace` | no | `instant`, `quick`, `normal`, `slow`, `dramatic` | Semantic duration. Defaults to `normal`. |
| `actions` | yes | non-empty action array | Actions that start together. |

### 11.1 Pace meanings

| Pace | Intent | Internal overall duration | Internal transition | Internal hold |
|---|---|---:|---:|---:|
| `instant` | Immediate state change | 0.25 s | 0 s | 0.25 s |
| `quick` | Brisk supporting step | 1.2 s | 0.35 s | 0.5 s |
| `normal` | Standard explanatory step | 2.2 s | 0.6 s | 0.9 s |
| `slow` | Give the learner time to inspect | 3.4 s | 0.9 s | 1.5 s |
| `dramatic` | Major reveal or conclusion | 5.0 s | 1.2 s | 2.2 s |

The exact seconds are compiler defaults, not author-entered timing. Simple actions use the appropriate transition, duration, or hold portion automatically.

### 11.2 Parallel versus sequential example

Parallel—both objects reveal together:

```json
{
  "id": "parallel",
  "actions": [
    { "do": "show", "targets": ["earth"], "entrance": "iris" },
    { "do": "show", "targets": ["moon"], "entrance": "fade" }
  ]
}
```

Sequential—Earth appears first, then Moon:

```json
[
  {
    "id": "earth-first",
    "actions": [
      { "do": "show", "targets": ["earth"], "entrance": "iris" }
    ]
  },
  {
    "id": "moon-second",
    "actions": [
      { "do": "show", "targets": ["moon"], "entrance": "fade" }
    ]
  }
]
```

---

## 12. Action catalogue

There are 11 action forms.

### 12.1 `show`

```json
{
  "do": "show",
  "targets": ["title", "curve"],
  "entrance": "wipe"
}
```

| Field | Required | Options |
|---|---:|---|
| `do` | yes | exactly `show` |
| `targets` | yes | non-empty unique array of object IDs |
| `entrance` | no | `instant`, `fade`, `draw`, `wipe`, `iris`, `slam`, `word-by-word`, `typewriter`, `scramble` |

Targets must be whole object IDs, not anchors. Default entrance is `draw` for a line and `fade` for other objects.

Entrance guidance:

| Entrance | Best use |
|---|---|
| `instant` | Already-established context; no animation |
| `fade` | Calm general reveal |
| `draw` | Lines, curves, paths, diagrams |
| `wipe` | Structured chart or section reveal |
| `iris` | Focal object appearing from its center |
| `slam` | A short, important title or number |
| `word-by-word` | Sentence or phrase |
| `typewriter` | Label or technical text |
| `scramble` | Data/code-like reveal; use sparingly |

### 12.2 `hide`

```json
{
  "do": "hide",
  "targets": ["question"],
  "exit": "fade"
}
```

| Field | Required | Options |
|---|---:|---|
| `do` | yes | exactly `hide` |
| `targets` | yes | non-empty unique array of object IDs |
| `exit` | no | `instant`, `fade`, `erase`, `wipe`, `iris`, `dissolve`, `slide`, `shrink` |

Default exit is `fade`. Targets must be whole object IDs.

### 12.3 `camera`

```json
{
  "do": "camera",
  "target": "cannon.muzzle",
  "shot": "detail",
  "movement": "move"
}
```

| Field | Required | Options / default |
|---|---:|---|
| `do` | yes | exactly `camera` |
| `target` | yes | visible object or anchor target |
| `shot` | no | `overview`, `wide`, `medium`, `close`, `detail`; default `medium` |
| `movement` | no | `cut`, `move`, `push`; omitted compiles as a normal move |

Shot scale:

| Shot | Meaning | Internal zoom |
|---|---|---:|
| `overview` | Whole scene | 1.0× |
| `wide` | Object plus context | 1.18× |
| `medium` | Main object | 1.45× |
| `close` | A component or chart region | 1.9× |
| `detail` | A precise anchor | 2.5× |

`cut` changes framing immediately. `move` travels smoothly. `push` uses a push-in camera treatment.

### 12.4 `label`

```json
{
  "do": "label",
  "target": "neuron.soma",
  "title": "Cell body",
  "text": "Contains the nucleus",
  "style": "pill"
}
```

| Field | Required | Options / meaning |
|---|---:|---|
| `do` | yes | exactly `label` |
| `target` | yes | visible object or anchor target |
| `text` | yes | non-empty label body |
| `title` | no | non-empty heading |
| `style` | no | `text`, `pill`, `rect`, `tag`, `bubble`, `badge`; defaults to `pill` |

The compiler creates and positions the leader and label container automatically, then fades the temporary label out near the end of the beat.

### 12.5 `tour`

Use a tour to visit several labels with the camera one at a time.

```json
{
  "do": "tour",
  "labelMode": "one-at-a-time",
  "returnTo": "overview",
  "stops": [
    { "target": "neuron.soma", "label": "Cell body", "shot": "close" },
    { "target": "neuron.axonRoot", "label": "Axon begins here", "shot": "detail" }
  ]
}
```

| Field | Required | Options / default |
|---|---:|---|
| `do` | yes | exactly `tour` |
| `stops` | yes | non-empty stop array |
| `labelMode` | no | only `one-at-a-time` |
| `returnTo` | no | only `overview` |

Each stop requires `target` and `label`; optional `shot` accepts all shot tokens and defaults to `close`. For each stop the camera moves, the label holds, the label exits, and then the next stop begins. `returnTo: "overview"` adds a final move back to the complete scene.

### 12.6 `motion`

```json
{
  "do": "motion",
  "target": "projectile",
  "motion": "along",
  "along": "trajectory"
}
```

| Field | Required | Options / meaning |
|---|---:|---|
| `do` | yes | exactly `motion` |
| `target` | yes | object to animate |
| `motion` | yes | `move`, `fall`, `orbit`, `along`, `spin` |
| `to` | yes for `move`/`fall` | destination target |
| `around` | yes for `orbit` | orbit-center object or anchor target |
| `along` | yes for `along` | line object ID used as path |
| `orbit` | no | `small`, `medium`, `large`; default `medium` |
| `turns` | no | `half`, `one`, `two`, `many`; default `one` |
| `bounce` | no | `none`, `soft`, `strong`; default `none` |
| `direction` | no | `clockwise`, `counterclockwise`; default `clockwise` |

Motion-specific forms:

```json
[
  { "do": "motion", "target": "apple", "motion": "fall", "to": "ground", "bounce": "soft" },
  { "do": "motion", "target": "moon", "motion": "orbit", "around": "earth", "orbit": "large", "turns": "two", "direction": "counterclockwise" },
  { "do": "motion", "target": "projectile", "motion": "along", "along": "trajectory" },
  { "do": "motion", "target": "gear", "motion": "spin", "direction": "clockwise" },
  { "do": "motion", "target": "marker", "motion": "move", "to": "destination" }
]
```

For `orbit`, place the moving target at its intended starting point on the authored orbit. After layout
and SVG scaling, the compiler measures the resolved target-to-center distance and uses that as the
orbit radius. This guarantees that the first motion frame equals the resting frame and keeps a target
on a ring drawn in the same SVG coordinate system. `small` (70), `medium` (112), and `large` (156)
are deterministic fallback radii only when the target begins exactly at the center or its center
geometry cannot be resolved. Turns mean 0.5, 1, 2, or 4 revolutions.

For `along`, place the moving target at either endpoint of the line. The compiler automatically chooses
the nearer endpoint and reverses the path when needed. If neither endpoint matches, it adds a lead-in
segment to prevent a first-frame jump and returns a `MOTION_PATH_ADJUSTED` warning.

All scheduled motion is inert before its beat starts. Canonical validation rejects an orbit or
along-path motion whose first frame differs from the object's resolved resting position.

Fall uses automatic gravity and bounce strength.

Exactly one motion action may target an object in a scene. Multiple independent motion programs are ambiguous and are rejected with `MULTIPLE_MOTION`; split them across objects or scenes.

### 12.7 `emphasize`

```json
{
  "do": "emphasize",
  "target": "answer",
  "emphasis": "punch",
  "strength": "strong"
}
```

| Field | Required | Options / default |
|---|---:|---|
| `do` | yes | exactly `emphasize` |
| `target` | yes | visible object |
| `emphasis` | yes | `punch`, `shake`, `pulse`, `wiggle` |
| `strength` | no | `subtle`, `normal`, `strong`; default `normal` |

Repeated emphasis is supported. Every emphasis is scoped to its beat's start and duration, so a later pulse, shake, punch, or wiggle does not overwrite the earlier one and does not continue forever.

### 12.8 `attention`

```json
{
  "do": "attention",
  "target": "curve.peak",
  "verb": "callout",
  "title": "Maximum",
  "text": "The highest sampled point",
  "side": "east",
  "route": "elbow",
  "style": "pill"
}
```

| Field | Required | Options / meaning |
|---|---:|---|
| `do` | yes | exactly `attention` |
| `target` | yes | visible object or anchor |
| `verb` | yes | one attention verb |
| `from` | yes for `pointer`; otherwise optional | origin target for directional verbs |
| `text` | no | annotation body |
| `title` | no | annotation heading |
| `side` | no | `auto`, `north`, `south`, `east`, `west` |
| `route` | no | `auto`, `straight`, `elbow`, `curve` |
| `style` | no | `text`, `pill`, `rect`, `tag`, `bubble`, `badge` |

Attention verbs:

| Verb | Purpose |
|---|---|
| `callout` | Leader plus explanatory label |
| `highlight` | General highlight treatment |
| `spotlight` | Isolate a target with light |
| `dim` | De-emphasize around the target/context |
| `pointer` | Point from `from` toward target |
| `box` | Draw a focus box |
| `brackets` | Bracket the target |
| `encircle` | Draw a circle around it |
| `converge` | Animate focus inward |
| `spark` | Brief energetic accent |
| `vignette` | Darken around the target |
| `rings` | Animated focus rings |

Use `label` for a simple temporary label. Use `attention` when you need a specific visual verb, direction, route, title/body combination, or origin.

### 12.9 Particle effect

```json
{
  "do": "effect",
  "effect": "particles",
  "target": "impact",
  "preset": "sparks",
  "intensity": "strong"
}
```

| Field | Required | Options / default |
|---|---:|---|
| `do` | yes | exactly `effect` |
| `effect` | yes | exactly `particles` |
| `target` | yes | visible object or anchor |
| `preset` | no | `fire`, `smoke`, `sparks`, `rain`, `snow`, `dust`, `confetti`, `energy`; default `energy` |
| `intensity` | no | `subtle`, `normal`, `strong`; default `normal` |

Particle randomness is deterministically seeded from the scene and action, so seeking and replaying produce the same frames.

### 12.10 Glow effect

```json
{
  "do": "effect",
  "effect": "glow",
  "target": "star",
  "intensity": "subtle"
}
```

| Field | Required | Options / default |
|---|---:|---|
| `do` | yes | exactly `effect` |
| `effect` | yes | exactly `glow` |
| `target` | yes | visible object or anchor |
| `intensity` | no | `subtle`, `normal`, `strong`; default `normal` |

The glow radius is derived from the target's measured size and the intensity.

### 12.11 Flow effect

```json
{
  "do": "effect",
  "effect": "flow",
  "from": "neuron.dendriteTip1",
  "to": "neuron.axonRoot",
  "intensity": "normal"
}
```

| Field | Required | Options / default |
|---|---:|---|
| `do` | yes | exactly `effect` |
| `effect` | yes | exactly `flow` |
| `from` | yes | visible object or anchor target |
| `to` | yes | visible object or anchor target |
| `intensity` | no | `subtle`, `normal`, `strong`; default `normal` |

This produces a temporary stream between two resolved points.

---

## 13. Labels with camera moves

To show the camera on every label, use a `tour`. This is safer and shorter than manually pairing camera and label beats.

```json
{
  "id": "neuron-tour",
  "pace": "slow",
  "actions": [
    {
      "do": "tour",
      "labelMode": "one-at-a-time",
      "returnTo": "overview",
      "stops": [
        { "target": "neuron.dendriteTip1", "label": "Dendrites receive signals", "shot": "close" },
        { "target": "neuron.soma", "label": "The soma integrates them", "shot": "close" },
        { "target": "neuron.axonRoot", "label": "The axon carries the output", "shot": "detail" }
      ]
    }
  ]
}
```

If you need complete control, use separate beats. The label and camera can start together in each beat:

```json
[
  {
    "id": "show-soma",
    "pace": "slow",
    "actions": [
      { "do": "camera", "target": "neuron.soma", "shot": "close", "movement": "move" },
      { "do": "label", "target": "neuron.soma", "text": "Cell body", "style": "pill" }
    ]
  },
  {
    "id": "show-axon",
    "pace": "slow",
    "actions": [
      { "do": "camera", "target": "neuron.axonRoot", "shot": "detail", "movement": "move" },
      { "do": "label", "target": "neuron.axonRoot", "text": "Axon begins here", "style": "pill" }
    ]
  },
  {
    "id": "return",
    "pace": "normal",
    "actions": [
      { "do": "camera", "target": "neuron", "shot": "overview", "movement": "move" }
    ]
  }
]
```

---

## 14. Drawing a line with an equation

Objects solve the visual structure; beats solve the reveal order.

```json
{
  "version": "1",
  "title": "A Line and Its Equation",
  "theme": "chalkboard",
  "scenes": [
    {
      "id": "line-equation",
      "composition": "equation-plot",
      "objects": [
        {
          "id": "title",
          "kind": "text",
          "text": "ONE LINE, ONE EQUATION",
          "textRole": "heading",
          "placement": { "mode": "zone", "zone": "title" }
        },
        {
          "id": "plot",
          "kind": "chart",
          "chart": "function",
          "function": "2*x + 1",
          "xDomain": [-2, 2],
          "yDomain": [-3, 5],
          "axes": true,
          "xLabel": "x",
          "yLabel": "y",
          "size": "large",
          "placement": { "mode": "zone", "zone": "main-left" }
        },
        {
          "id": "equation",
          "kind": "equation",
          "value": "y=2x+1",
          "size": "large",
          "placement": { "mode": "zone", "zone": "main-right" }
        },
        {
          "id": "slope-note",
          "kind": "text",
          "text": "slope = 2",
          "textRole": "caption",
          "role": "support",
          "placement": { "mode": "relative", "target": "equation", "relation": "below" }
        }
      ],
      "beats": [
        {
          "id": "draw",
          "pace": "slow",
          "actions": [
            { "do": "show", "targets": ["title", "plot"], "entrance": "draw" }
          ]
        },
        {
          "id": "explain",
          "pace": "normal",
          "actions": [
            { "do": "show", "targets": ["equation", "slope-note"], "entrance": "fade" },
            { "do": "attention", "target": "plot.first", "verb": "rings" }
          ]
        },
        {
          "id": "inspect",
          "pace": "slow",
          "actions": [
            { "do": "camera", "target": "plot", "shot": "close", "movement": "push" },
            { "do": "label", "target": "plot", "text": "The graph satisfies y = 2x + 1", "style": "pill" }
          ]
        }
      ]
    }
  ]
}
```

If by “line” you mean a connector rather than a plotted equation, use `kind: "line"` with `from` and `to`, and keep the equation as a separate `equation` object.

---

## 15. Building a cannon scene

The cannon is one semantic visual asset with useful anchors. Combine it with shapes, a path, a moving projectile, labels, and camera actions.

```json
{
  "version": "1",
  "title": "Newton's Cannon",
  "theme": "blueprint",
  "scenes": [
    {
      "id": "newton-cannon",
      "composition": "hero-diagram",
      "objects": [
        {
          "id": "title",
          "kind": "text",
          "text": "NEWTON'S CANNON",
          "textRole": "heading",
          "placement": { "mode": "zone", "zone": "title" }
        },
        {
          "id": "cannon",
          "kind": "visual",
          "asset": "physics.cannon",
          "orientation": "left",
          "role": "hero",
          "placement": { "mode": "zone", "zone": "main-left" }
        },
        {
          "id": "earth",
          "kind": "visual",
          "asset": "physics.planet",
          "role": "primary",
          "size": "large",
          "placement": { "mode": "zone", "zone": "main-right" }
        },
        {
          "id": "projectile",
          "kind": "shape",
          "shape": "disc",
          "appearance": "shaded",
          "size": "tiny",
          "placement": { "mode": "anchor", "target": "cannon.muzzle" }
        },
        {
          "id": "trajectory",
          "kind": "line",
          "from": "cannon.muzzle",
          "to": "earth.top",
          "form": "curved",
          "role": "annotation"
        },
        {
          "id": "question",
          "kind": "text",
          "text": "Can falling become orbit?",
          "textRole": "title",
          "placement": { "mode": "zone", "zone": "support" }
        }
      ],
      "beats": [
        {
          "id": "establish",
          "pace": "normal",
          "actions": [
            { "do": "show", "targets": ["title", "cannon", "earth"], "entrance": "fade" }
          ]
        },
        {
          "id": "aim",
          "pace": "slow",
          "actions": [
            { "do": "show", "targets": ["trajectory", "projectile"], "entrance": "draw" },
            { "do": "camera", "target": "cannon.muzzle", "shot": "close", "movement": "move" },
            { "do": "label", "target": "cannon.muzzle", "text": "The launch point", "style": "tag" }
          ]
        },
        {
          "id": "launch",
          "pace": "dramatic",
          "actions": [
            { "do": "motion", "target": "projectile", "motion": "along", "along": "trajectory" },
            { "do": "effect", "effect": "particles", "target": "cannon.muzzle", "preset": "smoke", "intensity": "normal" }
          ]
        },
        {
          "id": "question-beat",
          "pace": "slow",
          "actions": [
            { "do": "show", "targets": ["question"], "entrance": "word-by-word" },
            { "do": "camera", "target": "earth", "shot": "wide", "movement": "move" },
            { "do": "attention", "target": "earth", "verb": "rings" }
          ]
        }
      ]
    }
  ]
}
```

This uses one `physics.cannon` asset rather than asking for wheel radius, barrel coordinates, line widths, or colors. The compiler preserves the capability through semantic anchors and actions.

---

## 16. Validation and repair messages

Simple JSON is validated before rendering in several stages.

### 16.1 Structural validation

Checks required fields, field types, enums, minimum array lengths, numeric limits, ID syntax, and unknown properties.

### 16.2 Semantic validation

Checks:

- duplicate scene/object/beat IDs;
- unknown object and anchor targets;
- unknown visual assets and map icons;
- invalid chart domains, payloads, expressions, and equation commands;
- invalid timeline ranges, table rows, map rings, place names, and group children;
- placement cycles;
- invalid show/hide lifecycle;
- action targets that are missing or never visible;
- multiple motion programs targeting one object;
- canonical GCL consistency after compilation.

After layout resolution, the compiler also checks safe-frame overflow, simultaneous-object collisions,
SVG-part bound precision, callout geometry, and motion geometry. These
checks need final view-space boxes, so schema validation alone cannot perform them.

`compileLessonSpec` returns valid canonical output together with repairable warnings so an LLM can
inspect the diagnostic paths and revise its JSON. `renderLessonSpec` is the final quality gate and
refuses to render when any warning remains. The production sequence is therefore:

```text
generate JSON → compile → repair every diagnostic → compile again → render only with zero warnings
```

### 16.3 Diagnostic codes

| Code | Meaning |
|---|---|
| `INVALID_JSON` | Input string could not be parsed as JSON. |
| `SCHEMA_ERROR` | A field is missing, wrong, misspelled, or outside its allowed options. |
| `DUPLICATE_ID` | An ID is reused in a scope where it must be unique. |
| `UNKNOWN_TARGET` | Referenced object does not exist. |
| `UNKNOWN_ASSET` | Visual asset name is not registered. |
| `UNKNOWN_ICON` | A map-marker icon is outside the renderer's exact icon vocabulary. |
| `INVALID_ANCHOR` | Object exists, but the named anchor does not. |
| `INVALID_ACTION_TARGET` | An action used an invalid target form, such as an anchor in `show.targets`. |
| `INVALID_LIFECYCLE` | Show/hide order or visibility declaration is impossible. |
| `INVALID_SVG` | SVG markup, structure, tag, attribute, reference, or named-part convention is unsafe or unsupported. |
| `INVALID_SVG_BOUNDS` | An explicit SVG-composite part box is non-positive or lies outside its viewBox. |
| `INVALID_EXPRESSION` | A safe expression cannot be parsed or has no finite value on its domain. |
| `UNSUPPORTED_MATH_COMMAND` | Equation markup uses a command the renderer does not implement. |
| `INVALID_DOMAIN` | A numeric domain or timeline range is reversed, equal, or out of bounds. |
| `INVALID_DATA` | Object data is structurally present but semantically unusable. |
| `UNKNOWN_MAP_PLACE` | A map flow names a place not declared by that map. |
| `INVALID_GROUP_CHILD` | A group child has forbidden placement/lifecycle fields or duplicate IDs. |
| `MULTIPLE_MOTION` | More than one motion program targets the same object in one scene. |
| `PLACEMENT_CYCLE` | Relative placements depend on each other circularly. |
| `CANONICAL_ERROR` | Compiled GCL violates the renderer's canonical contract. |
| `TARGET_NOT_VISIBLE` | A target is used before it has appeared; warning if it becomes visible later. |
| `TEMPORARY_VISUAL_PERSISTS` | An object or SVG part marked temporary is still visible at the scene's final frame. |
| `LAYOUT_OVERFLOW` | A resolved top-level object extends outside the safe 920×430 frame. |
| `LAYOUT_COLLISION` | Two objects overlap substantially while simultaneously visible without an explicit relational placement. |
| `CALLOUT_OVERFLOW` | A callout cannot fit safely around its target. |
| `IMPRECISE_SVG_BOUNDS` | A spatially targeted SVG part fell back to whole-viewBox bounds. |
| `MOTION_GEOMETRY_FALLBACK` | Orbit target begins on its center, so the compiler must use the semantic fallback radius. |
| `MOTION_PATH_ADJUSTED` | Along-path target does not begin at either path endpoint; a lead-in was inserted to avoid a jump. |

Diagnostics include a JSON path and, where possible, suggestions and available targets. Fix the earliest structural error first because later reference errors may be consequences of it.

---

## 17. Practical authoring workflow

1. Choose one lesson theme.
2. Split the explanation into scenes; each scene should make one conceptual point.
3. Choose a composition that matches the scene's relationship.
4. Declare the minimum objects needed for the idea.
5. Give every object a clear stable ID.
6. Place major objects in separate zones; use relative placement for dependent text.
7. Decide which objects start visible and which are shown by beats.
8. Write beats in teaching order.
9. Put parallel actions in one beat and sequential actions in separate beats.
10. Use labels/tours only after targets are visible.
11. Use camera movement to clarify scale or detail, not on every beat.
12. Validate every generated keyframe: scene boundaries, beat boundaries, and motion quartiles.
13. Render and visually review those keyframes, including the last frame of every scene.

Treat warnings as repair requests, not optional decoration. A lesson is ready only when it compiles
without warnings and orbit/path motion remains continuous at the exact beat boundary when scrubbing
forward and backward.

---

## 18. Design guidance that prevents clutter

Simple JSON removes coordinates, but it cannot infer the pedagogical priority of an overcrowded scene. These guidelines produce cleaner results.

- Use one heading per scene.
- Prefer one major visual plus one supporting explanation.
- In `equation-plot`, keep the chart in `main-left` and equation in `main-right`.
- Avoid placing a heading, chart, and footer text all into `main`.
- If two large objects share a zone, move one to another zone instead of relying on stacking.
- Use `support` and `footer` for short text, not paragraphs.
- Use a `tour` when several labels would otherwise remain visible together.
- Use one attention animation at a time.
- Use `dramatic` only for major reveals.
- Prefer `fade`, `draw`, and `wipe` for normal teaching; reserve `slam`, `scramble`, particles, shake, and sparks for meaningfully energetic moments.
- Return the camera to `overview` after a detail sequence when later content needs the whole scene.
- Split a dense explanation into two scenes rather than forcing all content into one frame.

---

## 19. Compact option index

This is a quick lookup; the earlier sections explain how each option behaves.

| Category | Options |
|---|---|
| Themes | `textbook`, `parchment`, `blueprint`, `chalkboard` |
| Compositions | `hero`, `hero-diagram`, `equation`, `overview-detail`, `split`, `comparison`, `process`, `equation-plot`, `data`, `map`, `timeline`, `table`, `custom-relational` |
| Placement modes | `zone`, `relative`, `anchor` |
| Zones | `title`, `main`, `main-left`, `main-right`, `support`, `footer`, `background`, `overlay`, `hud` |
| Relative relations | `above`, `below`, `left-of`, `right-of`, `near` |
| Roles | `background`, `support`, `primary`, `hero`, `annotation`, `hud` |
| Sizes | `tiny`, `small`, `medium`, `large`, `hero`, `fill` |
| Initial state | `hidden`, `visible` |
| Spaces | `world`, `screen` |
| Object kinds | `text`, `equation`, `stat`, `visual`, `vector`, `svg-artwork`, `svg-composite`, `line`, `shape`, `curve`, `chart`, `legend`, `map`, `timeline`, `table`, `group` |
| Paces | `instant`, `quick`, `normal`, `slow`, `dramatic` |
| Entrances | `instant`, `fade`, `draw`, `wipe`, `iris`, `slam`, `word-by-word`, `typewriter`, `scramble` |
| Exits | `instant`, `fade`, `erase`, `wipe`, `iris`, `dissolve`, `slide`, `shrink` |
| Shots | `overview`, `wide`, `medium`, `close`, `detail` |
| Camera movement | `cut`, `move`, `push` |
| Label styles | `text`, `pill`, `rect`, `tag`, `bubble`, `badge` |
| Motions | `move`, `fall`, `orbit`, `along`, `spin` |
| Emphasis | `punch`, `shake`, `pulse`, `wiggle` |
| Strength / intensity | `subtle`, `normal`, `strong` |
| Attention verbs | `callout`, `highlight`, `spotlight`, `dim`, `pointer`, `box`, `brackets`, `encircle`, `converge`, `spark`, `vignette`, `rings` |
| Particle presets | `fire`, `smoke`, `sparks`, `rain`, `snow`, `dust`, `confetti`, `energy` |

---

## 20. Source of truth

This guide describes the implementation in:

- `src/simple-json/types.ts` — TypeScript contracts;
- `src/simple-json/schema.ts` — strict JSON Schema;
- `src/simple-json/validate.ts`, `src/simple-json/lifecycle.ts`, and `src/simple-json/diagnostics.ts` — source, lifecycle, and resolved-layout diagnostics;
- `src/simple-json/resolve.ts` and `src/simple-json/registry.ts` — layout, sizes, themes, paces, shots, and anchors;
- `src/simple-json/compile.ts` and `src/simple-json/canonical.ts` — deterministic compilation and canonical motion-continuity checks;
- `src/simple-json/keyframes.ts` — deterministic review-frame collection and finite-geometry checks;
- `src/simple-json/capabilities.ts` — machine-readable schema, tokens, asset anchors, SVG limits, and math vocabulary;
- `src/simple-json/prompts.ts` — planner, author, repair, and visual-review prompt contracts;
- `src/lessons/simple-json/` — the four complete lesson implementations.

When the implementation changes, update this document in the same change so the human contract remains accurate.
