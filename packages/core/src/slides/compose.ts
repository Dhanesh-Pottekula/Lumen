/**
 * composeSlides — stitch standalone scenes into one film on a single timeline.
 *
 * Consecutive scenes overlap by `crossfade` seconds; each scene renders at its
 * own local time inside a fade-in × fade-out alpha envelope. The result is a
 * plain CanvasSlideDefinition, so the composed film stays a pure function of t
 * and seeks exactly like any slide.
 *
 * Scene windows come from each scene's `duration`; a scene's local time is `t - start`.
 *
 * Compositing contract: scenes may self-clear (`clearRect`) and set `globalAlpha`
 * absolutely — real scenes do both, which would otherwise defeat the fade envelope.
 * During a crossfade the composer isolates each active scene in a shared offscreen
 * buffer and composites that buffer onto the main canvas under the envelope alpha,
 * so the scene's own clearing/alpha calls only ever affect the buffer.
 */
import { createFrame } from "../render/frame";
import { type Theme, TEXTBOOK } from "../render/theme";
import { clamp01, lerp, phase, withAlpha } from "./anim";
import type { CanvasSlideDefinition, CaptionSegment } from "./types";

export type TransitionKind = "crossfade" | "zoom-through" | "whip-pan";

export interface ComposeOptions {
  /** Seconds of overlap between consecutive scenes. Default 2.5. */
  crossfade?: number;
  /** Draw one progress dot per scene along the bottom (films of 2+ scenes). Default true. */
  progressDots?: boolean;
  /** Apply a filmic overlay (vignette + grain + grade) to the final frame. Default false. */
  filmGrade?: boolean;
  /** Art-direction theme passed to each scene's FrameCtx. Default TEXTBOOK. */
  theme?: Theme;
  /** Scene-to-scene transition. Default "crossfade" (existing behavior). */
  transition?: TransitionKind;
}

/**
 * Extra transform for a scene buffer during its crossfade, beyond the alpha envelope. `fadeIn` (0→1 at
 * scene start) and `fadeOut` (1→0 at scene end) drive an entrance/exit scale (zoom-through) or slide
 * (whip-pan). Pure. Returns a scale about center and an x offset in canvas px.
 */
function transitionParams(kind: TransitionKind, fadeIn: number, fadeOut: number, canvasW: number): { scale: number; dx: number } {
  if (kind === "zoom-through") {
    let scale = 1;
    if (fadeIn < 1) scale *= lerp(1.14, 1, fadeIn); // enters slightly large, settles
    if (fadeOut < 1) scale *= lerp(1.5, 1, fadeOut); // grows as it leaves
    return { scale, dx: 0 };
  }
  if (kind === "whip-pan") {
    let dx = 0;
    if (fadeIn < 1) dx += canvasW * 0.55 * (1 - fadeIn); // enters from the right
    if (fadeOut < 1) dx += -canvasW * 0.55 * (1 - fadeOut); // exits to the left
    return { scale: 1, dx };
  }
  return { scale: 1, dx: 0 };
}

/** The filmic pass (vignette + grade + grain) now lives on the fx layer via `frame.grade()`, applied
 *  once to the whole composited film below. A single film-level frame carries it, theme-driven. */
function applyFilmGrade(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, t: number, theme: Theme) {
  const film = createFrame(ctx, t, viewW, viewH, theme);
  film.grade({ vignette: theme.fx.vignette, grain: theme.fx.grain });
  film.finish();
}

interface SceneWindow {
  scene: CanvasSlideDefinition;
  /** Fade-in start. */
  start: number;
  /** Fade-out end. */
  end: number;
  /** Scene end, used for progress-dot state. */
  dotEnd: number;
}

