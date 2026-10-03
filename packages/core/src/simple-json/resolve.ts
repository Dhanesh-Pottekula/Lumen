import { estimateTextWidth, measureLines, measureSuffix, wrapLines } from "../gcl/measure";
import { MIN_TEXT, VIEW_HEIGHT, VIEW_INSET, VIEW_WIDTH } from "../gcl/viewport";
import { measureMath } from "../render/mathtext";
import { formatNumber } from "../render/type-motion";
import {
  DEFAULT_TEXT_SIZE,
  isTextSize,
  joinsTwo,
  resolvePace,
  resolveShot,
  resolveSize,
  resolveTextSize,
  resolveTheme,
  takesCentre,
  type ShotDefinition,
} from "./registry";
import {
  visualAssetAnchorMap,
  visualAssetBounds,
  visualOrientationAngle,
} from "./visual-catalog";
import type {
  ActionSpec,
  AttachSpec,
  CompositionToken,
  DirectionToken,
  EdgeToken,
  FilmCategorySpec,
  ObjectSpec,
  PaceToken,
  RelativeSizeSpec,
  SceneSpec,
  ShotToken,
  SizeToken,
  SvgCompositePartSpec,
  ThemeToken,
  ZoneToken,
} from "./types";
import { fitUnit, nearestSample, sampleCurve } from "./curve";
import { anchorDot, parseTarget } from "./target";
import { ANGLE_REACH, angleArc, figureOf, handleCourse, handleFrame, handlePoint, inFrame, parseHandle, type FigureSpec, type Frame } from "../geometry/figure";
import { parseSvgArtwork } from "./svg";
import { imageAspect, imageHotspots } from "./image";
import { flattenPath, layPathBetween, mapPath, parsePath, pathBounds, type PathSeg } from "../geometry/path";
import { BESIDE_REACH, boundsOf, boxPolygon, edgePoint, interiorPoint, meets, placeAnywhere, placeBeside, reachOf, rectAt, referentPoint, type Drawn, type Referent, type Relation, type Rect } from "../geometry/place";
import { directionVector, planJourneys, type Journey, type JourneyWorld } from "./journeys";
import { analyzeLifecycle } from "./lifecycle";
import { drawnAsFigure, figureDimensions, figureMinWidth, figurePlan } from "./pieces";
import { layoutLabels, type LabelRequest } from "./labels";

// Breathing room at the sides: nothing but a backdrop comes nearer the edge than 5% of the width.
const EDGE = Math.round(VIEW_WIDTH * 0.05);

const PATH_ASPECT_LIMIT = 8;
// Narrower than this, a spot is a point to write beside, not a surface to write on.
const MIN_WRAP = 140;

export type Point = [number, number];

export interface ResolvedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResolvedObject {
  id: string;
  kind: ObjectSpec["kind"] | "svg-part" | "image-hotspot" | "figure-piece";
  source: ObjectSpec;
  position: Point;
  box: ResolvedBox;
  size: number;
  angle?: number;
  endpoints?: { from: Point; to: Point };
  compositeParent?: string;
  svgPart?: SvgCompositePartSpec;
  /** An `image-hotspot`: its name, `[x, y, w, h]` inside the picture (fractions of it), and its exact shape in view units. */
  hotspot?: { id: string; rect: [number, number, number, number]; outline?: Point[] };
  /** The width writing set on a narrower thing breaks at, instead of the screen's. */
  wrap?: number;
  /** Where a picture stands in the scene's hierarchy, which sets its size: see `pictureRanks`. */
  rank?: PictureRank;
  /** Degrees clockwise the thing starts the scene turned by: its own `rotate`, else where a turn in the
   *  scene before left it. The one starting turn the compiler draws. */
  turned?: number;
  /** Which way a picture faces as it stands, degrees anticlockwise from right, when its picture says. */
  facing?: number;
  /** Stands on what it is set on: its base is its place, and a route it walks carries it by its base. */
  stands?: boolean;
  /** The picture whose parts the scene sends it across: set near one of them, it is set on it. */
  travelsOn?: string;
  /** Writing with no clear spot beside what it names: the point on it a pointer line runs to. */
  pointer?: Point;
  /** Writing left with no open space anywhere near what it names, printed across something drawn. */
  blocked?: boolean;
  /** A picture its size would have made too small to make out, drawn at the smallest size that reads. */
  raised?: boolean;
  /** Raised well past its size beside what it is measured against: drawn ringed, as a close-up. */
  closeUp?: boolean;
  /** How far its own journeys take its centre from where it rests, each way: the room it is kept in the frame with. */
  reach?: Reach;
  /** A path's own d onto the screen at rest: (x, y) → (box.x + a·x + c·y + e, box.y + b·x + d·y + f). */
  drawn?: Affine;
  /** The `d`s a path of its own morphs into over its scene: its box holds every shape it takes, so none runs over a neighbour. */
  shapes?: string[];
  /** How much of its written bow a connector keeps, and on which side: negative bows it the other way. */
  bow?: number;
  /** The frame (`in`) this is drawn in, as it lies at rest, so the renderer carries it when that frame moves. */
  pin?: { ref: string } & Frame;
}

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface Reach {
  left: number;
  right: number;
  up: number;
  down: number;
}

/** How a thing stood when its scene ended: where, how large, and how far turned (degrees clockwise). */
export interface ScenePose {
  box: ResolvedBox;
  size: number;
  turned: number;
  /** Its journeys in that scene left it away from where it was laid out. */
  travelled?: boolean;
}

/** What a scene inherits from the one before it: each thing's declaration there and the pose it ended in. */
type Carried = Map<string, { source: ObjectSpec; pose: ScenePose }>;

/** How wide each picture fixed on another was drawn beside it, as a share of the host's width, keyed by `shareKey`. */
type Shares = ReadonlyMap<string, number>;

/**
 * The subject, a subject compared with it, a second picture that helps it, or a small thing that
 * travels on or beside it.
 */
export type PictureRank = "lead" | "colead" | "second" | "traveller";

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
    | "speak"
    | "motion"
    | "emphasize"
    | "attention"
    | "effect"
    | "fill"
    | "tint"
    | "strike"
    | "tick"
    | "trend"
    | "aside";
  /** Where a move, fall or wander ends, planned against the laid-out scene. */
  arrival?: Point;
  /** Why a journey was refused: it plays as no motion. */
  refused?: string;
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
  /** Index of the narration word this beat begins on, when its `say` was found there. */
  word?: number;
  /** Index of the narration sentence this beat plays in: its `say`'s, else the sentence of the last beat before it that had one. */
  sentence?: number;
  actions: ResolvedAction[];
}

export interface ResolvedScene {
  id: string;
  composition: CompositionToken;
  theme: "TEXTBOOK" | "PARCHMENT" | "BLUEPRINT" | "CHALKBOARD";
  objects: ResolvedObject[];
  beats: ResolvedBeat[];
  duration: number;
  /** The film's categories met up to and in this scene, in first-seen order, which the compiler colours them by. */
  categories?: string[];
  /** The film category of each picture part or figure piece this scene colours. */
  categoriesOf?: Record<string, string>;
  /** Set by the compiler: the film's declared categories, and each category's colour by id and by name. */
  filmCategories?: FilmCategorySpec[];
  hues?: Map<string, string>;
}

export interface ResolvedLesson {
  version: "1";
  title: string;
  /** The groups the film codes by colour, as declared. */
  categories?: FilmCategorySpec[];
  scenes: ResolvedScene[];
}

// Slide-furniture anchors, hand-tuned against the reference view space below and then scaled once
// into the live viewport. Keeping the authored numbers in one fixed space means a viewport change
// is a single edit in gcl/viewport.ts instead of 108 re-derived coordinates.
// The zones drawn by hand; the strip and the badge are pinned to the top and the foot of the frame.
type DesignedZone = Exclude<ZoneToken, "strip" | "badge">;

const DESIGN_WIDTH = 920;
const DESIGN_HEIGHT = 430;
// Under the app's progress dots along the top edge.
const STRIP_TOP = 16;

