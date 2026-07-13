# Original Lessons LessonSpec Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the calculus, gravity, Mongol Empire, and neuron GCL reference films as pure semantic LessonSpec JSON with visual and behavioral parity.

**Architecture:** Extend the existing validated LessonSpec → ResolvedLesson → canonical GCL pipeline by capability, fixing its target/lifecycle/layout contract before adding specialized objects and actions. Keep the legacy films unchanged as parity baselines and switch application consumption only after all four semantic versions pass structural, capability, headless-render, and browser checks.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12, Ajv, Vitest 4, Vite 7, existing GCL renderer/testkit.

## Global Constraints

- Do not create git commits.
- Preserve all pre-existing staged and unstaged changes.
- Audio, narration, TTS, captions, export, and publishing remain out of scope.
- LessonSpec rejects pixels, literal colors, seconds, numeric zoom/rotation, widths, radii, seeds, raw paths/SVG, and raw GCL.
- Formulae, chart data/domains, geographic coordinates/rings, historical dates, and table cells are allowed subject data.
- Existing GCL films and public entry points remain supported unchanged.
- Every validated target must resolve at the canonical renderer boundary; no center fallback on the validated path.
- The same LessonSpec input must produce deep-equal canonical GCL.
- The four migrations require visual/behavioral equivalence, not pixel identity.

---

## File map

### Core contracts and validation

- Modify `src/authoring/lessonSpec/types.ts` — full discriminated LessonSpec types.
- Split `src/authoring/lessonSpec/schema.ts` into focused schema builders only if it exceeds 500 lines; preserve `LESSON_SPEC_SCHEMA` export.
- Modify `src/authoring/lessonSpec/diagnostics.ts` — lifecycle, cycle, capability, and canonical error codes.
- Modify `src/authoring/lessonSpec/validate.ts` — object-only lifecycle targets, dependency cycles, target visibility, strict asset lookup.
- Create `src/authoring/lessonSpec/capabilities.ts` — executable mapping from LessonSpec surfaces to canonical GCL families.

### Resolution and compilation

- Modify `src/authoring/lessonSpec/registry.ts` — asset metadata, semantic camera/motion/effect/style values.
- Modify `src/authoring/lessonSpec/resolve.ts` — dependency layout, measured bounds, timing, target contract.
- Create `src/authoring/lessonSpec/target.ts` — parsed object/anchor references shared by validation, resolution, and compilation.
- Create `src/authoring/lessonSpec/compile/content.ts` — text/equation/stat/visual/shape/curve/line/group.
- Create `src/authoring/lessonSpec/compile/data.ts` — charts/legends/maps/timelines/tables.
- Create `src/authoring/lessonSpec/compile/actions.ts` — lifecycle, motion, camera, labels, attention, modifiers, effects.
- Modify `src/authoring/lessonSpec/compile.ts` — orchestration only.
- Create `src/authoring/lessonSpec/canonical.ts` — canonical GCL validation.

### Canonical engine hardening

- Modify `src/render/gcl/subanchors.ts` — generic anchors for every drawable.
- Modify `src/render/gcl/compile.ts` — effect lifecycle and per-scene target correctness where required.
- Modify `src/render/gcl/index.ts` — per-scene theme/transition plumbing only if required by migrated fixtures.

### Semantic lessons

- Create `src/lessons/lessonSpec/calculus.ts`.
- Create `src/lessons/lessonSpec/gravity.ts`.
- Create `src/lessons/lessonSpec/mongol.ts`.
- Create `src/lessons/lessonSpec/neuron.ts`.
- Create `src/lessons/lessonSpec/parity.ts`.
- Create `src/lessons/lessonSpec/lessons.test.ts`.
- Modify `src/App.tsx` only after all parity gates pass.

---

### Task 1: Unify target parsing and harden asset lookup

**Interfaces:**

```ts
export interface TargetRef { raw: string; objectId: string; anchor?: string }
export function parseTarget(raw: string, objectIds: ReadonlySet<string>): TargetRef;
export function targetPoint(ref: TargetRef, objects: ReadonlyMap<string, ResolvedObject>): Point | undefined;
```

- [ ] Add failing tests proving dotted IDs are rejected, show/hide anchor targets fail, `constructor`/`__proto__` are unknown assets, and generic camera/label anchors survive canonical layout.
- [ ] Run `npm test -- src/authoring/lessonSpec/validate.test.ts src/render/gcl/subanchors.test.ts`; confirm the new cases fail for the reviewed reasons.
- [ ] Add an ID pattern that permits letters/numbers/`_`/`-` but not `.`, `/`, or whitespace.
- [ ] Implement `parseTarget`; use exact IDs for show/hide and object-plus-anchor for spatial actions.
- [ ] Replace `name in PROP_CATALOG` with `Object.hasOwn(PROP_CATALOG, name)`.
- [ ] Publish `center/top/bottom/left/right` from canonical `subAnchors()` for every drawable, merged with specialized anchors.
- [ ] Run the focused tests and `npx tsc --noEmit`.

