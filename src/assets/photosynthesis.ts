/**
 * Photosynthesis SVG asset manifest. Logical name → served URL (from public/images/photosynthesis).
 * Scenes call `img(name)` and fall back to primitives until the asset is decoded.
 */
import { getImage } from "./imageRegistry";

const BASE = "/images/photosynthesis";

export const PHOTO_ASSETS = {
  sun: `${BASE}/sun.svg`,
  leaf: `${BASE}/leaf.svg`,
  cell: `${BASE}/mesophyll-cell.svg`,
  chloroplast: `${BASE}/chloroplast.svg`,
  chloroplastCutaway: `${BASE}/chloroplast-cutaway.svg`,
  thylakoidMembrane: `${BASE}/thylakoid-membrane.svg`,
  calvinRing: `${BASE}/calvin-ring.svg`,
  co2: `${BASE}/co2.svg`,
  h2o: `${BASE}/h2o.svg`,
  o2: `${BASE}/o2.svg`,
  glucose: `${BASE}/glucose.svg`,
  atp: `${BASE}/atp.svg`,
  nadph: `${BASE}/nadph.svg`,
  waterDrop: `${BASE}/water-drop.svg`,
} as const;

export type PhotoAssetName = keyof typeof PHOTO_ASSETS;

/** All asset URLs, for preloading. */
export const PHOTO_ASSET_URLS: string[] = Object.values(PHOTO_ASSETS);

/** The decoded element for a named photosynthesis asset, or undefined if not ready. */
export function img(name: PhotoAssetName): HTMLImageElement | undefined {
  return getImage(PHOTO_ASSETS[name]);
}
