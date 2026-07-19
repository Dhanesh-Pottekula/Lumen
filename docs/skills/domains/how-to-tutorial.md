---
name: lumen-how-to-tutorial
layer: domain
default_theme: textbook
lean_on: [build-up, focus, labeling, diagram-svg, timeline]
description: How-to / tutorial lessons — a procedure taught as ordered, followable steps.
---

# How-to / tutorial — domain overlay

Base: `SIMPLE-JSON-LLM-CONTEXT.md`. Craft: the `lean_on` workflows.

## Mindset
A tutorial is **an ordered procedure the viewer could follow.** Each step is one action with a visible
result; the sequence is sacred. Show the state before and after each step so the viewer always knows
where they are. Clarity beats flourish.

## Defaults
- Theme `textbook` (clean, instructional). Compositions `process`, `hero-diagram`, `overview-detail`.
- Palette: `svg-artwork`/`visual` (the thing being worked on), `motion` (the action), numbered `text`,
  `stat`/`text` (step counter).

## Lean on these workflows
- **[build-up]** — the core tool: one step per beat, in strict order, each with a visible result.
- **[focus]** — highlight exactly where the current step acts; keep the rest calm.
- **[labeling]** — number the steps; short imperative captions ("Fold here").
- **[diagram-svg]** — the object/interface with named parts you act on.
- **[timeline]** — a step tracker showing progress through the procedure.

## Named approaches (lenses)
- `step-by-step` — step 1 → n, each action shown with its result.
- `assemble` — build something up part by part (references [diagram-svg] parts).
- `checkpoint` — show the correct intermediate state after key steps.

## Guardrails
Never skip or reorder steps. Each step: one action, one visible outcome. Highlight the exact site of
action. Correct, safe instructions only. No decoration that obscures the step.

## A good lesson
"How to tie a bowline" — a rope diagram, each step a directed `motion` of the working end with the knot
state after it, a step counter, and short imperative captions.
