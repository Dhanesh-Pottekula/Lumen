/**
 * Generate narration audio + real timings for a canvas film via Cartesia — self-contained.
 *
 * Reads narration/<film>.script.json (from `npm run extract-narration`), synthesizes the whole
 * transcript in one Cartesia SSE request with word timestamps, aligns the words back to caption
 * sentences, and writes:
 *   public/narration/<film>.wav          -- narration audio
 *   src/narration/<film>.timings.json    -- real per-scene/caption timings (generated:true)
 *
 * Run (with your key in the environment):
 *   CARTESIA_API_KEY=... npm run generate-narration
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Cartesia } from "@cartesia/cartesia-js";

import {
  alignWordsToCaptions,
  buildSceneTimings,
  wavDurationSeconds,
  wrapWav,
  type FlatCaption,
  type Word,
} from "../src/narration/align";

const FILM = "photosynthesis";
const MODEL_ID = "sonic-3.5";
const VOICE_ID = "30135558-ca1f-4c85-b059-3ac96fdd6a34";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

interface ScriptScene {
  index: number;
  authoredDuration: number;
  captions: string[];
}
interface Script {
  film: string;
  sampleRate: number;
  scenes: ScriptScene[];
}

async function main(): Promise<number> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    console.error("error: set CARTESIA_API_KEY in the environment");
    return 2;
  }

  const script: Script = JSON.parse(readFileSync(resolve(root, "narration", `${FILM}.script.json`), "utf8"));
  const sampleRate = (script.sampleRate ?? 24000) as 8000 | 16000 | 22050 | 24000 | 44100 | 48000;

  const flat: FlatCaption[] = [];
  for (const scene of script.scenes) for (const text of scene.captions) flat.push({ scene: scene.index, text });
  const transcript = flat.map((c) => c.text).join(" ").trim();
  if (!transcript) {
    console.error("error: script has no caption text");
    return 2;
  }

  console.log(`Synthesizing ${flat.length} captions (${transcript.length} chars) via Cartesia…`);
  const client = new Cartesia({ apiKey });
  const stream = await client.tts.generateSSE({
    model_id: MODEL_ID,
    transcript,
    voice: { id: VOICE_ID },
    output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: sampleRate },
    language: "en",
    add_timestamps: true,
  });

  const pcmChunks: Uint8Array[] = [];
  const wordList: Word[] = [];
  for await (const event of stream) {
    if (event.type === "chunk") {
      pcmChunks.push(new Uint8Array(Buffer.from(event.data, "base64")));
    } else if (event.type === "timestamps" && event.word_timestamps) {
      const { words, start, end } = event.word_timestamps;
      for (let i = 0; i < words.length; i++) wordList.push({ word: words[i], start: start[i], end: end[i] });
    } else if (event.type === "error") {
      console.error(`Cartesia error: ${event.error ?? "unknown"}`);
      return 1;
    }
  }

  const pcm = concat(pcmChunks);
  const wav = wrapWav(pcm, sampleRate);
  const duration =
    Math.round(Math.max(wavDurationSeconds(wav.length, sampleRate), wordList.at(-1)?.end ?? 0) * 1000) / 1000;

  const spans = alignWordsToCaptions(wordList, flat);
  const scenes = buildSceneTimings(spans, script.scenes.length, duration);
  const timings = {
    film: FILM,
    audio: `/narration/${FILM}.wav`,
    duration,
    generated: true,
    scenes,
    captions: spans.map((s) => ({ scene: s.scene, at: Math.round(s.start * 1000) / 1000, text: s.text })),
  };

  const wavPath = resolve(root, "public", "narration", `${FILM}.wav`);
  const timingsPath = resolve(root, "src", "narration", `${FILM}.timings.json`);
  mkdirSync(dirname(wavPath), { recursive: true });
  mkdirSync(dirname(timingsPath), { recursive: true });
  writeFileSync(wavPath, wav);
  writeFileSync(timingsPath, JSON.stringify(timings, null, 2) + "\n");

  console.log(`Wrote ${wavPath} (${(wav.length / 1024).toFixed(0)} KB, ${duration.toFixed(1)}s)`);
  console.log(`Wrote ${timingsPath}`);
  for (const sc of scenes) console.log(`  scene ${sc.index}: ${sc.start.toFixed(2)}s → ${sc.end.toFixed(2)}s`);
  return 0;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

main().then((code) => process.exit(code));
