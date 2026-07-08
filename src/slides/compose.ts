/**
 * composeSlides — stitch standalone scenes into one film on a single timeline.
 *
 * Consecutive scenes overlap by `crossfade` seconds; each scene renders at its
 * own local time inside a fade-in × fade-out alpha envelope. The result is a
 * plain CanvasSlideDefinition, so the composed film stays a pure function of t
 * and seeks exactly like any slide.
 */
import { phase, withAlpha } from "./anim";
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
    console.warn(`composeSlides: crossfade ${crossfade}s clamped to ${shortest / 2}s (half the shortest scene)`);
    crossfade = shortest / 2;
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

      for (const { scene, start, end } of windows) {
        const fadeIn = crossfade > 0 ? phase(t, start, start + crossfade) : t >= start ? 1 : 0;
        const fadeOut = crossfade > 0 ? 1 - phase(t, end - crossfade, end) : t < end ? 1 : 0;
        withAlpha(ctx, fadeIn * fadeOut, () =>
          scene.render(ctx, Math.max(0, Math.min(t - start, scene.duration))),
        );
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