### Task 2: Make lifecycle explicit and validated

**Interfaces:**

```ts
export interface VisibilityWindow {
  initiallyVisible: boolean;
  show?: { beat: number; action: number };
  hide?: { beat: number; action: number };
}
export function resolveVisibility(scene: SceneSpec): ValidationResult<Map<string, VisibilityWindow>>;
```

- [ ] Add failing tests for initial-visible plus later show, show-hide-show, hide-before-show, hidden-never-shown camera targets, and parallel same-beat visibility.
- [ ] Define v1 lifecycle as at most one show and one later hide per object. Reject redundant/repeated/reversed actions with `INVALID_LIFECYCLE`.
- [ ] Treat all show actions in a beat as visible for other parallel actions in that beat.
- [ ] Keep hidden camera/attention targets in canonical layout only when a future show exists; reject never-shown targets.
- [ ] Compile initial-visible objects at time zero regardless of later references.
- [ ] Run lifecycle/compiler/headless tests.

### Task 3: Replace one-pass placement with a dependency resolver

**Interfaces:**

```ts
export function placementDependencies(object: ObjectSpec): string[];
export function orderObjects(objects: ObjectSpec[]): ValidationResult<ObjectSpec[]>;
export function fitScene(objects: ResolvedObject[], composition: CompositionToken): ResolvedObject[];
```

- [ ] Add failing tests for forward chains, anchor-relative chains, self cycles, multi-object cycles, large-object overlap, and viewport clipping.
- [ ] Topologically order relative/anchor placements while preserving source order among independent objects.
- [ ] Return `PLACEMENT_CYCLE` with every involved object/path.
- [ ] Add per-asset intrinsic bounds to the asset registry; use the same bounds for resolved and canonical geometry.
- [ ] Replace fixed 54-unit zone stacking with measured gap placement and deterministic collision shifts.
- [ ] Fit oversized zone content into safe composition bounds using semantic size downgrades before clipping.
- [ ] Run resolver and render tests.

### Task 4: Expand strict content and composition schemas

**Produces:** strict variants for `shape`, `curve`, `chart`, `legend`, `map`, `timeline`, `table`, and `group`; compositions `split`, `comparison`, `process`, `equation-plot`, `data`, `map`, `timeline`, `table`, and `custom-relational`.

- [ ] Add schema/type parity tests containing one minimal valid fixture per variant and incompatible-field rejection cases.
- [ ] Add type variants with semantic size/style fields and subject-data-only numbers.
- [ ] Add strict JSON Schema variants with `additionalProperties:false` at every level.
- [ ] Collapse Ajv `oneOf` errors to the selected `kind`/`do` variant.
- [ ] Extend composition zone templates and registry sizes.
- [ ] Run schema tests and type-check.

### Task 5: Compile shapes, curves, lines, groups, and all entrances

**Interfaces:**

```ts
export function compileContent(object: ResolvedObject, context: CompileContext): Component;
export function resolveEntrance(spec: ShowAction, pace: PaceDefinition): EnterSpec;
export function resolveExit(spec: HideAction, pace: PaceDefinition): ExitSpec;
```

- [ ] Add compiler tests for every shape, safe parametric curve, straight/elbow/curved/arrow/traced line, nested group, build sequence, and every entrance/exit family.
- [ ] Derive shape radii, curve samples, arrowheads, path smoothing, line weights, masks, slat counts, seeds, and build steps from registries.
- [ ] Compile arrow as shaft plus oriented head; never as a plain two-point path.
- [ ] Compile groups recursively with semantic row/stack/grid spacing and child anchors.
- [ ] Validate generated canonical components.
- [ ] Run focused compiler and GCL render tests.

### Task 6: Compile charts, legends, maps, timelines, and tables

**Interfaces:**

```ts
export function compileDataObject(object: ResolvedObject, context: CompileContext): Component;
export function categoryColor(theme: ThemeName, category: string, index: number): string;
```

- [ ] Add strict fixtures for bar/line/area/scatter/pie/donut/function/riemann charts.
- [ ] Compile semantic chart dimensions, axes, domains, labels, colors, donut ratio, and Riemann build.
- [ ] Ensure chart anchors match canonical plotted geometry.
- [ ] Compile legends from the same category-color resolver.
- [ ] Compile map features/rings/places/markers/flows/outlines/growth/staggering from subject data plus semantic route/timing tokens.
- [ ] Compile timeline ranges/events/eras/fixed and animated playheads.
- [ ] Compile tables with semantic width/row spacing and progressive construction.
- [ ] Run data-object, subanchor, and headless render tests.

### Task 7: Compile motion, idle motion, emphasis, and predictive reveal

**Interfaces:**

```ts
export function compileMotion(action: AnimateAction, context: CompileContext): MotionSpec;
export function compileIdle(idle: IdleSpec, context: CompileContext): OscillateSpec;
export function applyModifiers(component: Component, actions: ResolvedAction[]): Component;
```

