import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeFilm } from "./film";
import { drawingPrompt, sheetPrompt } from "./prompts";
import { offlineProvider } from "./providers/offline";
import type { ImageBytes, Provider } from "./providers/types";
import { type Pixels, SHEET_MOST, cutSheet, decodePng, encodePng, sheetLayout, shrinkPng } from "./sheet";

/** A white picture to draw test shapes on. */
function canvas(width: number, height: number, fill: [number, number, number] = [255, 255, 255]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...fill, 255], i * 4);
  return { width, height, data };
}

const put = (p: Pixels, x: number, y: number, rgb: [number, number, number]) => p.data.set([...rgb, 255], (y * p.width + x) * 4);

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

/**
 * A sheet as the image model draws one: `cols` by `rows` frames with white gutters, frame n filled with a
 * colour of its own (its red is 20 + 20n). `skip` leaves those places white; `whiteIn` puts a white stripe
 * through the middle of that frame, as a bright sky would.
 */
function sheet(cols: number, rows: number, count: number, options: { skip?: number[]; whiteIn?: number } = {}): Uint8Array {
  const cell = { w: 100, h: 60 };
  const gap = 8;
  const p = canvas(cols * cell.w + (cols + 1) * gap, rows * cell.h + (rows + 1) * gap);
  for (let n = 0; n < count; n++) {
    if (options.skip?.includes(n)) continue;
    const left = gap + (n % cols) * (cell.w + gap);
    const top = gap + Math.floor(n / cols) * (cell.h + gap);
    for (let y = top; y < top + cell.h; y++) {
      for (let x = left; x < left + cell.w; x++) put(p, x, y, options.whiteIn === n && y >= top + 20 && y < top + 30 ? [255, 255, 255] : [20 + 20 * n, 60, 120]);
    }
  }
  return encodePng(p);
}

describe("several pictures in one drawing", () => {
  it("lays out up to nine on the wide sheet, in places close to the film's own shape", () => {
    expect(SHEET_MOST).toBe(9);
    expect(sheetLayout(1)).toEqual({ cols: 1, rows: 1, size: "1536x1024" });
    expect(sheetLayout(2)).toEqual({ cols: 2, rows: 2, size: "1536x1024" });
    expect(sheetLayout(4)).toEqual({ cols: 2, rows: 2, size: "1536x1024" });
    expect(sheetLayout(5)).toEqual({ cols: 3, rows: 3, size: "1536x1024" });
    expect(sheetLayout(9)).toEqual({ cols: 3, rows: 3, size: "1536x1024" });
  });

  it("cuts eight frames apart at the white between them, in reading order, with no white left round any", () => {
    const frames = cutSheet(sheet(2, 4, 8), 2, 4, 8).map((bytes) => (bytes ? decodePng(bytes) : null));
    expect(frames).toHaveLength(8);
    frames.forEach((frame, n) => {
      expect(frame).not.toBeNull();
      expect(frame!.data[0]).toBe(20 + 20 * n);
      expect(frame!.width).toBeGreaterThan(94);
      expect(frame!.width).toBeLessThanOrEqual(100);
      expect(frame!.height).toBeGreaterThan(54);
      expect(frame!.height).toBeLessThanOrEqual(60);
      // The last pixel is the frame's own colour, not gutter.
      expect(frame!.data[frame!.data.length - 4]).toBe(20 + 20 * n);
    });
  });

  it("gives null for a place where no frame was drawn, and still cuts the rest", () => {
    const frames = cutSheet(sheet(2, 4, 8, { skip: [5] }), 2, 4, 8);
    expect(frames[5]).toBeNull();
    expect(frames.filter(Boolean)).toHaveLength(7);
  });

  it("cuts nine frames, and five whose last places are left white", () => {
    expect(cutSheet(sheet(3, 3, 9), 3, 3, 9).filter(Boolean)).toHaveLength(9);
    const five = cutSheet(sheet(3, 3, 5), 3, 3, 5);
    expect(five).toHaveLength(5);
    expect(five.every(Boolean)).toBe(true);
  });

  it("does not take a white band inside a frame for the gutter", () => {
    const frames = cutSheet(sheet(1, 2, 2, { whiteIn: 0 }), 1, 2, 2).map((bytes) => decodePng(bytes!));
    expect(frames[0].height).toBeGreaterThan(54);
    expect(frames[1].data[0]).toBe(40);
  });
});

