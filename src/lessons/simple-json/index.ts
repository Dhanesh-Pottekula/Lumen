import { renderLessonSpec, type LessonSpec } from "../../simple-json";
import type { CanvasSlideDefinition } from "../../slides/types";

import { howPlanesFlyLessonSpec } from "./howPlanesFly";
import { whySkyIsBlueLessonSpec } from "./whySkyIsBlue";

function renderStrict(spec: LessonSpec): CanvasSlideDefinition {
  const result = renderLessonSpec(spec);
  if (result.valid) return result.slide;
  throw new Error(`${spec.title} LessonSpec is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
}

export { howPlanesFlyLessonSpec, whySkyIsBlueLessonSpec };

export const howPlanesFlyLessonSpecSlide = renderStrict(howPlanesFlyLessonSpec);
export const whySkyIsBlueLessonSpecSlide = renderStrict(whySkyIsBlueLessonSpec);
