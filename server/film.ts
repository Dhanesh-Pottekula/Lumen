/**
 * make-film: one brief in, scenes out as they become ready. The same shape as AiRA's film worker:
 *
 *   plan     one streamed model call. Its JSON is read while it is still being written.
 *   pictures each picture starts drawing the moment its plan entry closes (4 drawing lanes), then its parts
 *            are located (4 measuring lanes). Pictures are full film frames: nothing is cut out.
 *   voice    each step's narration is spoken as soon as the step closes (3 lanes).
 *   scenes   one writer per step (4 lanes, earlier steps first). A writer waits only for its own pictures,
 *            gets one repair turn for bad JSON and one corrective retry for things the film cannot play.
 *   release  scenes are published strictly in step order, however they finish.
 *
 * Everything the player needs is sent as events through `emit`; the same film is saved to `film.json`.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FilmEvent, FilmFile, FilmHeader, FilmScene, Hotspot, ImageObject, PictureRow, ProgressStage, ProgressStatus, SceneAudio } from "../src/film/types";
import { alignWords } from "../src/film/words";
import { validateScene, withPictures } from "../src/film/validate";
import { SHEET_MOST, cutSheet, sheetLayout, shrinkPng } from "./sheet";
import { DEFAULT_PROMPTS, PROMPT_INFO, type Prompts, SCENE_REPAIR, drawingPrompt, partsNote, promptsWith, sceneContext, sceneRetry, sceneStable, sheetPrompt } from "./prompts";
import { createTracer } from "./trace";
import { createMeter } from "./usage";
import type { ImageBytes, Message, PartsAsk, PartsFound, Provider } from "./providers/types";
import { loadSkills, skillTool } from "./skills";
import { knownMarksOnly, plainOf } from "./voice";
import { PICTURES_KEY, STEPS_KEY, entriesClosed, imageSize, jsonObject, lanes, planHeader, slug, writingLanes } from "./text";

/** How wide a picture is when it is shown to the scene writer: enough to see what is where, at a fraction of the bytes. */
const SHOWN_WIDTH = 768;

export const LANES = { drawing: 4, measuring: 4, writing: 4, voice: 3 } as const;

interface PicturePlan {
  id: string;
  brief: string;
  parts: { id: string; where: string }[];
  of: string | null;
}

interface Step {
  id: string;
  /** The narration with its voice marks, as the voice performs it. `narration` is the plain words. */
  voice: string;
  narration: string;
  show: string;
  screen: string[];
}

interface Drawn extends ImageBytes {
  file: string;
  width: number;
  height: number;
}

type Picture = Required<Pick<ImageObject, "src" | "aspect" | "hotspots">> & {
  /** Parts the finder added itself, with its own words for what each is. They are in `hotspots` too. */
  seen: Record<string, string>;
};

/** The most parts the finder may add to one picture beyond the ones the plan named. */
export const SEEN_MOST = 6;

export interface FilmJob {
  provider: Provider;
  brief: string;
  run: string;
  /** Folder this run's pictures, voice and film.json are written to. */
  dir: string;
  /** Folder of AiRA film skills (narrative/ and visual/), or nothing. */
  skillsDir?: string;
  /** Prompts a person rewrote, by key. Each one left out is the default. */
  prompts?: Partial<Prompts>;
  /** Web path the folder is served at, such as /film-runs/<run>. */
  base: string;
  emit: (event: FilmEvent) => void;
}

const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "audio/mpeg": "mp3", "audio/wav": "wav" };


function picturePlanOf(entry: unknown, known: Map<string, PicturePlan>): PicturePlan | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  const id = slug(raw.id ?? "");
  if (!id || known.has(id) || typeof raw.brief !== "string" || !raw.brief.trim()) return null;
  const parts: PicturePlan["parts"] = [];
  for (const part of Array.isArray(raw.parts) ? raw.parts : []) {
    const record = typeof part === "string" ? { id: part, where: part } : (part as Record<string, unknown> | null);
    const partId = slug(record?.id ?? "");
    if (!partId || parts.some((p) => p.id === partId) || parts.length >= 4) continue;
    parts.push({ id: partId, where: typeof record?.where === "string" && record.where.trim() ? record.where.trim() : partId });
  }
  // "of" joins a picture to the earlier one it is a later moment of.
  const earlier = typeof raw.of === "string" ? known.get(slug(raw.of)) : undefined;
  return { id, brief: raw.brief.trim(), parts, of: earlier ? earlier.id : null };
}