export function composeSlides(
  scenes: CanvasSlideDefinition[],
  options: ComposeOptions = {},
): CanvasSlideDefinition {
  if (scenes.length === 0) throw new Error("composeSlides needs at least one scene");

  const { viewW, viewH } = scenes[0];
  scenes.forEach((s, i) => {
    if (s.viewW !== viewW || s.viewH !== viewH) {
      throw new Error(
        `composeSlides: scene ${i} view space ${s.viewW}×${s.viewH} differs from scene 0 (${viewW}×${viewH})`,
      );
    }
  });

  const progressDots = options.progressDots ?? true;
  const filmGrade = options.filmGrade ?? false;
  const theme = options.theme ?? TEXTBOOK;
  const transition = options.transition ?? "crossfade";

  let crossfade = Math.max(0, options.crossfade ?? 2.5);
  const shortest = Math.min(...scenes.map((s) => s.duration));
  if (scenes.length > 1 && crossfade > shortest / 2) {
    const clamped = shortest / 2;
    console.warn(
      `composeSlides: crossfade ${crossfade.toFixed(3)}s clamped to ${clamped.toFixed(3)}s (half the shortest scene)`,
    );
    crossfade = clamped;
  }

  const windows: SceneWindow[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    windows.push({ scene, start: cursor, end: cursor + scene.duration, dotEnd: cursor + scene.duration });
    cursor += scene.duration - crossfade;
  }
  const duration = cursor + crossfade;
  const captions: CaptionSegment[] = windows
    .flatMap(({ scene, start }, i) => {
      const cutoff = i + 1 < windows.length ? windows[i + 1].start : Infinity;
      return (scene.captions ?? [])
        .map((c) => ({ at: c.at + start, text: c.text }))
        .filter((c) => c.at < cutoff);
    })
    .sort((a, b) => a.at - b.at);

  // Lazily-created shared offscreen scratch buffer, resized to match the main
  // canvas's device-pixel size on demand. Created on first buffered render.
  let buffer: HTMLCanvasElement | { width: number; height: number; getContext: (id: "2d") => unknown } | null = null;

  /** True when the environment/context support the offscreen-buffer compositing path. */
  function canBuffer(ctx: CanvasRenderingContext2D): boolean {
    return (
      typeof document !== "undefined" &&
      !!ctx.canvas &&
      typeof ctx.drawImage === "function" &&
      typeof ctx.getTransform === "function"
    );
  }

  return {
    duration,
    viewW,
    viewH,
    captions: captions.length > 0 ? captions : undefined,
    render(ctx, t) {
      ctx.clearRect(0, 0, viewW, viewH);

      if (windows.length === 1) {
        const only = windows[0];
        const localT = t;
        const f = createFrame(ctx, localT, viewW, viewH, theme);
        only.scene.render(ctx, Math.max(0, Math.min(localT, only.scene.duration)), f);
        f.finish();
        if (filmGrade) applyFilmGrade(ctx, viewW, viewH, t, theme);
        return;
      }

      const buffered = canBuffer(ctx);
      const lastEnd = windows[windows.length - 1].end;

      const firstStart = windows[0].start;
      for (const w of windows) {
        const { scene, start, end } = w;
        const isLastWindow = end === lastEnd;
        const isFirstWindow = start === firstStart;
        // First/last scenes hold (no crossfade partner) — the film opens and closes on a full frame;
        // scene-internal animation handles the intro/outro. Only interior boundaries crossfade.
        const fadeIn = crossfade > 0 ? (isFirstWindow ? 1 : phase(t, start, start + crossfade)) : t >= start ? 1 : 0;
        const fadeOut =
          crossfade > 0 ? (isLastWindow ? 1 : 1 - phase(t, end - crossfade, end)) : (isLastWindow ? t <= end : t < end) ? 1 : 0;
        const alpha = fadeIn * fadeOut;
        if (alpha <= 0) continue;
        const localT = Math.max(0, Math.min(t - start, scene.duration));

        if (!buffered) {
          withAlpha(ctx, alpha, () => {
            const f = createFrame(ctx, localT, viewW, viewH, theme);
            scene.render(ctx, localT, f);
            f.finish();
          });
          continue;
        }

        const canvasW = ctx.canvas.width;
        const canvasH = ctx.canvas.height;
        if (!buffer || buffer.width !== canvasW || buffer.height !== canvasH) {
          buffer = document.createElement("canvas");
          buffer.width = canvasW;
          buffer.height = canvasH;
        }
        const bufCtx = buffer.getContext("2d") as CanvasRenderingContext2D;

        bufCtx.setTransform(1, 0, 0, 1, 0, 0);
        bufCtx.clearRect(0, 0, canvasW, canvasH);
        bufCtx.setTransform(ctx.getTransform());
        const bf = createFrame(bufCtx, localT, viewW, viewH, theme);
        scene.render(bufCtx, localT, bf);
        bf.finish();

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha *= clamp01(alpha);
        if (transition !== "crossfade") {
          const tp = transitionParams(transition, fadeIn, fadeOut, canvasW);
          ctx.translate(canvasW / 2 + tp.dx, canvasH / 2);
          ctx.scale(tp.scale, tp.scale);
          ctx.translate(-canvasW / 2, -canvasH / 2);
        }
        ctx.drawImage(buffer as HTMLCanvasElement, 0, 0);
        ctx.restore();
      }

      if (progressDots) {
        const x0 = viewW / 2 - (windows.length - 1) * 8;
        windows.forEach(({ dotEnd, start }, i) => {
          const active = t >= start && t < dotEnd;
          ctx.beginPath();
          ctx.arc(x0 + i * 16, viewH - 8, active ? 3.4 : 2.2, 0, 7);
          ctx.fillStyle = active ? "#e8a13c" : t >= dotEnd ? "#5cc8ae" : "#39434d";
          ctx.fill();
        });
      }

      if (filmGrade) applyFilmGrade(ctx, viewW, viewH, t, theme);
    },
  };
}
