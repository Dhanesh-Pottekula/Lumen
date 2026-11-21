/**
 * Sheets: several of a film's pictures drawn in one image, and cut apart here.
 *
 * A drawing costs the same whatever is in it, so a film's pictures are drawn up to nine to a drawing, as a
 * grid of wide frames with white between them, and this file finds the white and cuts the frames out.
 *
 * Only 8-bit PNGs are read (what the image model is asked for). Anything else throws, and the caller treats the
 * drawing as one that could not be used.
 */
import zlib from "node:zlib";

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, four bytes a pixel, row by row. */
  data: Uint8Array;
}

// ── PNG ─────────────────────────────────────────────────────────────────────────────────────────────
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Read an 8-bit grey, RGB or RGBA PNG (with or without a palette) into RGBA pixels. */
export function decodePng(bytes: Uint8Array): Pixels {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw new Error("not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let paletteAlpha: Uint8Array | null = null;
  const packed: Uint8Array[] = [];
  for (let at = 8; at + 12 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8];
      colour = body[9];
      interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") paletteAlpha = body;
    else if (type === "IDAT") packed.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colour];
  if (!width || !height || depth !== 8 || !channels || interlace !== 0) throw new Error("only 8-bit PNGs that are not interlaced can be cut out");
  if (colour === 3 && !palette) throw new Error("the PNG's palette is missing");

  const raw = zlib.inflateSync(Buffer.concat(packed));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error("the PNG is cut short");
  const lines = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? lines[to + x - channels] : 0;
      const up = y > 0 ? lines[to + x - stride] : 0;
      const corner = x >= channels && y > 0 ? lines[to + x - stride - channels] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      lines[to + x] = (raw[from + x] + add) & 0xff;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    const s = i * channels;
    if (colour === 2 || colour === 6) {
      data[o] = lines[s];
      data[o + 1] = lines[s + 1];
      data[o + 2] = lines[s + 2];
      data[o + 3] = colour === 6 ? lines[s + 3] : 255;
    } else if (colour === 3) {
      const index = lines[s] * 3;
      data[o] = palette![index] ?? 0;
      data[o + 1] = palette![index + 1] ?? 0;
      data[o + 2] = palette![index + 2] ?? 0;
      data[o + 3] = paletteAlpha && lines[s] < paletteAlpha.length ? paletteAlpha[lines[s]] : 255;
    } else {
      data[o] = data[o + 1] = data[o + 2] = lines[s];
      data[o + 3] = colour === 4 ? lines[s + 1] : 255;
    }
  }
  return { width, height, data };
}

/** Write RGBA pixels as a PNG. */
export function encodePng({ width, height, data }: Pixels): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
    return out;
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Uint8Array.from(SIGNATURE), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);
}

/**
 * The same picture at no more than `widest` pixels across, as PNG bytes: for showing a drawing to a model that
 * only needs to see what is where. Whole pixels are averaged, so the picture is halved, or cut to a third, and
 * so on. A picture already small enough, or one that cannot be read, is given back as it came.
 */
export function shrinkPng(bytes: Uint8Array, widest: number): Uint8Array {
  let source: Pixels;
  try {
    source = decodePng(bytes);
  } catch {
    return bytes;
  }
  const by = Math.ceil(source.width / widest);
  if (by <= 1) return bytes;
  const width = Math.floor(source.width / by);
  const height = Math.floor(source.height / by);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sum = [0, 0, 0, 0];
      for (let dy = 0; dy < by; dy++) {
        for (let dx = 0; dx < by; dx++) {
          const from = ((y * by + dy) * source.width + x * by + dx) * 4;
          for (let c = 0; c < 4; c++) sum[c] += source.data[from + c];
        }
      }
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = Math.round(sum[c] / (by * by));
    }
  }
  return encodePng({ width, height, data });
}

// ── Several backgrounds in one drawing ──────────────────────────────────────────────────────────────
/** The most pictures one drawing holds. */
export const SHEET_MOST = 9;

/**
 * How a drawing of `count` pictures is laid out, and the size asked for. Every layout is on the wide sheet,
 * which costs what one ordinary picture costs, and every place in it is three across to two down: close to the
 * film's own 16:9, so little of a frame is lost when it fills the screen.
 *   2 to 4   two by two
 *   5 to 9   three by three
 * Places left over at the end of the grid stay white.
 */
