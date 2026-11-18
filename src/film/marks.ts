/**
 * marks — what the film draws onto a picture, tied to the things in it: arrows, dimension lines, comic
 * symbols, moving matter (fire, smoke, rain...) and the marks that draw the eye (rings, boxes, crosses...).
 *
 * Everything here is drawn in screen space from a part's box after the camera, so a mark stays on its thing
 * while the camera moves, and stays sharp however far the picture is zoomed. Every function is pure in its
 * inputs: the same box and the same age give the same pixels.
 */
import { drawIcon } from "../render/icons";
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, prng } from "../render/motion";
import { emit, type EmitterConfig } from "../render/particles";
import { alpha, COLORS, comicText, FONT, HAND, HEADLINE, inkStroke, INK, type Rect } from "./paint";
import type { AttentionVerb, Edge, EffectKind, IconKind } from "./types";

type Pt = [number, number];

// ── Arrows ──────────────────────────────────────────────────────────────────────────────────────────

/** Where a ray from a box's centre toward `toward` leaves the box's inner ellipse, plus a gap. */
function rim(box: Rect, toward: Pt, gap: number): Pt {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  const len = Math.hypot(dx, dy) || 1;
  const rx = box.w * 0.42;
  const ry = box.h * 0.42;
  // Distance to the ellipse along the ray, so a wide part is left at its side and a tall one at its top.
  const r = 1 / Math.sqrt((dx / len / Math.max(rx, 1)) ** 2 + (dy / len / Math.max(ry, 1)) ** 2);
  const d = Math.min(r + gap, len * 0.45);
  return [cx + (dx / len) * d, cy + (dy / len) * d];
}

/** A point at an edge of the frame, level with `near`. An arrow coming in starts just outside the frame; one
 * going out ends just inside it, so its head is seen. */
function edgePoint(edge: Edge, near: Pt, w: number, h: number, inside: boolean): Pt {
  const m = inside ? 46 : -30;
  switch (edge) {
    case "left":
      return [m, Math.min(h - 150, Math.max(40, near[1] - 30))];
    case "right":
      return [w - m, Math.min(h - 150, Math.max(40, near[1] - 30))];
    case "top":
      return [Math.min(w - 40, Math.max(40, near[0] - 40)), m];
    case "bottom":
      return [Math.min(w - 40, Math.max(40, near[0] - 40)), h - 120 - (inside ? 20 : -60)];
  }
}

function quad(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
}

export interface ArrowDraw {
  from: Rect | Edge;
  to: Rect | Edge;
  text?: string;
  dashed: boolean;
  color: string;
  /** Seconds since the arrow began, and how long it takes to draw itself. */
  age: number;
  dur: number;
  /** Seconds until it leaves. */
  left: number;
}