const DESIGN_ZONES: Record<CompositionToken, Record<DesignedZone, Point>> = {
  hero: {
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
  design: Record<CompositionToken, Record<DesignedZone, Point>>,
): Record<CompositionToken, Record<ZoneToken, Point>> {
  const scaled = {} as Record<CompositionToken, Record<ZoneToken, Point>>;
  for (const composition of Object.keys(design) as CompositionToken[]) {
    const zones = {} as Record<ZoneToken, Point>;
    for (const zone of Object.keys(design[composition]) as DesignedZone[]) {
      const [x, y] = design[composition][zone];
      zones[zone] = [
        (x / DESIGN_WIDTH) * VIEW_WIDTH,
        (y / DESIGN_HEIGHT) * VIEW_HEIGHT,
      ];
    }
    // A strip along the top for the film's running timeline, and a corner at the foot for the date and place.
    zones.strip = [VIEW_WIDTH / 2, STRIP_TOP + 40];
    zones.badge = [EDGE + 90, VIEW_HEIGHT - VIEW_INSET - 26];
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
  if (typeof object.size === "string") return isTextSize(object.size) ? "medium" : object.size;
  if (object.role === "hero") return "hero";
  if (object.role === "support" || object.role === "annotation") return "small";
  if (object.kind === "line") return "small";
  return "medium";
}

/** The size writing is drawn at by its importance word, or `name` when it gives no size at all. */
function textPx(object: ObjectSpec): number | undefined {
  if (object.kind !== "text") return undefined;
  if (object.size === undefined) return resolveTextSize(DEFAULT_TEXT_SIZE).px;
  return isTextSize(object.size) ? resolveTextSize(object.size).px : undefined;
}

/** The least size writing may be drawn at, however crowded its spot: below it a phone cannot read it. */
function textFloor(object: ObjectSpec): number {
  if (object.kind !== "text") return MIN_TEXT;
  if (object.size === undefined) return resolveTextSize(DEFAULT_TEXT_SIZE).floor;
  return isTextSize(object.size) ? resolveTextSize(object.size).floor : MIN_TEXT;
}

function defaultZone(object: ObjectSpec): ZoneToken {
  const zone = placedZone(object);
  // A figure carries writing of its own: laid over the picture it printed across it, so it shares the screen instead.
  const writes = (object.kind === "chart" || drawnAsFigure(object)) && object.kind !== "question" && object.kind !== "forces";
  const pinned = object.placement?.mode === "anchor" || object.placement?.mode === "relative";
  return zone === "overlay" && writes && !pinned ? "main" : zone;
}

function placedZone(object: ObjectSpec): ZoneToken {
  // A timeline that is not the step's subject is the film's running clock: it lives in the strip along the top.
  const clock = object.kind === "timeline" && object.role !== "primary" && object.role !== "hero";
  if (object.placement?.mode === "zone") {
    const zone = object.placement.zone;
    return clock && (zone === "footer" || zone === "support") ? "strip" : zone;
  }
  if (clock) return "strip";
  // The film's open question is held along the top, under the running timeline.
  if (object.kind === "question") return "strip";
  if (object.role === "background") return "background";
  if (object.role === "support") return "support";
  if (object.role === "annotation") return "overlay";
  if (object.role === "hud" || object.space === "screen") return "hud";
  return "main";
}

/** Whether an object is laid in the strip of furniture along the top. */
export function overhead(object: ObjectSpec): boolean {
  return defaultZone(object) === "strip";
}

/** Whether an object is the screen's furniture — strip, badge, HUD — which stays put through camera moves. */
export function furniture(object: ObjectSpec): boolean {
  return ["strip", "badge", "hud"].includes(defaultZone(object));
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
 * The word is a share of the frame along the axis the thing is long in: the width for a wide thing,
 * the height for a tall one (see `shapedBox`). Bounding only the width made a 1:3 feather at `small`
 * 600 tall; bounding the longer side in width units made a standing figure at `hero` a third of a
 * portrait frame. The numbers leave room for what sits BESIDE the thing: `medium` at 260 is half the
 * width, so a second object, its arrows and its labels still have somewhere to go. An artwork's own
 * viewBox is a coordinate system and carries no size, so the number has to come from here; an
 * explicit `width` still overrides it.
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

function shapedBox(extent: number, ratio: number): [number, number] {
  const width = Math.min(extent, extent * (VIEW_HEIGHT / VIEW_WIDTH) * ratio);
  return [width, width / ratio];
}

function dimensions(object: ObjectSpec, size: number, backdropCount = 1, figure?: PathSeg[], extent?: number): [number, number] {
  switch (object.kind) {
    case "text": {
      // Writing too wide for the screen breaks into lines; drawn on one, it shrank until unreadable.
      const measured = measureLines(wrapLines(object.text, size, FIT_MAX_W).join("\n"), size);
      return [measured.w, measured.h];
    }
    case "equation": {
      const measured = measureMath(object.value, size);
      return [measured.w, measured.h];
    }
    case "measure": {
      // The painter draws prefix + grouped digits + unit, then a MIN_TEXT label under it (gcl/compile.ts).
      const suffix = measureSuffix(object.unit);
      const readout = formatNumber(object.value, {
        commas: object.commas ?? true,
        decimals: object.decimals,
        prefix: object.prefix,
        suffix,
      });
      const width = Math.max(
        estimateTextWidth(readout, size),
        object.label ? estimateTextWidth(object.label, MIN_TEXT) : 0,
      );
      const captionRoom = object.label ? MIN_TEXT * 1.3 : 0;
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
      const width = object.width ?? shapedBox(extent ?? ARTWORK_EXTENTS[defaultSize(object)], ratio)[0];
      return [width, width / ratio];
    }
    case "path": {
      if (object.from !== undefined && object.to !== undefined) return [1, 1];
      // Like a picture, the path keeps its own shape — or, drawn as a figure with pieces, the figure's.
      const bounds = pathBounds(figure ?? parsePath(object.d).segs);
      const ratio = bounds ? Math.min(PATH_ASPECT_LIMIT, Math.max(1 / PATH_ASPECT_LIMIT, (bounds.w || 1) / (bounds.h || 1))) : 1;
      return shapedBox(extent ?? ARTWORK_EXTENTS[defaultSize(object)], ratio);
    }
    case "image": {
      // A picture's pixels carry no size, only a shape, which it keeps.
      return shapedBox(extent ?? ARTWORK_EXTENTS[defaultSize(object)], imageAspect(object) ?? 1);
    }
    case "line":
    case "angle":
    case "span":
      return [1, 1];
    case "shape":
      return [72 * size, 72 * size];
    case "curve": {
      // Drawn about its centre, so the box reaches as far as the curve does on either side of it.
      const samples = sampleCurve(object, [0, 0], 52 * size);
      if (!samples) return [260 * size, 160 * size];
      const reachX = Math.max(...samples.map(([x]) => Math.abs(x)));
      const reachY = Math.max(...samples.map(([, y]) => Math.abs(y)));
      return [Math.max(24, 2 * reachX), Math.max(24, 2 * reachY)];
    }
    case "chart":
      return figureDimensions(object, size);
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
      // Tall enough for an event name above the axis and the years, with the playhead's own, under it.
      if (defaultZone(object) === "strip") return [FIT_MAX_W, 2 * MIN_TEXT + 56];
      // Lanes take the frame's width, so fitting never squeezes the band each lane's event names need.
      if ((object.lanes?.length ?? 1) > 1) return [FIT_MAX_W, 140 + (object.lanes!.length - 1) * 120];
      return [620 * Math.min(size, 1.2), 120 * Math.min(size, 1.2)];
    case "table": {
      const columns = Math.max(1, ...object.rows.map((row) => row.length));
      return [
        Math.min(720, columns * 150 * Math.min(size, 1.2)),
        object.rows.length * Math.max(MIN_TEXT * 1.8, 34 * Math.min(size, 1.2)),
      ];
    }
    case "group":
      return [
        Math.min(650, object.children.length * 150 * Math.min(size, 1.2)),
        150 * Math.min(size, 1.2),
      ];
    case "diagram":
    case "compare":
    case "scale":
    case "evidence":
    case "question":
    case "forces":
    case "working":
      return figureDimensions(object, size);
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
  return anchors[anchor] ?? corner(object, anchor);
}

/** A drawn figure's corner `v<n>`, side `s<n>` (its middle) or point along a side `s<n>@t`, where the figure is drawn. */
function corner(object: ResolvedObject, anchor: string): Point | undefined {
  const figure = figureAtRest(object);
  return figure && handlePoint(figure, figure.corners, anchor);
}

/** The corners and sides of a path drawn in its own place (not laid between two things), in view units. */
export function figureAtRest(object: ResolvedObject): FigureSpec | undefined {
  if (object.source.kind !== "path" || object.source.from !== undefined) return undefined;
  return figureOf(drawnSegs(object));
}

/** How a path's own d maps onto the screen at rest: as its frame set it, or fitted into its own box. */
export function pathAffine(object: ResolvedObject): Affine {
  if (object.drawn) return object.drawn;
  const bounds = pathBounds(everyShape(object));
  const { box } = object;
  if (!bounds) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const scale = Math.min(bounds.w > 0 ? box.w / bounds.w : Infinity, bounds.h > 0 ? box.h / bounds.h : Infinity);
  const s = Number.isFinite(scale) ? scale : 1;
  return { a: s, b: 0, c: 0, d: s, e: (box.w - bounds.w * s) / 2 - bounds.x * s, f: (box.h - bounds.h * s) / 2 - bounds.y * s };
}

/** Every shape a path takes over its scene, its own `d` first, on its own grid. */
function everyShape(object: ResolvedObject): PathSeg[] {
  return object.source.kind === "path" ? [object.source.d, ...(object.shapes ?? [])].flatMap((d) => parsePath(d).segs) : [];
}

/** The `d`s a path of its own (not laid between two things, not drawn in a frame) morphs into over its scene. */
function morphShapes(scene: SceneSpec, source: ObjectSpec): string[] {
  if (source.kind !== "path" || source.from !== undefined || source.in !== undefined) return [];
  return scene.beats.flatMap((beat) => beat.actions.flatMap((action) => (action.do === "motion" && action.motion === "morph" && action.target === source.id && action.d !== undefined ? [action.d] : [])));
}

/** A path's segments where it is drawn at rest — `d` its own, or a shape it morphs into, laid in the same frame. */
export function drawnSegs(object: ResolvedObject, d?: string): PathSeg[] {
  if (object.source.kind !== "path") return [];
  const segs = parsePath(d ?? object.source.d).segs;
  const ends = object.endpoints;
  const bow = object.bow;
  if (ends) return layPathBetween(bow === undefined ? segs : mapPath(segs, (x, y) => [x, y * bow]), ends.from, ends.to);
  const m = pathAffine(object);
  const { x, y } = object.box;
  return mapPath(segs, (px, py) => [x + m.a * px + m.c * py + m.e, y + m.b * px + m.d * py + m.f]);
}

/** Lay a path by `m`, its own d onto the screen: its box becomes what it then covers. */
function setDrawn(object: ResolvedObject, m: Affine): void {
  if (object.source.kind !== "path") return;
  const bounds = pathBounds(mapPath(everyShape(object), applied(m)));
  if (!bounds) return;
  object.box = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
  object.position = [bounds.x + bounds.w / 2, bounds.y + bounds.h / 2];
  object.drawn = { ...m, e: m.e - bounds.x, f: m.f - bounds.y };
}

/** The part of the segment a→b inside a rectangle (Liang–Barsky), or undefined when none of it is. */
function clipSegment([ax, ay]: Point, [bx, by]: Point, r: Rect): [Point, Point] | undefined {
  const [dx, dy] = [bx - ax, by - ay];
  let [low, high] = [0, 1];
  for (const [p, q] of [[-dx, ax - r.x], [dx, r.x + r.w - ax], [-dy, ay - r.y], [dy, r.y + r.h - ay]]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return undefined;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return undefined;
  }
  return [[ax + dx * low, ay + dy * low], [ax + dx * high, ay + dy * high]];
}

/** How far a curved line bows out unless it says: a share of the straight line between its ends. */
export const DEFAULT_BEND = 0.18;
// The most a connector bows out from the straight line between its ends, as a share of that line; one of
// several between the same two things bows less, so together they read as lanes, not as a loop.
const GENTLE_BOW = 0.2;
const LANE_BOW = 0.12;
// How far into a picture's box a course must run to be through it, not grazing its edge.
const PICTURE_MARGIN = 0.15;

/**
 * Each connector laid between two things bowed gently, to the side that runs through fewer other
 * pictures. Bowed as written, a flow between two pictures stacked close looped out through a third.
 * A pair joined more than once keeps its sides: flipped, the two flows ran over each other.
 */
function gentleBows(objects: ResolvedObject[], byId: Map<string, ResolvedObject>): void {
  const pictures = objects.filter((one) => !one.compositeParent && PICTURE_KINDS.has(one.source.kind as ObjectSpec["kind"]));
  const pairOf = (source: ObjectSpec) => (source.kind === "line" || source.kind === "path") && source.from !== undefined && source.to !== undefined ? [topOwner(source.from, byId), topOwner(source.to, byId)].sort().join("|") : undefined;
  const pairs = objects.flatMap((one) => (one.compositeParent ? [] : [pairOf(one.source)]));
  for (const object of objects) {
    const source = object.source;
    const ends = object.endpoints;
    const pair = pairOf(source);
    if (object.compositeParent || !ends || pair === undefined) continue;
    // A curved line's bend is the height of its bow, a share of the line: drawn as the curve through that height.
    const d = source.kind === "path" ? source.d : source.kind === "line" && source.form === "curved" ? `M0 0 Q500 ${(source.bend ?? DEFAULT_BEND) * 2000} 1000 0` : undefined;
    const chordFrame = d === undefined ? [] : flattenPath(parsePath(d).segs);
    if (d === undefined || chordFrame.length !== 1) continue;
    const apex = Math.max(...chordFrame[0].points.map(([, y]) => Math.abs(y))) / 1000;
    if (apex < 0.02) continue;
    const shared = pairs.filter((one) => one === pair).length > 1;
    const keep = Math.min(1, (shared ? LANE_BOW : GENTLE_BOW) / apex);
    const through = (bow: number) => {
      const course = flattenPath(layPathBetween(mapPath(parsePath(d).segs, (x, y) => [x, y * bow]), ends.from, ends.to))[0]?.points ?? [];
      const own = pair.split("|");
      return pictures.filter((picture) => {
        if (own.includes(picture.id)) return false;
        const { x, y, w, h } = picture.box;
        const [mx, my] = [w * PICTURE_MARGIN, h * PICTURE_MARGIN];
        return course.some(([px, py]) => px > x + mx && px < x + w - mx && py > y + my && py < y + h - my);
      }).length;
    };
    const bow = !shared && through(-keep) < through(keep) ? -keep : keep;
    if (bow !== 1) object.bow = bow;
  }
}

/**
 * A line, arrow or path that would run off the safe frame is shortened to it: a connector is cut where
 * it meets the frame's edge, a drawn path shrinks toward where it starts (an arrow keeps its tail and
 * its heading), or toward its middle, moved in, when it starts outside. Laid as written, the arrow out
 * of the cell ran 116 units off the screen.
 */
function keepRouteInFrame(object: ResolvedObject): void {
  const source = object.source;
  if (object.compositeParent || backdrop(source) || !(source.kind === "line" || source.kind === "path" || source.kind === "curve" || source.kind === "span")) return;
  const inside = ([x, y]: Point) => x >= FRAME.x - 0.5 && x <= FRAME.x + FRAME.w + 0.5 && y >= FRAME.y - 0.5 && y <= FRAME.y + FRAME.h + 0.5;
  if (object.endpoints) {
    const { from, to } = object.endpoints;
    if (inside(from) && inside(to)) return;
    const cut = clipSegment(from, to, FRAME);
    if (!cut) return;
    object.endpoints = { from: cut[0], to: cut[1] };
    object.position = [(cut[0][0] + cut[1][0]) / 2, (cut[0][1] + cut[1][1]) / 2];
    object.box = { x: Math.min(cut[0][0], cut[1][0]), y: Math.min(cut[0][1], cut[1][1]), w: Math.abs(cut[1][0] - cut[0][0]), h: Math.abs(cut[1][1] - cut[0][1]) };
    return;
  }
  if (source.kind !== "path") return;
  const points = [undefined, ...(object.shapes ?? [])].flatMap((d) => flattenPath(drawnSegs(object, d)).flatMap((piece) => piece.points.map(([x, y]): Point => [x, y])));
  if (points.length === 0 || points.every(inside)) return;
  const bounds = boundsOf([{ stroke: points }])!;
  const middle: Point = [bounds.x + bounds.w / 2, bounds.y + bounds.h / 2];
  const pivot = inside(points[0]) ? points[0] : middle;
  const fit = Math.min(1, FRAME.w / Math.max(1e-6, bounds.w), FRAME.h / Math.max(1e-6, bounds.h));
  let scale = pivot === middle ? fit : 1;
  if (pivot !== middle)
    for (const [x, y] of points) {
      for (const [p, a, low, high] of [[x, pivot[0], FRAME.x, FRAME.x + FRAME.w], [y, pivot[1], FRAME.y, FRAME.y + FRAME.h]]) {
        if (p > high) scale = Math.min(scale, (high - a) / (p - a));
        if (p < low) scale = Math.min(scale, (a - low) / (a - p));
      }
    }
  // Shrunk about its middle, it is then moved in whole.
  const shrunk = { x: pivot[0] + (bounds.x - pivot[0]) * scale, y: pivot[1] + (bounds.y - pivot[1]) * scale, w: bounds.w * scale, h: bounds.h * scale };
  const shift: Point = [
    Math.max(FRAME.x, Math.min(shrunk.x, FRAME.x + FRAME.w - shrunk.w)) - shrunk.x,
    Math.max(FRAME.y, Math.min(shrunk.y, FRAME.y + FRAME.h - shrunk.h)) - shrunk.y,
  ];
  const toward: Affine = { a: scale, b: 0, c: 0, d: scale, e: pivot[0] * (1 - scale) + shift[0], f: pivot[1] * (1 - scale) + shift[1] };
  setDrawn(object, compose(toward, absoluteAffine(object)));
}

/** A path's laid map with its offset taken from the screen's origin rather than its box. */
function absoluteAffine(object: ResolvedObject): Affine {
  const m = pathAffine(object);
  return { ...m, e: m.e + object.box.x, f: m.f + object.box.y };
}

/** The uniform map that fits a whole figure, drawn on one grid, centred into `box`. */
function fittedGrid(segs: PathSeg[], box: ResolvedBox): Affine | undefined {
  const whole = pathBounds(segs);
  if (!whole) return undefined;
  const fit = Math.min(whole.w > 0 ? box.w / whole.w : Infinity, whole.h > 0 ? box.h / whole.h : Infinity);
  const scale = Number.isFinite(fit) ? fit : 1;
  return { a: scale, b: 0, c: 0, d: scale, e: box.x + (box.w - whole.w * scale) / 2 - whole.x * scale, f: box.y + (box.h - whole.h * scale) / 2 - whole.y * scale };
}

/**
 * Where writing set in a frame stands: centred on its `at`. In a side frame a y other than 0 keeps the
 * whole of it that far off the side, on that side.
 */
function writingSpot(object: ResolvedObject, frame: Frame, side: boolean): Point {
  const at = (object.source as { at?: [number, number] }).at ?? [0, 0];
  const [x, y] = inFrame(frame, at);
  const length = Math.hypot(frame.y[0], frame.y[1]);
  if (!side || at[1] === 0 || length < 1e-9) return [x, y];
  const [nx, ny] = [(Math.sign(at[1]) * frame.y[0]) / length, (Math.sign(at[1]) * frame.y[1]) / length];
  const reach = Math.abs(nx) * (object.box.w / 2) + Math.abs(ny) * (object.box.h / 2);
  return [x + nx * reach, y + ny * reach];
}

/** The view units one unit of a path's grid spans. */
export function gridUnit(object: ResolvedObject): number {
  const m = pathAffine(object);
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
}

/** The grid a path is drawn on, as a frame in view units. */
function gridFrame(object: ResolvedObject): Frame {
  const m = pathAffine(object);
  return { o: [object.box.x + m.e, object.box.y + m.f], x: [m.a, m.b], y: [m.c, m.d] };
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

/** The box of a picture's named hotspot, laid on wherever the picture is now. */
function hotspotBox(parent: ResolvedObject, name: string): ResolvedBox | undefined {
  if (parent.compositeParent || parent.source.kind !== "image") return undefined;
  const rect = parent.source.hotspots?.[name];
  if (!rect) return undefined;
  const [hx, hy, hw, hh] = rect;
  return {
    x: parent.box.x + hx * parent.box.w,
    y: parent.box.y + hy * parent.box.h,
    w: Math.max(1, hw * parent.box.w),
    h: Math.max(1, hh * parent.box.h),
  };
}

/** A figure piece's box, from its place about its figure's centre to where the figure is now. */
function pieceBox(parent: ResolvedObject, local: { x: number; y: number; w: number; h: number }): ResolvedBox {
  const [cx, cy] = [parent.box.x + parent.box.w / 2, parent.box.y + parent.box.h / 2];
  return { x: cx + local.x, y: cy + local.y, w: Math.max(1, local.w), h: Math.max(1, local.h) };
}

/** A `pic.part` reference read off its picture's current box, for a placement made before hotspots are laid out. */
function liveHotspot(target: string, objects: Map<string, ResolvedObject>): ResolvedBox | undefined {
  const dot = target.indexOf(".");
  const owner = dot > 0 ? objects.get(target.slice(0, dot)) : undefined;
  if (!owner) return undefined;
  const piece = drawnAsFigure(owner.source) || owner.source.kind === "chart" ? figurePlan(owner.source, owner.box.w, owner.box.h).pieces.find((one) => one.name === target.slice(dot + 1)) : undefined;
  return piece ? pieceBox(owner, piece.box) : hotspotBox(owner, target.slice(dot + 1));
}

function resolveReference(
  target: string,
  objects: Map<string, ResolvedObject>,
): Point {
  const exact = objects.get(target);
  if (exact) return [...exact.position];
  const spot = liveHotspot(target, objects);
  if (spot) return [spot.x + spot.w / 2, spot.y + spot.h / 2];
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
  const split = anchorDot(target);
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

function resolveReferenceBox(
  target: string,
  objects: Map<string, ResolvedObject>,
): ResolvedBox | undefined {
  const exact = objects.get(target);
  if (exact) return exact.box;
  const spot = liveHotspot(target, objects);
  if (spot) return spot;
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
  const split = anchorDot(target);
  const owner = split > 0 ? objects.get(target.slice(0, split)) : undefined;
  // A corner or a side is a place on a stroke, with no box of its own to stop short at.
  if (owner?.source.kind === "path" && parseHandle(target.slice(split + 1))) return undefined;
  return owner?.box;
}

// Safe frame the compiler keeps every object inside (the view space, inset on every edge). Used to
// auto-fit and clamp object boxes so a mis-sized or mis-placed object degrades gracefully instead
// of overflowing.
// A named asset's catalog bounds are its true extent relative to the other assets — an apple is 32
// units, a planet 64 — which is a whole register below what the same size word gives an artwork.
// Lifting the family together keeps them proportionate to each other and to everything else drawn.
const ASSET_SCALE = 4;

/** The widest anything laid out may be, and the width writing breaks at. */
export const FIT_MAX_W = VIEW_WIDTH - EDGE * 2;
const FIT_MAX_H = VIEW_HEIGHT - VIEW_INSET * 2;
const FRAME_MIN = VIEW_INSET;
const FRAME_MIN_X = EDGE;
const FRAME_MAX_X = VIEW_WIDTH - EDGE;
const FRAME_MAX_Y = VIEW_HEIGHT - VIEW_INSET;
const BESIDE_GAP = 24;
// A main picture shrinks for the writing beneath it only this far; below it, the writing gives way instead.
const MIN_YIELD = 0.55;
// What a main picture shrinks for when it is set beneath it: writing, and the worked lines, tables and
// cards read under a picture. A working in `support` was printed across a tall rocket.
const YIELDED_TO: ReadonlySet<ObjectSpec["kind"]> = new Set(["text", "equation", "measure", "working", "table", "compare", "diagram", "chart", "scale", "evidence"]);
// Things drawn as pictures, which writing must never print across.
export const PICTURE_KINDS: ReadonlySet<ObjectSpec["kind"]> = new Set(["image", "visual", "svg-artwork", "svg-composite", "chart", "map", "table", "timeline", "diagram", "compare", "scale", "evidence", "forces", "working"]);

/** An artwork that is the place a scene happens in: it covers the view and nothing lays it out. */
/**
 * Where a traveller belongs before it sets off: the nearest point of a curve anchored on a point, or
 * the end of a route laid between two things that it is walked from. A thing that is itself one end of the route stays
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
  const named =
    source.kind === "line" || source.kind === "span" || source.kind === "curve" || source.kind === "path"
      ? [source.from, source.to]
      : [];
  if (!ends || named.some((end) => end !== undefined && parseTarget(end, new Set(byId.keys())).objectId === rider.id)) return undefined;
  return walkedBackward(source, [ends.from, ends.to], rider.position) ? ends.to : ends.from;
}

/** A chart or drawn figure that competes with the pictures for the lead, rather than furniture in a band. */
function rankedFigure(source: ObjectSpec): boolean {
  return (source.kind === "chart" || drawnAsFigure(source)) && source.kind !== "question" && !["strip", "badge", "hud"].includes(defaultZone(source));
}

function backdrop(source: ObjectSpec): boolean {
  return (source.kind === "svg-artwork" || source.kind === "map") && source.role === "background";
}

// How much of the frame's width a picture takes comes from its place in the scene, not from the size
// word the planner wrote: the subject with something beside it 60–85% (a declared subject with no size
// word the top of that), a picture helping it 30–40% of the subject, a thing that travels on or beside
// it 12–18%. The size word only chooses where in its band a picture falls.
const LEAD_SHARE: [number, number] = [0.6, 0.85];
// Subjects compared side by side each fill most of their half.
const COLEAD_SHARE: [number, number] = [0.8, 1];
const SECOND_SHARE: [number, number] = [0.3, 0.4];
// A chart or figure that helps the subject still carries writing to be read, so it gives up less.
const FIGURE_SECOND_SHARE: [number, number] = [0.55, 0.7];
const TRAVELLER_SHARE: [number, number] = [0.12, 0.18];
// A helper is never drawn past this share of the subject it helps, by its least size or by growing.
const HELPER_MOST_SHARE = 0.6;
// A traveller the step acts on (moved, named, pointed at) is what the eye follows: at the share above it was
// always drawn at the readable floor, the molecules the step was about as specks beside a huge apple. Where
// the scene has room it is laid up to this many times its share.
const ACTOR_MOST = 2.2;
// A subject with nothing beside it takes the frame's width; a tall one stops a quarter short of the
// frame's height, which leaves a band above or below for the names and notes set on it.
const SOLO_MAX_H = Math.round(FIT_MAX_H * 0.75);
// Grown into the room its names left, a subject still keeps a margin of the frame's height clear.
const GROWN_MAX_H = Math.round(FIT_MAX_H * 0.9);
// Two subjects compared one above the other each take half that height, less the gap between them.
const STACKED_MAX_H = (SOLO_MAX_H - BESIDE_GAP) / 2;
// A compared pair is set one above the other when that draws each at least this much wider than side by side.
const STACKED_GAIN = 1.3;
// Laid out in `main`, `support` or `footer` with the subject, these take room from it on the screen.
const SHARES_SCREEN: ReadonlySet<ObjectSpec["kind"]> = new Set([...YIELDED_TO, "image", "visual", "svg-artwork", "svg-composite", "map", "timeline", "path"]);

/** Whether a picture is set left or right of another. */
function besideOf(a: ObjectSpec, b: ObjectSpec): boolean {
  return a.placement?.mode === "relative" && (a.placement.relation === "left-of" || a.placement.relation === "right-of") && a.placement.target.split(".")[0] === b.id;
}

/** Whether two pictures stand side by side: in the two halves of the body, or one set beside the other. */
function sideBySide(a: ObjectSpec, b: ObjectSpec): boolean {
  const sides = ["main-left", "main-right"];
  return (sides.includes(defaultZone(a)) && sides.includes(defaultZone(b)) && defaultZone(a) !== defaultZone(b)) || besideOf(a, b) || besideOf(b, a);
}

/** Whether two subjects are compared: in a comparison, side by side, or stacked as a pair. */
function compared(scene: SceneSpec, a: ObjectSpec, b: ObjectSpec, overUnder: ReadonlySet<string> = new Set()): boolean {
  return scene.composition === "comparison" || sideBySide(a, b) || (overUnder.has(a.id) && overUnder.has(b.id));
}

/**
 * Whether a picture of the same shape and parts is set right against a subject, as that thing in another
 * state shown with it to compare: sized as a helper, the pulled chest under the resting one was a speck.
 */
function otherState(a: ObjectSpec, b: ObjectSpec): boolean {
  const placement = a.placement;
  if (a.kind !== "image" || b.kind !== "image" || placement?.mode !== "relative" || placement.relation === "near" || placement.target !== b.id) return false;
  const [mine, theirs] = [imageAspect(a), imageAspect(b)];
  const parts = new Set(imageHotspots(b).map((part) => part.id));
  const shared = imageHotspots(a).filter((part) => parts.has(part.id)).length;
  return mine !== undefined && theirs !== undefined && mine / theirs >= SAME_SLOT[0] && mine / theirs <= SAME_SLOT[1] && shared >= 2 && shared * 2 >= parts.size;
}

/**
 * Whether two figures that face a way are set side by side, as two actors in one exchange: sized as a
 * helper, the relative beside the caller came out a third of his height.
 */
function actorsBeside(a: ObjectSpec, b: ObjectSpec): boolean {
  return a.kind === "image" && b.kind === "image" && a.facing !== undefined && b.facing !== undefined && (besideOf(a, b) || besideOf(b, a));
}

/**
 * Each picture's rank and the extent it is drawn at. One subject leads while it is on screen; a
 * second declared subject beside it leads with it only when the two are compared, and otherwise helps it.
 */
function pictureRanks(
  scene: SceneSpec,
  together: (a: string, b: string) => boolean,
  framed: (source: ObjectSpec) => boolean,
  { subjects: grow, actors, helpers, floored }: Enlarged = UNCHANGED,
  overUnder: ReadonlySet<string> = new Set(),
): Map<string, { rank: PictureRank; extent: number }> {
  const ranked = (source: ObjectSpec) =>
    source.kind === "image" ||
    (source.kind === "svg-artwork" && !backdrop(source) && source.width === undefined) ||
    (source.kind === "path" && !joinsTwo(source) && !framed(source) && !walkedRoute(scene, source)) ||
    rankedFigure(source);
  const pictures = scene.objects.filter(ranked);
  const own = (source: ObjectSpec) => ARTWORK_EXTENTS[defaultSize(source)];
  const declared = (source: ObjectSpec) => source.role === "primary" || source.role === "hero";
  const moving = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "motion" ? [action.target] : [])));
  // A picture stacked above, below or beside another is its companion even when it moves: sized as a
  // traveller, the squid swimming under a balloon came out a speck.
  // One attached to another is part of it, moved or not: a rider shifting on its bicycle is no traveller.
  const stacked = (source: ObjectSpec) => source.attach !== undefined || (source.placement?.mode === "relative" && source.placement.relation !== "near");
  const travels = (source: ObjectSpec) =>
    !rankedFigure(source) &&
    (source.placement?.mode === "anchor" ||
      (source.placement?.mode === "relative" && source.placement.relation === "near") ||
      source.size === "tiny" ||
      source.size === "mini" ||
      (moving.has(source.id) && !stacked(source)));
  // A picture set on or inside another is drawn within it, so it never leads the picture that carries it:
  // ranked first, the sun set on the sky came out three times the sky, and the rays between them a speck.
  const hostOf = (source: ObjectSpec) =>
    source.placement?.mode === "relative" && (source.placement.relation === "on" || source.placement.relation === "inside") ? source.placement.target.split(".")[0] : undefined;
  const carrying = (source: ObjectSpec) => [source, ...pictures.filter((one) => one !== source && hostOf(one) === source.id && together(one.id, source.id))];
  const heroOf = (source: ObjectSpec) => carrying(source).some((one) => one.role === "hero");
  const leadsAs = (source: ObjectSpec) => carrying(source).some(declared);
  // One lead at a time: a hero before a primary, then the larger — a hero-sized picture over a primary chart.
  const order = [...pictures].sort(
    (a, b) =>
      Number(heroOf(b)) - Number(heroOf(a)) ||
      Number(leadsAs(b)) - Number(leadsAs(a)) ||
      Number(hostOf(a) === b.id) - Number(hostOf(b) === a.id) ||
      own(b) - own(a),
  );
  const rank = new Map<string, PictureRank>();
  const leads: ObjectSpec[] = [];
  // A stroke laid beside a picture (a sea floor, a ground line, an arrow) is no subject the picture helps.
  const rivalsOf = (source: ObjectSpec) => leads.filter((lead) => together(lead.id, source.id) && !(strokeOnly(lead) && !strokeOnly(source)));
  for (const source of order) {
    const rivals = rivalsOf(source);
    if (rivals.length === 0 && (declared(source) || !travels(source))) {
      leads.push(source);
      rank.set(source.id, "lead");
    } else if ((declared(source) && rivals.every((rival) => declared(rival) && compared(scene, rival, source, overUnder))) || rivals.some((rival) => otherState(source, rival) || actorsBeside(source, rival))) {
      leads.push(source);
      rank.set(source.id, "colead");
    } else rank.set(source.id, travels(source) ? "traveller" : "second");
  }
  // A picture that only journeys, with no subject on screen to travel beside, is the subject itself; its
  // journeys are then kept in the frame by shrinking it. A spin or an orbit is kept in by nothing, so it stays small.
  const journeying = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "motion" && ["move", "fall", "wander", "along"].includes(action.motion) ? [action.target] : [])));
  // A picture stepped aside still travels on screen, beside the subjects laid after it.
  const keptSmall = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => ((action.do === "motion" && (action.motion === "spin" || action.motion === "orbit")) || action.do === "aside" ? [action.target] : [])));
  for (const source of order) {
    const moverOnly = rank.get(source.id) === "traveller" && journeying.has(source.id) && !keptSmall.has(source.id) && source.size !== "tiny" && source.size !== "mini" && (source.placement === undefined || source.placement.mode === "zone");
    if (!moverOnly || rivalsOf(source).length > 0) continue;
    leads.push(source);
    rank.set(source.id, "lead");
  }

  const reach = (source: ObjectSpec) =>
    declared(source) && typeof source.size !== "string" ? 1 : Math.min(1, Math.max(0, (own(source) - ARTWORK_EXTENTS.small) / (ARTWORK_EXTENTS.hero - ARTWORK_EXTENTS.small)));
  const within = ([low, high]: [number, number], of: number, source: ObjectSpec) => of * (low + (high - low) * reach(source));
  const extents = new Map<string, number>();
  // A ranked picture that is no traveller, or anything else laid in a zone of the screen's body.
  const laidBeside = (source: ObjectSpec, lead: ObjectSpec) =>
    source !== lead &&
    together(source.id, lead.id) &&
    SHARES_SCREEN.has(source.kind) &&
    !laidBetween(source) &&
    (rank.has(source.id)
      ? rank.get(source.id) !== "traveller"
      : (source.placement === undefined || source.placement.mode === "zone") && ["main", "main-left", "main-right", "support", "footer"].includes(defaultZone(source)));
  // What leaves a subject its whole width: writing drawn in it, things set on it, writing and cards laid
  // under it (which it gives height to) and companions stacked above or below it (fitted as a pair).
  // Set on a thing that is itself on the subject rides it too: an arrow under a mark drawn in the bicycle, a
  // sheet fixed on the page lying on the press. Counted as laid beside them, each halved the subject.
  const specs = new Map(scene.objects.map((one) => [one.id, one]));
  const rides = (source: ObjectSpec, lead: ObjectSpec, seen = new Set<string>()): boolean => {
    if (framed(source) && (!("in" in source) || typeof source.in !== "string" || source.in.split(".")[0] === lead.id)) return true;
    const placement = source.placement;
    const set = bearing(source) ?? ("in" in source && typeof source.in === "string" ? source.in : undefined);
    const bearer = set?.split(".")[0];
    const fixed = source.attach !== undefined || placement?.mode === "anchor" || "in" in source || (placement?.mode === "relative" && placement.relation !== "left-of" && placement.relation !== "right-of");
    // Only one set beside the subject itself takes width from it; beside a thing on it, it is set on the subject's own ground.
    if (bearer === lead.id && fixed) return true;
    const next = bearer === undefined || bearer === lead.id || seen.has(bearer) ? undefined : specs.get(bearer);
    if (next && rides(next, lead, new Set([...seen, source.id]))) return true;
    return !rank.has(source.id) && YIELDED_TO.has(source.kind) && ["support", "footer"].includes(defaultZone(source));
  };
  // Each subject's extent as its rank gives it, and as large as `grow` asks within the frame.
  const larger = new Map<string, number>();
  const heightShare = (ratio: number, height: number) => {
    const width = Math.min(FIT_MAX_W, height * ratio);
    return ratio >= VIEW_WIDTH / VIEW_HEIGHT ? width : width / ((VIEW_HEIGHT / VIEW_WIDTH) * ratio);
  };
  for (const lead of leads) {
    // Subjects compared side by side split the width between them; stacked, they are fitted as a pair later.
    const row = leads.filter((other) => other === lead || (together(other.id, lead.id) && sideBySide(other, lead)));
    const slot = (FIT_MAX_W - BESIDE_GAP * (row.length - 1)) / row.length;
    const ratio = lead.kind === "image" ? imageAspect(lead) : undefined;
    const fills = row.length === 1 && ratio !== undefined && ratio > 0 && !scene.objects.some((other) => laidBeside(other, lead) && !rides(other, lead));
    if (ratio !== undefined && (overUnder.has(lead.id) || fills)) {
      // The extent of a tall thing is read as a share of the height (`shapedBox`); the strip above may still trim it.
      const [height, most] = overUnder.has(lead.id) ? [STACKED_MAX_H, (GROWN_MAX_H - BESIDE_GAP) / 2] : [SOLO_MAX_H, GROWN_MAX_H];
      extents.set(lead.id, heightShare(ratio, height));
      larger.set(lead.id, heightShare(ratio, Math.min(most, height * grow)));
      continue;
    }
    const [extent, most] = row.length > 1 ? [within(COLEAD_SHARE, slot, lead), slot] : [within(LEAD_SHARE, FIT_MAX_W, lead), FIT_MAX_W];
    extents.set(lead.id, extent);
    larger.set(lead.id, Math.min(most, extent * grow));
  }
  const acting = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => ("target" in action && typeof action.target === "string" ? [action.target.split(".")[0]] : "targets" in action && action.do !== "show" && action.do !== "hide" && Array.isArray(action.targets) ? action.targets : [])));
  const shifted = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "motion" ? [action.target, ...("with" in action && Array.isArray(action.with) ? action.with : [])] : [])));
  const setAgainst = new Set(pictures.filter((one) => !shifted.has(one.id)).flatMap((one) => (one.placement?.mode === "relative" ? [one.placement.target.split(".")[0]] : one.attach ? [one.attach.to.split(".")[0]] : [])));
  const result = new Map<string, { rank: PictureRank; extent: number }>();
  const plain = new Map<string, number>();
  for (const source of pictures) {
    const role = rank.get(source.id)!;
    if (role === "lead" || role === "colead") {
      result.set(source.id, { rank: role, extent: larger.get(source.id)! });
      plain.set(source.id, larger.get(source.id)!);
      continue;
    }
    // A helper beside the subject keeps its rank's size, so the subject has the room it grows into; a
    // traveller rides on or beside it and grows with it.
    const actor = role === "traveller" && acting.has(source.id) && source.size !== "tiny" && source.size !== "mini";
    const sizes = role === "traveller" && !actor ? larger : extents;
    const helped = leads.filter((lead) => together(lead.id, source.id)).map((lead) => sizes.get(lead.id)!);
    const subject = helped.length > 0 ? Math.max(...helped) : Math.max(0, ...sizes.values());
    if (subject === 0) continue;
    const share = rankedFigure(source) ? FIGURE_SECOND_SHARE : role === "traveller" ? TRAVELLER_SHARE : SECOND_SHARE;
    // A helper is still a picture to look at (the small car given for scale was a smudge), so it may come up to a
    // companion's size and grow into room a wide subject leaves. It keeps its rank's size when that size is a
    // relation: moved or carried (the stone dropped in a tub covered it), set on or by a lesser picture (a bubble
    // outgrew its magma pocket), or with a picture set against it (a stone block dwarfed the worker beside it).
    const placement = source.placement;
    const beside =
      placement === undefined ||
      placement.mode === "zone" ||
      (placement.mode === "relative" && ["above", "below", "left-of", "right-of"].includes(placement.relation) && ["lead", "colead", undefined].includes(rank.get(placement.target.split(".")[0])));
    const helper = role === "second" && (source.kind === "image" || source.kind === "svg-artwork") && typeof source.size !== "object" && source.attach === undefined && beside && !shifted.has(source.id) && !setAgainst.has(source.id);
    const least = helper && floored ? Math.min(ARTWORK_EXTENTS.small, subject * HELPER_MOST_SHARE) : 0;
    const extent = Math.max(least, within(share, subject, source));
    const enlarged = actor ? extent * actors : helper ? Math.min(extent * helpers, Math.max(extent, subject * HELPER_MOST_SHARE)) : extent;
    result.set(source.id, { rank: role, extent: enlarged });
    plain.set(source.id, within(share, subject, source));
  }
  return keptInScale(scalePartners(scene, together), pictures, result, plain);
}

// A picture carried by another (set on or in it, fixed or anchored to it) is never drawn past this share of it.
const CARRIED_MOST = 0.6;

/** One picture another is shown against for scale; `carried` when that one carries it (it is set on or in it, fixed or anchored to it) rather than stands by or moves with it. */
interface ScalePartner {
  id: string;
  carried: boolean;
}

/**
 * The pictures each thing is measured against while on screen with it: the one it is set on, in, near,
 * beside or fixed to, the one a motion moves it with, and those laid on or near the same one as it.
 */
function scalePartners(scene: SceneSpec, together: (a: string, b: string) => boolean): (id: string) => (ScalePartner & { sibling: boolean })[] {
  const specs = new Map(scene.objects.map((one) => [one.id, one]));
  const picture = (id: string | undefined) => id !== undefined && DRAWINGS.has(specs.get(id)?.kind ?? "text") && !backdrop(specs.get(id)!);
  const carriers = new Map<string, ScalePartner[]>();
  const add = (id: string, partner: ScalePartner) => {
    if (id === partner.id || !picture(id) || !picture(partner.id) || !together(id, partner.id)) return;
    carriers.set(id, [...(carriers.get(id) ?? []).filter((one) => one.id !== partner.id), partner]);
  };
  // What each thing is laid on or near: things laid on or near the same one are measured against each other.
  const grounds = new Map<string, string>();
  for (const source of scene.objects) {
    const set = bearing(source)?.split(".")[0];
    const placement = source.placement;
    const outside = placement?.mode === "relative" && ["above", "below", "left-of", "right-of"].includes(placement.relation);
    const near = placement?.mode === "relative" && placement.relation === "near";
    if (set === undefined) continue;
    add(source.id, { id: set, carried: source.attach !== undefined || !(outside || near) });
    if (source.attach !== undefined || !outside) grounds.set(source.id, set);
  }
  for (const action of scene.beats.flatMap((beat) => beat.actions))
    if (action.do === "motion" && "with" in action && Array.isArray(action.with)) for (const id of action.with) add(id, { id: action.target, carried: false });
  return (id) => {
    const own = carriers.get(id) ?? [];
    const ground = grounds.get(id);
    const siblings = [...grounds].flatMap(([other, on]) =>
      ground !== undefined && other !== id && on === ground && picture(other) && together(id, other) ? [{ id: other, carried: false, sibling: true }] : [],
    );
    return [...own.map((one) => ({ ...one, sibling: false })), ...siblings];
  };
}

/** A picture's longer side, as drawn at `extent` by `shapedBox`. */
function extentLength(source: ObjectSpec, extent: number): number {
  const ratio = source.kind === "image" ? imageAspect(source) : undefined;
  return ratio !== undefined && ratio > 0 ? Math.max(...shapedBox(extent, ratio)) : extent;
}

/**
 * The ranks' sizes with no picture drawn past one it is measured against: grown as the step's actor, a
 * flea came out larger than the rat it rode and twice the trading ship beside it. A carried picture stays
 * within its share of what carries it; one beside another is only kept from being enlarged past it.
 */
