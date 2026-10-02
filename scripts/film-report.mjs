// Film quality report: renders every beat of a lesson film off screen at phone scale and measures what a
// viewer would meet — text size, contrast, where the eye goes, crowding, sync and pacing.
//
//   node scripts/film-report.mjs film.json [more.json …] [--out report.json] [--sheet sheet.png] [--cache dir] [--engine dist/index.js]
//
// Pictures given as https URLs are read from `--cache` (the recorder's `<sha1(url)>.txt` data URLs) or
// fetched once and inlined; a film whose pictures cannot all be had is flagged `picturesMissing` and
// never measured, since a blank stand-in would make every layout finding false. Scene floors come from
// `--timings file.json` ({sceneId: [wordStartSeconds…]}) when measured audio exists, else from the
// app's own estimate. The generic checks (film-checks.mjs) run on every film that renders. `--engine`
// renders with another build of the engine, to compare a change against the one before it.
import { createCanvas, GlobalFonts, Image, Path2D } from "@napi-rs/canvas";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createRecorder, genericChecks } from "./film-checks.mjs";

const VIEW_W = 540;
const VIEW_H = 960;
const SAFE_MARGIN = 24;
const CARD_PT = 402;
const PT_PER_UNIT = CARD_PT / (VIEW_W + SAFE_MARGIN * 2);
const SECONDS_PER_WORD = 0.4;
const MIN_LABEL_PT = 12;
const STILL_SECONDS = 7;
const SCALE = 2;
const BACKGROUND = "#FAFAFA";

const WRITING = new Set(["text", "equation", "measure"]);
const PICTURE = new Set(["image", "visual", "svg-artwork", "svg-composite", "chart", "map", "table", "timeline"]);
const SCRIM_VERBS = new Set(["spotlight", "vignette"]);
// A sentence that asks the viewer to think — guess, predict, hold a question, explain it back — leaves
// the frame still by design, so it is never counted as narration nothing on screen answers.
const INVITATION =
  /\b(take a (guess|moment)|make a guess|have a guess|guess (what|which|how|why|where|when|whether|if)|what do you think|think (about|it over|it through|for a moment|why|how|what)|pause (and|on|to) (think|predict|guess|consider|why|what|how)|(can you |now )?predict (what|which|how|whether|where|if)|decide (why|what|how|which|whether)|(i'll|i will|we'll) ask you|(one|a) question for you|hold that (thought|difference|idea)|keep (that|this|it) .{0,30}in mind|(tell|explain .{0,40}to|try explaining .{0,40}to) someone)\b/i;

for (const font of ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Supplemental/Georgia.ttf"]) {
  if (fs.existsSync(font)) GlobalFonts.registerFromPath(font, font.includes("SFNS") ? "-apple-system" : "Georgia");
}
globalThis.Image = Image;
globalThis.Path2D = Path2D;
const recorder = createRecorder();
globalThis.document = { createElement: () => recorder.canvas(300, 150) };

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args.splice(at, 2)[1];
};
const outPath = option("--out");
const sheetPath = option("--sheet");
const timingsPath = option("--timings");
const cacheDir = option("--cache");
const enginePath = option("--engine");
const files = args;
if (files.length === 0) {
  console.error("usage: node scripts/film-report.mjs film.json [more.json …] [--out report.json] [--sheet sheet.png] [--timings t.json] [--cache dir] [--engine dist/index.js]");
  process.exit(2);
}

// A build caught half-written fails to load; it is retried a minute later, a few times, before giving up.
const engineUrl = pathToFileURL(path.resolve(enginePath ?? new URL("../packages/core/dist/index.js", import.meta.url).pathname)).href;
let engine;
for (let attempt = 1; !engine; attempt++) {
  engine = await import(`${engineUrl}?attempt=${attempt}`).catch((error) => {
    if (attempt >= 5) throw error;
    console.error(`engine failed to load (${String(error?.message ?? error).slice(0, 100)}), retrying in a minute`);
    return new Promise((done) => setTimeout(() => done(undefined), 60000));
  });
}
const { preloadLessonImages, renderLessonSpec } = engine;

