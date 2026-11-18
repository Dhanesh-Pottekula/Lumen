/**
 * cards — the things drawn over the picture that are not tied to a part of it: headlines in their styles, a
 * date as a calendar card, a timeline that is walked event by event, and a list that builds item by item.
 * Each draws itself into a box it is given; where the box sits is the renderer's job.
 */
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from "../render/motion";
import { COLORS, comicText, FONT, HAND, HEADLINE, INK, inkStroke, panel, wrap, type Rect } from "./paint";
import type { DateObject, Entrance, ListObject, TextObject, TimelineObject } from "./types";

type Place = (w: number, h: number) => Rect;

// ── Headlines ───────────────────────────────────────────────────────────────────────────────────────

const SIZES = {
  bold: { small: 30, medium: 48, large: 78 },
  title: { small: 52, medium: 76, large: 108 },
  hand: { small: 34, medium: 50, large: 70 },
  stamp: { small: 34, medium: 50, large: 68 },
} as const;

function fontFor(style: NonNullable<TextObject["style"]>, size: number) {
  if (style === "title" || style === "stamp") return `400 ${size}px ${HEADLINE}`;
  if (style === "hand") return `400 ${size}px ${HAND}`;
  return `900 ${size}px ${FONT}`;
}

/** Lettering with the given font: a drop shadow for headlines, then the outlined fill. */
function letters(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, font: string, shadow: boolean) {
  if (shadow) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.strokeText(text, x + size * 0.06, y + size * 0.07);
    ctx.fillText(text, x + size * 0.06, y + size * 0.07);
    ctx.restore();
  }
  comicText(ctx, text, x, y, size, color, "center", font);
}

export function drawText(ctx: CanvasRenderingContext2D, object: TextObject, entrance: Entrance, age: number, dur: number, place: Place, maxWidth: number) {
  const style = object.style ?? "bold";
  const size = SIZES[style][object.size ?? "medium"];
  const font = fontFor(style, size);
  const text = style === "title" || style === "stamp" ? object.text.toUpperCase() : object.text;
  ctx.font = font;
  const lines = wrap(ctx, text, maxWidth - (style === "stamp" ? 60 : 0));
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const lineH = size * (style === "hand" ? 1.25 : 1.08);
  const pad = style === "stamp" ? 26 : 0;
  const box = place(widest + pad * 2, lines.length * lineH + pad * 2 + (style === "hand" ? 14 : 0));
  const enter = clamp01(age / Math.min(0.5, dur));
  const color = style === "stamp" ? COLORS[object.color && object.color !== "white" ? object.color : "danger"] : COLORS[object.color ?? (style === "title" ? "accent" : "white")];

  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  if (style === "stamp") ctx.rotate(-0.1);
  if (entrance === "slam" || (style === "stamp" && entrance !== "typewriter" && entrance !== "word-by-word")) {
    // Lands oversized and settles, like a stamp.
    const s = 1 + (1 - easeOutBack(clamp01(age / 0.32))) * 1.6;
    ctx.scale(s, s);
    if (style !== "stamp") ctx.rotate(-0.03);
  } else if (entrance === "fade") {
    ctx.translate(0, (1 - easeOutCubic(enter)) * 16);
  }

  if (style === "stamp") {
    ctx.globalAlpha *= 0.92;
    ctx.beginPath();
    ctx.roundRect(-box.w / 2, -box.h / 2, box.w, box.h, 10);
    ctx.lineWidth = 11;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // How much of the text is out: all of it, or the first characters or words so far.
  const chars = text.length;
  const typed = entrance === "typewriter" ? Math.floor(clamp01(age / Math.max(0.6, Math.min(2.4, chars * 0.055))) * chars) : chars;
  let seen = 0;
  let wordIndex = 0;
  lines.forEach((line, i) => {
    const y = (i - (lines.length - 1) / 2) * lineH - (style === "hand" ? 7 : 0);
    ctx.font = font;
    if (entrance === "word-by-word") {
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
          letters(ctx, word, 0, 0, size, color, font, style === "title");
          ctx.restore();
          ctx.font = font;
        }
        x += width + space;
      }
      return;
    }
    const part = line.slice(0, Math.max(0, typed - seen));
    seen += line.length + 1;
    if (!part) return;
    if (entrance === "typewriter") {
      // Typed from the left edge of the full line, so the line does not slide as it grows.
      const full = ctx.measureText(line).width;
      const w = ctx.measureText(part).width;
      letters(ctx, part, -full / 2 + w / 2, y, size, color, font, style === "title");
      if (part.length < line.length && Math.floor(age * 3) % 2 === 0) {
        ctx.fillStyle = color;
        ctx.fillRect(-full / 2 + w + 4, y - size * 0.4, Math.max(3, size * 0.07), size * 0.8);
      }
    } else {
      letters(ctx, part, 0, y, size, color, font, style === "title");
    }
  });

  if (style === "hand") {
    // A marker line drawn under the words once they are written.
    const p = easeInOutCubic(clamp01((age - (entrance === "typewriter" ? chars * 0.055 : 0.25)) / 0.45));
    if (p > 0) {
      const y = box.h / 2 - 8;
      const x0 = -widest / 2 - 6;
      const x1 = widest / 2 + 10;
      inkStroke(ctx, COLORS.danger, 5, () => {
        ctx.moveTo(x0, y);
        ctx.quadraticCurveTo((x0 + x1) / 2, y - 7, lerp(x0, x1, p), y - 3 * p);
      });
    }
  }
  ctx.restore();
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────────────

