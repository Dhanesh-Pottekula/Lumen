import { CanvasSlide } from "./components/CanvasSlide";
import { neuronLesson } from "./lessons/neuronActionPotential";
import { gravityLesson } from "./lessons/gravityOrbits";
import { calculusLesson } from "./lessons/calculusArea";
import { mongolLesson } from "./lessons/mongolEmpire";

export default function App() {
  return (
    <main>
      <CanvasSlide
        slide={neuronLesson}
        title={<>🧠 Biology — The Neuron Fires</>}
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
        title={<>🌍 Physics — Why the Moon Doesn't Fall</>}
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
        title={<>📐 Maths — The Area Under a Curve</>}
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
        title={<>🏹 History — The Mongol Empire</>}
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
