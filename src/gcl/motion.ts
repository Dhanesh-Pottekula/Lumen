// src/gcl/motion.ts
/**
 * Per-component object motion (Family B) — move/fall/orbit/along/spin/trace/morph — plus idle
 * oscillation (breathe/wobble/pulse). `motionTransform` is a pure function of `t`: it never mutates
 * or remembers state across frames, so re-seeking a scene reproduces the exact same transform.
 *
 * `box` is the component's resting placement (from layout); the returned `{dx,dy,rot,scale}` is an
 * OFFSET/multiplier applied around the box's own center by the caller (compile.ts), wrapping
 * `applyEnterExit` — motion is the outer transform, enter/exit paints inside it.
 */
import { breathe, clamp01, easeInOutCubic, pulse, wobble } from "../slides/anim";
import { makePath } from "../slides/anim";
import type { Box } from "./anchors";
import type { MotionSpec, OscillateSpec, Position } from "./schema";

export interface MotionTransform {
  dx: number;
  dy: number;
  rot: number;
  scale: number;
  trail?: [number, number][];
}

const IDENTITY: MotionTransform = { dx: 0, dy: 0, rot: 0, scale: 1 };

function boxCenter(box: Box): [number, number] {
  return [box.x + box.w / 2, box.y + box.h / 2];
}

/** LINEAR progress in [0,1] over a window — used for constant-rate motions (orbit angle, along-path
 *  arc-length, trace) and as the raw input to easings like `move`'s `easeInOutCubic` (an eased phase
 *  fed through another curve would double-apply the ease). Exported for reuse (e.g. compile.ts's
 *  shape-morph phase). */
export function linearPhase(t: number, at: number, dur: number): number {
  return dur > 0 ? clamp01((t - at) / dur) : t >= at ? 1 : 0;
}

/** Resolve a `Position` to a view-space point via the caller-bound `resolveFocal`, defaulting to the
 *  box's own center when unset (so `move`/`fall` without an explicit `from` starts at rest). */
function resolvePos(pos: Position | undefined, fallback: [number, number], resolveFocal: (pos: unknown) => [number, number]): [number, number] {
  if (pos === undefined) return fallback;
  return resolveFocal(pos);
}

/** Pure per-component motion transform at time `t`. `box` = the component's resting placement;
 *  `resolveFocal` maps a `Position` (slot/coord/id) to a view point, bound by the caller to the
 *  scene's layout boxes. */