/** "December 1979" → a header line and a year to put large. A date with no year at its end is all body. */
export function splitDate(text: string): { head: string; body: string; year: number | null } {
  const m = /^(.*?)[,\s]*?(\d{1,4})(\s?(?:BC|BCE|AD|CE))?$/i.exec(text.trim());
  if (!m || (m[1].trim() === "" && m[2].length < 3 && !m[3])) return { head: "", body: text.trim(), year: null };
  const era = (m[3] ?? "").trim().toUpperCase();
  const year = Number(m[2]) * (era.startsWith("BC") ? -1 : 1);
  return { head: m[1].trim().replace(/[,\s]+$/, "").toUpperCase(), body: `${m[2]}${era ? ` ${era}` : ""}`, year };
}

export function drawDate(ctx: CanvasRenderingContext2D, object: DateObject, age: number, dur: number, place: Place) {
  const { head, body, year } = splitDate(object.text);
  let shown = body;
  if (year !== null && object.from !== undefined && object.from !== year) {
    // The year rolls up (or down) to the date, the way a calendar flips through the years between.
    const p = easeInOutCubic(clamp01((age - 0.15) / Math.max(1.4, Math.min(3.5, dur))));
    const value = Math.round(lerp(object.from, Math.abs(year) * Math.sign(year), p));
    shown = `${Math.abs(value)}${body.replace(/^\d+/, "")}`;
  }
  const bodySize = year !== null ? 64 : 40;
  ctx.font = `400 ${bodySize}px ${HEADLINE}`;
  const bodyW = Math.max(ctx.measureText(body).width, ctx.measureText(shown).width);
  ctx.font = `800 17px ${FONT}`;
  const headW = head ? ctx.measureText(head).width : 0;
  const w = Math.max(bodyW + 48, headW + 36, 140);
  const headH = head ? 34 : 14;
  const h = headH + bodySize + 26;
  const box = place(w, h);

  // Flips down from its top edge onto the screen.
  const flip = easeOutBack(clamp01(age / 0.45));
  ctx.save();
  ctx.translate(box.x + w / 2, box.y);
  ctx.rotate(-0.035);
  ctx.scale(1, Math.max(0.01, flip));
  ctx.beginPath();
  ctx.roundRect(-w / 2, 0, w, h, 10);
  ctx.fillStyle = "#fbf7ee";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#d8392b";
  ctx.fillRect(-w / 2, 0, w, headH);
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Two rings binding the page, as on a desk calendar.
  for (const rx of [-w * 0.28, w * 0.28]) {
    ctx.beginPath();
    ctx.roundRect(rx - 4, -9, 8, 18, 4);
    ctx.fillStyle = "#c9ced6";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (head) {
    ctx.font = `800 17px ${FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(head, 0, headH / 2 + 1);
  }
  ctx.font = `400 ${bodySize}px ${HEADLINE}`;
  ctx.fillStyle = INK;
  ctx.fillText(shown, 0, headH + (h - headH) / 2 + 2);
  ctx.restore();
}

// ── Timelines ───────────────────────────────────────────────────────────────────────────────────────

/** A year in a date string, negative for BC; null when there is none. */
function yearIn(date: string): number | null {
  const m = /(\d{1,4})\s*(BC|BCE)?/i.exec(date);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? -1 : 1);
}

/** Where each event sits along the axis, 0..1: by its year when every date has one in order, else evenly. */
export function timelineSpots(events: { date: string }[]): number[] {
  const n = events.length;
  const even = events.map((_, i) => (n === 1 ? 0.5 : i / (n - 1)));
  const years = events.map((e) => yearIn(e.date));
  if (years.some((y) => y === null)) return even;
  const ys = years as number[];
  for (let i = 1; i < n; i++) if (ys[i] < ys[i - 1]) return even;
  const span = ys[n - 1] - ys[0];
  if (span <= 0) return even;
  // Half by time, half even: true to the gaps, without crowding close events together.
  return ys.map((y, i) => 0.5 * ((y - ys[0]) / span) + 0.5 * even[i]);
}

export function drawTimeline(ctx: CanvasRenderingContext2D, object: TimelineObject, steps: number[], t: number, at: number, place: Place, width: number) {
  const n = object.events.length;
  const w = Math.min(width, 120 + n * 150);
  const h = 138;
  const box = place(w, h);
  const enter = easeOutCubic(clamp01((t - at) / 0.4));
  ctx.save();
  ctx.translate(0, (1 - enter) * 20);
  panel(ctx, box.x, box.y, box.w, box.h);
  const x0 = box.x + 60;
  const x1 = box.x + box.w - 60;
  const axisY = box.y + 52;
  const spots = timelineSpots(object.events).map((s) => lerp(x0, x1, s));
  const reached = steps.filter((s) => s <= t).length - 1;
  const lastAt = steps[Math.max(0, reached)] ?? at;
  const move = easeInOutCubic(clamp01((t - lastAt) / 0.6));
  const head = reached <= 0 ? lerp(x0, spots[0], move) : lerp(spots[reached - 1], spots[reached], move);

  // The whole axis faintly, then the stretch already lived through drawn bold.
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(box.x + 30, axisY);
  ctx.lineTo(box.x + box.w - 30, axisY);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(box.x + 30, axisY);
  ctx.lineTo(head, axisY);
  ctx.lineWidth = 6;
  ctx.strokeStyle = COLORS.accent;
  ctx.stroke();

  const slot = (x1 - x0) / Math.max(1, n - 1);
  object.events.forEach((event, i) => {
    const x = spots[i];
    if (i > reached) {
      ctx.beginPath();
      ctx.arc(x, axisY, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fill();
      return;
    }
    const arrive = i === reached ? (reached === 0 ? at : lastAt) + (i === reached ? 0.45 : 0) : -Infinity;
    const pop = i === reached ? easeOutBack(clamp01((t - arrive) / 0.35)) : 1;
    if (pop <= 0) return;
    const current = i === reached;
    ctx.save();
    ctx.globalAlpha *= current ? 1 : 0.6;
    if (current) {
      const ring = ((t - arrive) * 0.9) % 1;
      ctx.beginPath();
      ctx.arc(x, axisY, 10 + ring * 14, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255, 210, 74, ${0.8 * (1 - ring)})`;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, axisY, 10 * pop, 0, Math.PI * 2);
    ctx.fillStyle = current ? COLORS.accent : "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.translate(x, 0);
    ctx.scale(pop, pop);
    comicText(ctx, event.date, 0, axisY - 32, 30, current ? COLORS.accent : "#ffffff", "center", `400 30px ${HEADLINE}`);
    if (event.text) {
      ctx.font = `800 17px ${FONT}`;
      const lines = wrap(ctx, event.text, Math.max(120, slot - 10));
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((line, k) => ctx.fillText(line, 0, axisY + 32 + k * 20));
    }
    ctx.restore();
  });
  ctx.restore();
}

