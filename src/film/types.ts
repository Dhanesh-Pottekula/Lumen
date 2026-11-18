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
/** The film's few colours, named for what they mean rather than how they look. */
export type Tone = "white" | "accent" | "danger" | "good" | "cool";
/** An edge of the frame, for an arrow that sweeps in from outside the picture or leaves it. */
export type Edge = "left" | "right" | "top" | "bottom";
export type AttentionVerb = "dim" | "encircle" | "pulse" | "box" | "underline" | "cross" | "check" | "tint";
export type EffectKind = "fire" | "smoke" | "sparks" | "explosion" | "rain" | "snow" | "dust" | "confetti" | "glow" | "speed";
export type IconKind =
  | "question" | "exclaim" | "idea" | "heart" | "skull" | "money" | "check" | "cross" | "warning" | "clock" | "star"
  | "sweat" | "anger" | "zzz" | "music" | "fire";
export type Entrance = "fade" | "slam" | "word-by-word" | "typewriter";

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

export interface TextObject {
  id: string;
  kind: "text";
  text: string;
  zone?: Zone;
  size?: "small" | "medium" | "large";
  color?: Tone;
  /** bold: outlined lettering; title: a big headline; hand: handwritten with an underline; stamp: a rubber stamp. */
  style?: "bold" | "title" | "hand" | "stamp";
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
  color?: Tone;
  zone?: Zone;
}

/** A date as a calendar card. When `from` is a year and the date ends in a year, the year rolls up to it. */
export interface DateObject {
  id: string;
  kind: "date";
  text: string;
  from?: number;
  zone?: Zone;
}

/** A timeline of 2–6 events. `show` brings on the first; each `advance` reaches the next. */
export interface TimelineObject {
  id: string;
  kind: "timeline";
  events: { date: string; text: string }[];
  zone?: Zone;
}

/** A list of 2–6 short items. `show` brings on the first; each `advance` adds the next. */
export interface ListObject {
  id: string;
  kind: "list";
  title?: string;
  items: string[];
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

export type OverlayObject = TextObject | EquationObject | CounterObject | ChartObject | DateObject | TimelineObject | ListObject;
export type SceneObject = ImageObject | OverlayObject;

export type Action =
  | { do: "camera"; target: string; shot?: Shot; movement?: Movement }
  | { do: "cut"; to: string; entrance?: "cut" | "iris" | "fade" }
  | { do: "speak"; target: string; text: string; style?: "say" | "think" | "shout" }
  | { do: "label"; target: string; text: string; id?: string }
  | { do: "attention"; target: string; verb: AttentionVerb; color?: Tone }
  /** An arrow drawn from one thing (or an edge of the frame) to another. */
  | { do: "arrow"; from: string; to: string; text?: string; id?: string; style?: "bold" | "dashed"; color?: Tone }
  /** A dimension line along one side of a part, with its size written on it. */
  | { do: "measure"; target: string; text: string; side?: "below" | "above" | "left" | "right"; id?: string }
  /** Moving matter on a part or over the whole picture: fire, smoke, rain... */
  | { do: "effect"; target: string; kind: EffectKind; id?: string }
  /** A symbol that pops up beside a part, like a mark in a comic. */
  | { do: "icon"; target: string; icon: IconKind; id?: string }
  /** A timeline or a list moves on to its next entry. */
  | { do: "advance"; target: string }
  | { do: "show"; targets: string[]; entrance?: Entrance }
  | { do: "hide"; targets: string[] }
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
  /** What making the film consumed. Absent on films made before usage was recorded. */
  usage?: FilmUsage;
}
