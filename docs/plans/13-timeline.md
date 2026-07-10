# Step 13 — Timeline Primitive

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A real timeline: a dated axis with **eras**, **parallel tracks**, **events**, and a moving
**playhead** — for history and any process/chronology.

**Architecture:** A `linearScale` (Step 12) maps dates → x. Eras are labelled spans; events are markers
placed by date that appear via `stepProgress` (Step 08); the playhead is `dateScale(year(t))`. Themed.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; themed; reuses `linearScale`; existing suite green; build clean.

## File structure
- Create `src/render/timeline.ts` — `Timeline` config, `eraRects`, `eventX` (pure), `drawTimeline`.
- Create `src/render/timeline.test.ts` — era span + event placement math.

---

### Task 1: timeline geometry (pure) + draw

**Interfaces — Produces:**
```ts
interface Era { from: number; to: number; label: string; color?: string }
interface TLEvent { date: number; label: string; track?: number }
eraRects(eras: Era[], domain:[number,number], box): {x,y,w,h,label,color}[]
eventX(date: number, domain:[number,number], box): number
drawTimeline(frame, box, cfg:{domain:[number,number]; eras:Era[]; events:TLEvent[]; year:number}): void
```

- [ ] **Step 1: Failing tests** — `src/render/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eraRects, eventX } from "./timeline";

const box = { x: 0, y: 0, w: 1000, h: 100 };
const domain: [number, number] = [1900, 2000];

describe("eventX", () => {
  it("maps a date to its x on the axis", () => {
    expect(eventX(1900, domain, box)).toBeCloseTo(0);
    expect(eventX(1950, domain, box)).toBeCloseTo(500);
    expect(eventX(2000, domain, box)).toBeCloseTo(1000);
  });
});

describe("eraRects", () => {
  it("computes span x/width per era", () => {
    const [e] = eraRects([{ from: 1914, to: 1918, label: "WWI" }], domain, box);
    expect(e.x).toBeCloseTo(140);
    expect(e.w).toBeCloseTo(40);
    expect(e.label).toBe("WWI");
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/timeline.ts`** using `linearScale([domain],[box.x, box.x+box.w])`
  for `eventX`; `eraRects` maps `from`/`to` to x and width, y/h fixed within box. `drawTimeline` renders
  the themed axis, era spans (translucent fills + labels), events as markers (with `stepProgress` on the
  event date vs the film's `year`), and a playhead vertical line at `eventX(year)`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Browser verify** — a 1900–2000 timeline with a WWI era + a few event markers + playhead;
  screenshot. — [ ] **Step 6: Commit** `feat: timeline primitive (eras, events, playhead)`.

## Self-review
- Date→x mapping + era spans pure & tested; themed; events reveal by date. ✅

## What this unlocks
History chronology, process timelines (biology life cycles, physics experiment stages); pairs with the
map subsystem (16) sharing the same `year(t)`.
