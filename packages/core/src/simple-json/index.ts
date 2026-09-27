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

function decodeInput(
  input: unknown,
): { ok: true; value: unknown } | { ok: false; error: Diagnostic } {
  if (typeof input !== "string") return { ok: true, value: input };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        path: "/",
        message:
          error instanceof Error ? error.message : "Input is not valid JSON",
        received: input,
      },
    };
  }
}

/** Optional narration timing/audio: per-scene minimum durations (from the audio) and the audio to play. */
export interface NarrationTiming {
  /** Minimum on-screen seconds, either keyed by scene id or ordered like the LessonSpec scenes. */
  sceneFloors?: Map<string, number> | number[];
  /** Object URL for the synthesized narration WAV, attached to the rendered slide for synced playback. */
  audioUrl?: string;
}

export interface RenderLessonOptions extends NarrationTiming {
  /** Solid host background used instead of Lumen's automatic full-frame backdrop. */
  backgroundColor?: string;
  /** Host appearance used to select a readable palette over the supplied background. */
  colorScheme?: "light" | "dark";
}

function withScreenPalette(
  input: unknown,
  colorScheme?: "light" | "dark",
): unknown {
  if (!colorScheme) return input;
  const decoded = decodeInput(input);
  if (
    !decoded.ok ||
    decoded.value === null ||
    typeof decoded.value !== "object" ||
    Array.isArray(decoded.value)
  ) {
    return input;
  }
  return {
    ...decoded.value,
    theme: colorScheme === "dark" ? "textbook" : "parchment",
  };
}

export function compileLessonSpec(
  input: unknown,
  timing?: NarrationTiming,
): CompileLessonResult {
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
const NON_BLOCKING_CODES = new Set([
  "LAYOUT_OVERFLOW",
  "LAYOUT_COLLISION",
  "CALLOUT_OVERFLOW",
  // The resolver has already added the lead-in segment this one reports, so the motion plays
  // correctly; blocking on it blanked every film that used `along` over a half-unit of slack.
  "MOTION_PATH_ADJUSTED",
  // The part falls back to whole-viewBox bounds, so the film plays and one label points at the whole
  // drawing instead of the piece. A coarser arrow is worth far more to the reader than a blank card.
  "IMPRECISE_SVG_BOUNDS",
  // The object plays from the scene's first frame, which is what a writer who forgot its `show` meant.
  "ASSUMED_VISIBLE",
  // The thing sits on its owner's centre instead of the part that was never exposed; the film plays.
  "ANCHOR_FALLBACK",
]);

export function renderLessonSpec(
  input: unknown,
  options?: RenderLessonOptions,
): RenderLessonResult {
  const compiled = compileLessonSpec(
    withScreenPalette(input, options?.colorScheme),
    options,
  );
  if (!compiled.valid) return compiled;
  // Rendering is strict about anything that would break the lesson — but tolerant of cosmetic layout
  // issues, which the resolver already adjusts (see resolve.ts). This is what keeps a lesson from
  // failing entirely over a handful of overflow/overlap pixels.
  const blocking = compiled.warnings.filter(
    (warning) => !NON_BLOCKING_CODES.has(warning.code),
  );
  if (blocking.length > 0) return { valid: false, errors: blocking };
  const slide = renderFilm(compiled.gcl, {
    backgroundColor: options?.backgroundColor,
  });
  return {
    ...compiled,
    slide: options?.audioUrl ? { ...slide, audioUrl: options.audioUrl } : slide,
  };
}

export {
  LESSON_INPUT_SCHEMA,
  LESSON_SPEC_SCHEMA,
  SIMPLE_JSON_MAP_ICONS,
} from "./schema";
export { getSimpleJsonCapabilities } from "./capabilities";
export type { SimpleJsonCapabilities } from "./capabilities";
export {
  CLAUDE_VIDEO_AUTHORING_PROMPT,
  CODEX_VIDEO_AUTHORING_PROMPT,
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  SIMPLE_JSON_REPAIR_SYSTEM_PROMPT,
  SIMPLE_JSON_VISUAL_REVIEW_SYSTEM_PROMPT,
  buildCodingAgentVideoPrompt,
  buildLessonGenerationPrompt,
  buildLessonPlanningPrompt,
  buildLessonRepairPrompt,
  buildLessonVisualReviewPrompt,
} from "./prompts";
export type {
  LessonAuthoringRequest,
  SupportedCodingAgent,
  VisualLessonPlan,
} from "./prompts";
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
export type {
  VisualAssetDefinition,
  VisualOrientation,
} from "./visual-catalog";
export type * from "./types";
export type { Diagnostic, ValidationResult } from "./diagnostics";
export type { ResolvedLesson } from "./resolve";
export type { CanvasSlideDefinition } from "../slides/types";
