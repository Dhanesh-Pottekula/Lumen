/**
 * The film's verdict on one scene. Used twice: by the server, to tell the scene writer what would be dropped
 * and give it one chance to correct it, and by the player, so a malformed scene can never break playback.
 *
 * Salvage rule (AiRA's): what cannot be played is dropped, never retargeted. An action aimed at a part that
 * was not found is dropped; a beat left with no actions is dropped; a scene left with no picture is refused.
 */
import type { Action, Beat, Edge, FilmScene, ImageObject, OverlayObject, PictureRow, SceneObject, Tone } from "./types";
import { findCue, narrationWords } from "./words";

const ZONES = new Set(["top", "center", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]);
const PACES = new Set(["instant", "quick", "normal", "slow", "dramatic"]);
const SHOTS = new Set(["overview", "wide", "medium", "close", "detail"]);
const MOVEMENTS = new Set(["cut", "move", "push", "arc"]);
const VERBS = new Set(["dim", "encircle", "pulse", "box", "underline", "cross", "check", "tint"]);
const ENTRANCES = new Set(["fade", "slam", "word-by-word", "typewriter"]);
const TONES = new Set(["white", "accent", "danger", "good", "cool"]);
const EDGES = new Set(["left", "right", "top", "bottom"]);
const EFFECTS = new Set(["fire", "smoke", "sparks", "explosion", "rain", "snow", "dust", "confetti", "glow", "speed"]);
const ICONS = new Set(["question", "exclaim", "idea", "heart", "skull", "money", "check", "cross", "warning", "clock", "star", "sweat", "anger", "zzz", "music", "fire"]);
const SIDES = new Set(["below", "above", "left", "right"]);
const TEXT_STYLES = new Set(["bold", "title", "hand", "stamp"]);
const tone = (v: unknown) => (typeof v === "string" && TONES.has(v) ? (v as Tone) : undefined);
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
  /** Timelines and lists, with how many entries each has: they can be advanced. */
  const steppable = new Map<string, number>();

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
      if (overlay.kind === "timeline") steppable.set(overlay.id, overlay.events.length);
      if (overlay.kind === "list") steppable.set(overlay.id, overlay.items.length);
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
  const advanced = new Map<string, number>();
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
      const kept = actionOf(action, `${where}.actions[${k}]`, { aimable, images, overlays, labels, problems, steppable, advanced });
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
      const color = tone(entry.color) ?? "white";
      const style = typeof entry.style === "string" && TEXT_STYLES.has(entry.style) ? (entry.style as "bold") : undefined;
      return { id, kind: "text", text: value, zone, size, color, ...(style && style !== "bold" ? { style } : {}) };
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
        color: tone(entry.color),
        zone,
      };
    }
    case "date": {
      const value = text(entry.text, 32);
      if (!value) {
        problems.push(`${where}: date needs text of 1 to 32 characters`);
        return null;
      }
      const from = typeof entry.from === "number" && Number.isFinite(entry.from) ? Math.round(entry.from) : typeof entry.from === "string" && /^-?\d{1,4}$/.test(entry.from.trim()) ? Number(entry.from) : undefined;
      return { id, kind: "date", text: value, ...(from !== undefined ? { from } : {}), zone };
    }
    case "timeline": {
      const events = (Array.isArray(entry.events) ? entry.events : [])
        .filter((e): e is Raw => isRecord(e) && (typeof e.date === "string" || typeof e.date === "number"))
        .map((e) => ({ date: String(e.date).trim().slice(0, 20), text: typeof e.text === "string" ? e.text.trim().slice(0, 28) : "" }))
        .filter((e) => e.date);
      if (events.length < 2 || events.length > 6) {
        problems.push(`${where}: timeline needs 2 to 6 events of {date, text}`);
        if (events.length < 2) return null;
      }
      return { id, kind: "timeline", events: events.slice(0, 6), zone };
    }
    case "list": {
      const items = (Array.isArray(entry.items) ? entry.items : []).filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().slice(0, 40));
      if (items.length < 2 || items.length > 6) {
        problems.push(`${where}: list needs 2 to 6 items of at most 40 characters`);
        if (items.length < 2) return null;
      }
      return { id, kind: "list", items: items.slice(0, 6), title: text(entry.title, 32) ?? undefined, zone };
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
      problems.push(`${where}: kind "${String(entry.kind)}" is not one of image, text, equation, counter, chart, date, timeline, list`);
      return null;
  }
}

interface ActionContext {
  aimable: (ref: unknown, where: string) => ref is string;
  images: Set<string>;
  overlays: Set<string>;
  /** Ids given to labels, arrows, measures, effects and icons, so they can be hidden. */
  labels: Set<string>;
  problems: string[];
  steppable: Map<string, number>;
  advanced: Map<string, number>;
}

