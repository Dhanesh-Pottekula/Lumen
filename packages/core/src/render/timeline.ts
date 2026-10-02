/**
 * timeline — a timeline primitive: a date axis, eras (colored bands), events (markers + labels) on one
 * or more parallel tracks, and a moving playhead. Dates are plain numbers (years; negative = BCE).
 * Deterministic/seekable; reuses strokes (axis draw-on) and sequence stagger (event cascade).
 */
import { clamp01 } from "../slides/anim";
import { MIN_TEXT } from "../gcl/viewport";
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

/** Format a year; the era is written only when the axis reaches into BCE, so 1857 stays 1857. */
export function formatYear(y: number, era = false): string {
  if (y < 0) return `${Math.abs(Math.round(y))} BCE`;
  // A fraction is the time into that year (1939.67 is September 1939), so the year is never rounded up.
  const year = Math.floor(y + 1e-6);
  return era ? `${year} CE` : `${year}`;
}

/** Whole-year ticks: a short span marks every year, a long one at a nice step, never two ticks one label. */
function yearTicks(from: number, to: number, count: number): number[] {
  const lo = Math.ceil(Math.min(from, to));
  const hi = Math.floor(Math.max(from, to));
  if (hi - lo < count) {
    const out: number[] = [];
    for (let y = lo; y <= hi; y++) out.push(y);
    return out;
  }
  return niceTicks([from, to], count).filter((v) => Number.isInteger(v));
}

export interface AxisOptions {
  p?: number; // axis draw-on
  color?: string;
  ink?: string;
  ticks?: number[];
  fontPx?: number;
  baselineFrac?: number; // where the axis sits within h (default 0.5)
  /** A span of x the tick labels leave clear, where the playhead writes its own year. */
  clear?: [number, number];
}

/** Every other tick dropped until no two labels touch: a long span at phone size printed years into each other. */
function spacedTicks(ctx: CanvasRenderingContext2D, tl: Timeline, ticks: number[], era: boolean): number[] {
  const widest = Math.max(0, ...ticks.map((v) => ctx.measureText(formatYear(v, era)).width));
  // Measured where the labels are written, since the two at the ends are pulled inside the axis.
  const at = (v: number) => Math.min(Math.max(tl.sx(v), tl.x + widest / 2), tl.x + tl.w - widest / 2);
  let kept = ticks;
  while (kept.length > 2 && kept.some((v, i) => i > 0 && Math.abs(at(v) - at(kept[i - 1])) < widest + 12)) {
    kept = kept.filter((_, i) => i % 2 === 0);
  }
  return kept;
}

