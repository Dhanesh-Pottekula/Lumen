/**
 * What a person has chosen for this copy of Lumen: the model and reasoning effort each stage uses, and any prompt
 * they have rewritten. Kept in one small JSON file, `.lumen/settings.json`, beside the runs. Nothing here is
 * needed for a film to be made: with no file, every stage uses its default and every prompt is the one in
 * `prompts.ts`.
 */
import fs from "node:fs";
import path from "node:path";
import type { SettingStage, StageSetting, StageSettings } from "../src/film/types";
import { DEFAULT_PROMPTS, PROMPT_INFO, type Prompts } from "./prompts";
import { RATES } from "./usage";

export interface Settings {
  /** Only what differs from the defaults. */
  stages: Partial<Record<SettingStage, Partial<StageSetting>>>;
  /** Only the prompts that were rewritten. */
  prompts: Partial<Prompts>;
}

export const STAGES: { stage: SettingStage; title: string; about: string; has: ("effort" | "quality" | "voice")[] }[] = [
  { stage: "plan", title: "Planner", about: "Writes the whole plan: narration, picture briefs and directions. One call a film, and the one that matters most.", has: ["effort"] },
  { stage: "picture", title: "Illustrator", about: "Draws every background and cut-out. Most of a film's cost and time.", has: ["quality"] },
  { stage: "parts", title: "Part finder", about: "Looks at each background and boxes its named parts. A small, quick call per picture.", has: ["effort"] },
  { stage: "scene", title: "Scene writer", about: "Directs each step from its pictures. One call a step, sometimes a second to correct it.", has: ["effort"] },
  { stage: "voice", title: "Voice", about: "Speaks each step's narration.", has: ["voice"] },
  { stage: "timing", title: "Listener", about: "Hears each clip back to find when every word is said, so the screen can keep time.", has: [] },
];

/** What a person can pick from. A model not listed can still be typed in. */
export const CHOICES = {
  efforts: ["", "minimal", "low", "medium", "high"],
  qualities: ["low", "medium", "high"],
  /** Models this copy has a price for, so their cost can be shown. */
  priced: Object.keys(RATES),
};

/** Every stage's setting when nothing has been chosen: the environment's, else the code's own. */
export function defaultStages(env: Record<string, string | undefined>): StageSettings {
  return {
    plan: { model: env.FILM_PLAN_MODEL ?? "gpt-6-luna", effort: env.FILM_PLAN_EFFORT ?? "medium" },
    scene: { model: env.FILM_WRITE_MODEL ?? "gpt-6-luna", effort: env.FILM_WRITE_EFFORT ?? "medium" },
    parts: { model: env.FILM_INSPECT_MODEL ?? "gpt-6-luna", effort: env.FILM_INSPECT_EFFORT ?? "low" },
    picture: { model: env.FILM_IMAGE_MODEL ?? "gpt-image-2", quality: env.FILM_IMAGE_QUALITY ?? "medium" },
    voice: { model: env.FILM_TTS_MODEL ?? "gpt-4o-mini-tts", voice: env.FILM_TTS_VOICE ?? "coral" },
    timing: { model: env.FILM_HEAR_MODEL ?? "whisper-1" },
  };
}

const fileOf = (root: string) => path.join(root, ".lumen", "settings.json");
const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : undefined);

/** Keep only what a settings file may hold, so a hand-edited or half-written file cannot break a film. */
export function tidy(raw: unknown): Settings {
  const out: Settings = { stages: {}, prompts: {} };
  const source = (raw && typeof raw === "object" ? raw : {}) as { stages?: Record<string, Record<string, unknown>>; prompts?: Record<string, unknown> };
  for (const { stage, has } of STAGES) {
    const given = source.stages?.[stage];
    if (!given || typeof given !== "object") continue;
    const kept: Partial<StageSetting> = {};
    const model = clean(given.model, 80);
    if (model) kept.model = model;
    // An effort of "" is a real choice: leave it to the model. So it is kept when it is given at all.
    if (has.includes("effort") && typeof given.effort === "string" && CHOICES.efforts.includes(given.effort.trim())) kept.effort = given.effort.trim();
    if (has.includes("quality") && typeof given.quality === "string" && CHOICES.qualities.includes(given.quality.trim())) kept.quality = given.quality.trim();
    const voice = has.includes("voice") ? clean(given.voice, 80) : undefined;
    if (voice) kept.voice = voice;
    if (Object.keys(kept).length) out.stages[stage] = kept;
  }
  for (const { key } of PROMPT_INFO) {
    const text = source.prompts?.[key];
    // A prompt rewritten to the default, or to nothing, is not a rewrite.
    if (typeof text === "string" && text.trim() && text.trim() !== DEFAULT_PROMPTS[key].trim()) out.prompts[key] = text.slice(0, 200_000);
  }
  return out;
}

export function loadSettings(root: string): Settings {
  try {
    return tidy(JSON.parse(fs.readFileSync(fileOf(root), "utf8")));
  } catch {
    return { stages: {}, prompts: {} };
  }
}

export function saveSettings(root: string, settings: unknown): Settings {
  const kept = tidy(settings);
  fs.mkdirSync(path.dirname(fileOf(root)), { recursive: true });
  fs.writeFileSync(fileOf(root), JSON.stringify(kept, null, 2) + "\n");
  return kept;
}

/** Each stage's setting in force: what was chosen, over its default. */
export function stagesWith(settings: Settings, env: Record<string, string | undefined>): StageSettings {
  const base = defaultStages(env);
  for (const { stage } of STAGES) base[stage] = { ...base[stage], ...settings.stages[stage] };
  return base;
}
