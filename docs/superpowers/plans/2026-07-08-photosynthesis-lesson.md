# Photosynthesis Lesson Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A second composed canvas film explaining photosynthesis at the cellular level, shown as a second card below the Coimbatore lesson.

**Architecture:** Seven standalone `CanvasSlideDefinition` scenes (pure `render(ctx, t)`, 920×430, own captions), composed by the existing `composeSlides` and played by the existing `<CanvasSlide>`. No changes to composer, player, narration, or anim.

**Tech Stack:** React 19, Canvas 2D, existing `anim.ts` helpers. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-photosynthesis-lesson-design.md`

## Global Constraints

- Every `render(ctx, t)` is a pure function of `t` — no clocks/timers/accumulated state.
- All seven scenes share `W = 920`, `H = 430`.
- Physical colors hardcoded (no theme `c-*`/CSS vars) so scenes don't invert in dark mode.
- Import helpers from `./anim`: `phase`, `lerp`, `clamp01`, `withAlpha`, `fadeText`, `prng`, `cycle`, `makePath`.
- Each scene begins `render` with `ctx.clearRect(0, 0, W, H)` (composer isolates via offscreen buffer).
- Stage `git add` explicit paths only. Existing 20 tests + `npm run build` must stay green.

---

### Task 1: The seven scene files

**Files (create):** `src/slides/photoIntro.ts`, `photoLeafCell.ts`, `photoChloroplast.ts`,
`photoLightReactions.ts`, `photoCalvinCycle.ts`, `photoEquation.ts`, `photoFinale.ts`

**Interfaces (produces):** `photoIntroSlide`, `photoLeafCellSlide`, `photoChloroplastSlide`,
`photoLightReactionsSlide`, `photoCalvinCycleSlide`, `photoEquationSlide`, `photoFinaleSlide`
— each a `CanvasSlideDefinition`.

Per the spec §2, each scene draws its described subject with `phase()`-staged elements keyed
to 3–4 captions, deterministic motion via `cycle()`/trig, palette per spec §3.

- [ ] Build all seven scene files (content authored to spec).
- [ ] `npm run build` passes (type-check each scene against `CanvasSlideDefinition`).
- [ ] Commit the seven files.

### Task 2: Compose + second card in App.tsx

**Files (modify):** `src/App.tsx`

- [ ] Import the seven slides; `const photosynthesisLesson = composeSlides([...seven...])`.
- [ ] Add a second `<CanvasSlide>` card after the Coimbatore card with its own heading/tag/notes.
- [ ] `npm run build` + `npm test` pass.
- [ ] Commit App.tsx.

### Task 3: Manual browser verification

- [ ] Photosynthesis card renders; scrub across all six boundaries (clean crossfades).
- [ ] Play with voice on — captions spoken, film holds per sentence.
- [ ] Seven progress dots; finale shows journey strip + title.
