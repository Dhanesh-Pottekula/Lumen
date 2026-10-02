import type { CanvasSlideDefinition } from "../slides/types";
import type { Film } from "../gcl/schema";
import type { Diagnostic } from "./diagnostics";
import { filmBuilder, floorOf, sceneSteps, screenHeader, type KeptScene, type NarrationTiming, type RenderLessonOptions } from "./film";
import type { ResolvedLesson } from "./resolve";
import type { LessonSpec } from "./types";
import { notAFilm } from "./validate";
import { sceneImageSources } from "./image";
import { preloadImages, releaseImages } from "../gcl/images";

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

/** A whole film split into its header and its scenes, or why it is not a film at all. */
function filmParts(input: unknown): { header: Omit<LessonSpec, "scenes">; scenes: unknown[] } | LessonFailure {
  const decoded = decodeInput(input);
  if (!decoded.ok) return { valid: false, errors: [decoded.error] };
  const errors = notAFilm(decoded.value);
  if (errors) return { valid: false, errors };
  const { scenes, ...header } = decoded.value as LessonSpec;
  return { header, scenes };
}

/** The scenes' floors as given, unless an ordered list does not describe every scene with a usable duration. */
function wholeFloors(floors: NarrationTiming["sceneFloors"], scenes: number): NarrationTiming["sceneFloors"] {
  // Ordered timing is one atomic wire value: partially applying a truncated/corrupt array pads some
  // scenes while the client switches the whole film to direct audio seconds.
  if (!Array.isArray(floors)) return floors;
  return floors.length === scenes && floors.every((floor) => Number.isFinite(floor) && floor >= 0) ? floors : undefined;
}

/** The compiled film made of the scenes that were kept, every dropped scene's reasons among its warnings. */
function compiledFilm(header: Omit<LessonSpec, "scenes">, kept: KeptScene[], warnings: Diagnostic[], dropped: Diagnostic[][], total: number): CompiledLesson | LessonFailure {
  const reasons = dropped.flat().map((error) => ({ ...error, code: "DROPPED_SCENE" as const }));
  if (kept.length === 0) return { valid: false, errors: [noSceneLeft(total), ...dropped.flat()] };
  return {
    valid: true,
    lesson: { ...header, scenes: kept.map((scene) => scene.lesson) },
    resolved: { version: header.version, title: header.title, ...(header.categories ? { categories: header.categories } : {}), scenes: kept.map((scene) => scene.resolved) },
    gcl: kept.flatMap((scene) => scene.gcl),
    warnings: [...warnings, ...reasons],
  };
}

function noSceneLeft(total: number): Diagnostic {
  return { code: "NO_DRAWABLE_SCENE", path: "/scenes", message: `Every one of the ${total} scenes was dropped`, received: total };
}

/** Validate, lay out and compile a whole film; a scene that cannot be drawn is dropped and reported. */
export function compileLessonSpec(input: unknown, timing?: NarrationTiming): CompileLessonResult {
  const film = filmParts(input);
  if ("valid" in film) return film;
  const step = sceneSteps(film.header, false);
  const floors = wholeFloors(timing?.sceneFloors, film.scenes.length);
  const kept: KeptScene[] = [];
  const warnings: Diagnostic[] = [];
  const dropped: Diagnostic[][] = [];
  film.scenes.forEach((scene, index) => {
    const outcome = step(scene, index, floorOf(floors, index, scene));
    if ("errors" in outcome) {
      dropped.push(outcome.errors);
      return;
    }
    kept.push(outcome.kept);
    warnings.push(...outcome.warnings);
  });
  return compiledFilm(film.header, kept, warnings, dropped, film.scenes.length);
}

/**
 * Compile and draw a whole film: the same as adding its scenes one by one to `createFilmCompiler`, so
 * a film reloaded whole draws exactly as it did when its scenes arrived one at a time.
 */
export function renderLessonSpec(input: unknown, options?: RenderLessonOptions): RenderLessonResult {
  const film = filmParts(input);
  if ("valid" in film) return film;
  const { compiler, kept } = filmBuilder(film.header, { ...options, sceneFloors: wholeFloors(options?.sceneFloors, film.scenes.length) });
  const added = film.scenes.map((scene) => compiler.add(scene));
  const compiled = compiledFilm(
    screenHeader(film.header, options?.colorScheme),
    kept,
    added.flatMap((result) => result.warnings),
    added.flatMap((result) => (result.errors ? [result.errors] : [])),
    film.scenes.length,
  );
  return compiled.valid ? { ...compiled, slide: compiler.slide() } : compiled;
}

export { createFilmCompiler } from "./film";
export type { AddResult, FilmCompiler, NarrationTiming, RenderLessonOptions } from "./film";

export {
  LESSON_INPUT_SCHEMA,
  LESSON_SPEC_SCHEMA,
  SIMPLE_JSON_MAP_ICONS,
} from "./schema";
export { getSimpleJsonCapabilities } from "./capabilities";

/**
 * Every image source (`kind: "image"` src) a lesson draws, deduplicated in first-use order. Works on
 * any parsed spec, valid or not, with no DOM.
 */
export function lessonImageSources(spec: Pick<LessonSpec, "scenes"> | unknown): string[] {
  const scenes = (spec as { scenes?: unknown } | null)?.scenes;
  return Array.isArray(scenes) ? sceneImageSources(scenes as LessonSpec["scenes"]) : [];
}

/**
 * Load and decode every picture a lesson draws before it plays, so no frame ever shows a
 * half-loaded image. Rejects when a picture cannot be decoded. Without a DOM it resolves at once.
 */
export function preloadLessonImages(spec: Pick<LessonSpec, "scenes"> | unknown): Promise<void> {
  return preloadImages(lessonImageSources(spec));
}

/**
 * Free the decoded pictures of lessons that will not be drawn again. Only call it once nothing still
 * playing uses them: a released picture is decoded again on its next preload.
 */
export function releaseLessonImages(...specs: Array<Pick<LessonSpec, "scenes"> | unknown>): void {
  releaseImages(specs.flatMap((spec) => lessonImageSources(spec)));
}
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
