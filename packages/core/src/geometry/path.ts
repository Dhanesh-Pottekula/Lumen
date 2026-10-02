export type PathPoint = [number, number];

export type PathSeg =
  | { c: "M"; x: number; y: number }
  | { c: "L"; x: number; y: number }
  /** `mid` marks a piece inside one arc command: its end is not a point the path's d names. */
  | { c: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number; mid?: true }
  | { c: "Z" };

export interface PathIssue {
  index: number;
  command: string;
  message: string;
}

export interface ParsedPath {
  segs: PathSeg[];
  issue?: PathIssue;
}

export interface PathBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Subpath {
  points: PathPoint[];
  closed: boolean;
}

export interface PathSample {
  x: number;
  y: number;
  angle: number;
}

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const SEPARATOR = /[\s,]/;
const MAX_DEPTH = 16;

class PathSyntaxError extends Error {
  readonly index: number;
  readonly command: string;

  constructor(index: number, command: string, message: string) {
    super(message);
    this.index = index;
    this.command = command;
  }
}

interface Command {
  letter: string;
  args: number[];
  index: number;
}

function tokenize(d: string): Command[] {
  const commands: Command[] = [];
  let pos = 0;
  let letter = "";
  const skip = () => {
    while (pos < d.length && SEPARATOR.test(d[pos])) pos++;
  };
  const readNumber = (): number => {
    skip();
    const match = NUMBER.exec(d.slice(pos));
    if (!match) throw new PathSyntaxError(commands.length, letter, `'${letter}' expects a number at character ${pos}`);
    pos += match[0].length;
    return Number(match[0]);
  };
  const readFlag = (): number => {
    skip();
    const char = d[pos];
    if (char !== "0" && char !== "1") throw new PathSyntaxError(commands.length, letter, `'${letter}' expects a 0 or 1 flag at character ${pos}`);
    pos++;
    return char === "1" ? 1 : 0;
  };
  skip();
  while (pos < d.length) {
    const char = d[pos];
    if (/[A-Za-z]/.test(char)) {
      letter = char;
      pos++;
      if (!(letter.toUpperCase() in ARITY)) throw new PathSyntaxError(commands.length, letter, `'${letter}' is not a path command`);
    } else if (!letter) {
      throw new PathSyntaxError(0, "", "a path starts with a command letter, M");
    }
    const upper = letter.toUpperCase();
    const arity = ARITY[upper];
    if (arity === 0) {
      commands.push({ letter, args: [], index: commands.length });
      skip();
      continue;
    }
    const args =
      upper === "A"
        ? [readNumber(), readNumber(), readNumber(), readFlag(), readFlag(), readNumber(), readNumber()]
        : Array.from({ length: arity }, readNumber);
    commands.push({ letter, args, index: commands.length });
    if (upper === "M") letter = letter === "m" ? "l" : "L";
    skip();
  }
  return commands;
}

const reflect = (point: number, around: number) => 2 * around - point;

function arcAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return sign * Math.acos(Math.max(-1, Math.min(1, dot)));
}

