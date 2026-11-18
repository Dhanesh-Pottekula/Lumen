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
import { drawDate, drawList, drawText, drawTimeline } from "./cards";
import { drawArrow, drawAttention, drawEffect, drawIconMark, drawMeasure } from "./marks";
import { COLORS, comicText, FONT, HEADLINE, INK, loadFonts, panel, wrap, type Rect } from "./paint";
import { backdropAt, type ArrowEnd, type CameraKey, type ResolvedScene } from "./resolve";
import type { Entrance, Hotspot, ImageObject, OverlayObject, Shot, Zone } from "./types";

export const VIEW_W = 960;
export const VIEW_H = 540;


/** Zoom for each shot: on a whole picture, and the most it may reach on a part. */
// overview is the whole picture; wide keeps the thing with its context (about 1.2 times), as in AiRA's catalog.
const SHOT_ZOOM: Record<Shot, [number, number]> = { overview: [1, 1], wide: [1.08, 1.25], medium: [1.25, 1.6], close: [1.6, 2.1], detail: [2, 2.8] };

// ── Pictures ────────────────────────────────────────────────────────────────────────────────────────
const cache = new Map<string, HTMLImageElement>();

/** Load a picture into the cache the renderer draws from (and the film's fonts, once). Resolves either way: a failed picture draws as a dark frame. */
export function loadPicture(src: string): Promise<void> {
  const fonts = loadFonts();
  if (cache.has(src)) return fonts;
  return new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => {
      cache.set(src, image);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = src;
  }).then(() => fonts);
}

// ── Camera ──────────────────────────────────────────────────────────────────────────────────────────
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

// ── Placing things ─────────────────────────────────────────────────────────────────────────────────
/** Where a zone's box of size w × h sits. Bottom zones stay above the subtitles. */
/** The boxes this frame's words, formulas, counters and charts already occupy, so a new one never lands on another. */
let zoneTaken: Rect[] = [];

