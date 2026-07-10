# Step 02 — Theme / Art-Direction System

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A runtime **theme** object (palette, texture, line-style, type, fx) carried on `FrameCtx`, so
one data swap reskins an entire film — parchment (history), blueprint (physics), chalkboard (maths),
textbook (biology) — plus a hand-drawn `roughness` line treatment.

**Architecture:** A `Theme` is plain data. The player owns the active theme and passes it into
`createFrame`, which puts it on `frame.theme`. A `paintTexture(ctx, theme, w, h)` renders the themed
backdrop. Scenes read `frame.theme.palette.<role>` instead of hard-coding colors; a `roughen()` helper
gives lines a seeded hand-drawn wobble. Physical-color artwork opts out of theming.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints

- Deterministic: `roughen` uses a seeded PRNG (from `anim.ts`), never `Math.random`.
- Backward compatible: `frame.theme` has a safe default (`TEXTBOOK`); scenes that ignore it are unchanged.
- Existing suite stays green; `npm run build` clean.
- Theme styles the **explanatory layer** (lines, labels, UI, backdrop). True-color illustrations (SVG leaf, etc.) are unaffected.

## File structure

- Create `src/render/theme.ts` — `Theme`, role types, presets (`TEXTBOOK`, `PARCHMENT`, `BLUEPRINT`, `CHALKBOARD`), `roughen()`.
- Create `src/render/theme.test.ts` — `roughen` determinism + palette role resolution.
- Create `src/render/texture.ts` — `paintTexture(ctx, theme, w, h)` per texture kind.
- Modify `src/render/frame.ts` — add `theme` to `FrameCtx` and a param to `createFrame`.
- Modify `src/components/CanvasSlide.tsx` — `theme?` prop → passed into `createFrame`; paint texture first.
- Modify `src/slides/compose.ts` — accept `options.theme`, thread into each `createFrame`.
- Modify `src/App.tsx` — set a theme per film (demo).

---

### Task 1: `theme.ts` — Theme type, presets, `roughen`

**Interfaces — Produces:**
```ts
export type Palette = { bg: string; surface: string; ink: string; accent: string; muted: string; danger: string };
export type TextureKind = "none" | "parchment" | "blueprint" | "chalkboard";
export interface Theme {
  name: string;
  palette: Palette;
  texture: TextureKind;
  lineStyle: { width: number; roughness: number };   // roughness 0 = crisp, ~2 = hand-drawn
  type: { display: string; body: string; mono: string };
  fx: { glow: boolean; grain: number; vignette: number };
}
export const TEXTBOOK: Theme; export const PARCHMENT: Theme;
export const BLUEPRINT: Theme; export const CHALKBOARD: Theme;
export function roughen(points: [number, number][], roughness: number, seed: number): [number, number][];
```

- [ ] **Step 1: Failing tests** — `src/render/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PARCHMENT, roughen, TEXTBOOK } from "./theme";

describe("theme presets", () => {
  it("expose the six palette roles", () => {
    for (const t of [TEXTBOOK, PARCHMENT]) {
      for (const role of ["bg", "surface", "ink", "accent", "muted", "danger"] as const) {
        expect(typeof t.palette[role]).toBe("string");
      }
    }
  });
});

describe("roughen", () => {
  it("returns same length and is deterministic for a seed", () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    const a = roughen(pts, 2, 7);
    const b = roughen(pts, 2, 7);
    expect(a).toHaveLength(3);
    expect(a).toEqual(b); // deterministic
  });

  it("roughness 0 leaves points unchanged", () => {
    const pts: [number, number][] = [[3, 4], [5, 6]];
    expect(roughen(pts, 0, 1)).toEqual(pts);
  });

  it("nudges points when roughness > 0", () => {
    const pts: [number, number][] = [[0, 0], [10, 0]];
    expect(roughen(pts, 3, 1)).not.toEqual(pts);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`npm test`).
- [ ] **Step 3: Implement `src/render/theme.ts`:**

```ts
import { prng } from "../slides/anim";

