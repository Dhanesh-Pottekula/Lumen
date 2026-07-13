# Design Spec — Generic Component Layer for LLM-Authored Video

**Date:** 2026-07-12 · **Status:** approved design, pre-implementation

## 1. Goal

Give an LLM one **math-free, semantic authoring format** that reaches **100%** of the existing render engine (~213 functions across 19 steps). The LLM writes *meaning* (components + a narration script); the system computes positions, timing, and styling and compiles down to the existing primitives. Output stays **deterministic and seekable** (pure function of `t`).

Hard requirements:
- The LLM never writes pixels, absolute timings, or hex colors (but *may* override any of them).
- Every capability of every step is reachable (no lost power vs hand-authored code).
- Reuse the existing primitive engine unchanged — the new layer **compiles to it**.

## 2. Architecture (four layers)

```
① Authoring format   flat stream of scene-markers + component instructions (what the LLM emits)
② Engines            anchor resolver · layout · timing · style   (turn meaning → numbers)
③ Compiler           each component → existing primitive calls    (the "assembly step")
④ Primitives         the current render/* engine, UNCHANGED       (draws pixels, seekable)
```

Everything above ④ is a **pure function of the input + `t`**, so seekability is preserved end to end.

## 3. Authoring format

A **flat list**. A `scene` marker opens a scene and carries its settings; every item after it (until the next `scene`) is a component in that scene. First item must be a `scene`.

```jsonc
[
  { "type": "scene", "theme": "PARCHMENT", "transition": "whip-pan",
    "narration": ["In 1206 the tribes united.", "At its peak, 24 million km²."],
    "bg": ["#141c24","#0f151b"], "texture": true },
  { "type": "heading", "text": "The Mongol Empire", "cue": 0 },
  { "type": "stat", "value": 24000000, "unit": "km²", "cue": 1 }
]
```

The parser groups the flat stream into scenes internally, then compiles each scene.

## 4. Universal props (on every component)

| Prop | Meaning | Backed by |
|---|---|---|
| `id` | name it so others anchor to it | anchor resolver |
| `at` / position | anchor (`"ground"`) · slot (`"top-left"`) · coords `[x,y]` | anchor resolver |
| `cue` / `start` | narration sentence · `"with"` · `"after"` · number | timing engine |
| `enter` | how it appears (§7) | strokes / reveal / type-motion |
| **`exit`** | **how it leaves** (§7) — `fade`·`erase`·`wipe`·`slide`·`shrink` + `out`/`until` time | strokes(`erase`) / reveal |
| `move` | slide along `to`/`path` | `move`/`makePath`/`lerp` |
| `oscillate` | idle breathe/pulse/wobble | `breathe`/`pulse`/`wobble` |
| `expr` | any numeric field as a live formula in `t`,`p` | safe evaluator |
| `fx` | layer/glow/shadow/blend/blur/alpha | `LayerOptions` |

## 5. The generic component catalog

### Family A — Content (what exists)
| Component | Compiles to | Notes |
|---|---|---|
| `text` (`role`: title/body/bullet/caption) | `fadeText`/`drawWordReveal`/`drawSlam`/`drawTypewriter`/`drawScramble` | `mode` picks kinetic style |
| **`textPath`** | `drawTextAlongPath` | text along a curve/path |
| `stat` | `counterValue`+`drawCounter` | `fmt` = NumberFormat |
| `equation` | `drawMath` | full LaTeX subset + symbols |
| `chart` (`bar`/`line`/`area`/`scatter`/`pie`/`function`) | `barChart`/`lineChart`/`scatter`/`pie`/`plotFunction` + `axes` | exposes data-point anchors |
| `shape` (`circle`/`polygon`/`star`/`heart`/`path`/`disc`) | `smoothPath`+`strokeOn`, morph generators, gradient disc | named `anchors` map |
| `parametric` | `plotFunction`-style from `fx(u),fy(u)` | any curve; `fx`/`fy` are evaluated **relative to the component's own placed center** (`[cx + fx(u), cy + fy(u)]`, per `compile.ts`'s `pointsFor`), not absolute view coordinates |
| `icon` | `drawIcon` | 30 names |
| `image` | `drawSvg` | bundled art, auto-preload |
| `map` | `fitProjection`+`drawMap`/`drawFeature`+`borderAt`+`flowArrow`+`geoMarker` | region/marker anchors |
| `timeline` | `makeTimeline`+`timelineAxis`+`eras`+`events`+`playhead` | |
| `legend` | `colorSemantics().legend` | |
| **`table`** *(new primitive)* | **new `drawTable` primitive** | rows/cols/header; build once |

