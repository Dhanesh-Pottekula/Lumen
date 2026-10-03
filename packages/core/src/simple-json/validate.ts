import Ajv2020 from "ajv/dist/2020.js";
import { parseExpr } from "../gcl/expr";
import { mathTermRange, validateMathText } from "../render/mathtext";
import { seriesLines } from "../render/charts";
import type { Diagnostic, ValidationResult } from "./diagnostics";
import { formatAjvErrors } from "./diagnostics";
import { LESSON_SPEC_SCHEMA, SCENE_CHECK_SCHEMA, ZONE_NAMES } from "./schema";
import { assetAnchors, availableAssets, joinsTwo, resolveAsset, STEPS_ASIDE, takesCentre } from "./registry";
import { parseTarget } from "./target";
import { analyzeLifecycle, lifecycleIds } from "./lifecycle";
import type { ActionSpec, LessonSpec, ObjectSpec, SceneSpec } from "./types";
import { parseSvgArtwork, svgArtworkError, svgFragmentError } from "./svg";
import { imageAspect, imageHotspots } from "./image";
import { parsePath } from "../geometry/path";
import { figureOf, handleNames, parseHandle } from "../geometry/figure";
import { figureDiagnostics, pieceNames } from "./pieces";
import { speechWords, stressedWords } from "./speech";

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

const validateCheck = new Ajv2020({ allErrors: true, strict: true }).compile(SCENE_CHECK_SCHEMA);

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
  // A term of an equation is named by its own TeX, which may hold dots of its own: `eq.0.5mv^2`.
  const equation = [...objects].find(([id, object]) => object.kind === "equation" && object.id === id && target.startsWith(`${id}.`))?.[1];
  if (equation?.kind === "equation") {
    if (mathTermRange(equation.value, target.slice(equation.id.length + 1))) return undefined;
    return {
      code: "INVALID_ANCHOR",
      path,
      message: `'${target.slice(equation.id.length + 1)}' is not written in '${equation.id}' (${equation.value}); name a term by copying it exactly as the equation writes it`,
      received: target,
    };
  }
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
          : "data" in object ? object.data.length : "series" in object ? (seriesLines(object.series)[0]?.length ?? 0) : 0;
        const prefix = object.chart === "bar" || object.chart === "riemann" ? "bar" : object.chart === "pie" || object.chart === "donut" ? "slice" : "pt";
        // More than three lines are drawn as small multiples, whose panels are pieces instead.
        const drawn = object.chart === "line" || object.chart === "area" ? seriesLines(object.series).length : 0;
        const lines = drawn <= 3 ? drawn : 0;
        anchors = [...generic, "peak", "first", "last", ...Array.from({ length: count }, (_, index) => `${prefix}${index}`), ...Array.from({ length: lines }, (_, index) => `series${index}`)];
      }
      if (object.kind === "map") {
        anchors = [...generic, ...object.features.map((feature) => feature.id), ...(object.places ?? []).map((place) => place.name), ...(object.markers ?? []).flatMap((marker) => marker.label ? [marker.label] : [])];
      }
      if (object.kind === "timeline") anchors = [...generic, ...(object.events ?? []).map((_event, index) => `ev${index}`)];
      if (object.kind === "path" && object.from === undefined) {
        const handles = handleNames(figureOf(parsePath(object.d).segs));
        anchors = [...generic, ...handles];
        const side = parseHandle(anchor);
        if (side?.t !== undefined && handles.includes(`s${side.side}`)) return undefined;
      }
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

const ZONE_TOKENS: ReadonlySet<string> = new Set(ZONE_NAMES);

/** Why a morph cannot play, or undefined when it can: a path becomes a `d`, a shape becomes a `shape`. */
function morphProblem(action: Extract<ActionSpec, { motion: "morph" }>, target: ObjectSpec | undefined): string | undefined {
  if ((action.d === undefined) === (action.shape === undefined)) return "A morph names the form it becomes: a 'd' for a path, or a 'shape' for a shape — exactly one";
  if (action.d !== undefined) {
    if (target?.kind !== "path") return `Only a 'path' morphs into a 'd'; '${action.target}' is a '${target?.kind ?? "missing"}'`;
    const issue = parsePath(action.d).issue;
    return issue ? `Morph path command ${issue.index + 1}${issue.command ? ` '${issue.command}'` : ""}: ${issue.message}` : undefined;
  }
  return target?.kind === "shape" ? undefined : `Only a 'shape' morphs into a 'shape'; '${action.target}' is a '${target?.kind ?? "missing"}'`;
}

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

const MOVE_WAYS = ["to", "toward", "away", "opposite", "direction"] as const;

/** The id a label, strike, tick, trend or spoken line names itself by, which a later `hide` may take off on its own. */
function markId(action: ActionSpec): string | undefined {
  return action.do === "label" || action.do === "strike" || action.do === "tick" || action.do === "trend" || action.do === "speak" ? action.id : undefined;
}

// What speaks is a drawn thing with a body: a picture or drawing, or a part of one.
const SPEAKS: ReadonlySet<ObjectSpec["kind"]> = new Set(["image", "visual", "svg-artwork", "svg-composite", "shape", "path"]);

// A trend sits beside the thing whose amount rises or falls; writing is not that thing, and a connector joins two.
const UNTRENDED: ReadonlySet<ObjectSpec["kind"]> = new Set(["text", "equation", "line", "span", "angle", "curve"]);

/** What an object is placed, sized or attached against, each a target that must exist. */
function placedAgainst(object: ObjectSpec): Array<{ target: string; suffix: string }> {
  return [
    ...(object.placement?.mode === "relative" || object.placement?.mode === "anchor" ? [{ target: object.placement.target, suffix: "/placement/target" }] : []),
    ...(typeof object.size === "object" ? [{ target: object.size.like, suffix: "/size/like" }] : []),
    ...(object.attach ? [{ target: object.attach.to, suffix: "/attach/to" }] : []),
    ...((object.kind === "path" || object.kind === "text" || object.kind === "equation") && object.in !== undefined ? [{ target: object.in, suffix: "/in" }] : []),
  ];
}