const words = (text) => String(text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const luminance = (r, g, b) => {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Inlines every https picture as a data URL; returns the sources that could not be had. */
async function inlinePictures(spec) {
  const loaded = new Map();
  for (const scene of spec.scenes) {
    for (const object of scene.objects ?? []) {
      if (object.kind !== "image" || typeof object.src !== "string" || !object.src.startsWith("https://")) continue;
      if (!loaded.has(object.src)) loaded.set(object.src, await picture(object.src));
      object.src = loaded.get(object.src) ?? object.src;
    }
  }
  return [...loaded].filter(([, data]) => !data).map(([url]) => url);
}

async function picture(url) {
  // The recorder (film_video.mjs) keeps pictures under `<cache>/pictures/`; a bare picture folder works too.
  const folder = cacheDir && (fs.existsSync(path.join(cacheDir, "pictures")) ? path.join(cacheDir, "pictures") : cacheDir);
  const cached = folder && path.join(folder, `${crypto.createHash("sha1").update(url).digest("hex")}.txt`);
  if (cached && fs.existsSync(cached)) return fs.readFileSync(cached, "utf8");
  const reply = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  const type = reply?.headers.get("content-type") ?? "";
  if (!reply?.ok || !type.startsWith("image/")) return undefined;
  const data = `data:${type};base64,${Buffer.from(await reply.arrayBuffer()).toString("base64")}`;
  if (cached) fs.writeFileSync(cached, data);
  return data;
}

/** When each object is on screen in its scene: [shown, gone) in scene seconds. */
function visibility(scene, resolved) {
  const shown = new Map();
  const gone = new Map();
  for (const object of scene.objects) if (object.initial === "visible") shown.set(object.id, 0);
  for (const beat of resolved.beats) {
    for (const action of beat.actions) {
      for (const id of action.source.targets ?? []) {
        if (action.kind === "show" && !shown.has(id)) shown.set(id, action.start);
        if (action.kind === "hide" && !gone.has(id)) gone.set(id, action.start);
      }
    }
  }
  const owner = (id) => String(id).split(".")[0];
  return (id, at) => {
    const from = shown.get(owner(id));
    return from !== undefined && from <= at && at < (gone.get(owner(id)) ?? Infinity);
  };
}

function textSizeOf(object) {
  return object.source.kind === "text" || object.source.kind === "equation" || object.source.kind === "measure" ? object.size : undefined;
}

function labelsAt(scene, resolved, at) {
  const labels = [];
  for (const beat of resolved.beats) {
    for (const action of beat.actions) {
      if (action.kind === "label" && action.start <= at && at < action.end + 1e-6) labels.push(action.source);
    }
  }
  return labels;
}

function sharedRun(a, b, run = 4) {
  const x = words(a);
  const y = words(b).join(" ");
  for (let i = 0; i + run <= x.length; i++) if (y.includes(x.slice(i, i + run).join(" "))) return true;
  return false;
}

function pixelsIn(data, box) {
  const x0 = Math.max(0, Math.floor(box.x * SCALE));
  const y0 = Math.max(0, Math.floor(box.y * SCALE));
  const x1 = Math.min(VIEW_W * SCALE, Math.ceil((box.x + box.w) * SCALE));
  const y1 = Math.min(VIEW_H * SCALE, Math.ceil((box.y + box.h) * SCALE));
  const out = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * VIEW_W * SCALE + x) * 4;
      out.push(luminance(data[i], data[i + 1], data[i + 2]));
    }
  }
  return out;
}

