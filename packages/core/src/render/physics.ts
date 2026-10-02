/**
 * physics — the working marks of maths and physics drawn as figures: forces as arrows out of one
 * point with lengths set by their sizes (a free-body diagram), split into components along a slope,
 * and a worked solution written line by line, the operation that led to each line in the margin.
 * Pure geometry: figure plans.
 */
import { measureMath } from "./mathtext";
import {
  figureTextWidth,
  seriesColor,
  type FigureBox,
  type FigureOp,
  type FigurePalette,
  type FigurePiece,
  type FigurePlan,
} from "./figure";
import type { Pt } from "./strokes";

// ── forces ───────────────────────────────────────────────────────────────────────────────────────

export interface ForcesInput {
  forces: Array<{ id: string; label: string; angle: number; size: number; resolve?: { axis: number; labels: [string, string] } }>;
}

// A force's name stays readable on a phone however small the diagram is drawn: at 22 the F on a ship was a speck.
const FORCE_LABEL = 28;
const PART_LABEL = 24;
const LABEL_ROOM = 60;
// The shortest arrow a diagram draws, so a force still reads as a push.
const LEAST_REACH = 72;

/** The narrowest a free-body diagram is drawn: its shortest arrow and its labels' room on every side. */
export const FORCES_MIN_SIDE = 2 * (LEAST_REACH + LABEL_ROOM);

/** A free-body diagram's box: square, as long as its longest arrow on every side, with room for labels. */
export function forcesSize(scale: number): [number, number] {
  const side = 2 * (130 * scale + LABEL_ROOM);
  return [side, side];
}

const unit = (degrees: number): Pt => [Math.cos((degrees * Math.PI) / 180), -Math.sin((degrees * Math.PI) / 180)];

// Forces are anchored on the body they act on, so their names are printed on a card over the picture.
function labelAt(tip: Pt, dir: Pt, text: string, color: string, size: number, t: [number, number], plate: string): FigureOp {
  const width = measureMath(text, size).w;
  const gap = 12 + Math.abs(dir[0]) * width * 0.5 + Math.abs(dir[1]) * size * 0.45;
  return { op: "text", math: true, text, x: tip[0] + dir[0] * gap, y: tip[1] + dir[1] * gap, size, color, align: "center", t, plate };
}

function extent(points: Pt[], pad: number): FigureBox {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
}

export function planForces(input: ForcesInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const longest = Math.max(1e-9, ...input.forces.map((force) => force.size));
  const reach = Math.max(30, Math.min(w, h) / 2 - LABEL_ROOM);
  const pieces: FigurePiece[] = [];
  input.forces.forEach((force, i) => {
    const color = seriesColor(palette, i === 3 ? 0 : i);
    const dir = unit(force.angle);
    const length = (force.size / longest) * reach;
    const tip: Pt = [dir[0] * length, dir[1] * length];
    pieces.push({
      name: force.id,
      box: extent([[0, 0], tip], 16),
      ops: [
        { op: "line", pts: [[0, 0], tip], color, width: 5, arrow: "end", t: [0, 0.75] },
        labelAt(tip, dir, force.label, color, FORCE_LABEL, [0.6, 1], palette.bg),
      ],
      order: i,
    });
    if (!force.resolve) return;
    // The components along and across the axis, and the dashed box that shows they add back up to the force.
    const along = unit(force.resolve.axis);
    const across: Pt = [-along[1], along[0]];
    const a = tip[0] * along[0] + tip[1] * along[1];
    const c = tip[0] * across[0] + tip[1] * across[1];
    const alongTip: Pt = [along[0] * a, along[1] * a];
    const acrossTip: Pt = [across[0] * c, across[1] * c];
    const sign = (v: number, d: Pt): Pt => (v < 0 ? [-d[0], -d[1]] : d);
    pieces.push({
      name: `${force.id}-parts`,
      box: extent([[0, 0], alongTip, acrossTip, tip], 16),
      ops: [
        { op: "line", pts: [alongTip, tip], color: palette.muted, width: 1.5, dash: [4, 5], t: [0, 0.3] },
        { op: "line", pts: [acrossTip, tip], color: palette.muted, width: 1.5, dash: [4, 5], t: [0, 0.3] },
        { op: "line", pts: [[0, 0], alongTip], color, width: 3, dash: [9, 5], arrow: "end", t: [0.2, 0.7] },
        { op: "line", pts: [[0, 0], acrossTip], color, width: 3, dash: [9, 5], arrow: "end", t: [0.35, 0.85] },
        labelAt(alongTip, sign(a, along), force.resolve.labels[0], color, PART_LABEL, [0.6, 0.9], palette.bg),
        labelAt(acrossTip, sign(c, across), force.resolve.labels[1], color, PART_LABEL, [0.7, 1], palette.bg),
      ],
      order: i + 0.5,
    });
  });
  return { ops: [{ op: "dot", x: 0, y: 0, r: 7, fill: palette.ink }], pieces };
}

