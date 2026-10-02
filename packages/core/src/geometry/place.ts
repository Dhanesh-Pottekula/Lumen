/**
 * The one placement solver: where a box goes beside, on or inside something, given what is actually
 * drawn on screen. It keeps the stated relation to the referent, stays off every drawn obstacle (outlines
 * and strokes, not their bounding boxes) and inside the frame, and takes the nearest spot that does all
 * three. Pure geometry in view units, y down.
 */
export type Pt = [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One thing as it is drawn: a filled region, a stroke, or a box (writing, a card). */
export type Drawn = { area: Pt[] } | { stroke: Pt[]; width?: number } | { box: Rect };

export type Side = "above" | "below" | "left-of" | "right-of";

export type Relation = Side | "near" | "on" | "inside" | "anchor";

export interface Referent {
  drawn: Drawn[];
  /** The point an anchor centres on and a standing thing's base lands on; its interior point by default. */
  point?: Pt;
}

export interface PlaceOptions {
  frame: Rect;
  /** Clearance from the referent's drawn edge. */
  gap?: number;
  /** The gap was asked for and may narrow, down to `gap`'s default, before the side is given up. */
  narrows?: boolean;
  /**
   * How far off the referent a spot on the asked side may lie before a clear spot round it that is much
   * closer wins: writing set under a wagon on a map slid down the whole map to the sea, far from the wagon.
   */
  stays?: number;
}

export interface Placed {
  at: Pt;
  /** False when no spot satisfied everything and the least-bad one was taken. */
  clear: boolean;
}

const STEP = 8;
const REACH = 520;
const SIDE_UNITS: Record<Side, Pt> = { above: [0, -1], below: [0, 1], "left-of": [-1, 0], "right-of": [1, 0] };
const COMPASS: Pt[] = Array.from({ length: 16 }, (_, k): Pt => [Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)]);
// A stroke running within this of the stated direction has no side facing it.
const FACING_MIN = 0.3;

