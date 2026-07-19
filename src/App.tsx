import { CanvasSlide } from "./components/CanvasSlide";
import { howPlanesFlyLessonSpecSlide } from "./lessons/simple-json";

export default function App() {
  return (
    <main>
      <CanvasSlide
        slide={howPlanesFlyLessonSpecSlide}
        title={<>✈️ How Airplanes Fly — Simple JSON (from script, one-shot)</>}
        tag={
          <>
            <b className="good">The physics of lift, shown.</b> Four forces → the wing's shape →
            faster air → lower pressure → angle of attack → speed, and stall.
          </>
        }
        notes={[
          "400 tonnes? → four forces → airfoil → airflow → pressure → downwash → lift vs speed → stall → recap.",
          "Authored one-shot from docs/skills/scripts/how-planes-fly.md — no compiler, no validation.",
        ]}
      />
    </main>
  );
}