// ── working: a solution line by line ─────────────────────────────────────────────────────────────

export interface WorkingInput {
  lines: Array<{ tex: string; note?: string; cancel?: string[] }>;
}

const NOTE = 18;
const NOTE_GAP = 26;

function workingLayout(input: WorkingInput, width: number) {
  for (const size of [32, 26, 22]) {
    const lines = input.lines.map((line) => {
      const whole = measureMath(line.tex, size);
      const eq = line.tex.indexOf("=");
      return { ...line, w: whole.w, h: whole.h, lead: eq > 0 ? measureMath(line.tex.slice(0, eq), size).w : undefined };
    });
    // Lines line up on their equals signs, as they would on paper.
    const pivot = Math.max(0, ...lines.map((line) => line.lead ?? line.w / 2));
    const reach = Math.max(...lines.map((line) => (line.lead !== undefined ? line.w - line.lead : line.w / 2)));
    const noteW = Math.max(0, ...lines.map((line) => (line.note ? figureTextWidth(line.note, NOTE) : 0)));
    const content = pivot + reach + (noteW ? NOTE_GAP + noteW : 0);
    if (content <= width || size === 22) return { size, lines, pivot, reach, noteW, content, rowH: Math.max(...lines.map((line) => line.h), size) + 18 };
  }
  throw new Error("unreachable");
}

export function workingSize(input: WorkingInput, width: number): [number, number] {
  const laid = workingLayout(input, width);
  return [Math.min(width, Math.max(laid.content, 200)), laid.rowH * input.lines.length];
}

export function planWorking(input: WorkingInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const laid = workingLayout(input, w);
  const left = -laid.content / 2;
  const top = -(laid.rowH * input.lines.length) / 2;
  const pieces: FigurePiece[] = [];
  laid.lines.forEach((line, i) => {
    const y = top + laid.rowH * (i + 0.5);
    const x = left + laid.pivot - (line.lead ?? line.w / 2);
    const ops: FigureOp[] = [{ op: "text", math: true, text: line.tex, x, y, size: laid.size, color: palette.ink, align: "left", t: [0, 0.7] }];
    if (line.note) {
      const nx = left + laid.pivot + laid.reach + NOTE_GAP;
      ops.push({ op: "line", pts: [[nx - 12, y - laid.rowH * 0.32], [nx - 12, y + laid.rowH * 0.32]], color: palette.muted, width: 1.5, t: [0.5, 0.8] });
      ops.push({ op: "text", text: line.note, x: nx, y, size: NOTE, color: palette.muted, align: "left", weight: 600, t: [0.6, 1] });
    }
    pieces.push({ name: `l${i}`, box: { x: left, y: y - laid.rowH / 2, w: laid.content, h: laid.rowH }, ops, order: i, dims: true });
    const struck = (line.cancel ?? []).flatMap((term): FigureOp[] => {
      const at = line.tex.indexOf(term);
      if (at < 0) return [];
      const x0 = x + measureMath(line.tex.slice(0, at), laid.size).w;
      const x1 = x + measureMath(line.tex.slice(0, at + term.length), laid.size).w;
      // The pair is struck through, then fades as it drops out of the working.
      return [
        { op: "line", pts: [[x0 - 2, y + line.h * 0.32], [x1 + 2, y - line.h * 0.32]], color: palette.danger, width: 3, t: [0, 0.55] },
        { op: "rect", x: x0 - 3, y: y - line.h / 2, w: x1 - x0 + 6, h: line.h, fill: palette.bg, alpha: 0.6, t: [0.55, 1] },
      ];
    });
    if (struck.length) pieces.push({ name: `l${i}-cancel`, box: { x: left, y: y - laid.rowH / 2, w: laid.content, h: laid.rowH }, ops: struck, order: i + 0.5, follows: `l${i}` });
  });
  return { ops: [], pieces };
}
