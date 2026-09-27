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
import { VIEW_HEIGHT, VIEW_WIDTH } from "../gcl/viewport";
import {
  categoryColor,
  resolvePace,
  resolveSize,
  resolveVisualStyle,
} from "./registry";
import { assetTakesThemeInk } from "./visual-catalog";
import type {
  Point,
  ResolvedAction,
  ResolvedLesson,
  ResolvedObject,
  ResolvedScene,
  ResolvedSimpleAction,
} from "./resolve";
import { towardEdge, zoneCentre } from "./resolve";
import type { EntranceToken, ExitToken, ObjectSpec } from "./types";
import { parseSvgArtwork, svgPartMarkup } from "./svg";
import { fitUnit, nearestSample, sampleCurve } from "./curve";

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
function carryingActions(scene: ResolvedScene, id: string): ResolvedSimpleAction[] {
  return scene.beats.flatMap((beat) =>
    beat.actions.filter(
      (action): action is ResolvedSimpleAction =>
        action.kind === "motion" && action.source.do === "motion" && (action.source.with ?? []).includes(id),
    ),
  );
}

/**
 * A carried piece moves exactly as the thing carrying it: the same displacement for a journey, the
 * same turn about the same point for a spin. Its own spec already turns about the shared centre;
 * a journey's destination or path is the carrier's, offset by where the piece rests beside it.
 */
