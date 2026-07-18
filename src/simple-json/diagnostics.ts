import type { ErrorObject } from "ajv";
import type { ResolvedLesson } from "./resolve";

export type DiagnosticCode =
  | "INVALID_JSON"
  | "SCHEMA_ERROR"
  | "DUPLICATE_ID"
  | "UNKNOWN_TARGET"
  | "UNKNOWN_ASSET"
  | "INVALID_ANCHOR"
  | "INVALID_ACTION_TARGET"
  | "INVALID_LIFECYCLE"
  | "INVALID_SVG"
  | "INVALID_SVG_BOUNDS"
  | "PLACEMENT_CYCLE"
  | "CANONICAL_ERROR"
  | "TARGET_NOT_VISIBLE"
  | "TEMPORARY_VISUAL_PERSISTS"
  | "LAYOUT_OVERFLOW"
  | "MOTION_GEOMETRY_FALLBACK"
  | "MOTION_PATH_ADJUSTED"
  | "UNKNOWN_RECIPE";

export interface Diagnostic {
  code: DiagnosticCode;
  path: string;
  message: string;
  received?: unknown;
  suggestions?: string[];
  availableTargets?: string[];
}

export type ValidationResult<T> =
  | { valid: true; value: T; warnings: Diagnostic[] }
  | { valid: false; errors: Diagnostic[] };

function valueAt(input: unknown, pointer: string): unknown {
  if (!pointer) return input;
  return pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), input);
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined, input: unknown): Diagnostic[] {
  return (errors ?? []).map((error) => {
    const missing = error.keyword === "required" ? String(error.params.missingProperty) : undefined;
    const extra = error.keyword === "additionalProperties" ? String(error.params.additionalProperty) : undefined;
    const path = `${error.instancePath}${missing ? `/${missing}` : extra ? `/${extra}` : ""}` || "/";
    return {
      code: "SCHEMA_ERROR",
      path,
      message: extra ? `Unknown field '${extra}' is not allowed` : `${error.message ?? "Invalid value"}`,
      received: extra ? valueAt(input, `${error.instancePath}/${extra}`) : valueAt(input, error.instancePath),
    };
  });
}

const VIEW_WIDTH = 920;
const VIEW_HEIGHT = 430;
const SAFE_INSET = 8;

/**
 * Diagnostics that require the deterministic layout result rather than only
 * the source schema. Keeping these checks in the compiler response gives an
 * LLM actionable feedback before a malformed lesson reaches the renderer.
 */
export function analyzeResolvedLesson(lesson: ResolvedLesson): Diagnostic[] {
  const warnings: Diagnostic[] = [];

  lesson.scenes.forEach((scene, sceneIndex) => {
    const authoredObjects = scene.objects.filter((object) => object.compositeParent === undefined);
    authoredObjects.forEach((object, objectIndex) => {
      if (!["text", "equation", "stat", "legend"].includes(object.source.kind)) return;
      const { x, y, w, h } = object.box;
      const overflow = {
        left: Math.max(0, SAFE_INSET - x),
        top: Math.max(0, SAFE_INSET - y),
        right: Math.max(0, x + w - (VIEW_WIDTH - SAFE_INSET)),
        bottom: Math.max(0, y + h - (VIEW_HEIGHT - SAFE_INSET)),
      };
      const amount = Math.max(overflow.left, overflow.top, overflow.right, overflow.bottom);
      if (amount <= 0.5) return;
      warnings.push({
        code: "LAYOUT_OVERFLOW",
        path: `/scenes/${sceneIndex}/objects/${objectIndex}/placement`,
        message: `'${object.id}' extends ${amount.toFixed(1)} view units outside the safe frame; shorten it, reduce its size, or change its placement`,
        received: { box: object.box, safeFrame: [SAFE_INSET, SAFE_INSET, VIEW_WIDTH - SAFE_INSET, VIEW_HEIGHT - SAFE_INSET] },
      });
    });

    scene.beats.forEach((beat, beatIndex) => {
      beat.actions.forEach((action, actionIndex) => {
        if (action.kind !== "motion" || action.source.do !== "motion") return;
        const source = action.source;
        const target = scene.objects.find((object) => object.id === source.target);
        const actionPath = `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`;
        if (!target) return;

        if (source.motion === "orbit") {
          const center = scene.objects.find((object) => object.id === source.around);
          if (center && Math.hypot(target.position[0] - center.position[0], target.position[1] - center.position[1]) <= 0.001) {
            warnings.push({
              code: "MOTION_GEOMETRY_FALLBACK",
              path: `${actionPath}/around`,
              message: `Orbit target '${target.id}' starts at its center '${center.id}'; the compiler must use the '${source.orbit ?? "medium"}' fallback radius`,
              received: source.around,
              suggestions: ["Place the target on the intended orbit path in the source artwork"],
            });
          }
        }

        if (source.motion === "along") {
          const pathObject = scene.objects.find((object) => object.id === source.along);
          const endpoints = pathObject?.endpoints;
          if (!endpoints) return;
          const nearest = Math.min(
            Math.hypot(target.position[0] - endpoints.from[0], target.position[1] - endpoints.from[1]),
            Math.hypot(target.position[0] - endpoints.to[0], target.position[1] - endpoints.to[1]),
          );
          if (nearest > 0.5) {
            warnings.push({
              code: "MOTION_PATH_ADJUSTED",
              path: `${actionPath}/along`,
              message: `Motion target '${target.id}' is ${nearest.toFixed(1)} view units from the nearest endpoint of '${pathObject.id}'; a lead-in segment was added to prevent a jump`,
              received: source.along,
              suggestions: ["Anchor the moving object to the start or end of the path"],
            });
          }
        }
      });
    });
  });

  return warnings;
}
