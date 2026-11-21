/**
 * render — draw one resolved scene at local time t, in the "movie" look.
 *
 * The picture fills the frame edge to edge (cover-fit, never cut out), and a camera moves inside it: a slow
 * drift all the time, and pushes to the parts the narration is about. Words, labels and highlights are drawn on
 * top in screen space, so they stay sharp while the picture underneath is zoomed. Pure: same t, same pixels.
 */
import { barChart, lineChart, makePlot, pie } from "../render/charts";
import { drawMath, measureMath } from "../render/mathtext";
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from "../render/motion";
import { formatNumber } from "../render/type-motion";
import { drawIcon } from "../render/icons";
import { confettiEmitter, dustEmitter, emit, energyEmitter, fireEmitter, rainEmitter, smokeEmitter, snowEmitter, sparksEmitter } from "../render/particles";
import { backdropAt, type CameraKey, type Mark, type PointerTrack, type ResolvedScene } from "./resolve";
import type { Hotspot, ImageObject, OverlayObject, Shot, Spot, Zone } from "./types";

export const VIEW_W = 960;
export const VIEW_H = 540;

const FONT = `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
/**
 * Everything written on the picture is in a handwriting face, so it belongs to the hand-drawn pictures. The
 * subtitles stay in the plain face: they are read fast and are not part of the drawing. Caveat's letters are
 * smaller on their line than a plain face's, so its sizes are larger than they look.
 */
export const HAND_FACE = "Caveat";
const HAND = `"${HAND_FACE}", "Bradley Hand", "Comic Sans MS", cursive`;
/** The canvas falls back without a word when a face is not loaded, so ask for it as soon as this is used. */
export const handReady: Promise<unknown> = typeof document !== "undefined" && document.fonts ? document.fonts.load(`700 48px "${HAND_FACE}"`).catch(() => null) : Promise.resolve();
const INK = "#0b0d12";
const COLORS = { white: "#ffffff", accent: "#ffd24a", danger: "#ff5a4f", good: "#6fe08a" } as const;

/** Zoom for each shot: on a whole picture, and the most it may reach on a part. */
// overview is the whole picture; wide keeps the thing with its context (about 1.2 times), as in AiRA's catalog.
const SHOT_ZOOM: Record<Shot, [number, number]> = { overview: [1, 1], wide: [1.08, 1.25], medium: [1.25, 1.6], close: [1.6, 2.1], detail: [2, 2.8] };

// ── Pictures ────────────────────────────────────────────────────────────────────────────────────────
const cache = new Map<string, HTMLImageElement>();

/** Load a picture into the cache the renderer draws from. Resolves either way: a failed picture draws as a dark frame. */
export function loadPicture(src: string): Promise<void> {
  if (cache.has(src)) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      cache.set(src, image);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = src;
  });
}

// ── Camera ──────────────────────────────────────────────────────────────────────────────────────────
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Focus point as fractions of the picture, plus zoom. */
interface Lens {
  fx: number;
  fy: number;
  zoom: number;
}

/** Where a picture of this aspect sits when it covers the whole view. */
function coverRect(aspect: number): Rect {
  const w = Math.max(VIEW_W, VIEW_H * aspect);
  const h = w / aspect;
  return { x: (VIEW_W - w) / 2, y: (VIEW_H - h) / 2, w, h };
}

function lensFor(key: CameraKey, image: ImageObject | undefined, rect: Rect): Lens {
  const [whole, most] = SHOT_ZOOM[key.shot];
  if (key.spot !== undefined) {
    // A pan's end: centred on a point, or on a part's middle, at the shot's own zoom.
    const box = typeof key.spot === "string" ? image?.hotspots?.[key.spot.split(".")[1] ?? ""] : undefined;
    const at = typeof key.spot === "string" ? (box ? { x: box[0] + box[2] / 2, y: box[1] + box[3] / 2 } : { x: 0.5, y: 0.5 }) : key.spot;
    return { fx: at.x, fy: at.y, zoom: Math.max(1.3, (whole + most) / 2) };
  }
  const spot = key.part ? image?.hotspots?.[key.part] : undefined;
  if (!spot || key.shot === "overview") return { fx: 0.5, fy: 0.5, zoom: whole };
  // Never zoom past the point where the part would no longer fit in the frame.
  const fits = Math.min(VIEW_W / (spot[2] * rect.w), VIEW_H / (spot[3] * rect.h)) * 0.8;
  return { fx: spot[0] + spot[2] / 2, fy: spot[1] + spot[3] / 2, zoom: Math.max(1.12, Math.min(most, fits)) };
}

/** The lens at time t: every camera move so far, each eased from where the last one left it. */
function lensAt(scene: ResolvedScene, t: number, picture: string, rect: Rect): Lens {
  const carried = picture === scene.backdrops[0]?.picture ? scene.openLens : undefined;
  let lens: Lens = carried ?? { fx: 0.5, fy: 0.5, zoom: 1 };
  for (const key of scene.cameras) {
    if (key.at > t) break;
    if (key.picture !== picture) continue;
    const to = lensFor(key, scene.images.get(picture), rect);
    const p = key.dur <= 0 ? 1 : easeInOutCubic(clamp01((t - key.at) / key.dur));
    // An arc swings onto its target along a gentle bow instead of a straight line.
    const bow = key.movement === "arc" ? Math.sin(Math.PI * p) * 0.05 : 0;
    lens = { fx: lerp(lens.fx, to.fx, p), fy: lerp(lens.fy, to.fy, p) - bow, zoom: lerp(lens.zoom, to.zoom, p) };
  }
  // The frame is never quite still: a slow push in over the whole scene.
  return { ...lens, zoom: lens.zoom * (1 + 0.045 * clamp01(t / Math.max(1, scene.duration))) };
}

/** Where the camera rests at the very end of a scene, so the next scene on the same picture can start from there. */
export function endLens(scene: ResolvedScene): Lens | undefined {
  const picture = backdropAt(scene, scene.duration);
  if (!picture) return undefined;
  return lensAt(scene, scene.duration, picture, coverRect(scene.images.get(picture)?.aspect ?? VIEW_W / VIEW_H));
}

interface View {
  /** View-space point that sits at the centre of the screen. */
  px: number;
  py: number;
  zoom: number;
  rect: Rect;
  dx: number;
  dy: number;
}

function viewOf(lens: Lens, rect: Rect, dx: number, dy: number): View {
  const halfW = VIEW_W / (2 * lens.zoom);
  const halfH = VIEW_H / (2 * lens.zoom);
  // Keep the frame inside the picture, so no edge ever shows.
  const px = Math.min(rect.x + rect.w - halfW, Math.max(rect.x + halfW, rect.x + lens.fx * rect.w));
  const py = Math.min(rect.y + rect.h - halfH, Math.max(rect.y + halfH, rect.y + lens.fy * rect.h));
  return { px, py, zoom: lens.zoom, rect, dx, dy };
}

/** A part's box (or the whole picture) on screen, after the camera. */
function onScreen(view: View, spot: Hotspot | undefined): Rect {
  const s = spot ?? [0, 0, 1, 1];
  const x = view.rect.x + s[0] * view.rect.w;
  const y = view.rect.y + s[1] * view.rect.h;
  return {
    x: (x - view.px) * view.zoom + VIEW_W / 2 + view.dx,
    y: (y - view.py) * view.zoom + VIEW_H / 2 + view.dy,
    w: s[2] * view.rect.w * view.zoom,
    h: s[3] * view.rect.h * view.zoom,
  };
}

// ── Drawing helpers ─────────────────────────────────────────────────────────────────────────────────
/** Bold cartoon lettering: a colour fill inside a thick dark outline, readable over any picture. */
function comicText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center") {
  ctx.font = `700 ${size}px ${HAND}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fillStyle = "rgba(10, 12, 18, 0.78)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.stroke();
}

