# Cinematic Recipe Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Biology and Physics Simple JSON players use the exact original 77.50-second films through validated cinematic recipe identifiers.

**Architecture:** Add a strict cinematic recipe input beside the existing generative LessonSpec format. Resolve registered recipes directly to audited `CanvasSlideDefinition` objects before the generative compile path, preserving exact frame and timing identity without exposing low-level values to the LLM.

**Tech Stack:** TypeScript, React, Vitest, existing CanvasSlide engine and LessonSpec validator.

## Global Constraints

- Do not commit changes.
- Biology and Physics must be frame-identical to their original exported films.
- The LLM-facing recipe JSON must not accept coordinates, colors, seconds, radii, paths, callbacks, or module paths.
- Existing generative LessonSpec behavior must remain unchanged.

---

### Task 1: Define strict cinematic recipe input

**Files:**
- Modify: `src/authoring/lessonSpec/types.ts`
- Create: `src/authoring/lessonSpec/recipes.test.ts`
- Create: `src/authoring/lessonSpec/recipes.ts`

**Interfaces:**
- Produces: `CinematicRecipeId`, `CinematicLessonSpec`, `LessonInputSpec`, and `resolveCinematicRecipe(input)`.

- [ ] Write failing tests requiring registered Biology and Physics recipes to resolve and unknown/extra fields to fail.
- [ ] Run `npm test -- src/authoring/lessonSpec/recipes.test.ts` and verify RED because the recipe API does not exist.
- [ ] Add the strict types, runtime shape validation, enumerated registry, and `UNKNOWN_RECIPE` diagnostic.
- [ ] Run the focused test and verify GREEN.

### Task 2: Route recipe inputs through `renderLessonSpec`

**Files:**
- Modify: `src/authoring/lessonSpec/index.ts`
- Modify: `src/authoring/lessonSpec/render.test.ts`

**Interfaces:**
- Consumes: `resolveCinematicRecipe(input)`.
- Produces: `renderLessonSpec(input)` returning the registered original slide for recipe mode while retaining the existing generative result shape.

- [ ] Add failing render tests requiring recipe results to return the exact original object.
- [ ] Run the focused render tests and verify RED.
- [ ] Decode once, resolve cinematic mode first, and fall back to the existing generative compiler only for non-cinematic input.
- [ ] Run the focused tests and verify GREEN.

### Task 3: Replace Biology and Physics authored specs

**Files:**
- Modify: `src/lessons/lessonSpec/neuron.ts`
- Modify: `src/lessons/lessonSpec/gravity.ts`
- Modify: `src/lessons/lessonSpec/index.ts`
- Modify: `src/lessons/lessonSpec/lessons.test.ts`
- Modify: `src/lessons/lessonSpec/parity.ts`

**Interfaces:**
- Produces: `neuronLessonSpec` and `gravityLessonSpec` as strict cinematic recipe JSON.

- [ ] Add failing lesson tests asserting `neuronLessonSpecSlide === neuronLesson` and `gravityLessonSpecSlide === gravityLesson` plus 77.50-second parity.
- [ ] Run the lesson tests and verify RED against the current generic films.
- [ ] Replace the two generative specs with recipe objects and make `renderStrict` accept `LessonInputSpec`.
- [ ] Update parity checks so recipe films use exact identity rather than generic capability minima.
- [ ] Run lesson and app tests and verify GREEN.

### Task 4: Browser and regression verification

**Files:**
- Modify: `src/App.test.tsx` only if copy assertions require the recipe mode wording.

**Interfaces:**
- Consumes the two exact-parity Simple JSON cards.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Reload the local app and play/scrub both Simple JSON cards at the audited checkpoints used during the full-length review.
- [ ] Confirm the Simple JSON and original cards have the same 77.50-second duration and identical frames.
- [ ] Leave the preview open without committing.

## Self-review

Every design requirement maps to a task. The type names and resolver names are consistent across tasks. There are no placeholders, and the plan explicitly preserves the existing generative compiler.
