---
name: lumen-physics
layer: domain
default_theme: chalkboard
lean_on: [motion, plotting, focus, labeling, diagram-svg]
description: Physics lessons — phenomena that change over time or follow a law.
---

# Physics — domain overlay

Base contract: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the workflow skills in `lean_on`. This overlay only
sets *what things mean in physics*.

## Mindset
Physics is **change over time and cause → effect.** Let it happen, then measure it, then symbolize it —
motion first, graph second, equation last. Show the force; don't describe it.

## Defaults
- Theme `chalkboard`. Compositions `hero`, `equation-plot`, `split`, `data`.
- Assets `physics.cannon`, `physics.planet`, `symbols.arrow`, `nature.apple`.

## Lean on these workflows
- **[motion]** — the core tool: pick the kind that encodes the force (fall/orbit/along/spin); sync a
  number/plot to it so motion becomes *measurement*.
- **[plotting]** — give a law a shape (inverse-square, v–t); mark the point for the current state.
- **[focus]** — push in on the moment of change (release, impact, closest approach).
- **[labeling]** — reveal the equation after the picture; tie each symbol to something on screen.

## Named approaches (lenses)
- `simulate-then-plot` — run the motion, reveal the graph that measures it, land the equation.
- `derive-a-law` — build the formula term-by-term from the phenomenon, then plot and apply it.
- `compare-scenarios` — two motions in a `split`, change one variable (slow/fast, heavy/light).

## Guardrails
No motion/effect/camera move that doesn't encode a force, rate, or scale. Units on every quantity;
equation, plotted point, and motion must agree. Clean up traces/guide paths.

## A good lesson
"Why the Moon doesn't fall" — a fired ball's arc closes into an `orbit` (authored on its ring), a `stat`
tracks its speed, then plot 1/r² and reveal F = G·m₁m₂/r².
