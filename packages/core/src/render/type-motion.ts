/**
 * type-motion — kinetic typography: text and numbers as animated citizens. Counters/number tickers,
 * word-by-word / typewriter reveals, big-number "slams", scramble/decode, and text-along-a-path.
 * Pure value/format helpers + themed draw helpers. All deterministic and seekable.
 */
import { clamp01, easeOutBack, easeOutCubic, lerp, prng } from "../slides/anim";
import { flashAlpha } from "./sequence";
import { pointAt, type Pt } from "./strokes";

// ── Values & formatting (pure) ────────────────────────────────────────────────────────────────────

/** Eased interpolation from→to over [at, at+dur], clamped. */
export function counterValue(t: number, at: number, dur: number, from: number, to: number, ease: (p: number) => number = easeOutCubic): number {
  return from + (to - from) * ease(clamp01((t - at) / dur));
}

export interface NumberFormat {
  decimals?: number;
  commas?: boolean;
  prefix?: string;
  suffix?: string;
}

export function formatNumber(n: number, opts: NumberFormat = {}): string {
  const { decimals = 0, commas = true, prefix = "", suffix = "" } = opts;
  const fixed = Math.abs(n).toFixed(decimals);
  const neg = n < 0 && Number(fixed) !== 0; // avoid "-0" when rounding brings a small negative to zero
  let body = fixed;
  if (commas) {
    const [int, frac] = fixed.split(".");
    const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    body = frac ? `${withCommas}.${frac}` : withCommas;
  }
  return `${neg ? "-" : ""}${prefix}${body}${suffix}`;
}

export const formatCurrency = (n: number, symbol = "$", decimals = 0) => formatNumber(n, { decimals, prefix: symbol });
export const formatPercent = (n: number, decimals = 0) => formatNumber(n, { decimals, suffix: "%" });

/** First ceil(p·wordCount) words of the text. */
export function wordsShown(text: string, p: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, Math.ceil(clamp01(p) * words.length)).join(" ");
}

/** First round(p·length) characters. */
export function charsShown(text: string, p: number): string {
  return text.slice(0, Math.round(clamp01(p) * text.length));
}

/** Scramble→resolve: characters lock into place left-to-right as p 0→1; unresolved chars are random. */
export function scrambleText(text: string, p: number, seed = 1): string {
  const P = clamp01(p);
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@";
  const locked = Math.floor(P * text.length);
  const rnd = prng(seed + Math.floor(P * 60)); // re-roll ~per frame-tick, deterministic
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (i < locked || c === " ") out += c;
    else out += glyphs[Math.floor(rnd() * glyphs.length)];
  }
  return out;
}

// ── Draw helpers ──────────────────────────────────────────────────────────────────────────────────

interface TextStyle {
  font: string;
  color: string;
  align?: CanvasTextAlign;
  alpha?: number;
}

/** A counting number. Value comes from counterValue; formatting via NumberFormat. */
export function drawCounter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: number,
  style: TextStyle,
  fmt: NumberFormat = {},
) {
  ctx.save();
  ctx.globalAlpha *= clamp01(style.alpha ?? 1);
  ctx.fillStyle = style.color;
  ctx.font = style.font;
  ctx.textAlign = style.align ?? "center";
  ctx.fillText(formatNumber(value, fmt), x, y);
  ctx.restore();
}

/** Typewriter: reveals `charsShown(text, p)` with an optional blinking cursor. */
export function drawTypewriter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: number, style: TextStyle, opts: { cursor?: boolean; t?: number } = {}) {
  const shown = charsShown(text, p);
  ctx.save();
  ctx.globalAlpha *= clamp01(style.alpha ?? 1);
  ctx.fillStyle = style.color;
  ctx.font = style.font;
  ctx.textAlign = style.align ?? "start";
  const cursor = opts.cursor && p < 1 && (opts.t === undefined || Math.floor(opts.t * 2) % 2 === 0) ? "|" : "";
  ctx.fillText(shown + cursor, x, y);
  ctx.restore();
}

