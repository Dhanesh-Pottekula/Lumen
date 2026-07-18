import type { Diagnostic, ValidationResult } from "./diagnostics";
import type { ResolvedLesson } from "./resolve";

export interface LessonKeyframe {
  scene: number;
  time: number;
  reason: "scene-start" | "beat-start" | "action-quarter" | "beat-end" | "scene-end";
  beat?: string;
  action?: number;
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Deterministic frames used by automated geometry checks and vision review. */
export function collectLessonKeyframes(lesson: ResolvedLesson): LessonKeyframe[] {
  return lesson.scenes.flatMap((scene, sceneIndex) => {
    const frames: LessonKeyframe[] = [{ scene: sceneIndex, time: 0, reason: "scene-start" }];
    scene.beats.forEach((beat) => {
      frames.push({ scene: sceneIndex, time: rounded(beat.start), reason: "beat-start", beat: beat.id });
      beat.actions.forEach((action, actionIndex) => {
        if (action.kind !== "motion") return;
        [0.25, 0.5, 0.75].forEach((fraction) => frames.push({
          scene: sceneIndex,
          time: rounded(action.start + action.duration * fraction),
          reason: "action-quarter",
          beat: beat.id,
          action: actionIndex,
        }));
      });
      frames.push({ scene: sceneIndex, time: rounded(beat.end), reason: "beat-end", beat: beat.id });
    });
    frames.push({ scene: sceneIndex, time: rounded(scene.duration), reason: "scene-end" });
    const unique = new Map(frames.map((frame) => [`${frame.time}:${frame.reason}:${frame.beat ?? ""}:${frame.action ?? ""}`, frame]));
    return [...unique.values()].sort((a, b) => a.time - b.time);
  });
}

/** Reject non-finite layout/timing before a renderer or screenshot worker receives the lesson. */
export function validateResolvedKeyframes(lesson: ResolvedLesson): ValidationResult<ResolvedLesson> {
  const errors: Diagnostic[] = [];
  lesson.scenes.forEach((scene, sceneIndex) => {
    scene.objects.forEach((object, objectIndex) => {
      const numbers = [...object.position, object.box.x, object.box.y, object.box.w, object.box.h];
      if (numbers.some((value) => !Number.isFinite(value))) errors.push({
        code: "CANONICAL_ERROR",
        path: `/scenes/${sceneIndex}/objects/${objectIndex}`,
        message: `Resolved object '${object.id}' contains non-finite geometry`,
        received: { position: object.position, box: object.box },
      });
      if (object.box.w < 0 || object.box.h < 0) errors.push({
        code: "CANONICAL_ERROR",
        path: `/scenes/${sceneIndex}/objects/${objectIndex}`,
        message: `Resolved object '${object.id}' has negative dimensions`,
        received: object.box,
      });
    });
    scene.beats.forEach((beat, beatIndex) => beat.actions.forEach((action, actionIndex) => {
      if (![action.start, action.end, action.duration].every(Number.isFinite) || action.start < 0 || action.end > scene.duration + 0.001 || action.end < action.start) {
        errors.push({
          code: "CANONICAL_ERROR",
          path: `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`,
          message: `Action timing lies outside its scene`,
          received: { start: action.start, end: action.end, duration: action.duration, sceneDuration: scene.duration },
        });
      }
    }));
  });
  return errors.length ? { valid: false, errors } : { valid: true, value: lesson, warnings: [] };
}
