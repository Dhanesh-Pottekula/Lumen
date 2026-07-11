# Step 16 — Map / Geo Subsystem (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** History maps — projection, region fills with draw-on borders, borders-over-time via keyframe
interpolation, flow arrows, markers, fog-of-war, and camera integration.

**Architecture:** `src/render/geo.ts`. GeoJSON-shaped input (rings of `[lon,lat]`). To stay
deterministic/offline, feature data is **passed in (no fetch)** — a lesson bundles a small feature set
or an authored sample. Composes camera (11) for region zooms, morph (14) for borders-over-time, icons
(15) for markers, strokes (04) for draw-on borders/arrows, reveal (05) for fog-of-war.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/offline (no fetch at render); `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/geo.ts`; **new** `src/slides/geoDemo.ts` + card.

## The surface (implemented)
- `fitProjection(features, area, pad)` → equirectangular projection fit to the data bounds (north up).
- `drawFeature` / `drawMap(ctx, features, proj, styleFor)` — border draws on (`p`), fill fades in after (border-then-fill), even-odd holes.
- `borderAt(ringsA, ringsB, p, proj)` — borders-over-time via `morph`.
- `flowArrow(ctx, from, to, proj, p, {bend})` — curved trade/troop arrow, draw-on + head.
- `geoMarker(ctx, lonlat, proj, {icon, label, color})` — icon pins at coordinates.
- `featureCenter(feature)` → lon/lat center (project it → camera focus for region zoom).

**Noted as addable:** true Mercator/Albers projections, GeoJSON parser for real datasets (still passed
in, not fetched), choropleth scales, fog-of-war via `reveal.clipShape`/`spotlight` per feature, graticule.

## Tasks
- [ ] Implement `geo.ts` (above). Verify: projection maps bounds into area; build clean.
- [ ] `geoDemo.ts` + card: inline 3-region map, markers, flow arrow, border-over-time, camera zoom.
  Browser-verify. **Uncommitted.**

## Self-review
- Projection + regions (border-then-fill) + border-morph + flow + markers + camera zoom; deterministic/offline. ✅

## What this unlocks
History map lessons (trade, empires, battles); the biggest consumer of camera/morph/icons/reveal — proven by domain kits (18).
