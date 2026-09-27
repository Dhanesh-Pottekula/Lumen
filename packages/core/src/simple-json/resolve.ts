import { estimateTextWidth } from "../gcl/measure";
import { VIEW_HEIGHT, VIEW_INSET, VIEW_WIDTH } from "../gcl/viewport";
import { measureMath } from "../render/mathtext";
import { formatNumber } from "../render/type-motion";
import {
  resolvePace,
  resolveShot,
  resolveSize,
  resolveTheme,
  type ShotDefinition,
} from "./registry";
import {
  visualAssetAnchorMap,
  visualAssetBounds,
  visualOrientationAngle,
} from "./visual-catalog";
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
import { fitUnit, nearestSample, sampleCurve } from "./curve";
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
  kind:
    | "show"
    | "hide"
    | "label"
    | "motion"
    | "emphasize"
    | "attention"
    | "effect"
    | "fill";
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

export type ResolvedAction =
  | ResolvedSimpleAction
  | ResolvedCameraAction
  | ResolvedTourAction;

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

// Slide-furniture anchors, hand-tuned against the reference view space below and then scaled once
// into the live viewport. Keeping the authored numbers in one fixed space means a viewport change
// is a single edit in gcl/viewport.ts instead of 108 re-derived coordinates.
const DESIGN_WIDTH = 920;
const DESIGN_HEIGHT = 430;