function stepOf(entry: unknown): Step | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  const narration = typeof raw.narration === "string" ? plainOf(raw.narration) : "";
  const id = slug(raw.id ?? "");
  if (!id || !narration) return null;
  return {
    id,
    voice: knownMarksOnly(String(raw.narration)),
    narration,
    show: typeof raw.show === "string" ? raw.show.trim() : "",
    screen: (Array.isArray(raw.screen) ? raw.screen : []).filter((s): s is string => typeof s === "string").map(slug),
  };
}

/** Part boxes in pixels → [x, y, w, h] as fractions of the picture, clamped; tiny or unplanned boxes are dropped. */
export function hotspotsOf(found: { parts: { part: string; box: number[] }[]; missing: string[] }, planned: string[], width: number, height: number): Record<string, Hotspot> {
  const hotspots: Record<string, Hotspot> = {};
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  // A model may echo the whole "id: where it is" line back as the name; the id is what comes before the colon.
  const idOf = (name: string) => slug(String(name).split(":")[0]);
  const missing = (found.missing ?? []).map(idOf);
  for (const { part, box } of found.parts ?? []) {
    const id = idOf(part);
    if (!planned.includes(id) || missing.includes(id) || id in hotspots) continue;
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const x0 = clamp(Math.min(box[0], box[2]) / width);
    const y0 = clamp(Math.min(box[1], box[3]) / height);
    const x1 = clamp(Math.max(box[0], box[2]) / width);
    const y1 = clamp(Math.max(box[1], box[3]) / height);
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) continue;
    hotspots[id] = [x0, y0, x1 - x0, y1 - y0].map((n) => Math.round(n * 10000) / 10000) as Hotspot;
  }
  return hotspots;
}

/**
 * The parts the finder added itself: things it saw in the picture that the plan did not name. Each gets an id
 * that is free, and a box as fractions of the picture. One with no usable box, one that covers nearly the whole
 * picture, and one past the limit are left out.
 */
export function seenParts(found: PartsFound, taken: string[], width: number, height: number): { id: string; is: string; box: Hotspot }[] {
  const out: { id: string; is: string; box: Hotspot }[] = [];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (const entry of found.also ?? []) {
    const id = slug(entry?.id ?? "");
    const box = entry?.box;
    if (!id || taken.includes(id) || out.some((one) => one.id === id) || out.length >= SEEN_MOST) continue;
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number" && Number.isFinite(n))) continue;
    const x0 = clamp(Math.min(box[0], box[2]) / width);
    const y0 = clamp(Math.min(box[1], box[3]) / height);
    const x1 = clamp(Math.max(box[0], box[2]) / width);
    const y1 = clamp(Math.max(box[1], box[3]) / height);
    if (x1 - x0 < 0.02 || y1 - y0 < 0.02 || (x1 - x0 > 0.92 && y1 - y0 > 0.92)) continue;
    out.push({ id, is: typeof entry.is === "string" && entry.is.trim() ? entry.is.trim().slice(0, 80) : id, box: [x0, y0, x1 - x0, y1 - y0].map((n) => Math.round(n * 10000) / 10000) as Hotspot });
  }
  return out;
}

/**
 * A short fingerprint of the prompts a film was made with. Two films with the same value were written by the
 * same planner, scene writer, part finder and look, so their numbers can be compared.
 */
