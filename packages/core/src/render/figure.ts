/**
 * figure — a small display list of drawing operations, painted about a centre and built up by one
 * progress `p`. The engine's data charts, diagrams, cards and physics marks are laid out as figures
 * once (pure geometry, no canvas), then drawn here: strokes draw on, bars grow from their baseline,
 * dots pop, writing fades in. Each op owns a window of `p`, so one figure builds in the order it was
 * laid out. Deterministic and seekable: nothing here reads a clock.
 */
import { drawIcon, iconNames, type IconName } from "./icons";
import { drawMath, measureMath } from "./mathtext";
import { clamp01, easeOutBack, easeOutCubic } from "./motion";
import { pathArrowheads } from "./strokeVerbs";
import { strokeOn, type Pt } from "./strokes";

/** No writing a figure draws is smaller than this, in view units. */
export const FIGURE_MIN_TEXT = 18;
/** The contrast every piece of figure writing keeps against what it is printed on. */
export const FIGURE_MIN_CONTRAST = 4.5;

interface Timed {
  /** The share of the figure's build this op draws in, `[start, end]` of 0–1. */
  t?: [number, number];
}

export type FigureOp = Timed &
  (
    | {
        op: "line";
        pts: Pt[];
        /** Shapes the line passes through as it builds, instead of drawing on: a secant turning into a tangent. */
        frames?: Pt[][];
        color: string;
        width?: number;
        dash?: number[];
        arrow?: "start" | "end" | "both";
        fill?: string;
        fillAlpha?: number;
      }
    | {
        op: "rect";
        x: number;
        y: number;
        w: number;
        h: number;
        fill?: string;
        stroke?: string;
        width?: number;
        radius?: number;
        dash?: number[];
        alpha?: number;
        /** The edge a bar grows out of; a plain box fades in. */
        grow?: "up" | "down" | "left" | "right";
      }
    | { op: "dot"; x: number; y: number; r: number; fill: string; stroke?: string; frames?: Pt[] }
    | {
        op: "text";
        x: number;
        y: number;
        text: string;
        size: number;
        color: string;
        weight?: number;
        align?: "left" | "center" | "right";
        /** The colour the writing is printed on, when not the page. */
        under?: string;
        /** A card of this colour set under the writing, so it reads over whatever the figure lies on. */
        plate?: string;
        math?: boolean;
        italic?: boolean;
      }
    | { op: "icon"; name: string; x: number; y: number; size: number; color: string; filled?: boolean; width?: number }
    | { op: "area"; pts: Pt[]; fill: string; alpha?: number }
  );

export interface FigurePaintOptions {
  /** The page colour, for writing printed straight on it. */
  bg: string;
  font: string;
  /** How far the whole figure is faded back, 0 (not at all) to 1. */
  dim?: number;
}

const opProgress = (op: Timed, p: number): number => {
  const [a, b] = op.t ?? [0, 1];
  return b - a <= 1e-6 ? (p >= a ? 1 : 0) : clamp01((p - a) / (b - a));
};

