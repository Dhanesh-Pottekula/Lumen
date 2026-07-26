import Ajv2020 from "ajv/dist/2020.js";
import { parseExpr } from "../gcl/expr";
import { validateMathText } from "../render/mathtext";
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
          : "data" in object ? object.data.length : "series" in object ? object.series.length : 0;
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
      return [{ target: action.target, suffix: "/target" }];
    case "attention":
      return [
        { target: action.target, suffix: "/target" },
        ...(action.verb === "pointer" ? [{ target: action.from, suffix: "/from" }] : []),
      ];
    case "motion":
      if (action.motion === "move" || action.motion === "fall") return [{ target: action.target, suffix: "/target" }, { target: action.to, suffix: "/to" }];
      if (action.motion === "orbit") return [{ target: action.target, suffix: "/target" }, { target: action.around, suffix: "/around" }];
      if (action.motion === "along") return [{ target: action.target, suffix: "/target" }, { target: action.along, suffix: "/along" }];
      return [{ target: action.target, suffix: "/target" }];
    case "effect":
      if (action.effect === "flow") return [{ target: action.from, suffix: "/from" }, { target: action.to, suffix: "/to" }];
      return [{ target: action.target, suffix: "/target" }];
    case "tour":
      return action.stops.map((stop, index) => ({ target: stop.target, suffix: `/stops/${index}/target` }));
  }
}

function increasingDomain(domain: [number, number] | undefined, path: string): Diagnostic[] {
  if (!domain || domain[0] < domain[1]) return [];
  return [{
    code: "INVALID_DOMAIN",
    path,
    message: `Domain minimum must be less than its maximum`,
    received: domain,
  }];
}

function expressionDiagnostics(
  expression: string,
  path: string,
  variable: "x" | "u",
  domain: [number, number],
): Diagnostic[] {
  const parsed = parseExpr(expression);
  if (!parsed.valid) {
    return [{ code: "INVALID_EXPRESSION", path, message: parsed.error, received: expression }];
  }
  const values = Array.from({ length: 17 }, (_value, index) => {
    const input = domain[0] + (domain[1] - domain[0]) * (index / 16);
    return parsed.evaluate({ [variable]: input });
  });
  if (values.some(Number.isFinite)) return [];
  return [{
    code: "INVALID_EXPRESSION",
    path,
    message: `Expression produces no finite values across ${variable} in [${domain[0]}, ${domain[1]}]`,
    received: expression,
  }];
}

function duplicateNamedValues(values: string[], path: string, label: string): Diagnostic[] {
  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) diagnostics.push({ code: "INVALID_DATA", path: `${path}/${index}`, message: `Duplicate ${label} '${value}'`, received: value });
    seen.add(value);
  });
  return diagnostics;
}

