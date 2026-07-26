// src/gcl/attention.ts
/**
 * Attention overlay target resolver. `{type:"attention"}` items (compile.ts) point at an anchor —
 * an id in the layout's `boxes` map, a named slot, or an [x,y] coord — and this resolves that anchor
 * into drawable geometry: a center point, a radius (for point-style verbs like highlight/spotlight/
 * pointer/converge/spark/rings), and a box (for box-style verbs like box/brackets/encircle). Pure
 * function of its inputs — no wall-clock, no mutable state — so re-seeking is exact.
 */
import type { Box } from "./anchors";
import { resolvePosition } from "./anchors";
import { clamp01 } from "../slides/anim";
import type { ExitSpec, Position, Vec2 } from "./schema";
import { resolveExit } from "./timing";

export interface AttnGeom {
  cx: number;
  cy: number;
  r: number;
  box: Box;
}

const DEFAULT_R = 40;

/** Pure visibility envelope for an attention directive. Attention used to ignore Base.exit entirely,
 * which made labels from semantic camera tours accumulate forever. */
export function attentionOpacity(
  t: number,
  at: number,
  enterDur: number,
  exitSpec: ExitSpec | undefined,
  sceneDuration: number,
): number {
  if (t < at) return 0;
  const enterP = enterDur > 0 ? clamp01((t - at) / enterDur) : 1;
  const exit = resolveExit(exitSpec, sceneDuration);
  if (!exit || t < exit.out) return enterP;
  if (exit.dur <= 0 || t >= exit.out + exit.dur) return 0;
  return Math.min(enterP, 1 - clamp01((t - exit.out) / exit.dur));
}

/** Resolve a target anchor (id | slot | coords) to a drawable geometry (point + radius + box).
 *  `boxes` = the layout's component id → Box map. An id hit uses that box's own center/size; anything
 *  else (slot name or [x,y] coords) resolves via `resolvePosition` to a point with a small default
 *  zero-size box and a default radius. */
export function attnGeom(target: unknown, boxes: Map<string, Box>, viewW: number, viewH: number, geo?: (pos: Position) => Vec2 | null): AttnGeom {
  // An id in the layout takes priority (component-anchored callouts); but a geo name (place/region/
  // feature) is not an id, so if `boxes` doesn't have it we fall through to the geo-aware resolver.
  if (typeof target === "string" && boxes.has(target)) {
    const box = boxes.get(target)!;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const r = Math.hypot(box.w, box.h) / 2;
    return { cx, cy, r, box };
  }
  const [cx, cy] = resolvePosition(target as Position, { viewW, viewH, boxes, geo });
  return { cx, cy, r: DEFAULT_R, box: { x: cx, y: cy, w: 0, h: 0 } };
}
