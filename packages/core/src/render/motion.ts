/**
 * motion — the pure, composable motion-math library.
 *
 * Everything here is a deterministic function of a number (progress `p` in [0,1]) or of time `t`
 * (seconds) — no clocks, no state, no `Math.random()`. These are the primitives every higher-level
 * step (draw-on strokes, reveals, kinetic type, particles, camera) builds on, so they all live in
 * one place and compose freely: `lerp(a, b, spring(phase(t, 2, 4)))`.
 *
 * anim.ts re-exports all of these, so `import { phase } from "../slides/anim"` keeps working.
 */

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** Fractional part — loops a value into [0, 1). Use for repeating cycles driven by t. */
export const cycle = (v: number): number => v - Math.floor(v);

// ── Easings: shape a 0→1 progress. All clamp their input. ────────────────────────────────────────

/** Smoothstep — gentle acceleration and deceleration. The default "nice" curve. */
export const smooth = (p: number): number => {
  p = clamp01(p);
  return p * p * (3 - 2 * p);
};

export const easeOutCubic = (p: number): number => {
  p = clamp01(p);
  return 1 - (1 - p) ** 3;
};

/** Symmetric ease-in-out (cubic). */
export const easeInOutCubic = (p: number): number => {
  p = clamp01(p);
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
};

/** Ease-out with a slight overshoot past 1 then settle — lively "pop" reveals. */
export const easeOutBack = (p: number): number => {
  p = clamp01(p);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** Springy 0→1: fast rise, gentle damped settle toward 1. Clamped, no drift past the bounds. */
export const spring = (p: number): number => {
  p = clamp01(p);
  return 1 - Math.exp(-6 * p) * Math.cos(4 * p);
};

// ── Staging: turn wall-clock `t` into staged progress. ───────────────────────────────────────────

/** Eased 0→1 progress of `t` through the window [a, b]. The workhorse for staging reveals. */
export const phase = (t: number, a: number, b: number): number => smooth((t - a) / (b - a));

/**
 * Staggered reveal: progress for item `i` when items enter one after another. Item `i` runs its
 * window [start + i·step, start + i·step + dur]; returns that item's eased 0→1. Powers cascades
 * (list items, letters, bars) without hand-authoring each window.
 */
export const stagger = (
  t: number,
  i: number,
  opts: { start?: number; step: number; dur: number },
): number => {
  const start = (opts.start ?? 0) + i * opts.step;
  return phase(t, start, start + opts.dur);
};

// ── Oscillators: continuous, deterministic motion for idle life and repetition. ──────────────────

/** Gentle oscillation around 1 (mean), amplitude `amount`, given period in seconds. For idle "breath". */
export const breathe = (t: number, period: number, amount: number): number =>
  1 + Math.sin((t / period) * Math.PI * 2) * amount;

/** 0→1→0 triangle-ish pulse via cosine, `period` seconds. For blinking/beating/attention. */
export const pulse = (t: number, period: number): number =>
  (1 - Math.cos((t / period) * Math.PI * 2)) / 2;

/** Signed oscillation around 0 (mean), amplitude `amount`, `period` seconds. For sway/jitter/nudge. */
export const wobble = (t: number, period: number, amount: number): number =>
  Math.sin((t / period) * Math.PI * 2) * amount;

// ── Deterministic pseudo-randomness. ─────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32) — deterministic "randomness" for personalities, layouts, and grain. */
export function prng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