function objectSemanticDiagnostics(object: ObjectSpec, path: string): Diagnostic[] {
  const errors: Diagnostic[] = [];
  if (object.kind === "equation") {
    const math = validateMathText(object.value);
    if (!math.valid) errors.push({ code: "UNSUPPORTED_MATH_COMMAND", path: `${path}/value`, message: math.error, received: object.value });
  }
  if (object.kind === "curve") {
    errors.push(...increasingDomain(object.domain, `${path}/domain`));
    const domain = object.domain ?? [0, 1];
    errors.push(...expressionDiagnostics(object.x, `${path}/x`, "u", domain));
    errors.push(...expressionDiagnostics(object.y, `${path}/y`, "u", domain));
  }
  if (object.kind === "chart") {
    errors.push(...increasingDomain(object.xDomain, `${path}/xDomain`));
    errors.push(...increasingDomain(object.yDomain, `${path}/yDomain`));
    if (object.chart === "bar" || object.chart === "pie" || object.chart === "donut") {
      errors.push(...duplicateNamedValues(object.data.map((datum) => datum.label), `${path}/data`, "chart label"));
      if ((object.chart === "pie" || object.chart === "donut") && object.data.some((datum) => datum.value < 0)) {
        errors.push({ code: "INVALID_DATA", path: `${path}/data`, message: `${object.chart} chart values cannot be negative`, received: object.data });
      }
      if ((object.chart === "pie" || object.chart === "donut") && object.data.every((datum) => datum.value === 0)) {
        errors.push({ code: "INVALID_DATA", path: `${path}/data`, message: `${object.chart} chart requires at least one positive value`, received: object.data });
      }
    }
    if (object.chart === "line" || object.chart === "area") {
      object.series.slice(1).forEach(([x], index) => {
        if (x <= object.series[index][0]) errors.push({
          code: "INVALID_DATA",
          path: `${path}/series/${index + 1}/0`,
          message: `${object.chart} series x-values must be strictly increasing`,
          received: x,
        });
      });
    }
    if (object.chart === "function" || object.chart === "riemann") {
      errors.push(...expressionDiagnostics(object.function, `${path}/function`, "x", object.xDomain ?? [-5, 5]));
    }
  }
  if (object.kind === "shape") {
    if (object.shape === "polygon" && object.sides === undefined) {
      errors.push({ code: "INVALID_DATA", path: `${path}/sides`, message: "Polygon shapes require sides", received: object.sides });
    }
    if (object.shape !== "polygon" && object.sides !== undefined) {
      errors.push({ code: "INVALID_DATA", path: `${path}/sides`, message: `sides is only valid for polygon shapes`, received: object.sides });
    }
  }
  if (object.kind === "timeline") {
    if (!(object.from < object.to)) errors.push({ code: "INVALID_DOMAIN", path, message: "Timeline from must be less than to", received: [object.from, object.to] });
    object.events?.forEach((event, index) => {
      if (event.at < object.from || event.at > object.to) errors.push({ code: "INVALID_DATA", path: `${path}/events/${index}/at`, message: "Timeline event lies outside the timeline range", received: event.at });
    });
    object.eras?.forEach((era, index) => {
      if (!(era.from < era.to) || era.from < object.from || era.to > object.to) errors.push({ code: "INVALID_DATA", path: `${path}/eras/${index}`, message: "Timeline era must be ordered and remain inside the timeline range", received: era });
    });
    const playhead = object.playhead;
    if (typeof playhead === "number" && (playhead < object.from || playhead > object.to)) errors.push({ code: "INVALID_DATA", path: `${path}/playhead`, message: "Timeline playhead lies outside the timeline range", received: playhead });
    if (typeof playhead === "object" && (!(playhead.from < playhead.to) || playhead.from < object.from || playhead.to > object.to)) errors.push({ code: "INVALID_DATA", path: `${path}/playhead`, message: "Animated playhead must be ordered and remain inside the timeline range", received: playhead });
  }
  if (object.kind === "table") {
    const columns = object.rows[0]?.length ?? 0;
    object.rows.forEach((row, index) => {
      if (row.length !== columns) errors.push({ code: "INVALID_DATA", path: `${path}/rows/${index}`, message: `Table row has ${row.length} columns; expected ${columns}`, received: row });
    });
  }
  if (object.kind === "map") {
    errors.push(...duplicateNamedValues(object.features.map((feature) => feature.id), `${path}/features`, "feature id"));
    errors.push(...duplicateNamedValues((object.places ?? []).map((place) => place.name), `${path}/places`, "place name"));
    errors.push(...duplicateNamedValues((object.markers ?? []).flatMap((marker) => marker.label ? [marker.label] : []), `${path}/markers`, "marker label"));
    const names = new Set([
      ...object.features.map((feature) => feature.id),
      ...(object.places ?? []).map((place) => place.name),
      ...(object.markers ?? []).flatMap((marker) => marker.label ? [marker.label] : []),
    ]);
    object.features.forEach((feature, featureIndex) => feature.rings.forEach((ring, ringIndex) => {
      const distinct = new Set(ring.map(([x, y]) => `${x}:${y}`));
      if (distinct.size < 3) errors.push({
        code: "INVALID_DATA",
        path: `${path}/features/${featureIndex}/rings/${ringIndex}`,
        message: "Map rings require at least three distinct points",
        received: ring,
      });
    }));
    object.flows?.forEach((flow, index) => {
      if (typeof flow.from === "string" && !names.has(flow.from)) errors.push({ code: "UNKNOWN_MAP_PLACE", path: `${path}/flows/${index}/from`, message: `Unknown map place '${flow.from}'`, received: flow.from, availableTargets: [...names] });
      if (typeof flow.to === "string" && !names.has(flow.to)) errors.push({ code: "UNKNOWN_MAP_PLACE", path: `${path}/flows/${index}/to`, message: `Unknown map place '${flow.to}'`, received: flow.to, availableTargets: [...names] });
    });
  }
  if (object.kind === "group") {
    errors.push(...duplicateNamedValues(object.children.map((child) => child.id), `${path}/children`, "group child id"));
    object.children.forEach((child, index) => {
      if (child.placement || child.initial || child.space || child.temporary) {
        errors.push({
          code: "INVALID_GROUP_CHILD",
          path: `${path}/children/${index}`,
          message: "Group children are layout content; placement, initial, space, and temporary belong on the parent group",
          received: child,
        });
      }
      errors.push(...objectSemanticDiagnostics(child, `${path}/children/${index}`));
    });
  }
  return errors;
}

