/**
 * The film's verdict on one scene. Used twice: by the server, to tell the scene writer what would be dropped
 * and give it one chance to correct it, and by the player, so a malformed scene can never break playback.
 *
 * Salvage rule (AiRA's): what cannot be played is dropped, never retargeted. An action aimed at a part that
 * was not found is dropped; a beat left with no actions is dropped; a scene left with no picture is refused.
 */
import { EFFECT_KINDS, STAMP_ICONS, type Action, type Beat, type FilmScene, type ImageObject, type Ink, type OverlayObject, type PictureRow, type Region, type SceneObject, type Spot, type TextObject } from "./types";
import { findCue, narrationWords } from "./words";

const ZONES = new Set(["top", "center", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]);
const PACES = new Set(["instant", "quick", "normal", "slow", "dramatic"]);
const SHOTS = new Set(["overview", "wide", "medium", "close", "detail"]);
const MOVEMENTS = new Set(["cut", "move", "push", "arc"]);
const VERBS = new Set(["dim", "encircle", "pulse"]);
const ENTRANCES = new Set(["fade", "slam", "word-by-word"]);
const CUT_ENTRANCES = new Set(["cut", "fade", "iris", "wipe", "push", "zoom"]);
const STRENGTHS = new Set(["subtle", "normal", "strong"]);
const INKS = new Set(["white", "accent", "danger", "good"]);
const ICONS = new Set<string>(STAMP_ICONS);
const EFFECTS = new Set<string>(EFFECT_KINDS);
/** Effects that fall over the whole frame and so come from no spot. */
const WHOLE_FRAME = new Set(["rain", "snow"]);
/** The id the pointer is hidden by. */
export const POINTER = "pointer";
const ID = /^[a-z][a-z0-9-]{0,39}$/;

export interface Verdict {
  /** The scene with everything unplayable removed. */
  scene: FilmScene;
  problems: string[];
  /** False when nothing playable is left: no picture to show. */
  valid: boolean;
}

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

/** Check `raw` against the pictures this step may name. `id` and `narration` come from the plan, not the writer. */
/** The most words of narration that may pass with nothing changing on screen. */
export const STILL_WORDS = 22;