/** What is wrong with the frame an object is drawn in, or undefined when it has none or it is sound. */
function frameDiagnostic(object: ObjectSpec, objects: Map<string, ObjectSpec>): string | undefined {
  const frame = object.kind === "path" || object.kind === "text" || object.kind === "equation" ? object.in : undefined;
  if (frame === undefined) return undefined;
  if (object.kind === "path" && object.from !== undefined) return "A path is laid between two things or drawn in a frame, not both";
  const ids = new Set(objects.keys());
  const seen = new Set([object.id]);
  for (let ref: string | undefined = frame; ref !== undefined; ) {
    const owner = objects.get(parseTarget(ref, ids).objectId);
    if (!owner) return undefined;
    if (seen.has(owner.id)) return `'${object.id}' is drawn in a frame that is drawn in it`;
    if (owner.kind === "line" || owner.kind === "span" || owner.kind === "angle" || ((owner.kind === "path" || owner.kind === "curve") && owner.from !== undefined))
      return `'${owner.id}' is laid between two things and sets no frame; draw in a picture, a part, a figure, or a figure's corner or side`;
    seen.add(owner.id);
    ref = owner.kind === "path" ? owner.in : undefined;
  }
  return undefined;
}

/** The ids one object pins itself to — the ends of a connector, the corner and arms of an angle. */
function objectAnchors(object: ObjectSpec): Array<{ target: string; suffix: string }> {
  if (object.kind === "line" || object.kind === "span")
    return [
      { target: object.from, suffix: "/from" },
      { target: object.to, suffix: "/to" },
    ];
  if ((object.kind === "curve" || object.kind === "path") && object.from !== undefined && object.to !== undefined)
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

function actionReferences(action: ActionSpec): Array<{ target: string; suffix: string; mustConnect?: boolean; notSelf?: boolean }> {
  switch (action.do) {
    case "show":
    case "hide":
    case "tint":
      return action.targets.map((target, index) => ({ target, suffix: `/targets/${index}` }));
    case "camera":
    case "label":
    case "speak":
    case "emphasize":
    case "fill":
    case "strike":
    case "tick":
    case "trend":
    case "aside":
      return [{ target: action.target, suffix: "/target" }];
    case "attention":
      return [
        { target: action.target, suffix: "/target" },
        ...(action.verb === "pointer" ? [{ target: action.from, suffix: "/from" }] : []),
        ...(action.verb === "pointer" ? [] : (action.with ?? []).map((target, index) => ({ target, suffix: `/with/${index}` }))),
      ];
    case "motion":
      // A zone is a legal destination: without it a scene can only travel to another OBJECT, so the
      // writer declares an outline circle purely as a waypoint and the reader sees a phantom ring.
      if (action.motion === "move")
        return [
          { target: action.target, suffix: "/target" },
          ...(action.to === undefined || ZONE_TOKENS.has(action.to) ? [] : [{ target: action.to, suffix: "/to", notSelf: true }]),
          ...(["toward", "away", "opposite"] as const).flatMap((field) => (action[field] === undefined ? [] : [{ target: action[field]!, suffix: `/${field}`, notSelf: true }])),
          ...(typeof action.by === "object" ? [{ target: action.by.of, suffix: "/by/of" }] : []),
        ];
      if (action.motion === "fall")
        return [{ target: action.target, suffix: "/target" }, ...(ZONE_TOKENS.has(action.to) ? [] : [{ target: action.to, suffix: "/to", notSelf: true }])];
      if (action.motion === "orbit")
        return [{ target: action.target, suffix: "/target" }, { target: action.around, suffix: "/around" }];

      // `along` walks the route its object draws. Pointed at something that draws no route — a
      // shape, a picture — the route collapses to a single point and the traveller stands still.
      if (action.motion === "along")
        return [
          { target: action.target, suffix: "/target" },
          ...(action.along === undefined ? [] : [{ target: action.along, suffix: "/along", mustConnect: true }]),
          ...(action.through ?? []).map((target, index) => ({ target, suffix: `/through/${index}` })),
        ];
      if (action.motion === "morph") return [{ target: action.target, suffix: "/target" }];
      if (action.motion === "wander")
        return [{ target: action.target, suffix: "/target" }, ...(action.to === undefined || ZONE_TOKENS.has(action.to) ? [] : [{ target: action.to, suffix: "/to", notSelf: true }])];
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
  if (object.kind === "path") {
    const issue = parsePath(object.d).issue;
    if (issue)
      errors.push({
        code: "INVALID_PATH",
        path: `${path}/d`,
        message: `Path command ${issue.index + 1}${issue.command ? ` '${issue.command}'` : ""}: ${issue.message}`,
        received: object.d.slice(0, 120),
      });
    if ((object.from === undefined) !== (object.to === undefined))
      errors.push({
        code: "INVALID_PATH",
        path: `${path}/${object.from === undefined ? "from" : "to"}`,
        message: "A path is laid between two things with BOTH 'from' and 'to', or drawn in its own box with neither",
        received: object.from ?? object.to,
      });
  }
  if (object.kind === "image") {
    // The engine never decodes a picture to lay it out, so its shape must be known up front: from
    // `aspect`, or from the header of a data URL. A blob: URL carries no header to read.
    if (imageAspect(object) === undefined)
      errors.push({
        code: "INVALID_IMAGE",
        path: `${path}/${object.aspect === undefined ? "src" : "aspect"}`,
        message: "The picture's aspect (width ÷ height) is unknown: give 'aspect', or a data URL whose PNG / JPEG / GIF / WebP header can be read",
        received: object.src.slice(0, 64),
      });
    for (const hotspot of imageHotspots(object)) {
      const [x, y, w, h] = hotspot.rect;
      const bleed = 0.02;
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || x < -bleed || y < -bleed || x + w > 1 + bleed || y + h > 1 + bleed)
        errors.push({
          code: "INVALID_IMAGE",
          path: `${path}/hotspots/${hotspot.id}`,
          message: "A hotspot is [x, y, w, h] as fractions of the picture: w and h above 0, inside [0, 1]",
          received: hotspot.rect,
        });
    }
    for (const [name, points] of Object.entries(object.outlines ?? {})) {
      const bleed = 0.02;
      if (!object.hotspots?.[name])
        errors.push({
          code: "INVALID_IMAGE",
          path: `${path}/outlines/${name}`,
          message: `An outline shapes a hotspot, and the picture has no hotspot '${name}'`,
          received: name,
        });
      else if (!points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= -bleed && y >= -bleed && x <= 1 + bleed && y <= 1 + bleed))
        errors.push({
          code: "INVALID_IMAGE",
          path: `${path}/outlines/${name}`,
          message: "An outline is [[x, y], …] as fractions of the picture, inside [0, 1]",
          received: points.slice(0, 4),
        });
    }
  }
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
      seriesLines(object.series).forEach((line) => line.slice(1).forEach(([x], index) => {
        if (x <= line[index][0]) errors.push({
          code: "INVALID_DATA",
          path: `${path}/series`,
          message: `${object.chart} series x-values must be strictly increasing`,
          received: x,
        });
      }));
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
    if (typeof playhead === "object" && (playhead.from === playhead.to || Math.min(playhead.from, playhead.to) < object.from || Math.max(playhead.from, playhead.to) > object.to)) errors.push({ code: "INVALID_DATA", path: `${path}/playhead`, message: "Animated playhead must move and remain inside the timeline range", received: playhead });
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
  errors.push(...figureDiagnostics(object, path));
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
  /** `pic.core` → `pic`: a hotspot is a place inside its picture, visible whenever the picture is. */
  const hotspotOwner = new Map<string, string>();
  const outlined = new Set<string>();
  for (const object of scene.objects) {
    objects.set(object.id, object);
    if (object.kind === "svg-composite") {
      for (const part of object.parts) objects.set(`${object.id}.${part.id}`, object);
    }
    if (object.kind === "svg-artwork") {
      for (const part of parseSvgArtwork(object.svg).value?.parts ?? []) objects.set(`${object.id}.${part.id}`, object);
    }
    for (const name of pieceNames(object)) objects.set(`${object.id}.${name}`, object);
    if (object.kind === "image") {
      for (const hotspot of imageHotspots(object)) {
        objects.set(`${object.id}.${hotspot.id}`, object);
        hotspotOwner.set(`${object.id}.${hotspot.id}`, object.id);
        if (object.outlines?.[hotspot.id]) outlined.add(`${object.id}.${hotspot.id}`);
      }
    }
  }
  // A carried piece the scene cannot find is simply not carried; the motion itself still plays.
  scene.beats.forEach((beat) => beat.actions.forEach((action) => {
    if (action.do !== "motion" || action.with === undefined) return;
    const known = action.with.filter((id) => id !== action.target && referenceDiagnostic(id, "", objects) === undefined);
    if (known.length > 0) action.with = known;
    else delete action.with;
  }));
  // A colour given to a part the scene does not have, or to a picture part with no traced border to
  // colour inside, colours nothing, so it alone is dropped.
  for (const target of Object.keys(scene.categories_of ?? {})) {
    const known = target.includes(".") && referenceDiagnostic(target, "", objects) === undefined;
    if (known && (!hotspotOwner.has(target) || outlined.has(target))) continue;
    const message = known ? `'${target}' has no traced outline to colour inside` : `'${target}' is not a part or piece of anything in this scene`;
    warnings.push({ code: "DROPPED_FIELD", path: `${base}/categories_of/${target}`, message, received: target });
    delete scene.categories_of![target];
  }
  // A quiet measure draws only its meter, so with no scale it would draw nothing; its number is shown instead.
  scene.objects.forEach((object, objectIndex) => {
    if (object.kind !== "measure" || !object.quiet || object.scale !== undefined) return;
    warnings.push({ code: "DROPPED_FIELD", path: `${base}/objects/${objectIndex}/quiet`, message: `'${object.id}' has no scale, so it has no meter to draw without its number`, received: object.id });
    delete object.quiet;
  });
  // A stressed word the line does not say colours nothing, so it alone is dropped.
  scene.beats.forEach((beat, beatIndex) => beat.actions.forEach((action, actionIndex) => {
    if (action.do !== "speak" || action.stress === undefined || stressedWords(speechWords(action.text), action.stress) !== undefined) return;
    warnings.push({ code: "DROPPED_FIELD", path: `${base}/beats/${beatIndex}/actions/${actionIndex}/stress`, message: `'${action.stress}' is not said in '${action.text}'`, received: action.stress });
    delete action.stress;
  }));
  const lifecycle = analyzeLifecycle(scene, sceneIndex);
  errors.push(...lifecycle.errors);
  const marks = new Set(scene.beats.flatMap((beat) => beat.actions.map(markId).filter((id): id is string => id !== undefined)));
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
    for (const reference of object ? placedAgainst(object) : []) {
      const target = parseTarget(reference.target, new Set(objects.keys())).objectId;
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
      const nestedComposite = object.children.findIndex((child) => child.kind === "svg-composite" || child.kind === "svg-artwork" || child.kind === "image");
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
    const references = [...objectAnchors(object), ...placedAgainst(object)];
    references.forEach(({ target, suffix }) => {
      const error = referenceDiagnostic(target, `${base}/objects/${objectIndex}${suffix}`, objects);
      // A thing anchored to a part its owner never exposed lands on the owner's centre instead of
      // taking the scene with it — a marker on the map rather than a blank card.
      if (error?.code === "INVALID_ANCHOR") warnings.push({ ...error, code: "ANCHOR_FALLBACK" });
      else if (error) errors.push(error);
    });
    errors.push(...degenerateAnchors(object, `${base}/objects/${objectIndex}`));
    if (object.kind === "measure" && object.icon !== undefined && objects.get(object.icon)?.kind !== "image")
      errors.push({ code: "INVALID_ACTION_TARGET", path: `${base}/objects/${objectIndex}/icon`, message: `A measure's icon is a picture of this scene; '${object.icon}' is not one`, received: object.icon });
    const frameFault = frameDiagnostic(object, objects);
    if (frameFault) errors.push({ code: "INVALID_PATH", path: `${base}/objects/${objectIndex}/in`, message: frameFault, received: "in" in object ? object.in : undefined });
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
      const named = markId(action);
      if (named !== undefined && (objects.has(named) || scene.beats.flatMap((other) => other.actions).filter((other) => markId(other) === named).length > 1))
        fault({
          code: "INVALID_ACTION_TARGET",
          path: `${actionPath}/id`,
          message: `'${named}' already names ${objects.has(named) ? "an object" : "another mark"}; a label, strike, tick, trend or spoken line needs an id of its own`,
          received: named,
        });
      if (action.do === "speak") {
        const speaker = objects.get(action.target);
        if (speaker && !SPEAKS.has(speaker.kind))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}/target`,
            message: `Only a picture or drawing, or a part of one, speaks; '${action.target}' is ${speaker.id === action.target ? "a" : "part of a"} '${speaker.kind}'`,
            received: action.target,
          });
        else if (beat.actions.findIndex((other) => other.do === "speak") !== actionIndex)
          fault({ code: "INVALID_ACTION_TARGET", path: actionPath, message: "One line is spoken per beat; give the answer a beat of its own", received: action.target });
      }
      if (action.do === "trend") {
        const marked = objects.get(action.target);
        if (marked?.id === action.target && (UNTRENDED.has(marked.kind) || joinsTwo(marked)))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}/target`,
            message: `A trend goes beside a picture, a part or a measure, never on writing or on what joins two things; '${action.target}' is a '${marked.kind}'`,
            received: action.target,
          });
      }
      if (action.do === "aside") {
        const picture = objects.get(action.target);
        const whole = picture?.id === action.target;
        if (!whole || !STEPS_ASIDE.has(picture.kind))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}/target`,
            message: `Only a whole picture, chart or drawing steps aside; '${action.target}' is ${!picture ? "not in this scene" : !whole ? "a part of one" : `a '${picture.kind}'`}`,
            received: action.target,
          });
        else if (scene.beats.some((other, otherIndex) => otherIndex < beatIndex && other.actions.some((one) => one.do === "aside" && one.target === action.target)))
          fault({ code: "INVALID_ACTION_TARGET", path: `${actionPath}/target`, message: `'${action.target}' has already stepped aside`, received: action.target });
        // Stepped aside for nothing, the scene's only picture spent it companion-sized and greyed.
        else if (![beat, scene.beats[beatIndex + 1]].some((one) => one?.actions.some((shown) => shown.do === "show" && shown.targets.some((id) => id !== action.target && takesCentre(objects.get(id))))))
          fault({ code: "INVALID_ACTION_TARGET", path: `${actionPath}/target`, message: `Nothing shown in this beat or the next takes the centre from '${action.target}', so it stays the subject`, received: action.target });
      }
      actionReferences(action).forEach(({ target, suffix, mustConnect, notSelf }) => {
        // A hide may take off a label, strike, tick, trend or spoken line by its id; it is no object and has no window of its own.
        if (action.do === "hide" && marks.has(target) && !objects.has(target)) return;
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
        const routes = ["line", "span", "curve", "path"];
        if (routeKind !== undefined && !routes.includes(routeKind))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}${suffix}`,
            message: `A traveller follows a 'line', a 'span', a 'curve' or a 'path'; '${target}' is a '${routeKind}' and has no route to walk`,
            received: target,
            availableTargets: [...objects].filter(([, o]) => routes.includes(o.kind)).map(([id]) => id),
          });
        const morphFault =
          action.do === "motion" && suffix === "/target"
            ? action.motion === "morph"
              ? morphProblem(action, objects.get(target))
              : action.motion === "along" && (action.along === undefined) === (action.through === undefined)
                ? "A traveller walks a drawn route ('along') or passes through named things ('through') — exactly one of the two"
                : action.motion === "move" && MOVE_WAYS.filter((way) => action[way] !== undefined).length !== 1
                  ? `A move names exactly one way to go: ${MOVE_WAYS.join(", ")}`
                  : undefined
            : undefined;
        if (morphFault)
          fault({ code: "INVALID_ACTION_TARGET", path: `${actionPath}${suffix}`, message: morphFault, received: target });
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
        // A hotspot is a place inside a picture: it can be pointed at, labelled and travelled to, but
        // it has no pixels of its own to move or pulse — the picture is one piece.
        // A part with an outline can be filled: the tint is clipped to its shape.
        if (!error && hotspotOwner.has(target) && suffix === "/target" && (action.do === "motion" || action.do === "emphasize" || (action.do === "fill" && !outlined.has(target))))
          fault({
            code: "INVALID_ACTION_TARGET",
            path: `${actionPath}${suffix}`,
            message: `'${target}' is a hotspot of the picture '${hotspotOwner.get(target)}', a place to point at; a ${action.do} there has no effect — ${action.do === "motion" ? "move the whole picture" : "use attention on the hotspot (encircle, rings, callout)"}`,
            received: target,
          });
        const parsedId = parseTarget(target, new Set(objects.keys())).objectId;
        const objectId = hotspotOwner.get(parsedId) ?? parsedId;
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
 * narration over it. A property NAME the schema does not list is stripped the same way, so a field
 * the engine no longer reads costs nothing. Required properties still fail: those are structure, and
 * a spec that cannot be understood must not be half-rendered. This is the same principle as
 * NON_BLOCKING_CODES: a cosmetic fault must never blank a video.
 */
