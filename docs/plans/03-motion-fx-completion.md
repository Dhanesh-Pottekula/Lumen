# Step 03 — Motion & FX Completion

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Finish the cinematic base so *every* scene benefits: glow + soft shadow applied consistently,
a complete easing set with idle **micro-motion**, and the `filmGrade` overlay moved into the `fx`
layer. Folds in the in-flight Tier-1 scene edits.

**Architecture:** Most helpers already exist (`radialGlow`, `withGlow`, `easeInOutCubic`,
`easeOutBack`, `filmGrade`). This step (a) adds the missing motion helpers (`spring`, `breathe`),
(b) standardizes glow/shadow usage across the 7 photosynthesis scenes, and (c) relocates the filmic
overlay so it renders on the `fx` layer via `FrameCtx` instead of inside the composer body.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints

- Deterministic & seekable; helpers are pure functions of `t`.
- Existing suite green; `npm run build` clean.
- No regression to existing films; glow/shadow are additive polish.

## File structure

- Modify `src/slides/anim.ts` — add `spring(p)`, `breathe(t, period, amount)`.
- Modify `src/slides/anim.test.ts` — test the new easings.
- Modify `src/render/frame.ts` — optional `frame.grade(opts)` that draws the filmic pass onto the `fx` layer.
- Modify `src/slides/compose.ts` — call `frame.grade(...)` (from theme.fx) instead of the inline `drawFilmGrade`.
- Modify the 7 `photo*.ts` scenes — commit the in-flight glow edits + add micro-motion where static.

---

### Task 1: Motion helpers — `spring`, `breathe`

**Interfaces — Produces:** `spring(p: number): number` (critically-damped-ish 0→1 with soft settle);
`breathe(t: number, period: number, amount: number): number` (a gentle ±amount oscillation, mean 1).

- [ ] **Step 1: Failing tests** — append to `src/slides/anim.test.ts`:

```ts
import { breathe, spring } from "./anim";

describe("spring", () => {
  it("starts at 0, ends ~1, clamped", () => {
    expect(spring(0)).toBeCloseTo(0);
    expect(spring(1)).toBeCloseTo(1, 1);
    expect(spring(-1)).toBe(0);
    expect(spring(2)).toBeCloseTo(1, 1);
  });
});

describe("breathe", () => {
  it("oscillates around 1 by amount, deterministic", () => {
    expect(breathe(0, 4, 0.1)).toBeCloseTo(1);            // sin(0)=0 → mean
    const v = breathe(1, 4, 0.1);
    expect(v).toBeGreaterThan(1); expect(v).toBeLessThanOrEqual(1.1 + 1e-9);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement in `anim.ts`:**

```ts
/** Springy 0→1: overshoot-free soft settle. Clamped. */
export const spring = (p: number): number => {
  p = clamp01(p);
  return 1 - Math.exp(-6 * p) * Math.cos(4 * p); // fast rise, gentle settle toward 1
};

/** Gentle oscillation around 1 (mean), amplitude `amount`, given period seconds. */
export const breathe = (t: number, period: number, amount: number): number =>
  1 + Math.sin((t / period) * Math.PI * 2) * amount;
```

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: spring + breathe motion helpers`.

---

### Task 2: Move the filmic pass onto the fx layer via FrameCtx

**Files:** Modify `src/render/frame.ts`, `src/slides/compose.ts`.

**Interfaces — Produces:** `frame.grade(opts: { vignette?: number; grain?: number })` — draws vignette +
deterministic grain onto the `fx` layer (composited last by `finish()`).

- [ ] **Step 1:** Add to `createFrame`'s returned object a `grade` method that draws into `layer.ctx("fx")`
  using the same vignette+grain code currently in `compose.ts`'s `drawFilmGrade` (seed grain by
  `Math.floor(t*12)`). Remove the standalone `drawFilmGrade` from `compose.ts`.
- [ ] **Step 2:** In `compose.ts`, where `filmGrade` was applied, instead call `frame.grade({ vignette: theme.fx.vignette, grain: theme.fx.grain })` on the top-level frame. **Note:** the composer draws scenes into their own per-scene frames; the grade must apply once to the *whole* film frame. Create a single film-level frame in the composer's `render` bound to the main `ctx`, use it only for `grade()` + progress dots, and `finish()` it last.
- [ ] **Step 3:** `npm run build && npm test` — green (the `filmGrade` option still works; behavior unchanged visually).
- [ ] **Step 4: Commit** `refactor: filmic pass renders on the fx layer`.

---

### Task 3: Standardize glow/shadow + micro-motion across scenes

**Files:** Modify all 7 `src/slides/photo*.ts`.

- [ ] **Step 1:** Commit the in-flight Tier-1 edits already in the working tree (intro sun bloom + additive beams + title glow; light-reactions electron/photon glow; equation sun/glucose glow + title glow). Verify each still builds.
- [ ] **Step 2:** Apply the same treatment to the remaining scenes: `withGlow` soft shadow under organelles/molecules in leaf-cell, chloroplast, calvin; `radialGlow` on the calvin ring nodes; title `withGlow` on chloroplast/calvin/finale.
- [ ] **Step 3:** Add `breathe(t, 5, 0.02)` scale to at least one hero element per otherwise-static scene (e.g., the chloroplast cutaway, the cell) so nothing is perfectly frozen. Use `drawSvg(..., { ... })` with a scaled w/h = base * breathe.
- [ ] **Step 4:** `npm run build && npm test` — green.
- [ ] **Step 5: Browser verify** — scrub all 7 scenes; confirm consistent glow/shadow and subtle life; screenshot.
- [ ] **Step 6: Commit** `feat: consistent glow/shadow + idle micro-motion across photosynthesis scenes`.

---

## Self-review checklist

- New easings pure + tested; filmic pass now a layer concern; glow/shadow consistent; nothing static. ✅
- No behavioral regression (grade output matches previous). ✅

## What this unlocks

A uniformly cinematic base every future scene inherits, and `spring`/`breathe` available to all
later primitives for lively reveals and idle motion.
