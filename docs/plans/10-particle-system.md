# Step 10 — Particle System (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** One configurable, **deterministic** emitter for effects (electrons/energy/sparks) and ambience
(smoke/rain/snow/dust/confetti). A particle's full state at `t` is closed-form from seed + birth time
(pos = origin + v·age + ½a·age² + sinusoidal wander) — never simulated, so every frame scrubs exactly.

**Architecture:** `src/render/particles.ts` — `particleAt` (pure) + `emit` (draw) + preset factories.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic (seeded PRNG per particle, closed-form position, no accumulation); build clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/particles.ts`; **new** `src/slides/particlesDemo.ts` + card.

## The surface (implemented)
- **Origin shapes:** point/line/rect/circle(disc)/ring.
- **Emission:** `count`, `seed`, `t0`, `rate` (continuous) or burst, `loop`.
- **Per-particle:** `life` range, `angle`+`spread`, `speed` range, `accel` (gravity/buoyancy),
  `wander {amp,freq}` (turbulence look), `size`→`sizeEnd`, `color` (constant or start→end hex lerp),
  `alpha {in,out,max}` fade envelope, `spin`, `shape` (dot/ring/square/triangle/streak/spark/star), `blend`.
- **API:** `particleAt(cfg,i,t)→Particle|null` (pure), `emit(ctx,cfg,t)`.
- **Presets:** `fire/smoke/sparks/rain/snow/dust/confetti/energy` factories.

**Noted as addable:** true radial attract/repel & drag (needs numeric integration → break analytic; use
`wander` + `accel` for now), image-sprite particles, trails, color-by-velocity.

## Tasks
- [ ] Implement `particles.ts` (above). Verify: `particleAt` null before birth / after death; same (i,t)
  identical; moves with age; build clean.
- [ ] `particlesDemo.ts` + card: grid of presets over ambient snow. Browser-verify. **Uncommitted.**

## Self-review
- Closed-form position; liveness by birth/age; deterministic; loop + presets covered. ✅

## What this unlocks
Electron/energy flows, and battlefield smoke / monsoon rain / dust (ambient life for maps + scenes).