function zoneBox(zone: Zone | undefined, w: number, h: number): Rect {
  const m = 36;
  const bottom = VIEW_H - 118;
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
  const clash = (r: Rect) => placed.some((o) => r.x < o.x + o.w + 6 && r.x + r.w + 6 > o.x && r.y < o.y + o.h + 6 && r.y + r.h + 6 > o.y);
  const fits = (r: Rect) => r.y >= 10 && r.y + r.h <= VIEW_H - 124;
  const at = (y: number, dx = 0): Rect => ({ x: Math.min(VIEW_W - w - 14, Math.max(14, cx - w / 2 + dx)), y, w, h });
  // Above the thing if there is room, else below; slid sideways, then stacked, to step clear of what is already
  // on screen (cards, arrow tags, other labels).
  const aboveY = cy - reach - h;
  const belowY = Math.min(VIEW_H - 124 - h, cy + reach);
  const candidates: { tag: Rect; above: boolean }[] = [];
  for (const dx of [0, -(w / 2 + 40), w / 2 + 40]) {
    candidates.push({ tag: at(aboveY, dx), above: true }, { tag: at(belowY, dx), above: false });
  }
  for (let k = 1; k <= 3; k++) candidates.push({ tag: at(aboveY - k * (h + 8)), above: true }, { tag: at(belowY + k * (h + 8)), above: false });
  const chosen = candidates.find((c) => fits(c.tag) && !clash(c.tag)) ?? candidates.find((c) => fits(c.tag)) ?? candidates[0];
  const tag = chosen.tag;
  const above = chosen.above;
  placed.push(tag);

  ctx.globalAlpha = alpha;
  const from = { x: Math.min(tag.x + w - 14, Math.max(tag.x + 14, cx)), y: above ? tag.y + h : tag.y };
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

/** A figure's own line: a speech bubble above the speaker, its tail pointing down at them. A thought is a cloud
 * with a trail of little circles; a shout is a jagged burst. */
function drawSpeech(ctx: CanvasRenderingContext2D, text: string, style: "say" | "think" | "shout", box: Rect, age: number, left: number) {
  const alpha = clamp01(age / 0.2) * clamp01(left / 0.25);
  const cx = box.x + box.w / 2;
  if (alpha <= 0 || cx < -60 || cx > VIEW_W + 60) return;
  const shout = style === "shout";
  const think = style === "think";
  const words = shout ? text.toUpperCase() : text;
  const size = shout ? 26 : 21;
  const lineH = shout ? 31 : 27;
  ctx.save();
  ctx.font = shout ? `400 ${size + 4}px ${HEADLINE}` : `${think ? "italic " : ""}800 ${size}px ${FONT}`;
  const lines = wrap(ctx, words, 330);
  const pad = shout ? 34 : think ? 30 : 17;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const h = lines.length * lineH + (shout ? 40 : think ? 34 : 22);
  // Above the speaker when there is room; otherwise beside their head, on the side with more space. Kept inside
  // the frame and clear of the subtitles.
  const above = box.y - h - 30 > 12;
  const toRight = cx < VIEW_W / 2;
  const head = box.y + Math.min(box.h * 0.18, 60);
  const sideX = toRight ? box.x + box.w + 26 : box.x - w - 26;
  const x = Math.min(VIEW_W - w - 14, Math.max(14, above ? cx - w / 2 : sideX));
  const y = above ? Math.max(12, box.y - h - (think ? 40 : 22)) : Math.min(VIEW_H - 126 - h, Math.max(12, head - h / 2));
  const tipX = above ? Math.min(x + w - 22, Math.max(x + 22, cx)) : toRight ? x : x + w;
  const tipY = above ? y + h : Math.min(y + h - 18, Math.max(y + 18, head));
  const p = easeOutBack(clamp01(age / 0.35));
  ctx.globalAlpha = alpha;
  ctx.translate(tipX, tipY);
  ctx.scale(0.8 + 0.2 * p, 0.8 + 0.2 * p);
  // A shout shudders as it lands.
  if (shout && age < 0.5) ctx.translate(Math.sin(age * 90) * 4 * (1 - age / 0.5), 0);
  ctx.translate(-tipX, -tipY);
  ctx.beginPath();
  if (shout) {
    // A jagged burst around the words.
    const bx = x + w / 2;
    const by = y + h / 2;
    const spikes = 18;
    for (let i = 0; i <= spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const out = i % 2 === 0 ? 1.08 : 0.9;
      const jitter = 1 + 0.06 * Math.sin(i * 12.9898);
      const px = bx + Math.cos(a) * (w / 2) * out * jitter;
      const py = by + Math.sin(a) * (h / 2) * out * jitter;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (think) {
    // A cloud: bumps along a rounded box.
    const bumps = Math.max(4, Math.round(w / 46));
    const r = w / bumps / 2 + 4;
    ctx.roundRect(x + 6, y + 6, w - 12, h - 12, 26);
    for (let i = 0; i < bumps; i++) {
      const bx = x + r - 2 + i * ((w - 2 * r + 4) / Math.max(1, bumps - 1));
      ctx.moveTo(bx + r, y + 8);
      ctx.arc(bx, y + 8, r, 0, Math.PI * 2);
      ctx.moveTo(bx + r, y + h - 8);
      ctx.arc(bx, y + h - 8, r, 0, Math.PI * 2);
    }
  } else {
    ctx.roundRect(x, y, w, h, 16);
    if (above) {
      ctx.moveTo(tipX - 11, y + h - 1);
      ctx.lineTo(tipX, y + h + 16);
      ctx.lineTo(tipX + 11, y + h - 1);
    } else {
      // The tail points sideways at the speaker's head.
      const dir = toRight ? -1 : 1;
      ctx.moveTo(tipX - dir, tipY - 10);
      ctx.lineTo(tipX + dir * 18, tipY + 4);
      ctx.lineTo(tipX - dir, tipY + 10);
    }
  }
  ctx.fillStyle = shout ? "#fff3b0" : "#ffffff";
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fill();
  if (think) {
    // The trail of little circles from the thinker's head.
    for (const [k, r] of [[0, 9], [1, 6]] as const) {
      const bx = above ? tipX + (k + 1) * 6 : tipX + (toRight ? -1 : 1) * (12 + k * 16);
      const by = above ? y + h + 12 + k * 16 : tipY + (k + 1) * 6;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
  }
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = shout ? `400 ${size + 4}px ${HEADLINE}` : `${think ? "italic " : ""}800 ${size}px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + (h - lines.length * lineH) / 2 + lineH * (i + 0.5)));
  ctx.restore();
}

function drawOverlay(ctx: CanvasRenderingContext2D, object: OverlayObject, entrance: Entrance, t: number, at: number, dur: number, until: number, steps: number[]) {
  const age = t - at;
  const exit = clamp01((until - t) / 0.3);
  const enter = clamp01(age / Math.min(0.5, dur));
  if (exit <= 0 || age < 0) return;
  ctx.save();
  const instant = entrance === "slam" || entrance === "typewriter" || entrance === "word-by-word";
  ctx.globalAlpha = exit * (instant ? clamp01(age / 0.08) : enter);
  const place = (fallback: Zone) => (w: number, h: number) => zoneBox(object.zone ?? fallback, w, h);

  switch (object.kind) {
    case "text":
      drawText(ctx, object, entrance, age, dur, place("top"), VIEW_W - 120);
      break;
    case "date":
      drawDate(ctx, object, age, dur, place("top-left"));
      break;
    case "timeline":
      drawTimeline(ctx, object, steps, t, at, place("bottom"), VIEW_W - 80);
      break;
    case "list":
      drawList(ctx, object, steps, t, at, place("left"));
      break;
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
      comicText(ctx, shown, box.x + box.w / 2, box.y + 50, 60, COLORS[object.color ?? "accent"]);
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

/** A subtitle line, with the word being spoken picked out as the voice reaches it. */
function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, times: (number | null)[], t: number, alpha: number) {
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
  // The token being spoken: the last one whose time has come.
  let speaking = -1;
  times.forEach((at, i) => {
    if (at !== null && at <= t) speaking = i;
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const space = ctx.measureText(" ").width;
  let token = 0;
  lines.forEach((line, i) => {
    let cx = VIEW_W / 2 - ctx.measureText(line).width / 2;
    const cy = y + 6 + lineH * (i + 0.5);
    for (const word of line.split(" ")) {
      ctx.fillStyle = token === speaking ? COLORS.accent : "#ffffff";
      ctx.fillText(word, cx, cy);
      cx += ctx.measureText(word).width + space;
      token++;
    }
  });
  ctx.restore();
}

/**
 * Two pictures side by side, each covering its half of the frame, with a dark bar between them. `slide` runs
 * 0..1 as the halves slide in from the sides. Returns the view of each half, so marks land on the right one.
 */
function drawSplit(ctx: CanvasRenderingContext2D, scene: ResolvedScene, pair: [string, string], slide: number, dx: number, dy: number): Map<string, View> {
  const views = new Map<string, View>();
  const half = VIEW_W / 2;
  pair.forEach((id, side) => {
    const image = scene.images.get(id);
    const aspect = image?.aspect ?? VIEW_W / VIEW_H;
    const w = Math.max(half, VIEW_H * aspect);
    const h = w / aspect;
    const shift = (1 - slide) * half * (side === 0 ? -1 : 1);
    const rect = { x: side * half + (half - w) / 2 + shift, y: (VIEW_H - h) / 2, w, h };
    // With the centre at the middle of the frame and no zoom, a view maps picture space straight to the screen.
    const view: View = { px: VIEW_W / 2, py: VIEW_H / 2, zoom: 1, rect, dx, dy };
    ctx.save();
    ctx.beginPath();
    ctx.rect(side * half + shift, 0, half, VIEW_H);
    ctx.clip();
    drawBackdrop(ctx, image, view);
    ctx.restore();
    views.set(id, view);
  });
  if (slide > 0.6) {
    ctx.save();
    ctx.globalAlpha = clamp01((slide - 0.6) / 0.4);
    ctx.fillStyle = INK;
    ctx.fillRect(half - 4, 0, 8, VIEW_H);
    ctx.restore();
  }
  return views;
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
  // How this shot arrived: a hard cut, an iris opening from the middle, a dissolve, or a split sliding in.
  const entryIndex = scene.backdrops.reduce((found, entry, i) => (entry.at <= t ? i : found), 0);
  const entry = scene.backdrops[entryIndex];
  const before = entryIndex > 0 ? scene.backdrops[entryIndex - 1] : undefined;
  const arriving = entry && before && entry.entrance !== "cut" ? clamp01((t - entry.at) / (entry.entrance === "split" ? 0.55 : 0.7)) : 1;
  /** Where each picture on screen is drawn: one view, or one for each half of a split. */
  const views = new Map<string, View>();
  const drawOld = () => {
    if (!before) return;
    if (before.pair) {
      drawSplit(ctx, scene, before.pair, 1, 0, 0);
      return;
    }
    const old = scene.images.get(before.picture);
    const oldRect = coverRect(old?.aspect ?? VIEW_W / VIEW_H);
    drawBackdrop(ctx, old, viewOf(lensAt(scene, entry.at - 0.001, before.picture, oldRect), oldRect, 0, 0));
  };
  if (entry?.pair) {
    if (arriving < 1) drawOld();
    for (const [id, v] of drawSplit(ctx, scene, entry.pair, easeOutCubic(arriving), dx, dy)) views.set(id, v);
  } else {
    if (picture) views.set(picture, view);
    if (arriving < 1 && before) {
      // The shot we are leaving, held where its camera stopped.
      drawOld();
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
  }

  type Item = { picture: string; part?: string };
  const spotOf = (item: Item) => (item.part ? scene.images.get(item.picture)?.hotspots?.[item.part] : undefined);
  const live = <T extends Item>(m: { at: number; until: number; item: T }) => t >= m.at && t < m.until && views.has(m.item.picture);
  const screenOf = (item: Item) => onScreen(views.get(item.picture) as View, spotOf(item));
  // A mark on a whole picture points at its middle, not at a box as big as the screen.
  const boxOf = (item: Item) => (spotOf(item) ? screenOf(item) : onScreen(views.get(item.picture) as View, [0.4, 0.4, 0.2, 0.2]));

  // Marks that lie on the picture itself: tints and dimming under everything else.
  for (const mark of scene.attentions) {
    if (!live(mark) || (mark.item.verb !== "dim" && mark.item.verb !== "tint")) continue;
    drawAttention(ctx, mark.item.verb, screenOf(mark.item), !spotOf(mark.item), mark.item.color && COLORS[mark.item.color], t - mark.at, mark.until - t, VIEW_W, VIEW_H);
  }

  // Film grade: a soft vignette pulls the eye to the middle without darkening the picture.
  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.48, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.75);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  for (const effect of scene.effects) {
    if (!live(effect)) continue;
    drawEffect(ctx, effect.item.kind, screenOf(effect.item), !spotOf(effect.item), effect.item.seed, t - effect.at, effect.until - t, VIEW_W, VIEW_H);
  }

  for (const mark of scene.attentions) {
    if (!live(mark) || mark.item.verb === "dim" || mark.item.verb === "tint") continue;
    drawAttention(ctx, mark.item.verb, screenOf(mark.item), !spotOf(mark.item), mark.item.color && COLORS[mark.item.color], t - mark.at, mark.until - t, VIEW_W, VIEW_H);
  }

  // Words, dates, timelines, lists and charts. Drawn before the marks tied to things, so a label can step
  // aside from a card instead of hiding under it.
  for (const overlay of scene.overlays) {
    if (t < overlay.at || t >= overlay.until) continue;
    drawOverlay(ctx, overlay.item.object, overlay.item.entrance, t, overlay.at, overlay.item.dur, overlay.until, overlay.item.steps);
  }

  const placed: Rect[] = [...zoneTaken];
  const endOf = (picture: string, end: ArrowEnd) => end.edge ?? boxOf({ picture, part: end.part });
  for (const arrow of scene.arrows) {
    if (!live(arrow)) continue;
    const a = arrow.item;
    drawArrow(ctx, { from: endOf(a.picture, a.from), to: endOf(a.picture, a.to), text: a.text, dashed: a.style === "dashed", color: COLORS[a.color ?? "accent"], age: t - arrow.at, dur: a.dur, left: arrow.until - t }, VIEW_W, VIEW_H, placed);
  }

  for (const measure of scene.measures) {
    if (!live(measure)) continue;
    drawMeasure(ctx, boxOf(measure.item), measure.item.text, measure.item.side, t - measure.at, measure.until - t, VIEW_W, VIEW_H);
  }

  for (const label of scene.labels) {
    if (!live(label)) continue;
    drawLabel(ctx, label.item.text, boxOf(label.item), t - label.at, label.until - t, placed);
  }

  for (const icon of scene.icons) {
    if (!live(icon)) continue;
    const spot = spotOf(icon.item);
    drawIconMark(ctx, icon.item.icon, screenOf(icon.item), icon.item.slot, !spot, t - icon.at, icon.until - t, VIEW_W);
  }

  for (const line of scene.speeches) {
    if (!live(line)) continue;
    drawSpeech(ctx, line.item.text, line.item.style, boxOf(line.item), t - line.at, line.until - t);
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
      drawSubtitle(ctx, line.text, line.times, t, clamp01((t - line.at) / 0.12));
    }
  }

  if (options.fadeIn && t < 0.4) {
    ctx.fillStyle = `rgba(0, 0, 0, ${1 - clamp01(t / 0.4)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}