export function validateScene(raw: unknown, pictures: PictureRow[], id: string, narration: string): Verdict {
  const problems: string[] = [];
  const scene: FilmScene = { id, narration, objects: [], beats: [] };
  if (!isRecord(raw)) return { scene, problems: ["the scene is not a JSON object"], valid: false };

  const parts = new Map(pictures.map((p) => [p.id, new Set(p.parts)]));
  /** Pictures declared in this scene. */
  const images = new Set<string>();
  const overlays = new Set<string>();

  /**
   * True when words may sit beside `ref`: a point, or a found part of one of this step's pictures. Which
   * picture is on screen when the words come on is not known here; off their picture they go to their zone.
   */
  const nearable = (ref: unknown, where: string): ref is Spot => {
    if (isPoint(ref)) return true;
    const [owner, part, extra] = typeof ref === "string" ? ref.split(".") : [];
    if (owner && part && extra === undefined && parts.get(owner)?.has(part)) return true;
    problems.push(`${where}: near "${typeof ref === "string" ? ref : JSON.stringify(ref)}" is not a found part of one of this step's pictures, nor a point {"x": 0 to 1, "y": 0 to 1}; the words go to their zone`);
    return false;
  };

  for (const [i, entry] of (Array.isArray(raw.objects) ? raw.objects : []).entries()) {
    const where = `objects[${i}]`;
    if (!isRecord(entry) || typeof entry.id !== "string" || !ID.test(entry.id)) {
      problems.push(`${where}: needs an id of lowercase letters, digits and hyphens`);
      continue;
    }
    if (images.has(entry.id) || overlays.has(entry.id)) {
      problems.push(`${where}: the id "${entry.id}" is used twice`);
      continue;
    }
    if (entry.kind === "image") {
      if (!parts.has(entry.id)) {
        problems.push(`${where}: no picture "${entry.id}" was drawn for this step; it cannot be shown`);
        continue;
      }
      const image: ImageObject = { id: entry.id, kind: "image" };
      if (entry.initial === "hidden") image.initial = "hidden";
      scene.objects.push(image);
      images.add(entry.id);
      continue;
    }
    const overlay = overlayOf(entry, where, problems, nearable);
    if (overlay) {
      scene.objects.push(overlay);
      overlays.add(overlay.id);
    }
  }

  // A scene whose pictures are all hidden still needs one to open on.
  const pictureObjects = scene.objects.filter((o): o is ImageObject => o.kind === "image");
  if (pictureObjects.length && pictureObjects.every((o) => o.initial === "hidden")) delete pictureObjects[0].initial;

  /** True when `ref` is a picture of this scene, or one of its found parts. */
  const aimable = (ref: unknown, where: string): ref is string => {
    if (typeof ref !== "string") {
      problems.push(`${where}: needs a target`);
      return false;
    }
    const [owner, part, extra] = ref.split(".");
    if (!images.has(owner) || extra !== undefined) {
      problems.push(`${where}: "${ref}" is not a picture in this scene's objects`);
      return false;
    }
    if (part !== undefined && !parts.get(owner)?.has(part)) {
      problems.push(`${where}: the part "${ref}" was not found in the picture; name the whole picture or show it another way`);
      return false;
    }
    return true;
  };

  // Which picture is on screen as the beats go by.
  const stage: Stage = { current: (pictureObjects.find((o) => o.initial !== "hidden") ?? pictureObjects[0])?.id };

  /** True when `ref` is a spot on the picture now on screen: one of its found parts, or a point in it. */
  const spotted = (ref: unknown, where: string): ref is Spot => {
    if (isPoint(ref)) return true;
    if (isRecord(ref)) {
      problems.push(`${where}: a point needs x and y, each from 0 to 1: shares of the picture's width and height from its top-left corner`);
      return false;
    }
    const [owner, part, extra] = typeof ref === "string" ? ref.split(".") : [];
    if (!owner || owner !== stage.current || part === undefined || extra !== undefined) {
      problems.push(`${where}: "${String(ref)}" is not a spot on the picture now on screen (${stage.current ?? "none"}); name one of its parts as ${stage.current ?? "picture"}.part, or give a point {"x": 0 to 1, "y": 0 to 1}`);
      return false;
    }
    if (!parts.get(owner)?.has(part)) {
      problems.push(`${where}: the part "${ref}" was not found in the picture; use another part, or a point {"x": 0 to 1, "y": 0 to 1} you can see in the picture`);
      return false;
    }
    return true;
  };

  const words = narrationWords(narration);
  const labels = new Set<string>();
  let spoken = 0;
  /** The word each kept beat happens on, to find stretches of narration with nothing happening on screen. */
  const changesAt: number[] = [0];
  /** Words at which a pan or a travelling dot sets off that runs until the next beat: nothing after it is still. */
  const movingFrom = new Set<number>();
  let cameraOn = "";
  const beatIds = new Set<string>();

  for (const [i, entry] of (Array.isArray(raw.beats) ? raw.beats : []).entries()) {
    const where = `beats[${i}]`;
    if (!isRecord(entry)) {
      problems.push(`${where}: is not an object`);
      continue;
    }
    let beatId = typeof entry.id === "string" && ID.test(entry.id) ? entry.id : `b${i + 1}`;
    while (beatIds.has(beatId)) beatId += "x";
    beatIds.add(beatId);
    const beat: Beat = { id: beatId, actions: [] };
    let pendingAt = -1;
    if (typeof entry.pace === "string" && PACES.has(entry.pace)) beat.pace = entry.pace as Beat["pace"];

    if (typeof entry.say === "string" && entry.say.trim()) {
      const at = findCue(words, entry.say, spoken);
      if (at < 0) {
        problems.push(`${where}: say "${entry.say}" is not in the narration after the previous beat's words; copy 1 to 4 words exactly, in order`);
      } else {
        beat.say = entry.say.trim();
        spoken = at + 1;
        pendingAt = at;
      }
    } else if (scene.beats.length > 0) {
      problems.push(`${where}: every beat after the first needs say, 1 to 4 words copied from the narration`);
    }

    for (const [k, action] of (Array.isArray(entry.actions) ? entry.actions : []).entries()) {
      const kept = actionOf(action, `${where}.actions[${k}]`, { aimable, spotted, images, stage, overlays, labels, problems });
      if (kept) beat.actions.push(kept);
    }
    if (beat.actions.length === 0) {
      // A beat written with nothing in it is a hold: the frame simply stays. Only a beat that lost its
      // actions to the checks above is worth telling the writer about.
      if (Array.isArray(entry.actions) && entry.actions.length > 0) problems.push(`${where}: has no action the film can play and is dropped`);
      continue;
    }
    scene.beats.push(beat);
    // A beat changes the screen when it does anything but aim the camera where it already is.
    let seen = false;
    for (const action of beat.actions) {
      if (action.do !== "camera") seen = true;
      else {
        const aim = `${action.target}/${action.shot ?? ""}`;
        if (aim !== cameraOn) seen = true;
        cameraOn = aim;
      }
    }
    if (pendingAt >= 0 && seen) changesAt.push(pendingAt);
    if (beat.actions.some((action) => (action.do === "pan" || action.do === "travel") && action.lasts === "until-next")) movingFrom.add(Math.max(0, pendingAt));
  }

  // A stretch of narration with no beat in it is spoken over a frame that stands still. About 22 words is
  // eight or nine seconds, which is where a viewer's eye has left the picture.
  if (scene.beats.length) {
    const ends = [...changesAt, words.length];
    for (let n = 1; n < ends.length; n++) {
      const still = ends[n] - ends[n - 1];
      if (still > STILL_WORDS && !movingFrom.has(ends[n - 1])) {
        const from = words.slice(ends[n - 1], ends[n - 1] + 4).join(" ");
        const to = words.slice(Math.max(ends[n - 1], ends[n] - 4), ends[n]).join(" ");
        problems.push(`beats: nothing changes on screen for ${still} words of narration, from "${from}" to "${to}": about ${Math.round(still / 2.6)} seconds on a still frame. Add beats inside that stretch, on the words where something is named, happens or changes`);
      }
    }
  }

  // A picture that is declared but never brought on would cost a drawing and never be seen.
  const shownPictures = new Set<string>();
  for (const beat of scene.beats) {
    for (const action of beat.actions) {
      if (action.do === "cut") shownPictures.add(action.to);
      if (action.do === "camera") shownPictures.add(action.target.split(".")[0]);
    }
  }
  for (const object of pictureObjects) {
    if (object.initial === "hidden" && !shownPictures.has(object.id)) {
      problems.push(`objects: the picture "${object.id}" is never shown; bring it on with {"do": "cut", "to": "${object.id}"} on the words it is about`);
    }
  }

  const valid = images.size > 0;
  if (!valid) problems.push("the scene shows no picture: declare one from this step's pictures in objects with kind image");
  return { scene, problems, valid };
}

