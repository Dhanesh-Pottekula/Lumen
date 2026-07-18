/**
 * particles — one configurable, DETERMINISTIC emitter for both effects (electrons/energy/sparks) and
 * ambience (smoke/rain/snow/dust/confetti). A particle's full state at time `t` is computed
 * analytically from its seed + birth time (position = origin + v·age + ½a·age² + sinusoidal wander),
 * never simulated step-by-step — so every frame is reproducible on scrub.
 */
import { clamp01, lerp, prng } from "../slides/anim";

export type ParticleShape = "dot" | "ring" | "square" | "triangle" | "streak" | "spark" | "star";

export type OriginShape =
  | { kind: "point"; x: number; y: number }
  | { kind: "line"; x: number; y: number; x2: number; y2: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "ring"; x: number; y: number; r: number };

type Range = [number, number] | number;
const lo = (r: Range) => (Array.isArray(r) ? r[0] : r);
const hi = (r: Range) => (Array.isArray(r) ? r[1] : r);
const pick = (r: Range, u: number) => lerp(lo(r), hi(r), u);

export interface EmitterConfig {
  count: number;
  seed: number;
  origin: OriginShape;
  t0?: number; // emission start time (default 0)
  rate?: number; // particles/sec for continuous emission; omit for a burst at t0
  loop?: boolean; // recycle particles (ambient)
  life: Range; // seconds
  angle?: number; // emit direction (radians; default -π/2 = up)
  spread?: number; // angular spread (radians; default π/3)
  speed: Range; // px/sec
  accel?: [number, number]; // gravity/buoyancy px/sec²
  wander?: { amp: number; freq: number }; // sinusoidal drift (turbulence look)
  size: Range; // start size; shrinks to `sizeEnd` over life if given
  sizeEnd?: number;
  color: string | [string, string]; // constant or start→end (hex)
  alpha?: { in?: number; out?: number; max?: number }; // fade fractions of life + peak
  spin?: Range; // rad/sec
  shape?: ParticleShape;
  blend?: GlobalCompositeOperation;
}

export interface Particle {
  x: number;
  y: number;
  age: number;
  p: number; // 0..1 through life
  size: number;
  color: string;
  alpha: number;
  angle: number; // current spin angle
}

function hexLerp(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const br = (pb >> 16) & 255;
  const bg = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return `rgb(${r},${g},${bl})`;
}

function sampleOrigin(o: OriginShape, u: number, v: number): [number, number] {
  switch (o.kind) {
    case "point":
      return [o.x, o.y];
    case "line":
      return [lerp(o.x, o.x2, u), lerp(o.y, o.y2, u)];
    case "rect":
      return [o.x + u * o.w, o.y + v * o.h];
    case "circle": {
      const ang = u * Math.PI * 2;
      const rr = Math.sqrt(v) * o.r;
      return [o.x + Math.cos(ang) * rr, o.y + Math.sin(ang) * rr];
    }
    case "ring": {
      const ang = u * Math.PI * 2;
      return [o.x + Math.cos(ang) * o.r, o.y + Math.sin(ang) * o.r];
    }
  }
}

