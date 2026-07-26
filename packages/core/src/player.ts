import { createFrame } from "./render/frame";
import { paintTexture } from "./render/texture";
import { TEXTBOOK, type Theme } from "./render/theme";
import type { CanvasSlideDefinition } from "./slides/types";

/**
 * Draw one deterministic frame of a compiled lesson.
 *
 * React players, exporters, and custom integrations share this function so
 * frame setup, texture, layer composition, and cleanup stay identical.
 */
export function drawSlideFrame(
  context: CanvasRenderingContext2D,
  slide: CanvasSlideDefinition,
  seconds: number,
  theme: Theme = TEXTBOOK,
): void {
  const frame = createFrame(context, seconds, slide.viewW, slide.viewH, theme);
  if (theme.texture !== "none") paintTexture(context, theme, slide.viewW, slide.viewH);
  slide.render(context, seconds, frame);
  frame.finish();
}
