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
  color?: "white" | "accent" | "danger" | "good";
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

export type OverlayObject = TextObject | EquationObject | CounterObject | ChartObject;
export type SceneObject = ImageObject | OverlayObject;

export type Action =
  | { do: "camera"; target: string; shot?: Shot; movement?: Movement }
  | { do: "cut"; to: string; entrance?: "cut" | "iris" | "fade" }
  | { do: "speak"; target: string; text: string }
  | { do: "label"; target: string; text: string; id?: string }
  | { do: "attention"; target: string; verb: "dim" | "encircle" | "pulse" }
  | { do: "show"; targets: string[]; entrance?: "fade" | "slam" | "word-by-word" }
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

export type FilmEvent = FilmProgressEvent | FilmSceneEvent | FilmDoneEvent;

/** A saved film, as `GET /api/films/<run>` returns it. */
export interface FilmFile {
  run: string;
  brief: string;
  provider: string;
  status: "generating" | "ready" | "failed";
  header: FilmHeader;
  scenes: FilmScene[];
}
