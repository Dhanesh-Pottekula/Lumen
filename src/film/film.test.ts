import { describe, expect, it } from "vitest";
import { createFilmCompiler } from "./compiler";
import { advance, type Cursor } from "./playback";
import { backdropAt, resolveScene } from "./resolve";
import type { FilmScene, PictureRow } from "./types";
import { validateScene } from "./validate";
import { alignWords, findCue, floorOf, narrationWords, subtitles } from "./words";

const NARRATION = "You wake up at night. It's darker than ever, and the Moon is gone. Nothing else has changed.";
const PICTURES: PictureRow[] = [
  { id: "room", parts: ["moon", "bed"] },
  { id: "street", parts: [] },
];

const scene = (beats: unknown[], objects: unknown[] = [{ id: "room", kind: "image" }]) => validateScene({ objects, beats }, PICTURES, "s1", NARRATION);

describe("narration words", () => {
  it("drops punctuation and keeps contractions whole", () => {
    expect(narrationWords("It's 9.8 — really, “twice” as heavy!")).toEqual(["it's", "9.8", "really", "twice", "as", "heavy"]);
  });

  it("finds a phrase only at or after where the last one ended", () => {
    const words = narrationWords("the moon and then the moon again");
    expect(findCue(words, "The Moon", 0)).toBe(0);
    expect(findCue(words, "the moon", 1)).toBe(4);
    expect(findCue(words, "the sun", 0)).toBe(-1);
  });

  it("breaks subtitles at sentence ends (a short clause stays with its sentence) and numbers each line by its first word", () => {
    const lines = subtitles(NARRATION);
    expect(lines.map((l) => l.text)).toEqual(["You wake up at night.", "It's darker than ever, and the Moon is gone.", "Nothing else has changed."]);
    expect(lines.map((l) => l.word)).toEqual([0, 5, 14]);
  });
});

describe("the validator", () => {
  it("keeps a good scene whole", () => {
    const verdict = scene([
      { id: "open", actions: [{ do: "camera", target: "room", shot: "wide" }] },
      { id: "moon", say: "the Moon", pace: "slow", actions: [{ do: "camera", target: "room.moon", shot: "close" }, { do: "label", target: "room.moon", text: "Moon" }] },
    ]);
    expect(verdict.problems).toEqual([]);
    expect(verdict.valid).toBe(true);
    expect(verdict.scene.beats).toHaveLength(2);
  });

  it("drops an action aimed at a part that was not found, and the beat if nothing is left", () => {
    const verdict = scene([
      { id: "open", actions: [{ do: "camera", target: "room" }] },
      { id: "lamp", say: "at night", actions: [{ do: "camera", target: "room.lamp" }] },
    ]);
    expect(verdict.scene.beats.map((b) => b.id)).toEqual(["open"]);
    expect(verdict.problems.join("\n")).toContain('"room.lamp" was not found');
    expect(verdict.valid).toBe(true);
  });

  it("treats a beat written with no actions as a hold, without complaint", () => {
    const verdict = scene([{ id: "open", actions: [{ do: "camera", target: "room" }] }, { id: "hold", say: "at night", actions: [] }]);
    expect(verdict.problems).toEqual([]);
    expect(verdict.scene.beats.map((b) => b.id)).toEqual(["open"]);
  });

  it("refuses a scene with no picture it can show", () => {
    const verdict = scene([{ id: "open", actions: [{ do: "flash" }] }], [{ id: "castle", kind: "image" }]);
    expect(verdict.valid).toBe(false);
  });

  it("reports say words that are missing or out of order, and keeps the beat", () => {
    const verdict = scene([
      { id: "a", actions: [{ do: "flash" }] },
      { id: "b", say: "is gone", actions: [{ do: "flash" }] },
      { id: "c", say: "wake up", actions: [{ do: "flash" }] },
    ]);
    expect(verdict.problems).toHaveLength(1);
    expect(verdict.problems[0]).toContain('say "wake up"');
    expect(verdict.scene.beats.map((b) => b.say)).toEqual([undefined, "is gone", undefined]);
  });

  it("never lets the writer's own src or hotspots through", () => {
    const verdict = scene([], [{ id: "room", kind: "image", src: "https://evil.example/x.png", hotspots: { moon: [0, 0, 1, 1] } }]);
    expect(verdict.scene.objects).toEqual([{ id: "room", kind: "image" }]);
  });

  it("reports a picture that is declared but never brought on", () => {
    const objects = [{ id: "room", kind: "image" }, { id: "street", kind: "image", initial: "hidden" }];
    const unseen = scene([{ id: "open", actions: [{ do: "camera", target: "room" }] }], objects);
    expect(unseen.problems.join("\n")).toContain('"street" is never shown');
    const seen = scene([{ id: "open", actions: [{ do: "camera", target: "room" }] }, { id: "out", say: "the Moon", actions: [{ do: "cut", to: "street" }] }], objects);
    expect(seen.problems).toEqual([]);
  });

  it("tells show and hide apart from cut", () => {
    const verdict = scene(
      [{ id: "open", actions: [{ do: "show", targets: ["street", "gone"] }] }],
      [{ id: "room", kind: "image" }, { id: "street", kind: "image", initial: "hidden" }, { id: "gone", kind: "text", text: "GONE" }],
    );
    expect(verdict.scene.beats[0].actions).toEqual([{ do: "show", targets: ["gone"] }]);
    expect(verdict.problems[0]).toContain("brought on with cut");
  });
});

