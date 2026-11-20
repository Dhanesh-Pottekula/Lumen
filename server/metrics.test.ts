import { describe, expect, it } from "vitest";
import type { FilmFile } from "../src/film/types";
import { promptVersion } from "./film";
import { filmMetrics } from "./metrics";
import { unknownMarks } from "./voice";

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
