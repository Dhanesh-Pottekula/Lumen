import { resolvePace, resolveShot, resolveSize, resolveTheme, type ShotDefinition } from "./registry";
import { visualAssetAnchorMap, visualAssetBounds, visualOrientationAngle } from "./visual-catalog";
import type {
  ActionSpec,
  CompositionToken,
  LessonSpec,
  ObjectSpec,
  PaceToken,
  SceneSpec,
  ShotToken,
  SizeToken,
  SvgCompositePartSpec,
  ZoneToken,
} from "./types";
import { parseTarget } from "./target";
import { parseSvgArtwork } from "./svg";

export type Point = [number, number];

export interface ResolvedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolvedObject {
  id: string;
  kind: ObjectSpec["kind"] | "svg-part";
  source: ObjectSpec;
  position: Point;
  box: ResolvedBox;
  size: number;
  angle?: number;
  endpoints?: { from: Point; to: Point };
  compositeParent?: string;
  svgPart?: SvgCompositePartSpec;
}

interface ResolvedActionBase {
  source: ActionSpec;
  start: number;
  end: number;
  duration: number;
}

export interface ResolvedSimpleAction extends ResolvedActionBase {
  kind: "show" | "hide" | "label" | "motion" | "emphasize" | "attention" | "effect";
}

export interface ResolvedCameraAction extends ResolvedActionBase {
  kind: "camera";
  shot: ShotDefinition;
}

export interface ResolvedTourStop {
  target: string;
  label: string;
  shotToken: ShotToken;
  shot: ShotDefinition;
  moveStart: number;
  moveEnd: number;
  labelStart: number;
  labelEnd: number;
  exitEnd: number;
}

export interface ResolvedTourAction extends ResolvedActionBase {
  kind: "tour";
  stops: ResolvedTourStop[];
  returnStart?: number;
  returnEnd?: number;
}

export type ResolvedAction = ResolvedSimpleAction | ResolvedCameraAction | ResolvedTourAction;

export interface ResolvedBeat {
  id: string;
  pace: PaceToken;
  start: number;
  end: number;
  duration: number;
  actions: ResolvedAction[];
}

export interface ResolvedScene {
  id: string;
  composition: CompositionToken;
  theme: "TEXTBOOK" | "PARCHMENT" | "BLUEPRINT" | "CHALKBOARD";
  objects: ResolvedObject[];
  beats: ResolvedBeat[];
  duration: number;
}

export interface ResolvedLesson {
  version: "1";
  title: string;
  scenes: ResolvedScene[];
}

