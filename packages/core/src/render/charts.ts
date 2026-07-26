/**
 * charts — data-viz primitives: a coordinate mapper (`makePlot`), axes/grid, animated function
 * plotting, and bar / line / area / scatter / pie charts bound to data. Everything animates from a
 * progress `p` (or `t` for staggered bars) and is deterministic/seekable. Reuses strokes (draw-on),
 * sequence (stagger), and type-motion (formatted labels).
 */
import { clamp01, lerp } from "../slides/anim";
import { strokeOn, type Pt } from "./strokes";
import { formatNumber, type NumberFormat } from "./type-motion";

// ── Coordinate mapper ────────────────────────────────────────────────────────────────────────────

export interface PlotArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Plot extends PlotArea {
  xDomain: [number, number];
  yDomain: [number, number];
  sx(v: number): number;
  sy(v: number): number;
}

export function makePlot(area: PlotArea, xDomain: [number, number], yDomain: [number, number]): Plot {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  return {
    ...area,
    xDomain,
    yDomain,
    sx: (v) => area.x + ((v - x0) / (x1 - x0 || 1)) * area.w,
    sy: (v) => area.y + area.h - ((v - y0) / (y1 - y0 || 1)) * area.h,
  };
}

/** "Nice" evenly-spaced tick values across a domain. */
export function niceTicks([a, b]: [number, number], count = 5): number[] {
  const lo2 = Math.min(a, b);
  const hi2 = Math.max(a, b);
  const span = hi2 - lo2 || 1;
  const step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(lo2 / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi2 + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

// ── Axes & grid ──────────────────────────────────────────────────────────────────────────────────

export interface AxesOptions {
  color?: string;
  gridColor?: string;
  ink?: string;
  xTicks?: number[];
  yTicks?: number[];
  grid?: boolean;
  xLabel?: string;
  yLabel?: string;
  fmt?: NumberFormat;
  fontPx?: number;
  p?: number; // reveal 0..1 (axes wipe in)
}

function tickDecimals(values: number[]): number {
  for (let decimals = 0; decimals <= 3; decimals++) {
    const scale = 10 ** decimals;
    if (values.every((value) => Math.abs(value * scale - Math.round(value * scale)) < 1e-7)) return decimals;
  }
  return 3;
}

export function axes(ctx: CanvasRenderingContext2D, plot: Plot, o: AxesOptions = {}) {
  const color = o.color ?? "#5b6b78";
  const gridColor = o.gridColor ?? "rgba(255,255,255,0.06)";
  const ink = o.ink ?? "#93a4b0";
  const font = `${o.fontPx ?? 11}px -apple-system, sans-serif`;
  const p = clamp01(o.p ?? 1);
  const xTicks = o.xTicks ?? niceTicks(plot.xDomain);
  const yTicks = o.yTicks ?? niceTicks(plot.yDomain);
  ctx.save();
  ctx.globalAlpha *= p;
  // grid
  if (o.grid) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (const v of xTicks) {
      ctx.beginPath();
      ctx.moveTo(plot.sx(v), plot.y);
      ctx.lineTo(plot.sx(v), plot.y + plot.h);
      ctx.stroke();
    }
    for (const v of yTicks) {
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.sy(v));
      ctx.lineTo(plot.x + plot.w, plot.sy(v));
      ctx.stroke();
    }
  }
  // axis lines
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();
  // tick labels
  ctx.fillStyle = ink;
  ctx.font = font;
  ctx.textAlign = "center";
  const xFormat = o.fmt ?? { decimals: tickDecimals(xTicks) };
  const yFormat = o.fmt ?? { decimals: tickDecimals(yTicks) };
  for (const v of xTicks) ctx.fillText(formatNumber(v, xFormat), plot.sx(v), plot.y + plot.h + 16);
  ctx.textAlign = "right";
  for (const v of yTicks) ctx.fillText(formatNumber(v, yFormat), plot.x - 8, plot.sy(v) + 4);
  // axis titles
  if (o.xLabel) {
    ctx.textAlign = "center";
    ctx.fillStyle = ink;
    ctx.fillText(o.xLabel, plot.x + plot.w / 2, plot.y + plot.h + 34);
  }
  if (o.yLabel) {
    ctx.save();
    ctx.translate(plot.x - 40, plot.y + plot.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText(o.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

// ── Function plotting ──────────────────────────────────────────────────────────────────────────────

/** Draw y = fn(x) across the x-domain, revealing the first `p` fraction (draw-on). */
export function plotFunction(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  fn: (x: number) => number,
  p: number,
  opts: { color?: string; width?: number; samples?: number } = {},
) {
  const samples = opts.samples ?? 120;
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = lerp(plot.xDomain[0], plot.xDomain[1], i / samples);
    pts.push([plot.sx(x), plot.sy(fn(x))]);
  }
  strokeOn(ctx, pts, p, { color: opts.color ?? "#5cc8ae", width: opts.width ?? 2.5 });
}

// ── Bar chart ────────────────────────────────────────────────────────────────────────────────────

export interface Datum {
  label: string;
  value: number;
  color?: string;
}

export interface BarOptions {
  t: number;
  start?: number;
  step?: number;
  dur?: number;
  color?: string;
  ink?: string;
  gap?: number; // fraction of slot that is gap (0..1)
  showValues?: boolean;
  fmt?: NumberFormat;
}

/** Bars grow up from the baseline in a staggered cascade. Values from the plot's yDomain. */
export function barChart(ctx: CanvasRenderingContext2D, plot: Plot, data: Datum[], o: BarOptions) {
  const gap = o.gap ?? 0.35;
  const slot = plot.w / data.length;
  const bw = slot * (1 - gap);
  const step = o.step ?? 0.15;
  const dur = o.dur ?? 0.5;
  const base = plot.sy(plot.yDomain[0]);
  ctx.save();
  ctx.font = "600 11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  data.forEach((d, i) => {
    const gp = clamp01((o.t - (o.start ?? 0) - i * step) / dur);
    if (gp <= 0) return;
    const full = plot.sy(d.value);
    const top = Math.min(base, lerp(base, full, gp)); // clamp so out-of-domain (below baseline) values don't invert the bar
    ctx.fillStyle = d.color ?? o.color ?? "#5cc8ae";
    ctx.globalAlpha = 1;
    const bx = plot.x + i * slot + (slot - bw) / 2;
    ctx.beginPath();
    ctx.roundRect(bx, top, bw, base - top, [4, 4, 0, 0]);
    ctx.fill();
    ctx.fillStyle = o.ink ?? "#93a4b0";
    ctx.fillText(d.label, bx + bw / 2, base + 16);
    if (o.showValues) {
      ctx.fillStyle = o.ink ?? "#cdd8e2";
      ctx.globalAlpha = gp;
      ctx.fillText(formatNumber(d.value, o.fmt), bx + bw / 2, top - 6);
      ctx.globalAlpha = 1;
    }
  });
  ctx.restore();
}

// ── Line / area chart ──────────────────────────────────────────────────────────────────────────────

export interface LineOptions {
  color?: string;
  width?: number;
  area?: boolean; // fill under the line
  areaColor?: string;
  markers?: boolean;
  markerColor?: string;
}

/** A line series bound to [x,y] data, drawing on to `p`, with optional area fill + markers. */
export function lineChart(ctx: CanvasRenderingContext2D, plot: Plot, series: [number, number][], p: number, o: LineOptions = {}) {
  const pts: Pt[] = series.map(([x, y]) => [plot.sx(x), plot.sy(y)]);
  const P = clamp01(p);
  if (o.area && P > 0) {
    // area fill under the revealed portion
    const shown = Math.max(2, Math.ceil(pts.length * P));
    const sub = pts.slice(0, shown);
    const areaBase = plot.sy(plot.yDomain[0]); // fill to the value-baseline, not the plot floor
    ctx.save();
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = o.areaColor ?? "rgba(92,200,174,0.18)";
    ctx.beginPath();
    ctx.moveTo(sub[0][0], areaBase);
    for (const pt of sub) ctx.lineTo(pt[0], pt[1]);
    ctx.lineTo(sub[sub.length - 1][0], areaBase);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  strokeOn(ctx, pts, P, { color: o.color ?? "#5cc8ae", width: o.width ?? 2.5 });
  if (o.markers) {
    const shown = Math.ceil(pts.length * P);
    ctx.save();
    ctx.fillStyle = o.markerColor ?? o.color ?? "#5cc8ae";
    for (let i = 0; i < shown && i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 3, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Scatter points appearing in a staggered cascade. */
export function scatter(ctx: CanvasRenderingContext2D, plot: Plot, points: [number, number][], t: number, o: { color?: string; r?: number; start?: number; step?: number } = {}) {
  const step = o.step ?? 0.03;
  ctx.save();
  ctx.fillStyle = o.color ?? "#e8a13c";
  points.forEach(([x, y], i) => {
    const gp = clamp01((t - (o.start ?? 0) - i * step) / 0.3);
    if (gp <= 0) return;
    ctx.globalAlpha = gp;
    ctx.beginPath();
    ctx.arc(plot.sx(x), plot.sy(y), (o.r ?? 4) * gp, 0, 7);
    ctx.fill();
  });
  ctx.restore();
}

// ── Pie / donut ──────────────────────────────────────────────────────────────────────────────────

export interface PieOptions {
  donut?: number; // inner radius fraction (0 = pie, 0.6 = donut)
  labels?: boolean;
  ink?: string;
  startAngle?: number;
}

/** Pie/donut wedges sweep in as `p` 0→1 (proportional to each datum's share). */
export function pie(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, data: Datum[], p: number, o: PieOptions = {}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const P = clamp01(p);
  const inner = (o.donut ?? 0) * r;
  let a = o.startAngle ?? -Math.PI / 2;
  const palette = ["#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b", "#a06be8", "#38ef7d"];
  ctx.save();
  data.forEach((d, i) => {
    const frac = d.value / total;
    const sweep = frac * Math.PI * 2 * P;
    ctx.fillStyle = d.color ?? palette[i % palette.length];
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.arc(cx, cy, r, a, a + sweep);
    if (inner > 0) ctx.arc(cx, cy, inner, a + sweep, a, true);
    else ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    if (o.labels && P > 0.7) {
      const mid = a + sweep / 2;
      const lr = (r + inner) / 2;
      ctx.fillStyle = "#0e141a";
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.globalAlpha = clamp01((P - 0.7) / 0.3);
      ctx.fillText(`${Math.round(frac * 100)}%`, cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr + 4);
      ctx.globalAlpha = 1;
    }
    a += frac * Math.PI * 2;
  });
  ctx.restore();
}