function keptInScale(
  partnersOf: (id: string) => (ScalePartner & { sibling: boolean })[],
  pictures: ObjectSpec[],
  sized: Map<string, { rank: PictureRank; extent: number }>,
  plain: Map<string, number>,
): Map<string, { rank: PictureRank; extent: number }> {
  const specs = new Map(pictures.map((one) => [one.id, one]));
  const length = (id: string, extents: Map<string, number>) => extentLength(specs.get(id)!, extents.get(id)!);
  const plainLength = (id: string) => length(id, plain);
  // A picture sized against another takes that size later, whatever its rank gave it.
  const ranked = (id: string) => plain.has(id) && typeof specs.get(id)?.size !== "object";
  const order = [...sized.keys()].filter(ranked).sort((a, b) => plainLength(b) - plainLength(a));
  const current = new Map([...sized].filter(([id]) => ranked(id)).map(([id, one]) => [id, one.extent]));
  for (const id of order) {
    const role = sized.get(id)!.rank;
    if (role === "lead" || role === "colead") continue;
    const partners = partnersOf(id).filter((one) => current.has(one.id) && (!one.sibling || plainLength(one.id) >= plainLength(id)));
    // What carries it bounds it whatever its rank gave it; what stands by it only bounds how far it is enlarged.
    const carrying = Math.min(...partners.filter((one) => one.carried).map((one) => length(one.id, current) * CARRIED_MOST));
    const beside = Math.min(...partners.filter((one) => !one.carried).map((one) => length(one.id, current)));
    const now = length(id, current);
    const most = Math.min(carrying, Math.max(beside, plainLength(id)));
    if (now <= most) continue;
    current.set(id, current.get(id)! * (most / now));
    sized.set(id, { rank: role, extent: current.get(id)! });
  }
  return sized;
}

/** Whether a drawn path is one open stroke: a line, a ground, an arrow, with no area of its own. */
function strokeOnly(source: ObjectSpec): boolean {
  return source.kind === "path" && !/[zZ]/.test(source.d) && (source.d.match(/[Mm]/g)?.length ?? 0) < 2;
}

/**
 * The scene with each subject picture laid in `main` that only its `support` role sent below it, when no
 * other picture holds `main` beside it: a lone subject sat in the bottom band under an empty middle.
 */
function subjectsInMain(scene: SceneSpec, ranks: Map<string, { rank: PictureRank }>, together: (a: string, b: string) => boolean): SceneSpec {
  const inMain = (source: ObjectSpec) => ["main", "main-left", "main-right"].includes(defaultZone(source));
  const raised = new Set(
    scene.objects
      .filter((source) => {
        const rank = ranks.get(source.id)?.rank;
        if ((rank !== "lead" && rank !== "colead") || !DRAWINGS.has(source.kind) || source.placement !== undefined || source.attach || defaultZone(source) !== "support") return false;
        return !scene.objects.some((other) => other !== source && inMain(other) && ranks.has(other.id) && !strokeOnly(other) && together(other.id, source.id));
      })
      .map((source) => source.id),
  );
  if (raised.size === 0) return scene;
  return { ...scene, objects: scene.objects.map((source) => (raised.has(source.id) ? ({ ...source, placement: { mode: "zone", zone: "main" } } as ObjectSpec) : source)) };
}

/**
 * The scene with two subjects shown together as equals (a lead and its colead, each laid in a zone of
 * the body) set on the two sides: one in `main`, the other in `main-right`, the letter was drawn over the telephone.
 */
function pairsApart(scene: SceneSpec, ranks: Map<string, { rank: PictureRank }>, together: (a: string, b: string) => boolean, stacked: ReadonlySet<string>): SceneSpec {
  const sides = new Map<string, ZoneToken>();
  // A pair set one above the other shares the middle, the first written on top.
  for (const id of stacked) sides.set(id, "main");
  const body = (source: ObjectSpec) => (source.placement === undefined || source.placement.mode === "zone") && !source.attach && ["main", "main-left", "main-right"].includes(defaultZone(source));
  // A subject that walks a route keeps the middle: the route's room is kept round it, and from one side it ran out.
  const journeying = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "motion" && action.motion === "along" ? [action.target] : [])));
  const subjects = scene.objects.filter((source) => DRAWINGS.has(source.kind) && body(source) && !journeying.has(source.id) && ["lead", "colead"].includes(ranks.get(source.id)?.rank ?? ""));
  const opposite = (zone: ZoneToken): ZoneToken => (zone === "main-right" ? "main-left" : "main-right");
  for (const colead of subjects.filter((source) => ranks.get(source.id)?.rank === "colead" && !stacked.has(source.id))) {
    const partners = subjects.filter((other) => other !== colead && together(other.id, colead.id));
    // Three subjects on screen at once are no pair; partners in turn (one hidden as the next comes) each face it.
    if (partners.some((one) => partners.some((other) => other !== one && together(one.id, other.id)))) continue;
    for (const partner of partners) {
      const [mine, theirs] = [sides.get(colead.id), sides.get(partner.id)];
      if (mine && theirs) continue;
      if (theirs || mine) {
        sides.set(theirs ? colead.id : partner.id, opposite((theirs ?? mine)!));
        continue;
      }
      const [own, other] = [defaultZone(colead), defaultZone(partner)];
      if (own !== other && own !== "main" && other !== "main") continue;
      const right = own === "main-right" || (own === "main" && other === "main-left");
      sides.set(colead.id, right ? "main-right" : "main-left");
      sides.set(partner.id, right ? "main-left" : "main-right");
    }
  }
  if (sides.size === 0) return scene;
  return { ...scene, objects: scene.objects.map((source) => (sides.has(source.id) ? ({ ...source, placement: { mode: "zone", zone: sides.get(source.id)! } } as ObjectSpec) : source)) };
}

/**
 * The compared pairs drawn larger one above the other than side by side: two pictures about as wide as
 * they are tall, split across a portrait frame's width, each got a quarter of its height.
 */
function stackedPairs(scene: SceneSpec, ranks: Map<string, { rank: PictureRank }>, together: (a: string, b: string) => boolean): Set<string> {
  const body = (source: ObjectSpec) => (source.placement === undefined || source.placement.mode === "zone") && !source.attach && ["main", "main-left", "main-right"].includes(defaultZone(source));
  const walking = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "motion" && action.motion === "along" ? [action.target] : [])));
  const subjects = scene.objects.filter((source): source is Extract<ObjectSpec, { kind: "image" }> => source.kind === "image").filter((source) => imageAspect(source) !== undefined && body(source) && !walking.has(source.id) && ["lead", "colead"].includes(ranks.get(source.id)?.rank ?? ""));
  const slot = (FIT_MAX_W - BESIDE_GAP) / 2;
  const gain = (source: Extract<ObjectSpec, { kind: "image" }>) => {
    const ratio = imageAspect(source)!;
    return Math.min(FIT_MAX_W, STACKED_MAX_H * ratio) / shapedBox(slot, ratio)[0];
  };
  const pairs = new Set<string>();
  for (const colead of subjects.filter((source) => ranks.get(source.id)?.rank === "colead")) {
    const partners = subjects.filter((other) => other !== colead && together(other.id, colead.id));
    const [partner] = partners;
    if (partners.length !== 1 || subjects.some((other) => other !== colead && other !== partner && together(other.id, partner.id))) continue;
    if (Math.min(gain(colead), gain(partner)) >= STACKED_GAIN) [colead, partner].forEach((one) => pairs.add(one.id));
  }
  return pairs;
}

/** How far down one scene's strip of furniture reaches; only a scene that shows a strip keeps its band clear. */
function stripDepth(scene: SceneSpec): number {
  const heights = scene.objects
    .filter((source) => defaultZone(source) === "strip" && source.placement?.mode !== "relative")
    .map((source) => {
      const [w, h] = dimensions(source, textPx(source) ?? resolveSize(defaultSize(source), source.kind) ?? 1);
      return h * Math.min(1, FIT_MAX_W / w, FIT_MAX_H / h);
    });
  return heights.reduce((sum, h) => sum + h + 8, 0) - (heights.length > 0 ? 8 : 0);
}

/** Whether a scene re-declares a thing without changing where or how large it is. */
function unchanged(now: ObjectSpec, before: ObjectSpec): boolean {
  const same = (a: unknown, b: unknown) => a === undefined || JSON.stringify(a) === JSON.stringify(b);
  return same(now.placement, before.placement) && same(now.size, before.size) && same(now.role, before.role);
}


// Cards: drawn as boxes of writing and marks, kept off pictures' drawings and each other.
const PANELS: ReadonlySet<ObjectSpec["kind"]> = new Set(["diagram", "chart", "table", "legend", "compare", "scale", "evidence", "working"]);
// The sizes a card tries, when it must move off a picture or another card.
const PANEL_SHRINKS = [1, 0.9, 0.8];
// A re-declared figure or card laid out within this share of its last size is the same one in the same slot.
const SAME_SLOT: [number, number] = [0.8, 1.25];
// Kept from the scene before over this share of another picture it is not set on, a picture is laid out afresh.
const HELD_OVERLAP = 0.12;
// A drawing this scene alone lays out this much wider than it last stood was squeezed by what has since left.
const UNSQUEEZED = 1.02;
// Drawn pictures, whose size is the scene's choice and not their content's: one kept from the scene before keeps its slot.
const DRAWINGS: ReadonlySet<ObjectSpec["kind"]> = new Set(["image", "visual", "svg-artwork", "svg-composite", "map"]);

// A column laid again this many times at most, each time giving its words the room they ran short of.
const RELAYS = 3;

/**
 * The scene's layout. A column of pictures and words whose writing still ran out of room (lifted
 * back from the foot of the frame, or left with no clear spot) is laid again with its pictures
 * shrunk by what was missing, rather than its words printed over them.
 */
function resolveObjects(scene: SceneSpec, carried: Carried, shares: Shares, stripFloor?: number): Laid {
  let tighten = 0;
  for (let round = 0; ; round++) {
    const laid = layObjects(scene, carried, shares, stripFloor, tighten, round === RELAYS);
    if (laid.spill <= 0.5 || round === RELAYS) return laid.spill > 0.5 ? laid : grown(scene, carried, shares, stripFloor, tighten, laid);
    tighten += laid.spill;
  }
}

/** How much larger than their ranks give them a scene's subjects, and the travellers its steps act on, are laid. */
interface Enlarged {
  subjects: number;
  actors: number;
  helpers: number;
  /** Whether helper pictures are drawn at least at a companion's size. */
  floored: boolean;
}

const UNCHANGED: Enlarged = { subjects: 1, actors: 1, helpers: 1, floored: false };

interface Laid {
  objects: ResolvedObject[];
  journeys: Map<ActionSpec, Journey>;
  spill: number;
  together: (a: string, b: string) => boolean;
  /** The beats a thing is on screen through, from the one it is shown on to the one it leaves on. */
  span: (id: string) => [number, number];
}

// The most a scene's pictures are enlarged past the sizes their ranks give them.
const GROW_MOST = 2.4;
// The most a helper picture is enlarged past the size its rank gives it.
const HELPER_MOST = 1.5;
// Laid larger only when that draws a subject at least this much wider.
const GROW_WORTH = 1.1;
// Tried this many sizes between none and the most, halving the gap each time.
const GROW_TRIES = 4;

/**
 * The scene laid again with its pictures as large as they go while it lays out no worse: sized by rank
 * alone, two compared apples and their molecules filled a third of the phone's height. Each try is the
 * whole layout again, so words, journeys and the frame decide how far the pictures can grow.
 */
function grown(scene: SceneSpec, carried: Carried, shares: Shares, stripFloor: number | undefined, tighten: number, laid: Laid): Laid {
  if (!laid.objects.some((o) => o.rank !== undefined)) return laid;
  const layoutFlaws = (one: Laid) => ({ ...drawnFlaws(one), unnamed: unplacedLabels(scene, one) });
  const base = layoutFlaws(laid);
  const worse = (a: LayoutFlaws & { unnamed: number }) => (Object.keys(a) as (keyof typeof a)[]).some((key) => a[key] > base[key]);
  const widths = (one: Laid, ranks: PictureRank[]) => new Map(one.objects.filter((o) => o.rank !== undefined && ranks.includes(o.rank)).map((o) => [o.id, o.box.w]));
  // Pictures that grew at the cost of the subject's room (a row of companions squeezing it) are no gain,
  // nor is one a few points larger, which only moves what the scene after it starts from.
  const gained = (one: Laid, from: Laid, ranks: PictureRank[]) => {
    const [now, before] = [widths(one, ranks), widths(from, ["lead", "colead", "second", "traveller"])];
    return ![...widths(one, ["lead", "colead"])].some(([id, w]) => w < (before.get(id) ?? 0) * 0.99) && [...now].some(([id, w]) => w >= (before.get(id) ?? Infinity) * GROW_WORTH);
  };
  // The largest factor up to `most` that lays out no worse, halving the gap between tries.
  const largest = (from: Laid, most: number, ranks: PictureRank[], at: (factor: number) => Enlarged): [Laid, number] => {
    let [best, low, high] = [from, 1, most];
    for (let tries = 0, next = high; tries < GROW_TRIES && low < most; tries++, next = (low + high) / 2) {
      const tried = layObjects(scene, carried, shares, stripFloor, tighten, false, at(next));
      if (tried.spill > 0.5 || !gained(tried, from, ranks) || worse(layoutFlaws(tried))) high = next;
      else [best, low] = [tried, next];
    }
    return [best, low];
  };
  const [subjects, grow] = largest(laid, GROW_MOST, ["lead", "colead"], (factor) => ({ subjects: factor, actors: 1, helpers: 1, floored: false }));
  // Helpers come up to a companion's size where that costs the subject nothing.
  const raised = layObjects(scene, carried, shares, stripFloor, tighten, false, { subjects: grow, actors: 1, helpers: 1, floored: true });
  const floored = raised.spill <= 0.5 && !worse(layoutFlaws(raised)) && ![...widths(raised, ["lead", "colead"])].some(([id, w]) => w < (widths(subjects, ["lead", "colead"]).get(id) ?? 0) * 0.99);
  const [acted, act] = largest(floored ? raised : subjects, ACTOR_MOST, ["traveller"], (factor) => ({ subjects: grow, actors: factor, helpers: 1, floored }));
  // A subject held to the frame's width (a map, a hull) leaves the height free: its helpers take it.
  const wide = acted.objects.some((o) => (o.rank === "lead" || o.rank === "colead") && o.box.w >= FIT_MAX_W - 1);
  return wide ? largest(acted, HELPER_MOST, ["second"], (factor) => ({ subjects: grow, actors: act, helpers: factor, floored }))[0] : acted;
}

interface LayoutFlaws {
  blocked: number;
  refused: number;
  shortened: number;
  squeezed: number;
  unlike: number;
  overlaps: number;
  crossed: number;
  outside: number;
}

/**
 * How many of the scene's `label`s would find no open space right beside what they name, laid as the compiler
 * lays them on this layout (as long as the beats they stay for, read by beat): grown into the room their
 * names needed, the stacked apples left "uncut apple" written across the whole apple.
 */
function unplacedLabels(scene: SceneSpec, laid: Laid): number {
  const byId = new Map(laid.objects.map((o) => [o.id, o]));
  const top = laid.objects.filter((o) => !o.compositeParent && !backdrop(o.source) && !furniture(o.source));
  // What travels covers its way as well as where it rests, a few poses along each journey.
  const swept = new Map<string, Drawn[]>();
  for (const [action, journey] of laid.journeys) {
    const mover = action.do === "motion" ? byId.get(action.target) : undefined;
    if (!mover || !journey.arrival) continue;
    const [dx, dy] = [journey.arrival[0] - journey.from[0], journey.arrival[1] - journey.from[1]];
    const poses = [0.25, 0.5, 0.75, 1].flatMap((k) => drawnShapes(mover).map((one) => movedDrawn(one, dx * k, dy * k)));
    swept.set(mover.id, [...(swept.get(mover.id) ?? []), ...poses]);
  }
  const requests: LabelRequest[] = scene.beats.flatMap((beat, index) =>
    beat.actions.flatMap((action, at): LabelRequest[] => {
      if (action.do !== "label") return [];
      const named = byId.get(action.target) ?? byId.get(topOwner(action.target, byId));
      const owner = named && byId.get(named.compositeParent ?? named.id);
      if (!named || !owner) return [];
      const [from, to] = laid.span(owner.id);
      const window: [number, number] = [Math.max(index, from), to];
      if (window[0] >= window[1]) return [];
      const others = top.filter((other) => other !== owner && (([a, b]) => a < window[1] && window[0] < b)(laid.span(other.id)));
      const { px, floor } = resolveTextSize(action.size ?? DEFAULT_TEXT_SIZE);
      return [{
        key: `${index}:${at}`,
        owner: owner.id,
        drawn: drawnShapes(named),
        writable: named.hotspot?.outline !== undefined,
        region: named.kind === "image-hotspot",
        ownerBox: drawnBox(owner),
        ownerShape: aPlace(owner) ? undefined : silhouetteOn(owner),
        text: action.text,
        title: action.title,
        sizes: [px, floor],
        plated: action.emphasis !== "quiet" && action.style !== "text",
        place: action.place,
        window,
        obstacles: others.flatMap((other) => [...drawnShapes(other), ...(swept.get(other.id) ?? [])]),
        around: [],
      }];
    }),
  );
  const asked = new Map(requests.map((request) => [request.key, request.place]));
  return [...layoutLabels(requests, FRAME)].filter(([key, layout]) => layout.blocked || (layout.place === "pointer" && asked.get(key) !== "pointer")).length;
}

/** A drawn shape shifted by `dx`, `dy`. */
function movedDrawn(one: Drawn, dx: number, dy: number): Drawn {
  const by = ([x, y]: Point): Point => [x + dx, y + dy];
  return "box" in one ? { box: { ...one.box, x: one.box.x + dx, y: one.box.y + dy } } : "area" in one ? { area: one.area.map(by) } : { ...one, stroke: one.stroke.map(by) };
}

/** What a layout got wrong: writing with no clear spot, journeys refused or cut short, things drawn across each other, things past the frame. */
function drawnFlaws(laid: Laid): LayoutFlaws {
  const byId = new Map(laid.objects.map((o) => [o.id, o]));
  const laidOut = laid.objects.filter((o) => !o.compositeParent && !joinsTwo(o.source) && !laidBetween(o.source) && !backdrop(o.source) && !furniture(o.source) && o.source.role !== "background" && o.source.kind !== "line");
  // Set on, in or against the other, through whatever carries it, a thing is meant to lie over it.
  const on = (a: ResolvedObject, b: ResolvedObject) => {
    const seen = new Set<string>();
    for (let at: ResolvedObject | undefined = a; at && !seen.has(at.id); ) {
      seen.add(at.id);
      const set = bearing(at.source) ?? ("in" in at.source && typeof at.source.in === "string" ? at.source.in : undefined);
      if (set === undefined) return false;
      const owner = topOwner(set, byId);
      if (owner === b.id) return true;
      at = byId.get(owner);
    }
    return false;
  };
  let overlaps = 0;
  for (let i = 0; i < laidOut.length; i++)
    for (let j = i + 1; j < laidOut.length; j++) {
      const [a, b] = [laidOut[i], laidOut[j]];
      if (!laid.together(a.id, b.id) || on(a, b) || on(b, a)) continue;
      const [p, q] = [drawnBox(a), drawnBox(b)];
      const w = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
      const h = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      if (w > 1 && h > 1 && w * h > 0.12 * Math.min(p.w * p.h, q.w * q.h)) overlaps++;
    }
  // Writing whose box runs into another's, or a picture's, that it is not set against.
  let crossed = 0;
  for (let i = 0; i < laidOut.length; i++)
    for (let j = i + 1; j < laidOut.length; j++) {
      const [a, b] = [laidOut[i], laidOut[j]];
      if (!(wording(a.source) || wording(b.source)) || !(wording(a.source) || PICTURE_KINDS.has(a.source.kind)) || !(wording(b.source) || PICTURE_KINDS.has(b.source.kind))) continue;
      if (!laid.together(a.id, b.id) || bearing(a.source)?.split(".")[0] === b.id || bearing(b.source)?.split(".")[0] === a.id) continue;
      const w = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
      const h = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
      if (w > 4 && h > 4) crossed++;
    }
  const outside = laidOut.filter((o) => {
    const box = drawnBox(o);
    return box.x < FRAME_MIN_X - 1 || box.y < FRAME_MIN - 1 || box.x + box.w > FRAME_MAX_X + 1 || box.y + box.h > FRAME_MAX_Y + 1;
  }).length;
  return {
    blocked: laidOut.filter((o) => o.blocked).length,
    squeezed: laidOut.filter((o) => o.size < (textPx(o.source) ?? 0) * 0.99).length,
    unlike: laidOut.filter((o) => typeof o.source.size === "object" && !o.raised && (likeMiss(o, o.source.size, byId) ?? 0) > LIKE_TOLERANCE).length,
    refused: [...laid.journeys.values()].filter((journey) => journey.refused).length,
    shortened: [...laid.journeys.values()].filter((journey) => journey.arrival && journey.wanted && Math.hypot(journey.arrival[0] - journey.wanted[0], journey.arrival[1] - journey.wanted[1]) > 2).length,
    overlaps,
    crossed,
    outside,
  };
}


