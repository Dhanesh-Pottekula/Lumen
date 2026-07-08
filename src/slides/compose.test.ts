import { afterEach, describe, expect, it, vi } from "vitest";

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

function recordingScene(duration: number) {
  const calls: { localT: number; alpha: number }[] = [];
  const def: CanvasSlideDefinition = {
    duration,
    viewW: 920,
    viewH: 430,
    render: (ctx, t) => calls.push({ localT: t, alpha: ctx.globalAlpha }),
  };
  return { def, calls };
}

function stubCtx() {
  const stack: number[] = [];
  const ctx: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: "",
    save() {
      stack.push(ctx.globalAlpha as number);
    },
    restore() {
      ctx.globalAlpha = stack.pop() ?? 1;
    },
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  return ctx as unknown as CanvasRenderingContext2D & { arc: ReturnType<typeof vi.fn> };
}

describe("composeSlides render", () => {
  // two 10 s scenes, 2 s crossfade → windows [0,10) and [8,18), duration 18
  it("renders only the active scene at its local time", () => {
    const a = recordingScene(10);
    const b = recordingScene(10);
    const film = composeSlides([a.def, b.def], { crossfade: 2, progressDots: false });

    film.render(stubCtx(), 5);
    expect(a.calls).toEqual([{ localT: 5, alpha: 1 }]);
    expect(b.calls).toEqual([]);
  });

  it("renders both scenes during the crossfade with complementary alphas", () => {
    const a = recordingScene(10);
    const b = recordingScene(10);
    const film = composeSlides([a.def, b.def], { crossfade: 2, progressDots: false });

    film.render(stubCtx(), 9); // midpoint of the [8,10) overlap
    expect(a.calls).toEqual([{ localT: 9, alpha: 0.5 }]);
    expect(b.calls).toEqual([{ localT: 1, alpha: 0.5 }]);
  });

  it("hands over fully after the crossfade", () => {
    const a = recordingScene(10);
    const b = recordingScene(10);
    const film = composeSlides([a.def, b.def], { crossfade: 2, progressDots: false });

    film.render(stubCtx(), 14);
    expect(a.calls).toEqual([]);
    expect(b.calls).toEqual([{ localT: 6, alpha: 1 }]);
  });

  it("renders a single scene as passthrough (no fade, no dots)", () => {
    const a = recordingScene(10);
    const ctx = stubCtx();
    const film = composeSlides([a.def]);

    film.render(ctx, 0);
    expect(a.calls).toEqual([{ localT: 0, alpha: 1 }]);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("draws one progress dot per scene by default", () => {
    const a = recordingScene(10);
    const b = recordingScene(10);
    const ctx = stubCtx();
    composeSlides([a.def, b.def], { crossfade: 2 }).render(ctx, 5);
    expect(ctx.arc).toHaveBeenCalledTimes(2);
  });

  it("draws no dots when progressDots is false", () => {
    const a = recordingScene(10);
    const b = recordingScene(10);
    const ctx = stubCtx();
    composeSlides([a.def, b.def], { crossfade: 2, progressDots: false }).render(ctx, 5);
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it("renders the last scene at full alpha on the final frame when crossfade is 0", () => {
    const a = recordingScene(10);
    const b = recordingScene(10);
    const film = composeSlides([a.def, b.def], { crossfade: 0, progressDots: false });

    film.render(stubCtx(), film.duration);
    expect(b.calls).toEqual([{ localT: 10, alpha: 1 }]);
  });
});

/** A scene that misbehaves like real scenes: self-clears and sets globalAlpha absolutely. */
function nonCooperativeScene(duration: number) {
  const calls: { localT: number }[] = [];
  const def: CanvasSlideDefinition = {
    duration,
    viewW: 920,
    viewH: 430,
    render: (ctx, t) => {
      calls.push({ localT: t });
      ctx.clearRect(0, 0, 920, 430);
      ctx.globalAlpha = 1;
    },
  };
  return { def, calls };
}

/** Fake DOM + buffer-capable main ctx, so composeSlides takes the offscreen-buffer path. */
function bufferCapableCtx() {
  const stack: number[] = [];
  const drawImageAlphas: number[] = [];
  const ctx: Record<string, unknown> = {
    canvas: { width: 1840, height: 860 },
    globalAlpha: 1,
    fillStyle: "",
    save() {
      stack.push(ctx.globalAlpha as number);
    },
    restore() {
      ctx.globalAlpha = stack.pop() ?? 1;
    },
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    getTransform: () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }),
    setTransform: vi.fn(),
    drawImage: vi.fn(() => {
      drawImageAlphas.push(ctx.globalAlpha as number);
    }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawImageAlphas };
}

function fakeBufferCanvas() {
  const bufCtx: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: "",
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
  return {
    width: 0,
    height: 0,
    getContext: () => bufCtx,
  };
}

describe("composeSlides render — offscreen buffer path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("composites a non-cooperative scene's output under the envelope alpha during a crossfade", () => {
    vi.stubGlobal("document", { createElement: () => fakeBufferCanvas() });

    const a = nonCooperativeScene(10);
    const b = nonCooperativeScene(10);
    const film = composeSlides([a.def, b.def], { crossfade: 2, progressDots: false });

    const { ctx, drawImageAlphas } = bufferCapableCtx();
    film.render(ctx, 9); // midpoint of the [8,10) overlap → 0.5 / 0.5

    expect(a.calls).toEqual([{ localT: 9 }]);
    expect(b.calls).toEqual([{ localT: 1 }]);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(drawImageAlphas).toEqual([0.5, 0.5]);
  });
});
