/**
 * reveal — the reveal grammar: shape-based entrances (wipes, irises, masks) and blend modes.
 *
 * Unifying model (from the research): every reveal is a mask that is a pure function of progress
 * `p` ∈ [0,1]. On canvas there are exactly two ways to apply that mask:
 *   • HARD edge  → `ctx.clip()` to the revealed shape (cheap, 1-bit + AA boundary).
 *   • SOFT edge  → render content to an offscreen buffer, then `destination-in` a mask whose alpha is
 *                  the coverage; feather = a `blur()` filter on that mask; invert = `destination-out`.
 * So each verb only has to describe "what shape is revealed at progress p" (a `pathFn`); `applyReveal`
 * picks the hard or soft path. Any exotic wipe not built here (pinwheel, spiral, luma-matte, matrix…)
 * is just a different mask drawn via `masked()` — the architecture is open by design.
 *
 * Everything is deterministic and seekable: the mask is recomputed from `p` each frame with no state;
 * `ease` wraps `p` (never baked in); `dissolve` randomness is seeded.
 */
import { clamp01, prng } from "./motion";

export type BlendMode = GlobalCompositeOperation;

/** Run `draw` under a composite/blend mode (multiply, screen, lighter, destination-out, …). Save/restored. */
export function withBlend(ctx: CanvasRenderingContext2D, mode: BlendMode, draw: () => void) {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  draw();
  ctx.restore();
}

// ── The universal soft-mask primitive ─────────────────────────────────────────────────────────────

let scratch: HTMLCanvasElement | null = null;
let scratchBusy = false;

/**
 * Render `drawContent` masked by `drawMask`. The mask's alpha (or luminance-as-alpha, if you paint
 * opaque) is the coverage — draw a solid shape for a hard mask, a gradient or a blurred shape for a
 * soft one. `invert:true` conceals under the mask instead of revealing (fog-of-war both directions).
 * Falls back to unmasked content when no DOM canvas is available.
 */
export function masked(
  ctx: CanvasRenderingContext2D,
  _viewW: number,
  _viewH: number,
  drawContent: (c: CanvasRenderingContext2D) => void,
  drawMask: (c: CanvasRenderingContext2D) => void,
  opts: { invert?: boolean } = {},
) {
  const cw = ctx.canvas?.width ?? 0;
  const ch = ctx.canvas?.height ?? 0;
  if (!cw || !ch || typeof document === "undefined" || typeof ctx.getTransform !== "function") {
    drawContent(ctx); // degraded but safe: no masking available
    return;
  }
  let buf: HTMLCanvasElement;
  let temp = false;
  if (scratchBusy) {
    buf = document.createElement("canvas");
    buf.width = cw;
    buf.height = ch;
    temp = true;
  } else {
    if (!scratch) scratch = document.createElement("canvas");
    if (scratch.width !== cw) scratch.width = cw;
    if (scratch.height !== ch) scratch.height = ch;
    buf = scratch;
    scratchBusy = true;
  }
  const bctx = buf.getContext("2d") as CanvasRenderingContext2D;
  try {
    const xform = ctx.getTransform();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, cw, ch);
    bctx.globalCompositeOperation = "source-over";
    bctx.filter = "none";
    bctx.setTransform(xform);
    drawContent(bctx);
    bctx.globalCompositeOperation = opts.invert ? "destination-out" : "destination-in";
    bctx.fillStyle = "#fff";
    drawMask(bctx);
    bctx.globalCompositeOperation = "source-over";
    bctx.filter = "none";
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over"; // blit the masked result normally, ignoring caller's blend
    ctx.drawImage(buf, 0, 0);
    ctx.restore();
  } finally {
    // never leave the shared-scratch reentrancy flag stuck if a draw callback throws
    if (!temp) scratchBusy = false;
  }
}

export interface RevealOptions {
  feather?: number; // soft-edge width in view units (0 = hard clip)
  invert?: boolean; // conceal instead of reveal
  ease?: (p: number) => number; // remap p before use (keep seeking exact)
}

/**
 * Reveal `draw` through the region described by `pathFn` (which issues path commands for the shape
 * visible at this progress). Hard clip when there is no feather/invert; otherwise a blurred offscreen
 * mask. This is the single execution path every verb funnels through.
 */
function applyReveal(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  draw: (c: CanvasRenderingContext2D) => void,
  pathFn: (c: CanvasRenderingContext2D) => void,
  opts: RevealOptions,
) {
  const feather = opts.feather ?? 0;
  const invert = opts.invert ?? false;
  if (!feather && !invert) {
    ctx.save();
    ctx.beginPath();
    pathFn(ctx);
    ctx.clip();
    draw(ctx);
    ctx.restore();
    return;
  }
  const dpr = ctx.getTransform?.().a || 1;
  masked(
    ctx,
    viewW,
    viewH,
    draw,
    (mctx) => {
      if (feather) mctx.filter = `blur(${feather * dpr}px)`;
      mctx.beginPath();
      pathFn(mctx);
      mctx.fill();
    },
    { invert },
  );
}

