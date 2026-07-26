/**
 * focus — attention direction: isolate, mark, point at, de-emphasize, magnify, and motion-emphasize
 * a target. Directing the eye is the #1 teaching skill, so this is a broad but small toolkit that
 * reuses earlier steps: reveal's `masked`, stroke arrowheads, and motion oscillators.
 *
 * Everything is a pure function of `t` / progress `p`, so it stays deterministic and seekable.
 *
 *   isolate       → dimExcept, spotlightFocus
 *   mark          → highlightRing, focusRings, flash, focusBox, indicate
 *   point         → pointerArrow, bouncePointer
 *   de-emphasize  → ghost, emphasizeSurround (desaturate/blur the surround)
 *   magnify       → magnify (loupe)
 *   motion        → wiggle, pulseScale
 */
import { clamp01, lerp, wobble } from "./motion";
import { masked } from "./reveal";
import { pointAt, type Pt } from "./strokes";
import { arrowhead, drawOn } from "./strokeVerbs";

// pure helpers (kept for continuity / testing)
export const ringRadius = (base: number, p: number) => base + clamp01(p) * base * 0.6;
export const scrimAlpha = (p: number) => 1 - clamp01(p);

const ACCENT = "#ffd24a";

// ── Isolate ─────────────────────────────────────────────────────────────────────────────────────

export type Hole =
  | { cx: number; cy: number; r: number }
  | { x: number; y: number; w: number; h: number; corner?: number };

export interface DimOptions {
  intensity?: number; // scrim darkness 0..1 (default 0.6)
  color?: string; // scrim color (default near-black)
  feather?: number; // soft hole edge in view units (default 24)
}

/**
 * Darken the whole view except one or more holes (circles or rounded rects) — the spotlight/coach-mark
 * scrim. MUST be drawn on an isolated, initially-transparent layer (e.g. `frame.layer.ctx("fx")`), so
 * the `destination-out` holes cut the scrim, not the scene beneath.
 */
export function dimExcept(ctx: CanvasRenderingContext2D, holes: Hole[], opts: DimOptions = {}) {
  const intensity = opts.intensity ?? 0.6;
  if (intensity <= 0) return;
  const feather = opts.feather ?? 24;
  const dpr = ctx.getTransform?.().a || 1;
  ctx.save();
  ctx.globalAlpha = clamp01(intensity);
  ctx.fillStyle = opts.color ?? "#0b0f14";
  ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  ctx.globalCompositeOperation = "destination-out";
  for (const hole of holes) {
    if ("r" in hole) {
      const g = ctx.createRadialGradient(hole.cx, hole.cy, Math.max(0, hole.r - feather), hole.cx, hole.cy, hole.r);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hole.cx, hole.cy, hole.r, 0, 7);
      ctx.fill();
    } else {
      ctx.save();
      if (feather) ctx.filter = `blur(${feather * dpr * 0.4}px)`;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.roundRect(hole.x, hole.y, hole.w, hole.h, hole.corner ?? 8);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Single-circle spotlight scrim convenience. Draw on an isolated layer. */
export function spotlightFocus(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, opts: DimOptions = {}) {
  dimExcept(ctx, [{ cx, cy, r }], opts);
}

// ── Mark ────────────────────────────────────────────────────────────────────────────────────────

export interface RingOptions {
  color?: string;
  width?: number;
  amp?: number; // pulse amplitude in view units (0 = steady)
  period?: number; // pulse period seconds
  alpha?: number;
}

/** A ring around a target that gently pulses in radius — a persistent "look here" marker. */
export function highlightRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, opts: RingOptions = {}) {
  const rr = r + wobble(t, opts.period ?? 1.4, opts.amp ?? 4);
  ctx.save();
  ctx.globalAlpha = clamp01(opts.alpha ?? 1);
  ctx.strokeStyle = opts.color ?? ACCENT;
  ctx.lineWidth = opts.width ?? 3;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, 7);
  ctx.stroke();
  ctx.restore();
}

export interface FocusRingsOptions {
  count?: number;
  maxR?: number;
  targetR?: number;
  color?: string;
  width?: number;
}

/** Manim-style "FocusOn": concentric rings that converge onto the target as p 0→1, then fade. */
export function focusRings(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, opts: FocusRingsOptions = {}) {
  const count = opts.count ?? 3;
  const maxR = opts.maxR ?? 120;
  const targetR = opts.targetR ?? 10;
  const P = clamp01(p);
  ctx.save();
  ctx.strokeStyle = opts.color ?? ACCENT;
  ctx.lineWidth = opts.width ?? 2.5;
  for (let i = 0; i < count; i++) {
    const rp = clamp01(P - i * 0.08);
    if (rp <= 0) continue;
    const r = lerp(maxR, targetR, rp);
    ctx.globalAlpha = Math.sin(rp * Math.PI); // appear then fade as it lands
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.stroke();
  }
  ctx.restore();
}

