import { describe, expect, it } from "vitest";
import { CUTOUT_SIZE, cutoutAt, cutoutBox, frameMargins, keptInFrame, placeOf, resolveScene, sizeShare } from "./resolve";
import type { FilmScene, PictureRow } from "./types";
import { validateScene, withPictures } from "./validate";

const rows: PictureRow[] = [
  { id: "desert", parts: ["dune", "well"] },
  { id: "town", parts: ["gate"] },
  { id: "man", parts: [], cutout: true },
  { id: "man-kneeling", parts: [], cutout: true },
];
const narration = "A man stands by the dune. He walks toward the well and kneels to drink. Then the town appears far away.";
const objects = [
  { id: "desert", kind: "image" },
  { id: "town", kind: "image", initial: "hidden" },
  { id: "man", kind: "image" },
  { id: "man-kneeling", kind: "image" },
];
const check = (beats: unknown[], declared: unknown[] = objects) => validateScene({ objects: declared, beats }, rows, "s1", narration);

/** A checked scene with its pictures filled in, as the player receives it. */
function played(beats: unknown[], declared: unknown[] = objects): FilmScene {
  const verdict = check(beats, declared);
  expect(verdict.problems).toEqual([]);
  return withPictures(verdict.scene, {
    desert: { src: "desert.png", aspect: 1.5, hotspots: { dune: [0.1, 0.5, 0.2, 0.3], well: [0.7, 0.6, 0.1, 0.2] } },
    town: { src: "town.png", aspect: 1.5, hotspots: { gate: [0.4, 0.4, 0.2, 0.4] } },
    man: { src: "man.png", aspect: 0.5, cutout: true },
    "man-kneeling": { src: "kneel.png", aspect: 0.7, cutout: true },
  });
}

const walk = [
  { id: "a", actions: [{ do: "place", what: "man", at: "desert.dune", where: "before", size: "small", entrance: "appear" }] },
  { id: "b", say: "He walks toward", pace: "slow", actions: [{ do: "move", what: "man", to: "desert.well", where: "left-of", lasts: "until-next" }] },
  { id: "c", say: "kneels", pace: "quick", actions: [{ do: "swap", what: "man", to: "man-kneeling" }] },
  { id: "d", say: "the town appears", actions: [{ do: "cut", to: "town" }] },
];

describe("checking cut-out actions", () => {
  it("accepts a cut-out that is placed, moved, swapped, and left behind by a cut", () => {
    const verdict = check(walk);
    expect(verdict.problems).toEqual([]);
    expect(verdict.scene.objects.filter((o) => o.kind === "image" && o.cutout).map((o) => o.id)).toEqual(["man", "man-kneeling"]);
  });

  it("opens on a background, never on a cut-out, even when the cut-out is declared first", () => {
    const verdict = check(walk, [objects[2], objects[3], objects[0], objects[1]]);
    expect(verdict.problems).toEqual([]);
    expect(resolveScene(played(walk), 20).backdrops[0].picture).toBe("desert");
  });

  it("refuses to move a cut-out that is not on screen", () => {
    const verdict = check([{ id: "a", actions: [{ do: "move", what: "man", to: "desert.well" }] }]);
    expect(verdict.problems.join("\n")).toContain("not on screen yet");
  });

  it("refuses a place that is not on the background now on screen", () => {
    const verdict = check([{ id: "a", actions: [{ do: "place", what: "man", at: "town.gate" }] }]);
    expect(verdict.problems.join("\n")).toContain("not a place on the background now on screen (desert)");
    expect(check([{ id: "a", actions: [{ do: "place", what: "man", at: "desert.oasis" }] }]).problems.join("\n")).toContain("was not found");
  });

  it("takes a cut-out off with its background, so it must be placed again after a cut", () => {
    const verdict = check([
      { id: "a", actions: [{ do: "place", what: "man", at: "left" }] },
      { id: "b", say: "the town appears", actions: [{ do: "cut", to: "town" }, { do: "move", what: "man", to: "town.gate" }] },
    ]);
    expect(verdict.problems.join("\n")).toContain("not on screen yet");
  });

  it("keeps the camera and marks on backgrounds, and says so", () => {
    const verdict = check([{ id: "a", actions: [{ do: "place", what: "man", at: "left" }, { do: "label", target: "man", text: "A man" }] }]);
    expect(verdict.problems.join("\n")).toContain('"man" is a cut-out');
  });

  it("reports a cut-out that is declared and never put on screen", () => {
    const verdict = check([{ id: "a", actions: [{ do: "place", what: "man", at: "left" }] }]);
    expect(verdict.problems.join("\n")).toContain('the cut-out "man-kneeling" is never put on screen');
  });

  it("treats a background named in place as a mistake worth explaining", () => {
    expect(check([{ id: "a", actions: [{ do: "place", what: "town", at: "left" }] }]).problems.join("\n")).toContain("is a background");
  });
});

