# LessonSpec Milestone 1 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strict, deterministic LessonSpec-to-GCL vertical slice that validates LLM JSON and compiles semantic text, equation, stat, catalog visual, line, show, camera, label, and tour instructions into the existing GCL renderer.

**Architecture:** Add a focused `src/authoring/lessonSpec/` package containing types, JSON Schema validation, diagnostics, semantic registries, resolution, and compilation. The package emits the existing GCL `Film`; no renderer replacement is introduced. This milestone also fixes attention exit lifecycle because camera tours require labels to disappear reliably.

**Tech Stack:** TypeScript 5.9, JSON Schema Draft 2020-12, Ajv, Vitest 4, existing GCL compiler and headless canvas testkit.

## Global Constraints

- Do not create git commits; the user explicitly requested uncommitted implementation.
- Preserve all unrelated staged and unstaged changes.
- Audio, narration, TTS, captions, export, and publishing remain out of scope.
- LLM JSON must reject pixels, colors, seconds, numeric camera values, raw SVG, and raw GCL.
- Subject data such as stat values and equation text remains allowed.
- Same LessonSpec input must produce byte-identical GCL.
- Existing GCL entry points and tests must continue to pass.
- Unknown fields and references are errors; no validated-path fallback to center.

---

## File map

### New authoring package

- `src/authoring/lessonSpec/types.ts` — TypeScript contract for the Milestone 1 LessonSpec subset.
- `src/authoring/lessonSpec/schema.ts` — strict JSON Schema matching the TypeScript contract.
- `src/authoring/lessonSpec/diagnostics.ts` — stable diagnostic/result contracts and Ajv error formatting.
- `src/authoring/lessonSpec/validate.ts` — structural and semantic validation entry points.
- `src/authoring/lessonSpec/registry.ts` — semantic theme/size/pace/shot/asset mappings.
- `src/authoring/lessonSpec/resolve.ts` — deterministic object placement, beat timing, and symbol resolution.
- `src/authoring/lessonSpec/compile.ts` — ResolvedLesson to canonical GCL conversion.
- `src/authoring/lessonSpec/index.ts` — public `compileLessonSpec` and `renderLessonSpec` API.
- `src/authoring/lessonSpec/fixtures.ts` — a Newton cannon vertical-slice fixture.

### Tests

- `src/authoring/lessonSpec/schema.test.ts`
- `src/authoring/lessonSpec/validate.test.ts`
- `src/authoring/lessonSpec/registry.test.ts`
- `src/authoring/lessonSpec/resolve.test.ts`
- `src/authoring/lessonSpec/compile.test.ts`
- `src/authoring/lessonSpec/render.test.ts`
- `src/render/gcl/attention-lifecycle.test.ts`

### Existing files

- `package.json`, `package-lock.json` — add Ajv.
- `src/render/gcl/compile.ts` — apply attention exit lifecycle.
- `src/render/gcl/attention.ts` — expose pure attention visibility calculation.
- `src/render/gcl/index.ts` — export GCL types required by the authoring compiler without changing runtime behavior.

---

### Task 1: Install the runtime validator and define strict LessonSpec types

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/authoring/lessonSpec/types.ts`

**Interfaces:**
- Produces: `LessonSpec`, `SceneSpec`, `ObjectSpec`, `BeatSpec`, `ActionSpec`, and semantic token types.

- [ ] **Step 1: Install Ajv**

Run: `npm install ajv`

Expected: `ajv` appears under `dependencies`; install exits 0.

- [ ] **Step 2: Add the Milestone 1 discriminated types**

Define:

```ts
export type ThemeToken = "textbook" | "parchment" | "blueprint" | "chalkboard";
export type CompositionToken = "hero" | "hero-diagram" | "equation" | "overview-detail";
export type PaceToken = "instant" | "quick" | "normal" | "slow" | "dramatic";
export type SizeToken = "tiny" | "small" | "medium" | "large" | "hero" | "fill";
export type RoleToken = "background" | "support" | "primary" | "hero" | "annotation" | "hud";
export type ZoneToken = "title" | "main" | "main-left" | "main-right" | "support" | "footer" | "background" | "overlay" | "hud";
export type ShotToken = "overview" | "wide" | "medium" | "close" | "detail";
export type EntranceToken = "instant" | "fade" | "draw" | "wipe" | "iris" | "slam" | "word-by-word" | "typewriter" | "scramble";
export type ExitToken = "instant" | "fade" | "erase" | "wipe" | "iris" | "dissolve" | "slide" | "shrink";

export type PlacementSpec =
  | { mode: "zone"; zone: ZoneToken }
  | { mode: "relative"; target: string; relation: "above" | "below" | "left-of" | "right-of" | "near" }
  | { mode: "anchor"; target: string };

