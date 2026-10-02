import type { SceneCheck } from "../simple-json/types";
import type { FrameCtx } from "../render/frame";

/** One caption segment — on-screen subtitle text keyed to the timeline. */
export interface CaptionSegment {
  at: number;
  text: string;
}

/** Where one scene sits on a film's timeline, and when each beat tied to a spoken word begins. */
export interface SceneTiming {
  start: number;
  end: number;
  /** How many words the scene's narration has, counted as `narrationWords` counts them. */
  words: number;
  /** Film seconds at which the beat that begins on narration word `word` starts, in word order. */
  cues: { word: number; at: number }[];
  /** The question the film asks once this scene has played, exactly as the lesson wrote it. */
  check?: SceneCheck;
  /** Set when the engine could not draw the scene: it keeps its place in the film with no time on screen. */
  dropped?: true;
}

/** A canvas slide: a pure render function of time plus its timeline metadata. */
export interface CanvasSlideDefinition {
  /** Length of the slide's timeline in seconds. */
  duration: number;
  /** Logical coordinate space the render function draws in. */
  viewW: number;
  viewH: number;
  /**
   * Draw the frame at time `t`. MUST be pure: same `t` in, same pixels out — no clocks,
   * no timers, no accumulated state. This is what keeps the slide seekable like a video.
   *
   * `frame` (optional) carries shared per-frame state — layers, and later theme/camera. Scenes
   * that ignore it draw straight to `ctx` (unchanged); scenes that want depth/theming read it.
   */
  render: (ctx: CanvasRenderingContext2D, t: number, frame?: FrameCtx) => void;
  /** Optional on-screen captions (subtitles) keyed to the timeline. */
  captions?: CaptionSegment[];
  /** A lesson film's scenes in order, so a player can place and pace each one against its voice. */
  scenes?: SceneTiming[];
  /**
   * Optional narration audio (an object URL for a synthesized WAV). When present, the player slaves this
   * audio to its clock — play/pause/seek move both together. The film's duration is ≥ the audio's, so the
   * narration never outruns the picture.
   */
  audioUrl?: string;
}
