import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FilmEvent, ImageObject } from "../src/film/types";
import { type Pixels, cutOut, cutOutPng, decodePng, encodePng, shrinkPng } from "./cutout";
import { makeFilm } from "./film";
import { offlineProvider } from "./providers/offline";
import type { ImageBytes, Message, Provider } from "./providers/types";

/** A white picture to draw test shapes on. */
function canvas(width: number, height: number, fill: [number, number, number] = [255, 255, 255]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...fill, 255], i * 4);
  return { width, height, data };
}

const put = (p: Pixels, x: number, y: number, rgb: [number, number, number]) => p.data.set([...rgb, 255], (y * p.width + x) * 4);
const alphaAt = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

/** A white disc with a black outline: Lumen's stick-figure head, the hard case for a white ground. */
function ring(p: Pixels, cx: number, cy: number, r: number, gapAt?: number) {
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r - 4 && d <= r && !(gapAt !== undefined && Math.abs(y - cy) <= 2 && x > cx && Math.abs(x - (cx + gapAt)) < 6)) put(p, x, y, [10, 10, 10]);
    }
  }
}

describe("reading and writing PNGs", () => {
  it("gives back the same pixels it was given", () => {
    const p = canvas(7, 5);
    put(p, 3, 2, [200, 30, 40]);
    p.data[(4 * 7 + 6) * 4 + 3] = 17;
    const back = decodePng(encodePng(p));
    expect(back.width).toBe(7);
    expect(back.height).toBe(5);
    expect([...back.data]).toEqual([...p.data]);
  });

  it("shrinks a picture by whole steps, averaging its pixels, and leaves a small one alone", () => {
    const p = canvas(200, 100, [10, 20, 30]);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) put(p, x, y, [250, 20, 30]);
    const small = decodePng(shrinkPng(encodePng(p), 100));
    expect([small.width, small.height]).toEqual([100, 50]);
    expect([...small.data.subarray(0, 4)]).toEqual([250, 20, 30, 255]);
    expect([...small.data.subarray(99 * 4, 100 * 4)]).toEqual([10, 20, 30, 255]);
    const already = encodePng(canvas(60, 40));
    expect(shrinkPng(already, 100)).toBe(already);
    // Bytes that are no PNG come back untouched: the picture is still sent, whatever it is.
    const other = new Uint8Array([1, 2, 3]);
    expect(shrinkPng(other, 100)).toBe(other);
  });

  it("refuses bytes that are not a PNG", () => {
    expect(() => decodePng(new Uint8Array(64))).toThrow("not a PNG");
  });
});

describe("cutting a thing out of a white ground", () => {
  it("removes the ground outside the outline and keeps the white inside it", () => {
    const p = canvas(200, 160);
    ring(p, 100, 80, 50);
    const cut = cutOutPng(encodePng(p));
    expect(cut.problem).toBeNull();
    expect(cut.edges).toBe(0);
    const out = decodePng(cut.png);
    // Cropped to the ring itself: its own 100 pixels across, and two pixels of rim each side. The cut-out's
    // size is the thing's size, which is what its size on screen is worked out from.
    expect(out.width).toBeGreaterThanOrEqual(100);
    expect(out.width).toBeLessThanOrEqual(105);
    expect(out.height).toBeGreaterThanOrEqual(100);
    expect(out.height).toBeLessThanOrEqual(105);
    // Its lowest rows are the thing's foot, not empty margin.
    let lowest = 0;
    for (let x = 0; x < out.width; x++) lowest = Math.max(lowest, alphaAt(out, x, out.height - 3));
    expect(lowest).toBe(255);
    // The corner is ground and is gone; the middle is white inside the outline and stays.
    expect(alphaAt(out, 0, 0)).toBe(0);
    expect(alphaAt(out, out.width >> 1, out.height >> 1)).toBe(255);
    const mid = ((out.height >> 1) * out.width + (out.width >> 1)) * 4;
    expect([...out.data.subarray(mid, mid + 3)]).toEqual([255, 255, 255]);
  });

  it("reads an off-white ground from the border and removes that", () => {
    const p = canvas(120, 120, [246, 246, 244]);
    ring(p, 60, 60, 30);
    const cut = cutOut(p);
    expect(cut.problem).toBeNull();
    expect(alphaAt(decodePng(cut.png), 0, 0)).toBe(0);
  });

  it("makes the rim between outline and ground see-through without a pale colour", () => {
    const p = canvas(60, 60);
    for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) put(p, x, y, [10, 10, 10]);
    // One column of half-blended pixels, as an image model's soft edge would leave.
    for (let y = 20; y < 40; y++) put(p, 40, y, [150, 150, 150]);
    const out = decodePng(cutOut(p).png);
    let seen = false;
    for (let i = 0; i < out.width * out.height; i++) {
      const a = out.data[i * 4 + 3];
      if (a > 0 && a < 255) {
        seen = true;
        // The blend was grey 150; with the white taken back out of it, it is clearly darker.
        expect(out.data[i * 4]).toBeLessThan(120);
      }
    }
    expect(seen).toBe(true);
  });

  it("drops a loose speck but keeps a second real piece", () => {
    const p = canvas(200, 120);
    ring(p, 60, 60, 30);
    ring(p, 140, 60, 20);
    put(p, 190, 10, [0, 0, 0]);
    const cut = cutOut(p);
    const out = decodePng(cut.png);
    // The speck sat far right and high; had it stayed, the crop would reach the top of the picture.
    expect(out.height).toBeLessThan(80);
    expect(out.width).toBeGreaterThan(120);
  });

  it("says when nothing was drawn", () => {
    expect(cutOut(canvas(50, 50)).problem).toContain("nothing");
  });

  it("says when a whole scene was drawn in place of one thing", () => {
    expect(cutOut(canvas(50, 50, [40, 90, 160])).problem).toContain("whole scene");
  });

  it("says when the thing runs off the picture", () => {
    const p = canvas(100, 100);
    for (let y = 0; y < 100; y++) for (let x = 60; x < 100; x++) put(p, x, y, [30, 30, 30]);
    expect(cutOut(p).problem).toContain("cut off");
  });

  it("loses the white inside an outline that has a gap: the known weak spot", () => {
    const p = canvas(200, 160);
    ring(p, 100, 80, 50, 48);
    const out = decodePng(cutOut(p).png);
    expect(alphaAt(out, out.width >> 1, out.height >> 1)).toBe(0);
  });
});