function rgb(color: string): [number, number, number] | undefined {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return undefined;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const ca = rgb(a);
  const cb = rgb(b);
  if (!ca || !cb) return 21;
  const [la, lb] = [luminance(ca), luminance(cb)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The writing colour nearest `color` that still reads on `under`: pulled toward white on a dark
 * ground, black on a light one, just far enough. A series colour that already reads stays itself.
 */
export function readableOn(color: string, under: string): string {
  const c = rgb(color);
  const u = rgb(under);
  if (!c || !u || contrastRatio(color, under) >= FIGURE_MIN_CONTRAST) return color;
  const target = luminance(u) > 0.18 ? 0 : 255;
  for (let k = 1; k <= 10; k++) {
    const mix = c.map((v) => Math.round(v + (target - v) * (k / 10))) as [number, number, number];
    const hex = `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    if (contrastRatio(hex, under) >= FIGURE_MIN_CONTRAST) return hex;
  }
  return target === 0 ? "#000000" : "#ffffff";
}

function framesAt(frames: Pt[][], q: number): Pt[] {
  if (frames.length === 1) return frames[0];
  const at = q * (frames.length - 1);
  const i = Math.min(frames.length - 2, Math.floor(at));
  const f = at - i;
  return frames[i].map((point, k): Pt => {
    const next = frames[i + 1][k] ?? point;
    return [point[0] + (next[0] - point[0]) * f, point[1] + (next[1] - point[1]) * f];
  });
}

function trace(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
}

function paintOp(ctx: CanvasRenderingContext2D, op: FigureOp, q: number, o: FigurePaintOptions): void {
  switch (op.op) {
    case "line": {
      if (op.frames?.length) {
        const pts = framesAt(op.frames, q);
        ctx.save();
        ctx.globalAlpha *= clamp01(q * 6);
        strokeOn(ctx, pts, 1, { color: op.color, width: op.width ?? 2, dash: op.dash });
        ctx.restore();
        return;
      }
      if (op.fill) {
        ctx.save();
        ctx.globalAlpha *= (op.fillAlpha ?? 1) * clamp01((q - 0.5) / 0.5);
        ctx.fillStyle = op.fill;
        trace(ctx, op.pts);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      if (op.color === "none") return;
      strokeOn(ctx, op.pts, q, { color: op.color, width: op.width ?? 2, dash: op.dash });
      if (op.arrow) pathArrowheads(ctx, op.pts, q, op.arrow, { color: op.color, width: op.width ?? 2 });
      return;
    }
    case "rect": {
      const k = easeOutCubic(q);
      let { x, y, w, h } = op;
      if (op.grow === "up") [y, h] = [y + h * (1 - k), h * k];
      else if (op.grow === "down") h *= k;
      else if (op.grow === "right") w *= k;
      else if (op.grow === "left") [x, w] = [x + w * (1 - k), w * k];
      if (w <= 0.01 || h <= 0.01) return;
      ctx.save();
      ctx.globalAlpha *= (op.alpha ?? 1) * (op.grow ? 1 : q);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, Math.min(op.radius ?? 0, w / 2, h / 2));
      if (op.fill) {
        ctx.fillStyle = op.fill;
        ctx.fill();
      }
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = op.width ?? 2;
        if (op.dash) ctx.setLineDash(op.dash);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case "dot": {
      if (q <= 0) return;
      const [x, y] = op.frames?.length ? framesAt(op.frames.map((pt) => [pt]), q)[0] : [op.x, op.y];
      const r = op.frames?.length ? op.r * clamp01(q * 6) : op.r * Math.max(0, easeOutBack(q));
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
      ctx.fillStyle = op.fill;
      ctx.fill();
      if (op.stroke) {
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case "text": {
      if (q <= 0) return;
      const size = Math.max(FIGURE_MIN_TEXT, op.size);
      const color = readableOn(op.color, op.plate ?? op.under ?? o.bg);
      ctx.save();
      ctx.globalAlpha *= q;
      if (op.plate) {
        ctx.font = `${op.weight ?? 500} ${size}px ${o.font}`;
        const [w, h] = op.math ? (({ w, h }) => [w, h])(measureMath(op.text, size)) : [ctx.measureText(op.text).width, size];
        const left = op.align === "left" ? op.x : op.align === "right" ? op.x - w : op.x - w / 2;
        ctx.fillStyle = op.plate;
        ctx.globalAlpha *= 0.88;
        ctx.beginPath();
        ctx.roundRect(left - 6, op.y - h / 2 - 4, w + 12, h + 8, 6);
        ctx.fill();
        ctx.globalAlpha /= 0.88;
      }
      if (op.math) {
        drawMath(ctx, op.text, op.x, op.y, { size, color, align: op.align ?? "center" });
      } else {
        ctx.font = `${op.italic ? "italic " : ""}${op.weight ?? 500} ${size}px ${o.font}`;
        ctx.fillStyle = color;
        ctx.textAlign = op.align ?? "center";
        ctx.textBaseline = "middle";
        ctx.fillText(op.text, op.x, op.y + (1 - q) * 4);
      }
      ctx.restore();
      return;
    }
    case "icon": {
      if (q <= 0 || !iconNames.includes(op.name as IconName)) return;
      drawIcon(ctx, op.name as IconName, op.x, op.y, op.size * Math.max(0, easeOutBack(q)), { color: op.color, filled: op.filled ?? true, width: op.width });
      return;
    }
    case "area": {
      if (q <= 0 || op.pts.length < 3) return;
      const xs = op.pts.map(([x]) => x);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left - 1, -1e4, (right - left) * q + 2, 2e4);
      ctx.clip();
      ctx.globalAlpha *= op.alpha ?? 1;
      ctx.fillStyle = op.fill;
      trace(ctx, op.pts);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
  }
}

/** Paint a figure about (cx, cy) with its build at `p` (0–1). */
export function paintFigure(ctx: CanvasRenderingContext2D, ops: FigureOp[], cx: number, cy: number, p: number, o: FigurePaintOptions): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (o.dim) ctx.globalAlpha *= 1 - 0.6 * clamp01(o.dim);
  for (const op of ops) {
    const q = opProgress(op, clamp01(p));
    if (q > 0) paintOp(ctx, op, q, o);
  }
  ctx.restore();
}

/** Width writing takes in a figure, for layout; the same estimate the rest of the engine measures by. */
export function figureTextWidth(text: string, size: number, math = false): number {
  if (math) return measureMath(text, size).w;
  return text.length * size * 0.6 + size * 0.4;
}

/** Break writing to a width at a size, whole words only. */
export function figureWrap(text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word;
    if (line && figureTextWidth(longer, size) > width) {
      lines.push(line);
      line = word;
    } else line = longer;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Every op moved by (dx, dy): a piece laid out on its figure's grid, re-centred on itself. */
export function shiftOps(ops: FigureOp[], dx: number, dy: number): FigureOp[] {
  const move = ([x, y]: Pt): Pt => [x + dx, y + dy];
  return ops.map((op): FigureOp => {
    switch (op.op) {
      case "line":
        return { ...op, pts: op.pts.map(move), frames: op.frames?.map((frame) => frame.map(move)) };
      case "area":
        return { ...op, pts: op.pts.map(move) };
      case "dot":
        return { ...op, x: op.x + dx, y: op.y + dy, frames: op.frames?.map(move) };
      default:
        return { ...op, x: op.x + dx, y: op.y + dy };
    }
  });
}

// ── Plans: what a figure-drawn object lays out, before any theme or clock ─────────────────────────

/** A box in a figure's own frame: x and y from the figure's centre, y down. */
export interface FigureBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One separately revealed piece of a figure: a diagram's node, a chart's bar, a line of working.
 * Its box and ops are in the figure's frame. `order` is where it comes in the figure's own build;
 * `follows` names the piece it enters with when that one is revealed on a beat of its own (an arrow
 * with the node it points at); `long` plays it across its whole beat, as a marker sliding along a graph.
 */
export interface FigurePiece {
  name: string;
  box: FigureBox;
  ops: FigureOp[];
  order: number;
  follows?: string;
  long?: boolean;
  /** Fades back once the next such piece enters: earlier lines of working stay, dimmed. */
  dims?: boolean;
}

export interface FigurePlan {
  /** The figure's own frame — axes, dividers, an empty grid — drawn when it first appears. */
  ops: FigureOp[];
  pieces: FigurePiece[];
  /** For a chart the chart painter still draws: the box its plot is drawn in. */
  plot?: FigureBox;
}

export interface FigurePalette {
  bg: string;
  surface: string;
  ink: string;
  accent: string;
  second: string;
  muted: string;
  danger: string;
}

/** At most four series colours, in the order a figure hands them out; red is kept for wrong. */
export function seriesColor(palette: FigurePalette, index: number): string {
  return [palette.accent, palette.second, palette.ink, palette.muted][index % 4];
}

/** Lines of writing stacked from `top`, each `size * 1.25` tall, as text ops. */
export function textBlock(
  lines: string[],
  x: number,
  top: number,
  size: number,
  color: string,
  opts: { align?: "left" | "center" | "right"; weight?: number; under?: string; italic?: boolean; t?: [number, number] } = {},
): FigureOp[] {
  const step = size * 1.25;
  return lines.map(
    (text, i): FigureOp => ({ op: "text", text, x, y: top + step * (i + 0.5), size, color, align: opts.align, weight: opts.weight, under: opts.under, italic: opts.italic, t: opts.t }),
  );
}

export const lineHeight = (size: number): number => size * 1.25;