export function sheetLayout(count: number): { cols: number; rows: number; size: string } {
  if (count <= 1) return { cols: 1, rows: 1, size: "1536x1024" };
  if (count <= 4) return { cols: 2, rows: 2, size: "1536x1024" };
  return { cols: 3, rows: 3, size: "1536x1024" };
}

/** A pixel this bright in all three colours is the white between frames. */
const WHITE_FROM = 236;
/** A row or column is white when this share of it is. */
const WHITE_SHARE = 0.97;
/** How far from where a gutter should be it is looked for, as a share of one cell. A white sky further in is not a gutter. */
const GUTTER_REACH = 0.3;
/** A frame smaller than this share of its cell, either way, is not a frame: nothing was drawn in that place. */
const FRAME_LEAST = 0.4;

/**
 * Cut a drawing of `count` frames, laid out as `cols` by `rows` with white between them, into the frames, in
 * reading order. Each gutter is looked for near the line where an even grid would have it, as the longest run
 * of white rows (or columns) there; with no such run the drawing is cut on that line. White left round a frame
 * is trimmed off. A place where no frame was drawn gives null.
 */
export function cutSheet(bytes: Uint8Array, cols: number, rows: number, count: number): (Uint8Array | null)[] {
  const { width, height, data } = decodePng(bytes);
  const white = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    return data[o] >= WHITE_FROM && data[o + 1] >= WHITE_FROM && data[o + 2] >= WHITE_FROM;
  };
  const rowWhite = (y: number, left: number, right: number) => {
    let n = 0;
    for (let x = left; x <= right; x++) if (white(x, y)) n++;
    return n >= (right - left + 1) * WHITE_SHARE;
  };
  const colWhite = (x: number, top: number, bottom: number) => {
    let n = 0;
    for (let y = top; y <= bottom; y++) if (white(x, y)) n++;
    return n >= (bottom - top + 1) * WHITE_SHARE;
  };
  /** The gutter near `line`: the first and last index of the longest white run within reach, or the line itself. */
  const gutter = (line: number, cell: number, isWhite: (at: number) => boolean): [number, number] => {
    const from = Math.max(1, Math.round(line - cell * GUTTER_REACH));
    const to = Math.round(line + cell * GUTTER_REACH);
    let found: [number, number] = [line, line - 1];
    let best = 0;
    for (let at = from; at <= to; ) {
      if (!isWhite(at)) {
        at++;
        continue;
      }
      let end = at;
      while (end + 1 <= to && isWhite(end + 1)) end++;
      if (end - at + 1 > best) {
        best = end - at + 1;
        found = [at, end];
      }
      at = end + 1;
    }
    return found;
  };

  // Where each column and each row of frames begins and ends.
  const across: [number, number][] = [];
  let start = 0;
  for (let c = 1; c < cols; c++) {
    const [a, b] = gutter(Math.round((width * c) / cols), width / cols, (x) => colWhite(x, 0, height - 1));
    across.push([start, a - 1]);
    start = b + 1;
  }
  across.push([start, width - 1]);
  const down: [number, number][] = [];
  start = 0;
  for (let r = 1; r < rows; r++) {
    const [a, b] = gutter(Math.round((height * r) / rows), height / rows, (y) => rowWhite(y, 0, width - 1));
    down.push([start, a - 1]);
    start = b + 1;
  }
  down.push([start, height - 1]);

  const frames: (Uint8Array | null)[] = [];
  for (let n = 0; n < count; n++) {
    let [left, right] = across[n % cols];
    let [top, bottom] = down[Math.floor(n / cols)] ?? [0, -1];
    while (top < bottom && rowWhite(top, left, right)) top++;
    while (bottom > top && rowWhite(bottom, left, right)) bottom--;
    while (left < right && colWhite(left, top, bottom)) left++;
    while (right > left && colWhite(right, top, bottom)) right--;
    // A pixel in from each side, so the soft edge where a frame meets the white is left behind.
    top = Math.min(bottom, top + 1);
    bottom = Math.max(top, bottom - 1);
    left = Math.min(right, left + 1);
    right = Math.max(left, right - 1);
    const w = right - left + 1;
    const h = bottom - top + 1;
    if (w < (width / cols) * FRAME_LEAST || h < (height / rows) * FRAME_LEAST) {
      frames.push(null);
      continue;
    }
    const out: Pixels = { width: w, height: h, data: new Uint8Array(w * h * 4) };
    for (let y = top; y <= bottom; y++) out.data.set(data.subarray((y * width + left) * 4, (y * width + right + 1) * 4), (y - top) * w * 4);
    frames.push(encodePng(out));
  }
  return frames;
}