describe("a film's pictures, nine to a drawing", () => {
  const picture = (n: number, of?: string) => ({ id: `p${n}`, brief: `Picture ${n}.`, ...(of ? { of } : {}) });

  async function run(pictures: { id: string; brief: string; of?: string }[], draw?: (id: string) => Uint8Array) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-sheet-"));
    const drawn: { id: string; prompt: string; size?: string; reference: ImageBytes | null }[] = [];
    const plan = {
      title: "Many pictures",
      character: "none",
      pictures,
      steps: [{ id: "s1", narration: "One thing and then another.", screen: pictures.map((p) => p.id), show: "" }],
    };
    const provider: Provider = {
      ...offlineProvider({}),
      sheets: true,
      async plan(_s, _b, onText) {
        onText(JSON.stringify(plan));
      },
      async draw(prompt, reference, id, size) {
        drawn.push({ id, prompt, size, reference });
        if (draw) return { bytes: draw(id), type: "image/png" };
        const count = Number(/^(\d+) separate frames/.exec(prompt)?.[1] ?? 1);
        const { cols, rows } = sheetLayout(count);
        return { bytes: id.startsWith("sheet") ? sheet(cols, rows, count) : encodePng(canvas(120, 80, [10, 120, 160])), type: "image/png" };
      },
      async write() {
        return JSON.stringify({ objects: [{ id: "p1", kind: "image" }], beats: [{ id: "a", actions: [{ do: "camera", target: "p1", shot: "wide" }] }] });
      },
      async speak() {
        return null;
      },
    };
    const film = await makeFilm({ provider, brief: "Many pictures", run: "t", dir, base: "/film-runs/t", emit: () => {} });
    return { film, dir, drawn };
  }

  it("draws eleven pictures as one drawing of nine and one of two, the second in the style of the first", async () => {
    const { film, dir, drawn } = await run(Array.from({ length: 11 }, (_, n) => picture(n + 1)));
    expect(film.status).toBe("ready");
    expect(drawn.map((d) => [d.id, d.size])).toEqual([["sheet-1", "1536x1024"], ["sheet-2", "1536x1024"]]);
    expect(drawn[0].reference).toBeNull();
    expect(drawn[1].reference).not.toBeNull();
    expect(drawn[0].prompt).toContain("Picture 9: Picture 9.");
    expect(drawn[1].prompt).toContain("Only the first 2 places hold a picture");
    for (let n = 1; n <= 11; n++) expect(fs.existsSync(path.join(dir, `pictures/p${n}.png`))).toBe(true);
  });

  it("keeps a later moment in the same drawing as the picture it is a moment of", async () => {
    const pictures = Array.from({ length: 11 }, (_, n) => picture(n + 1, n === 9 ? "p9" : undefined));
    const { drawn } = await run(pictures);
    // p10 is a later moment of p9, so p9 waits for the second drawing and the first holds eight.
    expect(drawn[0].prompt).toContain("8 separate frames");
    expect(drawn[1].prompt).toContain("Picture 2: the very same shot as picture 1 a moment later");
  });

  it("draws one picture left over by itself", async () => {
    const { drawn } = await run(Array.from({ length: 10 }, (_, n) => picture(n + 1)));
    expect(drawn.map((d) => d.id)).toEqual(["sheet-1", "p10"]);
  });

  it("draws nothing again when a frame is missing from the drawing, and marks the run failed", async () => {
    const { film, drawn } = await run(Array.from({ length: 9 }, (_, n) => picture(n + 1)), () => sheet(3, 3, 9, { skip: [3] }));
    expect(drawn).toHaveLength(1);
    expect(film.status).toBe("failed");
    expect(film.error).toContain("p4");
  });

  it("draws nothing again when the drawing cannot be made, and marks the run failed", async () => {
    const { film, drawn } = await run(Array.from({ length: 9 }, (_, n) => picture(n + 1)), () => {
      throw new Error("the drawing was refused");
    });
    expect(drawn).toHaveLength(1);
    expect(film.status).toBe("failed");
    expect(film.error).toContain("the drawing was refused");
  });
});

describe("who gets the character's look", () => {
  const look = "A stick figure in a red coat.";
  it("gives it to a picture whose brief asks for the main character, and to no other", () => {
    expect(drawingPrompt("The main character stands at a door.", look, "lead")).toContain("red coat");
    // A frame that asks for nobody is told there is nobody, and never hears what the character looks like.
    const empty = drawingPrompt("An empty street at night.", look, "lead");
    expect(empty).not.toContain("red coat");
    expect(empty).toContain("no person anywhere in the frame");
    expect(drawingPrompt("The main character waits.", "none", "lead")).not.toContain("same in every frame");
    expect(sheetPrompt([{ brief: "The main character waits." }, { brief: "A street." }], look, 1, 2, false)).toContain("red coat");
    expect(sheetPrompt([{ brief: "A door." }, { brief: "A street." }], look, 1, 2, false)).not.toContain("red coat");
  });
});
