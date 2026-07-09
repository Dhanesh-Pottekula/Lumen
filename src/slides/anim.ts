/** Shared deterministic-animation helpers. Everything is a pure function — no clocks, no state. */

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Smoothstep easing, clamped. */
export const smooth = (p: number): number => {
  p = clamp01(p);
  return p * p * (3 - 2 * p);
};

export const easeOutCubic = (p: number): number => {
  p = clamp01(p);
  return 1 - (1 - p) ** 3;
};

/** Eased 0→1 progress of `t` through the window [a, b]. The workhorse for staging. */
export const phase = (t: number, a: number, b: number): number => smooth((t - a) / (b - a));

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** Fractional part — loops a value into [0, 1). Use for repeating cycles driven by t. */
export const cycle = (v: number): number => v - Math.floor(v);

/** Seeded PRNG (mulberry32) — deterministic "randomness" for personalities and layouts. */
export function prng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

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
