import type { CanvasSlideDefinition, SceneTiming } from "../slides/types";
import type { Film } from "../gcl/schema";
import { composeFilm, filmTheme, renderScenes } from "../gcl";
import { compileNextScene, firstCompile, sceneEndPoses, type CompileCarry } from "./compile";
import { repairCanonicalFilm, validateCanonicalFilm } from "./canonical";
import { analyzeResolvedLesson, type Diagnostic } from "./diagnostics";
import { validateResolvedKeyframes } from "./keyframes";
import { FIRST_LAYOUT, narrationWords, resolveNextScene, type LayoutCarry, type ResolvedLesson, type ResolvedScene } from "./resolve";
import { resolveTheme } from "./registry";
import type { LessonSpec, SceneSpec } from "./types";
import { atScene, validateFilmScene } from "./validate";

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

/** One added scene: whether it plays, why not, and its window on the film's timeline. */
export type AddResult = SceneTiming & {
  valid: boolean;
  /** The scene's place in the film, which a dropped scene keeps too. */
  index: number;
  warnings: Diagnostic[];
  errors?: Diagnostic[];
};

export interface FilmCompiler {
  /** Compile one more scene after those already added; earlier scenes are never compiled again or changed. */
  add(scene: SceneSpec | unknown, floor?: number): AddResult;
  /** The film so far, with a timing entry for every added scene. */
  slide(): CanvasSlideDefinition;
  /** How many scenes have been added, dropped ones included. */
  count(): number;
}

// Cosmetic layout diagnostics the engine already auto-corrects (objects are auto-fit and clamped to the
// safe frame, overlaps are auto-separated, callouts are auto-flipped/clamped). A few stray pixels of
// clip or overlap must never blank the whole video — these stay as advisory warnings but do NOT block
// rendering. Everything else (lifecycle, references, motion geometry, schema) still blocks the scene.
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
  // A timeline counting its years down is read as years BCE, so time still runs left to right.
  "READ_AS_BCE",
  // A silhouette tracing one piece of a subject in pieces is dropped, so the picture is laid out whole.
  "SILHOUETTE_FRAGMENT",
  // A picture or figure resolved too small to make out is drawn at the smallest size that reads.
  "RAISED_TO_READABLE",
  // What the validator could not use it has already taken out, with everything that named it, so the
  // rest is sound; refusing the film for it blanked a whole video over one misspelt word.
  "DROPPED_OBJECT",
  "DROPPED_ACTION",
  "DROPPED_CHECK",
  "DROPPED_FIELD",
  // Advice to the planner: the scene plays with its subject smaller than it should be.
  "SPLIT_STEP",
  // Advice to the writer: the chart plays, but its lengths do not tell its numbers truly.
  "LIE_FACTOR",
  "DROPPED_SCENE",
  // The thing sits on its owner's centre instead of the part that was never exposed; the film plays.
  "ANCHOR_FALLBACK",
  // The motion would have gone nowhere or the wrong way; it is left out and the rest of the scene plays.
  "MOTION_REFUSED",
]);

export interface KeptScene {
  lesson: SceneSpec;
  resolved: ResolvedScene;
  gcl: Film;
}

type SceneOutcome = { kept: KeptScene; warnings: Diagnostic[] } | { errors: Diagnostic[] };

/**
 * The scene-by-scene core every entry point shares. A scene is laid out from what the kept scenes
 * before it left behind, and only a kept scene passes anything on, so a dropped one changes nothing.
 * `strict` also drops a scene whose warnings would break it on screen.
 */
export function sceneSteps(header: Omit<LessonSpec, "scenes">, strict: boolean): (input: unknown, index: number, floor: number | undefined) => SceneOutcome {
  let layout: LayoutCarry = FIRST_LAYOUT;
  let compiled: CompileCarry = firstCompile(header.categories);
  return (input, index, floor) => {
    // The scene is reworked in place while it is read; the caller's copy stays as it was sent.
    const validated = validateFilmScene(header, JSON.parse(JSON.stringify(input ?? null)), index);
    if (!validated.valid) return { errors: validated.errors };

    const scene = validated.value;
    const laid = resolveNextScene(scene, header.theme, floor, layout, sceneEndPoses);
    const alone: ResolvedLesson = { version: header.version, title: header.title, scenes: [laid.scene] };
    const keyframes = validateResolvedKeyframes(alone);
    if (!keyframes.valid) return { errors: keyframes.errors.map((error) => atScene(error, index)) };

    const drawn = compileNextScene(laid.scene, header.categories, compiled);
    const crowded = drawn.crowded.map((message): Diagnostic => ({ code: "LAYOUT_COLLISION", path: `/scenes/${index}/beats`, message }));
    const warnings = [...validated.warnings, ...analyzeResolvedLesson(alone).map((warning) => atScene(warning, index)), ...crowded];
    const canonical = validateCanonicalFilm(drawn.film);
    const repaired = canonical.valid ? { film: drawn.film, warnings: [], errors: [] } : repairCanonicalFilm(drawn.film, canonical.errors);
    if (repaired.errors.length > 0) return { errors: repaired.errors };
    warnings.push(...repaired.warnings.map((warning) => atScene(warning, index)));

    const blocking = strict ? warnings.filter((warning) => !NON_BLOCKING_CODES.has(warning.code)) : [];
    if (blocking.length > 0) return { errors: [...warnings.filter((warning) => NON_BLOCKING_CODES.has(warning.code)), ...blocking] };

    layout = laid.after;
    compiled = drawn.after;
    return { kept: { lesson: scene, resolved: laid.scene, gcl: repaired.film }, warnings };
  };
}