// ── Lists ───────────────────────────────────────────────────────────────────────────────────────────

export function drawList(ctx: CanvasRenderingContext2D, object: ListObject, steps: number[], t: number, at: number, place: Place) {
  const count = steps.filter((s) => s <= t).length;
  const rowH = 44;
  ctx.font = `800 22px ${FONT}`;
  const textW = Math.max(...object.items.map((item) => ctx.measureText(item).width));
  ctx.font = `400 32px ${HEADLINE}`;
  const titleW = object.title ? ctx.measureText(object.title.toUpperCase()).width : 0;
  const w = Math.min(460, Math.max(textW + 90, titleW + 48, 220));
  const top = object.title ? 56 : 16;
  // The panel grows smoothly as each item arrives.
  const lastAt = steps[Math.max(0, count - 1)] ?? at;
  const grown = count - 1 + easeOutCubic(clamp01((t - lastAt) / 0.35));
  const h = top + rowH * grown + 18;
  const box = place(w, h);
  const enter = easeOutCubic(clamp01((t - at) / 0.4));
  ctx.save();
  ctx.translate((1 - enter) * -24, 0);
  ctx.globalAlpha *= enter;
  panel(ctx, box.x, box.y, box.w, box.h);
  if (object.title) comicText(ctx, object.title.toUpperCase(), box.x + 24, box.y + 32, 32, COLORS.accent, "left", `400 32px ${HEADLINE}`);
  for (let i = 0; i < count; i++) {
    const p = easeOutBack(clamp01((t - steps[i]) / 0.4));
    const y = box.y + top + rowH * i + rowH / 2;
    const current = i === count - 1;
    ctx.save();
    ctx.globalAlpha *= clamp01((t - steps[i]) / 0.2) * (current ? 1 : 0.72);
    ctx.translate((1 - p) * -30, 0);
    ctx.beginPath();
    ctx.arc(box.x + 36, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = current ? COLORS.accent : "#ffffff";
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `900 17px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), box.x + 36, y + 1);
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(object.items[i], box.x + 62, y + 1);
    ctx.restore();
  }
  ctx.restore();
}
