/**
 * Where each journey of a scene ends. A move keeps the meaning it was written with: sent to a zone it
 * goes as far as that zone lies from the band it is in (and is refused when it is already there); sent
 * toward, away from or opposite something, or in a direction, it goes exactly that way, `by` as far as
 * asked. Every end is kept inside the frame and off the other travellers' ends and the pictures it would
 * land on, by sliding along the line of travel so the direction never changes.
 */
import { boundsOf, meets, rectAt, type Drawn, type Pt, type Rect } from "../geometry/place";
import type { ActionSpec, DirectionToken, DistanceSpec, SceneSpec, ZoneToken } from "./types";

export interface Journey {
  /** Where the mover's centre starts the journey. */
  from: Pt;
  /** Where it ends; undefined when the move was refused. */
  arrival?: Pt;
  /** Where the stated move would have ended, before the frame stopped it (or refused it for want of room). */
  wanted?: Pt;
  refused?: string;
}

/** What the planner may ask of the laid-out scene. */
export interface JourneyWorld {
  frame(id: string): Rect;
  /** A thing's resting centre and size. */
  rest(id: string): { at: Pt; size: [number, number] } | undefined;
  /** The point a reference names: a thing's middle, a part's interior point. */
  point(reference: string): Pt | undefined;
  /** The drawn extent of a reference, for distances given in its widths or heights. */
  extent(reference: string): { w: number; h: number } | undefined;
  /** Where a mover lands against a destination, from where it is. */
  landing(id: string, at: Pt, reference: string, land?: "surface" | "centre"): Pt | undefined;
  /** The zone a thing was laid in. */
  zone(id: string): ZoneToken | undefined;
  zoneCentre(zone: string): Pt | undefined;
  /** The zones a mover's band is counted among. */
  bands: readonly ZoneToken[];
  /** The way a picture faces at rest, as a unit vector, when it is known. */
  facing(id: string): Pt | undefined;
  /** Where a reference's owner stands, so a part's place on it gives a way out. */
  owner(reference: string): string;
  /** The pictures on screen at the `beat`th beat a mover must not end its journey on, each as it is drawn at rest. */
  obstacles(id: string, destination: string | undefined, beat: number): { id: string; drawn: Drawn[] }[];
  /** The two ends of a drawn route as it is walked, start then end. */
  route(id: string, rider: string): [Pt, Pt] | undefined;
  /** The thing another is fixed on (anchored or attached to), which carries it. */
  carrier(id: string): string | undefined;
  /** The picture a thing travels across the parts of, as it is drawn. */
  ground(id: string): { id: string; drawn: Drawn[] } | undefined;
  /** Whether one thing is fixed on the other, so neither is in the other's way. */
  related(a: string, b: string): boolean;
  /** What a route drawn between two things is walked to, when it is. */
  walkedTo(route: string, rider: string): string | undefined;
  /** Shortens a route drawn on its own to `share` of its length, toward where it is walked from; false when it cannot be. */
  shorten(id: string, rider: string, share: number): boolean;
}

// Closer than this to where it already is, a move changes nothing.
const NO_MOVE = 8;
// Slid along its line of travel up to this share shorter or longer to keep off what is there.
const SLIDE = [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3, -0.4, 0.4, -0.5, 0.6];
// A drawn route only ever stops short.
const SHORTER = [0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6];

const COMPASS: Record<string, Pt> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function directionVector(direction: DirectionToken): Pt {
  if (typeof direction === "string") return COMPASS[direction];
  const radians = (direction * Math.PI) / 180;
  return [Math.cos(radians), -Math.sin(radians)];
}

const unit = ([x, y]: Pt): Pt | undefined => {
  const length = Math.hypot(x, y);
  return length > 1e-6 ? [x / length, y / length] : undefined;
};

type Move = Extract<ActionSpec, { do: "motion"; motion: "move" }>;
type Travel = Extract<ActionSpec, { do: "motion"; motion: "move" | "fall" | "wander" }>;

