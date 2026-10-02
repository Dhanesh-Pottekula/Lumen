/**
 * figure — the named places of a drawn figure: its corners `v<i>` (each point its d passes through,
 * in order), its sides `s<i>` (from `v<i>` to the next corner), a point along a side `s<i>@t`, and the
 * coordinate frame each of them sets. Pure geometry shared by the resolver, which lays marks out at
 * rest, and the renderer, which carries them with the figure as it moves, turns or changes shape.
 *
 * Frames (axes are per grid unit, so a mark is written in the figure's own units):
 *   v<i>    origin the corner; x along the side to the next corner, y along the side to the previous one
 *   s<i>    origin the side's start; x along the side, y the outward normal (the figure's exterior)
 *   s<i>@t  origin the point t (0–1) of the way along the side; x along it there, y outward
 */
import { flattenPath, type PathSeg } from "./path";

export type Vec2 = [number, number];

export interface FigureRing {
  /** The ring's corners in drawing order, by index into `corners`. */
  at: number[];
  closed: boolean;
}

export interface FigureSpec {
  corners: Vec2[];
  rings: FigureRing[];
  /** Side i's drawn course in its chord's own terms ([along, across] in chord lengths); null where it is straight. */
  bends: Array<Vec2[] | null>;
}

/** An affine frame: a point (u, v) in it lies at `o + u·x + v·y`. */
export interface Frame {
  o: Vec2;
  x: Vec2;
  y: Vec2;
}

const HANDLE = /^(?:v(\d+)|s(\d+)(?:@(\d*\.?\d+))?)$/;

/** A handle's parts, or undefined when the name is not a corner, side or point along a side. */
export function parseHandle(name: string): { corner?: number; side?: number; t?: number } | undefined {
  const match = HANDLE.exec(name);
  if (!match) return undefined;
  if (match[1] !== undefined) return { corner: Number(match[1]) };
  const t = match[3] === undefined ? undefined : Number(match[3]);
  if (t !== undefined && (t < 0 || t > 1)) return undefined;
  return { side: Number(match[2]), t };
}

/** A target naming a handle split into the figure's id and the handle, or undefined when its tail names none. */
export function splitHandle(target: string): { owner: string; name: string } | undefined {
  const at = target.indexOf("@");
  const dot = (at < 0 ? target : target.slice(0, at)).lastIndexOf(".");
  if (dot < 1) return undefined;
  const name = target.slice(dot + 1);
  return parseHandle(name) ? { owner: target.slice(0, dot), name } : undefined;
}

const close = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

/** The corners, rings and side courses of a figure drawn by `segs`. */
export function figureOf(segs: PathSeg[]): FigureSpec {
  const corners: Vec2[] = [];
  const rings: FigureRing[] = [];
  const bends: Array<Vec2[] | null> = [];
  let ring: FigureRing | undefined;
  let between: PathSeg[] = [];
  for (const seg of segs) {
    if (seg.c === "M") {
      ring = { at: [corners.length], closed: false };
      rings.push(ring);
      corners.push([seg.x, seg.y]);
      bends.push(null);
      between = [];
      continue;
    }
    if (seg.c === "Z") {
      if (!ring) continue;
      ring.closed = true;
      const [first, last] = [ring.at[0], ring.at[ring.at.length - 1]];
      // A ring that returns to its start by its own last command closes there: that point is not a fourth corner.
      if (ring.at.length > 2 && close(corners[first], corners[last])) ring.at.pop();
      ring = undefined;
      continue;
    }
    if (seg.c === "C" && seg.mid) {
      between.push(seg);
      continue;
    }
    if (!ring) {
      ring = { at: [], closed: false };
      rings.push(ring);
    }
    const from = ring.at.length > 0 ? ring.at[ring.at.length - 1] : undefined;
    const end: Vec2 = [seg.x, seg.y];
    if (from !== undefined && (seg.c === "C" || between.length > 0)) bends[from] = chordCourse(corners[from], end, [...between, seg]);
    ring.at.push(corners.length);
    corners.push(end);
    bends.push(null);
    between = [];
  }
  return { corners, rings, bends };
}

function chordCourse(a: Vec2, b: Vec2, segs: PathSeg[]): Vec2[] | null {
  const points = flattenPath([{ c: "M", x: a[0], y: a[1] }, ...segs])[0]?.points;
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length2 = dx * dx + dy * dy;
  if (!points || length2 < 1e-12) return null;
  return points.map(([x, y]): Vec2 => [((x - a[0]) * dx + (y - a[1]) * dy) / length2, ((x - a[0]) * -dy + (y - a[1]) * dx) / length2]);
}

function locate(figure: FigureSpec, corner: number): { ring: FigureRing; k: number } | undefined {
  for (const ring of figure.rings) {
    const k = ring.at.indexOf(corner);
    if (k >= 0) return { ring, k };
  }
  return undefined;
}

export function nextCorner(figure: FigureSpec, corner: number): number | undefined {
  const spot = locate(figure, corner);
  if (!spot) return undefined;
  const { ring, k } = spot;
  if (k + 1 < ring.at.length) return ring.at[k + 1];
  return ring.closed && ring.at.length > 1 ? ring.at[0] : undefined;
}

