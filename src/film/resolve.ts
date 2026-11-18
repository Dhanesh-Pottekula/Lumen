/**
 * resolve — turn one scene (ids, beats, narration words) into a timeline of seconds.
 *
 * The scene writer never writes a time. Each beat is due when its `say` words are spoken, which is known once
 * the narration's length (`floor`) is known: from the audio, or 0.4 s a word. Everything here is pure, so the
 * same scene and floor always give the same timeline and the film stays a function of t.
 */
import type { Action, AttentionVerb, Edge, EffectKind, Entrance, FilmScene, IconKind, ImageObject, Movement, OverlayObject, Pace, Shot, Tone } from "./types";
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

export interface Timed<T> {
  at: number;
  /** When it leaves. Infinity means it stays to the end of the scene. */
  until: number;
  item: T;
}

/** One end of an arrow: a picture or one of its parts, or an edge of the frame. */
export type ArrowEnd = { part?: string; edge?: Edge };

export interface ResolvedScene {
  id: string;
  narration: string;
  /** Seconds the narration takes to say. */
  floor: number;
  duration: number;
  images: Map<string, ImageObject>;
  /** Which picture fills the screen from when, and how it arrives. The first entry is at 0. */
  backdrops: { at: number; picture: string; entrance: "cut" | "iris" | "fade" | "split"; pair?: [string, string] }[];
  /** A figure's own line, shown as speech beside it. One at a time. */
  speeches: Timed<{ picture: string; part?: string; text: string; style: "say" | "think" | "shout" }>[];
  cameras: CameraKey[];
  labels: Timed<{ picture: string; part?: string; text: string }>[];
  attentions: Timed<{ picture: string; part?: string; verb: AttentionVerb; color?: Tone; dur: number }>[];
  arrows: Timed<{ picture: string; from: ArrowEnd; to: ArrowEnd; text?: string; style: "bold" | "dashed"; color?: Tone; dur: number }>[];
  measures: Timed<{ picture: string; part?: string; text: string; side: "below" | "above" | "left" | "right" }>[];
  effects: Timed<{ picture: string; part?: string; kind: EffectKind; seed: number }>[];
  icons: Timed<{ picture: string; part?: string; icon: IconKind; slot: number }>[];
  /** `steps` holds the second each entry of a timeline or list arrives: the first with show, the rest with advance. */
  overlays: Timed<{ object: OverlayObject; entrance: Entrance; dur: number; steps: number[] }>[];
  shakes: { at: number; strength: number }[];
  flashes: number[];
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
    arrows: [],
    measures: [],
    effects: [],
    icons: [],
    overlays: [],
    shakes: [],
    flashes: [],
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
  /** While a split is on screen, both its pictures are; `current` is the left one. */
  let pair: [string, string] | null = null;
  const onScreen = (picture: string | undefined) => picture !== undefined && (pair ? pair.includes(picture) : picture === current);
  const labelIds = new Map<string, Timed<unknown>>();
  const shown = new Map<string, Timed<{ steps: number[] }>>();
  const edges = new Set(["left", "right", "top", "bottom"]);
  const end = (ref: string): { picture?: string; end: ArrowEnd } => (edges.has(ref) ? { end: { edge: ref as Edge } } : { picture: ref.split(".")[0], end: { part: ref.split(".")[1] } });
  /** An attention mark lasts until the picture changes or the camera or another mark takes over. */
  const endMarks = (at: number, alsoLabels: boolean) => {
    for (const mark of out.attentions) if (mark.until === Infinity && mark.at < at) mark.until = Math.max(at, mark.at + 1.2);
    if (alsoLabels) {
      for (const list of [out.labels, out.arrows, out.measures, out.effects, out.icons] as Timed<unknown>[][]) {
        for (const mark of list) if (mark.until === Infinity) mark.until = at;
      }
      for (const line of out.speeches) if (line.until > at) line.until = at;
    }
  };
  const cutTo = (picture: string, at: number, entrance: "cut" | "iris" | "fade" = "cut") => {
    if (picture === current && !pair) return;
    current = picture;
    pair = null;
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
        case "split":
          if (pair && pair[0] === action.left && pair[1] === action.right) break;
          current = action.left;
          pair = [action.left, action.right];
          out.backdrops.push({ at, picture: action.left, entrance: "split", pair });
          endMarks(at, true);
          break;
        case "cut":
          cutTo(action.to, at, action.entrance);
          out.cameras.push({ at, dur: 0, picture: action.to, shot: "overview", movement: "cut" });
          break;
        case "camera": {
          const target = aim(action.target);
          // Aiming at a picture that is not on screen means cutting to it first.
          const jumped = target.picture !== current || pair !== null;
          cutTo(target.picture, at);
          const movement = jumped ? "cut" : (action.movement ?? "push");
          out.cameras.push({ at, dur: movement === "cut" ? 0 : dur, ...target, shot: action.shot ?? (target.part ? "close" : "overview"), movement });
          break;
        }
        case "label": {
          const target = aim(action.target);
          if (!onScreen(target.picture)) break;
          const label = { at, until: Infinity, item: { ...target, text: action.text } };
          out.labels.push(label);
          if (action.id) labelIds.set(action.id, label);
          break;
        }
        case "arrow": {
          const from = end(action.from);
          const to = end(action.to);
          const picture = from.picture ?? to.picture;
          if (!picture || !onScreen(picture)) break;
          const arrow = { at, until: Infinity, item: { picture, from: from.end, to: to.end, text: action.text, style: action.style ?? "bold", color: action.color, dur: Math.max(0.45, Math.min(dur, 1.6)) } };
          out.arrows.push(arrow);
          if (action.id) labelIds.set(action.id, arrow);
          break;
        }
        case "measure": {
          const target = aim(action.target);
          if (!onScreen(target.picture)) break;
          const measure = { at, until: Infinity, item: { ...target, text: action.text, side: action.side ?? "below" } };
          out.measures.push(measure);
          if (action.id) labelIds.set(action.id, measure);
          break;
        }
        case "effect": {
          const target = aim(action.target);
          if (!onScreen(target.picture)) break;
          const effect = { at, until: Infinity, item: { ...target, kind: action.kind, seed: out.effects.length + 1 } };
          // A burst is over in a moment; everything else keeps going until the picture changes.
          if (action.kind === "explosion" || action.kind === "confetti") effect.until = at + 2.6;
          out.effects.push(effect);
          if (action.id) labelIds.set(action.id, effect);
          break;
        }
        case "icon": {
          const target = aim(action.target);
          if (!onScreen(target.picture)) break;
          // Icons on the same thing at the same time sit side by side.
          const slot = out.icons.filter((m) => m.until > at && m.item.picture === target.picture && m.item.part === target.part).length;
          const icon = { at, until: Infinity, item: { ...target, icon: action.icon, slot } };
          out.icons.push(icon);
          if (action.id) labelIds.set(action.id, icon);
          break;
        }
        case "advance": {
          const overlay = shown.get(action.target);
          if (overlay && overlay.until === Infinity) overlay.item.steps.push(at);
          break;
        }
        case "speak": {
          const target = aim(action.target);
          if (!onScreen(target.picture)) break;
          // One line at a time: a new line takes the last one off. A line stays for its sentence.
          for (const line of out.speeches) if (line.until > at) line.until = at;
          const next = starts[i + 1];
          out.speeches.push({ at, until: Math.max(at + 2.2, Math.min(next ?? at + 4.5, at + 6)), item: { ...target, text: action.text, style: action.style ?? "say" } });
          break;
        }
        case "attention": {
          const target = aim(action.target);
          if (!onScreen(target.picture)) break;
          out.attentions.push({ at, until: Infinity, item: { ...target, verb: action.verb, color: action.color, dur } });
          break;
        }
        case "show":
          for (const id of action.targets) {
            const object = overlayObjects.get(id);
            if (!object || shown.has(id)) continue;
            const overlay = { at, until: Infinity, item: { object, entrance: action.entrance ?? "fade", dur: Math.max(0.5, dur), steps: [at] } };
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
/** The backdrop entry in force at local time `t`: one picture, or a split pair. */
export function entryAt(scene: ResolvedScene, t: number): ResolvedScene["backdrops"][number] | undefined {
  let found = scene.backdrops[0];
  for (const entry of scene.backdrops) if (entry.at <= t) found = entry;
  return found;
}

export function backdropAt(scene: ResolvedScene, t: number): string | undefined {
  let picture: string | undefined;
  for (const entry of scene.backdrops) if (entry.at <= t) picture = entry.picture;
  return picture ?? scene.backdrops[0]?.picture;
}
