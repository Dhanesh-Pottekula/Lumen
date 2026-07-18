import Ajv2020 from "ajv/dist/2020.js";
import type { Diagnostic, ValidationResult } from "./diagnostics";
import { formatAjvErrors } from "./diagnostics";
import { LESSON_SPEC_SCHEMA } from "./schema";
import { assetAnchors, availableAssets, resolveAsset } from "./registry";
import { parseTarget } from "./target";
import { analyzeLifecycle } from "./lifecycle";
import type { ActionSpec, LessonSpec, ObjectSpec, SceneSpec } from "./types";
import { parseSvgArtwork, svgArtworkError, svgFragmentError } from "./svg";

const validateStructure = new Ajv2020({ allErrors: true, strict: true }).compile(LESSON_SPEC_SCHEMA);

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

function suggestions(value: string, choices: string[]): string[] | undefined {
  const matches = choices
    .map((choice) => ({ choice, score: distance(value.toLowerCase(), choice.toLowerCase()) }))
    .filter(({ score }) => score <= Math.max(2, Math.floor(value.length * 0.35)))
    .sort((a, b) => a.score - b.score || a.choice.localeCompare(b.choice))
    .slice(0, 3)
    .map(({ choice }) => choice);
  return matches.length ? matches : undefined;
}

function duplicateDiagnostics(values: string[], basePath: string): Diagnostic[] {
  const seen = new Set<string>();
  const errors: Diagnostic[] = [];
  values.forEach((id, index) => {
    if (seen.has(id)) errors.push({ code: "DUPLICATE_ID", path: `${basePath}/${index}/id`, message: `Duplicate id '${id}'`, received: id });
    seen.add(id);
  });
  return errors;
}

function referenceDiagnostic(
  target: string,
  path: string,
  objects: Map<string, ObjectSpec>,
): Diagnostic | undefined {
  const ref = parseTarget(target, new Set(objects.keys()));
  if (!ref.anchor && objects.has(ref.objectId)) return undefined;
  if (ref.anchor) {
    const objectId = ref.objectId;
    const anchor = ref.anchor;
    const object = objects.get(objectId);
    if (object) {
      const generic = ["center", "top", "bottom", "left", "right"];
      let anchors = object.kind === "visual"
        ? assetAnchors(object.asset) ?? []
        : generic;
      if (object.kind === "chart") {
        const count = object.chart === "riemann"
          ? ({ few: 4, several: 8, many: 16, dense: 32 }[object.rectangles ?? "several"])
          : object.data?.length ?? object.series?.length ?? 0;
        const prefix = object.chart === "bar" || object.chart === "riemann" ? "bar" : object.chart === "pie" || object.chart === "donut" ? "slice" : "pt";
        anchors = [...generic, "peak", "first", "last", ...Array.from({ length: count }, (_, index) => `${prefix}${index}`)];
      }
      if (object.kind === "map") {
        anchors = [...generic, ...object.features.map((feature) => feature.id), ...(object.places ?? []).map((place) => place.name), ...(object.markers ?? []).flatMap((marker) => marker.label ? [marker.label] : [])];
      }
      if (object.kind === "timeline") anchors = [...generic, ...(object.events ?? []).map((_event, index) => `ev${index}`)];
      if (anchors.includes(anchor)) return undefined;
      return {
        code: "INVALID_ANCHOR",
        path,
        message: `'${objectId}' does not expose anchor '${anchor}'`,
        received: target,
        suggestions: suggestions(anchor, anchors),
        availableTargets: anchors.map((name) => `${objectId}.${name}`),
      };
    }
  }
  const ids = [...objects.keys()];
  return {
    code: "UNKNOWN_TARGET",
    path,
    message: `Unknown target '${target}'`,
    received: target,
    suggestions: suggestions(target, ids),
    availableTargets: ids,
  };
}

function actionReferences(action: ActionSpec): Array<{ target: string; suffix: string }> {
  switch (action.do) {
    case "show":
    case "hide":
      return action.targets.map((target, index) => ({ target, suffix: `/targets/${index}` }));
    case "camera":
    case "label":
    case "emphasize":
    case "attention":
      return [{ target: action.target, suffix: "/target" }];
    case "motion":
      return [
        { target: action.target, suffix: "/target" },
        ...(action.to ? [{ target: action.to, suffix: "/to" }] : []),
        ...(action.around ? [{ target: action.around, suffix: "/around" }] : []),
        ...(action.along ? [{ target: action.along, suffix: "/along" }] : []),
      ];
    case "effect":
      if (action.effect === "flow") return [{ target: action.from, suffix: "/from" }, { target: action.to, suffix: "/to" }];
      return [{ target: action.target, suffix: "/target" }];
    case "tour":
      return action.stops.map((stop, index) => ({ target: stop.target, suffix: `/stops/${index}/target` }));
  }
}

