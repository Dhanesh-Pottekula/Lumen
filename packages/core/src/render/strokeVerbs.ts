/**
 * strokeVerbs — the higher-level draw-on "verbs", all thin wrappers over the `[start,end]` window
 * primitive in `./strokes`. Each is a pure function of its progress input `p` (or time `t`), so the
 * whole vocabulary stays deterministic and seekable.
 *
 * Verbs:   drawOn · erase · passingFlash · drawBorderThenFill · tracedPath · circumscribe
 * Markers: arrowhead · dot · tracerDot · handFollower
 * Layout:  strokeSequence (staggered multi-path)
 */
import { clamp01, stagger } from "./motion";
import { arcTable, pointAt, type Pt, type StrokeStyle, strokeWindow } from "./strokes";
import type { Theme } from "./theme";

export type StrokeFrom = "start" | "end" | "center" | "both";

export interface DrawOptions {
  from?: StrokeFrom;
  style?: StrokeStyle;
  theme?: Theme;
}

/** Draw the first `p` (0..1) of a path, optionally growing from the end, center, or both ends. */
export function drawOn(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: DrawOptions = {}) {
  p = clamp01(p);
  const { from = "start", style, theme } = opts;
  switch (from) {
    case "end":
      return strokeWindow(ctx, points, 1 - p, 1, style, theme);
    case "center":
      return strokeWindow(ctx, points, 0.5 - p / 2, 0.5 + p / 2, style, theme);
    case "both":
      strokeWindow(ctx, points, 0, p / 2, style, theme);
      return strokeWindow(ctx, points, 1 - p / 2, 1, style, theme);
    default:
      return strokeWindow(ctx, points, 0, p, style, theme);
  }
}

/** Un-draw: reverse of drawOn. At `p=0` fully drawn, at `p=1` gone (retracts from the tail by default). */
export function erase(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: DrawOptions = {}) {
  return drawOn(ctx, points, 1 - clamp01(p), opts);
}

export interface FlashOptions {
  width?: number; // sliver length as a fraction of the path (0..1), default 0.15
  thinning?: boolean; // taper the sliver toward its tail (comet look)
  glow?: boolean; // composite the sliver additively ("lighter") for a light-sweep look
  style?: StrokeStyle;
  theme?: Theme;
}

/** A short bright sliver that sweeps the path from start to end as `p` goes 0→1, then exits. */
export function passingFlash(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: FlashOptions = {}) {
  const w = opts.width ?? 0.15;
  const head = clamp01(p) * (1 + w); // head travels from 0 to 1+w so the sliver fully enters and leaves
  const start = clamp01(head - w);
  const end = clamp01(head);
  if (end <= start) return;
  const style: StrokeStyle = { ...opts.style };
  if (opts.thinning) style.widthProfile = (t) => t; // tail (t=0) thin → head (t=1) full
  if (opts.glow) style.blend = style.blend ?? "lighter";
  strokeWindow(ctx, points, start, end, style, opts.theme);
}

export interface BorderThenFillOptions {
  style?: StrokeStyle;
  fill?: string | CanvasGradient | CanvasPattern;
  fillRule?: CanvasFillRule;
  split?: number; // fraction of p spent drawing the border before the fill fades in (default 0.6)
  theme?: Theme;
}

/** Draw a closed shape's outline on, then fade its fill in — the "Write"/region-reveal primitive. */
export function drawBorderThenFill(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: BorderThenFillOptions = {}) {
  const split = opts.split ?? 0.6;
  const borderP = clamp01(p / split);
  strokeWindow(ctx, points, 0, borderP, opts.style, opts.theme);
  if (opts.fill && p > split) {
    const fa = clamp01((p - split) / (1 - split));
    ctx.save();
    ctx.globalAlpha *= fa;
    ctx.fillStyle = opts.fill;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill(opts.fillRule ?? "nonzero");
    ctx.restore();
  }
}

export interface TracedPathOptions {
  step?: number; // sampling interval in the mover's own time units (default 0.03)
  dissipate?: number; // if set, only the last `dissipate` time-units of trail are kept (comet tail)
  style?: StrokeStyle;
  theme?: Theme;
}

/**
 * Draw the trail a moving point leaves behind. `mover(tt)` must be a pure function of time, so the
 * trail is reproduced exactly on any seek. Sampled from 0 (or `t−dissipate`) up to the current `t`.
 */
