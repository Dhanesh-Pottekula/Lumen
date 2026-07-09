import { describe, expect, it } from "vitest";

import { isDrawable } from "./imageRegistry";
import { PHOTO_ASSET_URLS, PHOTO_ASSETS } from "./photosynthesis";

describe("isDrawable", () => {
  it("is false for undefined", () => {
    expect(isDrawable(undefined)).toBe(false);
  });

  it("is false for an incomplete or zero-size element", () => {
    expect(isDrawable({ complete: false, naturalWidth: 100 } as HTMLImageElement)).toBe(false);
    expect(isDrawable({ complete: true, naturalWidth: 0 } as HTMLImageElement)).toBe(false);
  });

  it("is true for a decoded element", () => {
    expect(isDrawable({ complete: true, naturalWidth: 120 } as HTMLImageElement)).toBe(true);
  });
});

describe("photosynthesis manifest", () => {
  it("exposes one URL per asset, all under the images path", () => {
    const names = Object.keys(PHOTO_ASSETS);
    expect(PHOTO_ASSET_URLS).toHaveLength(names.length);
    for (const url of PHOTO_ASSET_URLS) {
      expect(url.startsWith("/images/photosynthesis/")).toBe(true);
      expect(url.endsWith(".svg")).toBe(true);
    }
    expect(new Set(PHOTO_ASSET_URLS).size).toBe(PHOTO_ASSET_URLS.length); // no dup URLs
  });
});