interface ObjectBase {
  id: string;
  role?: RoleToken;
  placement?: PlacementSpec;
  size?: SizeToken;
  initial?: "hidden" | "visible";
  space?: "world" | "screen";
}

export type ObjectSpec =
  | (ObjectBase & { kind: "text"; text: string; textRole?: "heading" | "title" | "body" | "bullet" | "caption" })
  | (ObjectBase & { kind: "equation"; value: string })
  | (ObjectBase & { kind: "stat"; value: number; from?: number; unit?: string; label?: string; decimals?: number; commas?: boolean; prefix?: string })
  | (ObjectBase & { kind: "visual"; asset: string; orientation?: "left" | "right" | "up" | "down" })
  | (ObjectBase & { kind: "line"; from: string; to: string; form?: "straight" | "curved" | "arrow" });

export type ActionSpec =
  | { do: "show"; targets: string[]; entrance?: EntranceToken }
  | { do: "hide"; targets: string[]; exit?: ExitToken }
  | { do: "camera"; target: string; shot?: ShotToken; movement?: "cut" | "move" | "push" }
  | { do: "label"; target: string; text: string; title?: string; style?: "text" | "pill" | "rect" | "tag" | "bubble" | "badge" }
  | { do: "tour"; labelMode?: "one-at-a-time"; returnTo?: "overview"; stops: Array<{ target: string; label: string; shot?: ShotToken }> };

export interface BeatSpec { id: string; pace?: PaceToken; actions: ActionSpec[] }
export interface SceneSpec { id: string; composition: CompositionToken; objects: ObjectSpec[]; beats: BeatSpec[] }
export interface LessonSpec { version: "1"; title: string; theme: ThemeToken; scenes: SceneSpec[] }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS with no output.

### Task 2: Add strict JSON Schema and structural diagnostics

**Files:**
- Create: `src/authoring/lessonSpec/schema.ts`
- Create: `src/authoring/lessonSpec/diagnostics.ts`
- Create: `src/authoring/lessonSpec/schema.test.ts`

**Interfaces:**
- Consumes: `LessonSpec` types from Task 1.
- Produces: `LESSON_SPEC_SCHEMA`, `Diagnostic`, `ValidationResult<T>`, `formatAjvErrors()`.

- [ ] **Step 1: Write failing schema tests**

Cover:

```ts
it("accepts a minimal valid lesson", () => { /* version/title/theme/non-empty scene */ });
it("rejects unknown object fields", () => { /* additionalProperties:false */ });
it("rejects pixel placement", () => { /* placement:[100,200] */ });
it("rejects literal style colors", () => { /* style:{color:'#fff'} */ });
it("rejects numeric camera zoom", () => { /* camera.zoom=2 */ });
it("requires kind-specific fields", () => { /* visual without asset */ });
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- src/authoring/lessonSpec/schema.test.ts`

Expected: FAIL because schema exports do not exist.

- [ ] **Step 3: Implement the schema**

Use Draft 2020-12 with `$defs` for semantic tokens, placements, object variants, action variants,
beats, scenes, and root. Set `additionalProperties: false` on every object and `minItems: 1` on scenes,
objects where required, beats, actions, show/hide targets, and tour stops.

- [ ] **Step 4: Implement diagnostics**

```ts
export interface Diagnostic {
  code: "INVALID_JSON" | "SCHEMA_ERROR" | "DUPLICATE_ID" | "UNKNOWN_TARGET" | "UNKNOWN_ASSET" | "INVALID_ANCHOR";
  path: string;
  message: string;
  received?: unknown;
  suggestions?: string[];
  availableTargets?: string[];
}

export type ValidationResult<T> =
  | { valid: true; value: T; warnings: Diagnostic[] }
  | { valid: false; errors: Diagnostic[] };
```

Format Ajv `instancePath`, keyword, message, and offending value into stable `SCHEMA_ERROR` entries.

- [ ] **Step 5: Run schema tests**

Run: `npm test -- src/authoring/lessonSpec/schema.test.ts`

Expected: PASS.

### Task 3: Implement structural and semantic validation

**Files:**
- Create: `src/authoring/lessonSpec/validate.ts`
- Create: `src/authoring/lessonSpec/validate.test.ts`

**Interfaces:**
- Produces: `validateLessonSpec(input: unknown): ValidationResult<LessonSpec>`.

- [ ] **Step 1: Write failing semantic-validation tests**

