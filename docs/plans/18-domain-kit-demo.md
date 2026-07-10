# Step 18 — Domain Kit Demo (end-to-end lesson)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Prove the whole stack by assembling a **complete, themed, cinematic lesson** on one subject
using only the primitives from Steps 01–17 — no bespoke drawing beyond composing library calls. This is
the acceptance test for "we built a teaching engine, not a video."

**Architecture:** Pick one subject and build a multi-scene film purely from primitives + a theme +
camera. Recommended: **a WWI history lesson** (exercises the most new capability: map, timeline, camera,
callouts, kinetic dates, particles, semantics) or a **calculus lesson** (KaTeX, plots, draw-on,
attention). This plan uses WWI as the concrete target; swap if preferred.

**Tech Stack:** everything from 01–17.

## Global Constraints
- No new primitives — if something's missing, note it and (small) add it to the relevant step, don't
  hand-roll in the scene.
- Deterministic & seekable; themed (`PARCHMENT`); existing suite green; build clean.

## File structure
- Create `src/lessons/wwi/` — scene modules assembled from primitives (intro, alliances map, outbreak
  timeline, front lines, turning points, armistice).
- Create `src/lessons/wwi/index.ts` — `composeSlides([...], { theme: PARCHMENT, camera, transition })`.
- Modify `src/App.tsx` — add the lesson card.

---

### Task 1: scene assembly

- [ ] **Step 1:** **Intro** — `PARCHMENT` texture, a `drawMathOn`-style title via kinetic type
  (`drawSlam` "1914"), a callout, camera slow push-in.
- [ ] **Step 2:** **Alliances** — `drawRegions` on the Europe basemap colored by `createSemantics`
  (Allies/Central/Neutral) + `drawLegend`; callouts naming powers.
- [ ] **Step 3:** **Outbreak** — `drawTimeline` (1914–1918) with event markers appearing on dates via
  `emphasis`; a date `drawCounter`/`drawSlam`.
- [ ] **Step 4:** **Fronts** — `borderAt(year(t))` animating front lines; `flowArrow`s for offensives;
  `battleMarker`s (Marne, Somme, Verdun) popping on their dates; camera pan to the Western Front;
  `emit` battlefield smoke (particles); `fogReveal`.
- [ ] **Step 5:** **Turning points / Armistice** — kinetic "1918" slam, borders settle, `spotlight` on
  the armistice location, recap callouts.
- [ ] **Step 6:** Compose with `{ theme: PARCHMENT, camera, transition: "zoom-through" }`; add the App card.

### Task 2: verify + polish

- [ ] **Step 1:** `npm run build && npm test` green (no new failing tests; this step is assembly).
- [ ] **Step 2: Browser verify** — play the full lesson; scrub the years and confirm map borders,
  timeline, battles, camera, and kinetic dates all stay in sync and look cinematic. Screenshot 4–5 beats.
- [ ] **Step 3:** Note in `docs/plans/00-INDEX.md` any primitive gaps discovered (feeds back into the
  relevant step).
- [ ] **Step 4: Commit** `feat: WWI end-to-end lesson assembled from primitives`.

## Self-review
- Lesson uses only library primitives + theme + camera (no bespoke drawing); fully seekable; cinematic. ✅

## What this unlocks
Confidence the engine can produce a real lesson fast — and the exact shape the authoring model (19)
must express as data.