function layObjects(written: SceneSpec, carried: Carried, shares: Shares, stripFloor: number | undefined, tighten: number, final: boolean, enlarged = UNCHANGED): Laid {
  let spill = 0;
  const { windows } = analyzeLifecycle(written, 0);
  // A picture stepped aside leaves its slot on that beat, so the subject that comes next is laid out in it.
  const asides = new Map<string, number>();
  written.beats.forEach((beat, index) => beat.actions.forEach((action) => action.do === "aside" && !asides.has(action.target) && asides.set(action.target, index)));
  const span = (id: string): [number, number] => {
    const window = windows.get(id);
    if (!window) return [0, Infinity];
    return [window.initiallyVisible ? 0 : (window.showBeat ?? 0), Math.min(window.hideBeat ?? Infinity, asides.get(id) ?? Infinity)];
  };
  // Two things that are never on screen at once take turns in one place instead of splitting it.
  const together = (a: string, b: string) => {
    const [aFrom, aTo] = span(a);
    const [bFrom, bTo] = span(b);
    return aFrom < bTo && bFrom < aTo;
  };
  const writtenFrames = figureFrames(written.objects);
  const writtenRanks = pictureRanks(written, together, (source) => writtenFrames.has(source.id) || drawnIn(source));
  const stacked = stackedPairs(written, writtenRanks, together);
  const scene = pairsApart(subjectsInMain(written, writtenRanks, together), writtenRanks, together, stacked);
  const zoneStacks = new Map<ZoneToken, { id: string; bottom: number }[]>();
  // A figure is laid out whole, the size of every piece drawn on its grid together, and each piece is
  // then set on its own part of it: two paths in their own boxes never line up, however they are drawn.
  const frames = figureFrames(scene.objects);
  const specs = new Map(scene.objects.map((source) => [source.id, source]));
  const framed = (source: ObjectSpec) => frames.has(source.id) || drawnIn(source);
  const pieces = new Map<string, ObjectSpec[]>();
  for (const source of scene.objects) {
    const figure = frames.get(source.id);
    if (figure !== undefined) pieces.set(figure, [...(pieces.get(figure) ?? []), source]);
  }
  // A figure's room holds the shapes its base morphs into as well, on the base's own grid.
  const figureSegs = (source: ObjectSpec): PathSeg[] | undefined =>
    source.kind === "path" && pieces.has(source.id)
      ? [...[source, ...pieces.get(source.id)!].flatMap((piece) => gridSegs(piece, specs)), ...morphShapes(scene, source).flatMap((d) => parsePath(d).segs)]
      : undefined;
  const ranks = pictureRanks(scene, together, framed, enlarged, stacked);
  const backdrops = scene.objects.filter(backdrop);
  const objects: ResolvedObject[] = scene.objects.map((source) => {
    const zone = defaultZone(source);
    const base = ZONES[scene.composition][zone];
    const ranked = ranks.get(source.id);
    // A figure is laid out from what it holds; its rank only ever narrows it, when it helps another subject.
    const figure = rankedFigure(source);
    const size0 =
      (textPx(source) ?? resolveSize(defaultSize(source), source.kind) ?? 1) *
      (source.kind === "visual" ? ASSET_SCALE : 1) *
      (ranked && !figure ? ranked.extent / ARTWORK_EXTENTS[defaultSize(source)] : 1);
    const shapes = morphShapes(scene, source);
    const room = source.kind === "path" && shapes.length > 0 ? [source.d, ...shapes].flatMap((d) => parsePath(d).segs) : undefined;
    const measured0 = (!framed(source) && !pieces.has(source.id) && routeExtent(scene, source)) || dimensions(source, size0, backdrops.length, figureSegs(source) ?? room, figure ? undefined : ranked?.extent);
    // Its writing keeps its size as its box narrows, so a helping figure is never narrowed past what its words need.
    const helping = figure && ranked && ranked.rank !== "lead" && ranked.rank !== "colead" ? Math.max(ranked.extent, figureMinWidth(source)) / measured0[0] : 1;
    // Auto-fit: if the object is bigger than the usable frame (the view space minus its inset), scale its
    // size and box down so it always fits — overflow degrades to a smaller object instead of failing.
    const fit =
      joinsTwo(source) || backdrop(source)
        ? 1
        : Math.min(1, FIT_MAX_W / measured0[0], FIT_MAX_H / measured0[1], helping);
    // Writing is never fitted below the size a phone can read.
    const kept = fit < 1 && source.kind === "text" ? Math.max(fit, Math.min(1, textFloor(source) / size0)) : fit < 1 ? fit : 1;
    const size = size0 * kept;
    const measured: [number, number] =
      kept < 1 ? [measured0[0] * kept, measured0[1] * kept] : measured0;
    const stack = zoneStacks.get(zone) ?? [];
    const above = stack.filter((entry) => together(entry.id, source.id));
    const cy = above.length ? Math.max(...above.map((entry) => entry.bottom)) + 24 + measured[1] / 2 : base[1];
    const band = backdrop(source) ? backdrops.indexOf(source) : -1;
    const position: Point = backdrop(source)
      ? [VIEW_WIDTH / 2, (VIEW_HEIGHT / backdrops.length) * (band + 0.5)]
      : [base[0], cy];
    if (!backdrop(source) && !framed(source)) zoneStacks.set(zone, [...stack, { id: source.id, bottom: cy + measured[1] / 2 }]);
    return {
      id: source.id,
      kind: source.kind,
      source,
      position,
      size,
      angle: orientationAngle(source),
      box: makeBox(position, measured),
      rank: ranked?.rank,
      ...(ownTurn(source) ? { turned: ownTurn(source) } : {}),
      ...(shapes.length > 0 ? { shapes } : {}),
    };
  });
  const byId = new Map(objects.map((object) => [object.id, object]));
  // A picture the scene sends across the parts of another picture travels on that picture.
  for (const action of scene.beats.flatMap((beat) => beat.actions)) {
    if (action.do !== "motion" || (action.motion !== "along" && action.motion !== "move")) continue;
    const mover = byId.get(action.target);
    const stops = action.motion === "along" ? (action.through ?? []) : action.to !== undefined ? [action.to] : [];
    const ground = stops.find((stop) => partOfPicture(stop, byId));
    if (mover?.source.kind === "image" && ground !== undefined && mover.travelsOn === undefined) mover.travelsOn = topOwner(ground, byId);
  }
  // A stack that runs past the bottom rises as one; clamped a line at a time, every line landed on the last.
  for (const stack of zoneStacks.values()) {
    const overflow = Math.max(...stack.map((entry) => entry.bottom)) - FRAME_MAX_Y;
    if (overflow <= 0) continue;
    for (const entry of stack) {
      const object = byId.get(entry.id)!;
      object.position = [object.position[0], object.position[1] - overflow];
      object.box = makeBox(object.position, [object.box.w, object.box.h]);
    }
  }
  let stripTop = STRIP_TOP;
  // The open question always takes the first slot: stacked in authored order, a chip declared before the
  // timeline in one scene and after it in the next jumped from under it to above it.
  const stripOrder = objects.filter((o) => defaultZone(o.source) === "strip").sort((a, b) => Number(b.source.kind === "question") - Number(a.source.kind === "question"));
  for (const clock of stripOrder) {
    clock.position = [clock.position[0], stripTop + clock.box.h / 2];
    clock.box = makeBox(clock.position, [clock.box.w, clock.box.h]);
    stripTop += clock.box.h + 8;
  }
  // Below the running timeline is where the main pictures begin: one that reaches up into it moves
  // down, and shrinks when moving down would take it past the foot of the frame.
  const overhead = objects.filter((o) => defaultZone(o.source) === "strip");
  for (const main of objects) {
    const laid = !backdrop(main.source) && (main.source.placement === undefined || main.source.placement.mode === "zone");
    if (!(PICTURE_KINDS.has(main.source.kind) || main.rank) || !laid || ["strip", "badge", "hud", "background", "overlay"].includes(defaultZone(main.source))) continue;
    const above = overhead.filter((o) => together(o.id, main.id));
    const ceiling = Math.max(FRAME_MIN, stripFloor ?? FRAME_MIN, ...above.map((o) => o.box.y + o.box.h)) + 12;
    if ((above.length === 0 && stripFloor === undefined) || main.box.y >= ceiling) continue;
    const bottom = Math.min(main.box.y + main.box.h + (ceiling - main.box.y), FRAME_MAX_Y);
    const scale = Math.min(1, (bottom - ceiling) / main.box.h);
    const [w, h] = [main.box.w * scale, main.box.h * scale];
    main.size *= scale;
    main.position = [main.position[0], ceiling + h / 2];
    main.box = makeBox(main.position, [w, h]);
  }
  // The main picture yields to the writing set beneath it: it shrinks from its top edge until the
  // lines below fit, rather than having them risen onto it or pushed into each other.
  const below = objects.filter((o) => ["support", "footer"].includes(defaultZone(o.source)) && YIELDED_TO.has(o.source.kind));
  for (const main of objects) {
    if (!PICTURE_KINDS.has(main.source.kind) || !["main", "main-left", "main-right"].includes(defaultZone(main.source))) continue;
    const under = below.filter((o) => o !== main && together(o.id, main.id) && o.box.x < main.box.x + main.box.w && main.box.x < o.box.x + o.box.w);
    if (under.length === 0) continue;
    const room = Math.min(...under.map((o) => o.box.y)) - BESIDE_GAP - main.box.y;
    const scale = room / main.box.h;
    if (scale >= 1 || scale < MIN_YIELD) continue;
    const [w, h] = [main.box.w * scale, main.box.h * scale];
    main.size *= scale;
    main.position = [main.position[0], main.box.y + h / 2];
    main.box = makeBox(main.position, [w, h]);
  }
  reserveJourneys(scene, objects, byId);
  const stacking = stackings(objects, byId);
  const columns = fitColumns(objects, byId, stacking, together, tighten, stripFloor);
  // Set above or below a thing, a thing leaves room toward it for what is itself stacked that way:
  // the knife set over the onion stands between the onion and the eye the onion hangs under.
  const between = (object: ResolvedObject) => {
    const placement = object.source.placement;
    if (placement?.mode !== "relative" || (placement.relation !== "above" && placement.relation !== "below")) return 0;
    const toward = placement.relation === "above" ? "below" : "above";
    return stackReach(object.id, toward, stacking, (o) => o.box.h, together, new Set([object.id]));
  };
  fitStacks(objects, byId, together);
  const partnersOf = scalePartners(scene, together);
  keepReadableInScale(objects, partnersOf);
  objects.forEach(coverPieces);

  // A thing the scene before also had starts where that scene left it: turned as it was left, and in
  // the same place at the same size unless this scene moves or resizes it, or lays it out larger.
  // How far each held thing moved from where this scene alone would have put it.
  const held = new Map<string, Point>();
  const actedOn = new Set(written.beats.flatMap((beat) => beat.actions).flatMap((action) => ("target" in action && typeof action.target === "string" ? [action.target] : [])));
  const laidFresh = new Map<string, { box: ResolvedBox; position: Point; size: number }>();
  const zoneLaid = (o: ResolvedObject) => bearing(o.source) === undefined;
  // What is laid in a zone is decided first: a picture set against another is kept only while that one is.
  for (const object of [...objects.filter(zoneLaid), ...objects.filter((o) => !zoneLaid(o))]) {
    const before = carried.get(object.id);
    if (!before || backdrop(object.source) || joinsTwo(object.source) || framed(object.source)) continue;
    if (object.source.rotate === undefined && before.pose.turned !== 0) object.turned = before.pose.turned;
    if (!unchanged(object.source, before.source)) continue;
    // A picture in a zone keeps its slot while the screen around it is the same: what this scene adds
    // above or below it must fit there readably, or it gives way, and a squeeze whose cause has left is
    // not kept. One set against another keeps its place while that one keeps its own.
    // Anything else laid out afresh from its content (a figure, a card) keeps its last box only when that is about its size now.
    const share = object.box.w / Math.max(1e-6, before.pose.box.w);
    // Attached or set on another, it keeps its place only while that one keeps its own: held alone, a
    // rider stayed where the last scene left it while its bicycle was laid out afresh.
    const set = bearing(object.source);
    const bearer = set === undefined ? undefined : topOwner(set, byId);
    // Laid much larger by this scene, as the one it acts on, a picture set on a held one is laid afresh on it:
    // held, the trading ship the step sailed across a map stayed the speck the scene before had drawn.
    const crowded =
      (bearer !== undefined && !held.has(bearer)) ||
      (bearer !== undefined && object.rank === "traveller" && actedOn.has(object.id) && share >= GROW_WORTH) ||
      (!DRAWINGS.has(object.source.kind)
        ? share < SAME_SLOT[0] || share > SAME_SLOT[1]
        : bearer === undefined &&
          (share > UNSQUEEZED ||
          companionsOf(objects, object, together).some((one) => columnOf(before.pose.box, one) && bandBeside(before.pose.box, one, stripFloor).scale < leastScale(one)) ||
            objects.some((one) => together(one.id, object.id) && sideRoom(before.pose.box, one, object.id, stripFloor) < leastScale(one))));
    // A strip this scene shows takes its band back from a slot kept from a scene without one.
    const underStrip = stripFloor !== undefined && !furniture(object.source) && before.pose.box.y < stripFloor + 12;
    // Kept at its last size, a traveller would have no room left for this scene's journeys. A subject
    // its journeys left off to one side is laid out again, as it stands turned: the slot is the scene's.
    const strayed = before.pose.travelled === true && (object.rank === "lead" || object.rank === "colead") && (object.source.role === "primary" || object.source.role === "hero");
    if (crowded || underStrip || strayed || !reachFits(before.pose.box, object.reach)) continue;
    const fresh = object.position;
    laidFresh.set(object.id, { box: object.box, position: object.position, size: object.size });
    object.box = { ...before.pose.box };
    object.position = [object.box.x + object.box.w / 2, object.box.y + object.box.h / 2];
    object.size = before.pose.size;
    held.set(object.id, [object.position[0] - fresh[0], object.position[1] - fresh[1]]);
  }
  // A picture kept where the last scene left it on another picture this scene does not set it on is laid
  // out afresh: the sheet carried off onto the press stayed printed across it all the next scene.
  const setOn = (a: ObjectSpec, b: string) => {
    const seen = new Set<string>();
    for (let at: ObjectSpec | undefined = a; at && !seen.has(at.id); ) {
      seen.add(at.id);
      const on = bearing(at) ?? ("in" in at && typeof at.in === "string" ? at.in : undefined);
      if (on === undefined) return false;
      if (on.split(".")[0] === b) return true;
      at = specs.get(on.split(".")[0]);
    }
    return false;
  };
  for (const object of objects) {
    const fresh = laidFresh.get(object.id);
    if (!fresh || !DRAWINGS.has(object.source.kind) || object.rank === "lead" || object.rank === "colead") continue;
    const lies = objects.some((other) => {
      if (other === object || !DRAWINGS.has(other.source.kind) || backdrop(other.source) || !together(other.id, object.id) || setOn(object.source, other.id) || setOn(other.source, object.id)) return false;
      const [a, b] = [drawnBox(object), drawnBox(other)];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 && w * h > HELD_OVERLAP * Math.min(a.w * a.h, b.w * b.h);
    });
    if (!lies) continue;
    Object.assign(object, { box: fresh.box, position: fresh.position, size: fresh.size });
    held.delete(object.id);
  }

  // Turned as the scene before left it, a thing covers more of the screen than it did upright: it is
  // fitted again as it is turned, or the frame could only clamp it part off the screen.
  for (const object of objects) {
    if (!object.turned || joinsTwo(object.source) || backdrop(object.source) || framed(object.source)) continue;
    const turned = boundsOf([{ area: turnedBox(object) }])!;
    const scale = Math.min(1, (FRAME_MAX_X - FRAME_MIN_X) / turned.w, (FRAME_MAX_Y - FRAME_MIN) / turned.h);
    if (scale >= 1) continue;
    object.size *= scale;
    object.box = makeBox(object.position, [object.box.w * scale, object.box.h * scale]);
  }

  // A state that replaces another — shown on the beat the other is hidden, never on screen with it, the
  // same thing in the same zone or set on it — takes the leaving state's slot: its own shape fitted in
  // that box, centred on it, turned as it is, and goes wherever that one goes. Laid out each on its own,
  // the two landed apart.
  const replacing = new Map<string, string>();
  for (const arriving of objects) {
    const shown = windows.get(arriving.id)?.showBeat;
    if (!DRAWINGS.has(arriving.source.kind) || shown === undefined || held.has(arriving.id)) continue;
    // A state keeps its thing's shape: a picture of another shape fitted into the leaving one's box was squeezed.
    const shaped = (other: ResolvedObject) => {
      const share = (arriving.box.w / Math.max(1e-6, arriving.box.h)) / (other.box.w / Math.max(1e-6, other.box.h));
      return share >= SAME_SLOT[0] && share <= SAME_SLOT[1];
    };
    const leaving = objects.find((other) => {
      if (other === arriving || !DRAWINGS.has(other.source.kind) || windows.get(other.id)?.hideBeat !== shown || together(other.id, arriving.id) || other.source.role !== arriving.source.role || !shaped(other)) return false;
      const on = bearing(arriving.source)?.split(".")[0];
      const like = typeof arriving.source.size === "object" ? arriving.source.size.like.split(".")[0] : undefined;
      return on === other.id || like === other.id || (on === undefined && bearing(other.source) === undefined && defaultZone(other.source) === defaultZone(arriving.source));
    });
    if (!leaving) continue;
    const aspect = arriving.box.w / Math.max(1e-6, arriving.box.h);
    const w = Math.min(leaving.box.w, leaving.box.h * aspect);
    // Shrunk to leave room for what this scene stacks on it, it keeps the place that room was made in:
    // grown into the leaving one's slot, a map ran its column of captions over the sheet beneath it.
    if (arriving.box.w < w * 0.98) continue;
    // Sized against the leaving state, it keeps that size in its slot: a dough written half again as big must rise.
    const sized = typeof arriving.source.size === "object" && arriving.source.size.like.split(".")[0] === leaving.id ? (arriving.source.size.times ?? 1) : 1;
    const grown = Math.min(w * sized, FIT_MAX_W, FIT_MAX_H * aspect);
    const fresh = arriving.position;
    arriving.size *= grown / Math.max(1e-6, arriving.box.w);
    arriving.position = [...leaving.position];
    arriving.box = makeBox(arriving.position, [grown, grown / aspect]);
    if (leaving.turned) arriving.turned = leaving.turned;
    if (held.has(leaving.id)) held.set(arriving.id, [arriving.position[0] - fresh[0], arriving.position[1] - fresh[1]]);
    else replacing.set(arriving.id, leaving.id);
  }

  const writing = (o: ResolvedObject | undefined) => o !== undefined && wording(o.source);
  // Two pictures laid in one zone and never on screen together are one thing's states, swapped in place.
  const statesOf = (x: ResolvedObject, y: ResolvedObject) =>
    x.source.kind === "image" &&
    y.source.kind === "image" &&
    x.source.placement?.mode === "zone" &&
    y.source.placement?.mode === "zone" &&
    x.source.placement.zone === y.source.placement.zone &&
    !together(x.id, y.id);
  // Whether `a` is set on `b`, directly or through what it is set on: a name under an official standing
  // on a map belongs on the map, and stepping it off the map put it under the map's foot.
  // Past its own bearer, only a thing fixed on what holds it carries what is set on it there: the eye
  // laid above the onion did not make the knife set above the onion belong on the eye.
  // Drawn in another, a thing is on it as much as one set on it.
  const frameOf = (source: ObjectSpec) => (drawnIn(source) ? (source as { in: string }).in : undefined);
  const attached = (a: ResolvedObject, b: ResolvedObject) => {
    const seen = new Set<string>();
    for (let p = bearing(a.source) ?? frameOf(a.source); p !== undefined; ) {
      if (p === b.id || p.startsWith(`${b.id}.`)) return true;
      const bearer = byId.get(p.split(".")[0]);
      if (!bearer || seen.has(bearer.id)) return false;
      // A soldier set on the first map stays on the map that replaces it, instead of being pushed off it.
      if (statesOf(bearer, b)) return true;
      seen.add(bearer.id);
      p = groundedOn(bearer, byId) ?? frameOf(bearer.source);
    }
    return false;
  };
  const obstaclesFor = (object: ResolvedObject, relation?: Relation, reference?: string) => sceneObstacles(object, objects, byId, together, attached, relation, reference);

  const placed = new Set<string>();
  const placing = new Set<string>();
  // Things set on the same side of one target while on screen together line up there in the order
  // written; each used to take the same spot, and a map's four captions printed as one smudge.
  const slots = new Map<string, ResolvedObject[]>();
  const ahead = new Map<string, ResolvedObject[]>();
  const queued = (object: ResolvedObject) => (ahead.get(object.id) ?? []).map((other) => other.box);
  const settledFirst = (other: ResolvedObject) => placed.has(other.id) || held.has(other.id) || (!other.source.attach && (other.source.placement === undefined || other.source.placement.mode === "zone"));
  const dependOn = (reference: string) => {
    const owner =
      byId.get(topOwner(reference, byId)) ??
      [...byId.values()].find((candidate) => !candidate.compositeParent && svgDefinition(candidate.source) !== undefined && reference.startsWith(`${candidate.id}.`));
    if (owner) place(owner);
  };
  const place = (object: ResolvedObject) => {
    if (placed.has(object.id) || placing.has(object.id)) return;
    placing.add(object.id);
    const done = () => {
      placing.delete(object.id);
      placed.add(object.id);
    };
    const { placement, attach } = object.source;
    const like = typeof object.source.size === "object" ? object.source.size : undefined;
    for (const reference of [like?.like, attach?.to, placement?.mode === "zone" ? undefined : placement?.target]) if (reference) dependOn(reference);
    // Held at the size the scene before gave it, a thing sized against another that has since been laid out anew is sized again.
    const fresh = laidFresh.get(object.id);
    if (like && fresh && held.has(object.id) && together(object.id, topOwner(like.like, byId)) && (likeMiss(object, like, byId) ?? 0) > LIKE_TOLERANCE) {
      Object.assign(object, { box: fresh.box, position: fresh.position, size: fresh.size });
      held.delete(object.id);
    }
    if (held.has(object.id) || replacing.has(object.id)) return done();
    if (like) sizeLike(object, like, byId, together(object.id, topOwner(like.like, byId)));
    if (attach) {
      const host = pictureHost(object, byId);
      if (host && !like) sizeOnHost(object, host, shares.get(shareKey(object, host)));
      attachTo(object, attach, byId);
      return done();
    }
    if (!placement || placement.mode === "zone") return done();
    // Writing set on one spot lines up under it too; orbits and other anchored shapes keep the centre.
    if (placement.mode === "relative" || writing(object)) {
      const slot = `${placement.target}|${placement.mode === "relative" ? placement.relation : "on"}`;
      const sharing = slots.get(slot) ?? [];
      ahead.set(object.id, sharing.filter((other) => together(other.id, object.id)));
      slots.set(slot, [...sharing, object]);
    }
    // Writing set on a page, a sign or a board breaks at that thing's width, not the screen's.
    const room = placement.mode === "anchor" ? resolveReferenceBox(placement.target, byId)?.w : undefined;
    if (object.source.kind === "text" && room !== undefined && room >= MIN_WRAP && room < object.box.w) {
      object.wrap = room;
      const lines = measureLines(wrapLines(object.source.text, object.size, room).join("\n"), object.size);
      object.box = makeBox(object.position, [lines.w, lines.h]);
    }
    // A picture keeps off the other pictures already in their places; writing is settled once everything has one.
    const relation = relationFor(object, placement, byId);
    const pictures = object.source.kind === "image" ? sceneObstacles(object, objects.filter((other) => other.source.kind === "image" && settledFirst(other)), byId, together, attached, relation, placement.target) : [];
    object.position = beside(object, placement, byId, [...queued(object).map((box): Drawn => ({ box })), ...pictures], between(object));
    if (relation === "on") object.stands = true;
    object.box = makeBox(object.position, [object.box.w, object.box.h]);
    done();
  };
  keepStatedSizesInFrame(objects, byId, together);
  objects.forEach(place);
  // A state taking the leaving one's slot follows it to where it was placed, with what is fixed on it.
  const followLeaving = () => {
    for (const [arrivingId, leavingId] of replacing) {
      const [arriving, leaving] = [byId.get(arrivingId)!, byId.get(leavingId)!];
      // Grown bigger than the leaving state, past the frame's edge from where that one stood, it is moved in rather than cut off.
      const kept = (at: number, half: number, low: number, high: number) => Math.max(low + half, Math.min(high - half, at));
      const [x, y] = [kept(leaving.position[0], arriving.box.w / 2, FRAME_MIN_X, FRAME_MAX_X), kept(leaving.position[1], arriving.box.h / 2, FRAME_MIN, FRAME_MAX_Y)];
      const [dx, dy] = [x - arriving.position[0], y - arriving.position[1]];
      if (Math.hypot(dx, dy) < 0.5) continue;
      for (const object of objects) {
        if (object !== arriving && (writing(object) || fixing(object.source) === undefined || topOwner(fixing(object.source)!, byId) !== arriving.id)) continue;
        object.position = [object.position[0] + dx, object.position[1] + dy];
        object.box = makeBox(object.position, [object.box.w, object.box.h]);
      }
    }
  };
  followLeaving();

  centreMain(objects, byId, held, stacking, together, (id) => span(id)[1] === 0, stripFloor);
  fitAroundHeld(objects.filter((o) => !replacing.has(o.id)), byId, held, together, stripFloor);
  hangBadges(objects, together, (badge, main) => obstaclesFor(badge, "below", main));

  // A column of writing hung line under line rises as one when it runs past the bottom; clamped a line
  // at a time, the lower lines all landed on the same last spot.
  const hangsBelow = (o: ResolvedObject) => (o.source.placement?.mode === "relative" && o.source.placement.relation === "below" ? byId.get(o.source.placement.target) : undefined);
  const holding = new Set(objects.map(hangsBelow).filter(writing).map((o) => o!.id));
  const riseColumns = () => {
    for (const last of objects) {
      const overflow = last.box.y + last.box.h - FRAME_MAX_Y;
      if (overflow <= 0 || !writing(last) || holding.has(last.id)) continue;
      const column = [last];
      for (let above = hangsBelow(last); writing(above) && !column.includes(above!); above = hangsBelow(above!)) column.push(above!);
      if (column.length < 2) continue;
      // What is written beside a line of the column rises with it, or the risen line lands on it.
      for (let grew = true; grew; ) {
        grew = false;
        for (const one of objects) {
          const placement = one.source.placement;
          if (!writing(one) || column.includes(one) || placement?.mode !== "relative" || !column.some((line) => line.id === placement.target)) continue;
          column.push(one);
          grew = true;
        }
      }
      spill = Math.max(spill, overflow);
      for (const line of column) {
        line.position = [line.position[0], line.position[1] - overflow];
        line.box = makeBox(line.position, [line.box.w, line.box.h]);
      }
    }
  };
  riseColumns();

  // Final clamp: nudge any box that still pokes outside the safe frame back inside (each already fits
  // after the per-object auto-fit, so a shift is always enough). Overflow can no longer occur.
  objects.forEach(keepInFrame);

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
    joinsTwo(o.source) ||
    framed(o.source) ||
    o.source.role === "background" ||
    (o.source.role === "annotation" && o.source.placement?.mode !== "zone");
  // Pinned objects (`role: "hud"`, `space: "screen"`) hold their place and are an obstacle to everything
  // else, which moves the whole overlap instead of half; skipped outright, world content walked
  // straight over them. Two pieces of writing never print over each other, however each was placed
  // and whatever its role: a readout ran into the caption under it.
  const pinned = (o: ResolvedObject) =>
    o.source.role === "hud" || o.source.space === "screen" || held.has(o.id) || drawnIn(o.source);
  // Between two pictures the lesser gives way: the subject keeps the place the scene gave it.
  const standing = (o: ResolvedObject) => (o.rank === "lead" || o.rank === "colead" ? 3 : o.rank === "second" ? 2 : o.rank === "traveller" ? 1 : 0);
  const holds = (o: ResolvedObject, other: ResolvedObject) => pinned(o) || (standing(other) > 0 && standing(o) > standing(other));
  // A picture fixed on another is pushed only as part of it: pushed alone, wings left their bee behind.
  const rootOf = (o: ResolvedObject) => fixtureRoot(o, byId);
  const separate = () => {
    for (let iteration = 0; iteration < 6; iteration++) {
      let adjusted = false;
      for (let i = 0; i < objects.length; i++) {
        for (let j = i + 1; j < objects.length; j++) {
          const a = objects[i];
          const b = objects[j];
          if (
            rootOf(a) === rootOf(b) ||
            writing(a) ||
            writing(b) ||
            skipSeparation(a) ||
            skipSeparation(b) ||
            (pinned(a) && pinned(b)) ||
            !together(a.id, b.id) ||
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
          const narrower =
            overlapX < overlapY ||
            (overlapX === overlapY && Math.abs(a.position[0] - b.position[0]) > Math.abs(a.position[1] - b.position[1]));
          // Compare CENTRES, not near edges: a big object always has the lower near edge, so an edge
          // comparison pushed it further out even when its centre sat well past the other one — and the
          // pair then walked straight past each other, inverting the authored order. On an exact tie the
          // one the writer named first keeps the near side, so the order never flips at random.
          const order = (axis: 0 | 1) => (a.position[axis] <= b.position[axis] ? [a, b] : [b, a]);
          // A lesser picture the frame's edge would stop short of clear is pushed the other way: pushed
          // sideways into the edge, the shopkeeper stayed under the letter and the clamp kept it there.
          const blocked = (axis: 0 | 1) => {
            const [near, far] = order(axis);
            const gap = (axis === 0 ? overlapX : overlapY) + 6;
            const [low, high] = axis === 0 ? [FRAME_MIN_X, FRAME_MAX_X] : [FRAME_MIN, FRAME_MAX_Y];
            const edge = (o: ResolvedObject) => (axis === 0 ? [o.box.x, o.box.x + o.box.w] : [o.box.y, o.box.y + o.box.h]);
            if (holds(rootOf(near), rootOf(far))) return edge(far)[1] + gap > high + 0.5;
            if (holds(rootOf(far), rootOf(near))) return edge(near)[0] - gap < low - 0.5;
            return false;
          };
          const sideways = narrower ? !blocked(0) || blocked(1) : blocked(1) && !blocked(0);
          const axis = sideways ? 0 : 1;
          const overlap = sideways ? overlapX : overlapY;
          const [first, second] = order(axis);
          const shift = overlap / 2 + 3;
          const move = (o: ResolvedObject, by: number) => {
            const root = rootOf(o);
            for (const one of objects) {
              if (rootOf(one) !== root) continue;
              one.position = axis === 0 ? [one.position[0] + by, one.position[1]] : [one.position[0], one.position[1] + by];
              one.box = makeBox(one.position, [one.box.w, one.box.h]);
            }
          };
          if (holds(rootOf(first), rootOf(second))) move(second, overlap + 6);
          else if (holds(rootOf(second), rootOf(first))) move(first, -(overlap + 6));
          else {
            move(first, -shift);
            move(second, shift);
          }
          adjusted = true;
        }
      }
      objects.forEach(keepInFrame);
      if (!adjusted) break;
    }
  };
  separate();

  // Separating moves what pictures set against others keep off, so each is placed again where it is now
  // clear, carrying along what is set on it (writing and pictures set on it are placed in their turn).
  const replaced = new Set<string>();
  const placeAgain = (picture: ResolvedObject) => {
    if (replaced.has(picture.id)) return;
    replaced.add(picture.id);
    const placement = picture.source.placement;
    if (picture.source.kind !== "image" || held.has(picture.id) || replacing.has(picture.id) || picture.source.attach || !placement || placement.mode === "zone") return;
    const bearer = byId.get(topOwner(placement.target, byId));
    if (bearer) placeAgain(bearer);
    const relation = relationFor(picture, placement, byId);
    // It is placed with the pictures fixed on it: placed alone, a sledge cleared the pyramid and the block it carried lay across it.
    const fixedOn = (object: ResolvedObject) => object !== picture && object.source.kind === "image" && object.source.attach !== undefined && topOwner(object.source.attach.to, byId) === picture.id && together(object.id, picture.id);
    const group = boundsOf([picture, ...objects.filter(fixedOn)].map((one): Drawn => ({ box: one.box })))!;
    const middle: Point = [group.x + group.w / 2, group.y + group.h / 2];
    const whole = { ...picture, position: middle, box: group };
    const spot = beside(whole, placement, byId, sceneObstacles(picture, objects.filter((other) => other.source.kind === "image"), byId, together, attached, relation, placement.target), between(picture));
    const [dx, dy] = [spot[0] - middle[0], spot[1] - middle[1]];
    if (Math.hypot(dx, dy) < 0.5) return;
    for (const object of objects) {
      // A picture attached to this one is fixed on it and goes with it; one only set beside it is placed in its turn.
      const fixedHere = object.source.attach !== undefined && topOwner(object.source.attach.to, byId) === picture.id;
      if (object !== picture && (!attached(object, picture) || (object.source.kind === "image" && !fixedHere) || writing(object))) continue;
      object.position = [object.position[0] + dx, object.position[1] + dy];
      object.box = makeBox(object.position, [object.box.w, object.box.h]);
    }
  };
  objects.forEach(placeAgain);
  followLeaving();

  // Whatever moved or resized a host since, what is fixed on it is set back on its point at its scale, with what is set on it.
  const refixed = new Set<string>();
  const refix = (object: ResolvedObject) => {
    const attach = object.source.attach;
    if (refixed.has(object.id) || !attach) return;
    refixed.add(object.id);
    const host = byId.get(topOwner(attach.to, byId));
    if (host) refix(host);
    if (held.has(object.id) || replacing.has(object.id)) return;
    const [x, y] = object.position;
    const picture = pictureHost(object, byId);
    if (picture && typeof object.source.size !== "object") sizeOnHost(object, picture, shares.get(shareKey(object, picture)));
    attachTo(object, attach, byId);
    const [dx, dy] = [object.position[0] - x, object.position[1] - y];
    if (Math.hypot(dx, dy) < 0.5) return;
    for (const other of objects) {
      if (other === object || other.source.attach || other.compositeParent || writing(other) || !attached(other, object)) continue;
      other.position = [other.position[0] + dx, other.position[1] + dy];
      other.box = makeBox(other.position, [other.box.w, other.box.h]);
    }
  };
  objects.forEach(refix);
  // A host and what is fixed on it are kept in the frame as one; a group wider or taller than the frame lets each fixture be kept in on its own.
  for (const root of new Set(objects.filter((o) => o.source.attach && !o.compositeParent).map(rootOf))) {
    const group = objects.filter((o) => !o.compositeParent && rootOf(o) === root);
    const bounds = boundsOf(group.map((o): Drawn => (o.turned ? { area: turnedBox(o) } : { box: o.box })))!;
    if (bounds.w > FRAME_MAX_X - FRAME_MIN_X || bounds.h > FRAME_MAX_Y - FRAME_MIN) {
      group.filter((o) => o !== root && !held.has(o.id)).forEach(keepInFrame);
      continue;
    }
    const dx = Math.max(FRAME_MIN_X, Math.min(bounds.x, FRAME_MAX_X - bounds.w)) - bounds.x;
    const dy = Math.max(FRAME_MIN, Math.min(bounds.y, FRAME_MAX_Y - bounds.h)) - bounds.y;
    if (dx === 0 && dy === 0) continue;
    const riders = objects.filter((other) => !group.includes(other) && !other.source.attach && !other.compositeParent && !writing(other) && group.some((member) => attached(other, member)));
    for (const one of [...group, ...riders]) {
      one.position = [one.position[0] + dx, one.position[1] + dy];
      one.box = makeBox(one.position, [one.box.w, one.box.h]);
    }
  }

  const movePanel = (panel: ResolvedObject, at: Point, scale: number) => {
    const [dx, dy] = [at[0] - panel.position[0], at[1] - panel.position[1]];
    panel.size *= scale;
    panel.position = at;
    panel.box = makeBox(at, [panel.box.w * scale, panel.box.h * scale]);
    coverPieces(panel);
    for (const object of objects) {
      if (object === panel || object.compositeParent || !attached(object, panel)) continue;
      object.position = [object.position[0] + dx, object.position[1] + dy];
      object.box = makeBox(object.position, [object.box.w, object.box.h]);
    }
  };
  // A card — a diagram, chart, table, key — left lying across a picture's drawing or another card moves to
  // the nearest spot clear of them, a little smaller if it must; pushed apart by boxes, it still sat on them.
  for (const panel of objects) {
    const laid = bearing(panel.source) === undefined;
    if (!PANELS.has(panel.source.kind) || panel.compositeParent || !laid || pinned(panel) || backdrop(panel.source)) continue;
    const others = objects.filter((other) => other !== panel && !other.compositeParent && (DRAWINGS.has(other.source.kind) || PANELS.has(other.source.kind)) && !backdrop(other.source) && together(other.id, panel.id) && !attached(other, panel) && !attached(panel, other));
    const obstacles = others.flatMap((other) => (DRAWINGS.has(other.source.kind) ? drawnShapes(other) : [{ box: drawnBox(other) }]));
    if (!obstacles.some((one) => meets(one, panel.box))) continue;
    PANEL_SHRINKS.some((scale) => {
      const size: [number, number] = [panel.box.w * scale, panel.box.h * scale];
      const spot = placeBeside({ drawn: [{ box: panel.box }], point: panel.position }, size, obstacles, "anchor", { frame: FRAME });
      if (spot.clear) movePanel(panel, spot.at, scale);
      return spot.clear;
    });
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
    const path = action.along === undefined ? undefined : byId.get(action.along);
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

  for (const parent of [...objects]) {
    if (parent.compositeParent) continue;
    for (const piece of figurePlan(parent.source, parent.box.w, parent.box.h).pieces) {
      const box = pieceBox(parent, piece.box);
      const resolvedPiece: ResolvedObject = {
        id: `${parent.id}.${piece.name}`,
        kind: "figure-piece",
        source: parent.source,
        position: [box.x + box.w / 2, box.y + box.h / 2],
        box,
        size: parent.size,
        compositeParent: parent.id,
      };
      objects.push(resolvedPiece);
      byId.set(resolvedPiece.id, resolvedPiece);
    }
  }

  // A picture's hotspots are places inside it, so they are laid out only once the picture itself
  // has its final box: fractions of the fitted picture, never of the rect it was fitted into.
  for (const parent of [...objects]) {
    if (parent.compositeParent || parent.source.kind !== "image") continue;
    for (const hotspot of imageHotspots(parent.source)) {
      const rest = hotspotBox(parent, hotspot.id);
      if (!rest) continue;
      const box = boundsOf([{ area: boxPolygon(rest).map((corner) => turnAbout(corner, parent.position, parent.turned)) }])!;
      const resolvedHotspot: ResolvedObject = {
        id: `${parent.id}.${hotspot.id}`,
        kind: "image-hotspot",
        source: parent.source,
        position: [box.x + box.w / 2, box.y + box.h / 2],
        box,
        size: parent.size,
        compositeParent: parent.id,
        hotspot: {
          ...hotspot,
          outline: parent.source.outlines?.[hotspot.id] ? partShape(parent, hotspot.id) : undefined,
        },
      };
      objects.push(resolvedHotspot);
      byId.set(resolvedHotspot.id, resolvedHotspot);
    }
  }

  // Who walks each route: a route laid between two places is walked from where its walker stands.
  const walks = scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "motion" && action.motion === "along" && action.along && byId.has(action.target) ? [[action.along, byId.get(action.target)!] as const] : []));
  const walkers = new Map(walks);
  // Routes are aimed in the order they are walked, so a walker's next route starts where its last one ended.
  const walkOrder = new Map(walks.map(([route], index) => [route, index]));
  const aimJoins = () => {
    const standing = new Map<string, Point>();
    for (const object of [...objects].sort((a, b) => (walkOrder.get(a.id) ?? -1) - (walkOrder.get(b.id) ?? -1))) {
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
      if (!laidBetween(object.source)) continue;
      const source = object.source as { from: string; to: string };
      const [one, two] = [referent(source.from, byId), referent(source.to, byId)];
      const [fromMiddle, toMiddle] = [referentPoint(one), referentPoint(two)];
      const from = meeting(one, fromMiddle, toMiddle);
      const to = meeting(two, toMiddle, fromMiddle);
      // Walked out to edges that overlap — a crowded pair, two regions of one map sharing a border —
      // the ends cross over or meet, drawing nothing; the connection then runs between the middles.
      // Between two parts of one picture whose edges all but meet (a magnet's two poles), the edges leave a stub; it runs between the middles too.
      const stub = topOwner(source.from, byId) === topOwner(source.to, byId) && Math.hypot(to[0] - from[0], to[1] - from[1]) < STUB_SHARE * Math.hypot(toMiddle[0] - fromMiddle[0], toMiddle[1] - fromMiddle[1]);
      const crossed = stub || (to[0] - from[0]) * (toMiddle[0] - fromMiddle[0]) + (to[1] - from[1]) * (toMiddle[1] - fromMiddle[1]) <= 0 || touching(one.drawn, two.drawn);
      object.endpoints = crossed ? { from: fromMiddle, to: toMiddle } : { from, to };
      // Edge to edge, a connector into a part of a picture its other end touches drew a stub no one could read
      // (the ray from the sun into the air it sits on): it reaches into that part, to the part's middle, instead.
      if (!crossed && Math.hypot(to[0] - from[0], to[1] - from[1]) < READABLE_LINK) {
        const ends = { from: partOfPicture(source.from, byId) ? fromMiddle : from, to: partOfPicture(source.to, byId) ? toMiddle : to };
        if (Math.hypot(ends.to[0] - ends.from[0], ends.to[1] - ends.from[1]) > Math.hypot(to[0] - from[0], to[1] - from[1])) object.endpoints = ends;
      }
      const walker = walkers.get(object.id);
      if (walker?.stands) {
        const at = standing.get(walker.id) ?? feet(walker);
        const [start, end] = walkedBackward(object.source, [object.endpoints.from, object.endpoints.to], at) ? ["to", "from"] as const : ["from", "to"] as const;
        const goal = source[end];
        const ground = crossed && regionOfPlace(goal, byId) ? placeBeside(referent(goal, byId), [walker.box.w, walker.box.h], obstaclesFor(walker, "on", goal), "on", { frame: FRAME }) : undefined;
        object.endpoints = { ...object.endpoints, [start]: at, ...(ground ? { [end]: [ground.at[0], ground.at[1] + walker.box.h / 2] } : {}) };
        standing.set(walker.id, object.endpoints[end]);
      }
      const ends = object.endpoints;
      object.position = [(ends.from[0] + ends.to[0]) / 2, (ends.from[1] + ends.to[1]) / 2];
      object.box = {
        x: Math.min(ends.from[0], ends.to[0]),
        y: Math.min(ends.from[1], ends.to[1]),
        w: Math.abs(ends.to[0] - ends.from[0]),
        h: Math.abs(ends.to[1] - ends.from[1]),
      };
    }
  };
  // Laid on a box (a picture, a part, any other thing), a path's grid runs 0–1000 across the box's
  // width and 0–1000 down its height, whatever the box's shape.
  for (const object of objects) {
    const source = object.source;
    if (source.kind !== "path" || source.in === undefined || frameSetter(source.in, specs).kind !== "box") continue;
    const frame = viewFrame(source.in, specs, byId);
    if (frame) setDrawn(object, { a: frame.x[0], b: frame.x[1], c: frame.y[0], d: frame.y[1], e: frame.o[0], f: frame.o[1] });
  }
  for (const [figureId, members] of pieces) {
    const figure = byId.get(figureId);
    if (!figure || figure.source.kind !== "path") continue;
    const placed = figure.drawn ? absoluteAffine(figure) : fittedGrid(figureSegs(figure.source)!, figure.box);
    if (!placed) continue;
    for (const piece of [figure, ...members.map((member) => byId.get(member.id)!)]) setDrawn(piece, compose(placed, gridAffine(piece.source, specs)));
  }
  for (const object of objects) {
    const ref = drawnIn(object.source) ? (object.source as { in: string }).in : undefined;
    const frame = ref === undefined ? undefined : viewFrame(ref, specs, byId);
    if (ref === undefined || !frame) continue;
    object.pin = { ref, ...frame };
    if (object.source.kind === "path") continue;
    const setter = frameSetter(ref, specs);
    object.position = writingSpot(object, frame, setter.kind === "handle" && parseHandle(setter.handle)?.side !== undefined);
    object.box = makeBox(object.position, [object.box.w, object.box.h]);
    keepInFrame(object);
  }
  // What is set beside a thing drawn in another is set again now that thing is drawn where it lies: set
  // before, the arrow under the mark drawn in a bicycle was laid by the mark's empty zone, then pushed off.
  for (const object of objects) {
    const placement = object.source.placement;
    const reference = placement && placement.mode !== "zone" ? placement.target : undefined;
    const bearer = reference === undefined ? undefined : byId.get(reference.split(".")[0]);
    if (!placement || !bearer || !drawnIn(bearer.source) || writing(object) || held.has(object.id) || object.source.attach || framed(object.source)) continue;
    object.position = beside(object, placement, byId, [], between(object));
    object.box = makeBox(object.position, [object.box.w, object.box.h]);
  }
  aimJoins();

  // A route drawn on its own and walked by a picture starts where that picture stands: laid out in a
  // zone of its own, it sat apart from the balloon, which walked a lead-in down to it before rising.
  const routed = new Set<string>();
  for (const action of scene.beats.flatMap((beat) => beat.actions)) {
    if (action.do !== "motion" || action.motion !== "along" || !action.along || routed.has(action.along)) continue;
    const route = byId.get(action.along);
    const rider = byId.get(action.target);
    if (!route || !rider || !walkedRoute(scene, route.source) || pieces.has(route.id)) continue;
    routed.add(route.id);
    const course = flattenPath(drawnSegs(route))[0]?.points.map(([x, y]): Point => [x, y]);
    if (!course || course.length < 2) continue;
    const base = rider.stands ? feet(rider) : rider.position;
    const first = walkedBackward(route.source, course, base) ? course[course.length - 1] : course[0];
    const [dx, dy] = [base[0] - first[0], base[1] - first[1]];
    route.position = [route.position[0] + dx, route.position[1] + dy];
    route.box = makeBox(route.position, [route.box.w, route.box.h]);
  }

  // A traveller set at the place a route laid between two things leaves from starts on the route's tail
  // (its feet there when it stands), with what is set on it: set beside the place, it walked a lead-in
  // longer than the route itself, the opposite way to the route's arrow.
  for (const action of scene.beats.flatMap((beat) => beat.actions)) {
    if (action.do !== "motion" || action.motion !== "along" || !action.along) continue;
    const route = byId.get(action.along);
    const rider = byId.get(action.target);
    const source = route?.source;
    const placement = rider?.source.placement;
    if (!route?.endpoints || !rider || !source || !laidBetween(source) || !placement || placement.mode === "zone" || held.has(rider.id)) continue;
    const ends = source as { from: string; to: string };
    const tail = walkedBackward(source, [route.endpoints.from, route.endpoints.to], rider.position) ? ends.to : ends.from;
    if (placement.target !== tail) continue;
    const start = tail === ends.from ? route.endpoints.from : route.endpoints.to;
    const base = rider.stands ? feet(rider) : rider.position;
    const [dx, dy] = [start[0] - base[0], start[1] - base[1]];
    if (Math.hypot(dx, dy) < 0.5) continue;
    // Another traveller already waiting there keeps the spot; this one walks in from where it was set.
    const there = makeBox([rider.position[0] + dx, rider.position[1] + dy], [rider.box.w, rider.box.h]);
    const others = objects.filter((other) => other !== rider && !other.compositeParent && DRAWINGS.has(other.source.kind) && together(other.id, rider.id) && !attached(rider, other) && !attached(other, rider));
    if (others.some((other) => drawnShapes(other).some((one) => meets(one, there)))) continue;
    for (const object of objects) {
      const bearer = object.compositeParent ?? (object.source.placement && object.source.placement.mode !== "zone" ? topOwner(object.source.placement.target, byId) : undefined);
      if (object !== rider && bearer !== rider.id) continue;
      object.position = [object.position[0] + dx, object.position[1] + dy];
      object.box = makeBox(object.position, [object.box.w, object.box.h]);
      if (object.hotspot?.outline) object.hotspot = { ...object.hotspot, outline: object.hotspot.outline.map(([x, y]): Point => [x + dx, y + dy]) };
    }
  }

  // A traveller keeps off every picture but those it is fixed on (anchored, attached) and those fixed on it.
  const fixedOn = (a: ResolvedObject, b: ResolvedObject) => {
    const seen = new Set<string>();
    for (let p = fixing(a.source); p !== undefined && !seen.has(p); p = fixing(byId.get(p.split(".")[0])?.source)) {
      if (p === b.id || p.startsWith(`${b.id}.`)) return true;
      seen.add(p);
    }
    return false;
  };
  const travellers = (): ReturnType<typeof planJourneys> => planJourneys(scene, journeyWorld(scene, objects, byId, (a, b) => fixedOn(a, b) || fixedOn(b, a), (id, beat) => span(id)[0] <= beat && beat < span(id)[1]));
  // Where each mover has got to as each journey ends, from where it rests: writing that rides one keeps
  // off other writing at every one of those moments, not only at rest; "1 g" rode its paperclip into "1 newton".
  const drifts = new Map<string, Point[]>();
  const journeyEnds = [...travellers()].filter(([action, journey]) => action.do === "motion" && journey.arrival);
  journeyEnds.forEach(([action, journey], index) => {
    if (action.do !== "motion") return;
    const [dx, dy] = [journey.arrival![0] - journey.from[0], journey.arrival![1] - journey.from[1]];
    for (const id of [action.target, ...(action.with ?? [])]) {
      const drift = drifts.get(id) ?? Array.from({ length: journeyEnds.length + 1 }, (): Point => [0, 0]);
      for (let at = index + 1; at < drift.length; at++) drift[at] = [drift[at][0] + dx, drift[at][1] + dy];
      drifts.set(id, drift);
    }
  });
  const driftOf = (words: ResolvedObject, seen = new Set<string>()): Point[] | undefined => {
    if (drifts.has(words.id)) return drifts.get(words.id);
    const placement = words.source.placement;
    const bearer = placement && placement.mode !== "zone" && !seen.has(words.id) ? byId.get(topOwner(placement.target, byId)) : undefined;
    if (!bearer) return undefined;
    return writing(bearer) ? driftOf(bearer, new Set([...seen, words.id])) : drifts.get(bearer.id);
  };
  const ridden = (words: ResolvedObject): Drawn[] => {
    const own = driftOf(words);
    return objects.flatMap((other): Drawn[] => {
      const theirs = driftOf(other);
      if (other === words || !settled.has(other.id) || !writing(other) || other.compositeParent || !together(other.id, words.id) || (!own && !theirs)) return [];
      const zero = Array.from({ length: journeyEnds.length + 1 }, (): Point => [0, 0]);
      return (own ?? zero).flatMap(([wx, wy], at): Drawn[] => {
        const [ox, oy] = (theirs ?? zero)[at];
        return Math.hypot(ox - wx, oy - wy) < 1 ? [] : [{ box: { ...other.box, x: other.box.x + ox - wx, y: other.box.y + oy - wy } }];
      });
    });
  };

  // Writing is placed last, once everything it could land on is drawn where it will be: the nearest spot
  // keeping its relation, off every drawn thing it does not belong to, shrunk a step when nowhere is clear.
  const settled = new Set<string>();
  const routeTail = (words: ResolvedObject): Point | undefined => {
    const shownAt = span(words.id)[0];
    for (const [index, beat] of scene.beats.entries()) {
      const walk = beat.actions.find((action) => action.do === "motion" && action.motion === "along" && action.target === words.id && action.along !== undefined);
      if (index !== shownAt || walk?.do !== "motion" || walk.motion !== "along") continue;
      const route = byId.get(walk.along!);
      if (!route?.endpoints || !laidBetween(route.source)) return undefined;
      const ends = [route.endpoints.from, route.endpoints.to];
      return walkedBackward(route.source, ends, words.position) ? ends[1] : ends[0];
    }
    return undefined;
  };
  // Writing queued on one side of a thing lines up past what is set there before it.
  const queueDepth = (words: ResolvedObject, relation: Relation) =>
    (ahead.get(words.id) ?? []).reduce((sum, other) => sum + (relation === "left-of" || relation === "right-of" ? other.box.w : other.box.h) + BESIDE_GAP, 0);
  // Writing an arrow joins to what it is set beside keeps its side however far: brought round close, the arrow between shrank to a stub.
  const joinedTo = (words: ResolvedObject, reference: string) =>
    objects.some((one) => {
      if (!ARROWS.has(one.source.kind) || !laidBetween(one.source)) return false;
      const ends = [(one.source as { from: string }).from, (one.source as { to: string }).to].map((end) => topOwner(end, byId)).sort().join(" ");
      return ends === [words.id, topOwner(reference, byId)].sort().join(" ");
    });
  const settle = (words: ResolvedObject) => {
    if (settled.has(words.id)) return;
    settled.add(words.id);
    const placement = words.source.placement;
    const reference = placement && placement.mode !== "zone" ? placement.target : undefined;
    const bearer = reference === undefined ? undefined : byId.get(topOwner(reference, byId));
    if (bearer && writing(bearer)) settle(bearer);
    if (held.has(words.id) || pinned(words) || framed(words.source) || words.source.attach || furniture(words.source)) return;
    // Writing that sets off along a route the moment it is shown starts at the route's tail: settled
    // beside its place, "answer" appeared at the foot of the screen and flew up to its line.
    const start = routeTail(words);
    if (start) {
      words.position = start;
      words.box = makeBox(start, [words.box.w, words.box.h]);
      keepInFrame(words);
      return;
    }
    // Laid in a zone, it keeps its spot when that is clear, else takes the nearest clear one round it.
    const relation = placement && placement.mode !== "zone" ? relationFor(words, placement, byId) : "near";
    const target: Referent = reference === undefined ? { drawn: [{ box: rectAt(words.position, [0, 0]) }], point: words.position } : referent(reference, byId);
    const obstacles = [...obstaclesFor(words, relation, reference), ...ridden(words)];
    // A line hung under writing may run past the foot of the frame: its whole column rises after.
    const column = relation === "below" && writing(bearer);
    const options = { frame: column ? { ...FRAME, h: FRAME.h * 2 } : FRAME, gap: reference === undefined ? 0 : gapFor(placement, target) + between(words), stays: reference !== undefined && joinedTo(words, reference) ? undefined : WRITING_STAYS + queueDepth(words, relation) };
    const [w, h] = [words.box.w, words.box.h];
    // Writing is broken into lines again at its smaller size, as it is drawn: scaled whole, a four-line
    // relation stayed four lines tall and found no room that its two drawn lines had.
    const shrunk = (by: number): [number, number] => {
      if (words.source.kind !== "text") return [w * by, h * by];
      const lines = measureLines(wrapLines(words.source.text, words.size * by, words.wrap ?? FIT_MAX_W).join("\n"), words.size * by);
      return [lines.w, lines.h];
    };
    let spot = placeBeside(target, [w, h], obstacles, relation, options);
    let scale = 1;
    for (const smaller of SHRINKS) {
      if (spot.clear || words.size * smaller < textFloor(words.source)) break;
      const tried = placeBeside(target, shrunk(smaller), obstacles, relation, options);
      if (tried.clear) [spot, scale] = [tried, smaller];
    }
    // Writing laid in a zone belongs to no one thing: with nowhere clear round its zone, and no column left
    // to give it room, any clear room on the screen beats printing it across a picture, as over the sun.
    for (const by of reference === undefined && !spot.clear && (final || !columns) ? [1, ...SHRINKS.filter((smaller) => words.size * smaller >= textFloor(words.source))] : []) {
      const at = placeAnywhere(words.position, shrunk(by), obstacles, FRAME);
      if (!at) continue;
      [spot, scale] = [{ at, clear: true }, by];
      break;
    }
    if (!spot.clear) {
      spill = Math.max(spill, h + BESIDE_GAP);
      words.blocked = true;
    }
    const kept = scale === 1 ? ([w, h] as [number, number]) : shrunk(scale);
    words.size *= scale;
    words.position = spot.at;
    words.box = makeBox(spot.at, kept);
    if (reference !== undefined && reachOf(target.drawn, words.box) > BESIDE_REACH) words.pointer = referentPoint(target);
  };
  objects.filter((object) => !object.compositeParent && writing(object)).forEach(settle);
  riseColumns();
  aimJoins();
  for (const object of objects) if (!pieces.has(object.id) && !frames.has(object.id)) keepRouteInFrame(object);
  gentleBows(objects, byId);

  // A route or a picture anchored or attached to a thing is carried in its frame as it moves and turns;
  // set beside it, a thing only starts out there.
  for (const object of objects) {
    const source = object.source;
    const placement = source.placement;
    const route = walkedRoute(scene, source);
    const set = source.attach?.to ?? (placement?.mode === "anchor" ? placement.target : undefined);
    const host = set === undefined ? undefined : byId.get(topOwner(set, byId));
    if (set === undefined || object.pin || object.compositeParent || !host || backdrop(host.source) || (source.kind !== "image" && !route)) continue;
    const frame = viewFrame(set, specs, byId);
    if (frame) object.pin = { ref: set, ...frame };
  }

  if (held.size === 0) centreScreen(objects);
  const journeys = travellers();
  for (const object of objects) {
    const facing = object.source.kind === "image" && object.source.facing !== undefined ? facingDegrees(object.source.facing) - (object.turned ?? 0) : undefined;
    if (facing !== undefined) object.facing = facing;
  }
  return { objects, journeys, spill: columns ? spill : 0, together, span };
}

