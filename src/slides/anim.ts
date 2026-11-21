/**
 * Shared deterministic-animation helpers — the *drawing* side (canvas-aware).
 *
 * The pure motion math (easings, oscillators, staging, prng) lives in `../render/motion` and is
 * re-exported here, so existing `import { phase, lerp, prng } from "./anim"` keeps working unchanged.
 * Import new primitives (`spring`, `breathe`, `pulse`, `wobble`, `stagger`) from either module.
 */

export {
  clamp01,
  lerp,
  cycle,
  smooth,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  spring,
  phase,
  stagger,
  breathe,
  pulse,
  wobble,
  prng,
} from "../render/motion";