// ── The whole pipeline, with stand-in models ────────────────────────────────────────────────────────

describe("a film with cut-outs, end to end", () => {
  const plan = {
    title: "The ball",
    character: "none",
    pictures: [
      { id: "field", kind: "background", brief: "A field with one tree at the right.", parts: [{ id: "tree", where: "the tree" }] },
      { id: "ball", kind: "cutout", brief: "A round ball.", parts: [{ id: "stripe", where: "its stripe" }] },
      { id: "ball-flat", kind: "cutout", of: "ball", brief: "The same ball, gone flat." },
    ],
    steps: [{ id: "s1", narration: "The ball rolls to the tree and goes flat.", screen: ["field", "ball", "ball-flat"], show: "" }],
  };
  const scene = {
    objects: [{ id: "field", kind: "image" }, { id: "ball", kind: "image" }, { id: "ball-flat", kind: "image" }],
    beats: [
      { id: "a", actions: [{ do: "place", what: "ball", at: "left", size: "small" }] },
      { id: "b", say: "rolls to the tree", actions: [{ do: "move", what: "ball", to: "field.tree", where: "before", path: "hop" }] },
      { id: "c", say: "goes flat", actions: [{ do: "swap", what: "ball", to: "ball-flat" }] },
    ],
  };
  const disc = () => {
    const p = canvas(120, 90);
    ring(p, 60, 45, 25);
    return encodePng(p);
  };

  async function run() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-cutout-"));
    const drawn: { id: string; prompt: string; reference: ImageBytes | null }[] = [];
    const found: string[] = [];
    const asked: Message[] = [];
    const provider: Provider = {
      ...offlineProvider({}),
      async plan(_system, _brief, onText) {
        onText(JSON.stringify(plan));
      },
      async draw(prompt, reference, id) {
        drawn.push({ id, prompt, reference });
        // The first try at the ball comes back as empty white, as an image model sometimes does.
        const blank = id === "ball" && drawn.filter((d) => d.id === "ball").length === 1;
        return { bytes: id === "field" ? encodePng(canvas(120, 80, [40, 120, 60])) : blank ? encodePng(canvas(120, 90)) : disc(), type: "image/png" };
      },
      async findParts(_system, _context, _image, id, ids) {
        found.push(id);
        return { parts: ids.map((part) => ({ part, box: [80, 10, 110, 70] })), missing: [] };
      },
      async write(_system, messages) {
        asked.push(messages[0]);
        return JSON.stringify(scene);
      },
      async speak() {
        return null;
      },
    };
    const events: FilmEvent[] = [];
    const film = await makeFilm({ provider, brief: "The ball", run: "t", dir, base: "/film-runs/t", emit: (e) => events.push(e) });
    return { film, dir, drawn, found, events, asked };
  }

  it("draws a cut-out on white, cuts it, and plays it over the background", async () => {
    const { film, dir, drawn, found } = await run();
    expect(film.status).toBe("ready");
    const objects = film.scenes[0].objects.filter((o): o is ImageObject => o.kind === "image");
    expect(objects.map((o) => [o.id, o.cutout ?? false])).toEqual([["field", false], ["ball", true], ["ball-flat", true]]);
    expect(film.scenes[0].beats.map((b) => b.actions[0].do)).toEqual(["place", "move", "swap"]);

    // The saved cut-out has no ground left; the drawing it came from is kept beside it.
    const cut = decodePng(new Uint8Array(fs.readFileSync(path.join(dir, "pictures/ball.png"))));
    expect(alphaAt(cut, 0, 0)).toBe(0);
    expect(alphaAt(cut, cut.width >> 1, cut.height >> 1)).toBe(255);
    expect(objects[1].aspect).toBeCloseTo(cut.width / cut.height, 2);
    expect(fs.existsSync(path.join(dir, "pictures/ball.drawn.png"))).toBe(true);

    // Only the background is searched for parts, even though the plan gave the cut-out one.
    expect(found).toEqual(["field"]);
    expect(drawn.find((d) => d.id === "ball")!.prompt).toContain("pure white");
    expect(drawn.find((d) => d.id === "field")!.prompt).not.toContain("pure white");
  });

  it("shows the scene writer each picture, and tells it each part's box and each cut-out's shape", async () => {
    const { asked } = await run();
    const first = asked[0];
    expect(first.images!.map((i) => i.label)).toEqual([
      'The picture "field", a background:',
      'The picture "ball", a cut-out, shown here on white before the white is removed:',
      'The picture "ball-flat", a cut-out, shown here on white before the white is removed:',
    ]);
    // What it is shown is a real picture it can open.
    expect(decodePng(first.images![0].image.bytes).width).toBe(120);
    const told = JSON.parse(first.content.slice(first.content.indexOf("["), first.content.indexOf("\n\n## This step")));
    expect(told[0]).toMatchObject({ id: "field", kind: "background", parts: [{ id: "field.tree", box: [0.67, 0.13, 0.25, 0.75] }] });
    expect(told[1]).toMatchObject({ id: "ball", kind: "cutout" });
    expect(told[1].shape).toBeCloseTo(1, 1);
  });

  it("redraws a cut-out once when the cut says the drawing cannot be used", async () => {
    const { drawn } = await run();
    const tries = drawn.filter((d) => d.id === "ball");
    expect(tries).toHaveLength(2);
    expect(tries[1].prompt).toContain("could not be used: nothing but the plain ground was drawn");
  });

  it("draws another pose from the first pose's own drawing, and styles a first pose from the lead frame", async () => {
    const { drawn } = await run();
    const flat = drawn.find((d) => d.id === "ball-flat")!;
    expect(flat.prompt).toContain("another pose");
    // The reference is the ball as drawn on white, not the cut-out and not the field.
    expect(decodePng(flat.reference!.bytes).data[3]).toBe(255);
    expect(decodePng(flat.reference!.bytes).width).toBe(120);
    expect(decodePng(flat.reference!.bytes).height).toBe(90);
    const ball = drawn.find((d) => d.id === "ball")!;
    expect(decodePng(ball.reference!.bytes).height).toBe(80);
    expect(ball.prompt).toContain("frame of the same film");
  });

  it("leaves a scene on its background when a cut-out cannot be made", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-cutout-"));
    const asked: string[] = [];
    const provider: Provider = {
      ...offlineProvider({}),
      async plan(_s, _b, onText) {
        onText(JSON.stringify(plan));
      },
      async draw(_prompt, _reference, id) {
        // Every cut-out comes back as a whole scene, twice: it is given up on.
        return { bytes: encodePng(canvas(120, 80, id === "field" ? [40, 120, 60] : [200, 60, 60])), type: "image/png" };
      },
      async findParts(_s, _c, _i, _id, ids) {
        return { parts: ids.map((part) => ({ part, box: [80, 10, 110, 70] })), missing: [] };
      },
      async write(_system, messages) {
        asked.push(String(messages[0].content));
        return JSON.stringify({ objects: [{ id: "field", kind: "image" }], beats: [{ id: "a", actions: [{ do: "camera", target: "field.tree", shot: "close" }] }] });
      },
      async speak() {
        return null;
      },
    };
    const film = await makeFilm({ provider, brief: "The ball", run: "t", dir, base: "/film-runs/t", emit: () => {} });
    expect(film.status).toBe("ready");
    // The scene writer is told only about the picture that exists.
    expect(asked[0]).toContain('"id":"field"');
    expect(asked[0]).not.toContain('"id":"ball"');
  });
});

describe("who gets the character's look", () => {
  const look = "A stick figure in a red coat.";
  it("gives it to a picture whose brief asks for the main character, and to no other", async () => {
    const { cutoutPrompt, drawingPrompt } = await import("./prompts");
    expect(drawingPrompt("The main character stands at a door.", look, "lead")).toContain("red coat");
    // A frame that asks for nobody is told there is nobody, and never hears what the character looks like.
    const empty = drawingPrompt("An empty street at night.", look, "lead");
    expect(empty).not.toContain("red coat");
    expect(empty).toContain("no person anywhere in the frame");
    expect(cutoutPrompt("the main character, walking, facing right", look, "styled")).toContain("red coat");
    expect(cutoutPrompt("A small silver wrench.", look, "styled")).not.toContain("red coat");
    expect(drawingPrompt("The main character waits.", "none", "lead")).not.toContain("same in every frame");
  });
});
