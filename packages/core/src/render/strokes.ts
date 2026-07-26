/**
 * strokes — the draw-on / self-drawing stroke system.
 *
 * The whole system rests on ONE primitive: a normalized `[start, end]` window over a path's arc
 * length. Draw-on is `window(0, p)`; erase is `window(p, 1)`; a passing flash is a narrow sliding
 * window. Every function is pure in its progress inputs, so every stroke is deterministic and
 * seekable (same `t` → same frame).
 *
 * Pipeline:  raw points → smoothPath() (optional curve interpolation) → dense polyline
 *            → windowPolyline() by arc length → optional roughen (hand-drawn) / taper (variable
 *            width) → stroked or filled onto a ctx (a raw ctx or any FrameCtx layer).
 *
 * The verbs (draw-on, passing-flash, border-then-fill, traced-path, markers, orchestration) live in
 * `./strokeVerbs`; this module is the geometry + style + renderer they all build on.
 */
import { clamp01, lerp } from "./motion";
import { roughen, type Theme } from "./theme";

export type Pt = [number, number];

// ── Arc-length core ──────────────────────────────────────────────────────────────────────────────

export interface ArcTable {
  pts: Pt[];
  cum: number[]; // cumulative length up to each point
  length: number; // total arc length
}

// Cache arc-length tables by array identity. Static paths (built once at module load and re-drawn every
// frame) become a hit; per-frame arrays (e.g. tracedPath) miss and are GC'd with the array — no leak.
// Contract: treat point arrays as immutable once passed in (mutating in place would stale the cache).
const tableCache = new WeakMap<Pt[], ArcTable>();

/** Build (or reuse) a cumulative arc-length table for a polyline. O(n) on a miss, O(1) on a hit. */
export function arcTable(points: Pt[]): ArcTable {
  const hit = tableCache.get(points);
  if (hit) return hit;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const table: ArcTable = { pts: points, cum, length: cum[cum.length - 1] || 0 };
  tableCache.set(points, table);
  return table;
}

export interface SamplePoint {
  x: number;
  y: number;
  angle: number; // tangent direction (radians)
}

function sampleAtDist(t: ArcTable, d: number): SamplePoint {
  const pts = t.pts;
  if (pts.length === 1) return { x: pts[0][0], y: pts[0][1], angle: 0 };
  d = Math.max(0, Math.min(t.length, d));
  let i = 1;
  while (i < t.cum.length - 1 && t.cum[i] < d) i++;
  const seg = t.cum[i] - t.cum[i - 1] || 1;
  const f = (d - t.cum[i - 1]) / seg;
  const [x1, y1] = pts[i - 1];
  const [x2, y2] = pts[i];
  return { x: lerp(x1, x2, f), y: lerp(y1, y2, f), angle: Math.atan2(y2 - y1, x2 - x1) };
}

/** Point + tangent at arc-length fraction `p` (0..1) along a polyline. For tracers, markers, followers. */
export function pointAt(points: Pt[], p: number): SamplePoint {
  const t = arcTable(points);
  return sampleAtDist(t, clamp01(p) * t.length);
}

/**
 * The core primitive: the sub-polyline covering arc-length fractions `[start, end]` (each 0..1),
 * with interpolated points at both cuts. `windowPolyline(pts, 0, p)` is the draw-on shape.
 */
export function windowPolyline(points: Pt[], start: number, end: number): Pt[] {
  const n = points.length;
  if (n === 0) return [];
  start = clamp01(start);
  end = clamp01(end);
  const t = arcTable(points);
  if (t.length === 0) return [[points[0][0], points[0][1]]];
  if (end <= start) {
    const p = sampleAtDist(t, start * t.length);
    return [[p.x, p.y]];
  }
  const dStart = start * t.length;
  const dEnd = end * t.length;
  const s = sampleAtDist(t, dStart);
  const out: Pt[] = [[s.x, s.y]];
  for (let i = 0; i < n; i++) {
    if (t.cum[i] > dStart && t.cum[i] < dEnd) out.push([points[i][0], points[i][1]]);
  }
  const e = sampleAtDist(t, dEnd);
  out.push([e.x, e.y]);
  return out;
}