/** A bold curved arrow that draws itself from one thing to another, its head landing last. */
export function drawArrow(ctx: CanvasRenderingContext2D, a: ArrowDraw, w: number, h: number, placed: Rect[]) {
  const fade = clamp01(a.left / 0.3);
  if (fade <= 0 || a.age < 0) return;
  const centre = (r: Rect): Pt => [r.x + r.w / 2, r.y + r.h / 2];
  const fromC = typeof a.from === "string" ? null : centre(a.from);
  const toC = typeof a.to === "string" ? null : centre(a.to);
  let start: Pt;
  let end: Pt;
  if (typeof a.from === "string" && toC && typeof a.to !== "string") {
    start = edgePoint(a.from, toC, w, h, false);
    end = rim(a.to, start, 10);
  } else if (typeof a.to === "string" && fromC && typeof a.from !== "string") {
    end = edgePoint(a.to, fromC, w, h, true);
    start = rim(a.from, end, 6);
  } else if (fromC && toC && typeof a.from !== "string" && typeof a.to !== "string") {
    start = rim(a.from, toC, 6);
    end = rim(a.to, fromC, 10);
  } else return;

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len < 12) return;
  // Bow the arrow a little, always upward-ish, so it reads as thrown rather than ruled.
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const bend = Math.min(len * 0.2, 90);
  const ctrl: Pt = [(start[0] + end[0]) / 2 + nx * bend, (start[1] + end[1]) / 2 + ny * bend];

  const p = easeInOutCubic(clamp01(a.age / a.dur));
  const steps = 48;
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) points.push(quad(start, ctrl, end, (i / steps) * p));
  const tip = points[points.length - 1];
  const back = quad(start, ctrl, end, Math.max(0, p - 0.04));
  const angle = Math.atan2(tip[1] - back[1], tip[0] - back[0]);
  // Stop the shaft short of the head so the head's point is sharp.
  const head = 26;
  const shaft = points.filter((q) => Math.hypot(q[0] - tip[0], q[1] - tip[1]) > head * 0.55);

  ctx.save();
  ctx.globalAlpha = fade;
  if (shaft.length > 1) {
    if (a.dashed) {
      ctx.setLineDash([16, 13]);
      ctx.lineDashOffset = -a.age * 26;
    }
    inkStroke(ctx, a.color, a.dashed ? 6 : 9, () => {
      ctx.moveTo(shaft[0][0], shaft[0][1]);
      for (const q of shaft) ctx.lineTo(q[0], q[1]);
    });
    ctx.setLineDash([]);
  }
  if (p > 0.15) {
    const s = head * easeOutBack(clamp01((p - 0.15) / 0.5));
    ctx.translate(tip[0], tip[1]);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-s, -s * 0.62);
    ctx.lineTo(-s * 0.72, 0);
    ctx.lineTo(-s, s * 0.62);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = a.color;
    ctx.fill();
  }
  ctx.restore();

  if (a.text && p > 0.55) {
    const at = quad(start, ctrl, end, 0.5);
    const show = easeOutBack(clamp01((p - 0.55) / 0.4));
    ctx.save();
    ctx.globalAlpha = fade * clamp01((p - 0.55) / 0.2);
    ctx.font = `800 19px ${FONT}`;
    const tw = ctx.measureText(a.text).width + 24;
    // Beside the shaft, far enough off it that the arrow itself stays in view.
    const off = Math.abs(nx) * (tw / 2 + 12) + Math.abs(ny) * 29;
    let x = Math.min(w - tw / 2 - 10, Math.max(tw / 2 + 10, at[0] + nx * off));
    let y = Math.min(h - 140, Math.max(24, at[1] + ny * off));
    for (const other of placed) {
      if (x - tw / 2 < other.x + other.w + 6 && x + tw / 2 + 6 > other.x && y - 17 < other.y + other.h + 6 && y + 17 + 6 > other.y) {
        x = Math.min(w - tw / 2 - 10, Math.max(tw / 2 + 10, at[0] - nx * off));
        y = Math.min(h - 140, Math.max(24, at[1] - ny * off));
        break;
      }
    }
    placed.push({ x: x - tw / 2, y: y - 17, w: tw, h: 34 });
    ctx.translate(x, y);
    ctx.scale(0.8 + 0.2 * show, 0.8 + 0.2 * show);
    ctx.beginPath();
    ctx.roundRect(-tw / 2, -17, tw, 34, 17);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(a.text, 0, 1);
    ctx.restore();
  }
}

// ── Dimension lines ─────────────────────────────────────────────────────────────────────────────────

/** A dashed dimension line along one side of a box, with end bars and its size written beside it. */
export function drawMeasure(ctx: CanvasRenderingContext2D, box: Rect, text: string, side: "below" | "above" | "left" | "right", age: number, left: number, w: number, h: number) {
  const fade = clamp01(left / 0.3);
  if (fade <= 0) return;
  const p = easeOutCubic(clamp01(age / 0.7));
  const horizontal = side === "below" || side === "above";
  const off = 16;
  let a: Pt;
  let b: Pt;
  if (horizontal) {
    const y = side === "below" ? Math.min(h - 130, box.y + box.h + off) : Math.max(20, box.y - off);
    a = [Math.max(14, box.x), y];
    b = [Math.min(w - 14, box.x + box.w), y];
  } else {
    const x = side === "right" ? Math.min(w - 20, box.x + box.w + off) : Math.max(20, box.x - off);
    a = [x, Math.max(14, box.y)];
    b = [x, Math.min(h - 130, box.y + box.h)];
  }
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ea: Pt = [lerp(mid[0], a[0], p), lerp(mid[1], a[1], p)];
  const eb: Pt = [lerp(mid[0], b[0], p), lerp(mid[1], b[1], p)];
  const red = COLORS.danger;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.setLineDash([10, 7]);
  inkStroke(ctx, red, 4, () => {
    ctx.moveTo(ea[0], ea[1]);
    ctx.lineTo(eb[0], eb[1]);
  });
  ctx.setLineDash([]);
  const bar = 13 * easeOutBack(clamp01((age - 0.45) / 0.3));
  if (bar > 0) {
    for (const e of [ea, eb]) {
      inkStroke(ctx, red, 4, () => {
        if (horizontal) {
          ctx.moveTo(e[0], e[1] - bar);
          ctx.lineTo(e[0], e[1] + bar);
        } else {
          ctx.moveTo(e[0] - bar, e[1]);
          ctx.lineTo(e[0] + bar, e[1]);
        }
      });
    }
  }
  const tp = clamp01((age - 0.5) / 0.3);
  if (tp > 0) {
    ctx.globalAlpha = fade * tp;
    ctx.font = `400 28px ${HAND}`;
    const tw = ctx.measureText(text).width;
    let x = mid[0];
    let y = mid[1];
    let align: CanvasTextAlign = "center";
    if (side === "below") y += 30;
    else if (side === "above") y -= 30;
    else if (side === "right") {
      x += 22;
      align = "left";
      if (x + tw > w - 10) {
        x = mid[0] - 22;
        align = "right";
      }
    } else {
      x -= 22;
      align = "right";
      if (x - tw < 10) {
        x = mid[0] + 22;
        align = "left";
      }
    }
    if (align === "center") x = Math.min(w - tw / 2 - 10, Math.max(tw / 2 + 10, x));
    comicText(ctx, text, x, y, 28, "#ffffff", align, `400 28px ${HAND}`);
  }
  ctx.restore();
}