### Family B — Motion (drives any content, by anchor)
`move` · `fall` · `orbit` · `along` (`makePath`) · `trace` (`tracerDot`) · `spin` · `morph` (`drawMorph`) · `camera` (`focusOn`/`lerpCamera`/`pushIn`→`setCamera`) — presets (`heavy`/`floaty`, `circular`/`elliptical`) + raw params; positions via anchor/slot/coords.

### Family C — Reveal / entrance & exit (the `enter`/`exit` props)
`draw` (`strokeOn`/`drawOn`) · `wipe`/`iris`/`radialWipe`/`blinds`/`checkerboard`/`dissolve`/`clip` · `slam`/`word`/`typewriter`/`scramble` · `fade` · `build` (`buildSteps`/`stagger`) · `borderThenFill`. **`exit`** mirrors these (incl. `erase`).
- **`pen`** option on `enter:"draw"` → an asset-free nib (a small filled-triangle drawn in `compile.ts`'s `drawPenNib`, oriented via `pointAt`'s tangent angle) rides the stroke; no bitmap/SVG hand asset is loaded.

### Family D — Attention (points at things, by anchor)
`callout` (all CalloutOptions) · `highlight`/`ring` · `spotlight` · `dim` · **`ghost`** (de-emphasize one element) · `pointer` · `box`/`brackets` · **`encircle`** (`circumscribe`) · `converge` · `spark`/`flash` · `vignette` · `magnify` · `emphasis` (punch/shake/flash/pulse/wiggle) · **`predict`** (pose→pause→reveal, `predictReveal`).

### Family E — Particles / atmosphere
`particles` (8 presets + full `EmitterConfig`) · `flow` (particles along an anchor/path) · `glow` (`radialGlow`/`withGlow`).

### Family F — Structure & containers
- `scene` marker → `theme`, `narration`, `bg`, `texture`, `transition`, base `camera`; film-level `grade`.
- **`group`** — two roles:
  - **layout group**: `layout: row|stack|grid` to arrange children as a unit (explicit control over side-by-side vs stacked).
  - **wrapper group**: `reveal`/`emphasis`/`build`/`transform`/`clip` — unlocks every draw-callback primitive (`wipe/iris/…`, `withPunch/withShake`, `magnify/wiggle/ghost/indicate`, `revealList`).

## 6. The engines (the "system arranges" part)

