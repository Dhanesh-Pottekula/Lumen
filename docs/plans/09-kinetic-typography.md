# Step 09 — Kinetic Typography

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Text and numbers as animated citizens: **counters/number tickers**, **date slams**, and
**word-by-word** reveals — themed, and driven by `t`.

**Architecture:** Pure value/format helpers (`counterValue`, `formatNumber`) + draw helpers that use
`frame.theme.type` and the emphasis envelope (Step 08) for slams. All seekable.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic; themed; existing suite green; build clean.

## File structure
- Create `src/render/type-motion.ts` — `counterValue`, `formatNumber`, `drawCounter`, `drawWordReveal`, `drawSlam`.
- Create `src/render/type-motion.test.ts` — counter interpolation + number formatting + word count reveal.

---

### Task 1: pure helpers

**Interfaces — Produces:**
```ts
counterValue(t, at, dur, from, to): number      // eased interpolation, clamped
formatNumber(n, opts?: {decimals?; commas?}): string
wordsShown(text: string, p: number): string     // first ceil(p*wordCount) words
```

- [ ] **Step 1: Failing tests** — `src/render/type-motion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { counterValue, formatNumber, wordsShown } from "./type-motion";

describe("counterValue", () => {
  it("interpolates from→to over [at, at+dur], clamped", () => {
    expect(counterValue(0, 2, 4, 0, 100)).toBe(0);
    expect(counterValue(6, 2, 4, 0, 100)).toBe(100);
    expect(counterValue(4, 2, 4, 0, 100)).toBeGreaterThan(0);
  });
});

describe("formatNumber", () => {
  it("adds commas and decimals", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(3.14159, { decimals: 2 })).toBe("3.14");
    expect(formatNumber(1000, { commas: false })).toBe("1000");
  });
});

describe("wordsShown", () => {
  it("reveals words progressively", () => {
    expect(wordsShown("a b c d", 0)).toBe("");
    expect(wordsShown("a b c d", 0.5)).toBe("a b");
    expect(wordsShown("a b c d", 1)).toBe("a b c d");
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/type-motion.ts`** (pure helpers + draw fns):

```ts
import { clamp01, easeOutCubic } from "../slides/anim";

export function counterValue(t: number, at: number, dur: number, from: number, to: number): number {
  return from + (to - from) * easeOutCubic(clamp01((t - at) / dur));
}

export function formatNumber(n: number, opts: { decimals?: number; commas?: boolean } = {}): string {
  const { decimals = 0, commas = true } = opts;
  const fixed = n.toFixed(decimals);
  if (!commas) return fixed;
  const [int, frac] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${withCommas}.${frac}` : withCommas;
}

export function wordsShown(text: string, p: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  const n = Math.ceil(clamp01(p) * words.length);
  return words.slice(0, n).join(" ");
}
```
Plus `drawCounter(frame, x, y, value, fontPx)`, `drawWordReveal(frame, x, y, text, p, fontPx)`, and
`drawSlam(frame, x, y, text, t, at, fontPx)` (scales via `1 + emphasis(t,at)*0.4`, flashes via
`flashAlpha`), all using `frame.theme.type.display` + `frame.theme.palette.ink` and drawing on the
`annotation` layer.

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Browser verify** — a year counting up + a date slam; screenshot. — [ ] **Step 6: Commit**
  `feat: kinetic typography — counters, word reveal, date slam`.

## Self-review
- Interpolation/format/word-reveal pure & tested; draws themed on annotation layer. ✅

## What this unlocks
Dramatic dates/numbers for history and data for every subject; pairs with charts (12) and timeline (13).
