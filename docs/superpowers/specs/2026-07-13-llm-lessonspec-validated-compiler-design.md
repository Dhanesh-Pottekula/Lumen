# Design Spec — LessonSpec: Validated LLM Authoring for Full GCL Capability

**Date:** 2026-07-13  
**Status:** approved design, pre-implementation  
**Scope:** LLM-authored visual lessons only; audio, narration, TTS, export, and publishing are out of scope.

## 1. Goal

Create a strict, semantic JSON format named `LessonSpec v1` that an LLM can emit as one complete
artifact. A deterministic compiler validates that artifact, resolves layout/style/timing defaults,
and produces the existing GCL `Film` format. The existing renderer remains the execution engine.

The new format must:

- let the LLM generate lessons with the same functional and visual capabilities as the current GCL;
- reduce opportunities for invalid combinations, mistyped references, collisions, and fragile layout;
- prevent the LLM from authoring visual implementation constants such as pixels and hex colors;
- preserve deterministic, seekable rendering;
- keep existing GCL lessons working unchanged;
- return precise, structured diagnostics that the same LLM can use to emit corrected JSON.

Functional and visual parity means the new format can recreate the same lesson structures, teaching
effects, camera behavior, maps, charts, motion, labels, atmosphere, and overall quality. Exact
historical pixels remain available by rendering existing canonical GCL directly.

## 2. Non-goals

- Audio playback, narration timing, speech synthesis, or caption synchronization.
- Video export, server-side rendering, storage, or publishing.
- A second creative AI inside the compiler.
- Allowing raw canvas instructions, SVG paths, CSS colors, pixels, seconds, or emitter internals in
  LLM-authored JSON.
- Replacing canonical GCL or breaking existing GCL films.
- Pixel-identical reproduction of hand-positioned legacy scenes from semantic input.

## 3. Hard authoring rules

1. The LLM emits one complete `LessonSpec` JSON document.
2. The compiler is ordinary deterministic code. It may validate, normalize, calculate, and expand;
   it may not invent teaching content.
3. Unknown fields are errors. Unknown references are errors. Unsupported combinations are errors.
4. The validated path never silently falls back to the view center or silently ignores a field.
5. Visual implementation numbers are forbidden in `LessonSpec`:
   - pixel coordinates and dimensions;
   - hex/RGB/HSL colors;
   - seconds and frame counts;
   - numeric camera zoom and rotation;
   - line widths, blur radii, particle rates, and alpha values;
   - raw canvas layers, SVG path data, or inline SVG markup.
6. Subject-matter numbers remain allowed:
   - statistics and measured quantities;
   - chart data and mathematical domains;
   - formula constants and polygon side counts;
   - dates, timeline years, longitude, latitude, and geographic rings.
7. Semantic controls use finite vocabularies such as `large`, `slow`, `detail`, `energy`, and
   `strong`. The compiler resolves them through versioned registries.
8. Stable IDs are required for anything referenced by another object or action.

## 4. Architecture

```text
LLM
 │ emits LessonSpec JSON
 ▼
Structural validation
 ▼
Reference and capability validation
 ▼
Semantic normalization
 ▼
Asset resolution + layout + style + choreography
 ▼
ResolvedLesson (inspectable internal representation)
 ▼
Canonical GCL generation
 ▼
Canonical GCL validation
 ▼
Existing deterministic renderer
```

There are three distinct representations:

### 4.1 LessonSpec

The only representation the LLM authors. It contains semantic objects, relationships, and ordered
visual beats.

### 4.2 ResolvedLesson

An internal diagnostic representation containing every compiler decision: selected zones, measured
boxes, resolved theme colors, generated timing, camera framing, seeds, and expanded macro actions.
This boundary makes compiler decisions independently testable without invoking canvas rendering.

### 4.3 Canonical GCL