export function rectAt([cx, cy]: Pt, [w, h]: [number, number]): Rect {
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

export function boxPolygon({ x, y, w, h }: Rect): Pt[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function insidePolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boundsOfPoints(points: Pt[]): Rect {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Each drawn piece is tested against hundreds of spots; its bounds are worked out once.
const piecesBounds = new WeakMap<Drawn, Rect>();

function pieceBounds(one: Drawn): Rect {
  const known = piecesBounds.get(one);
  if (known) return known;
  const bounds = "box" in one ? one.box : boundsOfPoints("area" in one ? one.area : one.stroke);
  piecesBounds.set(one, bounds);
  return bounds;
}

export function boundsOf(drawn: Drawn[]): Rect | undefined {
  const points = drawn.flatMap((one) => ("box" in one ? boxPolygon(one.box) : "area" in one ? one.area : one.stroke));
  return points.length > 0 ? boundsOfPoints(points) : undefined;
}

const overlapping = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

/** Whether the segment a→b passes through the rectangle (Liang–Barsky). */
export function segmentMeets([ax, ay]: Pt, [bx, by]: Pt, r: Rect): boolean {
  const [dx, dy] = [bx - ax, by - ay];
  let [low, high] = [0, 1];
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    return low <= high;
  };
  return clip(-dx, ax - r.x) && clip(dx, r.x + r.w - ax) && clip(-dy, ay - r.y) && clip(dy, r.y + r.h - ay);
}

function polylineMeets(points: Pt[], r: Rect, closed: boolean): boolean {
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) if (segmentMeets(points[i], points[(i + 1) % points.length], r)) return true;
  return points.length === 1 && points[0][0] > r.x && points[0][0] < r.x + r.w && points[0][1] > r.y && points[0][1] < r.y + r.h;
}

/** Whether any of a rectangle lies on what is drawn. */
export function meets(drawn: Drawn, r: Rect): boolean {
  if ("box" in drawn) return overlapping(drawn.box, r);
  if ("stroke" in drawn) {
    const hit = inflate(r, (drawn.width ?? 2) / 2);
    // A level or upright stroke has bounds of no height or width, which overlap nothing until widened.
    return overlapping(inflate(pieceBounds(drawn), 1), inflate(hit, 1)) && polylineMeets(drawn.stroke, hit, false);
  }
  if (drawn.area.length < 3 || !overlapping(pieceBounds(drawn), inflate(r, 0.5))) return false;
  return insidePolygon([r.x + r.w / 2, r.y + r.h / 2], drawn.area) || boxPolygon(r).some((corner) => insidePolygon(corner, drawn.area)) || polylineMeets(drawn.area, r, true);
}

/** Whether a rectangle lies wholly inside a closed outline. */
function within(area: Pt[], r: Rect): boolean {
  return area.length >= 3 && boxPolygon(r).every((corner) => insidePolygon(corner, area)) && !polylineMeets(area, r, true);
}

function segmentDistance([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const [dx, dy] = [bx - ax, by - ay];
  const length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function edgeDistance(point: Pt, polygon: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) best = Math.min(best, segmentDistance(point, polygon[i], polygon[(i + 1) % polygon.length]));
  return best;
}

/**
 * The point deepest inside a closed outline (its pole of inaccessibility, by grid search): the middle of
 * the land a thing stands on. A thin crescent's centroid, or its box's centre, lies outside it.
 */
// The same outline is asked for its middle again and again as things are placed against it.
const interiors = new Map<string, Pt>();

export function interiorPoint(polygon: Pt[]): Pt {
  let [sx, sy, sxy] = [0, 0, 0];
  for (const [x, y] of polygon) [sx, sy, sxy] = [sx + x, sy + y, sxy + x * y];
  const key = `${polygon.length}:${sx}:${sy}:${sxy}`;
  const known = interiors.get(key);
  if (known) return known;
  const found = searchInterior(polygon);
  if (interiors.size > 2000) interiors.clear();
  interiors.set(key, found);
  return found;
}

function searchInterior(polygon: Pt[]): Pt {
  const bounds = boundsOfPoints(polygon);
  const centroid: Pt = [polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length, polygon.reduce((sum, [, y]) => sum + y, 0) / polygon.length];
  if (polygon.length < 3 || bounds.w <= 0 || bounds.h <= 0) return centroid;
  let best: Pt = centroid;
  let depth = insidePolygon(centroid, polygon) ? edgeDistance(centroid, polygon) : -Infinity;
  let [cx, cy, spanX, spanY] = [bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, bounds.w, bounds.h];
  for (let round = 0; round < 3; round++) {
    const cells = 16;
    for (let i = 0; i <= cells; i++)
      for (let j = 0; j <= cells; j++) {
        const point: Pt = [cx - spanX / 2 + (spanX * i) / cells, cy - spanY / 2 + (spanY * j) / cells];
        if (!insidePolygon(point, polygon)) continue;
        // Level with the centroid wins a tie, so a round shape keeps its middle.
        const score = edgeDistance(point, polygon) - 0.02 * Math.hypot(point[0] - centroid[0], point[1] - centroid[1]);
        if (score > depth) [best, depth] = [point, score];
      }
    [cx, cy, spanX, spanY] = [best[0], best[1], (spanX * 2) / 16, (spanY * 2) / 16];
  }
  return best;
}

/** The referent's own point: the one it names, else the middle of its largest drawn piece. */
export function referentPoint(target: Referent): Pt {
  if (target.point) return target.point;
  const areas = target.drawn.flatMap((one) => ("area" in one ? [one.area] : "box" in one ? [boxPolygon(one.box)] : []));
  if (areas.length > 0) {
    const largest = areas.reduce((a, b) => (boundsOfPoints(a).w * boundsOfPoints(a).h >= boundsOfPoints(b).w * boundsOfPoints(b).h ? a : b));
    return interiorPoint(largest);
  }
  const strokes = target.drawn.flatMap((one) => ("stroke" in one ? [one.stroke] : []));
  return strokes.length > 0 ? strokeMiddle(strokes[0]).point : [0, 0];
}

function strokeMiddle(points: Pt[]): { point: Pt; normal: Pt } {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const half = lengths[lengths.length - 1] / 2;
  const i = Math.max(1, lengths.findIndex((length) => length >= half));
  const [a, b] = [points[Math.min(i, points.length - 1) - 1], points[Math.min(i, points.length - 1)]];
  const span = lengths[i] - lengths[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (half - lengths[i - 1]) / span));
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], normal: [-(b[1] - a[1]) / length, (b[0] - a[0]) / length] };
}

