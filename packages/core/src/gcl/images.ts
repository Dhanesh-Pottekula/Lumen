// src/gcl/images.ts
/**
 * The one decoded-image cache the renderer draws `{type:"image"}` components from, keyed by `src`.
 *
 * A frame never waits: an image that has not finished decoding is simply not drawn that frame. So a
 * host that must never show a half-loaded picture (a narrated film over a real screen) awaits
 * `preloadImages` for every source a scene uses before it starts playing the scene — after that every
 * frame draws the same pixels, on first play and on re-seek alike.
 *
 * No DOM (Node, the desktop main process, tests): `getImage` returns null and `preloadImages`
 * resolves at once, so compile and validation work anywhere.
 */

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

function entry(src: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = src;
    cache.set(src, img);
  }
  return img;
}

/** The decoded image for `src`, or null while it is still loading (or without a DOM). */
export function getImage(src: string): HTMLImageElement | null {
  const img = entry(src);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Whether `src` is decoded and ready to draw (always false without a DOM). */
export function imageReady(src: string): boolean {
  return getImage(src) !== null;
}

/**
 * Load and decode one image into the cache. Resolves when it can be drawn; rejects when it cannot be
 * decoded (a broken or unsupported source). Without a DOM it resolves at once.
 */
export function primeImage(src: string): Promise<void> {
  const img = entry(src);
  if (!img) return Promise.resolve();
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  let promise = pending.get(src);
  if (!promise) {
    const decoded =
      typeof img.decode === "function"
        ? img.decode()
        : new Promise<void>((resolve, reject) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => reject(new Error("image failed to load")), { once: true });
          });
    promise = decoded.then(
      () => {
        pending.delete(src);
        if (!(img.naturalWidth > 0)) throw new Error("image decoded to nothing");
      },
      (error: unknown) => {
        pending.delete(src);
        // A failed image must not stay cached as "loading forever": the next prime tries again.
        cache.delete(src);
        throw error instanceof Error ? error : new Error(String(error));
      },
    );
    pending.set(src, promise);
  }
  return promise;
}

/** Prime every source (deduplicated); resolves when all can be drawn, rejects on the first failure. */
export async function preloadImages(sources: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(sources)].map((src) => primeImage(src)));
}

/** Drop decoded images that are no longer needed (a host ending an explanation frees its pictures). */
export function releaseImages(sources?: Iterable<string>): void {
  if (!sources) {
    cache.clear();
    pending.clear();
    return;
  }
  for (const src of sources) {
    cache.delete(src);
    pending.delete(src);
  }
}