/** Split a line in two near the middle when it is too wide. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.split(" ");
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(ctx.measureText(words.slice(0, i).join(" ")).width - ctx.measureText(words.slice(i).join(" ")).width);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** Where a zone's box of size w × h sits. Bottom zones stay above the subtitles. */
/** The boxes this frame's words, formulas, counters and charts already occupy, so a new one never lands on another. */
let zoneTaken: Rect[] = [];

function zoneBox(zone: Zone | undefined, w: number, h: number): Rect {
  const m = 36;
  // Clear of the subtitles, which run to two lines.
  const bottom = VIEW_H - 150;
  const z = zone ?? "top";
  const x = z.includes("left") ? m : z.includes("right") ? VIEW_W - m - w : (VIEW_W - w) / 2;
  let y = z.startsWith("top") ? m : z.startsWith("bottom") ? bottom - h : (VIEW_H - h) / 2 - 20;
  // Two things can collide even from different zones (a wide line in the top-right corner reaches the top
  // centre). A box that would overlap one already placed steps past it: upward at the bottom, downward elsewhere.
  const gap = 10;
  for (let tries = 0; tries < 6; tries++) {
    const hit = zoneTaken.find((o) => x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + o.h + gap && y + h + gap > o.y);
    if (!hit) break;
    y = z.startsWith("bottom") ? hit.y - h - gap : hit.y + hit.h + gap;
  }
  const box = { x, y, w, h };
  zoneTaken.push(box);
  return box;
}

// ── Layers ──────────────────────────────────────────────────────────────────────────────────────────
function drawBackdrop(ctx: CanvasRenderingContext2D, image: ImageObject | undefined, view: View) {
  ctx.save();
  ctx.translate(VIEW_W / 2 + view.dx, VIEW_H / 2 + view.dy);
  ctx.scale(view.zoom, view.zoom);
  ctx.translate(-view.px, -view.py);
  const bitmap = image?.src ? cache.get(image.src) : undefined;
  if (bitmap) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, view.rect.x, view.rect.y, view.rect.w, view.rect.h);
  } else {
    const g = ctx.createLinearGradient(0, view.rect.y, 0, view.rect.y + view.rect.h);
    g.addColorStop(0, "#1a2233");
    g.addColorStop(1, "#090b12");
    ctx.fillStyle = g;
    ctx.fillRect(view.rect.x, view.rect.y, view.rect.w, view.rect.h);
  }
  ctx.restore();
}

/**
 * A mark that draws the eye to a part. Each is meant to read as something a person did to the picture, not as
 * a shape laid on it by a program:
 *   encircle  a marker ring drawn round the part by hand: a little uneven, ending just past where it began
 *   dim       a soft spotlight: the part stays lit and everything else falls away into shadow, with no hard edge
 *   pulse     two quiet ripples out from the part, which then settle to a faint ring
 */