export type Palette = { bg: string; surface: string; ink: string; accent: string; muted: string; danger: string };
export type TextureKind = "none" | "parchment" | "blueprint" | "chalkboard";

export interface Theme {
  name: string;
  palette: Palette;
  texture: TextureKind;
  lineStyle: { width: number; roughness: number };
  type: { display: string; body: string; mono: string };
  fx: { glow: boolean; grain: number; vignette: number };
}

const SANS = "-apple-system, system-ui, sans-serif";

export const TEXTBOOK: Theme = {
  name: "textbook",
  palette: { bg: "#16222c", surface: "#1e2c38", ink: "#eef5ef", accent: "#5cc8ae", muted: "#93a4b0", danger: "#e24b4a" },
  texture: "none",
  lineStyle: { width: 2, roughness: 0 },
  type: { display: `700 ${SANS}`, body: SANS, mono: "ui-monospace, monospace" },
  fx: { glow: true, grain: 0.04, vignette: 0.3 },
};

export const PARCHMENT: Theme = {
  name: "parchment",
  palette: { bg: "#efe2c4", surface: "#e6d3a8", ink: "#4a2f1a", accent: "#9a3b2e", muted: "#8a7048", danger: "#8c2b1e" },
  texture: "parchment",
  lineStyle: { width: 2.4, roughness: 1.6 },
  type: { display: `700 Georgia, serif`, body: "Georgia, serif", mono: "ui-monospace, monospace" },
  fx: { glow: false, grain: 0.06, vignette: 0.42 },
};

export const BLUEPRINT: Theme = {
  name: "blueprint",
  palette: { bg: "#0d2b52", surface: "#123a6b", ink: "#dbe9ff", accent: "#7fd0ff", muted: "#7f9fce", danger: "#ff8a8a" },
  texture: "blueprint",
  lineStyle: { width: 1.6, roughness: 0 },
  type: { display: `700 ${SANS}`, body: SANS, mono: "ui-monospace, monospace" },
  fx: { glow: true, grain: 0.03, vignette: 0.3 },
};

export const CHALKBOARD: Theme = {
  name: "chalkboard",
  palette: { bg: "#1f2a26", surface: "#26332e", ink: "#eaf3ec", accent: "#ffe08a", muted: "#9db3a6", danger: "#ff9a9a" },
  texture: "chalkboard",
  lineStyle: { width: 2.6, roughness: 1.2 },
  type: { display: `700 ${SANS}`, body: SANS, mono: "ui-monospace, monospace" },
  fx: { glow: false, grain: 0.08, vignette: 0.36 },
};

/** Seeded per-point jitter for a hand-drawn look. roughness 0 → unchanged. Deterministic. */
export function roughen(points: [number, number][], roughness: number, seed: number): [number, number][] {
  if (roughness <= 0) return points.map((p) => [p[0], p[1]]);
  const r = prng(seed);
  return points.map(([x, y]) => [x + (r() - 0.5) * 2 * roughness, y + (r() - 0.5) * 2 * roughness]);
}
```

- [ ] **Step 4: Run — PASS.** — [ ] **Step 5: Commit** `feat: theme presets + roughen()`.

---

### Task 2: Add `theme` to FrameCtx and thread it through player + composer

**Files:** Modify `src/render/frame.ts`, `src/components/CanvasSlide.tsx`, `src/slides/compose.ts`.

- [ ] **Step 1:** In `frame.ts`, add `theme` to `FrameCtx` and a param to `createFrame`:

```ts
import type { Theme } from "./theme";
import { TEXTBOOK } from "./theme";
export interface FrameCtx { t: number; viewW: number; viewH: number; layer: LayerApi; theme: Theme }
export function createFrame(target, t, viewW, viewH, theme: Theme = TEXTBOOK) { /* ...; return { t, viewW, viewH, layer, theme, finish }; */ }
```
(Update the existing `createFrame` call sites — they gain an optional theme arg defaulting to `TEXTBOOK`, so Step 01 tests stay valid.)

- [ ] **Step 2:** `CanvasSlide.tsx`: add `theme?: Theme` prop; pass it into `createFrame(ctx, seconds, viewW, viewH, theme)`.
- [ ] **Step 3:** `compose.ts`: add `theme?: Theme` to `ComposeOptions`; pass it into every `createFrame(...)` call.
- [ ] **Step 4:** `npm run build && npm test` — green.
- [ ] **Step 5: Commit** `feat: carry theme on FrameCtx through player + composer`.

---

### Task 3: `texture.ts` — themed backdrops

**Files:** Create `src/render/texture.ts`; call it from `CanvasSlide.tsx` (paint before scene render, into the `bg` layer or main ctx).

- [ ] **Step 1:** Implement `paintTexture(ctx, theme, w, h)`:

```ts
import { prng } from "../slides/anim";
import type { Theme } from "./theme";

