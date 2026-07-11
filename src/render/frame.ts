/**
 * FrameCtx — shared per-frame state threaded into scene render(). Owns a lazily-created stack of
 * offscreen layer canvases (bg→fx) that composite onto the target context in order, each with an
 * optional parallax offset, blur, and alpha. Deterministic: nothing here reads a clock.
 *
 * A scene either ignores `frame` (draws straight to the given ctx — legacy) OR routes its drawing
 * through `frame.layer.ctx(name)`. The caller (player/composer) calls `finish()` after render to
 * composite any layers that were used; when none were used, `finish()` is a no-op.
 */
import { type Camera, isNeutral } from "./camera";
import { prng } from "./motion";
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
  camera?: Camera,
): FrameCtx & { finish(): void } {
  const layers = new Map<LayerName, LayerEntry>();
  const w = target.canvas.width;
  const h = target.canvas.height;
  const xform = target.getTransform();
  let camState: Camera | undefined = camera;
  let activeCam: Camera | undefined; // resolved at finish() time

  function ensure(name: LayerName): LayerEntry {
    let e = layers.get(name);
    if (!e) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d") as CanvasRenderingContext2D;
      c.setTransform(xform); // match the target's view transform so scene coords map 1:1
      // Seed the layer's composite options from the theme's per-role FX defaults, so any scene that
      // simply routes drawing to a layer inherits its cinematic treatment (bloom/shadow) for free.
      e = { canvas, opts: { ...(theme.fx.layers?.[name] ?? {}) } };
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
    clear: (name) => {
      ensure(name).opts = {};
    },
  };

  // Apply the layer's center-scale/rotate + parallax offset to `target`'s current (identity) transform.
  function applyGeometry(offsetX: number, offsetY: number, scale: number, rotate: number) {
    if (scale === 1 && rotate === 0 && offsetX === 0 && offsetY === 0) return;
    target.translate(w / 2 + offsetX * xform.a, h / 2 + offsetY * xform.d);
    target.rotate(rotate);
    target.scale(scale, scale);
    target.translate(-w / 2, -h / 2);
  }

  // Apply the frame camera in device space (zoom/rotate about frame center, pan to cam.x/cam.y).
  function applyCamera(c: Camera) {
    target.translate(w / 2, h / 2);
    target.rotate(c.rot);
    target.scale(c.zoom, c.zoom);
    target.translate(-c.x * xform.a, -c.y * xform.d);
  }

  function finish() {
    if (w <= 0 || h <= 0) return; // target canvas not laid out — nothing to composite (avoids 0-size drawImage)
    // Uniform device-pixel scale of the view transform — used to keep blur/shadow sizes in view units.
    const dpr = xform.a || 1;
    activeCam = camState && !isNeutral(camState, viewW, viewH) ? camState : undefined;
    for (const name of LAYER_ORDER) {
      const e = layers.get(name);
      if (!e) continue;
      const { offsetX = 0, offsetY = 0, blur = 0, alpha = 1, scale = 1, rotate = 0, blend, filter, glow, shadow, screenspace } = e.opts;
      const withCam = activeCam && !screenspace;

      // Primary pass: the layer itself, with optional blur/filter, blend, and a native drop shadow.
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0); // composite in device pixels
      target.globalAlpha *= alpha;
      if (blend) target.globalCompositeOperation = blend;
      const filters = [blur > 0 ? `blur(${blur}px)` : "", filter ?? ""].filter(Boolean).join(" ");
      if (filters) target.filter = filters;
      if (shadow) {
        target.shadowBlur = shadow.blur * dpr;
        target.shadowColor = shadow.color;
        target.shadowOffsetX = (shadow.dx ?? 0) * dpr;
        target.shadowOffsetY = (shadow.dy ?? 0) * dpr;
      }
      if (withCam) applyCamera(activeCam!);
      applyGeometry(offsetX, offsetY, scale, rotate);
      target.drawImage(e.canvas, 0, 0);
      target.restore();

      // Bloom pass: a blurred, additive ("lighter") copy of the same layer laid over the primary.
      if (glow && glow.strength > 0) {
        target.save();
        target.setTransform(1, 0, 0, 1, 0, 0);
        target.globalAlpha *= alpha * glow.strength;
        target.globalCompositeOperation = "lighter";
        target.filter = `blur(${glow.blur * dpr}px)`;
        if (withCam) applyCamera(activeCam!);
        applyGeometry(offsetX, offsetY, scale, rotate);
        target.drawImage(e.canvas, 0, 0);
        target.restore();
      }
    }
  }

  function grade(opts: { vignette?: number; grain?: number } = {}) {
    layer.set("fx", { screenspace: true }); // the filmic pass is screen-fixed — never pans/zooms with a camera
    const fx = layer.ctx("fx"); // drawn in view units (fx transform matches the target)
    const vig = opts.vignette ?? 0.3;
    const grain = opts.grain ?? 0.04;
    fx.save();
    // vignette — darken the corners
    const v = fx.createRadialGradient(
      viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.32,
      viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.62,
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${vig})`);
    fx.fillStyle = v;
    fx.fillRect(0, 0, viewW, viewH);
    // subtle top-down grade for tonal cohesion
    const g = fx.createLinearGradient(0, 0, 0, viewH);
    g.addColorStop(0, "rgba(90,120,150,0.05)");
    g.addColorStop(1, "rgba(20,30,25,0.10)");
    fx.fillStyle = g;
    fx.fillRect(0, 0, viewW, viewH);
    // animated grain — deterministic per ~12 fps tick so scrubbing stays exact
    const rnd = prng(Math.floor(t * 12) + 1);
    fx.globalAlpha = grain;
    fx.fillStyle = "#ffffff";
    for (let i = 0; i < 90; i++) fx.fillRect(rnd() * viewW, rnd() * viewH, 1.2, 1.2);
    fx.restore();
  }

  const setCamera = (c: Camera | undefined) => {
    camState = c;
  };

  return { t, viewW, viewH, layer, theme, grade, setCamera, finish };
}
