// src/gcl/flash.ts
/**
 * The flash ceiling (WCAG 2.3.1): nothing on screen flips its brightness up and back more than three
 * times a second, and nothing large flashes at all. Each of the engine's bursts — a spark, focus
 * rings — brightens once and fades, so a burst starting less than FLASH_GAP after the last one kept
 * is left out; a glow never fades in or out quicker than FLASH_MIN / 2 nor grows past GLOW_MAX_R.
 */
import type { AttnVerb } from "./schema";

export const FLASH_GAP = 1 / 3;
export const FLASH_MIN = 0.6;
/** A glow's reach, in view units: its bright core stays well inside a 200-unit square. */
export const GLOW_MAX_R = 110;

const BURSTS: ReadonlySet<AttnVerb> = new Set(["spark", "rings"]);

/** Which attention cues play: every one but a burst that would start too soon after the burst before it. */
export function flashKept(verbs: AttnVerb[], timings: { at: number }[]): boolean[] {
  const kept = verbs.map(() => true);
  let last = -Infinity;
  for (const i of verbs.map((_, index) => index).filter((index) => BURSTS.has(verbs[index])).sort((a, b) => timings[a].at - timings[b].at)) {
    kept[i] = timings[i].at - last >= FLASH_GAP - 1e-9;
    if (kept[i]) last = timings[i].at;
  }
  return kept;
}