const applyEase = (p: number, ease?: (p: number) => number) => (ease ? ease(clamp01(p)) : clamp01(p));

// ── Directional wipe ──────────────────────────────────────────────────────────────────────────────

export type WipeDir =
  | "left"
  | "right"
  | "up"
  | "down"
  | "center-h"
  | "center-v"
  | "center"
  | "edges-h"
  | "edges-v";

/** The revealed rectangle for a directional wipe at progress `p`. Pure. */
export function revealRect(p: number, dir: "left" | "right" | "up" | "down", w: number, h: number): [number, number, number, number] {
  p = clamp01(p);
  if (dir === "left") return [0, 0, w * p, h];
  if (dir === "right") return [w * (1 - p), 0, w * p, h];
  if (dir === "up") return [0, h * (1 - p), w, h * p];
  return [0, 0, w, h * p]; // down
}

/** All revealed rectangles for a wipe direction (1 for cardinal/center, 2 for edges-*). Pure. */
function revealRects(p: number, dir: WipeDir, w: number, h: number): [number, number, number, number][] {
  p = clamp01(p);
  switch (dir) {
    case "center-h":
      return [[w / 2 - (w * p) / 2, 0, w * p, h]];
    case "center-v":
      return [[0, h / 2 - (h * p) / 2, w, h * p]];
    case "center":
      return [[w / 2 - (w * p) / 2, h / 2 - (h * p) / 2, w * p, h * p]];
    case "edges-h":
      return [
        [0, 0, (w * p) / 2, h],
        [w - (w * p) / 2, 0, (w * p) / 2, h],
      ];
    case "edges-v":
      return [
        [0, 0, w, (h * p) / 2],
        [0, h - (h * p) / 2, w, (h * p) / 2],
      ];
    default:
      return [revealRect(p, dir, w, h)];
  }
}

export interface WipeOptions extends RevealOptions {
  dir?: WipeDir;
  angle?: number; // arbitrary edge angle in radians (overrides dir; enables diagonals)
  border?: { width: number; color: string };
}

/** Reveal `draw` by sweeping an edge across the frame. Directional, center-split, edges-in, or angled. */
export function wipe(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: WipeOptions = {},
) {
  const P = applyEase(p, opts.ease);
  if (opts.angle != null) {
    // angled half-plane: a big quad covering the revealed side of a line at distance `front` along d
    const a = opts.angle;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const px = -dy;
    const py = dx;
    // project the 4 corners onto d to find the sweep range
    const projs = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ].map(([x, y]) => x * dx + y * dy);
    const lo = Math.min(...projs);
    const hi = Math.max(...projs);
    const front = lo + (hi - lo) * P;
    const L = (w + h) * 2;
    const fx = dx * front;
    const fy = dy * front;
    applyReveal(
      ctx,
      w,
      h,
      draw,
      (c) => {
        c.moveTo(fx + px * L, fy + py * L);
        c.lineTo(fx - px * L, fy - py * L);
        c.lineTo(fx - px * L - dx * L, fy - py * L - dy * L);
        c.lineTo(fx + px * L - dx * L, fy + py * L - dy * L);
        c.closePath();
      },
      opts,
    );
    if (opts.border && P > 0 && P < 1) {
      ctx.save();
      ctx.strokeStyle = opts.border.color;
      ctx.lineWidth = opts.border.width;
      ctx.beginPath();
      ctx.moveTo(fx + px * L, fy + py * L);
      ctx.lineTo(fx - px * L, fy - py * L);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }
  const rects = revealRects(P, opts.dir ?? "left", w, h);
  applyReveal(
    ctx,
    w,
    h,
    draw,
    (c) => {
      for (const [x, y, rw, rh] of rects) c.rect(x, y, rw, rh);
    },
    opts,
  );
  if (opts.border && P > 0 && P < 1) {
    ctx.save();
    ctx.strokeStyle = opts.border.color;
    ctx.lineWidth = opts.border.width;
    for (const [x, y, rw, rh] of rects) ctx.strokeRect(x, y, rw, rh);
    ctx.restore();
  }
}

// ── Iris / shape reveal ───────────────────────────────────────────────────────────────────────────

export type IrisShape = "circle" | "ellipse" | "rect" | "diamond" | "polygon" | "star";