/** First `p` (0..1) of a polyline by arc length — draw-on convenience. `= windowPolyline(pts, 0, p)`. */
export const partialPolyline = (points: Pt[], p: number): Pt[] => windowPolyline(points, 0, p);

// ── Curve interpolation: point-list → smooth dense polyline ───────────────────────────────────────

export type CurveKind =
  | "linear"
  | "cardinal"
  | "catmullRom"
  | "basis"
  | "natural"
  | "step"
  | "stepBefore"
  | "stepAfter";

export interface CurveOptions {
  curve?: CurveKind;
  tension?: number; // cardinal: 0 = loose/round … 1 = straight (default 0)
  alpha?: number; // catmullRom: 0 = uniform, 0.5 = centripetal (no cusps, best default), 1 = chordal
  closed?: boolean;
  samples?: number; // points generated per input segment for smooth curves (default 16)
}

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function hermite(p0: Pt, p1: Pt, m0: Pt, m1: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return [
    h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
  ];
}

/** Cardinal spline (Hermite tangents scaled by 1−tension) through the points. */
function cardinalPath(pts: Pt[], closed: boolean, tension: number, samples: number): Pt[] {
  const c = 1 - clamp01(tension);
  const P = closed
    ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
    : [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2];
    const m0: Pt = [(c * (p2[0] - p0[0])) / 2, (c * (p2[1] - p0[1])) / 2];
    const m1: Pt = [(c * (p3[0] - p1[0])) / 2, (c * (p3[1] - p1[1])) / 2];
    for (let s = 0; s < samples; s++) out.push(hermite(p1, p2, m0, m1, s / samples));
  }
  out.push(closed ? [pts[0][0], pts[0][1]] : [pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

/** Catmull-Rom with knot parameterisation `alpha` (0.5 = centripetal). Passes through every point. */
function catmullRomPath(pts: Pt[], closed: boolean, alpha: number, samples: number): Pt[] {
  const P = closed
    ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
    : [pts[0], ...pts, pts[pts.length - 1]];
  const out: Pt[] = [];
  const EPS = 1e-6;
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2];
    const t0 = 0;
    const t1 = t0 + Math.max(EPS, Math.pow(dist(p0, p1), alpha));
    const t2 = t1 + Math.max(EPS, Math.pow(dist(p1, p2), alpha));
    const t3 = t2 + Math.max(EPS, Math.pow(dist(p2, p3), alpha));
    for (let s = 0; s < samples; s++) {
      const t = t1 + ((t2 - t1) * s) / samples;
      // Barry-Goldman recursive evaluation
      const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
      const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
      const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
      const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
      const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
      out.push(mix(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  out.push(closed ? [pts[0][0], pts[0][1]] : [pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

const mix = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Uniform cubic B-spline — very smooth, does NOT pass through interior points (good for organic blobs).
 *  Endpoints are doubled so the curve nearly meets the first/last control point without a kink. */
function basisPath(pts: Pt[], closed: boolean, samples: number): Pt[] {
  const P = closed
    ? [pts[pts.length - 1], ...pts, pts[0], pts[1]]
    : [pts[0], pts[0], ...pts, pts[pts.length - 1], pts[pts.length - 1]];
  const out: Pt[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const b0 = (-t3 + 3 * t2 - 3 * t + 1) / 6;
      const b1 = (3 * t3 - 6 * t2 + 4) / 6;
      const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
      const b3 = t3 / 6;
      out.push([
        b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
        b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
      ]);
    }
  }
  // emit the final segment endpoint (t=1) so the curve reaches its tail instead of stopping a step short
  const n = P.length;
  out.push([(P[n - 3][0] + 4 * P[n - 2][0] + P[n - 1][0]) / 6, (P[n - 3][1] + 4 * P[n - 2][1] + P[n - 1][1]) / 6]);
  return out;
}

/** Natural cubic spline (2nd derivative zero at the ends). Solved per axis via the Thomas algorithm. */
function naturalPath(pts: Pt[], samples: number): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const solve = (v: number[]): number[] => {
    // second derivatives k[] for a natural cubic spline through v (uniform knots)
    const k = new Array(n).fill(0);
    const u = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      const p = 0.5 * u[i - 1] + 2;
      u[i] = 0.5 / p;
      k[i] = (3 * (v[i + 1] - 2 * v[i] + v[i - 1]) - 0.5 * k[i - 1]) / p;
    }
    for (let i = n - 2; i >= 0; i--) k[i] = k[i] * u[i] + k[i + 1];
    return k;
  };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const kx = solve(xs);
  const ky = solve(ys);
  const out: Pt[] = [];
  const seg = (v: number[], k: number[], i: number, t: number) => {
    const a = 1 - t;
    return a * v[i] + t * v[i + 1] + ((a * a * a - a) * k[i] + (t * t * t - t) * k[i + 1]) / 6;
  };
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      out.push([seg(xs, kx, i, t), seg(ys, ky, i, t)]);
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

function stepPath(pts: Pt[], kind: "step" | "stepBefore" | "stepAfter"): Pt[] {
  const out: Pt[] = [[pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (kind === "stepBefore") {
      out.push([a[0], b[1]], [b[0], b[1]]);
    } else if (kind === "stepAfter") {
      out.push([b[0], a[1]], [b[0], b[1]]);
    } else {
      const mx = (a[0] + b[0]) / 2;
      out.push([mx, a[1]], [mx, b[1]], [b[0], b[1]]);
    }
  }
  return out;
}

/**
 * Interpolate a control-point list into a dense polyline using the chosen curve. `linear` (or fewer
 * than 3 points) returns the points as-is. The result feeds windowPolyline for uniform-speed draw-on.
 */
export function smoothPath(points: Pt[], opts: CurveOptions = {}): Pt[] {
  const { curve = "linear", tension = 0, alpha = 0.5, closed = false, samples = 16 } = opts;
  if (curve === "step" || curve === "stepBefore" || curve === "stepAfter") return stepPath(points, curve);
  if (points.length < 3 || curve === "linear") return closed ? [...points, points[0]] : points.slice();
  switch (curve) {
    case "cardinal":
      return cardinalPath(points, closed, tension, samples);
    case "catmullRom":
      return catmullRomPath(points, closed, alpha, samples);
    case "basis":
      return basisPath(points, closed, samples);
    case "natural": {
      const np = naturalPath(points, samples);
      return closed ? [...np, [points[0][0], points[0][1]]] : np;
    }
    default:
      return points.slice();
  }
}

// ── Style + renderer ──────────────────────────────────────────────────────────────────────────────

export interface StrokeStyle {
  // appearance
  color?: string | CanvasGradient | CanvasPattern;
  width?: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  miterLimit?: number;
  // dashes
  dash?: number[];
  dashOffset?: number;
  // compositing
  alpha?: number;
  blend?: GlobalCompositeOperation;
  shadow?: { blur: number; color: string; dx?: number; dy?: number };
  // hand-drawn
  roughness?: number; // per-point jitter via theme's roughen()
  seed?: number; // fix the jitter so it doesn't crawl between frames
  // variable width (any of these switches to outline-fill "brush" mode; note: `dash` is a
  // stroke-only feature and is ignored in brush mode, where `cap` selects round vs. flat end-caps)
  taperStart?: number; // px length that tapers up from 0 at the very start
  taperEnd?: number; // px length that tapers down to 0 at the very end
  widthProfile?: (t: number) => number; // t 0..1 along the drawn span → width multiplier
  minWidth?: number; // floor so a variable-width stroke never fully vanishes
}

function resolve(style: StrokeStyle, theme?: Theme): Required<Pick<StrokeStyle, "color" | "width" | "roughness">> & StrokeStyle {
  return {
    ...style,
    color: style.color ?? theme?.palette.ink ?? "#ffffff",
    width: style.width ?? theme?.lineStyle.width ?? 2,
    roughness: style.roughness ?? theme?.lineStyle.roughness ?? 0,
  };
}

const isVariable = (s: StrokeStyle) => s.taperStart != null || s.taperEnd != null || s.widthProfile != null;

/** Render a variable-width span as a filled outline (offset each point along its normal by half-width). */
function fillOutline(ctx: CanvasRenderingContext2D, pts: Pt[], s: StrokeStyle & { color: string | CanvasGradient | CanvasPattern; width: number }) {
  const t = arcTable(pts);
  const left: Pt[] = [];
  const right: Pt[] = [];
  let wFirst = 0;
  let wLast = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const d = t.cum[i];
    const dEnd = t.length - d;
    const frac = t.length ? d / t.length : 0;
    let w = s.width * (s.widthProfile ? s.widthProfile(frac) : 1);
    if (s.taperStart && d < s.taperStart) w *= d / s.taperStart;
    if (s.taperEnd && dEnd < s.taperEnd) w *= dEnd / s.taperEnd;
    if (s.minWidth != null) w = Math.max(s.minWidth, w);
    if (i === 0) wFirst = w;
    if (i === pts.length - 1) wLast = w;
    const h = w / 2;
    left.push([pts[i][0] + nx * h, pts[i][1] + ny * h]);
    right.push([pts[i][0] - nx * h, pts[i][1] - ny * h]);
  }
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  // Round end-caps (default): a disc of the local width fills the flat butt-end left by the outline.
  // Tapered-to-a-point ends have width ~0 and are skipped automatically.
  if ((s.cap ?? "round") === "round") {
    const last = pts.length - 1;
    if (wFirst > 0.5) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], wFirst / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (wLast > 0.5) {
      ctx.beginPath();
      ctx.arc(pts[last][0], pts[last][1], wLast / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Stroke the arc-length window `[start, end]` of `points` with `style`. The one renderer every verb
 * uses. `points` should already be a dense polyline (run smoothPath first for curves).
 */
export function strokeWindow(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  start: number,
  end: number,
  style: StrokeStyle = {},
  theme?: Theme,
) {
  let pts = windowPolyline(points, start, end);
  if (pts.length < 2) return;
  const s = resolve(style, theme);
  if (s.roughness) pts = roughen(pts, s.roughness, s.seed ?? 1) as Pt[];
  ctx.save();
  if (s.alpha != null) ctx.globalAlpha *= clamp01(s.alpha);
  if (s.blend) ctx.globalCompositeOperation = s.blend;
  if (s.shadow) {
    ctx.shadowBlur = s.shadow.blur;
    ctx.shadowColor = s.shadow.color;
    ctx.shadowOffsetX = s.shadow.dx ?? 0;
    ctx.shadowOffsetY = s.shadow.dy ?? 0;
  }
  if (isVariable(s)) {
    fillOutline(ctx, pts, s);
  } else {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = s.cap ?? "round";
    ctx.lineJoin = s.join ?? "round";
    if (s.miterLimit != null) ctx.miterLimit = s.miterLimit;
    if (s.dash) {
      ctx.setLineDash(s.dash);
      ctx.lineDashOffset = s.dashOffset ?? 0;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw-on convenience: the first `p` (0..1) of `points`. `= strokeWindow(ctx, points, 0, p, …)`. */
export const strokeOn = (
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  p: number,
  style?: StrokeStyle,
  theme?: Theme,
) => strokeWindow(ctx, points, 0, p, style, theme);
