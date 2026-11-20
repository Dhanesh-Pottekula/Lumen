/**
 * The film server, mounted on Vite's dev server so one `npm run dev` runs both the player and the pipeline.
 *
 *   POST /api/films            {brief} → a text/event-stream of film_progress, film_scene and film_done events
 *   GET  /api/films            the saved films, newest first
 *   GET  /api/films/<run>      one saved film (also the resync source when a stream is cut)
 *   DELETE /api/films/<run>    remove one saved film: its folder of pictures, voice and film.json
 *   GET  /api/films/<run>/calls        every model call of the run, without the texts
 *   GET  /api/films/<run>/calls/<n>    one call in full: all that went in and all that came out
 *   GET  /api/films/<run>/plan         the plan as the planner wrote it
 *   GET  /api/films/<run>/log          the run's log: every stage's progress, with its time
 *   GET  /api/settings         the model and effort each stage uses, and every prompt with its default
 *   PUT  /api/settings         save them: {stages, prompts}; a prompt sent empty goes back to its default
 *   GET  /api/provider         which provider films are made with
 *   GET  /film-runs/<run>/...  a run's pictures and voice files
 */
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import type { FilmEvent, FilmFile, ImageObject } from "../src/film/types";
import { makeFilm } from "./film";
import { cartesiaSettings, cartesiaSpeak } from "./providers/cartesia";
import { offlineProvider } from "./providers/offline";
import { openAIProvider, openAISettings } from "./providers/openai";
import type { Provider } from "./providers/types";
import { DEFAULT_PROMPTS, PROMPT_INFO } from "./prompts";
import { CHOICES, STAGES, defaultStages, loadSettings, saveSettings, stagesWith } from "./settings";
import { slug } from "./text";
import { readCalls, summaryOf } from "./trace";
import { forCartesia } from "./voice";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
};

/** KEY=value lines of a .env file; missing file → {}. */
function readEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}

/**
 * The real provider when a key is set; null when there is none, because a film cannot be made without models.
 * FILM_PROVIDER=offline swaps in the canned stand-in, for working on the pipeline itself.
 */
export function chooseProvider(root: string): Provider | null {
  const env = { ...readEnv(path.join(root, ".env")), ...process.env };
  const key = env.OPENAI_API_KEY;
  // FILM_OFFLINE_TICK slows the offline provider down (milliseconds per tick), to watch the player wait for scenes.
  if (env.FILM_PROVIDER === "offline") return offlineProvider({ tick: Number(env.FILM_OFFLINE_TICK) || undefined });
  if (!key) return null;
  // What was chosen in the app goes over the environment's settings, stage by stage.
  const stages = stagesWith(loadSettings(root), env);
  const openai = openAIProvider({
    ...openAISettings(env, key),
    planModel: stages.plan.model,
    planEffort: stages.plan.effort ?? "",
    writeModel: stages.scene.model,
    writeEffort: stages.scene.effort ?? "",
    inspectModel: stages.parts.model,
    inspectEffort: stages.parts.effort ?? "",
    imageModel: stages.picture.model,
    imageQuality: stages.picture.quality ?? "medium",
    voiceModel: stages.voice.model,
    voice: stages.voice.voice ?? "coral",
    hearModel: stages.timing.model,
  });
  if (!env.CARTESIA_API_KEY) return openai;
  // AiRA's own voice when its key is here; the OpenAI voice if a Cartesia call fails.
  const cartesia = cartesiaSettings(env, env.CARTESIA_API_KEY);
  const provider: Provider = {
    ...openai,
    name: "openai+cartesia",
    // The record should say who really spoke: Cartesia, with the OpenAI voice only as its stand-in.
    stages: { ...openai.stages, voice: { model: cartesia.model, settings: { voice: cartesia.voice, "if it fails": `${stages.voice.model} (${stages.voice.voice ?? "coral"})` } } },
    speak: (text, style, stepId) =>
      cartesiaSpeak(cartesia, text).then(
        (audio) => {
          provider.report?.("voice", cartesia.model, { characters: forCartesia(text).length });
          return audio;
        },
        (error) => {
          // Say why, once per clip, so a wrong key or a refused request is not mistaken for the voice of choice.
          console.warn(`Cartesia could not speak ${stepId}; using the OpenAI voice. ${String((error as Error).message ?? error)}`);
          return openai.speak(text, style, stepId);
        },
      ),
  };
  // The OpenAI calls report through their own object: pass each report on to whoever listens to this one.
  openai.report = (stage, model, usage) => provider.report?.(stage, model, usage);
  return provider;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, most = 20_000): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > most) throw new Error("the request is too large");
  }
  return body;
}