function drawAttention(ctx: CanvasRenderingContext2D, verb: "dim" | "encircle" | "pulse", box: Rect, age: number, left: number) {
  const leaving = clamp01(left / 0.35);
  if (age <= 0 || leaving <= 0) return;
  // A ring or a ripple round something that fills much of the frame is a great loop across the picture that
  // points at nothing, so it is not drawn. Darkening everything else still works at any size.
  if (verb !== "dim" && (box.w > VIEW_W * 0.45 || box.h > VIEW_H * 0.55)) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Room round the part: a share of its size, so a small part is not swamped and a large one is not hugged.
  const pad = Math.max(8, Math.min(22, Math.min(box.w, box.h) * 0.16));
  const rx = box.w / 2 + pad;
  const ry = box.h / 2 + pad;
  ctx.save();
  if (verb === "dim") {
    const fade = easeOutCubic(clamp01(age / 0.6)) * leaving;
    // Dark everywhere, clear over the part, and a wide soft edge between: drawn as one gradient in the
    // part's own oval, so the pool of light has the part's shape.
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const pool = ctx.createRadialGradient(0, 0, 0.95, 0, 0, 1.9);
    pool.addColorStop(0, "rgba(4, 6, 12, 0)");
    pool.addColorStop(1, `rgba(4, 6, 12, ${0.68 * fade})`);
    ctx.fillStyle = pool;
    const far = (Math.hypot(VIEW_W, VIEW_H) * 2) / Math.min(rx, ry);
    ctx.fillRect(-far, -far, far * 2, far * 2);
  } else if (verb === "encircle") {
    const p = easeOutCubic(clamp01(age / 0.7));
    // The same part always gets the same ring: its unevenness comes from where it is, not from chance.
    const seed = cx * 0.013 + cy * 0.029;
    const turn = Math.PI * 2 * 1.07;
    const start = -Math.PI * 0.62;
    const steps = 72;
    const point = (k: number) => {
      const a = start + (turn * k) / steps;
      // A slow wobble, and a slight spiral outward so the end passes outside the beginning.
      const r = 1 + 0.03 * Math.sin(a * 2 + seed) + 0.018 * Math.sin(a * 5 + seed * 3) + 0.05 * (k / steps);
      return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r] as const;
    };
    const upTo = Math.max(1, Math.round(steps * p));
    const trace = () => {
      ctx.beginPath();
      for (let k = 0; k <= upTo; k++) {
        const [x, y] = point(k);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    ctx.globalAlpha = leaving;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // A soft dark edge keeps the ring readable on a bright picture; the ring itself carries a faint glow.
    trace();
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = "rgba(8, 10, 16, 0.38)";
    ctx.stroke();
    ctx.shadowColor = "rgba(255, 210, 74, 0.55)";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = COLORS.accent;
    ctx.stroke();
  } else {
    // Two ripples, one after the other, each widening and thinning as it goes.
    for (let ring = 0; ring < 2; ring++) {
      const p = (age - ring * 0.32) / 0.95;
      if (p <= 0 || p >= 1) continue;
      const grow = easeOutCubic(p);
      ctx.globalAlpha = (1 - p) ** 1.6 * 0.9 * leaving;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * (0.72 + grow * 0.6), ry * (0.72 + grow * 0.6), 0, 0, Math.PI * 2);
      ctx.lineWidth = 5 * (1 - p) + 1;
      ctx.shadowColor = "rgba(255, 210, 74, 0.6)";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = COLORS.accent;
      ctx.stroke();
    }
    // What is left once the ripples have gone: a thin ring, enough to say "this one".
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.5 * clamp01((age - 0.5) / 0.5) * leaving;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = COLORS.accent;
    ctx.stroke();
  }
  ctx.restore();
}

// ── Marks drawn by code ─────────────────────────────────────────────────────────────────────────────
// Arrows, lines, boxes, signs and effects are drawn on top in screen space, at wherever the camera has put the
// spot they belong to. So they follow the picture as it moves and stay sharp however far it is zoomed.

interface Anchor {
  x: number;
  y: number;
  /** The part's box on screen, when the spot is a part and not a point. */
  box?: Rect;
}

/** Where a spot of the background is on screen now, or null when it names a part the picture does not have. */
function anchorOf(view: View, image: ImageObject | undefined, spot: Spot): Anchor | null {
  if (typeof spot !== "string") {
    const at = onScreen(view, [spot.x, spot.y, 0, 0]);
    return { x: at.x, y: at.y };
  }
  const hot = image?.hotspots?.[spot.split(".")[1] ?? ""];
  if (!hot) return null;
  const box = onScreen(view, hot);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, box };
}

/** Where a stroke going to `other` leaves a part: on the edge of its box, a little outside it. A point is itself. */
function edgeToward(end: Anchor, other: Anchor, gap: number): { x: number; y: number } {
  if (!end.box) return end;
  const dx = other.x - end.x;
  const dy = other.y - end.y;
  const k = Math.min(dx ? (end.box.w / 2 + gap) / Math.abs(dx) : Infinity, dy ? (end.box.h / 2 + gap) / Math.abs(dy) : Infinity);
  return k >= 1 ? { x: end.x, y: end.y } : { x: end.x + dx * k, y: end.y + dy * k };
}

