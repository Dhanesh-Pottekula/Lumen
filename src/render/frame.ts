/**
 * FrameCtx — shared per-frame state threaded into scene render(). Owns a lazily-created stack of
 * offscreen layer canvases (bg→fx) that composite onto the target context in order, each with an
 * optional parallax offset, blur, and alpha. Deterministic: nothing here reads a clock.
 *
 * A scene either ignores `frame` (draws straight to the given ctx — legacy) OR routes its drawing
 * through `frame.layer.ctx(name)`. The caller (player/composer) calls `finish()` after render to
 * composite any layers that were used; when none were used, `finish()` is a no-op.
 */
import type { Camera } from "./camera";
import type { Theme } from "./theme";

export type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";

export interface LayerOptions {
  offsetX?: number; // view-space parallax offset
  offsetY?: number;
  blur?: number; // device-px gaussian blur applied at composite time
  alpha?: number;
  scale?: number; // uniform zoom about the layer's center (default 1)
  rotate?: number; // rotation in radians about the layer's center (default 0)
  blend?: GlobalCompositeOperation; // composite mode, e.g. "lighter" (glow), "multiply" (shadow)
  filter?: string; // extra CSS filter, e.g. "saturate(0.6) brightness(1.1)"; combined with blur
  /** Cinematic bloom: after drawing the layer, a blurred "lighter" copy is added over it. Self-colored. */
  glow?: { strength: number; blur: number }; // blur in view units (scaled by dpr at composite)
  /** Native drop shadow cast by the layer's drawn shapes. Offsets/blur in view units (dpr-scaled). */
  shadow?: { blur: number; color: string; dx?: number; dy?: number };
  /** Skip the frame camera for this layer — keep it fixed in screen space (fixed UI/titles). */
  screenspace?: boolean;
}

export interface LayerApi {
  /** The drawing context for a layer — lazily created, transform-matched to the target, cleared this frame. */
  ctx(name: LayerName): CanvasRenderingContext2D;
  /** Merge composite options (parallax offset, blur, alpha, glow, shadow) into a layer. */
  set(name: LayerName, opts: LayerOptions): void;
  /** Reset a layer's composite options to none — the escape hatch to opt out of theme-seeded FX
   *  (e.g. a scene that wants a crisp foreground with no inherited bloom). */
  clear(name: LayerName): void;
}

export interface FrameCtx {
  t: number;
  viewW: number;
  viewH: number;
  layer: LayerApi;
  theme: Theme;
  /** Paint the filmic pass (vignette + grade + deterministic grain) onto the fx layer. Seekable. */
  grade(opts?: { vignette?: number; grain?: number }): void;
  /** Set the frame camera (pan/zoom/rotate) — applied to all non-screenspace layers at composite. */
  setCamera(cam: Camera | undefined): void;
}