/** A point in a picture: x and y, each a share from 0 to 1. */
const isPoint = (v: unknown): v is { x: number; y: number } => isRecord(v) && typeof v.x === "number" && typeof v.y === "number" && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1;
/** A spot as it is kept: a part's name as given, a point as its two numbers and nothing else. */
const spotOf = (spot: Spot): Spot => (typeof spot === "string" ? spot : { x: Math.round(spot.x * 1000) / 1000, y: Math.round(spot.y * 1000) / 1000 });
const inkOf = (v: unknown): Ink | undefined => (typeof v === "string" && INKS.has(v) ? (v as Ink) : undefined);

function overlayOf(entry: Raw, where: string, problems: string[], nearable: (ref: unknown, where: string) => ref is Spot): OverlayObject | null {
  const id = entry.id as string;
  const zone = typeof entry.zone === "string" && ZONES.has(entry.zone) ? (entry.zone as OverlayObject["zone"]) : undefined;
  if (entry.zone !== undefined && !zone) problems.push(`${where}: zone "${String(entry.zone)}" is not one of ${[...ZONES].join(", ")}`);
  switch (entry.kind) {
    case "text": {
      const value = text(entry.text, 60);
      if (!value) {
        problems.push(`${where}: text needs 1 to 60 characters`);
        return null;
      }
      const size = entry.size === "small" || entry.size === "large" ? entry.size : "medium";
      const color = entry.color === "accent" || entry.color === "danger" || entry.color === "good" ? entry.color : "white";
      const words: TextObject = { id, kind: "text", text: value, zone, size, color };
      if (entry.near !== undefined && nearable(entry.near, where)) words.near = spotOf(entry.near);
      if (entry.underline === true) words.underline = true;
      return words;
    }
    case "equation": {
      const value = text(entry.value, 120);
      if (!value) {
        problems.push(`${where}: equation needs a value of 1 to 120 characters`);
        return null;
      }
      return { id, kind: "equation", value, zone };
    }
    case "counter": {
      if (typeof entry.to !== "number" || !Number.isFinite(entry.to)) {
        problems.push(`${where}: counter needs a number in "to"`);
        return null;
      }
      if (typeof entry.prefix === "string" && entry.prefix.length > 8) problems.push(`${where}: counter prefix is over 8 characters and is left off`);
      if (typeof entry.suffix === "string" && entry.suffix.length > 12) problems.push(`${where}: counter suffix is over 12 characters and is left off`);
      return {
        id,
        kind: "counter",
        to: entry.to,
        from: typeof entry.from === "number" && Number.isFinite(entry.from) ? entry.from : 0,
        decimals: typeof entry.decimals === "number" ? Math.max(0, Math.min(3, Math.round(entry.decimals))) : 0,
        // Not trimmed: the space in " km" is part of how the number reads.
        prefix: typeof entry.prefix === "string" && entry.prefix.length <= 8 ? entry.prefix : undefined,
        suffix: typeof entry.suffix === "string" && entry.suffix.length <= 12 ? entry.suffix : undefined,
        label: text(entry.label, 40) ?? undefined,
        zone,
      };
    }
    case "chart": {
      const chart = entry.chart === "pie" || entry.chart === "line" ? entry.chart : entry.chart === "bar" ? "bar" : null;
      const data = (Array.isArray(entry.data) ? entry.data : [])
        .filter((d): d is Raw => isRecord(d) && typeof d.label === "string" && typeof d.value === "number" && Number.isFinite(d.value))
        .slice(0, 8)
        .map((d) => ({ label: String(d.label).slice(0, 16), value: d.value as number }));
      if (!chart || data.length < 2) {
        problems.push(`${where}: chart needs chart bar, pie or line and 2 to 8 data entries of {label, value}`);
        return null;
      }
      return { id, kind: "chart", chart, data, title: text(entry.title, 40) ?? undefined, zone };
    }
    case "timeline": {
      const events = (Array.isArray(entry.events) ? entry.events : [])
        .filter((e): e is Raw => isRecord(e) && typeof e.label === "string" && !!e.label.trim() && (typeof e.when === "string" || typeof e.when === "number"))
        .slice(0, 6)
        .map((e) => ({ when: String(e.when).trim().slice(0, 14), label: String(e.label).trim().slice(0, 26) }));
      if (events.length < 2) {
        problems.push(`${where}: timeline needs 2 to 6 events of {when, label}, in order`);
        return null;
      }
      return { id, kind: "timeline", events, zone };
    }
    default:
      problems.push(`${where}: kind "${String(entry.kind)}" is not one of image, text, equation, counter, chart, timeline`);
      return null;
  }
}