/** The header as the screen draws it: a host appearance picks the palette readable over it. */
export function screenHeader(header: Omit<LessonSpec, "scenes">, colorScheme?: "light" | "dark"): Omit<LessonSpec, "scenes"> {
  if (!colorScheme) return header;
  return { ...header, theme: colorScheme === "dark" ? "textbook" : "parchment" };
}

/** A usable floor for the scene at `index`, from floors keyed by scene id or ordered like the scenes. */
export function floorOf(floors: NarrationTiming["sceneFloors"], index: number, input: unknown): number | undefined {
  const id = (input as { id?: unknown } | null)?.id;
  const floor = Array.isArray(floors) ? floors[index] : typeof id === "string" ? floors?.get(id) : undefined;
  return floor !== undefined && Number.isFinite(floor) && floor >= 0 ? floor : undefined;
}

/**
 * Build a film one scene at a time, as its scenes arrive. Adding a scene compiles only that scene, from
 * what the scenes before it left on screen, and appends it to the timeline, so no scene already added
 * ever changes. A scene the engine cannot draw still takes its index, with no time on screen.
 */
export function createFilmCompiler(header: Omit<LessonSpec, "scenes">, options: RenderLessonOptions = {}): FilmCompiler {
  return filmBuilder(header, options).compiler;
}

/** A film compiler, and the scenes it kept with everything compiled for them, for the whole-film entry points. */
export function filmBuilder(header: Omit<LessonSpec, "scenes">, options: RenderLessonOptions = {}): { compiler: FilmCompiler; kept: KeptScene[] } {
  const drawnHeader = screenHeader(header, options.colorScheme);
  const step = sceneSteps(drawnHeader, true);
  const theme = filmTheme(resolveTheme(drawnHeader.theme), options);
  const kept: KeptScene[] = [];
  const timings: SceneTiming[] = [];
  const slides: CanvasSlideDefinition[] = [];
  let composed: CanvasSlideDefinition | undefined;
  const compiler: FilmCompiler = {
    add(input, floor) {
      const index = timings.length;
      const start = timings.at(-1)?.end ?? 0;
      const outcome = step(input, index, floor ?? floorOf(options.sceneFloors, index, input));
      composed = undefined;
      if ("errors" in outcome) {
        const narration = (input as { narration?: unknown } | null)?.narration;
        const timing: SceneTiming = { start, end: start, words: narrationWords(typeof narration === "string" ? narration : undefined).length, cues: [], dropped: true };
        timings.push(timing);
        return { ...timing, valid: false, index, warnings: [], errors: outcome.errors };
      }

      kept.push(outcome.kept);
      slides.push(...renderScenes(outcome.kept.gcl, theme, options));
      const timing = sceneTiming(outcome.kept.lesson, outcome.kept.resolved, start);
      timings.push(timing);
      return { ...timing, valid: true, index, warnings: outcome.warnings };
    },
    slide() {
      composed ??= { ...composeFilm(slides, theme, options), scenes: [...timings], ...(options.audioUrl ? { audioUrl: options.audioUrl } : {}) };
      return composed;
    },
    count: () => timings.length,
  };
  return { compiler, kept };
}

/** A kept scene's window on the film's timeline — scenes play back to back — and its word-tied beats. */
function sceneTiming(lesson: SceneSpec, resolved: ResolvedScene, start: number): SceneTiming {
  return {
    start,
    end: start + resolved.duration,
    words: narrationWords(lesson.narration).length,
    cues: resolved.beats.flatMap((beat) => (beat.word === undefined ? [] : [{ word: beat.word, at: start + beat.start }])),
    ...(lesson.check ? { check: lesson.check } : {}),
  };
}