Test duplicate scene/object/beat IDs, unknown object targets, unknown anchor handles, unknown catalog
assets, references to hidden/unshown objects as warnings only, and Levenshtein suggestions such as
`erth -> earth`.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/authoring/lessonSpec/validate.test.ts`

Expected: FAIL because `validateLessonSpec` does not exist.

- [ ] **Step 3: Implement structural validation**

Create one cached Ajv validator. Return formatted schema errors without performing semantic checks when
structure fails.

- [ ] **Step 4: Implement symbol/reference validation**

Build per-scene object maps. Validate placement targets, line endpoints, show/hide targets, camera and
label targets, and every tour stop. Accept generic anchors and asset-specific anchors supplied by the
registry. Report all errors in one result.

- [ ] **Step 5: Run validation tests and type-check**

Run: `npm test -- src/authoring/lessonSpec/validate.test.ts && npx tsc --noEmit`

Expected: PASS.

### Task 4: Add semantic registries

**Files:**
- Create: `src/authoring/lessonSpec/registry.ts`
- Create: `src/authoring/lessonSpec/registry.test.ts`

**Interfaces:**
- Produces: `resolveTheme()`, `resolvePace()`, `resolveSize()`, `resolveShot()`, `resolveAsset()`, `assetAnchors()`.

- [ ] **Step 1: Write failing registry tests**

Assert every token resolves, unknown values return `undefined`, assets include canonical type/name and
anchors, and all mappings are stable across repeated calls.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/authoring/lessonSpec/registry.test.ts`

Expected: FAIL because registry exports do not exist.

- [ ] **Step 3: Implement versioned mappings**

Map themes to GCL uppercase names; pace to deterministic beat/transition/hold durations; sizes to
component-specific numeric sizes; shots to target-relative framing ratios; and current prop catalog
entries to `{ type:"prop", name, anchors }`. Include generic anchors for all assets.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/authoring/lessonSpec/registry.test.ts`

Expected: PASS.

### Task 5: Resolve layout, timing, and targets into ResolvedLesson

**Files:**
- Create: `src/authoring/lessonSpec/resolve.ts`
- Create: `src/authoring/lessonSpec/resolve.test.ts`

**Interfaces:**
- Produces: `ResolvedLesson`, `ResolvedScene`, `ResolvedObject`, `ResolvedBeat`, `resolveLesson(spec)`.

- [ ] **Step 1: Write failing resolution tests**

Test deterministic zone boxes for each supported composition, relative placement, anchor endpoints,
semantic sizes, sequential beat start/hold/end times, parallel actions inside a beat, and stable tour
expansion windows.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/authoring/lessonSpec/resolve.test.ts`

Expected: FAIL because resolution exports do not exist.

- [ ] **Step 3: Implement core composition templates**

Use 920x430 logical view boxes. Reserve title/footer bands and define deterministic zones for `hero`,
`hero-diagram`, `equation`, and `overview-detail`. Object intrinsic dimensions come from kind/size
registries; relative placement applies measured separation rather than authored pixels.

- [ ] **Step 4: Implement beat timing**

Resolve beats sequentially from pace registry. Actions within a beat share its start. Tour stops expand
into move, settle, label, hold, and label-exit windows; the final optional overview gets its own window.

- [ ] **Step 5: Run tests and type-check**

Run: `npm test -- src/authoring/lessonSpec/resolve.test.ts && npx tsc --noEmit`

Expected: PASS.

### Task 6: Compile core objects and actions to canonical GCL

**Files:**
- Create: `src/authoring/lessonSpec/compile.ts`
- Create: `src/authoring/lessonSpec/compile.test.ts`
- Modify: `src/render/gcl/index.ts`

**Interfaces:**
- Consumes: `ResolvedLesson`.
- Produces: `compileResolvedLesson(resolved): Film`.

- [ ] **Step 1: Write failing compiler snapshot tests**

Assert text/equation/stat/visual/line objects compile with resolved IDs/positions/styles; show maps
entrance tokens; hide maps exit tokens; camera maps shot/movement; label maps to attention callout; tour
expands to alternating camera/callout components; and the same resolved lesson produces deep-equal GCL.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/authoring/lessonSpec/compile.test.ts`

Expected: FAIL because compiler exports do not exist.

- [ ] **Step 3: Export required canonical types**

Re-export `Film`, `Component`, and `SceneMarker` as types from `src/render/gcl/index.ts` without changing
runtime behavior.

- [ ] **Step 4: Implement object compilation**

Emit one GCL scene marker per scene. Emit hidden objects only at their first show beat. Map visual assets
to canonical props; line endpoints to resolved path shapes; screen-space objects to `fixed:true`; and
semantic styles to resolved GCL values.

- [ ] **Step 5: Implement action compilation**

Map show/hide transitions, camera directives, labels, and expanded tour windows. Preserve stable list
ordering by scene object order then beat/action expansion order.

- [ ] **Step 6: Run compiler tests and all GCL tests**

Run: `npm test -- src/authoring/lessonSpec/compile.test.ts src/render/gcl`

Expected: PASS.

### Task 7: Fix canonical attention exit lifecycle

**Files:**
- Modify: `src/render/gcl/attention.ts`
- Modify: `src/render/gcl/compile.ts`
- Create: `src/render/gcl/attention-lifecycle.test.ts`

**Interfaces:**
- Produces: `attentionOpacity(t, at, enterDur, exit): number`.

- [ ] **Step 1: Write failing lifecycle tests**

Test opacity before start, during enter, during hold, during fade exit, after exit, and no-exit persistence.
Add a headless compiled-scene test proving an exited callout stops adding annotation operations after its
exit completes.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/render/gcl/attention-lifecycle.test.ts`

