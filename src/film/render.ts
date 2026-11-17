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
import { backdropAt, type CameraKey, type ResolvedScene } from "./resolve";
import type { Hotspot, ImageObject, OverlayObject, Shot, Zone } from "./types";

export const VIEW_W = 960;
export const VIEW_H = 540;

const FONT = `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
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
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.2);
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
function zoneBox(zone: Zone | undefined, w: number, h: number): Rect {
  const m = 36;
  const bottom = VIEW_H - 118;
  const z = zone ?? "top";
  const x = z.includes("left") ? m : z.includes("right") ? VIEW_W - m - w : (VIEW_W - w) / 2;
  const y = z.startsWith("top") ? m : z.startsWith("bottom") ? bottom - h : (VIEW_H - h) / 2 - 20;
  return { x, y, w, h };
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

function drawAttention(ctx: CanvasRenderingContext2D, verb: "dim" | "encircle" | "pulse", box: Rect, age: number, left: number) {
  const fade = clamp01(age / 0.45) * clamp01(left / 0.35);
  if (fade <= 0) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  if (verb === "dim") {
    // Darken everything except the part: one path with a hole in it.
    const pad = 10;
    ctx.beginPath();
    ctx.rect(-20, -20, VIEW_W + 40, VIEW_H + 40);
    ctx.roundRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, 18);
    ctx.fillStyle = `rgba(4, 6, 12, ${0.62 * fade})`;
    ctx.fill("evenodd");
    ctx.beginPath();
    ctx.roundRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, 18);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255, 210, 74, ${0.9 * fade})`;
    ctx.stroke();
  } else if (verb === "encircle") {
    // A hand-drawn ring that draws itself on, slightly past a full turn.
    const p = easeOutCubic(clamp01(age / 0.8));
    ctx.globalAlpha = clamp01(left / 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, cy, box.w / 2 + 14, box.h / 2 + 14, -0.06, -Math.PI * 0.6, -Math.PI * 0.6 + Math.PI * 2.08 * p);
    ctx.lineCap = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = COLORS.accent;
    ctx.stroke();
  } else {
    for (let ring = 0; ring < 2; ring++) {
      const p = (age * 0.8 + ring * 0.5) % 1;
      ctx.globalAlpha = (1 - p) * fade;
      ctx.beginPath();
      ctx.ellipse(cx, cy, (box.w / 2) * (0.7 + p * 0.7) + 8, (box.h / 2) * (0.7 + p * 0.7) + 8, 0, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = COLORS.accent;
      ctx.stroke();
    }
  }
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
  ctx.font = `800 20px ${FONT}`;
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
  ctx.font = `800 21px ${FONT}`;
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

function drawOverlay(ctx: CanvasRenderingContext2D, object: OverlayObject, entrance: "fade" | "slam" | "word-by-word", t: number, at: number, dur: number, until: number) {
  const age = t - at;
  const exit = clamp01((until - t) / 0.3);
  const enter = clamp01(age / Math.min(0.5, dur));
  if (exit <= 0 || age < 0) return;
  ctx.save();
  ctx.globalAlpha = exit * (entrance === "slam" ? clamp01(age / 0.08) : enter);

  switch (object.kind) {
    case "text": {
      const size = object.size === "large" ? 78 : object.size === "small" ? 30 : 48;
      ctx.font = `900 ${size}px ${FONT}`;
      const lines = wrap(ctx, object.text, VIEW_W - 120);
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const box = zoneBox(object.zone, widest, lines.length * size * 1.1);
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
        ctx.font = `900 ${size}px ${FONT}`;
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
            ctx.font = `900 ${size}px ${FONT}`;
          }
          x += width + space;
        }
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
      ctx.font = `900 60px ${FONT}`;
      const w = Math.max(ctx.measureText(final).width, object.label ? object.label.length * 11 : 0) + 56;
      const box = zoneBox(object.zone, w, object.label ? 124 : 96);
      panel(ctx, box.x, box.y, box.w, box.h);
      comicText(ctx, shown, box.x + box.w / 2, box.y + 50, 60, COLORS.accent);
      if (object.label) {
        ctx.font = `700 18px ${FONT}`;
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
        ctx.font = `800 18px ${FONT}`;
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
    drawBackdrop(ctx, old, viewOf(lensAt(scene, entry.at - 0.001, before.picture, oldRect), oldRect, 0, 0));
    ctx.save();
    if (entry.entrance === "iris") {
      ctx.beginPath();
      ctx.arc(VIEW_W / 2, VIEW_H / 2, easeInOutCubic(arriving) * Math.hypot(VIEW_W, VIEW_H) * 0.52, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.globalAlpha = easeInOutCubic(arriving);
    }
    drawBackdrop(ctx, image, view);
    ctx.restore();
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
    drawOverlay(ctx, overlay.item.object, overlay.item.entrance, t, overlay.at, overlay.item.dur, overlay.until);
  }

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
