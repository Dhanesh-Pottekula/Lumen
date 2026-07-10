# Making the Videos Amazing — Visual Experience Roadmap

**Purpose.** Turn the canvas player from "a nice animated diagram" into a **general visual-teaching
engine** that produces genuinely engaging, cinematic lessons across maths, physics, history, and
biology. This document captures everything we intend to integrate, *why* each piece exists, and
*how it makes the video better*.

**Scope note.** Audio/narration is intentionally out of scope for this document — we are focusing on
visuals and screens. Video export is also out (we play live, never render to a file).

---

## Guiding principles (non-negotiable)

- **Instant-run.** The "video" is the live canvas calling `render(ctx, t)`. No build, no export, no
  pre-render. Edit code → it plays; scrub → instant, because `render(t)` is a pure function of time.
- **Nothing slow blocks playback.** Anything expensive (equation layout, geo data, physics) must be
  computable live in the browser or loaded as a static file. No author-time gates.
- **Deterministic & seekable.** Every feature must be a pure function of `t` so any frame is
  reproducible and the scrubber lands exactly.
- **Semantic, not hard-coded.** Scenes ask for *roles* (ink, accent, focus) not literal colors, so a
  single theme swap restyles everything.

## Where we are today (baseline)

- Pure `render(ctx, t)` slides; `composeSlides` sequencer (crossfades, progress dots, offscreen-buffer
  compositing); `<CanvasSlide>` player (play/pause/scrub).
- SVG asset system (registry, manifest, `drawSvg`) with per-scene fallbacks.
- Started filmic FX: easing helpers, `radialGlow`/`withGlow`, and a `filmGrade` overlay
  (vignette + grain + grade).
- Two example films (Coimbatore, Photosynthesis).

**The core problem to fix:** everything is **bespoke per scene** — every arrow, organelle, and label
is hand-coded. That doesn't scale to "teach anything." The rest of this document is about replacing
bespoke code with **reusable primitives + art direction + a declarative authoring model**.

---

## 1 · Foundations (build first — everything renders through these)

### 1.1 Layer / compositing model
- **What.** Split every scene into explicit layers: `background`, `midground`, `foreground`,
  `annotation`, `fx`. The renderer walks layers in order.
- **Why.** Right now everything is drawn inline in one flat pass, so depth, parallax, masking, and
  post effects are impossible to do cleanly.
- **Makes it better.** Enables parallax (background drifts slower than foreground), depth-of-field
  (blur the background), a dedicated annotation layer that always sits on top of content, and a clean
  place to apply the filmic pass. It also makes authoring far tidier — you place a thing "in the
  midground" instead of managing draw order by hand.

### 1.2 Theme / art-direction system
- **What.** A theme is a **plain data object** resolved at runtime — like CSS variables for the canvas:
  `{ palette, texture, lineStyle, type, fx }`. Presets: parchment (history), blueprint (physics),
  chalkboard (maths), textbook plate (biology).
- **Why.** Mechanics (glow, camera) make things move; **art direction makes a lesson *feel* like its
  subject.** A history map should look like an aged atlas; a physics diagram like an engineering
  blueprint. We had no concept of this — every scene invented its own colors.
- **How it works.** The player holds the active theme and passes it into `render(ctx, t, theme)`.
  Primitives never hard-code color — a callout asks for `theme.palette.ink`, an axis for
  `theme.palette.muted`. `texture` paints the backdrop + a post pass (parchment = warm gradient +
  fibre grain + aged edges; blueprint = deep blue + fine grid; chalkboard = slate + chalk dust).
  `lineStyle.roughness` adds a tiny seeded per-vertex jitter that turns clean vectors into hand-drawn
  ink or chalk.
- **Makes it better.** One data swap reskins an entire film. It gives each subject a distinct,
  crafted identity, and `roughness` is the biggest "this feels made by a person, not generated" cue.
- **Design note.** True-color illustrations (a real green leaf, blue ocean) *opt out* of theming; the
  theme styles the **explanatory layer** (lines, labels, UI, backdrop), not literal artwork.

---

## 2 · Motion & FX craft (the cinematic layer)

### 2.1 Easing & micro-motion
- **What.** A full easing set (ease-in-out, back/overshoot, spring) plus never-static idle drift /
  breathing on elements.
