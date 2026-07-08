/**
 * composeSlides — stitch standalone scenes into one film on a single timeline.
 *
 * Consecutive scenes overlap by `crossfade` seconds; each scene renders at its
 * own local time inside a fade-in × fade-out alpha envelope. The result is a
 * plain CanvasSlideDefinition, so the composed film stays a pure function of t
 * and seeks exactly like any slide.
 *
 * Compositing contract: scenes may self-clear (`clearRect`) and set `globalAlpha`
 * absolutely — real scenes do both, which would otherwise defeat the fade envelope.
 * During a crossfade the composer isolates each active scene in a shared offscreen
 * buffer and composites that buffer onto the main canvas under the envelope alpha,
 * so the scene's own clearing/alpha calls only ever affect the buffer.
 */
import { clamp01, phase, withAlpha } from "./anim";
import type { CanvasSlideDefinition, CaptionSegment } from "./types";

export interface ComposeOptions {
  /** Seconds of overlap between consecutive scenes. Default 2.5. */
  crossfade?: number;
  /** Draw one progress dot per scene along the bottom (films of 2+ scenes). Default true. */
  progressDots?: boolean;
}

interface SceneWindow {
  scene: CanvasSlideDefinition;
  start: number;
  end: number;
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

  let crossfade = Math.max(0, options.crossfade ?? 2.5);
  const shortest = Math.min(...scenes.map((s) => s.duration));
  if (scenes.length > 1 && crossfade > shortest / 2) {
    const clamped = shortest / 2;
    console.warn(
      `composeSlides: crossfade ${crossfade.toFixed(3)}s clamped to ${clamped.toFixed(3)}s (half the shortest scene)`,
    );
    crossfade = clamped;
  }
  const progressDots = options.progressDots ?? true;

  const windows: SceneWindow[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    windows.push({ scene, start: cursor, end: cursor + scene.duration });
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
        const only = scenes[0];
        only.render(ctx, Math.max(0, Math.min(t, only.duration)));
        return;
      }

      const buffered = canBuffer(ctx);

      for (const { scene, start, end } of windows) {
        const isLastWindow = end === windows[windows.length - 1].end;
        const fadeIn = crossfade > 0 ? phase(t, start, start + crossfade) : t >= start ? 1 : 0;
        const fadeOut =
          crossfade > 0 ? 1 - phase(t, end - crossfade, end) : (isLastWindow ? t <= end : t < end) ? 1 : 0;
        const alpha = fadeIn * fadeOut;
        if (alpha <= 0) continue;
        const localT = Math.max(0, Math.min(t - start, scene.duration));

        if (!buffered) {
          withAlpha(ctx, alpha, () => scene.render(ctx, localT));
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
        scene.render(bufCtx, localT);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha *= clamp01(alpha);
        ctx.drawImage(buffer as HTMLCanvasElement, 0, 0);
        ctx.restore();
      }

      if (progressDots) {
        const x0 = viewW / 2 - (windows.length - 1) * 8;
        windows.forEach(({ start, end }, i) => {
          const active = t >= start && t < end;
          ctx.beginPath();
          ctx.arc(x0 + i * 16, viewH - 8, active ? 3.4 : 2.2, 0, 7);
          ctx.fillStyle = active ? "#e8a13c" : t >= end ? "#5cc8ae" : "#39434d";
          ctx.fill();
        });
      }
    },
  };
}
