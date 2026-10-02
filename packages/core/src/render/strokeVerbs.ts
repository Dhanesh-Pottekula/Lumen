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
import { polylineLengths, sampleAtLength } from "../geometry/path";
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
  buff?: number; // padding around the box (default 6)
  style?: StrokeStyle;
  theme?: Theme;
}

const LOOP_SAMPLES = 72;
const LOOP_OVERSHOOT = 0.45;
const LOOP_TILT = -0.1;

/** A pen loop drawn around a box then faded — "circle the answer". `p` 0→1. */
export function circumscribe(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  p: number,
  opts: CircumscribeOptions = {},
) {
  const buff = opts.buff ?? 6;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = (box.w / 2 + buff) * 1.3;
  const ry = (box.h / 2 + buff) * 1.3;
  const cos = Math.cos(LOOP_TILT);
  const sin = Math.sin(LOOP_TILT);
  // The pen overshoots its start and drifts outward a little, so the loop never closes on itself.
  const pts: Pt[] = Array.from({ length: LOOP_SAMPLES + 1 }, (_, i) => {
    const turn = i / LOOP_SAMPLES;
    const a = -1.9 + turn * (Math.PI * 2 + LOOP_OVERSHOOT);
    const grow = 1 + 0.06 * turn;
    const x = Math.cos(a) * rx * grow;
    const y = Math.sin(a) * ry * grow;
    return [cx + x * cos - y * sin, cy + x * sin + y * cos];
  });
  const draw = clamp01(p / 0.5);
  const fade = p > 0.5 ? 1 - clamp01((p - 0.5) / 0.5) : 1;
  const style: StrokeStyle = { ...opts.style, alpha: (opts.style?.alpha ?? 1) * fade };
  strokeWindow(ctx, pts, 0, draw, style, opts.theme);
}

/** Trace a closed outline on, hold it, then fade it — "this exact part". `p` 0→1. */
export function traceOutline(ctx: CanvasRenderingContext2D, outline: Pt[], p: number, opts: { color?: string; halo?: string } = {}) {
  const closed: Pt[] = [...outline, outline[0]];
  const draw = clamp01(p / 0.35);
  // Held while the part is spoken of: fading from three quarters in, a 3px line was gone before it was seen.
  const fade = p > 0.92 ? 1 - clamp01((p - 0.92) / 0.08) : 1;
  // A light halo under the line keeps it readable on a part of its own colour (a red chamber, a red line).
  if (opts.halo) strokeWindow(ctx, closed, 0, draw, { color: opts.halo, width: 9, alpha: fade * 0.85 });
  strokeWindow(ctx, closed, 0, draw, { color: opts.color, width: 4.5, alpha: fade });
}

// ── Markers & followers ──────────────────────────────────────────────────────────────────────────

/** Arrowheads at a drawn polyline's ends, each aimed along the path's own tangent where it ends. */
export function pathArrowheads(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  p: number,
  arrow: "start" | "end" | "both",
  opts: { color?: string; width?: number } = {},
) {
  if (pts.length < 2) return;
  const lengths = polylineLengths(pts);
  const total = lengths[lengths.length - 1];
  if (total <= 0) return;
  const size = arrowheadSize(opts.width);
  const back = Math.min(total / 2, size * 0.6);
  const tip = (at: number, from: number) => {
    const end = sampleAtLength(pts, lengths, at);
    const base = sampleAtLength(pts, lengths, from);
    return { x: end.x, y: end.y, angle: Math.atan2(end.y - base.y, end.x - base.x) };
  };
  if (arrow !== "start") arrowhead(ctx, tip(total, total - back), { size, color: opts.color, alpha: (p - 0.85) / 0.15 });
  if (arrow !== "end") arrowhead(ctx, tip(0, back), { size, color: opts.color, alpha: p / 0.15 });
}

/** An arrowhead's length for a stroke `width` wide: in proportion to its line, never a blot on it. */
export function arrowheadSize(width = 2): number {
  return 6 + 2.5 * width;
}

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

// ── Border glow ──────────────────────────────────────────────────────────────────────────────────

// The spacing a border is resampled at before it is smoothed, in view units.
const BORDER_STEP = 3;

/** A closed outline's points every `step` units along it, corners kept: its points then stand for equal lengths. */
function evenlyClosed(points: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    const parts = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / step));
    for (let k = 0; k < parts; k++) out.push([x + ((nx - x) * k) / parts, y + ((ny - y) * k) / parts]);
  });
  return out;
}

/**
 * Average each point with its two neighbours, twice: a traced pixel border without its stair steps.
 * Resampled first, so a border given by a few far-apart corners keeps its shape instead of being cut across.
 */
function smoothClosed(outline: Pt[], rounds = 2): Pt[] {
  let current = evenlyClosed(outline, BORDER_STEP);
  for (let round = 0; round < rounds; round++) {
    const n = current.length;
    current = current.map(([x, y], i) => {
      const [px, py] = current[(i - 1 + n) % n];
      const [nx, ny] = current[(i + 1) % n];
      return [(px + 2 * x + nx) / 4, (py + 2 * y + ny) / 4] as Pt;
    });
  }
  return current;
}

/** A closed outline pushed outward by `gap`, each point along the mean normal of its two edges. */
export function inflateOutline(outline: Pt[], gap: number): Pt[] {
  const n = outline.length;
  if (n < 3) return outline;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const outward = area >= 0 ? 1 : -1;
  const normal = (dx: number, dy: number): Pt => {
    const length = Math.hypot(dx, dy) || 1;
    return [dy / length, -dx / length];
  };
  return outline.map(([x, y], i) => {
    const [px, py] = outline[(i - 1 + n) % n];
    const [nx, ny] = outline[(i + 1) % n];
    const a = normal(x - px, y - py);
    const b = normal(nx - x, ny - y);
    const length = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    return [x + (outward * gap * (a[0] + b[0])) / length, y + (outward * gap * (a[1] + b[1])) / length] as Pt;
  });
}

/**
 * A soft glow and a crisp line round a thing's own border, set a small gap outside it so it never
 * touches the thing, drawn on round the border over the first third of the beat and then held still.
 */
export function glowBorder(ctx: CanvasRenderingContext2D, outline: Pt[], p: number, opts: { color?: string; gap?: number } = {}) {
  if (outline.length < 3) return;
  const ring = inflateOutline(smoothClosed(outline), opts.gap ?? 6);
  const closed: Pt[] = [...ring, ring[0]];
  const draw = clamp01(p / 0.3);
  if (draw <= 0) return;
  strokeWindow(ctx, closed, 0, draw, { color: opts.color, width: 10, alpha: 0.3, shadow: { blur: 14, color: opts.color ?? "#000" } });
  strokeWindow(ctx, closed, 0, draw, { color: opts.color, width: 3, alpha: 1 });
}

/** A line lit along itself: a soft wide band under a firm, thicker core in the line's own colour — one series of a chart singled out. */
export function glowLine(ctx: CanvasRenderingContext2D, points: Pt[], p: number, opts: { color?: string } = {}) {
  const draw = clamp01(p / 0.3);
  if (draw <= 0 || points.length < 2) return;
  strokeWindow(ctx, points, 0, draw, { color: opts.color, width: 12, alpha: 0.3, shadow: { blur: 12, color: opts.color ?? "#000" } });
  strokeWindow(ctx, points, 0, draw, { color: opts.color, width: 5, alpha: 1 });
}
