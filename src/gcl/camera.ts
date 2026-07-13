// src/gcl/camera.ts
/**
 * Scene-level camera resolver. A scene's `{type:"camera"}` directives (already timed + anchor-resolved
 * to focal points by compile.ts) collapse into one pure `cameraAt(t)`, applied once per render via
 * `frame.setCamera`. Latest-started directive wins; neutral outside any window. Pure function of t —
 * no clocks, no mutable cross-frame state — so re-seeking is exact.
 */
import { centerCamera, focusOn, isNeutral, move, pushIn, type Camera } from "../render/camera";

export interface CamDirective {
  at: number;
  dur: number;
  focal: [number, number];
  zoom: number;
  rot: number;
  kind: "move" | "pushIn";
}

/**
 * Keep the camera from ever revealing empty space beyond the content box. The scene only draws across
 * [0,viewW]×[0,viewH], so any pan at zoom≤1 (or a zoom-out) shifts that content and exposes black
 * bands/seams at the edges. This clamp guarantees the visible viewport stays inside the content:
 *   - zoom is floored at 1 (a zoom-out can't be covered by finite content);
 *   - the focal point is clamped so the half-viewport (viewW/2/zoom) never crosses an edge.
 * At zoom 1 this pins the focal to the exact center (no pan possible without exposing an edge — which
 * is correct); higher zoom allows proportionally more pan. Pure. Rotation edge-exposure is not fully
 * corrected (rare in lessons), but the x/y clamp covers all axis-aligned pans/zooms.
 */
export function clampCamera(cam: Camera, viewW: number, viewH: number): Camera {
  const zoom = Math.max(1, cam.zoom);
  const halfW = viewW / 2 / zoom;
  const halfH = viewH / 2 / zoom;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : v < lo ? lo : v > hi ? hi : v);
  return {
    x: clamp(cam.x, halfW, viewW - halfW),
    y: clamp(cam.y, halfH, viewH - halfH),
    zoom,
    rot: cam.rot,
  };
}

/** Resolve the camera at time `t` from a list of (already-timed) camera directives. */
export function cameraAt(directives: CamDirective[], t: number, viewW: number, viewH: number): Camera {
  const neutral = centerCamera(viewW, viewH);
  if (directives.length === 0) return neutral;

  // Directives in start order; only those that have started (at <= t) are relevant.
  const sorted = [...directives].sort((a, b) => a.at - b.at);
  const started = sorted.filter((d) => d.at <= t);
  if (started.length === 0) return neutral;

  // The "current target" after directive i is focusOn(focal, zoom, rot). The previous target is
  // neutral before the first directive, else the target of the directive before it.
  const active = started[started.length - 1];
  const activeIdx = sorted.indexOf(active);
  const prevTarget = activeIdx === 0 ? neutral : focusOn(sorted[activeIdx - 1].focal[0], sorted[activeIdx - 1].focal[1], sorted[activeIdx - 1].zoom, sorted[activeIdx - 1].rot);
  const thisTarget = focusOn(active.focal[0], active.focal[1], active.zoom, active.rot);

  // `move`/`pushIn` both divide by `dur` internally with no guard, so a directive with dur<=0 would
  // divide by zero (NaN) right at t===at. Treat a non-positive dur as instantaneous: snap straight to
  // the target camera for any t>=at (already guaranteed here since `active` has started).
  if (active.dur <= 0) return isNeutral(thisTarget, viewW, viewH) ? neutral : clampCamera(thisTarget, viewW, viewH);

  // `move`/`pushIn` both clamp internally (via clamp01), so once t passes the window's end they
  // simply hold at `thisTarget` — no separate "hold" branch needed.
  const cam: Camera =
    active.kind === "pushIn"
      ? pushIn(viewW, viewH, active.focal[0], active.focal[1], prevTarget.zoom, active.zoom, t, active.at, active.dur)
      : move(prevTarget, thisTarget, t, active.at, active.dur);

  return isNeutral(cam, viewW, viewH) ? neutral : clampCamera(cam, viewW, viewH);
}
