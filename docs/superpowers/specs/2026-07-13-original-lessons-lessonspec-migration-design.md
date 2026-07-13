# Design Spec — Replicate the Four Original Lessons with LessonSpec

## 1. Goal

Re-author the four current GCL reference films—calculus, gravity, Mongol Empire, and neuron—as pure
LessonSpec v1 JSON and render them through the validated LessonSpec compiler into the existing GCL
engine.

The new versions must preserve the original lessons' educational content, six-scene story structure,
meaningful visual composition, choreography, camera work, labels, data visuals, motion, and effects.
They need visual and behavioral equivalence, not pixel-identical frames.

The LLM-facing JSON must continue to exclude pixels, literal colors, seconds, numeric zoom/rotation,
stroke widths, effect radii, seeds, raw SVG/vector paths, and raw GCL. Subject data—formulae, chart
values, geographic coordinates, dates, table cells, and mathematical domains—remains allowed.

Audio, narration, TTS, captions, export, and publishing remain out of scope.

## 2. Reference lessons

The legacy films remain unchanged and are the parity baselines:

- `src/lessons/gcl/calculus.ts`
- `src/lessons/gcl/gravity.ts`
- `src/lessons/gcl/mongol.ts`
- `src/lessons/gcl/neuron.ts`

The LessonSpec versions are added alongside them. The application switches to the new versions only
after all parity checks pass.

## 3. Architecture

```text
LLM-authored LessonSpec JSON
        |
        v
strict structural validation
        |
        v
semantic/reference/lifecycle validation
        |
        v
ResolvedLesson
  - pixels, sizes, colors, timing, seeds, camera framing
  - dependency-resolved placement and anchors
  - expanded macros and action lifecycles
        |
        v
canonical GCL Film
        |
        v
existing parseFilm -> compileScene -> renderFilm engine
```

Canonical GCL remains available for legacy lessons and exact low-level authoring. LessonSpec is the
safe, simpler LLM surface.

The authoring package is separated by capability rather than expanded into one monolithic file:

- schemas and TypeScript contracts;
- structural, reference, capability, and lifecycle validation;
- semantic registries;
- dependency-aware layout and timing resolution;
- focused object compilers;
- focused action/effect compilers;
- lesson fixtures and parity tests.

## 4. Required bug fixes before migration

The migration must not build on known invalid behavior.

1. Show/hide targets accept object IDs only, never anchors.
2. Generic anchors accepted by validation must exist at the canonical GCL boundary.
3. Hidden objects targeted by camera/attention must retain resolvable layout geometry or fail
   validation; they must not silently fall back to the view center.
4. Object lifecycle is explicit. The initial implementation supports one appearance window per scene;
   repeated show/hide cycles are either compiled as distinct instances or rejected with a precise
   lifecycle diagnostic. They are never silently collapsed.
5. `initial:"visible"` objects begin at scene time zero even if referenced by later actions.
6. Asset lookup uses own registered keys only; prototype properties are never valid assets.
7. Relative placement resolves as a dependency graph, supports forward references, and reports cycles.
8. Validated line forms compile faithfully; `arrow` includes an arrowhead.
9. Compiled GCL is validated before it reaches `renderFilm`.

## 5. LessonSpec surface required by the lessons

### 5.1 Scene compositions

Support the existing four compositions plus:

- `split`
- `comparison`
- `process`
- `equation-plot`
- `data`
- `map`
- `timeline`
- `custom-relational`

Templates define safe zones and responsive constraints. They do not expose coordinates.

### 5.2 Content objects

The compiler must support these strict object variants:

- `text`: heading/title/body/bullet/caption and semantic kinetic text mode;
- `equation`;
- `stat`;
- `visual`: versioned catalog asset;
- `shape`: circle, polygon, star, heart, shaded disc;
- `curve`: safe parametric expressions and subject-data domain;
- `line`: straight, elbow, curved, arrow, traced;
- `chart`: bar, line, area, scatter, pie/donut, function, riemann;
- `legend`;
- `map`;
- `timeline`;
- `table`;
- `group`.

