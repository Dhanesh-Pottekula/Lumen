# Scene Sequencer (`composeSlides`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-coded 1052-line Coimbatore film with a reusable `composeSlides()` sequencer that stitches an array of standalone canvas scenes into one crossfaded film, and make that film the only thing the app shows.

**Architecture:** `composeSlides(scenes, options)` is a pure function (`src/slides/compose.ts`) that takes ordinary `CanvasSlideDefinition`s and returns one: it computes overlapping time windows per scene, renders each active scene at scene-local time inside a crossfade alpha envelope, and merges captions onto the global timeline. The existing `<CanvasSlide>` React player is untouched. The film's finale becomes a sixth standalone scene.

**Tech Stack:** TypeScript (strict), React 19, Vite 7, Canvas 2D, vitest (added in Task 1).

**Spec:** `docs/superpowers/specs/2026-07-08-scene-sequencer-design.md`

## Global Constraints

- Every slide `render(ctx, t)` MUST stay a pure function of `t` — no clocks, no timers, no state accumulated between calls (this is what keeps slides seekable).
- All Coimbatore scenes share the 920×430 logical view space.
- No speed/tempo scaling anywhere — the old `SPEED = 2.5` mechanism is removed, no `withSpeed` replaces it.
- Default crossfade: **2.5 s**. Default `progressDots`: **true**.
- The working tree has a pre-existing uncommitted modification to `src/components/CanvasSlide.tsx` that is NOT part of this work. Never `git add -A` / `git add .` — always stage explicit paths.
- `npm run build` runs `tsc --noEmit && vite build`; it must pass at the end of every task that touches `src/`.

---

### Task 1: Vitest setup + `withAlpha` helper in anim.ts

**Files:**
- Modify: `package.json` (add vitest devDependency + `test` script)
- Modify: `src/slides/anim.ts` (add `withAlpha`)
- Test: `src/slides/anim.test.ts`

**Interfaces:**
- Consumes: `clamp01` from `src/slides/anim.ts` (existing).
- Produces: `withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void` — runs `draw` with `ctx.globalAlpha` multiplied by `clamp01(alpha)` inside `save()`/`restore()`; skips `draw` entirely when `alpha <= 0`. Task 3 and Task 4 import it from `./anim`.

- [ ] **Step 1: Install vitest and add the test script**

```bash
npm install -D vitest
```

Then in `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing test**

Create `src/slides/anim.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { withAlpha } from "./anim";

