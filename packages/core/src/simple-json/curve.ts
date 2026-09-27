import { parseExpr } from "../gcl/expr";
import { VIEW_HEIGHT, VIEW_INSET, VIEW_WIDTH } from "../gcl/viewport";

export type Sample = [number, number];

const SAMPLES = 96;

/**
 * Evaluate a curve's equations over its domain into view-space points about `centre`, one equation
 * unit being `scale` view units. The equations are written y-up as in mathematics; the view is y-down.
 */
export function sampleCurve(
  source: { x: string; y: string; domain?: [number, number] },
  centre: Sample,
  scale: number,
): Sample[] | undefined {
  const evalX = parseExpr(source.x);
  const evalY = parseExpr(source.y);
  if (!evalX.valid || !evalY.valid) return undefined;

  const [u0, u1] = source.domain ?? [0, 1];
  const points = Array.from({ length: SAMPLES + 1 }, (_value, index) => {
    const u = u0 + ((u1 - u0) * index) / SAMPLES;
    return [centre[0] + evalX.evaluate({ u }) * scale, centre[1] - evalY.evaluate({ u }) * scale] as Sample;
  }).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  return points.length >= 2 ? points : undefined;
}

/**
 * The largest unit no bigger than `unit` at which every sample of the curve stays inside the safe
 * frame. A path drawn about a point with the rider's reach as its unit is only as big as that reach
 * allows — a spiral of five turns or a wave five reaches long would otherwise run off the screen and
 * carry the rider with it.
 */
export function fitUnit(
  source: { x: string; y: string; domain?: [number, number] },
  centre: Sample,
  unit: number,
): number {
  const samples = sampleCurve(source, centre, unit);
  if (!samples) return unit;
  const [minX, maxX, minY, maxY] = [VIEW_INSET, VIEW_WIDTH - VIEW_INSET, VIEW_INSET, VIEW_HEIGHT - VIEW_INSET];
  let scale = 1;
  for (const [x, y] of samples) {
    if (x > maxX) scale = Math.min(scale, (maxX - centre[0]) / (x - centre[0]));
    if (x < minX) scale = Math.min(scale, (centre[0] - minX) / (centre[0] - x));
    if (y > maxY) scale = Math.min(scale, (maxY - centre[1]) / (y - centre[1]));
    if (y < minY) scale = Math.min(scale, (centre[1] - minY) / (centre[1] - y));
  }
  return unit * Math.max(0.05, Math.min(1, scale));
}

/** The index of the sample nearest a point. */
export function nearestSample(path: Sample[], point: Sample): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  path.forEach((sample, index) => {
    const distance = Math.hypot(sample[0] - point[0], sample[1] - point[1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
