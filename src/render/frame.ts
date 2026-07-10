/**
 * FrameCtx — shared per-frame state threaded into scene render(). Owns a lazily-created stack of
 * offscreen layer canvases (bg→fx) that composite onto the target context in order, each with an
 * optional parallax offset, blur, and alpha. Deterministic: nothing here reads a clock.
 *
 * A scene either ignores `frame` (draws straight to the given ctx — legacy) OR routes its drawing
 * through `frame.layer.ctx(name)`. The caller (player/composer) calls `finish()` after render to
 * composite any layers that were used; when none were used, `finish()` is a no-op.
 */
import { type Theme, TEXTBOOK } from "./theme";

export type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";
export const LAYER_ORDER: readonly LayerName[] = ["bg", "mid", "fg", "annotation", "fx"];

export interface LayerOptions {
  offsetX?: number; // view-space parallax offset
  offsetY?: number;
  blur?: number; // device-px gaussian blur applied at composite time
  alpha?: number;
  scale?: number; // uniform zoom about the layer's center (default 1)
  rotate?: number; // rotation in radians about the layer's center (default 0)
  blend?: GlobalCompositeOperation; // composite mode, e.g. "lighter" (glow), "multiply" (shadow)
  filter?: string; // extra CSS filter, e.g. "saturate(0.6) brightness(1.1)"; combined with blur
}

export interface LayerApi {
  /** The drawing context for a layer — lazily created, transform-matched to the target, cleared this frame. */
  ctx(name: LayerName): CanvasRenderingContext2D;
  /** Set composite options (parallax offset, blur, alpha) for a layer. */
  set(name: LayerName, opts: LayerOptions): void;
}

export interface FrameCtx {
  t: number;
  viewW: number;
  viewH: number;
  layer: LayerApi;
  theme: Theme;
}

interface LayerEntry {
  canvas: HTMLCanvasElement;
  opts: LayerOptions;
}

export function createFrame(
  target: CanvasRenderingContext2D,
  t: number,
  viewW: number,
  viewH: number,
  theme: Theme = TEXTBOOK,
): FrameCtx & { finish(): void } {
  const layers = new Map<LayerName, LayerEntry>();
  const w = target.canvas.width;
  const h = target.canvas.height;
  const xform = target.getTransform();

  function ensure(name: LayerName): LayerEntry {
    let e = layers.get(name);
    if (!e) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d") as CanvasRenderingContext2D;
      c.setTransform(xform); // match the target's view transform so scene coords map 1:1
      e = { canvas, opts: {} };
      layers.set(name, e);
    }
    return e;
  }

  const layer: LayerApi = {
    ctx: (name) => ensure(name).canvas.getContext("2d") as CanvasRenderingContext2D,
    set: (name, opts) => {
      const e = ensure(name);
      e.opts = { ...e.opts, ...opts };
    },
  };

  function finish() {
    for (const name of LAYER_ORDER) {
      const e = layers.get(name);
      if (!e) continue;
      const { offsetX = 0, offsetY = 0, blur = 0, alpha = 1, scale = 1, rotate = 0, blend, filter } = e.opts;
      target.save();
      // Composite in device pixels: reset the transform, then build our own from the options.
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalAlpha *= alpha;
      if (blend) target.globalCompositeOperation = blend;
      const filters = [blur > 0 ? `blur(${blur}px)` : "", filter ?? ""].filter(Boolean).join(" ");
      if (filters) target.filter = filters;
      // Scale/rotate about the layer's center, then apply the parallax offset (view units → device px).
      if (scale !== 1 || rotate !== 0 || offsetX !== 0 || offsetY !== 0) {
        target.translate(w / 2 + offsetX * xform.a, h / 2 + offsetY * xform.d);
        target.rotate(rotate);
        target.scale(scale, scale);
        target.translate(-w / 2, -h / 2);
      }
      target.drawImage(e.canvas, 0, 0);
      target.restore();
    }
  }

  return { t, viewW, viewH, layer, theme, finish };
}