const ZONES: Record<CompositionToken, Record<ZoneToken, Point>> = {
  hero: {
    title: [460, 48], main: [460, 220], "main-left": [300, 220], "main-right": [620, 220], support: [460, 335],
    footer: [460, 398], background: [460, 215], overlay: [460, 215], hud: [785, 55],
  },
  "hero-diagram": {
    title: [460, 48], main: [460, 225], "main-left": [270, 225], "main-right": [660, 225], support: [460, 340],
    footer: [460, 398], background: [460, 215], overlay: [460, 215], hud: [785, 55],
  },
  equation: {
    title: [460, 48], main: [460, 205], "main-left": [280, 205], "main-right": [640, 205], support: [460, 315],
    footer: [460, 398], background: [460, 215], overlay: [460, 215], hud: [785, 55],
  },
  "overview-detail": {
    title: [460, 48], main: [460, 220], "main-left": [245, 220], "main-right": [675, 220], support: [460, 342],
    footer: [460, 398], background: [460, 215], overlay: [460, 215], hud: [785, 55],
  },
  split: {
    title: [460, 42], main: [460, 220], "main-left": [245, 220], "main-right": [675, 220], support: [460, 340],
    footer: [460, 397], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  comparison: {
    title: [460, 42], main: [460, 215], "main-left": [245, 215], "main-right": [675, 215], support: [460, 350],
    footer: [460, 370], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  process: {
    title: [460, 42], main: [460, 205], "main-left": [220, 205], "main-right": [700, 205], support: [460, 330],
    footer: [460, 395], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  "equation-plot": {
    title: [460, 40], main: [300, 220], "main-left": [255, 220], "main-right": [680, 215], support: [680, 330],
    footer: [460, 398], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  data: {
    title: [460, 38], main: [460, 218], "main-left": [270, 218], "main-right": [665, 218], support: [460, 350],
    footer: [460, 400], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  map: {
    title: [460, 36], main: [455, 220], "main-left": [250, 220], "main-right": [680, 220], support: [760, 335],
    footer: [460, 370], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  timeline: {
    title: [460, 42], main: [460, 205], "main-left": [270, 205], "main-right": [650, 205], support: [460, 325],
    footer: [460, 392], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  table: {
    title: [460, 42], main: [460, 220], "main-left": [260, 220], "main-right": [660, 220], support: [460, 345],
    footer: [460, 400], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
  "custom-relational": {
    title: [460, 42], main: [460, 215], "main-left": [250, 215], "main-right": [670, 215], support: [460, 345],
    footer: [460, 400], background: [460, 215], overlay: [460, 215], hud: [790, 54],
  },
};

function defaultSize(object: ObjectSpec): SizeToken {
  if (object.size) return object.size;
  if (object.role === "hero") return "hero";
  if (object.role === "support" || object.role === "annotation") return "small";
  if (object.kind === "text" && (object.textRole === "heading" || object.textRole === "title")) return "large";
  if (object.kind === "line") return "small";
  return "medium";
}

function defaultZone(object: ObjectSpec): ZoneToken {
  if (object.placement?.mode === "zone") return object.placement.zone;
  if (object.role === "background") return "background";
  if (object.role === "support") return "support";
  if (object.role === "annotation") return "overlay";
  if (object.role === "hud" || object.space === "screen") return "hud";
  if (object.kind === "text" && (object.textRole === "heading" || object.textRole === "title")) return "title";
  return "main";
}

function orientationAngle(object: ObjectSpec): number | undefined {
  if (object.kind === "vector") return object.rotate;
  if (object.kind === "visual") return visualOrientationAngle(object.asset, object.orientation);
  return undefined;
}

function dimensions(object: ObjectSpec, size: number): [number, number] {
  switch (object.kind) {
    case "text":
      return [Math.max(size * 2, object.text.length * size * 0.55), size * 1.35];
    case "equation":
      return [Math.max(size * 3, object.value.length * size * 0.48), size * 1.5];
    case "stat":
      return [Math.max(100, size * 3.4), size * 1.8];
    case "visual": {
      const bounds = visualAssetBounds(object.asset) ?? { width: 90, height: 90 };
      const angle = visualOrientationAngle(object.asset, object.orientation);
      const normalized = ((angle % 180) + 180) % 180;
      const quarterTurn = Math.abs(normalized - 90) < 0.0001;
      return quarterTurn
        ? [bounds.height * size, bounds.width * size]
        : [bounds.width * size, bounds.height * size];
    }
    case "vector":
      return [object.width ?? 220 * size, object.height ?? 140 * size];
    case "svg-composite":
      return [object.width, object.height];
    case "svg-artwork": {
      const viewBox = parseSvgArtwork(object.svg).value?.viewBox ?? [0, 0, 16, 9];
      const ratio = viewBox[2] / viewBox[3];
      const width = Math.min(760, 380 * size);
      return [width, width / ratio];
    }
    case "line":
      return [1, 1];
    case "shape":
      return [72 * size, 72 * size];
    case "curve":
      return [260 * size, 160 * size];
    case "chart":
      return [340 * Math.min(size, 1.65), 220 * Math.min(size, 1.65)];
    case "legend":
      return [180 * Math.min(size, 1.65), Math.max(48, object.categories.length * 28)];
    case "map":
      return [560 * Math.min(size, 1.2), 300 * Math.min(size, 1.2)];
    case "timeline":
      return [620 * Math.min(size, 1.2), 120 * Math.min(size, 1.2)];
    case "table": {
      const columns = Math.max(1, ...object.rows.map((row) => row.length));
      return [Math.min(720, columns * 150 * Math.min(size, 1.2)), object.rows.length * 34 * Math.min(size, 1.2)];
    }
    case "group":
      return [Math.min(650, object.children.length * 150 * Math.min(size, 1.2)), 150 * Math.min(size, 1.2)];
  }
}

function makeBox(position: Point, dimensions: [number, number]): ResolvedBox {
  return { x: position[0] - dimensions[0] / 2, y: position[1] - dimensions[1] / 2, w: dimensions[0], h: dimensions[1] };
}

function genericAnchor(object: ResolvedObject, anchor: string): Point | undefined {
  const { x, y, w, h } = object.box;
  const anchors: Record<string, Point> = {
    center: [x + w / 2, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], left: [x, y + h / 2], right: [x + w, y + h / 2],
  };
  return anchors[anchor];
}

function rotate(point: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return [point[0] * Math.cos(radians) - point[1] * Math.sin(radians), point[0] * Math.sin(radians) + point[1] * Math.cos(radians)];
}

function svgDefinition(source: ObjectSpec): { viewBox: [number, number, number, number]; parts: SvgCompositePartSpec[] } | undefined {
  if (source.kind === "svg-composite") return { viewBox: source.viewBox, parts: source.parts };
  if (source.kind === "svg-artwork") return parseSvgArtwork(source.svg).value;
  return undefined;
}

function resolvedCompositePart(parent: ResolvedObject, part: SvgCompositePartSpec): { position: Point; box: ResolvedBox } {
  const definition = svgDefinition(parent.source);
  if (!definition) return { position: [...parent.position], box: { ...parent.box } };
  const [vx, vy, vw, vh] = definition.viewBox;
  const [x, y, width, height] = part.bounds;
  const scaleX = parent.box.w / vw;
  const scaleY = parent.box.h / vh;
  const box: ResolvedBox = {
    x: parent.box.x + (x - vx) * scaleX,
    y: parent.box.y + (y - vy) * scaleY,
    w: width * scaleX,
    h: height * scaleY,
  };
  return { position: [box.x + box.w / 2, box.y + box.h / 2], box };
}

function resolveReference(target: string, objects: Map<string, ResolvedObject>): Point {
  const exact = objects.get(target);
  if (exact) return [...exact.position];
  for (const parent of objects.values()) {
    const definition = parent.compositeParent ? undefined : svgDefinition(parent.source);
    if (!definition) continue;
    const prefix = `${parent.id}.`;
    if (!target.startsWith(prefix)) continue;
    const remainder = target.slice(prefix.length);
    const [partId, anchor] = remainder.split(".");
    const part = definition.parts.find((candidate) => candidate.id === partId);
    if (!part) continue;
    const resolved = resolvedCompositePart(parent, part);
    return anchor ? genericAnchor({ ...parent, box: resolved.box, position: resolved.position }, anchor) ?? resolved.position : resolved.position;
  }
  const split = target.lastIndexOf(".");
  const object = objects.get(target.slice(0, split));
  const anchor = target.slice(split + 1);
  if (!object) return [460, 215];
  if (object.source.kind === "visual") {
    const local = visualAssetAnchorMap(object.source.asset)?.[anchor];
    if (local) {
      const transformed = rotate([local[0] * object.size, local[1] * object.size], object.angle ?? 0);
      return [object.position[0] + transformed[0], object.position[1] + transformed[1]];
    }
  }
  return genericAnchor(object, anchor) ?? [...object.position];
}

function resolveReferenceBox(target: string, objects: Map<string, ResolvedObject>): ResolvedBox | undefined {
  const exact = objects.get(target);
  if (exact) return exact.box;
  for (const parent of objects.values()) {
    const definition = parent.compositeParent ? undefined : svgDefinition(parent.source);
    if (!definition) continue;
    const prefix = `${parent.id}.`;
    if (!target.startsWith(prefix)) continue;
    const partId = target.slice(prefix.length).split(".")[0];
    const part = definition.parts.find((candidate) => candidate.id === partId);
    if (part) return resolvedCompositePart(parent, part).box;
  }
  const split = target.lastIndexOf(".");
  return split > 0 ? objects.get(target.slice(0, split))?.box : undefined;
}

// Safe frame the compiler keeps every object inside (view 920×430, 8px inset). Used to auto-fit and
// clamp object boxes so a mis-sized or mis-placed object degrades gracefully instead of overflowing.
const FIT_MAX_W = 920 - 16;
const FIT_MAX_H = 430 - 16;
const FRAME_MIN = 8;
const FRAME_MAX_X = 912;
const FRAME_MAX_Y = 422;

function resolveObjects(scene: SceneSpec): ResolvedObject[] {
  const counts = new Map<ZoneToken, number>();
  const zoneBottom = new Map<ZoneToken, number>();
  const objects: ResolvedObject[] = scene.objects.map((source) => {
    const zone = defaultZone(source);
    const count = counts.get(zone) ?? 0;
    counts.set(zone, count + 1);
    const base = ZONES[scene.composition][zone];
    const size0 = resolveSize(defaultSize(source), source.kind) ?? 1;
    const measured0 = dimensions(source, size0);
    // Auto-fit: if the object is bigger than the usable frame (920×430 minus an 8px inset), scale its
    // size and box down so it always fits — overflow degrades to a smaller object instead of failing.
    const fit = source.kind === "line" ? 1 : Math.min(1, FIT_MAX_W / measured0[0], FIT_MAX_H / measured0[1]);
    const size = fit < 1 ? size0 * fit : size0;
    const measured: [number, number] = fit < 1 ? [measured0[0] * fit, measured0[1] * fit] : measured0;
    const previousBottom = zoneBottom.get(zone);
    const cy = previousBottom === undefined ? base[1] : previousBottom + 24 + measured[1] / 2;
    const position: Point = [base[0], cy];
    zoneBottom.set(zone, cy + measured[1] / 2);
    return {
      id: source.id,
      kind: source.kind,
      source,
      position,
      size,
      angle: orientationAngle(source),
      box: makeBox(position, measured),
    };
  });
  const byId = new Map(objects.map((object) => [object.id, object]));

  const placed = new Set<string>();
  const placing = new Set<string>();
  const place = (object: ResolvedObject) => {
    if (placed.has(object.id) || placing.has(object.id)) return;
    placing.add(object.id);
    const placement = object.source.placement;
    if (!placement || placement.mode === "zone") {
      placing.delete(object.id);
      placed.add(object.id);
      return;
    }
    const targetRef = parseTarget(placement.target, new Set(byId.keys()));
    const dependency = byId.get(targetRef.objectId);
    const compositeDependency = dependency ?? [...byId.values()].find((candidate) =>
      !candidate.compositeParent
      && svgDefinition(candidate.source) !== undefined
      && placement.target.startsWith(`${candidate.id}.`));
    if (compositeDependency) place(compositeDependency);
    const target = resolveReference(placement.target, byId);
    if (placement.mode === "anchor") object.position = target;
    else {
      const targetBox = resolveReferenceBox(placement.target, byId) ?? makeBox(target, [1, 1]);
      const gap = 24;
      const relation = placement.relation;
      if (relation === "above") object.position = [target[0], targetBox.y - object.box.h / 2 - gap];
      if (relation === "below") object.position = [target[0], targetBox.y + targetBox.h + object.box.h / 2 + gap];
      if (relation === "left-of") object.position = [targetBox.x - object.box.w / 2 - gap, target[1]];
      if (relation === "right-of") object.position = [targetBox.x + targetBox.w + object.box.w / 2 + gap, target[1]];
      if (relation === "near") object.position = [target[0] + object.box.w / 2 + gap, target[1] + object.box.h / 2 + gap];
    }
    object.box = makeBox(object.position, [object.box.w, object.box.h]);
    placing.delete(object.id);
    placed.add(object.id);
  };
  objects.forEach(place);

  // Final clamp: nudge any box that still pokes outside the safe frame back inside (each already fits
  // after the per-object auto-fit, so a shift is always enough). Overflow can no longer occur.
  for (const object of objects) {
    if (object.source.kind === "line") continue;
    const { x, y, w, h } = object.box;
    let nx = x;
    let ny = y;
    if (nx < FRAME_MIN) nx = FRAME_MIN;
    if (ny < FRAME_MIN) ny = FRAME_MIN;
    if (nx + w > FRAME_MAX_X) nx = Math.max(FRAME_MIN, FRAME_MAX_X - w);
    if (ny + h > FRAME_MAX_Y) ny = Math.max(FRAME_MIN, FRAME_MAX_Y - h);
    if (nx !== x || ny !== y) {
      object.position = [nx + w / 2, ny + h / 2];
      object.box = makeBox(object.position, [w, h]);
    }
  }

  // Auto-separate overlapping content objects: nudge each significantly-overlapping pair apart along
  // the vertical axis, then re-clamp. The engine arranges the layout itself instead of erroring; any
  // residual overlap after this is cosmetic and tolerated by the render gate. Skips lightweight overlays
  // (background/annotation/hud/screen), lines, and intentionally-attached pairs (relative/anchor).
  const skipSeparation = (o: ResolvedObject) =>
    o.source.kind === "line" || o.source.role === "background" || o.source.role === "annotation"
    || o.source.role === "hud" || o.source.space === "screen";
  const attached = (a: ResolvedObject, b: ResolvedObject) => {
    const p = a.source.placement;
    return (p?.mode === "anchor" || p?.mode === "relative") && (p.target === b.id || p.target.startsWith(`${b.id}.`));
  };
  for (let iteration = 0; iteration < 6; iteration++) {
    let adjusted = false;
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const a = objects[i];
        const b = objects[j];
        if (skipSeparation(a) || skipSeparation(b) || attached(a, b) || attached(b, a)) continue;
        const overlapX = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
        const overlapY = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
        if (overlapX <= 1 || overlapY <= 1) continue;
        if (overlapX * overlapY < Math.min(a.box.w * a.box.h, b.box.w * b.box.h) * 0.12) continue; // ignore slivers
        const shift = overlapY / 2 + 3;
        const upper = a.box.y <= b.box.y ? a : b;
        const lower = upper === a ? b : a;
        upper.position = [upper.position[0], upper.position[1] - shift];
        lower.position = [lower.position[0], lower.position[1] + shift];
        upper.box = makeBox(upper.position, [upper.box.w, upper.box.h]);
        lower.box = makeBox(lower.position, [lower.box.w, lower.box.h]);
        adjusted = true;
      }
    }
    for (const object of objects) {
      if (object.source.kind === "line") continue;
      const { x, y, w, h } = object.box;
      let nx = x;
      let ny = y;
      if (nx < FRAME_MIN) nx = FRAME_MIN;
      if (ny < FRAME_MIN) ny = FRAME_MIN;
      if (nx + w > FRAME_MAX_X) nx = Math.max(FRAME_MIN, FRAME_MAX_X - w);
      if (ny + h > FRAME_MAX_Y) ny = Math.max(FRAME_MIN, FRAME_MAX_Y - h);
      if (nx !== x || ny !== y) {
        object.position = [nx + w / 2, ny + h / 2];
        object.box = makeBox(object.position, [w, h]);
      }
    }
    if (!adjusted) break;
  }

  for (const parent of [...objects]) {
    const definition = svgDefinition(parent.source);
    if (!definition) continue;
    for (const part of definition.parts) {
      const { box, position } = resolvedCompositePart(parent, part);
      const resolvedPart: ResolvedObject = {
        id: `${parent.id}.${part.id}`,
        kind: "svg-part",
        source: parent.source,
        position,
        box,
        size: parent.size,
        compositeParent: parent.id,
        svgPart: part,
      };
      objects.push(resolvedPart);
      byId.set(resolvedPart.id, resolvedPart);
    }
  }

  for (const object of objects) {
    if (object.source.kind !== "line") continue;
    const from = resolveReference(object.source.from, byId);
    const to = resolveReference(object.source.to, byId);
    object.endpoints = { from, to };
    object.position = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    object.box = { x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]), w: Math.abs(to[0] - from[0]), h: Math.abs(to[1] - from[1]) };
  }
  return objects;
}

function resolveAction(action: ActionSpec, start: number, paceToken: PaceToken): ResolvedAction {
  const pace = resolvePace(paceToken)!;
  if (action.do === "tour") {
    let cursor = start;
    const stops = action.stops.map((stop): ResolvedTourStop => {
      const shotToken = stop.shot ?? "close";
      const shot = resolveShot(shotToken)!;
      const moveStart = cursor;
      const moveEnd = moveStart + shot.duration;
      const labelStart = moveEnd;
      const labelEnd = labelStart + pace.hold;
      const exitEnd = labelEnd + pace.transition;
      cursor = exitEnd;
      return { target: stop.target, label: stop.label, shotToken, shot, moveStart, moveEnd, labelStart, labelEnd, exitEnd };
    });
    const returnStart = action.returnTo === "overview" ? cursor : undefined;
    const returnShot = resolveShot("overview")!;
    const returnEnd = returnStart === undefined ? undefined : returnStart + returnShot.duration;
    const end = returnEnd ?? cursor;
    return { kind: "tour", source: action, start, end, duration: end - start, stops, returnStart, returnEnd };
  }
  if (action.do === "camera") {
    const shot = resolveShot(action.shot ?? "medium")!;
    const duration = action.movement === "cut" ? 0 : shot.duration;
    return { kind: "camera", source: action, shot, start, end: start + duration, duration };
  }
  const duration = action.do === "label" || action.do === "motion" || action.do === "attention" || action.do === "effect" || action.do === "emphasize"
    ? pace.duration
    : pace.transition;
  return { kind: action.do, source: action, start, end: start + duration, duration };
}

function resolveScene(scene: SceneSpec, theme: ResolvedScene["theme"], floor?: number): ResolvedScene {
  let cursor = 0;
  const beats = scene.beats.map((beat): ResolvedBeat => {
    const paceToken = beat.pace ?? "normal";
    const pace = resolvePace(paceToken)!;
    const actions = beat.actions.map((action) => resolveAction(action, cursor, paceToken));
    const end = Math.max(cursor + pace.duration, ...actions.map((action) => action.end));
    const resolved = { id: beat.id, pace: paceToken, start: cursor, end, duration: end - cursor, actions };
    cursor = end;
    return resolved;
  });
  // Narration floor: a narrated scene lasts at least as long as its spoken lines (a little longer, never
  // shorter). Any time beyond the paced beats is a trailing hold on the final composed frame while the
  // narrator finishes — authored motion keeps its speed rather than being stretched.
  const duration = floor !== undefined ? Math.max(cursor, floor) : cursor;
  return { id: scene.id, composition: scene.composition, theme, objects: resolveObjects(scene), beats, duration };
}

export function resolveLesson(spec: LessonSpec, sceneFloors?: Map<string, number>): ResolvedLesson {
  const theme = resolveTheme(spec.theme)!;
  return {
    version: spec.version,
    title: spec.title,
    scenes: spec.scenes.map((scene) => resolveScene(scene, theme, sceneFloors?.get(scene.id))),
  };
}
