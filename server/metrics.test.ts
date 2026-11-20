import { describe, expect, it } from "vitest";
import type { FilmFile } from "../src/film/types";
import { makeFilm, promptVersion } from "./film";
import { filmMetrics } from "./metrics";
import { readEvents, wavOf } from "./providers/cartesia";
import { unknownMarks } from "./voice";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_PROMPTS, drawingPrompt, promptsWith } from "./prompts";
import { offlineProvider } from "./providers/offline";
import type { Provider } from "./providers/types";
import { defaultStages, loadSettings, saveSettings, stagesWith, tidy } from "./settings";
import { createTracer, noteExchange, readCalls, readableBody, scrubbed, summaryOf } from "./trace";

const film: FilmFile = {
  run: "t",
  brief: "b",
  provider: "offline",
  status: "ready",
  header: { version: "1", title: "t", look: "movie" },
  scenes: [
    {
      id: "s1",
      narration: "The lamp is on. The room is warm tonight and nothing else happens for a long while here.",
      objects: [
        { id: "room", kind: "image", hotspots: { lamp: [0.1, 0.1, 0.2, 0.2] } },
        { id: "said", kind: "text", text: "the lamp" },
        { id: "invented", kind: "text", text: "Thermal comfort" },
        { id: "line", kind: "text", text: "┆\n┆\n┆" },
      ],
      beats: [
        { id: "open", actions: [{ do: "camera", target: "room", shot: "overview", movement: "cut" }] },
        { id: "again", say: "The lamp", actions: [{ do: "camera", target: "room", shot: "overview", movement: "cut" }] },
        { id: "words", say: "is on", actions: [{ do: "show", targets: ["said"] }] },
      ],
    },
  ],
};

describe("film metrics", () => {
  const plan = {
    pictures: [{ id: "room", parts: [{ id: "lamp" }, { id: "window" }] }],
    steps: [{ id: "s1", narration: "[curious] The lamp is on. [somber] The room is warm.", screen: ["room"] }],
  };
  const log = [
    { t: 5, stage: "scene", id: "s1", problems: ["beats[2]: has no action the film can play and is dropped", "something else"] },
    { t: 6, stage: "scene", id: "s1", attempt: "retry", problems: [], kept: true },
    { t: 9, stage: "scene", status: "published", id: "s1" },
  ];
  const m = filmMetrics(film, plan, log);

  it("counts a camera that aims where it already is as idle, not as a change", () => {
    expect(m.idleCameras).toBe(1);
    expect(m.changes).toBe(1);
  });

  it("finds the longest time nothing changes", () => {
    expect(m.longestStill.scene).toBe("s1");
    expect(m.longestStill.seconds).toBeGreaterThan(4);
  });

  it("separates words the narration says from words it does not, and from drawing made of characters", () => {
    expect(m.textsNotSpoken).toEqual(["Thermal comfort"]);
    expect(m.textsWithNewWords).toEqual(["Thermal comfort"]);
    expect(m.textsDrawn).toHaveLength(1);
  });

  it("reports parts that were planned but not found, and marks the voice does not know", () => {
    expect(m.partsNotFound).toEqual(["room.window"]);
    expect(m.unknownMarks).toEqual(["somber"]);
    expect(unknownMarks("[sad, slowly] It ended. [softly] Quietly.")).toEqual([]);
  });

  it("reads dropped beats, retries and timings from the log", () => {
    expect(m.beatsDropped).toBe(1);
    expect(m.retries).toBe(1);
    expect(m.firstSceneAt).toBe(9);
  });

  it("works on a film with no plan, no log and no record of its prompts", () => {
    const bare = filmMetrics(film);
    expect(bare.prompts).toBe("unknown");
    expect(bare.pictures).toBe(1);
    expect(bare.firstSceneAt).toBeNull();
  });
});

describe("the prompt fingerprint", () => {
  it("is stable from call to call", () => {
    expect(promptVersion()).toMatch(/^[0-9a-f]{12}$/);
    expect(promptVersion()).toBe(promptVersion());
  });
});

describe("Cartesia's voice", () => {
  it("joins the sound and reads each word's time from the stream", () => {
    const sound = (bytes: number[]) => Buffer.from(bytes).toString("base64");
    const { pcm, words } = readEvents([
      { type: "chunk", data: sound([1, 2]) },
      { type: "timestamps", word_timestamps: { words: ["You're", "falling."], start: [0.1, 0.3], end: [0.3, 0.7] } },
      { type: "chunk", data: sound([3, 4]) },
      { type: "done" },
    ]);
    expect([...pcm]).toEqual([1, 2, 3, 4]);
    expect(words).toEqual([
      { word: "You're", start: 0.1, end: 0.3 },
      { word: "falling.", start: 0.3, end: 0.7 },
    ]);
  });

  it("fails on an error event, so the other voice can take over", () => {
    expect(() => readEvents([{ type: "error", title: "bad voice" }])).toThrow("bad voice");
  });

  it("wraps raw sound as a WAV file of the right length", () => {
    const wav = wavOf(new Uint8Array(48_000), 24_000);
    expect(wav.length).toBe(48_044);
    expect(String.fromCharCode(...wav.slice(0, 4), ...wav.slice(8, 12))).toBe("RIFFWAVE");
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(24_000);
  });
});

