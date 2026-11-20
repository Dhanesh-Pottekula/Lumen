/**
 * resolve — turn one scene (ids, beats, narration words) into a timeline of seconds.
 *
 * The scene writer never writes a time. Each beat is due when its `say` words are spoken, which is known once
 * the narration's length (`floor`) is known: from the audio, or 0.4 s a word. Everything here is pure, so the
 * same scene and floor always give the same timeline and the film stays a function of t.
 */
import type { Action, CutoutSize, FilmScene, Hotspot, ImageObject, Movement, OverlayObject, Pace, Path, Place, Relation, Shot, SizeSpec, Tilt } from "./types";
import { findCue, narrationWords, subtitles } from "./words";

/** How long a beat's moves take. */
export const PACE_SECONDS: Record<Pace, number> = { instant: 0.25, quick: 0.9, normal: 1.7, slow: 2.8, dramatic: 4.2 };

/** Seconds the last frame is held after the narration ends, before the next scene. */
const TAIL = 0.6;

export interface CameraKey {
  at: number;
  dur: number;
  /** Picture the camera is on, and the part it frames (if any). */
  picture: string;
  part?: string;
  shot: Shot;
  movement: Movement;
}

/** The frame's shape. A picture of another shape covers it, so part of the picture lies outside the frame. */
export const FRAME_ASPECT = 16 / 9;

/** A cut-out's height as a share of the frame's height. */
export const CUTOUT_SIZE: Record<CutoutSize, number> = { tiny: 0.12, small: 0.22, medium: 0.36, large: 0.56, huge: 0.82 };
const TILT_DEGREES: Record<Tilt, number> = { upright: 0, left: -22, right: 22, over: 180 };

/** Where a cut-out is and how it looks at one instant. */
export interface CutoutState {
  /** Its base point as fractions of the background picture. */
  x: number;
  y: number;
  /** Height as a share of the frame's height. */
  size: number;
  /** 1 as drawn, -1 mirrored; values between are the turn in progress. */
  flip: number;
  /** Degrees, clockwise. */
  tilt: number;
  alpha: number;
  /** 1 when the base point is under its feet (it stands on something), 0 when it is its middle (it floats). */
  feet: number;
}

/** One change to a cut-out: from `at`, over `dur` seconds, it eases to `to`. */
export interface CutoutKey {
  at: number;
  dur: number;
  to: CutoutState;
  path: Path;
  /** The picture drawn from this key on: a `swap` changes it. */
  image: string;
}

/** One cut-out's time on one background: where it starts and every change after. */
export interface CutoutTrack {
  /** The background it stands on. It is only drawn while that background is on screen. */
  picture: string;
  from: CutoutState;
  keys: CutoutKey[];
  /** When it is gone: removed, or the background changed. Infinity means it stays to the end of the scene. */
  until: number;
}

/**
 * The least and most of the frame's height a cut-out takes, whatever was asked. Never a speck; and never taller
 * than the room between the top of the frame and the subtitles, so the whole of it can always be shown.
 */
const SIZE_LIMITS: [number, number] = [0.04, 0.8];

/**
 * A size as a share of the frame's height. One measured against a part is that part's height in the drawing,
 * times the number given: the part finder's box says how big the thing really came out, and how near or far it
 * is, so a figure placed at a far door is small and the same figure at a near door is large. `ground` is the
 * background on screen; `fallback` is used when the part is not there.
 */
export function sizeShare(size: SizeSpec | undefined, ground: ImageObject | undefined, fallback = CUTOUT_SIZE.medium): number {
  const limit = (share: number) => Math.min(SIZE_LIMITS[1], Math.max(SIZE_LIMITS[0], share));
  if (size === undefined) return fallback;
  if (typeof size === "string") return CUTOUT_SIZE[size] ?? fallback;
  if (typeof size === "number") return limit(size);
  const box = ground?.hotspots?.[size.of.split(".")[1] ?? ""];
  if (!box) return fallback;
  // The box's height is a share of the whole picture; the frame shows a little less than the whole picture.
  const { my } = frameMargins(ground?.aspect ?? FRAME_ASPECT);
  return limit((box[3] / (1 - 2 * my)) * (size.times ?? 1));
}