describe("a cut-out's path through time", () => {
  const scene = resolveScene(played(walk), 20);
  const track = scene.cutouts[0];

  it("stands with its feet at the foot of the part it was placed before", () => {
    const now = cutoutAt(track, 0.1)!;
    expect(now.state.x).toBeCloseTo(0.2, 3);
    expect(now.state.y).toBeCloseTo(0.8, 3);
    expect(now.state.feet).toBe(1);
    expect(now.state.size).toBe(CUTOUT_SIZE.small);
    expect(now.state.alpha).toBe(1);
  });

  it("travels for as long as the voice is on it, and arrives beside the part it was sent to", () => {
    const move = track.keys[1];
    const swap = track.keys[2];
    // The move runs from its own words to the next beat's.
    expect(move.at + move.dur).toBeCloseTo(swap.at, 3);
    const half = cutoutAt(track, move.at + move.dur / 2)!;
    expect(half.state.x).toBeGreaterThan(0.25);
    expect(half.state.x).toBeLessThan(0.65);
    const end = cutoutAt(track, swap.at - 0.001)!;
    expect(end.state.x).toBeLessThan(0.7);
    expect(end.state.x).toBeGreaterThan(0.6);
    expect(end.state.y).toBeCloseTo(0.8, 2);
  });

  it("changes pose in place on a swap", () => {
    const swap = track.keys[2];
    expect(cutoutAt(track, swap.at - 0.01)!.image).toBe("man");
    const after = cutoutAt(track, swap.at + 0.01)!;
    expect(after.image).toBe("man-kneeling");
    expect(after.state.y).toBeCloseTo(0.8, 2);
  });

  it("is gone once the background changes", () => {
    const cut = scene.backdrops[1].at;
    expect(track.until).toBe(cut);
    expect(cutoutAt(track, cut + 0.01)).toBeNull();
    expect(cutoutAt(track, -1)).toBeNull();
  });

  it("is the same at the same instant, whatever was asked before", () => {
    expect(cutoutAt(track, 7.3)).toEqual(cutoutAt(track, 7.3));
  });
});

