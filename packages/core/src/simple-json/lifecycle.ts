import type { Diagnostic } from "./diagnostics";
import type { SceneSpec } from "./types";
import { parseSvgArtwork } from "./svg";
import { lonePieces, pieceNames } from "./pieces";

export interface VisibilityWindow {
  initiallyVisible: boolean;
  showBeat?: number;
  hideBeat?: number;
}

export interface LifecycleAnalysis {
  windows: Map<string, VisibilityWindow>;
  errors: Diagnostic[];
}

interface Occurrence { beat: number; action: number; path: string }

/** Every id a scene gives a visibility window of its own: its objects, their drawn parts and their pieces. */
export function lifecycleIds(scene: SceneSpec): string[] {
  return scene.objects.flatMap((object) => {
    const parts = object.kind === "svg-composite"
      ? object.parts
      : object.kind === "svg-artwork"
        ? parseSvgArtwork(object.svg).value?.parts ?? []
        : [];
    return [object.id, ...parts.map((part) => `${object.id}.${part.id}`), ...pieceNames(object).map((name) => `${object.id}.${name}`)];
  });
}

/** A figure's pieces a scene reveals on beats of their own, which showing the whole leaves to those beats. */
function ownBeats(scene: SceneSpec): Set<string> {
  return new Set(scene.beats.flatMap((beat) => beat.actions.flatMap((action) => (action.do === "show" ? action.targets : []))));
}

function expandedTarget(scene: SceneSpec, target: string): string[] {
  const figure = scene.objects.find((object) => object.id === target);
  const pieces = figure ? pieceNames(figure).map((name) => `${target}.${name}`) : [];
  if (pieces.length) {
    const own = ownBeats(scene);
    const lone = new Set(lonePieces(figure!).map((name) => `${target}.${name}`));
    return [target, ...pieces.filter((piece) => !own.has(piece) && !lone.has(piece))];
  }
  const composite = scene.objects.find((object) => (object.kind === "svg-composite" || object.kind === "svg-artwork") && object.id === target);
  const parts = composite?.kind === "svg-composite"
    ? composite.parts
    : composite?.kind === "svg-artwork"
      ? parseSvgArtwork(composite.svg).value?.parts ?? []
      : [];
  return parts.length ? [target, ...parts.map((part) => `${target}.${part.id}`)] : [target];
}

export function analyzeLifecycle(scene: SceneSpec, sceneIndex: number): LifecycleAnalysis {
  const windows = new Map<string, VisibilityWindow>();
  const own = ownBeats(scene);
  for (const object of scene.objects) {
    windows.set(object.id, { initiallyVisible: object.initial === "visible" });
    if (object.kind === "svg-composite") {
      for (const part of object.parts) {
        windows.set(`${object.id}.${part.id}`, {
          initiallyVisible: part.initial === "visible" || (part.initial === undefined && object.initial === "visible"),
        });
      }
    }
    if (object.kind === "svg-artwork") {
      for (const part of parseSvgArtwork(object.svg).value?.parts ?? []) {
        windows.set(`${object.id}.${part.id}`, { initiallyVisible: object.initial === "visible" });
      }
    }
    // A piece with a beat of its own waits for it, even on a figure that is on screen from the start.
    const lone = lonePieces(object);
    for (const name of pieceNames(object)) {
      const id = `${object.id}.${name}`;
      windows.set(id, { initiallyVisible: object.initial === "visible" && !own.has(id) && !lone.includes(name) });
    }
  }
  const shows = new Map<string, Occurrence[]>();
  const hides = new Map<string, Occurrence[]>();

  scene.beats.forEach((beat, beatIndex) => {
    beat.actions.forEach((action, actionIndex) => {
      if (action.do !== "show" && action.do !== "hide") return;
      action.targets.forEach((target, targetIndex) => {
        const destination = action.do === "show" ? shows : hides;
        for (const expanded of expandedTarget(scene, target)) {
          const list = destination.get(expanded) ?? [];
          list.push({ beat: beatIndex, action: actionIndex, path: `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}/targets/${targetIndex}` });
          destination.set(expanded, list);
        }
      });
    });
  });

  const errors: Diagnostic[] = [];
  for (const id of lifecycleIds(scene)) {
    const window = windows.get(id)!;
    const objectShows = shows.get(id) ?? [];
    const objectHides = hides.get(id) ?? [];
    if (window.initiallyVisible && objectShows.length > 0) {
      errors.push({ code: "INVALID_LIFECYCLE", path: objectShows[0].path, message: `Object '${id}' is initially visible and cannot be shown again`, received: id });
    }
    if (objectShows.length > 1) {
      errors.push({ code: "INVALID_LIFECYCLE", path: objectShows[1].path, message: `Object '${id}' has more than one show action`, received: id });
    }
    if (objectHides.length > 1) {
      errors.push({ code: "INVALID_LIFECYCLE", path: objectHides[1].path, message: `Object '${id}' has more than one hide action`, received: id });
    }
    const show = objectShows[0];
    const hide = objectHides[0];
    if (!window.initiallyVisible && hide && (!show || hide.beat <= show.beat)) {
      errors.push({ code: "INVALID_LIFECYCLE", path: hide.path, message: `Object '${id}' is hidden before it becomes visible`, received: id });
    }
    if (show) window.showBeat = show.beat;
    if (hide) window.hideBeat = hide.beat;
  }
  return { windows, errors };
}