/**
 * How much of the frame a cut-out of this size and shape takes, as shares of the frame's width and height.
 * A size is the cut-out's height, unless that would make a wide thing (a stretched figure, a long vehicle) too
 * wide for the frame: then its width is what the size limits, and it is drawn shorter.
 */
export function cutoutBox(size: number, aspect: number): { w: number; h: number } {
  const shape = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const w = (size * shape) / FRAME_ASPECT;
  const widest = Math.min(0.9, size * 1.25);
  return w > widest ? { w: widest, h: size * (widest / w) } : { w, h: size };
}

/** The frame's edges a cut-out is kept inside: a small margin all round, and clear of the subtitles below. */
const KEEP = { side: 0.03, top: 0.04, bottom: 0.86 };

/**
 * Move a cut-out's base point just far enough that the whole of it is inside the frame. One too big to fit is
 * centred. `aspect` is the cut-out's own shape, `ground` the background's.
 */
export function keptInFrame<T extends Pick<CutoutState, "x" | "y" | "feet">>(spot: T, size: number, aspect: number, ground: number): T {
  const { mx, my } = frameMargins(ground);
  const box = cutoutBox(size, aspect);
  // The base point in shares of the frame, then the cut-out's edges round it.
  let vx = (spot.x - mx) / (1 - 2 * mx);
  let vy = (spot.y - my) / (1 - 2 * my);
  const roomX = 1 - 2 * KEEP.side;
  vx = box.w >= roomX ? 0.5 : Math.min(1 - KEEP.side - box.w / 2, Math.max(KEEP.side + box.w / 2, vx));
  // With its feet on the base point the cut-out reaches up from it; floating, it is centred on it.
  const above = box.h * (0.5 + 0.5 * spot.feet);
  const below = box.h - above;
  const roomY = KEEP.bottom - KEEP.top;
  vy = box.h >= roomY ? KEEP.top + roomY / 2 + (above - below) / 2 : Math.min(KEEP.bottom - below, Math.max(KEEP.top + above, vy));
  return { ...spot, x: mx + vx * (1 - 2 * mx), y: my + vy * (1 - 2 * my) };
}

/** The part of a background picture of this shape that the frame shows, as margins cut from each side (0..0.5). */
export function frameMargins(aspect: number): { mx: number; my: number } {
  return aspect >= FRAME_ASPECT ? { mx: (1 - FRAME_ASPECT / aspect) / 2, my: 0 } : { mx: 0, my: (1 - aspect / FRAME_ASPECT) / 2 };
}

/** A part this wide, reaching this far down the picture, is ground to stand on and not a thing with a top. */
const GROUND_WIDTH = 0.6;
const GROUND_REACH = 0.97;
/** How far below the top of a part's box a thing placed "on" it stands, as a share of the box's height. */
const SURFACE_INSET = 0.1;
/** A thing at least this share of a part's width lies or sits in the part, with its underside this far down the box. */
const RESTING_COVER = 0.5;
const SEAT_HEIGHT = 0.6;

const ZONE_POINT: Record<string, [number, number]> = {
  "top-left": [0.2, 0.27], top: [0.5, 0.27], "top-right": [0.8, 0.27],
  left: [0.2, 0.48], center: [0.5, 0.48], right: [0.8, 0.48],
  "bottom-left": [0.2, 0.66], bottom: [0.5, 0.66], "bottom-right": [0.8, 0.66],
};

/**
 * Where a named place is on the background, for a cut-out of height `size`. A zone or an edge is a point in the
 * frame; a part is somewhere against its box. `last` is where the cut-out is now: leaving by an edge keeps its
 * height (or its side), so it walks straight out.
 */
