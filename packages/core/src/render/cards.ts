/**
 * cards — laid-out teaching cards drawn as figures: a two-panel comparison matched row to row, a
 * primary source with its provenance, the film's open question, and a true-size lineup with a scale
 * bar. Pure geometry: figure plans whose pieces arrive as they are narrated.
 */
import { niceTicks } from "./charts";
import { formatValue } from "./datachart";
import {
  figureTextWidth,
  figureWrap,
  lineHeight,
  textBlock,
  type FigureOp,
  type FigurePalette,
  type FigurePiece,
  type FigurePlan,
} from "./figure";

const LABEL = 20;
const SMALL = 18;
const TITLE = 22;

// ── compare: two panels, matched row to row ──────────────────────────────────────────────────────

export interface CompareInput {
  titles: [string, string];
  rows: Array<{ left: string; right: string; match?: "same" | "different" | "maps" | "fails" }>;
}

const GUTTER = 48;

function compareRows(input: CompareInput, w: number) {
  const col = (w - GUTTER) / 2;
  const titles = input.titles.map((title) => figureWrap(title, TITLE, col - 8));
  const head = Math.max(...titles.map((lines) => lines.length)) * lineHeight(TITLE) + 16;
  const rows = input.rows.map((row) => {
    const left = figureWrap(row.left, LABEL, col - 12);
    const right = figureWrap(row.right, LABEL, col - 12);
    return { left, right, h: Math.max(left.length, right.length) * lineHeight(LABEL) + 20 };
  });
  return { col, titles, head, rows };
}

export function compareSize(input: CompareInput, width: number): [number, number] {
  const laid = compareRows(input, width);
  return [width, laid.head + laid.rows.reduce((a, r) => a + r.h, 0)];
}

export function planCompare(input: CompareInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const { col, titles, head, rows } = compareRows(input, w);
  const total = head + rows.reduce((a, r) => a + r.h, 0);
  const top = -Math.min(h, total) / 2;
  const [lx, rx] = [-w / 2 + col / 2, w / 2 - col / 2];
  const pieces: FigurePiece[] = (["left", "right"] as const).map((side, i) => ({
    name: side,
    box: { x: i === 0 ? -w / 2 : w / 2 - col, y: top, w: col, h: head },
    ops: [
      ...textBlock(titles[i], i === 0 ? lx : rx, top + 2, TITLE, palette.ink, { align: "center", weight: 700 }),
      { op: "line", pts: [[i === 0 ? -w / 2 : w / 2 - col, top + head - 6], [i === 0 ? -w / 2 + col : w / 2, top + head - 6]], color: palette.accent, width: 3, t: [0.3, 1] },
    ],
    order: 0,
  }));
  const ops: FigureOp[] = [{ op: "line", pts: [[0, top + 4], [0, top + total]], color: palette.muted, width: 1.5 }];
  let y = top + head;
  input.rows.forEach((row, i) => {
    const laid = rows[i];
    const mid = y + laid.h / 2;
    const block = (lines: string[], x: number, t: [number, number]) => textBlock(lines, x, mid - (lines.length * lineHeight(LABEL)) / 2, LABEL, palette.ink, { align: "center", t });
    const rowOps: FigureOp[] = [
      ...block(laid.left, lx, [0, 0.45]),
      ...block(laid.right, rx, [0.3, 0.75]),
      { op: "line", pts: [[-w / 2, y + laid.h], [w / 2, y + laid.h]], color: palette.muted, width: 1, dash: [2, 5], t: [0, 0.5] },
    ];
    const reach = GUTTER / 2 - 4;
    if (row.match === "same" || row.match === "different") {
      const color = row.match === "same" ? palette.accent : palette.danger;
      rowOps.push({ op: "dot", x: 0, y: mid, r: 16, fill: palette.bg, stroke: color, t: [0.7, 0.85] });
      rowOps.push({ op: "text", x: 0, y: mid, text: row.match === "same" ? "=" : "≠", size: 24, weight: 700, color, t: [0.75, 1] });
    }
    if (row.match === "maps" || row.match === "fails") {
      const color = row.match === "maps" ? palette.accent : palette.danger;
      rowOps.push({ op: "rect", x: -reach - 2, y: mid - 12, w: reach * 2 + 4, h: 24, fill: palette.bg, t: [0.7, 0.72] });
      rowOps.push({ op: "line", pts: [[-reach, mid], [reach, mid]], color, width: 3, arrow: "both", t: [0.72, 0.9] });
      // Where the analogy breaks, the mapping is struck through.
      if (row.match === "fails") {
        rowOps.push({ op: "line", pts: [[-10, mid - 12], [10, mid + 12]], color, width: 3.5, t: [0.88, 1] });
        rowOps.push({ op: "line", pts: [[10, mid - 12], [-10, mid + 12]], color, width: 3.5, t: [0.9, 1] });
      }
    }
    pieces.push({ name: `row${i}`, box: { x: -w / 2, y, w, h: laid.h }, ops: rowOps, order: i + 1 });
    y += laid.h;
  });
  return { ops, pieces };
}

