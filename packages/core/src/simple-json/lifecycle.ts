import type { Diagnostic } from "./diagnostics";
import type { SceneSpec } from "./types";
import { parseSvgArtwork } from "./svg";

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

function lifecycleIds(scene: SceneSpec): string[] {
  return scene.objects.flatMap((object) => {
    const parts = object.kind === "svg-composite"
      ? object.parts
      : object.kind === "svg-artwork"
        ? parseSvgArtwork(object.svg).value?.parts ?? []
        : [];
    return [object.id, ...parts.map((part) => `${object.id}.${part.id}`)];
  });
}

function expandedTarget(scene: SceneSpec, target: string): string[] {
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
