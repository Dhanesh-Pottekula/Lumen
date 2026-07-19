---
name: lumen-explainer
layer: domain
default_theme: textbook
lean_on: [build-up, focus, comparison, labeling, diagram-svg]
description: General explainer / documentary lessons — "how X works" or "why X happens" for any topic.
---

# Explainer / documentary — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows. Use this when the topic isn't a
single school subject but a "how/why does this work" explainer that may borrow from several.

## Mindset
An explainer answers **"how does this work?"** by breaking one system into a clear sequence: hook →
the pieces → how they fit → the payoff. Each scene reveals one mechanism the previous scene set up.
Borrow visuals from whatever subject the topic needs; the *structure* is what makes it an explainer.

## Defaults
- Theme `textbook` (clean, neutral). Compositions `hero-diagram`, `process`, `overview-detail`, `split`.
- Palette: whatever the topic needs — `svg-artwork` diagrams, `chart`, `map`, `stat`, `text`.

## Lean on these workflows
- **[build-up]** — the core tool: reveal the mechanism one piece per beat; each piece connects to the
  last.
- **[focus]** — keep exactly one thing in focus at a time as the explanation moves.
- **[comparison]** — contrast with the familiar ("unlike X, this…").
- **[labeling]** — name each part as it appears; conclude with the payoff.
- **[diagram-svg]** — a custom system diagram when no asset fits.

## Named approaches (lenses)
- `how-it-works` — hook → parts → assembly → it runs → why it matters.
- `why-it-happens` — the effect → the cause chain → the mechanism → the takeaway.
- `myth-vs-reality` — the common belief in a `split` against what actually happens.

## Guardrails
One mechanism per scene; build, don't dump. Borrowed subject visuals still follow that subject's rules.
Sourced facts; short captions. No decoration.

## A good lesson
"How noise-cancelling headphones work" — hook (noisy world), show incoming sound as a wave, generate the
inverted wave, sum them to silence (a `chart`/wave diagram built up), payoff: quiet.
