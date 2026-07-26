// src/gcl/parse.ts
import { isScene, type Component, type Film, type SceneMarker } from "./schema";

export interface ParsedScene {
  marker: SceneMarker;
  components: Component[];
}

/** Group a flat film into scenes. The first item MUST be a scene marker. */
export function parseFilm(film: Film): ParsedScene[] {
  if (film.length === 0) return [];
  if (!isScene(film[0])) throw new Error("gcl: film must begin with a { type: 'scene' } marker");
  const scenes: ParsedScene[] = [];
  let current: ParsedScene | null = null;
  for (const item of film) {
    if (isScene(item)) {
      current = { marker: item, components: [] };
      scenes.push(current);
    } else {
      current!.components.push(item);
    }
  }
  return scenes;
}
