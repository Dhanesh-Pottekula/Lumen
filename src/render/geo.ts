/**
 * geo — the map/geo subsystem: a projection (lon/lat → view), region fills with draw-on borders,
 * borders-over-time via keyframe interpolation (morph), flow arrows between coordinates, geo markers,
 * and fog-of-war reveal. GeoJSON-shaped input (rings of [lon,lat]); to stay deterministic/offline the
 * data is passed in (no fetch) — a lesson bundles a small feature set or an authored sample.
 *
 * Composes with camera (11) for region zooms, reveal (05) for fog-of-war, icons (15) for markers,
 * strokes (04) for draw-on borders/arrows, and morph (14) for borders-over-time.
 */
import { clamp01, fadeText, lerp } from "../slides/anim";
import { drawIcon, type IconName } from "./icons";
import { morph } from "./morph";
import { type Pt, smoothPath, strokeOn } from "./strokes";
import { arrowhead } from "./strokeVerbs";

export type LonLat = [number, number];

export interface GeoFeature {
  id: string;
  rings: LonLat[][]; // one or more closed rings (first = outer)
  props?: Record<string, unknown>;
}

export interface Projection {
  project(ll: LonLat): Pt;
  scale: number;
}

/** An equirectangular projection fit to the bounding box of `features` within `area` (north = up). */
export function fitProjection(features: GeoFeature[], area: { x: number; y: number; w: number; h: number }, pad = 24): Projection {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const f of features) {
    for (const ring of f.rings) {
      for (const [lon, lat] of ring) {
        minx = Math.min(minx, lon);
        maxx = Math.max(maxx, lon);
        miny = Math.min(miny, lat);
        maxy = Math.max(maxy, lat);
      }
    }
  }
  if (!isFinite(minx) || !isFinite(miny)) {
    // empty feature set — return a harmless identity-ish projection instead of NaN coordinates
    return { scale: 1, project: ([lon, lat]) => [area.x + lon, area.y + lat] };
  }
  const bw = maxx - minx || 1;
  const bh = maxy - miny || 1;
  const s = Math.min((area.w - 2 * pad) / bw, (area.h - 2 * pad) / bh);
  const ox = area.x + (area.w - bw * s) / 2;
  const oy = area.y + (area.h - bh * s) / 2;
  return {
    scale: s,
    project: ([lon, lat]) => [ox + (lon - minx) * s, oy + (maxy - lat) * s],
  };
}

const projectRing = (ring: LonLat[], proj: Projection): Pt[] => ring.map((ll) => proj.project(ll));

export interface RegionStyle {
  fill?: string;
  stroke?: string;
  width?: number;
  p?: number; // draw-on: border strokes on, fill fades in after
  fillAlpha?: number;
}

/** Draw one feature: border draws on with `p`, fill fades in after ~30%. */
export function drawFeature(ctx: CanvasRenderingContext2D, feature: GeoFeature, proj: Projection, style: RegionStyle = {}) {
  const p = clamp01(style.p ?? 1);
  const outer = projectRing(feature.rings[0], proj);
  // fill (all rings, even-odd for holes)
  if (style.fill && p > 0.3) {
    const fa = clamp01((p - 0.3) / 0.7) * (style.fillAlpha ?? 1);
    ctx.save();
    ctx.globalAlpha *= fa;
    ctx.fillStyle = style.fill;
    ctx.beginPath();
    for (const ring of feature.rings) {
      const pts = projectRing(ring, proj);
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.restore();
  }
  // border draws on
  if (style.stroke) {
    const border = [...outer, outer[0]];
    strokeOn(ctx, border, p, { color: style.stroke, width: style.width ?? 1.5 });
  }
}

/** Draw a whole map; `styleFor` picks per-feature style (e.g. by color-semantics). */
export function drawMap(ctx: CanvasRenderingContext2D, features: GeoFeature[], proj: Projection, styleFor: (f: GeoFeature, i: number) => RegionStyle) {
  features.forEach((f, i) => drawFeature(ctx, f, proj, styleFor(f, i)));
}

/** Interpolate a feature's outer border between two keyframes (borders-over-time). */
export function borderAt(ringsA: LonLat[], ringsB: LonLat[], p: number, proj: Projection): Pt[] {
  const a = projectRing(ringsA, proj);
  const b = projectRing(ringsB, proj);
  return morph(a, b, p, { closed: true, align: true, n: 96 });
}

/** A curved flow arrow between two coordinates, drawing on to `p`. */
export function flowArrow(ctx: CanvasRenderingContext2D, from: LonLat, to: LonLat, proj: Projection, p: number, opts: { color?: string; width?: number; bend?: number } = {}) {
  const a = proj.project(from);
  const b = proj.project(to);
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  let nx = -(b[1] - a[1]);
  let ny = b[0] - a[0];
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  const bend = opts.bend ?? 0.22;
  const ctrl: Pt = [mx + nx * len * bend, my + ny * len * bend];
  const path = smoothPath([a, ctrl, b], { curve: "catmullRom", samples: 24 });
  const P = clamp01(p);
  strokeOn(ctx, path, P, { color: opts.color ?? "#e8a13c", width: opts.width ?? 2.5 });
  if (P > 0.9) {
    const tip = path[path.length - 1];
    const prev = path[path.length - 6] ?? path[0];
    arrowhead(ctx, { x: tip[0], y: tip[1], angle: Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) }, { size: 11, color: opts.color ?? "#e8a13c", alpha: clamp01((P - 0.9) / 0.1) });
  }
}

/** A marker (icon pin) + optional label at a coordinate. */
export function geoMarker(ctx: CanvasRenderingContext2D, ll: LonLat, proj: Projection, opts: { icon?: IconName; color?: string; label?: string; size?: number; alpha?: number } = {}) {
  const [x, y] = proj.project(ll);
  const a = clamp01(opts.alpha ?? 1);
  if (a <= 0) return;
  drawIcon(ctx, opts.icon ?? "pin", x, y - (opts.size ?? 16) / 2, opts.size ?? 16, { color: opts.color ?? "#e24b4a", filled: true, alpha: a });
  if (opts.label) fadeText(ctx, opts.label, x, y + 14, a, "600 11px -apple-system, sans-serif", "#eef5ef");
}

/** Bounding-box center of a feature (lon/lat) — handy as a camera focus target once projected. */
export function featureCenter(feature: GeoFeature): LonLat {
  const ring = feature.rings[0];
  if (!ring || ring.length === 0) return [0, 0];
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const [lon, lat] of ring) {
    minx = Math.min(minx, lon);
    maxx = Math.max(maxx, lon);
    miny = Math.min(miny, lat);
    maxy = Math.max(maxy, lat);
  }
  return [(minx + maxx) / 2, (miny + maxy) / 2];
}
