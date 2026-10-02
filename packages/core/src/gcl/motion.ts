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

/**
 * Locomotion gait — a rhythmic bounce + rock overlaid on a `move`/`along` translation so a character
 * visibly RUNS or WALKS instead of gliding. The number of strides scales with the travel distance (so the
 * stride length stays natural at any speed), and the bounce uses integer strides so it lands flat exactly
 * at arrival (p=1). Pure function of progress `p` in [0,1]. Returns an extra vertical offset + a rock angle.
 */
function gaitOffset(gait: "walk" | "run" | "hop" | undefined, p: number, distance: number): { dy: number; rot: number } {
  if (!gait || distance < 1) return { dy: 0, rot: 0 };
  const stride = gait === "run" ? 60 : gait === "hop" ? 76 : 46; // view units advanced per stride
  const amp = gait === "run" ? 13 : gait === "hop" ? 24 : 5; // hop height
  const rockAmp = gait === "walk" ? 0.11 : gait === "hop" ? 0.05 : 0.06; // body rock/lean, radians
  const strides = Math.max(2, Math.round(distance / stride));
  const hop = Math.abs(Math.sin(p * Math.PI * strides)); // 0→1→0 each stride; 0 at p=1 (integer strides)
  const rock = Math.sin(p * Math.PI * strides); // one rock per stride, settles to 0 at arrival
  return { dy: -amp * hop, rot: rockAmp * rock };
}

/** LINEAR progress in [0,1] over a window — used for constant-rate motions (orbit angle, along-path
 *  arc-length, trace) and as the raw input to easings like `move`'s `easeInOutCubic` (an eased phase
 *  fed through another curve would double-apply the ease). Exported for reuse (e.g. compile.ts's
 *  shape-morph phase). */
export function linearPhase(t: number, at: number, dur: number): number {
  return dur > 0 ? clamp01((t - at) / dur) : t >= at ? 1 : 0;
}

/** Seconds a repeating motion may run: it then stops on the pose it passes once a cycle (WCAG 2.2.2). */
export const LOOP_LIMIT = 5;

/** One cycle of a motion that repeats until the scene ends, or undefined for one that finishes. */
function cycleOf(spec: MotionSpec): number | undefined {
  if (spec.kind === "along") return spec.repeat === "loop" ? (spec.dur ?? 2) : spec.repeat === "there-and-back" ? 2 * (spec.dur ?? 2) : undefined;
  if (spec.kind === "orbit") return spec.dur === undefined ? 4 / Math.max(1e-6, Math.abs(spec.turns ?? 1)) : undefined;
  if (spec.kind !== "spin") return undefined;
  if (spec.sweep === undefined) return spec.dur === undefined ? (Math.PI * 2) / Math.max(1e-6, Math.abs(spec.omega ?? Math.PI * 2)) : undefined;
  return spec.repeat === "there-and-back" || spec.repeat === "loop" ? (spec.dur ?? 1) : undefined;
}

/** When a repeating motion stops: after the last whole cycle inside the loop limit and before `until`,
 *  so it rests where it began. */
export function settledAt(from: number, cycle: number, until = Number.POSITIVE_INFINITY): number {
  const limit = Math.min(LOOP_LIMIT, until - from);
  return from + (cycle <= limit ? Math.floor(limit / cycle) * cycle : limit);
}