export function planJourneys(scene: SceneSpec, world: JourneyWorld, movers?: (id: string) => boolean): Map<ActionSpec, Journey> {
  const journeys = new Map<ActionSpec, Journey>();
  const poses = new Map<string, Pt>();
  // The zone each mover is in: where it was laid, then where a zone move sent it; unknown after any other journey.
  const bands = new Map<string, ZoneToken | undefined>();
  const band = (id: string) => (bands.has(id) ? bands.get(id) : world.zone(id));
  const ends: { id: string; box: Rect }[] = [];
  const where = (id: string) => poses.get(id) ?? world.rest(id)?.at;
  // How far a thing has gone: its own journeys, else those of what it is fixed on, which carries it.
  const travelledBy = (id: string, seen = new Set<string>()): Pt => {
    const [now, rest] = [poses.get(id), world.rest(id)?.at];
    if (now && rest) return [now[0] - rest[0], now[1] - rest[1]];
    const carrier = world.carrier(id);
    return carrier && !seen.has(carrier) ? travelledBy(carrier, new Set([...seen, id])) : [0, 0];
  };
  // What is in a mover's way, each where it has travelled to: the other travellers' ends, and the pictures
  // too unless it was sent to a named thing; never what it is fixed on or what is fixed on it.
  const taken = (id: string, beat: number, destination: string | undefined, named = false): Drawn[] => {
    const pictures = world.obstacles(id, destination, beat);
    const travelled = new Set(ends.map((end) => end.id));
    return [
      ...pictures
        .filter((other) => !named || travelled.has(other.id))
        .flatMap((other) => {
          const [dx, dy] = travelledBy(other.id);
          return other.drawn.map((one) => shifted(one, dx, dy));
        }),
      // Where the destination has gone is no more in the way than where it rests.
      ...ends
        .filter((end) => end.id !== id && end.id !== (destination && world.owner(destination)) && !pictures.some((other) => other.id === end.id) && !world.related(id, end.id))
        .map((end): Drawn => ({ box: end.box })),
    ];
  };

  for (const [index, beat] of scene.beats.entries()) {
    const shifts = new Map<string, [Pt, Pt]>();
    const actions = beat.actions.filter((action): action is Extract<ActionSpec, { do: "motion" }> => action.do === "motion" && (movers?.(action.target) ?? true));
    // An opposite move reads its partner's journey in the same beat, so it is planned after the rest.
    const ordered = [...actions.filter((action) => !(action.motion === "move" && action.opposite)), ...actions.filter((action) => action.motion === "move" && action.opposite)];
    for (const action of ordered) {
      const from = where(action.target);
      const rest = world.rest(action.target);
      if (!from || !rest) continue;
      if (action.motion === "along" && action.along) {
        let walked = world.route(action.along, action.target);
        // A walker stops short of the pictures it would end on, but the one its route leads to.
        const blocking = taken(action.target, index, world.walkedTo(action.along, action.target));
        const end = walked && (keptApart(walked[0], walked[1], rest.size, blocking, world.frame(action.target), SHORTER) ?? leastCovered(walked[0], walked[1], rest.size, blocking));
        let stop = walked?.[1];
        if (walked && end && end !== walked[1]) {
          const share = Math.hypot(end[0] - walked[0][0], end[1] - walked[0][1]) / (Math.hypot(walked[1][0] - walked[0][0], walked[1][1] - walked[0][1]) || 1);
          if (world.shorten(action.along, action.target, share)) {
            walked = world.route(action.along, action.target);
            stop = walked?.[1];
          } else {
            // A route drawn between two things cannot be drawn shorter: its walker stops short on it instead.
            stop = end;
            journeys.set(action, { from, arrival: end });
          }
        }
        if (stop) {
          ends.push({ id: action.target, box: rectAt(stop, rest.size) });
          shifts.set(action.target, [from, stop]);
          poses.set(action.target, stop);
          bands.set(action.target, undefined);
        }
        continue;
      }
      if (action.motion === "along" && action.through?.length) {
        const last = world.point(action.through[action.through.length - 1]);
        if (last) {
          shifts.set(action.target, [from, last]);
          poses.set(action.target, last);
          bands.set(action.target, undefined);
        }
        continue;
      }
      if (action.motion !== "move" && action.motion !== "fall" && action.motion !== "wander") continue;
      if (action.motion === "wander" && action.to === undefined) continue;
      const journey = travel(action, from, rest.size, world, band(action.target), shifts, (reference) => travelledBy(world.owner(reference)));
      if (journey.arrival) {
        // A named destination is honoured exactly; any other end keeps off the pictures it would land on.
        const named = action.to !== undefined && !world.zoneCentre(action.to);
        const toward = action.motion === "move" ? (action.toward ?? action.away) : undefined;
        // A thing travelling on a picture (a ship in a canal) goes about on it: never off it, never kept off it.
        const ground = world.ground(action.target);
        const riding = ground && !named && over(from, ground.drawn) ? ground : undefined;
        if (riding) journey.arrival = keptOn(from, journey.arrival, riding.drawn);
        const blocking = taken(action.target, index, riding?.id ?? toward ?? (named ? action.to : undefined), named);
        journey.arrival = keptApart(from, journey.arrival, rest.size, blocking, world.frame(action.target)) ?? journey.arrival;
        ends.push({ id: action.target, box: rectAt(journey.arrival, rest.size) });
        shifts.set(action.target, [from, journey.arrival]);
        poses.set(action.target, journey.arrival);
        // What rides with it ends the journey as far along: a block hauled on a sledge is where the sledge took it.
        const [dx, dy] = [journey.arrival[0] - from[0], journey.arrival[1] - from[1]];
        for (const rider of action.with ?? []) {
          const at = where(rider);
          if (at) poses.set(rider, [at[0] + dx, at[1] + dy]);
        }
        bands.set(action.target, action.to !== undefined && world.zoneCentre(action.to) ? (action.to as ZoneToken) : undefined);
      }
      journeys.set(action, journey);
    }
  }
  return journeys;
}

