import { renderLessonSpec, type LessonSpec } from "../../simple-json";
import type { CanvasSlideDefinition } from "../../slides/types";

import { calculusLessonSpec } from "./calculus";
import { gravityLessonSpec } from "./gravity";
import { mongolLessonSpec } from "./mongol";
import { neuronLessonSpec } from "./neuron";

function renderStrict(spec: LessonSpec): CanvasSlideDefinition {
  const result = renderLessonSpec(spec);
  if (result.valid) return result.slide;
  throw new Error(`${spec.title} LessonSpec is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
}

export { calculusLessonSpec, gravityLessonSpec, mongolLessonSpec, neuronLessonSpec };

export const calculusLessonSpecSlide = renderStrict(calculusLessonSpec);
export const gravityLessonSpecSlide = renderStrict(gravityLessonSpec);
export const mongolLessonSpecSlide = renderStrict(mongolLessonSpec);
export const neuronLessonSpecSlide = renderStrict(neuronLessonSpec);