export function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDegrees: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathSeg[] {
  if (x1 === x2 && y1 === y2) return [];
  if (rxIn === 0 || ryIn === 0) return [{ c: "L", x: x2, y: y2 }];
  const phi = (phiDegrees * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const denominator = rx * rx * yp * yp + ry * ry * xp * xp;
  const coefficient = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coefficient * rx * yp) / ry;
  const cyp = (-coefficient * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const start = arcAngle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let delta = arcAngle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / pieces;
  const handle = (4 / 3) * Math.tan(step / 4);
  const onEllipse = (ux: number, uy: number): PathPoint => [cx + rx * cos * ux - ry * sin * uy, cy + rx * sin * ux + ry * cos * uy];
  const segs: PathSeg[] = [];
  for (let i = 0; i < pieces; i++) {
    const a = start + i * step;
    const b = a + step;
    const [c1x, c1y] = onEllipse(Math.cos(a) - handle * Math.sin(a), Math.sin(a) + handle * Math.cos(a));
    const [c2x, c2y] = onEllipse(Math.cos(b) + handle * Math.sin(b), Math.sin(b) - handle * Math.cos(b));
    const [ex, ey] = i === pieces - 1 ? [x2, y2] : onEllipse(Math.cos(b), Math.sin(b));
    segs.push({ c: "C", x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: ex, y: ey, ...(i < pieces - 1 ? { mid: true as const } : {}) });
  }
  return segs;
}

function normalise(commands: Command[]): PathSeg[] {
  const segs: PathSeg[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastCubic: PathPoint | null = null;
  let lastQuad: PathPoint | null = null;
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    segs.push({ c: "C", x1, y1, x2, y2, x, y });
    lastCubic = [x2, y2];
    cx = x;
    cy = y;
  };
  const quad = (qx: number, qy: number, x: number, y: number) => {
    cubic(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
    lastQuad = [qx, qy];
  };
  for (const { letter, args, index } of commands) {
    const upper = letter.toUpperCase();
    const rel = letter !== upper;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    if (index === 0 && upper !== "M") throw new PathSyntaxError(0, letter, "a path starts with M");
    const keepCubic = upper === "C" || upper === "S";
    const keepQuad = upper === "Q" || upper === "T";
    const previousCubic: PathPoint | null = lastCubic;
    const previousQuad: PathPoint | null = lastQuad;
    lastCubic = null;
    lastQuad = null;
    switch (upper) {
      case "M":
        cx = sx = args[0] + ox;
        cy = sy = args[1] + oy;
        segs.push({ c: "M", x: cx, y: cy });
        break;
      case "L":
        cx = args[0] + ox;
        cy = args[1] + oy;
        segs.push({ c: "L", x: cx, y: cy });
        break;
      case "H":
        cx = args[0] + ox;
        segs.push({ c: "L", x: cx, y: cy });
        break;
      case "V":
        cy = args[0] + oy;
        segs.push({ c: "L", x: cx, y: cy });
        break;
      case "C":
        cubic(args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy, args[4] + ox, args[5] + oy);
        break;
      case "S": {
        const [c1x, c1y] = previousCubic ? [reflect(previousCubic[0], cx), reflect(previousCubic[1], cy)] : [cx, cy];
        cubic(c1x, c1y, args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy);
        break;
      }
      case "Q":
        quad(args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy);
        break;
      case "T": {
        const [qx, qy] = previousQuad ? [reflect(previousQuad[0], cx), reflect(previousQuad[1], cy)] : [cx, cy];
        quad(qx, qy, args[0] + ox, args[1] + oy);
        break;
      }
      case "A": {
        const x = args[5] + ox;
        const y = args[6] + oy;
        segs.push(...arcToCubics(cx, cy, args[0], args[1], args[2], args[3] === 1, args[4] === 1, x, y));
        cx = x;
        cy = y;
        break;
      }
      case "Z":
        segs.push({ c: "Z" });
        cx = sx;
        cy = sy;
        break;
    }
    if (!keepCubic) lastCubic = null;
    if (!keepQuad) lastQuad = null;
  }
  return segs;
}

export function parsePath(d: string): ParsedPath {
  try {
    const segs = normalise(tokenize(d.trim()));
    if (!segs.some((seg) => seg.c !== "M" && seg.c !== "Z")) {
      return { segs: [], issue: { index: 0, command: "M", message: "the path draws nothing: it needs at least one L, C, Q or A after its M" } };
    }
    return { segs };
  } catch (error) {
    if (error instanceof PathSyntaxError) return { segs: [], issue: { index: error.index, command: error.command, message: error.message } };
    throw error;
  }
}

export function mapPath(segs: PathSeg[], map: (x: number, y: number) => PathPoint): PathSeg[] {
  return segs.map((seg) => {
    if (seg.c === "Z") return seg;
    const [x, y] = map(seg.x, seg.y);
    if (seg.c !== "C") return { c: seg.c, x, y };
    const [x1, y1] = map(seg.x1, seg.y1);
    const [x2, y2] = map(seg.x2, seg.y2);
    return { c: "C", x1, y1, x2, y2, x, y, ...(seg.mid ? { mid: true as const } : {}) };
  });
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b];
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

export function pathBounds(segs: PathSeg[]): PathBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const seg of segs) {
    if (seg.c === "Z") {
      cx = sx;
      cy = sy;
      continue;
    }
    if (seg.c === "C") {
      for (const t of cubicExtrema(cx, seg.x1, seg.x2, seg.x)) if (t > 0 && t < 1) add(cubicAt(cx, seg.x1, seg.x2, seg.x, t), cubicAt(cy, seg.y1, seg.y2, seg.y, t));
      for (const t of cubicExtrema(cy, seg.y1, seg.y2, seg.y)) if (t > 0 && t < 1) add(cubicAt(cx, seg.x1, seg.x2, seg.x, t), cubicAt(cy, seg.y1, seg.y2, seg.y, t));
    }
    if (seg.c === "M") {
      sx = seg.x;
      sy = seg.y;
    }
    add(seg.x, seg.y);
    cx = seg.x;
    cy = seg.y;
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

function flattenCubic(out: PathPoint[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, tolerance: number, depth: number) {
  const ux = 3 * x1 - 2 * x0 - x3;
  const uy = 3 * y1 - 2 * y0 - y3;
  const vx = 3 * x2 - x0 - 2 * x3;
  const vy = 3 * y2 - y0 - 2 * y3;
  const flatness = Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy);
  if (depth >= MAX_DEPTH || flatness <= 16 * tolerance * tolerance) {
    out.push([x3, y3]);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const xa = (x01 + x12) / 2;
  const ya = (y01 + y12) / 2;
  const xb = (x12 + x23) / 2;
  const yb = (y12 + y23) / 2;
  const xm = (xa + xb) / 2;
  const ym = (ya + yb) / 2;
  flattenCubic(out, x0, y0, x01, y01, xa, ya, xm, ym, tolerance, depth + 1);
  flattenCubic(out, xm, ym, xb, yb, x23, y23, x3, y3, tolerance, depth + 1);
}

export function flattenPath(segs: PathSeg[], tolerance = 0.25): Subpath[] {
  const subpaths: Subpath[] = [];
  let current: Subpath | null = null;
  let cx = 0;
  let cy = 0;
  for (const seg of segs) {
    if (seg.c === "M") {
      current = { points: [[seg.x, seg.y]], closed: false };
      subpaths.push(current);
      cx = seg.x;
      cy = seg.y;
      continue;
    }
    if (!current) continue;
    if (seg.c === "Z") {
      const closing: Subpath = current;
      closing.closed = true;
      const [x, y] = closing.points[0];
      const last = closing.points[closing.points.length - 1];
      if (last[0] !== x || last[1] !== y) closing.points.push([x, y]);
      cx = x;
      cy = y;
      current = { points: [[x, y]], closed: false };
      subpaths.push(current);
      continue;
    }
    if (seg.c === "L") current.points.push([seg.x, seg.y]);
    else flattenCubic(current.points, cx, cy, seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y, tolerance, 0);
    cx = seg.x;
    cy = seg.y;
  }
  return subpaths.filter((sub) => sub.points.length > 1);
}

export function polylineLengths(points: PathPoint[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return lengths;
}

export function sampleAtLength(points: PathPoint[], lengths: number[], distance: number): PathSample {
  const total = lengths[lengths.length - 1];
  const s = Math.max(0, Math.min(total, distance));
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = lengths[hi] - lengths[lo] || 1;
  const t = (s - lengths[lo]) / span;
  const [ax, ay] = points[lo];
  const [bx, by] = points[hi];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, angle: Math.atan2(by - ay, bx - ax) };
}

export function pathToD(segs: PathSeg[]): string {
  const n = (value: number) => String(Math.round(value * 100) / 100);
  return segs
    .map((seg) => {
      if (seg.c === "Z") return "Z";
      if (seg.c === "C") return `C${n(seg.x1)} ${n(seg.y1)} ${n(seg.x2)} ${n(seg.y2)} ${n(seg.x)} ${n(seg.y)}`;
      return `${seg.c}${n(seg.x)} ${n(seg.y)}`;
    })
    .join("");
}

export function fitPath(segs: PathSeg[], box: PathBox, frame: PathSeg[] = segs): PathSeg[] {
  const bounds = pathBounds(frame);
  if (!bounds) return segs;
  const scale = Math.min(bounds.w > 0 ? box.w / bounds.w : Infinity, bounds.h > 0 ? box.h / bounds.h : Infinity);
  if (!Number.isFinite(scale)) return segs;
  const ox = box.x + (box.w - bounds.w * scale) / 2 - bounds.x * scale;
  const oy = box.y + (box.h - bounds.h * scale) / 2 - bounds.y * scale;
  return mapPath(segs, (x, y) => [ox + x * scale, oy + y * scale]);
}

/** A smooth route through every point in order (a Catmull-Rom spline, as cubics). */
export function throughPath(points: PathPoint[]): PathSeg[] {
  if (points.length === 0) return [];
  const segs: PathSeg[] = [{ c: "M", x: points[0][0], y: points[0][1] }];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    segs.push({
      c: "C",
      x1: p1[0] + (p2[0] - p0[0]) / 6,
      y1: p1[1] + (p2[1] - p0[1]) / 6,
      x2: p2[0] - (p3[0] - p1[0]) / 6,
      y2: p2[1] - (p3[1] - p1[1]) / 6,
      x: p2[0],
      y: p2[1],
    });
  }
  return segs;
}

export const CHORD_FRAME = 1000;

export function layPathBetween(segs: PathSeg[], from: PathPoint, to: PathPoint): PathSeg[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const scale = Math.hypot(dx, dy) / CHORD_FRAME;
  const cos = dx / (Math.hypot(dx, dy) || 1);
  const sin = dy / (Math.hypot(dx, dy) || 1);
  return mapPath(segs, (x, y) => [from[0] + scale * (x * cos - y * sin), from[1] + scale * (x * sin + y * cos)]);
}