/** The text's own ink against the worst background pixel behind it (WCAG measures the least contrast). */
function textContrast(data, box) {
  const values = pixelsIn(data, box).sort((a, b) => a - b);
  if (values.length < 8) return undefined;
  const dark = values[Math.floor(values.length * 0.03)];
  const light = values[Math.floor(values.length * 0.97)];
  const inkIsDark = Math.abs(light - luminance(250, 250, 250)) < Math.abs(dark - luminance(250, 250, 250));
  const ink = inkIsDark ? dark : light;
  const middle = (dark + light) / 2;
  const background = values.filter((v) => (inkIsDark ? v > middle : v < middle));
  if (background.length === 0) return undefined;
  background.sort((a, b) => (inkIsDark ? a - b : b - a));
  return contrast(ink, background[Math.floor(background.length * 0.1)]);
}

/** Where the eye goes: after a phone-scale blur, how far each object's pixels stand from the page, summed. */
function dominant(blurred, candidates) {
  const mass = candidates.map((object) => {
    const box = object.box;
    let total = 0;
    const x0 = Math.max(0, Math.floor(box.x * SCALE));
    const y0 = Math.max(0, Math.floor(box.y * SCALE));
    const x1 = Math.min(VIEW_W * SCALE, Math.ceil((box.x + box.w) * SCALE));
    const y1 = Math.min(VIEW_H * SCALE, Math.ceil((box.y + box.h) * SCALE));
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * VIEW_W * SCALE + x) * 4;
        total += Math.hypot(blurred[i] - 250, blurred[i + 1] - 250, blurred[i + 2] - 250);
      }
    }
    return { id: object.id, mass: total };
  });
  mass.sort((a, b) => b.mass - a.mass);
  return mass;
}

function primaryOf(visibleObjects) {
  const pictures = visibleObjects.filter((o) => PICTURE.has(o.source.kind) || o.source.kind === "path");
  const declared = pictures.find((o) => o.source.role === "primary" || o.source.role === "hero");
  if (declared) return declared.id;
  pictures.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  return pictures[0]?.id;
}

function handDrawn(object) {
  const source = object.source;
  if (source.kind !== "path" || source.frame || (source.from && source.to)) return false;
  const closed = /[zZ]\s*$/.test(source.d ?? "") || /[zZ]/.test(source.d ?? "");
  const corners = (source.d ?? "").match(/[LCQSTAlcqsta]/g)?.length ?? 0;
  return closed && corners >= 4;
}

function boxOnPicture(object, byId) {
  const source = object.source;
  if (source.kind !== "path" || !source.frame) return false;
  const target = byId.get(source.frame);
  const d = source.d ?? "";
  const rectangle = /^\s*M[\d\s.,-]+(L[\d\s.,-]+){3}Z\s*$/i.test(d) || /^\s*M[\d\s.,-]+(H[\d\s.-]+V[\d\s.-]+){2}Z\s*$/i.test(d);
  return target?.source.kind === "image" && rectangle;
}

