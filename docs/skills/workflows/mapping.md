---
name: workflow-mapping
layer: workflow
description: >
  Craft guidance for MAPS — telling a spatial story. Reusable across history (empires), geography,
  economics (trade), news (where events happen). Obeys SIMPLE-JSON-LLM-CONTEXT.md.
uses: map (regions · cities/markers · flows · legend)
---

# Workflow: Mapping — the spatial story

A map answers "where," and lets you show "where" *change* over time. Its power is that borders, routes,
and markers can move while the geography stays fixed.

## Orient before you narrate

Establish the frame first: the outline/coastline, the key places, and a `legend` so every color already
means something. A viewer lost in space can't follow the story. Only then start changing things.

## Craft

- **Target places by name.** Reference cities and regions by name/id (`"karakorum"`, `"yuan"`), not
  pixel coordinates — the engine projects them onto the map, so callouts, camera, and routes stay locked
  to the geography even as you zoom.
- **Keep the projection fixed.** Use one consistent map framing across the scene so places don't drift
  between states — that stability is what lets borders visibly grow.
- **Change over time.** Grow, morph, or recolor regions across beats so the viewer *watches* an empire
  expand, a disease spread, a market open.
- **Routes are flows — and temporary.** Use `flow` arrows for conquest, migration, or trade (stagger
  them; two entries for two-way trade). They're teaching marks: hide them once their point is made.
- **Legend discipline.** Each region/faction gets a distinct color that matches its shape on the map.

## Pair with time

A map story is strongest beside a `timeline` (see that workflow): keep the map's current state and the
timeline's playhead year in sync — the border you show and the year you show must agree.

## Pitfalls

- Diving into changes before orienting → viewer is lost.
- Places drift between scenes → projection/framing changed; keep it fixed.
- Route arrows left on screen → clean them up.
- Regions same color → give each a distinct legend color.

Domains that lean on this: **history**, **geography**, **economics** (trade/resources), **news**.