/** Keep an action's own id when it is free, so a later hide can name it. */
function markId(raw: Raw, c: ActionContext): string | undefined {
  if (typeof raw.id !== "string" || !ID.test(raw.id) || c.images.has(raw.id) || c.overlays.has(raw.id)) return undefined;
  c.labels.add(raw.id);
  return raw.id;
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
      const speech: Action = { do: "speak", target: raw.target, text: line };
      if (raw.style === "think" || raw.style === "shout") speech.style = raw.style;
      return speech;
    }
    case "label": {
      if (!c.aimable(raw.target, where)) return null;
      const value = text(raw.text, 32);
      if (!value) {
        c.problems.push(`${where}: label needs text of 1 to 32 characters`);
        return null;
      }
      const action: Action = { do: "label", target: raw.target, text: value };
      const id = markId(raw, c);
      if (id) action.id = id;
      return action;
    }
    case "attention": {
      if (!c.aimable(raw.target, where)) return null;
      if (typeof raw.verb !== "string" || !VERBS.has(raw.verb)) {
        c.problems.push(`${where}: attention verb must be one of ${[...VERBS].join(", ")}`);
        return null;
      }
      const mark: Action = { do: "attention", target: raw.target, verb: raw.verb as never };
      const color = tone(raw.color);
      if (color) mark.color = color;
      return mark;
    }
    case "arrow": {
      const end = (ref: unknown, key: string): string | Edge | null => {
        if (typeof ref === "string" && EDGES.has(ref)) return ref as Edge;
        return c.aimable(ref, `${where}.${key}`) ? (ref as string) : null;
      };
      const from = end(raw.from, "from");
      const to = end(raw.to, "to");
      if (!from || !to) return null;
      if (EDGES.has(from) && EDGES.has(to)) {
        c.problems.push(`${where}: an arrow needs at least one end on a picture or a part, not two edges`);
        return null;
      }
      const owner = (ref: string) => (EDGES.has(ref) ? null : ref.split(".")[0]);
      if (owner(from) && owner(to) && owner(from) !== owner(to)) {
        c.problems.push(`${where}: both ends of an arrow must be on the same picture`);
        return null;
      }
      if (from === to) {
        c.problems.push(`${where}: an arrow cannot go from a thing to itself`);
        return null;
      }
      const arrow: Action = { do: "arrow", from, to };
      const label = text(raw.text, 24);
      if (label) arrow.text = label;
      else if (raw.text !== undefined) c.problems.push(`${where}: arrow text must be 1 to 24 characters; it is left off`);
      if (raw.style === "dashed") arrow.style = "dashed";
      const color = tone(raw.color);
      if (color) arrow.color = color;
      const id = markId(raw, c);
      if (id) arrow.id = id;
      return arrow;
    }
    case "measure": {
      if (!c.aimable(raw.target, where)) return null;
      if (!raw.target.includes(".")) {
        c.problems.push(`${where}: measure needs a part, not a whole picture`);
        return null;
      }
      const value = text(raw.text, 24);
      if (!value) {
        c.problems.push(`${where}: measure needs text of 1 to 24 characters, the size it shows`);
        return null;
      }
      const action: Action = { do: "measure", target: raw.target, text: value };
      if (typeof raw.side === "string" && SIDES.has(raw.side)) action.side = raw.side as never;
      const id = markId(raw, c);
      if (id) action.id = id;
      return action;
    }
    case "effect": {
      if (!c.aimable(raw.target, where)) return null;
      if (typeof raw.kind !== "string" || !EFFECTS.has(raw.kind)) {
        c.problems.push(`${where}: effect kind must be one of ${[...EFFECTS].join(", ")}`);
        return null;
      }
      const action: Action = { do: "effect", target: raw.target, kind: raw.kind as never };
      const id = markId(raw, c);
      if (id) action.id = id;
      return action;
    }
    case "icon": {
      if (!c.aimable(raw.target, where)) return null;
      if (typeof raw.icon !== "string" || !ICONS.has(raw.icon)) {
        c.problems.push(`${where}: icon must be one of ${[...ICONS].join(", ")}`);
        return null;
      }
      const action: Action = { do: "icon", target: raw.target, icon: raw.icon as never };
      const id = markId(raw, c);
      if (id) action.id = id;
      return action;
    }
    case "advance": {
      const target = typeof raw.target === "string" ? raw.target : "";
      const size = c.steppable.get(target);
      if (size === undefined) {
        c.problems.push(`${where}: advance needs the target of a timeline or list declared in objects`);
        return null;
      }
      // The first entry arrives with show; there are size - 1 advances to give.
      const used = (c.advanced.get(target) ?? 0) + 1;
      if (used > size - 1) {
        c.problems.push(`${where}: "${target}" has no entry left to advance to (it has ${size})`);
        return null;
      }
      c.advanced.set(target, used);
      return { do: "advance", target };
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
            : `${where}: "${t}" is not one of this scene's overlay objects${raw.do === "hide" ? " or a mark given an id" : ""}`,
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
      c.problems.push(`${where}: do "${String(raw.do)}" is not one of camera, cut, label, speak, attention, arrow, measure, effect, icon, show, advance, hide, shake, flash`);
      return null;
  }
}

/** Fill in what the server knows about each picture. Objects are copied; the input is not changed. */
export function withPictures(scene: FilmScene, pictures: Record<string, Pick<ImageObject, "src" | "aspect" | "hotspots">>): FilmScene {
  const objects: SceneObject[] = scene.objects.map((object) => (object.kind === "image" ? { ...object, ...pictures[object.id] } : object));
  return { ...scene, objects };
}
