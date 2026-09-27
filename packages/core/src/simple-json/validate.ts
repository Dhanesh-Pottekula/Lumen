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
// The same rules applied to ONE scene, so a film with a bad scene in it can lose that scene instead
// of losing every scene. `$defs` rides along because the scene schema refs into it.
const validateScene = new Ajv2020({ allErrors: true, strict: true }).compile({
  ...(LESSON_SPEC_SCHEMA.properties.scenes.items as Record<string, unknown>),
  $defs: LESSON_SPEC_SCHEMA.$defs,
});
const validateAction = new Ajv2020({ allErrors: true, strict: true }).compile({
  ...(LESSON_SPEC_SCHEMA.properties.scenes.items.properties.beats.items.properties.actions.items as Record<string, unknown>),
  $defs: LESSON_SPEC_SCHEMA.$defs,
});
const validateObject = new Ajv2020({ allErrors: true, strict: true }).compile({
  ...(LESSON_SPEC_SCHEMA.$defs.object as Record<string, unknown>),
  $defs: LESSON_SPEC_SCHEMA.$defs,
});

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

/** Kinds that can be the ring an orbit rides: something with a round extent, never a connector. */
const RING_KINDS = new Set(["shape", "svg-artwork", "curve", "visual"]);

const ZONE_TOKENS = new Set([
  "title", "main", "main-left", "main-right", "support", "footer", "background", "overlay", "hud",
]);

/** Reject a connector or angle whose ends are the same thing: it has no length and draws nothing. */
function degenerateAnchors(object: ObjectSpec, path: string): Diagnostic[] {
  const ends = objectAnchors(object);
  if (ends.length === 0 || new Set(ends.map(({ target }) => target)).size > 1) return [];

  return [{
    code: "INVALID_ACTION_TARGET",
    path: `${path}${ends[1].suffix}`,
    message: `A '${object.kind}' needs two different things; both ends name '${ends[0].target}'`,
    received: ends[0].target,
  }];
}

/** The ids one object pins itself to — the ends of a connector, the corner and arms of an angle. */
function objectAnchors(object: ObjectSpec): Array<{ target: string; suffix: string }> {
  if (object.kind === "line" || object.kind === "span")
    return [
      { target: object.from, suffix: "/from" },
      { target: object.to, suffix: "/to" },
    ];
  if (object.kind === "curve" && object.from !== undefined && object.to !== undefined)
    return [
      { target: object.from, suffix: "/from" },
      { target: object.to, suffix: "/to" },
    ];
  if (object.kind === "angle")
    return [
      { target: object.at, suffix: "/at" },
      { target: object.from, suffix: "/from" },
      { target: object.to, suffix: "/to" },
    ];

  return [];
}