Every variant has its own required fields and rejects unrelated fields.

### 5.3 Data visuals

Chart data, mathematical formulae/domains, Riemann rectangle counts, geographic rings, named places,
map growth keyframes, years, timeline events/eras, and table cells are subject data and may be authored
directly.

Visual implementation values are semantic:

- chart and map series use category names or theme roles rather than literal colors;
- width and height derive from size/composition;
- axes and labels are booleans/text;
- line weights, donut ratios, bends, stagger timing, and playhead timing derive from registries and pace.

### 5.4 Asset system

The public `visual` kind resolves a semantic asset name to canonical prop, icon, vector, SVG, or image
implementations. LessonSpec never exposes those implementation types.

The first migration registry must include every asset used by the four reference lessons, including
cannon, planet, apple, neuron cell, ion channel, and reusable arrow/star symbols. Asset metadata stores
intrinsic bounds, orientations, materials, and anchors so layout and canonical rendering use the same
geometry.

## 6. Placement and anchors

Placement supports zones, relations, anchors, and geographic locations. The resolver builds a graph of
placement dependencies and evaluates targets before dependents. Cycles and ambiguous dotted IDs are
schema/semantic errors.

All objects publish generic `center`, `top`, `bottom`, `left`, and `right` anchors. Rich objects also
publish:

- props: catalog part anchors;
- charts: bars/points/slices, peak, first, last;
- shapes: vertices and cardinal points;
- maps: features, markers, places;
- timelines: events and playhead;
- groups: group and child anchors.

One shared resolved-target contract feeds lines, motion, camera, labels, attention, and flows. A target
cannot validate at one stage and disappear at another.

Layout uses intrinsic measurements, zone constraints, dependency placement, collision resolution, and
viewport fitting. Large objects cannot be stacked by a fixed offset that ignores their dimensions.

## 7. Beat actions and lifecycle

Beats remain sequential; actions within one beat are parallel. Supported actions:

- `show` / `hide`;
- `animate`;
- `camera`;
- `tour`;
- `label`;
- `attention`;
- `emphasize`;
- `reveal`;
- `atmosphere`;
- `flow`;
- `glow`.

Show supports every canonical entrance through semantic names: instant, fade, draw, wipe, iris,
radial-wipe, blinds, checkerboard, dissolve, masked, slam, word-by-word, typewriter, scramble,
staggered-build, and border-then-fill. Hide supports all existing exit families.

Each object receives an explicit resolved visibility window. Unsupported repeated lifecycle patterns
are validation errors, not compiler guesses.

## 8. Motion and modifiers

Semantic motion covers move, fall, orbit, follow-path, spin, trace-path, and morph. Distance, gravity,
bounce, direction, speed, cycle count, and trail persistence are finite semantic tokens. Mathematical
paths may reference `curve` objects.

Idle motion covers breathe, wobble, pulse, x/y drift, rotational drift, and scale pulse with semantic
intensity and pace.

Attention covers callout, highlight, spotlight, dim-others, pointer, box, brackets, encircle, converge,
spark, vignette, and rings. Emphasis covers punch, shake, pulse, wiggle, ghost, and magnify. Predictive
reveal exposes pose/pause/reveal semantics without authored seconds.

## 9. Camera and labels

Camera actions expose semantic shot, movement, framing, and level/tilt tokens. The resolver derives zoom,
pan, rotation, safe bounds, and transition duration from the target's resolved box.

Labels expose title/body, container, side preference, routing preference, and semantic marker style.
Automatic placement evaluates the camera-framed viewport and avoids target/content collisions.

Tour expands each stop into camera move, settle, label entrance, hold, label exit, and the next move.
One-at-a-time labels cannot accumulate. Optional overview return uses resolved scene bounds.

## 10. Atmosphere and effects

Atmosphere exposes fire, smoke, sparks, rain, snow, dust, confetti, and energy. The JSON uses semantic
intensity, density, spread, speed, scale, direction, area, and loop controls. Stable seeds derive from
lesson, scene, object/action IDs.

