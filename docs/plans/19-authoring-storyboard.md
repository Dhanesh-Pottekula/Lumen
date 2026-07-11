# Step 19 — Authoring / Storyboard Model (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A declarative storyboard format — scenes and beats as plain data — that the primitive library
renders into a seekable film. The base for LLM-generated lessons: emit JSON, get a film.

**Architecture:** `src/render/storyboard.ts` — a `Beat` discriminated union (by `kind`), a `renderBeat`
interpreter mapping each beat to a primitive from steps 04–17 (gated by `phase(t, at, at+dur)`), and
`storyboardScene`/`storyboardFilm` compilers that produce `CanvasSlideDefinition`s via `composeSlides`.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable (beats are pure fns of t); `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/storyboard.ts`; **new** `src/slides/storyboardDemo.ts` (a lesson as data) + card.

## The surface (implemented)
- **Schema:** `Storyboard { theme?, filmGrade?, transition?, scenes: StoryScene[] }`;
  `StoryScene { duration, bg?, captions?, beats: Beat[] }`; each `Beat` has `{ at, dur?, layer? }` + kind.
- **Beat kinds:** `text` (plain/word/slam) · `math` · `counter` · `bars` · `line` · `pie` · `icon` ·
  `callout` · `particles` (fire/smoke/sparks/energy/confetti) · `ring` (pulse/converge) · `rect`.
  Each maps to a primitive (type-motion, mathtext, charts, icons, callout, particles, focus).
- **Compile:** `storyboardScene(scene)` → slide; `storyboardFilm(story)` → composed, themed, seekable film.

**Noted as addable:** geo/map beats, morph beats, spotlight/reveal beats, per-beat easing, a JSON schema
+ validator for LLM output, and a JSON-import path (parse → `storyboardFilm`).

## Tasks
- [ ] Implement `storyboard.ts` (schema + `renderBeat` + compilers). Build clean.
- [ ] `storyboardDemo.ts` — a 2-scene lesson defined purely as data; compile with `storyboardFilm`; add a card.
- [ ] Browser-verify the data-defined film scrubs and renders every beat kind. **Uncommitted.**

## Self-review
- Lessons are data; interpreter covers the common beat kinds; deterministic/seekable; composes the stack. ✅

## What this unlocks
LLM-generated lessons: a model emits a storyboard JSON and the engine renders it — the endpoint of the
whole roadmap.
