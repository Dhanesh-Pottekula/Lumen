/**
 * Tiny image registry: preload SVG (or any image) URLs into decoded HTMLImageElements and hand
 * them to scenes for drawing. Keeps canvas rendering pure — a decoded element drawn at time t is
 * deterministic — and lets scenes fall back to primitives until an asset is ready.
 */

const cache = new Map<string, HTMLImageElement>();

/** An element is safe to draw once it has fully decoded to non-zero pixels. */
export function isDrawable(el: HTMLImageElement | undefined): el is HTMLImageElement {
  return !!el && el.complete && el.naturalWidth > 0;
}

/**
 * Load each URL into an HTMLImageElement and await decode. Failures are swallowed (the scene
 * fallback covers a missing asset). No-op outside the browser (tests/SSR).
 */
export async function preloadImages(urls: string[]): Promise<void> {
  if (typeof Image === "undefined") return;
  await Promise.all(
    urls.map(async (url) => {
      if (cache.has(url)) return;
      const el = new Image();
      el.src = url;
      cache.set(url, el);
      try {
        await el.decode();
      } catch {
        // leave it cached; isDrawable() will keep returning false until/unless it loads
      }
    }),
  );
}

/** The decoded element for a URL, or undefined if not loaded/decoded yet. */
export function getImage(url: string): HTMLImageElement | undefined {
  const el = cache.get(url);
  return isDrawable(el) ? el : undefined;
}
