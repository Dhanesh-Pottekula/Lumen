/**
 * Film metrics: numbers read off a finished film, so two sets of prompts can be compared on the same briefs.
 *
 * Everything here is measured, never judged. The timeline comes from `resolveScene`, the same code that plays
 * the film, so "how long nothing changed" is what a viewer would really sit through. Whether a number is good
 * is for a person to decide; this only makes it visible.
 */
import type { FilmFile, FilmScene } from "../src/film/types";
import { resolveScene } from "../src/film/resolve";
import { findCue, floorOf, narrationWords } from "../src/film/words";
import { unknownMarks } from "./voice";

/** The plan as the planner wrote it (`plan.json`). Only the fields read here. */
export interface PlanFile {
  pictures?: { id?: string; of?: string; parts?: { id?: string }[] }[];
  steps?: { id?: string; narration?: string; screen?: string[] }[];
}

/** One line of `log.jsonl`. */
export type LogEntry = Record<string, unknown>;

export interface FilmMetrics {
  run: string;
  /** The fingerprint of the prompts that made it, or "unknown" for films made before it was recorded. */
  prompts: string;
  skills: string[];
  scenes: number;
  /** Steps the planner wrote. More steps than scenes means scenes were dropped. */
  steps: number;
  words: number;
  /** Seconds the film runs, from the resolved timeline. */
  seconds: number;
  pictures: number;
  secondsPerPicture: number;
  /** Times a picture comes onto the screen, counting one shown again, and the seconds each stays on average. */
  showings: number;
  secondsPerShowing: number;
  /** Narration sentences for each time the picture changes. Near 1 or above means one picture per sentence or fewer. */
  sentencesPerShowing: number;
  /** Cut-outs put on screen, how many times one was moved, and the seconds something was travelling. */
  cutouts: number;
  moves: number;
  secondsMoving: number;
  /** Moments at which something visibly changes, and the seconds between them on average. */
  changes: number;
  secondsPerChange: number;
  /** The longest time the screen showed nothing new while the voice went on, and the scene it was in. */
  longestStill: { seconds: number; scene: string };
  /** Camera actions that aim where the camera already is, so nothing happens. */
  idleCameras: number;
  /** Words written on screen (text and labels) that the narration does not say in that form. */
  textsNotSpoken: string[];
  /** Words written on screen that hold a word the narration never uses at all. */
  textsWithNewWords: string[];
  /** Text made of line-drawing characters or one character repeated: a picture built out of letters. */
  textsDrawn: string[];
  /** Voice marks the voice does not know. */
  unknownMarks: string[];
  /** Parts the planner named that were not found in the drawing, as picture.part. */
  partsNotFound: string[];
  /** Beats the checker dropped on the first try, and scenes left out entirely. Needs the log. */
  beatsDropped: number;
  scenesDropped: number;
  retries: number;
  /** Seconds from the brief to the first scene on screen, and to the last. Needs the log. */
  firstSceneAt: number | null;
  doneAt: number | null;
  /** How often each action and each kind of object was used. */
  actions: Record<string, number>;
  objects: Record<string, number>;
  cost: number | null;
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const bump = (tally: Record<string, number>, key: string) => (tally[key] = (tally[key] ?? 0) + 1);

/** Line-drawing and block characters, or any one character four or more times in a row. */
const DRAWN = /[─-▟]|(\S)\1{3,}/u;

/** How long the narration takes: the last measured word plus a little, or an even rate when it was not measured. */
function floorFor(scene: FilmScene): number {
  const times = scene.audio?.wordTimes;
  return times?.length ? times[times.length - 1] + 0.5 : floorOf(scene.narration);
}

/** The seconds, within one scene, at which the viewer sees something change. */
function changeTimes(scene: FilmScene): { times: number[]; idle: number; duration: number; showings: number; moving: number } {
  const resolved = resolveScene(scene, floorFor(scene), scene.audio?.wordTimes);
  const times: number[] = [];
  let idle = 0;
  for (const backdrop of resolved.backdrops) if (backdrop.at > 0) times.push(backdrop.at);
  // A camera key changes the frame only when it differs from the one before it.
  let last = "";
  for (const key of resolved.cameras) {
    const aim = `${key.picture}|${key.part ?? ""}|${key.shot}`;
    if (aim === last) idle++;
    else if (key.at > 0) times.push(key.at);
    last = aim;
  }
  for (const group of [resolved.labels, resolved.attentions, resolved.overlays, resolved.speeches]) {
    for (const item of group) {
      times.push(item.at);
      if (Number.isFinite(item.until)) times.push(item.until);
    }
  }
  // A cut-out changing is something to watch for as long as the change lasts, so a long move is not a still.
  let moving = 0;
  for (const track of resolved.cutouts) {
    for (const key of track.keys) {
      for (let at = key.at; at < key.at + key.dur; at += 1) times.push(at);
      times.push(key.at + key.dur);
      if (key !== track.keys[0] && (key.to.x !== undefined) && key.dur > 0) moving += key.dur;
    }
  }
  for (const shake of resolved.shakes) times.push(shake.at);
  times.push(...resolved.flashes);
  return { times: [...new Set(times.map((t) => round(t, 2)))].filter((t) => t > 0 && t < resolved.floor).sort((a, b) => a - b), idle, duration: resolved.duration, showings: resolved.backdrops.length, moving };
}

export function filmMetrics(film: FilmFile, plan: PlanFile | null = null, log: LogEntry[] = []): FilmMetrics {
  const actions: Record<string, number> = {};
  const objects: Record<string, number> = {};
  const textsNotSpoken: string[] = [];
  const textsWithNewWords: string[] = [];
  const textsDrawn: string[] = [];
  const shown = new Set<string>();
  const found = new Set<string>();
  let seconds = 0;
  let changes = 0;
  let idleCameras = 0;
  let showings = 0;
  let sentences = 0;
  let moves = 0;
  let secondsMoving = 0;
  const cutoutsUsed = new Set<string>();
  let words = 0;
  let longestStill = { seconds: 0, scene: "" };

  for (const scene of film.scenes) {
    const spoken = narrationWords(scene.narration);
    words += spoken.length;
    const written: string[] = [];
    for (const object of scene.objects) {
      bump(objects, object.kind);
      if (object.kind === "image") {
        shown.add(object.id);
        for (const part of Object.keys(object.hotspots ?? {})) found.add(`${object.id}.${part}`);
      } else if (object.kind === "text") written.push(object.text);
    }
    for (const beat of scene.beats) {
      for (const action of beat.actions) {
        bump(actions, action.do);
        if (action.do === "label") written.push(action.text);
        if (action.do === "move") moves++;
        if (action.do === "place") cutoutsUsed.add(action.what);
        if (action.do === "swap") cutoutsUsed.add(action.to);
      }
    }
    for (const text of written) {
      // Marks with no word in them (dots, arrows, dashes) are also a drawing made of characters.
      if (DRAWN.test(text) || narrationWords(text).length === 0) {
        textsDrawn.push(text);
        continue;
      }
      if (findCue(spoken, text, 0) < 0) textsNotSpoken.push(text);
      if (narrationWords(text).some((word) => !/^\d/.test(word) && !spoken.includes(word))) textsWithNewWords.push(text);
    }

    const { times, idle, duration, showings: here, moving } = changeTimes(scene);
    showings += here;
    secondsMoving += moving;
    sentences += scene.narration.split(/[.!?]+(?:\s|$)/).filter((part) => narrationWords(part).length > 0).length;
    idleCameras += idle;
    changes += times.length;
    seconds += duration;
    const edges = [0, ...times, floorFor(scene)];
    for (let i = 1; i < edges.length; i++) {
      const gap = edges[i] - edges[i - 1];
      if (gap > longestStill.seconds) longestStill = { seconds: round(gap), scene: scene.id };
    }
  }

  const planned = plan?.pictures ?? [];
  const partsNotFound: string[] = [];
  for (const picture of planned) {
    if (!picture.id || !shown.has(picture.id)) continue;
    for (const part of picture.parts ?? []) if (part.id && !found.has(`${picture.id}.${part.id}`)) partsNotFound.push(`${picture.id}.${part.id}`);
  }
  const marks = (plan?.steps ?? []).flatMap((step) => unknownMarks(step.narration ?? ""));

  let beatsDropped = 0;
  let scenesDropped = 0;
  let retries = 0;
  let firstSceneAt: number | null = null;
  let doneAt: number | null = null;
  const firstTry = new Set<string>();
  for (const entry of log) {
    const at = typeof entry.t === "number" ? entry.t : null;
    if (entry.stage === "scene" && entry.status === "published" && at !== null) {
      firstSceneAt ??= at;
      doneAt = at;
    }
    if (entry.stage === "scene" && entry.status === "dropped") scenesDropped++;
    if (entry.stage === "scene" && entry.attempt === "retry") retries++;
    // The first list of problems for a scene is the first try's; a retry logs its own under attempt "retry".
    if (entry.stage === "scene" && Array.isArray(entry.problems) && entry.attempt !== "retry" && typeof entry.id === "string" && !firstTry.has(entry.id)) {
      firstTry.add(entry.id);
      beatsDropped += entry.problems.filter((p) => typeof p === "string" && p.includes("is dropped")).length;
    }
  }

  const pictures = planned.length || shown.size;
  return {
    run: film.run,
    prompts: film.made?.prompts ?? "unknown",
    skills: film.made?.skills ?? [],
    scenes: film.scenes.length,
    steps: plan?.steps?.length ?? film.scenes.length,
    words,
    seconds: round(seconds),
    pictures,
    secondsPerPicture: pictures ? round(seconds / pictures) : 0,
    showings,
    secondsPerShowing: showings ? round(seconds / showings) : 0,
    sentencesPerShowing: showings ? round(sentences / showings, 2) : 0,
    cutouts: cutoutsUsed.size,
    moves,
    secondsMoving: round(secondsMoving),
    changes,
    secondsPerChange: changes ? round(seconds / changes) : 0,
    longestStill,
    idleCameras,
    textsNotSpoken,
    textsWithNewWords,
    textsDrawn,
    unknownMarks: marks,
    partsNotFound,
    beatsDropped,
    scenesDropped,
    retries,
    firstSceneAt,
    doneAt,
    actions,
    objects,
    cost: film.usage ? round(film.usage.cost, 4) : null,
  };
}