export type WordMode = "fade" | "rise" | "pop";

/** Word-by-word reveal with per-word staggered entrance (fade / rise-up / pop). Left-aligned from x. */
export function drawWordReveal(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  t: number,
  style: TextStyle,
  opts: { start?: number; step?: number; dur?: number; mode?: WordMode; space?: number } = {},
) {
  const words = text.split(/\s+/).filter(Boolean);
  const start = opts.start ?? 0;
  const step = opts.step ?? 0.12;
  const dur = opts.dur ?? 0.35;
  const mode = opts.mode ?? "rise";
  ctx.save();
  ctx.font = style.font;
  ctx.textAlign = "start";
  ctx.fillStyle = style.color;
  const space = opts.space ?? ctx.measureText(" ").width;
  let cx = x;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const p = easeOutCubic(clamp01((t - (start + i * step)) / dur));
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01((style.alpha ?? 1) * p);
      let dy = 0;
      let scale = 1;
      if (mode === "rise") dy = (1 - p) * 14;
      if (mode === "pop") scale = easeOutBack(p);
      const wWidth = ctx.measureText(w).width;
      if (scale !== 1) {
        ctx.translate(cx + wWidth / 2, y);
        ctx.scale(scale, scale);
        ctx.translate(-(cx + wWidth / 2), -y);
      }
      ctx.fillText(w, cx, y + dy);
      ctx.restore();
    }
    cx += ctx.measureText(w).width + space;
  }
  ctx.restore();
}

/** Big-number / date "slam": text enters oversized and settles to full size with an overshoot + flash. */
export function drawSlam(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  t: number,
  at: number,
  style: TextStyle,
  opts: { dur?: number; from?: number } = {},
) {
  const dur = opts.dur ?? 0.55;
  const p = clamp01((t - at) / dur);
  if (p <= 0) return;
  const scale = lerp(opts.from ?? 1.8, 1, easeOutBack(p));
  ctx.save();
  ctx.globalAlpha *= clamp01((style.alpha ?? 1) * clamp01(p * 3));
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.fillStyle = style.color;
  ctx.font = style.font;
  ctx.textAlign = "center";
  ctx.fillText(text, 0, 0);
  ctx.restore();
  // impact flash ring
  const fa = flashAlpha(t, at + dur * 0.55, 0.2);
  if (fa > 0) {
    ctx.save();
    ctx.globalAlpha *= fa;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 60 + (1 - fa) * 60, 0, 7);
    ctx.stroke();
    ctx.restore();
  }
}

/** Decode/scramble reveal in place. */
export function drawScramble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, at: number, style: TextStyle, opts: { dur?: number; seed?: number } = {}) {
  const dur = opts.dur ?? 1;
  const p = clamp01((t - at) / dur);
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(style.alpha ?? 1);
  ctx.fillStyle = style.color;
  ctx.font = style.font;
  ctx.textAlign = style.align ?? "center";
  ctx.fillText(scrambleText(text, p, opts.seed ?? 1), x, y);
  ctx.restore();
}

/** Lay text glyph-by-glyph along a path, revealing the first `p` fraction. */
export function drawTextAlongPath(ctx: CanvasRenderingContext2D, text: string, points: Pt[], p: number, style: TextStyle, opts: { spacing?: number } = {}) {
  ctx.save();
  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const spacing = opts.spacing ?? 1;
  const shown = Math.round(clamp01(p) * text.length);
  for (let i = 0; i < shown; i++) {
    const frac = (text.length <= 1 ? 0 : i / (text.length - 1)) * spacing;
    const at = pointAt(points, clamp01(frac));
    ctx.save();
    ctx.globalAlpha = clamp01(style.alpha ?? 1);
    ctx.translate(at.x, at.y);
    ctx.rotate(at.angle);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}
