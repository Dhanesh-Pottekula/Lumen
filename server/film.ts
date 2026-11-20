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
import { cutOutPng, shrinkPng } from "./cutout";
import { DEFAULT_PROMPTS, PROMPT_INFO, type Prompts, SCENE_REPAIR, cutoutPrompt, drawingPrompt, partsContext, promptsWith, sceneContext, sceneRetry, sceneStable } from "./prompts";
import { createTracer } from "./trace";
import { createMeter } from "./usage";
import type { ImageBytes, Message, Provider } from "./providers/types";
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
  /** True for one thing drawn alone on white, to be cut out and laid over a background. */
  cutout: boolean;
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

type Picture = Required<Pick<ImageObject, "src" | "aspect" | "hotspots">> & { cutout?: boolean };

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
  const cutout = raw.kind === "cutout";
  const parts: PicturePlan["parts"] = [];
  // A cut-out is moved as one piece and nothing is aimed at it, so it has no parts to find.
  for (const part of !cutout && Array.isArray(raw.parts) ? raw.parts : []) {
    const record = typeof part === "string" ? { id: part, where: part } : (part as Record<string, unknown> | null);
    const partId = slug(record?.id ?? "");
    if (!partId || parts.some((p) => p.id === partId) || parts.length >= 4) continue;
    parts.push({ id: partId, where: typeof record?.where === "string" && record.where.trim() ? record.where.trim() : partId });
  }
  // "of" joins two pictures of one kind: a later moment of a background, or another pose of a cut-out.
  const earlier = typeof raw.of === "string" ? known.get(slug(raw.of)) : undefined;
  const of = earlier && earlier.cutout === cutout ? earlier.id : null;
  return { id, brief: raw.brief.trim(), parts, of, cutout };
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
    cutoutPrompt("the main character", "x", "styled", prompts.cutoutLook),
    cutoutPrompt("", "x", "state", prompts.cutoutLook),
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
    // A cut-out's call gets back the drawing on white; that is the file kept as <id>.drawn.png.
    outputSrc: (stage, id, type) => (stage === "picture" ? `${base}/pictures/${id}${plans.get(id)?.cutout ? ".drawn" : ""}.${EXTENSIONS[type] ?? "png"}` : stage === "voice" ? `${base}/voice/${id}.${EXTENSIONS[type] ?? "mp3"}` : undefined),
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
  /**
   * Resolves once the scene writers' shared prompt is in the cache. Several writers start at the same moment;
   * without this each of the first few would pay to write the same text, and none could read it.
   */
  let warmed: Promise<void> | null = null;
  const warmUp = () => (warmed ??= provider.warm ? provider.warm(P.scene, stableText()).catch((error) => log({ stage: "warm-up", error: String((error as Error).message ?? error) })) : Promise.resolve());

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

  // ── Pictures ────────────────────────────────────────────────────────────────────────────────────────
  function startPicture(plan: PicturePlan) {
    // The lead sets the film's drawing style, so it is a whole frame, never a cut-out.
    if (!leadId && !plan.of && !plan.cutout) leadId = plan.id;
    const lead = leadId;
    progress("picture", "planned", plan.brief, { id: plan.id });

    const drawn = (async (): Promise<Drawn | null> => {
      // The reference is awaited outside the drawing lane, so a waiting picture never holds a lane idle.
      let reference: Drawn | null = null;
      let mode: "lead" | "styled" | "state" = "lead";
      if (plan.of) {
        reference = (await drawings.get(plan.of)) ?? null;
        if (reference) mode = "state";
      }
      if (!reference && lead && lead !== plan.id) {
        reference = (await drawings.get(lead)) ?? null;
        if (reference) mode = "styled";
      }
      if (plan.cutout) {
        return drawing(async () => {
          progress("picture", "drawing", `Drawing ${plan.id}`, { id: plan.id });
          let why = "";
          // One redraw: the image model sometimes adds a floor, a shadow or a whole scene, and the cut says so.
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const prompt = cutoutPrompt(plan.brief, character, mode, P.cutoutLook) + (why ? `\n\nThe last drawing could not be used: ${why}. Draw it again as asked.` : "");
              const image = await provider.draw(prompt, reference, plan.id);
              const cut = cutOutPng(image.bytes);
              log({ stage: "picture", id: plan.id, attempt, cut: { width: cut.width, height: cut.height, coverage: Math.round(cut.coverage * 1000) / 1000, edges: cut.edges, problem: cut.problem } });
              if (cut.problem) {
                why = cut.problem;
                continue;
              }
              // The drawing as it came is kept beside the cut-out: another pose of this thing is redrawn from it.
              fs.writeFileSync(path.join(dir, `pictures/${plan.id}.drawn.png`), image.bytes);
              tracer.name(image.bytes, `${base}/pictures/${plan.id}.drawn.png`);
              const file = `pictures/${plan.id}.png`;
              fs.writeFileSync(path.join(dir, file), cut.png);
              return { ...image, file, width: cut.width, height: cut.height };
            } catch (error) {
              why = String((error as Error).message ?? error);
            }
          }
          progress("picture", "failed", `Could not make the cut-out ${plan.id}: ${why}`, { id: plan.id });
          return null;
        });
      }
      return drawing(async () => {
        progress("picture", "drawing", `Drawing ${plan.id}`, { id: plan.id });
        // A drawing can be refused or fail for no reason that holds a second time, and a step without its picture
        // shows the wrong thing under the right words. So a background, like a cut-out, gets a second try.
        let why = "";
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const image = await provider.draw(drawingPrompt(plan.brief, character, mode, P.look), reference, plan.id);
            const size = imageSize(image.bytes);
            if (!size) throw new Error("the drawing came back in a format that cannot be measured");
            const file = `pictures/${plan.id}.${EXTENSIONS[image.type] ?? "png"}`;
            fs.writeFileSync(path.join(dir, file), image.bytes);
            tracer.name(image.bytes, `${base}/${file}`);
            return { ...image, file, width: size[0], height: size[1] };
          } catch (error) {
            why = String((error as Error).message ?? error);
            log({ stage: "picture", id: plan.id, attempt, error: why });
          }
        }
        progress("picture", "failed", `Could not draw ${plan.id}: ${why}`, { id: plan.id });
        return null;
      });
    })();
    drawings.set(plan.id, drawn);

    pictures.set(
      plan.id,
      drawn.then(async (image): Promise<Picture | null> => {
        if (!image) return null;
        const src = `${base}/${image.file}`;
        let hotspots: Record<string, Hotspot> = {};
        if (plan.parts.length) {
          hotspots = await measuring(async () => {
            progress("picture", "measuring", `Finding ${plan.parts.map((p) => p.id).join(", ")} in ${plan.id}`, { id: plan.id });
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                const ids = plan.parts.map((p) => p.id);
                const found = await provider.findParts(P.parts, partsContext(plan.brief, image.width, image.height, plan.parts), image, plan.id, ids);
                log({ stage: "picture", id: plan.id, attempt, found });
                return hotspotsOf(found, ids, image.width, image.height);
              } catch (error) {
                log({ stage: "picture", id: plan.id, attempt, error: String((error as Error).message ?? error) });
              }
            }
            return {};
          });
        }
        const found = Object.keys(hotspots);
        progress("picture", "ready", found.length ? `${plan.id} is ready: ${found.join(", ")}` : plan.cutout ? `${plan.id} is cut out and ready` : `${plan.id} is ready`, { id: plan.id, src });
        return { src, aspect: Math.round((image.width / image.height) * 1000) / 1000, hotspots, ...(plan.cutout ? { cutout: true } : {}) };
      }),
    );
  }

  // ── Scenes ──────────────────────────────────────────────────────────────────────────────────────────
  function startStep(step: Step) {
    const place = steps.length;
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
    // If every background of this step failed, stay on the nearest earlier one that was drawn. Cut-outs alone
    // cannot make a scene: they need a background to stand on.
    const grounded = () => [...drawnHere.values()].some((picture) => !picture.cutout);
    for (let back = place - 1; !grounded() && back >= 0; back--) {
      for (const id of steps[back].screen) {
        const picture = await pictures.get(id);
        if (picture && !picture.cutout) {
          drawnHere.set(id, picture);
          break;
        }
      }
    }
    if (!grounded()) {
      writing.withdraw(place);
      progress("scene", "dropped", `Step ${place + 1} has no picture and is left out`, { id: step.id, index: place });
      return null;
    }

    const rows: PictureRow[] = [...drawnHere].map(([id, picture]) => ({ id, parts: Object.keys(picture.hotspots), ...(picture.cutout ? { cutout: true } : {}) }));
    const table = [...drawnHere].map(([id, picture]) => {
      const planned = plans.get(id)?.parts ?? [];
      const missing = planned.filter((p) => !(p.id in picture.hotspots)).map((p) => p.id);
      return {
        id,
        kind: picture.cutout ? "cutout" : "background",
        shows: plans.get(id)?.brief,
        // Each found part with its box in the drawing, [left, top, width, height] as shares of the picture.
        parts: planned.filter((p) => p.id in picture.hotspots).map((p) => ({ id: `${id}.${p.id}`, is: p.where, box: picture.hotspots[p.id].map((n) => Math.round(n * 100) / 100) })),
        // A cut-out's own shape, width over height, now that it is cropped to the thing.
        ...(picture.cutout ? { shape: Math.round(picture.aspect * 100) / 100 } : {}),
        ...(missing.length ? { not_found: missing } : {}),
      };
    });

    // The scene writer is shown the pictures themselves, small: where things are and how big they came out is
    // easier to see than to read. A cut-out is shown as it was drawn, on white.
    const shown: NonNullable<Message["images"]> = [];
    for (const [id, picture] of drawnHere) {
      const drawn = await drawings.get(id);
      if (!drawn || drawn.type !== "image/png") continue;
      shown.push({ label: `The picture "${id}", ${picture.cutout ? "a cut-out, shown here on white before the white is removed" : "a background"}:`, image: shownAs(drawn, `${base}/pictures/${id}${picture.cutout ? ".drawn" : ""}.png`) });
    }

    function shownAs(drawn: Drawn, src: string): ImageBytes {
      const small = shrinkPng(drawn.bytes, SHOWN_WIDTH);
      tracer.name(small, src);
      return { bytes: small, type: "image/png" };
    }

    const verdict = await writing.run(place, async () => {
      progress("scene", "writing", `Writing scene ${place + 1}`, { id: step.id, index: place });
      // Wait for the shared prompt to be cached (at most 20 s), then send it first and unchanged.
      await Promise.race([warmUp(), new Promise((resolve) => setTimeout(resolve, 20_000))]);
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
          const ids = rows.map((row) => row.cutout ? `- cut-out ${row.id}: placed and moved, never aimed at` : `- background ${row.id}: ${row.parts.length ? `its parts are ${row.parts.map((p) => `${row.id}.${p}`).join(", ")}` : "no part can be named, only the whole picture"}`).join("\n");
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
    const scene = withPictures(verdict.scene, Object.fromEntries(drawnHere));
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
      // The skills are now known, so the shared prompt can go into the cache while the pictures are drawn.
      void warmUp();
    });
    if (!tool) void warmUp();
    await provider.plan(P.plan, brief, take, tool);
    fs.writeFileSync(path.join(dir, "plan.json"), buffer);
    progress("plan", "written", `Plan done: ${plans.size} pictures, ${steps.length} steps`);
  } catch (error) {
    // A plan that breaks off keeps the steps it already gave.
    failure = String((error as Error).message ?? error);
    fs.writeFileSync(path.join(dir, "plan.json"), buffer);
    progress("plan", "failed", `The plan stopped early: ${failure}`);
  }

  enqueue(null);
  await released;
  await Promise.allSettled([...pictures.values(), ...voices.values()]);

  film.status = film.scenes.length ? "ready" : "failed";
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
  const error = film.status === "failed" ? (failure ?? "no scene could be made") : undefined;
  emit({ type: "film_done", run, status: film.status, scenes: film.scenes.length, ...(error ? { error } : {}) });
  return film;
}
