import type { CanvasSlideDefinition } from "../slides/types";
import { renderFilm } from "../gcl";
import type { Film } from "../gcl/schema";
import { compileResolvedLesson } from "./compile";
import { validateCanonicalFilm } from "./canonical";
import type { Diagnostic } from "./diagnostics";
import { isCinematicRecipeInput, resolveCinematicRecipe } from "./recipes";
import { resolveLesson, type ResolvedLesson } from "./resolve";
import type { CinematicLessonSpec, LessonSpec } from "./types";
import { validateLessonSpec } from "./validate";

export interface CompiledLesson {
  valid: true;
  lesson: LessonSpec;
  resolved: ResolvedLesson;
  gcl: Film;
  warnings: Diagnostic[];
}

export interface LessonFailure {
  valid: false;
  errors: Diagnostic[];
}

export type CompileLessonResult = CompiledLesson | LessonFailure;
export interface RenderedCinematicLesson {
  valid: true;
  lesson: CinematicLessonSpec;
  slide: CanvasSlideDefinition;
  warnings: Diagnostic[];
}

export type RenderLessonResult =
  | (CompiledLesson & { slide: CanvasSlideDefinition })
  | RenderedCinematicLesson
  | LessonFailure;

function decodeInput(input: unknown): { ok: true; value: unknown } | { ok: false; error: Diagnostic } {
  if (typeof input !== "string") return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        path: "/",
        message: error instanceof Error ? error.message : "Input is not valid JSON",
        received: input,
      },
    };
  }
}

export function compileLessonSpec(input: unknown): CompileLessonResult {
  const decoded = decodeInput(input);
  if (!decoded.ok) return { valid: false, errors: [decoded.error] };
  const validated = validateLessonSpec(decoded.value);
  if (!validated.valid) return validated;
  const resolved = resolveLesson(validated.value);
  const gcl = compileResolvedLesson(resolved);
  const canonical = validateCanonicalFilm(gcl);
  if (!canonical.valid) return canonical;
  return {
    valid: true,
    lesson: validated.value,
    resolved,
    gcl,
    warnings: validated.warnings,
  };
}

export function renderLessonSpec(input: unknown): RenderLessonResult {
  const decoded = decodeInput(input);
  if (!decoded.ok) return { valid: false, errors: [decoded.error] };
  if (isCinematicRecipeInput(decoded.value)) return resolveCinematicRecipe(decoded.value);

  const compiled = compileLessonSpec(decoded.value);
  if (!compiled.valid) return compiled;
  return { ...compiled, slide: renderFilm(compiled.gcl) };
}

export { CINEMATIC_LESSON_SCHEMA, LESSON_INPUT_SCHEMA, LESSON_SPEC_SCHEMA } from "./schema";
export { validateCanonicalFilm } from "./canonical";
export { NEWTON_CANNON_LESSON } from "./fixtures";
export { isCinematicRecipeInput, resolveCinematicRecipe } from "./recipes";
export type * from "./types";
export type { Diagnostic, ValidationResult } from "./diagnostics";
export type { ResolvedLesson } from "./resolve";
