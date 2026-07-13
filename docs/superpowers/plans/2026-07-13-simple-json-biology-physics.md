# Pure Simple JSON Biology and Physics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Biology neuron and Physics gravity cinematic recipe selectors with six-scene semantic `LessonSpec` documents compiled through the normal Simple JSON pipeline.

**Architecture:** Keep the recipe infrastructure for compatibility but remove all recipe usage from the two checked-in lessons. Author each lesson from existing generic objects, assets, charts, relationships, and beat actions; use the existing strict validator and GCL compiler unchanged unless a concrete semantic gap blocks a required scene.

**Tech Stack:** TypeScript 5.9, AJV JSON Schema validation, canonical GCL compiler, HTML5 Canvas renderer, React 19, Vite 7.

## Global Constraints

- Biology and Physics each contain exactly six generative scenes.
- Every scene declares a composition, semantic objects, and at least one beat.
- No raw pixels, colors, seconds, Canvas callbacks, SVG paths, or whole-scene prebuilt assets are added to LessonSpec.
- Existing small reusable assets (`neuronCell`, `ionChannel`, `cannon`, `apple`, `planet`, `arrow`, and `star`) are allowed.
- The cinematic-recipe resolver and registry remain available but are unused by these two lesson exports.
- Teaching sequence and approximate visual quality are required; pixel-identical parity is not.
- The existing untracked `docs/SIMPLE-JSON-AUTHORING-GUIDE.md` belongs to the user and must not be modified or committed.

---

## File structure

- Modify `src/lessons/simple-json/neuron.ts`: own the complete Biology `LessonSpec`, including shared action-potential series data and six scenes.
- Modify `src/lessons/simple-json/gravity.ts`: own the complete Physics `LessonSpec`, including Kepler series data and six scenes.
- Modify `src/lessons/simple-json/parity.ts`: define generative feature contracts for the compiled films.
- Modify `src/lessons/simple-json/index.ts`: require parity checks for all four checked-in generative lessons before returning rendered slides.

### Task 1: Enforce generative lesson parity at the integration boundary

**Files:**
- Modify: `src/lessons/simple-json/parity.ts`
- Modify: `src/lessons/simple-json/index.ts`

**Interfaces:**
- Consumes: `renderLessonSpec(spec: LessonInputSpec): RenderLessonResult`, `checkLessonParity(film: Film, manifest: LessonParityManifest): string[]`.
- Produces: `renderStrict(spec: LessonInputSpec, manifest?: LessonParityManifest): CanvasSlideDefinition`, which rejects recipe-backed or semantically incomplete checked-in lessons when a manifest is supplied.

- [ ] **Step 1: Run the failing source acceptance check**

```bash
rg -n 'CinematicLessonSpec|mode: "cinematic-recipe"|recipe:' src/lessons/simple-json/neuron.ts src/lessons/simple-json/gravity.ts
```

Expected: six matching lines across the two files, proving both lessons still use recipes.

- [ ] **Step 2: Add an integration assertion for generative results**

Change `renderStrict` in `src/lessons/simple-json/index.ts` to accept an optional manifest and verify that a successful result contains canonical `gcl` output:

```ts
function renderStrict(spec: LessonInputSpec, manifest?: LessonParityManifest): CanvasSlideDefinition {
  const result = renderLessonSpec(spec);
  if (!result.valid) {
    throw new Error(`${spec.title} LessonSpec is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
  }
  if (manifest) {
    if (!("gcl" in result)) throw new Error(`${spec.title} must use generative LessonSpec, not a cinematic recipe`);
    const failures = checkLessonParity(result.gcl, manifest);
    if (failures.length) throw new Error(`${spec.title} parity failed: ${failures.join("; ")}`);
  }
  return result.slide;
}
```

Import `LessonParityManifest`, pass the four manifests into the four `renderStrict` calls, and retain all current exports.

- [ ] **Step 3: Lower recipe-era manifests to semantic contracts representable by Simple JSON**

Keep six scenes for every lesson. Use these minimum contracts:

```ts
gravity: {
  scenes: 6,
  required: {
    "type:prop": 5,
    "type:parametric": 2,
    "chart:function": 1,
    "chart:scatter": 1,
    "motion:fall": 1,
    "motion:orbit": 2,
    "type:particles": 2,
    "type:glow": 2,
    "type:attention": 4,
    "type:camera": 3,
  },
},
neuron: {
  scenes: 6,
  required: {
    "type:prop": 5,
    "chart:line": 3,
    "type:particles": 3,
    "type:flow": 2,
    "type:glow": 2,
    "motion:along": 1,
    "type:group": 1,
    "type:attention": 6,
    "type:camera": 2,
  },
},
```

Leave Calculus and Mongol contracts unchanged.

- [ ] **Step 4: Run the build and confirm the new assertion rejects recipe results in the application**

```bash
npm run build
```

Expected: TypeScript and Vite succeed; opening the application before Tasks 2 and 3 reports the explicit generative-only assertion for Biology or Physics.

- [ ] **Step 5: Commit the integration contract**

```bash
git add src/lessons/simple-json/parity.ts src/lessons/simple-json/index.ts
git commit -m "test: require generative biology and physics lessons"
```

### Task 2: Re-author Biology as a six-scene LessonSpec

**Files:**
- Modify: `src/lessons/simple-json/neuron.ts`

**Interfaces:**
- Consumes: `LessonSpec`, `kind: "visual"` assets `neuronCell` and `ionChannel`, chart series, group layout, line relationships, and beat actions.
- Produces: `neuronLessonSpec: LessonSpec` with six scenes and no cinematic recipe fields.

- [ ] **Step 1: Replace the recipe import and declare shared voltage series**

Use `import type { LessonSpec } from "../../simple-json";` and define the complete curve plus rise and fall subsets:

```ts
const ACTION_POTENTIAL: [number, number][] = [
  [0, -70], [0.08, -70], [0.16, -68], [0.22, -62], [0.27, -55],
  [0.31, -40], [0.35, -10], [0.39, 20], [0.43, 38], [0.46, 40],
  [0.5, 30], [0.55, 5], [0.6, -25], [0.66, -55], [0.72, -72],
  [0.78, -82], [0.84, -80], [0.9, -76], [0.96, -72], [1, -70],
];
const DEPOLARIZATION = ACTION_POTENTIAL.filter(([x]) => x <= 0.46);
const REPOLARIZATION = ACTION_POTENTIAL.filter(([x]) => x >= 0.46);
```

- [ ] **Step 2: Add scene 1, `neuron-anatomy`**

Use composition `hero-diagram`. Required objects are `title`, `cell` (`visual/neuronCell`), an `axon` line from `cell.axonRoot` to `terminals.center`, a row group `myelin` containing five shaded discs, `terminals` (star), and `flow-caption`. Beats reveal the anatomy, draw the axon, show myelin/terminals, then call out `cell.dendriteTip1`, `cell.soma`, and `cell.axonRoot`, followed by a medium camera push to `cell.soma`.

- [ ] **Step 3: Add scene 2, `resting-membrane`**

Use composition `overview-detail`. Required objects are `title`, `outside`, `inside`, two `ionChannel` visuals, a membrane line, `rest` stat at `-70 mV`, Nernst equation, and a sodium/potassium legend. Beats show the membrane model, add particle effects outside and inside through two particle actions, label the ion channels, and reveal the equation.

- [ ] **Step 4: Add scene 3, `threshold-spike`**

Use composition `equation-plot`. Required objects are `title`, `chart` (`line`, `DEPOLARIZATION`, domains `[0, 0.46]` and `[-90, 50]`), `channel` (`ionChannel`), threshold equation, and peak stat. Beats reveal the chart/channel, flow from `channel.top` to `channel.bottom`, call out `chart.last` as depolarization, spark the peak, and push the camera to `chart.last`.

- [ ] **Step 5: Add scene 4, `repolarization`**

Use composition `equation-plot`. Required objects are `title`, `chart` (`line`, `REPOLARIZATION`, domains `[0.46, 1]` and `[-90, 50]`), `channel`, recovery text, and resting stat. Beats reveal all objects, flow from `channel.bottom` to `channel.top`, call out `chart.pt3` as repolarization and `chart.pt7` as hyperpolarization, then spotlight `chart.pt7`.

- [ ] **Step 6: Add scene 5, `travelling-wave`**

Use composition `process`. Required objects are `title`, `cell` (`neuronCell`), `terminals`, an `axon` line, a row `myelin` group, and `signal` shape anchored to `cell.axonRoot`. Beats reveal the system, move `signal` along `axon`, add glow to `signal`, spark `myelin`, call out the terminals, and move the camera from `cell.soma` to `terminals.center`.

- [ ] **Step 7: Add scene 6, `neuron-recap`**

Use composition `data`. Required objects are `title`, full `chart` line, `equation`, `neurons` stat with `86_000_000_000`, `cell` visual, and closing text. Beats reveal the summary, call out `chart.pt4`, `chart.peak`, and `chart.pt15`, pulse the equation, and glow the cell.

- [ ] **Step 8: Run focused source and build checks**

```bash
! rg -n 'CinematicLessonSpec|mode: "cinematic-recipe"|recipe:' src/lessons/simple-json/neuron.ts
npm run build
```

Expected: no recipe match; TypeScript and Vite succeed once the manifest counts are satisfied.

- [ ] **Step 9: Commit Biology**

```bash
git add src/lessons/simple-json/neuron.ts
git commit -m "feat: author neuron lesson in simple json"
```

### Task 3: Re-author Physics as a six-scene LessonSpec

**Files:**
- Modify: `src/lessons/simple-json/gravity.ts`

**Interfaces:**
- Consumes: `LessonSpec`, generic `tree`, `apple`, `cannon`, `planet`, `arrow`, and `star` assets; function/scatter charts; parametric curves; motion and camera actions.
- Produces: `gravityLessonSpec: LessonSpec` with six scenes and no cinematic recipe fields.

- [ ] **Step 1: Replace the recipe import and declare Kepler data**

```ts
import type { LessonSpec } from "../../simple-json";