/** A quick additive radial flash that fades as p→1 — a beat of emphasis. */
export function flash(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, p: number, opts: { color?: string } = {}) {
  const a = 1 - clamp01(p);
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, opts.color ?? "rgba(255,240,180,0.9)");
  g.addColorStop(1, "rgba(255,240,180,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.fill();
  ctx.restore();
}

export interface FocusBoxOptions {
  color?: string;
  width?: number;
  pad?: number;
  corner?: number;
  amp?: number; // breathing amplitude (0 = static)
  period?: number;
  dash?: number[];
  dashSpin?: number; // marching-ants speed (px/sec); 0 = still
}

/** An animated box around a target rect (padding + optional breathing + marching-ant dashes). */
export function focusBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, opts: FocusBoxOptions = {}) {
  const pad = (opts.pad ?? 6) + wobble(t, opts.period ?? 1.4, opts.amp ?? 2);
  ctx.save();
  ctx.strokeStyle = opts.color ?? ACCENT;
  ctx.lineWidth = opts.width ?? 2.5;
  if (opts.dash) {
    ctx.setLineDash(opts.dash);
    if (opts.dashSpin) ctx.lineDashOffset = -t * opts.dashSpin;
  }
  ctx.beginPath();
  ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, opts.corner ?? 8);
  ctx.stroke();
  ctx.restore();
}

/** Manim-style "Indicate": briefly scale + tint a target (via a draw callback) to call it out. */
export function indicate(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, draw: (c: CanvasRenderingContext2D) => void, opts: { scale?: number } = {}) {
  const bump = Math.sin(clamp01(p) * Math.PI); // 0→1→0
  const s = 1 + (opts.scale ?? 0.18) * bump;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  draw(ctx);
  ctx.restore();
}

// ── Point ───────────────────────────────────────────────────────────────────────────────────────

/** A draw-on arrow from a source point to the target, with the head appearing on arrival. */
export function pointerArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  p: number,
  opts: { color?: string; width?: number; size?: number } = {},
) {
  const pts: Pt[] = [
    [fromX, fromY],
    [toX, toY],
  ];
  const P = clamp01(p);
  drawOn(ctx, pts, P, { style: { color: opts.color ?? ACCENT, width: opts.width ?? 3 } });
  const tip = pointAt(pts, P);
  arrowhead(ctx, tip, { size: opts.size ?? 12, color: opts.color ?? ACCENT, alpha: clamp01((P - 0.85) / 0.15) });
}

/** A triangle pointer above the target that bounces to draw the eye. */
export function bouncePointer(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, opts: { size?: number; color?: string; gap?: number } = {}) {
  const size = opts.size ?? 16;
  const b = Math.abs(Math.sin(t * 3)) * 8;
  ctx.save();
  ctx.fillStyle = opts.color ?? ACCENT;
  ctx.translate(x, y - (opts.gap ?? 22) - b);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.6);
  ctx.lineTo(-size * 0.5, -size * 0.4);
  ctx.lineTo(size * 0.5, -size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── De-emphasize ──────────────────────────────────────────────────────────────────────────────────

/** Draw `draw` at reduced opacity — ghost non-focal content. */
export function ghost(ctx: CanvasRenderingContext2D, alpha: number, draw: (c: CanvasRenderingContext2D) => void) {
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  draw(ctx);
  ctx.restore();
}

/**
 * Draw the scene crisp, then overlay a filtered (grayscale/blurred) copy everywhere EXCEPT the focus
 * shape — de-emphasizing the surround while keeping the focus sharp. `drawScene` must be a pure
 * re-render (it is called twice).
 */
export function emphasizeSurround(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  focusPath: (c: CanvasRenderingContext2D) => void,
  drawScene: (c: CanvasRenderingContext2D) => void,
  opts: { filter?: string } = {},
) {
  drawScene(ctx);
  const filter = opts.filter ?? "grayscale(1) brightness(0.85)";
  masked(
    ctx,
    viewW,
    viewH,
    (b) => {
      b.filter = filter;
      drawScene(b);
      b.filter = "none";
    },
    (m) => {
      m.beginPath();
      focusPath(m);
      m.fill();
    },
    { invert: true },
  );
}

// ── Magnify ─────────────────────────────────────────────────────────────────────────────────────

/** A circular loupe at (cx,cy) that redraws the scene scaled up by `zoom`, with a lens ring. */
export function magnify(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  zoom: number,
  drawScene: (c: CanvasRenderingContext2D) => void,
  opts: { ringColor?: string | null; ringWidth?: number } = {},
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);
  drawScene(ctx);
  ctx.restore();
  if (opts.ringColor !== null) {
    ctx.save();
    ctx.strokeStyle = opts.ringColor ?? "#eef5ef";
    ctx.lineWidth = opts.ringWidth ?? 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Motion emphasis ───────────────────────────────────────────────────────────────────────────────

/** Wrap a draw in a small rotational jiggle about (cx,cy) — a "look at me" wiggle. */
export function wiggle(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, draw: (c: CanvasRenderingContext2D) => void, opts: { amp?: number; freq?: number } = {}) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * (opts.freq ?? 8)) * (opts.amp ?? 0.05));
  ctx.translate(-cx, -cy);
  draw(ctx);
  ctx.restore();
}

