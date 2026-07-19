---
name: lumen-computer-science
layer: domain
default_theme: blueprint
lean_on: [diagram-svg, build-up, motion, focus, labeling]
description: Computer science lessons — data structures, algorithms, systems, and flow of control/data.
---

# Computer science — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
CS is **structure and flow of data/control.** Draw the structure (a tree, a graph, an array, a system),
then step through the algorithm one operation at a time, showing what moves and what changes.

## Defaults
- Theme `blueprint` (diagrammatic). Compositions `custom-relational`, `process`, `split`, `hero-diagram`.
- Palette: `svg-artwork`/`shape`/`line` (nodes and edges), `motion` (a pointer/value moving), `text`.

## Lean on these workflows
- **[diagram-svg]** — the core tool: nodes/edges/cells as `svg-artwork` with named parts you can
  highlight and update.
- **[build-up]** — reveal/execute the algorithm one step per beat; state changes visibly.
- **[motion]** — a pointer, packet, or value traversing the structure (`along`/`move`).
- **[focus]** — `emphasize` the node being visited; `attention` on the comparison/swap.

## Named approaches (lenses)
- `trace-the-algorithm` — draw the structure, then step the algorithm, highlighting each operation.
- `build-the-structure` — construct a tree/graph node by node, explaining invariants.
- `compare-approaches` — two algorithms/structures side by side (e.g. cost, order of growth).

## Guardrails
State changes must be visible and consistent (a highlighted node, an updated value). One operation per
beat. A complexity claim should be *shown* (a growth plot via [plotting]) not just stated.

## A good lesson
"Binary search" — draw the sorted array, a pointer pair narrowing each step (motion + emphasize on the
midpoint), halving the range until the target is found.