export interface IrisOptions extends RevealOptions {
  shape?: IrisShape;
  aspect?: number; // ry/rx for ellipse/rect (default 1)
  sides?: number; // polygon/star point count (default 6 / 5)
  rotation?: number; // radians
  innerRatio?: number; // star inner/outer radius (default 0.5)
  close?: boolean; // radius from p (open, default) vs from 1−p (close)
}

function irisPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, opts: IrisOptions) {
  const shape = opts.shape ?? "circle";
  const aspect = opts.aspect ?? 1;
  const rot = opts.rotation ?? 0;
  if (shape === "circle") {
    c.moveTo(cx + r, cy);
    c.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }
  if (shape === "ellipse") {
    c.ellipse(cx, cy, r, r * aspect, rot, 0, Math.PI * 2);
    return;
  }
  if (shape === "rect") {
    const rw = r;
    const rh = r * aspect;
    c.rect(cx - rw, cy - rh, rw * 2, rh * 2);
    return;
  }
  // polygonal shapes
  let sides: number;
  let inner = 1;
  if (shape === "diamond") sides = 4;
  else if (shape === "star") {
    sides = (opts.sides ?? 5) * 2;
    inner = opts.innerRatio ?? 0.5;
  } else sides = opts.sides ?? 6;
  for (let i = 0; i < sides; i++) {
    const ang = rot - Math.PI / 2 + (i / sides) * Math.PI * 2;
    const rr = shape === "star" && i % 2 === 1 ? r * inner : r;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
}

/** Reveal `draw` through a shape growing (or shrinking) from a center point. */
export function iris(
  ctx: CanvasRenderingContext2D,
  p: number,
  cx: number,
  cy: number,
  maxR: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: IrisOptions = {},
) {
  const P = applyEase(p, opts.ease);
  const r = (opts.close ? 1 - P : P) * maxR;
  if (r <= 0) {
    if (opts.invert) draw(ctx); // fully concealed shape → everything shows
    return;
  }
  applyReveal(ctx, ctx.canvas?.width ?? 0, ctx.canvas?.height ?? 0, draw, (c) => irisPath(c, cx, cy, r, opts), opts);
}

// ── Arbitrary polygon clip ────────────────────────────────────────────────────────────────────────

export function clipShape(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  draw: (c: CanvasRenderingContext2D) => void,
  opts: { invert?: boolean; feather?: number } = {},
) {
  if (points.length < 3) return;
  applyReveal(
    ctx,
    ctx.canvas?.width ?? 0,
    ctx.canvas?.height ?? 0,
    draw,
    (c) => {
      c.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
      c.closePath();
    },
    opts,
  );
}

// ── Radial / clock wipe ───────────────────────────────────────────────────────────────────────────

export interface RadialWipeOptions extends RevealOptions {
  startAngle?: number; // radians (default -π/2, i.e. 12 o'clock)
  dir?: "cw" | "ccw";
}

/** Reveal `draw` with a sweeping angular sector (clock/pie wipe) around a center. */
export function radialWipe(
  ctx: CanvasRenderingContext2D,
  p: number,
  cx: number,
  cy: number,
  radius: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: RadialWipeOptions = {},
) {
  const P = applyEase(p, opts.ease);
  if (P <= 0) return;
  const start = opts.startAngle ?? -Math.PI / 2;
  const sweep = Math.min(Math.PI * 2 - 1e-4, Math.PI * 2 * P); // avoid congruent start/end (empty arc) at P=1
  const ccw = opts.dir === "ccw";
  const end = ccw ? start - sweep : start + sweep;
  applyReveal(
    ctx,
    ctx.canvas?.width ?? 0,
    ctx.canvas?.height ?? 0,
    draw,
    (c) => {
      c.moveTo(cx, cy);
      c.arc(cx, cy, radius, start, end, ccw);
      c.closePath();
    },
    opts,
  );
}

// ── Pattern reveals: blinds, checkerboard, dissolve ───────────────────────────────────────────────

export interface BlindsOptions extends RevealOptions {
  count?: number; // number of slats (default 8)
  dir?: "h" | "v"; // slats stacked vertically (h) or horizontally (v)
}

/** Reveal `draw` through venetian blinds — `count` slats each opening with p. */
export function blinds(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: BlindsOptions = {},
) {
  const P = applyEase(p, opts.ease);
  const count = opts.count ?? 8;
  const horizontal = (opts.dir ?? "h") === "h";
  applyReveal(
    ctx,
    w,
    h,
    draw,
    (c) => {
      if (horizontal) {
        const slat = h / count;
        for (let i = 0; i < count; i++) c.rect(0, i * slat, w, slat * P);
      } else {
        const slat = w / count;
        for (let i = 0; i < count; i++) c.rect(i * slat, 0, slat * P, h);
      }
    },
    opts,
  );
}

export type CheckerOrder = "rowcol" | "diagonal" | "radial" | "random";

export interface CheckerOptions extends RevealOptions {
  rows?: number;
  cols?: number;
  order?: CheckerOrder;
  seed?: number; // for order "random"
}

/** Reveal `draw` cell-by-cell across a grid, ordered row/col, diagonally, radially, or randomly. */
export function checkerboard(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: CheckerOptions = {},
) {
  const P = applyEase(p, opts.ease);
  const rows = opts.rows ?? 6;
  const cols = opts.cols ?? 10;
  const order = opts.order ?? "diagonal";
  const cw = w / cols;
  const ch = h / rows;
  const n = rows * cols;
  const rnd = prng(opts.seed ?? 7);
  const rank = new Array(n);
  for (let i = 0; i < n; i++) rank[i] = rnd(); // stable random ranks for "random"
  applyReveal(
    ctx,
    w,
    h,
    draw,
    (c) => {
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          let t: number; // 0..1 cell threshold: cell fully shown once P exceeds it
          if (order === "rowcol") t = (r * cols + col) / n;
          else if (order === "diagonal") t = (r + col) / (rows + cols);
          else if (order === "radial") {
            const dx = (col + 0.5) / cols - 0.5;
            const dy = (r + 0.5) / rows - 0.5;
            t = Math.hypot(dx, dy) / 0.7071;
          } else t = rank[r * cols + col];
          t = clamp01(t); // radial corners can exceed 1 — clamp so p=1 fully reveals every cell
          const cellP = clamp01((P - t * 0.85) / 0.15); // 0.15 = per-cell fade span
          if (cellP > 0) {
            const s = cellP;
            c.rect(col * cw + (cw * (1 - s)) / 2, r * ch + (ch * (1 - s)) / 2, cw * s, ch * s);
          }
        }
      }
    },
    opts,
  );
}

