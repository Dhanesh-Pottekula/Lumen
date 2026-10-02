/**
 * datachart — the data charts drawn as figures, decluttered by default: no gridlines or chart
 * borders, labels written on the data in its own colour instead of a legend, the takeaway as a
 * left-aligned title and the source as a small grey line. Marks enter only honestly — bars grow
 * from zero, lines draw left to right, units fill one at a time — and every mark's length is
 * linear in its value, never scaled in two dimensions. Pure geometry: figure plans.
 */
import { compileExpr } from "../gcl/expr";
import { niceTicks, seriesLines } from "./charts";
import { MIN_TEXT } from "../gcl/viewport";
import {
  figureTextWidth,
  figureWrap,
  lineHeight,
  seriesColor,
  textBlock,
  type FigureBox,
  type FigureOp,
  type FigurePalette,
  type FigurePiece,
  type FigurePlan,
} from "./figure";
import { easeInOutCubic } from "./motion";
import type { Pt } from "./strokes";
import { formatNumber } from "./type-motion";

export interface ChartInput {
  chart: string;
  data?: Array<{ label: string; value: number; category?: string }>;
  pairs?: Array<{ label: string; from: number; to: number }>;
  columns?: [string, string];
  series?: [number, number][] | [number, number][][];
  names?: string[];
  values?: number[];
  bins?: number;
  marks?: "bars" | "dots";
  total?: number;
  icon?: string;
  per?: string;
  majority?: boolean;
  title?: string;
  source?: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  axes?: boolean;
  function?: string;
  tangent?: { at: number; from: number };
  marker?: { from: number; to: number };
}

const LABEL = 20;
const SMALL = 18;
const TITLE = 22;

/** The chart types drawn here rather than by the chart painter. */
export function figureChart(input: ChartInput): boolean {
  if (["hbar", "seats", "units", "slope", "dumbbell", "pyramid", "stack", "histogram", "sparkline"].includes(input.chart)) return true;
  // More than three lines on one pair of axes is a tangle: each gets its own small panel instead.
  return (input.chart === "line" || input.chart === "area") && seriesLines(input.series ?? []).length > 3;
}

