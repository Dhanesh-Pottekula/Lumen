import type { FrameCtx } from "../render/frame";

/** One caption segment — on-screen subtitle text keyed to the timeline. */
export interface CaptionSegment {
  at: number;
  text: string;
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
}
