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

// ── A sheet of things ───────────────────────────────────────────────────────────────────────────────
/**
 * How a number of things is laid out on one sheet: the grid fits the number, so the sheet is full and each
 * thing is drawn as large as it can be. A fixed grid of twelve with places left empty was tried (2026-11-21):
 * the image model ignored the empty places and drew five things in one row across the top, small and close
 * together. Every sheet is one normal 1536x1024 drawing, so it costs what one picture costs (Dhanesh's
 * decision, 2026-11-21). A 3072x2048 sheet was sharper but cost over twice as much (3,184 output tokens
 * against 1,372, measured). With twelve things each is about 380 px across, so one shown large looks soft.
 */
export function sheetLayout(count: number): { cols: number; rows: number; size: string } {
  const cols = count <= 1 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : count <= 8 ? 4 : count === 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, size: "1536x1024" };
}

/** The most things one sheet holds. A film with more gets a second sheet. */
export const SHEET_MOST = 12;

export interface SheetThing {
  /** The thing alone on white, as it was drawn: what a model is shown, and what another pose is redrawn from. */
  drawn: Uint8Array;
  cut: CutOut;
}

/**
 * Split one drawing of many things, laid out on plain white, into its things, in reading order.
 *
 * The things are found by what is drawn, not by where the grid's lines would be: loose pieces of one thing are joined, nearest first, until the number of things is the number asked for (the shards of a broken cup, a sun and its rays), and the things are then read
 * row by row, left to right. So a last row that the image model spread out or centred still comes out in
 * order. When fewer things are found than were asked for, there is no telling which is missing, and each is
 * taken from its grid cell instead: an empty cell gives null, and the caller draws that thing on its own.
 */
