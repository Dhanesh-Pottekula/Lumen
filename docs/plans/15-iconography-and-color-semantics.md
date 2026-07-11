# Step 15 — Iconography & Color-Semantics (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A reusable vector icon/sprite kit + a color-semantics registry with auto-legend (category →
consistent color across the whole lesson).

**Architecture:** `src/render/icons.ts` — icons are pure path functions in a unit box (scale/theme/draw-on
cleanly); the color registry assigns stable palette colors per category and caches them.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/icons.ts`; **new** `src/slides/iconsDemo.ts` + card.

## The surface (implemented)
- **Icons (30):** arrow/check/cross/plus/minus/star/heart/circle/square/triangle/gear/bolt/drop/sun/leaf/
  flame/factory/home/person/book/flask/atom/clock/pin/warning/info/search/cloud/mountain/seed.
- `drawIcon(ctx, name, x, y, size, {color, filled, width, alpha})`; `iconNames`.
- **Color semantics:** `colorSemantics(palette?)` → `{ colorFor(category), legend(ctx, cats, x, y, {icon,…}) }`
  — stable per-category color (cached), auto-legend with swatch or icon.

**Noted as addable:** image-sprite atlas, more icons, per-theme icon styling, colorblind-safe palettes,
icon draw-on (via strokes) for a "constructing" reveal.

## Tasks
- [ ] Implement `icons.ts` (above). Verify: `drawIcon` renders each name; `colorFor` stable+distinct; build clean.
- [ ] `iconsDemo.ts` + card: icon grid + color-semantics legend + consistency bars. Browser-verify. **Uncommitted.**

## Self-review
- 30 icons pure/scalable; color registry stable+cached+legend. ✅

## What this unlocks
A consistent visual language across a lesson; used by maps (16, markers), callouts (07), and domain kits (18).