- [ ] Add tests for move/fall/orbit/follow-path/spin/trace-path/morph.
- [ ] Resolve semantic distance, gravity, bounce, direction, speed, turns, trail and morph geometry through registries.
- [ ] Resolve referenced paths to safe canonical point arrays internally.
- [ ] Compile breathe/wobble/pulse/drift idle modes.
- [ ] Compile punch/shake/pulse/wiggle/ghost/magnify and predict/pose/reveal modifiers.
- [ ] Reject conflicting simultaneous modifiers with `CAPABILITY_MISMATCH`.
- [ ] Run motion/modifier and deterministic seek tests.

### Task 8: Compile camera, labels, attention, atmosphere, flow, and glow

- [ ] Add tests for every attention verb, camera shot/movement/framing/rotation token, label side/route/container, and tour sequencing.
- [ ] Frame camera from the resolved target box rather than a fixed zoom alone; clamp to safe scene bounds.
- [ ] Select automatic label side/route by available framed space and deterministic collision scoring.
- [ ] Compile all attention verbs with target-derived extent.
- [ ] Add atmosphere/flow/glow schemas and semantic registries.
- [ ] Derive stable effect seeds from `lessonId/sceneId/actionId`; never accept authored seeds.
- [ ] Give particles/flow/glow explicit start/end lifecycle in canonical rendering.
- [ ] Run attention/effect lifecycle and headless render tests.

### Task 9: Add canonical validation and an executable parity manifest

**Interfaces:**

```ts
export function validateCanonicalFilm(film: Film): ValidationResult<Film>;
export interface LessonParityManifest {
  scenes: number;
  requiredComponents: Record<string, number>;
  requiredActions: string[];
  requiredTargets: string[];
  durationBand: [number, number];
}
```

- [ ] Add failing tests for malformed generated GCL, missing IDs/targets, unsupported prop names, invalid numeric values, and missing scene markers.
- [ ] Validate canonical output after compilation and return `CANONICAL_ERROR` diagnostics instead of rendering.
- [ ] Encode the audited capability counts and targets for the four legacy films in `parity.ts`.
- [ ] Add helpers comparing compiled LessonSpec films to manifests without requiring pixel equality.
- [ ] Run canonical and parity tests.

### Task 10: Re-author the calculus lesson

- [ ] Translate all six legacy scenes into `calculusLessonSpec` using text/equation/stat/chart objects and beat actions.
- [ ] Preserve function/area/Riemann subject data, prediction sequence, attention verbs, camera push, glow, and entrance/exit families.
- [ ] Assert no forbidden constants via recursive key/value inspection.
- [ ] Assert the calculus parity manifest and render every compiled scene at start/mid/end.
- [ ] Compare browser frames for all six scenes and correct semantic composition/registry choices rather than inserting hard values.

### Task 11: Re-author the gravity lesson

- [ ] Translate all six scenes into `gravityLessonSpec` with apple/cannon/planet assets, shapes, curves, charts, atmosphere, motion, and camera beats.
- [ ] Preserve fall/bounce, projectile curves, orbit choreography, idle breathing, emphasis, attention, glow, dust, and sparks.
- [ ] Run forbidden-value, parity-manifest, deterministic, and headless render tests.
- [ ] Browser-check all scenes for trajectory correctness, camera framing, clipping, and missing effects.

### Task 12: Re-author the Mongol Empire lesson

- [ ] Translate all six scenes into `mongolLessonSpec` with exact historical subject data from the legacy constants.
- [ ] Preserve named places, markers, flows, outlines, growth borders, feature staggering, timelines, eras, playheads, legend categories, camera tours, and labels.
- [ ] Share category colors between maps and legends through semantic category names.
- [ ] Run forbidden-value, parity-manifest, deterministic, geographic-target, and headless render tests.
- [ ] Browser-check map legibility, flows, labels, timeline alignment, and camera returns.

### Task 13: Re-author the neuron lesson

- [ ] Translate all six scenes into `neuronLessonSpec` with neuron/ion-channel assets, membrane shapes, charts, ions, signal paths, atmosphere, and modifiers.
- [ ] Preserve all catalog part targets, action-potential data, energy flows, path-following signal, glow, camera pushes, callouts, sparks, spotlight, and pulse emphasis.
- [ ] Run forbidden-value, parity-manifest, deterministic, anchor, and headless render tests.
- [ ] Browser-check channel geometry, signal motion, chart labels, label collisions, and camera targets.

### Task 14: Switch application consumption and run final verification

- [ ] Export all four compiled LessonSpec slides from `src/lessons/lessonSpec/`.
- [ ] Update `src/App.tsx` to consume the LessonSpec versions while leaving legacy exports intact.
- [ ] Run `npm test -- --run`; expect zero failures.
- [ ] Run `npx tsc --noEmit`; expect exit 0 with no output.
- [ ] Run `npm run build`; expect Vite production build exit 0.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Verify `git log -1` is unchanged; do not commit.

## Completion gate

Do not describe the migration as complete until all four semantic lessons pass their parity manifests,
headless timelines, browser visual checks, full regression suite, type-check, and production build.