- **Why.** Almost all our motion today is a single linear-windowed fade. Linear motion reads as
  robotic; nothing alive is ever perfectly still.
- **Makes it better.** Reveals with a slight overshoot feel intentional and lively; subtle idle
  motion keeps the frame breathing so it never looks frozen.

### 2.2 Additive glow / bloom
- **What.** Draw light sources (sun, electrons, energy, beams) a second time with
  `globalCompositeOperation = "lighter"` and a radial falloff.
- **Why.** It's the single cheapest technique that makes canvas look premium instead of flat.
- **Makes it better.** Light appears to *emit* rather than just be colored — instantly more polished
  and dramatic. (Helper already built: `radialGlow`.)

### 2.3 Soft shadows & depth
- **What.** Native `ctx.shadowBlur/shadowColor` under organelles, molecules, cards, and text.
- **Why.** Flat shapes float ambiguously; canvas can do real soft shadows that SVG-in-canvas cannot.
- **Makes it better.** Elements sit in space with a sense of layering and light. (Helper built:
  `withGlow`.)

### 2.4 Filmic overlay (vignette + grain + grade)
- **What.** A post pass over the final frame: vignette (darkened edges), faint animated grain, subtle
  color-grade gradient. Deterministic grain keyed to `t` so scrubbing stays exact.
- **Why.** This one pass is what makes footage read as "produced" instead of "diagram."
- **Makes it better.** Cohesive, cinematic mood across every scene. (Built as the `filmGrade` option.)

### 2.5 Draw-on / handwriting animation
- **What.** Strokes that draw themselves over time (animate `stroke-dashoffset` / partial path length).
- **Why.** It mimics a teacher drawing on a board — one of the most engaging teaching visuals there
  is, and we have none of it.
- **Makes it better.** Diagrams, equations, arrows, and shapes *construct themselves* in sync with the
  explanation, which holds attention and shows *process*, not just result. Especially transformative
  for maths and geometry.

### 2.6 Motion blur & trails
- **What.** Fast-moving elements (electrons, molecules, projectiles) drawn with faint trailing copies.
- **Why.** Instantaneous jumps look cheap; trails communicate speed and direction.
- **Makes it better.** Motion reads as fluid and energetic; cheap to do, very cinematic.

### 2.7 Reveal grammar (masks, wipes, blend modes)
- **What.** Clip-path reveals (wipe, iris, shaped), plus blend modes beyond `lighter`
  (`multiply` for aging/shadow, `screen`/`overlay` for light).
- **Why.** Right now content can only fade in. Real explainers *reveal* — a map region uncovered
  through a mask, a diagram wiped in, a stain that darkens parchment.
- **Makes it better.** More expressive, intentional entrances; enables fog-of-war on maps and elegant
  focus transitions.

### 2.8 Ambient & environmental life
- **What.** Procedural atmosphere: smoke, rain, fire, dust, sparks, plus natural motion (waving flags,
  rippling water, flickering fire).
- **Why.** Static scenes feel like slides; a battlefield should *feel* like a battlefield.
- **Makes it better.** Mood and immersion. A history war scene with drifting smoke, or a monsoon scene
  with rain, becomes memorable rather than informational.

---

## 3 · Cinematography

### 3.1 Camera system — `camera(t)`
- **What.** A shared transform (translate + scale + rotate) applied to the whole frame, driven by `t`.
- **Why.** Every scene is statically framed today; the one zoom we have is a hand-rolled scale.
- **Makes it better.** Enables push-ins for emphasis, pans to the element being discussed, and the
  signature move: a **continuous zoom through scales** — leaf → cell → chloroplast → membrane, or
  world → country → city → person — as one unbroken dolly instead of separate cuts. This is the most
  "wow" capability on the list and it's reused by every domain.

### 3.2 Transition variety
- **What.** Beyond crossfade: zoom-through, whip-pan, and morph transitions between scenes.
- **Why.** One transition for everything gets monotonous.
- **Makes it better.** Punctuation and rhythm — a zoom-through between two related ideas *shows* the
  relationship; a whip-pan conveys a jump in place or time.

### 3.3 Parallax & depth-of-field
- **What.** Background layers move slower and slightly blurred; foreground stays crisp.
- **Why.** Flat scenes have no sense of space.
- **Makes it better.** Depth and focus — the eye is guided to the sharp foreground while the world
  exists behind it. (Depends on the layer model, 1.1.)

