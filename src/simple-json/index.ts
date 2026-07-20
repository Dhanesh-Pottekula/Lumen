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

/** Optional narration timing/audio: per-scene minimum durations (from the audio) and the audio to play. */
export interface NarrationTiming {
  /** scene id → minimum on-screen seconds (from the narration span). Scenes absent keep their paced length. */
  sceneFloors?: Map<string, number>;
  /** Object URL for the synthesized narration WAV, attached to the rendered slide for synced playback. */
  audioUrl?: string;
}

export function compileLessonSpec(input: unknown, timing?: NarrationTiming): CompileLessonResult {
  const decoded = decodeInput(input);
  if (!decoded.ok) return { valid: false, errors: [decoded.error] };
  const validated = validateLessonSpec(decoded.value);
  if (!validated.valid) return validated;
  const resolved = resolveLesson(validated.value, timing?.sceneFloors);
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

// Cosmetic layout diagnostics the engine already auto-corrects (objects are auto-fit and clamped to the
// safe frame, overlaps are auto-separated, callouts are auto-flipped/clamped). A few stray pixels of
// clip or overlap must never blank the whole video — these stay as advisory warnings but do NOT block
// rendering. Everything else (lifecycle, references, motion geometry, schema) still blocks.
const NON_BLOCKING_CODES = new Set(["LAYOUT_OVERFLOW", "LAYOUT_COLLISION", "CALLOUT_OVERFLOW"]);

export function renderLessonSpec(input: unknown, timing?: NarrationTiming): RenderLessonResult {
  const compiled = compileLessonSpec(input, timing);
  if (!compiled.valid) return compiled;
  // Rendering is strict about anything that would break the lesson — but tolerant of cosmetic layout
  // issues, which the resolver already adjusts (see resolve.ts). This is what keeps a lesson from
  // failing entirely over a handful of overflow/overlap pixels.
  const blocking = compiled.warnings.filter((warning) => !NON_BLOCKING_CODES.has(warning.code));
  if (blocking.length > 0) return { valid: false, errors: blocking };
  const slide = renderFilm(compiled.gcl);
  return { ...compiled, slide: timing?.audioUrl ? { ...slide, audioUrl: timing.audioUrl } : slide };
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
