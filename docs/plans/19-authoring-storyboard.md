# Step 19 — Authoring / Storyboard Model

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Express lessons as **declarative data** (a storyboard) that a renderer turns into a composed
film using the primitive library — so lessons become data, and an LLM can generate them.

**Architecture:** A JSON-serializable `Storyboard` = `{ theme, scenes: Scene[] }`, each `Scene` =
`{ duration, camera?, beats: Beat[] }`, each `Beat` = a typed, parameterized primitive call
(`{ type: "callout"|"plot"|"timeline"|"map.regions"|"mathOn"|"counter"|..., at, dur, ...params }`). A
`renderStoryboard(sb)` compiles it into `CanvasSlideDefinition[]` + `composeSlides(...)`. Beats map 1:1
to the primitives from Steps 04–17.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; the storyboard is pure data (no functions) so it can be authored/generated/serialized.
- Every beat type maps to an existing primitive — no new drawing here, only a dispatcher.
- Existing suite green; build clean.

## File structure
- Create `src/story/types.ts` — `Storyboard`, `Scene`, `Beat` (discriminated union of beat types).
- Create `src/story/render.ts` — `beatToDraw(beat)`, `sceneToSlide(scene)`, `renderStoryboard(sb)`.
- Create `src/story/render.test.ts` — beat dispatch + timing (which beats draw at a given local t).
- Create `src/story/example.wwi.json` (or `.ts`) — the Step-18 lesson re-expressed as a storyboard, to prove parity.

---

### Task 1: types + beat dispatcher

**Interfaces — Produces:**
```ts
type Beat =
  | { type: "callout"; at:number; dur:number; target:[number,number]; text:string; side?: "left"|"right" }
  | { type: "counter"; at:number; dur:number; x:number; y:number; from:number; to:number; fontPx?:number }
  | { type: "plot"; at:number; dur:number; box:Box; xDomain:[number,number]; yDomain:[number,number]; fn:string }
  | { type: "mathOn"; at:number; dur:number; x:number; y:number; latex:string; fontPx?:number }
  | { type: "map.regions"; features:string; semantics:Record<string,string> }
  | { type: "map.border"; keys:string; n?:number }
  | { type: "timeline"; box:Box; domain:[number,number]; eras:Era[]; events:TLEvent[] }
  | { type: "emit"; config: EmitterConfig }
  /* ...one variant per primitive... */;
interface Scene { duration:number; camera?: CameraKeyframes; beats: Beat[] }
interface Storyboard { theme: string; scenes: Scene[] }
beatToDraw(beat: Beat): (frame: FrameCtx, localT: number) => void
renderStoryboard(sb: Storyboard): CanvasSlideDefinition   // = composeSlides of the scene slides
```
`fn` for `plot` is a restricted expression string (e.g. `"x*x"`) parsed by a tiny safe evaluator (no
`eval`) — a tokenized arithmetic parser supporting `x`, `+ - * /`, `^`, `sin/cos/exp`, parentheses.

- [ ] **Step 1: Failing tests** — `src/story/render.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { beatToDraw, sceneToSlide } from "./render";

function stub() {
  return { calls: [] as string[] } as { calls: string[] };
}

describe("beatToDraw", () => {
  it("returns a draw fn for a known beat type", () => {
    const fn = beatToDraw({ type: "counter", at: 0, dur: 1, x: 0, y: 0, from: 0, to: 10 });
    expect(typeof fn).toBe("function");
  });
  it("throws on an unknown beat type", () => {
    // @ts-expect-error intentional bad type
    expect(() => beatToDraw({ type: "nope" })).toThrow();
  });
});

describe("sceneToSlide", () => {
  it("produces a slide whose duration matches the scene", () => {
    const slide = sceneToSlide({ duration: 12, beats: [] }, "textbook");
    expect(slide.duration).toBe(12);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3:** Implement `types.ts` + `render.ts`. `beatToDraw` switches on `beat.type` and returns a
  closure that calls the matching primitive with `stepProgress(localT, beat.at, beat.dur)` as its
  progress arg. `sceneToSlide(scene, themeName)` returns a `CanvasSlideDefinition` whose `render(ctx,t,frame)`
  applies the scene camera then runs each beat's draw fn. `renderStoryboard` resolves the theme by name
  and returns `composeSlides(scenes.map(sceneToSlide), { theme })`.
- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: storyboard types + beat dispatcher`.

---

### Task 2: safe expression evaluator (for plot fns)

- [ ] **Step 1: Failing tests** — `src/story/expr.test.ts`: `compileExpr("x*x")(3) === 9`;
  `compileExpr("sin(0)") === 0`; rejects `"window"` / arbitrary identifiers (throws).
- [ ] **Step 2:** Implement `src/story/expr.ts` — a tiny shunting-yard parser → evaluator supporting the
  whitelisted tokens only (no `eval`, no `Function`). Run → PASS.
- [ ] **Step 3: Commit** `feat: safe arithmetic expression evaluator for plot beats`.

---

### Task 3: parity demo

- [ ] **Step 1:** Re-express the Step-18 WWI lesson (or a subset) as a `Storyboard` JSON and render it
  via `renderStoryboard`; add an App card.
- [ ] **Step 2: Browser verify** — the storyboard-rendered lesson matches the hand-assembled one;
  screenshot. — [ ] **Step 3:** `npm run build && npm test` green. — [ ] **Step 4: Commit**
  `feat: WWI lesson expressed as a storyboard (authoring-model parity)`.

## Self-review
- Storyboard is pure serializable data; every beat maps to an existing primitive; dispatcher + expr
  evaluator tested; parity demo proves a data-authored lesson equals a code-authored one. ✅

## What this unlocks
Lessons as data → fast hand-authoring, versionable content, and **LLM-generated lessons**: a model emits
a `Storyboard` JSON and the engine renders a themed, cinematic, seekable film — the AiRA endgame.
