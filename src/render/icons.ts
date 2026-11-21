/**
 * icons — a reusable vector icon/sprite kit + a color-semantics registry with auto-legend. Icons are
 * pure path functions drawn in a unit box, so they scale/theme cleanly and can draw-on. The color
 * registry maps category names → consistent colors (assigned deterministically, cached) so the same
 * concept keeps its color across a whole lesson, and `legend()` renders the key.
 */
import { clamp01 } from "../slides/anim";

export type IconName =
  | "check" | "cross" | "plus" | "minus" | "star" | "heart" | "bolt" | "drop" | "sun" | "leaf" | "flame" | "clock" | "warning" | "cloud";

// Each icon draws in a box roughly [-0.5, 0.5]², using the current path. `f` = fill vs stroke chosen by caller.
const ICONS: Record<IconName, (c: CanvasRenderingContext2D) => void> = {
  check: (c) => { c.moveTo(-0.4, 0.05); c.lineTo(-0.1, 0.35); c.lineTo(0.45, -0.35); },
  cross: (c) => { c.moveTo(-0.35, -0.35); c.lineTo(0.35, 0.35); c.moveTo(0.35, -0.35); c.lineTo(-0.35, 0.35); },
  plus: (c) => { c.moveTo(0, -0.4); c.lineTo(0, 0.4); c.moveTo(-0.4, 0); c.lineTo(0.4, 0); },
  minus: (c) => { c.moveTo(-0.4, 0); c.lineTo(0.4, 0); },
  star: (c) => poly(c, 10, 0.5, 0.2),
  heart: (c) => { for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; const x = 16 * Math.sin(t) ** 3 / 32; const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 32; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); },
  bolt: (c) => { c.moveTo(0.1, -0.5); c.lineTo(-0.25, 0.06); c.lineTo(0.0, 0.06); c.lineTo(-0.1, 0.5); c.lineTo(0.28, -0.1); c.lineTo(0.02, -0.1); c.closePath(); },
  drop: (c) => { c.moveTo(0, -0.5); c.bezierCurveTo(0.4, -0.05, 0.4, 0.45, 0, 0.45); c.bezierCurveTo(-0.4, 0.45, -0.4, -0.05, 0, -0.5); },
  sun: (c) => { c.arc(0, 0, 0.22, 0, 7); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.moveTo(Math.cos(a) * 0.34, Math.sin(a) * 0.34); c.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5); } },
  leaf: (c) => { c.moveTo(-0.4, 0.4); c.quadraticCurveTo(-0.4, -0.4, 0.4, -0.4); c.quadraticCurveTo(0.4, 0.4, -0.4, 0.4); c.moveTo(-0.4, 0.4); c.lineTo(0.3, -0.3); },
  flame: (c) => { c.moveTo(0, 0.5); c.bezierCurveTo(-0.4, 0.2, -0.1, -0.1, 0, -0.5); c.bezierCurveTo(0.15, -0.15, 0.4, 0.1, 0, 0.5); },
  clock: (c) => { c.arc(0, 0, 0.45, 0, 7); c.moveTo(0, 0); c.lineTo(0, -0.28); c.moveTo(0, 0); c.lineTo(0.2, 0.1); },
  warning: (c) => { poly(c, 3, 0.5); c.moveTo(0, -0.12); c.lineTo(0, 0.12); c.moveTo(0, 0.26); c.lineTo(0, 0.3); },
  cloud: (c) => { c.arc(-0.18, 0.08, 0.2, Math.PI * 0.5, Math.PI * 1.5); c.arc(0.05, -0.05, 0.26, Math.PI, Math.PI * 2); c.arc(0.28, 0.1, 0.18, Math.PI * 1.5, Math.PI * 0.5); c.closePath(); },
};

function poly(c: CanvasRenderingContext2D, sides: number, r: number, inner?: number) {
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
    const rr = inner && i % 2 ? inner : r;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}

// Icons that are genuine closed shapes (safe to fill). Open/stroke-only glyphs (arrow, check, plus,
// sun rays, clock hands, home walls, atom orbits, person, info, search) are always stroked, so a
// caller passing `filled:true` (e.g. geoMarker) never fills an open path into a blob.
const FILLABLE = new Set<IconName>(["star", "heart", "bolt", "drop", "flame", "warning", "cloud"]);

export interface IconStyle {
  color?: string;
  filled?: boolean;
  width?: number;
  alpha?: number;
}

/** Draw an icon centered at (x,y) at pixel `size`. Filled or stroked; themed by `color`. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, style: IconStyle = {}) {
  const fn = ICONS[name];
  if (!fn) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(style.alpha ?? 1);
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.lineWidth = (style.width ?? 2) / size;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = style.color ?? "#eef5ef";
  ctx.fillStyle = style.color ?? "#eef5ef";
  ctx.beginPath();
  fn(ctx);
  if (style.filled && FILLABLE.has(name)) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}