The existing flat stream of scene markers and GCL components. It may contain pixels, colors, seconds,
layer names, particle configurations, and other renderer details because it is generated and
validated code, not LLM-facing input.

## 5. Top-level LessonSpec

```json
{
  "version": "1",
  "title": "Why the Moon Doesn't Fall",
  "theme": "chalkboard",
  "transition": "crossfade",
  "assets": [],
  "scenes": []
}
```

Required fields:

| Field | Meaning |
|---|---|
| `version` | Schema/compiler compatibility version; initially exactly `"1"`. |
| `title` | Lesson metadata; not automatically rendered. |
| `theme` | Semantic art direction: `textbook`, `parchment`, `blueprint`, or `chalkboard`. |
| `scenes` | Ordered non-empty scene list. |

Optional fields:

| Field | Meaning |
|---|---|
| `transition` | Default scene transition: `crossfade`, `zoom-through`, or `whip-pan`. |
| `assets` | Lesson-local semantic composite asset definitions. |
| `style` | Lesson-wide semantic defaults only. |

## 6. Scene model

```json
{
  "id": "newtons-cannon",
  "composition": "hero-diagram",
  "mood": "night",
  "objects": [],
  "beats": []
}
```

Required fields:

- `id`: unique within the lesson;
- `composition`: deterministic layout template;
- `objects`: declarations of scene content;
- `beats`: ordered visual choreography.

Initial composition vocabulary:

- `hero`
- `hero-diagram`
- `split`
- `comparison`
- `process`
- `equation`
- `equation-plot`
- `data`
- `map`
- `timeline`
- `table`
- `overview-detail`
- `custom-relational`

Optional `mood` and per-scene `theme` may alter semantic theme roles but never introduce literal
colors. Per-scene transition overrides must be supported by the compositor rather than flattened to
the first scene's settings.

Objects are declarations. They default to hidden unless `initial: "visible"`; beats determine when
hidden objects appear. Background/ambient objects may start visible.

## 7. Common object contract

```json
{
  "id": "earth",
  "kind": "visual",
  "role": "primary",
  "placement": { "mode": "zone", "zone": "main" },
  "size": "hero",
  "style": { "color": "planet" },
  "space": "world",
  "initial": "hidden"
}
```

Common semantic fields:

| Field | Values / behavior |
|---|---|
| `id` | Stable identifier. Required when referenced; otherwise compiler may derive one. |
| `kind` | Strict discriminant selecting a kind-specific schema. |
| `role` | `background`, `support`, `primary`, `hero`, `annotation`, `hud`, `effect`. |
| `placement` | Zone, relation, anchor, or geographic placement. |
| `size` | `tiny`, `small`, `medium`, `large`, `hero`, `fill`. |
| `style` | Semantic theme roles only. |
| `space` | `world` or `screen`; replaces direct layer/fixed authoring. |
| `initial` | `hidden` or `visible`. |
| `idle` | Optional semantic continuous motion. |

Object kinds:

- `text`
- `equation`
- `stat`
- `chart`
- `shape`
- `curve`
- `line`
- `visual`
- `legend`
- `map`
- `timeline`
- `table`
- `group`

The LLM does not choose between canonical GCL `prop`, `icon`, `vector`, `svg`, and `image`; those are
asset-registry implementation details under `visual`.

## 8. Placement and anchors

### 8.1 Zone placement

```json
{ "mode": "zone", "zone": "main-right" }
```

Zones are composition-relative, not pixel positions. Initial vocabulary includes `title`, `main`,
`main-left`, `main-right`, `support`, `footer`, `background`, `overlay`, and `hud`.

### 8.2 Relative placement

```json
{ "mode": "relative", "target": "earth", "relation": "above" }
```

Relations include `above`, `below`, `left-of`, `right-of`, `near`, `inside`, `around`, and `between`.
The compiler chooses separation from semantic size and the active composition.

### 8.3 Anchor placement

```json
{ "mode": "anchor", "target": "cannon.muzzle" }
```