describe("the timeline", () => {
  const playable = (beats: unknown[], objects?: unknown[]): FilmScene => scene(beats, objects).scene;

  it("starts each beat when its words are spoken", () => {
    const words = narrationWords(NARRATION).length; // 18
    const resolved = resolveScene(
      playable([
        { id: "open", actions: [{ do: "camera", target: "room" }] },
        { id: "dark", say: "darker than ever", actions: [{ do: "flash" }] },
        { id: "moon", say: "the Moon", actions: [{ do: "camera", target: "room.moon" }] },
      ]),
      18,
    );
    expect(words).toBe(18);
    expect(resolved.cues).toEqual([{ word: 6, at: 6 }, { word: 10, at: 10 }]);
    expect(resolved.flashes).toEqual([6]);
    expect(resolved.duration).toBeGreaterThanOrEqual(18.6);
  });

  it("scales with the voice: twice the floor, twice the cue times", () => {
    const beats = [{ id: "a", actions: [{ do: "flash" }] }, { id: "b", say: "the Moon", actions: [{ do: "flash" }] }];
    expect(resolveScene(playable(beats), 9).flashes[1] * 2).toBeCloseTo(resolveScene(playable(beats), 18).flashes[1]);
  });

  it("uses 0.4 s a word when there is no voice", () => {
    expect(floorOf(NARRATION)).toBeCloseTo(7.2);
  });

  it("cuts to another picture and takes that picture's labels off", () => {
    const resolved = resolveScene(
      playable(
        [
          { id: "open", actions: [{ do: "label", target: "room.moon", text: "Moon" }] },
          { id: "out", say: "the Moon", actions: [{ do: "cut", to: "street" }] },
        ],
        [{ id: "room", kind: "image" }, { id: "street", kind: "image", initial: "hidden" }],
      ),
      18,
    );
    expect(backdropAt(resolved, 0)).toBe("room");
    expect(backdropAt(resolved, 10.1)).toBe("street");
    expect(resolved.labels[0].until).toBe(10);
  });

  it("hides what a later beat hides", () => {
    const resolved = resolveScene(
      playable(
        [
          { id: "on", actions: [{ do: "show", targets: ["gone"], entrance: "slam" }] },
          { id: "off", say: "Nothing else", actions: [{ do: "hide", targets: ["gone"] }] },
        ],
        [{ id: "room", kind: "image" }, { id: "gone", kind: "text", text: "GONE" }],
      ),
      18,
    );
    expect(resolved.overlays[0]).toMatchObject({ at: 0, until: 14 });
  });
});