export function placeOf(place: Place, relation: Relation, image: ImageObject | undefined, size: number, last?: CutoutState, shape = 1): Pick<CutoutState, "x" | "y" | "feet"> | null {
  // A point is taken as given: with "at" it is the cut-out's middle, with any other relation it is where it stands.
  if (typeof place !== "string") return { x: place.x, y: place.y, feet: relation === "at" ? 0 : 1 };
  const { mx, my } = frameMargins(image?.aspect ?? FRAME_ASPECT);
  const inFrame = (vx: number, vy: number) => ({ x: mx + vx * (1 - 2 * mx), y: my + vy * (1 - 2 * my) });
  // Far enough outside an edge that a cut-out of this size is wholly out of the frame.
  const out = 0.12 + size * 0.5;
  if (place === "off-left") return last ? { x: inFrame(-out, 0).x, y: last.y, feet: last.feet } : { ...inFrame(-out, 0.5), feet: 0 };
  if (place === "off-right") return last ? { x: inFrame(1 + out, 0).x, y: last.y, feet: last.feet } : { ...inFrame(1 + out, 0.5), feet: 0 };
  if (place === "off-top") return last ? { x: last.x, y: inFrame(0, -out).y, feet: last.feet } : { ...inFrame(0.5, -out), feet: 0 };
  if (place === "off-bottom") return last ? { x: last.x, y: inFrame(0, 1 + out + size * 0.5).y, feet: last.feet } : { ...inFrame(0.5, 1 + out), feet: 0 };
  const zone = ZONE_POINT[place];
  if (zone) return { ...inFrame(zone[0], zone[1]), feet: 0 };
  const [, part] = place.split(".");
  const box: Hotspot | undefined = part ? image?.hotspots?.[part] : [0, 0, 1, 1];
  if (!box) return null;
  const [bx, by, bw, bh] = box;
  // Half the cut-out's width plus a small gap, in fractions of the picture's width. Its real shape is not known
  // here, so it is taken as a little over half as wide as it is tall.
  const half = (size * 0.3) / Math.max(FRAME_ASPECT, image?.aspect ?? FRAME_ASPECT);
  switch (relation) {
    case "on": {
      // A floor, a road or a field is drawn running away from the viewer: its box's top edge is its far end,
      // so a thing standing "on" it stands in the middle of it. Anything else is stood a little below the top
      // of its box: a table or a counter is seen slightly from above, and that strip is its upper surface.
      const ground = bw >= GROUND_WIDTH && by + bh >= GROUND_REACH;
      // A thing about as wide as the part it is on is lying or sitting in it: a figure along a sofa or a bed.
      // The top of such a part's box is its back or its headboard, so the thing rests lower, at seat height.
      const across = cutoutBox(size, shape).w * (1 - 2 * mx);
      const resting = !ground && across >= bw * RESTING_COVER;
      return { x: bx + bw / 2, y: by + bh * (ground ? 0.5 : resting ? SEAT_HEIGHT : SURFACE_INSET), feet: 1 };
    }
    case "before":
      return { x: bx + bw / 2, y: by + bh, feet: 1 };
    case "left-of":
      return { x: bx - half, y: by + bh, feet: 1 };
    case "right-of":
      return { x: bx + bw + half, y: by + bh, feet: 1 };
    default:
      return { x: bx + bw / 2, y: by + bh / 2, feet: 0 };
  }
}

export interface Timed<T> {
  at: number;
  /** When it leaves. Infinity means it stays to the end of the scene. */
  until: number;
  item: T;
}

export interface ResolvedScene {
  id: string;
  narration: string;
  /** Seconds the narration takes to say. */
  floor: number;
  duration: number;
  images: Map<string, ImageObject>;
  /** Which picture fills the screen from when, and how it arrives. The first entry is at 0. */
  backdrops: { at: number; picture: string; entrance: "cut" | "iris" | "fade" }[];
  /** A figure's own line, shown as speech beside it. One at a time. */
  speeches: Timed<{ picture: string; part?: string; text: string }>[];
  cameras: CameraKey[];
  labels: Timed<{ picture: string; part?: string; text: string }>[];
  attentions: Timed<{ picture: string; part?: string; verb: "dim" | "encircle" | "pulse" }>[];
  overlays: Timed<{ object: OverlayObject; entrance: "fade" | "slam" | "word-by-word"; dur: number }>[];
  shakes: { at: number; strength: number }[];
  flashes: number[];
  /** Cut-outs standing on the backgrounds, each with its changes in time order. */
  cutouts: CutoutTrack[];
  subtitles: { at: number; until: number; text: string }[];
  /** Each beat's cue: the narration word it waits for and the second it is due. */
  cues: { word: number; at: number }[];
  /** Where the camera starts, when the previous scene ended on this scene's opening picture. */
  openLens?: { fx: number; fy: number; zoom: number };
}

const STRENGTH = { subtle: 5, normal: 11, strong: 20 } as const;

