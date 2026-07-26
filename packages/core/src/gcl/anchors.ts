// src/gcl/anchors.ts
import type { GeoPoint, Position, Slot, Vec2 } from "./schema";

export interface Box { x: number; y: number; w: number; h: number }

export interface AnchorCtx {
  viewW: number;
  viewH: number;
  boxes: Map<string, Box>; // component id → bounding box (filled by the layout engine)
  // Optional geographic resolver (built from the scene's map in compile.ts). Resolves a `{lon,lat}`
  // point or a named place/region/feature to a screen point; returns null for anything non-geographic
  // (so a plain string still falls through to the id-anchor lookup). Absent when the scene has no map.
  geo?: (pos: Position) => Vec2 | null;
}

function isGeoPoint(v: Position): v is GeoPoint {
  return typeof v === "object" && !Array.isArray(v) && typeof (v as GeoPoint).lon === "number" && typeof (v as GeoPoint).lat === "number";
}

const SLOTS: Record<Slot, [number, number]> = {
  "top-left": [0.18, 0.18], top: [0.5, 0.14], "top-right": [0.82, 0.18],
  left: [0.16, 0.5], center: [0.5, 0.5], right: [0.84, 0.5],
  "bottom-left": [0.18, 0.82], bottom: [0.5, 0.86], "bottom-right": [0.82, 0.82],
  ground: [0.5, 0.92], sky: [0.5, 0.1],
};

function isVec2(v: Position): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number";
}

/** Resolve a Position (slot name | [x,y] | component id) to a view-space point. */
export function resolvePosition(pos: Position | undefined, ctx: AnchorCtx, fallback: Vec2 = [ctx.viewW / 2, ctx.viewH / 2]): Vec2 {
  if (pos === undefined) return fallback;
  if (isVec2(pos)) return pos;
  // `{lon,lat}` geo point — projected via the scene's map.
  if (isGeoPoint(pos)) return ctx.geo?.(pos) ?? fallback;
  if (typeof pos === "string" && pos in SLOTS) {
    const [fx, fy] = SLOTS[pos as Slot];
    return [fx * ctx.viewW, fy * ctx.viewH];
  }
  // A string may be a named place/region/feature (try the geo resolver first) or a component id.
  const g = ctx.geo?.(pos);
  if (g) return g;
  const box = typeof pos === "string" ? ctx.boxes.get(pos) : undefined;
  if (box) return [box.x + box.w / 2, box.y + box.h / 2];
  console.warn(`gcl: unknown position "${JSON.stringify(pos)}" — using fallback`);
  return fallback;
}