export function promptVersion(prompts: Prompts = DEFAULT_PROMPTS): string {
  const text = [
    prompts.plan,
    prompts.scene,
    prompts.parts,
    prompts.voice,
    drawingPrompt("", "none", "lead", prompts.look),
    drawingPrompt("the main character", "x", "state", prompts.look),
    drawingPrompt("", "x", "styled", prompts.look),
    sheetPrompt([{ brief: "the main character" }, { brief: "", laterOf: 1 }], "x", 2, 4, true, prompts.look),
    sheetPrompt([{ brief: "" }, { brief: "" }, { brief: "" }], "x", 1, 3, false, prompts.look),
  ].join("\u0000");
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export async function makeFilm(job: FilmJob): Promise<FilmFile> {
  const { brief, run, dir, base, emit } = job;
  const source = job.provider;
  const P = promptsWith(job.prompts);
  const skills = loadSkills(job.skillsDir);
  let chosenSkills: string[] = [];
  const meter = createMeter();
  fs.mkdirSync(path.join(dir, "pictures"), { recursive: true });
  fs.mkdirSync(path.join(dir, "voice"), { recursive: true });

  const started = Date.now();
  // Every model call is recorded in full, for anyone who wants to see how the film was made.
  const tracer = createTracer({
    file: path.join(dir, "calls.jsonl"),
    started,
    describe: (stage) => source.stages?.[stage] ?? { model: source.name },
    outputSrc: (stage, id, type) => (stage === "picture" ? `${base}/pictures/${id}.${EXTENSIONS[type] ?? "png"}` : stage === "voice" ? `${base}/voice/${id}.${EXTENSIONS[type] ?? "mp3"}` : undefined),
  });
  const provider = tracer.wrap(source);
  const log = (entry: Record<string, unknown>) =>
    fs.appendFileSync(path.join(dir, "log.jsonl"), JSON.stringify({ t: Math.round((Date.now() - started) / 100) / 10, ...entry }) + "\n");
  const progress = (stage: ProgressStage, status: ProgressStatus, text: string, extra: { id?: string; index?: number; src?: string } = {}) => {
    log({ stage, status, text, ...extra });
    emit({ type: "film_progress", run, stage, status, text: text.slice(0, 160), ...extra });
  };

  const header: FilmHeader = { version: "1", title: brief.slice(0, 60), look: "movie" };
  const film: FilmFile = { run, brief, provider: provider.name, status: "generating", header, scenes: [] };
  const save = () => fs.writeFileSync(path.join(dir, "film.json"), JSON.stringify(film, null, 2));
  save();

  // Every model call reports what it consumed; the running total goes to the viewer as it grows.
  source.report = (stage, model, usage) => {
    tracer.usage(model, usage);
    meter.add(stage, model, usage);
    film.usage = meter.summary();
    log({ stage: "usage", for: stage, model, ...usage });
    emit({ type: "film_usage", run, usage: film.usage });
  };

  /** The text every scene writer of this film starts with: the rules of the visual skills the planner loaded. */
  const stableText = () =>
    sceneStable(skills.filter((skill) => skill.scene && chosenSkills.includes(skill.name)).map((skill) => `<skill name='${skill.name}'>\n${skill.scene}\n</skill>`).join("\n\n"));

  const plans = new Map<string, PicturePlan>();
  const steps: Step[] = [];
  const drawings = new Map<string, Promise<Drawn | null>>();
  const pictures = new Map<string, Promise<Picture | null>>();
  const voices = new Map<string, Promise<SceneAudio | null>>();
  const drawing = lanes(LANES.drawing);
  const measuring = lanes(LANES.measuring);
  const speaking = lanes(LANES.voice);
  const writing = writingLanes(LANES.writing);
  let character = "none";
  let leadId: string | null = null;

  // ── Release: scenes leave in step order, whatever order they finish in ──────────────────────────────
  const queue: (Promise<FilmScene | null> | null)[] = [];
  let wake: (() => void) | null = null;
  const enqueue = (entry: Promise<FilmScene | null> | null) => {
    queue.push(entry);
    wake?.();
  };
  const released = (async () => {
    for (let place = 0; ; place++) {
      while (place >= queue.length) await new Promise<void>((resolve) => (wake = resolve));
      const pending = queue[place];
      if (pending === null) return;
      const scene = await pending;
      if (!scene) continue;
      film.scenes.push(scene);
      save();
      emit({ type: "film_scene", run, index: film.scenes.length - 1, header: { ...header }, scene });
      progress("scene", "published", `Scene ${film.scenes.length} is on screen`, { id: scene.id, index: place });
    }
  })();

  // ── Pictures: eight to a drawing ────────────────────────────────────────────────────────────────────
  // A drawing costs the same whatever is in it, so pictures wait until eight are listed and are drawn together
  // as a grid of frames, which is then cut apart. They are grouped in the order the plan lists them; the last
  // group holds however many are left. Nothing is drawn a second time: a drawing that fails, or a frame that
  // is missing from one, is recorded and the run is marked failed.
  /** Why a drawing, or a frame of one, could not be used. Any entry here fails the run. */
  const drawFailures: string[] = [];
  type Waiting = { plan: PicturePlan; settle: (drawn: Drawn | null) => void };
  const sheetWaiting: Waiting[] = [];
  let sheets = 0;
  let picturesClosed = false;
  /** The film's first drawing. Later ones wait for it, to be drawn in the style of its first frame. */
  let firstSheet: Promise<void> | null = null;
  const queuePicture = (plan: PicturePlan) =>
    new Promise<Drawn | null>((settle) => {
      sheetWaiting.push({ plan, settle });
      flushSheets();
    });

  /**
   * Send off every full group that is ready. A full group goes once a ninth picture is listed, so that a later
   * moment is never cut off from the picture it is a moment of: the two go in one drawing, where they can match.
   */
  function flushSheets() {
    while (sheetWaiting.length > SHEET_MOST || (picturesClosed && sheetWaiting.length)) {
      let size = Math.min(SHEET_MOST, sheetWaiting.length);
      if (sheetWaiting.length > size) {
        const inGroup = (id: string | null, upTo: number) => (id ? sheetWaiting.slice(0, upTo).findIndex((one) => one.plan.id === id) : -1);
        for (let earlier = inGroup(sheetWaiting[size].plan.of, size); earlier > 0; earlier = inGroup(sheetWaiting[size].plan.of, size)) size = earlier;
      }
      const group = sheetWaiting.splice(0, size);
      const drawn = drawSheet(group, firstSheet);
      firstSheet ??= drawn;
    }
  }
  /** The list of pictures is complete (or the plan has ended): whatever is still waiting is drawn now. */
  let listed!: () => void;
  /** Settles once the plan has named every picture it is going to. */
  const picturesListed = new Promise<void>((resolve) => (listed = resolve));
  const closePictures = () => {
    picturesClosed = true;
    flushSheets();
    listed();
  };

  async function drawSheet(group: Waiting[], after: Promise<void> | null) {
    // One picture left over is an ordinary drawing of its own.
    if (group.length === 1) {
      await after;
      group[0].settle(await drawAlone(group[0].plan));
      return;
    }
    const sheetId = `sheet-${++sheets}`;
    const ids = group.map((one) => one.plan.id);
    await after;
    const lead = leadId && !ids.includes(leadId) ? ((await drawings.get(leadId)) ?? null) : null;
    await drawing(async () => {
      const { cols, rows, size } = sheetLayout(group.length);
      const items = group.map(({ plan }) => {
        const earlier = plan.of ? ids.indexOf(plan.of) + 1 : 0;
        return { brief: plan.brief, ...(earlier ? { laterOf: earlier } : {}) };
      });
      progress("picture", "drawing", `Drawing ${group.length} pictures in one drawing: ${ids.join(", ")}`, { id: sheetId });
      try {
        const image = await provider.draw(sheetPrompt(items, character, cols, rows, Boolean(lead), P.look), lead, sheetId, size);
        fs.writeFileSync(path.join(dir, `pictures/${sheetId}.png`), image.bytes);
        tracer.name(image.bytes, `${base}/pictures/${sheetId}.png`);
        const frames = cutSheet(image.bytes, cols, rows, group.length);
        group.forEach((one, n) => {
          const frame = frames[n];
          const drawn = frame ? keep(one.plan.id, frame) : null;
          log({ stage: "picture", id: one.plan.id, sheet: sheetId, place: n + 1, size: drawn ? [drawn.width, drawn.height] : null });
          if (!drawn) {
            drawFailures.push(`${one.plan.id}: no frame was found in place ${n + 1} of ${sheetId}`);
            progress("picture", "failed", `${one.plan.id} is missing from the drawing`, { id: one.plan.id });
          }
          one.settle(drawn);
        });
      } catch (error) {
        const why = String((error as Error).message ?? error);
        drawFailures.push(`${sheetId} (${ids.join(", ")}): ${why}`);
        log({ stage: "picture", id: sheetId, error: why });
        progress("picture", "failed", `Could not draw ${ids.join(", ")}: ${why}`, { id: sheetId });
        for (const one of group) one.settle(null);
      }
    });
  }

  /** The picture a drawing of one picture is made from, and what it is to that drawing. Awaited outside the drawing lanes. */
  async function referenceFor(plan: PicturePlan): Promise<{ reference: Drawn | null; given: "none" | "style" | "earlier" }> {
    if (plan.of) {
      const earlier = (await drawings.get(plan.of)) ?? null;
      if (earlier) return { reference: earlier, given: "earlier" };
    }
    if (leadId && leadId !== plan.id) {
      const lead = (await drawings.get(leadId)) ?? null;
      if (lead) return { reference: lead, given: "style" };
    }
    return { reference: null, given: "none" };
  }

  const keep = (id: string, bytes: Uint8Array): Drawn | null => {
    const size = imageSize(bytes);
    if (!size) return null;
    const file = `pictures/${id}.png`;
    fs.writeFileSync(path.join(dir, file), bytes);
    tracer.name(bytes, `${base}/${file}`);
    return { bytes, type: "image/png", file, width: size[0], height: size[1] };
  };

  /** One picture in a drawing of its own: the one left over, or every one when the provider's drawings cannot be cut. */
  async function drawAlone(plan: PicturePlan): Promise<Drawn | null> {
    const { reference, given } = await referenceFor(plan);
    const mode = given === "earlier" ? "state" : given === "style" ? "styled" : "lead";
    return drawing(async () => {
      progress("picture", "drawing", `Drawing ${plan.id}`, { id: plan.id });
      try {
        const image = await provider.draw(drawingPrompt(plan.brief, character, mode, P.look), reference, plan.id);
        const size = imageSize(image.bytes);
        if (!size) throw new Error("the drawing came back in a format that cannot be measured");
        const file = `pictures/${plan.id}.${EXTENSIONS[image.type] ?? "png"}`;
        fs.writeFileSync(path.join(dir, file), image.bytes);
        tracer.name(image.bytes, `${base}/${file}`);
        return { ...image, file, width: size[0], height: size[1] };
      } catch (error) {
        const why = String((error as Error).message ?? error);
        drawFailures.push(`${plan.id}: ${why}`);
        log({ stage: "picture", id: plan.id, error: why });
        progress("picture", "failed", `Could not draw ${plan.id}: ${why}`, { id: plan.id });
        return null;
      }
    });
  }

  // ── Parts: one call for all of a film's pictures ────────────────────────────────────────────────────
  /** The most pictures one call looks at. A film has eighteen or twenty-seven, so it is one call; more are split. */
  const PARTS_MOST = 30;
  let filmParts: Promise<Record<string, PartsFound>> | null = null;
  /**
   * The finder's answer for every picture of the film, by picture id. It waits until the plan has named every
   * picture and each one is drawn, then looks at all of them together. No picture's parts are known before that.
   */
  const partsOfFilm = () =>
    (filmParts ??= picturesListed.then(async () => {
      const ready: { plan: PicturePlan; image: Drawn }[] = [];
      for (const plan of plans.values()) {
        const image = await drawings.get(plan.id);
        if (image) ready.push({ plan, image });
      }
      const answers: Record<string, PartsFound> = {};
      for (let at = 0; at < ready.length; at += PARTS_MOST) Object.assign(answers, await findPartsIn(ready.slice(at, at + PARTS_MOST), ready.length > PARTS_MOST ? `pictures-${at / PARTS_MOST + 1}` : "all-pictures"));
      return answers;
    }));

  /**
   * Look at several finished pictures in one call and say where each one's parts are. The call is made once:
   * if it fails, those pictures go on with no parts, and the camera and marks can only aim by eye.
   */
  function findPartsIn(group: { plan: PicturePlan; image: Drawn }[], name?: string): Promise<Record<string, PartsFound>> {
    if (!group.length) return Promise.resolve({});
    const batchId = name ?? group[0].plan.id;
    return measuring(async () => {
      const ids = group.map((one) => one.plan.id);
      progress("picture", "measuring", group.length === 1 ? `Looking at ${ids[0]}` : `Looking at ${group.length} pictures together: ${ids.join(", ")}`, { id: batchId });
      const asks: PartsAsk[] = group.map(({ plan, image }) => ({ id: plan.id, note: partsNote(plan.id, plan.brief, image.width, image.height, plan.parts), image, partIds: plan.parts.map((p) => p.id) }));
      try {
        const found = await provider.findParts(P.parts, asks, batchId);
        log({ stage: "picture", id: batchId, pictures: ids, found });
        return found;
      } catch (error) {
        log({ stage: "picture", id: batchId, pictures: ids, error: String((error as Error).message ?? error) });
        progress("picture", "measuring", `The parts of ${ids.join(", ")} could not be found`, { id: batchId });
        return {};
      }
    });
  }

  // ── Pictures ────────────────────────────────────────────────────────────────────────────────────────
  function startPicture(plan: PicturePlan) {
    // The first picture sets the film's drawing style.
    if (!leadId && !plan.of) leadId = plan.id;
    progress("picture", "planned", plan.brief, { id: plan.id });
    const drawn = source.sheets === false ? drawAlone(plan) : queuePicture(plan);
    drawings.set(plan.id, drawn);

    pictures.set(
      plan.id,
      drawn.then(async (image): Promise<Picture | null> => {
        if (!image) return null;
        const src = `${base}/${image.file}`;
        // Every picture is looked at, whether or not the plan named a part in it: the finder also lists the
        // other things it sees, so the scene writer has more to aim at than the planner thought of. All of a
        // film's pictures are looked at together, in one call, once the last of them is drawn.
        const answers = await partsOfFilm();
        const found = answers[plan.id] ?? { parts: [], missing: [] };
        const ids = plan.parts.map((p) => p.id);
        const hotspots = hotspotsOf(found, ids, image.width, image.height);
        const seen: Record<string, string> = {};
        for (const extra of seenParts(found, ids, image.width, image.height)) {
          hotspots[extra.id] = extra.box;
          seen[extra.id] = extra.is;
        }
        const named = Object.keys(hotspots);
        progress("picture", "ready", named.length ? `${plan.id} is ready: ${named.join(", ")}` : `${plan.id} is ready`, { id: plan.id, src });
        return { src, aspect: Math.round((image.width / image.height) * 1000) / 1000, hotspots, seen };
      }),
    );
  }

  // ── Scenes ──────────────────────────────────────────────────────────────────────────────────────────
  function startStep(step: Step) {
    const place = steps.length;
    // A direction that names a picture means it to be on screen, even when the planner left it out of the
    // step's list. Without this the picture is drawn, paid for and never shown.
    for (const id of plans.keys()) {
      // An id such as "sun" is also an ordinary word, so a plain id only counts when it is written as an id:
      // with a hyphen or a digit in it, or followed by one of its parts ("sun.core").
      const named = /[-0-9]/.test(id) ? new RegExp(`(^|[^a-z0-9-])${id}([^a-z0-9-]|$)`) : new RegExp(`(^|[^a-z0-9-])${id}\\.[a-z]`);
      if (!step.screen.includes(id) && named.test(step.show)) step.screen.push(id);
    }
    steps.push(step);
    progress("step", "planned", `Planned step ${place + 1}: ${step.narration}`, { id: step.id, index: place });
    writing.enlist(place);

    voices.set(
      step.id,
      speaking(async () => {
        try {
          const audio = await provider.speak(step.voice, P.voice, step.id);
          if (!audio) return null;
          const file = `voice/${step.id}.${EXTENSIONS[audio.type] ?? "mp3"}`;
          fs.writeFileSync(path.join(dir, file), audio.bytes);
          tracer.name(audio.bytes, `${base}/${file}`);
          const voice: SceneAudio = { src: `${base}/${file}` };
          // Word times let beats and subtitles land on the spoken word. Without them an even rate is assumed.
          try {
            // A voice that says when each word starts needs no listener; otherwise the clip is transcribed.
            const heard = audio.words?.length && audio.duration ? { words: audio.words, duration: audio.duration } : await provider.hear(audio, step.narration);
            if (heard) voice.wordTimes = alignWords(step.narration, heard.words, heard.duration);
          } catch (error) {
            log({ stage: "voice", id: step.id, error: String((error as Error).message ?? error) });
          }
          progress("voice", "ready", `Voice for step ${place + 1} is ready`, { id: step.id, index: place });
          return voice;
        } catch (error) {
          progress("voice", "failed", `No voice for step ${place + 1}: ${String((error as Error).message ?? error)}`, { id: step.id, index: place });
          return null;
        }
      }),
    );

    enqueue(writeScene(step, place));
  }

  async function writeScene(step: Step, place: number): Promise<FilmScene | null> {
    // A writer waits for its own step's pictures only, never for the whole film's.
    const wanted = [...new Set(step.screen)].filter((id) => pictures.has(id));
    const drawnHere = new Map<string, Picture>();
    for (const id of wanted) {
      const picture = await pictures.get(id);
      if (picture) drawnHere.set(id, picture);
    }
    // If every picture of this step failed, stay on the nearest earlier one that was drawn.
    for (let back = place - 1; !drawnHere.size && back >= 0; back--) {
      for (const id of steps[back].screen) {
        const picture = await pictures.get(id);
        if (picture) {
          drawnHere.set(id, picture);
          break;
        }
      }
    }
    if (!drawnHere.size) {
      writing.withdraw(place);
      progress("scene", "dropped", `Step ${place + 1} has no picture and is left out`, { id: step.id, index: place });
      return null;
    }

    const rows: PictureRow[] = [...drawnHere].map(([id, picture]) => ({ id, parts: Object.keys(picture.hotspots) }));
    const table = [...drawnHere].map(([id, picture]) => {
      const planned = plans.get(id)?.parts ?? [];
      const missing = planned.filter((p) => !(p.id in picture.hotspots)).map((p) => p.id);
      return {
        id,
        shows: plans.get(id)?.brief,
        // Each found part with its box in the drawing, [left, top, width, height] as shares of the picture.
        parts: [
          ...planned.filter((p) => p.id in picture.hotspots).map((p) => ({ id: `${id}.${p.id}`, is: p.where, box: picture.hotspots[p.id].map((n) => Math.round(n * 100) / 100) })),
          // What the finder saw for itself, in its own words.
          ...Object.entries(picture.seen).map(([part, is]) => ({ id: `${id}.${part}`, is, box: picture.hotspots[part].map((n) => Math.round(n * 100) / 100) })),
        ],
        ...(missing.length ? { not_found: missing } : {}),
      };
    });

    // The scene writer is shown the pictures themselves, small: where things are and how big they came out is
    // easier to see than to read.
    const shown: NonNullable<Message["images"]> = [];
    for (const id of drawnHere.keys()) {
      const drawn = await drawings.get(id);
      if (!drawn || drawn.type !== "image/png") continue;
      shown.push({ label: `The picture "${id}":`, image: shownAs(drawn, `${base}/pictures/${id}.png`) });
    }

    function shownAs(drawn: Drawn, src: string): ImageBytes {
      const small = shrinkPng(drawn.bytes, SHOWN_WIDTH);
      tracer.name(small, src);
      return { bytes: small, type: "image/png" };
    }

    const verdict = await writing.run(place, async () => {
      progress("scene", "writing", `Writing scene ${place + 1}`, { id: step.id, index: place });
      let messages: Message[] = [{ role: "user", stable: stableText(), content: sceneContext(table, { id: step.id, narration: step.narration, show: step.show }), ...(shown.length ? { images: shown } : {}) }];
      let raw: Record<string, unknown> | null = null;
      try {
        for (const attempt of ["write", "repair"] as const) {
          const reply = await provider.write(P.scene, messages, step.id);
          // The whole reply is kept, so a beat the film later drops can still be read.
          log({ stage: "scene", id: step.id, attempt, chars: reply.length, reply });
          messages = [...messages, { role: "assistant", content: reply }];
          raw = jsonObject(reply);
          if (raw) break;
          messages = [...messages, { role: "user", content: SCENE_REPAIR }];
        }
        if (!raw) return null;

        progress("scene", "checking", `Checking scene ${place + 1}`, { id: step.id, index: place });
        let checked = validateScene(raw, rows, step.id, step.narration);
        if (checked.problems.length) {
          log({ stage: "scene", id: step.id, problems: checked.problems });
          const ids = rows.map((row) => `- picture ${row.id}: ${row.parts.length ? `its parts are ${row.parts.map((p) => `${row.id}.${p}`).join(", ")}` : "no part can be named, only the whole picture"}`).join("\n");
          const reply = await provider.write(P.scene, [...messages, { role: "user", content: sceneRetry(checked.problems, ids) }], step.id);
          const fixed = jsonObject(reply);
          const again = fixed ? validateScene(fixed, rows, step.id, step.narration) : null;
          // Keep the correction only if it is playable and no worse than the first try.
          const kept = !!again && again.valid && (again.problems.length <= checked.problems.length || !checked.valid);
          log({ stage: "scene", id: step.id, attempt: "retry", chars: reply.length, reply, problems: again?.problems ?? ["not one JSON object"], kept });
          if (kept && again) checked = again;
        }
        return checked;
      } catch (error) {
        log({ stage: "scene", id: step.id, error: String((error as Error).message ?? error) });
        return null;
      }
    });

    if (!verdict?.valid) {
      progress("scene", "dropped", `Scene ${place + 1} could not be written and is left out`, { id: step.id, index: place });
      return null;
    }
    const scene = withPictures(verdict.scene, Object.fromEntries([...drawnHere].map(([id, { src, aspect, hotspots }]) => [id, { src, aspect, hotspots }])));
    const audio = await voices.get(step.id);
    if (audio) scene.audio = audio;
    progress("scene", "ready", `Scene ${place + 1} is ready`, { id: step.id, index: place });
    return scene;
  }

  // ── Plan: read while it streams ─────────────────────────────────────────────────────────────────────
  let buffer = "";
  let headerRead = false;
  let pictureCursor = 0;
  let picturesDone = false;
  let stepCursor = 0;

  function take(delta: string) {
    buffer += delta;
    // Nothing can have closed unless this delta carries a closing bracket.
    if (!/[\]}]/.test(delta)) return;
    if (!headerRead) {
      const opening = planHeader(buffer);
      if (!opening) return;
      headerRead = true;
      if (typeof opening.title === "string" && opening.title.trim()) header.title = opening.title.trim().slice(0, 60);
      if (typeof opening.character === "string" && opening.character.trim()) character = opening.character.trim();
    }
    if (!picturesDone) {
      const closed = entriesClosed(buffer, PICTURES_KEY, pictureCursor);
      pictureCursor = closed.cursor;
      picturesDone = closed.done;
      for (const entry of closed.entries) {
        const plan = picturePlanOf(entry, plans);
        if (!plan) continue;
        plans.set(plan.id, plan);
        startPicture(plan);
      }
      if (picturesDone) closePictures();
    }
    // Steps are read only once every picture is known, so a step can never name a picture not yet planned.
    if (picturesDone) {
      const closed = entriesClosed(buffer, STEPS_KEY, stepCursor);
      stepCursor = closed.cursor;
      for (const entry of closed.entries) {
        const step = stepOf(entry);
        if (step && !steps.some((s) => s.id === step.id)) startStep(step);
      }
    }
  }

  let failure: string | undefined;
  try {
    progress("plan", "writing", "Writing the plan");
    const tool = skillTool(skills, (names) => {
      chosenSkills = names;
      progress("plan", "writing", `Teaching with ${names.join(", ")}`);
    });
    await provider.plan(P.plan, brief, take, tool);
    fs.writeFileSync(path.join(dir, "plan.json"), buffer);
    progress("plan", "written", `Plan done: ${plans.size} pictures, ${steps.length} steps`);
  } catch (error) {
    // A plan that breaks off keeps the steps it already gave.
    failure = String((error as Error).message ?? error);
    fs.writeFileSync(path.join(dir, "plan.json"), buffer);
    progress("plan", "failed", `The plan stopped early: ${failure}`);
  }
  // A plan that ended without closing its list of pictures still gets the pictures it named.
  closePictures();

  enqueue(null);
  await released;
  await Promise.allSettled([...pictures.values(), ...voices.values()]);

  film.status = film.scenes.length && !drawFailures.length ? "ready" : "failed";
  if (drawFailures.length) film.error = `Some pictures could not be made (${drawFailures.join("; ")}). Nothing was drawn again.`;
  film.usage = meter.summary();
  // Only the folder's last two names are kept: enough to tell Lumen's own skills from another set, without a home path.
  const skillsAt = path.resolve(job.skillsDir ?? "");
  film.made = {
    prompts: promptVersion(P),
    // Which prompts were a person's own rewrite, and what each stage ran on, so the film says how it was made.
    edited: PROMPT_INFO.map((info) => info.key).filter((key) => P[key] !== DEFAULT_PROMPTS[key]),
    stages: source.stages ?? {},
    skills: chosenSkills,
    skillsFrom: skills.length ? `${path.basename(path.dirname(skillsAt))}/${path.basename(skillsAt)}` : null,
  };
  save();
  const error = film.status === "failed" ? (film.error ?? failure ?? "no scene could be made") : undefined;
  emit({ type: "film_done", run, status: film.status, scenes: film.scenes.length, ...(error ? { error } : {}) });
  return film;
}
