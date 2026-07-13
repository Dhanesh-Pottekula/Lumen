import type { Diagnostic } from "./diagnostics";
import type { SceneSpec } from "./types";

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

export function analyzeLifecycle(scene: SceneSpec, sceneIndex: number): LifecycleAnalysis {
  const windows = new Map<string, VisibilityWindow>(scene.objects.map((object) => [object.id, { initiallyVisible: object.initial === "visible" }]));
  const shows = new Map<string, Occurrence[]>();
  const hides = new Map<string, Occurrence[]>();

  scene.beats.forEach((beat, beatIndex) => {
    beat.actions.forEach((action, actionIndex) => {
      if (action.do !== "show" && action.do !== "hide") return;
      action.targets.forEach((target, targetIndex) => {
        const destination = action.do === "show" ? shows : hides;
        const list = destination.get(target) ?? [];
        list.push({ beat: beatIndex, action: actionIndex, path: `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}/targets/${targetIndex}` });
        destination.set(target, list);
      });
    });
  });

  const errors: Diagnostic[] = [];
  for (const [id, window] of windows) {
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