export function resolveScene(scene: FilmScene, floor: number, wordTimes?: number[]): ResolvedScene {
  const words = narrationWords(scene.narration);
  const wordCount = Math.max(1, words.length);
  // When a word is spoken: measured from the voice if we have it, else assuming an even speaking rate.
  const measured = wordTimes && wordTimes.length === words.length ? wordTimes : null;
  const spokenAt = (word: number) => (measured ? measured[Math.min(word, measured.length - 1)] : (word / wordCount) * floor);
  const images = new Map<string, ImageObject>();
  const overlayObjects = new Map<string, OverlayObject>();
  for (const object of scene.objects) {
    if (object.kind === "image") images.set(object.id, object);
    else overlayObjects.set(object.id, object);
  }
  const opening = [...images.values()].find((o) => o.initial !== "hidden") ?? [...images.values()][0];

  const out: ResolvedScene = {
    id: scene.id,
    narration: scene.narration,
    floor,
    duration: floor + TAIL,
    images,
    backdrops: opening ? [{ at: 0, picture: opening.id, entrance: "cut" }] : [],
    speeches: [],
    cameras: [],
    labels: [],
    attentions: [],
    overlays: [],
    shakes: [],
    flashes: [],
    cutouts: [],
    subtitles: [],
    cues: [],
  };

  // ── When each beat starts ────────────────────────────────────────────────────────────────────────
  const starts: number[] = [];
  let spoken = 0;
  let last = 0;
  scene.beats.forEach((beat, i) => {
    let at = i === 0 ? 0 : last + 0.4;
    if (beat.say) {
      const word = findCue(words, beat.say, spoken);
      if (word >= 0) {
        spoken = word + 1;
        at = Math.max(i === 0 ? 0 : last + 0.05, spokenAt(word));
        out.cues.push({ word, at });
      }
    }
    starts.push(at);
    last = at;
  });

  // ── What each beat does ──────────────────────────────────────────────────────────────────────────
  let current = opening?.id;
  const labelIds = new Map<string, Timed<unknown>>();
  const shown = new Map<string, Timed<unknown>>();
  /** An attention mark lasts until the picture changes or the camera or another mark takes over. */
  const endMarks = (at: number, alsoLabels: boolean) => {
    for (const mark of out.attentions) if (mark.until === Infinity && mark.at < at) mark.until = Math.max(at, mark.at + 1.2);
    if (alsoLabels) {
      for (const label of out.labels) if (label.until === Infinity) label.until = at;
      for (const line of out.speeches) if (line.until > at) line.until = at;
    }
  };
  /** A cut-out picture's own shape, width over height, and the shape of the background on screen. */
  const shapeOf = (id: string) => images.get(id)?.aspect ?? 1;
  const groundShape = () => (current ? images.get(current)?.aspect : undefined) ?? FRAME_ASPECT;
  /** The cut-outs on screen now, by the id they are known by (a swap renames one). */
  const standing = new Map<string, { track: CutoutTrack; state: CutoutState; image: string }>();
  const cutTo = (picture: string, at: number, entrance: "cut" | "iris" | "fade" = "cut") => {
    if (picture === current) return;
    // Cut-outs belong to the background they were placed on, and leave with it.
    for (const one of standing.values()) one.track.until = Math.min(one.track.until, at);
    standing.clear();
    current = picture;
    out.backdrops.push({ at, picture, entrance });
    endMarks(at, true);
  };
  const aim = (target: string): { picture: string; part?: string } => {
    const [picture, part] = target.split(".");
    return part ? { picture, part } : { picture };
  };

  scene.beats.forEach((beat, i) => {
    const at = starts[i];
    const dur = PACE_SECONDS[beat.pace ?? "normal"];
    out.duration = Math.max(out.duration, at + dur + 0.4);
    const moves = beat.actions.some((a) => a.do === "camera" || a.do === "attention" || a.do === "cut");
    if (moves) endMarks(at, false);

    for (const action of beat.actions as Action[]) {
      switch (action.do) {
        case "cut":
          cutTo(action.to, at, action.entrance);
          out.cameras.push({ at, dur: 0, picture: action.to, shot: "overview", movement: "cut" });
          break;
        case "camera": {
          const target = aim(action.target);
          // Aiming at a picture that is not on screen means cutting to it first.
          const jumped = target.picture !== current;
          cutTo(target.picture, at);
          const movement = jumped ? "cut" : (action.movement ?? "push");
          out.cameras.push({ at, dur: movement === "cut" ? 0 : dur, ...target, shot: action.shot ?? (target.part ? "close" : "overview"), movement });
          break;
        }
        case "label": {
          const target = aim(action.target);
          if (target.picture !== current) break;
          const label = { at, until: Infinity, item: { ...target, text: action.text } };
          out.labels.push(label);
          if (action.id) labelIds.set(action.id, label);
          break;
        }
        case "speak": {
          const target = aim(action.target);
          if (target.picture !== current) break;
          // One line at a time: a new line takes the last one off. A line stays for its sentence.
          for (const line of out.speeches) if (line.until > at) line.until = at;
          const next = starts[i + 1];
          out.speeches.push({ at, until: Math.max(at + 2.2, Math.min(next ?? at + 4.5, at + 6)), item: { ...target, text: action.text } });
          break;
        }
        case "attention": {
          const target = aim(action.target);
          if (target.picture !== current) break;
          out.attentions.push({ at, until: Infinity, item: { ...target, verb: action.verb } });
          break;
        }
        case "show":
          for (const id of action.targets) {
            const object = overlayObjects.get(id);
            if (!object || shown.has(id)) continue;
            const overlay = { at, until: Infinity, item: { object, entrance: action.entrance ?? "fade", dur: Math.max(0.5, dur) } };
            out.overlays.push(overlay);
            shown.set(id, overlay);
          }
          break;
        case "hide":
          for (const id of action.targets) {
            const target = shown.get(id) ?? labelIds.get(id);
            if (target && target.until === Infinity) target.until = at;
            shown.delete(id);
          }
          break;
        case "place": {
          if (!current || standing.has(action.what) || !images.get(action.what)?.cutout) break;
          const size = sizeShare(action.size, images.get(current));
          const found = placeOf(action.at, action.where ?? "at", images.get(current), size, undefined, shapeOf(action.what));
          if (!found) break;
          // Just outside an edge is meant to be out of the frame; anywhere else the whole cut-out is kept in it.
          const spot = offstage(action.at) ? found : keptInFrame(found, size, shapeOf(action.what), groundShape());
          const state: CutoutState = { ...spot, size, flip: action.mirror ? -1 : 1, tilt: 0, alpha: 1 };
          const entrance = action.entrance ?? "fade";
          const from: CutoutState = { ...state, alpha: entrance === "appear" ? 1 : 0, size: entrance === "pop" ? size * 0.4 : size };
          const track: CutoutTrack = { picture: current, from, keys: [{ at, dur: entrance === "appear" ? 0 : Math.min(0.6, Math.max(0.25, dur)), to: state, path: "straight", image: action.what }], until: Infinity };
          out.cutouts.push(track);
          standing.set(action.what, { track, state, image: action.what });
          break;
        }
        case "move": {
          const one = standing.get(action.what);
          if (!one || !current) break;
          // A move may bring a new size with it: arriving somewhere nearer or farther, the thing is bigger or smaller.
          const size = sizeShare(action.size, images.get(current), one.state.size);
          const found = placeOf(action.to, action.where ?? "at", images.get(current), size, one.state, shapeOf(one.image));
          if (!found) break;
          const spot = offstage(action.to) ? found : keptInFrame(found, size, shapeOf(one.image), groundShape());
          one.state = { ...one.state, ...spot, size };
          // A move may run on until the next beat, so a thing can travel for as long as the voice is on it.
          const until = starts[i + 1] ?? floor;
          const span = action.lasts === "until-next" ? Math.max(dur, until - at) : Math.max(0.5, dur);
          one.track.keys.push({ at, dur: span, to: one.state, path: action.path ?? "straight", image: one.image });
          out.duration = Math.max(out.duration, at + span + 0.2);
          break;
        }
        case "swap": {
          const one = standing.get(action.what);
          if (!one || standing.has(action.to) || !images.get(action.to)?.cutout) break;
          one.image = action.to;
          // Another pose can be another shape (a figure stretched long): it is drawn to fit, and nudged back
          // into the frame if the new shape would reach past an edge.
          one.state = keptInFrame(one.state, one.state.size, shapeOf(action.to), groundShape());
          one.track.keys.push({ at, dur: 0, to: one.state, path: "straight", image: action.to });
          standing.delete(action.what);
          standing.set(action.to, one);
          break;
        }
        case "resize": {
          const one = standing.get(action.what);
          if (!one) break;
          const size = sizeShare(action.size, current ? images.get(current) : undefined, one.state.size);
          one.state = keptInFrame({ ...one.state, size }, size, shapeOf(one.image), groundShape());
          one.track.keys.push({ at, dur: Math.max(0.4, dur), to: one.state, path: "straight", image: one.image });
          break;
        }
        case "turn": {
          const one = standing.get(action.what);
          if (!one) break;
          one.state = { ...one.state, flip: action.mirror === undefined ? one.state.flip : action.mirror ? -1 : 1, tilt: action.tilt ? TILT_DEGREES[action.tilt] : one.state.tilt };
          one.track.keys.push({ at, dur: Math.min(0.9, Math.max(0.3, dur)), to: one.state, path: "straight", image: one.image });
          break;
        }
        case "remove": {
          const one = standing.get(action.what);
          if (!one) break;
          const exit = action.exit ?? "fade";
          const span = exit === "cut" ? 0 : Math.min(0.7, Math.max(0.25, dur));
          one.state = { ...one.state, alpha: 0, size: exit === "shrink" ? one.state.size * 0.2 : one.state.size };
          one.track.keys.push({ at, dur: span, to: one.state, path: "straight", image: one.image });
          one.track.until = at + span;
          standing.delete(action.what);
          break;
        }
        case "shake":
          out.shakes.push({ at, strength: STRENGTH[action.strength ?? "normal"] });
          break;
        case "flash":
          out.flashes.push(at);
          break;
      }
    }
  });

  // ── Subtitles: each line is on screen from its first word until the next line's ──────────────────
  const lines = subtitles(scene.narration);
  lines.forEach((line, i) => {
    const at = spokenAt(line.word);
    const until = i + 1 < lines.length ? spokenAt(lines[i + 1].word) : floor + 0.3;
    out.subtitles.push({ at, until, text: line.text });
  });

  return out;
}