export function previousCorner(figure: FigureSpec, corner: number): number | undefined {
  const spot = locate(figure, corner);
  if (!spot) return undefined;
  const { ring, k } = spot;
  if (k > 0) return ring.at[k - 1];
  return ring.closed && ring.at.length > 1 ? ring.at[ring.at.length - 1] : undefined;
}

/** Every handle a figure exposes by name: its corners, then its sides. */
export function handleNames(figure: FigureSpec): string[] {
  const sides = figure.corners.flatMap((_, i) => (nextCorner(figure, i) === undefined ? [] : [`s${i}`]));
  return [...figure.corners.map((_, i) => `v${i}`), ...sides];
}

/** Side i as drawn between the corners where they are now: a curved side keeps its bulge, scaled to its chord. */
export function sideCourse(figure: FigureSpec, corners: Vec2[], side: number): Vec2[] | undefined {
  const next = nextCorner(figure, side);
  if (next === undefined) return undefined;
  const [a, b] = [corners[side], corners[next]];
  const bend = figure.bends[side];
  if (!bend) return [a, b];
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  return bend.map(([u, v]): Vec2 => [a[0] + u * dx - v * dy, a[1] + u * dy + v * dx]);
}

/** The ring's whole drawn outline, side after side, where its corners are now. */
export function ringCourse(figure: FigureSpec, corners: Vec2[], ring: FigureRing): Vec2[] {
  const out: Vec2[] = [];
  for (const corner of ring.at) {
    const side = sideCourse(figure, corners, corner);
    if (!side) continue;
    out.push(...(out.length > 0 ? side.slice(1) : side));
  }
  return out.length > 0 ? out : ring.at.map((i) => corners[i]);
}

/** +1 when the ring winds clockwise on a y-down screen (its inside to the right of travel), -1 when the other way, 0 when it encloses nothing. */
function winding(figure: FigureSpec, corners: Vec2[], ring: FigureRing): number {
  const outline = ringCourse(figure, corners, ring);
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    area += x0 * y1 - x1 * y0;
  }
  const scale = Math.max(1e-9, ...outline.map(([x, y]) => Math.abs(x) + Math.abs(y)));
  return Math.abs(area) < 1e-9 * scale * scale ? 0 : Math.sign(area);
}

const unit = ([x, y]: Vec2): Vec2 => {
  const length = Math.hypot(x, y);
  return length < 1e-12 ? [0, 0] : [x / length, y / length];
};

/** The unit normal pointing away from the figure's inside, for a direction of travel along one of its sides. */
function outward(direction: Vec2, turn: number): Vec2 {
  const [dx, dy] = unit(direction);
  // Inside lies right of travel on a clockwise ring; a ring that encloses nothing takes its left as outside.
  return turn < 0 ? [-dy, dx] : [dy, -dx];
}

function pointAlong(course: Vec2[], t: number): { at: Vec2; direction: Vec2 } {
  const lengths = [0];
  for (let i = 1; i < course.length; i++) lengths.push(lengths[i - 1] + Math.hypot(course[i][0] - course[i - 1][0], course[i][1] - course[i - 1][1]));
  const target = lengths[lengths.length - 1] * Math.max(0, Math.min(1, t));
  let k = 1;
  while (k < course.length - 1 && lengths[k] < target) k++;
  const [a, b] = [course[k - 1], course[k]];
  const span = lengths[k] - lengths[k - 1] || 1;
  const share = Math.max(0, Math.min(1, (target - lengths[k - 1]) / span));
  return { at: [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share], direction: [b[0] - a[0], b[1] - a[1]] };
}

/** Where a handle is: the corner, the side's middle, or the named point along the side. */
export function handlePoint(figure: FigureSpec, corners: Vec2[], name: string): Vec2 | undefined {
  const handle = parseHandle(name);
  if (!handle) return undefined;
  if (handle.corner !== undefined) return corners[handle.corner];
  const course = sideCourse(figure, corners, handle.side!);
  return course ? pointAlong(course, handle.t ?? 0.5).at : undefined;
}

/** The stretch of the figure a handle names, as drawn: a side's course, or the two half-sides meeting at a corner. */
export function handleCourse(figure: FigureSpec, corners: Vec2[], name: string): Vec2[] | undefined {
  const handle = parseHandle(name);
  if (!handle) return undefined;
  if (handle.side !== undefined) return sideCourse(figure, corners, handle.side);
  const corner = handle.corner!;
  if (corners[corner] === undefined) return undefined;
  const before = previousCorner(figure, corner);
  const after = sideCourse(figure, corners, corner);
  const into = before === undefined ? undefined : sideCourse(figure, corners, before);
  const half = (course: Vec2[], from: number, to: number) => {
    const lengths = [0];
    for (let i = 1; i < course.length; i++) lengths.push(lengths[i - 1] + Math.hypot(course[i][0] - course[i - 1][0], course[i][1] - course[i - 1][1]));
    const total = lengths[lengths.length - 1];
    return course.filter((_, i) => lengths[i] >= total * from - 1e-9 && lengths[i] <= total * to + 1e-9);
  };
  const lead = into ? [...half(into, 0.5, 1), corners[corner]] : [corners[corner]];
  const tail = after ? [corners[corner], ...half(after, 0, 0.5)] : [];
  const joined = [...lead, ...tail.slice(1)];
  return joined.length > 1 ? joined : undefined;
}