/**
 * The main zones' content and everything set on or beside it, moved as one to the middle of the height
 * left between the strip along the top and what sits under it: centred on the zone's fixed point, a diagram left the
 * bottom third of a portrait frame empty.
 */
function centreMain(objects: ResolvedObject[], byId: Map<string, ResolvedObject>, held: Map<string, Point>, stacking: Stacking, together: (a: string, b: string) => boolean, leavesAtOnce: (id: string) => boolean, stripFloor?: number): void {
  // Laid in a zone of its own; a thing attached to or set on another goes where that one goes.
  const zoned = (o: ResolvedObject) => !drawnIn(o.source) && bearing(o.source) === undefined;
  const group = new Set(
    objects
      .filter((o) => zoned(o) && !backdrop(o.source) && !joinsTwo(o.source) && o.source.role !== "hud" && o.source.space !== "screen" && ["main", "main-left", "main-right"].includes(defaultZone(o.source)))
      .map((o) => o.id),
  );
  if (group.size === 0) return;
  for (let grew = true; grew; ) {
    grew = false;
    for (const o of objects) {
      const on = bearing(o.source)?.split(".")[0];
      if (group.has(o.id) || on === undefined || !byId.has(on) || !group.has(on)) continue;
      group.add(o.id);
      grew = true;
    }
  }
  const members = objects.filter((o) => group.has(o.id) && !joinsTwo(o.source));
  // A group holding a thing kept where the scene before left it goes there with it, as one: the picture
  // that replaces it in the same zone takes its slot, and whatever is set on either comes along.
  // One that leaves on the scene's first beat holds no slot for the rest: kept to it, a Europe map was set
  // where the Pacific map it replaced had grown to, with no room left above its diagram for a name.
  const anchor = members.find((o) => held.has(o.id) && zoned(o) && !leavesAtOnce(o.id));
  if (anchor) {
    const [dx, dy] = held.get(anchor.id)!;
    const root = (o: ResolvedObject) => {
      const seen = new Set<string>();
      for (let at = o; !seen.has(at.id); ) {
        seen.add(at.id);
        const on = bearing(at.source);
        const bearer = on === undefined ? undefined : byId.get(on.split(".")[0]);
        if (!bearer) return at;
        at = bearer;
      }
      return o;
    };
    for (const o of members) {
      if (held.has(root(o).id) || held.has(o.id)) continue;
      o.position = [o.position[0] + dx, o.position[1] + dy];
      o.box = makeBox(o.position, [o.box.w, o.box.h]);
    }
    return;
  }
  // Names and captions set on the group move with it but never move it: the picture keeps one slot.
  const laid = members.filter((o) => zoned(o) || !wording(o.source));
  const [left, right] = [Math.min(...laid.map((o) => o.box.x)), Math.max(...laid.map((o) => o.box.x + o.box.w))];
  const others = objects.filter((o) => !group.has(o.id) && zoned(o) && !backdrop(o.source) && !joinsTwo(o.source));
  const above = others.filter((o) => defaultZone(o.source) === "strip");
  const below = others.filter((o) => ["support", "footer"].includes(defaultZone(o.source)) && o.box.x < right && left < o.box.x + o.box.w);
  const top = Math.max(FRAME_MIN, ...(stripFloor === undefined ? [] : [stripFloor + BESIDE_GAP]), ...above.map((o) => o.box.y + o.box.h + BESIDE_GAP));
  const bottom = Math.min(FRAME_MAX_Y, ...below.map((o) => o.box.y - BESIDE_GAP));
  // The writing still to be hung above and below them is part of what is centred: the subject and its words sit in the middle together.
  const words = (o: ResolvedObject, side: "above" | "below") => stackReach(o.id, side, wordStacking(stacking), (one) => one.box.h, together);
  const from = Math.min(...laid.map((o) => o.box.y - words(o, "above")));
  const to = Math.max(...laid.map((o) => o.box.y + o.box.h + words(o, "below")));
  if (to - from > bottom - top) return;
  const dy = (top + bottom) / 2 - (from + to) / 2;
  if (Math.abs(dy) < 4) return;
  for (const o of members) {
    o.position = [o.position[0], o.position[1] + dy];
    o.box = makeBox(o.position, [o.box.w, o.box.h]);
  }
}

