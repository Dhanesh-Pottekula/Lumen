# Step 18 — Domain Kit Demo (end-to-end lesson)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Assemble a full themed lesson end-to-end on one subject to prove the whole stack composes.

**Result:** `src/slides/domainLesson.ts` — a 3-scene film "water becomes power becomes yarn"
(Coimbatore's hydro-industrial rise), composed with a theme, film grade, and a zoom-through transition.

**Tech Stack:** TypeScript, Canvas 2D.

## What it exercises (every prior step)
- **Scene 1 (where):** geo regions + `fitProjection`, camera push-in to the falls, kinetic word-reveal,
  energy particles, a geo marker, and a typewriter callout bubble. (01–07, 09–11, 15–16)
- **Scene 2 (numbers):** staggered bar chart with values, a counter to 1,050,000, a donut. (08–09, 12)
- **Scene 3 (physics + finale):** the hydro-power equation `P = ρ·g·Q·H` writing on, energy particles,
  a kinetic pop headline, and a confetti finale. (10, 17, 09)
- Composed via `composeSlides({ theme, filmGrade: true, transition: "zoom-through" })`. (02–03, 11)

## Global Constraints
- Deterministic/seekable; `npm run build` clean; **leave uncommitted**.

## Tasks
- [ ] Author `domainLesson.ts` (3 scenes) using the primitive library; compose + add a card.
- [ ] Browser-verify each scene; confirm the whole film scrubs and every primitive renders together.

## Self-review
- Every primitive from 01–17 appears and composes in one cohesive, themed film. ✅

## What this unlocks
Confidence that the library is complete and coherent — and the concrete **template** an authored /
LLM-generated storyboard (19) renders to.