describe("paths, zones and edges", () => {
  const hop = [
    { id: "a", actions: [{ do: "place", what: "man", at: "left", entrance: "appear" }, { do: "place", what: "man-kneeling", at: "off-right", size: "tiny", entrance: "appear" }] },
    { id: "b", say: "He walks toward", pace: "normal", actions: [{ do: "move", what: "man", to: "right", path: "arc" }, { do: "move", what: "man-kneeling", to: "off-left" }] },
    { id: "c", say: "kneels", pace: "quick", actions: [{ do: "remove", what: "man", exit: "fade" }, { do: "turn", what: "man-kneeling", mirror: true, tilt: "over" }] },
  ];
  // The town is left out here: a background that is declared and never shown is itself a problem.
  const scene = resolveScene(played(hop, [objects[0], objects[2], objects[3]]), 20);
  const [man, other] = scene.cutouts;

  it("lifts a cut-out off its line in the middle of an arc and sets it down at the end", () => {
    const move = man.keys[1];
    expect(cutoutAt(man, move.at + move.dur / 2)!.lift).toBeGreaterThan(0.05);
    expect(cutoutAt(man, move.at + move.dur + 0.01)!.lift).toBe(0);
  });

  it("puts a zone inside the part of the picture the frame shows", () => {
    const { my } = frameMargins(1.5);
    expect(my).toBeCloseTo(0.078, 3);
    const now = cutoutAt(man, 0.1)!.state;
    expect(now.feet).toBe(0);
    expect(now.y).toBeGreaterThan(my);
    expect(now.y).toBeLessThan(1 - my);
  });

  it("starts and ends an edge-to-edge crossing outside the frame, at one height", () => {
    const start = cutoutAt(other, 0.1)!.state;
    const move = other.keys[1];
    const end = cutoutAt(other, move.at + move.dur + 0.01)!.state;
    expect(start.x).toBeGreaterThan(1);
    expect(end.x).toBeLessThan(0);
    expect(end.y).toBeCloseTo(start.y, 6);
  });

  it("fades a removed cut-out out and then stops drawing it", () => {
    const gone = man.keys[2];
    expect(cutoutAt(man, gone.at + gone.dur / 2)!.state.alpha).toBeLessThan(1);
    expect(cutoutAt(man, gone.at + gone.dur + 0.01)).toBeNull();
  });

  it("turns a cut-out over and mirrors it", () => {
    const turn = other.keys[2];
    const after = cutoutAt(other, turn.at + turn.dur + 0.01)!.state;
    expect(after.flip).toBe(-1);
    expect(after.tilt).toBe(180);
  });
});

describe("a cut-out's size and the frame", () => {
  // The edges of a cut-out in shares of the frame, from its state and shape.
  const edges = (state: { x: number; y: number; size: number; feet: number }, aspect: number, ground = 1.5) => {
    const { mx, my } = frameMargins(ground);
    const box = cutoutBox(state.size, aspect);
    const vx = (state.x - mx) / (1 - 2 * mx);
    const vy = (state.y - my) / (1 - 2 * my);
    const above = box.h * (0.5 + 0.5 * state.feet);
    return { left: vx - box.w / 2, right: vx + box.w / 2, top: vy - above, bottom: vy - above + box.h };
  };

  it("takes a size as height, unless the thing is too wide for that", () => {
    // A standing figure, half as wide as tall: the size is its height.
    expect(cutoutBox(CUTOUT_SIZE.huge, 0.5).h).toBe(CUTOUT_SIZE.huge);
    // A figure stretched four times as wide as tall: fitted by its width, and never wider than the frame.
    const long = cutoutBox(CUTOUT_SIZE.huge, 4);
    expect(long.w).toBeLessThanOrEqual(0.9);
    expect(long.h).toBeLessThan(CUTOUT_SIZE.huge);
    // Its shape is kept.
    expect((long.w * (16 / 9)) / long.h).toBeCloseTo(4, 5);
  });

  it("keeps every size of every shape wholly inside the frame, in every zone", () => {
    for (const size of Object.values(CUTOUT_SIZE)) {
      for (const aspect of [0.4, 1, 2.5, 5]) {
        for (const [x, y, feet] of [[0.02, 0.1, 0], [0.98, 0.95, 1], [0.5, 0.5, 0], [0.9, 0.2, 1]] as const) {
          const kept = keptInFrame({ x, y, feet }, size, aspect, 1.5);
          const e = edges({ ...kept, size }, aspect);
          expect(e.left).toBeGreaterThanOrEqual(0.029);
          expect(e.right).toBeLessThanOrEqual(0.971);
          // One taller than the room between the top and the subtitles is centred in that room.
          if (cutoutBox(size, aspect).h < 0.82) {
            expect(e.top).toBeGreaterThanOrEqual(0.039);
            expect(e.bottom).toBeLessThanOrEqual(0.861);
          }
        }
      }
    }
  });

  it("leaves a cut-out that already fits exactly where it was put", () => {
    const spot = { x: 0.5, y: 0.5, feet: 0 };
    expect(keptInFrame(spot, CUTOUT_SIZE.small, 1, 1.5)).toEqual(spot);
  });

  it("holds a large cut-out placed in a corner inside the frame, and one swapped to a long pose too", () => {
    const beats = [
      { id: "a", actions: [{ do: "place", what: "man", at: "bottom-right", size: "large", entrance: "appear" }] },
      { id: "b", say: "kneels", actions: [{ do: "swap", what: "man", to: "man-kneeling" }, { do: "resize", what: "man-kneeling", size: "huge" }] },
    ];
    const verdict = validateScene({ objects: [objects[0], objects[2], objects[3]], beats }, rows, "s1", narration);
    expect(verdict.problems).toEqual([]);
    const scene = withPictures(verdict.scene, {
      desert: { src: "d.png", aspect: 1.5, hotspots: {} },
      man: { src: "m.png", aspect: 0.5, cutout: true },
      // The second pose is a long one: five times as wide as it is tall.
      "man-kneeling": { src: "k.png", aspect: 5, cutout: true },
    });
    const track = resolveScene(scene, 20).cutouts[0];
    const first = edges(cutoutAt(track, 0.1)!.state, 0.5);
    expect(first.right).toBeLessThanOrEqual(0.971);
    expect(first.bottom).toBeLessThanOrEqual(0.861);
    const last = edges(cutoutAt(track, 19)!.state, 5);
    expect(last.left).toBeGreaterThanOrEqual(0.029);
    expect(last.right).toBeLessThanOrEqual(0.971);
  });
});

