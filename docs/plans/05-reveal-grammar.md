# Step 05 — Reveal Grammar (full-capacity: masks, wipes, blend modes)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Expressive entrances beyond the fade — the complete vocabulary of shape-based reveals
(wipes, irises, clock sweeps, blinds, checkerboards, dissolves, spotlight/fog-of-war) plus blend
modes — as one small, open system. Every option the research surfaced is either implemented or
trivially addable through the same primitive, so no future use case is blocked.

**The unifying model (why it's scalable).** Every reveal is a mask that is a pure function of progress
`p`. On canvas there are exactly two ways to apply that mask:
- **Hard edge** → `ctx.clip()` to the revealed shape (cheap).
- **Soft edge** → render content to an offscreen buffer, then `destination-in` a mask whose alpha is
  the coverage; **feather = a `blur()` filter on the mask**; **invert = `destination-out`** (conceal /
  fog-of-war). So a verb only describes *"what shape is revealed at p"* (a `pathFn`); one executor
  (`applyReveal`) picks hard vs. soft. Any exotic wipe not built (pinwheel, spiral, zigzag-edge,
  luma-matte-from-image, matrix/rain, pixelize) is just a different mask drawn via `masked()`.

**Architecture:** `src/render/reveal.ts`. Deterministic & seekable: mask recomputed from `p` each
frame with no state; `ease` wraps `p` (never baked in); dissolve/checker randomness is seeded.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic (`p` from `t`); `npm run build` clean; additive/backward-compatible.
- **Project overrides:** tests removed → verify with a scratch eval + the browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/reveal.ts` — the whole system (below).
- **New** `src/slides/revealDemo.ts` + a card in `App.tsx` — capability demo / living verification.

---

## The complete surface (implemented)

**Core**
- `type BlendMode = GlobalCompositeOperation` and `withBlend(ctx, mode, draw)` — run a draw under any of
  the 26 composite/blend modes (multiply = ink/stain, screen/lighter = glow, destination-out = erase, …).
- `masked(ctx, w, h, drawContent, drawMask, {invert})` — the universal soft-mask primitive (offscreen
  `destination-in`/`-out`); falls back to unmasked content when no DOM canvas is present.
- `applyReveal(...)` (internal) — hard `clip()` when `feather=0 && !invert`, else `masked` with a
  `blur()`-feathered mask. Shared executor for every verb.
- Shared `RevealOptions { feather?, invert?, ease? }`.

**Verbs**
- `revealRect(p, dir, w, h)` — pure rect geometry.
- `wipe(ctx, p, w, h, draw, { dir, angle, feather, invert, ease, border })` — dirs `left/right/up/down`,
  `center-h/center-v/center`, `edges-h/edges-v`, arbitrary `angle` (diagonals), optional colored `border`.
- `iris(ctx, p, cx, cy, maxR, draw, { shape, aspect, sides, rotation, innerRatio, close, … })` — shapes
  `circle/ellipse/rect/diamond/polygon/star`; open or `close`.
- `clipShape(ctx, points, draw, { invert, feather })` — arbitrary polygon.
- `radialWipe(ctx, p, cx, cy, radius, draw, { startAngle, dir })` — clock / pie sweep.
- `blinds(ctx, p, w, h, draw, { count, dir })` — venetian slats.
- `checkerboard(ctx, p, w, h, draw, { rows, cols, order: rowcol|diagonal|radial|random, seed })`.
- `dissolve(ctx, p, w, h, draw, { seed, cell })` — organic seeded cell dissolve.
- `spotlight(ctx, cx, cy, radius, draw, { feather, invert, dim })` — soft radial reveal, or dim-the-surround
  (attention / fog-of-war); center can be `p`-driven to follow.

**Documented as trivially-addable** via `masked()` + a custom mask function (the architecture already
supports them; add when a lesson needs one): pinwheel, spiral, zigzag/wave edge, luma-matte from an
image, matrix/rain, pixelize, gradient-threshold wipes, brush/paint fog-of-war (accumulating buffer).

---

### Task 1: reveal.ts core + verbs
- [ ] Implement `withBlend`, `masked`, `applyReveal`, `revealRect`, and every verb above. Feather via a
  `blur()` filter on the offscreen mask; invert via `destination-out`; ease wraps `p`; seeds for dissolve/
  checker-random.
- [ ] **Verify:** scratch eval — `revealRect(0.5,"left",100,50)` → `[0,0,50,50]`; a `masked` call renders
  without throwing; build clean.

### Task 2: demo + card + browser verify
- [ ] `src/slides/revealDemo.ts` — six tiles revealed by wipe(feather)/iris/clock/blinds/checker/dissolve
  (staggered), then a moving `spotlight` dim-surround and a `withBlend(multiply)` stain. Add a card.
- [ ] **Browser verify:** scrub — confirm mid-transition feathered wipe/iris, the clock wedge, the
  dissolve cells, the moving spotlight, and the multiply stain; other films non-regressed. **Uncommitted.**

---

## Self-review checklist
- One primitive (`mask = shape(p)`), two execution paths (clip / offscreen destination-in). ✅
- Full surface implemented; the rest addable via `masked()` with no new machinery. ✅
- Deterministic/seekable; `ease` separate from `p`; seeds fixed. ✅
- Composes with Step 03 layers (reveal a whole layer), Step 02 themes, Step 04 strokes. ✅

## What this unlocks
Fog-of-war + region reveals (16), focus spotlight / dim-surround (06), parchment staining via
`multiply` (02/03), and transition variety — zoom-through / wipe / iris (11).
