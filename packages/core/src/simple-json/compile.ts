import type {
  Base,
  Component,
  EnterKind,
  ExitKind,
  Film,
  MotionSpec,
  SceneMarker,
  ThemeName,
  Vec2,
} from "../gcl/schema";
import { wrapLines } from "../gcl/measure";
import { VIEW_HEIGHT, VIEW_INSET, VIEW_WIDTH } from "../gcl/viewport";
import {
  categoryColor,
  isTextSize,
  joinsTwo,
  paletteColor,
  resolvePace,
  resolveShot,
  resolveSize,
  resolveTextSize,
  resolveVisualStyle,
  toneColor,
  DEFAULT_TEXT_SIZE,
} from "./registry";
import { assetTakesThemeInk } from "./visual-catalog";
import { prng, smooth } from "../render/motion";
import type {
  Point,
  ResolvedAction,
  ResolvedObject,
  ResolvedScene,
  ResolvedSimpleAction,
  ScenePose,
} from "./resolve";
import { DEFAULT_BEND, FIT_MAX_W, PICTURE_KINDS, drawnBox, drawnSegs, figureAtRest, furniture, gridUnit, overhead, silhouetteOn, walkedBackward } from "./resolve";
import type { ActionSpec, CategoryColorToken, EntranceToken, ExitToken, FilmCategorySpec, ObjectSpec, SvgCompositePartSpec, TextSizeToken, TintToken } from "./types";
import { blend, layoutLabels, type LabelLayout, type LabelRequest } from "./labels";
import { clauseStarts, layoutSpeech, speechWords, stressedWords, type SpeechSide } from "./speech";
import { boundsOf, boxPolygon, meets, rectAt, type Drawn, type Pt, type Rect } from "../geometry/place";
import { motionsTransform } from "../gcl/motion";
import { parseSvgArtwork, svgPartMarkup, svgStrokeSegs } from "./svg";
import { fitUnit, nearestSample, sampleCurve } from "./curve";
import { imageSourceSize } from "./image";
import { drawnAsFigure, figurePlan, lonePieces, themePalette } from "./pieces";
import { shiftOps } from "../render/figure";
import { chartDataPiece } from "../render/datachart";
import { flattenPath, layPathBetween, mapPath, parsePath, polylineLengths, throughPath, type Subpath } from "../geometry/path";
import { ANGLE_REACH, angleArc, figureOf, handleFrame, nextCorner } from "../geometry/figure";

const ENTRANCES: Record<EntranceToken, EnterKind> = {
  instant: "none",
  fade: "fade",
  draw: "draw",
  wipe: "wipe",
  iris: "iris",
  slam: "slam",
  "word-by-word": "word",
  typewriter: "typewriter",
  scramble: "scramble",
  rise: "wipe",
};

const EXITS: Record<ExitToken, ExitKind> = {
  instant: "none",
  fade: "fade",
  erase: "erase",
  wipe: "wipe",
  iris: "iris",
  dissolve: "dissolve",
  slide: "slide",
  shrink: "shrink",
};

function objectAction(
  scene: ResolvedScene,
  object: ResolvedObject,
  kind: "show" | "hide",
): ResolvedSimpleAction | undefined {
  for (const beat of scene.beats) {
    for (const action of beat.actions) {
      if (action.kind !== kind) continue;
      const source = action.source;
      if (source.do !== "show" && source.do !== "hide") continue;
      // Showing an artwork reveals every part; showing any PART reveals the artwork itself, which is
      // what gives it a box. Without that, a scene built piece by piece leaves every line, label and
      // anchor aimed at the whole drawing pointing at a component that was never emitted.
      const partShown =
        kind === "show" &&
        object.compositeParent === undefined &&
        source.targets.some((target) => target.startsWith(`${object.id}.`));
      if (
        source.targets.includes(object.id) ||
        partShown ||
        (object.compositeParent !== undefined &&
          source.targets.includes(object.compositeParent))
      )
        return action;
    }
  }
  return undefined;
}

function motionActions(scene: ResolvedScene, id: string): ResolvedSimpleAction[] {
  return scene.beats.flatMap((beat) =>
    beat.actions.filter(
      (action): action is ResolvedSimpleAction =>
        action.kind === "motion" && action.source.do === "motion" && action.source.target === id,
    ),
  );
}

/**
 * The band of the screen a backdrop is cut to when two or more places share one scene — Earth over
 * the Moon, a desert over a rainforest. Each covers its band and is clipped to it; alone, a backdrop
 * has the whole screen and nothing to cut.
 */
function backdropBand(scene: ResolvedScene, object: ResolvedObject): { x: number; y: number; w: number; h: number } | undefined {
  const owner = object.compositeParent === undefined ? object : scene.objects.find((one) => one.id === object.compositeParent);
  const backdrops = scene.objects.filter((one) => one.compositeParent === undefined && one.source.kind === "svg-artwork" && one.source.role === "background");
  const index = owner ? backdrops.indexOf(owner) : -1;
  if (index < 0 || backdrops.length < 2) return undefined;
  const h = VIEW_HEIGHT / backdrops.length;
  return { x: 0, y: index * h, w: VIEW_WIDTH, h };
}

/** Motions that name `id` among the pieces riding rigidly with their target. */
/**
 * The journeys that carry an object along: those naming it in `with`, and for writing set beside or on
 * a thing, that thing's own — a name keeps to what it names, where it used to stay behind as it left.
 */
function carryingActions(scene: ResolvedScene, object: ResolvedObject): ResolvedSimpleAction[] {
  const bearer = writingBearer(scene, object);
  return scene.beats.flatMap((beat) =>
    beat.actions.filter(
      (action): action is ResolvedSimpleAction =>
        action.kind === "motion" &&
        action.source.do === "motion" &&
        action.source.target !== object.id &&
        ((action.source.with ?? []).includes(object.id) || (bearer !== undefined && action.source.target === bearer && ["move", "fall", "along"].includes(action.source.motion))),
    ),
  );
}

/** What writing set beside or on a thing keeps to: that thing, or for writing set under other writing, whatever that writing keeps to. */
function writingBearer(scene: ResolvedScene, object: ResolvedObject, seen = new Set<string>()): string | undefined {
  const placement = object.source.placement;
  if (!WRITING_KINDS.has(object.source.kind) || (placement?.mode !== "relative" && placement?.mode !== "anchor") || seen.has(object.id)) return undefined;
  const bearer = placement.target.split(".")[0];
  const next = scene.objects.find((one) => one.id === bearer && !one.compositeParent);
  return (next && writingBearer(scene, next, new Set([...seen, object.id]))) ?? bearer;
}

/** Where a motion's focal point rests: a point as given, a named thing's centre, else `fallback`. */
function restingPoint(scene: ResolvedScene, pos: unknown, fallback: Vec2 | Point): [number, number] {
  if (Array.isArray(pos) && typeof pos[0] === "number") return [pos[0], pos[1] as number];
  const named = typeof pos === "string" ? scene.objects.find((one) => one.id === pos) : undefined;
  return named ? [named.position[0], named.position[1]] : [fallback[0], fallback[1]];
}

/**
 * How the frame a thing is drawn or anchored in (`pin`) has been carried by `t`: the moves and turns of
 * the thing it belongs to, as one rigid map of rest points onto where they are then. Undefined at rest.
 */
function carriedAt(scene: ResolvedScene, object: ResolvedObject, t: number): ((point: Vec2) => Vec2) | undefined {
  const ref = object.pin?.ref;
  const host = ref === undefined ? undefined : (scene.objects.find((one) => one.id === ref) ?? scene.objects.find((one) => one.id === ref.split(".")[0]));
  const motions = host && motionsFor(scene, host);
  if (!host || !motions) return undefined;
  const moved = motionsTransform(motions, host.box, t, (pos) => restingPoint(scene, pos, host.position));
  if (moved.dx === 0 && moved.dy === 0 && moved.rot === 0) return undefined;
  const [cx, cy] = [host.box.x + host.box.w / 2, host.box.y + host.box.h / 2];
  const [cos, sin] = [Math.cos(moved.rot), Math.sin(moved.rot)];
  return ([x, y]) => [cx + moved.dx + cos * (x - cx) - sin * (y - cy), cy + moved.dy + sin * (x - cx) + cos * (y - cy)];
}

/**
 * A carried piece moves exactly as the thing carrying it: the same displacement for a journey, the
 * same turn about the same point for a spin — the carrier's own centre when the spin names none; a
 * journey's destination or path is the carrier's, offset by where the piece stands beside it as the journey starts.
 */
function carriedSpec(own: MotionSpec, lead: MotionSpec, carrier: { id: string; at: Vec2 }, piece: Vec2): MotionSpec {
  if (lead.kind === "spin" && own.kind === "spin") return { ...own, center: own.center ?? carrier.id };
  const offset: Vec2 = [piece[0] - carrier.at[0], piece[1] - carrier.at[1]];
  if ((lead.kind === "move" || lead.kind === "fall") && own.kind === lead.kind && Array.isArray(lead.to))
    return { ...own, to: [lead.to[0] + offset[0], lead.to[1] + offset[1]] };
  if (lead.kind === "along" && own.kind === "along")
    return { ...own, path: lead.path.map((point): Vec2 => [point[0] + offset[0], point[1] + offset[1]]), startAt: lead.startAt, leadIn: lead.leadIn };
  return own;
}

function targetedActions(
  scene: ResolvedScene,
  id: string,
  kind: "emphasize" | "fill",
): ResolvedSimpleAction[] {
  return scene.beats.flatMap((beat) =>
    beat.actions.filter(
      (action): action is ResolvedSimpleAction =>
        action.kind === kind &&
        action.source.do === kind &&
        action.source.target === id,
    ),
  );
}

const DEFAULT_ORBIT_RADIUS = 112;
const STRENGTH = { subtle: 0.55, normal: 1, strong: 1.55 } as const;

/**
 * Resolve an orbit in the same coordinate system used by the renderer.
 *
 * Artwork and its named SVG parts are scaled during layout. Using a fixed
 * semantic radius after that scaling makes the target jump on the first
 * animation frame and no longer match an authored orbit path. The resolved
 * resting distance is therefore the authoritative radius. A fixed radius is
 * only a deterministic fallback for degenerate or missing geometry.
 */
/**
 * The orbit of the given shape that passes through where the rider rests, so its first frame moves
 * nothing: an ellipse `ratio` as tall as it is wide, and the angle on it the rider starts from.
 */
function ellipseThrough(geometry: { from: number; radius: number }, ratio: number): { rx: number; ry: number; from: number } {
  const dx = Math.cos(geometry.from) * geometry.radius;
  const dy = Math.sin(geometry.from) * geometry.radius;
  const rx = Math.hypot(dx, dy / ratio);
  const ry = rx * ratio;
  return { rx, ry, from: Math.atan2(dy / (ry || 1), dx / (rx || 1)) };
}

function orbitGeometry(
  scene: ResolvedScene,
  object: ResolvedObject,
  centerId: string | undefined,
): { from: number; radius: number } {
  const centerObject = scene.objects.find(
    (candidate) => candidate.id === centerId,
  );
  if (!centerObject) return { from: 0, radius: DEFAULT_ORBIT_RADIUS };

  const dx = object.position[0] - centerObject.position[0];
  const dy = object.position[1] - centerObject.position[1];
  const radius = Math.hypot(dx, dy);
  return { from: Math.atan2(dy, dx), radius: Number.isFinite(radius) ? radius : 0 };
}

/**
 * The offset a part must keep from its artwork while an inherited translation plays.
 *
 * A destination reference resolves to one point, so handing every part the same `to` lands each
 * part's own centre there and collapses the whole drawing onto a single spot. Shifting the
 * destination by the part's resting offset moves the drawing in formation instead. Returns
 * undefined when the motion is authored on the part itself (it owns its destination) or when the
 * owner or destination cannot be resolved (an anchor handle, say), leaving the reference untouched.
 */
function formationShift(
  scene: ResolvedScene,
  object: ResolvedObject,
  inherited: boolean,
): Vec2 | undefined {
  if (!inherited || object.compositeParent === undefined) return undefined;
  const owner = scene.objects.find(
    (candidate) => candidate.id === object.compositeParent,
  );
  if (!owner) return undefined;
  return [
    object.position[0] - owner.position[0],
    object.position[1] - owner.position[1],
  ];
}

/**
 * A point of a route moved in just far enough that the traveller is still wholly on screen there: below
 * the strip along the top. Sent past the top, a rocket was drawn over the running timeline.
 */
function onScreen(to: Vec2, object: ResolvedObject, scene: ResolvedScene): Vec2 {
  const ceiling = Math.max(VIEW_INSET, ...scene.objects.filter((one) => one.id !== object.id && overhead(one.source)).map((one) => one.box.y + one.box.h + VIEW_INSET));
  const floor = VIEW_HEIGHT - VIEW_INSET;
  const halfW = Math.min(object.box.w / 2, VIEW_WIDTH / 2 - VIEW_INSET);
  const [low, high] = [ceiling + object.box.h / 2, floor - object.box.h / 2].sort((a, b) => a - b);
  return [Math.min(VIEW_WIDTH - VIEW_INSET - halfW, Math.max(VIEW_INSET + halfW, to[0])), Math.min(high, Math.max(low, to[1]))];
}

/**
 * The two things a connector is pinned to, beside where they sat when it was laid out.
 *
 * Its points are baked once, so without this a line between a pivot and a bob stays hanging where it
 * was drawn while the bob swings away from it. The renderer maps the resting pair onto the live pair
 * each frame, which turns the whole connector — shaft, arrowhead and end caps together — about
 * whichever end has not moved.
 */
function pinnedEnds(
  scene: ResolvedScene,
  source: ObjectSpec,
  ends: { from: Vec2; to: Vec2 },
): { ends?: [string, string]; ends0?: [Vec2, Vec2] } {
  const pair =
    source.kind === "line" || source.kind === "span"
      ? ([source.from, source.to] as const)
      : (source.kind === "curve" || source.kind === "path") && source.from !== undefined && source.to !== undefined
        ? ([source.from, source.to] as const)
        : undefined;
  if (!pair) return {};
  // A route walked by the thing at one of its ends is the way it goes, drawn once; pinned, it was dragged along by its walker.
  const walkedByEnd = scene.beats.some((beat) =>
    beat.actions.some(({ source: walk }) => walk.do === "motion" && walk.motion === "along" && walk.along === source.id && pair.some((end) => end.split(".")[0] === walk.target)),
  );
  if (walkedByEnd) return {};

  return { ends: [pair[0], pair[1]], ends0: [ends.from, ends.to] };
}

/**
 * The on-screen points of a formula-drawn curve, sampled exactly as the renderer draws it.
 *
 * A `line` hands out two endpoints and a traveller walks between them; a `curve` has no endpoints at
 * all — it is an expression. Sampling it here is what lets something follow a sine wave, a spiral or
 * an ellipse instead of only a straight hop between two objects.
 */
/**
 * One unit of a curve's equation, in view units.
 *
 * A curve anchored on a point and travelled by something is the path of THAT thing about THAT point,
 * so its unit is the traveller's resting distance from the anchor: write `sin(u), -cos(u)` and the
 * arc's radius is the length of whatever hangs there, with nothing measured by hand. Any other curve
 * keeps the size its word gave it.
 */
