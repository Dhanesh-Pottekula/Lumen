/**
 * The film's verdict on one scene. Used twice: by the server, to tell the scene writer what would be dropped
 * and give it one chance to correct it, and by the player, so a malformed scene can never break playback.
 *
 * Salvage rule (AiRA's): what cannot be played is dropped, never retargeted. An action aimed at a part that
 * was not found is dropped; a beat left with no actions is dropped; a scene left with no picture is refused.
 */
import type { Action, Beat, FilmScene, ImageObject, OverlayObject, PictureRow, SceneObject } from "./types";
import { findCue, narrationWords } from "./words";

const ZONES = new Set(["top", "center", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]);
const PACES = new Set(["instant", "quick", "normal", "slow", "dramatic"]);
const SHOTS = new Set(["overview", "wide", "medium", "close", "detail"]);
const MOVEMENTS = new Set(["cut", "move", "push", "arc"]);
const VERBS = new Set(["dim", "encircle", "pulse"]);
const ENTRANCES = new Set(["fade", "slam", "word-by-word"]);
const STRENGTHS = new Set(["subtle", "normal", "strong"]);
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
export function validateScene(raw: unknown, pictures: PictureRow[], id: string, narration: string): Verdict {
  const problems: string[] = [];
  const scene: FilmScene = { id, narration, objects: [], beats: [] };
  if (!isRecord(raw)) return { scene, problems: ["the scene is not a JSON object"], valid: false };

  const parts = new Map(pictures.map((p) => [p.id, new Set(p.parts)]));
  const images = new Set<string>();
  const overlays = new Set<string>();

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
    const overlay = overlayOf(entry, where, problems);
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

  const words = narrationWords(narration);
  const labels = new Set<string>();
  let spoken = 0;
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
    if (typeof entry.pace === "string" && PACES.has(entry.pace)) beat.pace = entry.pace as Beat["pace"];

    if (typeof entry.say === "string" && entry.say.trim()) {
      const at = findCue(words, entry.say, spoken);
      if (at < 0) {
        problems.push(`${where}: say "${entry.say}" is not in the narration after the previous beat's words; copy 1 to 4 words exactly, in order`);
      } else {
        beat.say = entry.say.trim();
        spoken = at + 1;
      }
    } else if (scene.beats.length > 0) {
      problems.push(`${where}: every beat after the first needs say, 1 to 4 words copied from the narration`);
    }

    for (const [k, action] of (Array.isArray(entry.actions) ? entry.actions : []).entries()) {
      const kept = actionOf(action, `${where}.actions[${k}]`, { aimable, images, overlays, labels, problems });
      if (kept) beat.actions.push(kept);
    }
    if (beat.actions.length === 0) {
      // A beat written with nothing in it is a hold: the frame simply stays. Only a beat that lost its
      // actions to the checks above is worth telling the writer about.
      if (Array.isArray(entry.actions) && entry.actions.length > 0) problems.push(`${where}: has no action the film can play and is dropped`);
      continue;
    }
    scene.beats.push(beat);
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

function overlayOf(entry: Raw, where: string, problems: string[]): OverlayObject | null {
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
      return { id, kind: "text", text: value, zone, size, color };
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
    default:
      problems.push(`${where}: kind "${String(entry.kind)}" is not one of image, text, equation, counter, chart`);
      return null;
  }
}

interface ActionContext {
  aimable: (ref: unknown, where: string) => ref is string;
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
      return action;
    }
    case "cut": {
      if (typeof raw.to !== "string" || !c.images.has(raw.to)) {
        c.problems.push(`${where}: cut needs "to", a picture in this scene's objects`);
        return null;
      }
      const cut: Action = { do: "cut", to: raw.to };
      if (raw.entrance === "iris" || raw.entrance === "fade") cut.entrance = raw.entrance;
      return cut;
    }
    case "speak": {
      if (!c.aimable(raw.target, where)) return null;
      const line = text(raw.text, 60);
      if (!line) {
        c.problems.push(`${where}: speak needs text of 1 to 60 characters, the figure's own short line`);
        return null;
      }
      return { do: "speak", target: raw.target, text: line };
    }
    case "label": {
      if (!c.aimable(raw.target, where)) return null;
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
      if (!c.aimable(raw.target, where)) return null;
      if (typeof raw.verb !== "string" || !VERBS.has(raw.verb)) {
        c.problems.push(`${where}: attention verb must be one of ${[...VERBS].join(", ")}`);
        return null;
      }
      return { do: "attention", target: raw.target, verb: raw.verb as never };
    }
    case "show":
    case "hide": {
      const named = (Array.isArray(raw.targets) ? raw.targets : []).filter((t): t is string => typeof t === "string");
      const allowed = named.filter((t) => c.overlays.has(t) || (raw.do === "hide" && c.labels.has(t)));
      for (const t of named) {
        if (allowed.includes(t)) continue;
        c.problems.push(
          c.images.has(t)
            ? `${where}: "${t}" is a picture; a picture is brought on with cut, never with ${raw.do}`
            : `${where}: "${t}" is not one of this scene's text, equation, counter or chart objects`,
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
    default:
      c.problems.push(`${where}: do "${String(raw.do)}" is not one of camera, cut, label, speak, attention, show, hide, shake, flash`);
      return null;
  }
}

/** Fill in what the server knows about each picture. Objects are copied; the input is not changed. */
export function withPictures(scene: FilmScene, pictures: Record<string, Pick<ImageObject, "src" | "aspect" | "hotspots">>): FilmScene {
  const objects: SceneObject[] = scene.objects.map((object) => (object.kind === "image" ? { ...object, ...pictures[object.id] } : object));
  return { ...scene, objects };
}
