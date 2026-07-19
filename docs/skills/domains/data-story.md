---
name: lumen-data-story
layer: domain
default_theme: blueprint
lean_on: [plotting, build-up, comparison, labeling, focus]
description: Data-story / report lessons — a dataset narrated into an insight.
---

# Data story / report — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
A data story turns numbers into **one clear insight.** Don't dump a dashboard — lead the viewer through
the data to a single takeaway: show the whole, zoom to the pattern, name the insight. One chart per
scene, each earning its place.

## Defaults
- Theme `blueprint` or `textbook`. Compositions `data`, `equation-plot`, `comparison`, `overview-detail`.
- Palette: `chart` (the right kind per claim), `stat` (the headline number), `legend`, `text`.

## Lean on these workflows
- **[plotting]** — the core tool: pick the chart to match the claim; mark the point that matters.
- **[build-up]** — reveal the data progressively; annotate the pattern after it's visible.
- **[comparison]** — the segments/periods/groups that carry the insight.
- **[labeling]** — the headline `stat`; a one-line takeaway per scene; a legend for categories.
- **[focus]** — direct the eye to the single point/bar/region that proves the claim.

## Named approaches (lenses)
- `one-insight` — the whole → highlight the pattern → the takeaway number.
- `trend-over-time` — a `line`/`area` with the turning point marked.
- `breakdown` — parts of a whole or category comparison, with the notable one emphasized.

## Guardrails
Real, sourced data only — **never fabricate numbers.** Honest axes; one claim per chart. Annotate the
point that proves it; don't leave the reader to hunt. No decorative charts.

## A good lesson
"Where the budget goes" — the total as a `stat`, a bar breakdown by category with the largest slice
emphasized, then the one-line insight — every figure sourced.
