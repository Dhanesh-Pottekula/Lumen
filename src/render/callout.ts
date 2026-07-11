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
import type { FrameCtx } from "./frame";
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
  maxWidth?: number; // wrap width in view units
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

const PAD = 9;

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
export function callout(frame: FrameCtx, o: CalloutOptions) {
  const ctx = frame.layer.ctx("annotation");
  const th = frame.theme;
  const fontPx = o.fontPx ?? 14;
  const container = o.container ?? "pill";
  const route = o.route ?? "straight";
  const color = o.color ?? th.palette.muted;
  const bg = o.bg ?? th.palette.surface;
  const ink = o.ink ?? th.palette.ink;
  const accent = o.accent ?? th.palette.accent;
  const leaderP = clamp01(o.leaderP ?? 1);
  const labelP = clamp01(o.labelP ?? 1);
  const maxWidth = o.maxWidth ?? 180;
  const side = resolveSide(o.side ?? "auto", o.target, frame.viewW, frame.viewH);

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

  const isText = container === "text";
  const lineH = fontPx * 1.32;
  const w = container === "badge" ? Math.max(fontPx + PAD * 2, textW + PAD * 2) : textW + PAD * 2;
  const h = container === "badge" ? Math.max(fontPx + PAD * 2, lineH + PAD) : lines.length * lineH + PAD * 2 - (lineH - fontPx);
  const [bcx, bcy] = boxCenter(side, o.target, o.offset ?? 90, w, h);
  const box = { x: bcx - w / 2, y: bcy - h / 2, w, h };

  // subject marker around the target (draws on with the leader)
  drawSubject(ctx, o.target, o.subject ?? "none", o.subjectR ?? 22, leaderP, accent);

  // leader line
  const start = boxEdgePoint(box, o.target);
  const path = leaderPath(start, o.target, route, o.curveBend ?? 34);
  if (path.length >= 2 && leaderP > 0) {
    strokeOn(ctx, path, leaderP, { color, width: 1.5, roughness: th.lineStyle.roughness, seed: o.seed ?? Math.round(o.target[0]), dash: o.dash });
    // endpoint markers, revealed as the leader lands
    const tip = pointAt(path, leaderP);
    drawMarker(ctx, [o.target[0], o.target[1]], tip.angle, o.targetMarker ?? "dot", accent, clamp01((leaderP - 0.85) / 0.15));
    drawMarker(ctx, start, tip.angle + Math.PI, o.labelMarker ?? "none", accent, leaderP);
  }

  // container + text
  if (labelP <= 0) return;
  ctx.save();
  ctx.globalAlpha *= labelP;
  const pop = 0.94 + 0.06 * labelP; // subtle pop-in
  ctx.translate(bcx, bcy);
  ctx.scale(pop, pop);
  ctx.translate(-bcx, -bcy);
  if (!isText) {
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
      const tailBase = boxEdgePoint(box, o.target);
      let nx = o.target[1] - tailBase[1];
      let ny = -(o.target[0] - tailBase[0]);
      const nl = Math.hypot(nx, ny) || 1;
      nx = (nx / nl) * 6;
      ny = (ny / nl) * 6;
      ctx.moveTo(tailBase[0] + nx, tailBase[1] + ny);
      ctx.lineTo(tailBase[0] - nx, tailBase[1] - ny);
      ctx.lineTo(tailBase[0] + (o.target[0] - tailBase[0]) * 0.28, tailBase[1] + (o.target[1] - tailBase[1]) * 0.28);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill();
    }
  }
  ctx.restore();

  // text lines (title bold, body typed)
  const typeP = clamp01(o.typeP ?? 1);
  let ty = box.y + PAD + fontPx * 0.85;
  lines.forEach((l, i) => {
    let text = l.text;
    if (!l.bold && typeP < 1) {
      const shown = Math.round(text.length * typeP);
      text = text.slice(0, shown);
    }
    const font = l.bold ? `700 ${fontPx}px ${th.type.body}` : `${fontPx}px ${th.type.body}`;
    fadeText(ctx, text, box.x + box.w / 2, ty + i * lineH, labelP, font, ink);
  });
}