Expected: FAIL because attention exit is currently ignored.

- [ ] **Step 3: Implement pure opacity calculation**

Use the existing `resolveExit` and `phase` semantics. Return 0 before start/after completed exit, ramp
during entry, hold at 1, and ramp down for exit types whose first milestone behavior is opacity-based.

- [ ] **Step 4: Apply lifecycle in attention rendering**

Skip attention components at opacity 0. Wrap the attention layer in save/restore and multiply
`globalAlpha`; ensure callout uses the same annotation context. Preserve existing behavior for attention
without exit.

- [ ] **Step 5: Run lifecycle and regression tests**

Run: `npm test -- src/render/gcl/attention-lifecycle.test.ts src/render/gcl/render.test.ts src/lessons/gcl/lessons.test.ts`

Expected: PASS.

### Task 8: Add public API and end-to-end Newton fixture

**Files:**
- Create: `src/authoring/lessonSpec/index.ts`
- Create: `src/authoring/lessonSpec/fixtures.ts`
- Create: `src/authoring/lessonSpec/render.test.ts`

**Interfaces:**
- Produces: `compileLessonSpec(input)` and `renderLessonSpec(input)`.

- [ ] **Step 1: Write failing public API tests**

Verify invalid input returns diagnostics without throwing; valid input returns `{ valid:true, lesson,
resolved, gcl }`; `renderLessonSpec` returns a positive-duration slide; and the Newton fixture includes a
cannon catalog asset, equation, connector line, camera focus, label, and multi-stop tour.

- [ ] **Step 2: Verify failure**

Run: `npm test -- src/authoring/lessonSpec/render.test.ts`

Expected: FAIL because public API exports do not exist.

- [ ] **Step 3: Implement API**

```ts
export function compileLessonSpec(input: unknown): CompileLessonResult;
export function renderLessonSpec(input: unknown): RenderLessonResult;
```

`compileLessonSpec` validates then resolves then compiles. `renderLessonSpec` calls existing
`renderFilm(gcl)` only after compilation succeeds.

- [ ] **Step 4: Add deterministic fixture**

Author a LessonSpec fixture using no forbidden visual constants. Include `cannon`, `planet`, equation,
line, show actions, label, camera, and tour.

- [ ] **Step 5: Run the full verification suite**

Run: `npm test && npx tsc --noEmit && npm run build`

Expected: all tests pass, TypeScript emits no errors, and Vite build succeeds.

- [ ] **Step 6: Inspect workspace changes without committing**

Run: `git status --short && git diff --check`

Expected: only planned files plus pre-existing user changes are modified; no whitespace errors; no commit
is created.

## Milestone 1 completion criteria

- The LLM can emit a complete validated JSON lesson for the Newton/cannon vertical slice.
- The JSON contains no pixels, colors, seconds, numeric zoom, layers, SVG, or raw GCL.
- Structural and semantic errors return stable paths/codes/suggestions.
- Valid input deterministically compiles to canonical GCL and renders through the current engine.
- Cannon anchors support camera and labels.
- Tour labels disappear before the next stop.
- Existing GCL and lesson tests remain green.
- No git commit is created.

## Subsequent milestone roadmap

1. **Milestone 2 — Canonical hardening:** generic/live anchors, stream lifecycle, group masking, strict canonical validation, per-scene themes/transitions, compiler adapter split.
2. **Milestone 3 — Full content/layout parity:** all compositions, charts, shapes, curves, maps, timelines, tables, legends, groups, collision handling.
3. **Milestone 4 — Full choreography parity:** all entrances/exits, motion, idle, attention, emphasis, reveal, camera, tours, world/screen behavior.
4. **Milestone 5 — Atmosphere and composite visuals:** all particle presets/semantic controls, flow, glow, composite part attachment, asset registry completion.
5. **Milestone 6 — Migration and evaluation:** kitchen sink plus four lessons, browser golden comparisons, capability manifest enforcement, LLM one-shot/repair evaluation, generated documentation.