const KEPLER_SERIES: [number, number][] = [
  [0.39, 0.24], [0.72, 0.62], [1, 1], [1.52, 1.88],
  [5.2, 11.86], [9.54, 29.46],
];
```

- [ ] **Step 2: Add scene 1, `falling-apple`**

Use composition `hero-diagram`. Required objects are `title`, `tree`, `apple`, `ground`, `gravity-arrow`, `question`, and `newton`. Beats reveal the garden, fall the apple to `ground.top` with a strong bounce, spark/glow the impact, call out the apple, and reveal the question.

- [ ] **Step 3: Add scene 2, `newtons-cannon`**

Use composition `custom-relational`. Required objects are `title`, `earth` (`planet`), `cannon`, two parametric curves anchored to `cannon.muzzle`, `cannonball`, and `orbit-label`. Curves use domains `[0, 1]` and formulas that show short and long downward arcs. Beats reveal the experiment, draw both trajectories, orbit the cannonball around Earth, call out the orbit, and use a wide camera push.

- [ ] **Step 4: Add scene 3, `inverse-square-law`**

Use composition `equation-plot`. Required objects are `title`, gravitational equation, `m1`, `m2`, a connecting arrow line, `chart` with function `1/(x*x)`, domains `[1, 6]` and `[0, 1]`, and a `quarter` stat. Beats reveal masses/equation, point between the masses, reveal the chart, and call out the inverse-square relationship.

- [ ] **Step 5: Add scene 4, `kepler-proof`**

Use composition `data`. Required objects are `title`, `sun` (`star`), two planet visuals, `scatter` chart from `KEPLER_SERIES`, Kepler equation, and caption. Beats reveal the system, orbit both planets around the sun at different scales/directions, reveal the scatter chart, call out its last point, and move the camera between the inner system and chart.

- [ ] **Step 6: Add scene 5, `moon-orbit`**

Use composition `hero-diagram`. Required objects are `title`, `earth`, `moon`, `velocity` arrow, `gravity` arrow, orbit curve, and explanatory text. Beats reveal the system, orbit the moon around Earth, emphasize the arrows, add glow to Earth/Moon, label sideways velocity and inward gravity, and push the camera to the Moon.

- [ ] **Step 7: Add scene 6, `gravity-recap`**

Use composition `overview-detail`. Required objects are `title`, `earth`, `moon`, `apple`, gravitational equation, `orbit-stat`, and closing text. Beats reveal the summary, fall the apple, orbit the Moon, pulse the equation, add particle/glow effects, and return the camera to an overview.

- [ ] **Step 8: Run focused source and build checks**

```bash
! rg -n 'CinematicLessonSpec|mode: "cinematic-recipe"|recipe:' src/lessons/simple-json/gravity.ts
npm run build
```

Expected: no recipe match; TypeScript and Vite succeed and the gravity manifest reports no missing feature tokens.

- [ ] **Step 9: Commit Physics**

```bash
git add src/lessons/simple-json/gravity.ts
git commit -m "feat: author gravity lesson in simple json"
```

### Task 4: Verify all lessons and visually review every migrated scene

**Files:**
- Modify only if verification finds a defect: `src/lessons/simple-json/neuron.ts`, `src/lessons/simple-json/gravity.ts`, `src/lessons/simple-json/parity.ts`, `src/lessons/simple-json/index.ts`

**Interfaces:**
- Consumes: the four exported lesson specs and the application lesson cards.
- Produces: a production build and twelve reviewed generative scenes with no invalid references, lifecycle errors, or major layout collisions.

- [ ] **Step 1: Run repository checks**

```bash
npm run build
git diff --check
```

Expected: both commands exit 0.

- [ ] **Step 2: Confirm both source files are generative**

```bash
! rg -n 'CinematicLessonSpec|mode: "cinematic-recipe"|recipe:' src/lessons/simple-json/neuron.ts src/lessons/simple-json/gravity.ts
rg -n 'export const (neuron|gravity)LessonSpec: LessonSpec' src/lessons/simple-json/neuron.ts src/lessons/simple-json/gravity.ts
```

Expected: the negative search exits 0 and the positive search returns exactly two exports.

- [ ] **Step 3: Start the application and review Biology**

```bash
npm run dev -- --host 127.0.0.1
```

Open the local application, select “The Neuron Fires — Simple JSON,” and inspect the beginning, middle, and end of each scene. Confirm title/content legibility, target callouts, chart domains, camera framing, and the anatomy → membrane → spike → recovery → travelling wave → recap progression.

- [ ] **Step 4: Review Physics**

Select “Why the Moon Doesn't Fall — Simple JSON” and inspect the beginning, middle, and end of each scene. Confirm the apple fall, cannon trajectories, orbit motion, inverse-square chart, Kepler comparison, Moon vectors, and final recap are visible and understandable.

- [ ] **Step 5: Regression-review Calculus and History**

Open one representative scene from each existing generative lesson and confirm the stricter integration parity check did not alter rendering.

- [ ] **Step 6: Fix only observed defects and repeat verification**

For each observed defect, make the smallest semantic change to the responsible lesson object or beat, then rerun:

```bash
npm run build
git diff --check
```

Expected: both commands exit 0 after every correction.

- [ ] **Step 7: Commit verification fixes if needed**

```bash
git add src/lessons/simple-json/neuron.ts src/lessons/simple-json/gravity.ts src/lessons/simple-json/parity.ts src/lessons/simple-json/index.ts
git commit -m "fix: polish generative science lessons"
```

Skip this commit when visual verification required no changes.