---

## 4 · Teaching primitives (the reusable library — the real multiplier)

These replace bespoke scene code. Each is parameterized and animatable, styled by the active theme.

### 4.1 Attention direction
- **What.** Spotlight + dim everything else, highlight rings, ghosting (fade non-focal elements).
- **Why.** Directing the eye is the #1 teaching skill and we have none of it.
- **Makes it better.** The viewer always knows where to look; complex scenes stop being overwhelming.

### 4.2 Callouts & leader lines
- **What.** An annotation layer: labels that animate in and point at things with leader lines.
- **Why.** Labelling is core to every diagram; today it's hand-placed text per scene.
- **Makes it better.** Clean, consistent, animated labelling that always sits above content and can
  appear/disappear on cue.

### 4.3 Progressive disclosure / build-steps
- **What.** First-class "build step" concept: reveal one piece at a time; earlier pieces persist and
  dim.
- **Why.** Dumping a full diagram at once overwhelms; understanding is sequential.
- **Makes it better.** The lesson unfolds at the pace of thought, which is exactly how good teachers
  explain.

### 4.4 Compare / contrast
- **What.** Split-screen, overlay, and before→after morphs.
- **Why.** Comparison is a fundamental explanatory move with no support today.
- **Makes it better.** Differences and transformations become obvious and visual (e.g., reactant →
  product, 1914 border → 1918 border).

### 4.5 Predict-and-reveal beats
- **What.** Pose a question or show a setup, hold a beat, then reveal the answer.
- **Why.** Retention jumps when the viewer predicts before seeing.
- **Makes it better.** Turns passive watching into active thinking.

### 4.6 Emphasis choreography
- **What.** A "this matters" grammar: scale-punch, screen-shake, flash, freeze-frame on key beats.
- **Why.** Everything at one intensity is flat; important moments need to land.
- **Makes it better.** Separates the pivotal moment from the surrounding explanation — documentary
  energy rather than a monotone diagram.

### 4.7 Kinetic typography
- **What.** Dates, numbers, and labels as animated citizens: counting up, dramatic date slams,
  word-by-word emphasis.
- **Why.** Text currently just fades; for history the dates and names *are* half the drama.
- **Makes it better.** Text becomes part of the motion design rather than static overlay.

### 4.8 Axes, grid & animated function plotting
- **What.** Coordinate systems, grids, and curves that draw as `t` sweeps (`y = f(x)`, parametric,
  polar).
- **Why.** Foundational for maths and for any live graph in physics/biology/history data.
- **Makes it better.** Concepts like slope, area, and growth become *animated*, not static plots.

### 4.9 Timeline
- **What.** A real timeline component: eras, parallel tracks, events, a moving playhead.
- **Why.** History (and any process) needs proper time structure; we only have a hand-drawn strip.
- **Makes it better.** Chronology becomes navigable and legible; parallel tracks show simultaneity.

### 4.10 Charts / data-viz
- **What.** Animated bar / line / pie charts bound to data arrays.
- **Why.** Every subject uses data; none is supported.
- **Makes it better.** Numbers become visual stories that build on screen.

### 4.11 Counters / number tickers
- **What.** Numbers that animate to their value (populations, years, quantities).
- **Why.** A number that *counts* is dramatically more engaging than one that appears.
- **Makes it better.** Scale and change become felt, not just read.

### 4.12 Shape / path morphing
- **What.** Interpolate one shape/path into another.
- **Why.** Transformation is a universal teaching idea (reactant→product, shape→shape, border→border).
- **Makes it better.** Change is shown as continuous transformation, which is far clearer than a cut.

### 4.13 Particle system
- **What.** A configurable emitter (count, spread, speed, lifetime, style) for dots, sparks, dust,
  smoke, energy.
- **Why.** We hand-roll particles per scene; a shared emitter powers both effects and ambience.
- **Makes it better.** Reusable life and energy everywhere, from electron flows to battlefield smoke.

### 4.14 Iconography + color-semantics
- **What.** A reusable icon/sprite kit per domain, plus meaning-coded palettes with auto-generated
  legends (each empire/force/category its own consistent color).
