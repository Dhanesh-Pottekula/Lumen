/**
 * sequence — the engagement grammar: pedagogical timing as pure functions of `t`.
 *
 *   progressive disclosure → stepProgress, buildSteps, stepState, revealList
 *   predict-and-reveal      → predictReveal
 *   emphasis choreography   → emphasis, beat, punchScale, shakeOffset, flashAlpha (+ draw wrappers)
 *   orchestration           → sequencer (ordered beats → per-beat progress / active index)
 *
 * Everything is deterministic and seekable — envelopes read 0 away from their moment, so they are safe
 * to call every frame. The visual effects (scale/shake/flash) are applied by the scene from these values.
 */
import { clamp01, easeOutCubic, smooth } from "../slides/anim";

// ── Progressive disclosure / build steps ──────────────────────────────────────────────────────────

/** Eased 0→1 for one build step starting at `at` over `dur`. */
export const stepProgress = (t: number, at: number, dur: number): number => easeOutCubic(clamp01((t - at) / dur));

/** Per-item eased progress for `count` items entering in a staggered cascade. */
export function buildSteps(t: number, count: number, opts: { start?: number; step: number; dur?: number }): number[] {
  const start = opts.start ?? 0;
  const dur = opts.dur ?? 0.6;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(stepProgress(t, start + i * opts.step, dur));
  return out;
}

export interface StepItem {
  p: number; // entrance progress 0..1
  focus: number; // 1 current, dim (0.45) past, 0 future — for "current bright, prior dimmed" lists
  active: boolean;
}

/**
 * Build-list state: which item is "current" and how each should be weighted. Great for worked examples
 * where the current line is bright, completed lines dim, and upcoming lines are hidden.
 */
export function stepState(t: number, count: number, opts: { start?: number; step: number; dur?: number; dimPast?: number }) {
  const start = opts.start ?? 0;
  const dur = opts.dur ?? 0.5;
  const dimPast = opts.dimPast ?? 0.45;
  let index = -1;
  for (let i = 0; i < count; i++) if (t >= start + i * opts.step) index = i;
  return {
    index,
    item(i: number): StepItem {
      const p = stepProgress(t, start + i * opts.step, dur);
      const active = i === index;
      return { p, active, focus: active ? 1 : i < index ? dimPast : 0 };
    },
  };
}

/**
 * Render a vertical list of items with a staggered entrance (fade + slide up) and past-item dimming.
 * `draw(ctx, item, alpha)` draws item `i`'s content at its row.
 */
export function revealList(
  ctx: CanvasRenderingContext2D,
  items: unknown[],
  t: number,
  opts: { start?: number; step: number; dur?: number; x: number; y: number; rowH: number; dimPast?: number; slide?: number },
  draw: (ctx: CanvasRenderingContext2D, item: unknown, i: number, x: number, y: number, alpha: number) => void,
) {
  const st = stepState(t, items.length, opts);
  const slide = opts.slide ?? 10;
  items.forEach((item, i) => {
    const s = st.item(i);
    if (s.p <= 0) return;
    // weight = full while entering, then settle to current(1) / past(dim) as later items arrive
    const weight = s.active ? 1 : Math.max(s.focus, 0.0001);
    const alpha = s.p * weight;
    const y = opts.y + i * opts.rowH + (1 - s.p) * slide;
    ctx.save();
    ctx.globalAlpha *= clamp01(alpha);
    draw(ctx, item, i, opts.x, y, clamp01(alpha));
    ctx.restore();
  });
}

// ── Predict and reveal ────────────────────────────────────────────────────────────────────────────

/** A pose→pause→reveal beat: the question shows, a thinking gap, then the answer lands. */
export function predictReveal(t: number, opts: { poseAt?: number; revealAt: number; dur?: number }) {
  const poseAt = opts.poseAt ?? 0;
  const dur = opts.dur ?? 0.6;
  return {
    question: stepProgress(t, poseAt, dur),
    thinking: clamp01((t - poseAt) / Math.max(0.01, opts.revealAt - poseAt)),
    answer: stepProgress(t, opts.revealAt, dur),
    revealed: t >= opts.revealAt,
  };
}

