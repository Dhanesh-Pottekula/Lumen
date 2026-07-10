# Step 06 — Attention Direction (spotlight / dim / highlight)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Direct the viewer's eye — the #1 teaching skill. Spotlight a region, dim/ghost everything
else, and pulse highlight rings, all as reusable helpers driven by a focus target + `t`.

**Architecture:** Helpers that draw onto the `annotation` (rings) and `fx` (dim scrim) layers from
`FrameCtx`. A dim scrim is a full-view fill with a "hole" punched via the reveal `iris`/`clipShape`
inverse. Focus target + intensity are functions of `t`, so seekable.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; uses `frame.layer`; existing suite green; build clean.

## File structure
- Create `src/render/focus.ts` — `spotlight`, `dimExcept`, `highlightRing`.
- Create `src/render/focus.test.ts` — ring radius easing + scrim alpha math.

---

### Task 1: focus helpers

**Interfaces — Produces:**
```ts
spotlight(ctx, cx, cy, r, intensity: number): void        // dim scrim with a soft circular hole
dimExcept(ctx, w, h, holes: {cx,cy,r}[], intensity): void // scrim with multiple holes
highlightRing(ctx, cx, cy, r, p: number, color: string): void // ring that expands+fades with p
```

- [ ] **Step 1: Failing tests** — `src/render/focus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ringRadius, scrimAlpha } from "./focus";

describe("highlight ring math", () => {
  it("radius grows from base with p", () => {
    expect(ringRadius(20, 0)).toBeCloseTo(20);
    expect(ringRadius(20, 1)).toBeGreaterThan(20);
  });
  it("alpha fades out as p→1", () => {
    expect(scrimAlpha(0)).toBeGreaterThan(scrimAlpha(1));
    expect(scrimAlpha(1)).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/focus.ts`** (expose the two pure helpers used by tests, plus the draw fns):

```ts
import { clamp01 } from "../slides/anim";

export const ringRadius = (base: number, p: number) => base + clamp01(p) * base * 0.6;
export const scrimAlpha = (p: number) => (1 - clamp01(p)); // for a fading ring

/** Full-view dim with a soft circular hole over (cx,cy,r). intensity 0..1 = scrim darkness. */
export function spotlight(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, intensity: number, w: number, h: number) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp01(intensity);
  const g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.4);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function dimExcept(ctx: CanvasRenderingContext2D, w: number, h: number, holes: { cx: number; cy: number; r: number }[], intensity: number) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp01(intensity);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-out";
  for (const { cx, cy, r } of holes) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

export function highlightRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, base: number, p: number, color: string) {
  const a = scrimAlpha(p);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius(base, p), 0, 7);
  ctx.stroke();
  ctx.restore();
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Browser verify** — demo: dim a scene except one organelle; pulse a ring on it. Screenshot.
- [ ] **Step 6: Commit** `feat: attention direction — spotlight/dimExcept/highlightRing`.

## Self-review
- `dimExcept` uses `destination-out` to punch soft holes; ring math tested; scrim on fx layer. ✅

## What this unlocks
Every complex scene can now direct the eye; callouts (07) pair with rings; used heavily by maps (16)
and any multi-part diagram.