function semanticScene(scene: SceneSpec, sceneIndex: number): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const base = `/scenes/${sceneIndex}`;
  const errors = [
    ...duplicateDiagnostics(scene.objects.map((object) => object.id), `${base}/objects`),
    ...duplicateDiagnostics(scene.beats.map((beat) => beat.id), `${base}/beats`),
  ];
  const warnings: Diagnostic[] = [];
  const spatialReferences = new Set<string>();
  scene.objects.forEach((object) => {
    if (object.kind === "line") { spatialReferences.add(object.from); spatialReferences.add(object.to); }
    if (object.placement?.mode === "relative" || object.placement?.mode === "anchor") spatialReferences.add(object.placement.target);
  });
  scene.beats.forEach((beat) => beat.actions.forEach((action) => {
    if (action.do === "show" || action.do === "hide") return;
    actionReferences(action).forEach(({ target }) => spatialReferences.add(target));
  }));
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
    errors.push(...objectSemanticDiagnostics(object, `${base}/objects/${objectIndex}`));
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
      } else {
        const parsed = parseSvgArtwork(object.svg).value;
        parsed?.parts.forEach((part) => {
          if (part.boundsPrecision !== "viewbox-fallback") return;
          const target = `${object.id}.${part.id}`;
          if (![...spatialReferences].some((reference) => reference === target || reference.startsWith(`${target}.`))) return;
          warnings.push({
            code: "IMPRECISE_SVG_BOUNDS",
            path: `${base}/objects/${objectIndex}/svg`,
            message: `Targeted SVG part '${target}' uses whole-viewBox bounds: ${part.boundsReason ?? "geometry could not be measured"}`,
            received: target,
            suggestions: ["Use ordinary untransformed SVG primitives or simple path commands for independently targeted groups"],
          });
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
  const motions = new Map<string, string>();
  scene.beats.forEach((beat, beatIndex) => beat.actions.forEach((action, actionIndex) => {
    if (action.do !== "motion") return;
    const previous = motions.get(action.target);
    const path = `${base}/beats/${beatIndex}/actions/${actionIndex}`;
    if (previous) errors.push({
      code: "MULTIPLE_MOTION",
      path,
      message: `Object '${action.target}' already has a motion at ${previous}; one motion per object is currently supported`,
      received: action,
    });
    else motions.set(action.target, path);
  }));
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
