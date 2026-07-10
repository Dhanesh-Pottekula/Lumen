# Implementation Plans — Ordered Index

This folder decomposes [`docs/video-experience-roadmap.md`](../video-experience-roadmap.md) into an
ordered series of **independently shippable steps**. Each step has its own detailed plan document and
ends with working, tested, committed software. Do them in order — later steps depend on earlier ones.

## Conventions (apply to every step)

- **Instant-run:** no build/export gate; the film plays live via `render(ctx, t)`.
- **Deterministic & seekable:** every visual is a pure function of `t` (and inputs). Same `t` → same
  frame. No accumulated state, no `Date.now()`/`Math.random()` at render time (seeded PRNG only).
- **TDD for pure logic:** math/helpers get vitest unit tests; drawing/visual work is verified in the
  browser (screenshots) and must keep the suite green + `npm run build` clean.
- **Backward compatible:** existing films (Coimbatore, Photosynthesis) must keep working after every
  step. New capabilities are opt-in.
- **Commit per task**, small and frequent.

## The render-context decision (shared by many steps)

Several steps need to pass shared state (theme, camera, layers) into scenes without a fragile web of
parameters. Step 01 introduces a single **`FrameCtx`** object threaded as the optional 3rd argument to
`render`: `render(ctx, t, frame?)`. It is optional, so every existing scene keeps compiling untouched;
new capabilities read `frame.theme`, `frame.camera`, `frame.layer`, etc. This is the backbone the
later steps build on.

---

## Ordered steps

| # | Plan file | Aim (what "done" means) | Depends on |
|---|-----------|--------------------------|------------|
| 01 | `01-render-context-and-layers.md` | `FrameCtx` threaded through the player→composer→scenes; a **layer model** (bg/mid/fg/annotation/fx) that composites in order with per-layer transform + optional blur. Unlocks parallax, DOF, masking, clean draw order. | — |
| 02 | `02-theme-system.md` | A runtime **theme** object (palette, texture, lineStyle, type, fx) on `FrameCtx`; texture backdrops (parchment/blueprint/chalkboard/textbook); themed helpers so scenes ask for roles not colors. Reskins a whole film from one object. | 01 |
| 03 | `03-motion-fx-completion.md` | Finish the cinematic base: glow/soft-shadow applied across all scenes, full easing set + idle **micro-motion**, and the `filmGrade` overlay moved into the fx layer. (Folds in the in-flight Tier-1 edits.) | 01, 02 |
| 04 | `04-draw-on-strokes.md` | A **stroke system** that draws paths on over time (`strokeOn(path, p)`), with themed roughness. Diagrams/arrows/letters construct themselves. | 01, 02 |
| 05 | `05-reveal-grammar.md` | **Masks & reveals**: clip-based wipe/iris/shaped reveals + blend-mode helpers (multiply/screen/overlay). Enables fog-of-war and elegant entrances. | 01 |
| 06 | `06-attention-direction.md` | **Focus system**: spotlight, dim/ghost non-focal content, highlight rings — driven by a focus target + `t`. | 01, 05 |
| 07 | `07-callouts-and-leaders.md` | **Annotation layer**: labels with animated leader lines pointing at coordinates; themed. | 01, 02, 04 |
| 08 | `08-engagement-grammar.md` | **Build-steps** (progressive disclosure), **predict-and-reveal** beats, and **emphasis choreography** (punch/shake/flash/freeze) as reusable helpers. | 01 |
| 09 | `09-kinetic-typography.md` | Animated text: counters/number tickers, date slams, word-by-word emphasis, themed type. | 01, 02, 08 |
| 10 | `10-particle-system.md` | One configurable, deterministic **emitter** (count/spread/speed/lifetime/style) powering both effects (electrons) and ambience (smoke/rain/dust). | 01 |
| 11 | `11-camera-and-transitions.md` | A `camera(t)` transform (pan/zoom/rotate) on `FrameCtx`; **continuous zoom-through-scales**; transition variety (zoom-through/whip-pan/morph) in the composer; parallax + depth-of-field via layers. | 01, 05 |
| 12 | `12-plots-charts-counters.md` | Data-viz primitives: axes/grid, animated function plotting, bar/line/pie charts bound to data, counters. | 01, 02, 04 |
| 13 | `13-timeline.md` | A timeline primitive: eras, parallel tracks, events, moving playhead. | 01, 02 |
| 14 | `14-shape-morph.md` | Path resampling + interpolation to morph one shape into another (reactant→product, border→border). | 01 |
| 15 | `15-iconography-and-color-semantics.md` | A reusable icon/sprite kit + a color-semantics registry with auto-legend (category→consistent color). | 01, 02 |
| 16 | `16-map-geo-subsystem.md` | **History maps**: GeoJSON load + projection, region fills, **borders-over-time via keyframe interpolation** (with resampling), flow arrows, battle markers, fog-of-war, camera integration. | 01, 05, 10, 11, 14 |
| 17 | `17-katex-math.md` | Runtime **KaTeX** → offscreen image → `drawImage`, cached; equations that can also draw-on. | 01, 04 |
| 18 | `18-domain-kit-demo.md` | Assemble a full themed lesson end-to-end on one subject (recommended: a WWI map lesson or a calculus lesson) to prove the whole stack. | all above needed by the chosen subject |
| 19 | `19-authoring-storyboard.md` | A declarative **storyboard** format (scenes/beats as data) that the primitive library renders — the base for LLM-generated lessons. | the primitive set (03–17) |

## Recommended milestones

- **M1 — Foundation looks great (01–03):** existing films get themed + fully cinematic. Smallest,
  highest immediate payoff; a live testbed for everything after.
- **M2 — Teaching toolkit (04–10):** the primitives that make explanations land.
- **M3 — Cinema + data (11–15):** camera, transitions, plots, timelines, morph, icons.
- **M4 — Domains (16–18):** maps + maths, then a full demo lesson.
- **M5 — Authoring (19):** lessons as data → generation.

Each plan file below is self-contained and follows the task/TDD format.
