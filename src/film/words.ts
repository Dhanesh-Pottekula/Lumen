/**
 * Narration words and cues. A beat's `say` is found in the narration by a forward-only word search, and the
 * beat is due when that word is spoken: `(wordIndex / wordCount) × floor`, where `floor` is how long the
 * narration takes to say (the audio's length, or 0.4 s a word when there is no audio).
 */

export const SECONDS_PER_WORD = 0.4;

/** Lowercase words of a text, with punctuation dropped. "It's" is one word; "9.8" is one word. */
export function narrationWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
}

/** How long a narration takes to say when there is no audio to measure. */
export function floorOf(narration: string): number {
  return Math.max(2, narrationWords(narration).length * SECONDS_PER_WORD);
}

/** Index of the first word of `say` in `words`, searching from `from`; -1 when it is not there. */
export function findCue(words: string[], say: string, from: number): number {
  const phrase = narrationWords(say);
  if (phrase.length === 0) return -1;
  for (let i = Math.max(0, from); i + phrase.length <= words.length; i++) {
    let hit = true;
    for (let k = 0; k < phrase.length; k++) {
      if (words[i + k] !== phrase[k]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

export interface Subtitle {
  /** Index of the line's first word. */
  word: number;
  text: string;
}

/** Break the narration into short subtitle lines: at sentence ends, at commas once long enough, or at `max` words. */
export function subtitles(narration: string, max = 9): Subtitle[] {
  const raw = narration.split(/\s+/).filter(Boolean);
  const lines: Subtitle[] = [];
  let line: string[] = [];
  let first = 0;
  let counted = 0;
  for (const token of raw) {
    const isWord = narrationWords(token).length > 0;
    if (line.length === 0) first = counted;
    line.push(token);
    if (isWord) counted++;
    const sentenceEnd = /[.!?]["')]?$/.test(token);
    const clauseEnd = /[,;:—]$/.test(token) && line.length >= 5;
    if (sentenceEnd || clauseEnd || line.length >= max) {
      lines.push({ word: first, text: line.join(" ") });
      line = [];
    }
  }
  if (line.length) lines.push({ word: first, text: line.join(" ") });
  return lines;
}

export interface HeardWord {
  word: string;
  start: number;
  end: number;
}

/**
 * The second each narration word starts, from a transcript of the voice with word timestamps.
 * Both lists are walked in order. A transcript word may be several narration words ("twenty-four") or be
 * spelled differently ("24"); a narration word that never matches is placed evenly between its neighbours.
 */
export function alignWords(narration: string, heard: HeardWord[], total: number): number[] {
  const words = narrationWords(narration);
  const tokens: { token: string; at: number }[] = [];
  for (const h of heard) {
    const parts = narrationWords(h.word.replace(/-/g, " "));
    parts.forEach((token, i) => tokens.push({ token, at: h.start + ((h.end - h.start) * i) / parts.length }));
  }
  const spoken = words.flatMap((w, index) => w.split("-").filter(Boolean).map((token, part) => ({ token, index, part })));
  const times: (number | null)[] = new Array(words.length).fill(null);
  let next = 0;
  for (const { token, index, part } of spoken) {
    for (let look = next; look < Math.min(tokens.length, next + 8); look++) {
      if (tokens[look].token !== token) continue;
      if (part === 0) times[index] = tokens[look].at;
      next = look + 1;
      break;
    }
  }
  for (let k = 0; k < times.length; k++) {
    if (times[k] !== null) continue;
    let a = k - 1;
    while (a >= 0 && times[a] === null) a--;
    let b = k + 1;
    while (b < times.length && times[b] === null) b++;
    const from = a >= 0 ? (times[a] as number) : 0;
    const to = b < times.length ? (times[b] as number) : total;
    for (let m = k; m < b; m++) times[m] = from + ((to - from) * (m - a)) / (b - a);
    k = b - 1;
  }
  const out = times as number[];
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1]);
  return out.map((t) => Math.round(t * 1000) / 1000);
}
