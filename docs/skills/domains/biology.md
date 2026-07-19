---
name: lumen-biology
layer: domain
default_theme: textbook
lean_on: [diagram-svg, labeling, plotting, focus, effects]
description: Biology lessons — a structure and a process that moves through it.
---

# Biology — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
Biology is **form and process.** Establish the structure, name its parts, then let the process move
through it — and prove it with a measurement that changes in step. Structure permanent; signal temporary.

## Defaults
- Theme `textbook`. Compositions `overview-detail`, `custom-relational`, `data`, `split`.
- Assets `biology.neuron.cell`, `biology.neuron.full`, `biology.ion-channel`; else custom `svg-artwork`.

## Lean on these workflows
- **[diagram-svg]** — the core tool: build anatomy as one `svg-artwork` with parts named by function.
- **[labeling]** — attach labels to the exact part, beside it, revealed in order.
- **[plotting]** — a synced line chart (voltage/concentration vs time) that *proves* the process.
- **[focus]** — `tour` the parts; `emphasize` the active site.
- **[effects]** — only for real ion/substance flow, never atmosphere.

## Named approaches (lenses)
- `label-the-structure` — show the whole, tour and label each part.
- `trace-the-process` — a signal travels stage by stage while a chart advances with it.
- `compare-states` — healthy vs diseased, identical anatomy, one change.

## Guardrails
Structure permanent; signals/markers temporary and cleaned up. No decorative motion/glow. Labels off the
subject. Keep any equation consistent with the diagram and units.

## A good lesson
"How a neuron fires" — label the neuron's parts, send an impulse down the axon (temporary highlight),
and draw the voltage spike on a synced chart as it travels.
