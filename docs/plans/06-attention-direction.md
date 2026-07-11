# Step 06 — Attention Direction (full-capacity: isolate / mark / point / de-emphasize / magnify / motion)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Direct the viewer's eye — the #1 teaching skill — as a complete, reusable toolkit. Every
technique the research surfaced across motion-graphics, UX coach-marks (Shepherd/Intro/Driver),
data-storytelling, and Manim's indication animations is either implemented or noted as trivially
addable. Each effect is a pure function of `t`/`p`, so the whole thing is deterministic and seekable.

**Architecture:** `src/render/focus.ts`, reusing earlier steps — reveal's `masked` (soft cutouts /
desaturate surround), stroke arrowheads + `drawOn` (pointers), and motion oscillators (`wobble`,
pulse). Effects draw onto whichever layer the scene chooses; the dim scrim goes on an isolated layer
(fg) so its `destination-out` holes cut the scrim, not the scene beneath.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic (`t`-driven); `npm run build` clean; additive/backward-compatible.
- **Project overrides:** tests removed → verify with scratch eval + the browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/focus.ts` — the toolkit (below).
- **New** `src/slides/focusDemo.ts` + a card in `App.tsx` — capability demo / living verification.

---

## The surface (implemented), by category

**Isolate the focus**
- `dimExcept(ctx, holes[], { intensity, color, feather })` — darken the view except one/more circle or
  rounded-rect holes (coach-mark cutout / spotlight; draw on an isolated layer).
- `spotlightFocus(ctx, cx, cy, r, opts)` — single-circle convenience.

**Mark the focus**
- `highlightRing(ctx, cx, cy, r, t, { amp, period, color, width })` — persistent breathing ring.
- `focusRings(ctx, cx, cy, p, { count, maxR, targetR })` — Manim "FocusOn" converging rings.
- `flash(ctx, cx, cy, r, p)` — additive radial beat; `sparkFlash(ctx, cx, cy, p, { count, length })` —
  Manim "Flash" radiating lines.
- `focusBox(ctx, x, y, w, h, t, { pad, corner, amp, dash, dashSpin })` — animated box (marching ants).
- `cornerBrackets(ctx, x, y, w, h, { pad, length, p })` — camera-reticle framing (optional snap-in).
- `indicate(ctx, cx, cy, p, draw, { scale })` — Manim "Indicate" scale-and-return beat.

**Point at the focus**
- `pointerArrow(ctx, fromX, fromY, toX, toY, p, { color, width })` — draw-on arrow, head on arrival.
- `bouncePointer(ctx, x, y, t, { size, color })` — bobbing triangle pointer.
- `convergingArrows(ctx, cx, cy, p, { count, ring, targetR })` — arrows sliding inward at the target.

**De-emphasize the surround**
- `ghost(ctx, alpha, draw)` — draw at reduced opacity.
- `emphasizeSurround(ctx, w, h, focusPath, drawScene, { filter })` — crisp focus, desaturated/blurred
  surround (draws the scene twice; `filter` default grayscale+dim).

**Magnify**
- `magnify(ctx, cx, cy, r, zoom, drawScene, { ringColor })` — in-place loupe.
- `vignetteTo(ctx, cx, cy, { strength, inner, outer })` — asymmetric edge vignette toward the focus.

**Motion emphasis**
- `wiggle(ctx, cx, cy, t, draw, { amp, freq })` · `pulseScale(ctx, cx, cy, t, draw, { amp, period })`.

**Pure helpers:** `ringRadius`, `scrimAlpha`.

**Noted as addable when needed** (owned by other steps or a trivial extension): leader lines / callouts
(Step 07), camera push-in / zoom-to-fit (Step 11), `ApplyWave` geometry displacement, hand-cursor tap,
fisheye focus+context, and the sequencing/relay meta-layer (focus hand-off, timed dwell) — which is just
staging these effects with `phase`/`stagger`.

---

### Task 1: focus.ts
- [ ] Implement every function above, reusing `masked` (reveal), `drawOn`/`arrowhead` (strokeVerbs),
  and `wobble`/`lerp`/`clamp01` (motion). Dim scrim uses `destination-out` soft holes; feather via a
  radial gradient (circle) or `blur()` (rect).
- [ ] **Verify:** scratch eval — `ringRadius(20,1) > 20`, `scrimAlpha(1) ≈ 0`; a `dimExcept` call renders
  without throwing; build clean.

### Task 2: demo + card + browser verify
- [ ] `src/slides/focusDemo.ts` — a row of chips; per segment, one technique directs the eye to one chip
  (dim+ring, box+brackets, arrow+bounce, focusRings+converging+pulse, magnify+vignette). Add a card.
- [ ] **Browser verify:** scrub each segment; confirm the spotlight scrim, box/brackets, pointer arrow,
  converging rings/arrows + pulse, and the loupe + vignette. Other films non-regressed. **Uncommitted.**

---

## Self-review checklist
- Full attention surface across all six categories; the rest addable without new machinery. ✅
- Deterministic/seekable; reuses steps 03–05 (no duplication). ✅
- Dim scrim isolated on its own layer so it cuts the scrim, not the scene. ✅

## What this unlocks
Every complex scene can now guide the eye. Pairs with callouts (07, leader lines), build-steps (08),
and is used heavily by maps (16) and any multi-part diagram.