export function tracedPath(
  ctx: CanvasRenderingContext2D,
  mover: (tt: number) => Pt,
  t: number,
  opts: TracedPathOptions = {},
) {
  const step = opts.step ?? 0.03;
  const from = opts.dissipate ? Math.max(0, t - opts.dissipate) : 0;
  // Sample on a fixed global grid so tail vertices stay put as `t` advances (no shimmer), then append
  // the exact head at `t`.
  const start = Math.ceil(from / step) * step;
  const pts: Pt[] = [];
  for (let tt = start; tt < t - 1e-9; tt += step) pts.push(mover(tt));
  pts.push(mover(t));
  if (pts.length >= 2) strokeWindow(ctx, pts, 0, 1, opts.style, opts.theme);
}

export interface CircumscribeOptions {
  shape?: "rect" | "ellipse";
  buff?: number; // padding around the box (default 8)
  style?: StrokeStyle;
  theme?: Theme;
}

/** A temporary highlight loop that draws around a box then fades — "circle the answer". `p` 0→1. */
export function circumscribe(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: number,
  opts: CircumscribeOptions = {},
) {
  const buff = opts.buff ?? 8;
  const x = box.x - buff;
  const y = box.y - buff;
  const w = box.w + buff * 2;
  const h = box.h + buff * 2;
  const pts: Pt[] = [];
  if (opts.shape === "ellipse") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2 - Math.PI / 2;
      pts.push([cx + Math.cos(a) * (w / 2), cy + Math.sin(a) * (h / 2)]);
    }
  } else {
    pts.push([x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]);
  }
  const draw = clamp01(p / 0.5); // first half draws the loop on
  const fade = p > 0.5 ? 1 - clamp01((p - 0.5) / 0.5) : 1; // second half fades it out
  const style: StrokeStyle = { ...opts.style, alpha: (opts.style?.alpha ?? 1) * fade };
  strokeWindow(ctx, pts, 0, draw, style, opts.theme);
}

// ── Markers & followers ──────────────────────────────────────────────────────────────────────────

/** Draw a filled arrowhead at a sampled point, rotated to its tangent. Reveal `alpha` on arrival. */
export function arrowhead(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; angle: number },
  opts: { size?: number; color?: string; alpha?: number } = {},
) {
  const size = opts.size ?? 12;
  const a = clamp01(opts.alpha ?? 1);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(at.x, at.y);
  ctx.rotate(at.angle);
  ctx.fillStyle = opts.color ?? "#fff";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.5);
  ctx.lineTo(-size, size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A filled dot at a sampled point — path endpoint marker or waypoint. */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
  ctx.restore();
}

/** A dot riding the current draw head at progress `p` — a pen/tracer tip. */
export function tracerDot(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: { r?: number; color?: string; alpha?: number } = {}) {
  const at = pointAt(points, p);
  dot(ctx, at.x, at.y, opts.r ?? 4, opts.color ?? "#fff", opts.alpha ?? 1);
}

/** Draw an image (hand/pen/chalk) at the draw head, oriented to the path tangent. */
export function handFollower(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  img: CanvasImageSource,
  opts: { w?: number; h?: number; offsetX?: number; offsetY?: number; alpha?: number } = {},
) {
  const a = clamp01(opts.alpha ?? 1);
  if (a <= 0) return;
  const at = pointAt(points, p);
  const w = opts.w ?? 48;
  const h = opts.h ?? 48;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(at.x, at.y);
  ctx.rotate(at.angle); // orient the hand/pen to the path tangent (was computed but unused)
  ctx.drawImage(img, opts.offsetX ?? 0, opts.offsetY ?? 0, w, h);
  ctx.restore();
}

/** Total arc length of a polyline (convenience for callers that pace draw speed by length). */
export const pathLength = (points: Pt[]): number => arcTable(points).length;

// ── Orchestration ─────────────────────────────────────────────────────────────────────────────────

export interface SequenceOptions {
  start?: number; // time the first path begins (default 0)
  step: number; // stagger between consecutive paths
  dur: number; // draw duration of each path
  from?: StrokeFrom;
  style?: StrokeStyle;
  theme?: Theme;
}

/**
 * Draw many paths one after another with a staggered cascade (`step`=0 → all at once, large → strictly
 * sequential). Each path's progress is `stagger(t, i, …)`, so the whole cascade stays seekable.
 */
export function strokeSequence(ctx: CanvasRenderingContext2D, paths: Pt[][], t: number, opts: SequenceOptions) {
  paths.forEach((points, i) => {
    const p = stagger(t, i, { start: opts.start ?? 0, step: opts.step, dur: opts.dur });
    if (p > 0) drawOn(ctx, points, p, { from: opts.from, style: opts.style, theme: opts.theme });
  });
}