// ── The record of a film's making, the settings, and the prompts a person may change ────────────────
describe("the record of a film's making", () => {
  async function made(prompts?: Partial<typeof DEFAULT_PROMPTS>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-trace-"));
    const film = await makeFilm({ provider: offlineProvider({ tick: 1 }), brief: "What if the Moon vanished tonight?", run: "t", dir, base: "/film-runs/t", emit: () => {}, prompts });
    return { film, dir, calls: readCalls(path.join(dir, "calls.jsonl")) };
  }

  it("keeps every model call with all that went in and all that came out", async () => {
    const { calls } = await made();
    const stages = new Set(calls.map((c) => c.stage));
    for (const stage of ["plan", "picture", "parts", "scene"]) expect(stages.has(stage as never)).toBe(true);
    // Numbered from 1 with none missing, and none left as still running.
    expect(calls.map((c) => c.n)).toEqual(calls.map((_, i) => i + 1));
    expect(calls.filter((c) => c.status === "running")).toEqual([]);

    const plan = calls.find((c) => c.stage === "plan")!;
    expect(plan.input[0]).toEqual({ kind: "text", title: "System prompt", text: DEFAULT_PROMPTS.plan });
    expect(plan.input[1].text).toBe("What if the Moon vanished tonight?");
    // The whole plan is there, character for character.
    expect(JSON.parse(plan.output[0].text!).steps.length).toBeGreaterThan(0);
    expect(plan.usage.input).toBeGreaterThan(0);
    expect(plan.model).toBe("offline-text");

    const scene = calls.find((c) => c.stage === "scene")!;
    expect(scene.id).toMatch(/^s\d+$/);
    expect(scene.input[0].text).toBe(DEFAULT_PROMPTS.scene);
    expect(scene.input.some((part) => part.title === "The request" && part.text!.includes("## This step"))).toBe(true);
    expect(JSON.parse(scene.output[0].text!).beats).toBeDefined();

    const drawn = calls.find((c) => c.stage === "picture" && c.status === "ok")!;
    expect(drawn.input[0].title).toBe("Drawing prompt");
    expect(drawn.output[0]).toMatchObject({ kind: "image", src: `/film-runs/t/pictures/${drawn.id}.svg` });
  });

  it("records a call that fails, with why", async () => {
    const { calls } = await made();
    // The offline provider fails one drawing on purpose.
    const failed = calls.find((c) => c.status === "failed")!;
    expect(failed.stage).toBe("picture");
    expect(failed.error).toContain("failed");
    expect(failed.ms).toBeGreaterThanOrEqual(0);
  });

  it("says what a later call was sent, by pointing at the saved picture", async () => {
    const { calls } = await made();
    const parts = calls.find((c) => c.stage === "parts")!;
    const picture = parts.input.find((part) => part.kind === "image")!;
    expect(picture.src).toBe(`/film-runs/t/pictures/${parts.id}.svg`);
  });

  it("gives a list without the texts, and the same numbers", async () => {
    const { calls } = await made();
    const summary = summaryOf(calls[0]);
    expect(summary).not.toHaveProperty("input");
    expect(summary).not.toHaveProperty("exchanges");
    expect(summary.usage).toEqual(calls[0].usage);
  });

  it("attaches each request and each count to the call it happened inside, with many running at once", async () => {
    const tracer = createTracer({ started: Date.now(), describe: () => ({ model: "m" }), outputSrc: () => undefined });
    const slow = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const base: Provider = {
      ...offlineProvider({}),
      async write(_system, _messages, stepId) {
        await slow(stepId === "a" ? 20 : 5);
        noteExchange({ path: `/x/${stepId}`, request: { id: stepId }, status: 200, response: "ok", ms: 1 });
        tracer.usage("gpt-6.1-sol", { input: stepId === "a" ? 100 : 7, output: 1 });
        return stepId;
      },
    };
    const provider = tracer.wrap(base);
    await Promise.all([provider.write("s", [{ role: "user", content: "a" }], "a"), provider.write("s", [{ role: "user", content: "b" }], "b")]);
    const [a, b] = tracer.calls();
    expect([a.id, a.usage.input, a.exchanges[0].path]).toEqual(["a", 100, "/x/a"]);
    expect([b.id, b.usage.input, b.exchanges[0].path]).toEqual(["b", 7, "/x/b"]);
    expect(a.cost).toBeGreaterThan(0);
  });

  it("leaves picture and sound data out of a kept request, and keeps every word of the text", () => {
    const long = "A".repeat(5000);
    const kept = scrubbed({ instructions: "Plan the film. ".repeat(400), image_url: `data:image/png;base64,${long}`, b64_json: long, n: 1 }) as Record<string, unknown>;
    expect(kept.instructions).toBe("Plan the film. ".repeat(400));
    expect(kept.image_url).toMatch(/^<image\/png, .* characters, left out>$/);
    expect(kept.b64_json).toMatch(/left out>$/);
    expect(readableBody(JSON.stringify({ a: 1 }))).toEqual({ a: 1 });
    const form = new FormData();
    form.set("prompt", "draw");
    form.append("image[]", new Blob([new Uint8Array(10)], { type: "image/png" }), "reference.png");
    expect(readableBody(form)).toEqual({ prompt: "draw", "image[]": "<file reference.png, image/png, 10 bytes, left out>" });
  });
});