/** A walked path cut where it passes nearest `stop`, searched from its `from`th segment so a lead-in is never the cut. */
function stoppedAt(path: Vec2[], stop: Vec2, from: number): Vec2[] {
  let best = { gap: Infinity, index: path.length - 1, point: path[path.length - 1] };
  for (let index = from; index < path.length - 1; index++) {
    const [[ax, ay], [bx, by]] = [path[index], path[index + 1]];
    const [dx, dy] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((stop[0] - ax) * dx + (stop[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    const point: Vec2 = [ax + dx * t, ay + dy * t];
    const gap = Math.hypot(point[0] - stop[0], point[1] - stop[1]);
    if (gap < best.gap) best = { gap, index, point };
  }
  return [...path.slice(0, best.index + 1), best.point];
}

/** How far along a sampled path, as a fraction of its length, its `index`th sample lies. */
function lengthFraction(path: Vec2[], index: number): number {
  const lengths = polylineLengths(path);
  const total = lengths[lengths.length - 1];
  return total > 0 ? lengths[index] / total : 0;
}

/** The point an anchored curve turns about: the anchor target itself, not the curve's own laid box. */
function curveCentre(scene: ResolvedScene, path: ResolvedObject): Vec2 {
  const placement = path.source.placement;
  const target = placement?.mode === "anchor" ? scene.objects.find((one) => one.id === placement.target) : undefined;
  return target ? [target.position[0], target.position[1]] : [path.position[0], path.position[1]];
}

function curveUnit(scene: ResolvedScene, path: ResolvedObject): number {
  const placement = path.source.placement;
  if (placement?.mode !== "anchor") return 52 * path.size;
  const motions = scene.beats.flatMap((beat) => beat.actions).map((action) => action.source);
  const traveller = motions.find((source) => source.do === "motion" && source.motion === "along" && source.along === path.id);
  const rider = traveller && "target" in traveller ? scene.objects.find((one) => one.id === traveller.target) : undefined;
  const centre = curveCentre(scene, path);
  const reach = rider
    ? Math.hypot(rider.position[0] - centre[0], rider.position[1] - centre[1])
    : swingReach(scene, motions, placement.target, centre);
  if (reach <= 0.001) return 52 * path.size;
  return path.source.kind === "curve" ? fitUnit(path.source, centre, reach) : reach;
}

/**
 * How far the swinging end of a thing turning about `pivot` reaches: its farthest named part (the bob
 * of a pendulum), else its far edge — so an arc anchored on the pivot is the path that end sweeps.
 */
function swingReach(scene: ResolvedScene, motions: ResolvedSimpleAction["source"][], pivot: string, centre: Vec2): number {
  const swing = motions.find((source) => source.do === "motion" && source.motion === "spin" && source.about === pivot);
  const swinger = swing && "target" in swing ? scene.objects.find((one) => one.id === swing.target) : undefined;
  if (!swinger) return 0;
  const parts = scene.objects.filter((one) => one.compositeParent === swinger.id && one.id !== pivot);
  const far = (point: Point) => Math.hypot(point[0] - centre[0], point[1] - centre[1]);
  return parts.length > 0 ? Math.max(...parts.map((part) => far(part.position))) : 2 * far(swinger.position);
}

function curvePoints(scene: ResolvedScene, path: ResolvedObject): Vec2[] | undefined {
  if (path.source.kind !== "curve") return undefined;
  // Unaimed: the shape sits about its centre — the anchor point when it has one, else where the
  // layout put it. Anchoring must mean the POINT, or an arc drawn about a pin swings about a spot
  // beside the pin and the string it hangs from stretches to follow.
  const raw = sampleCurve(path.source, path.endpoints ? [0, 0] : curveCentre(scene, path), curveUnit(scene, path));
  if (!raw) return undefined;

  const ends = path.endpoints;
  return ends ? laidBetween(raw, ends.from, ends.to) : raw;
}

/**
 * Turn and stretch a shape drawn in its own frame so its first point lands on `from` and its last on
 * `to`.
 *
 * This is what answers "where does the sine wave go?". The formula says what the shape IS — a wave,
 * a spiral, an arc — and the two ends say where it runs and at what angle. A wave from the sun to a
 * leaf is the wave laid along the sun-to-leaf axis, whatever angle that happens to be.
 */
function laidBetween(raw: Vec2[], from: Vec2, to: Vec2): Vec2[] {
  const head = raw[0];
  const tail = raw[raw.length - 1];
  const ownSpan = Math.hypot(tail[0] - head[0], tail[1] - head[1]);
  const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (ownSpan < 0.001) return raw.map(([x, y]): Vec2 => [from[0] + x - head[0], from[1] + y - head[1]]);

  const turn =
    Math.atan2(to[1] - from[1], to[0] - from[0]) - Math.atan2(tail[1] - head[1], tail[0] - head[0]);
  const stretch = span / ownSpan;
  const cos = Math.cos(turn) * stretch;
  const sin = Math.sin(turn) * stretch;
  return raw.map(([x, y]): Vec2 => {
    const dx = x - head[0];
    const dy = y - head[1];
    return [from[0] + dx * cos - dy * sin, from[1] + dx * sin + dy * cos];
  });
}

function motionsFor(
  scene: ResolvedScene,
  object: ResolvedObject,
  seen: ReadonlySet<string> = new Set(),
): Base["motions"] {
  // A named SVG part is a component in its own right, so an action naming the part animates just that
  // part; an action naming the owning artwork is inherited by every part — otherwise the visible pixels
  // never move. Same precedence as show/hide in objectAction: own target first, owner as fallback.
  const own = motionActions(scene, object.id);
  // Drawn in another thing's frame, it already goes wherever that thing goes.
  const carried = carryingActions(scene, object).filter((action) => action.source.do !== "motion" || action.source.target !== object.pin?.ref.split(".")[0]);
  const inherited = own.length === 0 && carried.length === 0 && object.compositeParent !== undefined;
  // Carried journeys come last, in the order they play, so each starts from wherever the thing's earlier journeys left it.
  const actions = inherited ? motionActions(scene, object.compositeParent as string) : [...own, ...[...carried].sort((a, b) => a.start - b.start)];
  const specs: MotionSpec[] = [];
  const journeys = new Map<MotionSpec, ResolvedSimpleAction>();
  for (const action of actions) {
    const moved = motionSpec(scene, object, action, inherited);
    if (!moved) continue;
    // Dots trace the route once, from the thing itself; ghosts are copies, so every drawn part leaves its own.
    const moving = action.source.do === "motion" ? action.source : undefined;
    const dated = moving && "dates" in moving ? moving.dates : undefined;
    // A dated journey is written by its ghosts, whatever trail it names; only the traveller itself writes the dates.
    const trail = dated ? "ghosts" : moving && "trail" in moving ? moving.trail : undefined;
    const dates = dated && !inherited && !carried.includes(action) ? { dates: dated } : {};
    // Only the traveller leaves a trail: an arrow or a caption carried with it left a row of copies.
    const riding = carried.includes(action);
    const spec = trail && !riding && moved.kind !== "spin" && moved.kind !== "morph" && moved.kind !== "trace" && (trail === "ghosts" || !inherited) ? { ...moved, trail, ...dates } : moved;
    const source = action.source;
    const carrier = carried.includes(action) && source.do === "motion" ? scene.objects.find((one) => one.id === source.target) : undefined;
    const lead = carrier ? motionSpec(scene, carrier, action, false) : undefined;
    if (!carrier || !lead) {
      specs.push(spec);
      journeys.set(spec, action);
      continue;
    }
    // Where each stands as the carrying starts: a block loaded onto a sledge rides from the sledge, not from where it was laid.
    const standing = (one: ResolvedObject, motions: MotionSpec[] | undefined): Vec2 => {
      const moved = motionsTransform(motions, one.box, action.start, (pos) => restingPoint(scene, pos, one.position));
      return [one.position[0] + moved.dx, one.position[1] + moved.dy];
    };
    specs.push(carriedSpec(spec, lead, { id: carrier.id, at: seen.has(carrier.id) ? carrier.position : standing(carrier, motionsFor(scene, carrier, new Set([...seen, object.id]))) }, standing(object, specs)));
  }
  const aside = asideMotion(scene, object);
  const aimed = specs.map((spec) => intoAside(scene, spec, journeys.get(spec)));
  const all = aside ? [...aimed, aside] : aimed;
  return all.length > 0 ? all : undefined;
}

/**
 * A journey to a part of a picture that has stepped aside before it sets off ends where that part was
 * carried: aimed at where it rested, "coal" for a stepped-aside boiler flew up onto the mine.
 */
function intoAside(scene: ResolvedScene, spec: MotionSpec, action: ResolvedSimpleAction | undefined): MotionSpec {
  const aimed = action?.source.do === "motion" && action.source.motion === "move" ? action.source.to : undefined;
  const owner = scene.objects.find((one) => one.id === aimed?.split(".")[0]);
  const step = owner && scene.beats.flatMap((beat) => beat.actions).find((one) => one.source.do === "aside" && one.source.target === owner.id);
  if (spec.kind !== "move" || !Array.isArray(spec.to) || !owner || !step || (spec.at ?? 0) < step.end) return spec;
  const { to, scale } = asidePlace(scene, owner, step);
  const [cx, cy] = [owner.box.x + owner.box.w / 2, owner.box.y + owner.box.h / 2];
  return { ...spec, to: [to[0] + (spec.to[0] - cx) * scale, to[1] + (spec.to[1] - cy) * scale] };
}

// The long side a picture steps aside to, and how far back it greys.
const ASIDE_EXTENT = 170;
const ASIDE_MUTE = 0.4;
const ASIDE_GAP = 16;

/**
 * The step aside a thing takes: its own when it is the picture stepping aside, its picture's when it is
 * a part of it, and a slide without shrinking for writing set beside it, which keeps its size to be read.
 */
function asideMotion(scene: ResolvedScene, object: ResolvedObject): MotionSpec | undefined {
  const placement = object.source.placement;
  const writes = WRITING_KINDS.has(object.source.kind) && object.compositeParent === undefined;
  const bearer = writes && (placement?.mode === "relative" || placement?.mode === "anchor") ? placement.target.split(".")[0] : undefined;
  const ownerId = object.compositeParent ?? bearer ?? object.id;
  const action = scene.beats.flatMap((beat) => beat.actions).find((one) => one.source.do === "aside" && one.source.target === ownerId);
  const owner = scene.objects.find((one) => one.id === ownerId);
  if (!action || !owner) return undefined;
  const { to, scale } = asidePlace(scene, owner, action);
  const common = { kind: "aside" as const, mute: ASIDE_MUTE, at: action.start, dur: action.duration };
  if (object === owner) return { ...common, to, scale };
  const [dx, dy] = [object.position[0] - owner.position[0], object.position[1] - owner.position[1]];
  if (!bearer) return { ...common, to, scale, pivot: [-dx, -dy] };
  // Writing beside the picture keeps its gap to the picture's shrunken edge.
  const pull = (offset: number, half: number) => (Math.abs(offset) > half ? Math.sign(offset) * (Math.abs(offset) - (1 - scale) * half) : offset * scale);
  return { ...common, to: [to[0] + pull(dx, owner.box.w / 2), to[1] + pull(dy, owner.box.h / 2)], scale: 1 };
}

/** Where a picture stepping aside goes: companion-sized, in the larger free band above or below what stays on screen with it. */
function asidePlace(scene: ResolvedScene, owner: ResolvedObject, action: ResolvedAction): { to: Vec2; scale: number } {
  const times = screenTimes(scene);
  const [, gone] = times.get(owner.id) ?? [0, scene.duration];
  const others = scene.objects.filter((one) => {
    if (one === owner || one.compositeParent || WRITING_KINDS.has(one.kind) || joinsTwo(one.source) || one.source.role === "background") return false;
    if (asideMotionOf(scene, one.id)) return false;
    const [from, to] = times.get(one.id) ?? [0, scene.duration];
    return from < gone && action.start < to;
  });
  const top = VIEW_INSET + ASIDE_GAP;
  const foot = VIEW_HEIGHT - VIEW_INSET - ASIDE_GAP;
  const boxes = others.map(drawnBox);
  const upper = boxes.length ? Math.min(...boxes.map((box) => box.y)) - ASIDE_GAP : foot;
  const lower = boxes.length ? Math.max(...boxes.map((box) => box.y + box.h)) + ASIDE_GAP : foot;
  const [above, below] = [upper - top, foot - lower];
  const [start, room] = above >= below ? [top, above] : [lower, below];
  const box = owner.box;
  const scale = Math.max(Math.min(1, ASIDE_EXTENT / Math.max(box.w, box.h), Math.max(room, 60) / box.h, (VIEW_WIDTH - 2 * (VIEW_INSET + ASIDE_GAP)) / box.w), 0.05);
  const [w, h] = [box.w * scale, box.h * scale];
  const halfW = VIEW_WIDTH / 2 - VIEW_INSET - ASIDE_GAP;
  const x = Math.min(VIEW_WIDTH / 2 + halfW - w / 2, Math.max(VIEW_WIDTH / 2 - halfW + w / 2, owner.position[0]));
  const y = Math.min(foot - h / 2, Math.max(top + h / 2, start + Math.max(room, h) / 2));
  return { to: [x, y], scale };
}

function asideMotionOf(scene: ResolvedScene, id: string): boolean {
  return scene.beats.some((beat) => beat.actions.some((one) => one.source.do === "aside" && one.source.target === id));
}

function motionSpec(
  scene: ResolvedScene,
  object: ResolvedObject,
  action: ResolvedSimpleAction,
  inherited: boolean,
): MotionSpec | undefined {
  if (action.source.do !== "motion") return undefined;
  const source = action.source;
  const direction =
    "direction" in source && source.direction === "counterclockwise" ? -1 : 1;
  const seconds = action.duration > 0 ? action.duration : 1;
  const shift = formationShift(scene, object, inherited);
  const owner =
    shift &&
    scene.objects.find((candidate) => candidate.id === object.compositeParent);

  // Where a journey ends is planned with the layout (see journeys.ts); a refused one plays as no motion.
  const arrival: Vec2 | undefined = action.arrival && (shift ? [action.arrival[0] + shift[0], action.arrival[1] + shift[1]] : [action.arrival[0], action.arrival[1]]);
  if (source.motion === "move") {
    if (!arrival) return undefined;
    return {
      kind: "move",
      to: arrival,
      at: action.start,
      dur: action.duration,
      gait: source.gait,
    };
  }
  if (source.motion === "fall") {
    if (!arrival) return undefined;
    const bounce =
      source.bounce === "strong" ? 14 : source.bounce === "soft" ? 7 : 0;
    return {
      kind: "fall",
      to: arrival,
      gravity: 420,
      bounce,
      at: action.start,
      dur: action.duration,
    };
  }
  if (source.motion === "orbit") {
    const geometry = orbitGeometry(scene, object, source.around);
    if (geometry.radius < 0.5)
      return {
        kind: "spin",
        omega: (direction * (source.turns ?? 1) * Math.PI * 2) / seconds,
        center: source.around,
        at: action.start,
        dur: action.duration,
      };
    return {
      kind: "orbit",
      center: source.around,
      ...ellipseThrough(geometry, source.ratio ?? 1),
      turns: (source.turns ?? 1) * direction,
      at: action.start,
      dur: action.duration,
    };
  }
  if (source.motion === "morph") {
    if (source.shape) return { kind: "morph", toShape: source.shape, sides: source.sides, at: action.start, dur: action.duration };
    const toPoints = source.d === undefined ? undefined : morphPoints(object, source.d);
    // The corners it changes into, so what is drawn on its corners and sides goes with them.
    const toCorners = source.d === undefined ? undefined : figureOf(drawnSegs(object, source.d)).corners;
    return toPoints ? { kind: "morph", toPoints, toCorners, at: action.start, dur: action.duration } : undefined;
  }
  if (source.motion === "along" && source.through) {
    const start = (owner ?? object).position;
    const waypoints = source.through
      .map((id) => scene.objects.find((one) => one.id === id)?.position)
      .filter((point): point is Point => point !== undefined);
    const route = flattenPath(throughPath([[start[0], start[1]], ...waypoints.map(([x, y]): Vec2 => [x, y])]))[0]?.points;
    if (!route) return undefined;
    return {
      kind: "along",
      path: route.map(([x, y]): Vec2 => (shift ? [x + shift[0], y + shift[1]] : [x, y])),
      at: action.start,
      dur: action.duration,
      gait: source.gait,
      repeat: source.repeat,
      // Set off from where its last journey left it, not from where it rested: a second leg snapped back first.
      leadIn: true,
      face: source.face === "path",
    };
  }
  if (source.motion === "along") {
    const pathObject = scene.objects.find(
      (candidate) => candidate.id === source.along,
    );
    const endpoints = pathObject?.endpoints;
    const sampled = pathObject && (curvePoints(scene, pathObject) ?? pathRoute(pathObject));
    // An inherited path is walked in formation: the artwork's centre chooses the travel direction,
    // then every part rides that same path offset by its own resting distance from the centre.
    const walker = owner ?? object;
    const riding = carriedAt(scene, walker, action.start);
    const anchor: Vec2 = riding ? riding(walker.position) : walker.position;
    // A route drawn on a thing that has moved or turned is walked where it now is.
    const routeNow = pathObject && carriedAt(scene, pathObject, action.start);
    // A thing standing on a place walks the route with its feet, so its centre rides above the route.
    const lift = walker.stands ? walker.box.h / 2 : 0;
    const lifted = (points: Vec2[]) => points.map((point): Vec2 => (routeNow ? routeNow(point) : point)).map((point): Vec2 => [point[0], point[1] - lift]);
    let path = sampled?.length
      ? lifted(sampled)
      : endpoints && pathObject
        ? lifted(linePoints(pathObject.source, endpoints.from, endpoints.to, pathObject.bow))
        : [anchor, anchor];
    // An anchored path is the rider's own path about a point, so it is entered where the rider
    // rests rather than joined from there by a straight run to its first point.
    const anchoredPath = pathObject?.source.placement?.mode === "anchor" && !("arrow" in pathObject.source && pathObject.source.arrow);
    const entryIndex = anchoredPath && sampled?.length ? nearestSample(sampled, anchor) : undefined;
    const startAt = entryIndex === undefined || !sampled ? undefined : lengthFraction(sampled, entryIndex);
    let leadIn = false;
    if ((endpoints || sampled?.length) && !anchoredPath) {
      if (pathObject && walkedBackward(pathObject.source, path, anchor)) path = [...path].reverse();
      const start = path[0];
      if (Math.hypot(anchor[0] - start[0], anchor[1] - start[1]) > 0.001) {
        path = [anchor, ...path];
        leadIn = true;
      }
    }
    // A rider that could not be moved onto its anchored curve (a part is drawn where it is) has the
    // curve moved onto it instead, so the first frame still moves nothing.
    if (entryIndex !== undefined) {
      const entry = path[entryIndex];
      const gap: Vec2 = [anchor[0] - entry[0], anchor[1] - entry[1]];
      if (Math.hypot(gap[0], gap[1]) > 0.001)
        path = path.map((point): Vec2 => [point[0] + gap[0], point[1] + gap[1]]);
    }
    if (shift)
      path = path.map(
        (point): Vec2 => [point[0] + shift[0], point[1] + shift[1]],
      );
    // A route drawn in a box of its own does not know the size of what rides it: a balloon walked up
    // one ran off the side of the screen. The rider's centre keeps to where the whole of it is seen.
    // The point it sets off from stays where it rests, even resting a little past the frame: moved in, its first frame jumped.
    else {
      const entry = entryIndex ?? 0;
      path = path.map((point, index): Vec2 => (index === entry ? point : onScreen(point, object, scene)));
    }
    // A walker kept off what holds the route's end stops where it was planned to, short of the end.
    if (arrival && !source.repeat) path = stoppedAt(path, arrival, leadIn ? 1 : 0);
    return {
      kind: "along",
      path,
      at: action.start,
      dur: action.duration,
      gait: source.gait,
      repeat: source.repeat,
      startAt,
      leadIn,
      face: source.face === "path",
    };
  }
  if (source.motion === "wander") {
    const start = (owner ?? object).position;
    const end = action.arrival;
    const journey = end ? Math.hypot(end[0] - start[0], end[1] - start[1]) : 0;
    const reach = Math.max(40, Math.min(90, journey * 0.35 || 60));
    const path = wanderPath([start[0], start[1]], end ? [end[0], end[1]] : undefined, reach, seedFor(`${object.id}:${action.start}`));
    return {
      kind: "along",
      path: path.map((point): Vec2 => (shift ? [point[0] + shift[0], point[1] + shift[1]] : point)),
      at: action.start,
      dur: action.duration,
    };
  }
  // Complete exactly one revolution over the beat so the object lands upright. A fixed angular speed
  // times the beat duration never reaches a multiple of 2π at any pace, so every spin used to stop at
  // an arbitrary tilt (277° at `normal`) and hold it for the rest of the scene.
  return {
    kind: "spin",
    omega: (direction * Math.PI * 2) / seconds,
    center: source.about ?? (inherited ? object.compositeParent : undefined),
    sweep: source.sweep === undefined ? undefined : (source.sweep * Math.PI) / 180,
    repeat: source.repeat,
    at: action.start,
    dur: action.duration,
  };
}

/**
 * A random walk from `start`: jostling about it, or — given somewhere to arrive — drifting there with a
 * few near-misses on the way in, because molecules meet by chance collisions, never by a beeline.
 */
function wanderPath(start: Vec2, arrival: Vec2 | undefined, reach: number, seed: number): Vec2[] {
  const random = prng(seed);
  const steps = 22;
  const end = arrival ?? start;
  const points: Vec2[] = [start];
  for (let k = 1; k < steps; k++) {
    const along = arrival ? smooth(k / steps) : 0;
    // Near the end the misses close in on the target; with nowhere to go the jostle keeps its size.
    const spread = reach * (arrival ? 0.35 + 0.65 * (1 - k / steps) : 1);
    const angle = random() * Math.PI * 2;
    const base: Vec2 = [start[0] + (end[0] - start[0]) * along, start[1] + (end[1] - start[1]) * along];
    points.push([base[0] + Math.cos(angle) * spread * (0.5 + random() * 0.5), base[1] + Math.sin(angle) * spread * (0.5 + random() * 0.5)]);
  }
  points.push(end);
  return flattenPath(throughPath(points))[0]?.points.map(([x, y]): Vec2 => [x, y]) ?? points;
}

const FILL_LEVELS: Record<string, number> = {
  empty: 0,
  quarter: 0.25,
  half: 0.5,
  "three-quarters": 0.75,
  full: 1,
};

/**
 * The fill steps one component runs through, in beat order.
 *
 * A thing that is ever filled starts EMPTY, because the emptiness is half of what a filling teaches:
 * a beaker that begins full and stays full has shown the reader nothing. Levels are words rather than
 * numbers so the author cannot imply a precision the picture does not carry.
 */
function fillFor(scene: ResolvedScene, object: ResolvedObject): Base["fillLevel"] {
  const own = targetedActions(scene, object.id, "fill");
  const inherited =
    object.compositeParent === undefined
      ? []
      : targetedActions(scene, object.compositeParent, "fill");
  const actions = own.length ? own : inherited;
  if (!actions.length) return undefined;

  return actions.map((action) => {
    if (action.source.do !== "fill") throw new Error("unreachable fill action");
    return {
      to: FILL_LEVELS[action.source.to] ?? 0,
      at: action.start,
      dur: action.duration,
      dir: action.source.direction ?? "up",
    };
  });
}

function emphasisFor(
  scene: ResolvedScene,
  object: ResolvedObject,
): Base["emphasis"] {
  // Same precedence as motionFor: emphasis on the part itself wins, emphasis on the owning artwork is
  // inherited by every part so the visible pixels shake/waddle/pulse.
  const own = targetedActions(scene, object.id, "emphasize");
  const inherited =
    object.compositeParent === undefined
      ? []
      : targetedActions(scene, object.compositeParent, "emphasize");
  const actions = own.length ? own : inherited;
  if (!actions.length) return undefined;
  return actions.map((action) => {
    if (action.source.do !== "emphasize")
      throw new Error("unreachable emphasis action");
    return {
      kind: action.source.emphasis,
      at: action.start,
      dur: action.duration,
      amp: STRENGTH[action.source.strength ?? "normal"],
    };
  });
}

function entranceFor(
  object: ResolvedObject,
  action: ResolvedSimpleAction | undefined,
) {
  if (!action || action.source.do !== "show")
    return { type: "none" as const, dur: 0 };
  // A figure and a chart build themselves — bars grow from the baseline, strokes draw on — so that is
  // how they enter unless the writer asks otherwise.
  const fallback: EntranceToken =
    object.kind === "line" || object.kind === "path" || object.kind === "chart" || drawnAsFigure(object.source) ? "draw" : "fade";
  // Every picture enters one way, so the viewer never has to learn a new entrance: only a rise, which
  // is itself the lesson (a plant growing, water filling), is kept.
  const asked = action.source.entrance ?? fallback;
  const token: EntranceToken = object.source.kind === "image" && asked !== "instant" && asked !== "rise" ? "fade" : asked;
  return {
    type: ENTRANCES[token],
    dur: token === "instant" ? 0 : action.duration,
    // A rise is revealed from its base upward: mountains pushed up, a plant growing, water filling.
    ...(token === "rise" ? { dir: "up" as const } : {}),
  };
}

function exitFor(action: ResolvedSimpleAction | undefined) {
  if (!action || action.source.do !== "hide") return undefined;
  const token = action.source.exit ?? "fade";
  return {
    type: EXITS[token],
    out: action.start,
    dur: token === "instant" ? 0 : action.duration,
  };
}

const CURVE_DASH = [10, 7];
const TRACED_WAVES = 2.5;

/** The points a path written in the chord frame — (0,0) at `from`, (1000,0) at `to` — draws between them. */
function chordPoints(d: string, from: Vec2, to: Vec2): Vec2[] {
  const points = flattenPath(layPathBetween(parsePath(d).segs, from, to))[0]?.points;
  return points ? points.map(([x, y]): Vec2 => [x, y]) : [from, to];
}

/** The pieces a `path` object draws, in view units: laid between its two ends, in its frame, or fitted into its own box. */
function pathSubpaths(object: ResolvedObject): Subpath[] {
  return object.source.kind === "path" ? flattenPath(drawnSegs(object)) : [];
}

/** The outlines an SVG part draws on with, mapped from its bounds onto its box as its markup is stretched. */
function partStrokes(part: SvgCompositePartSpec, box: ResolvedObject["box"]): Vec2[][] {
  const [vx, vy, vw, vh] = part.bounds;
  const placed = mapPath(svgStrokeSegs(part.svg), (x, y) => [box.x + ((x - vx) * box.w) / (vw || 1), box.y + ((y - vy) * box.h) / (vh || 1)]);
  return flattenPath(placed).map((piece) => piece.points.map(([x, y]): Vec2 => [x, y]));
}

/** The points a `path` morphs into: the new `d` laid in the same frame as its own, so the two line up. */
function morphPoints(object: ResolvedObject, d: string): Vec2[] | undefined {
  if (object.source.kind !== "path") return undefined;
  return flattenPath(drawnSegs(object, d))[0]?.points.map(([x, y]): Vec2 => [x, y]);
}

/** The exact shape a mark is aimed at: a picture part's traced border, or a whole picture's silhouette. */
function partOutline(scene: ResolvedScene, target: string): Vec2[] | undefined {
  const aimed = scene.objects.find((one) => one.id === target);
  if (aimed?.hotspot?.outline) return aimed.hotspot.outline;
  return aimed ? silhouetteOn(aimed) : undefined;
}

/** A picture part's traced border, or the box it was measured in when it could not be traced. */
function partBorder(scene: ResolvedScene, target: string): Vec2[] | undefined {
  const part = scene.objects.find((one) => one.id === target && one.kind === "image-hotspot");
  if (!part) return undefined;
  const { x, y, w, h } = part.box;
  return part.hotspot?.outline ?? [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** The other pictures on screen with a mark's target, which a `dim` softens while the target glows. */
function otherPictures(scene: ResolvedScene, target: string): string[] {
  const owner = target.split(".")[0];
  return scene.objects
    .filter((one) => !one.compositeParent && one.id !== owner && PICTURE_KINDS.has(one.source.kind))
    .map((one) => one.id);
}

// How far a dimension line stands off the side it measures, and how far its extension lines reach past it.
const DIMENSION_OFFSET = 16;
const DIMENSION_GAP = 4;
const DIMENSION_OVERRUN = 5;

/**
 * What a span draws. Laid along a side of a figure it is a dimension line: set off the side on the
 * figure's outside, joined to the side's two ends by extension lines, an arrowhead at each end. Laid
 * between anything else it is the distance itself, a bar across each end.
 */
function spanStrokes(scene: ResolvedScene, source: ObjectSpec, ends: { from: Vec2; to: Vec2 }, color: string): Component[] {
  const outward = source.kind === "span" ? sideNormal(scene, source.from, source.to) : undefined;
  const [dx, dy] = [ends.to[0] - ends.from[0], ends.to[1] - ends.from[1]];
  const length = Math.hypot(dx, dy) || 1;
  if (!outward) {
    const [nx, ny] = [(-dy / length) * 9, (dx / length) * 9];
    const bar = (p: Vec2): Vec2[] => [[p[0] - nx, p[1] - ny], [p[0] + nx, p[1] + ny]];
    return [
      { type: "shape", shape: "path", points: [ends.from, ends.to], smooth: false, stroke: color, width: 2 },
      { type: "shape", shape: "path", points: bar(ends.from), smooth: false, stroke: color, width: 2 },
      { type: "shape", shape: "path", points: bar(ends.to), smooth: false, stroke: color, width: 2 },
    ];
  }
  const off = (p: Vec2, by: number): Vec2 => [p[0] + outward[0] * by, p[1] + outward[1] * by];
  const extension = (p: Vec2): Component => ({ type: "shape", shape: "path", points: [off(p, DIMENSION_GAP), off(p, DIMENSION_OFFSET + DIMENSION_OVERRUN)], smooth: false, stroke: color, width: 1.5 });
  return [
    extension(ends.from),
    extension(ends.to),
    { type: "shape", shape: "path", points: [off(ends.from, DIMENSION_OFFSET), off(ends.to, DIMENSION_OFFSET)], smooth: false, stroke: color, width: 2, arrow: "both" },
  ];
}

/** The outward normal of the figure side two corner names bound, or undefined when they are not the two ends of one side. */
function sideNormal(scene: ResolvedScene, from: string, to: string): Vec2 | undefined {
  const [a, b] = [from, to].map((ref) => /^(.+)\.v(\d+)$/.exec(ref));
  if (!a || !b || a[1] !== b[1]) return undefined;
  const owner = scene.objects.find((one) => one.id === a[1]);
  const figure = owner && figureAtRest(owner);
  if (!figure) return undefined;
  const [i, j] = [Number(a[2]), Number(b[2])];
  const side = nextCorner(figure, i) === j ? i : nextCorner(figure, j) === i ? j : undefined;
  const frame = side === undefined ? undefined : handleFrame(figure, figure.corners, `s${side}`, 1);
  return frame?.y;
}

/** The points a line, curve or path draws, from its start to its end: what a `trace` runs along. */
function drawnCourse(scene: ResolvedScene, target: string): Vec2[] | undefined {
  const object = scene.objects.find((candidate) => candidate.id === target);
  if (!object) return undefined;
  const sampled = curvePoints(scene, object) ?? pathRoute(object);
  if (sampled?.length) return sampled;
  // An angle draws only its arc at the vertex; the box it spans reaches out to the ends of its arms.
  if (object.source.kind === "angle" && object.endpoints) return angleArc(object.position, object.endpoints.from, object.endpoints.to, ANGLE_REACH);
  return object.endpoints && (object.source.kind === "line" || object.source.kind === "span") ? linePoints(object.source, object.endpoints.from, object.endpoints.to, object.bow) : undefined;
}

/** The route a traveller sent along a `path` walks: the first piece it draws. */
function pathRoute(object: ResolvedObject): Vec2[] | undefined {
  const first = pathSubpaths(object)[0];
  return first ? first.points.map(([x, y]): Vec2 => [x, y]) : undefined;
}

/**
 * The exact points a line (or a span, which is always straight) draws — the same points a traveller
 * sent along it walks. A curved line is a cubic whose peak sits `bend` × its length off the chord; a
 * traced one is that curve with a small hand-drawn waver that dies away at both ends.
 */
function linePoints(source: ObjectSpec, from: Vec2, to: Vec2, bow = 1): Vec2[] {
  if (source.kind !== "line" || !source.form || source.form === "straight") return [from, to];
  if (source.form === "elbow") return [from, [from[0], to[1]], to];
  const lift = Math.round(((source.bend ?? DEFAULT_BEND) * bow * 4000) / 3);
  const curve = chordPoints(`M0 0 C333 ${lift} 667 ${lift} 1000 0`, from, to);
  if (source.form === "curved") return curve;

  const chord = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const waver = Math.min(4, chord * 0.02);
  const lengths = polylineLengths(curve);
  const total = lengths[lengths.length - 1] || 1;
  return curve.map((point, index): Vec2 => {
    const s = lengths[index] / total;
    const prev = curve[Math.max(0, index - 1)];
    const next = curve[Math.min(curve.length - 1, index + 1)];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const norm = Math.hypot(tx, ty) || 1;
    const offset = waver * Math.sin(Math.PI * s) * Math.sin(2 * Math.PI * TRACED_WAVES * s);
    return [point[0] - (ty / norm) * offset, point[1] + (tx / norm) * offset];
  });
}

type ContentBase = Pick<
  Base,
  "id" | "at" | "start" | "dur" | "enter" | "exit" | "layer" | "fixed"
>;

const RECTANGLE_COUNTS = { few: 4, several: 8, many: 16, dense: 32 } as const;

function inlineObject(source: ObjectSpec): ResolvedObject {
  const size = isTextSize(source.size) ? resolveTextSize(source.size).px : (resolveSize(typeof source.size === "string" ? source.size : "medium", source.kind) ?? 1);
  return {
    id: source.id,
    kind: source.kind,
    source,
    position: [0, 0],
    box: { x: 0, y: 0, w: 1, h: 1 },
    size,
  };
}

function compileContent(
  scene: ResolvedScene,
  object: ResolvedObject,
  base: ContentBase,
): Component {
  const source = object.source;
  const style = resolveVisualStyle(scene.theme, source.role);

  if (object.kind === "image-hotspot") {
    // A place inside a picture: invisible, always present, and carried wherever the picture goes. A
    // fill aimed at the whole picture is the picture's own, so only fills aimed at the part tint it.
    const fill = targetedActions(scene, object.id, "fill")[0]?.source;
    return {
      ...base,
      type: "region",
      w: object.box.w,
      h: object.box.h,
      ...(object.compositeParent ? { follows: object.compositeParent } : {}),
      ...(object.hotspot?.outline ? { outline: object.hotspot.outline } : {}),
      ...(fill?.do === "fill"
        ? { fillLevel: fillFor(scene, { ...object, compositeParent: undefined }), tint: paletteColor(scene.theme, fill.color ?? "accent") }
        : {}),
    };
  }

  if (object.kind === "figure-piece") {
    const parent = scene.objects.find((one) => one.id === object.compositeParent);
    const piece = parent && figurePlan(parent.source, parent.box.w, parent.box.h, scene.theme).pieces.find((one) => `${parent.id}.${one.name}` === object.id);
    if (!parent || !piece) return { ...base, type: "figure", w: object.box.w, h: object.box.h, ops: [] };
    const [dx, dy] = [parent.position[0] - object.position[0], parent.position[1] - object.position[1]];
    // An earlier line of working fades back as the next one is written, and stays to be read against it.
    const next = piece.dims
      ? scene.objects
          .filter((one) => one.compositeParent === parent.id && one.id !== object.id)
          .map((one) => ({ one, plan: figurePlan(parent.source, parent.box.w, parent.box.h).pieces.find((p) => `${parent.id}.${p.name}` === one.id) }))
          .filter(({ plan }) => plan?.dims && plan.order > piece.order)
          .sort((a, b) => a.plan!.order - b.plan!.order)[0]
      : undefined;
    const dimAt = next ? pieceEntrance(scene, next.one)?.start : undefined;
    return { ...base, type: "figure", w: object.box.w, h: object.box.h, ops: shiftOps(piece.ops, dx, dy), layer: style.layer, ...(dimAt !== undefined ? { dimAt } : {}) };
  }

  if (object.kind === "svg-part" && object.svgPart) {
    const strokes = partStrokes(object.svgPart, object.box);
    return {
      ...base,
      type: "svg",
      markup: svgPartMarkup(object.svgPart),
      w: object.box.w,
      h: object.box.h,
      clipBox: backdropBand(scene, object),
      ...(strokes.length ? { strokes } : {}),
    };
  }

  switch (source.kind) {
    case "text":
      return {
        ...base,
        type: "text",
        text: wrapLines(source.text, object.size, object.wrap ?? FIT_MAX_W).join("\n"),
        role: source.textRole ?? "body",
        size: object.size,
        color: style.color,
      };
    case "equation":
      return {
        ...base,
        type: "equation",
        tex: source.value,
        size: object.size,
        color: style.color,
        align: "center",
      };
    case "measure":
      return {
        ...base,
        type: "measure",
        value: source.value,
        countFrom: source.countFrom,
        scale: source.scale,
        meter: source.meter,
        unit: source.unit,
        label: source.label,
        decimals: source.decimals,
        commas: source.commas,
        prefix: source.prefix,
        size: object.size,
        color: source.tone ? toneColor(scene.theme, source.tone) : style.color,
        ...(source.quiet ? { quiet: true } : {}),
      };
    case "visual":
      return {
        ...base,
        type: "prop",
        name: source.asset,
        size: object.size,
        angle: object.turned ? (object.angle ?? 0) + object.turned : object.angle,
        color: source.color ?? (assetTakesThemeInk(source.asset) ? style.color : undefined),
        w: object.box.w,
        h: object.box.h,
      };
    case "vector":
      return {
        ...base,
        type: "vector",
        d: source.d,
        fill: source.fill,
        stroke: source.stroke ?? style.color,
        width: source.strokeWidth,
        w: source.width,
        h: source.height,
        scale: source.scale,
        rotate: source.rotate,
      };
    case "svg-composite": {
      const [x, y, width, height] = source.viewBox;
      return {
        ...base,
        type: "svg",
        markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}"></svg>`,
        w: object.box.w,
        h: object.box.h,
      };
    }
    case "image":
      return {
        ...base,
        type: "image",
        src: source.src,
        w: object.box.w,
        h: object.box.h,
        ...(object.turned ? { rotate: (object.turned * Math.PI) / 180 } : {}),
        ...(object.closeUp ? { lens: true } : {}),
      };
    case "svg-artwork": {
      const [x, y, width, height] = parseSvgArtwork(source.svg).value
        ?.viewBox ?? [0, 0, 16, 9];
      return {
        ...base,
        type: "svg",
        markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}"></svg>`,
        w: object.box.w,
        h: object.box.h,
        clipBox: backdropBand(scene, object),
        ...(object.turned ? { rotate: (object.turned * Math.PI) / 180 } : {}),
        ...(object.closeUp ? { lens: true } : {}),
      };
    }
    case "angle": {
      const vertex = object.position;
      const ends = object.endpoints ?? { from: vertex, to: vertex };
      return {
        ...base,
        at: vertex,
        type: "shape",
        shape: "path",
        points: angleArc(vertex, ends.from, ends.to, ANGLE_REACH),
        smooth: false,
        stroke: style.color,
        width: 3,
        layer: style.layer,
        // Redrawn from where its corner and arms are, so it opens and closes as the figure changes shape.
        ...(source.kind === "angle" ? { arc: { at: source.at, from: source.from, to: source.to, reach: ANGLE_REACH, rest: [vertex, ends.from, ends.to] as [Vec2, Vec2, Vec2] } } : {}),
      };
    }
    case "span": {
      const ends = object.endpoints ?? { from: [0, 0] as Vec2, to: [1, 0] as Vec2 };
      return { ...base, ...pinnedEnds(scene, source, ends), type: "group", children: spanStrokes(scene, source, ends, style.color), layer: style.layer };
    }
    case "line": {
      const endpoints = object.endpoints ?? {
        from: [0, 0] as Vec2,
        to: [120, 0] as Vec2,
      };
      return {
        ...base,
        ...pinnedEnds(scene, source, endpoints),
        type: "shape",
        shape: "path",
        points: linePoints(source, endpoints.from, endpoints.to, object.bow),
        smooth: false,
        arrow: source.arrow,
        stroke: calmStroke(scene, style.color),
        width: source.arrow ? Math.max(object.size, ARROW_STROKE) : object.size,
      };
    }
    case "path": {
      const authored = source.stroke === undefined ? style.color : paletteColor(scene.theme, source.stroke);
      const stroke = connector(source) && authored !== undefined ? calmStroke(scene, authored) : authored;
      const fill = source.fill === undefined ? undefined : paletteColor(scene.theme, source.fill);
      const dash = source.appearance === "dashed" ? CURVE_DASH : undefined;
      const pieces = pathSubpaths(object);
      const lastOpen = pieces.map((piece) => piece.closed).lastIndexOf(false);
      const drawn: Component[] = pieces.map((piece, index) => ({
        type: "shape",
        shape: "path",
        points: piece.points.map(([x, y]): Vec2 => [x, y]),
        smooth: false,
        closed: piece.closed,
        fill: piece.closed ? fill : undefined,
        stroke,
        width: source.arrow ? Math.max(style.lineWidth, ARROW_STROKE) : style.lineWidth,
        dash,
        arrow: index === lastOpen ? source.arrow : undefined,
      }));
      const ends = pinnedEnds(scene, source, object.endpoints ?? { from: object.position, to: object.position });
      const figure = figureAtRest(object);
      const named = figure ? { figure: { ...figure, unit: gridUnit(object) } } : {};
      return drawn.length === 1
        ? { ...base, ...ends, ...named, ...drawn[0], layer: style.layer }
        : { ...base, ...ends, ...named, type: "group", children: drawn, layer: style.layer };
    }
    case "shape": {
      const outline = source.appearance === "outline";
      const shaded =
        !outline && (source.appearance === "shaded" || source.shape === "disc");
      // An outlined disc is an outlined circle. Left as a `disc` it reaches the sphere painter, which
      // feeds the "none" fill straight into a canvas gradient stop — that throws, and the throw
      // escapes drawSlideFrame, so the whole frame goes blank from the moment the disc appears.
      const shape =
        outline && source.shape === "disc" ? "circle" : source.shape;
      return {
        ...base,
        type: "shape",
        shape,
        sides: source.sides,
        r: 34 * object.size,
        fill: outline
          ? "none"
          : shaded
            ? [style.color, categoryColor(scene.theme, 1)]
            : style.color,
        stroke: style.color,
        width: style.lineWidth,
        shine: shape === "disc" && shaded,
      };
    }
    case "curve": {
      const scale = 52 * object.size;
      const width = style.lineWidth;
      const dash = source.appearance === "dashed" ? CURVE_DASH : undefined;
      // Aimed at two things, it is drawn as the laid-out points rather than a centred formula, so it
      // starts and ends where it was told to — and so it follows those two if either one moves.
      const anchored = source.placement?.mode === "anchor";
      const laid = object.endpoints || anchored ? curvePoints(scene, object) : undefined;
      // An anchored curve turns about its point and ignores any ends it names, so it is never pinned
      // to them: pinning a closed loop by its coincident first and last samples would drag it away.
      if (laid)
        return {
          ...base,
          ...(anchored ? {} : pinnedEnds(scene, source, object.endpoints ?? { from: laid[0], to: laid[laid.length - 1] })),
          type: "shape",
          shape: "path",
          points: laid,
          smooth: false,
          stroke: style.color,
          width,
          dash,
        };

      return {
        ...base,
        type: "parametric",
        fx: `(${source.x}) * ${scale}`,
        fy: `-(${source.y}) * ${scale}`,
        uDomain: source.domain,
        samples: 96,
        color: style.color,
        width,
        dash,
      };
    }
    case "chart": {
      if (drawnAsFigure(source))
        return { ...base, type: "figure", w: object.box.w, h: object.box.h, ops: figurePlan(source, object.box.w, object.box.h, scene.theme).ops };
      const data =
        "data" in source
          ? source.data.map((datum, index) => ({
              ...datum,
              color: categoryHue(scene, datum.category ?? datum.label, index),
            }))
          : undefined;
      // A title and a source line take bands of the chart's box, and the plot fills what is left — the
      // same box a marker or a tangent laid on the chart is drawn against.
      const plot = figurePlan(source, object.box.w, object.box.h, scene.theme).plot ?? { x: -object.box.w / 2, y: -object.box.h / 2, w: object.box.w, h: object.box.h };
      return {
        ...base,
        at: [object.position[0] + plot.x + plot.w / 2, object.position[1] + plot.y + plot.h / 2],
        type: "chart",
        chart: (source.chart === "donut" ? "pie" : source.chart) as Extract<Component, { type: "chart" }>["chart"],
        data,
        series: "series" in source ? source.series : undefined,
        names: "names" in source ? source.names : undefined,
        trend: "trend" in source ? source.trend : undefined,
        fn: "function" in source ? source.function : undefined,
        // Always given, so the painter draws exactly the rectangles `bar<i>` names.
        n: source.chart === "riemann" ? RECTANGLE_COUNTS[source.rectangles ?? "several"] : undefined,
        xDomain: source.xDomain,
        yDomain: source.yDomain,
        axes: source.axes,
        xLabel: source.xLabel,
        yLabel: source.yLabel,
        donut: source.chart === "donut" ? 0.56 : undefined,
        w: plot.w,
        h: plot.h,
        color: style.color,
      };
    }
    case "legend": {
      const keys = source.categories === "film" ? filmKey(scene) : source.categories;
      return {
        ...base,
        type: "legend",
        categories: keys.map((key) => scene.filmCategories?.find((one) => one.id === key)?.name ?? key),
        colors: keys.map((key, index) => categoryHue(scene, key, index)),
        // A key to faint tints is faint too, so a swatch looks like the wash it names.
        swatchAlpha: source.tint === "faint" ? TINTS.faint : undefined,
        ink: themePalette(scene.theme).ink,
        rowH: 22 * Math.min(object.size, 1.4),
      };
    }
    case "map": {
      const stagger = resolvePace(source.stagger ?? "quick")!;
      const growth = resolvePace(source.growthPace ?? "slow")!;
      const geo = geoPalette(scene.theme);
      return {
        ...base,
        type: "map",
        features: source.features.map(({ id, rings }) => ({ id, rings })),
        featureColors: source.features.some((feature) => feature.value !== undefined) ? valueShades(scene.theme, source.features, landColors(source.features, geo)) : landColors(source.features, geo),
        water: geo.water,
        ink: style.color,
        backdrop: source.role === "background",
        markers: source.markers?.map(({ lon, lat, label, icon, value, category }, index) => ({
          lon,
          lat,
          label,
          icon,
          ...(value !== undefined ? { value, color: category === undefined ? categoryColor(scene.theme, 0) : categoryHue(scene, category, index) } : {}),
        })),
        ...(source.legend ? { legend: { title: source.legend, ...valueRamp(scene.theme, source.features) } } : {}),
        places: source.places,
        flows: source.flows?.map((flow, index) => {
          const pace = resolvePace(flow.pace ?? "normal")!;
          return {
            from: flow.from,
            to: flow.to,
            color: flow.category === undefined ? categoryColor(scene.theme, index) : categoryHue(scene, flow.category, index),
            width: style.lineWidth * 1.4,
            bend:
              flow.bend === "left" ? -0.24 : flow.bend === "right" ? 0.24 : 0,
            at: index * pace.transition,
            dur: pace.duration,
          };
        }),
        outline: source.outline,
        grow: source.growth,
        growDur: growth.duration,
        growFill: categoryColor(scene.theme, 0),
        growStroke: style.color,
        outlineStroke: style.color,
        featureStagger: source.stagger ? stagger.transition : undefined,
        featureDur: source.stagger ? stagger.duration : undefined,
        w: object.box.w,
        h: object.box.h,
      };
    }
    case "timeline": {
      const animated =
        typeof source.playhead === "object" ? source.playhead : undefined;
      const pace = resolvePace(animated?.pace ?? "slow")!;
      return {
        ...base,
        type: "timeline",
        from: source.from,
        to: source.to,
        events: source.events?.map((event) => ({
          at: event.at,
          label: event.label,
          above: event.side !== "below",
          track: event.lane,
        })),
        eras: source.eras?.map((era, index) => ({
          ...era,
          track: era.lane,
          color: categoryHue(scene, era.category ?? era.label, index),
        })),
        lanes: source.lanes,
        links: source.links,
        playhead:
          typeof source.playhead === "number" ? source.playhead : undefined,
        playheadFrom: animated?.from,
        playheadTo: animated?.to,
        playheadOver: animated ? pace.duration : undefined,
        // Drawn in the box the layout gave it: sized again here, the running timeline overran the frame.
        w: object.box.w,
        h: object.box.h,
      };
    }
    case "table": {
      return {
        ...base,
        type: "table",
        rows: source.rows,
        header: source.header,
        w: object.box.w,
        rowH: object.box.h / Math.max(1, source.rows.length),
        colColor: categoryColor(scene.theme, 0),
        ink: style.color,
      };
    }
    case "diagram":
    case "compare":
    case "scale":
    case "evidence":
    case "question":
    case "forces":
    case "working":
      return { ...base, type: "figure", w: object.box.w, h: object.box.h, ops: figurePlan(source, object.box.w, object.box.h, scene.theme).ops };
    case "group": {
      const pace = resolvePace(source.build ?? "normal")!;
      const children = source.children.map((child) => {
        const resolved = inlineObject(child);
        return compileContent(scene, resolved, {
          id: child.id,
          start: 0,
          dur: pace.transition,
          enter: { type: "fade", dur: pace.transition },
          layer: resolveVisualStyle(scene.theme, child.role).layer,
        });
      });
      return {
        ...base,
        type: "group",
        children,
        layout: source.layout,
        gap: 18 * Math.min(object.size, 1.3),
        cols: source.columns,
        build: source.build ? { step: pace.transition } : undefined,
        clip: source.clip,
      };
    }
  }
}

/**
 * When a figure's piece enters: on its own beat, with the piece it follows when that one has a beat of
 * its own (an arrow with the node it points at), or in its turn across the beat the whole is shown on.
 */
function pieceEntrance(scene: ResolvedScene, object: ResolvedObject): { start: number; enter: { type: EnterKind; dur: number } } | undefined {
  const parent = scene.objects.find((one) => one.id === object.compositeParent);
  if (!parent) return undefined;
  const pieces = figurePlan(parent.source, parent.box.w, parent.box.h).pieces;
  const piece = pieces.find((one) => `${parent.id}.${one.name}` === object.id);
  if (!piece) return undefined;
  const shows = scene.beats.flatMap((beat) => beat.actions).filter((action) => action.kind === "show" && action.source.do === "show");
  const showOf = (id: string) => shows.find((action) => action.source.do === "show" && action.source.targets.includes(id));
  const beatEnd = (action: ResolvedAction) => scene.beats.find((beat) => beat.actions.includes(action))?.end ?? action.end;
  const timed = (action: ResolvedAction, start: number, dur: number) => {
    const token = action.source.do === "show" ? action.source.entrance : undefined;
    return { start, enter: token && token !== "draw" ? { type: ENTRANCES[token], dur: token === "instant" ? 0 : dur } : { type: "draw" as const, dur } };
  };
  const own = showOf(object.id) ?? (piece.follows ? showOf(`${parent.id}.${piece.follows}`) : undefined);
  if (own) return timed(own, own.start, piece.long ? Math.max(own.duration, beatEnd(own) - own.start) : Math.max(own.duration, 0.5));
  const whole = showOf(parent.id);
  const lone = lonePieces(parent.source);
  if (!whole || lone.includes(piece.name)) return undefined;
  const alone = (name: string) => lone.includes(name) || showOf(`${parent.id}.${name}`) !== undefined;
  const turns = [...new Set(pieces.filter((one) => !alone(one.name) && !(one.follows && alone(one.follows))).map((one) => one.order))].sort((a, b) => a - b);
  const span = Math.max(whole.duration, beatEnd(whole) - whole.start);
  // Each piece overlaps the next a little, and the last is finished as the beat ends.
  const dur = Math.min(span, 0.9, Math.max(0.35, (span / Math.max(1, turns.length)) * 1.6));
  const step = turns.length > 1 ? Math.max(0, span - dur) / (turns.length - 1) : 0;
  const at = whole.start + turns.indexOf(piece.order) * step;
  return timed(whole, at, piece.long ? whole.start + span - at : dur);
}

function compileObject(
  scene: ResolvedScene,
  object: ResolvedObject,
): Component | undefined {
  if (object.kind === "image-hotspot")
    return compileContent(scene, object, { id: object.id, at: object.position, start: 0, dur: 0, layer: "annotation" });
  const piece = object.kind === "figure-piece" ? pieceEntrance(scene, object) : undefined;
  const initiallyVisible =
    object.kind === "svg-part"
      ? object.svgPart?.initial === "visible" ||
        (object.svgPart?.initial === undefined &&
          object.source.initial === "visible")
      : object.source.initial === "visible" && !(object.kind === "figure-piece" && lonePieces(object.source).some((name) => object.id === `${object.compositeParent}.${name}`));
  // What is on screen from the start is not shown again when one of its pieces or parts arrives.
  const show = object.kind === "figure-piece" || initiallyVisible ? undefined : objectAction(scene, object, "show");
  if (!initiallyVisible && !show && !piece) return undefined;
  const hide = objectAction(scene, object, "hide");
  const enter = piece?.enter ?? entranceFor(object, show);
  const exit = exitFor(hide);
  const start = piece?.start ?? show?.start ?? 0;
  const style = resolveVisualStyle(scene.theme, object.source.role);
  const base = {
    id: object.id,
    at: object.position,
    start,
    dur: enter.dur,
    enter,
    exit,
    // Writing is drawn over every picture, so a picture never covers words, whatever its role.
    layer: WRITING_KINDS.has(object.kind) && style.layer !== "bg" ? "annotation" : style.layer,
    fixed: object.source.space === "screen" || object.source.role === "hud" || furniture(object.source),
    motions: motionsFor(scene, object),
    emphasis: emphasisFor(scene, object),
    fillLevel: fillFor(scene, object),
    plate: overPicture(scene, object) || undefined,
    ...(object.pin ? { pin: object.pin } : {}),
    ...(object.pointer ? { pointer: object.pointer } : {}),
    ...(object.stands ? { carriedBy: [0, object.box.h / 2] as Vec2 } : {}),
  } as const;

  const quiet = object.source.kind === "text" && object.source.emphasis === "quiet" && object.kind === "text";
  const content = compileContent(scene, object, quiet ? { ...base, plate: undefined } : base);
  const hue = object.compositeParent ? undefined : object.source.category;
  const coloured = hue === undefined ? content : inCategory(content, categoryHue(scene, hue, 0));
  return quiet && coloured.type === "text" ? { ...coloured, color: blend(coloured.color ?? themePalette(scene.theme).ink, themePalette(scene.theme).bg, QUIET_BLEND) } : coloured;
}

const WRITING_KINDS: ReadonlySet<string> = new Set(["text", "equation", "measure"]);
// An arrow carries the lesson (a force, a flow, a way to go): drawn at the theme's hairline it was lost on a
// phone, and at 5 every flow on the screen shouted at once.
const ARROW_STROKE = 3;

/** A line or path that joins two things or points somewhere: a connector or an arrow. */
function connector(source: ObjectSpec): boolean {
  return (source.kind === "line" || source.kind === "path") && (source.arrow !== undefined || (source.from !== undefined && source.to !== undefined));
}

/** A connector's resting colour: the accent is kept for the one in focus (`focusLights`), so at rest it is muted. */
function calmStroke(scene: ResolvedScene, color: string): string {
  return color === paletteColor(scene.theme, "accent") ? (paletteColor(scene.theme, "muted") ?? color) : color;
}

// How far quiet writing is blended toward the page: still read, never the first thing seen.
const QUIET_BLEND = 0.4;

/** A drawn thing in its category's colour: writing in it, a stroke drawn in it. Pictures are washed instead (`categoryWashes`). */
function inCategory(component: Component, color: string): Component {
  switch (component.type) {
    case "text":
    case "equation":
    case "measure":
    case "chart":
    case "icon":
    case "parametric":
      return { ...component, color };
    case "shape":
      return { ...component, stroke: color, ...(component.fill !== undefined ? { fill: color } : {}) };
    case "vector":
      return { ...component, stroke: color };
    default:
      return component;
  }
}

/**
 * Whether writing is printed across a picture while both are on screen: across a drawing, text in
 * the ink colour can fall on a dark or busy patch, so it is given a plate of the page to sit on.
 */
function overPicture(scene: ResolvedScene, object: ResolvedObject): boolean {
  const source = object.source;
  if (source.kind !== "text" && source.kind !== "equation" && source.kind !== "measure") return false;
  const times = screenTimes(scene);
  const [from, to] = times.get(object.id) ?? [0, scene.duration];
  const drawn = (other: ResolvedObject) =>
    PICTURE_KINDS.has(other.kind as ObjectSpec["kind"]) || other.rank !== undefined || (other.kind === "path" && other.source.kind === "path" && other.source.fill !== undefined && other.source.fill !== "none");
  const a = object.box;
  return scene.objects.some((other) => {
    if (other.id === object.id || other.compositeParent || !drawn(other)) return false;
    const [otherFrom, otherTo] = times.get(other.id) ?? [0, scene.duration];
    if (otherFrom >= to || from >= otherTo) return false;
    const b = other.box;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return ox > 2 && oy > 2;
  });
}

// What a label steps round when it picks its side: the writing, the pictures it does not name, and the
// other parts of the one it does.
const LABEL_OBSTACLES: ReadonlySet<string> = new Set(["text", "equation", "measure", "image", "chart", "table", "timeline", "map", "visual", "svg-artwork"]);

function labelDirective(
  action: ResolvedAction,
  scene: ResolvedScene,
): Component[] {
  if (action.kind !== "label" || action.source.do !== "label") return [];
  const exitDur = Math.min(0.45, action.duration / 4);
  const source = action.source;
  const owned = scene.objects.find((one) => !one.compositeParent && (source.target === one.id || source.target.startsWith(`${one.id}.`)));
  const ownerHide = owned && objectAction(scene, owned, "hide");
  const until = Math.min(ownerHide ? ownerHide.end : scene.duration, markHidden(scene, source.id, action.start));
  // A label chooses its side at paint time and knew only of other labels, so it landed on the writing
  // around it — and printed across the picture beside the one it names; it is told where the writing
  // and every other picture on screen with it sit.
  const named = action.source.target;
  const avoid = besideObstacles(scene, named, action.start, action.end);
  const outline = named.includes(".") ? partBorder(scene, named) : closedOutline(scene, named);
  return [
    {
      type: "attention",
      verb: "callout",
      target: canonicalTarget(scene, action.source.target),
      text: action.source.text,
      title: action.source.title,
      container: action.source.style ?? "pill",
      avoid,
      // The named thing's own border, so a name that fits inside it is written on it.
      outline,
      // A slanted stroke spans a box far wider than itself, so its name is set by the stroke instead.
      course: named.includes(".") || outline ? undefined : drawnCourse(scene, named),
      fontPx: resolveTextSize(source.size ?? DEFAULT_TEXT_SIZE).px,
      start: action.start,
      dur: Math.min(0.6, action.duration / 3),
      exit: { type: "fade" as const, out: until - exitDur, dur: exitDur },
      layer: "annotation",
    },
  ];
}

/** Where the writing, the pictures not named and the named picture's other parts sit while `named` is marked from `start` to `end`. */
function besideObstacles(scene: ResolvedScene, named: string, start: number, end: number): Box[] {
  const times = screenTimes(scene);
  const owner = named.split(".")[0];
  return scene.objects
    .filter((object) =>
      object.kind === "image-hotspot"
        ? object.id !== named && object.id.startsWith(`${owner}.`)
        : LABEL_OBSTACLES.has(object.kind) && object.id !== owner,
    )
    .filter((object) => {
      const [from, to] = times.get(object.id) ?? [0, scene.duration];
      return from < end && start < to;
    })
    .map(drawnBox);
}

/** The sizes a label is tried at, largest first, from its size word down to that word's floor. */
function labelSizes(size: TextSizeToken | undefined): number[] {
  const { px, floor } = resolveTextSize(size ?? DEFAULT_TEXT_SIZE);
  const sizes: number[] = [];
  for (let at = px; at > floor; at -= 2) sizes.push(at);
  return [...sizes, floor];
}

/** When a `hide` naming a label, strike, tick or trend by its id has taken it off, or never. */
function markHidden(scene: ResolvedScene, id: string | undefined, after: number): number {
  if (id === undefined) return Infinity;
  for (const beat of scene.beats)
    for (const action of beat.actions)
      if (action.source.do === "hide" && action.start >= after && action.source.targets.includes(id)) return action.end;
  return Infinity;
}

/**
 * A strike, tick or trend: drawn on its beat and held until it, or the thing it marks, is hidden. A trend
 * also gives way to the next trend on the same thing, and with no tone settles from the accent to ink when its beat ends.
 */
function markComponent(action: ResolvedAction, scene: ResolvedScene): Component[] {
  const source = action.source;
  if (source.do !== "strike" && source.do !== "tick" && source.do !== "trend") return [];
  const owner = scene.objects.find((one) => !one.compositeParent && (source.target === one.id || source.target.startsWith(`${one.id}.`)));
  const ownerHide = owner && objectAction(scene, owner, "hide");
  const actions = scene.beats.flatMap((beat) => beat.actions);
  const ownHide = actions.find((other) => other.source.do === "hide" && other.start >= action.start && source.id !== undefined && other.source.targets.includes(source.id));
  const nextTrend = source.do === "trend" ? actions.find((other) => other.source.do === "trend" && other.start > action.start && other.source.target === source.target) : undefined;
  const leaves = [ownerHide, ownHide, nextTrend].filter((one) => one !== undefined).sort((a, b) => a.start - b.start)[0];
  const named = scene.objects.find((one) => one.id === source.target);
  const writing = named !== undefined && WRITING_KINDS.has(named.kind);
  return [{
    type: "attention",
    verb: source.do,
    target: canonicalTarget(scene, source.target),
    ...(source.do === "strike" && writing ? { through: true } : {}),
    ...(source.do === "tick" ? { color: categoryColor(scene.theme, 0) } : {}),
    ...(source.do === "trend"
      ? {
          way: source.way,
          color: source.tone ? toneColor(scene.theme, source.tone) : categoryColor(scene.theme, 0),
          settles: source.tone ? undefined : scene.beats.find((beat) => beat.actions.includes(action))?.end,
          avoid: besideObstacles(scene, source.target, action.start, leaves?.end ?? scene.duration),
        }
      : {}),
    outline: partOutline(scene, source.target),
    start: action.start,
    dur: action.duration,
    ...(leaves ? { exit: { type: "fade" as const, out: leaves.start, dur: leaves.duration } } : {}),
    layer: "annotation",
  }];
}

type LabelSource = Extract<ActionSpec, { do: "label" }>;

/** Whether a label names a thing the scene laid out, which the scene's label layout places; a mark of a chart or a term of an equation is placed as it is painted. */
function labelledInPlace(scene: ResolvedScene, action: ResolvedAction): boolean {
  const source = action.source;
  return source.do === "label" && scene.objects.some((one) => one.id === source.target);
}

const LABEL_FRAME = { x: VIEW_INSET, y: VIEW_INSET, w: VIEW_WIDTH - VIEW_INSET * 2, h: VIEW_HEIGHT - VIEW_INSET * 2 };

/**
 * What one thing on screen is drawn as, for a label to keep off: a picture's own outline, the lines of a
 * drawn figure (a label may sit inside another shape, never across its lines), or the box of writing.
 */
function drawnAs(scene: ResolvedScene, object: ResolvedObject): Drawn[] {
  const silhouette = object.kind === "image" ? partOutline(scene, object.id) : undefined;
  if (silhouette) return [{ area: silhouette }];
  if (object.hotspot?.outline) return [{ area: object.hotspot.outline }];
  const pieces = object.kind === "path" ? pathSubpaths(object) : [];
  if (pieces.length > 0) return pieces.map((piece) => ({ stroke: piece.closed ? [...piece.points, piece.points[0]] : piece.points }));
  const course = joinsTwo(object.source) || ["curve", "span", "angle"].includes(object.kind) ? drawnCourse(scene, object.id) : undefined;
  return course && course.length > 1 ? [{ stroke: course }] : [{ box: drawnBox(object) }];
}

// How often a moving thing's pose is sampled for the room a label must leave it.
const SWEEP_STEP = 0.5;

/**
 * What a thing covers on screen through a window of time: drawn at rest and at every pose its motions
 * give it then. A label kept off the bicycle at rest was printed across it once the bicycle leaned.
 */
function sweptAs(scene: ResolvedScene, object: ResolvedObject, [from, to]: [number, number]): Drawn[] {
  const rest = drawnAs(scene, object);
  const motions = motionsFor(scene, object);
  if (!motions?.length) return rest;
  const centre: Vec2 = [object.box.x + object.box.w / 2, object.box.y + object.box.h / 2];
  const steps = Math.min(48, Math.max(1, Math.ceil((to - from) / SWEEP_STEP)));
  const poses = Array.from({ length: steps + 1 }, (_, k) => motionsTransform(motions, object.box, from + ((to - from) * k) / steps, (pos) => restingPoint(scene, pos, object.position)));
  const moved = poses.filter((m) => Math.abs(m.dx) + Math.abs(m.dy) > 0.5 || Math.abs(m.rot) > 0.005 || Math.abs(m.scale - 1) > 0.005);
  return [
    ...rest,
    ...moved.flatMap((m) => {
      const [cos, sin] = [Math.cos(m.rot), Math.sin(m.rot)];
      const place = ([x, y]: Pt): Pt => {
        const [u, v] = [(x - centre[0]) * m.scale, (y - centre[1]) * m.scale];
        return [centre[0] + u * cos - v * sin + m.dx, centre[1] + u * sin + v * cos + m.dy];
      };
      return rest.map((one) => mappedDrawn(one, place));
    }),
  ];
}

/** A drawn shape carried point by point: a box becomes the area it is carried to. */
function mappedDrawn(one: Drawn, place: (point: Pt) => Pt): Drawn {
  return "box" in one ? { area: boxPolygon(one.box).map(place) } : "area" in one ? { area: one.area.map(place) } : { ...one, stroke: one.stroke.map(place) };
}

// A carried name fades out over at most this much of the journey that takes its traveller onto a picture.
const LET_GO = 0.45;

type LabelPiece = { entry: { source: LabelSource; start: number; end: number; key: string }; key: string; window: [number, number]; landed?: Landing; aside?: Aside };
/** Where a picture stepped aside draws a point it holds at rest, and back. */
type Aside = { place: (point: Pt) => Pt; back: (point: Pt) => Pt };

/**
 * The step aside a picture takes, as when it starts and the pose it holds once aside. A name laid where the
 * picture rested was carried with it to the top of the screen and printed over the names laid there.
 */
function stepAside(scene: ResolvedScene, owner: ResolvedObject): { start: number; pose: Aside } | undefined {
  const action = scene.beats.flatMap((beat) => beat.actions).find((one) => one.source.do === "aside" && one.source.target === owner.id);
  if (!action) return undefined;
  const m = motionsTransform(motionsFor(scene, owner), owner.box, action.end, (pos) => restingPoint(scene, pos, owner.position));
  const [cx, cy] = [owner.box.x + owner.box.w / 2, owner.box.y + owner.box.h / 2];
  return {
    start: action.start,
    pose: {
      place: ([x, y]) => [cx + (x - cx) * m.scale + m.dx, cy + (y - cy) * m.scale + m.dy],
      back: ([x, y]) => [cx + (x - cx - m.dx) / m.scale, cy + (y - cy - m.dy) / m.scale],
    },
  };
}

type Landing = { at: number; end: number; offset: Vec2; on: ResolvedObject };

/**
 * The journeys in a window that set a thing down on another picture it was not on before, each with how
 * far it has then travelled from rest. A place (a map) is open ground to write on, so landing on one is none.
 */
function landings(scene: ResolvedScene, object: ResolvedObject, [from, to]: [number, number], times: Map<string, [number, number]>): Landing[] {
  if (object.compositeParent !== undefined || object.kind === "image-hotspot") return [];
  const motions = (motionsFor(scene, object) ?? []).filter((spec) => spec.kind === "move" || spec.kind === "fall" || (spec.kind === "along" && !spec.repeat));
  const centre: Vec2 = [object.box.x + object.box.w / 2, object.box.y + object.box.h / 2];
  const offsetAt = (t: number): Vec2 => {
    const moved = motionsTransform(motions, object.box, t, (pos) => restingPoint(scene, pos, object.position));
    return [moved.dx, moved.dy];
  };
  const pictureUnder = ([dx, dy]: Vec2, t: number) =>
    scene.objects.find((other) => {
      if (other === object || other.compositeParent !== undefined || other.kind !== "image" || other.source.role === "background") return false;
      const [shown, gone] = times.get(other.id) ?? [0, scene.duration];
      const silhouette = other.source.kind === "image" ? other.source.silhouette : undefined;
      const place = silhouette !== undefined && silhouette.length > 2 && polygonArea(silhouette) >= PLACE_SHARE;
      return !place && shown <= t && t < gone && drawnAs(scene, other).some((one) => meets(one, rectAt([centre[0] + dx, centre[1] + dy], [1, 1])));
    });
  const stops: Landing[] = [];
  for (const spec of motions) {
    const at = spec.at ?? 0;
    const end = at + (spec.dur ?? 1);
    if (at <= from || end >= to) continue;
    const offset = offsetAt(end);
    const on = pictureUnder(offset, end);
    if (on && pictureUnder(offsetAt(at), at) !== on) stops.push({ at, end, offset, on });
  }
  return stops;
}

function shiftedDrawn(drawn: Drawn, [dx, dy]: Vec2): Drawn {
  const move = ([x, y]: Pt): Pt => [x + dx, y + dy];
  if ("box" in drawn) return { box: { ...drawn.box, x: drawn.box.x + dx, y: drawn.box.y + dy } };
  return "area" in drawn ? { area: drawn.area.map(move) } : { ...drawn, stroke: drawn.stroke.map(move) };
}

/** The picture both ends of a join are on, when they are on one. */
function joinedWithin(source: ObjectSpec): string | undefined {
  const [from, to] = ["from" in source ? source.from : undefined, "to" in source ? source.to : undefined];
  if (typeof from !== "string" || typeof to !== "string") return undefined;
  const owner = from.split(".")[0];
  return to.split(".")[0] === owner && from.includes(".") && to.includes(".") ? owner : undefined;
}

// A silhouette covering this much of its picture is a place (a map), whose free land and sea take names.
const PLACE_SHARE = 0.85;
// Parts covering this much of a cut-out make it up; below it they sit inside an unnamed whole.
const PARTS_SHARE = 0.3;
const polygonArea = (points: [number, number][]) => Math.abs(points.reduce((sum, [x, y], i) => sum + x * points[(i + 1) % points.length][1] - points[(i + 1) % points.length][0] * y, 0)) / 2;

/**
 * The scene's labels, each written where it reads best: laid out together, so no two print over each
 * other and every pointer label of one picture joins one column. A label stays until the scene ends,
 * and leaves early when it or its target is hidden, or its target is labelled again.
 */
function sceneLabels(scene: ResolvedScene, crowded: string[] = [], spoken: Spoken[] = []): Component[] {
  const times = screenTimes(scene);
  // A part is on screen while it and its picture both are.
  const shownFrom = (target: string): [number, number] => {
    const [own, whole] = [times.get(target) ?? [0, scene.duration], times.get(target.split(".")[0]) ?? [0, scene.duration]];
    return [Math.max(own[0], whole[0]), Math.min(own[1], whole[1])];
  };
  const actions = scene.beats.flatMap((beat) => beat.actions).filter((action) => action.kind === "label" && labelledInPlace(scene, action));
  const entries = actions.map((action, index) => ({ source: action.source as LabelSource, start: action.start, end: action.end, key: `l${index}` }));
  const ownerOf = (target: string) => {
    const object = scene.objects.find((one) => one.id === target)!;
    return scene.objects.find((one) => one.id === (object.compositeParent ?? object.id)) ?? object;
  };
  const asides = entries.map((entry) => stepAside(scene, ownerOf(entry.source.target)));
  // A name given before its picture steps aside leaves as it goes; one given after is laid where the picture then is.
  const until = entries.map((entry, index) => {
    const relabelled = Math.min(...entries.filter((other) => other !== entry && other.source.target === entry.source.target && other.start > entry.start).map((other) => other.start));
    const aside = asides[index];
    const stepped = aside && aside.start > entry.start ? aside.start + LET_GO : Infinity;
    return Math.min(relabelled, stepped, shownFrom(entry.source.target)[1], markHidden(scene, entry.source.id, entry.start), scene.duration);
  });
  // A name carried by a traveller onto another picture would be written on that picture: it lets go as the
  // journey starts and is written again, off the picture with a pointer, once the traveller has landed.
  const pieces = entries.flatMap((entry, index): LabelPiece[] => {
    const object = scene.objects.find((one) => one.id === entry.source.target)!;
    const stops = landings(scene, object, [entry.start, until[index]], times);
    const ends = [...stops.map((stop) => stop.at + Math.min(LET_GO, (stop.end - stop.at) / 2)), until[index]];
    const aside = asides[index] && asides[index]!.start <= entry.start ? asides[index]!.pose : undefined;
    const first: LabelPiece = { entry, key: entry.key, window: [entry.start, ends[0]], ...(aside ? { aside } : {}) };
    return [
      first,
      ...stops.map((stop, k): LabelPiece => ({ entry, key: `${entry.key}.${k}`, window: [stop.end, ends[k + 1]], landed: stop })),
    ].filter((piece) => piece.window[1] - piece.window[0] > 0.05);
  });
  const requests = pieces.map(({ entry, key, window, landed, aside }): LabelRequest => {
    const named = entry.source.target;
    const object = scene.objects.find((one) => one.id === named)!;
    // A mark drawn in a picture is named from that picture's column, the picture kept clear like any other
    // drawing: named from the mark alone, its plate was set on the bicycle just over the mark.
    // So is a join between two parts of one picture, which the names of that picture's parts stand beside.
    const within = object.compositeParent === undefined ? (object.pin?.ref ?? joinedWithin(object.source)) : undefined;
    const host = landed?.on ?? (within === undefined ? undefined : scene.objects.find((one) => one.id === within.split(".")[0] && one.kind === "image"));
    const owner = host ?? scene.objects.find((one) => one.id === (object.compositeParent ?? object.id))!;
    const onScreen = (other: ResolvedObject) => {
      const [from, to] = times.get(other.id) ?? [0, scene.duration];
      return from < window[1] && window[0] < to;
    };
    // Only a traced part has a border to write inside; an untraced one is a place to point at.
    const outline = landed ? undefined : object.kind === "image-hotspot" ? object.hotspot?.outline : closedOutline(scene, named);
    const atRest: Drawn[] = outline ? [{ area: outline }] : landed ? drawnAs(scene, object).map((one) => shiftedDrawn(one, landed.offset)) : drawnAs(scene, object);
    const posed = (shapes: Drawn[]) => (aside ? shapes.map((one) => mappedDrawn(one, aside.place)) : shapes);
    const drawn = posed(atRest);
    const others = scene.objects.filter((other) => !other.compositeParent && other.id !== named && (other.id !== owner.id || host !== undefined) && other.source.role !== "background" && onScreen(other));
    // The picture's other parts are kept off by what is drawn of them: an untraced part's box overlaps its
    // neighbours' and is not a drawing, so it blocks nothing.
    const siblings = scene.objects.filter((other) => other.compositeParent === owner.id && other.id !== named && (other.kind !== "image-hotspot" || other.hotspot?.outline));
    // On a cut-out whose named part sits inside an unnamed whole, a name beside the part stays off the whole.
    const silhouette = owner.source.kind === "image" ? partOutline(scene, owner.id) : undefined;
    const whole = owner.source.kind === "image" && owner.source.silhouette && owner.source.silhouette.length > 2 ? polygonArea(owner.source.silhouette) : 1;
    const parts = owner.source.kind === "image" ? Object.values(owner.source.outlines ?? {}).reduce((sum, points) => sum + polygonArea(points), 0) : 0;
    const inWhole = named !== owner.id && silhouette !== undefined && whole < PLACE_SHARE && parts < PARTS_SHARE * whole;
    // An angle's value is written inside it, on its bisector just past its arc.
    const arc = object.source.kind === "angle" ? drawnCourse(scene, named) : undefined;
    const middle = arc?.[Math.floor(arc.length / 2)];
    const out = middle && Math.hypot(middle[0] - object.position[0], middle[1] - object.position[1]);
    const ray = middle && out ? { origin: object.position, direction: [(middle[0] - object.position[0]) / out, (middle[1] - object.position[1]) / out] as Vec2, reach: out } : undefined;
    return {
      key,
      owner: owner.id,
      drawn,
      writable: outline !== undefined,
      region: object.kind === "image-hotspot",
      ownerBox: aside ? boundsOf(posed([{ box: drawnBox(owner) }]))! : drawnBox(owner),
      ...(silhouette && whole < PLACE_SHARE ? { ownerShape: aside ? silhouette.map((point) => aside.place(point)) : silhouette } : {}),
      text: entry.source.text,
      title: entry.source.title,
      sizes: labelSizes(entry.source.size),
      plated: entry.source.emphasis !== "quiet" && entry.source.style !== "text",
      place: landed ? "pointer" : entry.source.place,
      window,
      obstacles: [
        ...others.flatMap((other) => sweptAs(scene, other, window)),
        ...posed(siblings.flatMap((other) => drawnAs(scene, other))),
        ...spoken.filter((line) => line.window[0] < window[1] && window[0] < line.window[1]).map((line): Drawn => ({ box: line.box })),
      ],
      around: inWhole ? posed([{ area: silhouette }]) : [],
      ...(ray ? { ray } : {}),
    };
  });
  const layouts = layoutLabels(requests, LABEL_FRAME);
  const palette = themePalette(scene.theme);
  const windows = givenWay(pieces, layouts);
  return pieces.flatMap(({ entry, key, landed, aside }): Component[] => {
    const layout = layouts.get(key);
    const window = windows.get(key)!;
    if (!layout) return [];
    if (layout.blocked) crowded.push(`label '${entry.source.text}' on '${entry.source.target}' has no open space beside it and is written across a drawing; show fewer things with it, or name it at another beat`);
    const quiet = entry.source.emphasis === "quiet";
    const length = Math.max(0.01, window[1] - window[0]);
    const fade = Math.min(0.45, length / 4);
    // The callout is carried with its traveller, so a spot laid where it landed is given from where it rests.
    const [dx, dy] = landed?.offset ?? [0, 0];
    const rest = ([x, y]: Pt): Pt => (aside ? aside.back([x, y]) : [x - dx, y - dy]);
    return [{
      type: "attention",
      verb: "callout",
      target: canonicalTarget(scene, entry.source.target),
      text: entry.source.text,
      title: entry.source.title,
      container: quiet ? "text" : (entry.source.style ?? "pill"),
      spot: rest(layout.centre),
      point: rest(layout.point),
      leader: layout.place !== "inside",
      fontPx: layout.fontPx,
      ink: quiet ? blend(palette.ink, palette.bg, QUIET_BLEND) : palette.ink,
      ...(quiet ? { subdued: true, color: palette.muted } : {}),
      start: window[0],
      dur: Math.min(0.6, (entry.end - entry.start) / 3),
      exit: { type: "fade" as const, out: window[1] - fade, dur: fade },
      // Over every picture, whatever layer a picture is drawn on: a name is never painted under one.
      layer: "annotation",
    }];
  });
}

/** A spoken line's block and when it is up, which the scene's labels keep off. */
type Spoken = { box: Rect; window: [number, number] };

type SpeakSource = Extract<ActionSpec, { do: "speak" }>;

// A spoken line is wiped this fast as the next one starts.
const WIPE = 0.25;
// Seconds the voice takes over one word, and how soon after the word before it one word of a clause is written.
const WORD_TIME = 0.4;
const WRITE_STEP = 0.09;
// The share of its beat a line is written across, leaving the last of the beat to read it whole.
const WRITTEN_BY = 0.85;
// The parts a whole picture speaks from, most telling first.
const SPEAKING_PARTS = [/mouth/i, /face/i, /head/i];
// With no such part a picture speaks from its top: the band its head is looked for in, and the height its mouth is taken at.
const TOP_BAND = 0.2;
const TOP_MOUTH = 0.1;
// A listener further aside than this faces the speaker across the screen, not above or below it.
const ACROSS = 40;
// What a line costs on each side, in view units of distance: the side facing the listener is free.
const AWAY_COST = 45;
const ABOVE_COST = 20;
const BELOW_COST = 90;

/** The whole picture a target belongs to. */
function wholeOf(scene: ResolvedScene, target: string): ResolvedObject | undefined {
  const named = scene.objects.find((one) => one.id === target) ?? scene.objects.find((one) => one.id === target.split(".")[0]);
  return named && (scene.objects.find((one) => one.id === named.compositeParent) ?? named);
}

/** Where a speaker's tick points: the part named, else the picture's mouth, face or head, else its top. */
function speakerAim(scene: ResolvedScene, target: string, owner: ResolvedObject): Pt {
  const centre = (one: ResolvedObject): Pt => {
    const box = drawnBox(one);
    return [box.x + box.w / 2, box.y + box.h / 2];
  };
  const named = scene.objects.find((one) => one.id === target);
  if (named && named !== owner) return centre(named);
  const parts = scene.objects.filter((one) => one.compositeParent === owner.id);
  for (const name of SPEAKING_PARTS) {
    const part = parts.find((one) => name.test(one.id.slice(owner.id.length + 1)));
    if (part) return centre(part);
  }
  const box = drawnBox(owner);
  const top = (silhouetteOn(owner) ?? []).filter(([, y]) => y <= box.y + box.h * TOP_BAND);
  return [top.length ? top.reduce((sum, [x]) => sum + x, 0) / top.length : box.x + box.w / 2, box.y + box.h * TOP_MOUTH];
}

/** A picture of a place, a map or a painted scene, which a line is written on as open ground. */
function aPlace(object: ResolvedObject): boolean {
  if (object.kind === "map") return true;
  const silhouette = object.source.kind === "image" ? object.source.silhouette : undefined;
  return silhouette !== undefined && silhouette.length > 2 && polygonArea(silhouette) >= PLACE_SHARE;
}

/** What each side costs a line: the side facing its listener is free, else the side the speaker faces or with more room. */
function speechSides(aim: Pt, owner: ResolvedObject, listener: Pt | undefined): Partial<Record<SpeechSide, number>> {
  const facing = owner.facing === undefined ? 0 : Math.cos((owner.facing * Math.PI) / 180);
  const across = listener !== undefined && Math.abs(listener[0] - aim[0]) > ACROSS;
  const open: "left" | "right" = across ? (listener[0] > aim[0] ? "right" : "left") : facing > 0.5 ? "right" : facing < -0.5 ? "left" : aim[0] <= VIEW_WIDTH / 2 ? "right" : "left";
  const sides: Partial<Record<SpeechSide, number>> = { above: ABOVE_COST, below: BELOW_COST };
  sides[open] = 0;
  sides[open === "right" ? "left" : "right"] = AWAY_COST;
  // A listener straight above is answered upward, across the gap between them.
  if (listener !== undefined && !across && listener[1] < aim[1]) sides.above = 0;
  return sides;
}

/**
 * The scene's spoken lines, each beside its speaker's head and written on clause by clause across its
 * beat. A line is wiped as the first beat of a later narration sentence starts, unless it holds, and as
 * the next line starts; it leaves sooner when it or its speaker is hidden.
 */
function sceneSpeech(scene: ResolvedScene, crowded: string[], spoken: Spoken[]): Component[] {
  const lines = scene.beats.flatMap((beat) => beat.actions.flatMap((action) => (action.source.do === "speak" ? [{ beat, action, source: action.source as SpeakSource }] : [])));
  if (lines.length === 0) return [];
  const times = screenTimes(scene);
  const palette = themePalette(scene.theme);
  const actions = scene.beats.flatMap((beat) => beat.actions);
  const speakers = lines.map(({ source }) => {
    const owner = wholeOf(scene, source.target);
    return owner && { owner, aim: speakerAim(scene, source.target, owner) };
  });
  return lines.flatMap(({ beat, action, source }, index): Component[] => {
    const speaker = speakers[index];
    if (!speaker) return [];
    const { owner, aim } = speaker;
    const ownerHide = objectAction(scene, owner, "hide");
    const ownHide = source.id === undefined ? undefined : actions.find((other) => other.source.do === "hide" && other.start >= action.start && other.source.targets.includes(source.id!));
    const next = lines.slice(index + 1).find((other) => other.action.start > action.start)?.action;
    const sentence = beat.sentence;
    const sentenceOver = source.hold || sentence === undefined ? undefined : scene.beats.slice(scene.beats.indexOf(beat) + 1).find((later) => (later.sentence ?? sentence) > sentence);
    const leave = [
      ...[next, sentenceOver].flatMap((wipe) => (wipe ? [{ out: wipe.start, dur: WIPE }] : [])),
      ...[ownerHide, ownHide].flatMap((hide) => (hide && hide.start >= action.start ? [{ out: hide.start, dur: hide.duration }] : [])),
    ].sort((a, b) => a.out - b.out)[0];
    const window: [number, number] = [action.start, leave ? leave.out + leave.dur : scene.duration];
    const onScreen = (other: ResolvedObject) => {
      const [from, to] = times.get(other.id) ?? [0, scene.duration];
      return from < window[1] && window[0] < to;
    };
    const shown = scene.objects.filter((other) => !other.compositeParent && other.source.role !== "background" && !aPlace(other) && onScreen(other));
    // The listener is whoever else speaks in the scene, else the nearest picture with the speaker.
    const others = speakers.flatMap((one) => (one && one.owner !== owner && onScreen(one.owner) ? [one.aim] : []));
    const company = others.length > 0 ? others : shown.filter((other) => other !== owner && PICTURE_KINDS.has(other.kind as ObjectSpec["kind"])).map((other) => speakerAim(scene, other.id, other));
    const listener = company.sort((a, b) => Math.hypot(a[0] - aim[0], a[1] - aim[1]) - Math.hypot(b[0] - aim[0], b[1] - aim[1]))[0];
    const words = speechWords(source.text);
    const layout = layoutSpeech({ aim, words, sides: speechSides(aim, owner, listener), obstacles: shown.flatMap((other) => sweptAs(scene, other, window)) }, LABEL_FRAME);
    if (layout.blocked) crowded.push(`spoken line '${source.text}' of '${source.target}' has no open space beside or above its speaker and is written across a drawing; give the speaker room beside its head, or show fewer things with it`);
    spoken.push({ box: rectAt(layout.centre, layout.size), window });
    // Written chunk by chunk as the voice reaches it: a clause, or a row of a long one, at a time.
    const rowStarts = layout.rows.map((_, row) => layout.rows.slice(0, row).reduce((sum, one) => sum + one.length, 0));
    const chunks = [...new Set([...clauseStarts(words), ...rowStarts])].sort((a, b) => a - b);
    const room = Math.max(WRITE_STEP * words.length, Math.min(beat.end, leave?.out ?? Infinity) - action.start);
    const span = Math.min(room * WRITTEN_BY, words.length * WORD_TIME);
    const voiced = (word: number) => action.start + (span * word) / words.length;
    const reveal = words.map((_, word) => {
      const first = chunks.filter((start) => start <= word).at(-1) ?? 0;
      const after = chunks.find((start) => start > word);
      return Math.min(voiced(first) + (word - first) * WRITE_STEP, after === undefined ? Infinity : voiced(after));
    });
    const stressed = source.stress === undefined ? undefined : stressedWords(words, source.stress);
    return [{
      type: "attention",
      verb: "speech",
      target: canonicalTarget(scene, owner.id),
      spot: layout.centre,
      point: aim,
      fontPx: layout.fontPx,
      ink: palette.ink,
      color: palette.accent,
      speech: { rows: layout.rows, reveal, ...(stressed ? { stressed } : {}), size: layout.size, align: layout.side === "right" ? "left" : layout.side === "left" ? "right" : "center" },
      start: action.start,
      dur: 0,
      ...(leave ? { exit: { type: "fade" as const, out: leave.out, dur: leave.dur } } : {}),
      layer: "annotation",
    }];
  });
}

// A name giving way to a newer one written over it is gone this long after the newer one starts.
const GIVE_WAY = 0.3;

/**
 * Each label's time on screen, with an older one ending as a newer one is written where it stands: with
 * no open space left, three names round one small picture were printed over one another.
 */
function givenWay(pieces: LabelPiece[], layouts: Map<string, LabelLayout>): Map<string, [number, number]> {
  const windows = new Map(pieces.map((piece) => [piece.key, [...piece.window] as [number, number]]));
  const plate = (key: string) => {
    const layout = layouts.get(key);
    return layout && rectAt(layout.centre, layout.size);
  };
  const ordered = [...pieces].sort((a, b) => a.window[0] - b.window[0]);
  ordered.forEach((newer, index) => {
    const over = plate(newer.key);
    if (!over) return;
    for (const older of ordered.slice(0, index)) {
      const window = windows.get(older.key)!;
      const under = plate(older.key);
      if (!under || window[0] >= newer.window[0] || window[1] <= newer.window[0] || !meets({ box: under }, over)) continue;
      windows.set(older.key, [window[0], Math.max(window[0] + 0.05, newer.window[0] + GIVE_WAY)]);
    }
  });
  return windows;
}

/** A drawn path's border when it is one closed piece, such as a square built on a side. */
function closedOutline(scene: ResolvedScene, target: string): Vec2[] | undefined {
  const drawn = scene.objects.find((one) => one.id === target);
  const pieces = drawn ? pathSubpaths(drawn) : [];
  return pieces.length === 1 && pieces[0].closed ? pieces[0].points.map(([x, y]): Vec2 => [x, y]) : undefined;
}

/** When each object is on screen: from the start of its show, or the scene's, to the end of its hide, or the scene's. */
function screenTimes(scene: ResolvedScene): Map<string, [number, number]> {
  const times = new Map<string, [number, number]>(scene.objects.map((object) => [object.id, [0, scene.duration]]));
  for (const beat of scene.beats) {
    for (const action of beat.actions) {
      const source = action.source;
      if (source.do !== "show" && source.do !== "hide") continue;
      for (const target of source.targets) {
        const [from, to] = times.get(target) ?? [0, scene.duration];
        times.set(target, source.do === "show" ? [action.start, to] : [from, action.end]);
      }
    }
  }
  return times;
}

function seedFor(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function targetRadius(scene: ResolvedScene, target: string): number {
  const exact = scene.objects.find((candidate) => candidate.id === target);
  const id = target.includes(".")
    ? target.slice(0, target.indexOf("."))
    : target;
  const object =
    exact ?? scene.objects.find((candidate) => candidate.id === id);
  return object
    ? Math.max(18, Math.min(150, Math.hypot(object.box.w, object.box.h) / 2))
    : 36;
}

/**
 * Colours a map reads by: distinct earth tones for land, one blue for anything that is water, on a
 * sea the theme's paper can carry. Features that share a `category` share a colour, so a writer
 * colours "the neighbours" alike by naming them alike.
 */
const WATER_WORDS = /sea|ocean|water|lake|gulf|bay|strait|river|canal|delta|lagoon|channel|sound/i;

function geoPalette(theme: ThemeName): { water: string; land: string[] } {
  const dark = theme !== "PARCHMENT";
  return dark
    ? { water: "#1f4f73", land: ["#c9a96e", "#8fae7a", "#b98b6a", "#9aa3b5", "#c17c6d", "#7fa6a0", "#a98bb3"] }
    : { water: "#a9cbe0", land: ["#d7b77c", "#9dbf88", "#c8987a", "#a9b3c4", "#cf8f80", "#8fb8b1", "#b79cc0"] };
}

function landColors(features: Array<{ id: string; category?: string }>, geo: { water: string; land: string[] }): string[] {
  const shades = new Map<string, string>();
  return features.map((feature) => {
    const key = feature.category ?? feature.id;
    if (WATER_WORDS.test(key)) return geo.water;
    const shade = shades.get(key) ?? geo.land[shades.size % geo.land.length];
    shades.set(key, shade);
    return shade;
  });
}

/**
 * A data map's colours: every valued region on one scale from the paper's own shade (least) to the
 * accent (most), in five steps a reader can tell apart; a region without a value keeps its land colour.
 */
function valueShades(theme: ThemeName, features: Array<{ value?: number }>, land: string[]): string[] {
  const values = features.flatMap((feature) => (feature.value === undefined ? [] : [feature.value]));
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const steps = SHADE_STEPS.map((step) => shade(theme, step));
  return features.map((feature, index) => {
    if (feature.value === undefined) return land[index];
    return steps[high > low ? Math.round(((feature.value - low) / (high - low)) * 4) : 4];
  });
}

const SHADE_STEPS = [0, 0.25, 0.5, 0.75, 1];

function shade(theme: ThemeName, step: number): string {
  const palette = paletteRgb(theme);
  const mix = palette.surface.map((c, k) => Math.round(c + (palette.accent[k] - c) * (0.15 + 0.85 * step)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** The ramp a data map's key shows: its five shades, lightest first, from the lowest value to the highest. */
function valueRamp(theme: ThemeName, features: Array<{ value?: number }>): { ramp?: { low: number; high: number; colors: string[] } } {
  const values = features.flatMap((feature) => (feature.value === undefined ? [] : [feature.value]));
  if (values.length === 0) return {};
  return { ramp: { low: Math.min(...values), high: Math.max(...values), colors: SHADE_STEPS.map((step) => shade(theme, step)) } };
}

function paletteRgb(theme: ThemeName): { surface: number[]; accent: number[] } {
  const hex = (value: string) => [0, 2, 4].map((i) => parseInt(value.replace("#", "").slice(i, i + 2), 16));
  const palette = themePalette(theme);
  return { surface: hex(palette.surface), accent: hex(palette.accent) };
}

function canonicalTarget(scene: ResolvedScene, target: string): string {
  const split = target.indexOf(".");
  if (split < 1) return target;
  const object = scene.objects.find(
    (candidate) => candidate.id === target.slice(0, split),
  );
  return object?.source.kind === "map" ? target.slice(split + 1) : target;
}

// The share of the frame a part fills in a close and a detail shot, the most it ever fills so what is round it
// stays in view, and the furthest a picture is magnified.
const PART_FILL = new Map([[resolveShot("close")!.zoom, 0.5], [resolveShot("detail")!.zoom, 0.6]]);
const PART_FILL_MAX = 0.6;
const PART_ZOOM_MAX = 3;
// View units one of a picture's own pixels may cover, about a point on a phone: closer, the picture's pixels show.
const PIXEL_REACH = 1.4;

/**
 * The zoom a shot may reach on this target: the shot's own (closer on a small part), capped where the target — and any other
 * picture drawn over the target's spot when the move lands — fits the frame with a margin. A close-up
 * on the heart in a body, as a picture of the heart irised in over it, cut the new heart's edges off.
 */
function fittedZoom(scene: ResolvedScene, target: string, shot: number, landing: number): number {
  const aimed = scene.objects.find((object) => object.id === target);
  if (!aimed) return shot;
  // A part is shot by its own size: at the shot's fixed zoom, the stomach in a whole body stayed a speck.
  const fill = aimed.compositeParent === undefined ? undefined : PART_FILL.get(shot);
  const filling = Math.min(VIEW_WIDTH / aimed.box.w, VIEW_HEIGHT / aimed.box.h);
  const wanted = fill === undefined ? shot : Math.max(shot, Math.min(PART_ZOOM_MAX, fill * filling));
  // Pushed in on a cell of a comb filling the screen, the shot came to rest on nothing but magnified texture.
  const most = aimed.compositeParent === undefined ? Infinity : PART_FILL_MAX * filling;
  const owner = target.split(".")[0];
  const picture = scene.objects.find((object) => object.id === owner);
  const pixels = picture?.source.kind === "image" ? imageSourceSize(picture.source.src) : undefined;
  const sharp = pixels && picture ? (PIXEL_REACH * pixels.width) / picture.box.w : Infinity;
  const [cx, cy] = [aimed.box.x + aimed.box.w / 2, aimed.box.y + aimed.box.h / 2];
  const times = screenTimes(scene);
  const over = scene.objects.filter((object) => {
    if (object.compositeParent || object.id === owner || object.kind !== "image") return false;
    const [from, to] = times.get(object.id) ?? [0, scene.duration];
    const box = drawnBox(object);
    return from <= landing && landing < to && cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
  });
  const margin = 64;
  const fits = Math.min(...[aimed.box, ...over.map(drawnBox)].map((box) => Math.min(VIEW_WIDTH / (box.w + margin), VIEW_HEIGHT / (box.h + margin))));
  return Math.max(1, Math.min(wanted, fits, most, sharp));
}

function compileAction(
  action: ResolvedAction,
  scene: ResolvedScene,
): Component[] {
  if (action.kind === "camera" && action.source.do === "camera") {
    const zoom = fittedZoom(scene, action.source.target, action.shot.zoom, action.end);
    const push: Component = {
      type: "camera",
      to: canonicalTarget(scene, action.source.target),
      zoom,
      kind: action.source.movement === "push" ? "pushIn" : action.source.movement === "arc" ? "arc" : "move",
      start: action.start,
      dur: action.duration,
    };
    // A close-up lets go of its subject when the scene hides it, or when the story moves on to
    // another drawn thing — otherwise the reader is left staring at a magnified patch while
    // whatever comes next appears out of frame.
    const owner = action.source.target.split(".")[0];
    const drawn = (id: string) => {
      const source = scene.objects.find((one) => one.id === id.split(".")[0])?.source;
      return source !== undefined && !joinsTwo(source) && !["text", "equation", "span", "angle", "curve", "measure", "legend"].includes(source.kind);
    };
    const later = scene.beats.flatMap((beat) => beat.actions).filter((other) => other.start > action.start);
    const hidden = later.find((other) => other.source.do === "hide" && other.source.targets.some((id) => id === owner || id.startsWith(`${owner}.`)));
    // Writing shown outside the shot lets go too: a term put in the footer under a close-up was never seen.
    const aimedId = action.source.target;
    const aimed = scene.objects.find((one) => one.id === aimedId)?.box;
    const outOfShot = (id: string) => {
      const box = scene.objects.find((one) => one.id === id)?.box;
      if (!aimed || !box) return false;
      const [cx, cy, halfW, halfH] = [aimed.x + aimed.w / 2, aimed.y + aimed.h / 2, VIEW_WIDTH / zoom / 2, VIEW_HEIGHT / zoom / 2];
      return box.x < cx - halfW || box.x + box.w > cx + halfW || box.y < cy - halfH || box.y + box.h > cy + halfH;
    };
    const elsewhere = later.find((other) => other.source.do === "show" && other.source.targets.some((id) => id.split(".")[0] !== owner && (drawn(id) || outOfShot(id))));
    const release = [hidden, elsewhere].filter((one) => one !== undefined).sort((a, b) => a.start - b.start)[0];
    if (!release) return [push];
    return [push, { type: "camera", to: "center", zoom: 1, kind: "move", start: release.start, dur: Math.max(0.3, Math.min(0.8, release.duration)) }];
  }
  if (action.kind === "tour" && action.source.do === "tour") {
    const components: Component[] = [];
    action.stops.forEach((stop) => {
      components.push({
        type: "camera",
        to: canonicalTarget(scene, stop.target),
        zoom: fittedZoom(scene, stop.target, stop.shot.zoom, stop.moveEnd),
        kind: "move",
        start: stop.moveStart,
        dur: stop.moveEnd - stop.moveStart,
      });
      components.push({
        type: "attention",
        verb: "callout",
        target: canonicalTarget(scene, stop.target),
        text: stop.label,
        container: "pill",
        start: stop.labelStart,
        dur: Math.min(0.55, stop.labelEnd - stop.labelStart),
        exit: {
          type: "fade",
          out: stop.labelEnd,
          dur: stop.exitEnd - stop.labelEnd,
        },
        layer: "annotation",
      });
    });
    if (action.returnStart !== undefined && action.returnEnd !== undefined) {
      components.push({
        type: "camera",
        to: "center",
        zoom: 1,
        kind: "move",
        start: action.returnStart,
        dur: action.returnEnd - action.returnStart,
      });
    }
    return components;
  }
  if (action.kind === "attention" && action.source.do === "attention") {
    const side = {
      auto: undefined,
      north: "n",
      south: "s",
      east: "e",
      west: "w",
    }[action.source.side ?? "auto"] as "n" | "s" | "e" | "w" | undefined;
    const route = {
      auto: undefined,
      straight: "straight",
      elbow: "elbow",
      curve: "curve",
    }[action.source.route ?? "auto"] as
      | "straight"
      | "elbow"
      | "curve"
      | undefined;
    const source = action.source;
    // A linked cue lights the matching part of each thing named with the target at the same moment;
    // only the first of them softens the rest of the screen, so the others are glowed.
    const linked = source.verb === "pointer" ? [] : (source.with ?? []);
    const owners = new Set([source.target, ...linked].map((target) => target.split(".")[0]));
    // A struck-through term stays struck for as long as its equation is shown.
    const struck = (target: string) => {
      const owner = scene.objects
        .filter((one) => !one.compositeParent && (target === one.id || target.startsWith(`${one.id}.`)))
        .sort((a, b) => b.id.length - a.id.length)[0];
      const hide = owner && objectAction(scene, owner, "hide");
      return hide ? { type: "fade" as const, out: hide.start, dur: hide.duration } : undefined;
    };
    return [source.target, ...linked].map((target, index): Component => ({
      type: "attention",
      verb: index > 0 && source.verb === "dim" ? "outline" : source.verb,
      target: canonicalTarget(scene, target),
      from: source.from && index === 0 ? canonicalTarget(scene, source.from) : undefined,
      text: index === 0 ? source.text : undefined,
      title: index === 0 ? source.title : undefined,
      ...(index === 0 && (source.text || source.title) ? { fontPx: resolveTextSize(DEFAULT_TEXT_SIZE).px } : {}),
      side,
      route,
      container: source.style,
      color: categoryColor(scene.theme, 0),
      radius: targetRadius(scene, target),
      outline: partOutline(scene, target),
      ...(source.verb === "dim" && index === 0 ? { others: otherPictures(scene, target).filter((id) => !owners.has(id)) } : {}),
      ...(source.verb === "trace" || source.verb === "outline" ? { course: drawnCourse(scene, target) } : {}),
      ...siblingPieces(scene, target),
      start: action.start,
      dur: action.duration,
      exit:
        source.verb === "cancel"
          ? struck(target)
          : {
              type: "fade",
              out: action.end,
              dur: Math.min(0.45, action.duration / 3),
            },
      layer: "annotation",
    }));
  }
  if (action.kind === "effect" && action.source.do === "effect") {
    const intensity = STRENGTH[action.source.intensity ?? "normal"];
    const seed = seedFor(`${scene.id}:${action.start}:${action.source.effect}`);
    const common = {
      start: action.start,
      dur: action.duration,
      exit: {
        type: "fade" as const,
        out: action.end,
        dur: Math.min(0.5, action.duration / 3),
      },
      layer: "fx" as const,
    };
    if (action.source.effect === "particles") {
      return [
        {
          ...common,
          type: "particles",
          at: canonicalTarget(scene, action.source.target),
          preset: action.source.preset ?? "energy",
          seed,
          config: {
            count: Math.round(24 * intensity),
            rate: Math.round(20 * intensity),
          },
        },
      ];
    }
    if (action.source.effect === "glow") {
      return [
        {
          ...common,
          type: "glow",
          at: canonicalTarget(scene, action.source.target),
          r: targetRadius(scene, action.source.target) * intensity,
          color: categoryColor(scene.theme, 0),
        },
      ];
    }
    return [
      {
        ...common,
        type: "flow",
        from: canonicalTarget(scene, action.source.from),
        to: canonicalTarget(scene, action.source.to),
        rate: 18 * intensity,
        seed,
        color: categoryColor(scene.theme, 0),
      },
    ];
  }
  if (action.kind === "strike" || action.kind === "tick" || action.kind === "trend") return markComponent(action, scene);
  return action.kind === "label" && !labelledInPlace(scene, action) ? labelDirective(action, scene) : [];
}


/** The other data pieces of the chart a piece belongs to — its other bars, rows or bins — which a cue on it fades back. */
function siblingPieces(scene: ResolvedScene, target: string): { soften?: string[] } {
  const piece = scene.objects.find((one) => one.id === target && one.kind === "figure-piece");
  const chart = piece && scene.objects.find((one) => one.id === piece.compositeParent && one.source.kind === "chart");
  const name = (one: ResolvedObject) => one.id.slice(chart!.id.length + 1);
  if (!piece || !chart || !chartDataPiece(name(piece))) return {};
  const soften = scene.objects.filter((one) => one.compositeParent === chart.id && one !== piece && chartDataPiece(name(one))).map((one) => one.id);
  return soften.length ? { soften } : {};
}

/** A faded copy of a thing's old form, left through the beat it changes shape in and a moment after. */
function morphGhosts(scene: ResolvedScene, objects: Component[]): Component[] {
  const ghosts = new Map<string, number>();
  return scene.beats.flatMap((beat) =>
    beat.actions.flatMap((action): Component[] => {
      const source = action.source;
      if (source.do !== "motion" || source.motion !== "morph" || !source.ghost) return [];
      const was = objects.find((one) => one.id === source.target);
      if (!was) return [];
      const count = (ghosts.get(source.target) ?? 0) + 1;
      ghosts.set(source.target, count);
      // The old form is what the morphs before this one made of it, not the shape it was first drawn in.
      const before = was.motions?.filter((motion) => motion.kind === "morph" && (motion.at ?? 0) < action.start);
      return [{ ...was, id: `${source.target}~was${count > 1 ? count : ""}`, motions: before?.length ? before : undefined, emphasis: undefined, start: action.start, dur: 0, enter: { type: "none", dur: 0 }, exit: { type: "fade", out: beat.end + 0.8, dur: 0.6 }, ghost: 0.3 } as Component];
    }),
  );
}

/**
 * While the subject is being explained — pointed at or named — the pictures helping it soften toward
 * the page, so the eye stays on the subject; a `dim` in the same beat already does this itself.
 */
function softenedHelpers(scene: ResolvedScene): Component[] {
  const leads = new Set(scene.objects.filter((one) => one.rank === "lead" || one.rank === "colead").map((one) => one.id));
  const helpers = scene.objects.filter((one) => one.rank === "second" && !one.compositeParent);
  if (leads.size === 0 || helpers.length === 0) return [];
  const times = screenTimes(scene);
  return scene.beats.flatMap((beat): Component[] => {
    if (beat.actions.some((action) => action.source.do === "attention" && action.source.verb === "dim")) return [];
    const explained = beat.actions.flatMap((action) => {
      const source = action.source;
      const lead = source.do === "attention" || source.do === "label" ? source.target.split(".")[0] : undefined;
      return lead !== undefined && leads.has(lead) ? [{ action, lead }] : [];
    });
    if (explained.length === 0) return [];
    const start = Math.min(...explained.map((mark) => mark.action.start));
    const end = Math.max(...explained.map((mark) => mark.action.end));
    const others = helpers.filter((one) => {
      const [from, to] = times.get(one.id) ?? [0, scene.duration];
      return from < end && start < to;
    });
    if (others.length === 0) return [];
    const fade = Math.min(0.45, (end - start) / 3);
    return [{ type: "attention", verb: "dim", quiet: true, target: explained[0].lead, others: others.map((one) => one.id), start, dur: fade, exit: { type: "fade", out: end - fade, dur: fade }, layer: "annotation" }];
  });
}

function compileScene(scene: ResolvedScene, crowded: string[] = []): Film {
  const marker: SceneMarker = {
    type: "scene",
    duration: scene.duration,
    theme: scene.theme,
  };
  const twins = twinConnectors(scene);
  const objects = underWalkers(scene)
    .filter((object) => !twins.has(object.id))
    .map((object) => compileObject(scene, object))
    .filter((object): object is Component => object !== undefined);
  const directives = scene.beats.flatMap((beat) =>
    beat.actions.flatMap((action) => compileAction(action, scene)),
  );
  const spoken: Spoken[] = [];
  const speech = sceneSpeech(scene, crowded, spoken);
  const labels = sceneLabels(scene, crowded, spoken);
  return [marker, ...morphGhosts(scene, objects), ...objects, ...focusLights(scene, objects), ...categoryWashes(scene, objects), ...directives, ...labels, ...speech, ...softenedHelpers(scene), ...shotsFor(scene, [...labels, ...speech])];
}

// Two connectors whose courses lie this close on average, in view units or as a share of their length, are one drawn twice.
const TWIN_GAP = 16;
const TWIN_SHARE = 0.08;
const TWIN_SAMPLES = 24;
// Seconds two connectors must share the screen for to be drawn twice.
const TWIN_TOGETHER = 1;

/**
 * The connectors that repeat one drawn before them while both are on screen: the same way between the
 * same ends, nearly on top of it. Only the first is drawn; a second curve laid a hair beside a flow read
 * as a smudge, not as how wide the flow was.
 */
function twinConnectors(scene: ResolvedScene): Set<string> {
  const times = screenTimes(scene);
  const along = (points: Vec2[]): Vec2[] => {
    const lengths = polylineLengths(points);
    const total = lengths[lengths.length - 1];
    return Array.from({ length: TWIN_SAMPLES + 1 }, (_, index) => {
      const at = (total * index) / TWIN_SAMPLES;
      const k = Math.max(1, lengths.findIndex((length) => length >= at));
      const span = lengths[k] - lengths[k - 1] || 1;
      const t = Math.min(1, Math.max(0, (at - lengths[k - 1]) / span));
      return [points[k - 1][0] + (points[k][0] - points[k - 1][0]) * t, points[k - 1][1] + (points[k][1] - points[k - 1][1]) * t];
    });
  };
  const kept: { id: string; course: Vec2[]; length: number }[] = [];
  const twins = new Set<string>();
  for (const object of scene.objects) {
    if (object.compositeParent || !connector(object.source) || !object.endpoints) continue;
    const points = object.source.kind === "path" ? pathSubpaths(object)[0]?.points.map(([x, y]): Vec2 => [x, y]) : linePoints(object.source, object.endpoints.from, object.endpoints.to, object.bow);
    if (!points || points.length < 2) continue;
    const course = along(points);
    const length = polylineLengths(points).at(-1) ?? 0;
    const [from, to] = times.get(object.id) ?? [0, scene.duration];
    const twin = kept.some((other) => {
      const [otherFrom, otherTo] = times.get(other.id) ?? [0, scene.duration];
      // One handed over to the other (the flow hidden as its smaller self is shown) is a change, not a twin.
      if (Math.min(to, otherTo) - Math.max(from, otherFrom) < TWIN_TOGETHER) return false;
      const gap = course.reduce((sum, [x, y], index) => sum + Math.hypot(x - other.course[index][0], y - other.course[index][1]), 0) / course.length;
      return gap < Math.max(TWIN_GAP, TWIN_SHARE * Math.min(length, other.length));
    });
    if (twin) twins.add(object.id);
    else kept.push({ id: object.id, course, length });
  }
  return twins;
}

// How a connector comes into focus when it is marked, and settles back to its resting colour after.
const FOCUS_RISE = 0.25;
const FOCUS_SETTLE = 0.45;

/**
 * The accent laid over a connector while it is in focus: as it is drawn on, through the beat that draws it,
 * and through any beat that marks it (a `trace` runs its own colour). Every flow held in the accent at once
 * was noise: the one being talked about could not be told from the rest.
 */
function focusLights(scene: ResolvedScene, compiled: Component[]): Component[] {
  const accent = paletteColor(scene.theme, "accent");
  const calm = [paletteColor(scene.theme, "muted"), paletteColor(scene.theme, "ink")];
  if (accent === undefined) return [];
  const lit = (component: Component): Component =>
    component.type === "shape" ? { ...component, stroke: accent } : component.type === "group" ? { ...component, children: component.children.map(lit) } : component;
  const strokes = (component: Component): (string | undefined)[] =>
    component.type === "shape" ? [component.stroke] : component.type === "group" ? component.children.flatMap(strokes) : [undefined];
  const beatEnd = (action: ResolvedAction) => scene.beats.find((beat) => beat.actions.includes(action))?.end ?? action.end;
  const actions = scene.beats.flatMap((beat) => beat.actions);
  return scene.objects.flatMap((object): Component[] => {
    if (object.compositeParent || !connector(object.source)) return [];
    const drawn = compiled.find((one) => one.id === object.id);
    // A connector in a colour of its own (the red of a fall, a category's hue) already says what it is.
    if (!drawn || !strokes(drawn).every((stroke) => calm.includes(stroke))) return [];
    const gone = objectAction(scene, object, "hide")?.start ?? Infinity;
    const show = drawn.enter && drawn.enter.type !== "none" ? objectAction(scene, object, "show") : undefined;
    const marks = actions.filter((action) => (action.source.do === "emphasize" || (action.source.do === "attention" && action.source.verb !== "trace")) && action.source.target === object.id);
    const windows = [
      ...(show && drawn.enter ? [{ from: show.start, until: beatEnd(show), enter: drawn.enter }] : []),
      ...marks.map((action) => ({ from: action.start, until: beatEnd(action), enter: { type: "fade" as const, dur: FOCUS_RISE } })),
    ];
    return windows.flatMap(({ from, until, enter }, index): Component[] => {
      const out = Math.min(until, gone);
      if (out <= from) return [];
      return [{ ...lit(drawn), id: `${object.id}~focus${index === 0 ? "" : index}`, start: from, dur: enter.dur ?? 0, enter, exit: { type: "fade", out, dur: FOCUS_SETTLE } }];
    });
  });
}

/** The scene's objects in paint order, each walked route moved just under the first thing that walks it: the road is never drawn across the rat on it. */
function underWalkers(scene: ResolvedScene): ResolvedObject[] {
  const ordered = [...scene.objects];
  for (const { source } of scene.beats.flatMap((beat) => beat.actions)) {
    if (source.do !== "motion" || source.motion !== "along" || source.along === undefined) continue;
    const [route, walker] = [ordered.findIndex((one) => one.id === source.along), ordered.findIndex((one) => one.id === source.target)];
    if (route > walker && walker !== -1) ordered.splice(walker, 0, ...ordered.splice(route, 1));
  }
  return ordered;
}

/**
 * The camera a scene runs itself: a strip subject's close shots, or else the shots that bring what is on
 * screen up to fill it, broken off wherever a beat is about something small beside a bigger picture. A
 * writer's own camera is never second-guessed.
 */
function shotsFor(scene: ResolvedScene, labels: Component[]): Component[] {
  if (scene.beats.some((beat) => beat.actions.some((action) => action.source.do === "camera" || action.source.do === "tour"))) return [];
  const strip = stripShots(scene, labels);
  return strip.length > 0 ? strip : focusShots(scene, labels, fillShots(scene, labels));
}

type Plate = { from: number; to: number; box: Box; target: string };
type Shot = Extract<Component, { type: "camera" }> & { start: number };

/** Each name a label puts up, and each spoken line: the box of its plate or words, what it names or who speaks, and from when until when it is up. */
function labelPlates(scene: ResolvedScene, labels: Component[]): Plate[] {
  return labels.flatMap((label) => {
    if (label.type !== "attention" || !Array.isArray(label.spot) || typeof label.start !== "number") return [];
    const to = label.exit?.out === undefined ? scene.duration : label.exit.out + (label.exit.dur ?? 0);
    if (label.verb === "speech" && label.speech) return [{ from: label.start, to, box: rectAt(label.spot as Vec2, label.speech.size), target: String(label.target) }];
    return label.verb === "callout" && typeof label.text === "string"
      ? [{ from: label.start, to, box: rectAt(label.spot as Vec2, [label.text.length * (label.fontPx ?? 20) * 0.55 + 24, (label.fontPx ?? 20) * 1.6]), target: String(label.target) }]
      : [];
  });
}

/** What a thing covers through a window of time, at every pose its motions give it then. */
function coverOf(scene: ResolvedScene, one: ResolvedObject, from: number, to: number): Box {
  return boundsOf(sweptAs(scene, one, [from, to])) ?? drawnBox(one);
}

/** A name goes wherever what it names is carried: its plate is swept along with it. */
function plateOver(scene: ResolvedScene, plate: Plate, from: number, to: number): Box {
  const owner = scene.objects.find((one) => one.id === plate.target.split(".")[0]);
  if (!owner) return plate.box;
  const [rest, now] = [drawnBox(owner), coverOf(scene, owner, from, to)];
  return boundsOfBoxes([plate.box, { ...plate.box, x: plate.box.x + now.x - rest.x, y: plate.box.y + now.y - rest.y }, { ...plate.box, x: plate.box.x + now.x + now.w - rest.x - rest.w, y: plate.box.y + now.y + now.h - rest.y - rest.h }]);
}

// Under this share of the frame, what a beat is about is lost beside a picture at least twice its size.
const FOCUS_SMALL = 0.35;
// The share of the frame a followed thing is brought up to; the rest of the shot is what stands round it.
const FOCUS_FILL = 0.6;
const FOCUS_ZOOM_MAX = 2.5;
// A shot that comes in less than this far past the screen it leaves is not worth the move.
const FOCUS_STEP = 1.2;

type Focus = { span: Box; things: ResolvedObject[] };

/**
 * What one beat is about: every thing it shows, lights, names, fills or moves (a picture's part stands for
 * its picture), as it covers the screen through the beat, with the names put up then. Undefined when the
 * beat only takes things away.
 */
function beatFocus(scene: ResolvedScene, beat: ResolvedScene["beats"][number], plates: Plate[]): Focus | undefined {
  const find = (id: string) => scene.objects.find((one) => one.id === id);
  const named = beat.actions.flatMap(({ source }) => {
    if (source.do === "show") return source.targets;
    if (source.do === "hide") return [];
    return [source.do === "motion" && "along" in source ? source.along : undefined, "target" in source ? source.target : undefined, "from" in source ? source.from : undefined].filter((id): id is string => typeof id === "string");
  });
  const ownerOf = (id: string) => {
    const object = find(id) ?? find(id.split(".")[0]);
    const owner = object?.compositeParent ? find(object.compositeParent) : object;
    return owner && owner.source.role !== "background" && owner.source.space !== "screen" && owner.source.role !== "hud" && !furniture(owner.source) ? [owner] : [];
  };
  // A line between two things is about the small one it joins (a flow from a person into a shop frames the
  // shop), or about both ends when both are big.
  const endsOf = (one: ResolvedObject) => {
    if (!joinsTwo(one.source) || !("from" in one.source) || !("to" in one.source)) return [];
    const ends = [one.source.from, one.source.to].flatMap((end) => (typeof end === "string" ? ownerOf(end) : []));
    const small = ends.filter((end) => Math.max(end.box.w / VIEW_WIDTH, end.box.h / VIEW_HEIGHT) < FOCUS_SMALL);
    return small.length > 0 ? small : ends;
  };
  const things = [...new Set(named.flatMap(ownerOf).flatMap((one) => [one, ...endsOf(one)]))];
  const put = plates.filter((plate) => plate.from >= beat.start && plate.from < beat.end);
  const boxes = [...things.map((one) => coverOf(scene, one, beat.start, beat.end)), ...put.map((plate) => plateOver(scene, plate, beat.start, beat.end))];
  return boxes.length > 0 ? { span: boundsOfBoxes(boxes), things } : undefined;
}

/**
 * Shots that follow what the voice is about. While a run of beats is about something small on screen beside
 * a picture at least twice its size, the camera comes in on it with what stands round it; it goes back to
 * the scene's own framing (`fill`) when a beat is about the whole or a big picture. A run held for less
 * than a steady shot stays in the scene's own framing. Pictures keep their sizes: only the camera moves.
 */
function focusShots(scene: ResolvedScene, labels: Component[], fill: Shot[]): Shot[] {
  const times = screenTimes(scene);
  const plates = labelPlates(scene, labels);
  const baseAt = (t: number) => fill.filter((shot) => shot.start <= t).pop();
  const share = (box: Box) => Math.max(box.w / VIEW_WIDTH, box.h / VIEW_HEIGHT);
  const pictures = scene.objects.filter((one) => !one.compositeParent && PICTURE_KINDS.has(one.source.kind) && one.source.role !== "background");
  const onScreen = (one: ResolvedObject, from: number, to: number) => {
    const [on, off] = times.get(one.id) ?? [0, scene.duration];
    return on < to && from < off;
  };
  const lost = (focus: Focus, beat: ResolvedScene["beats"][number]) =>
    share(focus.span) * (baseAt(beat.start)?.zoom ?? 1) < FOCUS_SMALL &&
    pictures.some((one) => !focus.things.includes(one) && onScreen(one, beat.start, beat.end) && share(drawnBox(one)) >= 2 * share(focus.span));

  type Run = { beat: ResolvedScene["beats"][number]; focus?: Focus };
  const runs: Run[] = [];
  for (const beat of scene.beats) {
    const seen = beatFocus(scene, beat, plates);
    const focus = seen && lost(seen, beat) ? seen : undefined;
    const run = runs.at(-1);
    if (!run) {
      runs.push({ beat, focus });
      continue;
    }

    if (!seen) continue;
    if (!focus) {
      if (run.focus) runs.push({ beat });
      continue;
    }

    const joined = run.focus && { span: boundsOfBoxes([run.focus.span, focus.span]), things: [...new Set([...run.focus.things, ...focus.things])] };
    if (joined && lost(joined, beat)) run.focus = joined;
    else runs.push({ beat, focus });
  }

  // A small picture the shot would cut at its edge is taken into it whole.
  const framedShot = (focus: Focus, from: number, to: number) => {
    let shot = focusShot(focus, baseAt(from)?.zoom ?? 1);
    for (let pass = 0; shot && pass < 3; pass++) {
      const window = shot.window;
      const cut = pictures.filter((one) => {
        const box = coverOf(scene, one, from, to);
        const overlaps = box.x < window.x + window.w && window.x < box.x + box.w && box.y < window.y + window.h && window.y < box.y + box.h;
        return !focus.things.includes(one) && onScreen(one, from, to) && share(box) < FOCUS_SMALL && overlaps && !inside(box, window);
      });
      if (cut.length === 0) break;
      focus = { span: boundsOfBoxes([focus.span, ...cut.map((one) => coverOf(scene, one, from, to))]), things: [...focus.things, ...cut] };
      shot = focusShot(focus, baseAt(from)?.zoom ?? 1);
    }
    return shot;
  };

  const endOf = (index: number) => runs[index + 1]?.beat.start ?? scene.duration;
  const steady = runs.map((run, index) => ({ ...run, shot: run.focus && endOf(index) - run.beat.start >= FILL_HOLD ? framedShot(run.focus, run.beat.start, endOf(index)) : undefined }));
  const followed = steady.flatMap((run, index) => (run.shot ? [{ ...run, end: endOf(index) }] : []));
  const during = (t: number) => followed.some((run) => run.beat.start <= t && t < run.end);
  const moveTime = (beat: ResolvedScene["beats"][number]) => Math.max(0.3, Math.min(0.8, beat.duration * 0.5));
  const shots: Shot[] = fill.filter((shot) => !during(shot.start));
  for (const run of followed) {
    shots.push({ type: "camera", to: run.shot!.focal, zoom: run.shot!.zoom, kind: "move", start: run.beat.start, dur: moveTime(run.beat) });
    const next = scene.beats.find((beat) => beat.start >= run.end);
    if (!next || during(run.end) || shots.some((shot) => shot.start === run.end)) continue;
    const base = baseAt(run.end);
    shots.push({ type: "camera", to: base?.to ?? "center", zoom: base?.zoom ?? 1, kind: "move", start: run.end, dur: moveTime(next) });
  }
  return shots.sort((a, b) => a.start - b.start);
}

/**
 * The shot that brings what a run is about up to a share of the frame, no closer than its pictures' own
 * pixels allow; undefined when that is hardly closer than the screen it leaves.
 */
function focusShot(focus: Focus, from: number): ReturnType<typeof stripShot> | undefined {
  const sharp = Math.min(...focus.things.map((one) => {
    const pixels = one.source.kind === "image" ? imageSourceSize(one.source.src) : undefined;
    return pixels ? (PIXEL_REACH * pixels.width) / one.box.w : Infinity;
  }));
  const share = Math.max(focus.span.w / VIEW_WIDTH, focus.span.h / VIEW_HEIGHT);
  const shot = stripShot(focus.span, Math.min(FOCUS_ZOOM_MAX, sharp, FOCUS_FILL / share));
  return shot.zoom >= from * FOCUS_STEP ? shot : undefined;
}

// How close a filling shot comes, and the least worth a move.
const FILL_ZOOM: [number, number] = [1.2, 1.6];
// A filling shot held for less than this is a lurch, not a frame: the screen stays whole instead.
const FILL_HOLD = 2.5;
// A name fading out as a run starts is gone within this, and is not framed with what stays.
const LEAVING = 0.5;

/**
 * Camera shots for a scene laid out for all it ever shows: while only part of it is on screen, the camera
 * comes in on that part so it fills the screen, and pulls back as more comes in. Laid once for everything,
 * a calendar sat small at the top over a lower half kept empty for a picture shown later. A scene whose
 * whole could be framed closer is left to its layout. A run of beats
 * shares one shot, which takes in every pose what moves holds through it.
 */
function fillShots(scene: ResolvedScene, labels: Component[]): Shot[] {
  const actions = scene.beats.flatMap((beat) => beat.actions);
  const times = screenTimes(scene);
  // What starts to leave as a run starts is not framed with what stays: it fades out past the shot's edge.
  const leaves = new Map(actions.flatMap((action) => (action.source.do === "hide" ? action.source.targets.map((id) => [id, action.start] as const) : [])));
  const whole = scene.objects.filter((one) => !one.compositeParent && one.source.role !== "background");
  const plates = labelPlates(scene, labels);
  const spanOf = (from: number, to: number): { box: Box; top: number } | undefined => {
    const shown = whole.filter((one) => {
      const [on] = times.get(one.id) ?? [0, scene.duration];
      return on < to && from < (leaves.get(one.id) ?? Infinity);
    });
    const fixed = shown.filter((one) => one.source.space === "screen" || one.source.role === "hud" || furniture(one.source));
    const named = plates.filter((plate) => plate.from < to && from < plate.to - LEAVING);
    const boxes = [...shown.filter((one) => !fixed.includes(one)).map((one) => coverOf(scene, one, from, to)), ...named.map((plate) => plateOver(scene, plate, from, to))];
    if (boxes.length === 0) return undefined;
    return { box: boundsOfBoxes(boxes), top: Math.max(0, ...fixed.map((one) => drawnBox(one).y + drawnBox(one).h)) };
  };
  const framed = (span: { box: Box; top: number } | undefined) => (span ? fillShot(span.box, span.top) : undefined);
  // A scene small as a whole is its layout's to size; only room kept for what comes later is framed out.
  if (framed(spanOf(0, scene.duration))) return [];
  const shots: Shot[] = [];
  let zoomed = false;
  for (let first = 0; first < scene.beats.length; ) {
    let last = first;
    let shot = framed(spanOf(scene.beats[first].start, scene.beats[first].end));
    while (shot && last + 1 < scene.beats.length) {
      const wider = framed(spanOf(scene.beats[first].start, scene.beats[last + 1].end));
      if (!wider) break;
      [shot, last] = [wider, last + 1];
    }
    const [start, end] = [scene.beats[first].start, last + 1 < scene.beats.length ? scene.beats[last].end : scene.duration];
    const beat = scene.beats[first];
    const dur = Math.max(0.3, Math.min(0.8, beat.duration * 0.5));
    if (shot && end - start >= FILL_HOLD) {
      shots.push({ type: "camera", to: shot.focal, zoom: shot.zoom, kind: "move", start, dur });
      zoomed = true;
    } else if (zoomed) {
      shots.push({ type: "camera", to: "center", zoom: 1, kind: "move", start, dur });
      zoomed = false;
    }
    first = shot && end - start >= FILL_HOLD ? last + 1 : first + 1;
  }
  return shots;
}

/**
 * The closest shot that brings a span up to fill the screen below `top`, never past the frame's edge and
 * never closer to the screen's edge than the span already stood; undefined when none comes in far enough.
 */
function fillShot(span: Box, top: number): { focal: Vec2; zoom: number } | undefined {
  const most = Math.min(FILL_ZOOM[1], VIEW_WIDTH / (span.w + STRIP_MARGIN * 2), (VIEW_HEIGHT - top) / (span.h + STRIP_MARGIN * 2));
  const [ceiling, floor] = [Math.min(span.y, top + STRIP_MARGIN), Math.max(span.y + span.h, VIEW_HEIGHT - STRIP_MARGIN)];
  const kept = (value: number, half: number, size: number) => Math.max(half, Math.min(size - half, value));
  for (let zoom = most; zoom >= FILL_ZOOM[0]; zoom -= 0.05) {
    const [halfW, halfH] = [(VIEW_WIDTH / 2 + HOST_GUTTER) / zoom, (VIEW_HEIGHT / 2 + HOST_GUTTER) / zoom];
    // The span's middle is brought to the middle of the room under what is pinned to the top of the screen.
    const focal: Vec2 = [kept(span.x + span.w / 2, halfW, VIEW_WIDTH), kept(span.y + span.h / 2 - top / 2 / zoom, halfH, VIEW_HEIGHT)];
    const screen = (value: number, at: number, size: number) => (value - at) * zoom + size / 2;
    const fits =
      screen(span.y, focal[1], VIEW_HEIGHT) >= ceiling &&
      screen(span.y + span.h, focal[1], VIEW_HEIGHT) <= floor &&
      screen(span.x, focal[0], VIEW_WIDTH) >= Math.min(span.x, STRIP_MARGIN) &&
      screen(span.x + span.w, focal[0], VIEW_WIDTH) <= Math.max(span.x + span.w, VIEW_WIDTH - STRIP_MARGIN);
    if (fits) return { focal, zoom };
  }
  return undefined;
}

// A subject drawn at least this many times wider than tall is a strip on a portrait screen.
const STRIP_ASPECT = 2;
// Shown whole, a strip this short leaves most of the screen empty and what moves on it a speck.
const STRIP_SHARE = 0.3;
// How close a strip shot comes; nearer, the picture's own pixels show. Less than the least is not worth the move.
const STRIP_ZOOM: [number, number] = [1.3, 2];
// Room kept round what a strip shot frames, in view units.
const STRIP_MARGIN = 28;
// A label's plate is about this far each way from its spot.
const PLATE_REACH: [number, number] = [70, 24];

/**
 * Camera shots for a scene whose subject is a strip (a canal cut away, a timeline-like landscape): shown
 * whole it is a thin band across a tall screen. On each beat about some of its parts, the camera comes in
 * on just those parts, the things travelling over them and the names given them there; on a beat about the
 * whole of it, or about something the shot leaves out, it pulls back to the whole screen.
 */
function stripShots(scene: ResolvedScene, labels: Component[]): Component[] {
  const strip = scene.objects.find((one) => {
    if (one.kind !== "image" || one.compositeParent || (one.rank !== "lead" && one.rank !== "colead")) return false;
    const box = drawnBox(one);
    return box.w >= box.h * STRIP_ASPECT && box.h < VIEW_HEIGHT * STRIP_SHARE && scene.objects.some((part) => part.compositeParent === one.id && part.kind === "image-hotspot");
  });
  if (!strip) return [];
  const times = screenTimes(scene);
  const [stripFrom, stripTo] = times.get(strip.id) ?? [0, scene.duration];
  const find = (id: string) => scene.objects.find((one) => one.id === id);
  const onStrip = (id: string) => id.startsWith(`${strip.id}.`) && find(id) !== undefined;
  const riders = new Set(scene.objects.filter((one) => one.travelsOn === strip.id).map((one) => one.id));
  const poses = new Map<string, Point>([...riders].map((id) => [id, find(id)!.position]));
  const plates = labels.flatMap((label) => (label.type === "attention" && label.verb === "callout" && Array.isArray(label.spot) ? [label] : []));
  const shots: Component[] = [];
  let shot: ReturnType<typeof stripShot> | undefined;
  // Only the strip, what travels on it and what is set on its parts belong to its shots; anything else on screen would be cut.
  const onIt = (id: unknown) => typeof id === "string" && (id === strip.id || onStrip(id) || riders.has(id));
  const belongs = (one: ResolvedObject) => {
    const placement = one.source.placement;
    const joined = "from" in one.source && "to" in one.source && onIt(one.source.from) && onIt(one.source.to);
    return one.id === strip.id || one.compositeParent !== undefined || riders.has(one.id) || joined || (placement !== undefined && placement.mode !== "zone" && onStrip(placement.target));
  };
  const others = scene.objects.filter((one) => !belongs(one));
  for (const beat of scene.beats) {
    const boxes: Box[] = [];
    let whole = beat.start < stripFrom || beat.start >= stripTo;
    const elsewhere = others.some((one) => {
      const [from, to] = times.get(one.id) ?? [0, scene.duration];
      return from < beat.end && beat.start < to;
    });
    for (const action of beat.actions) {
      const source = action.source;
      const named = source.do === "show" || source.do === "hide" ? source.targets : "target" in source && typeof source.target === "string" ? [source.target] : [];
      if (named.includes(strip.id)) whole = true;
      for (const id of named.filter(onStrip)) boxes.push(find(id)!.box);
      if (action.kind === "motion" && source.do === "motion" && riders.has(source.target)) {
        const rider = find(source.target)!;
        const stops = source.motion === "along" && source.through ? source.through.flatMap((id) => (find(id) ? [find(id)!.position] : [])) : action.arrival ? [action.arrival] : [];
        for (const at of [poses.get(rider.id)!, ...stops]) boxes.push({ x: at[0] - rider.box.w / 2, y: at[1] - rider.box.h / 2, w: rider.box.w, h: rider.box.h });
        if (stops.length) poses.set(rider.id, stops[stops.length - 1]);
        for (const id of source.motion === "along" ? (source.through ?? []).filter(onStrip) : []) boxes.push(find(id)!.box);
        continue;
      }
      if (source.do === "show") {
        for (const id of source.targets) {
          const shown = find(id);
          if (shown && id !== strip.id && belongs(shown)) boxes.push(shown.box);
        }
      }
    }
    for (const plate of plates) {
      if (typeof plate.start !== "number" || plate.start < beat.start || plate.start >= beat.end || typeof plate.target !== "string" || !onStrip(plate.target)) continue;
      const [x, y] = plate.spot as Vec2;
      boxes.push({ x: x - PLATE_REACH[0], y: y - PLATE_REACH[1], w: PLATE_REACH[0] * 2, h: PLATE_REACH[1] * 2 });
    }
    const span = boxes.length && !whole ? boundsOfBoxes(boxes) : undefined;
    const framing = span && stripShot(span, STRIP_ZOOM[1]);
    // What the shot already shows is not worth a move: the camera holds still while the story stays in it.
    const held = shot && span && inside(span, shot.window);
    const next = whole || elsewhere ? undefined : held ? shot : framing && framing.zoom >= STRIP_ZOOM[0] ? framing : boxes.length ? undefined : shot;
    if (next === shot) continue;
    const dur = Math.max(0.3, Math.min(0.8, beat.duration * 0.5));
    shots.push(next ? { type: "camera", to: next.focal, zoom: next.zoom, kind: "move", start: beat.start, dur } : { type: "camera", to: "center", zoom: 1, kind: "move", start: beat.start, dur });
    shot = next;
  }
  return shots;
}

// The film client fits the frame with this gutter round it; a shot reaching the frame's edge shows it empty.
const HOST_GUTTER = 24;

type Box = { x: number; y: number; w: number; h: number };

/** The shot that frames a span: as close as it fits, up to `most`, its focus kept far enough in that nothing past the frame shows. */
function stripShot(span: Box, most: number): { focal: Vec2; zoom: number; window: Box } {
  const zoom = Math.min(most, VIEW_WIDTH / (span.w + STRIP_MARGIN * 2), VIEW_HEIGHT / (span.h + STRIP_MARGIN * 2));
  const [halfW, halfH] = [(VIEW_WIDTH / 2 + HOST_GUTTER) / zoom, (VIEW_HEIGHT / 2 + HOST_GUTTER) / zoom];
  const kept = (value: number, half: number, size: number) => (half * 2 >= size ? size / 2 : Math.max(half, Math.min(size - half, value)));
  const focal: Vec2 = [kept(span.x + span.w / 2, halfW, VIEW_WIDTH), kept(span.y + span.h / 2, halfH, VIEW_HEIGHT)];
  return { focal, zoom, window: { x: focal[0] - VIEW_WIDTH / 2 / zoom, y: focal[1] - VIEW_HEIGHT / 2 / zoom, w: VIEW_WIDTH / zoom, h: VIEW_HEIGHT / zoom } };
}

const inside = (box: Box, window: Box) => box.x >= window.x && box.y >= window.y && box.x + box.w <= window.x + window.w && box.y + box.h <= window.y + window.h;

function boundsOfBoxes(boxes: Box[]): Box {
  const [left, top] = [Math.min(...boxes.map((box) => box.x)), Math.min(...boxes.map((box) => box.y))];
  const [right, bottom] = [Math.max(...boxes.map((box) => box.x + box.w)), Math.max(...boxes.map((box) => box.y + box.h))];
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** What a scene's compile takes from the scenes before it: the categories coloured so far. */
export interface CompileCarry {
  names: string[];
}

export function firstCompile(declared: FilmCategorySpec[] | undefined): CompileCarry {
  return { names: (declared ?? []).map((category) => category.id) };
}

/**
 * Compile one scene after the scenes before it. A category takes its colour on first use and keeps it, and
 * a key of the whole film lists the categories met so far, so nothing a later scene brings changes this one.
 */
export function compileNextScene(scene: ResolvedScene, declared: FilmCategorySpec[] | undefined, before: CompileCarry): { film: Film; after: CompileCarry; crowded: string[] } {
  const names = [...new Set([...before.names, ...sceneCategories(scene)])];
  const hues = categoryHues(declared ?? [], scene.theme, names);
  const crowded: string[] = [];
  return { film: compileScene({ ...scene, categories: names, hues, filmCategories: declared }, crowded), after: { names }, crowded };
}

/**
 * Where each thing stands, how large and how far turned when its scene ends — its rest moved by every
 * motion the scene gives it — so the next scene can start it from there.
 */
// Moved further than this from where it was laid out, a thing ended its scene somewhere its journeys took it.
const TRAVELLED = 12;

export function sceneEndPoses(scene: ResolvedScene): Map<string, ScenePose> {
  return new Map(
    scene.objects.filter((object) => !object.compositeParent).map((object) => {
      const moved = motionsTransform(motionsFor(scene, object), object.box, scene.duration, (pos) => restingPoint(scene, pos, object.position));
      const [w, h] = [object.box.w * moved.scale, object.box.h * moved.scale];
      const [cx, cy] = [object.box.x + object.box.w / 2 + moved.dx, object.box.y + object.box.h / 2 + moved.dy];
      const turn = ((((object.turned ?? 0) + (moved.rot * 180) / Math.PI) % 360) + 540) % 360 - 180;
      const travelled = Math.hypot(moved.dx, moved.dy) > TRAVELLED;
      return [object.id, { box: { x: cx - w / 2, y: cy - h / 2, w, h }, size: object.size * moved.scale, turned: Math.abs(turn) < 0.5 ? 0 : turn, ...(travelled ? { travelled } : {}) }];
    }),
  );
}

const TINTS: Record<TintToken, number> = { faint: 0.25, strong: 0.42 };
// How long a wash given or taken off on a beat takes to come or go.
const TINT_FADE = 0.4;
// The colours categories are handed out in, after any the film assigned itself; red only when asked for.
const CATEGORY_ROLES: CategoryColorToken[] = ["accent", "second", "ink", "muted"];

/** Every category one scene names, in the order they appear. */
function sceneCategories(scene: ResolvedScene): string[] {
  return [
    ...scene.objects.flatMap((object) => {
      const source = object.source;
      if (object.compositeParent) return [];
      const own = source.category ? [source.category] : [];
      if (source.kind === "timeline") return [...own, ...(source.eras ?? []).map((era) => era.category ?? era.label)];
      if (source.kind === "map") return [...own, ...[...(source.flows ?? []), ...(source.markers ?? [])].flatMap((one) => (one.category ? [one.category] : []))];
      if (source.kind === "legend" && Array.isArray(source.categories)) return [...own, ...source.categories];
      if ("data" in source && Array.isArray(source.data)) return [...own, ...(source.data as { label: string; category?: string }[]).map((datum) => datum.category ?? datum.label)];
      return own;
    }),
    ...Object.values(scene.categoriesOf ?? {}),
    ...scene.beats.flatMap((beat) => beat.actions.flatMap((action) => (action.source.do === "tint" && action.source.category ? [action.source.category] : []))),
  ];
}

/** Each category's one colour, by id and by name: as declared, else handed out in film order from the colours left. */
function categoryHues(declared: FilmCategorySpec[], theme: ResolvedScene["theme"], names: string[]): Map<string, string> {
  const palette = themePalette(theme);
  const taken = new Set(declared.flatMap((category) => (category.color ? [category.color] : [])));
  const free = CATEGORY_ROLES.filter((role) => !taken.has(role));
  const roles = free.length > 0 ? free : CATEGORY_ROLES;
  const hues = new Map<string, string>();
  let next = 0;
  for (const name of names) {
    if (hues.has(name)) continue;
    const category = declared.find((one) => one.id === name || one.name === name);
    const color = palette[category?.color ?? roles[next++ % roles.length]];
    for (const key of category ? [category.id, category.name] : [name]) hues.set(key, color);
  }
  return hues;
}

/** A category's colour in this film; a name the film never declared keeps the colour of its place in its own chart. */
function categoryHue(scene: ResolvedScene, name: string, fallback: number): string {
  return scene.hues?.get(name) ?? categoryColor(scene.theme, fallback);
}

/** The categories a key of the whole film lists: the declared ones, else every one the film colours. */
function filmKey(scene: ResolvedScene): string[] {
  const declared = scene.filmCategories?.map((category) => category.id) ?? [];
  return declared.length > 0 ? declared : (scene.categories ?? []);
}

/**
 * A still wash of its category's colour over each picture, picture part and figure piece the scene
 * colours: inside its traced outline (a whole picture's silhouette), else its box. It is laid over the
 * picture and under every glow and never animates a level. A scene-level category comes and goes with
 * what it colours; a `tint` on a beat gives or changes the wash from then, or takes it off.
 */
function categoryWashes(scene: ResolvedScene, compiled: Component[]): Component[] {
  const tints = scene.beats.flatMap((beat) => beat.actions).filter((action) => action.source.do === "tint");
  return scene.objects.flatMap((object): Component[] => {
    const washed = object.compositeParent !== undefined || ["image", "svg-artwork", "svg-composite"].includes(object.kind);
    if (!washed) return [];
    const owner = object.compositeParent ?? object.id;
    // A part shown on its own beat comes and goes with that beat; one inside a picture, with the picture.
    const timed = compiled.find((one) => one.id === object.id && object.kind !== "image-hotspot") ?? compiled.find((one) => one.id === owner);
    if (!timed) return [];
    const changes = tints.filter((action) => action.source.do === "tint" && action.source.targets.includes(object.id));
    const spans = [
      { category: object.compositeParent ? scene.categoriesOf?.[object.id] : object.source.category, from: typeof timed.start === "number" ? timed.start : 0 },
      ...changes.map((action) => ({ category: action.source.do === "tint" ? action.source.category : undefined, from: action.start })),
    ].map((span, index, all) => ({ ...span, until: all[index + 1]?.from as number | undefined }));
    const { x, y, w, h } = object.box;
    const outline = partOutline(scene, object.id) ?? [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const strength = scene.objects.find((one) => one.id === owner)?.source.tint ?? "faint";
    return spans.flatMap((span, index): Component[] => {
      if (span.category === undefined || (span.until !== undefined && span.until <= span.from)) return [];
      return [{
        type: "region",
        id: `${owner}.${object.compositeParent ? object.id.slice(owner.length + 1) : ""}~tint${index === 0 ? "" : index}`,
        at: object.position,
        w,
        h,
        outline,
        wash: { color: categoryHue(scene, span.category, 0), alpha: TINTS[strength] },
        start: span.from,
        dur: index === 0 ? (timed.enter?.dur ?? 0) : TINT_FADE,
        exit: span.until === undefined ? timed.exit : { type: "fade", out: span.until, dur: TINT_FADE },
        layer: "mid",
      }];
    });
  });
}