// Off centre by less than this share of the frame's height, a scene is left where it was laid.
const OFF_CENTRE = 0.08;

/**
 * Everything a scene draws, with the room its journeys take, moved up or down as one so it sits in the
 * middle of the frame below the strip: laid zone by zone, a scene whose lower zones held nothing left
 * the bottom half of the phone empty.
 */
function centreScreen(objects: ResolvedObject[]): void {
  const fixedZone = (o: ResolvedObject) => ["strip", "badge", "hud", "background"].includes(defaultZone(o.source)) || o.source.role === "hud" || o.source.space === "screen" || backdrop(o.source);
  const world = objects.filter((o) => !fixedZone(o));
  const spans = world.filter((o) => !o.compositeParent).map((o) => {
    const box = drawnBox(o);
    return [box.y - (o.reach?.up ?? 0), box.y + box.h + (o.reach?.down ?? 0)];
  });
  if (spans.length === 0) return;
  const strip = objects.filter((o) => defaultZone(o.source) === "strip").map((o) => o.box.y + o.box.h + BESIDE_GAP);
  const top = Math.max(FRAME_MIN, ...strip);
  const [from, to] = [Math.min(...spans.map(([y]) => y)), Math.max(...spans.map(([, y]) => y))];
  if (from < top - 0.5 || to > FRAME_MAX_Y + 0.5) return;
  const dy = (top + FRAME_MAX_Y) / 2 - (from + to) / 2;
  if (Math.abs(dy) < VIEW_HEIGHT * OFF_CENTRE) return;
  for (const o of world) {
    o.position = [o.position[0], o.position[1] + dy];
    o.box = makeBox(o.position, [o.box.w, o.box.h]);
    if (o.endpoints) o.endpoints = { from: [o.endpoints.from[0], o.endpoints.from[1] + dy], to: [o.endpoints.to[0], o.endpoints.to[1] + dy] };
    if (o.pointer) o.pointer = [o.pointer[0], o.pointer[1] + dy];
    if (o.hotspot?.outline) o.hotspot = { ...o.hotspot, outline: o.hotspot.outline.map(([x, y]): Point => [x, y + dy]) };
    if (o.pin) o.pin = { ...o.pin, o: [o.pin.o[0], o.pin.o[1] + dy] };
  }
}

/** A picture's own border on screen, turned as it is drawn; undefined when it has none. */
export function silhouetteOn(object: ResolvedObject): Point[] | undefined {
  const outline = object.kind === "image" && object.source.kind === "image" ? object.source.silhouette : undefined;
  return outline?.length ? outline.map(([x, y]) => turnAbout([object.box.x + x * object.box.w, object.box.y + y * object.box.h], object.position, object.turned)) : undefined;
}

/** A thing's box as it covers the screen once turned. */
function turnedBox(object: ResolvedObject): Point[] {
  return boxPolygon(object.box).map((corner) => turnAbout(corner, object.position, object.turned));
}

/** The box a thing covers on screen: a picture's own silhouette, not the transparent frame it sits in. */
export function drawnBox(object: ResolvedObject): ResolvedBox {
  return boundsOf([{ area: silhouetteOn(object) ?? turnedBox(object) }])!;
}

// A silhouette covering this much of its frame is a picture of a place — a map, a scene — not a cut-out.
const FULL_FRAME = 0.85;

const shoelace = (points: Point[]) => Math.abs(points.reduce((sum, [x, y], i) => sum + x * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * y, 0)) / 2;

/** A picture of a place, which fills its frame: its regions are ground to stand on, and between them (the sea) is room to write. */
function aPlace(object: ResolvedObject | undefined): boolean {
  if (object?.source.kind !== "image" || object.compositeParent) return false;
  const silhouette = object.source.silhouette;
  return (silhouette !== undefined && silhouette.length > 2 ? shoelace(silhouette) : 1) >= FULL_FRAME;
}

/**
 * The date-and-place badge hangs from the bottom-left corner of the scene's main picture — just under
 * it, or just inside it when there is no room under — rather than at the foot of an empty frame.
 */
function hangBadges(objects: ResolvedObject[], together: (a: string, b: string) => boolean, obstacles: (badge: ResolvedObject, main: string) => Drawn[]): void {
  for (const badge of objects.filter((o) => defaultZone(o.source) === "badge")) {
    const area = (o: ResolvedObject) => drawnBox(o).w * drawnBox(o).h;
    const main = objects.filter((o) => (o.rank === "lead" || o.rank === "colead") && together(o.id, badge.id)).sort((a, b) => area(b) - area(a))[0];
    if (!main) continue;
    const drawn = drawnShapes(main);
    const bounds = boundsOf(drawn)!;
    const [w, h] = [badge.box.w, badge.box.h];
    const spot = placeBeside({ drawn, point: [Math.max(FRAME_MIN_X, bounds.x) + w / 2, bounds.y + bounds.h / 2] }, [w, h], obstacles(badge, main.id), "below", { frame: FRAME, gap: BESIDE_GAP / 2 });
    badge.position = spot.at;
    badge.box = makeBox(spot.at, [w, h]);
  }
}

/** Shift a thing back inside the safe frame, as it covers the screen once turned; after the auto-fit a shift is always enough. */
function keepInFrame(object: ResolvedObject): void {
  if (joinsTwo(object.source) || backdrop(object.source)) return;
  const bounds = object.turned ? boundsOf([{ area: turnedBox(object) }])! : object.box;
  // A traveller is kept in with the whole of its journey; when that cannot fit, its journey is shortened instead.
  const reach = object.reach && reachFits(bounds, object.reach) ? object.reach : undefined;
  const { x, y, w, h } = reach ? { x: bounds.x - reach.left, y: bounds.y - reach.up, w: bounds.w + reach.left + reach.right, h: bounds.h + reach.up + reach.down } : bounds;
  const dx = Math.max(FRAME_MIN_X, Math.min(x, FRAME_MAX_X - w)) - x;
  const dy = Math.max(FRAME_MIN, Math.min(y, FRAME_MAX_Y - h)) - y;
  if (dx === 0 && dy === 0) return;
  object.position = [object.position[0] + dx, object.position[1] + dy];
  object.box = makeBox(object.position, [object.box.w, object.box.h]);
}

/** What is set above and below each thing, filed under what that thing stands or is fixed on: a caption under the cut onion, attached on the whole one, hangs under the whole one. */
interface Stacking {
  above: Map<string, ResolvedObject[]>;
  below: Map<string, ResolvedObject[]>;
}

function stackings(objects: ResolvedObject[], byId: Map<string, ResolvedObject>): Stacking {
  const ground = (id: string) => {
    const seen = new Set<string>();
    let at = byId.get(id);
    for (let on = at && groundedOn(at, byId); at && on !== undefined && !seen.has(at.id); on = at && groundedOn(at, byId)) {
      seen.add(at.id);
      at = byId.get(topOwner(on, byId)) ?? at;
    }
    return at;
  };
  const stacking: Stacking = { above: new Map(), below: new Map() };
  for (const object of objects) {
    const placement = object.source.placement;
    // Set over or under a region of a place, it is written on the place, not stacked beside it.
    if (object.compositeParent || placement?.mode !== "relative" || (placement.relation !== "above" && placement.relation !== "below") || regionOfPlace(placement.target, byId)) continue;
    const base = ground(topOwner(placement.target, byId));
    if (!base || base === object) continue;
    const side = stacking[placement.relation];
    side.set(base.id, [...(side.get(base.id) ?? []), object]);
  }
  return stacking;
}

/** The writing alone of a stacking: what is still to be hung once the pictures have their places. */
function wordStacking(stacking: Stacking): Stacking {
  const only = (side: Map<string, ResolvedObject[]>) => new Map([...side].map(([id, list]) => [id, list.filter((one) => wording(one.source))] as const));
  return { above: only(stacking.above), below: only(stacking.below) };
}

/** How far a column reaches past `id` on one side: everything stacked there, each with its own gap and what is stacked on it; things never on screen together share one place. */
function stackReach(
  id: string,
  side: "above" | "below",
  stacking: Stacking,
  height: (o: ResolvedObject) => number,
  together: (a: string, b: string) => boolean,
  seen: Set<string> = new Set(),
): number {
  const slot = (stacking[side].get(id) ?? []).filter((one) => !seen.has(one.id));
  if (slot.length === 0) return 0;
  const inner = new Set([...seen, id]);
  const length = (one: ResolvedObject) =>
    stackGap(one) + height(one) + stackReach(one.id, "above", stacking, height, together, inner) + stackReach(one.id, "below", stacking, height, together, inner);
  return Math.max(...slot.map((one) => slot.filter((other) => other === one || together(other.id, one.id)).reduce((sum, other) => sum + length(other), 0)));
}

function stackGap(object: ResolvedObject): number {
  const placement = object.source.placement;
  if (placement?.mode === "relative" && placement.gap !== undefined) return placement.gap;
  return placement?.mode === "relative" && anchorDot(placement.target) > 0 ? EDGE_GAP : BESIDE_GAP;
}

/** Everything in the column stacked on `id`, and what rides on each. */
function stackMembers(id: string, stacking: Stacking, seen: Set<string> = new Set()): ResolvedObject[] {
  seen.add(id);
  return [...(stacking.above.get(id) ?? []), ...(stacking.below.get(id) ?? [])].filter((one) => !seen.has(one.id)).flatMap((one) => [one, ...stackMembers(one.id, stacking, seen)]);
}

/**
 * Pictures, cards and writing set one above another share the frame's height: the band between the
 * strip along the top and what is laid beneath. A column that runs taller shrinks its pictures (writing
 * keeps its size, a card gives little) until it fits, and its subject is set where the whole column,
 * words included, sits centred in that band; fitted pair by pair, the onion under the eye filled the
 * height and the captions under it had nowhere to go but onto it.
 */
function fitColumns(objects: ResolvedObject[], byId: Map<string, ResolvedObject>, stacking: Stacking, together: (a: string, b: string) => boolean, tighten: number, stripFloor?: number): boolean {
  let any = false;
  const strip = objects.filter((o) => defaultZone(o.source) === "strip" && o.source.placement?.mode !== "relative");
  const top = Math.max(FRAME_MIN, ...(stripFloor === undefined ? [] : [stripFloor + BESIDE_GAP]), ...strip.map((o) => o.box.y + o.box.h + BESIDE_GAP));
  const beneath = objects.filter((o) => bearing(o.source) === undefined && !joinsTwo(o.source) && !backdrop(o.source) && ["support", "footer"].includes(defaultZone(o.source)));
  const floor = Math.max(top + 200, Math.min(FRAME_MAX_Y, ...beneath.map((o) => o.box.y - BESIDE_GAP)));
  const rides = (one: ResolvedObject, on: ResolvedObject) => {
    const ground = groundedOn(one, byId);
    return ground !== undefined && topOwner(ground, byId) === on.id;
  };
  for (const root of objects) {
    if (root.compositeParent || bearing(root.source) !== undefined || backdrop(root.source) || joinsTwo(root.source) || wording(root.source) || !["main", "main-left", "main-right"].includes(defaultZone(root.source))) continue;
    const members = stackMembers(root.id, stacking);
    if (members.length === 0) continue;
    any = true;
    const yields = (o: ResolvedObject, scale: number) => (wording(o.source) ? 1 : YIELDED_TO.has(o.source.kind) ? Math.max(scale, leastScale(o)) : scale);
    const needed = (scale: number) => {
      const height = (o: ResolvedObject) => o.box.h * yields(o, scale);
      return stackReach(root.id, "above", stacking, height, together) + height(root) + stackReach(root.id, "below", stacking, height, together);
    };
    const room = floor - top - tighten;
    let scale = 1;
    if (needed(1) > room) {
      let [low, high] = [MIN_YIELD, 1];
      for (let step = 0; step < 24; step++) {
        const mid = (low + high) / 2;
        if (needed(mid) <= room) low = mid;
        else high = mid;
      }
      scale = low;
    }
    if (scale < 1) {
      const shrinking = [root, ...members].filter((o) => !wording(o.source));
      const riders = objects.filter((o) => !o.compositeParent && !wording(o.source) && !shrinking.includes(o) && shrinking.some((one) => rides(o, one)));
      for (const one of [...shrinking, ...riders]) {
        const by = yields(one, scale);
        one.size *= by;
        one.box = makeBox(one.position, [one.box.w * by, one.box.h * by]);
      }
    }
    const height = (o: ResolvedObject) => o.box.h;
    const up = stackReach(root.id, "above", stacking, height, together);
    const first = top + Math.max(0, (room - needed(1)) / 2);
    root.position = [root.position[0], first + up + root.box.h / 2];
    root.box = makeBox(root.position, [root.box.w, root.box.h]);
  }
  return any;
}

/**
 * Pictures set one beside another share the frame's width. A row that does not fit is shrunk together
 * and centred, so none is clamped onto another. (Stacked ones are fitted by `fitColumns`.)
 */
function fitStacks(objects: ResolvedObject[], byId: Map<string, ResolvedObject>, together: (a: string, b: string) => boolean): void {
  const picture = (o: ResolvedObject | undefined) => o !== undefined && (o.source.kind === "image" || o.source.kind === "svg-artwork");
  // A chart, diagram or card set beside a picture shares the screen with it the same way.
  const companionKind = (o: ResolvedObject) => picture(o) || (PICTURE_KINDS.has(o.source.kind) && o.source.kind !== "timeline");
  // Fitted one companion at a time, the soldiers set left of the king were moved round to his right.
  const rows = new Map<ResolvedObject, ResolvedObject[]>();
  for (const companion of objects) {
    const placement = companion.source.placement;
    // Set near, on or inside the picture, a companion rides on it and takes none of its room.
    if (!companionKind(companion) || placement?.mode !== "relative" || !["left-of", "right-of"].includes(placement.relation)) continue;
    const base = byId.get(parseTarget(placement.target, new Set(byId.keys())).objectId);
    if (!base || !picture(base) || base.source.placement?.mode === "relative") continue;
    rows.set(base, [...(rows.get(base) ?? []), companion]);
  }
  for (const [base, companions] of rows) {
    // Companions taking turns beside it share one place: each side takes the room of the most shown on it at
    // once. Summed, a float, a clock and a compass shown one after another shrank the ship to half its width.
    const leftOf = (one: ResolvedObject) => one.source.placement?.mode === "relative" && one.source.placement.relation === "left-of";
    const shownWith = (one: ResolvedObject) => companions.filter((other) => other === one || together(other.id, one.id));
    const side = (left: boolean, by: (one: ResolvedObject) => number) =>
      Math.max(0, ...companions.map((one) => shownWith(one).filter((other) => leftOf(other) === left).reduce((sum, other) => sum + by(other) + BESIDE_GAP, 0)));
    const room = FRAME_MAX_X - FRAME_MIN_X;
    const scale = Math.min(1, room / (base.box.w + side(true, (one) => one.box.w) + side(false, (one) => one.box.w)));
    // A card keeps its writing's size; the picture gives the room it cannot.
    const owns = new Map(companions.map((one) => [one, Math.max(scale, Math.min(1, leastScale(one)))]));
    const kept = side(true, (one) => one.box.w * owns.get(one)!) + side(false, (one) => one.box.w * owns.get(one)!);
    const rest = Math.min(1, Math.max(MIN_YIELD * scale, (room - kept) / base.box.w));
    for (const [one, by] of [[base, rest] as const, ...owns]) {
      one.size *= by;
      one.box = makeBox(one.position, [one.box.w * by, one.box.h * by]);
    }
    const [before, after] = [side(true, (one) => one.box.w), side(false, (one) => one.box.w)];
    const first = FRAME_MIN_X + Math.max(0, (room - before - base.box.w - after) / 2);
    base.position = [first + before + base.box.w / 2, base.position[1]];
    base.box = makeBox(base.position, [base.box.w, base.box.h]);
  }
}

/** What is laid in a zone of the main area with `object` while it is on screen: the pictures, charts and cards it shares the screen with. */
function companionsOf(objects: ResolvedObject[], object: ResolvedObject, together: (a: string, b: string) => boolean): ResolvedObject[] {
  return objects.filter((one) => {
    const laid = bearing(one.source) === undefined;
    const shares = PICTURE_KINDS.has(one.source.kind) || one.rank !== undefined;
    return one !== object && laid && shares && !backdrop(one.source) && together(one.id, object.id) && ["main", "main-left", "main-right", "support", "footer"].includes(defaultZone(one.source));
  });
}

/** Whether a thing shares a column of the screen with a box, so that one sits above the other. */
const columnOf = (box: ResolvedBox, one: ResolvedObject) => Math.min(box.x + box.w, one.box.x + one.box.w) - Math.max(box.x, one.box.x) > 1;

/** The smallest a companion may be drawn to make room: a card or chart keeps its writing's size; a picture yields so far. */
const leastScale = (one: ResolvedObject) => (YIELDED_TO.has(one.source.kind) ? 0.9 : MIN_YIELD);

/** For a thing set on one side of `id` (above, below, left or right), the share of its size the frame leaves it on that side of `box`; else Infinity. */
function sideRoom(box: ResolvedBox, one: ResolvedObject, id: string, stripFloor?: number): number {
  const placement = one.source.placement;
  if (placement?.mode !== "relative" || placement.target !== id || !(PICTURE_KINDS.has(one.source.kind) || one.rank !== undefined)) return Infinity;
  const top = Math.max(FRAME_MIN, stripFloor === undefined ? FRAME_MIN : stripFloor + BESIDE_GAP);
  const room = { above: box.y - BESIDE_GAP - top, below: FRAME_MAX_Y - (box.y + box.h + BESIDE_GAP), "left-of": box.x - BESIDE_GAP - FRAME_MIN_X, "right-of": FRAME_MAX_X - (box.x + box.w + BESIDE_GAP) } as Record<string, number>;
  const length = placement.relation === "above" || placement.relation === "below" ? one.box.h : one.box.w;
  return placement.relation in room ? room[placement.relation] / Math.max(1, length) : Infinity;
}

/** The band of the frame above or below `box` with the more room, and the scale a companion takes to fit in it. */
function bandBeside(box: ResolvedBox, one: ResolvedObject, stripFloor?: number): { start: number; end: number; scale: number } {
  const top = Math.max(FRAME_MIN, stripFloor === undefined ? FRAME_MIN : stripFloor + BESIDE_GAP);
  const bands: [number, number][] = [[top, box.y - BESIDE_GAP], [box.y + box.h + BESIDE_GAP, FRAME_MAX_Y]];
  const [start, end] = bands.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  return { start, end, scale: Math.min(1, (end - start) / one.box.h, FIT_MAX_W / one.box.w) };
}

/**
 * A picture kept in the slot the scene before gave it does not make room for what this scene adds beside
 * it: a picture, chart or card laid in a zone over it moves into the larger band of the frame left above
 * or below it, shrunk to fit there (the hold is given up beforehand when it would not fit readably).
 */
function fitAroundHeld(objects: ResolvedObject[], byId: Map<string, ResolvedObject>, held: Map<string, Point>, together: (a: string, b: string) => boolean, stripFloor?: number): void {
  const kept = objects.filter((o) => held.has(o.id) && (PICTURE_KINDS.has(o.source.kind) || o.rank !== undefined));
  for (const picture of kept) {
    for (const companion of companionsOf(objects, picture, together)) {
      if (held.has(companion.id) || !overlapping(picture.box, companion.box)) continue;
      const { start, end, scale } = bandBeside(picture.box, companion, stripFloor);
      if (scale <= 0) continue;
      const [w, h] = [companion.box.w * scale, companion.box.h * scale];
      const dy = (start + end) / 2 - companion.position[1];
      companion.size *= scale;
      companion.position = [companion.position[0], (start + end) / 2];
      companion.box = makeBox(companion.position, [w, h]);
      coverPieces(companion);
      for (const other of objects) {
        if (other === companion || topOwner(other.source.placement && other.source.placement.mode !== "zone" ? other.source.placement.target : other.id, byId) !== companion.id) continue;
        other.position = [other.position[0], other.position[1] + dy];
        other.box = makeBox(other.position, [other.box.w, other.box.h]);
      }
    }
  }
}

const overlapping = (a: ResolvedBox, b: ResolvedBox) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

/** A path of its own (not laid between two things, not drawn in a frame) walked by a traveller: a route, measured by its own numbers rather than ranked as a picture. */
function walkedRoute(scene: SceneSpec, source: ObjectSpec): boolean {
  return (
    source.kind === "path" &&
    source.from === undefined &&
    source.in === undefined &&
    scene.beats.some((beat) => beat.actions.some((action) => action.do === "motion" && action.motion === "along" && action.along === source.id))
  );
}

// A route's grid is the screen's: 1000 units across its width, the same units down, so its length is what its numbers say.
const SCREEN_UNIT = VIEW_WIDTH / 1000;

/** The box a walked route takes: its own numbers on the screen's grid. */
function routeExtent(scene: SceneSpec, source: ObjectSpec): [number, number] | undefined {
  if (source.kind !== "path" || !walkedRoute(scene, source)) return undefined;
  const bounds = pathBounds([source.d, ...morphShapes(scene, source)].flatMap((d) => parsePath(d).segs));
  return bounds ? [Math.max(1, bounds.w * SCREEN_UNIT), Math.max(1, bounds.h * SCREEN_UNIT)] : undefined;
}

// A mover never shrinks below this to keep its journey in view.
const MIN_TRAVEL_SCALE = 0.5;

/**
 * A thing sent somewhere is sized and set so the whole of its journey is seen: every way its own moves
 * and routes take it from where it rests, added up journey after journey, is room kept for it in the
 * frame, and it shrinks (never below half) until that room fits. Sized for the band it rests in, a
 * bicycle filling the screen had no room to ride, and its moves were refused. Only things laid in a zone
 * are known here; a thing set on another is sized by what it is set on.
 */