describe("sizes measured from the drawing", () => {
  // A street with a near door (tall in the drawing) and a far door (short in it).
  const street = { id: "street", kind: "image" as const, aspect: 1.5, hotspots: { "near-door": [0.1, 0.4, 0.1, 0.4], "far-door": [0.7, 0.5, 0.03, 0.1] } as Record<string, [number, number, number, number]> };
  const streetRows: PictureRow[] = [{ id: "street", parts: ["near-door", "far-door"] }, { id: "man", parts: [], cutout: true }];
  const said = "A man stands at the near door. He walks to the far door and looks small there.";
  const checkStreet = (beats: unknown[]) => validateScene({ objects: [{ id: "street", kind: "image" }, { id: "man", kind: "image" }], beats }, streetRows, "s1", said);

  it("works a size out from the part's box: its height in the frame, times the number given", () => {
    const { my } = frameMargins(1.5);
    // The near door is 0.4 of the picture tall; the frame shows a little less than the whole picture.
    expect(sizeShare({ of: "street.near-door", times: 0.85 }, street)).toBeCloseTo((0.4 / (1 - 2 * my)) * 0.85, 6);
    expect(sizeShare({ of: "street.far-door" }, street)).toBeCloseTo(0.1 / (1 - 2 * my), 6);
    // The same man is four times as tall at the near door as at the far one, as the doors are in the drawing.
    expect(sizeShare({ of: "street.near-door", times: 0.85 }, street) / sizeShare({ of: "street.far-door", times: 0.85 }, street)).toBeCloseTo(4, 6);
  });

  it("takes a number as a share of the frame's height, and keeps any size between a speck and the whole frame", () => {
    expect(sizeShare(0.25, street)).toBe(0.25);
    expect(sizeShare(0.001, street)).toBe(0.04);
    expect(sizeShare({ of: "street.near-door", times: 40 }, street)).toBe(0.8);
    // At the most it may be, it still fits whole between the top of the frame and the subtitles.
    const tallest = keptInFrame({ x: 0.5, y: 0.99, feet: 1 }, 0.8, 0.45, 1.5);
    const { my } = frameMargins(1.5);
    const foot = (tallest.y - my) / (1 - 2 * my);
    expect(foot).toBeLessThanOrEqual(0.861);
    expect(foot - 0.8).toBeGreaterThanOrEqual(0.039);
    expect(sizeShare({ of: "street.far-door", times: 0.02 }, street)).toBe(0.04);
  });

  it("still reads the five named sizes, and falls back when the part is not there", () => {
    expect(sizeShare("small", street)).toBe(CUTOUT_SIZE.small);
    expect(sizeShare(undefined, street)).toBe(CUTOUT_SIZE.medium);
    expect(sizeShare({ of: "street.gate" }, street, 0.3)).toBe(0.3);
  });

  it("shrinks a cut-out as it moves to a far part, and stands it on that part's foot at the new size", () => {
    const verdict = checkStreet([
      { id: "a", actions: [{ do: "place", what: "man", at: "street.near-door", where: "before", size: { of: "street.near-door", times: 0.85 }, entrance: "appear" }] },
      { id: "b", say: "He walks to", pace: "slow", actions: [{ do: "move", what: "man", to: "street.far-door", where: "before", size: { of: "street.far-door", times: 0.85 } }] },
    ]);
    expect(verdict.problems).toEqual([]);
    const scene = withPictures(verdict.scene, { street: { src: "s.png", aspect: 1.5, hotspots: street.hotspots }, man: { src: "m.png", aspect: 0.45, cutout: true } });
    const track = resolveScene(scene, 20).cutouts[0];
    const start = cutoutAt(track, 0.1)!.state;
    const move = track.keys[1];
    const middle = cutoutAt(track, move.at + move.dur / 2)!.state;
    const end = cutoutAt(track, move.at + move.dur + 0.01)!.state;
    expect(start.size / end.size).toBeCloseTo(4, 4);
    // On the way it is somewhere between the two sizes.
    expect(middle.size).toBeLessThan(start.size);
    expect(middle.size).toBeGreaterThan(end.size);
    // It arrives with its feet at the far door's foot.
    expect(end.x).toBeCloseTo(0.715, 3);
    expect(end.y).toBeCloseTo(0.6, 3);
    expect(end.feet).toBe(1);
  });

  it("refuses a size measured against a part that was not found, or one that is not on screen, and says how to give one", () => {
    const missing = checkStreet([{ id: "a", actions: [{ do: "place", what: "man", at: "left", size: { of: "street.gate", times: 1 } }] }]);
    expect(missing.problems.join("\n")).toContain('size cannot be measured against "street.gate"');
    const elsewhere = checkStreet([{ id: "a", actions: [{ do: "place", what: "man", at: "left", size: { of: "town.gate" } }] }]);
    expect(elsewhere.problems.join("\n")).toContain("background now on screen (street)");
    const nonsense = checkStreet([{ id: "a", actions: [{ do: "place", what: "man", at: "left", size: "enormous" }] }]);
    expect(nonsense.problems.join("\n")).toContain("share of the frame's height");
    // The cut-out is still placed, at the usual size: a bad size does not lose the action.
    expect(missing.scene.beats[0].actions[0]).toEqual({ do: "place", what: "man", at: "left" });
  });

  it("keeps a measured size on a resize, and drops a resize with no size it can use", () => {
    const good = checkStreet([{ id: "a", actions: [{ do: "place", what: "man", at: "left", size: 0.2 }, { do: "resize", what: "man", size: { of: "street.near-door", times: 2 } }] }]);
    expect(good.problems).toEqual([]);
    expect(good.scene.beats[0].actions[1]).toEqual({ do: "resize", what: "man", size: { of: "street.near-door", times: 2 } });
    const bad = checkStreet([{ id: "a", actions: [{ do: "place", what: "man", at: "left" }, { do: "resize", what: "man" }] }]);
    expect(bad.problems.join("\n")).toContain("resize needs size");
    expect(bad.scene.beats[0].actions).toHaveLength(1);
  });
});

