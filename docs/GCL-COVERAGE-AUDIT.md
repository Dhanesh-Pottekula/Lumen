# GCL Coverage Audit

This maps every engine family under `src/render/*` to the GCL component/prop that reaches it, with a
✅ (fully reachable) / 🟡 (partially reachable, noted) / ❌ (gap — not reachable) status. Verified by
reading `src/render/gcl/compile.ts`'s actual import/dispatch code (not the aspirational design spec),
cross-checked against `src/render/gcl/kitchensink.ts` (exercises one of every component type) and the
4 re-authored lessons (`src/lessons/gcl/{neuron,gravity,calculus,mongol}.ts`).

## Family-by-family

| Engine family (`src/render/*`) | GCL surface | Status | Notes |
|---|---|---|---|
| **strokes** (`strokes.ts`: `strokeOn`, `smoothPath`, `pointAt`, `windowPolyline`) | `shape` (`path`), `parametric`, `textPath`'s underlying path draw; `enter: "draw"` | ✅ | `compile.ts` calls `strokeOn` directly for path/polygon/parametric draw-on; lower-level than `strokeVerbs.ts`'s `drawOn` wrapper but the same capability. |
| **strokeVerbs** (`drawOn`, `erase`, `drawBorderThenFill`, `circumscribe`, `tracerDot`, `passingFlash`, `handFollower`, `strokeSequence`, `arrowhead`, `dot`, `tracedPath`) | `enter: "draw"`/`"borderThenFill"`, `exit: "erase"`, `attention: "encircle"` (→ `circumscribe`), `motion: "along"`/`"trace"` (via `motion.ts`, not `tracedPath` directly) | 🟡 | `drawOn`/`erase`/`drawBorderThenFill`/`circumscribe` reached. `handFollower` (image-based pen) is deliberately **not** used — `enter.pen` instead rides an asset-free nib (`compile.ts`'s `drawPenNib`), by design (see the authoring guide's correction). `passingFlash`, `strokeSequence`, `arrowhead`, `dot`, `tracedPath` are not called from `gcl/`; their effect is either superseded (`group.build` staggers reveals instead of `strokeSequence`; `motion.ts`'s own `trace` case reimplements a fading-trail as a pure function of `t` instead of calling `tracedPath`) or simply unauthored (a standalone arrowhead/dot marker with no accompanying stroke has no GCL component). |
| **reveal** (`masked`, `wipe`, `iris`, `radialWipe`, `blinds`, `checkerboard`, `dissolve`, `clipShape`, `spotlight`) | `enter`/`exit` mask kinds (`wipe`/`iris`/`radialWipe`/`blinds`/`checkerboard`/`dissolve`/`clip`), `attention: "spotlight"` | ✅ | `mask.ts`+`enterexit.ts` reimplement the mask geometry generically (`maskRects`/`paintMask`) rather than calling `reveal.ts`'s per-kind functions one-by-one, but every kind in the family is reachable through the `enter`/`exit` vocabulary. See **Known gap #1** below for the group-specific caveat. |
| **focus** (`dimExcept`, `spotlightFocus`, `highlightRing`, `focusRings`, `flash`/`sparkFlash`, `focusBox`, `pointerArrow`, `ghost`, `magnify`, `wiggle`, `pulseScale`, `cornerBrackets`, `convergingArrows`, `vignetteTo`, `indicate`, `bouncePointer`, `emphasizeSurround`, `flashOverlay`) | `attention` verbs (`dim`→`dimExcept`, `spotlight`→`spotlightFocus`, `highlight`→`highlightRing`, `rings`→`focusRings`, `spark`→`sparkFlash`, `box`→`focusBox`, `pointer`→`pointerArrow`, `brackets`→`cornerBrackets`, `converge`→`convergingArrows`, `vignette`→`vignetteTo`); `ghost` prop → `ghost`; `magnify` prop → `magnify`; `emphasis` prop → `wiggle`/`pulseScale`/(`sequence.ts`'s `withPunch`/`withShake`) | ✅ | Every verb the schema defines maps to a real focus.ts call. `indicate`/`bouncePointer`/`emphasizeSurround`/`flashOverlay` are lower-level helpers not directly exposed as their own verb, but their *effects* (a one-shot indicator, a bouncing pointer cue, a surrounding emphasis ring, a full-frame flash) are all covered by combinations of the verbs above — no visual effect in this family is unreachable, only some specific helper-function *names* aren't 1:1 exposed. |
| **callout** (`callout.ts`) | `attention: "callout"` | ✅ | All of `side`/`route`/`container`/`color`/`text`/`title` reach `CalloutOptions`. |
| **sequence** (`buildSteps`, `stepProgress`, `stepState`, `revealList`, `predictReveal`, `emphasis`, `beat`, `punchScale`, `shakeOffset`, `withPunch`, `withShake`, `sequencer`) | `group.build` (→ `buildSteps`-style per-child stagger), `predict` prop (→ `predictReveal`), `emphasis` prop (→ `withPunch`/`withShake`) | 🟡 | The three headline capabilities (staggered build, predict/reveal, one-shot emphasis) are all reachable. `stepState`/`revealList`/`sequencer`/`beat` are lower-level compositions not separately exposed — `group.build`'s own stagger math is a from-scratch re-implementation (`renderGroup`'s `childTimings`), not a call into `buildSteps`, but produces the same "children appear one at a time" behavior. |
| **type-motion** (`counterValue`, `drawCounter`, `formatNumber`, `drawTypewriter`, `drawWordReveal`, `drawSlam`, `drawScramble`, `drawTextAlongPath`) | `stat` (→ `counterValue`+`drawCounter`+`formatNumber`), `text`/`heading` `mode`/`enter` (`word`→`drawWordReveal`, `typewriter`→`drawTypewriter`, `slam`→`drawSlam`, `scramble`→`drawScramble`), `textPath` (→ `drawTextAlongPath`) | ✅ | Every exported function in this family is reached. |
| **particles** (`emit`, `EmitterConfig`, presets) | `particles` component, `flow` (particle stream between two anchors) | ✅ | `gcl/particles.ts`'s `resolveEmitter` maps `preset`+`seed`+`config` to a full `EmitterConfig`; all 8 presets (`fire`/`smoke`/`sparks`/`rain`/`snow`/`dust`/`confetti`/`energy`) are named in the schema. |
| **camera** (`focusOn`, `lerpCamera`/`move`, `pushIn`, `centerCamera`, `isNeutral`) | `camera` directive (`kind: "move" | "pushIn"`) | ✅ | `gcl/camera.ts`'s `cameraAt` composes any number of timed directives into one continuous camera function. |
| **morph** (`morph`, `drawMorph`, `resample`, `align`, `circleShape`/`polygonShape`/`starShape`/`heartShape`) | `motion: "morph"` (shape outline morph), plus the shape generators back `shape`'s own vertex/sub-anchor math | ✅ | |
| **charts** (`axes`, `barChart`, `lineChart`, `plotFunction`, `scatter`, `pie`, `makePlot`, `niceTicks`) | `chart` (all 6 base kinds + the harvested `riemann` mode) | ✅ | `xLabel`/`yLabel`/`axes` reach `axes()`'s label/grid options. |
| **timeline** (`makeTimeline`, `timelineAxis`, `eras`, `events`, `playhead`, `formatYear`) | `timeline` component | ✅ | |
| **icons** (`drawIcon`, `iconNames`, `colorSemantics`) | `icon` component, `legend` component | 🟡 | `icon` fully reaches `drawIcon` (name validated against `iconNames`, `filled`/`color`/`size` all threaded through). `legend` reaches `colorSemantics().legend` but **cannot override its auto-assigned per-category colors** — see **Known gap #2**. |
| **geo** (`fitProjection`, `drawMap`/`drawFeature`, `borderAt`, `flowArrow`, `geoMarker`, `featureCenter`) | `map` component (`features`/`markers`/`flows`) | ✅ | Sub-anchors (`subanchors.ts`) additionally expose each feature and labeled marker as a target for `attention`/`at`. `borderAt` (a border interpolated *between* two keyframe rings over time) is not directly exposed as a single-field option — the same effect is authored today by putting multiple `features` (e.g. `border1206`, `border1260`) in one `map` and cross-fading/timing them via `cue`, which the mongol GCL lesson does. |
| **mathtext** (`drawMath`, `measureMath`) | `equation` component | ✅ | See the authoring-guide correction: `measureMath` is deterministic *within* an environment (browser canvas metrics vs. Node's analytic estimate), not literally ctx-free — both are pure/reproducible, just not numerically identical to each other. |
| **frame / layers** (`frame.ts`'s `LayerApi`, `grade`, `setCamera`) | Every component's `layer` override; `camera` directive → `frame.setCamera`; the film-level grade is applied by `composeSlides`/`renderFilm` (`filmGrade: true`), not per-component | ✅ | |
| **themes** (`TEXTBOOK`, `PARCHMENT`, `BLUEPRINT`, `CHALKBOARD`) | `scene.theme` | ✅ | All 4 themes are used across the 4 re-authored lessons (neuron=TEXTBOOK, gravity=CHALKBOARD, calculus=BLUEPRINT, mongol=PARCHMENT), matching their originals. |
| **table** (`gcl/table.ts`'s `drawTable` — new in P6, reuse-only from here) | `table` component | ✅ | |

---

## Known gaps / limitations (honest list — do not treat as 100%)

1. **Masked enter on a `group` does not capture its children into the mask buffer.** `applyEnterExit`'s
   masked path (`enterexit.ts`) draws the "finished content" callback into an offscreen buffer via
   `reveal.ts`'s `masked()`, then reveals that buffer through the mask shape. For every other component
   type, that "finished content" callback paints directly into the passed-in (possibly offscreen)
   `CanvasRenderingContext2D`. For a `group`, though, `compile.ts`'s `paintGroup` **ignores the layer
   argument it's given** — it always draws children via `rc.frame.layer.ctx(name)` (the real, on-screen
   per-name layers), because `renderGroup` needs the full `FrameCtx` (for per-child layer routing,
   clipping, nested groups) not a single flat `CanvasRenderingContext2D`. Net effect: give a `group` a
   masked `enter` (e.g. `{ type: "wipe" }`) and its children render immediately at full opacity on the
   real layers, ignoring the mask's reveal progress entirely — the mask only ever "reveals" an empty
   offscreen buffer. **Workaround (used in the 4 lessons and the authoring guide):** use `fade`, `none`,
   or `build` (which staggers each child's own entrance) as a group's `enter`; give masked-reveal
   treatment to individual children instead of the group wrapper.
2. **`legend` cannot override its per-category colors.** `colorSemantics().legend` always assigns its
   own semantic palette by category order; the schema's `legend` component has no `colors?: string[]`
   field. This is visible in `src/lessons/gcl/mongol.ts`'s scene 3: the khanate `legend` swatches don't
   match the hand-picked colors used on that scene's `attention: "box"` region highlights, because the
   two draw from independent color sources. Not a rendering bug — a real authoring-surface gap (the
   underlying `icons.ts` capability to hand-pick legend colors isn't threaded through the schema).
3. **Sub-anchors (and a component's own id-box) are computed once at layout time and do not track a
   component's live `motion` position.** If a component has `motion` (e.g. `orbit`/`along`/`fall`), any
   `attention`/`at`/`motion.to` that targets its `id` or `"<id>.<subanchor>"` resolves to where it was
   *laid out*, not where the animation has moved it to at the current `t`. This is a real limitation
   documented in the authoring guide (§4) rather than hidden; none of the 4 re-authored lessons target
   a moving component's own anchor for this reason (e.g. `gravity.ts`'s orbiting `cannonball`/`moon`
   are never themselves an `attention.target`).
4. **`chart` in `"function"` mode publishes only a `center` sub-anchor**, not per-sample points — there
   is no discrete "datum" to index for a continuous function, so `.peak`/`.last`/`.bar0` etc. are
   unavailable on that one chart kind (they ARE available on `bar`/`riemann`/`line`/`area`/`scatter`/
   `pie`). Caught during this phase's own browser verification (an early draft of `calculus.ts`/
   `gravity.ts` targeted `curve1.peak` on a `function` chart; fixed to target `.center` / the bare `id`
   instead — see `src/lessons/gcl/calculus.ts` and `gravity.ts`).
5. **`map`'s `borderAt` (time-interpolated border between two keyframe rings) has no direct schema
   field.** The same *effect* is authored today via multiple `features` entries timed with `cue` (see
   `mongol.ts`), not a single continuously-interpolating border. This is "reachable, differently
   authored" rather than a hard gap, but an LLM author should not expect a literal `borderAt`-style
   field to exist.

No engine family is entirely unreachable — every ✅/🟡 row above has at least one live path from the
schema into the corresponding `src/render/*` code, confirmed by grep against `compile.ts`'s imports and
by the browser/headless render checks in this phase. The gaps above are specific, narrow, and worked
around in the 4 re-authored lessons; they are not claimed as "100% coverage with no caveats."
