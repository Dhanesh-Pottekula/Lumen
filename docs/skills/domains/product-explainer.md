---
name: lumen-product-explainer
layer: domain
default_theme: textbook
lean_on: [build-up, focus, comparison, diagram-svg, labeling]
description: Product / concept explainer lessons — how a product or feature works and why it helps.
---

# Product explainer — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
A product explainer shows **the problem, then the product solving it.** Lead with the pain, reveal how
the product works in a few clear steps, and prove the benefit. Concrete over abstract; show the outcome.
Restrained and credible — no hype, the demonstration convinces.

## Defaults
- Theme `textbook` (clean, modern). Compositions `hero`, `process`, `split`, `overview-detail`.
- Palette: `svg-artwork`/`visual` (product/UI/flow), `motion` (a step happening), `stat` (a result),
  `text`.

## Lean on these workflows
- **[build-up]** — the core tool: the mechanism/flow one step per beat.
- **[focus]** — one feature in focus at a time; push in on the key interaction.
- **[comparison]** — before (the pain) vs after (with the product).
- **[diagram-svg]** — a clean flow/architecture/UI diagram with named parts.
- **[labeling]** — a headline result `stat`; short benefit captions.

## Named approaches (lenses)
- `problem-solution` — the pain → the product → the flow → the result.
- `how-it-flows` — a system/data flow diagram built up step by step.
- `before-after` — life without vs with the product, in a `split`.

## Guardrails
Claims must be truthful and supportable — no invented metrics. Show, don't boast. One feature per scene.
Restraint over decoration.

## A good lesson
"How a password manager works" — the pain (reused weak passwords), the vault flow (generate → store
encrypted → autofill), built up step by step, ending on the benefit: one strong unique password per site.