Every object publishes generic live anchors:

- `center`, `top`, `bottom`, `left`, `right`;
- `top-left`, `top-right`, `bottom-left`, `bottom-right`.

Rich objects additionally publish domain anchors:

- charts: bars, points, slices, peak, first, last;
- shapes: vertices and named outline points;
- maps: regions, features, markers, and named places;
- timelines: event points;
- tables: row, column, and cell anchors;
- catalog/composite visuals: declared handles such as `muzzle`, `soma`, and `axonRoot`.

Anchors used by labels, flows, and camera actions must track an object's live motion transform.

### 8.4 Geographic placement

```json
{ "mode": "geo", "map": "empire-map", "place": "Karakorum" }
```

Named places are preferred. Literal longitude/latitude is allowed because it is geographic data.

## 9. Visual asset system

The LLM sees one `visual` object surface. A versioned registry resolves the asset to a canonical GCL
renderer.

### 9.1 Catalog visual

```json
{
  "id": "cannon",
  "kind": "visual",
  "asset": "cannon",
  "role": "primary",
  "orientation": "left",
  "size": "large"
}
```

Catalog metadata includes:

- canonical renderer (`prop`, `icon`, `vector`, `svg`, or `image`);
- aliases and category;
- intrinsic aspect/size class;
- supported anchors;
- compatible actions;
- theme-material roles;
- preload requirements.

The existing cannon, tree, apple, planet, arrow, star, neuron cell, ion channel, and icon catalog
become entries in this unified registry.

### 9.2 LLM-authored composite visual

```json
{
  "id": "newton-cannon",
  "kind": "composite",
  "parts": [
    { "id": "barrel", "form": "tube", "proportion": "long", "material": "iron" },
    {
      "id": "carriage",
      "form": "trapezoid",
      "material": "wood",
      "attach": { "below": "barrel" }
    },
    {
      "id": "wheels",
      "form": "wheel-pair",
      "material": "wood",
      "attach": { "below": "carriage" }
    }
  ],
  "anchors": {
    "muzzle": "barrel.front",
    "breech": "barrel.back",
    "wheels": "wheels.center"
  }
}
```

Composite forms are finite semantic primitives such as circle, ellipse, rectangle, rounded box,
polygon, star, heart, line, arc, ring, tube, capsule, trapezoid, arrow, and wheel pair. Parts attach by
relationships. The compiler produces canonical groups/shapes/vectors and publishes declared anchors.

### 9.3 Procedural visual

Formula-defined curves, charts, maps, and other mathematical geometry remain supported. Formula and
domain numbers describe subject geometry, so they are allowed. Raw SVG/Path2D commands are not.

## 10. Specialized object schemas

Every variant is a discriminated schema with the correct required fields. A single object with many
optional incompatible fields is explicitly rejected.

### 10.1 Text

Supports heading, title, body, bullet, and caption roles; plain, word-by-word, typewriter, slam, and
scramble reveal behavior; alignment by semantic relation; and text along a referenced curve.

### 10.2 Equation

Carries the existing mathtext expression and semantic importance/alignment. It exposes generic box
anchors so lines, labels, and camera can target it.

### 10.3 Stat

Supports value, optional start value, unit, label, prefix, commas, and decimal formatting. Numeric
values are subject data.

### 10.4 Chart

Separate strict variants:

- `bar` requires categorical data;
- `line`, `area`, and `scatter` require a series;
- `pie` and `donut` require categorical data;
- `function` requires a formula and x-domain;
- `riemann` requires a formula, x-domain, and rectangle-count subject parameter.

Axes, labels, domains, semantic series categories, and published data anchors remain available.

### 10.5 Shape

Supports circle, polygon, star, heart, shaded disc, and semantic/composite path references. Radius is
derived from `size`; polygon side count is allowed subject geometry. Shine, fill, and stroke use
semantic roles and weights.

### 10.6 Curve and line

