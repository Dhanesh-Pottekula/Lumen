/**
 * Film types — the wire format between the film server and the player.
 *
 * A film is a header plus scenes that arrive one by one. A scene has no coordinates: it names pictures and
 * their parts by id, and beats tie each change to the narration words it should land on. The server fills in
 * what a picture is (`src`, `aspect`, `hotspots`); the scene writer only ever writes ids.
 */

export type Pace = "instant" | "quick" | "normal" | "slow" | "dramatic";
export type Zone = "top" | "center" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type Shot = "overview" | "wide" | "medium" | "close" | "detail";
export type Movement = "cut" | "move" | "push" | "arc";
/**
 * How a picture comes onto the screen: at once, dissolving, opening from the middle, wiped across from the
 * left, pushing the old one out to the left, or through a zoom into the old one.
 */
export type Entrance = "cut" | "fade" | "iris" | "wipe" | "push" | "zoom";

/** A part's box inside its picture, as fractions 0..1: [x, y, w, h]. */
export type Hotspot = [number, number, number, number];

/** A full-bleed picture. `src`, `aspect` and `hotspots` are filled in by the server. */
export interface ImageObject {
  id: string;
  kind: "image";
  /** Hidden pictures wait for a `cut`. The first visible picture opens the scene. */
  initial?: "visible" | "hidden";
  src?: string;
  aspect?: number;
  hotspots?: Record<string, Hotspot>;
}

/** The colours anything written or drawn on the picture can take. */
export type Ink = "white" | "accent" | "danger" | "good";

/**
 * Somewhere in the background on screen that a drawn mark can start, end or sit: a found part of it, by name
 * ("<picture>.<part>"), or a point, as shares of the picture's width and height from its top-left corner.
 */
export type Spot = string | { x: number; y: number };
/** A stretch of the background, as shares of the picture: its left, top, width and height. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Simple signs the film can stamp on the picture. */
export const STAMP_ICONS = ["check", "cross", "plus", "minus", "star", "heart", "bolt", "drop", "sun", "leaf", "flame", "clock", "warning", "cloud"] as const;
export type StampIcon = (typeof STAMP_ICONS)[number];
/** Moving effects the film can run on the picture. Rain and snow fall over the whole frame; the rest come from one spot. */
export const EFFECT_KINDS = ["fire", "smoke", "sparks", "rain", "snow", "dust", "confetti", "energy"] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface TextObject {
  id: string;
  kind: "text";
  text: string;
  zone?: Zone;
  /** Beside this spot of the background, in place of a zone: the word sits next to the thing it is about. */
  near?: Spot;
  size?: "small" | "medium" | "large";
  color?: Ink;
  /** A line drawn under the words by hand. */
  underline?: boolean;
}

export interface EquationObject {
  id: string;
  kind: "equation";
  value: string;
  zone?: Zone;
}

export interface CounterObject {
  id: string;
  kind: "counter";
  from?: number;
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label?: string;
  zone?: Zone;
}

export interface ChartObject {
  id: string;
  kind: "chart";
  chart: "bar" | "pie" | "line";
  data: { label: string; value: number }[];
  title?: string;
  zone?: Zone;
}

/** A row of moments in order, each with when it was and what it was. */
export interface TimelineObject {
  id: string;
  kind: "timeline";
  events: { when: string; label: string }[];
  zone?: Zone;
}

export type OverlayObject = TextObject | EquationObject | CounterObject | ChartObject | TimelineObject;
export type SceneObject = ImageObject | OverlayObject;

export type Action =
  | { do: "camera"; target: string; shot?: Shot; movement?: Movement }
  | { do: "cut"; to: string; entrance?: Entrance }
  | { do: "pan"; from: Spot; to: Spot; shot?: Shot; lasts?: "pace" | "until-next" }
  | { do: "speak"; target: string; text: string }
  | { do: "label"; target: string; text: string; id?: string }
  | { do: "attention"; target: string; verb: "dim" | "encircle" | "pulse" }
  | { do: "show"; targets: string[]; entrance?: "fade" | "slam" | "word-by-word" }
  | { do: "hide"; targets: string[] }
  | { do: "arrow"; from: Spot; to: Spot; color?: Ink; bend?: "straight" | "left" | "right"; id?: string }
  | { do: "line"; from: Spot; to: Spot; color?: Ink; dashed?: boolean; id?: string }
  | { do: "box"; target: string | Region; style?: "outline" | "highlight"; color?: Ink; id?: string }
  | { do: "point"; at: Spot }
  | { do: "stamp"; icon: StampIcon; at: Spot; size?: "small" | "medium" | "large"; color?: Ink; id?: string }
  | { do: "effect"; kind: EffectKind; at?: Spot; id?: string }
  | { do: "travel"; path: Spot[]; color?: Ink; repeat?: boolean; lasts?: "pace" | "until-next"; id?: string }
  | { do: "shake"; strength?: "subtle" | "normal" | "strong" }
  | { do: "flash" };

export interface Beat {
  id: string;
  /** 1–4 narration words, copied exactly; the beat starts when they are spoken. Omitted on the first beat. */
  say?: string;
  pace?: Pace;
  actions: Action[];
}

export interface SceneAudio {
  src: string;
  /** The second each narration word starts in the voice, when it was measured. */
  wordTimes?: number[];
}

export interface FilmScene {
  id: string;
  narration: string;
  objects: SceneObject[];
  beats: Beat[];
  audio?: SceneAudio;
}

export interface FilmHeader {
  version: "1";
  title: string;
  look: "movie";
}

/** What the server knows about one finished picture, as the scene writer and the validator see it. */
export interface PictureRow {
  id: string;
  parts: string[];
}

