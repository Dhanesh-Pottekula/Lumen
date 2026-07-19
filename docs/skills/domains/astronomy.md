---
name: lumen-astronomy
layer: domain
default_theme: chalkboard
lean_on: [motion, focus, plotting, labeling, comparison]
description: Astronomy/space lessons — bodies, orbits, scale, and cosmic time.
---

# Astronomy — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
Astronomy is **motion and scale.** The hard parts are *how big* and *how it moves*. Use orbits and
distances to convey both — and use the camera to reveal scale by zooming between the small and the vast.

## Defaults
- Theme `chalkboard` (deep-space board). Compositions `hero`, `overview-detail`, `equation-plot`.
- Assets `physics.planet`, `symbols.star`; custom `svg-artwork` for systems.

## Lean on these workflows
- **[motion]** — the core tool: `orbit` for bound bodies (authored on their ring), `along` for a probe
  trajectory; sync a `stat` (period, distance).
- **[focus]** — zoom between scales (`shot: detail` → `overview`) to make size felt.
- **[plotting]** — a relationship (Kepler's period vs radius, brightness vs distance).
- **[comparison]** — relative sizes/distances side by side.

## Named approaches (lenses)
- `orbit-and-scale` — show the orbit, then pull out to reveal the system's scale.
- `derive-a-law` — a phenomenon → the relationship → plot it (Kepler, inverse-square light).
- `compare-scales` — put two bodies/distances side by side to make magnitude real.

## Guardrails
Orbits start on their ring (frame zero). Convey scale honestly; note when distances/sizes aren't to
scale. No decorative starfield unless it encodes the setting. Don't invent figures.

## A good lesson
"Kepler's third law" — planets orbit at different radii, a `stat` shows each period, then plot T² vs r³
as a straight line.