function dropUnknownEnums(node: unknown, given: Record<string, unknown>, root: Record<string, unknown> = given): void {
  if (node === null || typeof node !== "object") return;
  // Objects and actions are reached through `$ref`; a pass that stopped at one never saw a single
  // object, so every unknown optional word still cost its whole object.
  const schema = typeof given.$ref === "string" ? definition(root, given.$ref) : given;
  if (Array.isArray(node)) {
    const items = schema.items as Record<string, unknown> | undefined;
    for (const entry of node) dropUnknownEnums(entry, items ?? {}, root);
    return;
  }

  const variants = (schema.oneOf ?? schema.anyOf) as Record<string, unknown>[] | undefined;
  const target = node as Record<string, unknown>;
  if (variants) {
    // Only a variant the value certainly is: a line chart also carries `kind: "chart"`, and stripped
    // against the bar variant it lost its `series`. When more than one could be meant, touch nothing.
    const matches = variants.filter((variant) => discriminates(variant, target) && hasRequired(variant, target));
    if (matches.length === 1) dropUnknownEnums(target, matches[0], root);
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
    // A field that takes a word or a shape (a size word or a relative size) loses an unknown word the same way.
    const alternatives = (sub.oneOf as Record<string, unknown>[] | undefined)?.filter((variant) => variant.type === "string");
    const allowed = (sub.enum as unknown[] | undefined) ?? (alternatives?.length && alternatives.every((variant) => variant.enum) ? alternatives.flatMap((variant) => variant.enum as unknown[]) : undefined);
    if (allowed && (sub.enum !== undefined || typeof value === "string") && !allowed.includes(value) && !required.has(name)) {
      delete target[name];
      continue;
    }

    dropUnknownEnums(value, sub, root);
  }
}