// ── Stream events (mirrors AiRA's omni.film_progress / omni.film_scene) ─────────────────────────────

export type ProgressStage = "plan" | "picture" | "step" | "scene" | "voice";
export type ProgressStatus =
  | "writing" | "written" | "planned" | "drawing" | "measuring" | "ready" | "checking" | "published" | "failed" | "dropped";

export interface FilmProgressEvent {
  type: "film_progress";
  run: string;
  stage: ProgressStage;
  status: ProgressStatus;
  text: string;
  id?: string;
  index?: number;
  /** A finished picture's address, so the progress panel can show it before its scene plays. */
  src?: string;
}

export interface FilmSceneEvent {
  type: "film_scene";
  run: string;
  /** Dense 0-based index over released scenes. A dropped step leaves no gap. */
  index: number;
  header: FilmHeader;
  scene: FilmScene;
}

export interface FilmDoneEvent {
  type: "film_done";
  run: string;
  status: "ready" | "failed";
  scenes: number;
  error?: string;
}

/** Which job of the pipeline a model call belonged to. */
export type UsageStage = "plan" | "warm-up" | "scene" | "parts" | "picture" | "voice" | "timing";

/** Every call of one stage with one model, added up. */
export interface UsageLine {
  stage: UsageStage;
  model: string;
  calls: number;
  /** Input tokens, including the cached and cache-written ones. */
  input: number;
  /** Input tokens read from the prompt cache. */
  cached: number;
  /** Input tokens written to the prompt cache. */
  cacheWrite: number;
  /** Output tokens, including reasoning tokens. */
  output: number;
  reasoning: number;
  images: number;
  characters: number;
  seconds: number;
  /** Estimated US dollars at list price. 0 when the model is not priced. */
  cost: number;
  priced: boolean;
  /** True when the price is a secondary-source or per-minute approximation. */
  approximate: boolean;
}

export interface FilmUsage {
  lines: UsageLine[];
  input: number;
  cached: number;
  output: number;
  images: number;
  /** Cached input tokens over all input tokens, for the text models. 0 to 1. */
  cacheHitRate: number;
  cost: number;
  unpriced: string[];
}

export interface FilmUsageEvent {
  type: "film_usage";
  run: string;
  usage: FilmUsage;
}

export type FilmEvent = FilmProgressEvent | FilmSceneEvent | FilmDoneEvent | FilmUsageEvent;

/** A saved film, as `GET /api/films/<run>` returns it. */
export interface FilmFile {
  run: string;
  brief: string;
  provider: string;
  status: "generating" | "ready" | "failed";
  header: FilmHeader;
  scenes: FilmScene[];
  /** Why the run is marked failed, when the reason is known. */
  error?: string;
  /** What making the film consumed. Absent on films made before usage was recorded. */
  usage?: FilmUsage;
  /** What the film was made with, so its numbers can be set beside other films'. Absent on older films. */
  made?: {
    prompts: string;
    skills: string[];
    skillsFrom: string | null;
    /** Keys of the prompts a person had rewritten when this film was made. */
    edited?: string[];
    /** The model and settings each stage ran on. */
    stages?: Partial<Record<UsageStage, { model: string; effort?: string; settings?: Record<string, string> }>>;
  };
}

// ── The record of a film's making ───────────────────────────────────────────────────────────────────

/** One thing sent to a model, or sent back by it: a text, or a picture or sound kept in the run's folder. */
export interface TracePart {
  kind: "text" | "image" | "audio";
  /** What it is: "System prompt", "The brief", "Reference picture". */
  title: string;
  /** The whole text, for a text part. */
  text?: string;
  /** Where the picture or sound can be fetched from, when it is one the run keeps. */
  src?: string;
  /** A short remark: its size, or why there is nothing to show. */
  note?: string;
}

/** One request as it went over the wire and the answer that came back, with picture and sound data left out. */
export interface TraceExchange {
  path: string;
  request: unknown;
  status: number;
  response: unknown;
  ms: number;
}

/** What a list of calls shows: everything but the texts themselves. */
export interface CallSummary {
  /** The call's number in the run, from 1, in the order calls began. */
  n: number;
  stage: UsageStage;
  /** The step or picture the call was for, or "" for a call that belongs to the whole film. */
  id: string;
  title: string;
  model: string;
  /** The reasoning effort asked for, when the stage has one. */
  effort?: string;
  status: "running" | "ok" | "failed";
  /** Seconds from the start of the run to the start of this call, and how long it took. */
  at: number;
  ms: number;
  usage: { input: number; cached: number; cacheWrite: number; output: number; reasoning: number; images: number; characters: number; seconds: number };
  /** Estimated US dollars, or null when the model has no price. */
  cost: number | null;
  error?: string;
  /** How many requests the call made: more than one when a tool was used or a request was sent again. */
  requests: number;
}

/** One model call in full: every character that went in and came out. */
export interface CallRecord extends CallSummary {
  /** Other settings the call was made with: an image quality, a voice. */
  settings: Record<string, string>;
  input: TracePart[];
  output: TracePart[];
  /** Tool calls the model made during the call, with what the tool answered. */
  tools: { name: string; arguments: string; result: string }[];
  exchanges: TraceExchange[];
}

/** The model and settings one stage of the pipeline uses. Which fields apply depends on the stage. */
export interface StageSetting {
  model: string;
  /** Reasoning effort, for the stages that think: "" leaves it to the model's own default. */
  effort?: string;
  /** Picture quality, for the drawing stage. */
  quality?: string;
  /** The voice, for the speaking stage. */
  voice?: string;
}

export type SettingStage = "plan" | "scene" | "parts" | "picture" | "voice" | "timing";
export type StageSettings = Record<SettingStage, StageSetting>;

