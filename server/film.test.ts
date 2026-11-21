import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FilmEvent, FilmSceneEvent, ImageObject } from "../src/film/types";
import { hotspotsOf, makeFilm } from "./film";
import { offlineProvider } from "./providers/offline";
import type { Provider } from "./providers/types";
import { PICTURES_KEY, STEPS_KEY, entriesClosed, imageSize, jsonObject, planHeader, writingLanes } from "./text";

async function run(provider: Provider) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-film-"));
  const events: FilmEvent[] = [];
  const film = await makeFilm({ provider, brief: "What if the Moon vanished tonight?", run: "test", dir, base: "/film-runs/test", emit: (e) => events.push(e) });
  return { film, events, dir };
}

describe("reading a plan while it streams", () => {
  const plan = JSON.stringify({
    title: 'A "quoted" title',
    character: "A stick figure.",
    pictures: [
      { id: "a", brief: 'has } and ] and \\ and " inside', parts: [{ id: "x", where: "left" }] },
      { id: "b", brief: "second", parts: [] },
    ],
    steps: [{ id: "s1", narration: "One.", show: "", screen: ["a"] }],
  });

  it("returns each entry once, the moment it closes, whatever the chunking", () => {
    for (const size of [1, 3, 7, 50]) {
      let buffer = "";
      let cursor = 0;
      let done = false;
      const seen: string[] = [];
      const closedAt: number[] = [];
      for (let at = 0; at < plan.length; at += size) {
        buffer += plan.slice(at, at + size);
        if (done) continue;
        const closed = entriesClosed(buffer, PICTURES_KEY, cursor);
        cursor = closed.cursor;
        done = closed.done;
        for (const entry of closed.entries) {
          seen.push((entry as { id: string }).id);
          closedAt.push(buffer.length);
        }
      }
      expect(seen).toEqual(["a", "b"]);
      expect(done).toBe(true);
      // The first picture is known before the plan has finished arriving.
      expect(closedAt[0]).toBeLessThan(plan.length - 40);
    }
  });

  it("reads the header from what comes before the pictures", () => {
    expect(planHeader(plan)).toEqual({ title: 'A "quoted" title', character: "A stick figure." });
    expect(planHeader('{"title": "x"')).toBeNull();
  });

  it("reads the steps array on its own", () => {
    expect(entriesClosed(plan, STEPS_KEY, 0).entries).toHaveLength(1);
  });

  it("replays a real AiRA plan character by character", () => {
    // Point FILM_PLAN_FIXTURE at a plan.json from an AiRA or film-lab run; the test is skipped without one.
    const file = process.env.FILM_PLAN_FIXTURE;
    if (!file || !fs.existsSync(file)) return;
    const text = fs.readFileSync(file, "utf8");
    const whole = JSON.parse(text) as { pictures: unknown[]; steps: unknown[] };
    let buffer = "";
    let cursor = 0;
    let done = false;
    const pictures: unknown[] = [];
    for (const char of text) {
      buffer += char;
      if (done || !/[\]}]/.test(char)) continue;
      const closed = entriesClosed(buffer, PICTURES_KEY, cursor);
      cursor = closed.cursor;
      done = closed.done;
      pictures.push(...closed.entries);
    }
    expect(pictures).toEqual(whole.pictures);
    expect(entriesClosed(text, STEPS_KEY, 0).entries).toEqual(whole.steps);
  });
});