describe("the compiler", () => {
  const one = scene([{ id: "open", actions: [{ do: "camera", target: "room" }] }]).scene;

  it("grows without moving the scenes it already has", () => {
    const compiler = createFilmCompiler({ version: "1", title: "t", look: "movie" });
    const slide = compiler.slide;
    const first = compiler.add(one, 10);
    const before = slide.duration;
    const second = compiler.add({ ...one, id: "s2" }, 4);
    expect(compiler.slide).toBe(slide); // the same object: a player holding it keeps playing
    expect(compiler.spans()[0]).toEqual(first);
    expect(second.start).toBe(first.end);
    expect(slide.duration).toBeGreaterThan(before);
    expect(compiler.sceneAt(first.end - 0.01)).toBe(0);
    expect(compiler.sceneAt(first.end)).toBe(1);
  });
});

describe("playback", () => {
  const start = (): Cursor => ({ scene: 0, local: 0, started: false, playing: true });
  /** Run frames of `dt` seconds until `seconds` have passed; returns every phase seen, without repeats. */
  const run = (cursor: Cursor, seconds: number, lengths: number[], generating: boolean, dt = 0.25) => {
    const seen: string[] = [];
    for (let t = 0; t < seconds; t += dt) {
      const { phase } = advance(cursor, dt, lengths, generating, null);
      if (seen.at(-1) !== phase) seen.push(phase);
    }
    return seen;
  };

  it("does nothing until told to play", () => {
    const cursor = { ...start(), playing: false };
    expect(advance(cursor, 1, [5], true, null).phase).toBe("idle");
    expect(cursor.local).toBe(0);
  });

  it("waits for a scene that has not arrived, then carries on when it does", () => {
    const cursor = start();
    expect(run(cursor, 8, [3], true)).toEqual(["playing", "buffering"]);
    expect(cursor).toMatchObject({ scene: 1, local: 0, playing: true });
    // The next scene arrives: the same cursor plays it from its start.
    const next = advance(cursor, 0.25, [3, 4], true, null);
    expect(next).toEqual({ phase: "playing", begin: 1 });
    expect(run(cursor, 6, [3, 4], true)).toEqual(["playing", "buffering"]);
  });

  it("finishes only when the film is complete", () => {
    const cursor = start();
    expect(run(cursor, 5, [3], true).at(-1)).toBe("buffering");
    expect(run(cursor, 1, [3], false)).toEqual(["finished"]);
    expect(cursor.playing).toBe(false);
  });

  it("follows the voice's clock when there is one, and elapsed time after it ends", () => {
    const cursor = start();
    advance(cursor, 0.25, [10], false, null); // begins the scene
    advance(cursor, 0.25, [10], false, 4.2);
    expect(cursor.local).toBe(4.2);
    advance(cursor, 0.25, [10], false, null); // the voice has ended; the tail runs on elapsed time
    expect(cursor.local).toBeCloseTo(4.45);
  });

  it("says which scene began and which ended, so the player can start and stop their voices", () => {
    const cursor = start();
    expect(advance(cursor, 0.5, [1, 1], false, null)).toEqual({ phase: "playing", begin: 0 });
    advance(cursor, 0.5, [1, 1], false, null);
    expect(advance(cursor, 0.5, [1, 1], false, null)).toEqual({ phase: "playing", end: 0 });
    expect(advance(cursor, 0.5, [1, 1], false, null)).toEqual({ phase: "playing", begin: 1 });
  });

  it("holds its place while paused", () => {
    const cursor = start();
    run(cursor, 2, [10], false);
    const at = cursor.local;
    cursor.playing = false;
    expect(advance(cursor, 5, [10], false, null).phase).toBe("paused");
    expect(cursor.local).toBe(at);
  });
});

