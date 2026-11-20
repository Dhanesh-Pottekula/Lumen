// Film metrics: numbers read off saved films, for comparing one set of prompts with another.
//
//   npm run metrics                 every film in runs/
//   npm run metrics -- <run> ...    only those runs (a folder name in runs/, or a path)
//   npm run metrics -- --json       the full numbers as JSON instead of the table
//
// It makes no model call and costs nothing: it only reads film.json, plan.json and log.jsonl.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const named = args.filter((a) => !a.startsWith("--"));
const runsDir = path.join(root, "runs");

const folders = (named.length ? named : fs.existsSync(runsDir) ? fs.readdirSync(runsDir).sort() : [])
  .map((name) => (fs.existsSync(name) && fs.statSync(name).isDirectory() ? path.resolve(name) : path.join(runsDir, name)))
  .filter((dir) => fs.existsSync(path.join(dir, "film.json")));
if (folders.length === 0) {
  console.error("No films found. Give a run folder, or make a film first.");
  process.exit(1);
}

// The metrics are TypeScript and share the engine's own timeline code, so Vite loads them (no build, no config).
const vite = await createServer({ root, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const read = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
let rows;
try {
  const { filmMetrics } = await vite.ssrLoadModule("/server/metrics.ts");
  rows = folders.map((dir) => {
    const logFile = path.join(dir, "log.jsonl");
    const log = fs.existsSync(logFile)
      ? fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return {}; } })
      : [];
    return filmMetrics(read(path.join(dir, "film.json")), read(path.join(dir, "plan.json")), log);
  });
} finally {
  await vite.close();
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

const list = (items) => (items.length ? `${items.length}: ${items.map((i) => JSON.stringify(i)).join(", ")}` : "0");
const tally = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
for (const m of rows) {
  console.log(`\n${m.run}`);
  const lines = [
    ["prompts", `${m.prompts}${m.skills.length ? `  skills: ${m.skills.join(", ")}` : ""}`],
    ["length", `${m.seconds} s, ${m.words} words, ${m.scenes} of ${m.steps} steps on screen`],
    ["pictures", `${m.pictures}, one every ${m.secondsPerPicture} s`],
    ["on screen", `${m.showings} showings, ${m.secondsPerShowing} s each, ${m.sentencesPerShowing} sentences per showing`],
    ["cut-outs", `${m.cutouts} used, ${m.moves} moves, ${m.secondsMoving} s with something changing`],
    ["changes", `${m.changes}, one every ${m.secondsPerChange} s`],
    ["longest still", `${m.longestStill.seconds} s (in ${m.longestStill.scene})`],
    ["idle cameras", String(m.idleCameras)],
    ["text not spoken", list(m.textsNotSpoken)],
    ["text with new words", list(m.textsWithNewWords)],
    ["text used as drawing", list(m.textsDrawn)],
    ["unknown voice marks", list(m.unknownMarks)],
    ["parts not found", list(m.partsNotFound)],
    ["dropped", `${m.beatsDropped} beats, ${m.scenesDropped} scenes, ${m.retries} retries logged`],
    ["time", m.firstSceneAt === null ? "not in the log" : `first scene at ${m.firstSceneAt} s, last at ${m.doneAt} s`],
    ["actions", tally(m.actions)],
    ["objects", tally(m.objects)],
    ["cost", m.cost === null ? "not recorded" : `$${m.cost}`],
  ];
  for (const [name, value] of lines) console.log(`  ${name.padEnd(20)} ${value}`);
}
