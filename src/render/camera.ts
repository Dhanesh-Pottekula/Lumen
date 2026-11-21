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

/** Smoothly move from camera `from` to `to` over [at, at+dur]. Returns the camera at time t. */
export function move(from: Camera, to: Camera, t: number, at: number, dur: number): Camera {
  return lerpCamera(from, to, smooth(clamp01((t - at) / dur)));
}

/** True when a camera is effectively the neutral view (so the compositor can skip it). Uses an epsilon
 *  so a camera animated *back* to neutral (via log/lerp float error) still takes the skip path. */
export function isNeutral(cam: Camera, viewW: number, viewH: number): boolean {
  return Math.abs(cam.zoom - 1) < 1e-6 && Math.abs(cam.rot) < 1e-6 && Math.abs(cam.x - viewW / 2) < 0.5 && Math.abs(cam.y - viewH / 2) < 0.5;
}