/** The point of a drawn thing furthest out along `direction` from `from`: an edge's middle on a box, where the ray leaves an outline. */
export function edgePoint(drawn: Drawn[], direction: Pt, from: Pt): Pt {
  let best: Pt = from;
  let reach = 0;
  for (const one of drawn) {
    const ring = "box" in one ? boxPolygon(one.box) : "area" in one ? one.area : one.stroke;
    const closed = !("stroke" in one);
    if ("stroke" in one) {
      for (const point of ring) {
        const along = (point[0] - from[0]) * direction[0] + (point[1] - from[1]) * direction[1];
        if (along > reach) [best, reach] = [point, along];
      }
      continue;
    }
    for (let i = 0; i < (closed ? ring.length : ring.length - 1); i++) {
      const hit = rayHit(from, direction, ring[i], ring[(i + 1) % ring.length]);
      if (hit !== undefined && hit > reach) [best, reach] = [[from[0] + direction[0] * hit, from[1] + direction[1] * hit], hit];
    }
  }
  return best;
}

function rayHit(origin: Pt, direction: Pt, a: Pt, b: Pt): number | undefined {
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const cross = direction[0] * ey - direction[1] * ex;
  if (Math.abs(cross) < 1e-9) return undefined;
  const [qx, qy] = [a[0] - origin[0], a[1] - origin[1]];
  const t = (qx * ey - qy * ex) / cross;
  const s = (qx * direction[1] - qy * direction[0]) / cross;
  return t >= 0 && s >= 0 && s <= 1 ? t : undefined;
}

function pointRectDistance([x, y]: Pt, r: Rect): number {
  return Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h));
}

/** How far a rectangle is from what is drawn: 0 when it lies on it. */
function distanceTo(drawn: Drawn, r: Rect): number {
  if ("box" in drawn) {
    const b = drawn.box;
    return Math.hypot(Math.max(b.x - r.x - r.w, 0, r.x - b.x - b.w), Math.max(b.y - r.y - r.h, 0, r.y - b.y - b.h));
  }
  if (meets(drawn, r)) return 0;
  const points = "area" in drawn ? drawn.area : drawn.stroke;
  const closed = "area" in drawn;
  let best = Infinity;
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
    const [a, b] = [points[i], points[(i + 1) % points.length]];
    const reach = Math.hypot(Math.max(r.x - Math.max(a[0], b[0]), 0, Math.min(a[0], b[0]) - r.x - r.w), Math.max(r.y - Math.max(a[1], b[1]), 0, Math.min(a[1], b[1]) - r.y - r.h));
    if (reach >= best) continue;
    best = Math.min(best, pointRectDistance(a, r), pointRectDistance(b, r), ...boxPolygon(r).map((corner) => segmentDistance(corner, a, b)));
  }
  return "stroke" in drawn ? Math.max(0, best - (drawn.width ?? 2) / 2) : best;
}

// Set further than this off what it names, a box no longer reads as beside it and takes a pointer line.
export const BESIDE_REACH = 36;

/** How far a rectangle is from the nearest of what is drawn: 0 when it lies on it. */
export function reachOf(drawn: Drawn[], r: Rect): number {
  return Math.min(...drawn.map((one) => distanceTo(one, r)));
}