/** The schema a local `$ref` such as `#/$defs/object` points at, or an empty schema when it names nothing. */
function definition(root: Record<string, unknown>, ref: string): Record<string, unknown> {
  let node: unknown = root;
  for (const key of ref.replace(/^#\//, "").split("/")) node = (node as Record<string, unknown> | undefined)?.[key];
  return (node as Record<string, unknown> | undefined) ?? {};
}

/**
 * Read an object written in another variant's shape as the one its data can only mean, before the
 * schema would refuse it: a line chart given labelled values rather than points is those values as bars.
 */
function readShapes(input: unknown): void {
  const scenes = (input as { scenes?: unknown } | null)?.scenes;
  if (!Array.isArray(scenes)) return;
  for (const scene of scenes as { objects?: unknown }[]) {
    if (!Array.isArray(scene.objects)) continue;
    for (const object of scene.objects as Record<string, unknown>[]) {
      const lined = object.chart === "line" || object.chart === "area" || object.chart === "scatter";
      if (object.kind === "chart" && lined && Array.isArray(object.data) && object.series === undefined) object.chart = "bar";
      // `frame` is the older name of a path's `in`, still read so stored films play.
      if (object.kind === "path" && object.frame !== undefined && object.in === undefined) {
        object.in = object.frame;
        delete object.frame;
      }
    }
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
  scenes.forEach((scene: { objects?: unknown; beats?: unknown; check?: unknown }, sceneIndex) => {
    // A question is extra to the lesson, so a malformed one costs only itself.
    if (scene.check !== undefined && !validateCheck(scene.check)) {
      warnings.push(dropped("DROPPED_CHECK", `/scenes/${sceneIndex}/check`, validateCheck.errors, scene.check));
      delete scene.check;
    }
    const gone = new Set<string>();
    if (Array.isArray(scene.objects)) {
      const pictures = new Set(
        (scene.objects as { id?: unknown; kind?: unknown }[]).filter((o) => o?.kind === "image").map((o) => String(o.id)),
      );
      // The stages: what anything is set on a corner or side of, and the routes travellers walk — code-drawn
      // content, never a picture's stand-in. The grids: what anything is drawn in.
      const handle = /^[^.]+\.(?:v\d+|s\d+(?:@[\d.]+)?)$/;
      const grids = new Set((scene.objects as Record<string, unknown>[]).flatMap((o) => (typeof o?.in === "string" ? [o.in.split(".")[0]] : [])));
      const stages = new Set([
        ...(scene.objects as Record<string, unknown>[]).flatMap((o) =>
          [o?.in, o?.from, o?.to, o?.at, (o?.placement as { target?: unknown } | undefined)?.target, (o?.attach as { to?: unknown } | undefined)?.to].flatMap((ref) => (typeof ref === "string" && handle.test(ref) ? [ref.split(".")[0]] : [])),
        ),
        ...(Array.isArray(scene.beats) ? (scene.beats as { actions?: unknown }[]) : []).flatMap((beat) =>
          (Array.isArray(beat?.actions) ? (beat.actions as { do?: unknown; along?: unknown; target?: unknown }[]) : []).flatMap((action) => [
            ...(action?.do === "motion" && typeof action.along === "string" ? [action.along] : []),
            ...(typeof action?.target === "string" && handle.test(action.target) ? [action.target.split(".")[0]] : []),
          ]),
        ),
      ]);
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
        if (validateObject(object)) {
          const drawn = drawnByHand(object as ObjectSpec, pictures, stages, grids);
          if (!drawn) return true;
          if (typeof id === "string") gone.add(id);
          warnings.push({ code: "DROPPED_OBJECT", path: `${path}/d`, message: drawn, received: (object as { d?: unknown }).d });
          return false;
        }
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
        if (validateAction(action)) return true;
        warnings.push(dropped("DROPPED_ACTION", path, validateAction.errors, action));
        return false;
      });
      const left = withoutGone(kept as ActionSpec[], gone, `/scenes/${sceneIndex}/beats/${beatIndex}`, warnings);
      beat.actions = left;
      return left.length > 0;
    });
  });
}

