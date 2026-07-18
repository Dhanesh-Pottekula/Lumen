import type { CanvasSlideDefinition } from "../slides/types";
import { renderFilm } from "../gcl";
import type { Film } from "../gcl/schema";
import { compileResolvedLesson } from "./compile";
import { validateCanonicalFilm } from "./canonical";
import { analyzeResolvedLesson, type Diagnostic } from "./diagnostics";
import { validateResolvedKeyframes } from "./keyframes";
import { resolveLesson, type ResolvedLesson } from "./resolve";
import type { LessonSpec } from "./types";
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
export type RenderLessonResult =
  | (CompiledLesson & { slide: CanvasSlideDefinition })
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
  const keyframes = validateResolvedKeyframes(resolved);
  if (!keyframes.valid) return keyframes;
  const resolvedWarnings = analyzeResolvedLesson(resolved);
  const gcl = compileResolvedLesson(resolved);
  const canonical = validateCanonicalFilm(gcl);
  if (!canonical.valid) return canonical;
  return {
    valid: true,
    lesson: validated.value,
    resolved,
    gcl,
    warnings: [...validated.warnings, ...resolvedWarnings],
  };
}

export function renderLessonSpec(input: unknown): RenderLessonResult {
  const compiled = compileLessonSpec(input);
  if (!compiled.valid) return compiled;
  // Compilation remains diagnostic-friendly so an LLM can inspect and repair
  // warnings. Rendering is deliberately strict: known geometry, lifecycle, or
  // safe-frame problems must never be promoted into a user-visible video.
  if (compiled.warnings.length > 0) return { valid: false, errors: compiled.warnings };
  return { ...compiled, slide: renderFilm(compiled.gcl) };
}

export { LESSON_INPUT_SCHEMA, LESSON_SPEC_SCHEMA, SIMPLE_JSON_MAP_ICONS } from "./schema";
export { getSimpleJsonCapabilities } from "./capabilities";
export type { SimpleJsonCapabilities } from "./capabilities";
export {
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  SIMPLE_JSON_REPAIR_SYSTEM_PROMPT,
  SIMPLE_JSON_VISUAL_REVIEW_SYSTEM_PROMPT,
  buildLessonGenerationPrompt,
  buildLessonPlanningPrompt,
  buildLessonRepairPrompt,
  buildLessonVisualReviewPrompt,
} from "./prompts";
export type { LessonAuthoringRequest, VisualLessonPlan } from "./prompts";
export { validateCanonicalFilm } from "./canonical";
export { collectLessonKeyframes, validateResolvedKeyframes } from "./keyframes";
export type { LessonKeyframe } from "./keyframes";
export {
  availableVisualAssets,
  resolveVisualAsset,
  visualAssetAnchorMap,
  visualAssetAnchors,
  visualAssetBounds,
  visualOrientationAngle,
} from "./visual-catalog";
export type { VisualAssetDefinition, VisualOrientation } from "./visual-catalog";
export type * from "./types";
export type { Diagnostic, ValidationResult } from "./diagnostics";
export type { ResolvedLesson } from "./resolve";
