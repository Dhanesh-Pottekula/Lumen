---
name: lumen-mathematics
layer: domain
default_theme: blueprint
lean_on: [plotting, build-up, labeling, comparison, focus]
description: Mathematics lessons — abstract structure made concrete on a plot or diagram.
---

# Mathematics — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
Mathematics is **structure and transformation.** Make the abstract concrete on a plot, build it up, and
let a construction **refine** until the idea is visible. Picture is the proof; equation is the summary.

## Defaults
- Theme `blueprint`. Compositions `equation-plot`, `comparison`, `split`, `custom-relational`.
- Palette: `curve`/`chart`, `equation`, `stat`. Assets rarely needed.

## Lean on these workflows
- **[plotting]** — the core tool: `function` for curves, `riemann`/`area` for sums/integrals; mark
  features by anchor; refine to show a limit.
- **[build-up]** — construct then refine (n = 8 → 16 → ∞) across beats.
- **[labeling]** — a `stat` running value that converges is the punchline; equation after the picture.
- **[comparison]** — hold two states of a construction side by side.

## Named approaches (lenses)
- `construct-and-refine` — pose on a plot, build coarse, refine to the limit, then define.
- `plot-and-analyze` — draw the curve, mark features via anchors, read the result.
- `prove-visually` — state, construct, transform, conclude.

## Guardrails
No decorative anything — maths is calm and exact. Picture before symbol. Plot, equation, and running
number must be consistent. Use the safe expression language, never JavaScript.

## A good lesson
"Area under a curve" — plot x², build Riemann bars, refine 8→16→32 as a `stat` climbs toward 9, then
write ∫₀³x² dx = 9 with each symbol tied to the construction.