export function filmServer(): Plugin {
  let root = process.cwd();
  const runsDir = () => path.join(root, "runs");
  /** Films being made right now. Their folders are still being written to, so they cannot be removed. */
  const making = new Set<string>();

  /**
   * True while a run is being made. A film made by this server is known for certain. One made another way (the
   * command line) says "generating" in its file, and counts as live while its log is still being written to; a
   * run that stopped without finishing goes quiet and is then no longer live.
   */
  const isLive = (film: FilmFile): boolean => {
    if (making.has(film.run)) return true;
    if (film.status !== "generating") return false;
    try {
      return Date.now() - fs.statSync(path.join(runsDir(), film.run, "log.jsonl")).mtimeMs < 240_000;
    } catch {
      return false;
    }
  };

  const savedFilm = (run: string): FilmFile | null => {
    const file = path.join(runsDir(), run, "film.json");
    if (!/^[a-z0-9-]+$/.test(run) || !fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as FilmFile;
    } catch {
      return null;
    }
  };

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname;

    if (route === "/api/provider" && req.method === "GET") return send(res, 200, { name: chooseProvider(root)?.name ?? "none" });

    if (route === "/api/settings" && (req.method === "GET" || req.method === "PUT")) {
      if (req.method === "PUT") {
        let body: unknown;
        try {
          body = JSON.parse(await readBody(req, 2_000_000));
        } catch {
          return send(res, 400, { error: "send JSON: {\"stages\": {...}, \"prompts\": {...}}" });
        }
        saveSettings(root, body);
      }
      const env = { ...readEnv(path.join(root, ".env")), ...process.env };
      const settings = loadSettings(root);
      const defaults = defaultStages(env);
      const inForce = stagesWith(settings, env);
      return send(res, 200, {
        provider: chooseProvider(root)?.name ?? "none",
        stages: STAGES.map((info) => ({
          ...info,
          setting: inForce[info.stage],
          default: defaults[info.stage],
          changed: Boolean(settings.stages[info.stage]),
          // With a Cartesia key the narration is Cartesia's, and it times its own words: say so where it matters.
          ...(env.CARTESIA_API_KEY && info.stage === "voice" ? { note: `Cartesia speaks (${env.FILM_CARTESIA_MODEL ?? "sonic-3.6"}), because a Cartesia key is set. The model below is used only when a Cartesia call fails.` } : {}),
          ...(env.CARTESIA_API_KEY && info.stage === "timing" ? { note: "Cartesia reports each word's time itself, so this stage runs only for a clip the fallback voice spoke." } : {}),
        })),
        choices: CHOICES,
        prompts: PROMPT_INFO.map((info) => ({ ...info, default: DEFAULT_PROMPTS[info.key], text: settings.prompts[info.key] ?? DEFAULT_PROMPTS[info.key], edited: info.key in settings.prompts })),
      });
    }

    if (route === "/api/films" && req.method === "GET") {
      const runs = fs.existsSync(runsDir()) ? fs.readdirSync(runsDir()) : [];
      const films = runs
        .map(savedFilm)
        // The studio's shelf shows films that can be played; the runs page asks for every run, playable or not.
        .filter((film): film is FilmFile => film !== null && (url.searchParams.has("all") || film.scenes.length > 0))
        .map((film) => ({
          run: film.run,
          title: film.header.title,
          brief: film.brief,
          // A run that says it is being made but is not: the server was stopped under it.
          status: film.status === "generating" && !isLive(film) ? (film.scenes.length ? "ready" : "failed") : film.status,
          making: isLive(film),
          cost: film.usage?.cost ?? null,
          scenes: film.scenes.length,
          provider: film.provider,
          // The first picture of the film, as its poster.
          poster: film.scenes.flatMap((scene) => scene.objects).find((object): object is ImageObject => object.kind === "image" && Boolean(object.src))?.src ?? null,
          words: film.scenes.reduce((sum, scene) => sum + scene.narration.split(/\s+/).length, 0),
        }))
        .sort((a, b) => (a.run < b.run ? 1 : -1));
      return send(res, 200, { films });
    }

    if (route === "/api/films" && req.method === "POST") {
      let brief = "";
      try {
        brief = String((JSON.parse(await readBody(req)) as { brief?: unknown }).brief ?? "").trim().slice(0, 4000);
      } catch {
        return send(res, 400, { error: "send JSON: {\"brief\": \"...\"}" });
      }
      if (!brief) return send(res, 400, { error: "the brief is empty" });
      const provider = chooseProvider(root);
      if (!provider) return send(res, 503, { error: "No OPENAI_API_KEY is set, so new films cannot be made. Add it to .env." });

      const run = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${slug(brief).slice(0, 28) || "film"}`;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      // If the viewer leaves, the film is still finished and saved; only the writes to them stop.
      const emit = (event: FilmEvent) => {
        if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      making.add(run);
      try {
        await makeFilm({ provider, prompts: loadSettings(root).prompts, skillsDir: { ...readEnv(path.join(root, ".env")), ...process.env }.FILM_SKILLS_DIR || path.join(root, "skills"), brief, run, dir: path.join(runsDir(), run), base: `/film-runs/${run}`, emit });
      } catch (error) {
        emit({ type: "film_done", run, status: "failed", scenes: 0, error: String((error as Error).message ?? error) });
      } finally {
        making.delete(run);
      }
      res.end();
      return;
    }

    // The record of a run's making. A film made before calls were recorded has an empty list.
    const record = /^\/api\/films\/([a-z0-9-]+)\/(calls|plan|log)(?:\/(\d+))?$/.exec(route);
    if (record && req.method === "GET") {
      const dir = path.join(runsDir(), record[1]);
      if (!fs.existsSync(path.join(dir, "film.json"))) return send(res, 404, { error: "no such film" });
      if (record[2] === "plan") {
        const file = path.join(dir, "plan.json");
        return send(res, 200, { text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "" });
      }
      if (record[2] === "log") {
        const file = path.join(dir, "log.jsonl");
        const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
        // A scene writer's whole reply is in the calls; here it would only bury the progress lines.
        const events = lines.flatMap((line) => {
          try {
            const { reply: _reply, ...event } = JSON.parse(line) as Record<string, unknown>;
            return [event];
          } catch {
            return [];
          }
        });
        return send(res, 200, { events });
      }
      const calls = readCalls(path.join(dir, "calls.jsonl"));
      if (record[3] === undefined) {
        const film = savedFilm(record[1]);
        // How long the run has been going, for a run still being made: its folder's first file marks its start.
        let elapsed: number | null = null;
        if (film && isLive(film)) {
          try {
            elapsed = Math.round((Date.now() - fs.statSync(path.join(dir, "film.json")).birthtimeMs) / 100) / 10;
          } catch {
            elapsed = null;
          }
        }
        return send(res, 200, { calls: calls.map(summaryOf), making: film ? isLive(film) : false, elapsed });
      }
      const call = calls.find((c) => c.n === Number(record[3]));
      return call ? send(res, 200, call) : send(res, 404, { error: "no such call" });
    }

    const one = /^\/api\/films\/([a-z0-9-]+)$/.exec(route);
    if (one && req.method === "GET") {
      const film = savedFilm(one[1]);
      return film ? send(res, 200, film) : send(res, 404, { error: "no such film" });
    }

    if (one && req.method === "DELETE") {
      const run = one[1];
      // The run name is letters, digits and hyphens only (the route's own pattern), so it cannot leave runs/.
      const dir = path.join(runsDir(), run);
      if (!fs.existsSync(path.join(dir, "film.json"))) return send(res, 404, { error: "no such film" });
      if (making.has(run)) return send(res, 409, { error: "this film is still being made" });
      fs.rmSync(dir, { recursive: true, force: true });
      return send(res, 200, { removed: run });
    }

    if (route.startsWith("/film-runs/") && req.method === "GET") {
      const file = path.normalize(path.join(runsDir(), decodeURIComponent(route.slice("/film-runs/".length))));
      const type = TYPES[path.extname(file)];
      if (!file.startsWith(runsDir() + path.sep) || !type || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
      // Size and byte ranges are sent so the browser knows an audio file's length before it has all of it.
      const size = fs.statSync(file).size;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        if (start > end || start >= size) {
          res.statusCode = 416;
          res.setHeader("Content-Range", `bytes */${size}`);
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        res.setHeader("Content-Length", end - start + 1);
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Length", size);
      fs.createReadStream(file).pipe(res);
      return;
    }

    next();
  }

  const mount = (middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }) =>
    middlewares.use((req, res, next) => {
      handle(req, res, next).catch((error) => send(res, 500, { error: String((error as Error).message ?? error) }));
    });

  return {
    name: "lumen-film-server",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}
