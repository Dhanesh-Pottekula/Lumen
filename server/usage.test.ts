import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FilmEvent, FilmUsageEvent } from "../src/film/types";
import { makeFilm } from "./film";
import { sceneContext, sceneStable } from "./prompts";
import { offlineProvider } from "./providers/offline";
import type { Message, Provider } from "./providers/types";
import { costOf, createMeter } from "./usage";

describe("cost", () => {
  it("prices plain, cached and cache-written input and output at their own rates", () => {
    // Sol: $2.00 input, $0.10 cached, $2.50 cache write, $10.00 output, per million tokens.
    const cost = costOf("gpt-6.1-sol", { input: 10_000, cached: 6_000, cacheWrite: 1_000, output: 2_000 });
    expect(cost).toBeCloseTo((3_000 * 2 + 6_000 * 0.1 + 1_000 * 2.5 + 2_000 * 10) / 1_000_000, 10);
  });

  it("shows why cached input matters: the same prompt costs a twentieth when it is read from the cache", () => {
    const fresh = costOf("gpt-6.1-sol", { input: 4_000 }) as number;
    const cached = costOf("gpt-6.1-sol", { input: 4_000, cached: 4_000 }) as number;
    expect(cached / fresh).toBeCloseTo(0.05);
  });

  it("prices a picture by its image tokens and a voice by its length", () => {
    expect(costOf("gpt-image-2", { input: 500, imageInput: 300, output: 4_000, images: 1 })).toBeCloseTo((200 * 5 + 300 * 8 + 4_000 * 30) / 1_000_000, 10);
    expect(costOf("gpt-4o-mini-tts", { seconds: 60 })).toBeCloseTo(0.015);
    expect(costOf("sonic-3.6", { characters: 1_000 })).toBeCloseTo(0.065);
  });

  it("never guesses a price", () => {
    expect(costOf("some-future-model", { input: 1_000_000 })).toBeNull();
  });
});

describe("the meter", () => {
  it("adds calls up by stage and model, in pipeline order, and gives the cache hit rate of the text models", () => {
    const meter = createMeter();
    meter.add("scene", "gpt-6.1-sol", { input: 4_000, cached: 3_000, output: 500, reasoning: 200 });
    meter.add("picture", "gpt-image-2", { input: 400, output: 4_000, images: 1 });
    meter.add("scene", "gpt-6.1-sol", { input: 4_000, cached: 3_600, output: 700 });
    meter.add("plan", "gpt-6.1-sol", { input: 2_000, cached: 0, output: 3_000 });
    meter.add("voice", "mystery-voice", { characters: 300 });
    const usage = meter.summary();
    expect(usage.lines.map((line) => `${line.stage}:${line.calls}`)).toEqual(["plan:1", "scene:2", "picture:1", "voice:1"]);
    expect(usage.lines[1]).toMatchObject({ input: 8_000, cached: 6_600, output: 1_200, reasoning: 200, priced: true });
    // 6,600 cached of 10,000 text input tokens; the picture's tokens are left out of the rate.
    expect(usage.cacheHitRate).toBe(0.66);
    expect(usage.images).toBe(1);
    expect(usage.unpriced).toEqual(["mystery-voice"]);
    expect(usage.cost).toBeGreaterThan(0);
  });
});

describe("caching in the pipeline", () => {
  async function run(provider: Provider) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-usage-"));
    const events: FilmEvent[] = [];
    const film = await makeFilm({ provider, brief: "x", run: "t", dir, base: "/b", emit: (e) => events.push(e) });
    return { film, events, dir };
  }

  it("keeps the stable text first and identical in every scene writer's request", async () => {
    const base = offlineProvider({ tick: 1 });
    const firsts: Message[] = [];
    const provider: Provider = {
      ...base,
      write: (system, messages, stepId) => {
        firsts.push(messages[0]);
        return base.write(system, messages, stepId);
      },
    };
    await run(provider);
    expect(firsts.length).toBeGreaterThanOrEqual(5);
    expect(new Set(firsts.map((m) => m.stable)).size).toBe(1);
    expect(firsts[0].stable).toBe(sceneStable(""));
    // The step's own text never repeats the stable text.
    expect(firsts.every((m) => m.content.startsWith("## This step's pictures"))).toBe(true);
    expect(sceneContext([], {})).not.toContain("visual skills");
  });

  it("reports usage as it grows and saves the total with the film", async () => {
    const { film, events, dir } = await run(offlineProvider({ tick: 1 }));
    const reports = events.filter((e): e is FilmUsageEvent => e.type === "film_usage");
    expect(reports.length).toBeGreaterThan(10);
    const last = reports.at(-1)!.usage;
    expect(film.usage).toEqual(last);
    expect(last.lines.map((line) => line.stage)).toEqual(["plan", "scene", "parts", "picture"]);
    expect(last.images).toBe(4); // the fifth picture fails to draw
    expect(last.cacheHitRate).toBeGreaterThan(0.5);
    expect(last.unpriced).toContain("offline-text");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "film.json"), "utf8")).usage.images).toBe(4);
  });
});