function reserveJourneys(scene: SceneSpec, objects: ResolvedObject[], byId: Map<string, ResolvedObject>): void {
  const laid = (id: string) => {
    const source = byId.get(id)?.source;
    return source !== undefined && !source.attach && (source.placement === undefined || source.placement.mode === "zone") && !backdrop(source);
  };
  const world = journeyWorld(scene, objects, byId, () => true);
  // Every journey, and the moves alone: a route of its own too long for the frame is shortened where it is
  // walked, so only one that fits is room worth shrinking for.
  type Ledger = Map<string, { at: Point; reach: Reach }>;
  const [all, moves]: [Ledger, Ledger] = [new Map(), new Map()];
  const go = (ledger: Ledger, id: string, offsets: Point[]) => {
    const { at, reach } = ledger.get(id) ?? { at: [0, 0] as Point, reach: { left: 0, right: 0, up: 0, down: 0 } };
    for (const [dx, dy] of offsets) {
      const [x, y] = [at[0] + dx, at[1] + dy];
      reach.left = Math.max(reach.left, -x);
      reach.right = Math.max(reach.right, x);
      reach.up = Math.max(reach.up, -y);
      reach.down = Math.max(reach.down, y);
    }
    const last = offsets.at(-1) ?? [0, 0];
    ledger.set(id, { at: [at[0] + last[0], at[1] + last[1]], reach });
  };
  const journeys = planJourneys(scene, world, laid);
  for (const action of scene.beats.flatMap((beat) => beat.actions)) {
    if (action.do !== "motion") continue;
    const journey = journeys.get(action);
    const shift: Point[] = journey?.wanted ? [[journey.wanted[0] - journey.from[0], journey.wanted[1] - journey.from[1]]] : [];
    // What rides with a mover goes as far: a block hauled on a sledge sets off from where the sledge left it.
    const riders = [...(action.motion === "move" || action.motion === "fall" ? (action.with ?? []) : []), action.target].filter(laid);
    if (shift.length > 0) for (const id of riders) [all, moves].forEach((ledger) => go(ledger, id, shift));
    if (!laid(action.target)) continue;
    const route = action.motion === "along" && action.along ? byId.get(action.along) : undefined;
    if (!route || !walkedRoute(scene, route.source)) continue;
    const course = flattenPath(drawnSegs(route))[0]?.points.map(([x, y]): Point => [x, y]);
    if (!course || course.length < 2) continue;
    const walked = walkedBackward(route.source, course, byId.get(action.target)!.position) ? [...course].reverse() : course;
    go(all, action.target, walked.map(([x, y]): Point => [x - walked[0][0], y - walked[0][1]]));
  }
  for (const [id, { reach: whole }] of all) {
    const mover = byId.get(id)!;
    const frame = world.frame(id);
    const [roomW, roomH] = [Math.min(frame.w, FRAME_MAX_X - FRAME_MIN_X), frame.h];
    const scaleFor = (reach: Reach) => Math.min(1, (roomW - reach.left - reach.right) / mover.box.w, (roomH - reach.up - reach.down) / mover.box.h);
    const own = moves.get(id)?.reach;
    const reach = scaleFor(whole) >= MIN_TRAVEL_SCALE ? whole : own;
    if (!reach || reach.left + reach.right + reach.up + reach.down < 1) continue;
    mover.reach = reach;
    const scale = Math.max(MIN_TRAVEL_SCALE, scaleFor(reach));
    if (scale >= 1) continue;
    mover.size *= scale;
    mover.box = makeBox(mover.position, [mover.box.w * scale, mover.box.h * scale]);
  }
}

/** The scale at which a box, with the room its journeys take each way, just fits in the safe frame. */
function travelScale(box: ResolvedBox, reach: Reach): number {
  return Math.min((FRAME_MAX_X - FRAME_MIN_X - reach.left - reach.right) / box.w, (FRAME_MAX_Y - FRAME_MIN - reach.up - reach.down) / box.h);
}

/** Whether a box, with the room its journeys take each way, fits in the safe frame. */
function reachFits(box: ResolvedBox, reach: Reach | undefined): boolean {
  if (!reach) return true;
  return box.w + reach.left + reach.right <= FRAME_MAX_X - FRAME_MIN_X + 0.5 && box.h + reach.up + reach.down <= FRAME_MAX_Y - FRAME_MIN + 0.5;
}

/** Whether an object is drawn in a frame (`in`) rather than placed. */
function drawnIn(source: ObjectSpec): boolean {
  return (source.kind === "path" || source.kind === "text" || source.kind === "equation") && source.in !== undefined;
}

type FrameSetter = { kind: "grid"; owner: string } | { kind: "handle"; owner: string; handle: string } | { kind: "box"; ref: string };

/** What sets the frame `ref` names: a path's own grid, one of a figure's corners or sides, or any other thing's box. */
function frameSetter(ref: string, specs: Map<string, ObjectSpec>): FrameSetter {
  const owner = specs.get(ref);
  if (owner?.kind === "path" && owner.from === undefined) return { kind: "grid", owner: ref };
  const dot = anchorDot(ref);
  const named = dot > 0 ? specs.get(ref.slice(0, dot)) : undefined;
  const handle = ref.slice(dot + 1);
  if (named?.kind === "path" && named.from === undefined && parseHandle(handle)) return { kind: "handle", owner: named.id, handle };
  return { kind: "box", ref };
}

const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `outer` after `inner`, as one map. */
function compose(outer: Affine, inner: Affine): Affine {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  };
}

const applied = (m: Affine) => (x: number, y: number): Point => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];

/** How a path's own d maps onto the grid of the figure it is a piece of: through the corner or side frame it is drawn in, or as written. */
function gridAffine(source: ObjectSpec, specs: Map<string, ObjectSpec>, seen = new Set<string>()): Affine {
  if (source.kind !== "path" || source.in === undefined || seen.has(source.id)) return IDENTITY;
  const setter = frameSetter(source.in, specs);
  const owner = setter.kind === "handle" ? specs.get(setter.owner) : undefined;
  if (setter.kind !== "handle" || !owner) return IDENTITY;
  const figure = figureOf(gridSegs(owner, specs, new Set([...seen, source.id])));
  const frame = handleFrame(figure, figure.corners, setter.handle, 1);
  return frame ? { a: frame.x[0], b: frame.x[1], c: frame.y[0], d: frame.y[1], e: frame.o[0], f: frame.o[1] } : IDENTITY;
}

/** A path's segments on the grid of the figure it is a piece of. */
function gridSegs(source: ObjectSpec, specs: Map<string, ObjectSpec>, seen = new Set<string>()): PathSeg[] {
  if (source.kind !== "path") return [];
  return mapPath(parsePath(source.d).segs, applied(gridAffine(source, specs, seen)));
}

/**
 * The figure each path is a piece of: the path whose grid, corner or side its `in` names (that path's
 * own figure, when it is itself a piece), or else the first path set in the same zone. Paths written
 * into one zone are one drawing on one sheet; fitted one by one into boxes of their own, a triangle
 * and the line through its corner came out as two unrelated shapes.
 */
function figureFrames(objects: ObjectSpec[]): Map<string, string> {
  const specs = new Map(objects.map((source) => [source.id, source]));
  const zoned = new Map<string, string>();
  const firstInZone = new Map<ZoneToken, string>();
  for (const source of objects) {
    if (source.kind !== "path" || source.from !== undefined || source.in !== undefined) continue;
    if (source.placement !== undefined && source.placement.mode !== "zone") continue;
    const zone = defaultZone(source);
    const first = firstInZone.get(zone);
    if (first === undefined) firstInZone.set(zone, source.id);
    else zoned.set(source.id, first);
  }
  const root = (id: string, seen: Set<string>): string => {
    const source = specs.get(id);
    if (source?.kind !== "path" || seen.has(id)) return id;
    if (source.in === undefined) return zoned.get(id) ?? id;
    const setter = frameSetter(source.in, specs);
    return setter.kind === "box" ? id : root(setter.owner, new Set([...seen, id]));
  };
  const frames = new Map(zoned);
  for (const source of objects) {
    if (source.kind !== "path" || source.from !== undefined || source.in === undefined) continue;
    const setter = frameSetter(source.in, specs);
    if (setter.kind !== "box") frames.set(source.id, root(setter.owner, new Set([source.id])));
  }
  return frames;
}

/** The frame `ref` names, where it lies at rest, in view units. */
function viewFrame(ref: string, specs: Map<string, ObjectSpec>, byId: Map<string, ResolvedObject>): Frame | undefined {
  const setter = frameSetter(ref, specs);
  if (setter.kind === "grid") {
    const owner = byId.get(setter.owner);
    return owner && gridFrame(owner);
  }
  if (setter.kind === "handle") {
    const owner = byId.get(setter.owner);
    const figure = owner && figureAtRest(owner);
    return owner && figure ? handleFrame(figure, figure.corners, setter.handle, gridUnit(owner)) : undefined;
  }
  const box = resolveReferenceBox(ref, byId);
  return box && { o: [box.x, box.y], x: [box.w / 1000, 0], y: [0, box.h / 1000] };
}

/** Whether an object is drawn between two things rather than placed: a connector, or a curve given both ends. */
function laidBetween(source: ObjectSpec): boolean {
  return (
    joinsTwo(source) ||
    (source.kind === "curve" && source.from !== undefined && source.to !== undefined && source.placement?.mode !== "anchor")
  );
}

const wording = (source: ObjectSpec) => source.kind === "text" || source.kind === "equation" || source.kind === "measure";

/** What a thing is set on — the target of its attachment or placement — if anything. */
function bearing(source: ObjectSpec): string | undefined {
  return source.attach?.to ?? (source.placement?.mode === "relative" || source.placement?.mode === "anchor" ? source.placement.target : undefined);
}

/** What a thing stands, sits or is fixed on — attached, anchored, set on or inside it — if anything; never what it is only set beside. */
function groundedOn(object: ResolvedObject, byId: Map<string, ResolvedObject>): string | undefined {
  const placement = object.source.placement;
  if (object.source.attach) return object.source.attach.to;
  if (!placement || placement.mode === "zone") return undefined;
  return ["on", "inside", "anchor"].includes(relationFor(object, placement, byId)) ? placement.target : undefined;
}

/** What a thing is fixed on — anchored or attached to — if anything. */
function fixing(source: ObjectSpec | undefined): string | undefined {
  return source?.attach?.to ?? (source?.placement?.mode === "anchor" ? source.placement.target : undefined);
}

/** The top-level thing a reference belongs to: `map.france` belongs to `map`. */
function topOwner(reference: string, byId: Map<string, ResolvedObject>): string {
  const exact = byId.get(reference);
  if (exact) return exact.compositeParent ?? exact.id;
  return parseTarget(reference, new Set(byId.keys())).objectId;
}

/** Degrees clockwise a thing is set turned at the start, when it says; a vector turns by its own field. */
function ownTurn(source: ObjectSpec): number | undefined {
  return source.kind === "vector" ? undefined : source.rotate;
}

/** A point turned `degrees` clockwise about `centre`. */
function turnAbout(point: Point, centre: Point, degrees = 0): Point {
  if (!degrees) return point;
  const [dx, dy] = rotate([point[0] - centre[0], point[1] - centre[1]], degrees);
  return [centre[0] + dx, centre[1] + dy];
}

/** Degrees anticlockwise from right for a facing or a direction. */
function facingDegrees(facing: DirectionToken): number {
  const [x, y] = directionVector(facing);
  return (Math.atan2(-y, x) * 180) / Math.PI;
}

/** A picture part's traced border on screen, turned with its picture, or its box when it was never traced. */
function partShape(owner: ResolvedObject, name: string): Point[] | undefined {
  if (owner.source.kind !== "image") return undefined;
  const rect = owner.source.hotspots?.[name];
  const local: Array<[number, number]> | undefined =
    owner.source.outlines?.[name] ?? (rect ? [[rect[0], rect[1]], [rect[0] + rect[2], rect[1]], [rect[0] + rect[2], rect[1] + rect[3]], [rect[0], rect[1] + rect[3]]] : undefined);
  return local?.map(([x, y]) => turnAbout([owner.box.x + x * owner.box.w, owner.box.y + y * owner.box.h], owner.position, owner.turned));
}

/**
 * What a thing draws on screen, as the solver sees it: a picture's silhouette, a part's outline, a
 * stroke for a line or an open path, a region for a filled path (or any closed one, as a referent),
 * and a box for writing and everything else.
 */
function drawnShapes(object: ResolvedObject, closedIsArea = false): Drawn[] {
  const source = object.source;
  if (backdrop(source)) return [];
  if (object.kind === "image-hotspot") return [{ area: object.hotspot?.outline ?? boxPolygon(object.box) }];
  if (object.compositeParent) return [{ box: object.box }];
  if (source.kind === "image") return [{ area: silhouetteOn(object) ?? turnedBox(object) }];
  if ((source.kind === "line" || source.kind === "span") && object.endpoints) return [{ stroke: [object.endpoints.from, object.endpoints.to] }];
  // An angle draws only its mark at the vertex; its box spans the arms it names.
  if (source.kind === "angle" && object.endpoints) return [{ stroke: angleArc(object.position, object.endpoints.from, object.endpoints.to, ANGLE_REACH) }];
  if (source.kind === "path") {
    const filled = source.fill !== undefined && source.fill !== "none";
    return flattenPath(drawnSegs(object)).map((piece): Drawn => {
      const points = piece.points.map(([x, y]): Point => [x, y]);
      return piece.closed && (filled || closedIsArea) ? { area: points } : { stroke: piece.closed ? [...points, points[0]] : points };
    });
  }
  return object.turned ? [{ area: turnedBox(object) }] : [{ box: object.box }];
}

/** The drawn geometry and the point of whatever a reference names: a thing, a picture's part, a figure's side, a named point. */
function referent(reference: string, byId: Map<string, ResolvedObject>): Referent {
  const exact = byId.get(reference);
  if (exact) {
    const drawn = drawnShapes(exact, true);
    const area = drawn.length === 1 && "area" in drawn[0] ? drawn[0].area : undefined;
    return { drawn, point: area ? interiorPoint(area) : [...exact.position] };
  }
  const dot = anchorDot(reference);
  const owner = dot > 0 ? byId.get(reference.slice(0, dot)) : undefined;
  const name = reference.slice(dot + 1);
  const part = owner && partShape(owner, name);
  if (part) return { drawn: [{ area: part }], point: interiorPoint(part) };
  const figure = owner && figureAtRest(owner);
  const course = figure && handleCourse(figure, figure.corners, name);
  if (course && course.length > 1) return { drawn: [{ stroke: course.map(([x, y]): Point => [x, y]) }] };
  const point = resolveReference(reference, byId);
  const box = resolveReferenceBox(reference, byId);
  // A named point of a thing — a corner, an edge's middle — is where it is, with no extent to step off.
  return { drawn: [{ box: box && box !== owner?.box ? box : rectAt(point, [1, 1]) }], point };
}

/** Whether a reference is a region of a picture of a place: ground a figure stands on and a name is written on. */
function regionOfPlace(reference: string, byId: Map<string, ResolvedObject>): boolean {
  return aPlace(byId.get(topOwner(reference, byId))) && partOfPicture(reference, byId);
}

/** Whether a reference names one of a picture's own parts. */
function partOfPicture(reference: string, byId: Map<string, ResolvedObject>): boolean {
  const owner = byId.get(topOwner(reference, byId));
  return owner?.source.kind === "image" && reference.startsWith(`${owner.id}.`) && owner.source.hotspots?.[reference.slice(owner.id.length + 1)] !== undefined;
}

/**
 * The relation a placement asks of the solver: a picture anchored on, or near, a region of a place
 * stands on it; writing anchored on a picture's part is set beside it, so the part it names stays seen.
 */
function relationFor(object: ResolvedObject, placement: Exclude<NonNullable<ObjectSpec["placement"]>, { mode: "zone" }>, byId: Map<string, ResolvedObject>): Relation {
  const stands = object.source.kind === "image" && (regionOfPlace(placement.target, byId) || (object.travelsOn !== undefined && partOfPicture(placement.target, byId) && topOwner(placement.target, byId) === object.travelsOn));
  if (placement.mode === "anchor") return stands ? "on" : wording(object.source) && partOfPicture(placement.target, byId) ? "near" : "anchor";
  return placement.relation === "near" && stands ? "on" : placement.relation;
}

// Beside a part or a stroke, whose edge is itself the thing named.
const EDGE_GAP = 10;

/** How far off its referent a thing keeps: as asked, else close by a part's or a stroke's edge, which is itself the thing named. */
function gapFor(placement: ObjectSpec["placement"], target: Referent): number {
  if (placement?.mode === "relative" && placement.gap !== undefined) return placement.gap;
  const fine = placement !== undefined && placement.mode !== "zone" && (anchorDot(placement.target) > 0 || target.drawn.every((one) => "stroke" in one));
  return fine ? EDGE_GAP : BESIDE_GAP;
}

const ARROWS: ReadonlySet<ObjectSpec["kind"]> = new Set(["line", "curve", "path"]);
// Writing set on a side of a thing that has to go further than this to find room there takes a much closer spot round it.
const WRITING_STAYS = BESIDE_REACH * 2;
const FRAME: Rect = { x: FRAME_MIN_X, y: FRAME_MIN, w: FRAME_MAX_X - FRAME_MIN_X, h: FRAME_MAX_Y - FRAME_MIN };
// Writing with nowhere clear shrinks by these steps, never below the smallest readable size.
const SHRINKS = [0.85, 0.72];

/** The regions of a place that are drawn land, but the one named: the rest of it is open to write on. */
function placeRegions(place: ResolvedObject, except?: string): Drawn[] {
  if (place.source.kind !== "image" || !place.source.hotspots || Object.keys(place.source.hotspots).length === 0) return [{ area: turnedBox(place) }];
  return Object.keys(place.source.hotspots).flatMap((name) => (name === except ? [] : [{ area: partShape(place, name)! }]));
}

/**
 * The drawn things `object` keeps off: everything on screen with it but what it is set on and what is
 * set on it. Set beside a part of a picture, the rest of that picture is in the way — its other regions
 * on a place, its whole cut-out otherwise; set on or inside something, that thing is its ground.
 */
function sceneObstacles(
  object: ResolvedObject,
  objects: ResolvedObject[],
  byId: Map<string, ResolvedObject>,
  together: (a: string, b: string) => boolean,
  attached: (a: ResolvedObject, b: ResolvedObject) => boolean,
  relation?: Relation,
  reference?: string,
): Drawn[] {
  const owner = reference === undefined ? undefined : byId.get(topOwner(reference, byId));
  const ground = relation === "on" || relation === "inside" || relation === "anchor";
  const joins = (other: ResolvedObject) => [ "from" in other.source ? other.source.from : undefined, "to" in other.source ? other.source.to : undefined].some((end) => typeof end === "string" && topOwner(end, byId) === object.id);
  return objects.flatMap((other): Drawn[] => {
    if (other === object || other.compositeParent || backdrop(other.source) || !together(other.id, object.id) || attached(other, object) || joins(other)) return [];
    if (other === owner) {
      if (ground || reference === other.id) return [];
      return aPlace(other) ? placeRegions(other, reference!.slice(other.id.length + 1)) : drawnShapes(other);
    }
    if (attached(object, other)) return [];
    // Writing keeps off the whole of a picture it is not set on, a place's open ground too: a figure may stand there, a caption is not written there.
    return aPlace(other) && !wording(object.source) ? placeRegions(other) : drawnShapes(other);
  });
}

// A join between two parts of one picture shorter than this share of the way between their middles is a stub.
const STUB_SHARE = 0.25;
// The shortest connector a phone shows as one: a tenth of the screen's width.
const READABLE_LINK = VIEW_WIDTH / 10;

/** Where an object placed on or beside another sits: the solver's spot for the relation, off `obstacles`. */
function beside(object: ResolvedObject, placement: NonNullable<ObjectSpec["placement"]>, byId: Map<string, ResolvedObject>, obstacles: Drawn[], between = 0): Point {
  if (placement.mode === "zone") return object.position;
  const target = referent(placement.target, byId);
  const narrows = placement.mode === "relative" && placement.gap !== undefined;
  return placeBeside(target, [object.box.w, object.box.h], obstacles, relationFor(object, placement, byId), { frame: FRAME, gap: gapFor(placement, target) + between, narrows }).at;
}

/**
 * A thing sized against another that would run past the frame at that size shrinks the thing its size comes
 * from (the first of a chain of them) instead, so the stated sizes hold: fitted alone, a ship stated eight
 * times a coin's width came out the coin's size.
 */
function keepStatedSizesInFrame(objects: ResolvedObject[], byId: Map<string, ResolvedObject>, together: (a: string, b: string) => boolean): void {
  const sizedFrom = (object: ResolvedObject) => {
    const like = typeof object.source.size === "object" ? object.source.size : undefined;
    const other = like && byId.get(topOwner(like.like, byId));
    return like && other && other !== object && together(object.id, other.id) ? { like, other } : undefined;
  };
  for (const object of objects) {
    const from = sizedFrom(object);
    const other = from && boundsOf(referent(from.like.like, byId).drawn);
    const own = from && boundsOf(drawnShapes({ ...object, turned: undefined }));
    if (!from || !other || !own || own.w <= 0 || own.h <= 0) continue;
    // The box it would be laid in, which is wider than its drawing by the room round it.
    const grow = from.like.dimension === "height" ? ((from.like.times ?? 1) * other.h) / own.h : ((from.like.times ?? 1) * other.w) / own.w;
    const scale = Math.min(1, FIT_MAX_W / (object.box.w * grow), FIT_MAX_H / (object.box.h * grow));
    if (scale >= 0.999) continue;
    let root = from.other;
    for (const seen = new Set([object.id]); sizedFrom(root) && !seen.has(root.id); ) {
      seen.add(root.id);
      root = sizedFrom(root)!.other;
    }
    root.size *= scale;
    root.box = makeBox(root.position, [root.box.w * scale, root.box.h * scale]);
  }
}

// A size stated against another thing holds while it is drawn within this share of it.
const LIKE_TOLERANCE = 0.02;

/** How far a thing's drawn size is from the size stated against another, as a share of the stated size; undefined when either has none. */
function likeMiss(object: ResolvedObject, like: RelativeSizeSpec, byId: Map<string, ResolvedObject>): number | undefined {
  const other = boundsOf(referent(like.like, byId).drawn);
  const own = boundsOf(drawnShapes({ ...object, turned: undefined }));
  if (!other || !own) return undefined;
  const [wanted, got] = like.dimension === "height" ? [other.h, own.h] : [other.w, own.w];
  return wanted > 0 ? Math.abs(got / ((like.times ?? 1) * wanted) - 1) : undefined;
}

/** Sets a thing's size from another's: its drawn width (or height) `times` that thing's drawn width (or height). */
function sizeLike(object: ResolvedObject, like: RelativeSizeSpec, byId: Map<string, ResolvedObject>, shown: boolean): void {
  const other = boundsOf(referent(like.like, byId).drawn);
  const own = boundsOf(drawnShapes({ ...object, turned: undefined }));
  if (!other || !own || own.w <= 0 || own.h <= 0) return;
  const tall = like.dimension === "height";
  const wanted = (like.times ?? 1) * (tall ? other.h : other.w);
  const asked = Math.min(wanted / (tall ? own.h : own.w), FIT_MAX_W / object.box.w, FIT_MAX_H / object.box.h);
  // The room its journeys were given stays kept: sized like a crew member, a sledge filled the width it was to be hauled across.
  const scale = object.reach ? Math.min(asked, Math.max(asked * MIN_TRAVEL_SCALE, travelScale(object.box, object.reach))) : asked;
  if (!Number.isFinite(scale) || scale <= 0) return;
  object.size *= scale;
  object.box = makeBox(object.position, [object.box.w * scale, object.box.h * scale]);
  object.raised = undefined;
  object.closeUp = undefined;
  const whole = byId.get(topOwner(like.like, byId));
  if (shown && whole) keepReadable(object, Math.max(whole.box.w, whole.box.h) * CARRIED_MOST, true);
  else keepReadable(object);
}

/** The picture a thing is fixed on, through every attachment, or the thing itself when it is fixed on none. */
function fixtureRoot(object: ResolvedObject, byId: Map<string, ResolvedObject>): ResolvedObject {
  const seen = new Set<string>();
  let root = object;
  while (root.source.attach && !seen.has(root.id)) {
    seen.add(root.id);
    const host = byId.get(topOwner(root.source.attach.to, byId));
    if (!host || host === root) break;
    root = host;
  }
  return root;
}

/** The picture `object` is attached to, when both are pictures. */
function pictureHost(object: ResolvedObject, byId: Map<string, ResolvedObject>): ResolvedObject | undefined {
  const attach = object.source.attach;
  const host = attach && byId.get(topOwner(attach.to, byId));
  return object.source.kind === "image" && host && host !== object && host.source.kind === "image" ? host : undefined;
}

/** A picture's bounds as drawn now, upright. */
function uprightBounds(object: ResolvedObject): Rect | undefined {
  return boundsOf(drawnShapes({ ...object, turned: undefined }));
}

/** Key under which a film remembers how wide a fixed picture is beside its host. */
const shareKey = (object: ResolvedObject, host: ResolvedObject) => `${object.id}@${host.id}`;

/**
 * A picture fixed on another is drawn at its host's scale: the share of the host's width the film last
 * gave the pair, else the share their size words give, and never wider or taller than the host itself.
 * Sized on its own, wings fixed on a bee shrunk beside a comb came out bigger than the bee.
 */
function sizeOnHost(object: ResolvedObject, host: ResolvedObject, remembered: number | undefined): void {
  const [source, hosting] = [object.source, host.source];
  const [own, bearer] = [uprightBounds(object), uprightBounds(host)];
  if (source.kind !== "image" || hosting.kind !== "image" || !own || !bearer || own.w <= 0 || own.h <= 0 || bearer.w <= 0) return;
  const words = shapedBox(ARTWORK_EXTENTS[defaultSize(source)], imageAspect(source) ?? 1)[0] / shapedBox(ARTWORK_EXTENTS[defaultSize(hosting)], imageAspect(hosting) ?? 1)[0];
  const share = typeof source.size === "string" || remembered === undefined ? words : remembered;
  const scale = Math.min((share * bearer.w) / own.w, bearer.w / own.w, bearer.h / own.h);
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 1e-3) return;
  object.size *= scale;
  object.box = makeBox(object.position, [object.box.w * scale, object.box.h * scale]);
}

/** How wide each picture fixed on a picture is drawn, as a share of its host's width. */
function fixtureShares(objects: ResolvedObject[]): [string, number][] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  return objects.flatMap((object): [string, number][] => {
    const host = pictureHost(object, byId);
    const [own, bearer] = [uprightBounds(object), host && uprightBounds(host)];
    return host && own && bearer && bearer.w > 0 ? [[shareKey(object, host), own.w / bearer.w]] : [];
  });
}

/** A card laid out from what it holds covers at least what its pieces draw: narrowed past them, its box grows back to them about its centre. */
function coverPieces(object: ResolvedObject): void {
  if (object.compositeParent || !PANELS.has(object.source.kind)) return;
  const pieces = figurePlan(object.source, object.box.w, object.box.h).pieces;
  if (pieces.length === 0) return;
  const halfW = Math.max(object.box.w / 2, ...pieces.map(({ box }) => Math.max(-box.x, box.x + box.w)));
  const halfH = Math.max(object.box.h / 2, ...pieces.map(({ box }) => Math.max(-box.y, box.y + box.h)));
  if (halfW <= object.box.w / 2 + 0.5 && halfH <= object.box.h / 2 + 0.5) return;
  object.box = makeBox(object.position, [halfW * 2, halfH * 2]);
}