/**
 * Why a path in a scene of pictures is a thing drawn by hand, or undefined when it is exact content: a
 * connector, anything drawn in a figure's or a stage's frame, a stage set on by its corners or sides, a
 * route, a path anchored on a thing, one straight stroke (a force, a number line, a floor). Three roles
 * are stand-ins: a box drawn over a picture (the part's own highlight is meant); a shape (a closed
 * outline, or strokes of more than one piece) standing free among pictures, which is a real object
 * drawn by hand where it needs a picture of its own; and any other open stroke standing free beside
 * pictures, a line drawn for an amount rising or falling, which is a chart's or a meter's to show.
 */
function drawnByHand(object: ObjectSpec, pictures: Set<string>, stages: Set<string>, grids: Set<string>): string | undefined {
  if (object.kind !== "path" || pictures.size === 0 || (object.from && object.to)) return undefined;
  if (object.in) {
    // A filled curved region is a shading of the picture (a quarter of a pizza); a straight four-sided one, filled
    // or not, is a box standing in for a part the picture already has.
    const box = pictures.has(object.in.split(".")[0]) && /^\s*M[\d\s.,-]+([LHV][\d\s.,-]+){3,4}Z\s*$/i.test(object.d);
    return box ? "A box drawn over a picture; glow or fill the part instead" : undefined;
  }
  const shape = /[zZ]/.test(object.d) || (object.d.match(/[Mm]/g)?.length ?? 0) >= 2;
  if (shape) return stages.has(object.id) || grids.has(object.id) ? undefined : "A thing drawn by hand beside pictures; it needs a picture of its own";
  const { segs, issue } = parsePath(object.d);
  const straight = segs.length === 2 && segs[1].c === "L";
  if (issue || straight || stages.has(object.id) || object.placement?.mode === "anchor") return undefined;
  return "A line drawn by hand beside pictures; an amount over time is a `chart` `line`, a level or a share is a `measure` with a `meter`";
}