Flow connects anchors or geographic places with semantic route, direction, pace, intensity, and role.
Glow targets an object/anchor and derives extent, alpha, color, blend, layer, and lifecycle.

Particles, flow, and glow must honor explicit lifecycle windows. Unsupported modifier combinations are
rejected rather than ignored.

## 11. Per-lesson parity requirements

### Calculus

- six scenes;
- function, area, and Riemann charts;
- equations and numerical stats;
- staged prediction/reveal;
- callout, brackets, encircle, spark, camera push-in, and glow;
- wipe, dissolve, word-based text, and fade exits.

### Gravity

- six scenes;
- apple fall/bounce and cannon visual;
- multiple projectile curves and orbit transitions;
- circle/disc/path shapes, parametric curves, function/scatter charts;
- dust/spark atmosphere and glow;
- callout, highlight, pointer, spark, camera movement, idle breathing, and pulse emphasis.

### Mongol Empire

- six scenes;
- maps with named places, markers, flows, outlines, growth borders, feature colors, and staggering;
- timelines with events/eras/playheads;
- legend, stats, labels, camera tours, and map overview returns;
- semantic historical category palette shared between maps and legends.

### Neuron

- six scenes;
- neuron and ion-channel catalog visuals with part anchors;
- membrane/channel shapes, action-potential line charts, equation/stat/legend content;
- energy/dust/spark atmosphere, glow, and path-following signal motion;
- callout, spark, spotlight, camera push-ins, and pulse emphasis.

## 12. Validation and repair diagnostics

Validation returns all actionable errors in one pass with stable JSON-pointer paths, codes, received
values, suggestions, and available targets.

Required semantic diagnostics include duplicate/ambiguous IDs, unknown assets, unknown targets,
invalid anchors, placement cycles, unsupported lifecycle, capability mismatch, invalid subject data,
and canonical compilation failure.

One-of schema errors are collapsed to the relevant discriminated variant so the LLM receives concise
repair instructions instead of errors from every unrelated variant.

The LLM remains responsible for returning the complete corrected LessonSpec JSON after repair feedback.

## 13. Testing and parity gates

### Compiler and validation

- strict schema fixtures for every object/action variant;
- adversarial tests for every confirmed bug;
- canonical snapshots for each semantic capability;
- deterministic output checks;
- canonical validation checks;
- no forbidden implementation constants in any LessonSpec fixture.

### Lesson parity

Each new lesson must match its legacy reference for:

- scene count and scene order;
- educational text, equations, numerical data, map/timeline data;
- required object/effect/action capability sets;
- camera and label target coverage;
- entrance/exit/motion/attention families;
- duration within a documented semantic band;
- successful deterministic headless rendering across scene timelines.

Pixel equality is not required. Browser verification must reject blank assets, missing effects, wrong
targets, severe overlap, clipping, illegible labels, or materially different choreography.

### Backward compatibility

All existing GCL tests and legacy lessons remain green. Direct GCL entry points remain unchanged.

## 14. Implementation order

1. Add adversarial tests and fix target/lifecycle/asset/layout bugs.
2. Modularize the LessonSpec schema, registry, resolver, and compiler by capability.
3. Add shapes, curves, charts, legends, groups, and complete entrances/exits.
4. Add motion, idle, modifiers, attention, camera, and label routing.
5. Add maps, timelines, tables, geographic routes, and shared categories.
6. Add atmosphere, flow, glow, and deterministic seeds/lifecycle.
7. Re-author calculus and verify parity.
8. Re-author gravity and verify parity.
9. Re-author Mongol Empire and verify parity.
10. Re-author neuron and verify parity.
11. Run browser visual review, full regression, type-check, and production build.
12. Switch the application to the LessonSpec versions only after every gate passes.

## 15. Completion criteria

The work is complete only when all four lessons are authored entirely in LessonSpec, contain no
forbidden visual implementation constants, compile deterministically into canonical GCL, pass semantic
parity and headless render tests, pass browser visual review, and can replace the legacy versions in the
application without losing meaningful content or effects.

No git commit is created unless the user later explicitly requests one.
