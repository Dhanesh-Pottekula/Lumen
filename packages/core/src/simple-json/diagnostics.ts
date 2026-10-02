import type { ErrorObject } from "ajv";
import {
  VIEW_HEIGHT,
  VIEW_INSET,
  VIEW_WIDTH,
} from "../gcl/viewport";
import { boxPolygon, meets, rectAt, type Pt } from "../geometry/place";
import { silhouetteOn, type ResolvedLesson, type ResolvedObject } from "./resolve";
import { joinsTwo } from "./registry";

// Two things' overlap is sampled this many points across the boxes' common part.
const OVERLAP_SAMPLES = 12;

const shoelace = (points: Pt[]) => Math.abs(points.reduce((sum, [x, y], i) => sum + x * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * y, 0)) / 2;

/** How much of the smaller of two things lies on the other, as they are drawn: a cut-out's own outline, not the transparent box around it. */
function drawnOverlap(a: ResolvedObject, b: ResolvedObject): number {
  const [x, y] = [Math.max(a.box.x, b.box.x), Math.max(a.box.y, b.box.y)];
  const [w, h] = [Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - x, Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - y];
  if (w <= 0 || h <= 0) return 0;
  const [one, two] = [silhouetteOn(a) ?? boxPolygon(a.box), silhouetteOn(b) ?? boxPolygon(b.box)];
  let shared = 0;
  for (let i = 0; i < OVERLAP_SAMPLES; i++)
    for (let j = 0; j < OVERLAP_SAMPLES; j++) {
      const point = rectAt([x + (w * (i + 0.5)) / OVERLAP_SAMPLES, y + (h * (j + 0.5)) / OVERLAP_SAMPLES], [0.01, 0.01]);
      if (meets({ area: one }, point) && meets({ area: two }, point)) shared++;
    }
  return ((shared / OVERLAP_SAMPLES ** 2) * w * h) / Math.max(1, Math.min(shoelace(one), shoelace(two)));
}

// Below this share of the frame the subject is too small to teach from.
const SPLIT_BELOW = 0.55;
// The height a subject can be drawn at while what is set above and below it keeps its room.
const SUBJECT_HEIGHT = VIEW_HEIGHT * 0.7;

export type DiagnosticCode =
  | "SPLIT_STEP"
  | "LIE_FACTOR"
  | "INVALID_JSON"
  | "SCHEMA_ERROR"
  | "DUPLICATE_ID"
  | "UNKNOWN_TARGET"
  | "UNKNOWN_ASSET"
  | "INVALID_ANCHOR"
  | "INVALID_ACTION_TARGET"
  | "INVALID_LIFECYCLE"
  | "INVALID_SVG"
  | "INVALID_IMAGE"
  | "INVALID_PATH"
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
  | "MOTION_PATH_ADJUSTED"
  | "ASSUMED_VISIBLE"
  | "READ_AS_BCE"
  | "SILHOUETTE_FRAGMENT"
  | "RAISED_TO_READABLE"
  | "ANCHOR_FALLBACK"
  | "MOTION_REFUSED"
  | "DROPPED_SCENE"
  | "DROPPED_ACTION"
  | "DROPPED_OBJECT"
  | "DROPPED_CHECK"
  | "DROPPED_FIELD"
  | "NO_DRAWABLE_SCENE";

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
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      input,
    );
}

export function formatAjvErrors(
  errors: ErrorObject[] | null | undefined,
  input: unknown,
): Diagnostic[] {
  return (errors ?? []).map((error) => {
    const missing =
      error.keyword === "required"
        ? String(error.params.missingProperty)
        : undefined;
    const extra =
      error.keyword === "additionalProperties"
        ? String(error.params.additionalProperty)
        : undefined;
    const path =
      `${error.instancePath}${missing ? `/${missing}` : extra ? `/${extra}` : ""}` ||
      "/";
    const unknownIcon =
      error.keyword === "enum" && /\/markers\/\d+\/icon$/.test(path);
    return {
      code: unknownIcon ? "UNKNOWN_ICON" : "SCHEMA_ERROR",
      path,
      message: unknownIcon
        ? "Unknown map marker icon"
        : extra
          ? `Unknown field '${extra}' is not allowed`
          : `${error.message ?? "Invalid value"}`,
      received: extra
        ? valueAt(input, `${error.instancePath}/${extra}`)
        : valueAt(input, error.instancePath),
      suggestions:
        unknownIcon && Array.isArray(error.params.allowedValues)
          ? error.params.allowedValues.slice(0, 8)
          : undefined,
    };
  });
}