function semanticScene(scene: SceneSpec, sceneIndex: number): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const base = `/scenes/${sceneIndex}`;
  const errors = [
    ...duplicateDiagnostics(scene.objects.map((object) => object.id), `${base}/objects`),
    ...duplicateDiagnostics(scene.beats.map((beat) => beat.id), `${base}/beats`),
  ];
  const warnings: Diagnostic[] = [];
  const objects = new Map<string, ObjectSpec>();
  for (const object of scene.objects) {
    objects.set(object.id, object);
    if (object.kind === "svg-composite") {
      for (const part of object.parts) objects.set(`${object.id}.${part.id}`, object);
    }
    if (object.kind === "svg-artwork") {
      for (const part of parseSvgArtwork(object.svg).value?.parts ?? []) objects.set(`${object.id}.${part.id}`, object);
    }
  }
  const lifecycle = analyzeLifecycle(scene, sceneIndex);
  errors.push(...lifecycle.errors);
  const requireTemporaryCleanup = (id: string, path: string) => {
    const window = lifecycle.windows.get(id);
    const becomesVisible = window?.initiallyVisible || window?.showBeat !== undefined;
    if (becomesVisible && window?.hideBeat === undefined) {
      errors.push({
        code: "TEMPORARY_VISUAL_PERSISTS",
        path,
        message: `Temporary visual '${id}' remains visible at the end of the scene; add a later hide action`,
        received: id,
      });
    }
  };
  scene.objects.forEach((object, objectIndex) => {
    if (object.temporary) requireTemporaryCleanup(object.id, `${base}/objects/${objectIndex}/temporary`);
    if (object.kind === "svg-composite") {
      object.parts.forEach((part, partIndex) => {
        if (part.temporary) requireTemporaryCleanup(`${object.id}.${part.id}`, `${base}/objects/${objectIndex}/parts/${partIndex}/temporary`);
      });
    }
    if (object.kind === "svg-artwork") {
      const availableParts = new Set(parseSvgArtwork(object.svg).value?.parts.map((part) => part.id) ?? []);
      object.temporaryParts?.forEach((part, partIndex) => {
        if (!availableParts.has(part)) {
          errors.push({
            code: "UNKNOWN_TARGET",
            path: `${base}/objects/${objectIndex}/temporaryParts/${partIndex}`,
            message: `Unknown SVG part '${part}' in temporaryParts`,
            received: part,
            availableTargets: [...availableParts],
          });
          return;
        }
        requireTemporaryCleanup(`${object.id}.${part}`, `${base}/objects/${objectIndex}/temporaryParts/${partIndex}`);
      });
    }
  });
  const placementState = new Map<string, "visiting" | "done">();
  const placementStack: string[] = [];
  const visitPlacement = (id: string) => {
    if (placementState.get(id) === "done") return;
    if (placementState.get(id) === "visiting") {
      const start = placementStack.indexOf(id);
      const cycle = [...placementStack.slice(start), id];
      errors.push({ code: "PLACEMENT_CYCLE", path: `${base}/objects`, message: `Placement cycle: ${cycle.join(" -> ")}`, received: cycle });
      return;
    }
    placementState.set(id, "visiting");
    placementStack.push(id);
    const object = objects.get(id);
    const placement = object?.placement;
    if (placement?.mode === "relative" || placement?.mode === "anchor") {
      const target = parseTarget(placement.target, new Set(objects.keys())).objectId;
      if (objects.has(target)) visitPlacement(target);
    }
    placementStack.pop();
    placementState.set(id, "done");
  };
  scene.objects.forEach((object) => visitPlacement(object.id));

  scene.objects.forEach((object, objectIndex) => {
    if (object.kind === "visual" && !resolveAsset(object.asset)) {
      errors.push({
        code: "UNKNOWN_ASSET",
        path: `${base}/objects/${objectIndex}/asset`,
        message: `Unknown catalog asset '${object.asset}'`,
        received: object.asset,
        suggestions: suggestions(object.asset, availableAssets()),
      });
    }
    if (object.kind === "group") {
      const nestedComposite = object.children.findIndex((child) => child.kind === "svg-composite" || child.kind === "svg-artwork");
      if (nestedComposite >= 0) {
        errors.push({
          code: "INVALID_SVG",
          path: `${base}/objects/${objectIndex}/children/${nestedComposite}`,
          message: "SVG artwork objects must be top-level scene objects so their parts remain independently targetable",
          received: object.children[nestedComposite],
        });
      }
    }
    if (object.kind === "svg-composite") {
      errors.push(...duplicateDiagnostics(object.parts.map((part) => part.id), `${base}/objects/${objectIndex}/parts`));
      const [vx, vy, vw, vh] = object.viewBox;
      object.parts.forEach((part, partIndex) => {
        const svgError = svgFragmentError(part.svg);
        if (svgError) {
          errors.push({
            code: "INVALID_SVG",
            path: `${base}/objects/${objectIndex}/parts/${partIndex}/svg`,
            message: svgError,
            received: part.svg,
          });
        }
        const [x, y, width, height] = part.bounds;
        if (x < vx || y < vy || x + width > vx + vw || y + height > vy + vh) {
          errors.push({
            code: "INVALID_SVG_BOUNDS",
            path: `${base}/objects/${objectIndex}/parts/${partIndex}/bounds`,
            message: `SVG part bounds must stay inside the composite viewBox`,
            received: part.bounds,
          });
        }
      });
    }
    if (object.kind === "svg-artwork") {
      const svgError = svgArtworkError(object.svg);
      if (svgError) {
        errors.push({
          code: "INVALID_SVG",
          path: `${base}/objects/${objectIndex}/svg`,
          message: svgError,
          received: object.svg,
        });
      }
    }
    const references =
      object.kind === "line"
        ? [
            { target: object.from, suffix: "/from" },
            { target: object.to, suffix: "/to" },
          ]
        : object.placement?.mode === "relative" || object.placement?.mode === "anchor"
          ? [{ target: object.placement.target, suffix: "/placement/target" }]
          : [];
    references.forEach(({ target, suffix }) => {
      const error = referenceDiagnostic(target, `${base}/objects/${objectIndex}${suffix}`, objects);
      if (error) errors.push(error);
    });
  });

  scene.beats.forEach((beat, beatIndex) => {
    const shownThisBeat = new Set(beat.actions.flatMap((action) => action.do === "show" ? action.targets : []));
    beat.actions.forEach((action, actionIndex) => {
      const actionPath = `${base}/beats/${beatIndex}/actions/${actionIndex}`;
      actionReferences(action).forEach(({ target, suffix }) => {
        const spatialError = referenceDiagnostic(target, `${actionPath}${suffix}`, objects);
        const error = (action.do === "show" || action.do === "hide") && !objects.has(target)
          ? {
              code: "INVALID_ACTION_TARGET" as const,
              path: `${actionPath}${suffix}`,
              message: `${action.do} targets must be object ids, not anchors`,
              received: target,
              availableTargets: [...objects.keys()],
            }
          : spatialError;
        if (error) errors.push(error);
        const objectId = parseTarget(target, new Set(objects.keys())).objectId;
        if (!error && action.do !== "show" && action.do !== "hide") {
          const window = lifecycle.windows.get(objectId);
          const everVisible = window?.initiallyVisible || window?.showBeat !== undefined;
          const visibleNow = window?.initiallyVisible
            ? window.hideBeat === undefined || window.hideBeat >= beatIndex
            : shownThisBeat.has(objectId) || (window?.showBeat !== undefined && window.showBeat < beatIndex && (window.hideBeat === undefined || window.hideBeat >= beatIndex));
          if (!everVisible) {
            errors.push({
              code: "INVALID_LIFECYCLE",
              path: `${actionPath}${suffix}`,
              message: `Target '${objectId}' never becomes visible in this scene`,
              received: target,
            });
          } else if (!visibleNow) {
            warnings.push({
              code: "TARGET_NOT_VISIBLE",
              path: `${actionPath}${suffix}`,
              message: `Target '${objectId}' is used before it is shown`,
              received: target,
            });
          }
        }
      });
    });
  });
  return { errors, warnings };
}

export function validateLessonSpec(input: unknown): ValidationResult<LessonSpec> {
  if (!validateStructure(input)) return { valid: false, errors: formatAjvErrors(validateStructure.errors, input) };
  const spec = input as LessonSpec;
  const errors = duplicateDiagnostics(spec.scenes.map((scene) => scene.id), "/scenes");
  const warnings: Diagnostic[] = [];
  spec.scenes.forEach((scene, index) => {
    const result = semanticScene(scene, index);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });
  return errors.length ? { valid: false, errors } : { valid: true, value: spec, warnings };
}
