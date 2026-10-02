/**
 * speech — a character's spoken line: handwritten words beside its head, no balloon, with a short curved
 * tick from the words toward its mouth. Each word is written on, left to right, at its own time; the
 * stressed words are in the key colour. A thin rim of the page keeps the words readable on any picture.
 */
import { clamp01 } from "./motion";
import { strokeOn, type Pt } from "./strokes";

// Handwriting faces the phone's WebView carries; anywhere without them the line falls back to the theme's face.
const HAND = '"Chalkboard SE", "Noteworthy", "Marker Felt"';
/** The room round a spoken line's words, for its rim of the page. */
export const SPEECH_PAD = 4;
/** A spoken line's row pitch, in ems. */
export const SPEECH_LEADING = 1.25;
// How long one word takes to be written on, in seconds.
const WRITE_IN = 0.2;
// The tick's length as a share of the gap to the mouth, and its bounds in view units.
const TICK_SHARE = 0.55;
const TICK_MIN = 10;
const TICK_MAX = 30;
const TICK_BEND = 0.3;

export interface SpeechOptions {
  /** The block's centre and size, as laid out. */
  spot: Pt;
  size: [number, number];
  /** Where the tick points: the speaker's mouth, head or top. */
  point: Pt;
  fontPx: number;
  rows: string[][];
  /** When each word is written, in reading order. */
  reveal: number[];
  /** The words, by reading-order index, written in `key`. */
  stressed?: number[];
  align: "left" | "right" | "center";
  t: number;
  ink: string;
  key: string;
  page: string;
  /** The theme's own face, which the hand falls back to. */
  face: string;
}

/** The point of a box nearest to `point`. */
function nearestOn([x, y]: Pt, cx: number, cy: number, w: number, h: number): Pt {
  return [Math.max(cx - w / 2, Math.min(cx + w / 2, x)), Math.max(cy - h / 2, Math.min(cy + h / 2, y))];
}

/** The tick from the words toward the mouth, bowed upward, as points to stroke on. */
function tickCourse(from: Pt, to: Pt): Pt[] | undefined {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const gap = Math.hypot(dx, dy);
  if (gap < TICK_MIN) return undefined;
  const [ux, uy] = [dx / gap, dy / gap];
  const length = Math.max(TICK_MIN, Math.min(TICK_MAX, gap * TICK_SHARE));
  const start: Pt = [from[0] + ux * 3, from[1] + uy * 3];
  const end: Pt = [start[0] + ux * length, start[1] + uy * length];
  const [nx, ny] = ux > 0 ? [uy, -ux] : [-uy, ux];
  const bow: Pt = [(start[0] + end[0]) / 2 + nx * length * TICK_BEND, (start[1] + end[1]) / 2 + ny * length * TICK_BEND];
  return Array.from({ length: 9 }, (_, k): Pt => {
    const s = k / 8;
    return [
      (1 - s) * (1 - s) * start[0] + 2 * (1 - s) * s * bow[0] + s * s * end[0],
      (1 - s) * (1 - s) * start[1] + 2 * (1 - s) * s * bow[1] + s * s * end[1],
    ];
  });
}

export function speechLine(ctx: CanvasRenderingContext2D, o: SpeechOptions) {
  const [cx, cy] = o.spot;
  const [w, h] = o.size;
  const font = (px: number) => `500 ${px}px ${HAND}, ${o.face}`;
  ctx.save();
  ctx.font = font(o.fontPx);
  const widest = Math.max(1, ...o.rows.map((row) => ctx.measureText(row.join(" ")).width));
  // A face wider than the layout's estimate is narrowed to the block, never run past it onto a picture.
  const px = o.fontPx * Math.min(1, (w - SPEECH_PAD * 2) / widest);
  ctx.font = font(px);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const rim = Math.max(3, px * 0.16);
  const pitch = o.fontPx * SPEECH_LEADING;
  const space = ctx.measureText(" ").width;
  const stressed = new Set(o.stressed ?? []);
  let index = 0;

  o.rows.forEach((row, r) => {
    const rowW = ctx.measureText(row.join(" ")).width;
    let x = o.align === "left" ? cx - w / 2 + SPEECH_PAD : o.align === "right" ? cx + w / 2 - SPEECH_PAD - rowW : cx - rowW / 2;
    const y = cy - h / 2 + SPEECH_PAD + pitch * (r + 0.5);
    for (const word of row) {
      const wordW = ctx.measureText(word).width;
      const written = clamp01((o.t - (o.reveal[index] ?? 0)) / WRITE_IN);
      if (written > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - rim, y - pitch, (wordW + rim * 2) * written, pitch * 2);
        ctx.clip();
        ctx.strokeStyle = o.page;
        ctx.lineWidth = rim;
        ctx.strokeText(word, x, y);
        ctx.fillStyle = stressed.has(index) ? o.key : o.ink;
        ctx.fillText(word, x, y);
        ctx.restore();
      }
      x += wordW + space;
      index++;
    }
  });

  const course = tickCourse(nearestOn(o.point, cx, cy, w, h), o.point);
  const begun = clamp01((o.t - (o.reveal[0] ?? 0)) / WRITE_IN);
  if (course && begun > 0) {
    const width = Math.max(2.5, o.fontPx * 0.09);
    strokeOn(ctx, course, begun, { color: o.page, width: width + rim, cap: "round", roughness: 0 });
    strokeOn(ctx, course, begun, { color: o.ink, width, cap: "round", taperEnd: 8, roughness: 0 });
  }
  ctx.restore();
}