describe("word times from the voice", () => {
  it("gives each narration word the second it is heard, across spelling differences", () => {
    const heard = [
      { word: "The", start: 0, end: 0.2 },
      { word: "next", start: 0.2, end: 0.5 },
      { word: "24", start: 0.5, end: 1.1 }, // the narration says "twenty-four"
      { word: "hours", start: 1.1, end: 1.6 },
      { word: "matter.", start: 2.4, end: 2.9 },
    ];
    expect(alignWords("The next twenty-four hours matter.", heard, 3)).toEqual([0, 0.2, 0.65, 1.1, 2.4]);
  });

  it("moves a beat to the measured word instead of the even-rate guess", () => {
    const beats = [{ id: "a", actions: [{ do: "flash" }] }, { id: "b", say: "the Moon", actions: [{ do: "flash" }] }];
    const playable = validateScene({ objects: [{ id: "room", kind: "image" }], beats }, PICTURES, "s1", NARRATION).scene;
    const times = narrationWords(NARRATION).map((_, i) => i * 0.5 + (i >= 10 ? 3 : 0)); // a long pause before "the Moon"
    expect(resolveScene(playable, 18).flashes[1]).toBe(10);
    expect(resolveScene(playable, 18, times).flashes[1]).toBe(8);
    expect(resolveScene(playable, 18, times.slice(1)).flashes[1]).toBe(10); // a mismatched list is ignored
  });
});

describe("a figure's line and how a shot arrives", () => {
  const objects = [{ id: "room", kind: "image" }, { id: "street", kind: "image", initial: "hidden" }];

  it("keeps a line on a found part and drops one aimed at nothing", () => {
    const verdict = validateScene(
      { objects, beats: [{ id: "a", actions: [{ do: "speak", target: "room.bed", text: "I can't get UP." }, { do: "speak", target: "room.lamp", text: "Hi" }] }] },
      PICTURES,
      "s1",
      NARRATION,
    );
    expect(verdict.scene.beats[0].actions).toEqual([{ do: "speak", target: "room.bed", text: "I can't get UP." }]);
  });

  it("shows one line at a time and takes it off at a cut", () => {
    const verdict = validateScene(
      {
        objects,
        beats: [
          { id: "a", actions: [{ do: "speak", target: "room.bed", text: "First." }] },
          { id: "b", say: "darker than ever", actions: [{ do: "speak", target: "room.moon", text: "Second." }] },
          { id: "c", say: "the Moon", actions: [{ do: "cut", to: "street", entrance: "iris" }] },
        ],
      },
      PICTURES,
      "s1",
      NARRATION,
    );
    const resolved = resolveScene(verdict.scene, 18);
    expect(resolved.speeches.map((line) => [line.at, line.until])).toEqual([[0, 6], [6, 10]]);
    expect(resolved.backdrops).toEqual([{ at: 0, picture: "room", entrance: "cut" }, { at: 10, picture: "street", entrance: "iris" }]);
  });
});

