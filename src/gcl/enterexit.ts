// src/gcl/enterexit.ts
/**
 * Orchestrates a component's entrance and (optional) exit around its finished-content draw.
 * Three mechanisms, chosen by `enter.type`/`exit.type`:
 *   - NATIVE   — the content animates itself from its own progress (slam/word/typewriter/scramble/
 *                draw/build/borderThenFill). `applyEnterExit` calls `opts.native(c, enterP)` instead
 *                of `paintContent`, so the primitive is threaded the live progress and never doubles
 *                up with a mask.
 *   - MASKED   — wrap the FINISHED content (`paintContent`, p=1) in `reveal.ts`'s `masked()`, gated by
 *                a pure per-component mask from `mask.ts` (wipe/iris/radialWipe/blinds/checkerboard/
 *                dissolve/clip). Forward progress for enter, inverted region for exit.
 *   - TRANSFORM — slide (translate) / shrink (scale) / fade (alpha), applied around paintContent.
 * All of it is a pure function of `t` (via `EEContext`), so re-seeking is exact.
 */
import { clamp01, phase, withAlpha } from "../slides/anim";
import { masked } from "../render/reveal";
import type { Box } from "./anchors";
import { paintMask, type MaskKind } from "./mask";
import type { EnterKind, EnterSpec, ExitSpec } from "./schema";

export interface EEContext {
  t: number;
  at: number;
  enterDur: number;
  exit: { out: number; dur: number } | null;
  exitSpec?: ExitSpec; // original spec, for exit.dir (slide/wipe) — timing itself comes from `exit`
  box: Box;
  W: number;
  H: number;
}

const MASK_KINDS: EnterKind[] = ["wipe", "iris", "radialWipe", "blinds", "checkerboard", "dissolve", "clip"];
const NATIVE_KINDS: EnterKind[] = ["slam", "word", "typewriter", "scramble", "draw", "build", "borderThenFill", "none"];

/** True when this enter kind animates the content itself (compile.ts threads `enterP` into the
 *  primitive's own draw call) rather than being wrapped by a mask/fade here. */
export function isNativeEnter(kind: EnterKind | undefined): boolean {
  return kind === undefined ? false : NATIVE_KINDS.includes(kind);
}

function isMaskKind(kind: EnterKind | undefined): kind is MaskKind {
  return kind !== undefined && (MASK_KINDS as string[]).includes(kind);
}

/** Slide offset in view units for a full-strength exit in `dir` (offscreen by box size + a margin). */
function slideOffset(box: Box, W: number, H: number, dir: "left" | "right" | "up" | "down" | undefined): [number, number] {
  const margin = 40;
  switch (dir) {
    case "up": return [0, -(box.y + box.h + margin)];
    case "down": return [0, H - box.y + margin];
    case "right": return [W - box.x + margin, 0];
    default: return [-(box.x + box.w + margin), 0]; // left (default)
  }
}

/**
 * Compose a component's entrance and exit around its content draw.
 * `paintContent` draws the finished (p=1) content in absolute coords.
 * `opts.native`, when the enter kind is native, receives the live canvas + `enterP` instead.
 */
export function applyEnterExit(
  layer: CanvasRenderingContext2D,
  enter: EnterSpec | undefined,
  ctx: EEContext,
  paintContent: (c: CanvasRenderingContext2D) => void,
  opts: {
    native?: (c: CanvasRenderingContext2D, enterP: number) => void;
    /** Native exit for stroke/path content: un-draws the content directly (e.g. `erase`) rather than
     *  fading it. Only consulted when `exit.type === "erase"`. */
    nativeExit?: (c: CanvasRenderingContext2D, exitP: number) => void;
  } = {},
): void {
  const { t, at, enterDur, exit, exitSpec, box, W, H } = ctx;
  const enterKind: EnterKind = enter?.type ?? "fade";
  // Guard dur<=0: an author-set enterDur of 0 must resolve to progress 1, not NaN from a 0/0 divide.
  const enterP = enterDur > 0 ? clamp01(phase(t, at, at + enterDur)) : 1;
  const exitActive = exit != null && t >= exit.out - 0.001;
  const exitP = exit ? (exit.dur > 0 ? clamp01(phase(t, exit.out, exit.out + exit.dur)) : 1) : 0;
  const exitKind = exitSpec?.type ?? "fade";
  const exitDir = exitSpec?.dir;

  // Native entrances animate the content itself; the exit (if any) still layers on top afterward.
  if (isNativeEnter(enterKind)) {
    if (opts.native) {
      if (exitActive && exit) {
        if (exitKind === "erase" && opts.nativeExit) {
          opts.nativeExit(layer, exitP);
        } else {
          applyExitTreatment(layer, exitKind, exitDir, exitP, box, W, H, (c) => opts.native!(c, 1));
        }
      } else {
        opts.native(layer, enterP);
      }
    }
    return;
  }

  // Masked / fade entrances draw the FINISHED content (p=1) under an animated reveal.
  if (exitActive && exit) {
    if (exitKind === "erase" && opts.nativeExit) {
      opts.nativeExit(layer, exitP);
      return;
    }
    applyExitTreatment(layer, exitKind, exitDir, exitP, box, W, H, paintContent);
    return;
  }

  if (enterKind === "fade" || enterKind === "none") {
    const alpha = enterKind === "none" ? 1 : enterP;
    withAlpha(layer, alpha, () => paintContent(layer));
    return;
  }

  if (isMaskKind(enterKind)) {
    masked(layer, W, H, (c) => paintContent(c), (c) => paintMask(c, enterKind, box, enterP, enter));
    return;
  }

  // Fallback for any future/unhandled kind: plain fade-in.
  withAlpha(layer, enterP, () => paintContent(layer));
}

/** Apply an exit treatment at `exitP` (0 = fully shown, 1 = fully gone) around `paint`. */
function applyExitTreatment(
  layer: CanvasRenderingContext2D,
  kind: ExitSpec["type"],
  dir: "left" | "right" | "up" | "down" | undefined,
  exitP: number,
  box: Box,
  W: number,
  H: number,
  paint: (c: CanvasRenderingContext2D) => void,
) {
  switch (kind) {
    case "fade":
    case "erase": // general fallback for non-stroke content; stroke content is handled natively in compile.ts
    case "none":
      withAlpha(layer, 1 - exitP, () => paint(layer));
      return;
    case "wipe":
    case "iris":
    case "dissolve": {
      // Conceal by shrinking the revealed region as exitP rises (region at 1-exitP).
      masked(layer, W, H, (c) => paint(c), (c) => paintMask(c, kind, box, 1 - exitP, { dir }));
      return;
    }
    case "slide": {
      const [dx, dy] = slideOffset(box, W, H, dir);
      layer.save();
      layer.translate(dx * exitP, dy * exitP);
      paint(layer);
      layer.restore();
      return;
    }
    case "shrink": {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const scale = Math.max(0, 1 - exitP);
      layer.save();
      layer.translate(cx, cy);
      layer.scale(scale, scale);
      layer.translate(-cx, -cy);
      withAlpha(layer, 1 - exitP * 0.5, () => paint(layer)); // slight fade alongside the shrink reads cleaner than a hard pop at scale 0
      layer.restore();
      return;
    }
    default: {
      withAlpha(layer, 1 - exitP, () => paint(layer));
      return;
    }
  }
}
