---
name: lumen-news-explainer
layer: domain
default_theme: textbook
lean_on: [mapping, labeling, comparison, timeline, plotting]
description: News / current-events explainer lessons — what happened, where, and why it matters.
---

# News explainer — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
A news explainer answers **what happened, where, and why it matters** — fast, clear, sourced. Lead with
the key fact, ground it in place and context, and quantify the impact. Neutral tone; the visuals carry
the facts.

## Defaults
- Theme `textbook` (clean, neutral). Compositions `map`, `data`, `overview-detail`, `split`.
- Palette: `map` (where), `chart`/`stat` (scale/impact), `timeline` (how it unfolded), `text`.

## Lean on these workflows
- **[mapping]** — the core tool for "where": locate the event, show the affected region.
- **[labeling]** — the headline fact as a `stat`; concise captions; a legend for any categories.
- **[comparison]** — before/after, or this vs the baseline.
- **[timeline]** — how events unfolded, if sequence matters.
- **[plotting]** — the numbers behind the story (a trend, a breakdown).

## Named approaches (lenses)
- `what-where-why` — the fact → the map → the impact figure → why it matters.
- `how-it-unfolded` — a timeline of the sequence.
- `by-the-numbers` — the key charts/stats that frame the story.

## Guardrails
**Only sourced facts and figures — never invent or estimate.** Neutral framing; attribute claims. Keep
it current and concise. No dramatization or decorative effects.

## A good lesson
"An earthquake explainer" — locate the epicenter on a map, a `stat` for magnitude and affected
population, a shaded impact radius, and a short timeline of the aftermath — every figure sourced.