export function timelineAxis(ctx: CanvasRenderingContext2D, tl: Timeline, o: AxisOptions = {}) {
  const color = o.color ?? "#5b6b78";
  const ink = o.ink ?? "#93a4b0";
  const by = tl.y + tl.h * (o.baselineFrac ?? 0.5);
  const era = Math.min(tl.from, tl.to) < 0;
  // baseline draws on
  strokeOn(ctx, [[tl.x, by], [tl.x + tl.w, by]] as Pt[], clamp01(o.p ?? 1), { color, width: 2 });
  const p = clamp01(o.p ?? 1);
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.strokeStyle = color;
  ctx.fillStyle = ink;
  ctx.font = `${o.fontPx ?? MIN_TEXT}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  const ticks = o.ticks ?? spacedTicks(ctx, tl, yearTicks(tl.from, tl.to, 6), era);
  for (const v of ticks) {
    if (tl.sx(v) > tl.x + tl.w * p + 2) continue; // only reveal ticks the axis has reached
    ctx.beginPath();
    ctx.moveTo(tl.sx(v), by - 4);
    ctx.lineTo(tl.sx(v), by + 4);
    ctx.stroke();
    // A tick at either end of the axis is pulled back inside it rather than cut off at the frame.
    const label = formatYear(v, era);
    const half = ctx.measureText(label).width / 2;
    const x = Math.min(Math.max(tl.sx(v), tl.x + half), tl.x + tl.w - half);
    if (o.clear && x + half > o.clear[0] - 4 && x - half < o.clear[1] + 4) continue;
    ctx.fillText(label, x, by + 24);
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
  const bh = opts.height ?? MIN_TEXT + 8;
  const step = opts.step ?? 0.12;
  ctx.save();
  ctx.font = `600 ${MIN_TEXT}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  list.forEach((era, i) => {
    const ep = clamp01((P - i * step) / Math.max(1e-3, 1 - i * step));
    if (ep <= 0) return;
    const x0 = tl.sx(era.from);
    const x1 = tl.sx(era.to);
    const y = tl.trackY(era.track ?? 0) - bh / 2;
    const bar = era.color ?? palette[i % palette.length];
    // Opaque, so the name printed on it is read against the bar's own colour and nothing under it.
    ctx.globalAlpha = ep;
    ctx.fillStyle = bar;
    ctx.beginPath();
    ctx.roundRect(x0, y, (x1 - x0) * ep, bh, 5);
    ctx.fill();
    if (ep > 0.6) {
      ctx.globalAlpha = clamp01((ep - 0.6) / 0.4);
      ctx.fillStyle = contrastInk(bar);
      ctx.fillText(era.label, (x0 + x1) / 2, y + bh / 2 + MIN_TEXT * 0.35);
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
  ctx.font = `600 ${MIN_TEXT}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  const spots = labelSpots(ctx, tl, list);
  list.forEach((ev, i) => {
    const ep = clamp01((t - start - i * step) / 0.4);
    if (ep <= 0) return;
    const x = tl.sx(ev.at);
    const baseY = tl.trackY(ev.track ?? 0);
    const { dir, reach, labelX } = spots[i];
    const stem = reach * ep;
    ctx.globalAlpha = ep;
    ctx.strokeStyle = ev.color ?? "#e8a13c";
    ctx.fillStyle = ev.color ?? "#e8a13c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, baseY + dir * stem);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, baseY, 4, 0, 7);
    ctx.fill();
    ctx.fillStyle = opts.ink ?? "#eef5ef";
    ctx.fillText(ev.label, labelX, baseY + dir * (stem + (dir < 0 ? 5 : MIN_TEXT + 2)));
  });
  ctx.restore();
}

/**
 * Where each event's label goes: above the axis on its own stem, or — when that would print over a
 * label already placed — below it, then further out, so events close in time never share a spot.
 */
function labelSpots(ctx: CanvasRenderingContext2D, tl: Timeline, list: TimelineEvent[]) {
  const placed: { x0: number; x1: number; dir: number; reach: number }[] = [];
  return list.map((ev) => {
    const width = ctx.measureText(ev.label).width;
    const half = width / 2;
    // A label at either end of the axis is pulled back inside it rather than cut off at the frame.
    const labelX = Math.min(Math.max(tl.sx(ev.at), tl.x + half), tl.x + tl.w - half);
    const [x0, x1] = [labelX - half - 4, labelX + half + 4];
    const preferred = ev.above === false ? 1 : -1;
    for (let tier = 0; ; tier++) {
      const dir = tier % 2 === 0 ? preferred : -preferred;
      const reach = 26 + Math.floor(tier / 2) * 20;
      const clash = placed.some((spot) => spot.dir === dir && spot.reach === reach && spot.x0 < x1 && x0 < spot.x1);
      if (!clash || tier >= 7) {
        placed.push({ x0, x1, dir, reach });
        return { dir, reach, labelX };
      }
    }
  });
}

/** Where the playhead writes its year: in the tick row under the axis, so it never leaves the timeline's box. */
export function playheadChip(ctx: CanvasRenderingContext2D, tl: Timeline, atDate: number, baselineFrac = 0.5) {
  ctx.save();
  ctx.font = `700 ${MIN_TEXT}px -apple-system, sans-serif`;
  const w = ctx.measureText(formatYear(atDate)).width + 12;
  ctx.restore();
  const x = Math.min(Math.max(tl.sx(atDate), tl.x + w / 2), tl.x + tl.w - w / 2);
  return { x: x - w / 2, y: tl.y + tl.h * baselineFrac + 7, w, h: MIN_TEXT + 6 };
}

/** A vertical playhead at `atDate` with a handle — the "now" marker sweeping the timeline. */
export function playhead(ctx: CanvasRenderingContext2D, tl: Timeline, atDate: number, opts: { color?: string; label?: boolean } = {}) {
  const x = tl.sx(atDate);
  const color = opts.color ?? "#5cc8ae";
  const chip = opts.label ? playheadChip(ctx, tl, atDate) : undefined;
  // Only the axis and the tick row are marked: a line the timeline's height ran through the event names above it.
  const top = tl.y + tl.h * 0.5 - 12;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, chip ? chip.y : tl.y + tl.h);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 6, top);
  ctx.lineTo(x + 6, top);
  ctx.lineTo(x, top + 8);
  ctx.closePath();
  ctx.fill();
  if (chip) {
    ctx.font = `700 ${MIN_TEXT}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.beginPath();
    ctx.roundRect(chip.x, chip.y, chip.w, chip.h, 4);
    ctx.fill();
    ctx.fillStyle = contrastInk(color);
    ctx.fillText(formatYear(atDate), chip.x + chip.w / 2, chip.y + chip.h / 2 + MIN_TEXT * 0.35);
  }
  ctx.restore();
}

/** Near-black or white, whichever has the higher contrast on `fill`: a fixed ink vanished on one bar or another. */
function contrastInk(fill: string): string {
  const hex = fill.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (!Number.isFinite(light)) return "#0e141a";
  // Against #0e141a (luminance 0.0066) and white (1).
  return (light + 0.05) / 0.0566 >= 1.05 / (light + 0.05) ? "#0e141a" : "#ffffff";
}