describe("small helpers", () => {
  it("finds the JSON object in a chatty reply", () => {
    expect(jsonObject('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(jsonObject('Here: {"a": {"b": 2}} done')).toEqual({ a: { b: 2 } });
    expect(jsonObject('{"objects": [')).toBeNull();
  });

  it("measures a PNG and an SVG", () => {
    const png = new Uint8Array(32);
    new DataView(png.buffer).setUint32(0, 0x89504e47);
    new DataView(png.buffer).setUint32(16, 1536);
    new DataView(png.buffer).setUint32(20, 1024);
    expect(imageSize(png)).toEqual([1536, 1024]);
    expect(imageSize(new TextEncoder().encode('<svg xmlns="x" viewBox="0 0 800 450"></svg>'))).toEqual([800, 450]);
  });

  it("turns pixel boxes into fractions and drops what it cannot trust", () => {
    const found = {
      parts: [
        { part: "moon", box: [100, 50, 300, 250] },
        { part: "speck", box: [10, 10, 12, 12] },
        { part: "unplanned", box: [0, 0, 500, 500] },
        { part: "gone", box: [0, 0, 500, 500] },
      ],
      missing: ["gone"],
    };
    expect(hotspotsOf(found, ["moon", "speck", "gone"], 1000, 500)).toEqual({ moon: [0.1, 0.1, 0.2, 0.4] });
  });

  it("recognises a part whose name came back with its description attached", () => {
    const found = { parts: [{ part: "character: full body on the central bed", box: [447, 428, 1059, 582] }], missing: [] };
    expect(Object.keys(hotspotsOf(found, ["character"], 1536, 1024))).toEqual(["character"]);
  });

  it("keeps a writing lane free for an earlier step", async () => {
    const lanes = writingLanes(1);
    const order: number[] = [];
    lanes.enlist(0);
    lanes.enlist(1);
    // Step 1 is ready first, but step 0 has not started, so the only lane is held for it.
    const late = lanes.run(1, async () => void order.push(1));
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual([]);
    await lanes.run(0, async () => void order.push(0));
    await late;
    expect(order).toEqual([0, 1]);
  });
});

describe("the film pipeline", () => {
  it("releases scenes in step order although later steps finish first", async () => {
    const { film, events } = await run(offlineProvider({ tick: 1 }));
    const scenes = events.filter((e): e is FilmSceneEvent => e.type === "film_scene");
    expect(scenes.map((e) => e.scene.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(scenes.map((e) => e.index)).toEqual([0, 1, 2, 3, 4]);
    // Proof the offline provider really finished a later step before the first.
    const ready = events.filter((e) => e.type === "film_progress" && e.stage === "scene" && e.status === "ready").map((e) => (e as { id?: string }).id);
    expect(ready.indexOf("s4")).toBeLessThan(ready.indexOf("s1"));
    // One picture of the offline film always fails to draw. Nothing is drawn again, so the run is marked
    // failed and says why, and the scenes that could be made are all kept.
    expect(film.status).toBe("failed");
    expect(film.error).toContain("Nothing was drawn again");
    expect(events.at(-1)).toMatchObject({ type: "film_done", status: "failed", scenes: 5 });
    expect(film.header.title).toBe("What if the Moon vanished tonight?");
  });

  it("starts drawing before the plan has finished", async () => {
    const { events } = await run(offlineProvider({ tick: 1 }));
    const at = (match: (e: FilmEvent) => boolean) => events.findIndex(match);
    const firstDraw = at((e) => e.type === "film_progress" && e.stage === "picture" && e.status === "drawing");
    const planDone = at((e) => e.type === "film_progress" && e.stage === "plan" && e.status === "written");
    expect(firstDraw).toBeGreaterThan(-1);
    expect(firstDraw).toBeLessThan(planDone);
  });

  it("fills in each picture's address and parts, and never lets the writer do it", async () => {
    const { film, dir } = await run(offlineProvider({ tick: 1 }));
    const image = film.scenes[0].objects.find((o): o is ImageObject => o.kind === "image");
    expect(image?.src).toBe("/film-runs/test/pictures/bedroom-night.svg");
    expect(image?.aspect).toBe(1.5);
    expect(Object.keys(image?.hotspots ?? {})).toEqual(["moon", "bed", "person"]);
    expect(fs.existsSync(path.join(dir, "pictures/bedroom-night.svg"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "film.json"), "utf8")).scenes).toHaveLength(5);
  });

  it("repairs a reply that is not JSON", async () => {
    const { film } = await run(offlineProvider({ tick: 1 }));
    expect(film.scenes[1].beats.length).toBeGreaterThanOrEqual(4);
  });

  it("gives the writer one retry for a part that was never found", async () => {
    const { film } = await run(offlineProvider({ tick: 1 }));
    const targets = JSON.stringify(film.scenes[2].beats);
    expect(targets).not.toContain("beach-dusk.boat");
    expect(targets).toContain("beach-dusk.sea");
  });

  it("plays a scene without a picture that failed to draw", async () => {
    const { film, events } = await run(offlineProvider({ tick: 1 }));
    expect(events.some((e) => e.type === "film_progress" && e.stage === "picture" && e.status === "failed" && e.id === "rooftop-dawn")).toBe(true);
    const last = film.scenes[4];
    expect(last.objects.filter((o) => o.kind === "image").map((o) => o.id)).toEqual(["bedroom-night"]);
    expect(JSON.stringify(last.beats)).not.toContain("rooftop-dawn");
  });

  it("drops a step whose writer never returns a scene, and keeps the indexes dense", async () => {
    const base = offlineProvider({ tick: 1 });
    const provider: Provider = { ...base, write: (system, messages, stepId) => (stepId === "s2" ? Promise.resolve("no scene") : base.write(system, messages, stepId)) };
    const { events } = await run(provider);
    const scenes = events.filter((e): e is FilmSceneEvent => e.type === "film_scene");
    expect(scenes.map((e) => e.scene.id)).toEqual(["s1", "s3", "s4", "s5"]);
    expect(scenes.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  });

  it("keeps the steps it has when the plan breaks off", async () => {
    const base = offlineProvider({ tick: 1 });
    const provider: Provider = {
      ...base,
      plan: async (system, brief, onText) => {
        let whole = "";
        await base.plan(system, brief, (delta) => (whole += delta));
        // The stream dies just after the second step has closed.
        onText(whole.slice(0, whole.indexOf('{"id":"s3"')));
        throw new Error("the stream went quiet");
      },
    };
    const { film, events } = await run(provider);
    expect(film.scenes.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(events.at(-1)).toMatchObject({ type: "film_done", scenes: 2 });
  });

  it("fails when no scene can be made", async () => {
    const provider: Provider = { ...offlineProvider({ tick: 1 }), plan: async () => { throw new Error("no plan"); } };
    const { events } = await run(provider);
    expect(events.at(-1)).toMatchObject({ type: "film_done", status: "failed", scenes: 0, error: "no plan" });
  });
});
