/**
 * callout — the annotation layer: labels that animate in and point at a coordinate with a leader line
 * that draws on. Themed, deterministic, seekable. One `callout(frame, opts)` covers the whole surface:
 * container styles, 8-way placement (+ auto), leader routing (straight/elbow/curve), endpoint markers,
 * subject markers around the target, multi-line wrapping, and staged draw-on / label / typewriter.
 *
 * Renders on the `annotation` layer so it always sits above content. Any exotic variant is a
 * parameterization here rather than a new function.
 */
import { clamp01, fadeText } from "../slides/anim";
import type { FrameCtx, LayerName } from "./frame";
import { pointAt, type Pt, strokeOn } from "./strokes";
import { arrowhead } from "./strokeVerbs";

export type Side = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "auto";
export type LeaderRoute = "none" | "straight" | "elbow" | "curve";
export type EndMarker = "none" | "dot" | "ring" | "arrow" | "crosshair";
export type Container = "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
export type Subject = "none" | "circle" | "rect" | "bracket";

export interface CalloutOptions {
  target: [number, number];
  text?: string;
  title?: string; // optional bold first line
  side?: Side;
  offset?: number; // gap from target to the box (default 90)
  container?: Container;
  route?: LeaderRoute;
  targetMarker?: EndMarker; // marker where the leader meets the target
  labelMarker?: EndMarker; // marker where the leader meets the box
  subject?: Subject; // marker drawn AROUND the target
  subjectR?: number;
  fontPx?: number;
  avoid?: Rect[]; // writing already on screen, which the label is never set over
  within?: [number, number][]; // the named part's border: a label that fits inside it is written there, with no leader
  near?: Rect; // the named thing's box: a label that is not written inside it is set right beside it
  along?: Pt[]; // the stroke it names: the label is set beside the stroke's middle, never across it
  clear?: Pt[][]; // closed outlines the label is never set over: the figure whose corner or side it names
  maxWidth?: number; // wrap width in view units
  spot?: [number, number]; // the box centre, decided by the caller: no search is made
  point?: [number, number]; // where the leader ends on the target, when not the target point itself
  leader?: boolean; // false: written on the target with no line (default: a line unless inside it)
  subdued?: boolean; // blended onto what it names: no plate, no markers, no pop, a thin quiet line
  layer?: LayerName; // the layer it is painted on (default annotation, above everything it names)
  curveBend?: number; // perpendicular control offset for route "curve"
  // staging (all 0..1, derive from t)
  leaderP?: number; // leader + subject draw-on
  labelP?: number; // box + text fade/pop
  typeP?: number; // optional typewriter over the body (defaults to fully typed)
  // style overrides (else themed)
  color?: string; // leader + border
  bg?: string; // container fill
  ink?: string; // text
  accent?: string; // markers
  dash?: number[];
  seed?: number;
}

export const PAD = 9;
// The margin a name carried with its thing keeps from the screen's edge.
const SPOT_INSET = 8;
export const PLAIN_PAD = 2;
export const WRAP_WIDTH = 180;

