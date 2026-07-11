# Step 14 — Shape / Path Morphing (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Turn one shape into another — resample both to a common point count, align their
correspondence, interpolate. Closed shapes (reactant→product, border→border) and open paths.

**Architecture:** `src/render/morph.ts` — reuses the arc-length sampler (`pointAt`) from strokes.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/morph.ts`; **new** `src/slides/morphDemo.ts` + card.

## The surface (implemented)
- `resample(points, n, closed)` — even arc-length resampling to `n` points.
- `align(a, b)` — rotate b's ordering to the min-travel correspondence (closed shapes).
- `morph(a, b, p, {n, closed, align, ease})` → interpolated points.
- `drawMorph(ctx, a, b, p, {fill, stroke, width, closed})` — convenience.
- Shape generators: `circleShape`, `polygonShape`, `starShape`, `heartShape`.

**Noted as addable:** multi-shape sequences (chain morphs), per-vertex easing, morph of shapes with holes
(multi-subpath), color/style crossfade during morph.

## Tasks
- [ ] Implement `morph.ts` (above). Verify: `resample` returns n points; `morph(a,a,p)` ≈ a; build clean.
- [ ] `morphDemo.ts` + card: cycle circle→square→star→heart→triangle. Browser-verify. **Uncommitted.**

## Self-review
- Resample + align + interpolate; closed & open; generators; seekable. ✅

## What this unlocks
Reactant→product transforms, one border→next (maps 16), letter→letter; pairs with draw-on (04).