async function report(file) {
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(spec.scenes)) return { file: path.basename(file), valid: false, scenes: [], flags: {}, errors: ["not a film: no scenes"] };
  spec.theme = "parchment";
  const missing = await inlinePictures(spec);
  if (missing.length) {
    return { file: path.basename(file), title: spec.title, valid: true, scenes: [], flags: { picturesMissing: missing.map((url) => url.split("?")[0].split("/").pop()) } };
  }
  await preloadLessonImages(spec).catch(() => {});
  const timings = timingsPath ? JSON.parse(fs.readFileSync(timingsPath, "utf8")) : {};
  const floors = spec.scenes.map((scene) => {
    const measured = timings[scene.id];
    return Array.isArray(measured) && measured.length ? measured.at(-1) + 0.4 : Math.max(1, words(scene.narration).length * SECONDS_PER_WORD);
  });
  recorder.warnings.clear();
  const result = renderLessonSpec(spec, { backgroundColor: BACKGROUND, sceneFloors: floors });
  const film = { file: path.basename(file), title: spec.title, valid: result.valid, scenes: [], flags: {} };
  const flag = (kind, detail) => {
    (film.flags[kind] ??= []).push(detail);
  };
  if (!result.valid) {
    film.errors = result.errors.slice(0, 5).map((e) => `${e.code} ${e.path}`);
    return film;
  }

  const frame = createCanvas(VIEW_W * SCALE, VIEW_H * SCALE);
  const ctx = frame.getContext("2d");
  const blur = createCanvas(VIEW_W * SCALE, VIEW_H * SCALE);
  const blurCtx = blur.getContext("2d");
  const patterns = [];

  // The engine plays only the scenes it kept, so its scenes are found by id, never by position.
  const kept = new Map(result.lesson.scenes.map((scene, index) => [scene.id, index]));
  spec.scenes.forEach((scene, specIndex) => {
    const index = kept.get(scene.id);
    if (index === undefined) {
      const why = result.warnings.filter((w) => w.code === "DROPPED_SCENE" && (w.path === `/scenes/${specIndex}` || w.path.startsWith(`/scenes/${specIndex}/`)));
      flag("droppedScene", `${scene.id}: ${why.map((w) => `${w.path} ${w.message}`).join("; ") || "dropped"}`);
      film.scenes.push({ id: scene.id, dropped: true });
      return;
    }
    const resolved = result.resolved.scenes[index];
    const window = result.slide.scenes[index];
    const visible = visibility(scene, resolved);
    const byId = new Map(resolved.objects.map((o) => [o.id, o]));
    const spoken = words(scene.narration);
    const row = { id: scene.id, duration: +(window.end - window.start).toFixed(2), beats: resolved.beats.length, busiestWords: 0, minTextPt: Infinity, minContrast: Infinity };

    const pictured = scene.objects.some((o) => o.kind === "image");
    for (const object of resolved.objects) {
      if (pictured && handDrawn(object)) flag("handDrawn", `${scene.id}:${object.id}`);
      if (boxOnPicture(object, byId)) flag("boxOnPicture", `${scene.id}:${object.id}`);
    }
    for (const beat of resolved.beats) {
      for (const action of beat.actions) {
        const verb = action.source.verb;
        if (action.source.do === "attention" && SCRIM_VERBS.has(verb)) {
          flag("screenScrim", `${scene.id}:${verb}:${action.source.target}`);
        }
      }
    }
    const named = new Set(spoken);
    const pointedAt = new Set(
      resolved.beats.flatMap((beat) => beat.actions.map((a) => String(a.source.target ?? "").split(".")[0])),
    );
    for (const object of scene.objects) {
      if (object.kind !== "image") continue;
      const nameWords = words(object.id.replace(/-/g, " "));
      if (!nameWords.some((w) => named.has(w)) && !pointedAt.has(object.id)) flag("decoration", `${scene.id}:${object.id}`);
    }
    for (const object of scene.objects) {
      if (object.kind === "text" && sharedRun(object.text, scene.narration)) flag("transcript", `${scene.id}:${object.id}`);
    }
    for (const beat of scene.beats) {
      for (const action of beat.actions) if (action.do === "label" && sharedRun(action.text, scene.narration)) flag("transcript", `${scene.id}:label:${action.text}`);
    }

    const starts = resolved.beats.map((b) => b.start);
    const gaps = starts.map((s, i) => (i + 1 < starts.length ? starts[i + 1] : window.end - window.start) - s);
    gaps.forEach((gap, i) => {
      if (gap > STILL_SECONDS) flag("stillStretch", `${scene.id}:${resolved.beats[i].id}:${gap.toFixed(1)}s`);
    });
    const perWord = (window.end - window.start) / Math.max(1, spoken.length);
    let cursor = 0;
    for (const sentence of (scene.narration ?? "").split(/(?<=[.!?])\s+/)) {
      const count = words(sentence).length;
      const [from, to] = [cursor * perWord, (cursor + count) * perWord];
      cursor += count;
      if (count > 0 && !INVITATION.test(sentence.replace(/[’‘]/g, "'")) && !starts.some((s) => s >= from - 0.2 && s < to)) flag("narrationNothingChanges", `${scene.id}: "${sentence.slice(0, 40)}…"`);
    }
    for (const beat of scene.beats.slice(1)) {
      if (!beat.say) flag("beatWithoutSay", `${scene.id}:${beat.id}`);
    }
    for (const beat of resolved.beats.slice(1)) {
      const authored = scene.beats.find((b) => b.id === beat.id);
      if (authored?.say && beat.word === undefined) flag("sayNotFound", `${scene.id}:${beat.id}:"${authored.say}"`);
    }
    patterns.push({ id: scene.id, shape: resolved.beats.map((b) => b.actions.map((a) => a.kind).join("+")).join("|") });

    resolved.beats.forEach((beat, beatIndex) => {
      const next = resolved.beats[beatIndex + 1];
      const at = Math.max(beat.start + 0.05, Math.min(beat.end, next ? next.start : window.end - window.start) - 0.05);
      const onScreen = resolved.objects.filter((o) => visible(o.id, at) && !o.id.includes("."));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, frame.width, frame.height);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      result.slide.render(ctx, window.start + at);
      const data = ctx.getImageData(0, 0, frame.width, frame.height).data;
      blurCtx.filter = `blur(${7 * SCALE}px)`;
      blurCtx.drawImage(frame, 0, 0);
      blurCtx.filter = "none";
      const blurred = blurCtx.getImageData(0, 0, blur.width, blur.height).data;

      const writing = onScreen.filter((o) => WRITING.has(o.source.kind));
      const labels = labelsAt(scene, resolved, at);
      const wordCount =
        writing.reduce((sum, o) => sum + words(o.source.text ?? o.source.value).length, 0) +
        labels.reduce((sum, l) => sum + words(l.text).length, 0);
      row.busiestWords = Math.max(row.busiestWords, wordCount);
      for (const object of writing) {
        const size = textSizeOf(object);
        if (size !== undefined) row.minTextPt = Math.min(row.minTextPt, size * PT_PER_UNIT);
        const measured = textContrast(data, object.box);
        if (measured !== undefined) row.minContrast = Math.min(row.minContrast, measured);
      }
      if (labels.length) row.minTextPt = Math.min(row.minTextPt, 18 * PT_PER_UNIT);
      // The engine writes every year and event name on a timeline at its 18-unit floor (MIN_TEXT).
      if (onScreen.some((o) => o.source.kind === "timeline")) row.minTextPt = Math.min(row.minTextPt, 18 * PT_PER_UNIT);

      for (let i = 0; i < onScreen.length; i++) {
        for (let j = i + 1; j < onScreen.length; j++) {
          const [a, b] = [onScreen[i], onScreen[j]];
          const pair = (WRITING.has(a.source.kind) && (WRITING.has(b.source.kind) || PICTURE.has(b.source.kind))) || (WRITING.has(b.source.kind) && PICTURE.has(a.source.kind));
          if (!pair) continue;
          const tied = (p, q) => p.source.placement && p.source.placement.mode !== "zone" && String(p.source.placement.target).split(".")[0] === q.id;
          if (tied(a, b) || tied(b, a)) continue;
          const ox = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
          const oy = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
          if (ox > 4 && oy > 4) flag("overlap", `${scene.id}:${beat.id}:${a.id}×${b.id}`);
        }
      }
      const candidates = onScreen.filter((o) => PICTURE.has(o.source.kind) || o.source.kind === "path" || WRITING.has(o.source.kind));
      const primary = primaryOf(onScreen);
      if (primary && candidates.length > 1) {
        const ranked = dominant(blurred, candidates);
        if (ranked[0].id !== primary) flag("eyeGoesElsewhere", `${scene.id}:${beat.id}: ${ranked[0].id} over ${primary}`);
        else if (ranked[1] && ranked[1].mass > ranked[0].mass * 0.85) flag("twoEqualPrimaries", `${scene.id}:${beat.id}: ${ranked[0].id} ≈ ${ranked[1].id}`);
      }
    });
    if (row.minTextPt < MIN_LABEL_PT) flag("smallText", `${scene.id}:${row.minTextPt.toFixed(1)}pt`);
    if (row.minContrast < 4.5) flag("lowContrast", `${scene.id}:${row.minContrast.toFixed(2)}`);
    row.minTextPt = Number.isFinite(row.minTextPt) ? +row.minTextPt.toFixed(1) : null;
    row.minContrast = Number.isFinite(row.minContrast) ? +row.minContrast.toFixed(2) : null;
    film.scenes.push(row);
  });

  for (let i = 0; i + 2 < patterns.length; i++) {
    if (patterns[i].shape === patterns[i + 1].shape && patterns[i].shape === patterns[i + 2].shape) flag("repeatedPattern", `${patterns[i].id}–${patterns[i + 2].id}`);
  }
  try {
    genericChecks({ result, recorder, flag });
  } catch (error) {
    console.error(`${path.basename(file)}: generic checks failed`, error);
    flag("checksFailed", String(error?.message ?? error));
  }
  if (sheetPath) drawSheet(result, `${sheetPath.replace(/\.png$/, "")}-${path.basename(file, ".json")}.png`);
  return film;
}