/** A stroke as a marker would leave it: the colour inside a dark edge, so it shows on a dark wall and a bright sky alike. */
function inked(ctx: CanvasRenderingContext2D, points: (readonly [number, number])[], color: string, width: number, dashed = false) {
  if (points.length < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(dashed ? [width * 2.6, width * 2.4] : []);
  for (const [w, style] of [[width + 5, INK], [width, color]] as const) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.lineWidth = w;
    ctx.strokeStyle = style;
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** A hand-drawn line from a to b, bowed to one side, as far as `p` of the way. Returns the points drawn. */
function handStroke(a: { x: number; y: number }, b: { x: number; y: number }, bow: number, p: number): [number, number][] {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / length;
  const ny = (b.x - a.x) / length;
  // The same line always wobbles the same way: its unevenness comes from where it is.
  const seed = a.x * 0.017 + b.y * 0.023;
  const steps = 32;
  const points: [number, number][] = [];
  for (let k = 0; k <= Math.max(1, Math.round(steps * p)); k++) {
    const u = k / steps;
    const off = Math.sin(Math.PI * u) * bow * length + Math.sin(u * 9 + seed) * Math.min(2.4, length * 0.01) * Math.sin(Math.PI * u);
    points.push([lerp(a.x, b.x, u) + nx * off, lerp(a.y, b.y, u) + ny * off]);
  }
  return points;
}

/** An arrow, a line or a dot's path shorter than this on screen is a smudge, not a mark, and is left out. */
const SHORTEST_STROKE = 44;

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, view: View, image: ImageObject | undefined, age: number, left: number) {
  const leaving = clamp01(left / 0.3);
  if (age < 0 || leaving <= 0) return;
  ctx.save();
  ctx.globalAlpha = leaving;
  switch (mark.kind) {
    case "arrow":
    case "line": {
      const from = anchorOf(view, image, mark.from);
      const to = anchorOf(view, image, mark.to);
      if (!from || !to) break;
      const a = edgeToward(from, to, 10);
      const b = edgeToward(to, from, mark.kind === "arrow" ? 14 : 10);
      if (Math.hypot(b.x - a.x, b.y - a.y) < SHORTEST_STROKE) break;
      const p = easeInOutCubic(clamp01(age / mark.dur));
      const bow = mark.kind === "line" ? 0 : mark.bend === "straight" ? 0 : mark.bend === "left" ? -0.14 : 0.14;
      const points = handStroke(a, b, bow, p);
      const color = COLORS[mark.color];
      const width = mark.kind === "arrow" ? 6 : 5;
      inked(ctx, points, color, width, mark.kind === "line" && mark.dashed);
      if (mark.kind === "arrow" && p > 0.2 && points.length > 3) {
        // The head: two short strokes back from the tip, opening as the line arrives.
        const [tx, ty] = points[points.length - 1];
        const [bx, by] = points[Math.max(0, points.length - 4)];
        const angle = Math.atan2(ty - by, tx - bx);
        const reach = 24 * clamp01((p - 0.2) / 0.5);
        for (const side of [-1, 1]) {
          inked(ctx, [[tx, ty], [tx - Math.cos(angle + side * 0.5) * reach, ty - Math.sin(angle + side * 0.5) * reach]], color, width);
        }
      }
      break;
    }
    case "box": {
      const box = typeof mark.target === "string" ? anchorOf(view, image, mark.target)?.box : onScreen(view, [mark.target.x, mark.target.y, mark.target.w, mark.target.h]);
      if (!box) break;
      const pad = Math.max(6, Math.min(16, Math.min(box.w, box.h) * 0.1));
      const x = box.x - pad;
      const y = box.y - pad;
      const w = box.w + pad * 2;
      const h = box.h + pad * 2;
      const p = easeInOutCubic(clamp01(age / mark.dur));
      const color = COLORS[mark.color];
      if (mark.style === "highlight") {
        // A marker pulled across the thing from left to right.
        ctx.globalAlpha = leaving * 0.34;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, w * p, h, 8);
        ctx.fill();
        break;
      }
      // Round the four sides in one go, ending a little past where it began, as a hand would.
      const round = (w + h) * 2;
      const seed = x * 0.011 + y * 0.019;
      const points: [number, number][] = [];
      const upTo = round * 1.03 * p;
      for (let d = 0; d <= upTo; d += 6) {
        const e = d % round;
        const wobble = Math.sin(d * 0.045 + seed) * 1.6;
        if (e < w) points.push([x + e, y + wobble]);
        else if (e < w + h) points.push([x + w + wobble, y + e - w]);
        else if (e < w * 2 + h) points.push([x + w - (e - w - h), y + h + wobble]);
        else points.push([x + wobble, y + h - (e - w * 2 - h)]);
      }
      inked(ctx, points, color, 4.5);
      break;
    }
    case "stamp": {
      const at = anchorOf(view, image, mark.at);
      if (!at) break;
      const size = mark.size === "large" ? 120 : mark.size === "small" ? 48 : 78;
      const pop = 0.5 + 0.5 * easeOutBack(clamp01(age / mark.dur));
      ctx.globalAlpha = leaving * clamp01(age / 0.12);
      drawIcon(ctx, mark.icon, at.x, at.y, size * pop, { color: INK, width: size * 0.19 });
      drawIcon(ctx, mark.icon, at.x, at.y, size * pop, { color: COLORS[mark.color], width: size * 0.1, filled: true });
      break;
    }
    case "travel": {
      const stops = mark.path.map((spot) => anchorOf(view, image, spot));
      if (stops.some((stop) => !stop)) break;
      const points = (stops as Anchor[]).map((stop) => [stop.x, stop.y] as const);
      const lengths = points.slice(1).map(([x, y], n) => Math.hypot(x - points[n][0], y - points[n][1]));
      const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
      if (total < SHORTEST_STROKE) break;
      /** The point a share `u` of the way along the whole path. */
      const along = (u: number): [number, number] => {
        let left = clamp01(u) * total;
        for (let n = 0; n < lengths.length; n++) {
          if (left <= lengths[n] || n === lengths.length - 1) {
            const k = lengths[n] ? Math.min(1, left / lengths[n]) : 0;
            return [lerp(points[n][0], points[n + 1][0], k), lerp(points[n][1], points[n + 1][1], k)];
          }
          left -= lengths[n];
        }
        return [points[0][0], points[0][1]];
      };
      const run = age / mark.dur;
      const p = mark.repeat ? run % 1 : easeInOutCubic(clamp01(run));
      const color = COLORS[mark.color];
      // The way it has come glows behind it and fades; the dot itself is bright with a soft halo.
      ctx.lineCap = "round";
      for (let k = 12; k >= 1; k--) {
        const from = along(p - (k * 0.3) / 12);
        const to = along(p - ((k - 1) * 0.3) / 12);
        ctx.globalAlpha = leaving * (1 - k / 13) * 0.7;
        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.lineWidth = 14 * (1 - k / 14);
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      const [x, y] = along(p);
      ctx.globalAlpha = leaving;
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(x, y, 13 + Math.sin(age * 7) * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fill();
      break;
    }
    case "effect": {
      const whole = mark.effect === "rain" || mark.effect === "snow";
      const at = whole ? { x: 0, y: 0 } : mark.at ? anchorOf(view, image, mark.at) : null;
      if (!at) break;
      // The effects were made for a smaller picture, so one from a spot is drawn larger here.
      const scale = whole ? 1 : 3.4;
      ctx.translate(at.x, at.y);
      ctx.scale(scale, scale);
      const config =
        mark.effect === "rain" ? rainEmitter(VIEW_W, VIEW_H, mark.seed)
        : mark.effect === "snow" ? snowEmitter(VIEW_W, VIEW_H, mark.seed)
        : mark.effect === "fire" ? fireEmitter(0, 0, mark.seed)
        : mark.effect === "smoke" ? smokeEmitter(0, 0, mark.seed)
        : mark.effect === "sparks" ? sparksEmitter(0, 0, mark.seed)
        : mark.effect === "dust" ? dustEmitter(0, 0, mark.seed)
        : mark.effect === "confetti" ? confettiEmitter(0, 0, mark.seed)
        : energyEmitter(0, 0, mark.seed);
      emit(ctx, config, age);
      // A second layer, out of step with the first, so a fire or a plume is thick enough to read as one.
      if (!whole && mark.effect !== "confetti") emit(ctx, { ...config, seed: mark.seed + 97 }, age + 0.37);
      break;
    }
  }
  ctx.restore();
}

/** The pointer: a cursor that glides from spot to spot, and gives a small ripple where it lands. */
function drawPointer(ctx: CanvasRenderingContext2D, track: PointerTrack, view: View, image: ImageObject | undefined, t: number) {
  const first = track.keys[0];
  if (!first || t < first.at || t >= track.until) return;
  let pos: { x: number; y: number } | null = null;
  let landed = -1;
  for (const key of track.keys) {
    if (key.at > t) break;
    const to = anchorOf(view, image, key.spot);
    if (!to) continue;
    // It comes in from the lower right the first time, and from where it was after that.
    const from: { x: number; y: number } = pos ?? { x: Math.min(VIEW_W + 60, to.x + 260), y: Math.min(VIEW_H + 60, to.y + 240) };
    const p = easeInOutCubic(clamp01((t - key.at) / key.dur));
    pos = { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) };
    landed = t - key.at - key.dur;
  }
  if (!pos) return;
  ctx.save();
  ctx.globalAlpha = clamp01((t - first.at) / 0.2) * clamp01((track.until - t) / 0.25);
  if (landed >= 0 && landed < 0.55) {
    const p = landed / 0.55;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 8 + easeOutCubic(p) * 30, 0, Math.PI * 2);
    ctx.lineWidth = 4 * (1 - p) + 1;
    ctx.strokeStyle = `rgba(255, 210, 74, ${1 - p})`;
    ctx.stroke();
  }
  ctx.translate(pos.x, pos.y);
  ctx.scale(2.1, 2.1);
  ctx.beginPath();
  for (const [i, [x, y]] of ([[0, 0], [0, 17], [4.4, 13.2], [7.4, 20], [10.2, 18.8], [7.2, 12.2], [12.6, 12.2]] as const).entries()) {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** A tag naming a thing, with a line to it. Placed above the thing when there is room, else below. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, box: Rect, age: number, left: number, placed: Rect[]) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (cx < -40 || cx > VIEW_W + 40 || cy < -40 || cy > VIEW_H + 40) return; // the camera has left it
  const p = easeOutBack(clamp01(age / 0.4));
  const alpha = clamp01(age / 0.25) * clamp01(left / 0.3);
  if (alpha <= 0) return;

  ctx.save();
  ctx.font = `700 27px ${HAND}`;
  const w = ctx.measureText(text).width + 28;
  const h = 38;
  const reach = Math.min(box.h / 2, 90) + 34;
  const above = cy - reach - h > 16;
  let tag: Rect = { x: cx - w / 2, y: above ? cy - reach - h : Math.min(VIEW_H - 130, cy + reach), w, h };
  tag.x = Math.min(VIEW_W - w - 14, Math.max(14, tag.x));
  // Step aside from tags already placed this frame.
  for (const other of placed) {
    if (tag.x < other.x + other.w + 6 && tag.x + tag.w + 6 > other.x && tag.y < other.y + other.h + 6 && tag.y + tag.h + 6 > other.y) {
      tag = { ...tag, y: above ? other.y - h - 8 : other.y + other.h + 8 };
    }
  }
  placed.push(tag);

  ctx.globalAlpha = alpha;
  const from = { x: tag.x + w / 2, y: above ? tag.y + h : tag.y };
  const to = { x: cx, y: above ? Math.max(box.y + 6, cy - Math.min(box.h / 2, 90)) : Math.min(box.y + box.h - 6, cy + Math.min(box.h / 2, 90)) };
  const reachP = clamp01(age / 0.35);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(lerp(from.x, to.x, reachP), lerp(from.y, to.y, reachP));
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  if (reachP >= 1) {
    ctx.beginPath();
    ctx.arc(to.x, to.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  ctx.translate(tag.x + w / 2, tag.y + h / 2);
  ctx.scale(0.86 + 0.14 * p, 0.86 + 0.14 * p);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 10);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

/** A figure's own line: a speech bubble above the speaker, its tail pointing down at them. */
function drawSpeech(ctx: CanvasRenderingContext2D, text: string, box: Rect, age: number, left: number) {
  const alpha = clamp01(age / 0.2) * clamp01(left / 0.25);
  const cx = box.x + box.w / 2;
  if (alpha <= 0 || cx < -60 || cx > VIEW_W + 60) return;
  ctx.save();
  ctx.font = `700 28px ${HAND}`;
  const lines = wrap(ctx, text, 330);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 34;
  const h = lines.length * 27 + 22;
  // Above the speaker when there is room, otherwise below; kept inside the frame and clear of the subtitles.
  const above = box.y - h - 26 > 12;
  const x = Math.min(VIEW_W - w - 14, Math.max(14, cx - w / 2));
  const y = above ? Math.max(12, box.y - h - 22) : Math.min(VIEW_H - 126 - h, box.y + box.h + 22);
  const tipX = Math.min(x + w - 22, Math.max(x + 22, cx));
  const p = easeOutBack(clamp01(age / 0.35));
  ctx.globalAlpha = alpha;
  ctx.translate(tipX, above ? y + h : y);
  ctx.scale(0.8 + 0.2 * p, 0.8 + 0.2 * p);
  ctx.translate(-tipX, -(above ? y + h : y));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  if (above) {
    ctx.moveTo(tipX - 11, y + h - 1);
    ctx.lineTo(tipX, y + h + 16);
    ctx.lineTo(tipX + 11, y + h - 1);
  } else {
    ctx.moveTo(tipX - 11, y + 1);
    ctx.lineTo(tipX, y - 16);
    ctx.lineTo(tipX + 11, y + 1);
  }
  ctx.fillStyle = "#ffffff";
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + 11 + 27 * (i + 0.5)));
  ctx.restore();
}

