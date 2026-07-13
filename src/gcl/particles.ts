// src/gcl/particles.ts
/** Resolve a `{type:"particles"}` preset name + resolved anchor/view size/seed into an `EmitterConfig`
 *  the pure `emit`/`particleAt` machinery in ../render/particles can draw. Pure — no ctx, no clock. */
import {
  confettiEmitter,
  dustEmitter,
  energyEmitter,
  fireEmitter,
  rainEmitter,
  smokeEmitter,
  snowEmitter,
  sparksEmitter,
  type EmitterConfig,
} from "../render/particles";

/** rain/snow are full-viewport ambience — they take `(viewW, viewH, seed)`, NOT a point. Every other
 *  preset is emitted from a resolved point `(x, y)`. Unknown/undefined preset names default to
 *  `sparksEmitter`. */
export function resolveEmitter(
  preset: string | undefined,
  x: number,
  y: number,
  viewW: number,
  viewH: number,
  seed: number,
): EmitterConfig {
  switch (preset) {
    case "rain":
      return rainEmitter(viewW, viewH, seed);
    case "snow":
      return snowEmitter(viewW, viewH, seed);
    case "fire":
      return fireEmitter(x, y, seed);
    case "smoke":
      return smokeEmitter(x, y, seed);
    case "dust":
      return dustEmitter(x, y, seed);
    case "confetti":
      return confettiEmitter(x, y, seed);
    case "energy":
      return energyEmitter(x, y, seed);
    case "sparks":
    default:
      return sparksEmitter(x, y, seed);
  }
}
