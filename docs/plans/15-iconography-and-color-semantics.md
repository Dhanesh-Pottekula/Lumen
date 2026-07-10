# Step 15 — Iconography & Color-Semantics

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A reusable **icon/sprite kit** per domain plus a **color-semantics registry** — assign a
consistent color to each category (empire, force, species) and auto-render a legend.

**Architecture:** Icons are SVG files under `public/images/icons/<domain>/` reusing the existing image
registry + `drawSvg` (already built). A `Semantics` object maps `category → color` (deterministic from a
palette), exposes `color(cat)` and `legendItems()`; `drawLegend` renders it themed.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic color assignment; themed legend; reuses image registry; existing suite green; build clean.

## File structure
- Create `public/images/icons/**` — authored SVG icons (soldier, ship, arrow, flag, atom, force-arrow, etc.).
- Create `src/render/semantics.ts` — `createSemantics(categories, palette)`, `drawLegend`.
- Create `src/render/semantics.test.ts` — stable color assignment + legend items.

---

### Task 1: color-semantics registry (pure)

**Interfaces — Produces:**
```ts
createSemantics(categories: string[], palette: string[]): {
  color(cat: string): string;         // stable, same cat → same color
  legendItems(): { label: string; color: string }[];
}
```

- [ ] **Step 1: Failing tests** — `src/render/semantics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSemantics } from "./semantics";

const PAL = ["#e00", "#0e0", "#00e"];

describe("createSemantics", () => {
  it("assigns a stable color per category in order", () => {
    const s = createSemantics(["allies", "central", "neutral"], PAL);
    expect(s.color("allies")).toBe("#e00");
    expect(s.color("central")).toBe("#0e0");
    expect(s.color("allies")).toBe("#e00"); // stable on repeat
  });
  it("wraps the palette when categories exceed colors", () => {
    const s = createSemantics(["a", "b", "c", "d"], PAL);
    expect(s.color("d")).toBe("#e00");
  });
  it("legendItems lists all categories with their colors", () => {
    const s = createSemantics(["a", "b"], PAL);
    expect(s.legendItems()).toEqual([{ label: "a", color: "#e00" }, { label: "b", color: "#0e0" }]);
  });
  it("unknown category falls back to the first color deterministically", () => {
    const s = createSemantics(["a"], PAL);
    expect(s.color("zzz")).toBe("#e00");
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/semantics.ts`:**

```ts
export function createSemantics(categories: string[], palette: string[]) {
  const map = new Map<string, string>();
  categories.forEach((c, i) => map.set(c, palette[i % palette.length]));
  return {
    color: (cat: string) => map.get(cat) ?? palette[0],
    legendItems: () => categories.map((c) => ({ label: c, color: map.get(c) ?? palette[0] })),
  };
}
```
Plus `drawLegend(frame, x, y, items)` — themed swatches + labels on the `annotation` layer.

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: color-semantics registry + legend`.

---

### Task 2: icon kit

- [ ] **Step 1:** Author a starter icon set as SVGs under `public/images/icons/history/` (soldier,
  cavalry, ship, cannon, flag, fort, arrow) and `public/images/icons/science/` (atom, force-arrow,
  bulb, magnet). Add an `ICONS` manifest (like `photosynthesis.ts`) + preload wiring.
- [ ] **Step 2:** Add a manifest completeness test (mirrors the photosynthesis manifest test: every
  name → a `/images/icons/...svg` URL, unique).
- [ ] **Step 3: Browser verify** — render a row of icons in each domain color via `drawSvg` + a legend;
  screenshot. — [ ] **Step 4: Commit** `feat: domain icon kit + manifest`.

## Self-review
- Color assignment stable/wrapping/fallback tested; icons reuse the existing registry; legend themed. ✅

## What this unlocks
Consistent, legible symbology and color-coding for maps (16) and any categorical scene.