/** Wrap a draw in a scale pulse about (cx,cy) — a heartbeat of emphasis. */
export function pulseScale(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, draw: (c: CanvasRenderingContext2D) => void, opts: { amp?: number; period?: number } = {}) {
  const s = 1 + wobble(t, opts.period ?? 0.8, opts.amp ?? 0.06);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  draw(ctx);
  ctx.restore();
}

// ── More markers & pointers ───────────────────────────────────────────────────────────────────────

/** Manim-style "Flash": lines burst outward from a point like a spark, then fade as p→1. */
export function sparkFlash(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, opts: { count?: number; length?: number; inner?: number; color?: string; width?: number } = {}) {
  const a = 1 - clamp01(p);
  if (a <= 0) return;
  const n = opts.count ?? 12;
  const inner = opts.inner ?? 8;
  const len = (opts.length ?? 24) * clamp01(p * 1.4);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  ctx.strokeStyle = opts.color ?? "#fff4c0";
  ctx.lineWidth = opts.width ?? 2.5;
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(cx + c * inner, cy + s * inner);
    ctx.lineTo(cx + c * (inner + len), cy + s * (inner + len));
    ctx.stroke();
  }
  ctx.restore();
}

/** Four L-shaped corner brackets framing a target rect (camera-reticle look), optional snap-in via `p`. */
export function cornerBrackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts: { pad?: number; length?: number; color?: string; width?: number; p?: number } = {}) {
  const pad = opts.pad ?? 6;
  const L = opts.length ?? 16;
  const snap = clamp01(opts.p ?? 1);
  const off = (1 - snap) * 22;
  const x0 = x - pad - off;
  const y0 = y - pad - off;
  const x1 = x + w + pad + off;
  const y1 = y + h + pad + off;
  ctx.save();
  ctx.globalAlpha = snap;
  ctx.strokeStyle = opts.color ?? ACCENT;
  ctx.lineWidth = opts.width ?? 2.5;
  ctx.lineCap = "round";
  const corner = (px: number, py: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(px + dx * L, py);
    ctx.lineTo(px, py);
    ctx.lineTo(px, py + dy * L);
    ctx.stroke();
  };
  corner(x0, y0, 1, 1);
  corner(x1, y0, -1, 1);
  corner(x0, y1, 1, -1);
  corner(x1, y1, -1, -1);
  ctx.restore();
}

/** Several arrows around the target pointing inward, sliding toward it as p 0→1. */
export function convergingArrows(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, opts: { count?: number; ring?: number; targetR?: number; len?: number; color?: string; width?: number; rotation?: number } = {}) {
  const n = opts.count ?? 4;
  const ring = opts.ring ?? 90;
  const targetR = opts.targetR ?? 20;
  const len = opts.len ?? 26;
  const color = opts.color ?? ACCENT;
  const P = clamp01(p);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (opts.rotation ?? 0);
    const r = lerp(ring, targetR, P);
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const tip: Pt = [cx + c * r, cy + s * r];
    const tail: Pt = [cx + c * (r + len), cy + s * (r + len)];
    drawOn(ctx, [tail, tip], 1, { style: { color, width: opts.width ?? 3 } });
    arrowhead(ctx, { x: tip[0], y: tip[1], angle: Math.atan2(cy - tip[1], cx - tip[0]) }, { size: 10, color });
  }
}

/** Asymmetric edge vignette whose clear center sits on the focus — a soft cousin of the spotlight. */
export function vignetteTo(ctx: CanvasRenderingContext2D, cx: number, cy: number, opts: { strength?: number; inner?: number; outer?: number; color?: string } = {}) {
  const strength = opts.strength ?? 0.5;
  if (strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp01(strength);
  const g = ctx.createRadialGradient(cx, cy, opts.inner ?? 180, cx, cy, opts.outer ?? 620);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, opts.color ?? "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  ctx.restore();
}