/** True for a place just outside an edge of the frame. */
const offstage = (place: Place) => typeof place === "string" && place.startsWith("off-");

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/**
 * A cut-out at local time `t`: its state, the picture to draw, and how far its path lifts it off its line of
 * travel (an arc or a hop). Each key eases from wherever the keys before it had brought the cut-out, so two
 * changes that overlap blend instead of jumping. Null before it arrives and after it has gone.
 */
export function cutoutAt(track: CutoutTrack, t: number): { state: CutoutState; image: string; lift: number } | null {
  const first = track.keys[0];
  if (!first || t < first.at || t >= track.until) return null;
  let state = track.from;
  let image = first.image;
  let lift = 0;
  for (const key of track.keys) {
    if (key.at > t) break;
    const p = key.dur <= 0 ? 1 : ease(Math.min(1, Math.max(0, (t - key.at) / key.dur)));
    const mix = (a: number, b: number) => a + (b - a) * p;
    if (p > 0 && p < 1 && key.path !== "straight") {
      const far = Math.hypot(key.to.x - state.x, key.to.y - state.y);
      lift += key.path === "arc" ? Math.sin(Math.PI * p) * Math.min(0.22, 0.05 + far * 0.3) : Math.abs(Math.sin(Math.PI * 3 * p)) * Math.min(0.07, key.to.size * 0.18);
    }
    state = { x: mix(state.x, key.to.x), y: mix(state.y, key.to.y), size: mix(state.size, key.to.size), flip: mix(state.flip, key.to.flip), tilt: mix(state.tilt, key.to.tilt), alpha: mix(state.alpha, key.to.alpha), feet: mix(state.feet, key.to.feet) };
    image = key.image;
  }
  return { state, image, lift };
}

/** The picture on screen at local time `t`. */
export function backdropAt(scene: ResolvedScene, t: number): string | undefined {
  let picture: string | undefined;
  for (const entry of scene.backdrops) if (entry.at <= t) picture = entry.picture;
  return picture ?? scene.backdrops[0]?.picture;
}