describe("standing a cut-out on a part", () => {
  const room = { id: "room", kind: "image" as const, aspect: 1.5, hotspots: { table: [0.4, 0.5, 0.3, 0.3], floor: [0, 0.7, 1, 0.3], shelf: [0.1, 0.2, 0.2, 0.05] } as Record<string, [number, number, number, number]> };

  it("stands it on a table's upper surface, a little below the top of the box", () => {
    const spot = placeOf("room.table", "on", room, 0.1)!;
    expect(spot.x).toBeCloseTo(0.55, 6);
    expect(spot.y).toBeCloseTo(0.53, 6);
    expect(spot.feet).toBe(1);
  });

  it("stands it in the middle of a floor, whose top edge is its far end", () => {
    const spot = placeOf("room.floor", "on", room, 0.3)!;
    expect(spot.y).toBeCloseTo(0.85, 6);
    expect(spot.feet).toBe(1);
  });

  it("rests a thing about as wide as the part at seat height: a figure lying along a sofa, not on its back", () => {
    const sofa = { id: "lounge", kind: "image" as const, aspect: 1.5, hotspots: { sofa: [0.03, 0.41, 0.46, 0.37] } as Record<string, [number, number, number, number]> };
    // A lying figure, twice as wide as tall, 0.9 times the sofa's height: it spans most of the sofa.
    const lying = placeOf("lounge.sofa", "on", sofa, 0.39, undefined, 2)!;
    expect(lying.y).toBeCloseTo(0.41 + 0.37 * 0.6, 6);
    // A cup on the same sofa is small beside it and stands near the top of the box, as on any surface.
    const cup = placeOf("lounge.sofa", "on", sofa, 0.06, undefined, 0.8)!;
    expect(cup.y).toBeCloseTo(0.41 + 0.37 * 0.1, 6);
  });

  it("does not mistake a narrow or a high part for ground", () => {
    // A shelf is wide for its height but nowhere near the bottom of the picture.
    expect(placeOf("room.shelf", "on", room, 0.1)!.y).toBeCloseTo(0.205, 6);
  });

  it("centres it on the part with at, and stands it at the part's foot with before", () => {
    expect(placeOf("room.table", "at", room, 0.1)).toEqual({ x: 0.55, y: 0.65, feet: 0 });
    expect(placeOf("room.table", "before", room, 0.1)).toEqual({ x: 0.55, y: 0.8, feet: 1 });
  });
});