function travel(action: Travel, from: Pt, size: [number, number], world: JourneyWorld, band: ZoneToken | undefined, shifts: Map<string, [Pt, Pt]>, gone: (reference: string) => Pt): Journey {
  const refuse = (refused: string): Journey => ({ from, refused });
  const frame = world.frame(action.target);
  const inFrame = ([x, y]: Pt): Pt => [
    Math.max(frame.x + size[0] / 2, Math.min(frame.x + frame.w - size[0] / 2, x)),
    Math.max(frame.y + size[1] / 2, Math.min(frame.y + frame.h - size[1] / 2, y)),
  ];
  const finish = (wanted: Pt): Journey => {
    const arrival = inFrame(wanted);
    if (Math.hypot(arrival[0] - from[0], arrival[1] - from[1]) < 1) return { ...refuse(`'${action.target}' has no room on screen to move that way`), wanted };
    return { from, arrival, wanted };
  };

  const move = action.motion === "move" ? (action as Move) : undefined;
  const way = move ? heading(move, from, size, world, shifts, gone) : undefined;
  if (way !== undefined) {
    if (typeof way === "string") return refuse(way);
    return finish([from[0] + way.u[0] * way.by, from[1] + way.u[1] * way.by]);
  }

  const to = action.to!;
  const zone = world.zoneCentre(to);
  if (zone) {
    const own = band ?? nearestBand(from, world);
    const base = own ? world.zoneCentre(own) : undefined;
    const shift: Pt = base ? [zone[0] - base[0], zone[1] - base[1]] : [zone[0] - from[0], zone[1] - from[1]];
    if (Math.hypot(shift[0], shift[1]) < NO_MOVE) return refuse(`'${action.target}' is already in '${to}'; a zone move goes from the band it is in`);
    return finish([from[0] + shift[0], from[1] + shift[1]]);
  }
  const landed = landing(world, gone, action.target, from, to, action.land);
  if (!landed) return refuse(`'${to}' cannot be reached`);
  return finish(landed);
}

