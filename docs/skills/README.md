# Lumen skills — three-layer authoring system

Skills that make an LLM produce **good** Simple JSON video lessons. Three layers, composed per lesson:

```
Layer 0 · BASE       SIMPLE-JSON-LLM-CONTEXT.md   — the contract: schema, tokens, SVG, lifecycle, gate
Layer 1 · WORKFLOWS  workflows/*.md               — reusable CRAFT: how to use each capability WELL
Layer 2 · DOMAINS    domains/*.md                 — subject/story framing: which workflows to lean on
```

**To author a lesson, give the model:** the base doc **+ one domain skill**. The domain names the
workflows it leans on; the model reads those for the craft. Everything is *guidance*, not rigid
templates — the model keeps full freedom; the skills make its choices good and on-theme.

Why three layers: a capability like **motion** is used by physics, history, stories, and data alike —
so its craft lives once in `workflows/motion.md` and every domain references it, instead of each domain
re-explaining it.

## Layer 1 — Workflows (reusable craft)

Each teaches how to use one capability *well* — the technique, the judgment, the pitfalls.

| Workflow | Craft it teaches |
|---|---|
| [motion](workflows/motion.md) | make movement teach; frame-zero; motion→measurement |
| [plotting](workflows/plotting.md) | the graph as the argument; mark the point that matters |
| [mapping](workflows/mapping.md) | the spatial story; orient first; change over time |
| [timeline](workflows/timeline.md) | the story in time; era bands, events, playhead |
| [diagram-svg](workflows/diagram-svg.md) | custom artwork with named, targetable parts |
| [build-up](workflows/build-up.md) | reveal/refine in beats; one idea per beat |
| [comparison](workflows/comparison.md) | let the difference teach; change one variable |
| [focus](workflows/focus.md) | direct the eye; camera, attention, emphasis |
| [effects](workflows/effects.md) | particles/glow/flow — only when they encode the subject |
| [labeling](workflows/labeling.md) | text/labels/readouts in service of the picture |

## Layer 2 — Domains (framing)

Each = mindset · defaults (theme/compositions/assets) · **which workflows to lean on** · named
approaches (lenses) · guardrails · one good-lesson example. Domains are subjects **and** story types.

**Subjects:** [physics](domains/physics.md) · [chemistry](domains/chemistry.md) ·
[biology](domains/biology.md) · [mathematics](domains/mathematics.md) ·
[astronomy](domains/astronomy.md) · [earth-geography](domains/earth-geography.md) ·
[computer-science](domains/computer-science.md) · [economics](domains/economics.md)

**Humanities:** [history](domains/history.md)

**Stories / narrative / explainers:** [story-narrative](domains/story-narrative.md) ·
[explainer](domains/explainer.md) · [biography](domains/biography.md) ·
[news-explainer](domains/news-explainer.md) · [product-explainer](domains/product-explainer.md) ·
[how-to-tutorial](domains/how-to-tutorial.md) · [data-story](domains/data-story.md)

## Optional front-end: the visual script

Before writing Simple JSON, you can storyboard the lesson as a **visual script** — a shot-by-shot,
timestamped, teacher-director description of exactly what's on screen (every object's appear/move/remove).
[writing-visual-scripts.md](writing-visual-scripts.md) is the prompt for producing one; it's tuned to
**maximize visuals and explore freely** (the Simple JSON build stage then handles feasibility/layout).
Worked example: [scripts/why-we-have-seasons.md](scripts/why-we-have-seasons.md).

```
visual script (ambitious, creative)  →  Simple JSON (feasible, validated)  →  video
```

## Adding to the system

- **New domain:** copy any `domains/*.md`, keep the shape, set its theme + `lean_on` workflows + a
  domain-specific mindset/guardrails/example. Short by design — the craft is already in the workflows.
- **New workflow:** add a `workflows/*.md` when a capability's craft is reused across domains, then list
  it in the relevant domains' `lean_on`.

Voice throughout: **coaching, not commands.** Teach how to do it well; leave the choices to the model.
