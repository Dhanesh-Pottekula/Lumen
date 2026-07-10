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
import { clamp01, phase, prng, withAlpha } from "./anim";
import type { CanvasSlideDefinition, CaptionSegment } from "./types";

export interface ComposeOptions {
  /** Seconds of overlap between consecutive scenes. Default 2.5. */
  crossfade?: number;
  /** Draw one progress dot per scene along the bottom (films of 2+ scenes). Default true. */
  progressDots?: boolean;
  /** Apply a filmic overlay (vignette + grain + grade) to the final frame. Default false. */
  filmGrade?: boolean;
  /** Art-direction theme passed to each scene's FrameCtx. Default TEXTBOOK. */
  theme?: Theme;
}

/** Vignette + deterministic grain + subtle grade over the whole view. Seekable (grain keyed to t). */
function drawFilmGrade(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // vignette
  ctx.save();
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  // subtle top-down grade for cohesion
  const grade = ctx.createLinearGradient(0, 0, 0, h);
  grade.addColorStop(0, "rgba(90,120,150,0.05)");
  grade.addColorStop(1, "rgba(20,30,25,0.10)");
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, w, h);
  // animated grain — deterministic per ~12 fps tick so scrubbing stays exact
  const rnd = prng(Math.floor(t * 12) + 1);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 90; i++) {
    ctx.fillRect(rnd() * w, rnd() * h, 1.2, 1.2);
  }
  ctx.restore();
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
        if (filmGrade) drawFilmGrade(ctx, viewW, viewH, t);
        return;
      }

      const buffered = canBuffer(ctx);
      const lastEnd = windows[windows.length - 1].end;

      for (const w of windows) {
        const { scene, start, end } = w;
        const isLastWindow = end === lastEnd;
        const fadeIn = crossfade > 0 ? phase(t, start, start + crossfade) : t >= start ? 1 : 0;
        const fadeOut =
          crossfade > 0 ? 1 - phase(t, end - crossfade, end) : (isLastWindow ? t <= end : t < end) ? 1 : 0;
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

      if (filmGrade) drawFilmGrade(ctx, viewW, viewH, t);
    },
  };
}