/** A value as a reader says it: whole numbers grouped, fractions to at most two places. */
export function formatValue(value: number): string {
  const decimals = Number.isInteger(value) ? 0 : Math.abs(value) < 10 ? 2 : 1;
  return formatNumber(value, { decimals }).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

interface Bands {
  titleLines: string[];
  sourceLines: string[];
  top: number;
  bottom: number;
}

function bands(input: ChartInput, w: number): Bands {
  const titleLines = input.title ? figureWrap(input.title, TITLE, w) : [];
  const sourceLines = input.source ? figureWrap(input.source, SMALL, w) : [];
  return {
    titleLines,
    sourceLines,
    top: titleLines.length ? titleLines.length * lineHeight(TITLE) + 12 : 0,
    bottom: sourceLines.length ? sourceLines.length * lineHeight(SMALL) + 8 : 0,
  };
}

/** How much taller a chart is for its title and source line. */
export function bandHeight(input: ChartInput, w: number): number {
  const b = bands(input, w);
  return b.top + b.bottom;
}

function bandPieces(input: ChartInput, w: number, h: number, palette: FigurePalette, lastOrder: number): FigurePiece[] {
  const b = bands(input, w);
  const pieces: FigurePiece[] = [];
  if (b.titleLines.length)
    pieces.push({
      name: "title",
      box: { x: -w / 2, y: -h / 2, w, h: b.top - 6 },
      ops: textBlock(b.titleLines, -w / 2, -h / 2, TITLE, palette.ink, { align: "left", weight: 700 }),
      // The takeaway is written once the data it sums up is drawn.
      order: lastOrder + 1,
    });
  if (b.sourceLines.length)
    pieces.push({
      name: "source",
      box: { x: -w / 2, y: h / 2 - b.bottom + 4, w, h: b.bottom - 4 },
      ops: textBlock(b.sourceLines, -w / 2, h / 2 - b.bottom + 6, SMALL, palette.muted, { align: "left" }),
      order: lastOrder + 1.5,
    });
  return pieces;
}

/**
 * The box left for the data once the title and source have their bands, and a chart the chart painter
 * draws keeps room inside its own box for what its axes write: the values up the left, the values and
 * the axis name along the foot, the unit over the top of the up axis, and the last point's mark.
 */
export function plotBox(input: ChartInput, w: number, h: number): FigureBox {
  const b = bands(input, w);
  const band = { x: -w / 2, y: -h / 2 + b.top, w, h: Math.max(20, h - b.top - b.bottom) };
  const room = axisRoom(input);
  if (!room) return band;
  return { x: band.x + room.left, y: band.y + room.top, w: Math.max(20, band.w - room.left - room.right), h: Math.max(20, band.h - room.top - room.bottom) };
}

/** The room a painted chart's axes write in round its data, or undefined when it draws no axes. */
function axisRoom(input: ChartInput): { left: number; right: number; top: number; bottom: number } | undefined {
  if (figureChart(input) || input.chart === "pie" || input.chart === "donut" || input.axes === false) return undefined;
  const domains = painterDomains(input);
  const y: [number, number] = input.chart === "bar" ? [0, Math.max(1, ...(input.data ?? []).map((d) => d.value))] : (domains?.y ?? input.yDomain ?? [0, 1]);
  const widest = Math.max(...[...y, ...niceTicks(y)].map((value) => figureTextWidth(formatValue(value), MIN_TEXT)));
  const lastX = domains ? figureTextWidth(formatValue(domains.x[1]), MIN_TEXT) / 2 : 0;
  return { left: widest + 8, right: Math.max(10, lastX), top: input.yLabel ? lineHeight(MIN_TEXT) + 6 : MIN_TEXT / 2, bottom: lineHeight(MIN_TEXT) + 10 + (input.xLabel ? lineHeight(MIN_TEXT) : 0) };
}

function categoryColors(input: ChartInput, palette: FigurePalette): (index: number) => string {
  const keys = [...new Set((input.data ?? []).map((d) => d.category ?? ""))];
  const categorised = keys.length > 1 || keys[0] !== "";
  return (index) => (categorised ? seriesColor(palette, keys.indexOf(input.data![index].category ?? "")) : palette.accent);
}

/** The natural data box of a chart drawn here, before its title and source. */
export function figureChartSize(input: ChartInput, width: number, scale: number): [number, number] {
  const n = (input.data ?? input.pairs ?? []).length;
  switch (input.chart) {
    case "hbar":
      return [width, n * 62];
    case "slope":
      return [width, 330 * scale];
    case "dumbbell":
      return [width, 48 + n * 60 + 34];
    case "pyramid":
      return [width, 34 + n * 36];
    case "units": {
      const total = unitsTotal(input);
      const cols = total <= 10 ? total : 10;
      const cell = Math.min(46, width / cols);
      return [width, Math.ceil(total / cols) * cell + 10 + (input.data?.length ?? 0) * lineHeight(LABEL) + (input.per ? lineHeight(SMALL) : 0)];
    }
    case "seats":
      return [width, width / 2 + 16 + n * lineHeight(LABEL)];
    case "stack":
    case "histogram":
      return [width, 300 * scale];
    case "sparkline":
      return [150 * scale, 46];
    default:
      return [width, 400 * scale];
  }
}

// ── horizontal bars ──────────────────────────────────────────────────────────────────────────────

function planHbar(input: ChartInput, area: FigureBox, palette: FigurePalette): FigurePiece[] {
  const data = input.data ?? [];
  const order = data.map((_, i) => i).sort((a, b) => data[b].value - data[a].value);
  const low = Math.min(0, ...data.map((d) => d.value));
  const high = Math.max(0, ...data.map((d) => d.value));
  const valueRoom = Math.max(...data.map((d) => figureTextWidth(formatValue(d.value), SMALL))) + 8;
  const span = high - low || 1;
  const trackW = area.w - valueRoom * (low < 0 ? 2 : 1);
  const zero = area.x + (low < 0 ? valueRoom : 0) + ((0 - low) / span) * trackW;
  const rowH = Math.min(74, area.h / Math.max(1, data.length));
  const barH = Math.max(14, Math.min(24, rowH - lineHeight(LABEL) - 14));
  const color = categoryColors(input, palette);
  return order.map((index, rank) => {
    const d = data[index];
    const top = area.y + rank * rowH;
    const length = (Math.abs(d.value) / span) * trackW;
    const barY = top + lineHeight(LABEL) + 2;
    const negative = d.value < 0;
    const x = negative ? zero - length : zero;
    const ops: FigureOp[] = [
      { op: "text", x: area.x, y: top + lineHeight(LABEL) / 2, text: d.label, size: LABEL, color: palette.ink, align: "left", weight: 600, t: [0, 0.4] },
      { op: "rect", x, y: barY, w: Math.max(1, length), h: barH, fill: color(index), radius: 3, grow: negative ? "left" : "right", t: [0.1, 0.9] },
      { op: "text", x: negative ? x - 6 : x + length + 6, y: barY + barH / 2, text: formatValue(d.value), size: SMALL, color: palette.ink, align: negative ? "right" : "left", t: [0.75, 1] },
    ];
    return { name: `bar${index}`, box: { x: area.x, y: top, w: area.w, h: rowH - 6 }, ops, order: rank };
  });
}

// ── before and after: slope, dumbbell, pyramid ───────────────────────────────────────────────────

/** Nudge label centres apart so no two sit closer than `gap`, keeping their order. */
function spread(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  const out = [...ys];
  for (let pass = 0; pass < 6; pass++) {
    for (let k = 1; k < order.length; k++) {
      const [a, b] = [order[k - 1], order[k]];
      if (out[b] - out[a] < gap) {
        const push = (gap - (out[b] - out[a])) / 2;
        out[a] -= push;
        out[b] += push;
      }
    }
    order.forEach((i) => (out[i] = Math.min(max, Math.max(min, out[i]))));
  }
  return out;
}

const pairColor = (from: number, to: number, palette: FigurePalette) => (to > from ? palette.accent : to < from ? palette.danger : palette.muted);

function planSlope(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const pairs = input.pairs ?? [];
  const values = pairs.flatMap((p) => [p.from, p.to]);
  const [low, high] = input.yDomain ?? [Math.min(...values), Math.max(...values)];
  const span = high - low || 1;
  const labelW = Math.min(area.w * 0.38, Math.max(...pairs.map((p) => figureTextWidth(p.label, LABEL))) + 6);
  const valueW = Math.max(...values.map((v) => figureTextWidth(formatValue(v), SMALL))) + 8;
  const x0 = area.x + labelW + valueW;
  const x1 = area.x + area.w - valueW;
  const top = area.y + 40;
  const bottom = area.y + area.h - 12;
  const sy = (v: number) => bottom - ((v - low) / span) * (bottom - top);
  const leftY = spread(pairs.map((p) => sy(p.from)), lineHeight(LABEL), top, bottom);
  const rightY = spread(pairs.map((p) => sy(p.to)), lineHeight(SMALL), top, bottom);
  const [a, b] = input.columns ?? ["before", "after"];
  const frame: FigureOp[] = [
    { op: "line", pts: [[x0, top - 8], [x0, bottom + 8]], color: palette.muted, width: 1.5 },
    { op: "line", pts: [[x1, top - 8], [x1, bottom + 8]], color: palette.muted, width: 1.5 },
    { op: "text", x: x0, y: area.y + 12, text: a, size: LABEL, weight: 700, color: palette.muted, align: "center" },
    { op: "text", x: x1, y: area.y + 12, text: b, size: LABEL, weight: 700, color: palette.muted, align: "center" },
  ];
  const pieces = pairs.map((p, i): FigurePiece => {
    const color = pairColor(p.from, p.to, palette);
    const [ya, yb] = [sy(p.from), sy(p.to)];
    return {
      name: `row${i}`,
      box: { x: area.x, y: Math.min(ya, yb, leftY[i]) - 12, w: area.w, h: Math.abs(Math.max(ya, yb, leftY[i]) - Math.min(ya, yb, leftY[i])) + 24 },
      ops: [
        { op: "dot", x: x0, y: ya, r: 6, fill: color, t: [0, 0.2] },
        { op: "text", x: x0 - valueW, y: leftY[i], text: p.label, size: LABEL, weight: 600, color, align: "right", t: [0, 0.3] },
        { op: "text", x: x0 - 10, y: leftY[i], text: formatValue(p.from), size: SMALL, color, align: "right", t: [0.1, 0.3] },
        { op: "line", pts: [[x0, ya], [x1, yb]], color, width: 3.5, t: [0.2, 0.85] },
        { op: "dot", x: x1, y: yb, r: 6, fill: color, t: [0.8, 0.95] },
        { op: "text", x: x1 + 10, y: rightY[i], text: formatValue(p.to), size: SMALL, color, align: "left", t: [0.85, 1] },
      ],
      order: i,
    };
  });
  return { frame, pieces };
}

function rangeAxis(area: FigureBox, y: number, low: number, high: number, sx: (v: number) => number, palette: FigurePalette, label?: string): FigureOp[] {
  // A range frame: the axis runs only over the data, and its end ticks say where the data stop.
  const ops: FigureOp[] = [{ op: "line", pts: [[sx(low), y], [sx(high), y]], color: palette.muted, width: 1.5 }];
  for (const v of [low, high]) {
    ops.push({ op: "line", pts: [[sx(v), y], [sx(v), y + 6]], color: palette.muted, width: 1.5 });
    ops.push({ op: "text", x: sx(v), y: y + 18, text: formatValue(v), size: SMALL, color: palette.muted, align: v === low ? "left" : "right" });
  }
  if (label) ops.push({ op: "text", x: area.x + area.w / 2, y: y + 18, text: label, size: SMALL, color: palette.muted, align: "center" });
  return ops;
}

function planDumbbell(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const pairs = input.pairs ?? [];
  const values = pairs.flatMap((p) => [p.from, p.to]);
  const [low, high] = input.xDomain ?? [Math.min(...values), Math.max(...values)];
  const span = high - low || 1;
  const sx = (v: number) => area.x + 8 + ((v - low) / span) * (area.w - 16);
  const [a, b] = input.columns ?? ["before", "after"];
  const legendY = area.y + 12;
  const frame: FigureOp[] = [
    { op: "dot", x: area.x + 8, y: legendY, r: 6, fill: palette.muted },
    { op: "text", x: area.x + 20, y: legendY, text: a, size: SMALL, weight: 600, color: palette.muted, align: "left" },
    { op: "dot", x: area.x + 40 + figureTextWidth(a, SMALL), y: legendY, r: 6, fill: palette.accent },
    { op: "text", x: area.x + 52 + figureTextWidth(a, SMALL), y: legendY, text: b, size: SMALL, weight: 600, color: palette.accent, align: "left" },
    ...rangeAxis(area, area.y + area.h - 26, low, high, sx, palette, input.xLabel),
  ];
  const rowH = (area.h - 48 - 34) / Math.max(1, pairs.length);
  const pieces = pairs.map((p, i): FigurePiece => {
    const top = area.y + 36 + i * rowH;
    const y = top + lineHeight(LABEL) + 12;
    const color = pairColor(p.from, p.to, palette);
    const toward = Math.sign(p.to - p.from) * 8;
    return {
      name: `row${i}`,
      box: { x: area.x, y: top, w: area.w, h: rowH - 4 },
      ops: [
        { op: "text", x: area.x, y: top + lineHeight(LABEL) / 2, text: p.label, size: LABEL, weight: 600, color: palette.ink, align: "left", t: [0, 0.3] },
        { op: "dot", x: sx(p.from), y, r: 7, fill: palette.muted, t: [0.05, 0.25] },
        { op: "line", pts: [[sx(p.from) + toward, y], [sx(p.to) - toward, y]], color, width: 3, arrow: p.to === p.from ? undefined : "end", t: [0.25, 0.8] },
        { op: "dot", x: sx(p.to), y, r: 7, fill: color, t: [0.75, 0.9] },
        { op: "text", x: sx(p.to) + (p.to >= p.from ? 12 : -12), y: y - 16, text: formatValue(p.to), size: SMALL, color, align: p.to >= p.from ? "left" : "right", t: [0.8, 1] },
      ],
      order: i,
    };
  });
  return { frame, pieces };
}

function planPyramid(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const pairs = input.pairs ?? [];
  const labelW = Math.max(...pairs.map((p) => figureTextWidth(p.label, SMALL))) + 12;
  const max = Math.max(1e-9, ...pairs.flatMap((p) => [Math.abs(p.from), Math.abs(p.to)]));
  const valueW = Math.max(...pairs.flatMap((p) => [p.from, p.to]).map((v) => figureTextWidth(formatValue(v), SMALL))) + 6;
  const half = (area.w - labelW) / 2 - valueW;
  const centre = area.x + area.w / 2;
  const [leftName, rightName] = input.columns ?? ["left", "right"];
  const frame: FigureOp[] = [
    { op: "text", x: centre - labelW / 2 - 4, y: area.y + 12, text: leftName, size: LABEL, weight: 700, color: seriesColor(palette, 0), align: "right" },
    { op: "text", x: centre + labelW / 2 + 4, y: area.y + 12, text: rightName, size: LABEL, weight: 700, color: seriesColor(palette, 1), align: "left" },
  ];
  const rowH = (area.h - 34) / Math.max(1, pairs.length);
  const barH = Math.max(12, rowH - 8);
  const pieces = pairs.map((p, i): FigurePiece => {
    const y = area.y + 34 + i * rowH;
    const [lw, rw] = [(Math.abs(p.from) / max) * half, (Math.abs(p.to) / max) * half];
    const [lx, rx] = [centre - labelW / 2, centre + labelW / 2];
    return {
      name: `row${i}`,
      box: { x: area.x, y, w: area.w, h: rowH },
      ops: [
        { op: "text", x: centre, y: y + barH / 2, text: p.label, size: SMALL, color: palette.ink, align: "center", t: [0, 0.3] },
        { op: "rect", x: lx - lw, y, w: Math.max(1, lw), h: barH, fill: seriesColor(palette, 0), radius: 2, grow: "left", t: [0.1, 0.8] },
        { op: "rect", x: rx, y, w: Math.max(1, rw), h: barH, fill: seriesColor(palette, 1), radius: 2, grow: "right", t: [0.1, 0.8] },
        { op: "text", x: lx - lw - 4, y: y + barH / 2, text: formatValue(p.from), size: SMALL, color: palette.ink, align: "right", t: [0.75, 1] },
        { op: "text", x: rx + rw + 4, y: y + barH / 2, text: formatValue(p.to), size: SMALL, color: palette.ink, align: "left", t: [0.75, 1] },
      ],
      order: i,
    };
  });
  return { frame, pieces };
}

// ── units: waffles, pictograms, icon arrays ──────────────────────────────────────────────────────

function unitsTotal(input: ChartInput): number {
  const sum = (input.data ?? []).reduce((a, d) => a + Math.max(0, Math.round(d.value)), 0);
  return input.total ?? (sum <= 10 ? 10 : 100);
}

function planUnits(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const data = input.data ?? [];
  const total = unitsTotal(input);
  const sum = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  // More than the array holds: each unit stands for a share, so the whole still reads at a glance.
  const counts = sum > total ? data.map((d) => Math.round((Math.max(0, d.value) / sum) * total)) : data.map((d) => Math.max(0, Math.round(d.value)));
  const cols = total <= 10 ? total : 10;
  const rows = Math.ceil(total / cols);
  const legendH = data.length * lineHeight(LABEL) + (input.per ? lineHeight(SMALL) : 0);
  const cell = Math.min(46, area.w / cols, (area.h - legendH - 10) / rows);
  const gridW = cell * cols;
  const x0 = area.x + (area.w - gridW) / 2;
  const at = (k: number): Pt => [x0 + (k % cols) * cell + cell / 2, area.y + Math.floor(k / cols) * cell + cell / 2];
  const glyph = (k: number, color: string, filled: boolean, t?: [number, number]): FigureOp =>
    input.icon
      ? { op: "icon", name: input.icon, x: at(k)[0], y: at(k)[1], size: cell * 0.9, color, filled, width: filled ? 4 : 1.5, t }
      : filled
        ? { op: "rect", x: at(k)[0] - cell * 0.4, y: at(k)[1] - cell * 0.4, w: cell * 0.8, h: cell * 0.8, radius: cell * 0.12, fill: color, t }
        : { op: "rect", x: at(k)[0] - cell * 0.4, y: at(k)[1] - cell * 0.4, w: cell * 0.8, h: cell * 0.8, radius: cell * 0.12, stroke: color, width: 1.5, t };
  const frame: FigureOp[] = Array.from({ length: total }, (_, k) => glyph(k, palette.muted, false, [Math.min(0.6, k / total) * 0.8, Math.min(1, k / total + 0.2)]));
  const legendTop = area.y + rows * cell + 10;
  if (input.per) frame.push({ op: "text", x: area.x, y: legendTop + legendH - lineHeight(SMALL) / 2, text: input.per, size: SMALL, color: palette.muted, align: "left" });
  let next = 0;
  const pieces = data.map((d, i): FigurePiece => {
    const color = seriesColor(palette, i);
    const first = next;
    next += counts[i];
    const units = Array.from({ length: Math.max(0, Math.min(total, next) - first) }, (_, j) => glyph(first + j, color, true, [(0.8 * j) / Math.max(1, counts[i]), Math.min(1, (0.8 * j) / Math.max(1, counts[i]) + 0.25)]));
    const y = legendTop + i * lineHeight(LABEL) + lineHeight(LABEL) / 2;
    return {
      name: `group${i}`,
      box: { x: area.x, y: area.y, w: area.w, h: legendTop + (i + 1) * lineHeight(LABEL) - area.y },
      ops: [
        ...units,
        { op: "rect", x: area.x, y: y - 7, w: 14, h: 14, radius: 3, fill: color, t: [0.6, 0.8] },
        { op: "text", x: area.x + 22, y, text: `${formatValue(d.value)}  ${d.label}`, size: LABEL, weight: 600, color, align: "left", t: [0.7, 1] },
      ],
      order: i,
    };
  });
  return { frame, pieces };
}

// ── seats: a parliament's hemicycle ──────────────────────────────────────────────────────────────

function planSeats(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const data = input.data ?? [];
  const seats = data.map((d) => Math.max(0, Math.round(d.value)));
  const total = Math.max(1, seats.reduce((a, b) => a + b, 0));
  const legendH = data.length * lineHeight(LABEL) + 16;
  const outer = Math.min(area.w / 2, area.h - legendH);
  const inner = outer * 0.4;
  const centre: Pt = [area.x + area.w / 2, area.y + outer];
  // Rows of seats from the inner ring out, each holding seats in proportion to its length.
  const rows = Math.max(1, Math.round(Math.sqrt(total / 4)));
  const radii = Array.from({ length: rows }, (_, i) => inner + ((outer - inner) * (i + 0.5)) / rows);
  const lengthSum = radii.reduce((a, r) => a + r, 0);
  const perRow = radii.map((r) => Math.max(1, Math.round((total * r) / lengthSum)));
  perRow[rows - 1] += total - perRow.reduce((a, b) => a + b, 0);
  const spots = radii.flatMap((r, row) => Array.from({ length: perRow[row] }, (_, k) => ({ r, angle: Math.PI - (Math.PI * (k + 0.5)) / perRow[row] })));
  spots.sort((a, b) => b.angle - a.angle || a.r - b.r);
  const dot = Math.max(1.5, Math.min(((outer - inner) / rows) * 0.42, (Math.PI * inner) / perRow[0] / 2.3));
  const frame: FigureOp[] = [];
  if (input.majority) {
    frame.push({ op: "line", pts: [[centre[0], centre[1] - outer - 12], [centre[0], centre[1] - inner + 8]], color: palette.ink, width: 1.5, dash: [5, 5] });
    frame.push({ op: "text", x: centre[0], y: centre[1] - inner / 2 + 4, text: `${Math.floor(total / 2) + 1} for a majority`, size: SMALL, color: palette.ink, align: "center" });
  }
  let next = 0;
  const pieces = data.map((d, i): FigurePiece => {
    const color = seriesColor(palette, i);
    const mine = spots.slice(next, next + seats[i]);
    next += seats[i];
    const y = centre[1] + 16 + i * lineHeight(LABEL) + lineHeight(LABEL) / 2;
    return {
      name: `group${i}`,
      box: { x: area.x, y: area.y, w: area.w, h: y + lineHeight(LABEL) / 2 - area.y },
      ops: [
        ...mine.map((spot, j): FigureOp => ({ op: "dot", x: centre[0] + spot.r * Math.cos(spot.angle), y: centre[1] - spot.r * Math.sin(spot.angle), r: dot, fill: color, t: [(0.75 * j) / Math.max(1, mine.length), Math.min(1, (0.75 * j) / Math.max(1, mine.length) + 0.15)] })),
        { op: "text", x: area.x + area.w / 2, y, text: `${d.label}  ${formatValue(seats[i])}`, size: LABEL, weight: 600, color, align: "center", t: [0.6, 1] },
      ],
      order: i,
    };
  });
  return { frame, pieces };
}

// ── stacked area, histogram, sparkline ───────────────────────────────────────────────────────────

function planStack(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const lines = seriesLines(input.series ?? []);
  const xs = lines[0].map(([x]) => x);
  const at = (line: [number, number][], x: number) => {
    const k = line.findIndex(([lx]) => lx >= x);
    if (k <= 0) return line[Math.max(0, k)]?.[1] ?? 0;
    const [[x0, y0], [x1, y1]] = [line[k - 1], line[k]];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
  };
  const tops = lines.map((_, i) => xs.map((x) => lines.slice(0, i + 1).reduce((a, line) => a + Math.max(0, at(line, x)), 0)));
  const high = input.yDomain?.[1] ?? Math.max(1e-9, ...tops[tops.length - 1]);
  const nameW = Math.max(0, ...(input.names ?? []).map((n) => figureTextWidth(n, SMALL))) + 10;
  const plot = { x: area.x + 4, y: area.y + 26, w: area.w - nameW - 4, h: area.h - 26 - 34 };
  const [x0, x1] = [xs[0], xs[xs.length - 1]];
  const sx = (x: number) => plot.x + ((x - x0) / (x1 - x0 || 1)) * plot.w;
  const sy = (y: number) => plot.y + plot.h - (y / high) * plot.h;
  const frame: FigureOp[] = [
    ...rangeAxis(area, plot.y + plot.h + 8, x0, x1, sx, palette, input.xLabel),
    { op: "line", pts: [[plot.x, plot.y + plot.h], [plot.x, sy(high)]], color: palette.muted, width: 1.5 },
    { op: "text", x: plot.x + 6, y: area.y + 10, text: `${formatValue(high)}${input.yLabel ? ` ${input.yLabel}` : ""}`, size: SMALL, color: palette.muted, align: "left" },
  ];
  const pieces = lines.map((_, i): FigurePiece => {
    const upper = xs.map((x, k): Pt => [sx(x), sy(tops[i][k])]);
    const lower = xs.map((x, k): Pt => [sx(x), sy(i === 0 ? 0 : tops[i - 1][k])]);
    const color = seriesColor(palette, i);
    const name = input.names?.[i];
    const lastY = (upper[upper.length - 1][1] + lower[lower.length - 1][1]) / 2;
    return {
      name: `layer${i}`,
      box: { x: plot.x, y: Math.min(...upper.map(([, y]) => y)), w: plot.w, h: Math.max(...lower.map(([, y]) => y)) - Math.min(...upper.map(([, y]) => y)) },
      ops: [
        { op: "area", pts: [...upper, ...[...lower].reverse()], fill: color, alpha: 0.85, t: [0, 0.8] },
        { op: "line", pts: upper, color, width: 2, t: [0, 0.8] },
        ...(name ? [{ op: "text" as const, x: plot.x + plot.w + 6, y: lastY, text: name, size: SMALL, weight: 600, color, align: "left" as const, t: [0.8, 1] as [number, number] }] : []),
      ],
      order: i,
    };
  });
  return { frame, pieces };
}

function planHistogram(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const values = input.values ?? [];
  const [low, high] = input.xDomain ?? [Math.min(...values), Math.max(...values)];
  const bins = input.bins ?? Math.max(4, Math.min(12, Math.ceil(Math.sqrt(values.length))));
  const width = (high - low || 1) / bins;
  const counts = Array.from({ length: bins }, (_, b) => values.filter((v) => Math.min(bins - 1, Math.floor((v - low) / width)) === b).length);
  const plot = { x: area.x + 4, y: area.y + 26, w: area.w - 8, h: area.h - 26 - 34 };
  const binW = plot.w / bins;
  const sx = (v: number) => plot.x + ((v - low) / (high - low || 1)) * plot.w;
  const most = Math.max(1, ...counts);
  const dots = input.marks === "dots";
  const unit = dots ? Math.min(binW * 0.9, plot.h / most) : plot.h / most;
  const frame: FigureOp[] = [
    ...rangeAxis(area, plot.y + plot.h + 8, low, high, sx, palette, input.xLabel),
    { op: "text", x: plot.x, y: area.y + 10, text: input.yLabel ?? `most in one bin: ${most}`, size: SMALL, color: palette.muted, align: "left" },
  ];
  const pieces = counts.map((count, b): FigurePiece => {
    const x = plot.x + b * binW;
    const ops: FigureOp[] = dots
      ? Array.from({ length: count }, (_, k): FigureOp => ({ op: "dot", x: x + binW / 2, y: plot.y + plot.h - unit * (k + 0.5), r: unit * 0.42, fill: palette.accent, t: [k / Math.max(1, count), Math.min(1, k / Math.max(1, count) + 0.3)] }))
      : [
          { op: "rect", x: x + 1.5, y: plot.y + plot.h - count * unit, w: binW - 3, h: Math.max(0.5, count * unit), fill: palette.accent, radius: 2, grow: "up", t: [0, 0.8] },
          ...(count > 0 && binW >= 22 ? [{ op: "text" as const, x: x + binW / 2, y: plot.y + plot.h - count * unit - 12, text: String(count), size: SMALL, color: palette.ink, align: "center" as const, t: [0.75, 1] as [number, number] }] : []),
        ];
    return { name: `bin${b}`, box: { x, y: plot.y, w: binW, h: plot.h }, ops, order: b };
  });
  return { frame, pieces };
}

function planSparkline(input: ChartInput, area: FigureBox, palette: FigurePalette): FigureOp[] {
  const line = seriesLines(input.series ?? [])[0] ?? [];
  const xs = line.map(([x]) => x);
  const ys = line.map(([, y]) => y);
  const last = line[line.length - 1];
  const valueW = last ? figureTextWidth(formatValue(last[1]), SMALL) + 8 : 0;
  const w = area.w - valueW;
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pts = line.map(([x, y]): Pt => [area.x + ((x - x0) / (x1 - x0 || 1)) * w, area.y + area.h - 4 - ((y - y0) / (y1 - y0 || 1)) * (area.h - 8)]);
  if (!last) return [];
  const end = pts[pts.length - 1];
  return [
    { op: "line", pts, color: palette.muted, width: 2, t: [0, 0.85] },
    { op: "dot", x: end[0], y: end[1], r: 4, fill: palette.accent, t: [0.8, 0.95] },
    { op: "text", x: end[0] + 7, y: end[1], text: formatValue(last[1]), size: SMALL, weight: 700, color: palette.accent, align: "left", t: [0.85, 1] },
  ];
}

// ── small multiples: one panel per line, the same axes in each ───────────────────────────────────

function planMultiples(input: ChartInput, area: FigureBox, palette: FigurePalette): { frame: FigureOp[]; pieces: FigurePiece[] } {
  const lines = seriesLines(input.series ?? []);
  const all = lines.flat();
  const [x0, x1] = input.xDomain ?? [Math.min(...all.map(([x]) => x)), Math.max(...all.map(([x]) => x))];
  const [y0, y1] = input.yDomain ?? [Math.min(0, ...all.map(([, y]) => y)), Math.max(...all.map(([, y]) => y))];
  const cols = 2;
  const rows = Math.ceil(lines.length / cols);
  const gap = 18;
  const panelW = (area.w - gap) / cols;
  const panelH = (area.h - gap * (rows - 1)) / rows;
  const pieces = lines.map((line, i): FigurePiece => {
    const px = area.x + (i % cols) * (panelW + gap);
    const py = area.y + Math.floor(i / cols) * (panelH + gap);
    const plot = { x: px + 4, y: py + 30, w: panelW - 8, h: panelH - 30 - 26 };
    const sx = (x: number) => plot.x + ((x - x0) / (x1 - x0 || 1)) * plot.w;
    const sy = (y: number) => plot.y + plot.h - ((y - y0) / (y1 - y0 || 1)) * plot.h;
    const map = (pts: [number, number][]) => pts.map(([x, y]): Pt => [sx(x), sy(y)]);
    const name = input.names?.[i] ?? `series ${i + 1}`;
    const end = map(line)[line.length - 1];
    return {
      name: `panel${i}`,
      box: { x: px, y: py, w: panelW, h: panelH },
      ops: [
        { op: "text", x: px, y: py + 12, text: name, size: LABEL, weight: 700, color: palette.accent, align: "left", t: [0, 0.3] },
        // The other lines stay in every panel in grey, so each is read against the rest.
        ...lines.filter((_, k) => k !== i).map((other): FigureOp => ({ op: "line", pts: map(other), color: palette.muted, width: 1.5, t: [0, 0.4] })),
        { op: "line", pts: map(line), color: palette.accent, width: 3, t: [0.2, 0.9] },
        { op: "dot", x: end[0], y: end[1], r: 4, fill: palette.accent, t: [0.85, 1] },
        ...rangeAxis({ ...plot, h: 0 }, plot.y + plot.h + 4, x0, x1, sx, palette),
      ],
      order: i,
    };
  });
  return { frame: [], pieces };
}

// ── marks on a plotted chart: a sliding marker, a secant turning into a tangent ─────────────────

/** Where a chart the chart painter draws puts its data: its domains, as that painter picks them. */
function painterDomains(input: ChartInput): { x: [number, number]; y: [number, number]; at: (x: number) => number } | undefined {
  if (input.chart === "function" && input.function) {
    const f = compileExpr(input.function);
    return { x: input.xDomain ?? [-1, 1], y: input.yDomain ?? [-1, 1], at: (x) => f({ x }) };
  }
  if (input.chart !== "line" && input.chart !== "area" && input.chart !== "scatter") return undefined;
  const lines = seriesLines(input.series ?? []);
  const all = lines.flat();
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const low = Math.min(...xs);
  const high = Math.max(...xs);
  const x: [number, number] = input.xDomain ?? (high - low < 1e-9 ? [low - 0.5, high + 0.5] : [low, high]);
  const first = lines[0] ?? [];
  const at = (v: number) => {
    const k = first.findIndex(([lx]) => lx >= v);
    if (k <= 0) return first[Math.max(0, k)]?.[1] ?? 0;
    const [[a, ya], [b, yb]] = [first[k - 1], first[k]];
    return ya + ((yb - ya) * (v - a)) / (b - a || 1);
  };
  return { x, y: input.yDomain ?? [Math.min(0, ...ys), Math.max(1, ...ys)], at };
}

function planMarks(input: ChartInput, plot: FigureBox, palette: FigurePalette, order: number): FigurePiece[] {
  const domains = painterDomains(input);
  if (!domains) return [];
  const sx = (v: number) => plot.x + ((v - domains.x[0]) / (domains.x[1] - domains.x[0] || 1)) * plot.w;
  const sy = (v: number) => plot.y + plot.h - ((v - domains.y[0]) / (domains.y[1] - domains.y[0] || 1)) * plot.h;
  const on = (x: number): Pt => [sx(x), sy(domains.at(x))];
  const pieces: FigurePiece[] = [];
  const steps = 32;
  if (input.marker) {
    const { from, to } = input.marker;
    const xs = Array.from({ length: steps + 1 }, (_, k) => from + (to - from) * easeInOutCubic(k / steps));
    pieces.push({
      name: "marker",
      box: { x: Math.min(sx(from), sx(to)) - 10, y: plot.y, w: Math.abs(sx(to) - sx(from)) + 20, h: plot.h },
      ops: [
        { op: "line", pts: [[sx(from), plot.y + plot.h], on(from)], frames: xs.map((x): Pt[] => [[sx(x), plot.y + plot.h], on(x)]), color: palette.accent, width: 1.5, dash: [4, 4] },
        { op: "dot", x: on(from)[0], y: on(from)[1], r: 8, fill: palette.accent, stroke: palette.bg, frames: xs.map(on) },
      ],
      order,
      long: true,
    });
  }
  if (input.tangent && input.chart === "function") {
    const { at, from } = input.tangent;
    const a = on(at);
    const reach = plot.w * 0.42;
    const h = (domains.x[1] - domains.x[0]) * 1e-4;
    const slopeAt = (x0: number, x1: number): Pt => {
      const [p, q] = [on(x0), on(x1)];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
    };
    // The far point slides down the curve and stops just short, then the line settles on the true tangent.
    const xs = Array.from({ length: steps }, (_, k) => from + (at - from) * 0.97 * easeInOutCubic(k / (steps - 1)));
    const lineAt = (u: Pt): Pt[] => [[a[0] - u[0] * reach, a[1] - u[1] * reach], [a[0] + u[0] * reach, a[1] + u[1] * reach]];
    const frames = [...xs.map((x) => lineAt(slopeAt(at, x))), lineAt(slopeAt(at - h, at + h))];
    pieces.push({
      name: "tangent",
      box: { x: plot.x, y: plot.y, w: plot.w, h: plot.h },
      ops: [
        { op: "dot", x: a[0], y: a[1], r: 6, fill: palette.ink },
        { op: "line", pts: frames[0], frames, color: palette.danger, width: 3 },
        { op: "dot", x: on(from)[0], y: on(from)[1], r: 6, fill: palette.danger, frames: [...xs.map(on), a] },
      ],
      order: order + 0.5,
      long: true,
    });
  }
  return pieces;
}

/** A chart laid out in a `w` × `h` box about its centre. */
export function planChart(input: ChartInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const area = plotBox(input, w, h);
  if (!figureChart(input)) {
    const marks = planMarks(input, area, palette, 100);
    return { ops: [], pieces: [...bandPieces(input, w, h, palette, 50), ...marks], plot: area };
  }
  if (input.chart === "sparkline") return { ops: planSparkline(input, area, palette), pieces: bandPieces(input, w, h, palette, 0) };
  const laid =
    input.chart === "hbar"
      ? { frame: [], pieces: planHbar(input, area, palette) }
      : input.chart === "slope"
        ? planSlope(input, area, palette)
        : input.chart === "dumbbell"
          ? planDumbbell(input, area, palette)
          : input.chart === "pyramid"
            ? planPyramid(input, area, palette)
            : input.chart === "units"
              ? planUnits(input, area, palette)
              : input.chart === "seats"
                ? planSeats(input, area, palette)
                : input.chart === "stack"
                  ? planStack(input, area, palette)
                  : input.chart === "histogram"
                    ? planHistogram(input, area, palette)
                    : planMultiples(input, area, palette);
  const last = Math.max(0, ...laid.pieces.map((piece) => piece.order));
  return { ops: laid.frame, pieces: [...laid.pieces, ...bandPieces(input, w, h, palette, last)] };
}

/** The piece names a chart has, known from its data alone. */
export function chartPieceNames(input: ChartInput): string[] {
  const n = (input.data ?? input.pairs ?? []).length;
  const indexed = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i}`);
  const own = figureChart(input)
    ? input.chart === "hbar"
      ? indexed("bar", n)
      : ["slope", "dumbbell", "pyramid"].includes(input.chart)
        ? indexed("row", n)
        : input.chart === "units" || input.chart === "seats"
          ? indexed("group", n)
          : input.chart === "stack"
            ? indexed("layer", seriesLines(input.series ?? []).length)
            : input.chart === "histogram"
              ? indexed("bin", input.bins ?? Math.max(4, Math.min(12, Math.ceil(Math.sqrt((input.values ?? []).length)))))
              : input.chart === "sparkline"
                ? []
                : indexed("panel", seriesLines(input.series ?? []).length)
    : [...(input.marker && painterDomains(input) ? ["marker"] : []), ...(input.tangent && input.chart === "function" ? ["tangent"] : [])];
  return [...own, ...(input.title ? ["title"] : []), ...(input.source ? ["source"] : [])];
}

/** Whether a chart piece is one of its data marks — a bar, row, group, layer, bin or panel — rather than its title, source or a mark laid on it. */
export function chartDataPiece(name: string): boolean {
  return /^(bar|row|group|layer|bin|panel)\d+$/.test(name);
}
