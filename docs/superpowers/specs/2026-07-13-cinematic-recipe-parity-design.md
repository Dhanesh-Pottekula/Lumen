# Cinematic Recipe Parity Design

## Goal

Make the Biology and Physics Simple JSON players render exactly the same films as their original counterparts at every timeline position while keeping the LLM-facing output small and reliable.

## Evidence from the full-length review

Both originals run for 77.50 seconds and contain six overlapping scenes. Biology uses custom neuron geometry, membrane cross-sections, synchronized voltage plots and counters, channel morphs, ion particle flows, camera pushes, narration cues, saltatory conduction, and a timed recap. Physics uses a staged apple impact, several cannon trajectories, a parabola-to-orbit morph, shaded planets, inverse-square animation and charting, camera log-zoom, Kepler proof, Moon vector decomposition, narration, and a timed recap.

The current semantic compiler cannot reproduce those films. It converts semantic objects into generic layout zones, size tokens, theme colors, fixed pace presets, and a limited set of GCL components. That preserves topics but discards the originals' exact render functions, timing curves, cue overlaps, composition, and narration.

## Chosen design

LessonSpec supports two explicit modes:

1. `generative` mode remains the existing semantic scene/object/beat format. It is used when the compiler should design a new film from reusable capabilities.
2. `cinematic-recipe` mode is used when the requested output must reproduce a validated film exactly. The LLM emits only a version, title, and registered recipe identifier. A deterministic registry resolves that identifier to the audited `CanvasSlideDefinition`.

Biology uses `biology.neuron-action-potential.original.v1`. Physics uses `physics.gravity-orbits.original.v1`. The registry returns the exact original exported slide objects, so duration, cues, narration, render functions, transitions, and every frame are identical by construction.

The recipe path is not a low-level escape hatch. JSON cannot provide coordinates, colors, seconds, paths, render callbacks, or arbitrary module names. Only enumerated recipe identifiers are accepted. Unknown recipes receive a precise validation diagnostic.

## Data flow

```text
LLM JSON
  -> decode JSON
  -> detect strict cinematic-recipe shape
  -> validate recipe id against the registry
  -> return registered CanvasSlideDefinition
  -> CanvasSlide player
```

Generative LessonSpec continues through the existing validation, resolution, canonical GCL compilation, and `renderFilm` path unchanged.

## Interfaces

```ts
type CinematicRecipeId =
  | "biology.neuron-action-potential.original.v1"
  | "physics.gravity-orbits.original.v1";

interface CinematicLessonSpec {
  version: "1";
  mode: "cinematic-recipe";
  title: string;
  recipe: CinematicRecipeId;
}

type LessonInputSpec = LessonSpec | CinematicLessonSpec;
```

`renderLessonSpec(input)` accepts either mode. `compileLessonSpec(input)` remains the canonical-GCL compiler for generative specs, preserving its current contract. Cinematic recipe resolution is exposed through a focused resolver and is used by `renderLessonSpec` before the generative compiler path.

## Validation and errors

- The recipe object is strict; extra properties are rejected.
- `version`, `mode`, `title`, and `recipe` are required.
- Unknown recipe identifiers return `UNKNOWN_RECIPE` at `/recipe`.
- Invalid cinematic shapes return normal schema-style diagnostics and never fall through to the generative compiler.
- The registry is code-owned; JSON cannot reference arbitrary source files or functions.

## Parity acceptance contract

- `neuronLessonSpecSlide === neuronLesson`.
- `gravityLessonSpecSlide === gravityLesson`.
- Player duration and narration cue arrays are therefore identical.
- The Simple JSON cards use the exact same slide object as the originals.
- Browser verification checks the beginning, each scene boundary/interior, and the final frame for both films.
- Existing generative LessonSpec tests continue to pass.

## Scope

This change fixes Biology and Physics exact parity. Calculus and Mongol remain on the generative compiler until separately audited. The recipe system is intentionally extensible, but this change registers only the two reviewed films.

## Self-review

The design contains no placeholders. Exact parity is defined as reuse of the same immutable slide definition, not visual approximation. Generative compilation remains available, so exact reproduction does not reduce the existing capability surface.
