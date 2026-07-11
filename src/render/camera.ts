/**
 * camera — a view transform (pan / zoom / rotate) applied to the whole world at composite time.
 * Scenes draw in normal view coords; the camera moves the world. Pure (`camera(t)` derives from t),
 * so it stays seekable. Zoom interpolates geometrically (log) for a natural dolly.
 *
 * A `Camera` centers view point (x, y) in the frame at scale `zoom`, rotated by `rot`. Passing no
 * camera at all (undefined) means no transform — existing films are unaffected.
 */
import { clamp01, lerp, smooth } from "../slides/anim";

export interface Camera {
  x: number; // world point centered in the frame (view coords)
  y: number;
  zoom: number;
  rot: number; // radians
}

/** The neutral camera for a given view size (centers the whole frame at zoom 1). */
export const centerCamera = (viewW: number, viewH: number): Camera => ({ x: viewW / 2, y: viewH / 2, zoom: 1, rot: 0 });

const ZMIN = 1e-3; // zoom floor so log-interpolation never sees 0/negative → NaN transform
const safeZoom = (z: number): number => (z > ZMIN ? z : ZMIN);

/** Interpolate two cameras; zoom uses log interpolation so a 1→4 dolly feels linear in perceived scale. */
export function lerpCamera(a: Camera, b: Camera, p: number): Camera {
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    zoom: Math.exp(lerp(Math.log(safeZoom(a.zoom)), Math.log(safeZoom(b.zoom)), p)),
    rot: lerp(a.rot, b.rot, p),
  };
}

/** A camera focused on (x, y) at `zoom`. */
export const focusOn = (x: number, y: number, zoom = 1, rot = 0): Camera => ({ x, y, zoom, rot });

/** Smoothly move from camera `from` to `to` over [at, at+dur]. Returns the camera at time t. */
export function move(from: Camera, to: Camera, t: number, at: number, dur: number): Camera {
  return lerpCamera(from, to, smooth(clamp01((t - at) / dur)));
}

/** A push-in / dolly onto (cx, cy): zoom from→to over [at, at+dur], centered on the point. */
export function pushIn(viewW: number, viewH: number, cx: number, cy: number, fromZoom: number, toZoom: number, t: number, at: number, dur: number): Camera {
  const p = smooth(clamp01((t - at) / dur));
  const zoom = Math.exp(lerp(Math.log(safeZoom(fromZoom)), Math.log(safeZoom(toZoom)), p));
  // as we zoom in, drift the center from the frame center toward the focal point
  return { x: lerp(viewW / 2, cx, p), y: lerp(viewH / 2, cy, p), zoom, rot: 0 };
}

/**
 * Apply a camera to the current ctx transform (multiplies it). Used by non-layer scenes; the layer
 * compositor applies the device-space equivalent in `finish()`.
 */
export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number) {
  ctx.translate(viewW / 2, viewH / 2);
  ctx.rotate(cam.rot);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

/** True when a camera is effectively the neutral view (so the compositor can skip it). Uses an epsilon
 *  so a camera animated *back* to neutral (via log/lerp float error) still takes the skip path. */
export function isNeutral(cam: Camera, viewW: number, viewH: number): boolean {
  return Math.abs(cam.zoom - 1) < 1e-6 && Math.abs(cam.rot) < 1e-6 && Math.abs(cam.x - viewW / 2) < 0.5 && Math.abs(cam.y - viewH / 2) < 0.5;
}