/** The way and the distance a directional move goes, or why it cannot; undefined for a move with a destination. */
function heading(move: Move, from: Pt, size: [number, number], world: JourneyWorld, shifts: Map<string, [Pt, Pt]>, gone: (reference: string) => Pt): { u: Pt; by: number } | string | undefined {
  const own = (u: Pt) => Math.abs(u[0]) * size[0] + Math.abs(u[1]) * size[1];
  const distance = (fallback: number) => (move.by === undefined ? fallback : (measured(move.by, world) ?? fallback));
  if (move.direction !== undefined) {
    const u = directionVector(move.direction);
    return { u, by: distance(own(u)) };
  }
  if (move.toward !== undefined) {
    const rests = world.point(move.toward);
    const [dx, dy] = gone(move.toward);
    const there: Pt | undefined = rests && [rests[0] + dx, rests[1] + dy];
    const u = there ? unit([there[0] - from[0], there[1] - from[1]]) : undefined;
    if (!u || !there) return `'${move.target}' is already at '${move.toward}'`;
    const meets = landing(world, gone, move.target, from, move.toward);
    const reach = meets ? Math.max(0, (meets[0] - from[0]) * u[0] + (meets[1] - from[1]) * u[1]) : own(u);
    // Toward a thing stops where it would meet it: sent further, a picture was laid over the word it went to.
    return { u, by: meets ? Math.min(distance(reach), reach) : distance(reach) };
  }
  if (move.away !== undefined) {
    const u = awayFrom(move.away, from, world);
    return u ? { u, by: distance(own(u)) } : `'${move.target}' has no way away from '${move.away}': it sits on it and '${move.away}' faces nowhere known`;
  }
  if (move.opposite !== undefined) {
    const partner = shifts.get(move.opposite);
    const done = partner ? ([partner[1][0] - partner[0][0], partner[1][1] - partner[0][1]] as Pt) : undefined;
    const u = done ? unit([-done[0], -done[1]]) : undefined;
    if (u && done) return { u, by: distance(Math.hypot(done[0], done[1])) };
    const faces = world.facing(move.opposite);
    if (!faces) return `'${move.opposite}' makes no journey in this beat and faces nowhere known, so '${move.target}' has no opposite way to go`;
    const back: Pt = [-faces[0], -faces[1]];
    return { u: back, by: distance(own(back)) };
  }
  return undefined;
}

/** Where a mover lands against a destination that has itself travelled: worked out where the destination rests, then carried to where it has gone. */
function landing(world: JourneyWorld, gone: (reference: string) => Pt, id: string, from: Pt, reference: string, land?: "surface" | "centre"): Pt | undefined {
  const [dx, dy] = gone(reference);
  const landed = world.landing(id, [from[0] - dx, from[1] - dy], reference, land);
  return landed && [landed[0] + dx, landed[1] + dy];
}

/** Away from a reference: from it to the mover, else out of its owner through it, else against the way its owner faces. */
function awayFrom(reference: string, from: Pt, world: JourneyWorld): Pt | undefined {
  const there = world.point(reference);
  const direct = there ? unit([from[0] - there[0], from[1] - there[1]]) : undefined;
  if (direct && there && Math.hypot(from[0] - there[0], from[1] - there[1]) > 4) return direct;
  const owner = world.owner(reference);
  const middle = owner !== reference ? world.rest(owner)?.at : undefined;
  const outward = middle && there ? unit([there[0] - middle[0], there[1] - middle[1]]) : undefined;
  if (outward) return outward;
  const faces = world.facing(owner);
  return faces ? [-faces[0], -faces[1]] : direct;
}