function actionReferences(action: ActionSpec): Array<{ target: string; suffix: string; mustConnect?: boolean; notSelf?: boolean; mustRing?: boolean }> {
  switch (action.do) {
    case "show":
    case "hide":
      return action.targets.map((target, index) => ({ target, suffix: `/targets/${index}` }));
    case "camera":
    case "label":
    case "emphasize":
    case "fill":
      return [{ target: action.target, suffix: "/target" }];
    case "attention":
      return [
        { target: action.target, suffix: "/target" },
        ...(action.verb === "pointer" ? [{ target: action.from, suffix: "/from" }] : []),
      ];
    case "motion":
      // A zone is a legal destination: without it a scene can only travel to another OBJECT, so the
      // writer declares an outline circle purely as a waypoint and the reader sees a phantom ring.
      if (action.motion === "move" || action.motion === "fall")
        return [{ target: action.target, suffix: "/target" }, ...(ZONE_TOKENS.has(action.to) ? [] : [{ target: action.to, suffix: "/to", notSelf: true }])];
      if (action.motion === "orbit")
        return [{ target: action.target, suffix: "/target" }, { target: action.around, suffix: "/around" }];

      // `along` reads its route from the named object's ENDPOINTS, which only a `line` or a `span`
      // has. Pointed at anything else — a `curve`, a `shape` — the route collapses to a single point
      // and the traveller stands perfectly still, with nothing anywhere saying why.
      if (action.motion === "along")
        return [{ target: action.target, suffix: "/target" }, { target: action.along, suffix: "/along", mustConnect: true }];
      return [{ target: action.target, suffix: "/target" }, ...(action.about === undefined ? [] : [{ target: action.about, suffix: "/about" }])];
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

/**
 * A curve's own domain, which may run either way.
 *
 * `[0, -1.571]` is a quarter turn drawn clockwise — a real thing to ask for, and the direction a
 * traveller walks it. Only a domain of zero span is refused: that curve is one point.
 */
function spannedDomain(domain: [number, number] | undefined, path: string): Diagnostic[] {
  if (!domain || domain[0] !== domain[1]) return [];
  return [{
    code: "INVALID_DOMAIN",
    path,
    message: `A domain of zero span draws one point, not a curve`,
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

  // ⚠️ A NAME THE RENDERER NEVER BINDS EVALUATES TO ZERO, NOT TO AN ERROR. `2*cos(t)` where the
  // variable is `u` is a constant, so every sample lands on one point: the curve is drawn with no
  // length and nothing appears, and a traveller sent along it never moves.
  const stray = parsed.variables.filter((name) => name !== variable);
  if (stray.length > 0) {
    return [{
      code: "INVALID_EXPRESSION",
      path,
      message: `Unknown variable ${stray.map((name) => `'${name}'`).join(", ")}; write the expression in terms of '${variable}'`,
      received: expression,
      suggestions: [expression.replaceAll(new RegExp(`\\b${stray[0]}\\b`, "g"), variable)],
    }];
  }

  const values = Array.from({ length: 17 }, (_value, index) => {
    const input = domain[0] + (domain[1] - domain[0]) * (index / 16);
    return parsed.evaluate({ [variable]: input });
  });
  if (!values.some(Number.isFinite)) {
    return [{
      code: "INVALID_EXPRESSION",
      path,
      message: `Expression produces no finite values across ${variable} in [${domain[0]}, ${domain[1]}]`,
      received: expression,
    }];
  }

  return [];
}

/** Reject a curve that never moves: both expressions constant is a point, drawn as nothing at all. */
function movingCurve(x: string, y: string, path: string, domain: [number, number]): Diagnostic[] {
  const at = (expression: string, u: number): number => {
    const parsed = parseExpr(expression);
    return parsed.valid ? parsed.evaluate({ u }) : Number.NaN;
  };
  const samples = Array.from({ length: 9 }, (_value, index) => {
    const u = domain[0] + (domain[1] - domain[0]) * (index / 8);
    return [at(x, u), at(y, u)] as const;
  });
  const [x0, y0] = samples[0];
  if (samples.some(([px, py]) => Math.abs(px - x0) > 1e-9 || Math.abs(py - y0) > 1e-9)) return [];

  return [{
    code: "INVALID_EXPRESSION",
    path: `${path}/x`,
    message: `A curve whose x and y never change is one point, not a line; make at least one depend on 'u'`,
    received: `x=${x}, y=${y}`,
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
    if ((object.from === undefined) !== (object.to === undefined))
      errors.push({
        code: "INVALID_ACTION_TARGET",
        path: `${path}/${object.from === undefined ? "from" : "to"}`,
        message: `A curve laid between two things needs both 'from' and 'to'`,
        received: object.from ?? object.to,
      });
    errors.push(...spannedDomain(object.domain, `${path}/domain`));
    const domain = object.domain ?? [0, 1];
    const expressions = [
      ...expressionDiagnostics(object.x, `${path}/x`, "u", domain),
      ...expressionDiagnostics(object.y, `${path}/y`, "u", domain),
    ];
    errors.push(...expressions);
    if (expressions.length === 0) errors.push(...movingCurve(object.x, object.y, path, domain));
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
    for (const { target } of objectAnchors(object)) spatialReferences.add(target);
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
  // A carried piece the scene cannot find is simply not carried; the motion itself still plays.
  scene.beats.forEach((beat) => beat.actions.forEach((action) => {
    if (action.do !== "motion" || action.with === undefined) return;
    const known = action.with.filter((id) => id !== action.target && referenceDiagnostic(id, "", objects) === undefined);
    if (known.length > 0) action.with = known;
    else delete action.with;
  }));
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
    // ⚠️ EVERY NAME AN OBJECT CARRIES, NOT THE FIRST ONE THAT MATCHES. This was a chain, so a `span`
    // and an `angle` were never checked at all, and a `line` that also had a relative placement had
    // its placement target skipped. An unresolved end is not an error at render time — it collapses
    // to a point and draws nothing, which is indistinguishable from the object not being there.
    const references = [
      ...objectAnchors(object),
      ...(object.placement?.mode === "relative" || object.placement?.mode === "anchor"
        ? [{ target: object.placement.target, suffix: "/placement/target" }]
        : []),
    ];
    references.forEach(({ target, suffix }) => {
      const error = referenceDiagnostic(target, `${base}/objects/${objectIndex}${suffix}`, objects);
      // A thing anchored to a part its owner never exposed lands on the owner's centre instead of
      // taking the scene with it — a marker on the map rather than a blank card.
      if (error?.code === "INVALID_ANCHOR") warnings.push({ ...error, code: "ANCHOR_FALLBACK" });
      else if (error) errors.push(error);
    });
    errors.push(...degenerateAnchors(object, `${base}/objects/${objectIndex}`));
  });

  // ⚠️ ONE ACTION MUST NEVER COST THE SCENE. A label aimed at a part the artist did not draw, a
  // traveller sent along a shape, a second journey in one beat: each is one line of a scene the
  // reader would otherwise lose entirely. The faulty action is dropped and reported; show/hide
  // faults are not, because what a scene reveals decides what every other action may address.
  const doomed = new Map<string, Diagnostic>();
  const dropAction = (beatIndex: number, actionIndex: number, diagnostic: Diagnostic): void => {
    const key = `${beatIndex}/${actionIndex}`;
    if (!doomed.has(key)) doomed.set(key, diagnostic);
  };

  scene.beats.forEach((beat, beatIndex) => {
    const shownThisBeat = new Set(beat.actions.flatMap((action) => action.do === "show" ? action.targets : []));
    beat.actions.forEach((action, actionIndex) => {
      const actionPath = `${base}/beats/${beatIndex}/actions/${actionIndex}`;
      const revealing = action.do === "show" || action.do === "hide";
      const fault = (diagnostic: Diagnostic): void => {
        if (revealing) errors.push(diagnostic);
        else dropAction(beatIndex, actionIndex, diagnostic);
      };
      actionReferences(action).forEach(({ target, suffix, mustConnect, notSelf, mustRing }) => {
        // ⚠️ `path` IS THE RING THE ORBIT RIDES ON, and its radius is taken as half the ring's
        // SHORTER side. Pointed at a string — a long thin box — that is half its thickness, so the
        // bob seats itself a few units from the pivot and shuffles instead of swinging.
        const ringKind = mustRing ? objects.get(target)?.kind : undefined;
        if (ringKind !== undefined && !RING_KINDS.has(ringKind))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}${suffix}`,
            message: `An orbit rides a ROUND thing; '${target}' is a '${ringKind}'. Omit 'path' and the radius comes from the gap between the two objects`,
            received: target,
          });
        // Travelling to where you already are is a motion that never moves — the same silent nothing.
        if (notSelf && "target" in action && target === action.target)
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}${suffix}`,
            message: `'${target}' cannot travel to itself; name another object or a zone`,
            received: target,
          });
        const spatialError = referenceDiagnostic(target, `${actionPath}${suffix}`, objects);
        const routeKind = mustConnect ? objects.get(target)?.kind : undefined;
        const routes = ["line", "span", "curve"];
        if (routeKind !== undefined && !routes.includes(routeKind))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}${suffix}`,
            message: `A traveller follows a 'line', a 'span' or a 'curve'; '${target}' is a '${routeKind}' and has no route to walk`,
            received: target,
            availableTargets: [...objects].filter(([, o]) => routes.includes(o.kind)).map(([id]) => id),
          });
        const error = (action.do === "show" || action.do === "hide") && !objects.has(target)
          ? {
              code: "INVALID_ACTION_TARGET" as const,
              path: `${actionPath}${suffix}`,
              message: `${action.do} targets must be object ids, not anchors`,
              received: target,
              availableTargets: [...objects.keys()],
            }
          : spatialError;
        if (error) fault(error);
        // A motion needs a thing with a body of its own — an object or an artwork part. A map
        // region or a chart bar is an ANCHOR, a place to point at; asked to move, it silently stays.
        const moving = !error && action.do === "motion" && suffix === "/target" ? parseTarget(target, new Set(objects.keys())) : undefined;
        if (moving?.anchor)
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}${suffix}`,
            message: `'${target}' is an anchor of a '${objects.get(moving.objectId)?.kind}', not a thing that can move; only objects and artwork parts travel`,
            received: target,
          });
        const objectId = parseTarget(target, new Set(objects.keys())).objectId;
        if (!error && action.do !== "show" && action.do !== "hide") {
          const window = lifecycle.windows.get(objectId);
          const everVisible = window?.initiallyVisible || window?.showBeat !== undefined;
          const visibleNow = window?.initiallyVisible
            ? window.hideBeat === undefined || window.hideBeat >= beatIndex
            : shownThisBeat.has(objectId) || (window?.showBeat !== undefined && window.showBeat < beatIndex && (window.hideBeat === undefined || window.hideBeat >= beatIndex));
          if (!everVisible) {
            fault({
              code: "INVALID_LIFECYCLE",
              path: `${actionPath}${suffix}`,
              message: `Target '${objectId}' never becomes visible in this scene`,
              received: target,
            });
          } else if (!visibleNow) {
            fault({
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
  // A spin rides on top of anything. Journeys run one after another: two in one beat would pull the
  // thing two ways at once, and nothing can follow an orbit or a repeating path because they never end.
  const journeys = new Map<string, { path: string; beat: number; unending: boolean }>();
  scene.beats.forEach((beat, beatIndex) => beat.actions.forEach((action, actionIndex) => {
    if (action.do !== "motion" || action.motion === "spin") return;
    const previous = journeys.get(action.target);
    const path = `${base}/beats/${beatIndex}/actions/${actionIndex}`;
    const unending = action.motion === "orbit" || (action.motion === "along" && action.repeat !== undefined && action.repeat !== "once");
    if (previous && previous.beat === beatIndex) dropAction(beatIndex, actionIndex, {
      code: "MULTIPLE_MOTION",
      path,
      message: `Object '${action.target}' already travels in this beat at ${previous.path}; one journey per beat, spins aside`,
      received: action,
    });
    else if (previous?.unending) dropAction(beatIndex, actionIndex, {
      code: "MULTIPLE_MOTION",
      path,
      message: `Object '${action.target}' is still travelling from ${previous.path}; an orbit or a repeating path never ends, so nothing can follow it in this scene`,
      received: action,
    });
    else journeys.set(action.target, { path, beat: beatIndex, unending });
  }));

  // Deepest index first, so each splice leaves the pending ones addressable.
  const removals = [...doomed.keys()]
    .map((key) => key.split("/").map(Number))
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [beatIndex, actionIndex] of removals) {
    warnings.push({ ...(doomed.get(`${beatIndex}/${actionIndex}`) as Diagnostic), code: "DROPPED_ACTION" });
    scene.beats[beatIndex].actions.splice(actionIndex, 1);
  }
  if (removals.length > 0) {
    scene.beats = scene.beats.filter((beat) => beat.actions.length > 0);
    if (scene.beats.length === 0)
      errors.push({
        code: "NO_DRAWABLE_SCENE",
        path: `${base}/beats`,
        message: `Every action in this scene was dropped; nothing is left to play`,
        received: scene.id,
      });
  }

  return { errors, warnings };
}

/**
 * Drop an optional property whose value the schema does not know, so it costs a knob and not the film.
 *
 * A writer that reaches for `gait: "swing"` or `style: "callout"` — a plausible word the vocabulary
 * happens not to contain — otherwise fails the whole spec and the reader gets a blank card with
 * narration over it. Required properties and unknown property NAMES still fail: those are structure,
 * and a spec that cannot be understood must not be half-rendered. This is the same principle as
 * NON_BLOCKING_CODES: a cosmetic fault must never blank a video.
 */
function dropUnknownEnums(node: unknown, schema: Record<string, unknown>): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    const items = schema.items as Record<string, unknown> | undefined;
    for (const entry of node) dropUnknownEnums(entry, items ?? {});
    return;
  }

  const variants = (schema.oneOf ?? schema.anyOf) as Record<string, unknown>[] | undefined;
  const target = node as Record<string, unknown>;
  if (variants) {
    const match = variants.find((variant) => discriminates(variant, target)) ?? variants[0];
    dropUnknownEnums(target, match);
    return;
  }

  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;
  // A property the schema does not list changes nothing about how the object renders — the only
  // thing it ever did was fail `additionalProperties` and take the whole scene with it. Strip it.
  if (schema.additionalProperties === false)
    for (const name of Object.keys(target)) if (!(name in properties)) delete target[name];
  const required = new Set((schema.required as string[]) ?? []);
  for (const [name, sub] of Object.entries(properties)) {
    const value = target[name];
    if (value === undefined) continue;
    const allowed = sub.enum as unknown[] | undefined;
    if (allowed && !allowed.includes(value) && !required.has(name)) {
      delete target[name];
      continue;
    }

    dropUnknownEnums(value, sub);
  }
}

/**
 * Remove what still cannot be understood after the tolerance pass — an object of no known kind, an
 * action of no known shape — and everything that pointed at it, then any beat left empty.
 *
 * One bad object used to cost the scene and one bad scene used to cost the film. Structure is
 * forgiven here so the rest keeps playing; the semantic pass that follows stays strict, so a loss
 * that matters (a thing shown by nothing else) is still caught as a lifecycle fault, not hidden.
 */
function pruneUnreadable(input: unknown, warnings: Diagnostic[]): void {
  if (input === null || typeof input !== "object") return;
  const scenes = (input as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return;
  scenes.forEach((scene: { objects?: unknown; beats?: unknown }, sceneIndex) => {
    const gone = new Set<string>();
    if (Array.isArray(scene.objects)) {
      scene.objects = (scene.objects as unknown[]).filter((object, index) => {
        const path = `/scenes/${sceneIndex}/objects/${index}`;
        const id = (object as { id?: unknown }).id;
        // A named asset the catalogue no longer carries is a well-formed object with nothing to
        // draw, so it goes the same way as an unreadable one rather than costing the scene.
        const asset = (object as { kind?: unknown; asset?: unknown });
        if (asset.kind === "visual" && typeof asset.asset === "string" && resolveAsset(asset.asset) === undefined) {
          if (typeof id === "string") gone.add(id);
          warnings.push({ code: "DROPPED_OBJECT", path: `${path}/asset`, message: `Unknown asset '${asset.asset}'`, received: asset.asset });
          return false;
        }
        if (validateObject(object)) return true;
        if (typeof id === "string") gone.add(id);
        warnings.push(dropped("DROPPED_OBJECT", path, validateObject.errors, object));
        return false;
      });
    }
    if (!Array.isArray(scene.beats)) return;
    scene.beats = (scene.beats as { actions?: unknown }[]).filter((beat, beatIndex) => {
      if (!Array.isArray(beat.actions)) return true;
      const kept = (beat.actions as unknown[]).filter((action, actionIndex) => {
        const path = `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`;
        if (!validateAction(action)) {
          warnings.push(dropped("DROPPED_ACTION", path, validateAction.errors, action));
          return false;
        }
        const orphan = actionReferences(action as ActionSpec).find(({ target }) => gone.has(target.split(".")[0]));
        if (orphan) {
          warnings.push({ code: "DROPPED_ACTION", path, message: `Named '${orphan.target}', which was dropped`, received: orphan.target });
          return false;
        }

        return true;
      });
      beat.actions = kept;
      return kept.length > 0;
    });
  });
}

/** One diagnostic for one dropped thing — Ajv reports every branch of a oneOf, which is noise here. */
function dropped(
  code: "DROPPED_OBJECT" | "DROPPED_ACTION",
  path: string,
  errors: Parameters<typeof formatAjvErrors>[0],
  value: unknown,
): Diagnostic {
  const first = formatAjvErrors(errors, value)[0];
  return { code, path: `${path}${first?.path ?? ""}`, message: first?.message ?? "not a shape the engine knows", received: value };
}

/** Whether one oneOf variant is the one this value means, judged by its const-valued properties. */
function discriminates(variant: Record<string, unknown>, value: Record<string, unknown>): boolean {
  const properties = variant.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return false;
  const marks = Object.entries(properties).filter(([, sub]) => "const" in sub);
  return marks.length > 0 && marks.every(([name, sub]) => value[name] === sub.const);
}

export function validateLessonSpec(input: unknown): ValidationResult<LessonSpec> {
  dropUnknownEnums(input, LESSON_SPEC_SCHEMA as unknown as Record<string, unknown>);
  const warnings: Diagnostic[] = [];
  pruneUnreadable(input, warnings);
  if (!validateStructure(input)) {
    // ⚠️ ONE SCENE MUST NEVER COST THE FILM. A writer that invents a field in scene three used to
    // take scenes one and two down with it, and the reader got a blank card under the narration.
    // The scenes that ARE well formed still play; the one that is not is dropped and reported.
    const salvaged = keepWellFormedScenes(input, warnings);
    if (!salvaged) return { valid: false, errors: formatAjvErrors(validateStructure.errors, input) };
    input = salvaged;
  }

  const spec = input as LessonSpec;
  const kept: SceneSpec[] = [];
  const duplicates = duplicateDiagnostics(spec.scenes.map((scene) => scene.id), "/scenes");
  spec.scenes.forEach((scene, index) => {
    assumeCarriedOver(scene, index, warnings);
    const result = semanticScene(scene, index);
    if (result.errors.length > 0) {
      warnings.push(...result.errors.map((error) => ({ ...error, code: "DROPPED_SCENE" as const })));
      return;
    }

    warnings.push(...result.warnings);
    kept.push(scene);
  });
  // Nothing survived: the reasons the scenes were dropped ARE the errors, otherwise the caller is
  // told only that the film is empty and never why.
  if (kept.length === 0)
    return { valid: false, errors: [noSceneLeft(spec), ...duplicates, ...warnings] };

  return { valid: true, value: { ...spec, scenes: kept }, warnings };
}

/**
 * An object a scene declares but never reveals is on screen from the start.
 *
 * Every scene opens empty, yet a writer carrying the clock over from the scene before writes it
 * down without a `show`, meaning "it is still there" — and pointed at, moved and labelled, it
 * would otherwise take every one of those actions down with it and leave the scene blank.
 */
function assumeCarriedOver(scene: SceneSpec, sceneIndex: number, warnings: Diagnostic[]): void {
  const shown = new Set<string>();
  for (const beat of scene.beats) {
    for (const action of beat.actions) {
      if (action.do !== "show") continue;
      for (const target of action.targets) shown.add(target.includes(".") ? target.slice(0, target.indexOf(".")) : target);
    }
  }
  scene.objects.forEach((object, objectIndex) => {
    if (object.initial !== undefined || shown.has(object.id)) return;
    object.initial = "visible";
    warnings.push({
      code: "ASSUMED_VISIBLE",
      path: `/scenes/${sceneIndex}/objects/${objectIndex}`,
      message: `'${object.id}' is never shown in this scene; it is on screen from the start`,
      received: object.id,
    });
  });
}

/** Every scene that passes the schema on its own, or undefined when the film itself is malformed. */
function keepWellFormedScenes(input: unknown, warnings: Diagnostic[]): LessonSpec | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const spec = input as LessonSpec;
  if (!Array.isArray(spec.scenes)) return undefined;
  const kept = spec.scenes.filter((scene, index) => {
    if (validateScene(scene)) return true;
    warnings.push(...formatAjvErrors(validateScene.errors, scene).map((error) => ({
      ...error,
      code: "DROPPED_SCENE" as const,
      path: `/scenes/${index}${error.path}`,
    })));
    return false;
  });
  if (kept.length === 0 || kept.length === spec.scenes.length) return undefined;

  const candidate = { ...spec, scenes: kept };
  return validateStructure(candidate) ? candidate : undefined;
}

function noSceneLeft(spec: LessonSpec): Diagnostic {
  return {
    code: "NO_DRAWABLE_SCENE",
    path: "/scenes",
    message: `Every one of the ${spec.scenes.length} scenes was dropped`,
    received: spec.scenes.length,
  };
}