function drawSheet(result, target) {
  const width = 216;
  const height = 384;
  const moments = [0.3, 0.65, 0.98];
  const sheet = createCanvas(moments.length * (width + 6), result.slide.scenes.length * (height + 6));
  const out = sheet.getContext("2d");
  out.fillStyle = "#ddd";
  out.fillRect(0, 0, sheet.width, sheet.height);
  const frame = createCanvas(VIEW_W, VIEW_H);
  const ctx = frame.getContext("2d");
  result.slide.scenes.forEach((window, row) => {
    moments.forEach((m, col) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      result.slide.render(ctx, window.start + (window.end - window.start) * m);
      out.drawImage(frame, col * (width + 6), row * (height + 6), width, height);
    });
  });
  fs.writeFileSync(target, sheet.toBuffer("image/png"));
}

// Same-named films from different runs are told apart by their folder.
const nameOf = (file) => (files.filter((other) => path.basename(other) === path.basename(file)).length > 1 ? `${path.basename(path.dirname(file))}/${path.basename(file)}` : path.basename(file));
const films = [];
for (const file of files) {
  const film = await report(file).catch((error) => ({ file, valid: false, scenes: [], flags: {}, errors: [`render failed: ${String(error?.message ?? error).slice(0, 120)}`] }));
  films.push({ ...film, file: nameOf(file) });
}