/** Minimal stand-in for the parts of CanvasRenderingContext2D that withAlpha touches. */
function stubCtx() {
  const stack: number[] = [];
  const ctx = {
    globalAlpha: 1,
    save() {
      stack.push(this.globalAlpha);
    },
    restore() {
      this.globalAlpha = stack.pop() ?? 1;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("withAlpha", () => {
  it("scales globalAlpha inside the draw callback and restores it after", () => {
    const ctx = stubCtx();
    let seen = -1;
    withAlpha(ctx, 0.5, () => {
      seen = ctx.globalAlpha;
    });
    expect(seen).toBe(0.5);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("multiplies nested alphas", () => {
    const ctx = stubCtx();
    let seen = -1;
    withAlpha(ctx, 0.5, () => withAlpha(ctx, 0.5, () => (seen = ctx.globalAlpha)));
    expect(seen).toBe(0.25);
  });

  it("skips the callback entirely at alpha <= 0", () => {
    const ctx = stubCtx();
    let called = false;
    withAlpha(ctx, 0, () => (called = true));
    expect(called).toBe(false);
  });

  it("clamps alpha above 1", () => {
    const ctx = stubCtx();
    let seen = -1;
    withAlpha(ctx, 3, () => (seen = ctx.globalAlpha));
    expect(seen).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `anim.ts` has no export named `withAlpha`.

- [ ] **Step 4: Implement `withAlpha`**

Append to `src/slides/anim.ts`:

```ts
/** Run `draw` with globalAlpha scaled by `alpha` (clamped), save/restored. No-op at alpha ≤ 0. */
export function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  draw();
  ctx.restore();
}
```

(Identical to the private helper currently at `src/slides/coimbatoreStory.ts:32-38`, which Task 5 deletes along with that file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/slides/anim.ts src/slides/anim.test.ts
git commit -m "feat: add vitest and shared withAlpha helper"
```

---

### Task 2: `composeSlides` — windows, validation, captions

**Files:**
- Create: `src/slides/compose.ts`
- Test: `src/slides/compose.test.ts`

**Interfaces:**
- Consumes: `CanvasSlideDefinition`, `CaptionSegment` from `./types`; `phase`, `withAlpha` from `./anim` (render body is completed in Task 3).
- Produces: `composeSlides(scenes: CanvasSlideDefinition[], options?: ComposeOptions): CanvasSlideDefinition` and `interface ComposeOptions { crossfade?: number; progressDots?: boolean }`, exported from `src/slides/compose.ts`. Window math: scene *i* starts at `Σ d[0..i-1] − i·crossfade`; total duration `Σd − (n−1)·crossfade`.

- [ ] **Step 1: Write the failing tests**

Create `src/slides/compose.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./compose`.

- [ ] **Step 3: Implement compose.ts (render left as clear-only; Task 3 completes it)**

Create `src/slides/compose.ts`:

```ts
/**
 * composeSlides — stitch standalone scenes into one film on a single timeline.
 *
 * Consecutive scenes overlap by `crossfade` seconds; each scene renders at its
 * own local time inside a fade-in × fade-out alpha envelope. The result is a
 * plain CanvasSlideDefinition, so the composed film stays a pure function of t
 * and seeks exactly like any slide.
 */
import { phase, withAlpha } from "./anim";
import type { CanvasSlideDefinition, CaptionSegment } from "./types";

export interface ComposeOptions {
  /** Seconds of overlap between consecutive scenes. Default 2.5. */
  crossfade?: number;
  /** Draw one progress dot per scene along the bottom (films of 2+ scenes). Default true. */
  progressDots?: boolean;
}

interface SceneWindow {
  scene: CanvasSlideDefinition;
  start: number;
  end: number;
}

export function composeSlides(
  scenes: CanvasSlideDefinition[],
  options: ComposeOptions = {},
): CanvasSlideDefinition {
  if (scenes.length === 0) throw new Error("composeSlides needs at least one scene");

  const { viewW, viewH } = scenes[0];
  scenes.forEach((s, i) => {
    if (s.viewW !== viewW || s.viewH !== viewH) {
      throw new Error(
        `composeSlides: scene ${i} view space ${s.viewW}×${s.viewH} differs from scene 0 (${viewW}×${viewH})`,
      );
    }
  });

  let crossfade = Math.max(0, options.crossfade ?? 2.5);
  const shortest = Math.min(...scenes.map((s) => s.duration));
  if (scenes.length > 1 && crossfade > shortest / 2) {
    console.warn(`composeSlides: crossfade ${crossfade}s clamped to ${shortest / 2}s (half the shortest scene)`);
    crossfade = shortest / 2;
  }
  const progressDots = options.progressDots ?? true;

  const windows: SceneWindow[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    windows.push({ scene, start: cursor, end: cursor + scene.duration });
    cursor += scene.duration - crossfade;
  }
  const duration = cursor + crossfade;

  const captions: CaptionSegment[] = windows
    .flatMap(({ scene, start }, i) => {
      const cutoff = i + 1 < windows.length ? windows[i + 1].start : Infinity;
      return (scene.captions ?? [])
        .map((c) => ({ at: c.at + start, text: c.text }))
        .filter((c) => c.at < cutoff);
    })
    .sort((a, b) => a.at - b.at);

  return {
    duration,
    viewW,
    viewH,
    captions: captions.length > 0 ? captions : undefined,
    render(ctx, t) {
      ctx.clearRect(0, 0, viewW, viewH);
      // Task 3: scene dispatch + envelopes + progress dots
      void t;
      void windows;
      void crossfade;
      void progressDots;
      void phase;
      void withAlpha;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all `composeSlides metadata` tests plus Task 1's 4 tests).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/slides/compose.ts src/slides/compose.test.ts
git commit -m "feat: composeSlides window math, validation, caption merge"
```

---

### Task 3: `composeSlides` — render dispatch, envelopes, progress dots

**Files:**
- Modify: `src/slides/compose.ts` (replace the stub `render` body)
- Test: `src/slides/compose.test.ts` (append a describe block)

**Interfaces:**
- Consumes: everything Task 2 built; `phase`, `withAlpha` from `./anim`.
- Produces: the completed `render(ctx, t)` — for each scene window containing `t`, alpha = `phase(t, start, start+crossfade) × (1 − phase(t, end−crossfade, end))`, scene drawn at local time `t − start` (clamped to `[0, scene.duration]`), scenes drawn in array order (incoming on top). Single-scene films render as passthrough (alpha 1, no dots). Dots: centred at `viewW/2 − (n−1)·8 + i·16`, y = `viewH − 8`; active window → radius 3.4 fill `#e8a13c`; finished → 2.2 `#5cc8ae`; upcoming → 2.2 `#39434d`.

- [ ] **Step 1: Write the failing tests**

Append to `src/slides/compose.test.ts` (imports already present; add these helpers above the new describe block):

```ts
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
});
```

Note on the alpha-0.5 expectations: `phase` is smoothstep-eased, and smoothstep(0.5) is exactly 0.5, so the overlap midpoint gives exact 0.5/0.5 — no `toBeCloseTo` needed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the new `composeSlides render` tests FAIL (scene render never called); all earlier tests still pass.

- [ ] **Step 3: Implement the render body**

In `src/slides/compose.ts`, replace the entire stub `render(ctx, t) { ... }` with:

```ts
    render(ctx, t) {
      ctx.clearRect(0, 0, viewW, viewH);

      if (windows.length === 1) {
        const only = scenes[0];
        only.render(ctx, Math.max(0, Math.min(t, only.duration)));
        return;
      }

      for (const { scene, start, end } of windows) {
        const fadeIn = crossfade > 0 ? phase(t, start, start + crossfade) : t >= start ? 1 : 0;
        const fadeOut = crossfade > 0 ? 1 - phase(t, end - crossfade, end) : t < end ? 1 : 0;
        withAlpha(ctx, fadeIn * fadeOut, () =>
          scene.render(ctx, Math.max(0, Math.min(t - start, scene.duration))),
        );
      }

      if (progressDots) {
        const x0 = viewW / 2 - (windows.length - 1) * 8;
        windows.forEach(({ start, end }, i) => {
          const active = t >= start && t < end;
          ctx.beginPath();
          ctx.arc(x0 + i * 16, viewH - 8, active ? 3.4 : 2.2, 0, 7);
          ctx.fillStyle = active ? "#e8a13c" : t >= end ? "#5cc8ae" : "#39434d";
          ctx.fill();
        });
      }
    },
```

(The `void` lines from Task 2's stub are deleted with it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all tests).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/slides/compose.ts src/slides/compose.test.ts
git commit -m "feat: composeSlides render dispatch, crossfade envelopes, progress dots"
```

---

### Task 4: Extract the finale as a standalone scene

**Files:**
- Create: `src/slides/coimbatoreFinale.ts`
- Reference (read-only, deleted in Task 5): `src/slides/coimbatoreStory.ts:190-214` (`drawCoinShape`), `:756-793` (`drawImpeller`, `drawSkyline`), `:898-985` (`drawFinale`)

**Interfaces:**
- Consumes: `fadeText`, `phase`, `prng`, `withAlpha` from `./anim`; `CanvasSlideDefinition` from `./types`.
- Produces: `export const coimbatoreFinaleSlide: CanvasSlideDefinition` — 12 s, 920×430. Task 5 imports it from `./slides/coimbatoreFinale`.

No unit test — it's pure drawing; verified by type-check here and visually in Task 5. Known acceptable difference: the skyline's seeded layout differs slightly from the old film (the old film shared one PRNG sequence across city + skyline constants; this scene seeds its own).

- [ ] **Step 1: Create the scene**

Create `src/slides/coimbatoreFinale.ts`:

```ts
/**
 * Scene 6 — the finale: the whole Coimbatore journey recapped as a timeline strip.
 * Extracted from the retired single-file film so composeSlides() can sequence it.
 */
import { fadeText, phase, prng, withAlpha } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const finaleRand = prng(641);
const SKYLINE = Array.from({ length: 24 }, (_, i) => ({
  x: 30 + i * 37,
  w: 26 + finaleRand() * 10,
  h: 26 + finaleRand() * 78,
}));

function drawSkyline(ctx: CanvasRenderingContext2D) {
  for (const b of SKYLINE) {
    ctx.fillStyle = "#26313d";
    ctx.fillRect(b.x, H - b.h, b.w, b.h);
    const wr = prng(Math.round(b.x));
    for (let k = 0; k < 5; k++) {
      if (wr() > 0.5) continue;
      ctx.fillStyle = "rgba(235, 203, 139, 0.7)";
      ctx.fillRect(b.x + 4 + wr() * (b.w - 10), H - b.h + 6 + wr() * (b.h - 14), 3.4, 3.4);
    }
  }
}

function drawCoinShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 7);
  ctx.fillStyle = "#d9a73a";
  ctx.fill();
  ctx.strokeStyle = "#f3d27a";
  ctx.lineWidth = r * 0.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.1, 0, r * 0.45, -1.9, 1.6);
  ctx.strokeStyle = "#8a6420";
  ctx.lineWidth = r * 0.16;
  ctx.stroke();
  const shine = Math.max(0, Math.sin(t * 0.9 + spin)) * 0.3;
  if (shine > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 7);
    ctx.fillStyle = `rgba(255, 243, 207, ${shine})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawImpeller(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, t: number) {
  const angle = t * 3.4;
  for (let b = 0; b < 5; b++) {
    const a0 = angle + (b * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a0) * 10 * scale, y + Math.sin(a0) * 10 * scale);
    ctx.quadraticCurveTo(
      x + Math.cos(a0 + 0.55) * 34 * scale,
      y + Math.sin(a0 + 0.55) * 34 * scale,
      x + Math.cos(a0 + 0.95) * 50 * scale,
      y + Math.sin(a0 + 0.95) * 50 * scale,
    );
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 5 * scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, 9 * scale, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();
}

export const coimbatoreFinaleSlide: CanvasSlideDefinition = {
  duration: 12,
  viewW: W,
  viewH: H,
  captions: [
    { at: 1, text: "a gap in the mountains. roman gold. black soil. cheap water power. patient family firms." },
    { at: 7, text: "coimbatore — the crossroads that never stopped trading." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    // the skyline stays, faint, as the stage
    withAlpha(ctx, 0.3, () => drawSkyline(ctx));

    // journey strip
    const lineIn = phase(t, 0.5, 4.5);
    const y = 220;
    withAlpha(ctx, 0.8, () => {
      ctx.strokeStyle = "#48586a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(140 + 640 * lineIn, y);
      ctx.stroke();
    });

    const stations: [string, string, (x: number) => void][] = [
      [
        "the gap",
        "antiquity",
        (x) => {
          ctx.beginPath();
          ctx.moveTo(x - 16, y - 8);
          ctx.lineTo(x - 8, y - 26);
          ctx.lineTo(x - 1, y - 8);
          ctx.closePath();
          ctx.moveTo(x + 1, y - 8);
          ctx.lineTo(x + 8, y - 26);
          ctx.lineTo(x + 16, y - 8);
          ctx.closePath();
          ctx.fillStyle = "#39485a";
          ctx.fill();
        },
      ],
      ["roman gold", "~100 CE", (x) => drawCoinShape(ctx, x, y - 18, 9, t, 0.4)],
      [
        "cotton",
        "the centuries",
        (x) => {
          for (const [dx, dy, r] of [
            [0, -22, 6],
            [-5, -16, 5],
            [5, -16, 5],
          ] as const) {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, r, 0, 7);
            ctx.fillStyle = "#eef2f5";
            ctx.fill();
          }
        },
      ],
      [
        "the mills",
        "1932",
        (x) => {
          ctx.fillStyle = "#31404f";
          ctx.fillRect(x - 12, y - 26, 24, 18);
          ctx.fillStyle = "#26313d";
          ctx.fillRect(x + 4, y - 36, 6, 10);
          ctx.fillStyle = "#ebcb8b";
          ctx.fillRect(x - 8, y - 21, 6, 5);
        },
      ],
      ["machines", "today", (x) => drawImpeller(ctx, x, y - 18, 0.34, t * 0.5)],
    ];

    stations.forEach(([label, when, icon], i) => {
      const a = phase(t, 0.8 + i * 0.85, 1.6 + i * 0.85);
      if (a <= 0) return;
      const x = 140 + i * 160;
      withAlpha(ctx, a, () => {
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, 7);
        ctx.fillStyle = "#5cc8ae";
        ctx.fill();
        icon(x);
      });
      fadeText(ctx, label, x, y + 22, a, "600 12px -apple-system, sans-serif", "#e8eef2");
      fadeText(ctx, when, x, y + 38, a * 0.75, "10px -apple-system, sans-serif", "#93a4b0");
    });

    const titleIn = phase(t, 5.5, 7.5);
    if (titleIn > 0) {
      const pulse = 1 + 0.03 * Math.sin(t * 2.4);
      fadeText(ctx, "COIMBATORE", 460, 96, titleIn, `800 ${Math.round(30 * pulse)}px -apple-system, sans-serif`, "#e8eef2");
      fadeText(ctx, "the crossroads that never stopped trading", 460, 122, phase(t, 6.5, 8.5), "14px -apple-system, sans-serif", "#e8a13c");
    }
  },
};
```

- [ ] **Step 2: Type-check and test**

Run: `npm run build && npm test`
Expected: both pass (the new file compiles; no test regressions).

- [ ] **Step 3: Commit**

```bash
git add src/slides/coimbatoreFinale.ts
git commit -m "feat: extract finale recap as standalone scene"
```

---

### Task 5: App shows only the composed lesson; delete retired slides

**Files:**
- Modify: `src/App.tsx` (full rewrite, content below)
- Delete: `src/slides/coimbatoreStory.ts`, `src/slides/pendulumSlide.ts`, `src/slides/crowdSlide.ts`

**Interfaces:**
- Consumes: `composeSlides` (Task 2/3), `coimbatoreFinaleSlide` (Task 4), the five existing chapter slides, `<CanvasSlide>` (unchanged).
- Produces: the final app — one card, the composed ~141.5 s lesson (30+26+26+30+30+12 = 154 s of scenes − 5 × 2.5 s overlaps).

- [ ] **Step 1: Rewrite App.tsx**

Replace the entire contents of `src/App.tsx` with:

```tsx
import { CanvasSlide } from "./components/CanvasSlide";
import { composeSlides } from "./slides/compose";
import { coimbatoreCottonSlide } from "./slides/coimbatoreCotton";
import { coimbatoreFinaleSlide } from "./slides/coimbatoreFinale";
import { coimbatoreGeographySlide } from "./slides/coimbatoreGeography";
import { coimbatoreMachinesSlide } from "./slides/coimbatoreMachines";
import { coimbatoreMillsSlide } from "./slides/coimbatoreMills";
import { coimbatoreRomanTradeSlide } from "./slides/coimbatoreRomanTrade";

const coimbatoreLesson = composeSlides([
  coimbatoreGeographySlide,
  coimbatoreRomanTradeSlide,
  coimbatoreCottonSlide,
  coimbatoreMillsSlide,
  coimbatoreMachinesSlide,
  coimbatoreFinaleSlide,
]);

export default function App() {
  return (
    <main>
      <h1>The story of Coimbatore — a generated tutorial</h1>
      <p className="sub">
        Six standalone scenes composed into one continuous lesson by composeSlides(): geography, Roman
        trade, cotton, mills, machines, and the finale recap, stitched onto a single timeline with
        crossfades. The scrubber stands in for the narration audio clock.
      </p>

      <CanvasSlide
        slide={coimbatoreLesson}
        title={<>★ The Coimbatore lesson — six scenes, one timeline</>}
        tag={
          <>
            <b className="good">The composed film.</b> Scrub anywhere — scene crossfades and captions are
            all pure functions of t. Watch the scene dots at the bottom.
          </>
        }
        notes={[
          "Scenes crossfade over 2.5 s at each boundary.",
          "Captions hand off to the incoming scene during each crossfade.",
          "Progress dots: amber = playing, teal = finished, gray = upcoming.",
        ]}
      />
    </main>
  );
}
```

- [ ] **Step 2: Delete the retired slide files**

```bash
git rm src/slides/coimbatoreStory.ts src/slides/pendulumSlide.ts src/slides/crowdSlide.ts
```

- [ ] **Step 3: Verify nothing still references them**

Run: `grep -rn "coimbatoreStory\|pendulumSlide\|crowdSlide" src/`
Expected: no matches.

- [ ] **Step 4: Build and test**

Run: `npm run build && npm test`
Expected: both pass.

- [ ] **Step 5: Visual verification**

Start the dev server (`npm run dev`) and check in the browser:

- exactly one card renders; total duration reads ≈ 141.50 s
- scrub across each of the five boundaries (≈ 27.5, 51, 74.5, 102, 129.5 s): outgoing scene fades as incoming fades in, no flash of blank canvas mid-crossfade
- captions switch to the incoming scene's first caption during each crossfade
- six progress dots along the bottom: amber for the active scene, teal for finished, gray for upcoming
- the finale (~129.5 s onward) shows the journey strip and COIMBATORE title
- play from 0 to the end: playback reaches the end and the Play button resets

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: app shows only the composed Coimbatore lesson"
```

(The `git rm` in Step 2 already staged the deletions; this commit includes them.)

**Do NOT stage `src/components/CanvasSlide.tsx`** — it carries a pre-existing uncommitted modification unrelated to this work.

---

## Self-review notes

- Spec coverage: composer + options (Tasks 2–3), captions rule (Task 2), finale scene (Task 4), validation (Task 2), single-scene rule (Tasks 2–3), migration + deletions (Task 5), vitest tests (Tasks 1–3), manual scrub check (Task 5). No speed scaling appears anywhere.
- Names used consistently: `composeSlides`, `ComposeOptions`, `withAlpha`, `coimbatoreFinaleSlide`.
- The old film's authored bridges are intentionally not reproduced (spec: generic transitions only).
