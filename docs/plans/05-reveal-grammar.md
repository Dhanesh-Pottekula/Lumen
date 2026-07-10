# Step 05 — Reveal Grammar (masks, wipes, blend modes)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Expressive entrances beyond fades — clip-based **wipe / iris / shaped** reveals, plus
blend-mode helpers (multiply / screen / overlay). Enables fog-of-war (Step 16) and elegant focus.

**Architecture:** Pure helpers that set a clip region as a function of progress `p`, then run a draw
callback inside it; and a `withBlend` wrapper. Clips are computed from `p`, so seekable.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic (`p` from `t`); existing suite green; `npm run build` clean.

## File structure
- Create `src/render/reveal.ts` — `wipe`, `iris`, `clipShape`, `withBlend`, `revealRect`.
- Create `src/render/reveal.test.ts` — clip-rect math + blend wrapper save/restore.

---

### Task 1: reveal helpers

**Interfaces — Produces:**
```ts
withBlend(ctx, mode: GlobalCompositeOperation, draw: () => void): void
revealRect(p: number, dir: "left"|"right"|"up"|"down", w: number, h: number): [x,y,w,h]  // pure
wipe(ctx, p, dir, w, h, draw): void      // clips to revealRect then draws
iris(ctx, p, cx, cy, maxR, draw): void   // circular clip growing with p
clipShape(ctx, points: [number,number][], draw): void
```

- [ ] **Step 1: Failing tests** — `src/render/reveal.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { revealRect, withBlend } from "./reveal";

describe("revealRect", () => {
  it("left wipe grows width from 0 to full", () => {
    expect(revealRect(0, "left", 100, 50)).toEqual([0, 0, 0, 50]);
    expect(revealRect(0.5, "left", 100, 50)).toEqual([0, 0, 50, 50]);
    expect(revealRect(1, "left", 100, 50)).toEqual([0, 0, 100, 50]);
  });
  it("right wipe anchors to the right edge", () => {
    expect(revealRect(0.5, "right", 100, 50)).toEqual([50, 0, 50, 50]);
  });
  it("up wipe anchors to the bottom", () => {
    expect(revealRect(0.5, "up", 100, 50)).toEqual([0, 25, 100, 25]);
  });
});

describe("withBlend", () => {
  it("sets the composite mode inside and restores after", () => {
    let seen = "";
    const ctx = { globalCompositeOperation: "source-over", save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
    withBlend(ctx, "multiply", () => { seen = ctx.globalCompositeOperation; });
    expect(seen).toBe("multiply");
    expect(ctx.restore).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/reveal.ts`:**

```ts
import { clamp01 } from "../slides/anim";

export function revealRect(p: number, dir: "left" | "right" | "up" | "down", w: number, h: number): [number, number, number, number] {
  p = clamp01(p);
  if (dir === "left") return [0, 0, w * p, h];
  if (dir === "right") return [w * (1 - p), 0, w * p, h];
  if (dir === "up") return [0, h * (1 - p), w, h * p];
  return [0, 0, w, h * p]; // down
}

export function withBlend(ctx: CanvasRenderingContext2D, mode: GlobalCompositeOperation, draw: () => void) {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  draw();
  ctx.restore();
}

export function wipe(ctx: CanvasRenderingContext2D, p: number, dir: "left" | "right" | "up" | "down", w: number, h: number, draw: () => void) {
  const [x, y, rw, rh] = revealRect(p, dir, w, h);
  if (rw <= 0 || rh <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, rw, rh);
  ctx.clip();
  draw();
  ctx.restore();
}

export function iris(ctx: CanvasRenderingContext2D, p: number, cx: number, cy: number, maxR: number, draw: () => void) {
  const r = clamp01(p) * maxR;
  if (r <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.clip();
  draw();
  ctx.restore();
}

export function clipShape(ctx: CanvasRenderingContext2D, points: [number, number][], draw: () => void) {
  if (points.length < 3) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.clip();
  draw();
  ctx.restore();
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat: reveal grammar — wipe/iris/clipShape/withBlend`.

## Self-review
- Rect math exact per direction; blend wrapper restores; clips seekable. ✅

## What this unlocks
Map region reveals + fog-of-war (16), focus spotlight cutouts (06), parchment staining via `multiply`,
and transition variety (11).