/** How wide a note's lines run before they break: wider for larger writing, so a name keeps to a line or two. */
export function wrapWidth(fontPx: number): number {
  return Math.max(WRAP_WIDTH, fontPx * 9);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Pure-ish box layout: approximate width from text length (for callers that need geometry without a ctx). */
export function labelBox(text: string, cx: number, cy: number, fontPx: number) {
  const w = text.length * fontPx * 0.55 + PAD * 2;
  const h = fontPx + PAD * 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function resolveSide(side: Side, target: [number, number], viewW: number, viewH: number): Exclude<Side, "auto"> {
  if (side !== "auto") return side;
  const [tx, ty] = target;
  const left = tx < viewW * 0.5;
  const top = ty < viewH * 0.4;
  const bottom = ty > viewH * 0.6;
  if (top) return left ? "se" : "sw";
  if (bottom) return left ? "ne" : "nw";
  return left ? "e" : "w";
}

function boxCenter(side: Exclude<Side, "auto">, target: [number, number], offset: number, w: number, h: number): [number, number] {
  const [tx, ty] = target;
  const dx = offset + w / 2;
  const dy = offset + h / 2;
  switch (side) {
    case "e":
      return [tx + dx, ty];
    case "w":
      return [tx - dx, ty];
    case "n":
      return [tx, ty - dy];
    case "s":
      return [tx, ty + dy];
    case "ne":
      return [tx + dx, ty - dy];
    case "nw":
      return [tx - dx, ty - dy];
    case "se":
      return [tx + dx, ty + dy];
    case "sw":
      return [tx - dx, ty + dy];
  }
}

/** Intersection of the segment from the box center toward `to` with the box rectangle (the leader start). */
function boxEdgePoint(box: { x: number; y: number; w: number; h: number }, to: [number, number]): Pt {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let dx = to[0] - cx;
  let dy = to[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = box.w / 2;
  const hh = box.h / 2;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

/** A thin straight line from the edge of a box of writing to the point on the thing it names. */
export function pointerLine(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, point: [number, number], alpha: number, color: string) {
  if (alpha <= 0) return;
  const start = boxEdgePoint(box, point);
  ctx.save();
  ctx.globalAlpha *= alpha;
  strokeOn(ctx, [start, [point[0], point[1]]], 1, { color, width: 1 });
  ctx.restore();
}

function leaderPath(start: Pt, target: [number, number], route: LeaderRoute, bend: number): Pt[] {
  if (route === "none") return [];
  if (route === "elbow") {
    // horizontal-first if the run is wider than tall, else vertical-first
    const wide = Math.abs(target[0] - start[0]) > Math.abs(target[1] - start[1]);
    const corner: Pt = wide ? [target[0], start[1]] : [start[0], target[1]];
    return [start, corner, [target[0], target[1]]];
  }
  if (route === "curve") {
    const mx = (start[0] + target[0]) / 2;
    const my = (start[1] + target[1]) / 2;
    let nx = -(target[1] - start[1]);
    let ny = target[0] - start[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const c: Pt = [mx + nx * bend, my + ny * bend];
    const out: Pt[] = [];
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const x = (1 - u) * (1 - u) * start[0] + 2 * (1 - u) * u * c[0] + u * u * target[0];
      const y = (1 - u) * (1 - u) * start[1] + 2 * (1 - u) * u * c[1] + u * u * target[1];
      out.push([x, y]);
    }
    return out;
  }
  return [start, [target[0], target[1]]];
}

function drawMarker(ctx: CanvasRenderingContext2D, at: Pt, angle: number, kind: EndMarker, color: string, alpha: number) {
  if (kind === "none" || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  if (kind === "dot") {
    ctx.beginPath();
    ctx.arc(at[0], at[1], 3.4, 0, 7);
    ctx.fill();
  } else if (kind === "ring") {
    ctx.beginPath();
    ctx.arc(at[0], at[1], 5, 0, 7);
    ctx.stroke();
  } else if (kind === "crosshair") {
    ctx.beginPath();
    ctx.moveTo(at[0] - 6, at[1]);
    ctx.lineTo(at[0] + 6, at[1]);
    ctx.moveTo(at[0], at[1] - 6);
    ctx.lineTo(at[0], at[1] + 6);
    ctx.stroke();
  } else if (kind === "arrow") {
    arrowhead(ctx, { x: at[0], y: at[1], angle }, { size: 10, color, alpha: 1 });
  }
  ctx.restore();
}

function drawSubject(ctx: CanvasRenderingContext2D, target: [number, number], subject: Subject, r: number, p: number, color: string) {
  if (subject === "none" || p <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha *= clamp01(p < 1 ? p : 1);
  if (subject === "circle") {
    ctx.beginPath();
    ctx.arc(target[0], target[1], r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(p));
    ctx.stroke();
  } else if (subject === "rect") {
    ctx.strokeRect(target[0] - r, target[1] - r, r * 2, r * 2);
  } else if (subject === "bracket") {
    const L = r * 0.6;
    const corner = (cx: number, cy: number, dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * L, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * L);
      ctx.stroke();
    };
    corner(target[0] - r, target[1] - r, 1, 1);
    corner(target[0] + r, target[1] - r, -1, 1);
    corner(target[0] - r, target[1] + r, 1, -1);
    corner(target[0] + r, target[1] + r, -1, -1);
  }
  ctx.restore();
}

/** Draw an animated callout on the annotation layer. */

type Rect = { x: number; y: number; w: number; h: number };

const SIDES: Exclude<Side, "auto">[] = ["e", "w", "n", "s", "ne", "nw", "se", "sw"];

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * A box for this label that no label already placed this frame is sitting in.
 *
 * `resolveSide` is a pure function of where the target sits in the frame, so two targets in the
 * same region resolve to the same side and the same offset and their boxes land on top of each
 * other — two labels printed as one unreadable block. Callouts are directives rather than objects,
 * so the layout collision pass never sees them and nothing else was going to separate them.
 *
 * The preferred side is tried first and kept whenever it is free, so a scene that never collides
 * draws exactly as it did. Only a label with nowhere else to go returns to its first choice and
 * overlaps.
 */
export function insidePolygon(point: [number, number], polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Where a label fits wholly inside the part it names, or undefined when it does not: on a map every
 * country touches the next, so a label stepping round the other parts was pushed off the map entirely.
 */
export function insideSpot(within: [number, number][], target: [number, number], w: number, h: number, taken: Rect[]): [number, number] | undefined {
  if (within.length < 3) return undefined;
  const centroid: [number, number] = [within.reduce((sum, p) => sum + p[0], 0) / within.length, within.reduce((sum, p) => sum + p[1], 0) / within.length];
  // Off its middle, too: France's name did not fit across the dent of Brittany at its centroid.
  const [xs, ys] = [within.map(([x]) => x), within.map(([, y]) => y)];
  const step = Math.max(4, h / 2);
  const grid: [number, number][] = [];
  for (let y = Math.min(...ys) + h / 2; y <= Math.max(...ys) - h / 2; y += step) for (let x = Math.min(...xs) + w / 2; x <= Math.max(...xs) - w / 2; x += step) grid.push([x, y]);
  grid.sort((a, b) => Math.hypot(a[0] - centroid[0], a[1] - centroid[1]) - Math.hypot(b[0] - centroid[0], b[1] - centroid[1]));
  for (const [cx, cy] of [target, centroid, ...grid]) {
    const box = { x: cx - w / 2 - 4, y: cy - h / 2 - 4, w: w + 8, h: h + 8 };
    const corners: [number, number][] = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h], [cx, cy]];
    if (corners.every((corner) => insidePolygon(corner, within)) && !taken.some((one) => overlaps(one, box))) return [cx, cy];
  }
  return undefined;
}

/** A box centre just outside `near` on `side`, `gap` clear of it and level with the target. */
function besideBox(side: Exclude<Side, "auto">, near: Rect, target: [number, number], gap: number, w: number, h: number): [number, number] {
  const east = near.x + near.w + gap + w / 2;
  const west = near.x - gap - w / 2;
  const north = near.y - gap - h / 2;
  const south = near.y + near.h + gap + h / 2;
  const x = side.includes("e") ? east : side.includes("w") ? west : target[0];
  const y = side.includes("n") ? north : side.includes("s") ? south : target[1];
  return [x, y];
}

/** Whether a stroke runs through a box: each segment walked in steps finer than any label. */
export function crosses(stroke: Pt[], box: Rect): boolean {
  for (let i = 1; i < stroke.length; i++) {
    const [[x0, y0], [x1, y1]] = [stroke[i - 1], stroke[i]];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
    for (let k = 0; k <= steps; k++) {
      const [x, y] = [x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps];
      if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h) return true;
    }
  }
  return false;
}

// Beside a named thing the nearest free spot wins, so a part's name sits on its edge; a label measured
// from the target's centre at a fixed reach landed a limb away from a small part.
const BESIDE_GAPS = Array.from({ length: 13 }, (_, ring) => 6 + ring * 12);

/** Box centres all round `near`, ring after ring `gaps` out from it, nearest to the target first. */
export function besideSpots(near: Rect, target: [number, number], w: number, h: number, gaps: number[] = BESIDE_GAPS, order: Exclude<Side, "auto">[] = SIDES): [number, number][] {
  const reach = ([x, y]: [number, number]) => Math.hypot(x - target[0], y - target[1]);
  return gaps.flatMap((gap) => order.map((candidate) => besideBox(candidate, near, target, gap, w, h))).sort((one, other) => reach(one) - reach(other));
}

/** Whether any of a box lies inside a closed outline or on its border. */
export function polygonMeetsBox(polygon: [number, number][], box: Rect): boolean {
  const corners: [number, number][] = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h], [box.x + box.w / 2, box.y + box.h / 2]];
  return corners.some((corner) => insidePolygon(corner, polygon)) || crosses([...polygon, polygon[0]], box);
}

function freeBox(
  taken: Rect[],
  side: Exclude<Side, "auto">,
  target: [number, number],
  offset: number,
  w: number,
  h: number,
  viewW: number,
  viewH: number,
  near?: Rect,
  along?: Pt[],
  clear: Pt[][] = [],
): [number, number] {
  const order = [side, ...SIDES.filter((one) => one !== side)];
  const rings = [offset, offset + 46, offset + 92];
  let offFrame: [number, number] | undefined;
  const hugged = along ? { x: target[0], y: target[1], w: 0, h: 0 } : near;
  const spots = hugged ? besideSpots(hugged, target, w, h, BESIDE_GAPS, order) : rings.flatMap((ring) => order.map((candidate) => boxCenter(candidate, target, ring, w, h)));

  for (const [cx, cy] of spots) {
    const box = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (taken.some((one) => overlaps(one, box))) continue;
    if (along && crosses(along, box)) continue;
    if (clear.some((outline) => polygonMeetsBox(outline, box))) continue;
    const inside =
      box.x >= 0 && box.y >= 0 && box.x + w <= viewW && box.y + h <= viewH;
    if (inside) return [cx, cy];
    offFrame = offFrame ?? [cx, cy];
  }
  // Crowded all round, a name beside its thing is better over a neighbour than cut off at the frame.
  const framed = hugged && spots.find(([cx, cy]) => cx - w / 2 >= 0 && cy - h / 2 >= 0 && cx + w / 2 <= viewW && cy + h / 2 <= viewH);
  return framed || offFrame || boxCenter(side, target, offset, w, h);
}


/** Label boxes already placed in this frame. Keyed on the frame, so it empties when the frame does. */
const PLACED = new WeakMap<FrameCtx, Rect[]>();

function calloutBoxes(frame: FrameCtx): Rect[] {
  const existing = PLACED.get(frame);
  if (existing) return existing;
  const fresh: Rect[] = [];
  PLACED.set(frame, fresh);
  return fresh;
}

export function callout(frame: FrameCtx, o: CalloutOptions) {
  const middle = o.along && o.along.length > 1 ? pointAt(o.along, 0.5) : undefined;
  const target: [number, number] = middle ? [middle.x, middle.y] : o.target;
  const ctx = frame.layer.ctx(o.layer ?? "annotation");
  const th = frame.theme;
  const fontPx = o.fontPx ?? 18;
  const container = o.container ?? "pill";
  const route = o.route ?? "straight";
  const color = o.color ?? th.palette.muted;
  const bg = o.bg ?? th.palette.surface;
  const ink = o.ink ?? th.palette.ink;
  const accent = o.accent ?? th.palette.accent;
  const leaderP = clamp01(o.leaderP ?? 1);
  const labelP = clamp01(o.labelP ?? 1);
  const maxWidth = o.maxWidth ?? wrapWidth(fontPx);
  const side = resolveSide(o.side ?? "auto", target, frame.viewW, frame.viewH);

  // measure text (title + wrapped body)
  ctx.save();
  const bodyFont = `${fontPx}px ${th.type.body}`;
  const titleFont = `700 ${fontPx}px ${th.type.body}`;
  ctx.font = bodyFont;
  const bodyLines = o.text ? wrap(ctx, o.text, maxWidth) : [];
  const lines: { text: string; bold: boolean }[] = [];
  if (o.title) lines.push({ text: o.title, bold: true });
  for (const l of bodyLines) lines.push({ text: l, bold: false });
  let textW = 0;
  for (const l of lines) {
    ctx.font = l.bold ? titleFont : bodyFont;
    textW = Math.max(textW, ctx.measureText(l.text).width);
  }
  ctx.restore();

  const isText = container === "text" || o.subdued === true;
  const lineH = fontPx * 1.32;
  // Words with no plate are measured as the words alone: padded like a plate, a name that fits was refused.
  const pad = isText ? PLAIN_PAD : PAD;
  const w = container === "badge" ? Math.max(fontPx + PAD * 2, textW + PAD * 2) : textW + pad * 2;
  const h = container === "badge" ? Math.max(fontPx + PAD * 2, lineH + PAD) : lines.length * lineH + pad * 2 - (lineH - fontPx);
  const placed = calloutBoxes(frame);
  const spot = o.spot ?? (o.within ? insideSpot(o.within, target, w, h, placed) : undefined);
  // A name laid out for its thing at rest rides with it; carried toward an edge it stops at the edge, whole, its pointer reaching on.
  const kept: [number, number] | undefined = spot && [
    Math.max(SPOT_INSET + w / 2, Math.min(frame.viewW - SPOT_INSET - w / 2, spot[0])),
    Math.max(SPOT_INSET + h / 2, Math.min(frame.viewH - SPOT_INSET - h / 2, spot[1])),
  ];
  const [bcx, bcy] = kept ?? freeBox([...placed, ...(o.avoid ?? [])], side, target, o.offset ?? 90, w, h, frame.viewW, frame.viewH, o.near, o.along, o.clear);
  const box = { x: bcx - w / 2, y: bcy - h / 2, w, h };
  placed.push(box);

  // subject marker around the target (draws on with the leader)
  drawSubject(ctx, target, o.subject ?? "none", o.subjectR ?? 22, leaderP, accent);

  // leader line
  const end = o.point ?? target;
  const start = boxEdgePoint(box, end);
  const path = (o.leader ?? !spot) ? leaderPath(start, end, route, o.curveBend ?? 34) : [];
  if (path.length >= 2 && leaderP > 0) {
    strokeOn(ctx, path, leaderP, { color, width: o.subdued ? 1 : 1.5, roughness: th.lineStyle.roughness, seed: o.seed ?? Math.round(target[0]), dash: o.dash });
    // endpoint markers, revealed as the leader lands
    const tip = pointAt(path, leaderP);
    if (!o.subdued) {
      drawMarker(ctx, [end[0], end[1]], tip.angle, o.targetMarker ?? "none", accent, clamp01((leaderP - 0.85) / 0.15));
      drawMarker(ctx, start, tip.angle + Math.PI, o.labelMarker ?? "none", accent, leaderP);
    }
  }

  // container + text
  if (labelP <= 0) return;
  ctx.save();
  ctx.globalAlpha *= labelP;
  const pop = o.subdued ? 1 : 0.94 + 0.06 * labelP; // subtle pop-in
  ctx.translate(bcx, bcy);
  ctx.scale(pop, pop);
  ctx.translate(-bcx, -bcy);
  if (!isText && !o.subdued) {
    ctx.fillStyle = bg;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const radius = container === "rect" ? 4 : container === "tag" ? 3 : Math.min(box.h / 2, 14);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, radius);
    ctx.fill();
    ctx.stroke();
    if (container === "bubble") {
      // a little pointer tail toward the target
      ctx.beginPath();
      const tailBase = boxEdgePoint(box, target);
      let nx = target[1] - tailBase[1];
      let ny = -(target[0] - tailBase[0]);
      const nl = Math.hypot(nx, ny) || 1;
      nx = (nx / nl) * 6;
      ny = (ny / nl) * 6;
      ctx.moveTo(tailBase[0] + nx, tailBase[1] + ny);
      ctx.lineTo(tailBase[0] - nx, tailBase[1] - ny);
      ctx.lineTo(tailBase[0] + (target[0] - tailBase[0]) * 0.28, tailBase[1] + (target[1] - tailBase[1]) * 0.28);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill();
    }
  }
  ctx.restore();

  // text lines (title bold, body typed)
  const typeP = clamp01(o.typeP ?? 1);
  let ty = box.y + pad + fontPx * 0.85;
  lines.forEach((l, i) => {
    let text = l.text;
    if (!l.bold && typeP < 1) {
      const shown = Math.round(text.length * typeP);
      text = text.slice(0, shown);
    }
    const font = l.bold ? `700 ${fontPx}px ${th.type.body}` : `${fontPx}px ${th.type.body}`;
    fadeText(ctx, text, box.x + box.w / 2, ty + i * lineH, labelP, font, ink, "center", isText && !o.subdued ? th.palette.bg : undefined);
  });
}
