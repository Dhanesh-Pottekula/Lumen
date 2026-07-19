---
name: workflow-build-up
layer: workflow
description: >
  Craft guidance for BUILD-UP — revealing something one piece at a time, or refining it toward a limit.
  Reusable across math (construct-and-refine), any layered explanation, a story's rising action. Obeys
  SIMPLE-JSON-LLM-CONTEXT.md.
uses: beats (sequential) · show/hide · pace · emphasize
---

# Workflow: Build-up — reveal and refine in steps

Complex things are understood in order, not all at once. Build-up is the craft of pacing a reveal so
each step lands before the next arrives.

## The core idea: beats are your sentences

Beats play in order; actions inside a beat happen together. So structure the explanation as a sequence
of beats, each adding *one* idea. Never reveal the whole diagram, equation, or dataset in a single beat
if it has parts worth seeing separately.

## Two shapes

- **Layered reveal.** Show piece 1, let it register, then piece 2 relates to piece 1, then piece 3…
  Each `show` (with a deliberate `pace`) is a beat. Use `emphasize` to point at the piece that just
  arrived. Good for anatomy, a system diagram, a multi-term equation.
- **Refine toward a limit.** Hold the subject fixed and increase its resolution across beats — more
  Riemann bars, a finer mesh, more data points — while a `stat` converges. Let the viewer *watch* it
  tighten. Good for limits, sums, approximations, "as n → ∞."

## Craft

- **One idea per beat.** If you can't say what a beat adds in a sentence, split it.
- **Pace the important step.** Give the key reveal `slow`/`dramatic`; let minor ones be `quick`.
- **Carry a thread.** Later pieces should visibly attach to earlier ones (position, a connecting line,
  a shared color) so the build feels cumulative, not a slideshow.
- **Land the payoff.** End the build with the thing it was building toward — the definition, the whole
  structure, the converged number.

## Pitfalls

- Everything appears at once → nothing is emphasized; break into beats.
- Steps don't connect → feels like unrelated slides; thread them.
- Refinement stated not shown → show n increasing and the number settling.

Domains that lean on this: **mathematics** (construct-and-refine), **biology/physics** (layered
diagrams), **narrative** (rising action), any dense explanation.
