# Step 07 — Callouts & Leader Lines (full-capacity annotation layer)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A complete annotation system — labels that animate in and point at a coordinate with a leader
that draws on. The d3-annotation architecture is the key idea: a callout is **three independently
toggleable sub-parts — subject (marker around the target), connector (leader), note (box + text)** — so
every catalog combination composes from those three. Themed, deterministic, seekable.

**Architecture:** `src/render/callout.ts`, one `callout(frame, opts)` on the `annotation` layer, reusing
strokes (`strokeOn` for the draw-on leader), `arrowhead`, and theme roles.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic (`p` from `t`); themed colors from `frame.theme`; `npm run build` clean; additive.
- **Project overrides:** tests removed → verify via scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/callout.ts` — `callout` + pure `labelBox`/geometry helpers.
- **New** `src/slides/calloutDemo.ts` + a card in `App.tsx`.

---

## The surface (implemented)

**Container (`note`):** `container: text | pill | rect | tag | bubble(+tail) | badge`; `title` (bold) +
`text` (body) with wrapping (`maxWidth`); padding, themed `bg`/`ink`/border; pop-in scale.
**Placement:** `side: n/s/e/w/ne/nw/se/sw/auto` (auto picks the roomy side); `offset`. Box edge point is
computed by ray-box intersection so the leader always leaves the correct edge.
**Leader (`connector`):** `route: none | straight | elbow | curve` (`curveBend`); draws on via `leaderP`
with themed roughness + optional `dash`.
**Endpoint markers:** independent at both ends — `targetMarker` / `labelMarker: none|dot|ring|arrow|crosshair`
(arrow oriented to the leader, revealed on arrival).
**Subject markers:** `subject: none|circle|rect|bracket` (`subjectR`) drawn around the target, arcs-on with `leaderP`.
**Animation:** `leaderP` (leader + subject draw-on), `labelP` (box + text fade/pop), `typeP` (typewriter body).
**Shared:** theme roles or explicit `color/bg/ink/accent`, `fontPx`, `dash`, `seed`.

**Noted as addable** (owned elsewhere or trivial): region/box/ellipse annotations & threshold guide lines
(reveal + strokes), spotlight subject (focus 06), lower-third bars, collision-avoidance declutter, exit
animations, and a stagger-orchestration helper (compose with `phase`/`stagger`).

---

### Task 1: callout.ts
- [ ] Implement `callout` + helpers (wrap, box layout, `resolveSide`, `boxEdgePoint`, `leaderPath` for
  straight/elbow/curve, `drawMarker`, `drawSubject`). Reuse `strokeOn`/`arrowhead`; pull colors from theme.
- [ ] **Verify:** scratch eval — `labelBox` sizes from text; a `callout` renders without throwing; build clean.

### Task 2: demo + card + browser verify
- [ ] `src/slides/calloutDemo.ts` — a subject with callouts of each container/route/marker/subject, staged
  (leader draws → label pops → typewriter). Add a card.
- [ ] **Browser verify:** scrub — bubble+curve+arrow+subject-circle, badge, rect+elbow+ring+bracket, pill,
  typewriter body. **Uncommitted.**

## Self-review checklist
- subject / connector / note independently toggleable; every combo composes. ✅
- 8-way + auto placement; straight/elbow/curve; dual-end markers; themed; seekable. ✅

## What this unlocks
Consistent labelling everywhere; pairs with attention (06); used by every domain kit (18) and maps (16).
