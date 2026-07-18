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
  | "IMPRECISE_SVG_BOUNDS"
  | "INVALID_EXPRESSION"
  | "UNSUPPORTED_MATH_COMMAND"
  | "INVALID_DOMAIN"
  | "INVALID_DATA"
  | "UNKNOWN_MAP_PLACE"
  | "UNKNOWN_ICON"
  | "INVALID_GROUP_CHILD"
  | "MULTIPLE_MOTION"
  | "PLACEMENT_CYCLE"
  | "CANONICAL_ERROR"
  | "TARGET_NOT_VISIBLE"
  | "TEMPORARY_VISUAL_PERSISTS"
  | "LAYOUT_OVERFLOW"
  | "LAYOUT_COLLISION"
  | "CALLOUT_OVERFLOW"
  | "MOTION_GEOMETRY_FALLBACK"
  | "MOTION_PATH_ADJUSTED";

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
    const unknownIcon = error.keyword === "enum" && /\/markers\/\d+\/icon$/.test(path);
    return {
      code: unknownIcon ? "UNKNOWN_ICON" : "SCHEMA_ERROR",
      path,
      message: unknownIcon ? "Unknown map marker icon" : extra ? `Unknown field '${extra}' is not allowed` : `${error.message ?? "Invalid value"}`,
      received: extra ? valueAt(input, `${error.instancePath}/${extra}`) : valueAt(input, error.instancePath),
      suggestions: unknownIcon && Array.isArray(error.params.allowedValues) ? error.params.allowedValues.slice(0, 8) : undefined,
    };
  });
}

const VIEW_WIDTH = 920;
const VIEW_HEIGHT = 430;
const SAFE_INSET = 8;

function targetPoint(scene: ResolvedLesson["scenes"][number], target: string): [number, number] | undefined {
  const exact = scene.objects.find((object) => object.id === target);
  if (exact) return exact.position;
  const parent = [...scene.objects]
    .sort((a, b) => b.id.length - a.id.length)
    .find((object) => target.startsWith(`${object.id}.`));
  if (!parent) return undefined;
  const anchor = target.slice(parent.id.length + 1);
  const { x, y, w, h } = parent.box;
  const anchors: Record<string, [number, number]> = {
    center: [x + w / 2, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h],
    left: [x, y + h / 2], right: [x + w, y + h / 2],
  };
  return anchors[anchor];
}

function calloutBox(target: [number, number], title: string | undefined, body: string | undefined, requestedSide: string | undefined) {
  const font = 14; const pad = 9; const maxWidth = 180; const charsPerLine = Math.floor(maxWidth / (font * 0.55));
  const bodyLines = body ? Math.max(1, Math.ceil(body.length / charsPerLine)) : 0;
  const lines = bodyLines + (title ? 1 : 0);
  const longest = Math.max(title?.length ?? 0, Math.min(charsPerLine, body?.length ?? 0));
  const w = Math.min(maxWidth, longest * font * 0.55) + pad * 2;
  const h = Math.max(font + pad * 2, lines * font * 1.32 + pad * 2 - (font * 1.32 - font));
  let side = requestedSide;
  if (!side || side === "auto") {
    const left = target[0] < VIEW_WIDTH * 0.5;
    const top = target[1] < VIEW_HEIGHT * 0.4;
    const bottom = target[1] > VIEW_HEIGHT * 0.6;
    side = top ? (left ? "south-east" : "south-west") : bottom ? (left ? "north-east" : "north-west") : left ? "east" : "west";
  }
  const offset = 90;
  const horizontal = side.includes("east") ? 1 : side.includes("west") ? -1 : 0;
  const vertical = side.includes("south") ? 1 : side.includes("north") ? -1 : 0;
  const cx = target[0] + horizontal * (offset + w / 2);
  const cy = target[1] + vertical * (offset + h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

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
      if (object.source.kind === "line" || object.source.role === "background") return;
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

    const visibleWindow = (object: (typeof authoredObjects)[number]): [number, number] | undefined => {
      const targetsObject = (targets: string[]) => targets.includes(object.id);
      const show = scene.beats.flatMap((beat) => beat.actions).find((action) => action.kind === "show" && action.source.do === "show" && targetsObject(action.source.targets));
      const hide = scene.beats.flatMap((beat) => beat.actions).find((action) => action.kind === "hide" && action.source.do === "hide" && targetsObject(action.source.targets));
      const startsVisible = object.source.initial === "visible";
      if (!startsVisible && !show) return undefined;
      return [startsVisible ? 0 : show!.start, hide?.start ?? scene.duration];
    };
    const intentionallyRelated = (a: (typeof authoredObjects)[number], b: (typeof authoredObjects)[number]) => {
      const targets = (object: (typeof authoredObjects)[number], id: string) => {
        const placement = object.source.placement;
        return (placement?.mode === "anchor" || placement?.mode === "relative")
          && (placement.target === id || placement.target.startsWith(`${id}.`));
      };
      return targets(a, b.id) || targets(b, a.id);
    };
    for (let left = 0; left < authoredObjects.length; left++) {
      for (let right = left + 1; right < authoredObjects.length; right++) {
        const a = authoredObjects[left]; const b = authoredObjects[right];
        if (a.source.kind === "line" || b.source.kind === "line") continue;
        if ([a.source.role, b.source.role].some((role) => role === "background" || role === "annotation")) continue;
        if ([a.source, b.source].some((source) => source.space === "screen" || source.role === "hud")) continue;
        if (intentionallyRelated(a, b)) continue;
        const aw = visibleWindow(a); const bw = visibleWindow(b);
        if (!aw || !bw || Math.max(aw[0], bw[0]) >= Math.min(aw[1], bw[1])) continue;
        const x = Math.max(a.box.x, b.box.x); const y = Math.max(a.box.y, b.box.y);
        const width = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - x;
        const height = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - y;
        if (width <= 0 || height <= 0) continue;
        const ratio = width * height / Math.max(1, Math.min(a.box.w * a.box.h, b.box.w * b.box.h));
        if (ratio < 0.55) continue;
        warnings.push({
          code: "LAYOUT_COLLISION",
          path: `/scenes/${sceneIndex}/objects/${right}/placement`,
          message: `'${a.id}' and '${b.id}' overlap by ${(ratio * 100).toFixed(0)}% while both are visible`,
          received: { first: a.id, second: b.id, overlap: { x, y, w: width, h: height } },
          suggestions: ["Use separate zones, relative placement, or non-overlapping show/hide windows"],
        });
      }
    }

    scene.beats.forEach((beat, beatIndex) => {
      beat.actions.forEach((action, actionIndex) => {
        if (action.kind === "attention" && action.source.do === "attention" && action.source.verb === "callout") {
          const target = targetPoint(scene, action.source.target);
          if (target) {
            const box = calloutBox(target, action.source.title, action.source.text, action.source.side);
            const overflow = Math.max(SAFE_INSET - box.x, SAFE_INSET - box.y, box.x + box.w - (VIEW_WIDTH - SAFE_INSET), box.y + box.h - (VIEW_HEIGHT - SAFE_INSET));
            if (overflow > 0.5) warnings.push({
              code: "CALLOUT_OVERFLOW",
              path: `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`,
              message: `Callout for '${action.source.target}' extends ${overflow.toFixed(1)} view units outside the safe frame`,
              received: { target, box, side: action.source.side ?? "auto" },
              suggestions: ["Choose the inward-facing side, shorten the text, or move the target away from the frame edge"],
            });
          }
        }
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
