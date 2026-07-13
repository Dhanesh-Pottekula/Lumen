import type { CinematicLessonSpec } from "../../simple-json";

/** LLM-facing intent: exact reproduction is supplied by the audited deterministic recipe. */
export const neuronLessonSpec: CinematicLessonSpec = {
  version: "1",
  mode: "cinematic-recipe",
  title: "The Neuron Fires",
  recipe: "biology.neuron-action-potential.original.v1",
};