const DESIGN_ZONES: Record<CompositionToken, Record<ZoneToken, Point>> = {
  hero: {
    title: [460, 48],
    main: [460, 220],
    "main-left": [300, 220],
    "main-right": [620, 220],
    support: [460, 335],
    footer: [460, 398],
    background: [460, 215],
    overlay: [460, 215],
    hud: [785, 55],
  },
  "hero-diagram": {
    title: [460, 48],
    main: [460, 225],
    "main-left": [270, 225],
    "main-right": [660, 225],
    support: [460, 340],
    footer: [460, 398],
    background: [460, 215],
    overlay: [460, 215],
    hud: [785, 55],
  },
  equation: {
    title: [460, 48],
    main: [460, 205],
    "main-left": [280, 205],
    "main-right": [640, 205],
    support: [460, 315],
    footer: [460, 398],
    background: [460, 215],
    overlay: [460, 215],
    hud: [785, 55],
  },
  "overview-detail": {
    title: [460, 48],
    main: [460, 220],
    "main-left": [245, 220],
    "main-right": [675, 220],
    support: [460, 342],
    footer: [460, 398],
    background: [460, 215],
    overlay: [460, 215],
    hud: [785, 55],
  },
  split: {
    title: [460, 42],
    main: [460, 220],
    "main-left": [245, 220],
    "main-right": [675, 220],
    support: [460, 340],
    footer: [460, 397],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  comparison: {
    title: [460, 42],
    main: [460, 215],
    "main-left": [245, 215],
    "main-right": [675, 215],
    support: [460, 350],
    footer: [460, 370],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  process: {
    title: [460, 42],
    main: [460, 205],
    "main-left": [220, 205],
    "main-right": [700, 205],
    support: [460, 330],
    footer: [460, 395],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  "equation-plot": {
    title: [460, 40],
    main: [300, 220],
    "main-left": [255, 220],
    "main-right": [680, 215],
    support: [680, 330],
    footer: [460, 398],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  data: {
    title: [460, 38],
    main: [460, 218],
    "main-left": [270, 218],
    "main-right": [665, 218],
    support: [460, 350],
    footer: [460, 400],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  map: {
    title: [460, 36],
    main: [455, 220],
    "main-left": [250, 220],
    "main-right": [680, 220],
    support: [760, 335],
    footer: [460, 370],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  timeline: {
    title: [460, 42],
    main: [460, 205],
    "main-left": [270, 205],
    "main-right": [650, 205],
    support: [460, 325],
    footer: [460, 392],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  table: {
    title: [460, 42],
    main: [460, 220],
    "main-left": [260, 220],
    "main-right": [660, 220],
    support: [460, 345],
    footer: [460, 400],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
  "custom-relational": {
    title: [460, 42],
    main: [460, 215],
    "main-left": [250, 215],
    "main-right": [670, 215],
    support: [460, 345],
    footer: [460, 400],
    background: [460, 215],
    overlay: [460, 215],
    hud: [790, 54],
  },
};

function scaleZones(
  design: Record<CompositionToken, Record<ZoneToken, Point>>,
): Record<CompositionToken, Record<ZoneToken, Point>> {
  const scaled = {} as Record<CompositionToken, Record<ZoneToken, Point>>;
  for (const composition of Object.keys(design) as CompositionToken[]) {
    const zones = {} as Record<ZoneToken, Point>;
    for (const zone of Object.keys(design[composition]) as ZoneToken[]) {
      const [x, y] = design[composition][zone];
      zones[zone] = [
        (x / DESIGN_WIDTH) * VIEW_WIDTH,
        (y / DESIGN_HEIGHT) * VIEW_HEIGHT,
      ];
    }
    scaled[composition] = zones;
  }
  return scaled;
}

const ZONES = scaleZones(DESIGN_ZONES);

/** Where one composition puts a named zone, so a motion can be sent to a zone rather than to a decoy
 *  object standing in it. */
export function zoneCentre(
  composition: CompositionToken,
  zone: string,
): Point | undefined {
  return ZONES[composition]?.[zone as ZoneToken];
}

function defaultSize(object: ObjectSpec): SizeToken {
  if (object.size) return object.size;
  if (object.role === "hero") return "hero";
  if (object.role === "support" || object.role === "annotation") return "small";
  if (
    object.kind === "text" &&
    (object.textRole === "heading" || object.textRole === "title")
  )
    return "large";
  if (object.kind === "line") return "small";
  return "medium";
}

function defaultZone(object: ObjectSpec): ZoneToken {
  if (object.placement?.mode === "zone") return object.placement.zone;
  if (object.role === "background") return "background";
  if (object.role === "support") return "support";
  if (object.role === "annotation") return "overlay";
  if (object.role === "hud" || object.space === "screen") return "hud";
  if (
    object.kind === "text" &&
    (object.textRole === "heading" || object.textRole === "title")
  )
    return "title";
  return "main";
}

function orientationAngle(object: ObjectSpec): number | undefined {
  if (object.kind === "vector") return object.rotate;
  if (object.kind === "visual")
    return visualOrientationAngle(object.asset, object.orientation);
  return undefined;
}

/**
 * Size an authored object for layout, using the SAME measurement the painter uses.
 *
 * Layout, the safe-frame clamp, the overlap pass and LAYOUT_OVERFLOW all read this box, so any
 * disagreement with `gcl/measure.ts` is silent misplacement. Text was the worst case: a narrower
 * estimate here made auto-fit stop shrinking exactly when the *understated* box touched the frame,
 * which guaranteed the drawn glyphs overhung both edges with no warning. Kinds whose painter takes
 * its size from the box itself (svg, chart, map, …) stay analytic below.
 */
/**
 * On-screen extent of one artwork, per size word, in the fixed 540-wide view space.
 *
 * This is the LONGER side, not the width: a tall thing sized by its width comes out as tall as the
 * screen — a feather asked for at `small` with a 1:3 aspect was 200 wide and 600 down, dwarfing the
 * planet it fell past. The word now bounds whichever side is longer, so it means the same amount of
 * screen whatever the shape. The numbers leave room for what sits BESIDE the thing: `medium` at 260
 * is half the frame, so a second object, its arrows and its labels still have somewhere to go. An artwork's own viewBox is a coordinate system and carries no size, so
 * the number has to come from here; an explicit `width` still overrides it.
 */
const ARTWORK_EXTENTS: Record<SizeToken, number> = {
  tiny: 70,
  mini: 110,
  small: 155,
  compact: 205,
  medium: 260,
  large: 300,
  hero: 330,
  fill: VIEW_WIDTH - VIEW_INSET * 2,
};

function dimensions(object: ObjectSpec, size: number, backdropCount = 1): [number, number] {
  switch (object.kind) {
    case "text":
      return [estimateTextWidth(object.text, size), size * 1.3];
    case "equation": {
      const measured = measureMath(object.value, size);
      return [measured.w, measured.h];
    }
    case "measure": {
      // The painter draws prefix + grouped digits + unit, then a 14px label under it (gcl/compile.ts).
      const suffix = object.unit
        ? /^[%+°‰]/.test(object.unit)
          ? object.unit
          : ` ${object.unit}`
        : "";
      const readout = formatNumber(object.value, {
        commas: object.commas ?? true,
        decimals: object.decimals,
        prefix: object.prefix,
        suffix,
      });
      const width = Math.max(
        estimateTextWidth(readout, size),
        object.label ? estimateTextWidth(object.label, 14) : 0,
      );
      const captionRoom = object.label ? 14 * 1.3 : 0;
      // A meter is drawn around or under the digits, so the box has to hold it or the layout packs
      // the next object over the top of a bar the reader never sees coming.
      if (!object.scale) return [width, size * 1.5 + captionRoom];
      if (object.meter === "ring") {
        const across = size * 3.2;
        return [Math.max(width, across), across + captionRoom];
      }

      return [Math.max(width, size * 4.5), size * 1.5 + size * 0.62 + captionRoom];
    }
    case "visual": {
      const bounds = visualAssetBounds(object.asset) ?? {
        width: 90,
        height: 90,
      };
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
      const viewBox = parseSvgArtwork(object.svg).value?.viewBox ?? [
        0, 0, 16, 9,
      ];
      const ratio = viewBox[2] / viewBox[3];
      // A backdrop is the place the scene happens in — a map, a shore, a sky over ground — so it
      // covers the whole view whatever size word it was given; everything else is placed ON it.
      // Two places compared in one scene each take a band of the screen, one above the other.
      if (object.role === "background") {
        const bandHeight = VIEW_HEIGHT / Math.max(1, backdropCount);
        const width = Math.max(VIEW_WIDTH, bandHeight * ratio);
        return [width, width / ratio];
      }
      const extent = ARTWORK_EXTENTS[defaultSize(object)];
      const width = object.width ?? (ratio >= 1 ? extent : extent * ratio);
      return [width, width / ratio];
    }
    case "line":
    case "angle":
    case "span":
      return [1, 1];
    case "shape":
      return [72 * size, 72 * size];
    case "curve":
      return [260 * size, 160 * size];
    case "chart":
      return [340 * Math.min(size, 1.65), 220 * Math.min(size, 1.65)];
    case "legend":
      return [
        180 * Math.min(size, 1.65),
        Math.max(48, object.categories.length * 28),
      ];
    case "map":
      // A real place the scene happens in fills the screen like any backdrop; the projection fits
      // the regions inside it.
      if (object.role === "background") return [VIEW_WIDTH, VIEW_HEIGHT];
      return [560 * Math.min(size, 1.2), 300 * Math.min(size, 1.2)];
    case "timeline":
      return [620 * Math.min(size, 1.2), 120 * Math.min(size, 1.2)];
    case "table": {
      const columns = Math.max(1, ...object.rows.map((row) => row.length));
      return [
        Math.min(720, columns * 150 * Math.min(size, 1.2)),
        object.rows.length * 34 * Math.min(size, 1.2),
      ];
    }
    case "group":
      return [
        Math.min(650, object.children.length * 150 * Math.min(size, 1.2)),
        150 * Math.min(size, 1.2),
      ];
  }
}

function makeBox(position: Point, dimensions: [number, number]): ResolvedBox {
  return {
    x: position[0] - dimensions[0] / 2,
    y: position[1] - dimensions[1] / 2,
    w: dimensions[0],
    h: dimensions[1],
  };
}

function genericAnchor(
  object: ResolvedObject,
  anchor: string,
): Point | undefined {
  const { x, y, w, h } = object.box;
  const anchors: Record<string, Point> = {
    center: [x + w / 2, y + h / 2],
    top: [x + w / 2, y],
    bottom: [x + w / 2, y + h],
    left: [x, y + h / 2],
    right: [x + w, y + h / 2],
  };
  return anchors[anchor];
}

function rotate(point: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return [
    point[0] * Math.cos(radians) - point[1] * Math.sin(radians),
    point[0] * Math.sin(radians) + point[1] * Math.cos(radians),
  ];
}

function svgDefinition(
  source: ObjectSpec,
):
  | { viewBox: [number, number, number, number]; parts: SvgCompositePartSpec[] }
  | undefined {
  if (source.kind === "svg-composite")
    return { viewBox: source.viewBox, parts: source.parts };
  if (source.kind === "svg-artwork") return parseSvgArtwork(source.svg).value;
  return undefined;
}

function resolvedCompositePart(
  parent: ResolvedObject,
  part: SvgCompositePartSpec,
): { position: Point; box: ResolvedBox } {
  const definition = svgDefinition(parent.source);
  if (!definition)
    return { position: [...parent.position], box: { ...parent.box } };
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

function resolveReference(
  target: string,
  objects: Map<string, ResolvedObject>,
): Point {
  const exact = objects.get(target);
  if (exact) return [...exact.position];
  for (const parent of objects.values()) {
    const definition = parent.compositeParent
      ? undefined
      : svgDefinition(parent.source);
    if (!definition) continue;
    const prefix = `${parent.id}.`;
    if (!target.startsWith(prefix)) continue;
    const remainder = target.slice(prefix.length);
    const [partId, anchor] = remainder.split(".");
    const part = definition.parts.find((candidate) => candidate.id === partId);
    if (!part) continue;
    const resolved = resolvedCompositePart(parent, part);
    return anchor
      ? (genericAnchor(
          { ...parent, box: resolved.box, position: resolved.position },
          anchor,
        ) ?? resolved.position)
      : resolved.position;
  }
  const split = target.lastIndexOf(".");
  const object = objects.get(target.slice(0, split));
  const anchor = target.slice(split + 1);
  if (!object) return [460, 215];
  if (object.source.kind === "visual") {
    const local = visualAssetAnchorMap(object.source.asset)?.[anchor];
    if (local) {
      const transformed = rotate(
        [local[0] * object.size, local[1] * object.size],
        object.angle ?? 0,
      );
      return [
        object.position[0] + transformed[0],
        object.position[1] + transformed[1],
      ];
    }
  }
  return genericAnchor(object, anchor) ?? [...object.position];
}

// A line connects two objects, and both references resolve to a CENTRE. Left there, the shaft runs
// into the middle of whatever it points at and is painted over by it — an arrow loses its head, which
// is the one part carrying the meaning. Each end is walked out to the edge of its target's box along
// the line's own direction, so the connection starts and stops where the objects visibly do.
export function towardEdge(
  centre: Point,
  box: ResolvedBox | undefined,
  toward: Point,
): Point {
  if (!box) return centre;
  const dx = toward[0] - centre[0];
  const dy = toward[1] - centre[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return centre;
  const ux = dx / length;
  const uy = dy / length;
  const reach = Math.min(
    Math.abs(ux) < 1e-6 ? Infinity : box.w / 2 / Math.abs(ux),
    Math.abs(uy) < 1e-6 ? Infinity : box.h / 2 / Math.abs(uy),
  );
  if (!Number.isFinite(reach) || reach <= 0) return centre;

  return [centre[0] + ux * reach, centre[1] + uy * reach];
}

function resolveReferenceBox(
  target: string,
  objects: Map<string, ResolvedObject>,
): ResolvedBox | undefined {
  const exact = objects.get(target);
  if (exact) return exact.box;
  for (const parent of objects.values()) {
    const definition = parent.compositeParent
      ? undefined
      : svgDefinition(parent.source);
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

// Safe frame the compiler keeps every object inside (the view space, inset on every edge). Used to
// auto-fit and clamp object boxes so a mis-sized or mis-placed object degrades gracefully instead
// of overflowing.
// A named asset's catalog bounds are its true extent relative to the other assets — an apple is 32
// units, a planet 64 — which is a whole register below what the same size word gives an artwork.
// Lifting the family together keeps them proportionate to each other and to everything else drawn.
const ASSET_SCALE = 4;

const FIT_MAX_W = VIEW_WIDTH - VIEW_INSET * 2;
const FIT_MAX_H = VIEW_HEIGHT - VIEW_INSET * 2;
const FRAME_MIN = VIEW_INSET;
const FRAME_MAX_X = VIEW_WIDTH - VIEW_INSET;
const FRAME_MAX_Y = VIEW_HEIGHT - VIEW_INSET;

/** An artwork that is the place a scene happens in: it covers the view and nothing lays it out. */
/**
 * Where a traveller belongs before it sets off: the nearest point of a curve anchored on a point, or
 * the nearer end of a route laid between two things. A thing that is itself one end of the route stays
 * put, since the route already starts on it. Undefined when the route has no geometry to rest on.
 */
function routeEntry(rider: ResolvedObject, path: ResolvedObject, byId: Map<string, ResolvedObject>): Point | undefined {
  const placement = path.source.placement;
  if (path.source.kind === "curve" && placement?.mode === "anchor") {
    const centre = resolveReference(placement.target, byId);
    const reach = Math.hypot(rider.position[0] - centre[0], rider.position[1] - centre[1]);
    const sampled = reach > 0.001 ? sampleCurve(path.source, centre, fitUnit(path.source, centre, reach)) : undefined;
    return sampled ? sampled[nearestSample(sampled, rider.position)] : undefined;
  }
  const ends = path.endpoints;
  const source = path.source;
  const named = source.kind === "line" || source.kind === "span" || source.kind === "curve" ? [source.from, source.to] : [];
  if (!ends || named.some((end) => end !== undefined && parseTarget(end, new Set(byId.keys())).objectId === rider.id)) return undefined;
  const toFrom = Math.hypot(rider.position[0] - ends.from[0], rider.position[1] - ends.from[1]);
  const toTo = Math.hypot(rider.position[0] - ends.to[0], rider.position[1] - ends.to[1]);
  return toTo < toFrom ? ends.to : ends.from;
}

function backdrop(source: ObjectSpec): boolean {
  return (source.kind === "svg-artwork" || source.kind === "map") && source.role === "background";
}

/** The longer side an object would take at its own size word, before any fitting. */
function ownExtent(source: ObjectSpec): number {
  const measured = dimensions(source, resolveSize(defaultSize(source), source.kind) ?? 1);
  return Math.max(measured[0], measured[1]);
}

function resolveObjects(scene: SceneSpec): ResolvedObject[] {
  const counts = new Map<ZoneToken, number>();
  const zoneBottom = new Map<ZoneToken, number>();
  // A thing that helps the picture never outgrows half the thing it helps: a drop beside a plant, a
  // sun beside a leaf. The planner is asked for this and forgets; the layout does not.
  const leading = (source: ObjectSpec) =>
    source.kind === "svg-artwork" && !backdrop(source) && (source.role === undefined || source.role === "hero" || source.role === "primary");
  const lead = Math.max(0, ...scene.objects.filter(leading).map(ownExtent));
  const backdrops = scene.objects.filter(backdrop);
  const objects: ResolvedObject[] = scene.objects.map((source) => {
    const zone = defaultZone(source);
    const count = counts.get(zone) ?? 0;
    counts.set(zone, count + 1);
    const base = ZONES[scene.composition][zone];
    const size0 =
      (resolveSize(defaultSize(source), source.kind) ?? 1) *
      (source.kind === "visual" ? ASSET_SCALE : 1);
    const measured0 = dimensions(source, size0, backdrops.length);
    // Auto-fit: if the object is bigger than the usable frame (the view space minus its inset), scale its
    // size and box down so it always fits — overflow degrades to a smaller object instead of failing.
    const supporting =
      source.kind === "svg-artwork" && !backdrop(source) && (source.role === "support" || source.role === "annotation") && lead > 0;
    const cap = supporting ? Math.min(1, (lead * 0.5) / Math.max(measured0[0], measured0[1])) : 1;
    const fit =
      source.kind === "line" || backdrop(source)
        ? 1
        : Math.min(cap, FIT_MAX_W / measured0[0], FIT_MAX_H / measured0[1]);
    const size = fit < 1 ? size0 * fit : size0;
    const measured: [number, number] =
      fit < 1 ? [measured0[0] * fit, measured0[1] * fit] : measured0;
    const previousBottom = zoneBottom.get(zone);
    const cy =
      previousBottom === undefined
        ? base[1]
        : previousBottom + 24 + measured[1] / 2;
    const band = backdrop(source) ? backdrops.indexOf(source) : -1;
    const position: Point = backdrop(source)
      ? [VIEW_WIDTH / 2, (VIEW_HEIGHT / backdrops.length) * (band + 0.5)]
      : [base[0], cy];
    if (!backdrop(source)) zoneBottom.set(zone, cy + measured[1] / 2);
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
    const compositeDependency =
      dependency ??
      [...byId.values()].find(
        (candidate) =>
          !candidate.compositeParent &&
          svgDefinition(candidate.source) !== undefined &&
          placement.target.startsWith(`${candidate.id}.`),
      );
    if (compositeDependency) place(compositeDependency);
    const target = resolveReference(placement.target, byId);
    if (placement.mode === "anchor") object.position = target;
    else {
      const targetBox =
        resolveReferenceBox(placement.target, byId) ?? makeBox(target, [1, 1]);
      const gap = 24;
      const relation = placement.relation;
      if (relation === "above")
        object.position = [target[0], targetBox.y - object.box.h / 2 - gap];
      if (relation === "below")
        object.position = [
          target[0],
          targetBox.y + targetBox.h + object.box.h / 2 + gap,
        ];
      if (relation === "left-of")
        object.position = [targetBox.x - object.box.w / 2 - gap, target[1]];
      if (relation === "right-of")
        object.position = [
          targetBox.x + targetBox.w + object.box.w / 2 + gap,
          target[1],
        ];
      if (relation === "near")
        object.position = [
          target[0] + object.box.w / 2 + gap,
          target[1] + object.box.h / 2 + gap,
        ];
    }
    object.box = makeBox(object.position, [object.box.w, object.box.h]);
    placing.delete(object.id);
    placed.add(object.id);
  };
  objects.forEach(place);

  // Final clamp: nudge any box that still pokes outside the safe frame back inside (each already fits
  // after the per-object auto-fit, so a shift is always enough). Overflow can no longer occur.
  for (const object of objects) {
    if (object.source.kind === "line" || backdrop(object.source)) continue;
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

  // Auto-separate overlapping content objects: push each significantly-overlapping pair apart along
  // the axis they are ALREADY furthest apart on — the shorter push, which is also the one that keeps
  // what the writer meant. Two things put in `main-left` and `main-right` sit at the same height by
  // design, so a vertical-only push drove one of them under the other and read as "the sun is below
  // the plant". Then re-clamp. The engine arranges the layout itself instead of erroring; any
  // residual overlap after this is cosmetic and tolerated by the render gate. Skips lightweight overlays
  // (background/annotation/hud/screen), lines, and intentionally-attached pairs (relative/anchor).
  // An annotation attached to something is meant to sit on it; one dropped into a zone is furniture,
  // and a footer caption printed across the artwork above it is the commonest way a frame comes out
  // unreadable.
  const skipSeparation = (o: ResolvedObject) =>
    o.source.kind === "line" ||
    o.source.role === "background" ||
    (o.source.role === "annotation" && o.source.placement?.mode !== "zone");
  // A heading is `role: "hud"`, `space: "screen"` and dropped in the title zone, so skipping those
  // outright let world content walk straight over the one text every scene has. Pinned objects hold
  // their place and are an obstacle to everything else, which moves the whole overlap instead of half.
  const pinned = (o: ResolvedObject) =>
    o.source.role === "hud" || o.source.space === "screen";
  const attached = (a: ResolvedObject, b: ResolvedObject) => {
    const p = a.source.placement;
    return (
      (p?.mode === "anchor" || p?.mode === "relative") &&
      (p.target === b.id || p.target.startsWith(`${b.id}.`))
    );
  };
  for (let iteration = 0; iteration < 6; iteration++) {
    let adjusted = false;
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const a = objects[i];
        const b = objects[j];
        if (
          skipSeparation(a) ||
          skipSeparation(b) ||
          (pinned(a) && pinned(b)) ||
          attached(a, b) ||
          attached(b, a)
        )
          continue;
        const overlapX =
          Math.min(a.box.x + a.box.w, b.box.x + b.box.w) -
          Math.max(a.box.x, b.box.x);
        const overlapY =
          Math.min(a.box.y + a.box.h, b.box.y + b.box.h) -
          Math.max(a.box.y, b.box.y);
        if (overlapX <= 1 || overlapY <= 1) continue;
        if (
          overlapX * overlapY <
          Math.min(a.box.w * a.box.h, b.box.w * b.box.h) * 0.12
        )
          continue; // ignore slivers
        // Push along the axis of SMALLER overlap: things placed side by side part sideways and stay
        // side by side; things stacked part vertically. A tie goes to the axis whose centres already
        // differ, so a pair that only just overlaps keeps the arrangement it was given.
        const sideways =
          overlapX < overlapY ||
          (overlapX === overlapY && Math.abs(a.position[0] - b.position[0]) > Math.abs(a.position[1] - b.position[1]));
        const axis = sideways ? 0 : 1;
        const overlap = sideways ? overlapX : overlapY;
        // Compare CENTRES, not near edges: a big object always has the lower near edge, so an edge
        // comparison pushed it further out even when its centre sat well past the other one — and the
        // pair then walked straight past each other, inverting the authored order. On an exact tie the
        // one the writer named first keeps the near side, so the order never flips at random.
        const first = a.position[axis] <= b.position[axis] ? a : b;
        const second = first === a ? b : a;
        const shift = overlap / 2 + 3;
        const move = (o: ResolvedObject, by: number) => {
          o.position = axis === 0 ? [o.position[0] + by, o.position[1]] : [o.position[0], o.position[1] + by];
          o.box = makeBox(o.position, [o.box.w, o.box.h]);
        };
        if (pinned(first)) move(second, overlap + 6);
        else if (pinned(second)) move(first, -(overlap + 6));
        else {
          move(first, -shift);
          move(second, shift);
        }
        adjusted = true;
      }
    }
    for (const object of objects) {
      if (object.source.kind === "line" || backdrop(object.source)) continue;
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

  // A thing that travels a curve anchored on a point rests ON that curve: its resting distance from
  // the point is the curve's unit, and it is moved to the nearest point of the shape (children placed
  // against it go with it). The layout words put it roughly there; the equation decides exactly where,
  // so the first frame of the motion never jumps and the scene never has to be refused for it.
  const riders = scene.beats
    .flatMap((beat) => beat.actions)
    .flatMap((action) => (action.do === "motion" && action.motion === "along" ? [action] : []));
  for (const action of riders) {
    const rider = byId.get(action.target);
    const path = byId.get(action.along);
    if (!rider || !path) continue;
    const rest = routeEntry(rider, path, byId);
    if (!rest) continue;
    const shift: Point = [rest[0] - rider.position[0], rest[1] - rider.position[1]];
    if (Math.hypot(shift[0], shift[1]) < 0.5) continue;
    const carried = new Set([rider.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const object of objects) {
        const p = object.source.placement;
        const parent = p && p.mode !== "zone" ? parseTarget(p.target, new Set(byId.keys())).objectId : undefined;
        if (parent === undefined || carried.has(object.id) || !carried.has(parent)) continue;
        carried.add(object.id);
        grew = true;
      }
    }
    for (const object of objects) {
      if (!carried.has(object.id)) continue;
      object.position = [object.position[0] + shift[0], object.position[1] + shift[1]];
      object.box = makeBox(object.position, [object.box.w, object.box.h]);
    }
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
    if (object.source.kind === "angle" || object.source.kind === "span") {
      const a = resolveReference(object.source.from, byId);
      const b = resolveReference(object.source.to, byId);
      const pivot =
        object.source.kind === "angle"
          ? resolveReference(object.source.at, byId)
          : undefined;
      const anchor = pivot ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      object.endpoints = { from: a, to: b };
      object.position = anchor as Point;
      object.box = {
        x: Math.min(a[0], b[0], anchor[0]),
        y: Math.min(a[1], b[1], anchor[1]),
        w: Math.abs(Math.max(a[0], b[0], anchor[0]) - Math.min(a[0], b[0], anchor[0])),
        h: Math.abs(Math.max(a[1], b[1], anchor[1]) - Math.min(a[1], b[1], anchor[1])),
      };
      continue;
    }
    // A `curve` that names two ends is laid between them exactly like a connector; one that names
    // none keeps its zone placement and is centred there. Anchored on a point, it turns about that
    // point and any ends it also names are ignored — the two aims contradict each other.
    const aimed =
      object.source.kind === "line" ||
      (object.source.kind === "curve" &&
        object.source.from !== undefined &&
        object.source.to !== undefined &&
        object.source.placement?.mode !== "anchor");
    if (!aimed) continue;
    const source = object.source as { from: string; to: string };
    const fromCentre = resolveReference(source.from, byId);
    const toCentre = resolveReference(source.to, byId);
    const from = towardEdge(fromCentre, resolveReferenceBox(source.from, byId), toCentre);
    const to = towardEdge(toCentre, resolveReferenceBox(source.to, byId), fromCentre);
    // Two objects can end up overlapping — the safe-frame clamp pulls one back inside the other when
    // a scene is crowded — and walking both ends outwards then crosses them over, drawing the
    // connection backwards. Centres cannot cross, so they are the fallback.
    const crossed =
      (to[0] - from[0]) * (toCentre[0] - fromCentre[0]) +
        (to[1] - from[1]) * (toCentre[1] - fromCentre[1]) <=
      0;
    object.endpoints = crossed
      ? { from: fromCentre, to: toCentre }
      : { from, to };
    object.position = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    object.box = {
      x: Math.min(from[0], to[0]),
      y: Math.min(from[1], to[1]),
      w: Math.abs(to[0] - from[0]),
      h: Math.abs(to[1] - from[1]),
    };
  }
  return objects;
}

function resolveAction(
  action: ActionSpec,
  start: number,
  paceToken: PaceToken,
): ResolvedAction {
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
      return {
        target: stop.target,
        label: stop.label,
        shotToken,
        shot,
        moveStart,
        moveEnd,
        labelStart,
        labelEnd,
        exitEnd,
      };
    });
    const returnStart = action.returnTo === "overview" ? cursor : undefined;
    const returnShot = resolveShot("overview")!;
    const returnEnd =
      returnStart === undefined ? undefined : returnStart + returnShot.duration;
    const end = returnEnd ?? cursor;
    return {
      kind: "tour",
      source: action,
      start,
      end,
      duration: end - start,
      stops,
      returnStart,
      returnEnd,
    };
  }
  if (action.do === "camera") {
    const shot = resolveShot(action.shot ?? "medium")!;
    const duration = action.movement === "cut" ? 0 : shot.duration;
    return {
      kind: "camera",
      source: action,
      shot,
      start,
      end: start + duration,
      duration,
    };
  }
  const duration =
    action.do === "label" ||
    action.do === "motion" ||
    action.do === "attention" ||
    action.do === "effect" ||
    action.do === "emphasize" ||
    // A fill is the change being taught, so it takes the beat rather than a transition's worth of it.
    action.do === "fill"
      ? pace.duration
      : pace.transition;
  return {
    kind: action.do,
    source: action,
    start,
    end: start + duration,
    duration,
  };
}

function resolveScene(
  scene: SceneSpec,
  theme: ResolvedScene["theme"],
  floor?: number,
): ResolvedScene {
  let cursor = 0;
  const beats = scene.beats.map((beat): ResolvedBeat => {
    const paceToken = beat.pace ?? "normal";
    const pace = resolvePace(paceToken)!;
    const actions = beat.actions.map((action) =>
      resolveAction(action, cursor, paceToken),
    );
    const end = Math.max(
      cursor + pace.duration,
      ...actions.map((action) => action.end),
    );
    const resolved = {
      id: beat.id,
      pace: paceToken,
      start: cursor,
      end,
      duration: end - cursor,
      actions,
    };
    cursor = end;
    return resolved;
  });
  // Narration floor: a narrated scene lasts at least as long as its spoken lines (a little longer, never
  // shorter). Any time beyond the paced beats is a trailing hold on the final composed frame while the
  // narrator finishes — authored motion keeps its speed rather than being stretched.
  const duration = floor !== undefined ? Math.max(cursor, floor) : cursor;
  return {
    id: scene.id,
    composition: scene.composition,
    theme,
    objects: resolveObjects(scene),
    beats,
    duration,
  };
}

export function resolveLesson(
  spec: LessonSpec,
  sceneFloors?: Map<string, number> | number[],
): ResolvedLesson {
  const theme = resolveTheme(spec.theme)!;
  // Ordered timing is one atomic wire value: partially applying a truncated/corrupt array pads some
  // scenes while the client switches the whole film to direct audio seconds. Ignore the complete
  // array unless it describes every authored scene with a usable duration.
  const orderedFloors = Array.isArray(sceneFloors)
    ? sceneFloors.length === spec.scenes.length &&
      sceneFloors.every((floor) => Number.isFinite(floor) && floor >= 0)
      ? sceneFloors
      : undefined
    : undefined;
  const keyedFloors = Array.isArray(sceneFloors) ? undefined : sceneFloors;
  return {
    version: spec.version,
    title: spec.title,
    scenes: spec.scenes.map((scene, index) => {
      const floor = orderedFloors?.[index] ?? keyedFloors?.get(scene.id);
      return resolveScene(
        scene,
        theme,
        floor !== undefined && Number.isFinite(floor) && floor >= 0
          ? floor
          : undefined,
      );
    }),
  };
}