/** What is on screen while the beats are read in order. */
interface Stage {
  current: string | undefined;
}

interface ActionContext {
  aimable: (ref: unknown, where: string) => ref is string;
  spotted: (ref: unknown, where: string) => ref is Spot;
  stage: Stage;
  images: Set<string>;
  overlays: Set<string>;
  labels: Set<string>;
  problems: string[];
}

function actionOf(raw: unknown, where: string, c: ActionContext): Action | null {
  if (!isRecord(raw)) {
    c.problems.push(`${where}: is not an object`);
    return null;
  }
  switch (raw.do) {
    case "camera": {
      if (!c.aimable(raw.target, where)) return null;
      const action: Action = { do: "camera", target: raw.target };
      if (typeof raw.shot === "string" && SHOTS.has(raw.shot)) action.shot = raw.shot as never;
      if (typeof raw.movement === "string" && MOVEMENTS.has(raw.movement)) action.movement = raw.movement as never;
      // Aiming at another picture brings it on.
      c.stage.current = raw.target.split(".")[0];
      return action;
    }
    case "cut": {
      if (typeof raw.to !== "string" || !c.images.has(raw.to)) {
        c.problems.push(`${where}: cut needs "to", a picture in this scene's objects`);
        return null;
      }
      const cut: Action = { do: "cut", to: raw.to };
      if (typeof raw.entrance === "string" && CUT_ENTRANCES.has(raw.entrance)) cut.entrance = raw.entrance as never;
      c.stage.current = raw.to;
      return cut;
    }
    case "pan": {
      if (!c.spotted(raw.from, `${where} from`) || !c.spotted(raw.to, `${where} to`)) return null;
      const pan: Action = { do: "pan", from: spotOf(raw.from), to: spotOf(raw.to) };
      if (JSON.stringify(pan.from) === JSON.stringify(pan.to)) {
        c.problems.push(`${where}: pan needs two different spots in "from" and "to"`);
        return null;
      }
      if (typeof raw.shot === "string" && SHOTS.has(raw.shot) && raw.shot !== "overview") pan.shot = raw.shot as never;
      if (raw.lasts === "until-next") pan.lasts = "until-next";
      return pan;
    }
    case "travel": {
      const path = Array.isArray(raw.path) ? raw.path : [];
      if (path.length < 2 || path.length > 6) {
        c.problems.push(`${where}: travel needs "path", 2 to 6 spots the dot goes through in order`);
        return null;
      }
      for (const [n, spot] of path.entries()) if (!c.spotted(spot, `${where} path[${n}]`)) return null;
      const color = inkOf(raw.color);
      const id = markId(raw.id, c, where);
      return { do: "travel", path: (path as Spot[]).map(spotOf), ...(color ? { color } : {}), ...(raw.repeat === true ? { repeat: true } : {}), ...(raw.lasts === "until-next" ? { lasts: "until-next" as const } : {}), ...(id ? { id } : {}) };
    }
    case "speak": {
      if (!c.aimable(raw.target, where) || !onScreen(raw.target, where, c)) return null;
      const line = text(raw.text, 60);
      if (!line) {
        c.problems.push(`${where}: speak needs text of 1 to 60 characters, the figure's own short line`);
        return null;
      }
      return { do: "speak", target: raw.target, text: line };
    }
    case "label": {
      if (!c.aimable(raw.target, where) || !onScreen(raw.target, where, c)) return null;
      const value = text(raw.text, 32);
      if (!value) {
        c.problems.push(`${where}: label needs text of 1 to 32 characters`);
        return null;
      }
      const action: Action = { do: "label", target: raw.target, text: value };
      if (typeof raw.id === "string" && ID.test(raw.id) && !c.images.has(raw.id) && !c.overlays.has(raw.id)) {
        action.id = raw.id;
        c.labels.add(raw.id);
      }
      return action;
    }
    case "attention": {
      if (!c.aimable(raw.target, where) || !onScreen(raw.target, where, c)) return null;
      if (typeof raw.verb !== "string" || !VERBS.has(raw.verb)) {
        c.problems.push(`${where}: attention verb must be one of ${[...VERBS].join(", ")}`);
        return null;
      }
      return { do: "attention", target: raw.target, verb: raw.verb as never };
    }
    case "show":
    case "hide": {
      const named = (Array.isArray(raw.targets) ? raw.targets : []).filter((t): t is string => typeof t === "string");
      const allowed = named.filter((t) => c.overlays.has(t) || (raw.do === "hide" && (c.labels.has(t) || t === POINTER)));
      for (const t of named) {
        if (allowed.includes(t)) continue;
        c.problems.push(
          c.images.has(t)
            ? `${where}: "${t}" is a picture; a picture is brought on with cut, never with ${raw.do}`
            : `${where}: "${t}" is not one of this scene's text, equation, counter, chart or timeline objects${raw.do === "hide" ? ", nor the id of a label or a drawn mark" : ""}`,
        );
      }
      if (allowed.length === 0) return null;
      if (raw.do === "hide") return { do: "hide", targets: allowed };
      const action: Action = { do: "show", targets: allowed };
      if (typeof raw.entrance === "string" && ENTRANCES.has(raw.entrance)) action.entrance = raw.entrance as never;
      return action;
    }
    case "shake": {
      const action: Action = { do: "shake" };
      if (typeof raw.strength === "string" && STRENGTHS.has(raw.strength)) action.strength = raw.strength as never;
      return action;
    }
    case "flash":
      return { do: "flash" };
    case "arrow":
    case "line": {
      if (!c.spotted(raw.from, `${where} from`) || !c.spotted(raw.to, `${where} to`)) return null;
      const from = spotOf(raw.from);
      const to = spotOf(raw.to);
      if (JSON.stringify(from) === JSON.stringify(to)) {
        c.problems.push(`${where}: ${raw.do} needs two different spots in "from" and "to"`);
        return null;
      }
      const color = inkOf(raw.color);
      const id = markId(raw.id, c, where);
      if (raw.do === "line") return { do: "line", from, to, ...(color ? { color } : {}), ...(raw.dashed === true ? { dashed: true } : {}), ...(id ? { id } : {}) };
      const bend = raw.bend === "straight" || raw.bend === "left" || raw.bend === "right" ? raw.bend : undefined;
      return { do: "arrow", from, to, ...(color ? { color } : {}), ...(bend ? { bend } : {}), ...(id ? { id } : {}) };
    }
    case "box": {
      let target: string | Region;
      if (isRecord(raw.target)) {
        const r = raw.target;
        const ok = [r.x, r.y, r.w, r.h].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) && (r.w as number) >= 0.02 && (r.h as number) >= 0.02;
        if (!ok) {
          c.problems.push(`${where}: a box drawn by numbers needs {"x", "y", "w", "h"}, each a share of the picture from 0 to 1`);
          return null;
        }
        const round = (n: unknown) => Math.round((n as number) * 1000) / 1000;
        target = { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) };
      } else {
        if (!c.spotted(raw.target, where)) return null;
        target = raw.target as string;
      }
      const color = inkOf(raw.color);
      const id = markId(raw.id, c, where);
      return { do: "box", target, ...(raw.style === "highlight" ? { style: "highlight" as const } : {}), ...(color ? { color } : {}), ...(id ? { id } : {}) };
    }
    case "point": {
      if (!c.spotted(raw.at, where)) return null;
      return { do: "point", at: spotOf(raw.at) };
    }
    case "stamp": {
      if (typeof raw.icon !== "string" || !ICONS.has(raw.icon)) {
        c.problems.push(`${where}: stamp icon must be one of ${[...ICONS].join(", ")}`);
        return null;
      }
      if (!c.spotted(raw.at, where)) return null;
      const color = inkOf(raw.color);
      const id = markId(raw.id, c, where);
      return { do: "stamp", icon: raw.icon as never, at: spotOf(raw.at), ...(raw.size === "small" || raw.size === "large" ? { size: raw.size } : {}), ...(color ? { color } : {}), ...(id ? { id } : {}) };
    }
    case "effect": {
      if (typeof raw.kind !== "string" || !EFFECTS.has(raw.kind)) {
        c.problems.push(`${where}: effect kind must be one of ${[...EFFECTS].join(", ")}`);
        return null;
      }
      const id = markId(raw.id, c, where);
      if (WHOLE_FRAME.has(raw.kind)) return { do: "effect", kind: raw.kind as never, ...(id ? { id } : {}) };
      if (!c.spotted(raw.at, where)) return null;
      return { do: "effect", kind: raw.kind as never, at: spotOf(raw.at), ...(id ? { id } : {}) };
    }
    default:
      c.problems.push(`${where}: do "${String(raw.do)}" is not one of cut, camera, pan, arrow, line, box, point, stamp, effect, travel, attention, label, speak, show, hide, shake, flash`);
      return null;
  }
}

