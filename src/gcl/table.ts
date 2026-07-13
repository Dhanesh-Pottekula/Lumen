// src/gcl/table.ts
/**
 * table — the one genuinely missing Family A primitive: a plain data grid (rows × equal-width
 * columns), with an optional bold header row and progressive (row-by-row) reveal. Kept in gcl/ per
 * reuse-only (this is a new draw primitive, not a generic-purpose one under render/*): the `{type:
 * "table"}` component is the only author-facing surface for it. Pure geometry (`tableCells`) is
 * split out so layout/sub-anchors/tests can reason about cell rects without a canvas; `drawTable`
 * paints from that same geometry, deterministic in `style.p`.
 */
import { clamp01 } from "../slides/anim";

export interface TableStyle {
  header?: boolean;
  rowH?: number;
  ink?: string;
  grid?: string;
  headerBg?: string;
  p?: number; // reveal progress 0..1 (rows appear top-to-bottom; last visible row fades in)
}

export interface TableCell {
  r: number;
  c: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pure cell geometry: equal column widths (`w / cols`), row height `rowH`, row `r` at `y + r*rowH`.
 *  `cols` is the widest row's column count (ragged rows are tolerated — a short row simply yields
 *  fewer cells for that `r`). Ctx-free so tests + sub-anchors can reason about it without a canvas. */
export function tableCells(rows: string[][], x: number, y: number, w: number, rowH: number): TableCell[] {
  if (rows.length === 0) return [];
  const cols = Math.max(0, ...rows.map((row) => row.length));
  if (cols === 0) return [];
  const colW = w / cols;
  const cells: TableCell[] = [];
  rows.forEach((row, r) => {
    row.forEach((_cell, c) => {
      cells.push({ r, c, x: x + c * colW, y: y + r * rowH, w: colW, h: rowH });
    });
  });
  return cells;
}

/**
 * Draw a table: grid lines over every cell, a bold header row + `headerBg` fill when `style.header`,
 * cell text centered in each cell. Reveals progressively by `style.p` — `floor(p*rows.length)` whole
 * rows are shown, the next (partial) row fades in by the remaining fraction. Deterministic in `p`.
 */
export function drawTable(
  ctx: CanvasRenderingContext2D,
  rows: string[][],
  x: number,
  y: number,
  w: number,
  style: TableStyle = {},
): void {
  if (rows.length === 0) return;
  const rowH = style.rowH ?? 34;
  const ink = style.ink ?? "#eef5ef";
  const grid = style.grid ?? "rgba(255,255,255,0.14)";
  const headerBg = style.headerBg ?? "rgba(92,200,174,0.16)";
  const header = style.header ?? false;
  const p = clamp01(style.p ?? 1);

  const cells = tableCells(rows, x, y, w, rowH);
  const cols = Math.max(0, ...rows.map((row) => row.length));
  const totalH = rows.length * rowH;

  // Progressive reveal: whole rows up to floor(p*rows.length) are fully shown; the next row (if any)
  // fades in by the leftover fraction, so scrubbing `p` builds the table row-by-row.
  const shownWhole = Math.floor(p * rows.length);
  const partialFrac = clamp01(p * rows.length - shownWhole);

  ctx.save();

  // Header background band (row 0), if enabled — drawn before grid/text so it sits underneath.
  if (header && rows.length > 0) {
    const headerAlpha = shownWhole > 0 ? 1 : partialFrac;
    if (headerAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= headerAlpha;
      ctx.fillStyle = headerBg;
      ctx.fillRect(x, y, w, rowH);
      ctx.restore();
    }
  }

  // Grid lines: only over the revealed extent, so the table's border draws on as rows appear.
  const revealedH = Math.min(totalH, (shownWhole + (partialFrac > 0 ? partialFrac : 0)) * rowH);
  if (revealedH > 0) {
    ctx.save();
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    // horizontal lines
    const fullRowsShown = Math.min(rows.length, shownWhole + (partialFrac > 0 ? 1 : 0));
    for (let r = 0; r <= fullRowsShown; r++) {
      const ly = y + Math.min(r * rowH, revealedH);
      ctx.beginPath();
      ctx.moveTo(x, ly);
      ctx.lineTo(x + w, ly);
      ctx.stroke();
    }
    // vertical lines
    const colW = w / Math.max(1, cols);
    for (let c = 0; c <= cols; c++) {
      const lx = x + c * colW;
      ctx.beginPath();
      ctx.moveTo(lx, y);
      ctx.lineTo(lx, y + revealedH);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Cell text.
  ctx.font = "500 14px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const cell of cells) {
    let alpha: number;
    if (cell.r < shownWhole) alpha = 1;
    else if (cell.r === shownWhole) alpha = partialFrac;
    else continue;
    if (alpha <= 0) continue;
    const text = rows[cell.r][cell.c];
    if (text === undefined) continue;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = header && cell.r === 0 ? "700 14px -apple-system, sans-serif" : "500 14px -apple-system, sans-serif";
    ctx.fillStyle = ink;
    ctx.fillText(text, cell.x + cell.w / 2, cell.y + cell.h / 2);
    ctx.restore();
  }

  ctx.restore();
}