// ── Emphasis choreography (pure envelopes) ────────────────────────────────────────────────────────

/** 0→1→0 parabolic bump centered at `at`, `width` seconds half-life. Safe everywhere (0 outside). */
export function emphasis(t: number, at: number, width = 0.6): number {
  const d = (t - at) / width;
  return Math.max(0, 1 - d * d);
}

/** A general ADSR-ish envelope: rises into `at` over `attack`, holds, then releases. */
export function beat(t: number, at: number, opts: { attack?: number; hold?: number; release?: number } = {}): number {
  const attack = opts.attack ?? 0.15;
  const hold = opts.hold ?? 0.1;
  const release = opts.release ?? 0.5;
  const dt = t - at;
  if (dt < -attack) return 0;
  if (dt < 0) return smooth((dt + attack) / attack);
  if (dt < hold) return 1;
  if (dt < hold + release) return 1 - smooth((dt - hold) / release);
  return 0;
}

/** Scale multiplier for a "punch" pop at `at`. */
export const punchScale = (t: number, at: number, amp = 0.2, width = 0.4): number => 1 + amp * emphasis(t, at, width);

/** Decaying shake offset around `at`. Deterministic pseudo-jitter from t. */
export function shakeOffset(t: number, at: number, mag: number, opts: { dur?: number; freq?: number } = {}): [number, number] {
  const dur = opts.dur ?? 0.5;
  const freq = opts.freq ?? 90;
  const k = Math.max(0, 1 - Math.abs(t - at) / dur);
  if (k <= 0) return [0, 0];
  return [Math.sin(t * freq) * mag * k, Math.cos(t * freq * 1.22) * mag * k];
}

/** Quick 0→1→0 flash within `dur` of `at`. */
export const flashAlpha = (t: number, at: number, dur = 0.25): number => Math.max(0, 1 - Math.abs(t - at) / dur);

// draw wrappers -------------------------------------------------------------------------------------

/** Run `draw` with a punch scale about (cx,cy) at `at`. */
export function withPunch(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, at: number, draw: (c: CanvasRenderingContext2D) => void, opts: { amp?: number; width?: number } = {}) {
  const s = punchScale(t, at, opts.amp ?? 0.2, opts.width ?? 0.4);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  draw(ctx);
  ctx.restore();
}

/** Run `draw` shaken around `at`. */
export function withShake(ctx: CanvasRenderingContext2D, t: number, at: number, draw: (c: CanvasRenderingContext2D) => void, opts: { mag?: number; dur?: number; freq?: number } = {}) {
  const [dx, dy] = shakeOffset(t, at, opts.mag ?? 6, opts);
  ctx.save();
  ctx.translate(dx, dy);
  draw(ctx);
  ctx.restore();
}

/** A full-view color flash at `at` (draw on the fx layer). */
export function flashOverlay(ctx: CanvasRenderingContext2D, t: number, at: number, w: number, h: number, opts: { color?: string; dur?: number } = {}) {
  const a = flashAlpha(t, at, opts.dur ?? 0.25);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.fillStyle = opts.color ?? "rgba(255,255,255,0.6)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── Orchestration ─────────────────────────────────────────────────────────────────────────────────

export interface Beat {
  at: number;
  dur?: number;
}

/** Turn an ordered list of beats into per-beat progress and the current active index. */
export function sequencer(beats: Beat[]) {
  return {
    progress: (t: number): number[] => beats.map((b) => stepProgress(t, b.at, b.dur ?? 0.6)),
    activeIndex: (t: number): number => {
      let idx = -1;
      beats.forEach((b, i) => {
        if (t >= b.at) idx = i;
      });
      return idx;
    },
  };
}