export function cutSheet(bytes: Uint8Array, cols: number, rows: number, count: number): (SheetThing | null)[] {
  const source = decodePng(bytes);
  const { width, height, data } = source;
  const total = width * height;
  const ground = groundOf(source);
  const isGround = (i: number) => Math.max(Math.abs(data[i * 4] - ground[0]), Math.abs(data[i * 4 + 1] - ground[1]), Math.abs(data[i * 4 + 2] - ground[2])) <= REACH;

  // Ground that reaches the border is the sheet's white. White closed inside an outline stays part of its thing.
  const open = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const seed = (i: number) => {
    if (!open[i] && isGround(i)) {
      open[i] = 1;
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
    if (i < total - width) seed(i + width);
  }

  // Each connected piece of drawing: its box, its size, and its label on every pixel of it.
  interface Piece {
    left: number;
    top: number;
    right: number;
    bottom: number;
    size: number;
    /** The thing this piece belongs to: an index into `pieces`, followed to its root. */
    thing: number;
  }
  const label = new Int32Array(total).fill(-1);
  const pieces: Piece[] = [];
  const speck = (total / (cols * rows)) * EMPTY * 0.1;
  for (let start = 0; start < total; start++) {
    if (open[start] || label[start] >= 0) continue;
    const id = pieces.length;
    head = tail = 0;
    queue[tail++] = start;
    label[start] = id;
    const piece: Piece = { left: width, top: height, right: -1, bottom: -1, size: 0, thing: id };
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const y = (i - x) / width;
      if (x < piece.left) piece.left = x;
      if (x > piece.right) piece.right = x;
      if (y < piece.top) piece.top = y;
      if (y > piece.bottom) piece.bottom = y;
      for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i < total - width ? i + width : -1]) {
        if (next >= 0 && !open[next] && label[next] < 0) {
          label[next] = id;
          queue[tail++] = next;
        }
      }
    }
    piece.size = tail;
    pieces.push(piece);
  }
  // Stray dots are nobody's.
  const real = pieces.map((piece, id) => (piece.size >= speck ? id : -1)).filter((id) => id >= 0);

  const root = (id: number): number => {
    let top = id;
    while (pieces[top].thing !== top) top = pieces[top].thing;
    // Point everything on the way straight at the top, so the next look is short.
    while (pieces[id].thing !== top) {
      const next = pieces[id].thing;
      pieces[id].thing = top;
      id = next;
    }
    return top;
  };
  /** How far apart two boxes are: 0 when they touch or overlap. */
  const apart = (a: Piece, b: Piece) => Math.max(0, a.left - b.right, b.left - a.right, a.top - b.bottom, b.top - a.bottom);
  const join = (a: number, b: number) => {
    const into = pieces[root(a)];
    const from = pieces[root(b)];
    if (into === from) return;
    into.left = Math.min(into.left, from.left);
    into.top = Math.min(into.top, from.top);
    into.right = Math.max(into.right, from.right);
    into.bottom = Math.max(into.bottom, from.bottom);
    into.size += from.size;
    from.thing = root(a);
  };
  const things = () => real.filter((id) => root(id) === id);

  // More pieces than things: a thing was drawn in loose pieces (the shards of a cup, a sun and its rays). The
  // two nearest pieces are joined until the number is the one asked for. Nothing is joined just for being
  // close, because whole things are sometimes drawn close together.
  for (let now = things(); now.length > count; now = things()) {
    let best: [number, number] = [now[0], now[1]];
    let least = Infinity;
    for (let a = 0; a < now.length; a++) {
      for (let b = a + 1; b < now.length; b++) {
        const d = apart(pieces[now[a]], pieces[now[b]]);
        if (d < least) {
          least = d;
          best = [now[a], now[b]];
        }
      }
    }
    join(best[0], best[1]);
  }

  /** One thing alone on white, with room round it, and its cut-out. `mine` says which pixels are its own. */
  const lift = (box: { left: number; top: number; right: number; bottom: number }, mine: (i: number) => boolean): SheetThing => {
    // Room round the thing, so the cutter sees white on every side and a boxy thing is not taken for a scene.
    const room = Math.max(24, Math.round(Math.max(box.right - box.left, box.bottom - box.top) * 0.12));
    const left = Math.max(0, box.left - room);
    const top = Math.max(0, box.top - room);
    const right = Math.min(width - 1, box.right + room);
    const bottom = Math.min(height - 1, box.bottom + room);
    const crop: Pixels = { width: right - left + 1, height: bottom - top + 1, data: new Uint8Array((right - left + 1) * (bottom - top + 1) * 4).fill(255) };
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const i = y * width + x;
        // Only this thing's own pieces are copied: a neighbour that leans in is left out.
        if (label[i] < 0 || !mine(i)) continue;
        const o = ((y - top) * crop.width + (x - left)) * 4;
        crop.data[o] = data[i * 4];
        crop.data[o + 1] = data[i * 4 + 1];
        crop.data[o + 2] = data[i * 4 + 2];
      }
    }
    return { drawn: encodePng(crop), cut: cutOut(crop) };
  };

  const found = things();
  if (found.length === count) {
    // Reading order: rows are told apart by the widest gaps between the things' middles, top to bottom.
    const middleY = (id: number) => (pieces[id].top + pieces[id].bottom) / 2;
    const middleX = (id: number) => (pieces[id].left + pieces[id].right) / 2;
    const down = [...found].sort((a, b) => middleY(a) - middleY(b));
    const gaps = down.slice(1).map((id, n) => ({ after: n, gap: middleY(id) - middleY(down[n]) }));
    // A new row starts only at a real drop: more than a third of a row's height.
    const breaks = new Set(gaps.filter((g) => g.gap > (height / rows) * 0.34).sort((a, b) => b.gap - a.gap).slice(0, Math.max(0, rows - 1)).map((g) => g.after));
    const ordered: number[] = [];
    let row: number[] = [];
    down.forEach((id, n) => {
      row.push(id);
      if (breaks.has(n) || n === down.length - 1) {
        ordered.push(...row.sort((a, b) => middleX(a) - middleX(b)));
        row = [];
      }
    });
    return ordered.map((id) => lift(pieces[id], (i) => pieces[label[i]].size >= speck && root(label[i]) === id));
  }

  // Fewer things than asked for: take each from the grid cell its middle is in.
  const cellOf = (id: number) => {
    const piece = pieces[id];
    const col = Math.min(cols - 1, Math.floor(((piece.left + piece.right) / 2 / width) * cols));
    const row = Math.min(rows - 1, Math.floor(((piece.top + piece.bottom) / 2 / height) * rows));
    return row * cols + col;
  };
  return Array.from({ length: count }, (_, at) => {
    const here = found.filter((id) => cellOf(id) === at);
    if (!here.length) return null;
    const box = here.map((id): { left: number; top: number; right: number; bottom: number } => pieces[id]).reduce((a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
    return lift(box, (i) => pieces[label[i]].size >= speck && here.includes(root(label[i])));
  });
}

// ── Two backgrounds in one drawing ──────────────────────────────────────────────────────────────────
/** The size of a drawing that holds two 16:9 backgrounds, one above the other, each about 1024 by 550 px. */
export const PAIR_SIZE = "1024x1152";

/**
 * Cut a drawing of two frames, one above the other with a white band between, into the two frames, top first.
 * The band is found as the run of all-white rows nearest the middle; with no such run the drawing is cut at
 * its middle row. White left along a frame's outer edges is trimmed off.
 */
export function cutPair(bytes: Uint8Array): [Uint8Array, Uint8Array] {
  const source = decodePng(bytes);
  const { width, height, data } = source;
  const white = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    return data[o] >= 238 && data[o + 1] >= 238 && data[o + 2] >= 238;
  };
  const rowWhite = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (white(x, y)) n++;
    return n >= width * 0.97;
  };
  const colWhite = (x: number, top: number, bottom: number) => {
    let n = 0;
    for (let y = top; y <= bottom; y++) if (white(x, y)) n++;
    return n >= (bottom - top + 1) * 0.97;
  };

  // The band: the longest run of white rows in the middle third of the drawing.
  let bandTop = height >> 1;
  let bandBottom = (height >> 1) - 1;
  let best = 0;
  for (let y = Math.floor(height * 0.33); y < height * 0.67; ) {
    if (!rowWhite(y)) {
      y++;
      continue;
    }
    let end = y;
    while (end + 1 < height * 0.67 && rowWhite(end + 1)) end++;
    if (end - y + 1 > best) {
      best = end - y + 1;
      bandTop = y;
      bandBottom = end;
    }
    y = end + 1;
  }

  const frame = (top: number, bottom: number): Uint8Array => {
    while (top < bottom && rowWhite(top)) top++;
    while (bottom > top && rowWhite(bottom)) bottom--;
    let left = 0;
    let right = width - 1;
    while (left < right && colWhite(left, top, bottom)) left++;
    while (right > left && colWhite(right, top, bottom)) right--;
    // A pixel in from each side, so the soft edge where a frame meets the white is left behind.
    top = Math.min(bottom, top + 1);
    bottom = Math.max(top, bottom - 1);
    const out: Pixels = { width: right - left + 1, height: bottom - top + 1, data: new Uint8Array((right - left + 1) * (bottom - top + 1) * 4) };
    for (let y = top; y <= bottom; y++) out.data.set(data.subarray((y * width + left) * 4, (y * width + right + 1) * 4), (y - top) * out.width * 4);
    return encodePng(out);
  };
  return [frame(0, bandTop - 1), frame(bandBottom + 1, height - 1)];
}