describe("placing a cut-out at a point in the picture", () => {
  const beats = (at: unknown, where?: string) => [{ id: "a", actions: [{ do: "place", what: "man", at, where, size: 0.2, entrance: "appear" }] }];
  const only = [objects[0], objects[2]];

  it("accepts a point given as shares of the picture, and keeps just its two numbers", () => {
    const verdict = validateScene({ objects: only, beats: beats({ x: 0.4217, y: 0.7, note: "by the rock" }, "on") }, rows, "s1", narration);
    expect(verdict.problems).toEqual([]);
    expect(verdict.scene.beats[0].actions[0]).toMatchObject({ at: { x: 0.422, y: 0.7 } });
  });

  it("refuses a point outside the picture, or one in pixels, and says what a point is", () => {
    const verdict = validateScene({ objects: only, beats: beats({ x: 640, y: 300 }) }, rows, "s1", narration);
    expect(verdict.problems.join("\n")).toContain("each from 0 to 1");
  });

  it("puts the cut-out's middle on the point with at, and stands it on the point otherwise", () => {
    expect(placeOf({ x: 0.3, y: 0.6 }, "at", undefined, 0.2)).toEqual({ x: 0.3, y: 0.6, feet: 0 });
    expect(placeOf({ x: 0.3, y: 0.6 }, "on", undefined, 0.2)).toEqual({ x: 0.3, y: 0.6, feet: 1 });
  });

  it("moves between a point and a named part, and still keeps the cut-out inside the frame", () => {
    const verdict = validateScene(
      { objects: only, beats: [...beats({ x: 0.99, y: 0.99 }, "on"), { id: "b", say: "He walks toward", actions: [{ do: "move", what: "man", to: "desert.well", where: "before" }] }] },
      rows,
      "s1",
      narration,
    );
    expect(verdict.problems).toEqual([]);
    const scene = withPictures(verdict.scene, { desert: { src: "d.png", aspect: 1.5, hotspots: { dune: [0.1, 0.5, 0.2, 0.3], well: [0.7, 0.6, 0.1, 0.2] } }, man: { src: "m.png", aspect: 0.5, cutout: true } });
    const track = resolveScene(scene, 20).cutouts[0];
    const start = cutoutAt(track, 0.1)!.state;
    // The corner asked for would put most of it outside; it is brought in.
    expect(start.x).toBeLessThan(0.97);
    expect(start.y).toBeLessThan(0.9);
    const end = cutoutAt(track, 19)!.state;
    expect(end.x).toBeCloseTo(0.75, 3);
    expect(end.y).toBeCloseTo(0.8, 3);
  });
});
