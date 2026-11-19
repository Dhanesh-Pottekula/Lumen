/**
 * paint — what every drawn thing in the film shares: the fonts, the ink, the colours, and the bold cartoon
 * lettering. The film's own two fonts ship with the app (see `fonts/`), so a frame looks the same on every
 * machine: Bangers for headlines and Permanent Marker for handwriting.
 */
import bangers from "./fonts/bangers.woff2?url";
import marker from "./fonts/permanent-marker.woff2?url";
import type { Tone } from "./types";

export const FONT = `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
export const HEADLINE = `"Lumen Bangers", Impact, "Arial Black", ${FONT}`;
export const HAND = `"Lumen Marker", "Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive`;
export const INK = "#0b0d12";
export const COLORS: Record<Tone, string> = { white: "#ffffff", accent: "#ffd24a", danger: "#ff4a3d", good: "#5fdc7c", cool: "#5cc2ff" };

let fonts: Promise<void> | null = null;

/** Load the film's fonts once. Resolves either way: a font that fails to load falls back to the next in its stack. */
export function loadFonts(): Promise<void> {
  if (fonts) return fonts;
  if (typeof FontFace === "undefined" || typeof document === "undefined") return (fonts = Promise.resolve());
  const faces = [new FontFace("Lumen Bangers", `url(${bangers})`), new FontFace("Lumen Marker", `url(${marker})`)];
  fonts = Promise.all(
    faces.map((face) =>
      face
        .load()
        .then((loaded) => {
          document.fonts.add(loaded);
        })
        .catch(() => undefined),
    ),
  ).then(() => undefined);
  return fonts;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** For a box something occupies on screen: the second that thing arrived. */
  since?: number;
}

/** Bold cartoon lettering: a colour fill inside a thick dark outline, readable over any picture. */
export function comicText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", font = `900 ${size}px ${FONT}`) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.2);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fillStyle = "rgba(10, 12, 18, 0.8)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.stroke();
}

/** Split a line in two near the middle when it is too wide. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

/** A thick line with a dark outline, the way every stroke in the film is drawn. */
export function inkStroke(ctx: CanvasRenderingContext2D, color: string, width: number, path: () => void) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  path();
  ctx.lineWidth = width + 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  path();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

/** `color` with an alpha, from a #rrggbb colour. */
export function alpha(color: string, a: number): string {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