/** Where words of this size go when they sit beside a thing: above it when there is room, else below, inside the frame. */
function besideBox(anchor: Anchor, w: number, h: number): Rect {
  const top = anchor.box ? anchor.box.y : anchor.y;
  const bottom = anchor.box ? anchor.box.y + anchor.box.h : anchor.y;
  const floor = VIEW_H - 150 - h;
  const above = top - h - 14 > 12;
  const box = { x: Math.min(VIEW_W - 20 - w, Math.max(20, anchor.x - w / 2)), y: Math.min(Math.max(12, floor), Math.max(12, above ? top - h - 14 : bottom + 14)), w, h };
  zoneTaken.push(box);
  return box;
}

function drawOverlay(ctx: CanvasRenderingContext2D, object: OverlayObject, entrance: "fade" | "slam" | "word-by-word", t: number, at: number, dur: number, until: number, anchor: Anchor | null = null) {
  const age = t - at;
  const exit = clamp01((until - t) / 0.3);
  const enter = clamp01(age / Math.min(0.5, dur));
  if (exit <= 0 || age < 0) return;
  ctx.save();
  ctx.globalAlpha = exit * (entrance === "slam" ? clamp01(age / 0.08) : enter);

  switch (object.kind) {
    case "text": {
      const size = object.size === "large" ? 104 : object.size === "small" ? 40 : 64;
      ctx.font = `700 ${size}px ${HAND}`;
      const lines = wrap(ctx, object.text, VIEW_W - 120);
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const box = anchor ? besideBox(anchor, widest, lines.length * size * 1.1) : zoneBox(object.zone, widest, lines.length * size * 1.1);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      ctx.translate(cx, cy);
      if (entrance === "slam") {
        // Lands oversized and settles, like a stamp.
        const s = 1 + (1 - easeOutBack(clamp01(age / 0.32))) * 1.6;
        ctx.scale(s, s);
        ctx.rotate(-0.03);
      } else if (entrance === "fade") {
        ctx.translate(0, (1 - easeOutCubic(enter)) * 16);
      }
      const color = COLORS[object.color ?? "white"];
      let wordIndex = 0;
      lines.forEach((line, i) => {
        const y = (i - (lines.length - 1) / 2) * size * 1.1;
        if (entrance !== "word-by-word") {
          comicText(ctx, line, 0, y, size, color);
          return;
        }
        // Each word pops in turn, left to right.
        ctx.font = `700 ${size}px ${HAND}`;
        const space = ctx.measureText(" ").width;
        let x = -ctx.measureText(line).width / 2;
        for (const word of line.split(" ")) {
          const p = clamp01((age - wordIndex * 0.14) / 0.22);
          wordIndex++;
          const width = ctx.measureText(word).width;
          if (p > 0) {
            ctx.save();
            ctx.globalAlpha *= p;
            ctx.translate(x + width / 2, y + (1 - easeOutBack(p)) * 14);
            comicText(ctx, word, 0, 0, size, color);
            ctx.restore();
            ctx.font = `700 ${size}px ${HAND}`;
          }
          x += width + space;
        }
      });
      if (object.underline) {
        const p = easeOutCubic(clamp01((age - 0.2) / 0.45));
        const y = ((lines.length - 1) / 2) * size * 1.1 + size * 0.5;
        if (p > 0) inked(ctx, handStroke({ x: -widest / 2, y }, { x: widest / 2, y: y - 3 }, 0.015, p), color, Math.max(4, size * 0.06));
      }
      break;
    }
    case "timeline": {
      const box = zoneBox(object.zone ?? "bottom", 800, 168);
      panel(ctx, box.x, box.y, box.w, box.h);
      const n = object.events.length;
      const x0 = box.x + 80;
      const x1 = box.x + box.w - 80;
      const y = box.y + 72;
      const step = (x1 - x0) / Math.max(1, n - 1);
      // The line runs out from the left, and each moment lands on it in turn.
      const reach = easeOutCubic(clamp01(age / (0.4 + n * 0.35)));
      inked(ctx, [[x0 - 30, y], [lerp(x0 - 30, x1 + 30, reach), y]], "#ffffff", 3.5);
      object.events.forEach((event, i) => {
        const p = clamp01((age - 0.25 - i * 0.4) / 0.3);
        if (p <= 0) return;
        const x = x0 + i * step;
        ctx.save();
        ctx.globalAlpha *= p;
        ctx.beginPath();
        ctx.arc(x, y, 5 + 4 * easeOutBack(p), 0, Math.PI * 2);
        ctx.fillStyle = COLORS.accent;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = INK;
        ctx.stroke();
        comicText(ctx, event.when, x, y - 34, 34, COLORS.accent);
        ctx.font = `700 23px ${HAND}`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        wrap(ctx, event.label, Math.max(110, step - 12)).forEach((line, k) => ctx.fillText(line, x, y + 30 + k * 24));
        ctx.restore();
      });
      break;
    }
    case "equation": {
      const size = 40;
      const m = measureMath(object.value, size);
      const box = zoneBox(object.zone, m.w + 56, m.h + 40);
      panel(ctx, box.x, box.y, box.w, box.h);
      drawMath(ctx, object.value, box.x + box.w / 2, box.y + box.h / 2, { size, color: "#ffffff", align: "center", p: easeOutCubic(clamp01(age / Math.max(0.6, dur))) });
      break;
    }
    case "counter": {
      const value = lerp(object.from ?? 0, object.to, easeOutCubic(clamp01(age / Math.max(1.2, dur))));
      const shown = formatNumber(value, { decimals: object.decimals ?? 0, prefix: object.prefix ?? "", suffix: object.suffix ?? "" });
      const final = formatNumber(object.to, { decimals: object.decimals ?? 0, prefix: object.prefix ?? "", suffix: object.suffix ?? "" });
      ctx.font = `700 78px ${HAND}`;
      const w = Math.max(ctx.measureText(final).width, object.label ? object.label.length * 11 : 0) + 56;
      const box = zoneBox(object.zone, w, object.label ? 124 : 96);
      panel(ctx, box.x, box.y, box.w, box.h);
      comicText(ctx, shown, box.x + box.w / 2, box.y + 50, 78, COLORS.accent);
      if (object.label) {
        ctx.font = `700 25px ${HAND}`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(object.label, box.x + box.w / 2, box.y + 100);
      }
      break;
    }
    case "chart": {
      const box = zoneBox(object.zone, 380, 250);
      panel(ctx, box.x, box.y, box.w, box.h);
      const top = object.title ? 44 : 20;
      if (object.title) {
        ctx.font = `700 25px ${HAND}`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(object.title, box.x + box.w / 2, box.y + 24);
      }
      const p = easeOutCubic(clamp01(age / Math.max(1, dur)));
      const max = Math.max(...object.data.map((d) => d.value), 1);
      ctx.textBaseline = "alphabetic";
      if (object.chart === "pie") {
        pie(ctx, box.x + box.w / 2, box.y + top + (box.h - top - 16) / 2, (box.h - top - 40) / 2, object.data, p, { labels: true });
      } else if (object.chart === "line") {
        const plot = makePlot({ x: box.x + 40, y: box.y + top, w: box.w - 70, h: box.h - top - 40 }, [0, object.data.length - 1], [0, max * 1.1]);
        lineChart(ctx, plot, object.data.map((d, i) => [i, d.value] as [number, number]), p, { area: true, color: COLORS.accent, markers: true });
      } else {
        const plot = makePlot({ x: box.x + 30, y: box.y + top + 14, w: box.w - 60, h: box.h - top - 54 }, [0, 1], [0, max * 1.1]);
        barChart(ctx, plot, object.data, { t: age, start: 0, step: 0.2, color: COLORS.accent, showValues: true });
      }
      break;
    }
  }
  ctx.restore();
}

