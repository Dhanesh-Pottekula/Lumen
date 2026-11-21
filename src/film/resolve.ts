/**
 * resolve — turn one scene (ids, beats, narration words) into a timeline of seconds.
 *
 * The scene writer never writes a time. Each beat is due when its `say` words are spoken, which is known once
 * the narration's length (`floor`) is known: from the audio, or 0.4 s a word. Everything here is pure, so the
 * same scene and floor always give the same timeline and the film stays a function of t.
 */
import type { Action, EffectKind, Entrance, FilmScene, ImageObject, Ink, Movement, OverlayObject, Pace, Region, Shot, Spot, StampIcon } from "./types";
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
  /** A spot the camera centres on, in place of a part: how a pan names where it starts and ends. */
  spot?: Spot;
  shot: Shot;
  movement: Movement;
}

export interface Timed<T> {
  at: number;
  /** When it leaves. Infinity means it stays to the end of the scene. */
  until: number;
  item: T;
}

/**
 * Something the film draws on the background by code: an arrow, a line, a box, a sign or a moving effect. It
 * belongs to the background it was drawn on, follows the camera with it, and leaves when that background does.
 * `dur` is how long it takes to be drawn.
 */
export type Mark = { picture: string; dur: number } & (
  | { kind: "arrow"; from: Spot; to: Spot; color: Ink; bend: "straight" | "left" | "right" }
  | { kind: "line"; from: Spot; to: Spot; color: Ink; dashed: boolean }
  | { kind: "box"; target: string | Region; style: "outline" | "highlight"; color: Ink }
  | { kind: "stamp"; icon: StampIcon; at: Spot; size: "small" | "medium" | "large"; color: Ink }
  | { kind: "effect"; effect: EffectKind; at?: Spot; seed: number }
  | { kind: "travel"; path: Spot[]; color: Ink; repeat: boolean }
);

/** The pointer's time on one background: each spot it goes to, in order. It glides from one to the next. */
export interface PointerTrack {
  picture: string;
  keys: { at: number; dur: number; spot: Spot }[];
  until: number;
}

