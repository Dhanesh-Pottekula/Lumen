# Step 08 — Engagement Grammar (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** The pedagogical timing moves as reusable, pure functions of `t`: **progressive disclosure**
(build steps, current-bright/prior-dimmed), **predict-and-reveal** beats, and **emphasis choreography**
(punch/shake/flash + a general ADSR beat), plus a **sequencer** for ordered beats.

**Architecture:** `src/render/sequence.ts` — all pure (envelopes read 0 away from their moment, safe to
call every frame); scenes apply the returned progress/offset values. Effects reuse nothing external.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/sequence.ts`; **new** `src/slides/sequenceDemo.ts` + card.

## The surface (implemented)
- **Disclosure:** `stepProgress(t,at,dur)`, `buildSteps(t,count,{start,step,dur})→number[]`,
  `stepState(t,count,…)` (per-item `{p, focus, active}` — current bright, past dimmed, future hidden),
  `revealList(ctx, items, t, …, draw)` convenience (staggered fade+slide with past-dim).
- **Predict-and-reveal:** `predictReveal(t,{poseAt,revealAt})→{question,thinking,answer,revealed}`.
- **Emphasis (pure):** `emphasis(t,at,width)` bump, `beat(t,at,{attack,hold,release})` ADSR,
  `punchScale`, `shakeOffset`, `flashAlpha`; draw wrappers `withPunch`, `withShake`, `flashOverlay`.
- **Orchestration:** `sequencer(beats)` → `{progress(t), activeIndex(t)}`.

## Tasks
- [ ] Implement `sequence.ts` (above). Verify: `stepProgress(8,5,2)===1`, `emphasis(5,5)>0.5`,
  `shakeOffset` decays away from `at`; build clean.
- [ ] `sequenceDemo.ts` + card: left builds a worked-example list (current bright), right poses `7×8=?`
  then lands `56` with punch + flash + shake. Browser-verify. **Uncommitted.**

## Self-review
- All pure & safe-everywhere; disclosure + predict-reveal + emphasis + sequencer covered. ✅

## What this unlocks
Scenes reveal in narrated steps and land key moments; used by kinetic type (09), maps (16, battles),
and every worked example / domain kit.
