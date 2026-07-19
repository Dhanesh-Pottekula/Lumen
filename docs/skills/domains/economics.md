---
name: lumen-economics
layer: domain
default_theme: blueprint
lean_on: [plotting, comparison, motion, labeling, mapping]
description: Economics/finance lessons — models, markets, trends, and trade-offs.
---

# Economics & finance — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
Economics is **relationships and trade-offs.** Most ideas are a curve (supply/demand, cost, growth) or a
comparison (with/without a policy). Make the model visible, then move a variable and show the effect.

## Defaults
- Theme `blueprint` (models) or `textbook` (clean charts). Compositions `equation-plot`, `data`,
  `comparison`, `split`.
- Palette: `chart`/`curve` (models & data), `stat` (a headline number), `map` (trade/regional), `text`.

## Lean on these workflows
- **[plotting]** — the core tool: model curves (supply/demand), trend `line`/`area`, category `bar`.
  Mark the equilibrium/turning point by anchor.
- **[comparison]** — with vs without a policy; two scenarios.
- **[motion]** — shift a curve and show the new equilibrium move.
- **[mapping]** — for trade, regional, or resource stories.

## Named approaches (lenses)
- `show-the-model` — draw the curves, shift one, read the new equilibrium.
- `read-the-data` — a real trend on a chart with the key point marked.
- `compare-policies` — outcomes side by side.

## Guardrails
Axes and units honest; label what varies. A shifted curve must move to a *consistent* new point. Don't
invent data; attribute to sources. No decorative effects. Not financial advice — explain mechanisms.

## A good lesson
"Why a price cap causes shortage" — draw supply & demand, drop the cap line below equilibrium, and show
the quantity-demanded vs quantity-supplied gap open up as the shortage.