// ── evidence: a primary source, provenance first ─────────────────────────────────────────────────

export interface EvidenceInput {
  excerpt: string;
  author?: string;
  date?: string;
  place?: string;
  audience?: string;
}

const CARD_PAD = 18;

function evidenceLines(input: EvidenceInput, w: number) {
  const inner = w - CARD_PAD * 2 - 8;
  const who = figureWrap(input.author ?? "Source", TITLE, inner);
  const meta = [input.date, input.place, input.audience ? `for ${input.audience}` : undefined].filter(Boolean).join(" · ");
  const metaLines = meta ? figureWrap(meta, SMALL, inner) : [];
  const quote = figureWrap(`“${input.excerpt}”`, LABEL, inner);
  const headH = who.length * lineHeight(TITLE) + metaLines.length * lineHeight(SMALL);
  return { who, metaLines, quote, headH, h: CARD_PAD * 2 + headH + 16 + quote.length * lineHeight(LABEL) };
}

export function evidenceSize(input: EvidenceInput, width: number): [number, number] {
  return [width, evidenceLines(input, width).h];
}

export function planEvidence(input: EvidenceInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const laid = evidenceLines(input, w);
  const top = -laid.h / 2;
  const x = -w / 2 + CARD_PAD + 8;
  const headTop = top + CARD_PAD;
  const quoteTop = headTop + laid.headH + 16;
  return {
    ops: [
      { op: "rect", x: -w / 2, y: top, w, h: laid.h, radius: 12, fill: palette.surface, stroke: palette.muted, width: 1.5, t: [0, 0.6] },
      { op: "rect", x: -w / 2, y: top, w: 6, h: laid.h, radius: 3, fill: palette.accent, grow: "down", t: [0.2, 1] },
    ],
    pieces: [
      {
        name: "header",
        box: { x: -w / 2, y: top, w, h: CARD_PAD + laid.headH + 8 },
        ops: [
          ...textBlock(laid.who, x, headTop, TITLE, palette.ink, { align: "left", weight: 700, under: palette.surface, t: [0, 0.6] }),
          ...textBlock(laid.metaLines, x, headTop + laid.who.length * lineHeight(TITLE), SMALL, palette.muted, { align: "left", under: palette.surface, t: [0.4, 1] }),
        ],
        order: 0,
      },
      {
        name: "excerpt",
        box: { x: -w / 2, y: quoteTop - 8, w, h: top + laid.h - quoteTop + 8 },
        ops: [
          { op: "line", pts: [[x, quoteTop - 8], [w / 2 - CARD_PAD, quoteTop - 8]], color: palette.muted, width: 1, t: [0, 0.3] },
          ...laid.quote.map((text, i): FigureOp => ({ op: "text", x, y: quoteTop + lineHeight(LABEL) * (i + 0.5), text, size: LABEL, color: palette.ink, align: "left", italic: true, under: palette.surface, t: [0.1 + (0.8 * i) / laid.quote.length, Math.min(1, 0.3 + (0.8 * (i + 1)) / laid.quote.length)] })),
        ],
        order: 1,
      },
    ],
  };
}

// ── question: the film's open question, ticked when answered ─────────────────────────────────────

const MARK = 15;

function questionLines(text: string, width: number) {
  const lines = figureWrap(text, LABEL, width - MARK * 2 - 34).slice(0, 3);
  const w = Math.min(width, Math.max(...lines.map((line) => figureTextWidth(line, LABEL))) + MARK * 2 + 34);
  return { lines, w, h: Math.max(MARK * 2 + 12, lines.length * lineHeight(LABEL) + 16) };
}

export function questionSize(text: string, width: number): [number, number] {
  const laid = questionLines(text, width);
  return [laid.w, laid.h];
}

