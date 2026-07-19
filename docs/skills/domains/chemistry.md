---
name: lumen-chemistry
layer: domain
default_theme: textbook
lean_on: [diagram-svg, motion, effects, labeling, build-up]
description: Chemistry lessons — structure, reactions, and transformation of matter.
---

# Chemistry — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
Chemistry is **structure and transformation of matter.** Show what a substance *is* (its structure),
then what *happens* (bonds break/form, particles move, states change) — and conserve everything on
screen so the transformation reads as real.

## Defaults
- Theme `textbook` (clean structures) or `blueprint` (mechanisms). Compositions `hero-diagram`,
  `process`, `equation`, `split`.
- Palette: `svg-artwork` (molecules/apparatus), `motion`/`effect` (particles), `equation` (reactions).

## Lean on these workflows
- **[diagram-svg]** — the core tool: molecules and apparatus as `svg-artwork` with named atoms/bonds.
- **[motion]** — atoms/particles rearranging; use `along`/`move` to show a mechanism step.
- **[effects]** — particle flow only for real movement (gas escaping, ions in solution).
- **[build-up]** — reveal a mechanism one step at a time.
- **[labeling]** — a balanced reaction equation; concentration/energy readouts.

## Named approaches (lenses)
- `show-the-mechanism` — reactants → each step of bond change → products.
- `structure-to-property` — build the molecule, then explain a property from its shape.
- `compare-states` — before/after a reaction, or two isomers/phases.

## Guardrails
Conserve mass/atoms visibly. Effects only for real particle movement. Keep the equation balanced and
consistent with the diagram. Clean up intermediates.

## A good lesson
"Why salt dissolves" — show the NaCl lattice, then water molecules pulling ions away with directed
`motion`, a temporary flow of hydrated ions, and the dissolution equation.
