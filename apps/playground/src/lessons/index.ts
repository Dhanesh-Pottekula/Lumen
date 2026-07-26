import {
  renderLessonSpec,
  type CanvasSlideDefinition,
  type LessonSpec,
} from "@aira/lumen";

import { howPlanesFlyLessonSpec } from "./howPlanesFly";
import { whySkyIsBlueLessonSpec } from "./whySkyIsBlue";
import { tortoiseAndHareLessonSpec } from "./tortoiseAndHare";
import { waterCycleLessonSpec } from "./waterCycle";

function renderStrict(spec: LessonSpec): CanvasSlideDefinition {
  const result = renderLessonSpec(spec);
  if (result.valid) return result.slide;
  throw new Error(`${spec.title} LessonSpec is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
}

export {
  howPlanesFlyLessonSpec,
  tortoiseAndHareLessonSpec,
  waterCycleLessonSpec,
  whySkyIsBlueLessonSpec,
};

export const howPlanesFlyLessonSpecSlide = renderStrict(howPlanesFlyLessonSpec);
export const whySkyIsBlueLessonSpecSlide = renderStrict(whySkyIsBlueLessonSpec);
export const tortoiseAndHareLessonSpecSlide = renderStrict(tortoiseAndHareLessonSpec);
export const waterCycleLessonSpecSlide = renderStrict(waterCycleLessonSpec);