/**
 * A beat's actions once some objects are gone: a `show` or `hide` loses only the names that left, and
 * any other action naming one of them leaves with it.
 */
function withoutGone(actions: ActionSpec[], gone: Set<string>, path: string, warnings: Diagnostic[]): ActionSpec[] {
  const left = (target: string) => !gone.has(target.split(".")[0]);
  return actions.flatMap((action): ActionSpec[] => {
    if (action.do === "show" || action.do === "hide") {
      const targets = action.targets.filter(left);
      return targets.length > 0 ? [{ ...action, targets }] : [];
    }
    const orphan = actionReferences(action).find(({ target }) => !left(target));
    if (!orphan) return [action];
    warnings.push({ code: "DROPPED_ACTION", path, message: `Named '${orphan.target}', which was dropped`, received: orphan.target });
    return [];
  });
}

/** One diagnostic for one dropped thing — Ajv reports every branch of a oneOf, which is noise here. */
function dropped(
  code: "DROPPED_OBJECT" | "DROPPED_ACTION" | "DROPPED_CHECK" | "DROPPED_FIELD",
  path: string,
  errors: Parameters<typeof formatAjvErrors>[0],
  value: unknown,
): Diagnostic {
  const first = formatAjvErrors(errors, value)[0];
  return { code, path: `${path}${first?.path === "/" ? "" : (first?.path ?? "")}`, message: first?.message ?? "not a shape the engine knows", received: value };
}

/** Whether a value carries every property one variant requires. */
function hasRequired(variant: Record<string, unknown>, value: Record<string, unknown>): boolean {
  return ((variant.required as string[] | undefined) ?? []).every((name) => value[name] !== undefined);
}

/** Whether one oneOf variant is the one this value means, judged by its const-valued properties. */
function discriminates(variant: Record<string, unknown>, value: Record<string, unknown>): boolean {
  const properties = variant.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return false;
  const marks = Object.entries(properties).filter(([, sub]) => "const" in sub);
  return marks.length > 0 && marks.every(([name, sub]) => value[name] === sub.const);
}

/**
 * Validate the scene at `index` of a film with this header, forgiving what can be forgiven. A scene that
 * cannot play comes back invalid with every reason, as DROPPED_SCENE.
 */
export function validateFilmScene(
  header: Omit<LessonSpec, "scenes">,
  input: unknown,
  index: number,
): ValidationResult<SceneSpec> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: malformedScene(input, index) };

  // Every pass before the semantic one reads a whole film, so the scene is checked as a film of one.
  const film = { ...header, scenes: [input] };
  readShapes(film);
  dropUnknownEnums(film, LESSON_SPEC_SCHEMA as unknown as Record<string, unknown>);
  const pruned: Diagnostic[] = [];
  pruneUnreadable(film, pruned);
  const warnings = pruned.map((warning) => atScene(warning, index));
  const [read] = film.scenes;
  if (!validateStructure(film)) {
    const errors = validateScene(read) ? formatAjvErrors(validateStructure.errors, film).map((error) => atScene(error, index)) : malformedScene(read, index);
    return { valid: false, errors: [...warnings, ...errors] };
  }

  const scene = read as SceneSpec;
  assumeCarriedOver(scene, index, warnings);
  readIntent(scene, warnings, index);
  dropGhostsOfWriting(scene, index, warnings);
  const result = salvagedScene(scene, index, warnings);
  if (result.errors.length > 0)
    return { valid: false, errors: [...warnings, ...result.errors.map((error) => ({ ...error, code: "DROPPED_SCENE" as const }))] };

  return { valid: true, value: scene, warnings: [...warnings, ...result.warnings] };
}

/** The schema's reasons one scene is malformed, at its place in the film. */
function malformedScene(input: unknown, index: number): Diagnostic[] {
  validateScene(input);
  return formatAjvErrors(validateScene.errors, input).map((error) => ({ ...error, code: "DROPPED_SCENE" as const, path: `/scenes/${index}${error.path === "/" ? "" : error.path}` }));
}

/** Why the input is not a film at all — an object holding a list of scenes — or undefined when it is one. */
export function notAFilm(input: unknown): Diagnostic[] | undefined {
  const scenes = (input as { scenes?: unknown } | null)?.scenes;
  if (input !== null && typeof input === "object" && !Array.isArray(input) && Array.isArray(scenes) && scenes.length > 0) return undefined;
  validateStructure(input);
  return formatAjvErrors(validateStructure.errors, input);
}

/** A diagnostic of a film of one scene, re-pointed at that scene's place in the whole film. */
export function atScene(diagnostic: Diagnostic, index: number): Diagnostic {
  return { ...diagnostic, path: diagnostic.path.replace(/^\/scenes\/0(?=\/|$)/, `/scenes/${index}`) };
}

/**
 * Check one scene, dropping each object whose own fault would cost the scene — a timeline running
 * backwards, a math command the typesetter lacks — with everything that named it, until what is left
 * is sound. A fault anywhere but in an object still costs the scene, as before.
 */
function salvagedScene(scene: SceneSpec, sceneIndex: number, warnings: Diagnostic[]): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const inObject = new RegExp(`^/scenes/${sceneIndex}/objects/(\\d+)(?:/|$)`);
  for (;;) {
    const result = semanticScene(scene, sceneIndex);
    const faulty = result.errors.map((error) => inObject.exec(error.path)?.[1]);
    if (result.errors.length === 0 || faulty.some((index) => index === undefined)) return result;

    const gone = new Set(faulty.map((index) => scene.objects[Number(index)].id));
    // What this pass took out is gone from the scene, so the next pass never reports it again.
    warnings.push(...result.warnings.filter((warning) => warning.code === "DROPPED_ACTION" || warning.code === "DROPPED_FIELD"));
    for (const error of result.errors) warnings.push({ ...error, code: "DROPPED_OBJECT" });
    scene.objects = scene.objects.filter((object) => !gone.has(object.id));
    scene.beats.forEach((beat, beatIndex) => {
      beat.actions = withoutGone(beat.actions, gone, `/scenes/${sceneIndex}/beats/${beatIndex}`, warnings);
    });
    scene.beats = scene.beats.filter((beat) => beat.actions.length > 0);
    if (scene.objects.length === 0 || scene.beats.length === 0)
      return { errors: [{ code: "NO_DRAWABLE_SCENE", path: `/scenes/${sceneIndex}`, message: "Every object or beat of this scene was dropped; nothing is left to play", received: scene.id }], warnings: [] };
  }
}

