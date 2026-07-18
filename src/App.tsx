import { CanvasSlide } from "./components/CanvasSlide";
import {
  calculusLessonSpecSlide,
  gravityLessonSpecSlide,
  mongolLessonSpecSlide,
  neuronLessonSpecSlide,
} from "./lessons/simple-json";

export default function App() {
  return (
    <main>
      <CanvasSlide
        slide={neuronLessonSpecSlide}
        title={<>🧠 The Neuron Fires — Simple JSON</>}
        tag={
          <>
            <b className="good">Biology explained as cause and effect.</b> See where ions begin,
            which gates open, how voltage changes, and how the pulse moves along the axon.
          </>
        }
        notes={[
          "Anatomy → resting voltage → Na⁺ spike → K⁺ recovery → travelling wave → recap.",
          "Every graph follows the ion movement that causes it.",
        ]}
      />

      <CanvasSlide
        slide={gravityLessonSpecSlide}
        title={<>🌍 Why the Moon Doesn&apos;t Fall — Simple JSON</>}
        tag={
          <>
            <b className="good">Physics explained visually.</b> Downward acceleration, sideways
            speed, distance, and inward pull build toward orbital motion.
          </>
        }
        notes={[
          "Falling apple → cannonball range → inverse-square law → Kepler → Moon → recap.",
          "Forces and trajectories appear before their supporting equations.",
        ]}
      />

      <CanvasSlide
        slide={calculusLessonSpecSlide}
        title={<>📐 The Area Under a Curve — Simple JSON</>}
        tag={
          <>
            <b className="good">Calculus as visible refinement.</b> Wide rectangles become thinner,
            approach a limiting sum, and lead to an exact antiderivative.
          </>
        }
        notes={[
          "Question → approximation error → convergence → integral → theorem → recap.",
          "The displayed estimates match the left-endpoint rectangles actually drawn.",
        ]}
      />

      <CanvasSlide
        slide={mongolLessonSpecSlide}
        title={<>🏹 The Mongol Empire — Simple JSON</>}
        tag={
          <>
            <b className="good">History explained spatially.</b> Maps show tribes converging,
            campaigns moving, borders expanding, routes connecting, and successor states dividing.
          </>
        }
        notes={[
          "Unification → conquest → growth → khanates → exchange networks → fragmentation.",
          "Maps and timelines carry the explanation before supporting text appears.",
        ]}
      />
    </main>
  );
}