/** Closed-form particle state at time `t`, or null if not alive. Pure & deterministic. */
export function particleAt(cfg: EmitterConfig, i: number, t: number): Particle | null {
  const base = cfg.seed * 100003 + i * 97 + 1;
  const rBase = prng(base);
  const t0 = cfg.t0 ?? 0;
  const life = pick(cfg.life, rBase()); // life is stable per particle across cycles
  const birth = cfg.rate ? t0 + i / cfg.rate : t0;
  const rawAge = t - birth;
  if (rawAge < 0) return null;
  if (!cfg.loop && rawAge > life) return null;
  // On loop, re-seed per cycle so each recycled particle gets a fresh trajectory (not a frozen replay);
  // spin uses rawAge so rotation is continuous across cycles instead of snapping back to 0.
  const cyc = cfg.loop ? Math.floor(rawAge / life) : 0;
  const age = cfg.loop ? rawAge - cyc * life : rawAge;
  const r = cfg.loop ? prng(base + cyc * 7919) : rBase;

  const [ox, oy] = sampleOrigin(cfg.origin, r(), r());
  const ang = (cfg.angle ?? -Math.PI / 2) + (r() - 0.5) * (cfg.spread ?? Math.PI / 3);
  const spd = pick(cfg.speed, r());
  const vx = Math.cos(ang) * spd;
  const vy = Math.sin(ang) * spd;
  const ax = cfg.accel?.[0] ?? 0;
  const ay = cfg.accel?.[1] ?? 0;
  let x = ox + vx * age + 0.5 * ax * age * age;
  let y = oy + vy * age + 0.5 * ay * age * age;
  if (cfg.wander) {
    const ph = r() * Math.PI * 2;
    x += Math.sin(age * cfg.wander.freq + ph) * cfg.wander.amp;
    y += Math.cos(age * cfg.wander.freq * 0.9 + ph) * cfg.wander.amp * 0.5;
  }

  const p = clamp01(age / life);
  const size = cfg.sizeEnd !== undefined ? lerp(pick(cfg.size, r()), cfg.sizeEnd, p) : pick(cfg.size, r());
  const color = Array.isArray(cfg.color) ? hexLerp(cfg.color[0], cfg.color[1], p) : cfg.color;
  const fin = cfg.alpha?.in ?? 0.1;
  const fout = cfg.alpha?.out ?? 0.3;
  const amax = cfg.alpha?.max ?? 1;
  let alpha = amax;
  if (p < fin) alpha = amax * (p / fin);
  else if (p > 1 - fout) alpha = amax * ((1 - p) / fout);
  const spin = pick(cfg.spin ?? 0, r());
  return { x, y, age, p, size, color, alpha, angle: spin * rawAge };
}

function drawShape(ctx: CanvasRenderingContext2D, s: ParticleShape, pt: Particle) {
  const { x, y, size } = pt;
  switch (s) {
    case "ring":
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 7);
      ctx.stroke();
      break;
    case "square":
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(pt.angle);
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.restore();
      break;
    case "triangle":
    case "star": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(pt.angle);
      ctx.beginPath();
      const pts = s === "star" ? 10 : 3;
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2 - Math.PI / 2;
        const rr = s === "star" && k % 2 ? size * 0.45 : size;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "streak":
      ctx.lineWidth = Math.max(1, size * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - size * 0.5, y + size * 3);
      ctx.stroke();
      break;
    case "spark":
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      ctx.stroke();
      break;
    default: // dot
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 7);
      ctx.fill();
  }
}

/** Draw all live particles of `cfg` at time `t`. */
export function emit(ctx: CanvasRenderingContext2D, cfg: EmitterConfig, t: number) {
  const shape = cfg.shape ?? "dot";
  ctx.save();
  if (cfg.blend) ctx.globalCompositeOperation = cfg.blend;
  for (let i = 0; i < cfg.count; i++) {
    const pt = particleAt(cfg, i, t);
    if (!pt || pt.alpha <= 0) continue;
    ctx.globalAlpha = clamp01(pt.alpha);
    ctx.fillStyle = pt.color;
    ctx.strokeStyle = pt.color;
    drawShape(ctx, shape, pt);
  }
  ctx.restore();
}

// ── Presets (factories → EmitterConfig) ─────────────────────────────────────────────────────────────

export const fireEmitter = (x: number, y: number, seed = 1): EmitterConfig => ({
  count: 60, seed, origin: { kind: "line", x: x - 16, y, x2: x + 16, y2: y }, rate: 40, loop: true,
  life: [0.6, 1.1], angle: -Math.PI / 2, spread: 0.5, speed: [40, 90], accel: [0, -30], wander: { amp: 6, freq: 8 },
  size: [7, 2], sizeEnd: 1, color: ["#ffd24a", "#e2452b"], alpha: { in: 0.1, out: 0.5, max: 0.85 }, shape: "dot", blend: "lighter",
});