export interface DissolveOptions extends RevealOptions {
  seed?: number;
  cell?: number; // dissolve cell size in view units (default 14)
}

/** Organic dissolve: cells trip on in a seeded random order as p rises. Deterministic via `seed`. */
export function dissolve(
  ctx: CanvasRenderingContext2D,
  p: number,
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: DissolveOptions = {},
) {
  const P = applyEase(p, opts.ease);
  const cell = opts.cell ?? 14;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const rnd = prng(opts.seed ?? 1);
  const thresh: number[] = [];
  for (let i = 0; i < rows * cols; i++) thresh.push(rnd());
  applyReveal(
    ctx,
    w,
    h,
    draw,
    (c) => {
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < cols; col++) {
          if (P > thresh[r * cols + col]) c.rect(col * cell, r * cell, cell + 1, cell + 1);
        }
      }
    },
    opts,
  );
}

// ── Spotlight / fog-of-war ────────────────────────────────────────────────────────────────────────

export interface SpotlightOptions {
  feather?: number; // soft falloff width (default radius * 0.4)
  invert?: boolean; // true → dim/hide inside instead of outside
  dim?: { color: string; strength: number }; // dim the surround instead of hiding it (0..1)
}

/**
 * Reveal `draw` only inside a soft radial spotlight, or (with `dim`) keep everything but darken the
 * surround — the attention/fog-of-war primitive. The center can move (pass a p-driven cx/cy).
 */
export function spotlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  draw: (c: CanvasRenderingContext2D) => void,
  opts: SpotlightOptions = {},
) {
  const feather = opts.feather ?? radius * 0.4;
  const w = ctx.canvas?.width ?? 0;
  const h = ctx.canvas?.height ?? 0;
  if (opts.dim) {
    // draw everything, then lay a dimming veil that is clear inside the spotlight and opaque outside
    draw(ctx);
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, Math.max(0, radius - feather), cx, cy, radius);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, opts.dim.color);
    ctx.globalAlpha = clamp01(opts.dim.strength);
    ctx.fillStyle = g;
    ctx.fillRect(-1e5, -1e5, 2e5, 2e5); // cover the whole view regardless of transform
    ctx.restore();
    return;
  }
  masked(
    ctx,
    w,
    h,
    draw,
    (mctx) => {
      const g = mctx.createRadialGradient(cx, cy, Math.max(0, radius - feather), cx, cy, radius);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "rgba(255,255,255,0)");
      mctx.fillStyle = g;
      mctx.fillRect(cx - radius - 2, cy - radius - 2, (radius + 2) * 2, (radius + 2) * 2);
    },
    { invert: opts.invert },
  );
}
