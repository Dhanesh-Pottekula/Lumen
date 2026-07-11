/**
 * morph — turn one shape into another by resampling both to a common point count, aligning their
 * correspondence, and interpolating. Works for closed shapes (reactant→product, border→border) and
 * open paths. Deterministic; reuses the arc-length sampler from strokes.
 */
import { clamp01, easeInOutCubic, lerp } from "../slides/anim";
import { pointAt, type Pt } from "./strokes";

/** Resample a polyline to exactly `n` points, evenly by arc length. */
export function resample(points: Pt[], n: number, closed = true): Pt[] {
  if (points.length === 0 || n <= 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => [points[0][0], points[0][1]] as Pt);
  const src = closed && (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1]) ? [...points, points[0]] : points;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const frac = closed ? i / n : n === 1 ? 0 : i / (n - 1);
    const p = pointAt(src, frac);
    out.push([p.x, p.y]);
  }
  return out;
}

const dist2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Rotate b's point ordering to the offset that best matches a (min total distance). Closed shapes only. */
export function align(a: Pt[], b: Pt[]): Pt[] {
  const n = Math.min(a.length, b.length);
  let best = 0;
  let bestSum = Infinity;
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 16))) sum += dist2(a[i], b[(i + k) % n]);
    if (sum < bestSum) {
      bestSum = sum;
      best = k;
    }
  }
  return Array.from({ length: n }, (_, i) => b[(i + best) % n]);
}

export interface MorphOptions {
  n?: number; // resample resolution (default 64)
  closed?: boolean;
  align?: boolean; // rotate correspondence to minimize travel (closed shapes)
  ease?: (p: number) => number;
}

/** The interpolated point list between shapes `a` and `b` at progress `p`. */
export function morph(a: Pt[], b: Pt[], p: number, o: MorphOptions = {}): Pt[] {
  const n = o.n ?? 64;
  const closed = o.closed ?? true;
  const ease = o.ease ?? easeInOutCubic;
  const ra = resample(a, n, closed);
  let rb = resample(b, n, closed);
  if (closed && (o.align ?? true)) rb = align(ra, rb);
  const P = ease(clamp01(p));
  return ra.map((pa, i) => [lerp(pa[0], rb[i][0], P), lerp(pa[1], rb[i][1], P)] as Pt);
}

/** Draw the morphed shape (fill and/or stroke). */
export function drawMorph(
  ctx: CanvasRenderingContext2D,
  a: Pt[],
  b: Pt[],
  p: number,
  style: { fill?: string; stroke?: string; width?: number; closed?: boolean; align?: boolean; n?: number } = {},
) {
  const pts = morph(a, b, p, { closed: style.closed ?? true, align: style.align, n: style.n });
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (style.closed ?? true) ctx.closePath();
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fill();
  }
  if (style.stroke) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.width ?? 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.restore();
}

// ── Shape generators (centered at cx,cy) — handy sources for morphs ─────────────────────────────────

export function polygonShape(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): Pt[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = rot + (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
  });
}

export function circleShape(cx: number, cy: number, r: number, n = 48): Pt[] {
  return polygonShape(cx, cy, r, n);
}

export function starShape(cx: number, cy: number, r: number, points = 5, inner = 0.45): Pt[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as Pt;
  });
}

export function heartShape(cx: number, cy: number, r: number, n = 48): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [cx + (x / 16) * r, cy - (y / 16) * r] as Pt;
  });
}