// The least a drawn picture's longer side may be: a sixth of the screen's width. Smaller, a page or a
// letter drawn beside its subject came out a speck no one could make out on a phone.
const READABLE_PICTURE = Math.round(VIEW_WIDTH / 6);

// A picture sized against a thing shown with it keeps that size down to this; smaller, it is drawn readable as a close-up.
const STATED_FLOOR = READABLE_PICTURE / 2;
// A picture raised past the size stated for it by more than this is drawn as a close-up, ringed, so it is not read as to scale.
const CLOSE_UP_RAISE = 1.25;

/**
 * A drawn picture too small to make out grows about its centre to the smallest size that reads, never past
 * `most`, the size that keeps it smaller than what it is measured against. One whose size is `stated` against
 * a thing on screen with it keeps that size unless it would be a speck, and then grows as a close-up, ringed:
 * floored alone, a coin the size of a saver's hand came out wider than the saver, and a worker stated at a
 * fifth of a pyramid's height half again as tall.
 */
function keepReadable(object: ResolvedObject, most = Infinity, stated = false): void {
  if (!DRAWINGS.has(object.source.kind) || backdrop(object.source) || object.compositeParent) return;
  const longer = Math.max(object.box.w, object.box.h);
  const reached = Math.min(READABLE_PICTURE, most);
  if (longer <= 0 || reached <= longer || (stated && longer >= STATED_FLOOR)) return;
  const scale = reached / longer;
  object.size *= scale;
  object.box = makeBox(object.position, [object.box.w * scale, object.box.h * scale]);
  object.raised = true;
  if (stated && scale > CLOSE_UP_RAISE) object.closeUp = true;
}

/**
 * Every picture kept readable, the larger first, each never raised past what it is measured against: floored
 * one by one, a ship on a map stayed smaller than the flea beside it, and a flea came out the rat's size.
 */
function keepReadableInScale(objects: ResolvedObject[], partnersOf: (id: string) => (ScalePartner & { sibling: boolean })[]): void {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const longer = (object: ResolvedObject) => Math.max(object.box.w, object.box.h);
  // A thing carried on the same one as it holds it back only once floored itself, the larger first.
  const floored = new Set<string>();
  for (const object of [...objects].sort((a, b) => longer(b) - longer(a))) {
    floored.add(object.id);
    if (typeof object.source.size === "object") continue;
    const limits = partnersOf(object.id).flatMap((one) => {
      const other = byId.get(one.id);
      if (!other || typeof other.source.size === "object" || (one.sibling && !floored.has(one.id))) return [];
      return [longer(other) * (one.carried ? CARRIED_MOST : 1)];
    });
    keepReadable(object, Math.min(...limits));
  }
}

const EDGE_UNITS: Record<EdgeToken, Point> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0], center: [0, 0] };

/** Where a thing's own edge or part lies from its centre, before it is turned. */
function selfPoint(object: ResolvedObject, self: string): Point {
  const flat = { ...object, turned: undefined };
  const drawn = drawnShapes(flat, true);
  const middle = referentPoint({ drawn });
  const edge = EDGE_UNITS[self as EdgeToken];
  const part = edge ? undefined : partShape(flat, self);
  const point = edge ? (self === "center" ? middle : edgePoint(drawn, edge, middle)) : part ? interiorPoint(part) : middle;
  return [point[0] - object.position[0], point[1] - object.position[1]];
}

/** Sets a thing so its own point `self` lies on `to`'s point `at`, edges read in the turned frame of what `to` belongs to, which it turns with. */
function attachTo(object: ResolvedObject, attach: AttachSpec, byId: Map<string, ResolvedObject>): void {
  const turn = byId.get(topOwner(attach.to, byId))?.turned ?? 0;
  const turned = (ownTurn(object.source) ?? 0) + turn;
  if (turned) object.turned = turned;
  const target = referent(attach.to, byId);
  const middle = referentPoint(target);
  const at = attach.at === "center" ? middle : edgePoint(target.drawn, rotate(EDGE_UNITS[attach.at], turn), middle);
  const [dx, dy] = rotate(selfPoint(object, attach.self), turned);
  object.position = [at[0] - dx, at[1] - dy];
  object.box = makeBox(object.position, [object.box.w, object.box.h]);
}

/** Where a connector meets a thing: its drawn edge toward the other end, or the middle of a stroke. */
function meeting(target: Referent, middle: Point, toward: Point): Point {
  if (target.drawn.every((one) => "stroke" in one)) return middle;
  const length = Math.hypot(toward[0] - middle[0], toward[1] - middle[1]);
  return length < 1e-6 ? middle : edgePoint(target.drawn, [(toward[0] - middle[0]) / length, (toward[1] - middle[1]) / length], middle);
}

// Drawn edges this close touch: two regions of one map share a border.
const TOUCH = 3;

/** Whether two drawn things overlap or touch. */
function touching(a: Drawn[], b: Drawn[]): boolean {
  const corners = (drawn: Drawn[]) => drawn.flatMap((one) => ("box" in one ? boxPolygon(one.box) : "area" in one ? one.area : []));
  const [pa, pb] = [corners(a), corners(b)];
  if (pa.length === 0 || pb.length === 0) return false;
  return pa.some((point) => b.some((one) => meets(one, rectAt(point, [TOUCH * 2, TOUCH * 2])))) || pb.some((point) => a.some((one) => meets(one, rectAt(point, [TOUCH * 2, TOUCH * 2]))));
}

/**
 * Whether a route is walked from its last point back to its first: an arrow says which way it goes and
 * is never walked head first; an unmarked route is entered at the end nearer the traveller.
 */
export function walkedBackward(source: ObjectSpec, points: Point[], rider: Point): boolean {
  const arrow = source.kind === "path" || source.kind === "line" ? source.arrow : undefined;
  if (arrow === "end") return false;
  if (arrow === "start") return true;
  const [head, tail] = [points[0], points[points.length - 1]];
  return Math.hypot(rider[0] - tail[0], rider[1] - tail[1]) < Math.hypot(rider[0] - head[0], rider[1] - head[1]);
}

/** Where a thing's base is, before it is turned: what a standing thing is carried by. */
function feet(object: ResolvedObject): Point {
  return [object.position[0], object.position[1] + object.box.h / 2];
}

/** A route's two ends in the order it is walked, as the centre of its walker passes them. */
function walkedEnds(route: ResolvedObject | undefined, rider: ResolvedObject | undefined): [Point, Point] | undefined {
  if (!route || !rider) return undefined;
  const points: Point[] | undefined =
    route.source.kind === "path"
      ? flattenPath(drawnSegs(route))[0]?.points.map(([x, y]): Point => [x, y])
      : (route.source.kind === "line" || route.source.kind === "span") && route.endpoints
        ? [route.endpoints.from, route.endpoints.to]
        : undefined;
  if (!points || points.length < 2) return undefined;
  const lift = rider.stands ? rider.box.h / 2 : 0;
  const [head, tail] = [points[0], points[points.length - 1]].map(([x, y]): Point => [x, y - lift]);
  return walkedBackward(route.source, points, rider.stands ? feet(rider) : rider.position) ? [tail, head] : [head, tail];
}

// The bands of the screen a move to a zone is counted between.
const BANDS: readonly ZoneToken[] = ["main", "main-left", "main-right", "support", "footer", "strip"];

/** Where a mover sent to `reference` stops: in its middle for `land: "centre"`, standing on a region of a place, else against its drawn edge on the side it comes from. */
function landing(mover: ResolvedObject, at: Point, reference: string, land: "surface" | "centre" | undefined, byId: Map<string, ResolvedObject>, others: Drawn[]): Point | undefined {
  if (!byId.has(topOwner(reference, byId))) return undefined;
  const target = referent(reference, byId);
  const middle = referentPoint(target);
  // Sent to a place on itself (a rocket to its own nose), a thing moves the way that place lies from its centre.
  if (reference.startsWith(`${mover.id}.`)) return [at[0] + middle[0] - mover.position[0], at[1] + middle[1] - mover.position[1]];
  if (land === "centre") return middle;
  const [w, h] = [mover.box.w, mover.box.h];
  if (mover.source.kind === "image" && regionOfPlace(reference, byId)) return placeBeside(target, [w, h], others, "on", { frame: FRAME }).at;
  const edge = edgeLanding(target, middle, at, [w, h]);
  // Already reaching over the edge it would land against, it would step back from where it was sent; it goes onto it.
  return (edge[0] - at[0]) * (middle[0] - at[0]) + (edge[1] - at[1]) * (middle[1] - at[1]) > 0 ? edge : middle;
}

/** Where a mover of `size` coming from `at` stops against a destination's drawn edge. */
function edgeLanding(target: Referent, middle: Point, at: Point, [w, h]: [number, number]): Point {
  const box = boundsOf(target.drawn) ?? rectAt(middle, [1, 1]);
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  // A thing already over (or beside) a broad destination comes straight onto it: a hammer and a feather
  // dropped side by side land side by side, not on the one spot at the ground's centre.
  if (Math.abs(at[0] - cx) <= box.w / 2) return [at[0], at[1] < cy ? box.y - h / 2 : box.y + box.h + h / 2];
  if (Math.abs(at[1] - cy) <= box.h / 2) return [at[0] < cx ? box.x - w / 2 : box.x + box.w + w / 2, at[1]];
  const length = Math.hypot(at[0] - middle[0], at[1] - middle[1]);
  if (length < 1e-6) return middle;
  const u: Point = [(at[0] - middle[0]) / length, (at[1] - middle[1]) / length];
  const edge = edgePoint(target.drawn, u, middle);
  const half = Math.min(w, h) / 2;
  return [edge[0] + u[0] * half, edge[1] + u[1] * half];
}

/** The laid-out scene as the journey planner asks about it. */
function journeyWorld(scene: SceneSpec, objects: ResolvedObject[], byId: Map<string, ResolvedObject>, related: (a: ResolvedObject, b: ResolvedObject) => boolean, shown: (id: string, beat: number) => boolean = () => true): JourneyWorld {
  const known = (reference: string) => byId.has(topOwner(reference, byId));
  const pictures = (mover: ResolvedObject, goal: string | undefined) =>
    objects.filter((other) => !other.compositeParent && other !== mover && other.id !== goal && other.source.kind === "image" && !aPlace(other) && !related(mover, other)).map((other) => ({ id: other.id, drawn: drawnShapes(other) }));
  return {
    frame: (id) => {
      const ceiling = Math.max(VIEW_INSET, ...objects.filter((one) => one.id !== id && !one.compositeParent && overhead(one.source)).map((one) => one.box.y + one.box.h + VIEW_INSET));
      return { x: VIEW_INSET, y: ceiling, w: VIEW_WIDTH - VIEW_INSET * 2, h: VIEW_HEIGHT - VIEW_INSET - ceiling };
    },
    rest: (id) => {
      const object = byId.get(id);
      return object && { at: [...object.position], size: [object.box.w, object.box.h] };
    },
    point: (reference) => (known(reference) ? referentPoint(referent(reference, byId)) : undefined),
    extent: (reference) => {
      const bounds = known(reference) ? boundsOf(referent(reference, byId).drawn) : undefined;
      return bounds && { w: bounds.w, h: bounds.h };
    },
    landing: (id, at, reference, land) => {
      const mover = byId.get(id);
      return mover && landing(mover, at, reference, land, byId, pictures(mover, undefined).flatMap((other) => other.drawn));
    },
    zone: (id) => {
      const source = byId.get(id)?.source;
      return source && !source.attach && (source.placement === undefined || source.placement.mode === "zone") ? defaultZone(source) : undefined;
    },
    zoneCentre: (zone) => zoneCentre(scene.composition, zone),
    bands: BANDS,
    facing: (id) => {
      const object = byId.get(id);
      const facing = object?.source.kind === "image" ? object.source.facing : undefined;
      return facing === undefined ? undefined : rotate(directionVector(facing), object?.turned ?? 0);
    },
    owner: (reference) => topOwner(reference, byId),
    obstacles: (id, destination, beat) => {
      const mover = byId.get(id);
      return mover ? pictures(mover, destination === undefined ? undefined : topOwner(destination, byId)).filter((other) => shown(other.id, beat)) : [];
    },
    route: (route, rider) => walkedEnds(byId.get(route), byId.get(rider)),
    walkedTo: (route, rider) => {
      const [line, walker] = [byId.get(route), byId.get(rider)];
      if (!line?.endpoints || !walker || !laidBetween(line.source)) return undefined;
      const { from, to } = line.source as { from: string; to: string };
      return walkedBackward(line.source, [line.endpoints.from, line.endpoints.to], walker.stands ? feet(walker) : walker.position) ? from : to;
    },
    ground: (id) => {
      const picture = byId.get(byId.get(id)?.travelsOn ?? "");
      return picture && { id: picture.id, drawn: drawnShapes(picture) };
    },
    carrier: (id) => {
      const fixed = fixing(byId.get(id)?.source);
      return fixed === undefined ? undefined : topOwner(fixed, byId);
    },
    related: (a, b) => {
      const [one, other] = [byId.get(a), byId.get(b)];
      return one !== undefined && other !== undefined && related(one, other);
    },
    shorten: (id, rider, share) => {
      const [route, walker] = [byId.get(id), byId.get(rider)];
      const start = walkedEnds(route, walker)?.[0];
      if (!route || !walker || !start || !walkedRoute(scene, route.source)) return false;
      // Its own numbers drew it; scaled about where it is walked from, it keeps its shape and its start.
      const base = walker.stands ? feet(walker) : start;
      route.box = { x: base[0] + (route.box.x - base[0]) * share, y: base[1] + (route.box.y - base[1]) * share, w: route.box.w * share, h: route.box.h * share };
      route.position = [route.box.x + route.box.w / 2, route.box.y + route.box.h / 2];
      return true;
    },
  };
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
    action.do === "speak" ||
    action.do === "motion" ||
    action.do === "attention" ||
    action.do === "effect" ||
    action.do === "emphasize" ||
    // A fill is the change being taught, so it takes the beat rather than a transition's worth of it.
    action.do === "fill"
      ? pace.duration
      : action.do === "aside"
        ? pace.transition * 2
        : pace.transition;
  return {
    kind: action.do,
    source: action,
    start,
    end: start + duration,
    duration,
  };
}

// A beat never plays faster than this share of its own pace, however little room its words leave it.
const MIN_SQUEEZE = 0.45;
// A silent beat after the voice has finished is a moment to look, so it is never over before the eye lands.
const SILENT_HOLD = 0.6;

/** How long a beat's actions take at their own pace. */
function beatLength(actions: ActionSpec[], paceToken: PaceToken): number {
  const pace = resolvePace(paceToken)!;
  return Math.max(pace.duration, ...actions.map((action) => resolveAction(action, 0, paceToken).end));
}

/**
 * How much the run of beats from `from` up to the next spoken beat is shortened to end by that beat's
 * word, so a word is never shown late because the animation before it was long. A run holding a tour
 * or a camera move keeps its pace: their inner stops are not rescaled.
 */
function runSqueeze(
  natural: number[],
  dues: (number | undefined)[],
  from: number,
  start: number,
  beats: SceneSpec["beats"],
): number {
  const next = dues.findIndex((due, index) => index > from && due !== undefined);
  if (next === -1) return 1;
  const run = natural.slice(from, next).reduce((sum, length) => sum + length, 0);
  const room = dues[next]! - start;
  const moving = beats.slice(from, next).some((beat) => beat.actions.some((action) => action.do === "tour" || action.do === "camera"));
  if (run <= room || moving || room <= 0) return 1;
  return Math.max(MIN_SQUEEZE, room / run);
}

function squeezed(action: ResolvedAction, origin: number, squeeze: number): ResolvedAction {
  if (squeeze === 1 || action.kind === "tour" || action.kind === "camera") return action;
  const start = origin + (action.start - origin) * squeeze;
  const duration = action.duration * squeeze;
  return { ...action, start, end: start + duration, duration };
}

/** A narration's words as the player counts them while they are spoken: letters and digits, lowercased. */
export function narrationWords(text: string | undefined): string[] {
  return (text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The sentence each narration word is spoken in, counted as `narrationWords` counts the words. A sentence ends at its stop, or at the quote closing straight after it. */
function narrationSentences(text: string | undefined): number[] {
  return (text ?? "").split(/(?<=[.!?]['\u2019"\u201d]?)\s+/).flatMap((sentence, index) => narrationWords(sentence).map(() => index));
}

/** Where `wanted` first appears in `spoken` at or after `from`, or undefined when it never does. */
function findWords(spoken: string[], wanted: string[], from: number): number | undefined {
  if (wanted.length === 0) return undefined;
  for (let at = from; at + wanted.length <= spoken.length; at++) {
    if (wanted.every((word, offset) => spoken[at + offset] === word)) return at;
  }
  return undefined;
}

/**
 * The scene with a step aside written for every subject a new one takes the centre from: when a beat shows a
 * primary or hero picture, each picture on screen before it steps aside on that beat, unless the two are
 * compared, one is set against the other, or it leaves on that beat. A picture with an aside written keeps it.
 */
function steppedAside(scene: SceneSpec): SceneSpec {
  const specs = new Map(scene.objects.map((source) => [source.id, source]));
  const against = (source: ObjectSpec) =>
    [source.placement?.mode === "relative" || source.placement?.mode === "anchor" ? source.placement.target : undefined, source.attach?.to, typeof source.size === "object" ? source.size.like : undefined, "in" in source && typeof source.in === "string" ? source.in : undefined].flatMap((target) => (target === undefined ? [] : [target.split(".")[0]]));
  const setAgainst = (from: string, to: string, seen = new Set<string>()): boolean => {
    const source = specs.get(from);
    if (!source || seen.has(from)) return false;
    seen.add(from);
    return against(source).some((bearer) => bearer === to || setAgainst(bearer, to, seen));
  };
  const coleads = (a: ObjectSpec, b: ObjectSpec) => compared(scene, a, b) || otherState(a, b) || otherState(b, a) || actorsBeside(a, b);
  const keeps = (old: ObjectSpec, next: ObjectSpec) => coleads(old, next) || setAgainst(next.id, old.id) || setAgainst(old.id, next.id);

  const stepped = new Set(scene.beats.flatMap((beat) => beat.actions).flatMap((action) => (action.do === "aside" ? [action.target] : [])));
  const shown = new Set(scene.objects.filter((source) => source.initial === "visible").map((source) => source.id));
  let added = false;
  const beats = scene.beats.map((beat) => {
    const hidden = new Set(beat.actions.flatMap((action) => (action.do === "hide" ? action.targets : [])));
    const arriving = [...new Set(beat.actions.flatMap((action) => (action.do === "show" ? action.targets : [])))].filter((id) => !shown.has(id)).flatMap((id) => specs.get(id) ?? []);
    // An undeclared picture is laid as a helper beside the subject, so it takes no centre from it.
    const subjects = arriving.filter((source) => takesCentre(source) && (source.role === "primary" || source.role === "hero"));
    const leaving = [...shown].flatMap((id) => specs.get(id) ?? []).filter((old) => takesCentre(old) && !hidden.has(old.id) && !stepped.has(old.id) && subjects.some((next) => !keeps(old, next)));
    arriving.forEach((source) => shown.add(source.id));
    hidden.forEach((id) => shown.delete(id));
    if (leaving.length === 0) return beat;

    leaving.forEach((old) => stepped.add(old.id));
    added = true;
    return { ...beat, actions: [...beat.actions, ...leaving.map((old): ActionSpec => ({ do: "aside", target: old.id }))] };
  });
  return added ? { ...scene, beats } : scene;
}

/** The ids a hide or a step aside takes off the centre of the screen. */
function departing(action: ActionSpec): string[] {
  return action.do === "hide" ? action.targets : action.do === "aside" ? [action.target] : [];
}

/**
 * The scene with every beat that would leave nothing on screen mid-narration handing over instead: what
 * it hides or steps aside waits for the next beat that shows something and leaves as that comes in. A leaf
 * stepped aside a beat before the next leaf came left the screen blank while the voice went on.
 */
function handedOver(scene: SceneSpec): SceneSpec {
  const specs = new Map(scene.objects.map((source) => [source.id, source]));
  const chain = (id: string, seen: string[] = []): string[] => {
    const source = specs.get(id);
    const on = source && ("in" in source && typeof source.in === "string" ? source.in : fixing(source) ?? (source.placement?.mode === "relative" && ["on", "inside"].includes(source.placement.relation) ? source.placement.target : undefined));
    const bearer = on?.split(".")[0];
    return bearer === undefined || seen.includes(bearer) || !specs.has(bearer) ? [...seen, id] : chain(bearer, [...seen, id]);
  };
  const beats = scene.beats.map((beat) => ({ ...beat, actions: [...beat.actions] }));
  const shown = new Set(scene.objects.filter((source) => source.initial === "visible").map((source) => source.id));
  const [hidden, aside] = [new Set<string>(), new Set<string>()];
  // What rides on a picture steps aside with it; a hidden one leaves what is fixed to it drawn.
  const onScreen = () => [...shown].some((id) => !hidden.has(id) && !chain(id).some((one) => aside.has(one)));
  let moved = false;
  beats.forEach((beat, index) => {
    const before = onScreen();
    for (const action of beat.actions) if (action.do === "show") action.targets.forEach((id) => specs.has(id) && shown.add(id));
    const leaving = beat.actions.filter((action) => departing(action).length > 0);
    for (const action of leaving) departing(action).forEach((id) => (action.do === "hide" ? hidden : aside).add(id));
    if (!before || leaving.length === 0 || onScreen()) return;
    const next = beats.findIndex((later, at) => at > index && later.actions.some((action) => action.do === "show"));
    const ids = new Set(leaving.flatMap(departing));
    const between = beats.slice(index + 1, next < 0 ? index + 1 : next).flatMap((later) => later.actions);
    if (next < 0 || between.some((action) => departing(action).some((id) => ids.has(id)))) return;
    beat.actions = beat.actions.filter((action) => !leaving.includes(action));
    beats[next].actions = [...leaving, ...beats[next].actions];
    ids.forEach((id) => (hidden.delete(id), aside.delete(id)));
    moved = true;
  });
  return moved ? { ...scene, beats } : scene;
}

function resolveScene(
  written: SceneSpec,
  theme: ResolvedScene["theme"],
  floor: number | undefined,
  carried: Carried,
  shares: Shares,
  stripFloor: number | undefined,
): ResolvedScene {
  const scene = handedOver(steppedAside(written));
  const spoken = narrationWords(scene.narration);
  let searchFrom = 0;
  const words = scene.beats.map((beat) => {
    const word = beat.say === undefined ? undefined : findWords(spoken, narrationWords(beat.say), searchFrom);
    if (word !== undefined) searchFrom = word + 1;
    return word;
  });
  // Spoken at an even pace across the floor; the player moves the beat onto the real voice as it is heard.
  const dues = words.map((word) =>
    word !== undefined && floor !== undefined && spoken.length > 0 ? (word / spoken.length) * floor : undefined,
  );
  const lastSpoken = scene.beats.map((beat) => beat.say !== undefined).lastIndexOf(true);
  const natural = scene.beats.map((beat, index) => {
    const length = beatLength(beat.actions, beat.pace ?? "normal");
    return lastSpoken >= 0 && index > lastSpoken ? Math.max(length, SILENT_HOLD) : length;
  });
  const sentenceOf = narrationSentences(scene.narration);
  let sentence = sentenceOf.length > 0 ? 0 : undefined;
  let cursor = 0;
  let squeeze = 1;
  const beats = scene.beats.map((beat, index): ResolvedBeat => {
    const paceToken = beat.pace ?? "normal";
    const word = words[index];
    const due = dues[index];
    if (word !== undefined) sentence = sentenceOf[word];
    if (due !== undefined || index === 0) {
      if (due !== undefined) cursor = Math.max(cursor, due);
      squeeze = runSqueeze(natural, dues, index, cursor, scene.beats);
    }
    const actions = beat.actions.map((action) => squeezed(resolveAction(action, cursor, paceToken), cursor, squeeze));
    const end = cursor + natural[index]! * squeeze;
    const resolved = {
      id: beat.id,
      pace: paceToken,
      start: cursor,
      end,
      duration: end - cursor,
      ...(word !== undefined ? { word } : {}),
      ...(sentence !== undefined ? { sentence } : {}),
      actions,
    };
    cursor = end;
    return resolved;
  });
  // Narration floor: a narrated scene lasts at least as long as its spoken lines (a little longer, never
  // shorter). Any time beyond the paced beats is a trailing hold on the final composed frame while the
  // narrator finishes — authored motion keeps its speed rather than being stretched.
  const duration = floor !== undefined ? Math.max(cursor, floor) : cursor;
  const laid = resolveObjects(scene, carried, shares, stripFloor);
  for (const action of beats.flatMap((beat) => beat.actions)) {
    const journey = action.kind === "motion" ? laid.journeys.get(action.source) : undefined;
    if (!journey || action.kind !== "motion") continue;
    if (journey.arrival) action.arrival = journey.arrival;
    if (journey.refused) action.refused = journey.refused;
  }
  return {
    id: scene.id,
    composition: scene.composition,
    theme,
    objects: laid.objects,
    beats,
    duration,
    ...(scene.categories_of && Object.keys(scene.categories_of).length > 0 ? { categoriesOf: scene.categories_of } : {}),
  };
}

/** What a scene's layout takes from the scene laid out before it: where each thing ended. */
export interface LayoutCarry {
  carried: Carried;
  shares: Shares;
}

export const FIRST_LAYOUT: LayoutCarry = { carried: new Map(), shares: new Map() };

/**
 * Lay out one scene after the scenes before it. It starts each thing where the scene before left it
 * (`endPoses` says where its motions leave them), so a scene once laid out never moves however many
 * scenes follow.
 */
export function resolveNextScene(
  scene: SceneSpec,
  theme: ThemeToken,
  floor: number | undefined,
  before: LayoutCarry,
  endPoses: (scene: ResolvedScene) => Map<string, ScenePose>,
): { scene: ResolvedScene; after: LayoutCarry } {
  const depth = stripDepth(scene);
  const usable = floor !== undefined && Number.isFinite(floor) && floor >= 0 ? floor : undefined;
  const resolved = resolveScene(scene, resolveTheme(theme)!, usable, before.carried, before.shares, depth > 0 ? STRIP_TOP + depth : undefined);
  const poses = endPoses(resolved);
  const carried: Carried = new Map(scene.objects.flatMap((source) => {
    const pose = poses.get(source.id);
    return pose ? [[source.id, { source, pose }] as const] : [];
  }));
  return { scene: resolved, after: { carried, shares: new Map([...before.shares, ...fixtureShares(resolved.objects)]) } };
}
