/**
 * Film timing data derived from Cartesia word timestamps, and the pure helper that
 * remaps a scene's authored local time onto its real spoken span.
 *
 * The generator (aira-api) produces a FilmTimings JSON per film: one audio file plus,
 * for every scene and caption, the real start/end times measured from the narration.
 * The composer consumes it to place scene windows and to keep each authored animation
 * beat aligned to the sentence that narrates it.
 */

export interface FilmSceneTiming {
  index: number;
  start: number;
  end: number;
}

export interface FilmCaptionTiming {
  scene: number;
  at: number;
  text: string;
}

export interface FilmTimings {
  film: string;
  /** Public URL of the narration audio (served from /public). */
  audio: string;
  /** Total film length in seconds (the audio clock's end). */
  duration: number;
  /** False for the authored-time bootstrap, true once real Cartesia audio was generated. */
  generated: boolean;
  scenes: FilmSceneTiming[];
  captions: FilmCaptionTiming[];
}

/**
 * Build a monotonic piecewise-linear map from a scene's real spoken time to its authored
 * local time, so each authored beat lands on the sentence that narrates it.
 *
 * Knots are the scene endpoints plus every caption boundary: real times
 * `[realStart, ...realCaps, realEnd]` map to authored times `[0, ...authoredCaps, authoredDuration]`.
 * The returned function takes GLOBAL film time `t`, clamps it to `[realStart, realEnd]`, and
 * returns the authored local time to pass the scene's `render`.
 *
 * Falls back to a plain linear stretch when the caption arrays are empty or mismatched
 * (e.g. alignment noise), so it always returns a sane value.
 */
export function remapSceneTime(
  authoredCaps: number[],
  realCaps: number[],
  authoredDuration: number,
  realStart: number,
  realEnd: number,
): (t: number) => number {
  const span = realEnd - realStart;
  const linear = (t: number): number => {
    if (span <= 0) return 0;
    const p = (Math.max(realStart, Math.min(t, realEnd)) - realStart) / span;
    return p * authoredDuration;
  };

  if (authoredCaps.length === 0 || authoredCaps.length !== realCaps.length) return linear;

  const realKnots = [realStart, ...realCaps, realEnd];
  const authoredKnots = [0, ...authoredCaps, authoredDuration];
  // Guard against non-increasing real knots (alignment can emit equal/inverted times):
  // nudge each knot just past its predecessor so segments have positive width.
  for (let i = 1; i < realKnots.length; i++) {
    if (realKnots[i] <= realKnots[i - 1]) realKnots[i] = realKnots[i - 1] + 1e-4;
  }

  return (t: number): number => {
    const x = Math.max(realStart, Math.min(t, realEnd));
    let i = 1;
    while (i < realKnots.length - 1 && realKnots[i] < x) i++;
    const r0 = realKnots[i - 1];
    const r1 = realKnots[i];
    const a0 = authoredKnots[i - 1];
    const a1 = authoredKnots[i];
    const p = r1 === r0 ? 0 : (x - r0) / (r1 - r0);
    return a0 + (a1 - a0) * p;
  };
}