const SAFE_INSET = VIEW_INSET;

function targetPoint(
  scene: ResolvedLesson["scenes"][number],
  target: string,
): [number, number] | undefined {
  const exact = scene.objects.find((object) => object.id === target);
  if (exact) return exact.position;
  const parent = [...scene.objects]
    .sort((a, b) => b.id.length - a.id.length)
    .find((object) => target.startsWith(`${object.id}.`));
  if (!parent) return undefined;
  const anchor = target.slice(parent.id.length + 1);
  const { x, y, w, h } = parent.box;
  const anchors: Record<string, [number, number]> = {
    center: [x + w / 2, y + h / 2],
    top: [x + w / 2, y],
    bottom: [x + w / 2, y + h],
    left: [x, y + h / 2],
    right: [x + w, y + h / 2],
  };
  return anchors[anchor];
}

function calloutBox(
  target: [number, number],
  title: string | undefined,
  body: string | undefined,
  requestedSide: string | undefined,
) {
  const font = 14;
  const pad = 9;
  const maxWidth = 180;
  const charsPerLine = Math.floor(maxWidth / (font * 0.55));
  const bodyLines = body
    ? Math.max(1, Math.ceil(body.length / charsPerLine))
    : 0;
  const lines = bodyLines + (title ? 1 : 0);
  const longest = Math.max(
    title?.length ?? 0,
    Math.min(charsPerLine, body?.length ?? 0),
  );
  const w = Math.min(maxWidth, longest * font * 0.55) + pad * 2;
  const h = Math.max(
    font + pad * 2,
    lines * font * 1.32 + pad * 2 - (font * 1.32 - font),
  );
  let side = requestedSide;
  if (!side || side === "auto") {
    const left = target[0] < VIEW_WIDTH * 0.5;
    const top = target[1] < VIEW_HEIGHT * 0.4;
    const bottom = target[1] > VIEW_HEIGHT * 0.6;
    side = top
      ? left
        ? "south-east"
        : "south-west"
      : bottom
        ? left
          ? "north-east"
          : "north-west"
        : left
          ? "east"
          : "west";
  }
  const offset = 90;
  const horizontal = side.includes("east") ? 1 : side.includes("west") ? -1 : 0;
  const vertical = side.includes("south") ? 1 : side.includes("north") ? -1 : 0;
  const cx = target[0] + horizontal * (offset + w / 2);
  const cy = target[1] + vertical * (offset + h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/**
 * Why a chart's drawn lengths would misstate its numbers, or undefined when they are true to them:
 * bars measured from a baseline other than zero (the lie factor is how far the drawn ratio of the
 * longest to the shortest bar strays from the numbers'), bars cut off by the axis, or parts of a whole
 * given a negative share.
 */
function lieFactor(source: ResolvedLesson["scenes"][number]["objects"][number]["source"]): string | undefined {
  if (source.kind !== "chart") return undefined;
  const values =
    "data" in source ? source.data.map((datum) => datum.value) : source.chart === "stack" ? source.series.flat().map(([, y]) => y) : undefined;
  if (!values || values.length === 0) return undefined;
  if (["pie", "donut", "units", "seats"].includes(source.chart)) {
    return values.some((value) => value < 0) ? "a part of a whole cannot be negative; the slices misstate the shares" : undefined;
  }
  if (!["bar", "hbar", "stack"].includes(source.chart) || !source.yDomain) return undefined;
  const [low, high] = source.yDomain;
  if (values.some((value) => value > high || value < Math.min(low, 0))) return `bars run past the axis (${low} to ${high}) and are cut short`;
  const base = low;
  const positive = values.filter((value) => value > 0);
  if (base === 0 || positive.length < 2) return undefined;
  const [least, most] = [Math.min(...positive), Math.max(...positive)];
  if (least <= base) return `bars start at ${base}, not 0, so a bar at or below it vanishes`;
  const lie = (most - base) / (least - base) / (most / least);
  return Math.abs(lie - 1) > 0.05 ? `bars start at ${base}, not 0, so their lengths exaggerate the difference ${lie.toFixed(1)} times; start the axis at 0` : undefined;
}

/**
 * Diagnostics that require the deterministic layout result rather than only
 * the source schema. Keeping these checks in the compiler response gives an
 * LLM actionable feedback before a malformed lesson reaches the renderer.
 */
export function analyzeResolvedLesson(lesson: ResolvedLesson): Diagnostic[] {
  const warnings: Diagnostic[] = [];

  lesson.scenes.forEach((scene, sceneIndex) => {
    const authoredObjects = scene.objects.filter(
      (object) => object.compositeParent === undefined,
    );
    scene.beats.forEach((beat, beatIndex) =>
      beat.actions.forEach((action, actionIndex) => {
        if (action.kind === "motion" && action.refused)
          warnings.push({ code: "MOTION_REFUSED", path: `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`, message: `${action.refused}; the motion is not played`, received: action.source });
      }),
    );
    authoredObjects.forEach((object, objectIndex) => {
      if (object.blocked) warnings.push({ code: "LAYOUT_COLLISION", path: `/scenes/${sceneIndex}/objects/${objectIndex}/placement`, message: `'${object.id}' has no open space beside what it is set on and is written across something drawn; show fewer things with it, shorten it, or set it elsewhere`, received: object.source.placement });
      if (object.raised) warnings.push({ code: "RAISED_TO_READABLE", path: `/scenes/${sceneIndex}/objects/${objectIndex}`, message: `'${object.id}' would be drawn too small to make out; it is drawn at the smallest size that reads`, received: object.source.size });
      const lie = lieFactor(object.source);
      if (lie === undefined) return;
      warnings.push({ code: "LIE_FACTOR", path: `/scenes/${sceneIndex}/objects/${objectIndex}`, message: `'${object.id}': ${lie}`, received: object.source.kind === "chart" ? object.source.yDomain : undefined });
    });
    // A subject squeezed to make room for everything else on screen is a step showing too much at once.
    authoredObjects.forEach((object, objectIndex) => {
      if (object.rank !== "lead") return;
      const fills = Math.max(object.box.w / (VIEW_WIDTH * 0.9), object.box.h / SUBJECT_HEIGHT);
      if (fills >= SPLIT_BELOW) return;
      warnings.push({
        code: "SPLIT_STEP",
        path: `/scenes/${sceneIndex}/objects/${objectIndex}`,
        message: `The subject '${object.id}' fills only ${Math.round(fills * 100)}% of the frame to make room for what is shown with it; split this step so the subject can be shown large`,
        received: object.box,
      });
    });
    authoredObjects.forEach((object, objectIndex) => {
      if (joinsTwo(object.source) || object.source.role === "background")
        return;
      const { x, y, w, h } = object.box;
      const overflow = {
        left: Math.max(0, SAFE_INSET - x),
        top: Math.max(0, SAFE_INSET - y),
        right: Math.max(0, x + w - (VIEW_WIDTH - SAFE_INSET)),
        bottom: Math.max(0, y + h - (VIEW_HEIGHT - SAFE_INSET)),
      };
      const amount = Math.max(
        overflow.left,
        overflow.top,
        overflow.right,
        overflow.bottom,
      );
      if (amount <= 0.5) return;
      warnings.push({
        code: "LAYOUT_OVERFLOW",
        path: `/scenes/${sceneIndex}/objects/${objectIndex}/placement`,
        message: `'${object.id}' extends ${amount.toFixed(1)} view units outside the safe frame; shorten it, reduce its size, or change its placement`,
        received: {
          box: object.box,
          safeFrame: [
            SAFE_INSET,
            SAFE_INSET,
            VIEW_WIDTH - SAFE_INSET,
            VIEW_HEIGHT - SAFE_INSET,
          ],
        },
      });
    });

    const visibleWindow = (
      object: (typeof authoredObjects)[number],
    ): [number, number] | undefined => {
      const targetsObject = (targets: string[]) => targets.includes(object.id);
      const show = scene.beats
        .flatMap((beat) => beat.actions)
        .find(
          (action) =>
            action.kind === "show" &&
            action.source.do === "show" &&
            targetsObject(action.source.targets),
        );
      const hide = scene.beats
        .flatMap((beat) => beat.actions)
        .find(
          (action) =>
            action.kind === "hide" &&
            action.source.do === "hide" &&
            targetsObject(action.source.targets),
        );
      // A picture that steps aside leaves its laid-out slot as it goes.
      const aside = scene.beats
        .flatMap((beat) => beat.actions)
        .find((action) => {
          const placement = object.source.placement;
          const bearer = (object.source.attach?.to ?? (placement && placement.mode !== "zone" ? placement.target : undefined))?.split(".")[0];
          return action.source.do === "aside" && (action.source.target === object.id || action.source.target === bearer);
        });
      // Its box is where it rests: once a journey takes it off, the box no longer says where it is.
      const departs = scene.beats
        .flatMap((beat) => beat.actions)
        .find((action) => action.kind === "motion" && action.source.do === "motion" && !("refused" in action && action.refused) && ["move", "fall", "wander", "along"].includes(action.source.motion) && (action.source.target === object.id || (action.source.with ?? []).includes(object.id)));
      const startsVisible = object.source.initial === "visible";
      if (!startsVisible && !show) return undefined;
      return [startsVisible ? 0 : show!.start, Math.min(hide?.start ?? scene.duration, aside?.start ?? scene.duration, departs?.start ?? scene.duration)];
    };
    const intentionallyRelated = (
      a: (typeof authoredObjects)[number],
      b: (typeof authoredObjects)[number],
    ) => {
      const targets = (
        object: (typeof authoredObjects)[number],
        id: string,
      ) => {
        const placement = object.source.placement;
        return (
          (placement?.mode === "anchor" || placement?.mode === "relative") &&
          (placement.target === id || placement.target.startsWith(`${id}.`))
        );
      };
      // Set beside a thing that stands, sits or is fixed on the other is set on the other too: a second caravan by the one on the map.
      // A thing attached to another stands where that one stands: wings on a bee set near a flower are near it too.
      const byId = new Map(authoredObjects.map((object) => [object.id, object]));
      const onOther = (object: (typeof authoredObjects)[number], id: string) => {
        const seen = new Set<string>();
        for (let at = object, first = true; at && !seen.has(at.id); ) {
          seen.add(at.id);
          const placement = at.source.placement;
          const written = "in" in at.source && typeof at.source.in === "string" ? at.source.in : undefined;
          const fixed = at.source.attach?.to ?? (placement?.mode === "anchor" || (placement?.mode === "relative" && (first || ["on", "inside"].includes(placement.relation) || (placement.relation === "near" && placement.target.includes(".")))) ? placement.target : written);
          if (fixed === undefined) return false;
          if (fixed === id || fixed.startsWith(`${id}.`)) return true;
          first = at.source.attach !== undefined;
          at = byId.get(fixed.split(".")[0])!;
        }
        return false;
      };
      // A picture fixed whole on another stands in for it, as a sunset sky laid over the day sky: what is set on the one is set on the other.
      const standsIn = (over: (typeof authoredObjects)[number], set: (typeof authoredObjects)[number]) => {
        const host = over.source.attach?.to;
        return host !== undefined && !host.includes(".") && onOther(set, host);
      };
      return targets(a, b.id) || targets(b, a.id) || onOther(a, b.id) || onOther(b, a.id) || standsIn(a, b) || standsIn(b, a);
    };
    for (let left = 0; left < authoredObjects.length; left++) {
      for (let right = left + 1; right < authoredObjects.length; right++) {
        const a = authoredObjects[left];
        const b = authoredObjects[right];
        // A route or a measure is drawn over the things it joins by definition.
        const ROUTES = new Set(["line", "span", "curve", "angle", "path"]);
        if (ROUTES.has(a.source.kind) || ROUTES.has(b.source.kind)) continue;
        if (
          [a.source.role, b.source.role].some(
            (role) => role === "background" || role === "annotation",
          )
        )
          continue;
        if (
          [a.source, b.source].some(
            (source) => source.space === "screen" || source.role === "hud",
          )
        )
          continue;
        if (intentionallyRelated(a, b)) continue;
        const aw = visibleWindow(a);
        const bw = visibleWindow(b);
        if (!aw || !bw || Math.max(aw[0], bw[0]) >= Math.min(aw[1], bw[1]))
          continue;
        const x = Math.max(a.box.x, b.box.x);
        const y = Math.max(a.box.y, b.box.y);
        const width = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - x;
        const height = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - y;
        const ratio = drawnOverlap(a, b);
        if (ratio < 0.55) continue;
        warnings.push({
          code: "LAYOUT_COLLISION",
          path: `/scenes/${sceneIndex}/objects/${right}/placement`,
          message: `'${a.id}' and '${b.id}' overlap by ${(ratio * 100).toFixed(0)}% while both are visible`,
          received: {
            first: a.id,
            second: b.id,
            overlap: { x, y, w: width, h: height },
          },
          suggestions: [
            "Use separate zones, relative placement, or non-overlapping show/hide windows",
          ],
        });
      }
    }

    scene.beats.forEach((beat, beatIndex) => {
      beat.actions.forEach((action, actionIndex) => {
        if (
          action.kind === "attention" &&
          action.source.do === "attention" &&
          action.source.verb === "callout"
        ) {
          const target = targetPoint(scene, action.source.target);
          if (target) {
            const box = calloutBox(
              target,
              action.source.title,
              action.source.text,
              action.source.side,
            );
            const overflow = Math.max(
              SAFE_INSET - box.x,
              SAFE_INSET - box.y,
              box.x + box.w - (VIEW_WIDTH - SAFE_INSET),
              box.y + box.h - (VIEW_HEIGHT - SAFE_INSET),
            );
            if (overflow > 0.5)
              warnings.push({
                code: "CALLOUT_OVERFLOW",
                path: `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`,
                message: `Callout for '${action.source.target}' extends ${overflow.toFixed(1)} view units outside the safe frame`,
                received: { target, box, side: action.source.side ?? "auto" },
                suggestions: [
                  "Choose the inward-facing side, shorten the text, or move the target away from the frame edge",
                ],
              });
          }
        }
        if (action.kind !== "motion" || action.source.do !== "motion") return;
        const source = action.source;
        const target = scene.objects.find(
          (object) => object.id === source.target,
        );
        const actionPath = `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`;
        if (!target) return;

        if (source.motion === "along") {
          const pathObject = scene.objects.find(
            (object) => object.id === source.along,
          );
          const endpoints = pathObject?.endpoints;
          if (!endpoints) return;
          // A traveller that has already journeyed this scene is not where it rested; the route is
          // re-headed to where the last journey left it, so measuring from rest would be false.
          const travelledBefore = scene.beats.some((earlier, earlierIndex) =>
            earlier.actions.some((candidate, candidateIndex) =>
              (earlierIndex < beatIndex || (earlierIndex === beatIndex && candidateIndex < actionIndex)) &&
              candidate.kind === "motion" && candidate.source.do === "motion" &&
              candidate.source.motion !== "spin" && candidate.source.target === source.target));
          if (travelledBefore) return;
          const nearest = Math.min(
            Math.hypot(
              target.position[0] - endpoints.from[0],
              target.position[1] - endpoints.from[1],
            ),
            Math.hypot(
              target.position[0] - endpoints.to[0],
              target.position[1] - endpoints.to[1],
            ),
          );
          if (nearest > 0.5) {
            warnings.push({
              code: "MOTION_PATH_ADJUSTED",
              path: `${actionPath}/along`,
              message: `Motion target '${target.id}' is ${nearest.toFixed(1)} view units from the nearest endpoint of '${pathObject.id}'; a lead-in segment was added to prevent a jump`,
              received: source.along,
              suggestions: [
                "Anchor the moving object to the start or end of the path",
              ],
            });
          }
        }
      });
    });
  });

  return warnings;
}