function measured(by: DistanceSpec, world: JourneyWorld): number | undefined {
  if (typeof by === "number") return by;
  const extent = world.extent(by.of);
  return extent ? by.times * (by.dimension === "height" ? extent.h : extent.w) : undefined;
}

/** The band a thing stands in: the zone whose centre is nearest it. */
function nearestBand(at: Pt, world: JourneyWorld): ZoneToken | undefined {
  let best: ZoneToken | undefined;
  let reach = Infinity;
  for (const zone of world.bands) {
    const centre = world.zoneCentre(zone);
    if (!centre) continue;
    const distance = Math.hypot(centre[0] - at[0], centre[1] - at[1]);
    if (distance < reach) [best, reach] = [zone, distance];
  }
  return best;
}

/** A drawn thing moved by (dx, dy). */
function shifted(drawn: Drawn, dx: number, dy: number): Drawn {
  const move = ([x, y]: Pt): Pt => [x + dx, y + dy];
  if ("box" in drawn) return { box: { ...drawn.box, x: drawn.box.x + dx, y: drawn.box.y + dy } };
  return "area" in drawn ? { area: drawn.area.map(move) } : { ...drawn, stroke: drawn.stroke.map(move) };
}

/** The arrival slid along the line of travel until the mover's box is clear of what is taken, or undefined when no slide clears it. */
function keptApart(from: Pt, arrival: Pt, size: [number, number], taken: Drawn[], frame: Rect, shares = SLIDE): Pt | undefined {
  const clear = (at: Pt) => {
    const box = rectAt(at, size);
    const framed = box.x >= frame.x - 0.5 && box.y >= frame.y - 0.5 && box.x + box.w <= frame.x + frame.w + 0.5 && box.y + box.h <= frame.y + frame.h + 0.5;
    return framed && !taken.some((one) => meets(one, box));
  };
  if (clear(arrival)) return arrival;
  const [dx, dy] = [arrival[0] - from[0], arrival[1] - from[1]];
  return shares.map((share): Pt => [arrival[0] + dx * share, arrival[1] + dy * share]).find(clear);
}

/** Where on its route a walker that no stop leaves clear is least covered by what is taken, at the end on a tie. */
function leastCovered(from: Pt, arrival: Pt, size: [number, number], taken: Drawn[]): Pt {
  const [dx, dy] = [arrival[0] - from[0], arrival[1] - from[1]];
  const covered = (at: Pt) => {
    const box = rectAt(at, size);
    return taken.reduce((sum, one) => {
      const other = boundsOf([one]);
      if (!other) return sum;
      const w = Math.min(box.x + box.w, other.x + other.w) - Math.max(box.x, other.x);
      const h = Math.min(box.y + box.h, other.y + other.h) - Math.max(box.y, other.y);
      return sum + Math.max(0, w) * Math.max(0, h);
    }, 0);
  };
  const stops = SHORTER.map((share): Pt => [arrival[0] + dx * share, arrival[1] + dy * share]);
  return stops.reduce((best, at) => (covered(at) < covered(best) ? at : best));
}

const over = (at: Pt, drawn: Drawn[]) => drawn.some((one) => meets(one, rectAt(at, [1, 1])));
// The share of a journey on its ground is found to this fineness.
const ON_STEPS = 40;

/** The arrival drawn back along the line of travel until the mover's centre is still over its ground. */
function keptOn(from: Pt, arrival: Pt, ground: Drawn[]): Pt {
  const at = (share: number): Pt => [from[0] + (arrival[0] - from[0]) * share, from[1] + (arrival[1] - from[1]) * share];
  for (let step = ON_STEPS; step > 0; step--) if (over(at(step / ON_STEPS), ground)) return at(step / ON_STEPS);
  return from;
}
