---
name: workflow-plotting
layer: workflow
description: >
  Craft guidance for PLOTTING — turning a function or dataset into a graph that argues. Reusable across
  physics (laws), math (curves/limits), economics (trends), data-stories. Obeys SIMPLE-JSON-LLM-CONTEXT.md.
uses: curve · chart (function · line · area · scatter · bar · pie · donut · riemann)
---

# Workflow: Plotting — the graph as the argument

A plot isn't an illustration of the point; it *is* the point. Pick the kind that matches the claim, and
make the graph do the reasoning.

## Choose the chart by the claim

- **`function` / `curve`** — a law or relationship (`x^2`, `1/r^2`, `sin(x)`). Use the safe expression
  language over a stated domain; never JavaScript.
- **`line` / `area`** — a trend or accumulation over an ordered axis (needs `series`).
- **`scatter`** — a correlation or a cloud of measurements (needs `series`).
- **`bar`** — compare discrete categories (needs `data`).
- **`pie` / `donut`** — parts of a whole (needs `data`); use sparingly.
- **`riemann`** — a sum/area approximation under a curve (needs `function`).

## Make it argue

- **Mark the point that matters.** A plot exposes anchors (`plot.peak`, a root, `plot.area`). Attach a
  label or `attention` to the exact anchor so the annotation sits *on* the mathematics, not near it.
- **Tie the plot to the rest of the scene.** If an object is moving (see `motion`), mark the point on
  the curve for its current state so graph and object describe the same instant.
- **Show change by re-plotting.** To reveal a limit or a trend, hold the axes fixed and change the data
  across beats (more Riemann bars; a series extending). Let the viewer *watch* it converge or climb —
  don't just state it.
- **Honest axes.** Label what varies and its units. Don't rescale mid-argument.

## Pitfalls

- Wrong data field for the kind → `bar/pie/donut` need `data`; `line/area/scatter` need `series`;
  `function/riemann` need `function`. (Contract rule.)
- A chart with no marked feature → it's decoration; annotate the point that proves the claim.
- Pie with many slices → use a bar.

Domains that lean on this: **mathematics** (curves, riemann/limits), **physics** (laws),
**economics/data-story** (trends). The domain skill says what the graph should *prove*.