export function motionTransform(
  spec: MotionSpec | undefined,
  box: Box,
  t: number,
  resolveFocal: (pos: unknown) => [number, number],
): MotionTransform {
  if (!spec) return IDENTITY;
  const [bcx, bcy] = boxCenter(box);
  const at = spec.at ?? 0;

  switch (spec.kind) {
    case "move": {
      const dur = spec.dur ?? 1;
      const p = easeInOutCubic(linearPhase(t, at, dur));
      const from = resolvePos(spec.from, [bcx, bcy], resolveFocal);
      const to = resolveFocal(spec.to);
      const x = from[0] + (to[0] - from[0]) * p;
      const y = from[1] + (to[1] - from[1]) * p;
      return { dx: x - bcx, dy: y - bcy, rot: 0, scale: 1 };
    }
    case "fall": {
      const dur = spec.dur ?? 1;
      const g = spec.gravity ?? 900;
      const from = resolvePos(spec.from, [bcx, bcy], resolveFocal);
      const to = resolvePos(spec.to, [bcx, bcy], resolveFocal);
      const tau = Math.max(0, Math.min(t, at + dur) - at);
      const durTau = Math.max(1e-6, dur);
      // Parabolic fall: y = y0 + 0.5*g*tau^2, clamped to the [from,to] span at tau=dur (matches `to`).
      const rawY = 0.5 * g * tau * tau;
      const maxRawY = 0.5 * g * durTau * durTau;
      const yP = maxRawY > 0 ? clamp01(rawY / maxRawY) : 0;
      const x = from[0] + (to[0] - from[0]) * clamp01(tau / durTau);
      let y = from[1] + (to[1] - from[1]) * yP;
      if (spec.bounce && t > at + dur) {
        // A simple decaying bounce after landing: amplitude shrinks each half-period.
        const bt = t - (at + dur);
        const bouncePeriod = 0.4;
        const decay = Math.exp(-3 * bt);
        y -= Math.abs(Math.sin((bt / bouncePeriod) * Math.PI)) * (spec.bounce as number) * decay;
      }
      return { dx: x - bcx, dy: y - bcy, rot: 0, scale: 1 };
    }
    case "orbit": {
      const dur = spec.dur ?? 4;
      const center = resolveFocal(spec.center);
      const rx = spec.rx ?? spec.radius ?? 80;
      const ry = spec.ry ?? spec.radius ?? 80;
      const from = spec.from ?? 0;
      const turns = spec.turns ?? 1;
      const tau = t - at;
      const p = spec.dur !== undefined ? linearPhase(t, at, dur) : undefined;
      const angle = p !== undefined ? from + turns * Math.PI * 2 * p : from + turns * Math.PI * 2 * (tau / dur);
      const x = center[0] + Math.cos(angle) * rx;
      const y = center[1] + Math.sin(angle) * ry;
      return { dx: x - bcx, dy: y - bcy, rot: 0, scale: 1 };
    }
    case "along": {
      if (spec.path.length < 2) return IDENTITY; // makePath needs >=2 points to define a path
      const dur = spec.dur ?? 2;
      const path = makePath(spec.path);
      const prog = spec.loop ? (dur > 0 ? ((t - at) / dur) % 1 : 0) : linearPhase(t, at, dur);
      const p = Math.max(0, prog);
      const pt = path.at(p * path.length);
      return { dx: pt.x - bcx, dy: pt.y - bcy, rot: 0, scale: 1 };
    }
    case "spin": {
      const omega = spec.omega ?? Math.PI * 2;
      const tau = spec.dur !== undefined ? Math.max(0, Math.min(t, at + spec.dur) - at) : Math.max(0, t - at);
      return { dx: 0, dy: 0, rot: omega * tau, scale: 1 };
    }
    case "trace": {
      if (spec.path.length < 2) return IDENTITY; // makePath needs >=2 points; no trail either
      const dur = spec.dur ?? 2;
      const path = makePath(spec.path);
      const p = linearPhase(t, at, dur);
      const pt = path.at(p * path.length);
      // Sample the trail 0..p along the path on a fixed grid, so re-seeking reproduces it exactly.
      const samples = 40;
      const upto = Math.max(1, Math.round(p * samples));
      const trail: [number, number][] = [];
      for (let i = 0; i <= upto; i++) {
        const sp = Math.min(p, i / samples);
        const sPt = path.at(sp * path.length);
        trail.push([sPt.x, sPt.y]);
      }
      return { dx: pt.x - bcx, dy: pt.y - bcy, rot: 0, scale: 1, trail };
    }
    case "morph":
      // Content-level: handled by the shape painter (drawMorph), not a placement transform.
      return IDENTITY;
    default: {
      const _exhaustive: never = spec;
      return _exhaustive;
    }
  }
}

/** Idle continuous oscillation — additive to the motion offset. Pure function of `t`. */
export function oscillateOffset(osc: OscillateSpec | undefined, t: number): { dx: number; dy: number; rot: number; scale: number } {
  if (!osc) return { dx: 0, dy: 0, rot: 0, scale: 0 };
  const axis = osc.axis ?? "y";
  const mode = osc.mode ?? "wobble";
  let value: number;
  if (mode === "breathe") value = breathe(t, osc.period, osc.amp) - 1; // additive: mean 0
  else if (mode === "pulse") value = pulse(t, osc.period) * osc.amp; // 0..amp..0
  else value = wobble(t, osc.period, osc.amp); // signed, mean 0

  const out = { dx: 0, dy: 0, rot: 0, scale: 0 };
  if (axis === "x") out.dx = value;
  else if (axis === "y") out.dy = value;
  else if (axis === "rot") out.rot = value;
  else out.scale = value;
  return out;
}
