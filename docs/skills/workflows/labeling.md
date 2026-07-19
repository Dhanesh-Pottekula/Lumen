---
name: workflow-labeling
layer: workflow
description: >
  Craft guidance for TEXT, LABELS, and READOUTS — words that support the visual instead of replacing it.
  Reusable across every domain. Obeys SIMPLE-JSON-LLM-CONTEXT.md.
uses: text · label · legend · stat · equation
---

# Workflow: Labeling — words in service of the picture

Text is support, not the show. If a sentence is doing the teaching, the visual has failed. Use words to
*name*, *quantify*, and *conclude* — things the viewer can't read directly off the picture.

## What each is for

- **`text`** — titles, short captions, one-line conclusions.
- **`label`** — a name pinned to a part of a visual (styles: `text`/`pill`/`tag`/`bubble`/`badge`).
- **`legend`** — the key that makes a color scheme mean something (essential with maps/charts of
  categories).
- **`stat`** — a number that matters: a readout, a running value, a final figure. Use `role: hud` for a
  screen-fixed readout that stays put through camera moves.
- **`equation`** — a formula, revealed after the picture, using only supported math-text commands.

## Craft

- **Attach to the thing.** A label points at a specific part anchor and sits *beside* it (use
  `relative` placement: `right-of`, `above`) so it never covers the subject.
- **Keep it short.** Headings under 8 words, labels under 12, callout bodies under 18. Long text is a
  sign the visual should be carrying more.
- **Reveal in step.** Don't drop all labels at once; bring each in as its part becomes relevant (see
  `build-up`). A `tour` naturally paces this.
- **Numbers with units.** Every quantity carries its unit; a `stat` that changes should change *with*
  the thing it measures (see `motion`, `plotting`).
- **Conclude, don't narrate.** End text states the takeaway the visual just proved — it doesn't
  describe what's happening frame by frame.

## Pitfalls

- Paragraphs on screen → the visual isn't doing its job; cut text, strengthen the picture.
- Label covering the subject → offset with relative placement.
- Category colors with no legend → add one.
- A stat that never changes but pretends to track something → sync it or make it a plain value.

Domains that lean on this: **all** — every lesson names, quantifies, and concludes.