export function planQuestion(text: string, w: number, h: number, palette: FigurePalette): FigurePlan {
  const laid = questionLines(text, w + 1);
  const [mx, my] = [-w / 2 + 12 + MARK, 0];
  return {
    ops: [
      { op: "rect", x: -w / 2, y: -laid.h / 2, w, h: laid.h, radius: laid.h / 2, fill: palette.surface, stroke: palette.accent, width: 2, t: [0, 0.5] },
      { op: "dot", x: mx, y: my, r: MARK, fill: palette.bg, stroke: palette.accent, t: [0.2, 0.5] },
      { op: "text", x: mx, y: my, text: "?", size: LABEL, weight: 700, color: palette.accent, under: palette.bg, t: [0.3, 0.6] },
      ...textBlock(laid.lines, mx + MARK + 10, -(laid.lines.length * lineHeight(LABEL)) / 2, LABEL, palette.ink, { align: "left", weight: 600, under: palette.surface, t: [0.4, 1] }),
    ],
    pieces: [
      {
        name: "tick",
        box: { x: mx - MARK, y: my - MARK, w: MARK * 2, h: MARK * 2 },
        ops: [
          { op: "dot", x: mx, y: my, r: MARK + 1, fill: palette.accent, t: [0, 0.4] },
          { op: "line", pts: [[mx - 7, my + 1], [mx - 2, my + 6], [mx + 8, my - 6]], color: palette.bg, width: 3.5, t: [0.35, 1] },
        ],
        order: 0,
      },
    ],
  };
}

// ── scale: things at their true relative size ────────────────────────────────────────────────────

export interface ScaleInput {
  unit: string;
  items: Array<{ label: string; size: number }>;
}

export function scaleSize(input: ScaleInput, width: number): [number, number] {
  return [width, Math.min(320, width / input.items.length) + 110];
}

export function planScale(input: ScaleInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const slot = w / input.items.length;
  const biggest = Math.max(...input.items.map((item) => item.size));
  const labels = 2 * lineHeight(LABEL) + 6;
  const bar = 44;
  const full = Math.max(10, Math.min(slot - 10, h - labels - bar - 8));
  const base = -h / 2 + full + 4;
  // The scale bar is a round number near a quarter of the largest thing.
  const step = niceTicks([0, biggest], 4)[1] ?? biggest;
  const barLength = (step / biggest) * full;
  const barY = h / 2 - 14;
  const ops: FigureOp[] = [
    { op: "line", pts: [[-w / 2, base], [w / 2, base]], color: palette.muted, width: 1.5 },
    { op: "line", pts: [[-w / 2 + 4, barY], [-w / 2 + 4 + barLength, barY]], color: palette.ink, width: 4 },
    { op: "line", pts: [[-w / 2 + 4, barY - 7], [-w / 2 + 4, barY + 7]], color: palette.ink, width: 2 },
    { op: "line", pts: [[-w / 2 + 4 + barLength, barY - 7], [-w / 2 + 4 + barLength, barY + 7]], color: palette.ink, width: 2 },
    { op: "text", x: -w / 2 + 14 + barLength, y: barY, text: `${formatValue(step)} ${input.unit}`, size: SMALL, weight: 600, color: palette.ink, align: "left" },
  ];
  const pieces = input.items.map((item, i): FigurePiece => {
    const d = (item.size / biggest) * full;
    const cx = -w / 2 + slot * (i + 0.5);
    // Too small to see at this scale is the lesson; it is still marked, as a point.
    const r = Math.max(1.5, d / 2);
    return {
      name: `item${i}`,
      box: { x: cx - slot / 2, y: base - Math.max(d, 4), w: slot, h: Math.max(d, 4) + labels },
      ops: [
        { op: "dot", x: cx, y: base - r, r, fill: palette.surface, stroke: palette.accent, t: [0, 0.6] },
        { op: "text", x: cx, y: base + 4 + lineHeight(LABEL) / 2, text: item.label, size: LABEL, weight: 600, color: palette.ink, t: [0.4, 0.8] },
        { op: "text", x: cx, y: base + 4 + lineHeight(LABEL) * 1.5, text: `${formatValue(item.size)} ${input.unit}`, size: SMALL, color: palette.muted, t: [0.6, 1] },
      ],
      order: i,
    };
  });
  return { ops, pieces };
}
