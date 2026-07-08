/**
 * Extract the photosynthesis film's narration into JSON artifacts.
 *
 * Produces two files:
 *  - narration/photosynthesis.script.json   — the seam the Python generator reads: per-scene
 *    authored duration + ordered caption sentences (Python can't import TS).
 *  - src/narration/photosynthesis.timings.json — a BOOTSTRAP timings file derived from the
 *    authored times (generated:false), so the app builds and the composer's timings mode is
 *    live before real Cartesia audio exists. `npm run generate-narration` (aira-api) later
 *    overwrites this with real audio-derived timings (generated:true).
 *
 * Run: npx tsx scripts/extract-narration.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { photoCalvinCycleSlide } from "../src/slides/photoCalvinCycle";
import { photoChloroplastSlide } from "../src/slides/photoChloroplast";
import { photoEquationSlide } from "../src/slides/photoEquation";
import { photoFinaleSlide } from "../src/slides/photoFinale";
import { photoIntroSlide } from "../src/slides/photoIntro";
import { photoLeafCellSlide } from "../src/slides/photoLeafCell";
import { photoLightReactionsSlide } from "../src/slides/photoLightReactions";
import type { CanvasSlideDefinition } from "../src/slides/types";

const FILM = "photosynthesis";
const SAMPLE_RATE = 24000;

const scenes: CanvasSlideDefinition[] = [
  photoIntroSlide,
  photoLeafCellSlide,
  photoChloroplastSlide,
  photoLightReactionsSlide,
  photoCalvinCycleSlide,
  photoEquationSlide,
  photoFinaleSlide,
];

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// 1) The script JSON for the generator.
const script = {
  film: FILM,
  sampleRate: SAMPLE_RATE,
  scenes: scenes.map((s, index) => ({
    index,
    authoredDuration: s.duration,
    captions: (s.captions ?? []).slice().sort((a, b) => a.at - b.at).map((c) => c.text),
  })),
};
const scriptPath = resolve(root, "narration", `${FILM}.script.json`);
mkdirSync(dirname(scriptPath), { recursive: true });
writeFileSync(scriptPath, JSON.stringify(script, null, 2) + "\n");

// 2) Bootstrap timings from authored times: contiguous scene spans = authored durations.
const sceneTimings: { index: number; start: number; end: number }[] = [];
const captionTimings: { scene: number; at: number; text: string }[] = [];
let cursor = 0;
scenes.forEach((s, index) => {
  const start = cursor;
  const end = start + s.duration;
  sceneTimings.push({ index, start, end });
  for (const c of (s.captions ?? []).slice().sort((a, b) => a.at - b.at)) {
    captionTimings.push({ scene: index, at: start + c.at, text: c.text });
  }
  cursor = end;
});

const timings = {
  film: FILM,
  audio: `/narration/${FILM}.wav`,
  duration: cursor,
  generated: false,
  scenes: sceneTimings,
  captions: captionTimings,
};
const timingsPath = resolve(root, "src", "narration", `${FILM}.timings.json`);
mkdirSync(dirname(timingsPath), { recursive: true });
writeFileSync(timingsPath, JSON.stringify(timings, null, 2) + "\n");

console.log(`Wrote ${scriptPath}`);
console.log(`Wrote ${timingsPath} (bootstrap, generated:false, duration ${cursor}s)`);
