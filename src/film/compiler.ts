/**
 * The film compiler: scenes are added one at a time, as they arrive, and the film grows.
 *
 * `slide` is one stable object for the whole life of the film. Adding a scene never replaces it and never
 * changes any frame that already existed: scenes join with hard cuts, so scene k's frames depend on scene k
 * alone. That is what lets the player keep playing while the rest of the film is still being made.
 */
import type { CanvasSlideDefinition } from "../slides/types";
import { drawScene, endLens, VIEW_H, VIEW_W } from "./render";
import { backdropAt, resolveScene, type ResolvedScene } from "./resolve";
import type { FilmHeader, FilmScene } from "./types";

export interface SceneSpan {
  id: string;
  start: number;
  end: number;
}

interface Entry extends SceneSpan {
  scene: ResolvedScene;
  fadeIn: boolean;
}

export interface FilmCompiler {
  header: FilmHeader;
  /** Add the next scene. `floor` is how long its narration takes to say. Returns where it sits on the film's timeline. */
  add(scene: FilmScene, floor: number, wordTimes?: number[]): SceneSpan;
  count(): number;
  spans(): SceneSpan[];
  /** Index of the scene playing at film time t. */
  sceneAt(t: number): number;
  subtitles: boolean;
  /** The film so far. `duration` grows as scenes are added; the object itself never changes. */
  slide: CanvasSlideDefinition;
}

export function createFilmCompiler(header: FilmHeader): FilmCompiler {
  const entries: Entry[] = [];

  const sceneAt = (t: number) => {
    let index = 0;
    for (let i = 0; i < entries.length; i++) if (entries[i].start <= t) index = i;
    return index;
  };

  const compiler: FilmCompiler = {
    header,
    subtitles: true,
    add(scene, floor, wordTimes) {
      const resolved = resolveScene(scene, floor, wordTimes);
      const previous = entries[entries.length - 1];
      const start = previous ? previous.end : 0;
      // Fade in on a change of place. When the same picture carries over, the cut is invisible.
      const carried = previous ? backdropAt(previous.scene, previous.scene.duration) === resolved.backdrops[0]?.picture : false;
      // ...and the camera carries on from where it was, instead of snapping back to wide.
      if (carried && previous) resolved.openLens = endLens(previous.scene);
      const entry: Entry = { id: scene.id, start, end: start + resolved.duration, scene: resolved, fadeIn: !carried };
      entries.push(entry);
      return { id: entry.id, start: entry.start, end: entry.end };
    },
    count: () => entries.length,
    spans: () => entries.map(({ id, start, end }) => ({ id, start, end })),
    sceneAt,
    slide: {
      viewW: VIEW_W,
      viewH: VIEW_H,
      get duration() {
        return entries.length ? entries[entries.length - 1].end : 0;
      },
      render(ctx, t) {
        if (entries.length === 0) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, VIEW_W, VIEW_H);
          return;
        }
        const entry = entries[sceneAt(t)];
        const local = Math.max(0, Math.min(t - entry.start, entry.scene.duration));
        drawScene(ctx, entry.scene, local, { fadeIn: entry.fadeIn, subtitles: compiler.subtitles });
      },
    },
  };
  return compiler;
}
