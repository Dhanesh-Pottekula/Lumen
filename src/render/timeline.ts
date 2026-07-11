/**
 * timeline — a timeline primitive: a date axis, eras (colored bands), events (markers + labels) on one
 * or more parallel tracks, and a moving playhead. Dates are plain numbers (years; negative = BCE).
 * Deterministic/seekable; reuses strokes (axis draw-on) and sequence stagger (event cascade).
 */
import { clamp01 } from "../slides/anim";
import { niceTicks } from "./charts";
import { strokeOn, type Pt } from "./strokes";

export interface Timeline {
  x: number;
  y: number;
  w: number;
  h: number;
  from: number;
  to: number;
  tracks: number;
  sx(date: number): number;
  trackY(track: number): number;
}

export function makeTimeline(area: { x: number; y: number; w: number; h: number }, from: number, to: number, tracks = 1): Timeline {
  return {
    ...area,
    from,
    to,
    tracks,
    sx: (d) => area.x + ((d - from) / (to - from || 1)) * area.w,
    trackY: (i) => {
      const k = Math.max(0, Math.min(tracks - 1, i)); // clamp out-of-range track indices into the band
      return area.y + area.h * (tracks === 1 ? 0.5 : 0.28 + (k / Math.max(1, tracks - 1)) * 0.5);
    },
  };
}

/** Format a year with BCE/CE. */
export function formatYear(y: number): string {
  return y < 0 ? `${Math.abs(Math.round(y))} BCE` : `${Math.round(y)} CE`;
}

export interface AxisOptions {
  p?: number; // axis draw-on
  color?: string;
  ink?: string;
  ticks?: number[];
  fontPx?: number;
  baselineFrac?: number; // where the axis sits within h (default 0.5)
}

export function timelineAxis(ctx: CanvasRenderingContext2D, tl: Timeline, o: AxisOptions = {}) {
  const color = o.color ?? "#5b6b78";
  const ink = o.ink ?? "#93a4b0";
  const by = tl.y + tl.h * (o.baselineFrac ?? 0.5);
  const ticks = o.ticks ?? niceTicks([tl.from, tl.to], 6);
  // baseline draws on
  strokeOn(ctx, [[tl.x, by], [tl.x + tl.w, by]] as Pt[], clamp01(o.p ?? 1), { color, width: 2 });
  const p = clamp01(o.p ?? 1);
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.strokeStyle = color;
  ctx.fillStyle = ink;
  ctx.font = `${o.fontPx ?? 11}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  for (const v of ticks) {
    if (tl.sx(v) > tl.x + tl.w * p + 2) continue; // only reveal ticks the axis has reached
    ctx.beginPath();
    ctx.moveTo(tl.sx(v), by - 4);
    ctx.lineTo(tl.sx(v), by + 4);
    ctx.stroke();
    ctx.fillText(formatYear(v), tl.sx(v), by + 18);
  }
  ctx.restore();
}

export interface Era {
  from: number;
  to: number;
  label: string;
  color?: string;
  track?: number;
}

/** Colored era bands that grow in from their start edge as `p` 0→1. */
export function eras(ctx: CanvasRenderingContext2D, tl: Timeline, list: Era[], p: number, opts: { height?: number; start?: number; step?: number } = {}) {
  const P = clamp01(p);
  const palette = ["#2f6b57", "#8a5a2b", "#3a5a7a", "#6b3a5a"];
  const bh = opts.height ?? 22;
  const step = opts.step ?? 0.12;
  ctx.save();
  ctx.font = "600 11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  list.forEach((era, i) => {
    const ep = clamp01((P - i * step) / Math.max(1e-3, 1 - i * step));
    if (ep <= 0) return;
    const x0 = tl.sx(era.from);
    const x1 = tl.sx(era.to);
    const y = tl.trackY(era.track ?? 0) - bh / 2;
    ctx.globalAlpha = 0.9 * ep;
    ctx.fillStyle = era.color ?? palette[i % palette.length];
    ctx.beginPath();
    ctx.roundRect(x0, y, (x1 - x0) * ep, bh, 5);
    ctx.fill();
    if (ep > 0.6) {
      ctx.globalAlpha = clamp01((ep - 0.6) / 0.4);
      ctx.fillStyle = "#eef5ef";
      ctx.fillText(era.label, (x0 + x1) / 2, y + bh / 2 + 4);
    }
  });
  ctx.restore();
}

export interface TimelineEvent {
  at: number;
  label: string;
  track?: number;
  color?: string;
  above?: boolean; // label above (default) or below the marker
}

/** Event markers (pin + dot) with labels appearing in a staggered cascade. */
export function events(ctx: CanvasRenderingContext2D, tl: Timeline, list: TimelineEvent[], t: number, opts: { start?: number; step?: number; ink?: string } = {}) {
  const step = opts.step ?? 0.25;
  const start = opts.start ?? 0;
  ctx.save();
  ctx.font = "600 11px -apple-system, sans-serif";
  ctx.textAlign = "center";
  list.forEach((ev, i) => {
    const ep = clamp01((t - start - i * step) / 0.4);
    if (ep <= 0) return;
    const x = tl.sx(ev.at);
    const baseY = tl.trackY(ev.track ?? 0);
    const stem = 26 * ep;
    const dir = ev.above === false ? 1 : -1;
    ctx.globalAlpha = ep;
    ctx.strokeStyle = ev.color ?? "#e8a13c";
    ctx.fillStyle = ev.color ?? "#e8a13c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + dir * stem);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, baseY, 3.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = opts.ink ?? "#eef5ef";
    ctx.fillText(ev.label, x, baseY + dir * (stem + (dir < 0 ? 4 : 12)));
  });
  ctx.restore();
}

/** A vertical playhead at `atDate` with a handle — the "now" marker sweeping the timeline. */
export function playhead(ctx: CanvasRenderingContext2D, tl: Timeline, atDate: number, opts: { color?: string; label?: boolean } = {}) {
  const x = tl.sx(atDate);
  const color = opts.color ?? "#5cc8ae";
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, tl.y);
  ctx.lineTo(x, tl.y + tl.h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 6, tl.y);
  ctx.lineTo(x + 6, tl.y);
  ctx.lineTo(x, tl.y + 8);
  ctx.closePath();
  ctx.fill();
  if (opts.label) {
    ctx.fillStyle = "#0e141a";
    ctx.font = "700 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    const txt = formatYear(atDate);
    const tw = ctx.measureText(txt).width + 10;
    ctx.fillStyle = color;
    ctx.fillRect(x - tw / 2, tl.y - 18, tw, 15);
    ctx.fillStyle = "#0e141a";
    ctx.fillText(txt, x, tl.y - 7);
  }
  ctx.restore();
}
