import { CanvasSlide } from "./components/CanvasSlide";
import { neuronLesson } from "./lessons/neuronActionPotential";
import { gravityLesson } from "./lessons/gravityOrbits";
import { calculusLesson } from "./lessons/calculusArea";
import { mongolLesson } from "./lessons/mongolEmpire";
import {
  calculusLessonSpecSlide,
  gravityLessonSpecSlide,
  mongolLessonSpecSlide,
  neuronLessonSpecSlide,
} from "./lessons/simple-json";
import { NEWTON_CANNON_LESSON, renderLessonSpec } from "./simple-json";

const newtonSimpleJsonResult = renderLessonSpec(NEWTON_CANNON_LESSON);

if (!newtonSimpleJsonResult.valid) {
  throw new Error(
    `The Newton Simple JSON preview is invalid: ${newtonSimpleJsonResult.errors
      .map((error) => `${error.path}: ${error.message}`)
      .join("; ")}`,
  );
}

const newtonSimpleJsonSlide = newtonSimpleJsonResult.slide;

export default function App() {
  return (
    <main>
      {/* ── LLM-facing semantic JSON compiled deterministically into canonical GCL ─────────────── */}
      <CanvasSlide
        slide={newtonSimpleJsonSlide}
        title={<>🚀 Newton&apos;s Cannon — Simple JSON</>}
        tag={
          <>
            <b className="good">Generated from semantic intent JSON.</b> The JSON names the cannon,
            planet, curved trajectory, equation, labels, camera shots, and tour stops; the compiler
            supplies concrete layout, styling, timing, and rendering values.
          </>
        }
        notes={[
          "This is the first-class LLM-facing Simple JSON format rendered as a real playable screen.",
          "No authored pixels, colors, seconds, zoom values, radii, SVG paths, or raw GCL.",
          "Use Play or drag the timeline to inspect the reveal, camera push, labels, and guided tour.",
        ]}
      />

      {/* ── LLM-facing Simple JSON lessons — compiled deterministically to canonical GCL ───────── */}
      <CanvasSlide
        slide={neuronLessonSpecSlide}
        title={<>🧠 The Neuron Fires — Simple JSON</>}
        tag={
          <>
            <b className="good">Exact cinematic recipe.</b> same audited 77.50-second film as the original,
            selected by a strict four-field LLM-facing JSON object.
          </>
        }
        notes={[
          "Frame-identical: anatomy → membrane → threshold spike → repolarization → travelling wave → recap.",
          "The registered recipe owns the original geometry, timing, narration, camera, effects, and transitions.",
          "The original screen remains below as a live identity comparison.",
        ]}
      />

      <CanvasSlide
        slide={gravityLessonSpecSlide}
        title={<>🌍 Why the Moon Doesn&apos;t Fall — Simple JSON</>}
        tag={
          <>
            <b className="good">Exact cinematic recipe.</b> same audited 77.50-second film as the original,
            selected by a strict four-field LLM-facing JSON object.
          </>
        }
        notes={[
          "Frame-identical: apple → cannonball → inverse-square law → Kepler → Moon → recap.",
          "The registered recipe owns the original geometry, timing, narration, camera, effects, and transitions.",
          "The original screen remains below as a live identity comparison.",
        ]}
      />

      <CanvasSlide
        slide={calculusLessonSpecSlide}
        title={<>📐 The Area Under a Curve — Simple JSON</>}
        tag={
          <>
            <b className="good">Calculus, from rectangles to ∫.</b> Semantic JSON requests Riemann
            approximations, function and area charts, equations, counters, attention, and camera moves.
          </>
        }
        notes={[
          "Six Simple JSON scenes preserve the problem → rectangles → limit → theorem → recap arc.",
          "Rectangle counts are semantic tokens; chart dimensions, colors, drawing timing, and effects are derived.",
          "The original bespoke screen remains below for comparison.",
        ]}
      />

      <CanvasSlide
        slide={mongolLessonSpecSlide}
        title={<>🏹 The Mongol Empire — Simple JSON</>}
        tag={
          <>
            <b className="good">The largest contiguous land empire in history.</b> Semantic JSON carries
            historical dates and geography while requesting maps, growth, flows, timelines, tours, and labels.
          </>
        }
        notes={[
          "Six Simple JSON scenes preserve unification → conquest → growth → khanates → Pax Mongolica → legacy.",
          "Geographic coordinates and dates remain subject data; projection, colors, flow shape, and camera timing are derived.",
          "The original bespoke screen remains below for comparison.",
        ]}
      />

      {/* ── Originals — kept importable for side-by-side comparison ─────────────────────────────── */}
      <CanvasSlide
        slide={neuronLesson}
        title={<>🧠 Biology — The Neuron Fires (original)</>}
        tag={
          <>
            <b className="good">Anatomy of an action potential.</b> A stimulus crosses threshold, ion
            channels open, and the classic voltage spike draws itself on — scrub anywhere.
          </>
        }
        notes={[
          "Neuron → membrane → threshold spike → repolarization → the travelling wave → recap.",
          "Live AP curve synced to the voltage climb; morphing Na⁺/K⁺ channels; Nernst equation.",
          "Camera push-in, semantic ion colors + legend, particle ion flows — all pure functions of t.",
        ]}
      />

      <CanvasSlide
        slide={gravityLesson}
        title={<>🌍 Physics — Why the Moon Doesn't Fall (original)</>}
        tag={
          <>
            <b className="good">Newton, gravity &amp; orbits.</b> A cannonball fired fast enough stops
            falling to Earth and starts orbiting it — the trajectory morphs into a circle.
          </>
        }
        notes={[
          "Apple → Newton's cannonball → the inverse-square law → Kepler's ellipses → the Moon → recap.",
          "Parabola-to-orbit morph, 1/r² function plot, Kepler scatter proof, camera log-zoom.",
          "Deep-space CHALKBOARD theme; starfield + comet-tail particles; zoom-through cuts.",
        ]}
      />

      <CanvasSlide
        slide={calculusLesson}
        title={<>📐 Maths — The Area Under a Curve (original)</>}
        tag={
          <>
            <b className="good">Calculus, from rectangles to ∫.</b> Approximate the area with rectangles,
            then let their count run to infinity and watch the integral appear.
          </>
        }
        notes={[
          "The problem → rectangles → more rectangles → the limit → the fundamental theorem → recap.",
          "Riemann bars build one-by-one then thin toward ∞; the definition writes itself on.",
          "BLUEPRINT grid; charts + math typesetting (∑ ∫ lim) + converging counters.",
        ]}
      />

      <CanvasSlide
        slide={mongolLesson}
        title={<>🏹 History — The Mongol Empire (original)</>}
        tag={
          <>
            <b className="good">The largest contiguous land empire in history.</b> Borders grow across
            the years, split into four khanates, then recede — all on one seekable timeline.
          </>
        }
        notes={[
          "1206 → conquest → borders-over-time → the four khanates → Pax Mongolica → legacy.",
          "Projected map with draw-on borders, flow-arrow conquests, fog-of-war reveal, morphing frontiers.",
          "PARCHMENT aged-map theme; timeline playhead, semantic khanate colors, whip-pan cuts.",
        ]}
      />
    </main>
  );
}