/** Whether a rectangle keeps `gap` clear of everything drawn. */
function apart(drawn: Drawn[], r: Rect, gap: number): boolean {
  return drawn.every((one) => {
    const bounds = pieceBounds(one);
    // At no gap, apart still means not drawn across: every distance is at least nothing.
    return (bounds && !overlapping(inflate(bounds, gap + 2), r)) || (gap > 0 ? distanceTo(one, r) >= gap : !meets(one, r));
  });
}

function clearOf(drawn: Drawn[], r: Rect): boolean {
  return !drawn.some((one) => meets(one, r));
}

function framed(r: Rect, frame: Rect): boolean {
  return r.x >= frame.x - 0.5 && r.y >= frame.y - 0.5 && r.x + r.w <= frame.x + frame.w + 0.5 && r.y + r.h <= frame.y + frame.h + 0.5;
}

/** How much of a rectangle lies on the obstacles, sampled on a 5×5 grid. */
function covered(r: Rect, obstacles: Drawn[]): number {
  let count = 0;
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const cell = { x: r.x + (r.w * i) / 5, y: r.y + (r.h * j) / 5, w: r.w / 5, h: r.h / 5 };
      if (obstacles.some((one) => meets(one, cell))) count++;
    }
  return count;
}

// Steps of half the box's own length sweep every point it passes; halving then finds the edge to within a unit.
const MIN_SLIDE_STEP = 4;

/** How far along `u` from `origin` a box must go until it, `gap` clear, has passed everything drawn. */
function slideClear(target: Drawn[], origin: Pt, u: Pt, size: [number, number], gap: number): number {
  const bounds = boundsOf(target);
  if (!bounds) return 0;
  const [w, h] = size;
  const along = (low: number, high: number, start: number, half: number, unit: number) =>
    unit > 1e-9 ? (high + gap + half - start) / unit : unit < -1e-9 ? (low - gap - half - start) / unit : Infinity;
  const past = Math.max(0, Math.min(along(bounds.x, bounds.x + bounds.w, origin[0], w / 2, u[0]), along(bounds.y, bounds.y + bounds.h, origin[1], h / 2, u[1])));
  if (!Number.isFinite(past)) return 0;
  const hits = (t: number) => !apart(target, rectAt([origin[0] + u[0] * t, origin[1] + u[1] * t], size), gap);
  let [clear, hit] = [past, -1];
  const step = Math.max(MIN_SLIDE_STEP, (Math.abs(u[0]) * w + Math.abs(u[1]) * h) / 2);
  for (let t = past - step; t >= 0; t -= step) {
    if (hits(t)) {
      hit = t;
      break;
    }
    clear = t;
  }
  if (hit < 0) return clear;
  while (clear - hit > 1) {
    const mid = (clear + hit) / 2;
    if (hits(mid)) hit = mid;
    else clear = mid;
  }
  return clear;
}

interface Candidate {
  at: Pt;
  cost: number;
  /** Already known to keep its relation, as a spot slid past the whole referent is. */
  keeps?: boolean;
}

/** The first candidate (cheapest first) that is in frame and clear, else (unless only a clear one will do) the least covered one. */
function choose(candidates: Candidate[], size: [number, number], obstacles: Drawn[], options: PlaceOptions, valid: (r: Rect) => boolean, clearOnly = false): Placed | undefined {
  candidates.sort((a, b) => a.cost - b.cost);
  const usable: Rect[] = [];
  for (const candidate of candidates) {
    const r = rectAt(candidate.at, size);
    if (!framed(r, options.frame) || (!candidate.keeps && !valid(r))) continue;
    if (clearOf(obstacles, r)) return { at: candidate.at, clear: true };
    if (!clearOnly && usable.length < 240) usable.push(r);
  }
  if (usable.length === 0) return undefined;
  const least = usable.reduce((best, r) => (covered(r, obstacles) < covered(best, obstacles) ? r : best));
  return { at: [least.x + least.w / 2, least.y + least.h / 2], clear: false };
}