/** Paint the themed backdrop across the whole view. Deterministic (seeded) grain. */
export function paintTexture(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = theme.palette.bg;
  ctx.fillRect(0, 0, w, h);
  if (theme.texture === "parchment") {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, "rgba(255,248,224,0.35)");
    g.addColorStop(1, "rgba(120,90,40,0.0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const r = prng(11); ctx.globalAlpha = 0.05; ctx.fillStyle = "#5a3a1a";
    for (let i = 0; i < 240; i++) ctx.fillRect(r() * w, r() * h, 1.4, 1.4);
  } else if (theme.texture === "blueprint") {
    ctx.strokeStyle = "rgba(150,200,255,0.16)"; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else if (theme.texture === "chalkboard") {
    const r = prng(23); ctx.globalAlpha = 0.06; ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 300; i++) ctx.fillRect(r() * w, r() * h, 1.2, 1.2);
  }
  ctx.restore();
}
```

- [ ] **Step 2:** In `CanvasSlide.draw()`, before `slide.render`, paint the texture when the theme has one:

```ts
      const frame = createFrame(ctx, seconds, slide.viewW, slide.viewH, theme);
      if (theme.texture !== "none") paintTexture(ctx, theme, slide.viewW, slide.viewH);
      slide.render(ctx, seconds, frame);
      frame.finish();
```
(For films whose scenes fully clear their own backdrop, the texture will be covered — those scenes should opt into leaving the backdrop to the theme; document this. For the demo in Task 4 we pick a theme-friendly case.)

- [ ] **Step 3:** `npm run build && npm test` — green.
- [ ] **Step 4: Commit** `feat: themed texture backdrops (parchment/blueprint/chalkboard)`.

---

### Task 4: Demonstrate a theme end-to-end

**Files:** Modify `src/App.tsx` (+ a small themed demo scene if needed).

- [ ] **Step 1:** Add a minimal demo card that composes one or two simple diagram scenes (text + lines + a callout-style label, drawn with `theme.palette.ink`/`accent`) and pass `theme={BLUEPRINT}` (physics feel) or `{PARCHMENT}` (history feel). Keep the photosynthesis film on `TEXTBOOK` (true-color art unaffected).
- [ ] **Step 2: Browser verify** — `npm run dev`: confirm the demo card shows the themed backdrop + themed line/label colors, and swapping the theme constant reskins it entirely. Screenshot both themes.
- [ ] **Step 3:** `npm run build && npm test` — green.
- [ ] **Step 4: Commit** `feat: demo theme applied end-to-end`.

---

## Self-review checklist

- `Theme` is pure data; `roughen` deterministic + tested. ✅
- Default `TEXTBOOK` keeps existing films unchanged. ✅
- Texture paints the explanatory backdrop; true-color scenes opt out. ✅
- One constant swap reskins a film (verified in browser). ✅

## What this unlocks

Every later primitive (callouts, plots, timeline, kinetic type) reads `frame.theme`, so the whole
library inherits a look for free — and the authoring model (Step 19) only needs to name a theme.