describe("prompts a person rewrites", () => {
  it("uses a rewritten prompt in place of its default, and the default for every other", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-trace-"));
    const film = await makeFilm({ provider: offlineProvider({ tick: 1 }), brief: "b", run: "t", dir, base: "/film-runs/t", emit: () => {}, prompts: { scene: "MY OWN SCENE PROMPT", look: "A charcoal sketch." } });
    const calls = readCalls(path.join(dir, "calls.jsonl"));
    expect(calls.find((c) => c.stage === "scene")!.input[0].text).toBe("MY OWN SCENE PROMPT");
    expect(calls.find((c) => c.stage === "plan")!.input[0].text).toBe(DEFAULT_PROMPTS.plan);
    expect(calls.find((c) => c.stage === "picture")!.input[0].text!.startsWith("A charcoal sketch.")).toBe(true);
    // The film says which prompts were its maker's own, and its fingerprint differs from a default film's.
    expect(film.made!.edited).toEqual(["look", "scene"]);
    expect(film.made!.prompts).not.toBe(promptVersion());
  });

  it("treats an empty rewrite as no rewrite", () => {
    expect(promptsWith({ plan: "   " }).plan).toBe(DEFAULT_PROMPTS.plan);
    expect(promptsWith(undefined)).toEqual(DEFAULT_PROMPTS);
    expect(drawingPrompt("A room.", "none", "lead")).toContain("One frame from a 2D animated explainer film");
  });
});

describe("settings a person chooses", () => {
  const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "lumen-settings-"));

  it("has every stage's default when nothing was chosen, and reads the environment", () => {
    expect(loadSettings(root())).toEqual({ stages: {}, prompts: {} });
    expect(defaultStages({}).plan).toEqual({ model: "gpt-6.1-sol", effort: "medium" });
    expect(defaultStages({ FILM_PLAN_MODEL: "x", FILM_PLAN_EFFORT: "high" }).plan).toEqual({ model: "x", effort: "high" });
  });

  it("saves one stage's choice without touching the others", () => {
    const at = root();
    saveSettings(at, { stages: { scene: { model: "gpt-6-luna", effort: "high" } } });
    const inForce = stagesWith(loadSettings(at), {});
    expect(inForce.scene).toEqual({ model: "gpt-6-luna", effort: "high" });
    expect(inForce.plan).toEqual({ model: "gpt-6.1-sol", effort: "medium" });
  });

  it("keeps an effort left to the model, and drops what a stage does not have", () => {
    const kept = tidy({ stages: { plan: { model: " m ", effort: "", quality: "high" }, picture: { quality: "high", effort: "low" }, timing: { voice: "x" }, nonsense: { model: "y" } } });
    expect(kept.stages).toEqual({ plan: { model: "m", effort: "" }, picture: { quality: "high" } });
    expect(tidy({ stages: { plan: { effort: "enormous" } } }).stages).toEqual({});
  });

  it("keeps a rewritten prompt, and forgets one put back to its default or emptied", () => {
    const at = root();
    saveSettings(at, { prompts: { plan: "Mine.", scene: DEFAULT_PROMPTS.scene, voice: "" } });
    expect(loadSettings(at).prompts).toEqual({ plan: "Mine." });
    saveSettings(at, { prompts: {} });
    expect(loadSettings(at).prompts).toEqual({});
  });

  it("survives a settings file that is not what it should be", () => {
    const at = root();
    fs.mkdirSync(path.join(at, ".lumen"));
    fs.writeFileSync(path.join(at, ".lumen", "settings.json"), "{ not json");
    expect(loadSettings(at)).toEqual({ stages: {}, prompts: {} });
    expect(tidy(null)).toEqual({ stages: {}, prompts: {} });
    expect(tidy({ stages: "x", prompts: 3 })).toEqual({ stages: {}, prompts: {} });
  });
});