export interface ResolvedScene {
  id: string;
  narration: string;
  /** Seconds the narration takes to say. */
  floor: number;
  duration: number;
  images: Map<string, ImageObject>;
  /** Which picture fills the screen from when, and how it arrives. The first entry is at 0. */
  backdrops: { at: number; picture: string; entrance: Entrance }[];
  /** A figure's own line, shown as speech beside it. One at a time. */
  speeches: Timed<{ picture: string; part?: string; text: string }>[];
  cameras: CameraKey[];
  labels: Timed<{ picture: string; part?: string; text: string }>[];
  attentions: Timed<{ picture: string; part?: string; verb: "dim" | "encircle" | "pulse" }>[];
  overlays: Timed<{ object: OverlayObject; entrance: "fade" | "slam" | "word-by-word"; dur: number }>[];
  shakes: { at: number; strength: number }[];
  flashes: number[];
  /** Arrows, lines, boxes, signs and effects drawn on the backgrounds. */
  marks: Timed<Mark>[];
  pointers: PointerTrack[];
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
    marks: [],
    pointers: [],
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
      for (const mark of out.marks) if (mark.until === Infinity) mark.until = at;
      for (const track of out.pointers) if (track.until === Infinity) track.until = at;
      // Words, numbers and charts were put up for the picture that is going, so they go with it. One brought
      // on in this same beat is for the new picture and stays.
      for (const overlay of out.overlays) if (overlay.until === Infinity && overlay.at < at) overlay.until = at;
      for (const [id, overlay] of shown) if (overlay.until !== Infinity) shown.delete(id);
      for (const line of out.speeches) if (line.until > at) line.until = at;
    }
  };
  /** When the picture now on screen came on. */
  let cameOn = 0;
  const cutTo = (picture: string, at: number, entrance: Entrance = "cut") => {
    if (picture === current) return;
    current = picture;
    cameOn = at;
    out.backdrops.push({ at, picture, entrance });
    endMarks(at, true);
  };
  const aim = (target: string): { picture: string; part?: string } => {
    const [picture, part] = target.split(".");
    return part ? { picture, part } : { picture };
  };

  /** Put a drawn mark on the background now on screen. With an id it can be hidden, as a label can. */
  const mark = (at: number, item: Mark, id?: string) => {
    const timed: Timed<Mark> = { at, until: Infinity, item };
    out.marks.push(timed);
    if (id) labelIds.set(id, timed);
  };

  scene.beats.forEach((beat, i) => {
    const at = starts[i];
    const dur = PACE_SECONDS[beat.pace ?? "normal"];
    out.duration = Math.max(out.duration, at + dur + 0.4);
    const moves = beat.actions.some((a) => a.do === "camera" || a.do === "pan" || a.do === "attention" || a.do === "cut");
    if (moves) endMarks(at, false);

    for (const action of beat.actions as Action[]) {
      switch (action.do) {
        case "cut":
          // A picture dissolves in unless the scene says how else it arrives.
          cutTo(action.to, at, action.entrance ?? "fade");
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
        case "pan": {
          if (!current) break;
          // The camera goes to where the pan starts (at once if the picture has just come on), then travels.
          const settle = cameOn === at ? 0 : Math.min(0.4, dur * 0.25);
          const until = starts[i + 1] ?? floor;
          const span = Math.max(0.8, (action.lasts === "until-next" ? Math.max(dur, until - at) : dur) - settle);
          const shot = action.shot ?? "medium";
          out.cameras.push({ at, dur: settle, picture: current, spot: action.from, shot, movement: settle ? "move" : "cut" });
          out.cameras.push({ at: at + settle, dur: span, picture: current, spot: action.to, shot, movement: "move" });
          out.duration = Math.max(out.duration, at + settle + span + 0.2);
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
        case "arrow":
          if (current) mark(at, { kind: "arrow", picture: current, dur: Math.min(1.4, Math.max(0.45, dur)), from: action.from, to: action.to, color: action.color ?? "accent", bend: action.bend ?? "right" }, action.id);
          break;
        case "line":
          if (current) mark(at, { kind: "line", picture: current, dur: Math.min(1.4, Math.max(0.45, dur)), from: action.from, to: action.to, color: action.color ?? "white", dashed: action.dashed === true }, action.id);
          break;
        case "box":
          if (current) mark(at, { kind: "box", picture: current, dur: Math.min(1.2, Math.max(0.5, dur)), target: action.target, style: action.style ?? "outline", color: action.color ?? "accent" }, action.id);
          break;
        case "stamp":
          if (current) mark(at, { kind: "stamp", picture: current, dur: 0.35, icon: action.icon, at: action.at, size: action.size ?? "medium", color: action.color ?? (action.icon === "cross" || action.icon === "warning" || action.icon === "flame" ? "danger" : action.icon === "check" ? "good" : "accent") }, action.id);
          break;
        case "effect":
          if (current) mark(at, { kind: "effect", picture: current, dur: 0.5, effect: action.kind, at: action.at, seed: out.marks.length + 1 }, action.id);
          break;
        case "travel": {
          if (!current) break;
          const until = starts[i + 1] ?? floor;
          mark(at, { kind: "travel", picture: current, dur: Math.max(0.7, action.lasts === "until-next" ? Math.max(dur, until - at) : dur), path: action.path, color: action.color ?? "accent", repeat: action.repeat === true }, action.id);
          break;
        }
        case "point": {
          if (!current) break;
          const open = out.pointers.find((track) => track.until === Infinity && track.picture === current);
          const key = { at, dur: Math.min(0.9, Math.max(0.35, dur)), spot: action.at };
          if (open) open.keys.push(key);
          else out.pointers.push({ picture: current, keys: [key], until: Infinity });
          break;
        }
        case "hide":
          for (const id of action.targets) {
            if (id === "pointer") for (const track of out.pointers) if (track.until === Infinity) track.until = at;
            const target = shown.get(id) ?? labelIds.get(id);
            if (target && target.until === Infinity) target.until = at;
            shown.delete(id);
          }
          break;
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

/** The picture on screen at local time `t`. */
export function backdropAt(scene: ResolvedScene, t: number): string | undefined {
  let picture: string | undefined;
  for (const entry of scene.backdrops) if (entry.at <= t) picture = entry.picture;
  return picture ?? scene.backdrops[0]?.picture;
}
