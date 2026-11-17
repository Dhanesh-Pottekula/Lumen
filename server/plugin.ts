/**
 * The film server, mounted on Vite's dev server so one `npm run dev` runs both the player and the pipeline.
 *
 *   POST /api/films            {brief} → a text/event-stream of film_progress, film_scene and film_done events
 *   GET  /api/films            the saved films, newest first
 *   GET  /api/films/<run>      one saved film (also the resync source when a stream is cut)
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
import { slug } from "./text";
import { forCartesia } from "./voice";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".json": "application/json",
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
  const openai = openAIProvider(openAISettings(env, key));
  if (!env.CARTESIA_API_KEY) return openai;
  // AiRA's own voice when its key is here; the OpenAI voice if a Cartesia call fails.
  const cartesia = cartesiaSettings(env, env.CARTESIA_API_KEY);
  const provider: Provider = {
    ...openai,
    name: "openai+cartesia",
    speak: (text, style, stepId) =>
      cartesiaSpeak(cartesia, text).then(
        (audio) => {
          provider.report?.("voice", cartesia.model, { characters: forCartesia(text).length });
          return audio;
        },
        () => openai.speak(text, style, stepId),
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

async function readBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("the request is too large");
  }
  return body;
}

export function filmServer(): Plugin {
  let root = process.cwd();
  const runsDir = () => path.join(root, "runs");

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

    if (route === "/api/films" && req.method === "GET") {
      const runs = fs.existsSync(runsDir()) ? fs.readdirSync(runsDir()) : [];
      const films = runs
        .map(savedFilm)
        .filter((film): film is FilmFile => film !== null && film.scenes.length > 0)
        .map((film) => ({
          run: film.run,
          title: film.header.title,
          brief: film.brief,
          status: film.status,
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
      try {
        await makeFilm({ provider, skillsDir: { ...readEnv(path.join(root, ".env")), ...process.env }.FILM_SKILLS_DIR || path.join(root, "skills"), brief, run, dir: path.join(runsDir(), run), base: `/film-runs/${run}`, emit });
      } catch (error) {
        emit({ type: "film_done", run, status: "failed", scenes: 0, error: String((error as Error).message ?? error) });
      }
      res.end();
      return;
    }

    const one = /^\/api\/films\/([a-z0-9-]+)$/.exec(route);
    if (one && req.method === "GET") {
      const film = savedFilm(one[1]);
      return film ? send(res, 200, film) : send(res, 404, { error: "no such film" });
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
