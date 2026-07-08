import { describe, expect, it } from "vitest";

import { remapSceneTime } from "./timings";

describe("remapSceneTime", () => {
  it("is the identity when authored times equal real times", () => {
    // authored scene 0..20 with captions at 5,10; real span identical
    const f = remapSceneTime([5, 10], [5, 10], 20, 0, 20);
    expect(f(0)).toBeCloseTo(0);
    expect(f(5)).toBeCloseTo(5);
    expect(f(10)).toBeCloseTo(10);
    expect(f(20)).toBeCloseTo(20);
    expect(f(7.5)).toBeCloseTo(7.5);
  });

  it("maps authored caption times onto shifted real caption times", () => {
    // real scene runs 100..130 (30s), captions spoken at 106 and 120;
    // authored scene is 0..20 with captions at 5 and 10.
    const f = remapSceneTime([5, 10], [106, 120], 20, 100, 130);
    expect(f(100)).toBeCloseTo(0); // scene start → authored 0
    expect(f(106)).toBeCloseTo(5); // first sentence spoken → authored beat 5
    expect(f(120)).toBeCloseTo(10); // second sentence → authored beat 10
    expect(f(130)).toBeCloseTo(20); // scene end → authored duration
    // midpoint of first real segment (100→106) maps to midpoint of authored (0→5)
    expect(f(103)).toBeCloseTo(2.5);
  });

  it("is monotonic non-decreasing across the span", () => {
    const f = remapSceneTime([4, 9, 15], [102, 110, 121], 18, 100, 126);
    let prev = -Infinity;
    for (let t = 100; t <= 126; t += 0.5) {
      const v = f(t);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it("clamps out-of-range input to the authored endpoints", () => {
    const f = remapSceneTime([5], [107], 12, 100, 115);
    expect(f(50)).toBeCloseTo(0); // before start
    expect(f(999)).toBeCloseTo(12); // after end
  });

  it("falls back to a linear stretch when caption arrays mismatch or are empty", () => {
    const f = remapSceneTime([], [], 20, 100, 140); // 40s real → 20s authored, 2× compression
    expect(f(100)).toBeCloseTo(0);
    expect(f(120)).toBeCloseTo(10);
    expect(f(140)).toBeCloseTo(20);
    const g = remapSceneTime([5, 10], [106], 20, 100, 130); // length mismatch → linear
    expect(g(115)).toBeCloseTo(10); // halfway through 100..130 → 10 of 20
  });

  it("survives non-increasing real knots without dividing by zero", () => {
    const f = remapSceneTime([5, 10], [110, 110], 20, 100, 120); // duplicate real caption times
    expect(Number.isFinite(f(110))).toBe(true);
    expect(f(100)).toBeCloseTo(0);
    expect(f(120)).toBeCloseTo(20);
  });
});
