# Photosynthesis lesson — design

**Date:** 2026-07-08
**Status:** approved design, pending implementation

## Problem

The app has one composed canvas film (the Coimbatore lesson). The user wants a second,
detailed lesson explaining photosynthesis at the cellular level — leaf, cell, chloroplast,
the light-dependent reactions, the Calvin cycle, the overall equation — built the same way:
standalone scenes stitched by `composeSlides` and played by the existing `<CanvasSlide>`.

## Decisions made during brainstorming

- **Second card below.** App renders both films stacked — Coimbatore first, photosynthesis
  below. Each is an independent `<CanvasSlide>`. No switcher/tabs.
- **Full 7-scene deep dive.** Cellular detail, zooming one level deeper each scene.
- **Reuse everything.** No changes to `composeSlides`, `<CanvasSlide>`, `useSpeechNarration`,
  `anim.ts`, or any Coimbatore file. New work is seven scene files plus an App.tsx edit.

## Design

### 1. Architecture

Seven new files in `src/slides/`, each exporting one `CanvasSlideDefinition`:

- Pure `render(ctx, t)` — no clocks, timers, or accumulated state (seekability contract).
- Shared 920×430 logical view space (`composeSlides` requires all scenes in a film to match;
  the value also matches the Coimbatore scenes so `anim.ts` helpers apply unchanged).
- Own `captions` array on the scene-local timeline.

Composed in App.tsx:

```ts
const photosynthesisLesson = composeSlides([
  photoIntroSlide,
  photoLeafCellSlide,
  photoChloroplastSlide,
  photoLightReactionsSlide,
  photoCalvinCycleSlide,
  photoEquationSlide,
  photoFinaleSlide,
]);
```

Rendered as a second `<CanvasSlide>` card after the Coimbatore card. `composeSlides` supplies
crossfades (default 2.5 s), progress dots, and merged captions; `<CanvasSlide>` supplies
scrubbing and speech-gated narration — all already built and tested.

Drawing helpers imported from `./anim`: `phase`, `lerp`, `clamp01`, `withAlpha`, `fadeText`,
`prng`, `cycle`, `makePath` (as each scene needs them).

### 2. The seven scenes

Each `W = 920`, `H = 430`. Durations are authored targets; final film ≈ Σduration − 6×2.5 s.

1. **`photoIntro.ts` — the whole system** (~18 s). A leaf on a stem in sunlight. Gold rays
   strike the leaf; gray CO₂ particles drift in; pale-cyan O₂ bubbles drift out; blue water
   rises from roots up the stem. Title "PHOTOSYNTHESIS". Sets the inputs/outputs before any
   zoom.

2. **`photoLeafCell.ts` — into a cell** (~20 s). Leaf cross-section (cuticle, epidermis,
   palisade mesophyll) that zooms into a single mesophyll cell: cell wall, membrane, nucleus,
   large central vacuole, and several green chloroplasts distributed in the cytoplasm. Labels
   fade in.

3. **`photoChloroplast.ts` — chloroplast structure** (~22 s). Zoom into one chloroplast:
   outer membrane, inner membrane, stroma (fluid fill), thylakoid discs stacked into grana,
   lamellae connecting stacks. Every part labelled with leader text.

4. **`photoLightReactions.ts` — light-dependent reactions** (~26 s). A thylakoid-membrane
   cross-section with embedded complexes left→right: Photosystem II, electron transport chain
   (plastoquinone/cytochrome), Photosystem I, ATP synthase. Animated: photons hit PSII, water
   splits into O₂ + H⁺ + electrons, electrons hop the chain, H⁺ accumulate in the lumen then
   flow through ATP synthase (ATP forms), NADPH forms at PSI. Legend for ATP / NADPH / O₂.

5. **`photoCalvinCycle.ts` — the Calvin cycle** (~26 s). Stroma setting; a circular cycle
   diagram with three labelled stages rotating: (1) carbon fixation — CO₂ + RuBP → 3-PGA via
   RuBisCO; (2) reduction — 3-PGA → G3P, consuming ATP + NADPH; (3) regeneration — RuBP
   remade. A G3P molecule exits toward "glucose". ATP/NADPH arrows feed in from the previous
   scene's products.

6. **`photoEquation.ts` — inputs and outputs** (~18 s). The summary equation assembles piece
   by piece: `6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂`, with each term echoed by a small icon
   (CO₂ gray, H₂O blue, sun gold, glucose hexagon, O₂ cyan). Reconnects the molecules to the
   whole-leaf view.

7. **`photoFinale.ts` — recap** (~14 s). A journey strip mirroring the Coimbatore finale:
   sun → leaf → cell → chloroplast → light reactions → Calvin cycle → sugar, each a small icon
   appearing along a line, then the "PHOTOSYNTHESIS" title and a one-line summary.

### 3. Visual language

Physical-color scene convention (from `anim`-based scenes): all colors hardcoded hex, not
`c-*`/theme variables, so the scenes don't invert in dark mode. Palette:

- light / energy / ATP: warm gold `#e8c14a`, `#f0d878`
- chloroplast / thylakoid / leaf: greens `#3a8a4a`, `#2c6b3a`, `#5cc87a`
- water / H₂O / reduction: blue `#4a90d8`, `#6db0e8`
- CO₂ / carbon: neutral gray `#8a94a0`
- O₂: pale cyan `#7fe0d8`
- backgrounds: the existing dark stage tones (`#20303c`, `#1a2630`) for continuity with the
  Coimbatore look

Elements stage in with `phase(t, a, b)` envelopes keyed to caption timing (same technique as
`coimbatoreCotton.ts`). Repeating motion (drifting particles, flowing electrons, cycle
rotation) is driven by `cycle()`/trig on `t`, kept deterministic so seeking is exact.

### 4. Captions & narration

Each scene has 3–4 captions on its local timeline (`{ at, text }`), plain-language but
technically correct. `composeSlides` shifts each by the scene's start and merges/sorts them;
the caption drop rule prevents overlap at crossfades. The player's speech-gate holds the film
at each caption boundary until the utterance finishes, so the dense lines are not clipped.

### 5. App.tsx changes

- Import the seven slides and compose `photosynthesisLesson`.
- Add a second `<CanvasSlide>` card after the Coimbatore one, with its own heading/sub, title,
  tag, and notes.
- Keep the page `<h1>`/intro for Coimbatore; add a parallel heading block for photosynthesis
  (or a shared page intro) — a small copy edit, no structural change.

### 6. Error handling / edge cases

- Scenes draw only within 0..W, 0..H; every `save()` is matched by `restore()`; alpha changes
  scoped via `withAlpha` or explicit save/restore so no state leaks across the offscreen-buffer
  compositing.
- No new failure surfaces — scenes are pure functions returning nothing.

### 7. Testing

- No unit tests for the scene render functions (pure drawing; matches the Coimbatore-scene
  precedent — those have none). `composeSlides` is already unit-tested and unchanged.
- Existing suite (20 tests) must stay green; `npm run build` (tsc --noEmit && vite build) must
  pass.
- Manual browser verification: the photosynthesis card renders; scrub across all six scene
  boundaries (crossfades clean, no blank flash); play through with voice on (captions spoken,
  film holds until each sentence finishes); progress dots show seven scenes; finale shows the
  journey strip and title.

## Out of scope

- Interactive quiz / clickable diagram elements
- A film switcher or tabbed UI
- Changes to `composeSlides`, `<CanvasSlide>`, `useSpeechNarration`, or `anim.ts`
- Botanical accuracy beyond the standard textbook model (C3 photosynthesis; no C4/CAM, no
  photorespiration)
- Audio beyond the browser default speech voice
