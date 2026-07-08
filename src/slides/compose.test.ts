import { describe, expect, it, vi } from "vitest";

import { composeSlides } from "./compose";
import type { CanvasSlideDefinition } from "./types";

function scene(duration: number, extra: Partial<CanvasSlideDefinition> = {}): CanvasSlideDefinition {
  return { duration, viewW: 920, viewH: 430, render: () => {}, ...extra };
}

describe("composeSlides metadata", () => {
  it("throws on an empty scene array", () => {
    expect(() => composeSlides([])).toThrow("at least one scene");
  });

  it("throws when a scene's view space differs from scene 0", () => {
    const odd = { ...scene(10), viewW: 800 };
    expect(() => composeSlides([scene(10), odd])).toThrow("view space");
  });

  it("computes total duration as sum minus overlaps", () => {
    const film = composeSlides([scene(10), scene(20), scene(30)], { crossfade: 2 });
    expect(film.duration).toBe(56); // 60 − 2 overlaps × 2 s
    expect(film.viewW).toBe(920);
    expect(film.viewH).toBe(430);
  });

  it("keeps a single scene's duration unchanged", () => {
    expect(composeSlides([scene(26)]).duration).toBe(26);
  });

  it("clamps an oversized crossfade to half the shortest scene and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const film = composeSlides([scene(4), scene(10)], { crossfade: 3 });
    expect(film.duration).toBe(12); // clamped to 2 s → 14 − 2
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("treats a negative crossfade as 0", () => {
    const film = composeSlides([scene(10), scene(10)], { crossfade: -5 });
    expect(film.duration).toBe(20);
  });

  it("shifts captions by scene start and drops ones at/past the next scene's window", () => {
    const a = scene(10, {
      captions: [
        { at: 0, text: "a0" },
        { at: 9.5, text: "a-late" },
      ],
    });
    const b = scene(10, { captions: [{ at: 1, text: "b0" }] });
    const film = composeSlides([a, b], { crossfade: 2 });
    // b's window starts at 8, so a's caption shifted to 9.5 is dropped; b's lands at 8 + 1 = 9
    expect(film.captions).toEqual([
      { at: 0, text: "a0" },
      { at: 9, text: "b0" },
    ]);
  });

  it("returns undefined captions when no scene has any", () => {
    expect(composeSlides([scene(5), scene(5)]).captions).toBeUndefined();
  });
});
