/**
 * Small helpers the film pipeline is built from: reading a JSON plan while it is still streaming, pulling one
 * JSON object out of a model's reply, and the lanes that cap how much runs at once.
 */

/** Lowercase letters, digits and single hyphens; a leading digit gets "p". */
export function slug(raw: unknown): string {
  const spelled = String(raw)
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return /^[0-9]/.test(spelled) ? `p${spelled}` : spelled;
}

export interface Closed {
  entries: unknown[];
  /** Where to resume from on the next call. 0 means the array has not opened yet. */
  cursor: number;
  /** True once the array's closing `]` has been read. */
  done: boolean;
}

/**
 * The complete `{...}` entries of the array that follows `key` in `buffer`, from `cursor` on. Called again and
 * again as the buffer grows, it returns each entry exactly once, the moment its closing brace arrives. This is
 * what lets a picture start drawing while the planner is still writing the rest of the plan.
 */
export function entriesClosed(buffer: string, key: RegExp, cursor: number): Closed {
  const entries: unknown[] = [];
  let at = cursor;
  if (at === 0) {
    const found = key.exec(buffer);
    if (!found) return { entries, cursor: 0, done: false };
    at = found.index + found[0].length;
  }
  for (;;) {
    while (at < buffer.length && /[\s,]/.test(buffer[at])) at++;
    if (at >= buffer.length) return { entries, cursor: at, done: false };
    if (buffer[at] === "]") return { entries, cursor: at + 1, done: true };
    if (buffer[at] !== "{") {
      at++;
      continue;
    }
    const end = entryEnd(buffer, at);
    if (end === null) return { entries, cursor: at, done: false };
    try {
      entries.push(JSON.parse(buffer.slice(at, end)));
    } catch {
      // A malformed entry is skipped; the rest of the plan still counts.
    }
    at = end;
  }
}

/** Where the object starting at `start` closes (exclusive), aware of strings; null while it is still open. */
function entryEnd(text: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

export const PICTURES_KEY = /"pictures"\s*:\s*\[/;
export const STEPS_KEY = /"steps"\s*:\s*\[/;

/** The plan's opening fields (title, character), read from everything before its pictures. */
export function planHeader(buffer: string): Record<string, unknown> | null {
  const at = PICTURES_KEY.exec(buffer);
  if (!at) return null;
  const opening = buffer.slice(0, at.index).replace(/^[^{]*\{/, "{").replace(/,\s*$/, "") + "}";
  try {
    const value: unknown = JSON.parse(opening);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The JSON object in a reply: the whole text, a fenced block, or the outermost braces. */
export function jsonObject(text: string): Record<string, unknown> | null {
  const tries = [text.trim()];
  const fence = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text);
  if (fence) tries.push(fence[1]);
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try {
      const value: unknown = JSON.parse(t);
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // try the next shape
    }
  }
  return null;
}

/** A counting semaphore: at most `n` tasks run at once. */
export function lanes(n: number): <T>(task: () => Promise<T>) => Promise<T> {
  let free = n;
  const waiting: (() => void)[] = [];
  return async (task) => {
    while (free === 0) await new Promise<void>((resolve) => waiting.push(resolve));
    free--;
    try {
      return await task();
    } finally {
      free++;
      waiting.shift()?.();
    }
  };
}

/**
 * Writing lanes that keep room for earlier steps. A step may take a lane only while more lanes are free than
 * there are earlier steps still waiting to start, so step 1 is never stuck behind steps 5 to 8 and the film's
 * opening scenes are released first.
 */
export function writingLanes(n: number) {
  let free = n;
  const unstarted = new Set<number>();
  let waiting: (() => void)[] = [];
  const wake = () => {
    const all = waiting;
    waiting = [];
    for (const resolve of all) resolve();
  };
  const earlier = (place: number) => {
    let count = 0;
    for (const other of unstarted) if (other < place) count++;
    return count;
  };
  return {
    /** Announce a step the moment it is planned, before it is ready to write. */
    enlist(place: number) {
      unstarted.add(place);
    },
    async run<T>(place: number, task: () => Promise<T>): Promise<T> {
      while (free <= earlier(place)) await new Promise<void>((resolve) => waiting.push(resolve));
      free--;
      unstarted.delete(place);
      wake();
      try {
        return await task();
      } finally {
        free++;
        wake();
      }
    },
    /** A step that will never write (its pictures all failed) gives up its reservation. */
    withdraw(place: number) {
      unstarted.delete(place);
      wake();
    },
  };
}

/** Width and height of a PNG, JPEG, WebP or SVG image, read from its bytes; null when the format is unknown. */
export function imageSize(bytes: Uint8Array): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: 8-byte signature, then IHDR with width and height.
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) return [view.getUint32(16), view.getUint32(20)];
  // JPEG: walk the segments to the first start-of-frame marker.
  if (bytes.length > 4 && view.getUint16(0) === 0xffd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      const length = view.getUint16(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [view.getUint16(at + 7), view.getUint16(at + 5)];
      }
      at += 2 + length;
    }
    return null;
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 600));
  // WebP: RIFF....WEBP, then a VP8, VP8L or VP8X chunk.
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP" && bytes.length > 30) {
    const kind = head.slice(12, 16);
    if (kind === "VP8X") return [1 + (view.getUint32(24, true) & 0xffffff), 1 + (view.getUint32(27, true) & 0xffffff)];
    if (kind === "VP8 ") return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (kind === "VP8L") {
      const bits = view.getUint32(21, true);
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    }
    return null;
  }
  const svg = /<svg[^>]*\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(head);
  if (svg) return [Number(svg[1]), Number(svg[2])];
  return null;
}
