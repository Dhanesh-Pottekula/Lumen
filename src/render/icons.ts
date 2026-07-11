/**
 * icons — a reusable vector icon/sprite kit + a color-semantics registry with auto-legend. Icons are
 * pure path functions drawn in a unit box, so they scale/theme cleanly and can draw-on. The color
 * registry maps category names → consistent colors (assigned deterministically, cached) so the same
 * concept keeps its color across a whole lesson, and `legend()` renders the key.
 */
import { clamp01 } from "../slides/anim";

export type IconName =
  | "arrow" | "check" | "cross" | "plus" | "minus" | "star" | "heart" | "circle" | "square" | "triangle"
  | "gear" | "bolt" | "drop" | "sun" | "leaf" | "flame" | "factory" | "home" | "person" | "book"
  | "flask" | "atom" | "clock" | "pin" | "warning" | "info" | "search" | "cloud" | "mountain" | "seed";

// Each icon draws in a box roughly [-0.5, 0.5]², using the current path. `f` = fill vs stroke chosen by caller.
const ICONS: Record<IconName, (c: CanvasRenderingContext2D) => void> = {
  arrow: (c) => { c.moveTo(-0.5, 0); c.lineTo(0.3, 0); c.moveTo(0.05, -0.25); c.lineTo(0.4, 0); c.lineTo(0.05, 0.25); },
  check: (c) => { c.moveTo(-0.4, 0.05); c.lineTo(-0.1, 0.35); c.lineTo(0.45, -0.35); },
  cross: (c) => { c.moveTo(-0.35, -0.35); c.lineTo(0.35, 0.35); c.moveTo(0.35, -0.35); c.lineTo(-0.35, 0.35); },
  plus: (c) => { c.moveTo(0, -0.4); c.lineTo(0, 0.4); c.moveTo(-0.4, 0); c.lineTo(0.4, 0); },
  minus: (c) => { c.moveTo(-0.4, 0); c.lineTo(0.4, 0); },
  star: (c) => poly(c, 10, 0.5, 0.2),
  heart: (c) => { for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; const x = 16 * Math.sin(t) ** 3 / 32; const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 32; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); },
  circle: (c) => c.arc(0, 0, 0.45, 0, 7),
  square: (c) => c.rect(-0.4, -0.4, 0.8, 0.8),
  triangle: (c) => poly(c, 3, 0.5),
  gear: (c) => { const n = 8; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2; const r = i % 2 ? 0.5 : 0.36; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.moveTo(0.16, 0); c.arc(0, 0, 0.16, 0, 7); },
  bolt: (c) => { c.moveTo(0.1, -0.5); c.lineTo(-0.25, 0.06); c.lineTo(0.0, 0.06); c.lineTo(-0.1, 0.5); c.lineTo(0.28, -0.1); c.lineTo(0.02, -0.1); c.closePath(); },
  drop: (c) => { c.moveTo(0, -0.5); c.bezierCurveTo(0.4, -0.05, 0.4, 0.45, 0, 0.45); c.bezierCurveTo(-0.4, 0.45, -0.4, -0.05, 0, -0.5); },
  sun: (c) => { c.arc(0, 0, 0.22, 0, 7); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.moveTo(Math.cos(a) * 0.34, Math.sin(a) * 0.34); c.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5); } },
  leaf: (c) => { c.moveTo(-0.4, 0.4); c.quadraticCurveTo(-0.4, -0.4, 0.4, -0.4); c.quadraticCurveTo(0.4, 0.4, -0.4, 0.4); c.moveTo(-0.4, 0.4); c.lineTo(0.3, -0.3); },
  flame: (c) => { c.moveTo(0, 0.5); c.bezierCurveTo(-0.4, 0.2, -0.1, -0.1, 0, -0.5); c.bezierCurveTo(0.15, -0.15, 0.4, 0.1, 0, 0.5); },
  factory: (c) => { c.moveTo(-0.5, 0.4); c.lineTo(-0.5, -0.1); c.lineTo(-0.1, 0.15); c.lineTo(-0.1, -0.1); c.lineTo(0.3, 0.15); c.lineTo(0.3, -0.4); c.lineTo(0.5, -0.4); c.lineTo(0.5, 0.4); c.closePath(); },
  home: (c) => { c.moveTo(-0.45, 0); c.lineTo(0, -0.42); c.lineTo(0.45, 0); c.moveTo(-0.32, -0.05); c.lineTo(-0.32, 0.42); c.lineTo(0.32, 0.42); c.lineTo(0.32, -0.05); },
  person: (c) => { c.moveTo(0.16, -0.28); c.arc(0, -0.28, 0.16, 0, 7); c.moveTo(-0.28, 0.45); c.quadraticCurveTo(0, -0.1, 0.28, 0.45); },
  book: (c) => { c.moveTo(0, -0.35); c.lineTo(-0.42, -0.28); c.lineTo(-0.42, 0.35); c.lineTo(0, 0.28); c.lineTo(0.42, 0.35); c.lineTo(0.42, -0.28); c.closePath(); c.moveTo(0, -0.35); c.lineTo(0, 0.28); },
  flask: (c) => { c.moveTo(-0.15, -0.45); c.lineTo(-0.15, -0.1); c.lineTo(-0.4, 0.4); c.lineTo(0.4, 0.4); c.lineTo(0.15, -0.1); c.lineTo(0.15, -0.45); c.moveTo(-0.22, -0.45); c.lineTo(0.22, -0.45); },
  atom: (c) => { c.arc(0, 0, 0.1, 0, 7); c.moveTo(0.5, 0); c.ellipse(0, 0, 0.5, 0.2, 0, 0, 7); c.moveTo(0.25, 0.433); c.ellipse(0, 0, 0.5, 0.2, Math.PI / 3, 0, 7); c.moveTo(0.25, -0.433); c.ellipse(0, 0, 0.5, 0.2, -Math.PI / 3, 0, 7); },
  clock: (c) => { c.arc(0, 0, 0.45, 0, 7); c.moveTo(0, 0); c.lineTo(0, -0.28); c.moveTo(0, 0); c.lineTo(0.2, 0.1); },
  pin: (c) => { c.moveTo(0, 0.5); c.bezierCurveTo(-0.4, 0.0, -0.35, -0.5, 0, -0.5); c.bezierCurveTo(0.35, -0.5, 0.4, 0.0, 0, 0.5); c.moveTo(0.13, -0.2); c.arc(0, -0.2, 0.13, 0, 7); },
  warning: (c) => { poly(c, 3, 0.5); c.moveTo(0, -0.12); c.lineTo(0, 0.12); c.moveTo(0, 0.26); c.lineTo(0, 0.3); },
  info: (c) => { c.arc(0, 0, 0.45, 0, 7); c.moveTo(0, -0.22); c.lineTo(0, -0.18); c.moveTo(0, -0.05); c.lineTo(0, 0.25); },
  search: (c) => { c.moveTo(0.18, -0.1); c.arc(-0.1, -0.1, 0.28, 0, 7); c.moveTo(0.1, 0.1); c.lineTo(0.4, 0.4); },
  cloud: (c) => { c.arc(-0.18, 0.08, 0.2, Math.PI * 0.5, Math.PI * 1.5); c.arc(0.05, -0.05, 0.26, Math.PI, Math.PI * 2); c.arc(0.28, 0.1, 0.18, Math.PI * 1.5, Math.PI * 0.5); c.closePath(); },
  mountain: (c) => { c.moveTo(-0.5, 0.35); c.lineTo(-0.15, -0.3); c.lineTo(0.1, 0.05); c.lineTo(0.28, -0.2); c.lineTo(0.5, 0.35); c.closePath(); },
  seed: (c) => { c.ellipse(0, 0, 0.22, 0.4, Math.PI / 5, 0, 7); },
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
const FILLABLE = new Set<IconName>(["star", "heart", "circle", "square", "triangle", "gear", "bolt", "drop", "flame", "factory", "pin", "warning", "cloud", "mountain", "seed", "book", "flask"]);

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