describe("the explainer vocabulary", () => {
  const ROOM = [{ id: "room", kind: "image" }];

  it("keeps arrows between parts or from an edge, and refuses ones it cannot draw", () => {
    const verdict = scene([
      {
        id: "open",
        actions: [
          { do: "arrow", from: "room.bed", to: "room.moon", text: "look up", style: "dashed", color: "cool", id: "path" },
          { do: "arrow", from: "left", to: "room.bed" },
          { do: "arrow", from: "left", to: "right" },
          { do: "arrow", from: "room.moon", to: "street" },
          { do: "arrow", from: "room.moon", to: "room.lamp" },
        ],
      },
    ]);
    expect(verdict.scene.beats[0].actions).toEqual([
      { do: "arrow", from: "room.bed", to: "room.moon", text: "look up", style: "dashed", color: "cool", id: "path" },
      { do: "arrow", from: "left", to: "room.bed" },
    ]);
    expect(verdict.problems.join("\n")).toContain("not two edges");
    expect(verdict.problems.join("\n")).toContain('"room.lamp" was not found');
  });

  it("keeps marks, measures, icons and effects, and lets their ids be hidden", () => {
    const verdict = scene([
      {
        id: "open",
        actions: [
          { do: "attention", target: "room.moon", verb: "cross", color: "danger" },
          { do: "measure", target: "room.bed", text: "2 metres", side: "above", id: "size" },
          { do: "measure", target: "room", text: "too big" },
          { do: "icon", target: "room.moon", icon: "question", id: "huh" },
          { do: "icon", target: "room.moon", icon: "banana" },
          { do: "effect", target: "room", kind: "rain", id: "wet" },
        ],
      },
      { id: "dark", say: "darker than ever", actions: [{ do: "hide", targets: ["size", "huh", "wet"] }] },
    ]);
    expect(verdict.scene.beats[0].actions.map((a) => a.do)).toEqual(["attention", "measure", "icon", "effect"]);
    expect(verdict.scene.beats[1].actions).toEqual([{ do: "hide", targets: ["size", "huh", "wet"] }]);
    expect(verdict.problems).toHaveLength(2);
  });

  it("keeps dates, timelines and lists, and allows one advance per entry after the first", () => {
    const verdict = scene(
      [
        { id: "open", actions: [{ do: "show", targets: ["when", "story", "why"] }] },
        { id: "a", say: "darker than ever", actions: [{ do: "advance", target: "story" }, { do: "advance", target: "why" }] },
        { id: "b", say: "the Moon", actions: [{ do: "advance", target: "story" }, { do: "advance", target: "why" }] },
      ],
      [
        ...ROOM,
        { id: "when", kind: "date", text: "July 1969", from: 1950 },
        { id: "story", kind: "timeline", events: [{ date: "1957", text: "Sputnik" }, { date: 1969, text: "Apollo 11" }] },
        { id: "why", kind: "list", title: "Why", items: ["Gravity", "Light", "Tides"] },
      ],
    );
    expect(verdict.scene.objects.find((o) => o.id === "story")).toEqual({ id: "story", kind: "timeline", events: [{ date: "1957", text: "Sputnik" }, { date: "1969", text: "Apollo 11" }] });
    expect(verdict.scene.objects.find((o) => o.id === "when")).toMatchObject({ kind: "date", text: "July 1969", from: 1950 });
    expect(verdict.scene.beats[2].actions).toEqual([{ do: "advance", target: "why" }]);
    expect(verdict.problems.join("\n")).toContain('"story" has no entry left');
  });

  it("times a timeline's entries, and ties arrows and effects to their picture", () => {
    const resolved = resolveScene(
      scene(
        [
          { id: "open", actions: [{ do: "show", targets: ["why"] }, { do: "arrow", from: "top", to: "room.moon" }, { do: "effect", target: "room.bed", kind: "fire" }] },
          { id: "a", say: "darker than ever", actions: [{ do: "advance", target: "why" }] },
          { id: "out", say: "the Moon", actions: [{ do: "cut", to: "street" }] },
        ],
        [...ROOM, { id: "street", kind: "image", initial: "hidden" }, { id: "why", kind: "list", items: ["Gravity", "Light"] }],
      ).scene,
      18,
    );
    expect(resolved.overlays[0].item.steps).toEqual([0, 6]);
    expect(resolved.arrows[0]).toMatchObject({ at: 0, until: 10, item: { picture: "room", from: { edge: "top" }, to: { part: "moon" } } });
    expect(resolved.effects[0]).toMatchObject({ until: 10, item: { kind: "fire", part: "bed" } });
    // The list is placed on the screen, not on the picture, so it stays through the cut.
    expect(resolved.overlays[0].until).toBe(Infinity);
  });
});