/** True when `target` is on the picture now on screen. A name, a ring or a speech bubble for any other would never be seen. */
function onScreen(target: string, where: string, c: ActionContext): boolean {
  if (target.split(".")[0] === c.stage.current) return true;
  c.problems.push(`${where}: "${target}" is not on the picture now on screen (${c.stage.current ?? "none"}); bring its picture on with cut first, or aim at the picture that is showing`);
  return false;
}

/** The id a drawn mark may be hidden by: one that is free. It is then hidden the way a label is. */
function markId(raw: unknown, c: ActionContext, where = "an action"): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || !ID.test(raw) || raw === POINTER || c.images.has(raw) || c.overlays.has(raw) || c.labels.has(raw)) {
    c.problems.push(`${where}: the id "${String(raw)}" is already used, or is not lowercase letters, digits and hyphens starting with a letter; give this mark an id of its own, or it cannot be hidden`);
    return undefined;
  }
  c.labels.add(raw);
  return raw;
}

/** Fill in what the server knows about each picture. Objects are copied; the input is not changed. */
export function withPictures(scene: FilmScene, pictures: Record<string, Pick<ImageObject, "src" | "aspect" | "hotspots">>): FilmScene {
  const objects: SceneObject[] = scene.objects.map((object) => (object.kind === "image" ? { ...object, ...pictures[object.id] } : object));
  return { ...scene, objects };
}
