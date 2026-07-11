# Authoring cookbook & schema-extension guide

## How to author a lesson (workflow)

1. **Break the topic into 4–7 scenes**, each one idea. Give each a `duration` (10–24s is typical; longer if narrated in depth).
2. **Pick a theme** for the whole film via top-level `theme` (TEXTBOOK for clean/clinical, BLUEPRINT for technical/graphs, CHALKBOARD for dark/space, PARCHMENT for history/maps).
3. **Lay beats on each scene's local timeline** (`at` in seconds, `0…duration`). Stagger them — don't start everything at `at: 0`. A title slams at ~0.3s, supporting elements enter over the next several seconds, a callout lands after the thing it labels exists.
4. **Let each beat's `dur`** control how long its entrance takes; after `at + dur` it holds.
5. **Choose a transition** (`crossfade` default; `zoom-through` for momentum; `whip-pan` for "meanwhile, elsewhere").
6. **Set `filmGrade: true`** for a cinematic finish.

## "I want to show X" → beat to use

| Goal | Beat / field |
|---|---|
| A title that lands hard | `text` `mode:"slam"` |
| Reveal a sentence word-by-word | `text` `mode:"word"` |
| A quiet label / paragraph | `text` `mode:"plain"` |
| An equation / formula / chemistry | `math` (LaTeX subset) |
| A number climbing (population, %, money) | `counter` + `fmt` |
| Compare categories | `bars` |
| Show proportions of a whole | `pie` (+ `donut`) |
| A trend / function / growth over a range | `line` (+ `area`) |
| A concept symbol (sun, leaf, atom, gear…) | `icon` |
| Point at a part and name it | `callout` (+ `container`, `route`, `side`) |
| Fire / smoke / sparks / energy / celebration | `particles` (5 presets) |
| Draw attention to a spot | `ring` (`converge:true` to grab, `false` to mark) |
| A panel, band, or colored backdrop | `rect` |
| Background mood | scene `bg: [top, bottom]` |

## Pacing tips for the model

- **One concept per scene.** If a scene has more than ~6 beats it's probably two scenes.
- **Give text room.** Don't stack two text beats on the same `y`.
- **Callouts come after their target.** Place the `icon`/shape first, then the `callout` pointing at its `x,y` a beat later.
- **Counters need `dur`.** A `counter` with `dur: 2` counts over two seconds; too short looks like a static number.
- **Keep within 920×430.** Leave ~40px margins.

---

## Extending the JSON schema (to reach the uncovered primitives)

The current `Beat` union covers the common cases. To expose the rest of the engine to the LLM, add new beat kinds to `Beat` in `src/render/storyboard.ts` and a matching `case` in `renderBeat`. Below is the **recommended mapping** — the beat shape to add and the exact primitive it should call. (This is guidance for extending the engine, and also documents what each effect *would* look like as JSON.)

| Proposed beat kind | Fields | Calls (module) | Notes |
|---|---|---|---|
| `stroke` | `points: [x,y][]`, `curve?`, `color?`, `width?`, `brush?` | `drawOn` (strokes) | A self-drawing line/shape; `p` drives the draw-on. |
| `wipe` / `iris` / `dissolve` | `x,y,w,h` or region, plus content | `wipe`/`iris`/`dissolve` (reveal) | Reveal grammar; these wrap *other* drawing, so they need a child-beat design or a "reveal region" model. |
| `spotlight` | `x,y,r` | `spotlight` (reveal) / `isolate` (focus) | Dim everything but a region. |
| `pointer` | `x,y`, `angle?`, `from?` | `pointerArrow` (focus) | An arrow that draws toward a point. |
| `build` | `items: Beat[][]`, `step` | `buildSteps` (sequence) | Progressive disclosure: current bright, prior dimmed. |
| `emphasis` | `at`, `kind:"punch"\|"shake"\|"flash"` wrapping a target | `withPunch`/`withShake`/`flashOverlay` (sequence) | Land a key moment. |
| `typewriter` / `scramble` / `textPath` | text + params | `drawTypewriter`/`drawScramble`/`drawTextAlongPath` (type-motion) | The kinetic-type modes not exposed by `text`. |
| `emitter` | full `EmitterConfig` | `emit` (particles) | Custom particles beyond the 5 presets (rain/snow/dust + all knobs). |
| `camera` | `x,y,zoom,rot`, `dur` | `frame.setCamera(lerpCamera(...))` (camera) | Pan/zoom/rotate the world; **scene-level**, not a normal beat — set once per scene and animate with `p`. |
| `timeline` | `range`, `eras[]`, `events[]` | `makeTimeline`+`eras`+`events`+`playhead` (timeline) | History date axis. |
| `morph` | `fromShape`, `toShape` | `drawMorph` (morph) | One shape flowing into another. |
| `map` | `features`, `styleFor`, projection | `fitProjection`+`drawMap`+`flowArrow`+`geoMarker`+`borderAt` (geo) | The whole geo subsystem; needs `GeoFeature` data in the beat. |

**Two design notes for whoever extends it:**

1. **Reveal/emphasis wrap other drawing.** `wipe`, `spotlight`, `withPunch`, etc. take a *draw callback*. To express them as flat beats you need either a "group" beat (a beat whose payload is a list of child beats it wraps) or a region-based model. The simplest first extension is the non-wrapping ones: `stroke`, `pointer`, `emitter`, `morph`, `camera`, `timeline`, `map`.
2. **Camera is per-scene, applied at composite.** It's set via `frame.setCamera(...)` and affects all non-`screenspace` layers. Model it as a scene-level field (e.g. `scene.camera: keyframes`) rather than a beat, or as a single beat evaluated before the others.

Each new `case` follows the same pattern as the existing ones: compute `p = phase(t, at, at+dur)`, get `ctx = frame.layer.ctx(layer)`, call the primitive with `p`. Keep it pure (no `Date.now`/`Math.random`).
