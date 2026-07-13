import type { CinematicLessonSpec } from "../../simple-json";

/** LLM-facing intent: exact reproduction is supplied by the audited deterministic recipe. */
export const gravityLessonSpec: CinematicLessonSpec = {
  version: "1",
  mode: "cinematic-recipe",
  title: "Why the Moon Doesn't Fall",
  recipe: "physics.gravity-orbits.original.v1",
};
