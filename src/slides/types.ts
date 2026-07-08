/** One caption segment — in production the boundaries come from Cartesia word timestamps. */
export interface CaptionSegment {
  at: number;
  text: string;
}

/** A canvas slide: a pure render function of time plus its timeline metadata. */
export interface CanvasSlideDefinition {
  /** Length of the slide's timeline in seconds (in production: the narration audio's length). */
  duration: number;
  /** Logical coordinate space the render function draws in. */
  viewW: number;
  viewH: number;
  /**
   * Draw the frame at time `t`. MUST be pure: same `t` in, same pixels out — no clocks,
   * no timers, no accumulated state. This is what keeps the slide seekable like a video.
   */
  render: (ctx: CanvasRenderingContext2D, t: number) => void;
  /** Optional narration captions keyed to the same timeline. */
  captions?: CaptionSegment[];
}
