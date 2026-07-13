import { gravityLesson } from "../lessons/gravityOrbits";
import { neuronLesson } from "../lessons/neuronActionPotential";
import type { CanvasSlideDefinition } from "../slides/types";
import type { Diagnostic } from "./diagnostics";
import {
  CINEMATIC_RECIPE_IDS,
  type CinematicLessonSpec,
  type CinematicRecipeId,
} from "./types";

const RECIPE_REGISTRY: Record<CinematicRecipeId, CanvasSlideDefinition> = {
  "biology.neuron-action-potential.original.v1": neuronLesson,
  "physics.gravity-orbits.original.v1": gravityLesson,
};

const RECIPE_KEYS = new Set(["version", "mode", "title", "recipe"]);

export type CinematicRecipeResult =
  | {
      valid: true;
      lesson: CinematicLessonSpec;
      slide: CanvasSlideDefinition;
      warnings: Diagnostic[];
    }
  | { valid: false; errors: Diagnostic[] };

function schemaError(path: string, message: string, received?: unknown): CinematicRecipeResult {
  return { valid: false, errors: [{ code: "SCHEMA_ERROR", path, message, received }] };
}

export function isCinematicRecipeInput(input: unknown): boolean {
  return !!input && typeof input === "object" && !Array.isArray(input)
    && (input as Record<string, unknown>).mode === "cinematic-recipe";
}

export function resolveCinematicRecipe(input: unknown): CinematicRecipeResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return schemaError("/", "Cinematic recipe input must be an object", input);
  }

  const value = input as Record<string, unknown>;
  const extra = Object.keys(value).find((key) => !RECIPE_KEYS.has(key));
  if (extra) return schemaError(`/${extra}`, `Unknown field '${extra}' is not allowed`, value[extra]);
  if (value.version !== "1") return schemaError("/version", "must be equal to constant", value.version);
  if (value.mode !== "cinematic-recipe") return schemaError("/mode", "must be equal to constant", value.mode);
  if (typeof value.title !== "string" || value.title.length === 0) {
    return schemaError("/title", "must be a non-empty string", value.title);
  }
  if (typeof value.recipe !== "string") return schemaError("/recipe", "must be a string", value.recipe);
  if (!CINEMATIC_RECIPE_IDS.includes(value.recipe as CinematicRecipeId)) {
    return {
      valid: false,
      errors: [{
        code: "UNKNOWN_RECIPE",
        path: "/recipe",
        message: `Unknown cinematic recipe '${value.recipe}'`,
        received: value.recipe,
        suggestions: [...CINEMATIC_RECIPE_IDS],
      }],
    };
  }

  const lesson = value as unknown as CinematicLessonSpec;
  return { valid: true, lesson, slide: RECIPE_REGISTRY[lesson.recipe], warnings: [] };
}