function carriedSpec(own: MotionSpec, lead: MotionSpec, carrier: ResolvedObject, piece: ResolvedObject): MotionSpec {
  const offset: Vec2 = [piece.position[0] - carrier.position[0], piece.position[1] - carrier.position[1]];
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

function shiftedDestination(
  scene: ResolvedScene,
  reference: string | undefined,
  shift: Vec2 | undefined,
): Vec2 | undefined {
  if (!shift || reference === undefined) return undefined;
  const destination = scene.objects.find(
    (candidate) => candidate.id === reference,
  );
  return destination
    ? [destination.position[0] + shift[0], destination.position[1] + shift[1]]
    : undefined;
}

/**
 * Where a `move` or `fall` should actually stop.
 *
 * Both verbs drive the moving object's CENTRE to whatever `to` resolves to, and an object id resolves
 * to that object's centre — so "move the apple to Earth" put the apple inside Earth. Walking the
 * destination out to the target's boundary along the line of travel lands it ON the thing, which is
 * the same walk a `line` already does so its arrowhead is not painted over.
 *
 * `land: "centre"` is the other half of the choice, and it is not a fallback: a molecule entering a
 * cell, a coin dropping into a slot and a drop soaking into soil all have to end up INSIDE. Left at
 * the default the mover rests against the surface, which is what falling means.
 */
/** The view point of a named zone, so a motion can travel somewhere without a decoy object there. */
function zonePoint(scene: ResolvedScene, reference: string | undefined): Vec2 | undefined {
  if (reference === undefined) return undefined;
  const zone = zoneCentre(scene.composition, reference);
  return zone ? ([zone[0], zone[1]] as Vec2) : undefined;
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
  source: ObjectSpec,
  ends: { from: Vec2; to: Vec2 },
): { ends?: [string, string]; ends0?: [Vec2, Vec2] } {
  const pair =
    source.kind === "line" || source.kind === "span"
      ? ([source.from, source.to] as const)
      : source.kind === "curve" && source.from !== undefined && source.to !== undefined
        ? ([source.from, source.to] as const)
        : undefined;
  if (!pair) return {};

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
/** The fraction along a sampled path of the sample nearest a point. */
function nearestFraction(path: Vec2[], point: Vec2): number {
  return path.length > 1 ? nearestSample(path, point) / (path.length - 1) : 0;
}

/** The point an anchored curve turns about: the anchor target itself, not the curve's own laid box. */
function curveCentre(scene: ResolvedScene, path: ResolvedObject): Vec2 {
  const placement = path.source.placement;
  const target = placement?.mode === "anchor" ? scene.objects.find((one) => one.id === placement.target) : undefined;
  return target ? [target.position[0], target.position[1]] : [path.position[0], path.position[1]];
}

function curveUnit(scene: ResolvedScene, path: ResolvedObject): number {
  const anchored = path.source.placement?.mode === "anchor";
  const traveller = anchored
    ? scene.beats
        .flatMap((beat) => beat.actions)
        .map((action) => action.source)
        .find((source) => source.do === "motion" && source.motion === "along" && source.along === path.id)
    : undefined;
  const rider = traveller && "target" in traveller ? scene.objects.find((one) => one.id === traveller.target) : undefined;
  if (!rider) return 52 * path.size;

  const centre = curveCentre(scene, path);
  const reach = Math.hypot(rider.position[0] - centre[0], rider.position[1] - centre[1]);
  const unit = reach > 0.001 ? reach : 52 * path.size;
  return path.source.kind === "curve" ? fitUnit(path.source, centre, unit) : unit;
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

function landingPoint(
  scene: ResolvedScene,
  object: ResolvedObject,
  reference: string | undefined,
  land: "surface" | "centre" | undefined,
): Vec2 | undefined {
  if (reference === undefined || land === "centre") return undefined;
  const destination = scene.objects.find(
    (candidate) => candidate.id === reference,
  );
  if (!destination) return undefined;

  // A thing already over (or beside) a broad destination comes straight down onto it — a hammer
  // and a feather dropped side by side land side by side, not on the one spot at the ground's centre.
  const box = destination.box;
  const overIt = Math.abs(object.position[0] - destination.position[0]) <= box.w / 2;
  const besideIt = Math.abs(object.position[1] - destination.position[1]) <= box.h / 2;
  if (overIt) {
    const above = object.position[1] < destination.position[1];
    const y = above ? box.y - object.box.h / 2 : box.y + box.h + object.box.h / 2;
    return [object.position[0], y];
  }
  if (besideIt) {
    const left = object.position[0] < destination.position[0];
    const x = left ? box.x - object.box.w / 2 : box.x + box.w + object.box.w / 2;
    return [x, object.position[1]];
  }

  const edge = towardEdge(destination.position, box, object.position);
  const half =
    Math.min(object.box.w, object.box.h) / 2 || Math.max(object.box.w, object.box.h) / 2;
  const dx = object.position[0] - destination.position[0];
  const dy = object.position[1] - destination.position[1];
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return [edge[0], edge[1]];

  return [edge[0] + (dx / length) * half, edge[1] + (dy / length) * half];
}

function motionsFor(
  scene: ResolvedScene,
  object: ResolvedObject,
): Base["motions"] {
  // A named SVG part is a component in its own right, so an action naming the part animates just that
  // part; an action naming the owning artwork is inherited by every part — otherwise the visible pixels
  // never move. Same precedence as show/hide in objectAction: own target first, owner as fallback.
  const own = motionActions(scene, object.id);
  const carried = carryingActions(scene, object.id);
  const inherited = own.length === 0 && carried.length === 0 && object.compositeParent !== undefined;
  const actions = inherited ? motionActions(scene, object.compositeParent as string) : [...own, ...carried];
  const specs = actions.flatMap((action) => {
    const spec = motionSpec(scene, object, action, inherited);
    if (!spec) return [];
    const source = action.source;
    if (!carried.includes(action) || source.do !== "motion") return [spec];
    const carrier = scene.objects.find((one) => one.id === source.target);
    const lead = carrier ? motionSpec(scene, carrier, action, false) : undefined;
    return [carrier && lead ? carriedSpec(spec, lead, carrier, object) : spec];
  });
  return specs.length > 0 ? specs : undefined;
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

  if (source.motion === "move") {
    const to =
      zonePoint(scene, source.to) ??
      shiftedDestination(scene, source.to, shift) ??
      landingPoint(scene, object, source.to, source.land) ??
      source.to ??
      object.id;
    return {
      kind: "move",
      to,
      at: action.start,
      dur: action.duration,
      gait: source.gait,
    };
  }
  if (source.motion === "fall") {
    const bounce =
      source.bounce === "strong" ? 14 : source.bounce === "soft" ? 7 : 0;
    const to =
      zonePoint(scene, source.to) ??
      shiftedDestination(scene, source.to, shift) ??
      landingPoint(scene, object, source.to, source.land) ??
      source.to;
    return {
      kind: "fall",
      to,
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
      radius: geometry.radius,
      from: geometry.from,
      turns: (source.turns ?? 1) * direction,
      at: action.start,
      dur: action.duration,
    };
  }
  if (source.motion === "along") {
    const pathObject = scene.objects.find(
      (candidate) => candidate.id === source.along,
    );
    const endpoints = pathObject?.endpoints;
    const sampled = pathObject && curvePoints(scene, pathObject);
    // An inherited path is walked in formation: the artwork's centre chooses the travel direction,
    // then every part rides that same path offset by its own resting distance from the centre.
    const anchor = owner ? owner.position : object.position;
    let path = sampled?.length
      ? sampled
      : endpoints
        ? curvedPoints(
            endpoints.from,
            endpoints.to,
            pathObject?.source.kind === "line" &&
              pathObject.source.form !== "straight",
          )
        : [anchor, anchor];
    // An anchored path is the rider's own path about a point, so it is entered where the rider
    // rests rather than joined from there by a straight run to its first point.
    const anchoredPath = pathObject?.source.placement?.mode === "anchor";
    const startAt = anchoredPath && sampled?.length ? nearestFraction(sampled, anchor) : undefined;
    let leadIn = false;
    if ((endpoints || sampled?.length) && !anchoredPath) {
      const head = path[0];
      const tail = path[path.length - 1];
      const distanceFrom = Math.hypot(anchor[0] - head[0], anchor[1] - head[1]);
      const distanceTo = Math.hypot(anchor[0] - tail[0], anchor[1] - tail[1]);
      if (distanceTo < distanceFrom) path = [...path].reverse();
      const start = path[0];
      if (Math.hypot(anchor[0] - start[0], anchor[1] - start[1]) > 0.001) {
        path = [anchor, ...path];
        leadIn = true;
      }
    }
    // A rider that could not be moved onto its anchored curve (a part is drawn where it is) has the
    // curve moved onto it instead, so the first frame still moves nothing.
    if (startAt !== undefined) {
      const entry = path[Math.round(startAt * (path.length - 1))];
      const gap: Vec2 = [anchor[0] - entry[0], anchor[1] - entry[1]];
      if (Math.hypot(gap[0], gap[1]) > 0.001)
        path = path.map((point): Vec2 => [point[0] + gap[0], point[1] + gap[1]]);
    }
    if (shift)
      path = path.map(
        (point): Vec2 => [point[0] + shift[0], point[1] + shift[1]],
      );
    return {
      kind: "along",
      path,
      at: action.start,
      dur: action.duration,
      gait: source.gait,
      repeat: source.repeat,
      startAt,
      leadIn,
    };
  }
  // Complete exactly one revolution over the beat so the object lands upright. A fixed angular speed
  // times the beat duration never reaches a multiple of 2π at any pace, so every spin used to stop at
  // an arbitrary tilt (277° at `normal`) and hold it for the rest of the scene.
  return {
    kind: "spin",
    omega: (direction * Math.PI * 2) / seconds,
    center: source.about,
    sweep: source.sweep === undefined ? undefined : (source.sweep * Math.PI) / 180,
    repeat: source.repeat,
    at: action.start,
    dur: action.duration,
  };
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
  const fallback: EntranceToken =
    object.kind === "line" ? "draw" : object.kind === "text" ? "fade" : "fade";
  const token = action.source.entrance ?? fallback;
  return {
    type: ENTRANCES[token],
    dur: token === "instant" ? 0 : action.duration,
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

function curvedPoints(from: Vec2, to: Vec2, curved: boolean): Vec2[] {
  if (!curved) return [from, to];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return [
    from,
    [(from[0] + to[0]) / 2 - dy * 0.18, (from[1] + to[1]) / 2 + dx * 0.18],
    to,
  ];
}

type ContentBase = Pick<
  Base,
  "id" | "at" | "start" | "dur" | "enter" | "exit" | "layer" | "fixed"
>;

const RECTANGLE_COUNTS = { few: 4, several: 8, many: 16, dense: 32 } as const;

function inlineObject(source: ObjectSpec): ResolvedObject {
  const size = resolveSize(source.size ?? "medium", source.kind) ?? 1;
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

  if (object.kind === "svg-part" && object.svgPart) {
    return {
      ...base,
      type: "svg",
      markup: svgPartMarkup(object.svgPart),
      w: object.box.w,
      h: object.box.h,
      clipBox: backdropBand(scene, object),
    };
  }

  switch (source.kind) {
    case "text": {
      if (source.textRole === "heading")
        return {
          ...base,
          type: "heading",
          text: source.text,
          size: object.size,
          color: style.color,
        };
      const role =
        source.textRole === "title" ? "title" : (source.textRole ?? "body");
      return {
        ...base,
        type: "text",
        text: source.text,
        role,
        size: object.size,
        color: style.color,
      };
    }
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
        color: style.color,
      };
    case "visual":
      return {
        ...base,
        type: "prop",
        name: source.asset,
        size: object.size,
        angle: object.angle,
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
      };
    }
    case "angle": {
      // The arc is drawn at a fixed reach from the corner, because its job is to NAME the angle, not
      // to measure the arms: an arc that grew with the arms would read as a different angle.
      const vertex = object.position;
      const ends = object.endpoints ?? { from: vertex, to: vertex };
      const start = Math.atan2(ends.from[1] - vertex[1], ends.from[0] - vertex[0]);
      let sweep = Math.atan2(ends.to[1] - vertex[1], ends.to[0] - vertex[0]) - start;
      while (sweep > Math.PI) sweep -= Math.PI * 2;
      while (sweep < -Math.PI) sweep += Math.PI * 2;
      const reach = 46;
      const steps = 24;
      const points: Vec2[] = Array.from({ length: steps + 1 }, (_, index) => {
        const angle = start + (sweep * index) / steps;
        return [
          vertex[0] + Math.cos(angle) * reach,
          vertex[1] + Math.sin(angle) * reach,
        ] as Vec2;
      });
      return {
        ...base,
        at: vertex,
        type: "shape",
        shape: "path",
        points,
        stroke: style.color,
        width: 3,
        layer: style.layer,
      };
    }
    case "span": {
      // A line says CONNECTED TO; the caps are what make this one say HOW FAR APART.
      const ends = object.endpoints ?? { from: [0, 0] as Vec2, to: [1, 0] as Vec2 };
      const dx = ends.to[0] - ends.from[0];
      const dy = ends.to[1] - ends.from[1];
      const length = Math.hypot(dx, dy) || 1;
      const capX = (-dy / length) * 9;
      const capY = (dx / length) * 9;
      const cap = (point: Vec2): Vec2[] => [
        [point[0] - capX, point[1] - capY],
        [point[0] + capX, point[1] + capY],
      ];
      return {
        ...base,
        ...pinnedEnds(source, ends),
        type: "group",
        children: [
          { type: "shape", shape: "path", points: [ends.from, ends.to], stroke: style.color, width: 2 },
          { type: "shape", shape: "path", points: cap(ends.from), stroke: style.color, width: 3 },
          { type: "shape", shape: "path", points: cap(ends.to), stroke: style.color, width: 3 },
        ],
        layer: style.layer,
      };
    }
    case "line": {
      const endpoints = object.endpoints ?? {
        from: [0, 0] as Vec2,
        to: [120, 0] as Vec2,
      };
      const points =
        source.form === "elbow"
          ? [endpoints.from, [endpoints.from[0], endpoints.to[1]] as Vec2, endpoints.to]
          : curvedPoints(endpoints.from, endpoints.to, source.form === "curved" || source.form === "traced");
      return {
        ...base,
        ...pinnedEnds(source, endpoints),
        type: "shape",
        shape: "path",
        points,
        stroke: style.color,
        width: object.size,
      };
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
            ? [style.color, categoryColor(scene.theme, `${source.id}-shade`, 3)]
            : style.color,
        stroke: style.color,
        width: style.lineWidth,
        shine: shape === "disc" && shaded,
      };
    }
    case "curve": {
      const scale = 52 * object.size;
      const width = style.lineWidth * (source.appearance === "dashed" ? 0.85 : 1);
      // Aimed at two things, it is drawn as the laid-out points rather than a centred formula, so it
      // starts and ends where it was told to — and so it follows those two if either one moves.
      const anchored = source.placement?.mode === "anchor";
      const laid = object.endpoints || anchored ? curvePoints(scene, object) : undefined;
      // An anchored curve turns about its point and ignores any ends it names, so it is never pinned
      // to them: pinning a closed loop by its coincident first and last samples would drag it away.
      if (laid)
        return {
          ...base,
          ...(anchored ? {} : pinnedEnds(source, object.endpoints ?? { from: laid[0], to: laid[laid.length - 1] })),
          type: "shape",
          shape: "path",
          points: laid,
          stroke: style.color,
          width,
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
      };
    }
    case "chart": {
      const data =
        "data" in source
          ? source.data.map((datum, index) => ({
              ...datum,
              color: categoryColor(
                scene.theme,
                datum.category ?? datum.label,
                index,
              ),
            }))
          : undefined;
      const scale = Math.min(object.size, 1.65);
      return {
        ...base,
        type: "chart",
        chart: source.chart === "donut" ? "pie" : source.chart,
        data,
        series: "series" in source ? source.series : undefined,
        fn: "function" in source ? source.function : undefined,
        n:
          "rectangles" in source && source.rectangles
            ? RECTANGLE_COUNTS[source.rectangles]
            : undefined,
        xDomain: source.xDomain,
        yDomain: source.yDomain,
        axes: source.axes,
        xLabel: source.xLabel,
        yLabel: source.yLabel,
        donut: source.chart === "donut" ? 0.56 : undefined,
        w: 330 * scale,
        h: 205 * scale,
        color: style.color,
      };
    }
    case "legend":
      return {
        ...base,
        type: "legend",
        categories: source.categories,
        rowH: 22 * Math.min(object.size, 1.4),
      };
    case "map": {
      const stagger = resolvePace(source.stagger ?? "quick")!;
      const growth = resolvePace(source.growthPace ?? "slow")!;
      const geo = geoPalette(scene.theme);
      return {
        ...base,
        type: "map",
        features: source.features.map(({ id, rings }) => ({ id, rings })),
        featureColors: landColors(source.features, geo),
        water: geo.water,
        ink: style.color,
        backdrop: source.role === "background",
        markers: source.markers?.map(({ lon, lat, label, icon }) => ({
          lon,
          lat,
          label,
          icon,
        })),
        places: source.places,
        flows: source.flows?.map((flow, index) => {
          const pace = resolvePace(flow.pace ?? "normal")!;
          return {
            from: flow.from,
            to: flow.to,
            color: categoryColor(
              scene.theme,
              flow.category ?? `flow-${index}`,
              index,
            ),
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
        growFill: categoryColor(scene.theme, "growth", 0),
        growStroke: style.color,
        outlineStroke: style.color,
        featureStagger: source.stagger ? stagger.transition : undefined,
        featureDur: source.stagger ? stagger.duration : undefined,
        w: object.box.w,
        h: object.box.h,
      };
    }
    case "timeline": {
      const scale = Math.min(object.size, 1.2);
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
        })),
        eras: source.eras?.map((era, index) => ({
          ...era,
          color: categoryColor(scene.theme, era.category ?? era.label, index),
        })),
        playhead:
          typeof source.playhead === "number" ? source.playhead : undefined,
        playheadFrom: animated?.from,
        playheadTo: animated?.to,
        playheadOver: animated ? pace.duration : undefined,
        w: 610 * scale,
        h: 112 * scale,
      };
    }
    case "table": {
      const scale = Math.min(object.size, 1.2);
      return {
        ...base,
        type: "table",
        rows: source.rows,
        header: source.header,
        w: 500 * scale,
        rowH: 32 * scale,
        colColor: categoryColor(scene.theme, "table-column", 0),
        ink: style.color,
      };
    }
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

function compileObject(
  scene: ResolvedScene,
  object: ResolvedObject,
): Component | undefined {
  const show = objectAction(scene, object, "show");
  const initiallyVisible =
    object.kind === "svg-part"
      ? object.svgPart?.initial === "visible" ||
        (object.svgPart?.initial === undefined &&
          object.source.initial === "visible")
      : object.source.initial === "visible";
  if (!initiallyVisible && !show) return undefined;
  const hide = objectAction(scene, object, "hide");
  const enter = entranceFor(object, show);
  const exit = exitFor(hide);
  const start = show?.start ?? 0;
  const style = resolveVisualStyle(scene.theme, object.source.role);
  const base = {
    id: object.id,
    at: object.position,
    start,
    dur: enter.dur,
    enter: { type: enter.type, dur: enter.dur },
    exit,
    layer: style.layer,
    fixed: object.source.space === "screen" || object.source.role === "hud",
    motions: motionsFor(scene, object),
    emphasis: emphasisFor(scene, object),
    fillLevel: fillFor(scene, object),
  } as const;

  return compileContent(scene, object, base);
}

function labelDirective(
  action: ResolvedAction,
  scene: ResolvedScene,
): Component[] {
  if (action.kind !== "label" || action.source.do !== "label") return [];
  const exitDur = Math.min(0.45, action.duration / 4);
  return [
    {
      type: "attention",
      verb: "callout",
      target: canonicalTarget(scene, action.source.target),
      text: action.source.text,
      title: action.source.title,
      container: action.source.style ?? "pill",
      start: action.start,
      dur: Math.min(0.6, action.duration / 3),
      exit: { type: "fade", out: action.end - exitDur, dur: exitDur },
      layer: "annotation",
    },
  ];
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

function canonicalTarget(scene: ResolvedScene, target: string): string {
  const split = target.indexOf(".");
  if (split < 1) return target;
  const object = scene.objects.find(
    (candidate) => candidate.id === target.slice(0, split),
  );
  return object?.source.kind === "map" ? target.slice(split + 1) : target;
}

/**
 * The zoom a shot may reach on this target: the shot's own, capped where the target already fills
 * the frame. A `close` shot on a `large` clock used to push 1.9x into a picture that was the screen.
 */
function fittedZoom(scene: ResolvedScene, target: string, wanted: number): number {
  const box = scene.objects.find((object) => object.id === target)?.box;
  if (!box) return wanted;
  const margin = 64;
  const fits = Math.min(VIEW_WIDTH / (box.w + margin), VIEW_HEIGHT / (box.h + margin));
  return Math.max(1, Math.min(wanted, fits));
}

function compileAction(
  action: ResolvedAction,
  scene: ResolvedScene,
): Component[] {
  if (action.kind === "camera" && action.source.do === "camera") {
    const push: Component = {
      type: "camera",
      to: canonicalTarget(scene, action.source.target),
      zoom: fittedZoom(scene, action.source.target, action.shot.zoom),
      kind: action.source.movement === "push" ? "pushIn" : "move",
      start: action.start,
      dur: action.duration,
    };
    // A close-up lets go of its subject when the scene hides it, or when the story moves on to
    // another drawn thing — otherwise the reader is left staring at a magnified patch while
    // whatever comes next appears out of frame.
    const owner = action.source.target.split(".")[0];
    const drawn = (id: string) => {
      const kind = scene.objects.find((one) => one.id === id.split(".")[0])?.source.kind;
      return kind !== undefined && !["text", "equation", "line", "span", "angle", "curve", "measure", "legend"].includes(kind);
    };
    const later = scene.beats.flatMap((beat) => beat.actions).filter((other) => other.start > action.start);
    const hidden = later.find((other) => other.source.do === "hide" && other.source.targets.some((id) => id === owner || id.startsWith(`${owner}.`)));
    const elsewhere = later.find((other) => other.source.do === "show" && other.source.targets.some((id) => id.split(".")[0] !== owner && drawn(id)));
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
        zoom: fittedZoom(scene, stop.target, stop.shot.zoom),
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
    return [
      {
        type: "attention",
        verb: action.source.verb,
        target: canonicalTarget(scene, action.source.target),
        from: action.source.from
          ? canonicalTarget(scene, action.source.from)
          : undefined,
        text: action.source.text,
        title: action.source.title,
        side,
        route,
        container: action.source.style,
        color: categoryColor(scene.theme, `attention-${action.source.verb}`, 0),
        radius: targetRadius(scene, action.source.target),
        start: action.start,
        dur: action.duration,
        exit: {
          type: "fade",
          out: action.end,
          dur: Math.min(0.45, action.duration / 3),
        },
        layer: "annotation",
      },
    ];
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
          color: categoryColor(scene.theme, "glow", 0),
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
        color: categoryColor(scene.theme, "flow", 0),
      },
    ];
  }
  return labelDirective(action, scene);
}


function compileScene(scene: ResolvedScene): Film {
  const marker: SceneMarker = {
    type: "scene",
    duration: scene.duration,
    theme: scene.theme,
  };
  const objects = scene.objects
    .map((object) => compileObject(scene, object))
    .filter((object): object is Component => object !== undefined);
  const directives = scene.beats.flatMap((beat) =>
    beat.actions.flatMap((action) => compileAction(action, scene)),
  );
  return [marker, ...objects, ...directives];
}

export function compileResolvedLesson(lesson: ResolvedLesson): Film {
  return lesson.scenes.flatMap(compileScene);
}
