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
| 03 | `03-motion-fx-completion.md` | Make the cinematic base a **system**: a composable **motion library** (`spring`/`breathe`/`pulse`/`wobble`/`stagger`) every later step imports, plus **FX as a layer+theme property** (`theme.fx.layers` → bloom/soft-shadow) and `frame.grade()` on the fx layer — so every scene inherits polish automatically, zero per-scene edits. | 01, 02 |
| 04 | `04-draw-on-strokes.md` | A full **stroke system** on one primitive (arc-length `window`): draw-on/erase/passing-flash/border-then-fill/traced-path/circumscribe verbs, curve interpolation (catmull-rom/cardinal/basis/natural/step), hand-drawn + variable-width brush, markers/followers, staggered orchestration. Diagrams/arrows/letters construct themselves. | 01, 02, 03 |
| 05 | `05-reveal-grammar.md` | Full **reveal grammar** on one primitive (mask = shape(p), hard via clip / soft via offscreen destination-in + blur feather): wipe (dirs/angle/center/edges/border), iris (circle/ellipse/rect/diamond/poly/star), radialWipe (clock), blinds, checkerboard, dissolve, clipShape, spotlight/fog-of-war, and `withBlend` (all 26 modes). Enables fog-of-war and elegant entrances. | 01 |
| 06 | `06-attention-direction.md` | Full **focus system**: isolate (dimExcept/spotlight), mark (highlightRing/focusRings/flash/sparkFlash/focusBox/cornerBrackets/indicate), point (pointerArrow/bouncePointer/convergingArrows), de-emphasize (ghost/emphasizeSurround), magnify (loupe/vignetteTo), motion (wiggle/pulseScale) — all driven by a target + `t`. | 01, 05 |
| 07 | `07-callouts-and-leaders.md` | Full **annotation layer** (subject + connector + note, independently toggleable): containers (pill/rect/tag/bubble/badge/text), placement (8-way + auto), leader routing (straight/elbow/curve), dual-end markers (dot/ring/arrow/crosshair), subject markers (circle/rect/bracket), draw-on + pop + typewriter; themed. | 01, 02, 04 |
| 08 | `08-engagement-grammar.md` | Full **engagement grammar** (pure fns of t): progressive disclosure (stepProgress/stepState/revealList — current-bright/prior-dimmed), predict-and-reveal beats, emphasis (emphasis/beat/punchScale/shakeOffset/flashAlpha + withPunch/withShake/flashOverlay), and a `sequencer`. | 01 |
| 09 | `09-kinetic-typography.md` | Full **kinetic type**: counters (`counterValue`/`formatNumber` commas/currency/percent), typewriter, word reveal (fade/rise/pop), date/number slam (impact), scramble/decode, text-along-a-path; themed. | 01, 02, 08 |
| 10 | `10-particle-system.md` | One deterministic, closed-form **emitter** (origin shapes, angle/spread, gravity, wander, size/color-over-life, spin, shapes, blend, loop) + presets (fire/smoke/sparks/rain/snow/dust/confetti/energy). Effects + ambience. | 01 |
| 11 | `11-camera-and-transitions.md` | `camera(t)` (pan/zoom/rotate, **log-zoom** dolly) applied at composite to all non-screenspace layers via `frame.setCamera`; push-in/zoom-through; parallax + depth-of-field via layer offset/blur; composer `transition: crossfade/zoom-through/whip-pan`. Opt-in (no regression). | 01, 05 |
| 12 | `12-plots-charts-counters.md` | Data-viz: `makePlot` (data→pixel) + `niceTicks`, `axes`/grid, `plotFunction` (draw-on), `barChart` (staggered), `lineChart` (+area +markers), `scatter`, `pie`/donut — all data-bound & seekable. | 01, 02, 04 |
| 13 | `13-timeline.md` | Timeline: `makeTimeline` (date→x, tracks) · `timelineAxis` (draw-on + BCE/CE ticks) · `eras` (growing bands) · `events` (staggered pins on parallel tracks) · `playhead` (sweeping now-marker). | 01, 02 |
| 14 | `14-shape-morph.md` | Shape morph: `resample` (arc-length) · `align` (min-travel correspondence) · `morph`/`drawMorph` (closed & open) + shape generators (circle/polygon/star/heart). Reactant→product, border→border. | 01 |
| 15 | `15-iconography-and-color-semantics.md` | 30-glyph vector **icon kit** (`drawIcon`, outline/filled, pure paths) + **color-semantics** registry (`colorSemantics().colorFor` stable+cached, `legend()` auto-key). | 01, 02 |
| 16 | `16-map-geo-subsystem.md` | **History maps**: `fitProjection` (lon/lat→view), `drawMap` (border-then-fill), `borderAt` (borders-over-time via morph), `flowArrow`, `geoMarker` (icon pins), `featureCenter`→camera zoom. Deterministic/offline (data passed in). | 01, 05, 10, 11, 14 |
| 17 | `17-katex-math.md` | **Canvas-native math** (`mathtext.ts`): LaTeX-subset parser + box layout (`\frac`, `\sqrt`, `^`/`_`, Greek/∑/∫/→…) via `measureMath`/`drawMath` (with draw-on). Deterministic/offline (no KaTeX/DOM/fonts); full-LaTeX-via-SVG-image documented as upgrade. | 01, 04 |
| 18 | `18-domain-kit-demo.md` | **Done:** `domainLesson.ts` — a 3-scene themed film ("water→power→yarn") composing geo+camera+kinetic+callouts+particles, then charts/counters, then math+confetti; theme + film grade + zoom-through. Proves the whole stack. | all above |
| 19 | `19-authoring-storyboard.md` | Declarative **storyboard** (`storyboard.ts`): `Beat` union (text/math/counter/bars/line/pie/icon/callout/particles/ring/rect) → `renderBeat` interpreter → `storyboardFilm(story)`. Lessons as data → seekable film. The base for LLM-generated lessons. | the primitive set (03–17) |

## Recommended milestones

- **M1 — Foundation looks great (01–03):** existing films get themed + fully cinematic. Smallest,
  highest immediate payoff; a live testbed for everything after.
- **M2 — Teaching toolkit (04–10):** the primitives that make explanations land.
- **M3 — Cinema + data (11–15):** camera, transitions, plots, timelines, morph, icons.
- **M4 — Domains (16–18):** maps + maths, then a full demo lesson.
- **M5 — Authoring (19):** lessons as data → generation.

Each plan file below is self-contained and follows the task/TDD format.