export const iconNames = Object.keys(ICONS) as IconName[];

// ── Color semantics ─────────────────────────────────────────────────────────────────────────────

export const SEMANTIC_PALETTE = ["#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b", "#a06be8", "#38ef7d", "#e8c14a", "#e2452b", "#4ad6c8", "#b0884a"];

/**
 * A color registry: each category name is assigned a stable color from the palette on first use
 * (sequential, so distinct up to palette size) and cached. Same category → same color everywhere.
 */
export function colorSemantics(palette: string[] = SEMANTIC_PALETTE) {
  const map = new Map<string, string>();
  return {
    colorFor(category: string): string {
      let c = map.get(category);
      if (!c) {
        c = palette[map.size % palette.length];
        map.set(category, c);
      }
      return c;
    },
    /** Draw a swatch+label legend (vertical). */
    legend(ctx: CanvasRenderingContext2D, categories: string[], x: number, y: number, opts: { rowH?: number; swatch?: number; font?: string; ink?: string; icon?: (cat: string) => IconName } = {}) {
      const rowH = opts.rowH ?? 20;
      const sw = opts.swatch ?? 11;
      ctx.save();
      ctx.font = opts.font ?? "12px -apple-system, sans-serif";
      ctx.textAlign = "start";
      categories.forEach((cat, i) => {
        const cy = y + i * rowH;
        const col = this.colorFor(cat);
        if (opts.icon) {
          drawIcon(ctx, opts.icon(cat), x + sw / 2, cy, sw + 4, { color: col, filled: true });
        } else {
          ctx.fillStyle = col;
          ctx.fillRect(x, cy - sw / 2, sw, sw);
        }
        ctx.fillStyle = opts.ink ?? "#cdd8e2";
        ctx.fillText(cat, x + sw + 8, cy + 4);
      });
      ctx.restore();
    },
  };
}