// ── Comic symbols ───────────────────────────────────────────────────────────────────────────────────

function outlinedIcon(ctx: CanvasRenderingContext2D, name: Parameters<typeof drawIcon>[1], x: number, y: number, size: number, color: string) {
  drawIcon(ctx, name, x, y, size, { color: INK, width: 9 });
  drawIcon(ctx, name, x, y, size, { color, filled: true, width: 4 });
}

function glyph(ctx: CanvasRenderingContext2D, icon: IconKind, s: number) {
  switch (icon) {
    case "question":
      comicText(ctx, "?", 0, 0, s * 1.15, COLORS.accent, "center", `400 ${s * 1.15}px ${HEADLINE}`);
      break;
    case "exclaim":
      comicText(ctx, "!!", 0, 0, s * 1.15, COLORS.danger, "center", `400 ${s * 1.15}px ${HEADLINE}`);
      break;
    case "money":
      comicText(ctx, "$", 0, 0, s * 1.1, COLORS.good, "center", `400 ${s * 1.1}px ${HEADLINE}`);
      break;
    case "zzz":
      comicText(ctx, "z", -s * 0.35, s * 0.25, s * 0.45, COLORS.cool, "center", `400 ${s * 0.45}px ${HEADLINE}`);
      comicText(ctx, "z", 0, 0, s * 0.6, COLORS.cool, "center", `400 ${s * 0.6}px ${HEADLINE}`);
      comicText(ctx, "Z", s * 0.4, -s * 0.32, s * 0.8, COLORS.cool, "center", `400 ${s * 0.8}px ${HEADLINE}`);
      break;
    case "heart":
      outlinedIcon(ctx, "heart", 0, 0, s, "#ff4f73");
      break;
    case "star":
      outlinedIcon(ctx, "star", 0, 0, s, COLORS.accent);
      break;
    case "sweat":
      outlinedIcon(ctx, "drop", 0, 0, s * 0.9, COLORS.cool);
      break;
    case "fire":
      outlinedIcon(ctx, "flame", 0, 0, s, "#ff7a1a");
      break;
    case "warning":
      outlinedIcon(ctx, "triangle", 0, 0, s, COLORS.accent);
      comicText(ctx, "!", 0, s * 0.08, s * 0.5, INK, "center", `400 ${s * 0.5}px ${HEADLINE}`);
      break;
    case "check":
      inkStroke(ctx, COLORS.good, s * 0.16, () => {
        ctx.moveTo(-s * 0.4, 0);
        ctx.lineTo(-s * 0.1, s * 0.32);
        ctx.lineTo(s * 0.45, -s * 0.36);
      });
      break;
    case "cross":
      inkStroke(ctx, COLORS.danger, s * 0.16, () => {
        ctx.moveTo(-s * 0.35, -s * 0.35);
        ctx.lineTo(s * 0.35, s * 0.35);
        ctx.moveTo(s * 0.35, -s * 0.35);
        ctx.lineTo(-s * 0.35, s * 0.35);
      });
      break;
    case "clock":
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -s * 0.3);
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 0.2, s * 0.08);
      ctx.lineCap = "round";
      ctx.stroke();
      break;
    case "idea": {
      // A light bulb with rays.
      ctx.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const ang = -Math.PI / 2 + (i - 2) * 0.55;
        inkStroke(ctx, COLORS.accent, 3, () => {
          ctx.moveTo(Math.cos(ang) * s * 0.5, Math.sin(ang) * s * 0.5 - s * 0.08);
          ctx.lineTo(Math.cos(ang) * s * 0.68, Math.sin(ang) * s * 0.68 - s * 0.08);
        });
      }
      ctx.beginPath();
      ctx.arc(0, -s * 0.08, s * 0.3, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineTo(s * 0.13, s * 0.25);
      ctx.lineTo(-s * 0.13, s * 0.25);
      ctx.closePath();
      ctx.fillStyle = "#fff3a0";
      ctx.fill();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = "#9aa3ad";
      ctx.fillRect(-s * 0.13, s * 0.27, s * 0.26, s * 0.14);
      ctx.strokeRect(-s * 0.13, s * 0.27, s * 0.26, s * 0.14);
      break;
    }
    case "skull": {
      ctx.beginPath();
      ctx.arc(0, -s * 0.06, s * 0.38, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(s * 0.22, s * 0.38);
      ctx.lineTo(-s * 0.22, s * 0.38);
      ctx.closePath();
      ctx.fillStyle = "#f4f1e8";
      ctx.fill();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      for (const ex of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(ex * s * 0.15, -s * 0.03, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(0, s * 0.1);
      ctx.lineTo(-s * 0.05, s * 0.2);
      ctx.lineTo(s * 0.05, s * 0.2);
      ctx.fill();
      ctx.lineWidth = 3;
      for (const tx of [-0.1, 0, 0.1]) {
        ctx.beginPath();
        ctx.moveTo(tx * s, s * 0.28);
        ctx.lineTo(tx * s, s * 0.38);
        ctx.stroke();
      }
      break;
    }
    case "anger": {
      // The four-cornered vein mark comics put on an angry head.
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2 + Math.PI / 4;
        const cx = Math.cos(ang) * s * 0.2;
        const cy = Math.sin(ang) * s * 0.2;
        inkStroke(ctx, COLORS.danger, s * 0.1, () => {
          ctx.arc(cx, cy, s * 0.2, ang + Math.PI * 0.75, ang + Math.PI * 1.25);
        });
      }
      break;
    }
    case "music": {
      ctx.fillStyle = INK;
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.ellipse(-s * 0.15, s * 0.25, s * 0.16, s * 0.11, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.01, s * 0.22);
      ctx.lineTo(-s * 0.01, -s * 0.38);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.25, s * 0.3, -s * 0.05);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

/** A comic symbol that pops up beside a thing and then bobs gently, as if alive. */
export function drawIconMark(ctx: CanvasRenderingContext2D, icon: IconKind, box: Rect, slot: number, whole: boolean, age: number, left: number, w: number) {
  const fade = clamp01(left / 0.25);
  if (fade <= 0 || age < 0) return;
  const s = 50;
  const x0 = whole ? w / 2 : box.x + box.w * 0.82;
  let x = x0 + slot * (s + 8);
  let y = whole ? box.y + box.h * 0.22 : box.y - s * 0.55;
  x = Math.min(w - s * 0.7, Math.max(s * 0.7, x));
  y = Math.max(s * 0.7, y);
  const pop = easeOutBack(clamp01(age / 0.35));
  ctx.save();
  ctx.globalAlpha = fade * clamp01(age / 0.12);
  ctx.translate(x, y + Math.sin(age * 3.1 + slot) * 4);
  ctx.rotate(Math.sin(age * 2.3 + slot * 1.7) * 0.08);
  ctx.scale(pop, pop);
  glyph(ctx, icon, s);
  ctx.restore();
}

// ── Moving matter ───────────────────────────────────────────────────────────────────────────────────

/** Speed lines: streaks racing across the frame, the cartoon sign of something moving fast. */
function speedLines(ctx: CanvasRenderingContext2D, age: number, seed: number, w: number, h: number) {
  const rand = prng(seed * 7919 + 13);
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 26; i++) {
    const y = rand() * (h - 140) + 10;
    const len = 80 + rand() * 220;
    const speed = 900 + rand() * 900;
    const offset = rand() * (w + len);
    const x = w + len - ((age * speed + offset) % (w + len * 2));
    const width = 2 + rand() * 3;
    ctx.globalAlpha = 0.35 + rand() * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.lineWidth = width + 2.5;
    ctx.strokeStyle = "rgba(11, 13, 18, 0.45)";
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  ctx.restore();
}

function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, alpha(color, a));
  g.addColorStop(1, alpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Cartoon flames: tongues of fire in three layers, red outside and yellow at the heart, flickering. */
function cartoonFlames(ctx: CanvasRenderingContext2D, x0: number, x1: number, base: number, height: number, age: number, seed: number) {
  const span = Math.max(30, x1 - x0);
  const count = Math.max(2, Math.min(9, Math.round(span / 42)));
  const gap = span / count;
  const rand = prng(seed * 977 + 5);
  const tongues = Array.from({ length: count }, (_, i) => {
    const middle = 1 - Math.abs((i + 0.5) / count - 0.5) * 1.2;
    return { x: x0 + gap * (i + 0.5), tall: height * (0.55 + 0.45 * middle) * (0.8 + 0.4 * rand()), phase: rand() * 10, speed: 7 + rand() * 5 };
  });
  // The shorter tongues at the sides are drawn first, so the tall ones in the middle sit in front.
  tongues.sort((a, b) => a.tall - b.tall);
  const layers: [number, string][] = [
    [1, "#ff4a1c"],
    [0.68, "#ff9a1f"],
    [0.4, "#ffe35a"],
  ];
  for (const tongue of tongues) {
    const flicker = 0.82 + 0.18 * Math.sin(age * tongue.speed + tongue.phase) + 0.06 * Math.sin(age * 23 + tongue.phase * 3);
    const tall = tongue.tall * flicker;
    const wide = gap * 1.35;
    const sway = Math.sin(age * 6 + tongue.phase) * wide * 0.28;
    layers.forEach(([k, fill], layer) => {
      const hw = (wide / 2) * k;
      const hh = tall * (layer === 0 ? 1 : k * 0.95 + 0.05);
      ctx.beginPath();
      ctx.moveTo(tongue.x - hw, base);
      ctx.quadraticCurveTo(tongue.x - hw * 1.05, base - hh * 0.55, tongue.x + sway * k, base - hh);
      ctx.quadraticCurveTo(tongue.x + hw * 1.05, base - hh * 0.55, tongue.x + hw, base);
      ctx.quadraticCurveTo(tongue.x, base + hw * 0.35, tongue.x - hw, base);
      ctx.closePath();
      if (layer === 0) {
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      ctx.fillStyle = fill;
      ctx.fill();
    });
  }
}

/** A comic burst: a jagged star in red, orange and yellow that bangs out and then fades. */
function burst(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, age: number, seed: number) {
  const grow = easeOutBack(clamp01(age / 0.22));
  const fade = clamp01(1 - (age - 0.55) / 0.35);
  if (fade <= 0 || grow <= 0) return;
  const rand = prng(seed * 131 + 3);
  const spikes = 13;
  const jag = Array.from({ length: spikes * 2 }, () => 0.75 + rand() * 0.45);
  ctx.save();
  ctx.globalAlpha *= fade;
  ctx.translate(cx, cy);
  ctx.rotate(age * 0.6);
  const layers: [number, string][] = [
    [1, "#ff3b1f"],
    [0.72, "#ff9a1f"],
    [0.45, "#fff06a"],
  ];
  layers.forEach(([k, fill], layer) => {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = r * grow * k * (i % 2 === 0 ? jag[i] : 0.55 * jag[i]);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    if (layer === 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.fillStyle = fill;
    ctx.fill();
  });
  ctx.restore();
}

/** Cartoon smoke: round grey puffs with a dark rim that swell, drift up and thin away. */
function puffs(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, age: number, seed: number, count: number, rise: number) {
  const rand = prng(seed * 389 + 11);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const delay = rand() * 0.4;
    const life = 1.6 + rand() * 1.2;
    const local = age - delay;
    if (local < 0 || local > life) continue;
    const p = local / life;
    const dist = r * (0.3 + rand() * 0.7) * easeOutCubic(Math.min(1, p * 2));
    const x = cx + Math.cos(a) * dist;
    const y = cy + Math.sin(a) * dist * 0.6 - rise * p;
    const size = r * (0.28 + rand() * 0.22) * (0.5 + p);
    ctx.save();
    ctx.globalAlpha *= (1 - p) ** 1.2 * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 ? "#6c6f75" : "#8a8d93";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(11, 13, 18, 0.55)";
    ctx.stroke();
    ctx.restore();
  }
}

/** Fire, smoke, sparks, rain... drawn on a thing, or over the whole picture. */
export function drawEffect(ctx: CanvasRenderingContext2D, kind: EffectKind, box: Rect, whole: boolean, seed: number, age: number, left: number, w: number, h: number) {
  const fade = clamp01(left / 0.5) * clamp01(age / 0.3);
  if (fade <= 0 || age < 0) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Matter is sized to the thing it is on: a burning house has bigger flames than a burning match.
  const s = Math.max(0.6, Math.min(3.2, (whole ? 260 : Math.min(box.w, box.h * 1.4)) / 110));
  ctx.save();
  ctx.globalAlpha = fade;
  const run = (cfg: EmitterConfig) => {
    ctx.save();
    emit(ctx, cfg, age);
    ctx.restore();
  };
  switch (kind) {
    case "fire": {
      const base = whole ? h * 0.74 : box.y + box.h * 0.9;
      const x0 = whole ? w * 0.15 : box.x + box.w * 0.08;
      const x1 = whole ? w * 0.85 : box.x + box.w * 0.92;
      const tall = whole ? h * 0.42 : Math.min(box.h * 0.85, Math.max(60, box.w * 0.6));
      // Smoke rolls up from behind the flames, then the flames, then a warm glow and a few embers.
      run({
        count: 36, seed: seed * 31 + 2, origin: { kind: "line", x: x0, y: base - tall * 0.8, x2: x1, y2: base - tall * 0.8 }, rate: 9, loop: true,
        life: [2.2, 3.2], angle: -Math.PI / 2, spread: 0.3, speed: [25 * s, 45 * s], wander: { amp: 14 * s, freq: 0.9 },
        size: 10 * s, sizeEnd: 34 * s, color: ["#4a4542", "#1c1a1a"], alpha: { in: 0.2, out: 0.6, max: 0.55 }, shape: "dot",
      });
      ctx.globalCompositeOperation = "lighter";
      glowAt(ctx, (x0 + x1) / 2, base - tall * 0.3, (x1 - x0) * 0.75 * (0.92 + 0.08 * Math.sin(age * 13)), "#ff7a1a", 0.3);
      ctx.globalCompositeOperation = "source-over";
      cartoonFlames(ctx, x0, x1, base, tall, age, seed);
      run({
        count: 30, seed: seed * 31 + 1, origin: { kind: "line", x: x0, y: base - tall * 0.5, x2: x1, y2: base - tall * 0.5 }, rate: 14, loop: true,
        life: [0.8, 1.6], angle: -Math.PI / 2, spread: 0.5, speed: [50 * s, 110 * s], wander: { amp: 10, freq: 3 },
        size: [2.5, 1.2], color: ["#fff2a8", "#ff6a1a"], alpha: { in: 0.05, out: 0.5, max: 1 }, shape: "dot", blend: "lighter",
      });
      break;
    }
    case "smoke": {
      const x = whole ? w / 2 : cx;
      const y = whole ? h * 0.6 : box.y + box.h * 0.2;
      const r = whole ? 160 : Math.max(50, Math.min(180, box.w * 0.6));
      // Waves of puffs, each wave starting as the last thins out.
      for (let wave = 0; wave < 3; wave++) {
        const local = (age + wave * 1.1) % 3.3;
        puffs(ctx, x, y, r * 0.6, local, seed * 7 + wave + Math.floor((age + wave * 1.1) / 3.3) * 3, 6, r * 1.6);
      }
      break;
    }
    case "sparks":
      run({
        count: 60, seed: seed * 31 + 4, origin: { kind: "point", x: cx, y: cy }, rate: 40, loop: true,
        life: [0.4, 0.9], angle: -Math.PI / 2, spread: Math.PI * 2, speed: [120 * s, 260 * s], accel: [0, 320],
        size: [3, 1], sizeEnd: 0.5, color: ["#fff6c8", "#ffb030"], alpha: { in: 0.05, out: 0.4, max: 1 }, shape: "streak", blend: "lighter",
      });
      break;
    case "explosion": {
      const r = whole ? 260 : Math.max(70, Math.min(260, Math.max(box.w, box.h) * 0.8));
      const flash = clamp01(1 - age / 0.35);
      if (flash > 0) {
        ctx.globalCompositeOperation = "lighter";
        glowAt(ctx, cx, cy, r * 2, "#ffd27a", flash * 0.8);
        ctx.globalCompositeOperation = "source-over";
      }
      puffs(ctx, cx, cy, r, age - 0.25, seed, 12, r * 0.8);
      burst(ctx, cx, cy, r, age, seed);
      run({
        count: 40, seed: seed * 31 + 7, origin: { kind: "point", x: cx, y: cy }, t0: 0, life: [0.6, 1.2],
        angle: 0, spread: Math.PI * 2, speed: [r * 2.2, r * 3.6], accel: [0, 400], size: [3, 1.5],
        color: ["#fff6c8", "#ffb030"], alpha: { in: 0.02, out: 0.4, max: 1 }, shape: "streak", blend: "lighter",
      });
      break;
    }
    case "rain":
      ctx.fillStyle = "rgba(10, 20, 40, 0.18)";
      ctx.fillRect(0, 0, w, h);
      run({
        count: 160, seed: seed * 31 + 8, origin: { kind: "rect", x: -60, y: -30, w: w + 60, h: 10 }, rate: 160, loop: true,
        life: [0.9, 1.3], angle: Math.PI / 2 + 0.18, spread: 0.03, speed: [h * 0.9, h * 1.1], size: [8, 10],
        color: "#bcd8f0", alpha: { in: 0.05, out: 0.15, max: 0.6 }, shape: "streak",
      });
      break;
    case "snow":
      run({
        count: 140, seed: seed * 31 + 9, origin: { kind: "rect", x: -40, y: -20, w: w + 80, h: 10 }, rate: 34, loop: true,
        life: [5, 8], angle: Math.PI / 2, spread: 0.25, speed: [45, 80], wander: { amp: 26, freq: 0.7 },
        size: [2, 5], color: "#ffffff", alpha: { in: 0.1, out: 0.15, max: 0.9 }, shape: "dot",
      });
      break;
    case "dust":
      run({
        count: 60, seed: seed * 31 + 10, origin: whole ? { kind: "rect", x: 0, y: 0, w, h: h - 120 } : { kind: "rect", x: box.x, y: box.y + box.h * 0.6, w: box.w, h: box.h * 0.4 },
        rate: 16, loop: true, life: [2.5, 4.5], angle: -Math.PI / 2, spread: Math.PI, speed: [6, 22], wander: { amp: 20, freq: 0.6 },
        size: [2, 5 * s], color: "#e8d8a8", alpha: { in: 0.3, out: 0.4, max: 0.5 }, shape: "dot",
      });
      break;
    case "confetti":
      run({
        count: 110, seed: seed * 31 + 11, origin: { kind: "line", x: whole ? w * 0.2 : box.x, y: whole ? h * 0.15 : box.y, x2: whole ? w * 0.8 : box.x + box.w, y2: whole ? h * 0.15 : box.y },
        t0: 0, life: [1.8, 2.6], angle: -Math.PI / 2, spread: Math.PI * 0.9, speed: [160, 360], accel: [0, 380], spin: [-9, 9],
        size: [5, 8], color: ["#ffd24a", "#ff4f73"], alpha: { in: 0.02, out: 0.25, max: 1 }, shape: "square",
      });
      break;
    case "glow": {
      const pulse = 0.75 + 0.25 * Math.sin(age * 3);
      ctx.globalCompositeOperation = "lighter";
      glowAt(ctx, cx, cy, Math.max(box.w, box.h) * 0.75 * pulse, "#ffe08a", 0.45);
      ctx.globalCompositeOperation = "source-over";
      run({
        count: 40, seed: seed * 31 + 12, origin: { kind: "ring", x: cx, y: cy, r: Math.max(box.w, box.h) * 0.42 }, rate: 22, loop: true,
        life: [0.8, 1.4], angle: -Math.PI / 2, spread: Math.PI * 2, speed: [10, 30], wander: { amp: 6, freq: 4 },
        size: [3.5, 1.5], sizeEnd: 0.5, color: ["#fffbe0", "#ffd24a"], alpha: { in: 0.1, out: 0.4, max: 1 }, shape: "star", blend: "lighter",
      });
      break;
    }
    case "speed":
      speedLines(ctx, age, seed, w, h);
      break;
  }
  ctx.restore();
}

// ── Marks that draw the eye ─────────────────────────────────────────────────────────────────────────

/** Rings, dimming, boxes, underlines, crosses, ticks and tints on a part; `whole` when aimed at the picture. */
export function drawAttention(ctx: CanvasRenderingContext2D, verb: AttentionVerb, box: Rect, whole: boolean, color: string | undefined, age: number, left: number, w: number, h: number) {
  const fade = clamp01(age / 0.45) * clamp01(left / 0.35);
  if (fade <= 0) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const tint = color ?? COLORS.accent;
  ctx.save();
  switch (verb) {
    case "dim": {
      if (whole) {
        // Dimming the whole picture pushes it back, so what is drawn over it stands out.
        ctx.fillStyle = `rgba(4, 6, 12, ${0.62 * fade})`;
        ctx.fillRect(-20, -20, w + 40, h + 40);
        break;
      }
      const pad = 10;
      ctx.beginPath();
      ctx.rect(-20, -20, w + 40, h + 40);
      ctx.roundRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, 18);
      ctx.fillStyle = `rgba(4, 6, 12, ${0.62 * fade})`;
      ctx.fill("evenodd");
      ctx.beginPath();
      ctx.roundRect(box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2, 18);
      ctx.lineWidth = 3;
      ctx.strokeStyle = alpha(tint, 0.9 * fade);
      ctx.stroke();
      break;
    }
    case "encircle": {
      // A hand-drawn ring that draws itself on, slightly past a full turn.
      const p = easeOutCubic(clamp01(age / 0.8));
      ctx.globalAlpha = clamp01(left / 0.35);
      inkStroke(ctx, tint, 5, () => ctx.ellipse(cx, cy, box.w / 2 + 14, box.h / 2 + 14, -0.06, -Math.PI * 0.6, -Math.PI * 0.6 + Math.PI * 2.08 * p));
      break;
    }
    case "pulse":
      for (let ring = 0; ring < 2; ring++) {
        const p = (age * 0.8 + ring * 0.5) % 1;
        ctx.globalAlpha = (1 - p) * fade;
        ctx.beginPath();
        ctx.ellipse(cx, cy, (box.w / 2) * (0.7 + p * 0.7) + 8, (box.h / 2) * (0.7 + p * 0.7) + 8, 0, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = tint;
        ctx.stroke();
      }
      break;
    case "box": {
      // Corner brackets that close in on the thing, like a camera locking focus.
      const p = easeOutBack(clamp01(age / 0.45));
      const pad = 12 + (1 - p) * 30;
      const x0 = Math.max(10, box.x - pad);
      const y0 = Math.max(10, box.y - pad);
      const x1 = Math.min(w - 10, box.x + box.w + pad);
      const y1 = Math.min(h - 124, box.y + box.h + pad);
      const arm = Math.min(34, Math.min(box.w, box.h) * 0.35 + 12);
      ctx.globalAlpha = clamp01(age / 0.15) * clamp01(left / 0.35);
      inkStroke(ctx, tint, 5, () => {
        ctx.moveTo(x0, y0 + arm);
        ctx.lineTo(x0, y0);
        ctx.lineTo(x0 + arm, y0);
        ctx.moveTo(x1 - arm, y0);
        ctx.lineTo(x1, y0);
        ctx.lineTo(x1, y0 + arm);
        ctx.moveTo(x1, y1 - arm);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 - arm, y1);
        ctx.moveTo(x0 + arm, y1);
        ctx.lineTo(x0, y1);
        ctx.lineTo(x0, y1 - arm);
      });
      break;
    }
    case "underline": {
      const p = easeOutCubic(clamp01(age / 0.5));
      const y = Math.min(h - 128, box.y + box.h + 10);
      const x0 = box.x - 6;
      const x1 = box.x + box.w + 6;
      ctx.globalAlpha = clamp01(left / 0.35);
      inkStroke(ctx, color ?? COLORS.danger, 6, () => {
        const steps = 24;
        for (let i = 0; i <= steps * p; i++) {
          const u = i / steps;
          const x = lerp(x0, x1, u);
          const yy = y + Math.sin(u * Math.PI * 3) * 3 - u * 4;
          if (i === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
      });
      break;
    }
    case "cross": {
      // Two strokes slashed across the thing: no, gone, wrong.
      const r = Math.min(Math.max(box.w, box.h) * 0.45, 170);
      const a = easeOutCubic(clamp01(age / 0.25));
      const b = easeOutCubic(clamp01((age - 0.22) / 0.25));
      ctx.globalAlpha = clamp01(left / 0.35);
      const red = color ?? COLORS.danger;
      inkStroke(ctx, red, 12, () => {
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx - r + 2 * r * a, cy - r + 2 * r * a);
      });
      if (b > 0)
        inkStroke(ctx, red, 12, () => {
          ctx.moveTo(cx + r, cy - r);
          ctx.lineTo(cx + r - 2 * r * b, cy - r + 2 * r * b);
        });
      break;
    }
    case "check": {
      const r = Math.min(Math.max(box.w, box.h) * 0.4, 130);
      const p = easeOutCubic(clamp01(age / 0.45));
      ctx.globalAlpha = clamp01(left / 0.35);
      const pts: Pt[] = [
        [cx - r * 0.7, cy],
        [cx - r * 0.2, cy + r * 0.55],
        [cx + r * 0.8, cy - r * 0.65],
      ];
      const firstLen = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      const total = firstLen + Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
      const along = p * total;
      inkStroke(ctx, color ?? COLORS.good, 13, () => {
        ctx.moveTo(pts[0][0], pts[0][1]);
        if (along <= firstLen) {
          const u = along / firstLen;
          ctx.lineTo(lerp(pts[0][0], pts[1][0], u), lerp(pts[0][1], pts[1][1], u));
        } else {
          const u = (along - firstLen) / (total - firstLen);
          ctx.lineTo(pts[1][0], pts[1][1]);
          ctx.lineTo(lerp(pts[1][0], pts[2][0], u), lerp(pts[1][1], pts[2][1], u));
        }
      });
      break;
    }
    case "tint": {
      // A wash of colour over the thing, soft at its edges, breathing slowly: this area, this side, this one.
      const breathe = 0.85 + 0.15 * Math.sin(age * 2.4);
      const tone = color ?? COLORS.danger;
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, box.h / Math.max(1, box.w));
      const r = box.w * 0.62;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, alpha(tone, 0.55 * breathe));
      g.addColorStop(0.7, alpha(tone, 0.42 * breathe));
      g.addColorStop(1, alpha(tone, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
  }
  ctx.restore();
}
