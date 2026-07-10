# Step 08 — Engagement Grammar (build-steps, predict-reveal, emphasis)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** The pedagogical timing moves as reusable helpers: **progressive disclosure** (build steps),
**predict-and-reveal** beats, and **emphasis choreography** (punch / shake / flash / freeze).

**Architecture:** Pure functions of `t` returning progress/offset values a scene applies. A `Sequencer`
turns an ordered list of `{ at, hold }` beats into per-beat progress; `emphasis` returns a transient
scale/shake/flash envelope around a moment.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; pure; existing suite green; build clean.

## File structure
- Create `src/render/sequence.ts` — `stepProgress`, `emphasis`, `shakeOffset`, `flashAlpha`.
- Create `src/render/sequence.test.ts` — beat progress + emphasis envelope math.

---

### Task 1: build-step + emphasis math

**Interfaces — Produces:**
```ts
stepProgress(t: number, at: number, dur: number): number     // eased 0..1 for one build step
emphasis(t: number, at: number): number                       // 0→1→0 punch envelope around `at`
shakeOffset(t: number, at: number, mag: number): [number,number] // decaying shake around `at`
flashAlpha(t: number, at: number): number                     // quick 0→1→0 flash
```

- [ ] **Step 1: Failing tests** — `src/render/sequence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emphasis, flashAlpha, shakeOffset, stepProgress } from "./sequence";

describe("stepProgress", () => {
  it("0 before at, 1 after at+dur, eased between", () => {
    expect(stepProgress(0, 5, 2)).toBe(0);
    expect(stepProgress(8, 5, 2)).toBe(1);
    const mid = stepProgress(6, 5, 2);
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(1);
  });
});

describe("emphasis", () => {
  it("peaks at ~at and returns to 0", () => {
    expect(emphasis(0, 5)).toBeCloseTo(0, 1);
    expect(emphasis(5, 5)).toBeGreaterThan(0.5);
    expect(emphasis(10, 5)).toBeCloseTo(0, 1);
  });
});

describe("shakeOffset & flashAlpha", () => {
  it("shake decays to ~0 away from at", () => {
    const [x, y] = shakeOffset(20, 5, 10);
    expect(Math.hypot(x, y)).toBeLessThan(1);
  });
  it("flash is 0 away from at, positive near at", () => {
    expect(flashAlpha(20, 5)).toBeCloseTo(0, 2);
    expect(flashAlpha(5, 5)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/sequence.ts`:**

```ts
import { clamp01, easeOutCubic } from "../slides/anim";

export function stepProgress(t: number, at: number, dur: number): number {
  return easeOutCubic(clamp01((t - at) / dur));
}

/** 0→1→0 bump centered at `at`, ~1.2s wide. */
export function emphasis(t: number, at: number): number {
  const d = (t - at) / 0.6;
  return Math.max(0, 1 - d * d); // parabola, 0 outside [at-0.6, at+0.6]
}

/** Decaying shake around `at` (mag px), ~0.5s. Deterministic pseudo-jitter from t. */
export function shakeOffset(t: number, at: number, mag: number): [number, number] {
  const k = Math.max(0, 1 - Math.abs(t - at) / 0.5);
  if (k <= 0) return [0, 0];
  return [Math.sin(t * 90) * mag * k, Math.cos(t * 110) * mag * k];
}

/** Quick flash 0→1→0 within ~0.25s of `at`. */
export function flashAlpha(t: number, at: number): number {
  return Math.max(0, 1 - Math.abs(t - at) / 0.25);
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat: engagement grammar — build steps + emphasis/shake/flash`.

## Self-review
- All pure & tested; envelopes are 0 away from their moment (safe to always call). ✅

## What this unlocks
Scenes reveal in narrated steps and land key moments; used by kinetic type (09), maps (16, battles),
and every worked example.
