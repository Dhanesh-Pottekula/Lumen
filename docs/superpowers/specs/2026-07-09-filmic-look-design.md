# Filmic look (Tier 1) — design

**Date:** 2026-07-09
**Status:** approved, pending implementation

## Goal

Make the photosynthesis film look cinematic — glow/bloom, soft shadows, a filmic overlay
(vignette + grain + grade), and richer easing/micro-motion — via shared helpers so scenes level
up together. Keep `render(ctx, t)` pure/seekable. Coimbatore opts out.

## Design

### 1. FX + easing helpers (`src/slides/anim.ts`)

- Easing (pure): `easeInOutCubic`, `easeOutBack` (overshoot), plus existing `smooth`/`easeOutCubic`.
- `radialGlow(ctx, x, y, r, color, alpha)` — additive (`globalCompositeOperation="lighter"`)
  radial-gradient blob for light sources/beams (sun, electrons, ATP, gap glows). Save/restored.
- `withGlow(ctx, { blur, color }, draw)` — runs `draw` with `shadowBlur`/`shadowColor` set for soft
  shadows/halos (native canvas; SVG-in-canvas can't). Save/restored.
- All new drawing helpers no-op safely on a stub ctx path only if the ctx supports the calls; they
  are used by scenes (real ctx in browser), not by unit-tested code paths.

### 2. Filmic overlay (`src/slides/compose.ts`)

- `ComposeOptions.filmGrade?: boolean` (default false). When true, after drawing scenes + dots the
  composer applies, in view space:
  - **vignette**: radial gradient, transparent center → ~0.35 alpha dark edges.
  - **grain**: sparse deterministic noise dots seeded by `Math.floor(t * 12)` (flickers yet stays
    seekable), very low alpha.
  - **grade**: a subtle top-to-bottom tint gradient for cohesion.
- Guarded so it only runs when the option is set (existing tests, which don't set it, are unaffected).

### 3. Apply in scenes (highest-impact spots)

- intro: sun bloom (`radialGlow`), additive light beams, soft shadow under leaf; molecules get a
  faint drop shadow.
- leaf cell / chloroplast: soft shadow under organelles; gentle breathing micro-motion.
- light reactions: additive glow on photons, electrons, and the ATP/NADPH formation.
- calvin: glow pulse on the ring/nodes; molecules shadowed.
- equation: glow on the sun + glucose; drop shadows on molecule chips; title glow.
- finale: title glow; station icons softly shadowed.
- Reveals use `easeOutBack` for a subtle overshoot where it reads well (nodes, tokens, titles).

### 4. App + player

- `App.tsx`: pass `filmGrade` to the photosynthesis film's `composeSlides`.
- `CanvasSlide.tsx`: cap dpr at 2 (`Math.min(2, devicePixelRatio)`) — avoids 9× overdraw on 3×
  phones with no visible gain.

### 5. Testing

- Unit-test the new pure easings (`easeInOutCubic`, `easeOutBack`) in `anim` tests.
- Existing 41 vitest stay green (`filmGrade` off in tests; scene glow uses real ctx only in browser).
- Browser: screenshot each scene, confirm the filmic look and no regressions; iterate.

## Out of scope

- Camera system, video export, WebGL (later tiers).
- Restyling Coimbatore (filmGrade stays off there).