export const smokeEmitter = (x: number, y: number, seed = 2): EmitterConfig => ({
  count: 40, seed, origin: { kind: "circle", x, y, r: 10 }, rate: 14, loop: true,
  life: [2, 3.5], angle: -Math.PI / 2, spread: 0.4, speed: [12, 26], accel: [0, -6], wander: { amp: 14, freq: 1.2 },
  size: 6, sizeEnd: 26, color: ["#8a94a0", "#3a4650"], alpha: { in: 0.2, out: 0.6, max: 0.4 }, shape: "dot",
});

export const sparksEmitter = (x: number, y: number, seed = 3): EmitterConfig => ({
  count: 50, seed, origin: { kind: "point", x, y }, rate: 30, loop: true,
  life: [0.4, 0.9], angle: -Math.PI / 2, spread: Math.PI * 2, speed: [80, 200], accel: [0, 260],
  size: [2, 0.5], sizeEnd: 0.5, color: ["#fff4c0", "#e8a13c"], alpha: { in: 0.05, out: 0.4, max: 1 }, shape: "streak", blend: "lighter",
});

export const rainEmitter = (viewW: number, viewH: number, seed = 4): EmitterConfig => ({
  count: 120, seed, origin: { kind: "rect", x: 0, y: -20, w: viewW, h: 10 }, rate: 120, loop: true,
  life: [1.4, 2], angle: Math.PI / 2 + 0.12, spread: 0.04, speed: [viewH * 0.7, viewH * 0.9], accel: [0, 40],
  size: [7, 7], color: "#7fb0d8", alpha: { in: 0.05, out: 0.2, max: 0.5 }, shape: "streak",
});

export const snowEmitter = (viewW: number, seed = 5): EmitterConfig => ({
  count: 90, seed, origin: { kind: "rect", x: 0, y: -20, w: viewW, h: 10 }, rate: 40, loop: true,
  life: [5, 8], angle: Math.PI / 2, spread: 0.2, speed: [30, 60], accel: [0, 4], wander: { amp: 26, freq: 0.8 },
  size: [2, 4], color: "#ffffff", alpha: { in: 0.1, out: 0.2, max: 0.8 }, shape: "dot",
});

export const dustEmitter = (x: number, y: number, seed = 6): EmitterConfig => ({
  count: 40, seed, origin: { kind: "circle", x, y, r: 40 }, rate: 12, loop: true,
  life: [3, 6], angle: -Math.PI / 2, spread: Math.PI, speed: [4, 14], accel: [0, -2], wander: { amp: 18, freq: 0.6 },
  size: [1, 2.5], color: "#c8b98a", alpha: { in: 0.3, out: 0.4, max: 0.28 }, shape: "dot", blend: "lighter",
});

export const confettiEmitter = (x: number, y: number, seed = 7): EmitterConfig => ({
  count: 70, seed, origin: { kind: "point", x, y }, t0: 0, life: [1.6, 2.6],
  angle: -Math.PI / 2, spread: Math.PI * 0.8, speed: [180, 340], accel: [0, 320], spin: [-8, 8],
  size: [4, 7], color: ["#5cc8ae", "#e8a13c"], alpha: { in: 0.02, out: 0.25, max: 1 }, shape: "square",
});

export const energyEmitter = (x: number, y: number, seed = 8): EmitterConfig => ({
  count: 40, seed, origin: { kind: "point", x, y }, rate: 26, loop: true,
  life: [0.7, 1.2], angle: -Math.PI / 2, spread: Math.PI * 2, speed: [30, 70], wander: { amp: 8, freq: 5 },
  size: [3, 1], sizeEnd: 0.5, color: ["#8fe8ff", "#5cc8ae"], alpha: { in: 0.1, out: 0.4, max: 0.9 }, shape: "dot", blend: "lighter",
});
