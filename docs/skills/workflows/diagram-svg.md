---
name: workflow-diagram-svg
layer: workflow
description: >
  Craft guidance for custom DIAGRAMS/ARTWORK — building a structure with meaningful, targetable parts.
  Reusable across biology (anatomy), chemistry (apparatus/molecules), engineering, a story's character
  or set. Obeys SIMPLE-JSON-LLM-CONTEXT.md.
uses: visual · svg-artwork · svg-composite · vector
---

# Workflow: Diagram / SVG — structure with named parts

When no premade asset fits, you draw the thing. The quality of the whole lesson often lives in this
diagram, so build it to be *labelled, animated, and reasoned about* — not just looked at.

## Pick the tool (see the base doc §I.6 for full rules)

- **`visual`** — a named premade asset exists → always prefer it (ready-made anchors).
- **`svg-artwork`** — one custom diagram with a few meaningful parts → the default. Write one ordinary
  `<svg>`; every root-level `<g id="...">` becomes a targetable part (`object.part`).
- **`svg-composite`** — need exact per-part bounds, gradients, clips, or many addressable parts.
- **`vector`** — one custom stroke that must draw on or recolor at runtime.

## Craft that makes it usable

- **Name parts by function, not shape.** `soma`, `valve`, `rotor` — so labels and processes attach to
  meaning. Each named group is how you point at it later.
- **No transforms on a group you'll target.** Use explicit coordinates, or the part's bounds fall back
  to the whole viewBox and you can't label or attach to it precisely (`IMPRECISE_SVG_BOUNDS`).
- **Separate permanent from temporary.** The structure stays; teaching marks drawn *on* it (an arrow, a
  highlighted site, a projected path) go in `temporaryParts` (or `temporary`) and **must be hidden**
  before the scene ends.
- **Stay in the sanitized subset.** Only supported tags/attributes, only local `url(#id)` refs, timing
  from beats — never native SVG animation. Limits: ≤ 48,000 chars, ≤ 220 elements.

## Then attach meaning

A diagram earns its place when other things hook onto its parts: labels (see `labeling`), a process
moving through it (see `motion`), a measurement synced to it (see `plotting`). Draw it so those hooks
exist.

## Pitfalls

- Bare shapes at the SVG root, or unnamed root groups → rejected; wrap every drawn child in a named `g`.
- Transformed target group → imprecise bounds; use explicit coords or `svg-composite` with `bounds`.
- Temporary layer left visible → `TEMPORARY_VISUAL_PERSISTS`; add the hide.

Domains that lean on this: **biology** (anatomy), **chemistry** (apparatus/molecules),
**computer-science/engineering** (systems), **narrative** (characters/sets).