/** The clear spot for a box of `size` nearest `origin` anywhere in the frame, or undefined when none is clear. */
export function placeAnywhere(origin: Pt, size: [number, number], obstacles: Drawn[], frame: Rect, valid: (r: Rect) => boolean = () => true, step = STEP): Pt | undefined {
  const candidates: Candidate[] = [];
  for (let y = frame.y + size[1] / 2; y <= frame.y + frame.h - size[1] / 2; y += step)
    for (let x = frame.x + size[0] / 2; x <= frame.x + frame.w - size[0] / 2; x += step) candidates.push({ at: [x, y], cost: Math.hypot(x - origin[0], y - origin[1]) });
  return choose(candidates, size, obstacles, { frame }, valid, true)?.at;
}

function clamped([x, y]: Pt, [w, h]: [number, number], frame: Rect): Pt {
  return [Math.max(frame.x + w / 2, Math.min(frame.x + frame.w - w / 2, x)), Math.max(frame.y + h / 2, Math.min(frame.y + frame.h - h / 2, y))];
}

/** Box centres whose box would sit inside the referent's areas, nearest its point first. */
function interiorSpots(target: Referent, size: [number, number], origin: Pt, standing: boolean): Candidate[] {
  const areas = target.drawn.flatMap((one) => ("area" in one ? [one.area] : "box" in one ? [boxPolygon(one.box)] : []));
  const spots: Candidate[] = [{ at: standing ? [origin[0], origin[1] - size[1] / 2] : origin, cost: 0 }];
  for (const area of areas) {
    const bounds = boundsOfPoints(area);
    // About twenty spots across, never finer than a few units.
    const step = Math.max(4, Math.max(bounds.w, bounds.h) / 20);
    for (let y = bounds.y; y <= bounds.y + bounds.h; y += step)
      for (let x = bounds.x; x <= bounds.x + bounds.w; x += step) {
        if (!insidePolygon([x, y], area)) continue;
        spots.push({ at: standing ? [x, y - size[1] / 2] : [x, y], cost: Math.hypot(x - origin[0], y - origin[1]) });
      }
  }
  return spots;
}

/**
 * Where a box of `size` goes in `relation` to `target`, keeping off `obstacles` and inside the frame.
 *
 * - a side (`above`, `below`, `left-of`, `right-of`): just past the referent's drawn edge that way (off a
 *   stroke's middle along the normal facing that way), then the nearest spot still facing it;
 * - `near`: the nearest clear spot all round its drawn edge, off it;
 * - `inside`: wholly within its outline; `on`: standing, its base on a point inside the outline and its
 *   body above; `anchor`: centred on its point — each moving off what is already there to the nearest
 *   clear spot.
 */
// How far off its referent a thing keeps when nothing says otherwise.
const DEFAULT_GAP = 12;

/** The clear spot on the asked side, unless it lies past `stays` and one round the referent is under half as far. */
function closerRound(target: Referent, size: [number, number], obstacles: Drawn[], options: PlaceOptions, onSide: Placed): Placed {
  const sideReach = reachOf(target.drawn, rectAt(onSide.at, size));
  if (options.stays === undefined || sideReach <= options.stays) return onSide;
  const round = placeBeside(target, size, obstacles, "near", options);
  return round.clear && reachOf(target.drawn, rectAt(round.at, size)) < sideReach / 2 ? round : onSide;
}