const kinds = [...new Set(films.flatMap((f) => Object.keys(f.flags ?? {})))].sort();
const totals = Object.fromEntries(kinds.map((k) => [k, films.reduce((sum, f) => sum + (f.flags[k]?.length ?? 0), 0)]));
const scenes = films.flatMap((f) => f.scenes).filter((s) => !s.dropped);
const summary = {
  films: films.length,
  valid: films.filter((f) => f.valid).length,
  scenes: scenes.length,
  wordsBusiestMedian: median(scenes.map((s) => s.busiestWords)),
  minTextPt: Math.min(...scenes.map((s) => s.minTextPt ?? Infinity)),
  minContrast: Math.min(...scenes.map((s) => s.minContrast ?? Infinity)),
  flags: totals,
};
for (const film of films) {
  const counts = Object.entries(film.flags ?? {}).map(([k, v]) => `${k} ${v.length}`).join(", ");
  console.log(`${film.file.padEnd(24)} ${film.valid ? "valid" : "INVALID"}  ${film.scenes.filter((s) => !s.dropped).length}/${film.scenes.length} scenes  ${counts || film.errors?.[0] || "no flags"}`);
}
console.log("SUMMARY", JSON.stringify(summary));
if (outPath) fs.writeFileSync(outPath, JSON.stringify({ summary, films }, null, 1));

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}