- `curve` accepts safe parametric/formula definitions and a domain;
- `line` connects anchors or named points and supports straight, elbow, curved, arrow, underline,
  bracket, and traced forms.

This covers the equation-plus-line and general connector cases without authoring point arrays.

### 10.7 Legend

Supports named categories with category-color roles. The compiler guarantees legend swatches use the
same resolved semantic colors as the associated chart/map objects.

### 10.8 Map

Supports geographic features/rings, outlines, named places, markers, flows, category colors, growth
keyframes, animated borders, feature staggering, and region/marker anchors. Route curvature/weight and
timing are semantic; geographic coordinates and historical keyframes are allowed data.

### 10.9 Timeline

Supports range, events, eras, fixed playhead, animated playhead, and playhead labels. Years are data;
animation pace is semantic.

### 10.10 Table

Supports rows, header, semantic column/category roles, and progressive row construction.

### 10.11 Group

Supports row/stack/grid, semantic spacing, column count, nesting, clipping, group entrance, child
entrance, staggered build, and group-level motion/emphasis. Camera and attention directives are not
group children; they remain beat actions targeting the group or its descendants.

## 11. Beat and action model

Beats replace narration cues, `start`, `after`, and manually authored seconds.

```json
{
  "id": "explain-orbit",
  "pace": "slow",
  "actions": [
    { "do": "show", "targets": ["earth", "moon"] },
    {
      "do": "animate",
      "target": "moon",
      "motion": { "kind": "orbit", "around": "earth", "distance": "medium" }
    }
  ]
}
```

Beats execute in list order. Actions in one beat are parallel unless an action itself defines a
staggered sequence. Semantic pace is `instant`, `quick`, `normal`, `slow`, or `dramatic`.

Action discriminants:

- `show`
- `hide`
- `animate`
- `camera`
- `tour`
- `label`
- `attention`
- `emphasize`
- `reveal`
- `flow`
- `glow`
- `atmosphere`

## 12. Reveal and exit parity

`show.entrance` supports all existing GCL enter kinds through LLM-safe names:

- instant, fade, draw, wipe, iris, radial-wipe, blinds, checkerboard, dissolve, masked, slam,
  word-by-word, typewriter, scramble, staggered-build, and border-then-fill.

Semantic options include direction, mask form/reference, density, sequence, and pen follower. The
compiler derives slat counts, seeds, clip geometry, and duration.

`hide.exit` supports instant, fade, erase, wipe, iris, dissolve, slide, and shrink. Beat position and
pace replace `out`, `until`, and numeric duration.

## 13. Motion parity

`animate.motion.kind` supports all existing GCL motion modes:

- `move`: destination/reference and optional semantic route;
- `fall`: destination, gravity class, and bounce class;
- `orbit`: center, distance class, ellipse form, direction, start side, and bounded cycle count;
- `follow-path`: referenced curve/line and once/repeat;
- `spin`: direction and speed class;
- `trace-path`: referenced curve/line, semantic trail role, and persistence;
- `morph`: target semantic shape and polygon side count.

Idle motion supports breathe, wobble, pulse, horizontal drift, vertical drift, rotational drift, and
scale pulse with semantic intensity/pace.

## 14. Camera and label tours

```json
{
  "do": "tour",
  "labelMode": "one-at-a-time",
  "returnTo": "overview",
  "stops": [
    { "target": "neuron.dendriteTip1", "label": "Receives signals", "shot": "close" },
    { "target": "neuron.soma", "label": "Processes signals", "shot": "detail" }
  ]
}
```

Camera shots: overview, wide, medium, close, detail. Movement: cut, move, push, pull, pan. Framing:
center, context-left, context-right. Rotation: level, slight-left, slight-right.

The compiler calculates target-aware zoom, safe camera bounds, transition timing, label appearance,
hold, exit, and return framing. The default tour shows one label at a time and may finish with an
overview containing all requested summary labels.

