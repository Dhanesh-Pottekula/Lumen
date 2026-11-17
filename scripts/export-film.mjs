// Export a saved film to an MP4 with its voice, and optionally a short silent GIF preview.
//
//   npm run dev                                  (in another terminal: the film is rendered by the app itself)
//   npm run export -- <run> [--out docs/films/name.mp4] [--gif 12:8] [--width 960] [--url http://localhost:5199]
//
// A film is a pure function of time, so the video is that function sampled 24 times a second in a headless
// browser. The sound track is each scene's voice file, padded to the scene's length, joined end to end.
// Needs ffmpeg on PATH and a Chrome: set CHROME_PATH, or one is looked for in the usual places.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const run = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
if (!run) {
  console.error("usage: npm run export -- <run> [--out file.mp4] [--gif start:seconds] [--width 960] [--url http://localhost:5199]");
  process.exit(1);
}
const url = flag("url", "http://localhost:5199");
const width = Number(flag("width", "960"));
const out = path.resolve(flag("out", `docs/films/${run}.mp4`));
const gif = flag("gif", null);
const FPS = 24;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function findChrome() {
  const cache = path.join(os.homedir(), ".cache/hyperframes/chrome/chrome-headless-shell");
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ...(fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse().map((v) => path.join(cache, v, "chrome-headless-shell-mac-arm64/chrome-headless-shell")) : []),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  const found = candidates.find((file) => file && fs.existsSync(file));
  if (!found) throw new Error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
  return found;
}

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.lumenExport), { timeout: 30_000 });
  const info = await page.evaluate((id) => window.lumenExport.open(id), run);
  const frames = Math.ceil(info.duration * FPS);
  console.log(`${info.title}: ${info.scenes.length} scenes, ${info.duration.toFixed(1)} s, ${frames} frames`);

  // ── Sound: each scene's voice, padded with silence to the scene's own length ──────────────────────
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-export-"));
  const sound = path.join(work, "sound.m4a");
  const inputs = [];
  const filters = [];
  info.scenes.forEach((scene, i) => {
    const length = (scene.end - scene.start).toFixed(3);
    const file = scene.audio ? path.join(root, "runs", decodeURIComponent(new URL(scene.audio, url).pathname.replace(/^\/film-runs\//, ""))) : null;
    if (file && fs.existsSync(file)) inputs.push("-i", file);
    else inputs.push("-f", "lavfi", "-t", length, "-i", "anullsrc=r=44100:cl=mono");
    filters.push(`[${i}:a]aresample=44100,aformat=channel_layouts=mono,apad=whole_dur=${length},atrim=0:${length}[a${i}]`);
  });
  filters.push(`${info.scenes.map((_, i) => `[a${i}]`).join("")}concat=n=${info.scenes.length}:v=0:a=1[out]`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:a", "aac", "-b:a", "96k", sound]);

  // ── Picture: frames piped straight into the encoder, then joined with the sound ───────────────────
  const encoder = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-i", sound, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "27", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", "-shortest", out],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const finished = new Promise((resolve, reject) => encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  for (let i = 0; i < frames; i++) {
    const data = await page.evaluate((t, w) => window.lumenExport.frame(t, w), i / FPS, width);
    if (!encoder.stdin.write(Buffer.from(data.slice(data.indexOf(",") + 1), "base64"))) await new Promise((r) => encoder.stdin.once("drain", r));
    if (i % (FPS * 20) === 0) console.log(`  ${Math.round((i / frames) * 100)}%`);
  }
  encoder.stdin.end();
  await finished;
  console.log(`wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);

  if (gif) {
    const [from, seconds] = gif.split(":");
    const file = out.replace(/\.mp4$/, ".gif");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", from, "-t", seconds, "-i", out, "-vf", "fps=10,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4", file]);
    console.log(`wrote ${path.relative(root, file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
  }
  fs.rmSync(work, { recursive: true, force: true });
} finally {
  await browser.close();
}