function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `600 23px ${FONT}`;
  const lines = wrap(ctx, text, VIEW_W - 220);
  const lineH = 31;
  const w = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 28;
  const h = lines.length * lineH + 12;
  const x = (VIEW_W - w) / 2;
  const y = VIEW_H - 28 - h;
  ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, y + 6 + lineH * (i + 0.5)));
  ctx.restore();
}

// ── The frame ───────────────────────────────────────────────────────────────────────────────────────
export interface DrawOptions {
  /** Fade in from black at the start: on a change of place, not when the picture carries over. */
  fadeIn: boolean;
  subtitles: boolean;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: ResolvedScene, t: number, options: DrawOptions) {
  zoneTaken = [];
  ctx.save();
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.beginPath();
  ctx.rect(0, 0, VIEW_W, VIEW_H);
  ctx.clip();

  const picture = backdropAt(scene, t);
  const image = picture ? scene.images.get(picture) : undefined;
  const rect = coverRect(image?.aspect ?? VIEW_W / VIEW_H);

  // Shake: a jolt that dies away in about half a second.
  let dx = 0;
  let dy = 0;
  for (const shake of scene.shakes) {
    const age = t - shake.at;
    if (age < 0 || age > 0.6) continue;
    const fall = (1 - age / 0.6) ** 2;
    dx += Math.sin(age * 71) * shake.strength * fall;
    dy += Math.cos(age * 53) * shake.strength * 0.7 * fall;
  }

  const lens = picture ? lensAt(scene, t, picture, rect) : { fx: 0.5, fy: 0.5, zoom: 1 };
  // A little extra zoom while shaking, so the jolt never shows past the picture's edge.
  const view = viewOf({ ...lens, zoom: lens.zoom + (dx || dy ? 0.05 : 0) }, rect, dx, dy);
  // How this shot arrived: a hard cut, an iris opening from the middle, or a dissolve.
  const entryIndex = scene.backdrops.reduce((found, entry, i) => (entry.at <= t ? i : found), 0);
  const entry = scene.backdrops[entryIndex];
  const before = entryIndex > 0 ? scene.backdrops[entryIndex - 1] : undefined;
  const arriving = entry && before && entry.entrance !== "cut" ? clamp01((t - entry.at) / 0.7) : 1;
  if (arriving < 1 && before) {
    // The shot we are leaving, held where its camera stopped.
    const old = scene.images.get(before.picture);
    const oldRect = coverRect(old?.aspect ?? VIEW_W / VIEW_H);
    const oldView = viewOf(lensAt(scene, entry.at - 0.001, before.picture, oldRect), oldRect, 0, 0);
    const p = easeInOutCubic(arriving);
    /** Draw with the whole frame scaled about its middle. */
    const scaled = (by: number, draw: () => void) => {
      ctx.save();
      ctx.translate(VIEW_W / 2, VIEW_H / 2);
      ctx.scale(by, by);
      ctx.translate(-VIEW_W / 2, -VIEW_H / 2);
      draw();
      ctx.restore();
    };
    if (entry.entrance === "push") {
      // The old picture slides out to the left as the new one slides in from the right: "and next".
      drawBackdrop(ctx, old, { ...oldView, dx: -p * VIEW_W });
      drawBackdrop(ctx, image, { ...view, dx: view.dx + (1 - p) * VIEW_W });
    } else if (entry.entrance === "zoom") {
      // The camera dives into the old picture and comes out in the new one: "inside it".
      scaled(1 + p * 0.9, () => drawBackdrop(ctx, old, oldView));
      ctx.save();
      ctx.globalAlpha = clamp01((arriving - 0.25) / 0.6);
      // The new picture starts a little too close and settles, so it always covers the frame.
      scaled(1.3 - 0.3 * p, () => drawBackdrop(ctx, image, view));
      ctx.restore();
    } else {
      drawBackdrop(ctx, old, oldView);
      ctx.save();
      if (entry.entrance === "iris") {
        ctx.beginPath();
        ctx.arc(VIEW_W / 2, VIEW_H / 2, p * Math.hypot(VIEW_W, VIEW_H) * 0.52, 0, Math.PI * 2);
        ctx.clip();
      } else if (entry.entrance === "wipe") {
        // The new picture is drawn across from the left, behind a soft bright edge.
        ctx.beginPath();
        ctx.rect(0, 0, p * VIEW_W, VIEW_H);
        ctx.clip();
      } else {
        ctx.globalAlpha = p;
      }
      drawBackdrop(ctx, image, view);
      ctx.restore();
      if (entry.entrance === "wipe") {
        const edge = ctx.createLinearGradient(p * VIEW_W - 26, 0, p * VIEW_W + 4, 0);
        edge.addColorStop(0, "rgba(255, 255, 255, 0)");
        edge.addColorStop(1, `rgba(255, 255, 255, ${0.55 * (1 - arriving)})`);
        ctx.fillStyle = edge;
        ctx.fillRect(p * VIEW_W - 26, 0, 30, VIEW_H);
      }
    }
  } else {
    drawBackdrop(ctx, image, view);
  }

  const spotOf = (part?: string) => (part ? image?.hotspots?.[part] : undefined);
  for (const mark of scene.attentions) {
    if (t < mark.at || t >= mark.until || mark.item.picture !== picture) continue;
    drawAttention(ctx, mark.item.verb, onScreen(view, spotOf(mark.item.part)), t - mark.at, mark.until - t);
  }

  // Film grade: a soft dark vignette pulls the eye to the middle.
  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (const mark of scene.marks) {
    if (t < mark.at || t >= mark.until || mark.item.picture !== picture) continue;
    drawMark(ctx, mark.item, view, image, t - mark.at, mark.until - t);
  }

  const placed: Rect[] = [];
  for (const label of scene.labels) {
    if (t < label.at || t >= label.until || label.item.picture !== picture) continue;
    const spot = spotOf(label.item.part);
    // A label on a whole picture points at its middle, not at a box as big as the screen.
    const box = spot ? onScreen(view, spot) : onScreen(view, [0.4, 0.4, 0.2, 0.2]);
    drawLabel(ctx, label.item.text, box, t - label.at, label.until - t, placed);
  }

  for (const line of scene.speeches) {
    if (t < line.at || t >= line.until || line.item.picture !== picture) continue;
    const spot = spotOf(line.item.part);
    drawSpeech(ctx, line.item.text, spot ? onScreen(view, spot) : onScreen(view, [0.4, 0.4, 0.2, 0.2]), t - line.at, line.until - t);
  }

  for (const overlay of scene.overlays) {
    if (t < overlay.at || t >= overlay.until) continue;
    const object = overlay.item.object;
    // Words set beside a thing go there while its picture is on screen; otherwise they go to their zone.
    const near = object.kind === "text" && object.near !== undefined && (typeof object.near !== "string" || object.near.split(".")[0] === picture) ? anchorOf(view, image, object.near) : null;
    drawOverlay(ctx, object, overlay.item.entrance, t, overlay.at, overlay.item.dur, overlay.until, near);
  }

  for (const track of scene.pointers) if (track.picture === picture) drawPointer(ctx, track, view, image, t);

  for (const at of scene.flashes) {
    const age = t - at;
    if (age < 0 || age > 0.4) continue;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - age / 0.4) ** 2})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  if (options.subtitles) {
    for (const line of scene.subtitles) {
      if (t < line.at || t >= line.until) continue;
      drawSubtitle(ctx, line.text, clamp01((t - line.at) / 0.12));
    }
  }

  if (options.fadeIn && t < 0.4) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - clamp01(t / 0.4)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}