Labels support target, title/body, automatic or semantic side, straight/elbow/curved routing, and
text/pill/rect/tag/bubble/badge containers. Automatic placement evaluates available screen space and
collision candidates after camera framing.

## 15. Attention and subject modifiers

`attention.effect` covers all current attention verbs:

- callout, highlight, spotlight, dim-others, pointer, box, brackets, encircle, converge, spark,
  vignette, rings.

`emphasize.effect` covers punch, shake, pulse, wiggle, ghost, and magnify. `reveal` covers the existing
predict/pose/pause/reveal behavior. Target size determines attention radius; semantic intensity may
modify it.

## 16. Particles, flow, and glow

`atmosphere.effect` exposes fire, smoke, sparks, rain, snow, dust, confetti, and energy. Semantic
controls include intensity, density, spread, speed, scale, direction, area, and looping. Stable seeds
derive from lesson/scene/object/action IDs.

`flow` supports particle streams between anchors and geographic routes between places. Semantic route
controls include straight/curved/strong-curve, direction, bidirectionality, pace, intensity, and role.

`glow` supports target, semantic color role, extent, intensity, and persistence. The compiler resolves
radius, alpha, blend, and layer.

Unlike the current early-return renderer path, these effects must have explicit lifecycle semantics
and either support or reject show/hide/motion/modifier combinations through validation.

## 17. Semantic style system

Initial color roles:

- background, surface, ink, muted, accent;
- positive, warning, danger, energy;
- cool, warm, neutral;
- planet, water, land;
- category-1 through category-10.

Other semantic vocabularies:

- size: tiny, small, medium, large, hero, fill;
- line weight: hairline, light, normal, bold;
- intensity: subtle, normal, strong, dramatic;
- pace: instant, quick, normal, slow, dramatic;
- depth role: background, content, foreground, annotation, effect;
- space: world, screen.

Every semantic token maps through a versioned theme registry for textbook, parchment, blueprint, and
chalkboard. Catalog materials such as iron, wood, sodium, potassium, and territory categories map to
these roles without exposing colors.

## 18. Compiler stages

The compiler must expose pure stages rather than one monolithic function:

1. Parse JSON and verify version.
2. Structural validation with unknown-field rejection.
3. Build lesson/scene/object/asset/anchor symbol tables.
4. Validate IDs, references, compatibility, and kind-specific requirements.
5. Normalize aliases and semantic presets.
6. Resolve catalog and composite assets.
7. Measure intrinsic object dimensions.
8. Select composition templates and zones.
9. Resolve relational constraints and collisions.
10. Publish generic and specialized anchors.
11. Resolve semantic style through the selected theme.
12. Convert ordered beats and semantic pace into deterministic timing.
13. Expand macros such as tours into primitive actions.
14. Compile objects/actions into canonical GCL.
15. Validate canonical GCL.
16. Return `{ lesson, resolved, gcl, diagnostics }`.

Every stage is deterministic and independently testable. Seeds use a stable hash of semantic IDs.

## 19. Diagnostics and repair

Diagnostics are data, not console-only warnings:

```json
{
  "valid": false,
  "errors": [
    {
      "code": "UNKNOWN_TARGET",
      "path": "/scenes/0/beats/2/actions/0/target",
      "received": "erth",
      "message": "Unknown target 'erth'.",
      "suggestions": ["earth"],
      "availableTargets": ["earth", "moon", "cannon"]
    }
  ]
}
```

Error categories:

- invalid JSON;
- schema/version error;
- unknown field;
- missing/duplicate ID;
- unknown reference or anchor;
- incompatible object/action combination;
- invalid semantic token;
- missing catalog asset;
- unsatisfied layout constraint or critical collision;
- canonical GCL validation failure.

The orchestration layer may return all diagnostics to the same LLM for a bounded repair attempt. The
LLM returns a complete corrected document, not a JSON Patch. The compiler never changes teaching
content to make an invalid lesson pass.