- **Why.** Consistency and legibility; a viewer learns "blue = this side" once.
- **Makes it better.** Scenes become instantly readable and visually consistent across a whole lesson.

---

## 5 · Domain kits (assemble primitives + a few kit-specific pieces)

### 5.1 Maths
- **Needs.** Runtime **KaTeX** (render an equation to an image in-browser in milliseconds, then draw
  it — canvas `fillText` can't do fractions/integrals/matrices), geometry constructions, graphs,
  vectors, number lines, transformations.
- **Makes it better.** Real typeset maths that draws itself, plus animated graphs — the difference
  between a textbook and a great teacher at a board.

### 5.2 Physics
- **Needs.** A **seekable** motion layer (closed-form formulas of `t` — pendulum, projectile, waves),
  vector/force fields, ray/optics diagrams, circuits, free-body diagrams, live graphs.
- **Hard problem.** Real simulation accumulates state, which breaks seekability. **Chosen approach:**
  closed-form where it exists; otherwise author a keyframe table (never a runtime pre-render gate).
- **Makes it better.** Physics you can *scrub* — pause exactly at the top of the arc — while staying
  instant.

### 5.3 History
- **Needs.** The **map/geo subsystem** (below), timelines, portrait/photo support with Ken Burns
  pan-zoom, a date ticker.
- **Makes it better.** Continents, shifting borders, troop movements, and wars become a living map
  rather than a static image — exactly the "show every little thing" goal.

#### The map / geo subsystem — how borders-changing-over-time works
- **Data.** Coastlines/borders as **GeoJSON** (static files, simplified per zoom level, load instantly).
  A `projection(lon,lat)→{x,y}` maps globe to canvas; swapping projections is one function.
- **Temporal model.** Time is an **interpolation input, not an accumulator.** A changing border is a
  few **dated keyframes**; `year(t)` is derived from playback time, and the renderer interpolates the
  geometry for that year. So 1916.5 blends the 1916 and 1917 outlines — and the same `t` always yields
  the same frame, preserving seekability.
- **Interpolation gotcha.** Two outlines can have different point counts; naive point-by-point lerp
  breaks. **Fix:** resample every outline to a fixed N points at author time so vertices correspond
  (or cross-fade filled regions for territory gains).
- **Everything else keys off `year(t)`.** Region fills (ownership blends on change), moving front
  lines, flow arrows for armies/trade/migration (draw-on along a path with moving dashes — we already
  have this primitive), battle markers (appear on their date with an emphasis punch), fog-of-war
  reveal (a mask that clears as the story reaches a region), and camera pan/zoom to the discussed area.
- **Makes it better.** A WWI scene = one basemap + a handful of dated keyframes, fully scrubbable and
  instant — empires visibly grow and collapse.

### 5.4 Biology
- **Needs.** Cross-sections/cutaways (have some), molecular structures, cycles/processes, phylogenetic
  trees, population/ecology diagrams — plus the camera for zoom-through-scales.
- **Makes it better.** The "zoom from organism to molecule" journey as one continuous shot.

---

## 6 · Authoring model (later — the endgame)

- **What.** Scenes expressed as **declarative data** (a storyboard) that the primitive library renders,
  instead of bespoke per-scene code.
- **Why.** Once lessons are code, the bottleneck is writing scenes. Once they're data, authoring is
  fast — and an LLM can *generate* a lesson by emitting a storyboard.
- **Makes it better.** This is what turns "we can make a photosynthesis video" into "AiRA can generate
  a themed, animated lesson on any topic on demand."

---

## 7 · Suggested build sequence

1. **Foundations** — layer model + theme system (small, and they instantly upgrade the existing
   photosynthesis film, giving us a real testbed).
2. **Finish the motion/FX craft** — glow/shadow/grade across all scenes, draw-on, easing/micro-motion,
   reveal grammar.
3. **Teaching primitives** — attention, callouts, plots, timeline, charts, morph, particles.
4. **Camera & atmosphere** — `camera(t)`, transitions, parallax/DOF, ambient life, kinetic type,
   emphasis beats.
5. **Domain kits** — start with the one you most want to demo (history/maps or maths).
6. **Authoring/storyboard model.**

## 8 · Explicitly out of scope (for now)

- Audio / narration / sync (revisit later).
- Video export / offline frame rendering.
- Any author-time precompute that would delay running a lesson.