/** The time a motion is played at: `t`, or the moment a repeating one stopped, at the latest `until`. */
function playedAt(spec: MotionSpec, t: number, until?: number): number {
  const cycle = cycleOf(spec);
  return cycle === undefined ? t : Math.min(t, settledAt(spec.at ?? 0, cycle, until));
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
  resolveCentre: (pos: unknown) => [number, number] = resolveFocal,
): MotionTransform {
  if (!spec) return IDENTITY;
  const [bcx, bcy] = boxCenter(box);
  const at = spec.at ?? 0;

  // A scheduled motion must not alter the resting layout before its beat.
  // In particular, orbit/along compute absolute path positions, so without
  // this guard they could move an object even while an earlier beat is shown.
  if (t < at) return IDENTITY;
  t = playedAt(spec, t);

  switch (spec.kind) {
    case "move": {
      const dur = spec.dur ?? 1;
      const p = easeInOutCubic(linearPhase(t, at, dur));
      const from = resolvePos(spec.from, [bcx, bcy], resolveFocal);
      const to = resolveFocal(spec.to);
      const x = from[0] + (to[0] - from[0]) * p;
      const y = from[1] + (to[1] - from[1]) * p;
      const gait = gaitOffset(spec.gait, p, Math.hypot(to[0] - from[0], to[1] - from[1]));
      return { dx: x - bcx, dy: y - bcy + gait.dy, rot: gait.rot, scale: 1 };
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
      const center = resolveCentre(spec.center);
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
      // One leg of the path takes `dur`, and the traveller enters the path at `startAt` — where it
      // already rests — so the first frame moves nothing. Played once it runs to the end and stops;
      // looped it starts over; there-and-back it is a cosine, p = ½ − ½·cos(π·legs), which is the
      // timing of anything that swings: fastest through the middle, still at each end, forever.
      const legs = dur > 0 ? (t - at) / dur : 0;
      const start = Math.min(1, Math.max(0, spec.startAt ?? 0));
      const prog =
        spec.repeat === "loop"
          ? (legs + start) % 1
          : spec.repeat === "there-and-back"
            ? 0.5 - 0.5 * Math.cos(Math.PI * (legs + Math.acos(1 - 2 * start) / Math.PI))
            : start + (1 - start) * linearPhase(t, at, dur);
      const p = Math.max(0, Math.min(1, prog));
      const pt = path.at(p * path.length);
      const gait = spec.repeat ? { dy: 0, rot: 0 } : gaitOffset(spec.gait, p, path.length);
      const heading = spec.face ? pt.angle - path.at(start * path.length).angle : 0;
      return { dx: pt.x - bcx, dy: pt.y - bcy + gait.dy, rot: gait.rot + heading, scale: 1 };
    }
    case "spin": {
      const omega = spec.omega ?? Math.PI * 2;
      const rot = spinAngle(spec, omega, t, at);
      if (spec.center === undefined) return { dx: 0, dy: 0, rot, scale: 1 };
      // Turning about another point carries the thing's own centre around that point.
      const [px, py] = resolveFocal(spec.center);
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const nx = px + (bcx - px) * cos - (bcy - py) * sin;
      const ny = py + (bcx - px) * sin + (bcy - py) * cos;
      return { dx: nx - bcx, dy: ny - bcy, rot, scale: 1 };
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
    case "aside": {
      const p = easeInOutCubic(linearPhase(t, at, spec.dur ?? 1));
      const scale = 1 + (spec.scale - 1) * p;
      const [px, py] = spec.pivot ?? [0, 0];
      // The picture's centre travels to `to` while everything drawn of it shrinks about that centre.
      const [ox, oy] = [bcx + px, bcy + py];
      const [cx, cy] = [ox + (spec.to[0] - ox) * p, oy + (spec.to[1] - oy) * p];
      return { dx: cx - bcx - scale * px, dy: cy - bcy - scale * py, rot: 0, scale };
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

/** The angle a spin has turned by `t`: a bounded `sweep` swings or opens over `dur`, an unbounded spin
 *  turns at `omega` (held once its `dur` is up). */
function spinAngle(spec: Extract<MotionSpec, { kind: "spin" }>, omega: number, t: number, at: number): number {
  const dur = spec.dur ?? 1;
  if (spec.sweep === undefined) {
    const tau = spec.dur !== undefined ? Math.max(0, Math.min(t, at + spec.dur) - at) : Math.max(0, t - at);
    return omega * tau;
  }
  const legs = dur > 0 ? Math.max(0, t - at) / dur : 1;
  const sign = Math.sign(omega) || 1;
  // A swing rests in the middle and reaches half the sweep to either side, one full swing per `dur`.
  if (spec.repeat === "there-and-back") return sign * (spec.sweep / 2) * Math.sin(Math.PI * 2 * legs);
  if (spec.repeat === "loop") return sign * spec.sweep * (legs % 1);
  return sign * spec.sweep * easeInOutCubic(clamp01(legs));
}

/** When a journey has delivered the thing and holds it there, or undefined for one that never ends. */
function journeyEnd(spec: MotionSpec): number | undefined {
  const at = spec.at ?? 0;
  switch (spec.kind) {
    case "move":
    case "fall":
    case "morph":
    case "aside":
      return at + (spec.dur ?? 1);
    case "trace":
      return at + (spec.dur ?? 2);
    case "along":
    case "orbit": {
      const cycle = cycleOf(spec);
      if (cycle !== undefined) return settledAt(at, cycle);
      return spec.kind === "along" ? at + (spec.dur ?? 2) : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * The transform of a component carrying several motions at once.
 *
 * Spins turn the thing whatever else it is doing — the Moon turns on its axis while it orbits. The
 * journeys (everything else) run one after another: a finished journey banks where it left the thing,
 * and the next one starts from there — the bee flies to the flower, then flies home along a route —
 * so a later `move` or lead-in never snaps back to the resting layout first.
 */
export function motionsTransform(
  specs: MotionSpec[] | undefined,
  box: Box,
  t: number,
  resolveFocal: (pos: unknown) => [number, number],
  resolveCentre: (pos: unknown) => [number, number] = resolveFocal,
): MotionTransform {
  if (!specs || specs.length === 0) return IDENTITY;
  const out: MotionTransform = { dx: 0, dy: 0, rot: 0, scale: 1 };
  const carried: [number, number] = [0, 0];
  let carriedScale = 1;
  let travelling = false;
  const journeys = specs.filter((spec) => spec.kind !== "spin").sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  for (const spec of journeys) {
    if (travelling) break;
    const shifted = { ...box, x: box.x + carried[0], y: box.y + carried[1] };
    const live: MotionSpec =
      spec.kind === "along" && spec.leadIn && (carried[0] !== 0 || carried[1] !== 0)
        ? { ...spec, path: [[spec.path[0][0] + carried[0], spec.path[0][1] + carried[1]], ...spec.path.slice(1)] }
        : spec;
    const end = journeyEnd(spec);
    if (end !== undefined && t >= end) {
      const done = motionTransform(live, shifted, end, resolveFocal, resolveCentre);
      carried[0] += done.dx;
      carried[1] += done.dy;
      carriedScale *= done.scale;
      continue;
    }
    const m = motionTransform(live, shifted, t, resolveFocal, resolveCentre);
    out.dx += m.dx;
    out.dy += m.dy;
    out.rot += m.rot;
    out.scale *= m.scale;
    if (m.trail) out.trail = m.trail;
    travelling = true;
  }
  out.dx += carried[0];
  out.dy += carried[1];
  out.scale *= carriedScale;
  // Spins about one point compose by ANGLE: two swings about a pivot are one swing through their
  // summed angle, never two displacements added — those agree only while there is a single spin.
  const turned = new Map<string, number>();
  const spins = specs.filter((spec): spec is Extract<MotionSpec, { kind: "spin" }> => spec.kind === "spin");
  for (const spec of spins) {
    const key = spec.center === undefined ? "" : JSON.stringify(spec.center);
    // A later spin takes the thing over: a repeating one comes to rest before it, or the two angles would add.
    const handover = Math.min(...spins.map((other) => other.at ?? 0).filter((at) => at > (spec.at ?? 0)));
    turned.set(key, (turned.get(key) ?? 0) + spinAngle(spec, spec.omega ?? Math.PI * 2, playedAt(spec, t, handover), spec.at ?? 0));
  }
  const [bcx, bcy] = boxCenter(box);
  for (const [key, rot] of turned) {
    out.rot += rot;
    if (key === "") continue;
    const [px, py] = resolveFocal(JSON.parse(key) as unknown);
    out.dx += px + (bcx - px) * Math.cos(rot) - (bcy - py) * Math.sin(rot) - bcx;
    out.dy += py + (bcx - px) * Math.sin(rot) + (bcy - py) * Math.cos(rot) - bcy;
  }
  return out;
}

/** How much a thing that stepped aside has faded back by `t`: 1 until it steps aside, then down to its `mute`. */
export function mutedAt(specs: MotionSpec[] | undefined, t: number): number {
  const aside = specs?.find((spec): spec is Extract<MotionSpec, { kind: "aside" }> => spec.kind === "aside");
  if (!aside || t < (aside.at ?? 0)) return 1;
  return 1 - (1 - aside.mute) * easeInOutCubic(linearPhase(t, aside.at ?? 0, aside.dur ?? 1));
}

/** Idle continuous oscillation — additive to the motion offset. Pure function of `t`; it settles
 *  on its rest phase once it has run the loop limit from `from`, when the thing appeared. */
export function oscillateOffset(osc: OscillateSpec | undefined, t: number, from = 0): { dx: number; dy: number; rot: number; scale: number } {
  if (!osc) return { dx: 0, dy: 0, rot: 0, scale: 0 };
  // The waves are phased from time zero, so the rest pose recurs at whole periods of the clock itself.
  const rest = Math.floor((from + LOOP_LIMIT) / osc.period) * osc.period;
  t = Math.min(t, rest >= from ? rest : from + LOOP_LIMIT);
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
