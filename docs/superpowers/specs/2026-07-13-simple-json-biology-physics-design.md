# Pure Simple JSON Biology and Physics Lessons

## Goal

Replace the Biology neuron and Physics gravity lesson recipe references with genuine `LessonSpec`
documents. Each lesson will define six semantic scenes through `composition`, `objects`, and `beats`
and will compile through the same validated Simple JSON pipeline used by Calculus and History.

The new lessons must preserve the originals' teaching sequence and approximate visual quality. They do
not need pixel-identical layouts, timing, narration, or transitions.

## Current state

Biology and Physics currently use `mode: "cinematic-recipe"`. Their nine-line specifications select
hand-authored `CanvasSlideDefinition` implementations from a recipe registry. This gives exact parity
with the originals but does not exercise the semantic Simple JSON authoring model.

History and Calculus already use ordinary `LessonSpec` documents and establish the target pattern.
Reusable generic assets and renderer capabilities also already exist for neuron cells, ion channels,
cannons, apples, planets, curves, charts, particles, motion, camera actions, labels, and attention
effects.

## Chosen approach

Re-author both lessons directly in Simple JSON, using the existing GCL neuron and gravity films only
as teaching and visual references. Prefer current semantic components and registries. Add a generic
compiler capability only if a required teaching moment cannot be represented with the existing
schema; do not add lesson-specific escape hatches, raw Canvas callbacks, pixel coordinates, colors,
or timing values.

The cinematic-recipe types, resolver, and registry remain in place for backward compatibility, but
the Biology and Physics lesson cards no longer reference them.

## Alternatives considered

### Keep cinematic recipes

This preserves the originals exactly but fails the requirement that the lessons be authored through
Simple JSON.

### Add large lesson-specific composite assets

This could make the JSON appear generative while hiding most composition in code-owned assets. Small
reusable props such as `neuronCell` and `planet` are appropriate; an entire neuron lesson or orbital
scene as one asset is not.

### Expand the compiler before authoring

A broad capability expansion might improve fidelity but would increase scope without evidence that
the current schema is insufficient. Capability work will therefore be demand-driven and generic.

## Architecture and data flow

Each lesson follows the normal generative path:

```text
LessonSpec scenes/objects/beats
  -> structural and reference validation
  -> semantic layout, style, and timing resolution
  -> canonical GCL Film generation
  -> existing deterministic Canvas renderer
```

The lesson entry files export `LessonSpec`, not `CinematicLessonSpec`. The existing
`renderStrict` integration remains unchanged and will compile the specifications through
`renderLessonSpec`.

## Biology lesson structure

Biology remains a six-scene explanation of the action potential:

1. **Neuron anatomy** — reveal the neuron cell, axon path, myelin, and terminals; label dendrites,
   soma, and axon.
2. **Resting membrane** — show a membrane model, ion channels, sodium/potassium context, and the
   resting potential statistic.
3. **Threshold and depolarization** — introduce the action-potential rise, threshold, ion flow,
   and channel activity.
4. **Repolarization** — complete the voltage curve, show potassium flow, and identify the
   hyperpolarization dip.
5. **Travelling signal** — move a signal along the axon, use camera and glow/flow actions, and
   explain saltatory conduction.
6. **Recap** — combine the neuron, full line chart, key labels, and scale statistic.

The `neuronCell` and `ionChannel` assets remain reusable primitives. Axon relationships, charts,
labels, flows, and choreography remain separately visible in the JSON.

## Physics lesson structure

Physics remains a six-scene explanation of gravity and orbit:

1. **Falling apple** — establish ordinary falling motion and gravitational attraction.
2. **Newton's cannon** — show increasingly fast launches and relate horizontal motion to falling.
3. **Orbit** — transition from a curved trajectory to continuous free fall around Earth.
4. **Inverse-square law** — present the equation and function chart with an explanatory callout.
5. **Kepler relationship** — compare orbital distance and period using data and orbital motion.
6. **Moon recap** — combine Earth, Moon, velocity/gravity directions, equation, and summary.

The `cannon`, `apple`, and `planet` assets remain small reusable primitives. Trajectories, equations,
charts, motion, attention, and camera choreography remain authored in the JSON.

## Authoring constraints

- Both files use `LessonSpec` with exactly six scenes.
- Every scene declares `composition`, `objects`, and at least one beat.
- All cross-object references resolve to declared object IDs or published sub-anchors.
- Objects are placed using zones, semantic relationships, or anchors—never raw pixels.
- Visual timing uses pace tokens; appearance uses themes, roles, and semantic asset styling.
- Lesson-specific code does not contain Canvas callbacks or raw drawing instructions.
- Reusable assets may be used, but no new asset may encapsulate a complete scene.

## Validation and errors

The existing strict schema remains the source of truth. Unknown fields, invalid tokens, duplicate
IDs, and unresolved references must fail compilation with structured diagnostics. `renderStrict`
continues to throw at application startup if either checked-in lesson is invalid.

If authoring exposes a schema limitation, the implementation must first demonstrate the failing
teaching requirement. Any schema addition must be generic, finite, validated, compiled to canonical
GCL, and documented. Silent fallbacks are not acceptable.

## Verification

Verification will include:

1. Static type checking and the production Vite build through `npm run build`.
2. Successful strict validation and compilation of both new `LessonSpec` documents.
3. Six compiled scenes per lesson.
4. Semantic coverage checks for the important lesson features already listed in the parity
   manifests, adjusted only where a feature is intentionally represented by an equivalent existing
   Simple JSON construct.
5. Browser review of representative frames from every scene, checking legibility, overlap, camera
   framing, entrance order, and the intended teaching progression.
6. Confirmation that History and Calculus still compile and render through the unchanged generative
   path.

## Scope boundaries

This work changes the Biology and Physics checked-in lesson specifications and any narrowly required
generic compiler support. It does not delete cinematic-recipe compatibility, rewrite the original
hand-authored lessons, change History or Calculus content, add narration/audio, or promise
pixel-identical parity.

## Acceptance criteria

- Biology and Physics no longer use `mode: "cinematic-recipe"` or a `recipe` identifier.
- Both are readable six-scene `LessonSpec` documents built from semantic objects and beats.
- Both compile and render successfully with the normal Simple JSON pipeline.
- Their teaching arcs and major visual concepts match the original lessons.
- No complete lesson or scene is hidden behind a new prebuilt asset or callback.
- Existing generative lessons continue to build successfully.

## Self-review

The design contains no placeholders or unresolved choices. It consistently favors semantic
LessonSpec authoring over exact reproduction, keeps compatibility infrastructure without using it
for the two migrated lessons, and limits compiler changes to demonstrated generic gaps. The scope is
large but cohesive: both migrations use the same schema, compiler, verification workflow, and
acceptance contract.
