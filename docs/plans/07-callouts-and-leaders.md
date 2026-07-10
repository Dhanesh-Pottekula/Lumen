# Step 07 — Callouts & Leader Lines (annotation layer)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A reusable **annotation layer**: labels that animate in and point at a coordinate with a
leader line that draws on. Themed. Replaces per-scene hand-placed text.

**Architecture:** A `callout(frame, {target, text, anchor, p, ...})` that: draws a leader line from an
offset label box to the `target` point using `strokeOn` (Step 04), then the themed label. Renders on
the `annotation` layer so it always sits above content.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic (`p` from `t`); themed colors from `frame.theme`; existing suite green; build clean.

## File structure
- Create `src/render/callout.ts` — `callout`, `labelBox` (pure layout), leader geometry.
- Create `src/render/callout.test.ts` — label-box layout + leader endpoint math.

---

### Task 1: label layout + leader geometry (pure)

**Interfaces — Produces:**
```ts
labelBox(text: string, anchorX: number, anchorY: number, side: "left"|"right", fontPx: number):
  { x: number; y: number; w: number; h: number; textX: number }  // pure, approx width = text.length*fontPx*0.55
leaderPoints(box, target: [number,number]): [number,number][]     // from box edge to target
```

- [ ] **Step 1: Failing tests** — `src/render/callout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { labelBox, leaderPoints } from "./callout";

describe("labelBox", () => {
  it("sizes width from text length and font", () => {
    const b = labelBox("hello", 100, 50, "right", 14);
    expect(b.w).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThanOrEqual(14);
  });
  it("right side places the box to the right of the anchor", () => {
    const b = labelBox("x", 100, 50, "right", 14);
    expect(b.x).toBeGreaterThanOrEqual(100);
  });
  it("left side places the box to the left", () => {
    const b = labelBox("x", 100, 50, "left", 14);
    expect(b.x).toBeLessThan(100);
  });
});

describe("leaderPoints", () => {
  it("returns a 2-point line ending exactly at the target", () => {
    const b = labelBox("x", 100, 50, "right", 14);
    const pts = leaderPoints(b, [200, 80]);
    expect(pts[pts.length - 1]).toEqual([200, 80]);
    expect(pts.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/callout.ts`** (pure helpers + the draw fn):

```ts
import { clamp01 } from "../slides/anim";
import type { FrameCtx } from "./frame";
import { fadeText } from "../slides/anim";
import { strokeOn } from "./strokes";

const PAD = 8;
const charW = (fontPx: number) => fontPx * 0.55;

export function labelBox(text: string, anchorX: number, anchorY: number, side: "left" | "right", fontPx: number) {
  const w = text.length * charW(fontPx) + PAD * 2;
  const h = fontPx + PAD * 2;
  const x = side === "right" ? anchorX : anchorX - w;
  const y = anchorY - h / 2;
  return { x, y, w, h, textX: x + w / 2 };
}

export function leaderPoints(box: { x: number; y: number; w: number; h: number }, target: [number, number]): [number, number][] {
  const startX = target[0] >= box.x + box.w ? box.x + box.w : box.x;
  const startY = box.y + box.h / 2;
  return [[startX, startY], [target[0], target[1]]];
}

/** Draw an animated callout on the annotation layer. p1 draws the leader, p2 fades the label. */
export function callout(
  frame: FrameCtx,
  o: { target: [number, number]; text: string; side?: "left" | "right"; leaderP: number; labelP: number; offset?: number; fontPx?: number },
) {
  const side = o.side ?? "right";
  const fontPx = o.fontPx ?? 14;
  const off = o.offset ?? 90;
  const anchorX = o.target[0] + (side === "right" ? off : -off);
  const box = labelBox(o.text, anchorX, o.target[1], side, fontPx);
  const ctx = frame.layer.ctx("annotation");
  strokeOn(ctx, leaderPoints(box, o.target), clamp01(o.leaderP), {
    color: frame.theme.palette.muted, width: 1.4, roughness: frame.theme.lineStyle.roughness, seed: Math.round(o.target[0]),
  });
  const a = clamp01(o.labelP);
  if (a > 0) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = frame.theme.palette.surface;
    ctx.strokeStyle = frame.theme.palette.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    fadeText(ctx, o.text, box.textX, box.y + box.h / 2 + fontPx * 0.35, a, `${fontPx}px ${frame.theme.type.body}`, frame.theme.palette.ink);
  }
}
```

- [ ] **Step 4: Run — PASS** (pure helpers). — [ ] **Step 5: Browser verify** — a callout that draws its
  leader then fades its label in, pointing at an element; screenshot. — [ ] **Step 6: Commit**
  `feat: animated callouts with leader lines (themed, annotation layer)`.

## Self-review
- Label box sized from text/font; leader ends exactly on target; themed; draws on annotation layer. ✅

## What this unlocks
Consistent labelling everywhere; pairs with attention (06); used by every domain kit.
