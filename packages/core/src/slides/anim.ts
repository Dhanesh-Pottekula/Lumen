/**
 * Shared deterministic-animation helpers — the *drawing* side (canvas-aware).
 *
 * The pure motion math (easings, oscillators, staging, prng) lives in `../render/motion` and is
 * re-exported here, so existing `import { phase, lerp, prng } from "./anim"` keeps working unchanged.
 * Import new primitives (`spring`, `breathe`, `pulse`, `wobble`, `stagger`) from either module.
 */
import { clamp01, lerp } from "../render/motion";

export {
  clamp01,
  lerp,
  cycle,
  smooth,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  spring,
  phase,
  stagger,
  breathe,
  pulse,
  wobble,
  prng,
} from "../render/motion";

export interface PathPoint {
  x: number;
  y: number;
  angle: number;
}

/** Arc-length parameterised polyline — walk dots along routes at constant speed. */
export function makePath(points: [number, number][]) {
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  const length = cumulative[cumulative.length - 1];

  const at = (d: number): PathPoint => {
    d = Math.max(0, Math.min(length, d));
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < d) i++;
    const segLen = cumulative[i] - cumulative[i - 1] || 1;
    const p = (d - cumulative[i - 1]) / segLen;
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    return { x: lerp(x1, x2, p), y: lerp(y1, y2, p), angle: Math.atan2(y2 - y1, x2 - x1) };
  };

  return { length, at };
}

/** Draw text with alpha, saving/restoring globalAlpha around it. */
export function fadeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  alpha: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "center",
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Additive radial-gradient glow blob centered at (x, y), radius r. Uses "lighter" compositing so
 * overlapping light adds up — the workhorse for suns, beams, electrons, energy. Save/restored.
 */
export function radialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha = 1,
) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha *= clamp01(alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
  ctx.restore();
}

/** Run `draw` with a soft canvas shadow (blur + color) set — native soft shadows/halos. Save/restored. */
export function withGlow(
  ctx: CanvasRenderingContext2D,
  opts: { blur: number; color: string; offsetX?: number; offsetY?: number },
  draw: () => void,
) {
  ctx.save();
  ctx.shadowBlur = opts.blur;
  ctx.shadowColor = opts.color;
  ctx.shadowOffsetX = opts.offsetX ?? 0;
  ctx.shadowOffsetY = opts.offsetY ?? 0;
  draw();
  ctx.restore();
}

/** Run `draw` with globalAlpha scaled by `alpha` (clamped), save/restored. No-op at alpha ≤ 0. */
export function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  draw();
  ctx.restore();
}

/**
 * Draw an image centered at (cx, cy) at w×h, with optional alpha and rotation (radians).
 * No-op when `img` is falsy, so scenes can call it directly with an optional asset.
 */
export function drawSvg(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | undefined | null,
  cx: number,
  cy: number,
  w: number,
  h: number,
  opts: { alpha?: number; rotate?: number } = {},
) {
  if (!img) return;
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  ctx.translate(cx, cy);
  if (opts.rotate) ctx.rotate(opts.rotate);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
