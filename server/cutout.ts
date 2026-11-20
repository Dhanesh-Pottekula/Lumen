/**
 * Cut-outs: take a drawing of one thing on a plain white ground and keep only the thing.
 *
 * The method is AiRA's (`film_picture_ent.py`, `_Helper.ready`), rewritten without numpy so Lumen keeps no
 * dependency: learn the ground's colour from the picture's border, then remove the ground by spreading inward
 * from the border through pixels of that colour. Because it spreads from the outside, white that is closed
 * inside the thing's outline (a white helmet, a bright Sun) is never reached and stays.
 *
 * Lumen's backgrounds are dark, so one step is added: the thin rim where the outline blends into the white
 * ground is made partly see-through and has the white taken out of its colour. Without that every cut-out
 * would carry a pale halo.
 *
 * Only 8-bit PNGs are read (what the image model is asked for). Anything else throws, and the caller treats the
 * picture as one that could not be cut.
 */
import zlib from "node:zlib";

/** A flat ground is asked for as pure white; this is used when the border is too mixed to read a colour from. */
const WHITE: [number, number, number] = [255, 255, 255];
/** How far a pixel may be from the ground's colour and still be ground (AiRA's GROUND_REACH). */
const REACH = 16;
/** The border counts as one flat pale colour when this share of it lies within FLAT of its median (AiRA's values). */
const FLAT = 8;
const FLAT_SHARE = 0.6;
const PALE_FLOOR = 200;
const PALE_TINT = 12;
/** A rim pixel this far from the ground's colour is fully the thing; nearer than that it is a blend. */
const SOLID = 150;
/**
 * Pixels kept round the thing when it is cropped: only enough for its soft rim. The cut-out's own width and
 * height are then the thing's width and height, which is what its size on screen is worked out from, and its
 * lowest row is the thing's foot, so it stands on the ground and not a margin above it. (AiRA pads by 3% of the
 * picture; on a small thing that margin was a sixth of its height.)
 */
const PAD = 2;
/** A loose speck smaller than this share of the largest piece is dust, not part of the thing. */
const SPECK = 0.0015;
/** The thing covers less than this share of the picture: nothing was drawn. */
const EMPTY = 0.003;
/** The thing covers more than this share: a whole scene was drawn, not one thing on a plain ground. */
const BACKDROP = 0.82;

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, four bytes a pixel, row by row. */
  data: Uint8Array;
}

