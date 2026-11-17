/**
 * Usage and cost: what every model call of a film consumed, and an estimate of what it cost.
 *
 * Counts come straight from each provider's response. Costs are estimates from the public list prices below,
 * never an invoice: they ignore tax, discounts and free allowances. A model with no price here is counted and
 * shown as unpriced, never guessed.
 */
import type { FilmUsage, UsageLine, UsageStage } from "../src/film/types";

/** What one call reports. Token counts are inclusive: `input` contains `cached` and `cacheWrite`. */
export interface CallUsage {
  input?: number;
  cached?: number;
  cacheWrite?: number;
  output?: number;
  reasoning?: number;
  /** Image models: the part of `input` that was image tokens (a reference picture). */
  imageInput?: number;
  images?: number;
  characters?: number;
  seconds?: number;
}

interface Rate {
  /** US dollars per million tokens. */
  input?: number;
  cached?: number;
  cacheWrite?: number;
  output?: number;
  imageInput?: number;
  /** US dollars per unit. */
  perCharacter?: number;
  perSecond?: number;
  source: string;
  /** True when the figure comes from secondary sources or is a per-minute approximation. */
  approximate?: boolean;
}

const OPENAI = "https://openai.com/api/pricing/";

/**
 * List prices. The two text models are the rates AiRA's usage ledger records as verified. The image, voice
 * and transcription rates were read from public pricing summaries on 2026-11-17 and are marked approximate.
 */
export const RATES: Record<string, Rate> = {
  "gpt-6.1-sol": { input: 2.0, cached: 0.1, cacheWrite: 2.5, output: 10.0, source: OPENAI },
  "gpt-6-luna": { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5, source: OPENAI },
  "gpt-5.6-terra": { input: 2.0, cached: 0.2, cacheWrite: 2.5, output: 12.0, source: OPENAI },
  "gpt-image-2": { input: 5.0, imageInput: 8.0, output: 30.0, source: OPENAI, approximate: true },
  // The speech endpoint returns no token counts, so the voice is priced by the minute of audio it made.
  "gpt-4o-mini-tts": { perSecond: 0.015 / 60, source: OPENAI, approximate: true },
  "whisper-1": { perSecond: 0.006 / 60, source: OPENAI, approximate: true },
  "sonic-3.6": { perCharacter: 0.000065, source: "https://docs.cartesia.ai/pricing", approximate: true },
};

/** The estimated cost of one call in US dollars, or null when the model has no price here. */
export function costOf(model: string, usage: CallUsage): number | null {
  const rate = RATES[model];
  if (!rate) return null;
  const million = 1_000_000;
  let cost = 0;
  const input = usage.input ?? 0;
  const cached = Math.min(usage.cached ?? 0, input);
  const written = Math.min(usage.cacheWrite ?? 0, input - cached);
  const imageInput = Math.min(usage.imageInput ?? 0, input - cached - written);
  const plain = input - cached - written - imageInput;
  cost += (plain * (rate.input ?? 0)) / million;
  cost += (imageInput * (rate.imageInput ?? rate.input ?? 0)) / million;
  cost += (cached * (rate.cached ?? rate.input ?? 0)) / million;
  cost += (written * (rate.cacheWrite ?? rate.input ?? 0)) / million;
  cost += ((usage.output ?? 0) * (rate.output ?? 0)) / million;
  cost += (usage.characters ?? 0) * (rate.perCharacter ?? 0);
  cost += (usage.seconds ?? 0) * (rate.perSecond ?? 0);
  return cost;
}

const STAGE_ORDER: UsageStage[] = ["plan", "warm-up", "scene", "parts", "picture", "voice", "timing"];

/** Adds up every call of one film, by stage and model. */
export function createMeter() {
  const lines = new Map<string, UsageLine>();
  return {
    add(stage: UsageStage, model: string, usage: CallUsage) {
      const key = `${stage}|${model}`;
      const line =
        lines.get(key) ??
        ({ stage, model, calls: 0, input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0, images: 0, characters: 0, seconds: 0, cost: 0, priced: model in RATES, approximate: Boolean(RATES[model]?.approximate) } satisfies UsageLine);
      line.calls += 1;
      line.input += usage.input ?? 0;
      line.cached += usage.cached ?? 0;
      line.cacheWrite += usage.cacheWrite ?? 0;
      line.output += usage.output ?? 0;
      line.reasoning += usage.reasoning ?? 0;
      line.images += usage.images ?? 0;
      line.characters += usage.characters ?? 0;
      line.seconds += usage.seconds ?? 0;
      line.cost += costOf(model, usage) ?? 0;
      lines.set(key, line);
    },
    /** The film's usage so far. */
    summary(): FilmUsage {
      const all = [...lines.values()].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.model.localeCompare(b.model));
      // The cache hit rate is over planning and scene writing: the calls that repeat a long fixed prompt. A picture,
      // a voice clip and a part-finding call (whose input is one new picture each time) have nothing to reuse.
      const text = all.filter((line) => line.stage === "plan" || line.stage === "scene" || line.stage === "warm-up");
      const input = text.reduce((sum, line) => sum + line.input, 0);
      const cached = text.reduce((sum, line) => sum + line.cached, 0);
      const round = (n: number) => Math.round(n * 10000) / 10000;
      return {
        lines: all.map((line) => ({ ...line, seconds: Math.round(line.seconds * 10) / 10, cost: round(line.cost) })),
        input: all.reduce((sum, line) => sum + line.input, 0),
        cached: all.reduce((sum, line) => sum + line.cached, 0),
        output: all.reduce((sum, line) => sum + line.output, 0),
        images: all.reduce((sum, line) => sum + line.images, 0),
        cacheHitRate: input > 0 ? Math.round((cached / input) * 1000) / 1000 : 0,
        cost: round(all.reduce((sum, line) => sum + line.cost, 0)),
        unpriced: all.filter((line) => !line.priced).map((line) => line.model),
      };
    },
  };
}

export type Meter = ReturnType<typeof createMeter>;
