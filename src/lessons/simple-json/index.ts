import { renderLessonSpec, type LessonSpec } from "../../simple-json";
import type { CanvasSlideDefinition } from "../../slides/types";

import { howPlanesFlyLessonSpec } from "./howPlanesFly";

function renderStrict(spec: LessonSpec): CanvasSlideDefinition {
  const result = renderLessonSpec(spec);
  if (result.valid) return result.slide;
  throw new Error(`${spec.title} LessonSpec is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
}

export { howPlanesFlyLessonSpec };

export const howPlanesFlyLessonSpecSlide = renderStrict(howPlanesFlyLessonSpec);