export interface CutOut {
  /** The thing alone on a see-through ground, cropped to it, as PNG bytes. */
  png: Uint8Array;
  width: number;
  height: number;
  /** Share of the original picture the thing covers. */
  coverage: number;
  /** How many of the four edges of the original picture the thing touches. */
  edges: number;
  /** Why this cut-out should not be used, or null when it is good. */
  problem: string | null;
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

// ── The cut ─────────────────────────────────────────────────────────────────────────────────────────
/** The colour the ground was really painted: the border's flat pale colour when it has one, else white. */
function groundOf({ width, height, data }: Pixels): [number, number, number] {
  const border: number[] = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
  const median = (channel: number) => {
    const values = border.map((i) => data[i * 4 + channel]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const painted: [number, number, number] = [median(0), median(1), median(2)];
  let flat = 0;
  for (const i of border) {
    if (Math.max(Math.abs(data[i * 4] - painted[0]), Math.abs(data[i * 4 + 1] - painted[1]), Math.abs(data[i * 4 + 2] - painted[2])) <= FLAT) flat++;
  }
  const pale = Math.min(...painted) >= PALE_FLOOR && Math.max(...painted) - Math.min(...painted) <= PALE_TINT;
  return flat / border.length >= FLAT_SHARE && pale ? painted : WHITE;
}

/**
 * Remove the plain ground round a drawing and crop to what is left.
 *
 * `problem` says when the result should not be used: nothing was drawn, a whole scene was drawn in place of
 * one thing, or the thing runs off the picture and so is cut off.
 */
export function cutOut(source: Pixels): CutOut {
  const { width, height, data } = source;
  const count = width * height;
  const ground = groundOf(source);
  const far = new Uint8Array(count);
  for (let i = 0, o = 0; i < count; i++, o += 4) {
    far[i] = Math.max(Math.abs(data[o] - ground[0]), Math.abs(data[o + 1] - ground[1]), Math.abs(data[o + 2] - ground[2]));
  }

  // Spread inward from the border through ground-coloured pixels. 1 = ground that reaches the border.
  const removed = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const seed = (i: number) => {
    if (!removed[i] && far[i] <= REACH) {
      removed[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < count - width) seed(i + width);
  }

  // Loose specks: keep every piece that is not tiny beside the largest one.
  const piece = new Int32Array(count);
  const sizes: number[] = [0];
  for (let start = 0; start < count; start++) {
    if (removed[start] || piece[start]) continue;
    const label = sizes.length;
    let size = 0;
    head = tail = 0;
    queue[tail++] = start;
    piece[start] = label;
    while (head < tail) {
      const i = queue[head++];
      size++;
      const x = i % width;
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i < count - width ? i + width : -1]) {
        if (next >= 0 && !removed[next] && !piece[next]) {
          piece[next] = label;
          queue[tail++] = next;
        }
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  for (let i = 0; i < count; i++) if (piece[i] && sizes[piece[i]] < largest * SPECK) removed[i] = 1;

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let kept = 0;
  for (let i = 0; i < count; i++) {
    if (removed[i]) continue;
    kept++;
    const x = i % width;
    const y = (i - x) / width;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  const coverage = kept / count;
  if (right < 0) return { png: new Uint8Array(0), width: 0, height: 0, coverage: 0, edges: 0, problem: "nothing but the plain ground was drawn" };
  const edges = Number(left === 0) + Number(top === 0) + Number(right === width - 1) + Number(bottom === height - 1);

  left = Math.max(0, left - PAD);
  top = Math.max(0, top - PAD);
  right = Math.min(width - 1, right + PAD);
  bottom = Math.min(height - 1, bottom + PAD);
  const out: Pixels = { width: right - left + 1, height: bottom - top + 1, data: new Uint8Array((right - left + 1) * (bottom - top + 1) * 4) };

  /** True when a pixel within two steps is removed ground: this pixel is on the rim. */
  const onRim = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (removed[ny * width + nx]) return true;
      }
    }
    return false;
  };
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = y * width + x;
      if (removed[i]) continue;
      const o = ((y - top) * out.width + (x - left)) * 4;
      let alpha = 1;
      // On the rim, a pixel between the ground's colour and the outline's is a blend of the two.
      if (far[i] < SOLID && onRim(x, y)) alpha = Math.max(0, (far[i] - REACH) / (SOLID - REACH));
      for (let c = 0; c < 3; c++) {
        // Take the ground's share of the colour back out, so the rim does not stay pale on a dark picture.
        const pure = alpha > 0 ? (data[i * 4 + c] - (1 - alpha) * ground[c]) / alpha : 0;
        out.data[o + c] = Math.max(0, Math.min(255, Math.round(pure)));
      }
      out.data[o + 3] = Math.round(alpha * 255 * (data[i * 4 + 3] / 255));
    }
  }

  const problem =
    coverage < EMPTY
      ? "nothing but the plain ground was drawn"
      : coverage > BACKDROP || edges === 4
        ? "a whole scene was drawn, not one thing on a plain white ground"
        : edges >= 2
          ? "the thing runs off the picture, so part of it is cut off"
          : null;
  return { png: encodePng(out), width: out.width, height: out.height, coverage, edges, problem };
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

/** Cut a drawing given as PNG bytes. Throws when the bytes are not a PNG this can read. */
export function cutOutPng(bytes: Uint8Array): CutOut {
  return cutOut(decodePng(bytes));
}
