import { whySkyIsBlueLessonSpec } from "./lessons/simple-json";
import { NarratedLesson } from "./audio/NarratedLesson";

export default function App() {
  return (
    <main>
      <NarratedLesson spec={whySkyIsBlueLessonSpec} />
    </main>
  );
}
