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
  const P = ease(clamp01(p));
  const [ca, cb] = [corners(a), corners(b)];
  if (closed && ca.length === cb.length && ca.length <= MAX_CORNERS) return cornerMorph(ca, cb, P);
  const ra = resample(a, n, closed);
  let rb = resample(b, n, closed);
  // Walking the two outlines in opposite directions pairs every point with its mirror and folds the shape into slivers.
  if (closed && signedArea(ra) * signedArea(rb) < 0) rb.reverse();
  if (closed && (o.align ?? true)) rb = align(ra, rb);
  return ra.map((pa, i) => [lerp(pa[0], rb[i][0], P), lerp(pa[1], rb[i][1], P)] as Pt);
}

const MAX_CORNERS = 8;

function signedArea(points: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/** A closed outline's own corners: the repeated closing point dropped. */
function corners(points: Pt[]): Pt[] {
  const last = points.at(-1);
  return points.length > 1 && last && dist2(points[0], last) < 1e-6 ? points.slice(0, -1) : points;
}

const centroid = (points: Pt[]): Pt => [points.reduce((sum, [x]) => sum + x, 0) / points.length, points.reduce((sum, [, y]) => sum + y, 0) / points.length];

interface Pose {
  to: Pt[];
  kind: "turn" | "flip" | "blend";
  angle: number;
  travel: number;
}

const POSE_RANK = { turn: 0, flip: 1, blend: 2 } as const;
const better = (one: Pose, other: Pose) =>
  POSE_RANK[one.kind] - POSE_RANK[other.kind] || (one.kind === "turn" ? Math.abs(one.angle) - Math.abs(other.angle) : one.travel - other.travel);

/** How b's corners, paired one to one with a's, are best reached: a rigid turn, a card flip about a mirror line, or a plain blend. */
function poseOf(from: Pt[], to: Pt[]): Pose {
  const [fa, fb] = [centroid(from), centroid(to)];
  let [dot, cross, even, odd, travel, reach] = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < from.length; i++) {
    const [ax, ay] = [from[i][0] - fa[0], from[i][1] - fa[1]];
    const [bx, by] = [to[i][0] - fb[0], to[i][1] - fb[1]];
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
    even += bx * ax - by * ay;
    odd += bx * ay + by * ax;
    travel += dist2(from[i], to[i]);
    reach = Math.max(reach, ax * ax + ay * ay);
  }
  const turn = Math.atan2(cross, dot);
  const mirror = Math.atan2(odd, even);
  const misfit = (map: (x: number, y: number) => Pt) =>
    Math.max(...from.map((point, i) => {
      const [x, y] = map(point[0] - fa[0], point[1] - fa[1]);
      return Math.hypot(x + fb[0] - to[i][0], y + fb[1] - to[i][1]);
    }));
  const tolerance = 0.02 * Math.sqrt(reach);
  const turned = misfit((x, y) => [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn)]);
  if (turned <= tolerance) return { to, kind: "turn", angle: turn, travel };
  const flipped = misfit((x, y) => [x * Math.cos(mirror) + y * Math.sin(mirror), x * Math.sin(mirror) - y * Math.cos(mirror)]);
  if (flipped <= tolerance) return { to, kind: "flip", angle: mirror / 2, travel };
  return { to, kind: "blend", angle: 0, travel };
}

/** Morph two outlines with the same corner count corner to corner, so a moved copy of a shape slides and turns (or flips over) whole. */
function cornerMorph(a: Pt[], b: Pt[], P: number): Pt[] {
  if (P <= 0) return a;
  const n = a.length;
  const orders = [b, [...b].reverse()].flatMap((ring) => Array.from({ length: n }, (_, k) => Array.from({ length: n }, (_, i) => ring[(i + k) % n])));
  // A blend is only safe along corners walked the same way round; the other way crosses edges mid-morph.
  const poses = orders.map((to) => poseOf(a, to)).filter((one) => one.kind !== "blend" || signedArea(one.to) * signedArea(a) >= 0);
  const pose = poses.reduce((best, next) => (better(next, best) < 0 ? next : best));
  // The finished shape is b, its corners listed in the order a's corners reached them.
  if (P >= 1) return pose.to;
  if (pose.kind === "blend") return a.map((pa, i) => [lerp(pa[0], pose.to[i][0], P), lerp(pa[1], pose.to[i][1], P)] as Pt);
  const [fa, fb] = [centroid(a), centroid(pose.to)];
  const [mx, my] = [lerp(fa[0], fb[0], P), lerp(fa[1], fb[1], P)];
  if (pose.kind === "turn") {
    const [c, s] = [Math.cos(pose.angle * P), Math.sin(pose.angle * P)];
    return a.map(([x, y]) => [mx + (x - fa[0]) * c - (y - fa[1]) * s, my + (x - fa[0]) * s + (y - fa[1]) * c] as Pt);
  }
  // A mirror image cannot be reached by turning, so it turns over about its mirror line like a card.
  const [ux, uy] = [Math.cos(pose.angle), Math.sin(pose.angle)];
  const squash = Math.cos(Math.PI * P);
  return a.map(([x, y]) => {
    const [dx, dy] = [x - fa[0], y - fa[1]];
    const along = dx * ux + dy * uy;
    const across = (-dx * uy + dy * ux) * squash;
    return [mx + along * ux - across * uy, my + along * uy + across * ux] as Pt;
  });
}

/**
 * Where each of `a`'s corners is `p` of the way through a morph into `b`, matched corner to corner
 * exactly as `morph` matches them; shapes it cannot match so send each corner straight to its namesake.
 */
export function morphCorners(a: Pt[], b: Pt[], p: number, closed = true): Pt[] {
  const P = easeInOutCubic(clamp01(p));
  if (closed && a.length === b.length && a.length > 0 && a.length <= MAX_CORNERS) return cornerMorph(a, b, P);
  return a.map((pa, i) => {
    const pb = b[Math.min(i, b.length - 1)] ?? pa;
    return [lerp(pa[0], pb[0], P), lerp(pa[1], pb[1], P)] as Pt;
  });
}

/** Draw the morphed shape (fill and/or stroke). */
export function drawMorph(
  ctx: CanvasRenderingContext2D,
  a: Pt[],
  b: Pt[],
  p: number,
  style: { fill?: string; stroke?: string; width?: number; closed?: boolean; align?: boolean; n?: number } = {},
): Pt[] {
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
  return pts;
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
