/**
 * Where a character's spoken line is written: beside its head on the open side, in a block of at most
 * three rows, never over a picture or other writing; above the head when there is no room beside it, as
 * on a portrait phone with two speakers stacked. Also how the line is read: its words, the clauses the
 * voice writes it on by, and the words it colours. Pure geometry in view units, y down.
 */
import { meets, rectAt, type Drawn, type Pt, type Rect } from "../geometry/place";
import { SPEECH_LEADING, SPEECH_PAD } from "../render/speech";

export type SpeechSide = "left" | "right" | "above" | "below";

export interface SpeechRequest {
  /** The point the tick aims at: the speaker's mouth, head or top. */
  aim: Pt;
  words: string[];
  /** How much each side costs the line, in view units of distance; a side left out is never tried. */
  sides: Partial<Record<SpeechSide, number>>;
  /** Everything drawn while the line is up, the speaker included. */
  obstacles: Drawn[];
}

export interface SpeechLayout {
  centre: Pt;
  size: [number, number];
  fontPx: number;
  rows: string[][];
  side: SpeechSide;
  /** No open space was left near the speaker: the line is written across a drawing. */
  blocked?: boolean;
}

// A spoken line is written larger than a name, so it reads as a voice on a phone.
const SIZES = [34, 32, 30];
const MAX_ROWS = 3;
// Average advance of a handwritten glyph, in ems; the painter measures exactly and narrows to fit.
const GLYPH = 0.58;
// How far from the speaker's mouth a line may start, and the step its spot is looked for in.
const NEAR = 10;
const REACH = 260;
const STEP = 8;
// Where a line beside the head sits, as how many of its own heights its centre stands above the mouth.
const LIFTS = [0.3, 0.6, 0, 0.9, -0.3];
// Where a line above or below the head sits along it, as a share of its own width toward either side.
const SHIFTS = [0, -0.3, 0.3];
// What a smaller size or another row costs, in view units of distance.
const SIZE_COST = 3;
const ROW_COST = 4;

/** The line's words as written, one per gap. */
export function speechWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

const bare = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The index of each word `stress` colours in `words`, or undefined when the line does not say it. */
export function stressedWords(words: string[], stress: string): number[] | undefined {
  const wanted = speechWords(stress).map(bare).filter(Boolean);
  if (wanted.length === 0) return undefined;
  const said = words.map(bare);
  for (let at = 0; at + wanted.length <= said.length; at++) {
    if (wanted.every((word, offset) => said[at + offset] === word)) return wanted.map((_, offset) => at + offset);
  }
  return undefined;
}

/** The index of the first word of each clause: a clause ends on a word closing with a pause mark. */
export function clauseStarts(words: string[]): number[] {
  return words.flatMap((word, index) => (index === 0 || /[,;:.!?…—–]$/.test(words[index - 1]) ? [index] : []));
}

/** Each way the words wrap into one, two or three rows at a size, fewest rows first. */
function wrapsOf(words: string[], fontPx: number): string[][][] {
  const width = (row: string[]) => row.join(" ").length * fontPx * GLYPH;
  const longest = Math.max(...words.map((word) => width([word])));
  const total = width(words);
  const found = new Map<number, string[][]>();
  for (let rows = 1; rows <= MAX_ROWS; rows++) {
    const limit = Math.max(longest, total / rows + fontPx * GLYPH * 2);
    const wrapped: string[][] = [];
    for (const word of words) {
      const row = wrapped.at(-1);
      if (row && width([...row, word]) <= limit) row.push(word);
      else wrapped.push([word]);
    }
    if (wrapped.length <= MAX_ROWS && !found.has(wrapped.length)) found.set(wrapped.length, wrapped);
  }
  return [...found.values()];
}

function blockSize(rows: string[][], fontPx: number): [number, number] {
  const width = Math.max(...rows.map((row) => row.join(" ").length * fontPx * GLYPH));
  return [width + SPEECH_PAD * 2, rows.length * fontPx * SPEECH_LEADING + SPEECH_PAD * 2];
}

function gapTo([x, y]: Pt, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const inFrame = (r: Rect, frame: Rect) => r.x >= frame.x && r.y >= frame.y && r.x + r.w <= frame.x + frame.w && r.y + r.h <= frame.y + frame.h;

/** The spots a line of one size and wrap may take on one side, nearest the mouth first along each way out. */
function spotsOn(side: SpeechSide, [ax, ay]: Pt, [w, h]: [number, number], frame: Rect): Pt[][] {
  const steps = Array.from({ length: Math.floor((REACH - NEAR) / STEP) + 1 }, (_, k) => NEAR + k * STEP);
  if (side === "left" || side === "right") {
    const sign = side === "right" ? 1 : -1;
    return LIFTS.map((lift) => steps.map((out): Pt => [ax + sign * (out + w / 2), ay - lift * h]));
  }
  const sign = side === "below" ? 1 : -1;
  const clampX = (x: number) => Math.max(frame.x + w / 2, Math.min(frame.x + frame.w - w / 2, x));
  return SHIFTS.map((shift) => steps.map((out): Pt => [clampX(ax + shift * w), ay + sign * (out + h / 2)]));
}

/**
 * The spot, size and wrap a spoken line reads best at: the cheapest clear block over every size, wrap
 * and side, its cost the gap from the mouth plus its side's own and what a smaller size or more rows
 * costs. With no clear block it is set above the mouth at its smallest, and marked blocked.
 */
export function layoutSpeech(request: SpeechRequest, frame: Rect): SpeechLayout {
  const clear = (r: Rect) => inFrame(r, frame) && !request.obstacles.some((one) => meets(one, r));
  let best: { layout: SpeechLayout; cost: number } | undefined;
  for (const fontPx of SIZES) {
    for (const rows of wrapsOf(request.words, fontPx)) {
      const size = blockSize(rows, fontPx);
      const extra = (SIZES[0] - fontPx) * SIZE_COST + (rows.length - 1) * ROW_COST;
      for (const [side, cost] of Object.entries(request.sides) as [SpeechSide, number][]) {
        for (const way of spotsOn(side, request.aim, size, frame)) {
          const spot = way.find((centre) => clear(rectAt(centre, size)));
          if (!spot) continue;
          const total = gapTo(request.aim, rectAt(spot, size)) + cost + extra;
          if (!best || total < best.cost) best = { layout: { centre: spot, size, fontPx, rows, side }, cost: total };
        }
      }
    }
  }
  if (best) return best.layout;
  const fontPx = SIZES.at(-1)!;
  const rows = wrapsOf(request.words, fontPx).at(-1) ?? [request.words];
  const size = blockSize(rows, fontPx);
  const centre: Pt = [
    Math.max(frame.x + size[0] / 2, Math.min(frame.x + frame.w - size[0] / 2, request.aim[0])),
    Math.max(frame.y + size[1] / 2, Math.min(frame.y + frame.h - size[1] / 2, request.aim[1] - NEAR - size[1] / 2)),
  ];
  return { centre, size, fontPx, rows, side: "above", blocked: true };
}