1. **Anchor resolver** — resolves `id`, semantic slots (`top-left`, `ground`, `center`), and component sub-handles (`chart.peak`, `shape.<namedAnchor>`, `map.<region>` via `featureCenter`) → pixels/values. Relative anchors survive camera/scale.
2. **Layout engine** — measures each content component (uses `measureMath`, text metrics, chart preferred sizes), matches the block mix to a template, falls back to flex row/stack/grid; reserves inner margins so labels never clip. Respects explicit layout groups. **Measurement accuracy note (corrected in P7b):** this is deterministic *within* a given render environment, not literally "ctx-free" — `measureMath`/text width estimation uses the browser's real `CanvasRenderingContext2D.measureText` when a `document` is available (the actual player), and falls back to an analytic glyph-width estimate (`≈0.52 × fontPx` per character) when it isn't (vitest/Node, where `measure.ts`'s `estimateTextWidth` takes over). Both paths are pure functions of their inputs — the same environment always reproduces the same layout on re-seek — but the two paths are not numerically identical to each other, so a scene's exact pixel layout can differ by a few px between a Node-run test and the browser. This is a property to design around (roomy layouts, no pixel-exact assertions across environments), not a defect.
3. **Timing engine** — narration-driven: sentences → TTS timestamps → each component's `at` = its `cue`; `with`/`after` relations; content-weighted fallback when no narration. Emits `exit` times too.
4. **Style engine** — theme → colors/fonts/FX defaults; per-component overrides allowed.
5. **Compiler** — walks resolved components and emits the existing primitive calls with all numbers filled in. This is the boundary to layer ④.

## 7. enter / exit model

Every component has an entrance and (optional) exit, both from the same vocabulary. `enter` plays over `[at, at+dur]`; `exit` plays over `[out, out+dur]` (or `until`). Without `exit`, the element persists to scene end. `erase` is the natural draw-on exit; `fade`/`wipe`/`slide`/`shrink` cover the rest.

## 8. Determinism & seekability

- All engines are pure functions of the input; anchor resolution, layout, timing, and compilation produce the same result every run.
- Compiled primitives are the existing seekable `render(ctx,t)` calls.
- Formula fields (`expr`, `parametric`) use the sandboxed evaluator (no `eval`).
- No `Date.now`/`Math.random` — randomness via seeded `prng`.

## 9. Build phases (this is large — build in order, each verifiable)

- **P0 — Foundations:** authoring format + parser (flat→scenes), universal-prop plumbing, the compiler skeleton that emits beats, anchor resolver (ids + slots), determinism harness. *Verify: a trivial scene (heading + stat) renders.*
- **P1 — Content family:** text/textPath/stat/equation/chart/shape/parametric/icon/image/legend + measure-based layout engine (templates + flex) + narration timing. *Verify: an informational scene lays out + times to narration.*
- **P2 — enter/exit + reveal:** the `enter`/`exit` vocabulary (draw/wipe/iris/dissolve/fade/build/slam/word/typewriter/scramble/erase) + `pen` follower.
- **P3 — Motion + camera:** move/fall/orbit/along/trace/spin/morph/camera (anchor-based tours).
- **P4 — Attention:** callout/highlight/spotlight/dim/ghost/pointer/box/encircle/converge/spark/vignette/magnify/emphasis/predict.
- **P5 — Particles + group container:** particles/flow/glow + the wrapper `group` (reveal/emphasis/build/transform) and layout `group` (row/stack/grid).
- **P6 — New primitives from harvest:** `table` (`drawTable`), plus bespoke visuals harvested from the 4 lessons into named primitives/components (`disc`/planet, membrane, riemannSum). Add component sub-anchors (chart data points, shape parts, map regions).
- **P7 — Docs + validation:** regenerate the LLM authoring spec; a "kitchen-sink" scene using every component; re-run the two-pass coverage audit; re-create the 4 lessons in the new format and compare.

## 10. Reuse / harvest

The 4 hand-authored lessons are the seed library. Each bespoke effect becomes one named primitive/component (P6): `drawEarth`→`disc`/planet, neuron membrane→a diagram primitive, Riemann rectangles→`riemannSum`, arcs→`fall`/`orbit`.

## 11. Risks / decisions

- **Layout quality** — templates + flex must look good across block mixes; iterate with real scenes. Mitigation: start with a few strong templates, flex fallback, `group` overrides.
- **Anchor sub-handles** — requires each rich component to publish named points; scoped in P6.
- **`table`** — genuinely new primitive (nothing exists); small, built in P6.
- **Camera in group** — local to the group (documented limit).
- **Truly one-off custom code** — still requires adding a primitive (the data-vs-code line); `expr`/`parametric` cover custom *math*.

## 12. Definition of done

A single flat-stream scene using **every** component compiles, lays out, times to narration, and renders seekably with zero console errors; the four lessons are re-authored in the format; the coverage audit shows every step reachable.