## 20. Canonical GCL hardening prerequisites

The new compiler must target reliable canonical behavior. Required fixes/refactors:

1. Apply enter/hold/exit lifecycle to attention and callout directives.
2. Define and validate lifecycle/modifier support for particles, flow, and glow.
3. Fix masked group entrances or reject them until the implementation is correct.
4. Add generic anchors to every component.
5. Make target anchors follow live component motion where the action requires it.
6. Replace silent unknown-position fallback with structured errors in validated mode; preserve legacy
   warning behavior for direct legacy GCL rendering.
7. Use strict variant schemas for chart, shape, motion, map, timeline, and attention combinations.
8. Make per-scene theme/transition behavior explicit and correct.
9. Validate icon, prop, asset, formula, and anchor names before rendering.
10. Split the large GCL compiler into focused renderer adapters/registries without changing pixels for
    legacy fixtures.
11. Keep current GCL public entry points and existing lesson modules supported.

## 21. Capability mapping contract

| Canonical GCL capability | LessonSpec surface |
|---|---|
| scene/theme/bg | lesson/scene `theme`, `mood`, semantic background style |
| id/at/slots/geo | object `id` + structured placement + anchors |
| cue/start/dur | ordered beats + semantic pace |
| layer/fixed | role/depth + world/screen space |
| heading/text/textPath | `text` object + optional curve reference |
| equation | `equation` object |
| stat | `stat` object |
| all chart variants | strict `chart` variants |
| all shape variants | `shape`, `curve`, `line`, and composite visual |
| parametric | formula-driven `curve` |
| icon/image/vector/svg/prop | unified catalog `visual` or semantic composite |
| legend | `legend` with shared category roles |
| map | strict `map` object + flow/actions |
| timeline | strict `timeline` object |
| table | strict `table` object |
| group | `group` object |
| camera | `camera` and `tour` actions |
| all attention verbs | `label`/`attention` actions |
| particles/flow/glow | `atmosphere`/`flow`/`glow` actions |
| all enters/exits | `show.entrance` and `hide.exit` |
| all motions | `animate.motion` |
| oscillate | object `idle` |
| emphasis/ghost/magnify | `emphasize` action |
| predict | `reveal` action |
| group build/child enter | group semantics + show sequence |
| film grade/transitions | theme/presentation + transition |

Capability parity means every row has schema fixtures, compiler tests, and at least one render fixture.
Arbitrary canonical numeric combinations are not part of the LLM-facing contract; their visual effect
families and the four reference lessons must be reachable through semantic controls.

## 22. Testing strategy

### 22.1 Backward compatibility

- Keep all current tests passing.
- Render current GCL lesson fixtures without compiler changes to their authored data.
- Capture representative baseline frames/traces before canonical refactors.

### 22.2 Schema and diagnostics

- Valid fixture for every object/action variant.
- Invalid fixtures for missing required fields, extra fields, incompatible combinations, duplicate IDs,
  unknown references, and invalid anchors.
- Golden diagnostic objects with stable codes/paths/suggestions.

### 22.3 Compiler

- LessonSpec-to-ResolvedLesson snapshots.
- ResolvedLesson-to-GCL snapshots.
- Same input produces byte-identical GCL.
- Semantic registry and stable-seed tests.
- Capability-matrix coverage test that fails when a canonical feature lacks a LessonSpec route.

### 22.4 Layout

- Constraint/zone/anchor unit tests.
- Collision and clipping tests.
- Generic/live anchor tests including motion and camera.
- Representative composition fixtures for every template.

### 22.5 Rendering

- Existing deterministic render-log tests.
- Kitchen-sink LessonSpec using every object/action family.
- Browser-rendered golden frames at representative scene/beat boundaries.
- Perceptual visual comparison for the four re-authored lessons, allowing small layout differences but
  rejecting missing content/effects, severe overlap, clipping, or incorrect camera targets.

