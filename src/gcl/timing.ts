// src/gcl/timing.ts
import type { Component, ExitSpec } from "./schema";

export interface Timed { at: number; dur: number }

/**
 * Resolve each component's start time & entrance duration. Priority for `at`:
 *   explicit numeric `start` → `cue` (via cueTimes) → `start:"with"/"after"` → sequential gap.
 */
export function resolveTiming(
  components: Component[],
  opts: { gap?: number; defaultDur?: number; cueTimes?: number[] },
): Timed[] {
  const gap = opts.gap ?? 1.2;
  const defaultDur = opts.defaultDur ?? 0.6;
  const out: Timed[] = [];
  let cursor = 0;
  components.forEach((c, i) => {
    const dur = c.dur ?? defaultDur;
    let at: number;
    if (typeof c.start === "number") at = c.start;
    else if (c.cue !== undefined && opts.cueTimes && opts.cueTimes[c.cue] !== undefined) at = opts.cueTimes[c.cue];
    else if (c.start === "with" && i > 0) at = out[i - 1].at;
    else if (c.start === "after" && i > 0) at = out[i - 1].at + out[i - 1].dur;
    else at = cursor;
    out.push({ at, dur });
    // Advance the sequential cursor past every placed component (explicit or default),
    // so a later default-placed item never lands before an earlier explicit-start one.
    cursor = Math.max(cursor, at + gap);
  });
  return out;
}

/**
 * Estimate each narration sentence's START time (seconds), cumulative, from a simple
 * words-per-second reading-speed model. Pure — no wall-clock, no TTS lookup (that wiring is a
 * later phase); `compileScene` uses this to build `cueTimes`.
 */
export function narrationTiming(narration: string[], opts: { wps?: number; min?: number; lead?: number } = {}): number[] {
  const wps = opts.wps ?? 2.6;
  const min = opts.min ?? 1.6;
  const lead = opts.lead ?? 0;
  const starts: number[] = [];
  let cursor = lead;
  for (const sentence of narration) {
    starts.push(cursor);
    const words = sentence.trim().length === 0 ? 0 : sentence.trim().split(/\s+/).length;
    const dur = Math.max(min, words / wps);
    cursor += dur;
  }
  return starts;
}

/**
 * Resolve a component's exit window from its `ExitSpec` and the scene's total duration.
 * `null` means "no exit — stays on screen". `out` is clamped to >= 0 so a short scene never
 * asks for a negative start time.
 */
export function resolveExit(exit: ExitSpec | undefined, sceneDuration: number): { out: number; dur: number } | null {
  if (!exit) return null;
  const dur = exit.dur ?? 0.6;
  const out = exit.out ?? (exit.until != null ? exit.until - dur : sceneDuration - dur);
  return { out: Math.max(0, out), dur };
}
