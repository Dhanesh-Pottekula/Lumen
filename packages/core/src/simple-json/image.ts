/**
 * The `image` object kind: a raster picture fitted into its box. Pure and DOM-free, so compile and
 * validation work in Node exactly as in a browser: the picture's aspect comes from its `aspect` field
 * or from the header bytes of its data URL (PNG, JPEG, GIF, WebP), never from decoding it.
 */
import type { ObjectSpec, SceneSpec } from "./types";

type ImageObject = Extract<ObjectSpec, { kind: "image" }>;

const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,/;
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode the first `limit` bytes of a base64 payload (whitespace ignored; no atob/Buffer needed). */
function decodePrefix(payload: string, limit: number): Uint8Array {
  const out = new Uint8Array(limit);
  let n = 0;
  let bits = 0;
  let value = 0;
  for (let i = 0; i < payload.length && n < limit; i++) {
    const c = payload.charCodeAt(i);
    if (c === 61) break; // '='
    const v = B64.indexOf(payload[i]);
    if (v < 0) continue; // whitespace
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (value >> bits) & 0xff;
    }
  }
  return out.subarray(0, n);
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

/** Pixel size read from an image's header bytes, or undefined when the header is not understood. */
export function imageHeaderSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const b = bytes;
  // PNG: signature, then the IHDR chunk (width, height as big-endian u32).
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: u32be(b, 16), height: u32be(b, 20) };
  }
  // GIF: logical screen width / height, little-endian.
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: u16le(b, 6), height: u16le(b, 8) };
  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X.
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    return undefined;
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = u16be(b, i + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
      i += 2 + length;
    }
  }
  return undefined;
}

/** Pixel size of a data-URL image from its header, or undefined (a blob: URL, an unreadable header). */
export function imageSourceSize(src: string): { width: number; height: number } | undefined {
  const match = DATA_URL.exec(src);
  if (!match) return undefined;
  // 64 KiB of header covers a JPEG with large EXIF / ICC segments before its frame header.
  const size = imageHeaderSize(decodePrefix(src.slice(match[0].length, match[0].length + 90_000), 65_536));
  return size && size.width > 0 && size.height > 0 ? size : undefined;
}

/** Width ÷ height of an image object: its `aspect`, else its data URL's header, else undefined. */
export function imageAspect(object: ImageObject): number | undefined {
  if (typeof object.aspect === "number" && Number.isFinite(object.aspect) && object.aspect > 0) return object.aspect;
  const size = imageSourceSize(object.src);
  return size ? size.width / size.height : undefined;
}

/** The hotspots of an image object, in declaration order. */
export function imageHotspots(object: ImageObject): Array<{ id: string; rect: [number, number, number, number] }> {
  return Object.entries(object.hotspots ?? {}).map(([id, rect]) => ({ id, rect }));
}

/** Every image source a scene (or a lesson's scenes) draws, deduplicated, in first-use order. */
export function sceneImageSources(scenes: readonly SceneSpec[]): string[] {
  const out = new Set<string>();
  const visit = (objects: readonly ObjectSpec[]) => {
    for (const object of objects) {
      if (object.kind === "image" && typeof object.src === "string") out.add(object.src);
      if (object.kind === "group") visit(object.children);
    }
  };
  for (const scene of scenes) visit(scene.objects ?? []);
  return [...out];
}