export function placeBeside(target: Referent, size: [number, number], obstacles: Drawn[], relation: Relation, options: PlaceOptions): Placed {
  const origin = referentPoint(target);
  const gap = options.gap ?? DEFAULT_GAP;
  const offTarget = (r: Rect) => apart(target.drawn, r, gap - 0.5);
  const areas = target.drawn.flatMap((one) => ("area" in one ? [one.area] : "box" in one ? [boxPolygon(one.box)] : []));
  const fitsInside = (r: Rect) => areas.some((area) => within(area, r));

  if (relation === "inside" || relation === "on") {
    const spots = interiorSpots(target, size, origin, relation === "on");
    return choose(spots, size, obstacles, options, relation === "inside" ? fitsInside : () => true) ?? { at: clamped(spots[0].at, size, options.frame), clear: false };
  }

  if (relation === "anchor") {
    // An anchored thing whose spot is taken lines up under what holds it, as names on one place do.
    const rings = COMPASS.flatMap((u, k) => Array.from({ length: REACH / STEP }, (_, ring): Candidate => {
      const reach = (ring + 1) * STEP;
      return { at: [origin[0] + u[0] * reach, origin[1] + u[1] * reach], cost: reach * (1 + Math.abs(Math.atan2(u[0], u[1]))) + k * 0.01 };
    }));
    return choose([{ at: origin, cost: 0 }, ...rings], size, obstacles, options, () => true) ?? { at: clamped(origin, size, options.frame), clear: false };
  }

  if (relation === "near") {
    const candidates: Candidate[] = [{ at: origin, cost: 0 }];
    COMPASS.forEach((u, k) => {
      const start = slideClear(target.drawn, origin, u, size, gap);
      for (let ring = 0; ring * STEP <= REACH; ring++) {
        const reach = start + ring * STEP;
        // Right and below win a tie, as a note is read after the thing it names.
        candidates.push({ at: [origin[0] + u[0] * reach, origin[1] + u[1] * reach], cost: reach + (k <= 4 ? 0 : 1), keeps: true });
      }
    });
    return choose(candidates, size, obstacles, options, offTarget) ?? { at: clamped(origin, size, options.frame), clear: false };
  }

  const aim = SIDE_UNITS[relation];
  const stroke = target.drawn.length === 1 && "stroke" in target.drawn[0] ? target.drawn[0].stroke : undefined;
  let [u, start] = [aim, origin];
  if (stroke && stroke.length >= 2) {
    const middle = strokeMiddle(stroke);
    const facing = middle.normal[0] * aim[0] + middle.normal[1] * aim[1];
    if (Math.abs(facing) >= FACING_MIN) [u, start] = [facing > 0 ? middle.normal : [-middle.normal[0], -middle.normal[1]], middle.point];
  }
  const across: Pt = [-u[1], u[0]];
  const bounds = boundsOf(target.drawn)!;
  const spread = boxPolygon(bounds).map(([x, y]) => (x - start[0]) * across[0] + (y - start[1]) * across[1]);
  const half = Math.abs(across[0]) * (size[0] / 2) + Math.abs(across[1]) * (size[1] / 2);
  const [low, high] = [Math.min(...spread) - half, Math.max(...spread) + half];
  const first = slideClear(target.drawn, start, u, size, gap);
  const candidates: Candidate[] = [];
  for (let out = 0; out <= REACH; out += STEP)
    for (let slide = -REACH; slide <= REACH; slide += STEP) {
      if (slide < low || slide > high) continue;
      const reach = first + out;
      candidates.push({ at: [start[0] + u[0] * reach + across[0] * slide, start[1] + u[1] * reach + across[1] * slide], cost: Math.hypot(out, slide) });
    }
  const facing = (r: Rect) => (r.x + r.w / 2 - start[0]) * u[0] + (r.y + r.h / 2 - start[1]) * u[1] > 0;
  const onSide = choose(candidates, size, obstacles, options, (r) => facing(r) && offTarget(r));
  if (onSide?.clear) return closerRound(target, size, obstacles, options, onSide);
  // A gap asked for too wide for the room on that side narrows before the side is given up: a paperclip
  // asked to hang far under a tall magnet went to a corner instead.
  if (options.narrows && gap > DEFAULT_GAP) {
    const closer = placeBeside(target, size, obstacles, relation, { ...options, gap: Math.max(DEFAULT_GAP, gap / 2) });
    if (closer.clear) return closer;
  }
  // With no clear spot on the side asked for, the nearest clear one round the referent beats printing across something.
  const round = placeBeside(target, size, obstacles, "near", options);
  return round.clear ? round : (onSide ?? { at: clamped([start[0] + u[0] * first, start[1] + u[1] * first], size, options.frame), clear: false });
}