// The share of its picture a cut-out's border spans at least on its longer side; the cut-out is cropped to it.
const SILHOUETTE_SPAN = 0.5;

/** Whether a picture's traced border spans only a sliver of a picture cropped to its subject. */
function silhouetteFragment(silhouette: Array<[number, number]>): boolean {
  const span = (axis: 0 | 1) => Math.max(...silhouette.map((point) => point[axis])) - Math.min(...silhouette.map((point) => point[axis]));
  return Math.max(span(0), span(1)) < SILHOUETTE_SPAN;
}

/** A timeline given in positive years that run backwards, from a later number to an earlier one: years BCE, counted down. */
function countsDown(timeline: Extract<ObjectSpec, { kind: "timeline" }>): boolean {
  const dates = timelineDates(timeline);
  return timeline.from > timeline.to && dates.every((date) => date >= 0);
}

function timelineDates(timeline: Extract<ObjectSpec, { kind: "timeline" }>): number[] {
  const playhead = timeline.playhead;
  return [timeline.from, timeline.to, ...(timeline.events ?? []).map((event) => event.at), ...(timeline.eras ?? []).flatMap((era) => [era.from, era.to]), ...(typeof playhead === "number" ? [playhead] : playhead ? [playhead.from, playhead.to] : [])];
}

/** Every date of a timeline as the signed year it means: negative, before the common era. */
function readAsBce(timeline: Extract<ObjectSpec, { kind: "timeline" }>): void {
  [timeline.from, timeline.to] = [-timeline.from, -timeline.to];
  for (const event of timeline.events ?? []) event.at = -event.at;
  for (const era of timeline.eras ?? []) [era.from, era.to] = [-era.from, -era.to];
  const playhead = timeline.playhead;
  if (typeof playhead === "number") timeline.playhead = -playhead;
  else if (playhead) timeline.playhead = { ...playhead, from: -playhead.from, to: -playhead.to };
}

/**
 * Take a writer at their word where only one reading exists: a timeline spans the dates it marks,
 * in order; a line chart reads left to right; a table's short rows end in empty cells; a journey
 * given both a drawn route and a list of stops walks the route it was drawn. Each of these used to be refused with its object or action.
 */
function readIntent(scene: SceneSpec, warnings: Diagnostic[], sceneIndex: number): void {
  scene.objects.forEach((object, objectIndex) => {
    if (object.kind === "timeline" && countsDown(object)) {
      readAsBce(object);
      warnings.push({ code: "READ_AS_BCE", path: `/scenes/${sceneIndex}/objects/${objectIndex}`, message: `'${object.id}' counts its years down from ${-object.to} to ${-object.from}: read as years BCE (negative), so time runs left to right`, received: object.id });
    }
  });
  for (const object of scene.objects) {
    if (object.kind === "timeline") {
      for (const era of object.eras ?? []) if (era.from > era.to) [era.from, era.to] = [era.to, era.from];
      const playhead = object.playhead;
      const swept = typeof playhead === "object" ? [playhead.from, playhead.to].sort((a, b) => a - b) : [];
      const dates = [object.from, object.to, ...(object.events ?? []).map((event) => event.at), ...(object.eras ?? []).flatMap((era) => [era.from, era.to]), ...swept];
      if (typeof playhead === "number") dates.push(playhead);
      object.from = Math.min(...dates);
      object.to = Math.max(...dates) > object.from ? Math.max(...dates) : object.from + 1;
      // A playhead moving back is a story going back in time ("go back to March 1938"), so its direction is kept.
      if (typeof playhead === "object" && playhead.from === playhead.to) object.playhead = playhead.from;
    }
    if (object.kind === "chart" && (object.chart === "line" || object.chart === "area")) {
      const lines = seriesLines(object.series).map((line) => [...line].sort((a, b) => a[0] - b[0]));
      object.series = lines.length === 1 ? lines[0] : lines;
    }
    if (object.kind === "table") {
      const width = Math.max(...object.rows.map((row) => row.length));
      object.rows = object.rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]);
    }
    // A meter's icon is one of the scene's pictures, set at its left and as tall as it, wherever it was written.
    const icon = object.kind === "measure" ? scene.objects.find((one) => one.id === object.icon) : undefined;
    if (icon?.kind === "image") {
      // A meter written beside its own icon stands where the icon was written instead.
      const target = (placement: ObjectSpec["placement"]) => (placement === undefined || placement.mode === "zone" ? undefined : placement.target.split(".")[0]);
      if (target(object.placement) === icon.id) object.placement = target(icon.placement) === object.id ? undefined : icon.placement;
      if (object.attach?.to.split(".")[0] === icon.id) delete object.attach;
      icon.placement = { mode: "relative", target: object.id, relation: "left-of" };
      icon.size = { like: object.id, dimension: "height" };
      delete icon.attach;
    }
    // A cut-out is cropped to its subject, so a border spanning a sliver of it traced one piece of a
    // subject in pieces (one ray of a sun): trusted, the solver sized and cleared the sliver, not the sun.
    if (object.kind === "image" && object.silhouette && silhouetteFragment(object.silhouette)) {
      delete object.silhouette;
      warnings.push({ code: "SILHOUETTE_FRAGMENT", path: `/scenes/${sceneIndex}/objects/${scene.objects.indexOf(object)}`, message: `'${object.id}' has a silhouette that covers only a sliver of its picture; its whole picture is used instead`, received: object.id });
    }
  }
  for (const beat of scene.beats)
    for (const action of beat.actions) if (action.do === "motion" && action.motion === "along" && action.along !== undefined) delete action.through;
  settleLifecycle(scene);
  leaveWithBearers(scene);
}

const WRITING: ReadonlySet<ObjectSpec["kind"]> = new Set(["text", "equation", "measure"]);