### 22.6 LLM evaluation

- Multi-domain prompt set covering biology, physics, mathematics, and history.
- Measure one-shot structural/semantic validity.
- Measure success after one structured repair response.
- Check every emitted document for forbidden visual constants.
- Retain failed documents and diagnostics as regression fixtures.

## 23. Acceptance criteria

Implementation is complete when:

1. Current legacy GCL lessons and tests remain green.
2. `LessonSpec v1` has strict runtime validation and machine-readable schema documentation.
3. Every current GCL capability family has a tested LessonSpec path.
4. The kitchen-sink film is re-authored in LessonSpec.
5. Neuron, gravity, calculus, and Mongol lessons are re-authored in LessonSpec with functional and
   visual parity.
6. LLM-authored JSON contains no forbidden visual implementation constants except allowed subject data.
7. Unknown targets/anchors and incompatible options produce structured errors, never silent fallback.
8. Camera-label tours show correct targets, cleanly remove labels, and return to the requested framing.
9. Same LessonSpec and compiler version produce byte-identical canonical GCL.
10. Browser verification shows no critical collision, clipping, blank asset, missing effect, or camera
    framing regression in reference lessons.

## 24. Implementation phases

### Phase 0 — Baseline and parity contract

Capture current capability inventory, canonical fixtures, representative frames, and the four lesson
baselines. Turn the mapping table into an executable coverage manifest.

### Phase 1 — Canonical GCL hardening

Add canonical validation/diagnostics and fix attention exits, effect lifecycle, group masking, live
anchors, generic anchors, unknown-reference handling, scene theme/transition behavior, and compiler
module boundaries while preserving legacy output.

### Phase 2 — LessonSpec schema and validation

Implement the strict top-level, scene, object, placement, asset, beat, action, semantic-token, and
diagnostic schemas. Reject unknown fields. Generate the LLM-facing schema/reference from the same
source used at runtime.

### Phase 3 — Semantic registries and asset system

Implement theme-token, pace, size, intensity, shot, transition, material, catalog-asset, alias,
compatibility, and anchor registries. Unify existing props/icons/SVG/images behind catalog metadata.

### Phase 4 — Layout and style compiler

Implement composition templates, measurement, zones, relations, generic anchors, constraints,
collision checks, semantic style resolution, and ResolvedLesson output.

### Phase 5 — Beat and core action compiler

Implement deterministic beat timing, show/hide, all enter/exit mappings, text/equation/stat/shape/
curve/line/visual/group compilation, and semantic motion/idle/emphasis/reveal behavior.

### Phase 6 — Camera, labels, attention, and tours

Implement target-aware camera framing, automatic label placement/routing, all attention mappings,
label lifecycle, coordinated tours, and screen/world-space behavior.

### Phase 7 — Specialized data visuals

Implement strict chart variants, legends, maps, timelines, tables, geographic routes, animated map
growth, chart anchors, timeline anchors, and table anchors.

### Phase 8 — Atmosphere and composite visuals

Implement all particle presets and semantic controls, flow, glow, composite assets, part attachment,
composite anchors, and compatibility validation.

### Phase 9 — Parity migration and visual verification

Re-author the kitchen sink and four reference lessons, run capability coverage, compare browser frames,
and close every missing behavior or visual-quality gap discovered by migration.

### Phase 10 — LLM prompt, repair, and documentation

Generate concise authoring guidance from schemas/registries, implement structured diagnostic handoff,
run the prompt/evaluation suite, add failed cases as regressions, and finalize the authoring guide.

## 25. Implementation boundary

The design deliberately separates full engine capability from direct access to renderer constants.
The compiler may generate every canonical field needed to reproduce current videos. The LLM selects
semantic intent and finite options. Direct canonical GCL remains supported for existing films and
developer debugging but is not embedded inside LessonSpec as an escape hatch.
