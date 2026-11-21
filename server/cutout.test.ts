import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FilmEvent, ImageObject } from "../src/film/types";
import { type Pixels, cutOut, cutOutPng, SHEET_MOST, cutPair, cutSheet, decodePng, encodePng, sheetLayout, shrinkPng } from "./cutout";
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

  /** Both cut-outs on one sheet: a large ring, then a small one. */
  const both = () => {
    const p = canvas(400, 200);
    ring(p, 100, 100, 60);
    ring(p, 300, 100, 30);
    return encodePng(p);
  };

  /** `sheet` is what the drawing of both cut-outs together comes back as; null makes that drawing fail. */
  async function run(sheet: (() => Uint8Array) | null = both) {
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
        if (id.startsWith("sheet")) {
          if (!sheet) throw new Error("the sheet could not be drawn");
          return { bytes: sheet(), type: "image/png" };
        }
        return { bytes: id === "field" ? encodePng(canvas(120, 80, [40, 120, 60])) : disc(), type: "image/png" };
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
    expect(drawn.find((d) => d.id === "sheet-1")!.prompt).toContain("pure white");
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

  it("draws every cut-out of a film in one drawing and cuts them apart", async () => {
    const { film, dir, drawn } = await run();
    expect(film.status).toBe("ready");
    // One drawing for the two things, and none for either alone.
    expect(drawn.map((d) => d.id)).toEqual(["field", "sheet-1"]);
    const sheet = drawn[1];
    expect(sheet.prompt).toContain("1. A round ball.");
    expect(sheet.prompt).toContain("2. The same ball, gone flat. This is the very same thing as number 1");
    // The sheet is drawn in the style of the film's first background.
    expect(decodePng(sheet.reference!.bytes).height).toBe(80);
    const ball = decodePng(new Uint8Array(fs.readFileSync(path.join(dir, "pictures/ball.png"))));
    const flat = decodePng(new Uint8Array(fs.readFileSync(path.join(dir, "pictures/ball-flat.png"))));
    expect(ball.width).toBeGreaterThan(110);
    expect(flat.width).toBeLessThan(70);
    expect(fs.existsSync(path.join(dir, "pictures/sheet-1.png"))).toBe(true);
  });

  it("draws nothing again when the sheet leaves a thing out, and marks the run failed", async () => {
    const one = () => {
      const p = canvas(400, 200);
      ring(p, 100, 100, 60);
      return encodePng(p);
    };
    const { film, drawn } = await run(one);
    expect(drawn.map((d) => d.id)).toEqual(["field", "sheet-1"]);
    expect(film.status).toBe("failed");
    expect(film.error).toContain("ball-flat: nothing was found in its place on the sheet");
  });

  it("draws nothing again when the sheet cannot be drawn, and marks the run failed", async () => {
    const { film, drawn } = await run(null);
    expect(drawn.map((d) => d.id)).toEqual(["field", "sheet-1"]);
    expect(film.status).toBe("failed");
    expect(film.error).toContain("sheet-1: the sheet could not be drawn");
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
        // The sheet comes back as a whole scene, so no cut-out can be taken from it.
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
    // The run is marked failed, but the scenes that could be made are kept.
    expect(film.status).toBe("failed");
    expect(film.scenes).toHaveLength(1);
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

describe("a sheet of things", () => {
  it("gives each thing its own cut-out, in reading order, and null for an empty place", () => {
    const p = canvas(600, 400);
    ring(p, 100, 100, 70);
    // The second thing leans over the line into the third place, and is still kept whole.
    ring(p, 330, 100, 80);
    ring(p, 100, 300, 40);
    const things = cutSheet(encodePng(p), 3, 2, 5);
    expect(things.map((t) => (t ? t.cut.problem : "empty"))).toEqual([null, null, "empty", null, "empty"]);
    expect(things[0]!.cut.width).toBeGreaterThan(138);
    expect(things[1]!.cut.width).toBeGreaterThan(158);
    expect(things[3]!.cut.width).toBeLessThan(90);
    // What is kept beside the cut-out is the thing alone on white.
    expect(decodePng(things[0]!.drawn).data[3]).toBe(255);
  });

  it("fits the grid to the number of things, up to twelve", () => {
    expect(sheetLayout(1)).toEqual({ cols: 1, rows: 1, size: "1536x1024" });
    expect(sheetLayout(2)).toEqual({ cols: 2, rows: 1, size: "1536x1024" });
    expect(sheetLayout(4)).toEqual({ cols: 2, rows: 2, size: "1536x1024" });
    expect(sheetLayout(6)).toEqual({ cols: 3, rows: 2, size: "1536x1024" });
    expect(sheetLayout(9)).toEqual({ cols: 3, rows: 3, size: "1536x1024" });
    expect(sheetLayout(12)).toEqual({ cols: 4, rows: 3, size: "1536x1024" });
    expect(SHEET_MOST).toBe(12);
  });

  it("keeps things drawn close together apart, and joins the loose pieces of one thing", () => {
    const p = canvas(600, 200);
    // Two whole things nearly touching, then one thing in two pieces.
    ring(p, 100, 100, 60);
    ring(p, 250, 100, 60);
    ring(p, 450, 80, 40);
    ring(p, 450, 143, 15);
    const things = cutSheet(encodePng(p), 3, 1, 3);
    expect(things.map((t) => t?.cut.problem ?? null)).toEqual([null, null, null]);
    expect(things[0]!.cut.width).toBeLessThan(130);
    expect(things[2]!.cut.height).toBeGreaterThan(120);
  });
});

describe("two backgrounds in one drawing", () => {
  /** A red frame over a blue one, with a white band between and a little white round the outside. */
  const pair = (band: boolean) => {
    const p = canvas(200, 230);
    const fill = (top: number, bottom: number, colour: [number, number, number]) => {
      for (let y = top; y <= bottom; y++) for (let x = 3; x < 197; x++) p.data.set([...colour, 255], (y * 200 + x) * 4);
    };
    fill(2, band ? 108 : 114, [200, 40, 40]);
    fill(band ? 121 : 115, 227, [40, 60, 200]);
    return encodePng(p);
  };

  it("cuts at the white band and trims the white round each frame", () => {
    const [top, bottom] = cutPair(pair(true)).map((bytes) => decodePng(bytes));
    expect([top.data[0], top.data[2]]).toEqual([200, 40]);
    expect([bottom.data[0], bottom.data[2]]).toEqual([40, 200]);
    expect(top.width).toBe(194);
    expect(top.height).toBeGreaterThan(100);
    expect(top.height).toBeLessThan(108);
    // No white is left along any edge of either frame.
    for (const frame of [top, bottom]) expect(frame.data[(frame.height - 1) * frame.width * 4 + 1]).toBeLessThan(100);
  });

  it("cuts at the middle when there is no band", () => {
    const [top, bottom] = cutPair(pair(false)).map((bytes) => decodePng(bytes));
    expect(Math.abs(top.height - bottom.height)).toBeLessThan(6);
  });

  it("draws a film's backgrounds two to a drawing, and the odd one by itself", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-pair-"));
    const drawn: { id: string; prompt: string; size?: string; reference: ImageBytes | null }[] = [];
    const plan = {
      title: "Three places",
      character: "none",
      pictures: [
        { id: "field", kind: "background", brief: "A field." },
        { id: "field-night", kind: "background", of: "field", brief: "The same field at night." },
        { id: "sea", kind: "background", brief: "The sea." },
      ],
      steps: [{ id: "s1", narration: "A field by day, then by night, then the sea.", screen: ["field", "field-night", "sea"], show: "" }],
    };
    const provider: Provider = {
      ...offlineProvider({}),
      pairs: true,
      async plan(_s, _b, onText) {
        onText(JSON.stringify(plan));
      },
      async draw(prompt, reference, id, size) {
        drawn.push({ id, prompt, size, reference });
        return { bytes: id.startsWith("pair") ? pair(true) : encodePng(canvas(120, 80, [10, 120, 160])), type: "image/png" };
      },
      async write() {
        return JSON.stringify({ objects: [{ id: "field", kind: "image" }], beats: [{ id: "a", actions: [{ do: "camera", target: "field", shot: "wide" }] }] });
      },
      async speak() {
        return null;
      },
    };
    const film = await makeFilm({ provider, brief: "Three places", run: "t", dir, base: "/film-runs/t", emit: () => {} });
    expect(film.status).toBe("ready");
    expect(drawn.map((d) => [d.id, d.size])).toEqual([["pair-1", "1024x1152"], ["sea", undefined]]);
    expect(drawn[0].prompt).toContain("TOP picture: A field.");
    expect(drawn[0].prompt).toContain("BOTTOM picture: the very same shot as the top picture a moment later");
    // The first pair has nothing to match; the odd one is drawn in the style of the film's first background.
    expect(drawn[0].reference).toBeNull();
    expect(decodePng(drawn[1].reference!.bytes).data[0]).toBe(200);
    expect(decodePng(new Uint8Array(fs.readFileSync(path.join(dir, "pictures/field-night.png")))).data[2]).toBe(200);
  });
});