/** Leave out the faded copies a moving piece of writing would leave along its way: each says its words again. */
function dropGhostsOfWriting(scene: SceneSpec, sceneIndex: number, warnings: Diagnostic[]): void {
  const writing = new Set(scene.objects.filter((object) => WRITING.has(object.kind)).map((object) => object.id));
  scene.beats.forEach((beat, beatIndex) => beat.actions.forEach((action, actionIndex) => {
    if (action.do !== "motion" || !writing.has(action.target)) return;
    const path = `/scenes/${sceneIndex}/beats/${beatIndex}/actions/${actionIndex}`;
    if ("trail" in action && action.trail === "ghosts") {
      warnings.push({ code: "DROPPED_FIELD", path: `${path}/trail`, message: `'${action.target}' is writing: faded copies of it would say its words again`, received: action.trail });
      delete action.trail;
    }
    // A dated journey is written by faded copies of its traveller.
    if ("dates" in action && action.dates !== undefined) {
      warnings.push({ code: "DROPPED_FIELD", path: `${path}/dates`, message: `'${action.target}' is writing: its dates are left by faded copies of it, which would say its words again`, received: action.dates });
      delete action.dates;
    }
  }));
}

/**
 * Reveal each thing once and hide it at most once, while it is on screen: a second `show`, a `show`
 * of what is already there and a `hide` of what is not, or of what arrives in that same beat, each
 * change nothing, so they are removed
 * rather than refused with the scene, as is a name the scene never declared; showing or hiding a
 * place on a thing that has no window of its own — a part of a picture, an axis of a chart — is
 * showing or hiding the thing, and a figure never shown whole arrives with the first of its pieces.
 */
function settleLifecycle(scene: SceneSpec): void {
  const declared = new Set(scene.objects.map((object) => object.id));
  const windowed = new Set(lifecycleIds(scene));
  const whole = (target: string) => (windowed.has(target) ? target : target.split(".")[0]);
  const pieces = new Set(scene.objects.flatMap((object) => pieceNames(object).map((name) => `${object.id}.${name}`)));
  const onScreen = new Set(scene.objects.filter((object) => object.initial === "visible").map((object) => object.id));
  const shown = new Set(onScreen);
  const hidden = new Set<string>();
  // Marks given in an earlier beat that a hide may still take off.
  const marks = new Set<string>();
  for (const beat of scene.beats) {
    const arriving = new Set<string>();
    beat.actions = beat.actions.flatMap((action): ActionSpec[] => {
      if (action.do !== "show" && action.do !== "hide") return [action];
      const offMarks = action.do === "hide" ? [...new Set(action.targets.filter((target) => marks.has(target) && !declared.has(target)))] : [];
      for (const mark of offMarks) marks.delete(mark);
      // A part of drawn artwork keeps a window of its own, which the lifecycle pass judges. A thing
      // cannot leave in the beat it arrives in, so that hide changes nothing either.
      const settles = (target: string) =>
        action.do === "show" ? !shown.has(target) : onScreen.has(target) && !hidden.has(target) && !arriving.has(target);
      const named = [...new Set(action.targets.map(whole))].filter(
        (target) => declared.has(target.split(".")[0]) && (target.includes(".") || settles(target)),
      );
      const figures = action.do === "show" ? named.filter((target) => pieces.has(target) && !shown.has(target.split(".")[0])).map((target) => target.split(".")[0]) : [];
      const targets = [...new Set([...figures, ...named, ...offMarks])];
      for (const target of targets) {
        if (offMarks.includes(target)) continue;
        if (action.do === "show") {
          shown.add(target);
          onScreen.add(target);
          arriving.add(target);
        } else {
          hidden.add(target);
          onScreen.delete(target);
        }
      }
      return targets.length > 0 ? [{ ...action, targets }] : [];
    });
    for (const action of beat.actions) {
      const mark = markId(action);
      if (mark !== undefined) marks.add(mark);
    }
  }
  scene.beats = scene.beats.filter((beat) => beat.actions.length > 0);
}

/**
 * Writing set on, in or against a thing leaves on the beat that thing leaves: a name left behind
 * floated over whatever took the thing's place, or over nothing. A later hide of its own is then
 * one hide too many, so it goes.
 */
function leaveWithBearers(scene: SceneSpec): void {
  const specs = new Map(scene.objects.map((object) => [object.id, object]));
  const bearerOf = (object: ObjectSpec) => (object.attach?.to ?? (object.placement && object.placement.mode !== "zone" ? object.placement.target : undefined) ?? ("in" in object ? object.in : undefined))?.split(".")[0];
  const bearers = (object: ObjectSpec): string[] => {
    const chain: string[] = [];
    for (let id = bearerOf(object); id !== undefined && specs.has(id) && !chain.includes(id) && id !== object.id; id = bearerOf(specs.get(id)!)) chain.push(id);
    return chain;
  };
  const writing = scene.objects.filter((object) => object.kind === "text" || object.kind === "equation" || object.kind === "measure");
  const onScreen = new Set(scene.objects.filter((object) => object.initial === "visible").map((object) => object.id));
  const left = new Set<string>();
  scene.beats.forEach((beat, index) => {
    const arriving = new Set(beat.actions.flatMap((action) => (action.do === "show" ? action.targets : [])));
    const leaving = new Set(beat.actions.flatMap((action) => (action.do === "hide" ? action.targets : [])));
    const riders = writing.filter((words) => onScreen.has(words.id) && !arriving.has(words.id) && !leaving.has(words.id) && bearers(words).some((id) => leaving.has(id)));
    if (riders.length > 0) {
      const hide = beat.actions.find((action) => action.do === "hide")!;
      if (hide.do === "hide") hide.targets = [...hide.targets, ...riders.map((words) => words.id)];
      for (const words of riders) left.add(words.id);
      for (const later of scene.beats.slice(index + 1))
        later.actions = later.actions.flatMap((action): ActionSpec[] => {
          if (action.do !== "hide") return [action];
          const targets = action.targets.filter((target) => !left.has(target));
          return targets.length > 0 ? [{ ...action, targets }] : [];
        });
    }
    for (const id of arriving) onScreen.add(id);
    for (const id of [...leaving, ...riders.map((words) => words.id)]) onScreen.delete(id);
  });
  scene.beats = scene.beats.filter((beat) => beat.actions.length > 0);
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