/**
 * The frame a handle sets, its axes `scale` view units long per grid unit. An end of an open path has
 * one side only; the axis it lacks stands square to that side, toward the inside.
 */
export function handleFrame(figure: FigureSpec, corners: Vec2[], name: string, scale: number): Frame | undefined {
  const handle = parseHandle(name);
  if (!handle) return undefined;
  const sized = ([x, y]: Vec2): Vec2 => [x * scale, y * scale];
  if (handle.corner !== undefined) {
    const corner = handle.corner;
    const o = corners[corner];
    if (!o) return undefined;
    const spot = locate(figure, corner);
    const turn = spot ? winding(figure, corners, spot.ring) : 0;
    const after = sideCourse(figure, corners, corner);
    const before = previousCorner(figure, corner);
    const into = before === undefined ? undefined : sideCourse(figure, corners, before);
    const x = after ? unit([after[1][0] - o[0], after[1][1] - o[1]]) : undefined;
    const y = into ? unit([into[into.length - 2][0] - o[0], into[into.length - 2][1] - o[1]]) : undefined;
    if (x && y) return { o, x: sized(x), y: sized(y) };
    if (x) {
      const out = outward(x, turn);
      return { o, x: sized(x), y: sized([-out[0], -out[1]]) };
    }
    if (y) {
      const out = outward([-y[0], -y[1]], turn);
      return { o, x: sized([-out[0], -out[1]]), y: sized(y) };
    }
    return { o, x: [scale, 0], y: [0, scale] };
  }
  const side = handle.side!;
  const course = sideCourse(figure, corners, side);
  const spot = locate(figure, side);
  if (!course || !spot) return undefined;
  const turn = winding(figure, corners, spot.ring);
  if (handle.t === undefined) {
    const chord = unit([course[course.length - 1][0] - course[0][0], course[course.length - 1][1] - course[0][1]]);
    return { o: course[0], x: sized(chord), y: sized(outward(chord, turn)) };
  }
  const { at, direction } = pointAlong(course, handle.t);
  const along = unit(direction);
  return { o: at, x: sized(along), y: sized(outward(along, turn)) };
}

/** Which way is out of the figure at a handle: a side's outward normal, or straight out of a corner's angle. */
export function handleOutward(figure: FigureSpec, corners: Vec2[], name: string): Vec2 | undefined {
  const handle = parseHandle(name);
  if (!handle) return undefined;
  if (handle.side !== undefined) return handleFrame(figure, corners, `s${handle.side}@${handle.t ?? 0.5}`, 1)?.y;
  const frame = handleFrame(figure, corners, name, 1);
  return frame && unit([-(frame.x[0] + frame.y[0]), -(frame.x[1] + frame.y[1])]);
}

/** The point (u, v) of a frame, in the frame's parent units. */
export function inFrame(frame: Frame, [u, v]: Vec2): Vec2 {
  return [frame.o[0] + u * frame.x[0] + v * frame.y[0], frame.o[1] + u * frame.x[1] + v * frame.y[1]];
}

/** Carry a point drawn in one placing of a frame onto another placing of it. */
export function carryBetween(from: Frame, to: Frame): (point: Vec2) => Vec2 {
  const det = from.x[0] * from.y[1] - from.y[0] * from.x[1];
  if (Math.abs(det) < 1e-12) return (point) => [point[0] + to.o[0] - from.o[0], point[1] + to.o[1] - from.o[1]];
  return ([px, py]) => {
    const [dx, dy] = [px - from.o[0], py - from.o[1]];
    const u = (dx * from.y[1] - dy * from.y[0]) / det;
    const v = (from.x[0] * dy - from.x[1] * dx) / det;
    return inFrame(to, [u, v]);
  };
}

/** How far from its vertex an angle mark is drawn. */
export const ANGLE_REACH = 46;

/**
 * The arc an angle mark draws between two arms out of a vertex, at a fixed reach: its job is to name
 * the angle, not to measure the arms, so only a short arm pulls it in.
 */
export function angleArc(vertex: Vec2, from: Vec2, to: Vec2, reach: number): Vec2[] {
  const start = Math.atan2(from[1] - vertex[1], from[0] - vertex[0]);
  let sweep = Math.atan2(to[1] - vertex[1], to[0] - vertex[0]) - start;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  const shorter = Math.min(Math.hypot(from[0] - vertex[0], from[1] - vertex[1]), Math.hypot(to[0] - vertex[0], to[1] - vertex[1]));
  const r = Math.min(reach, Math.max(12, shorter * 0.6));
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) / Math.PI) * 32));
  return Array.from({ length: steps + 1 }, (_, k): Vec2 => {
    const a = start + (sweep * k) / steps;
    return [vertex[0] + Math.cos(a) * r, vertex[1] + Math.sin(a) * r];
  });
}
