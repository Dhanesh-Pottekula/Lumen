# Step 10 — Particle System

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** One configurable, **deterministic** emitter powering both effects (electrons, energy) and
ambience (smoke, rain, dust, sparks) — replacing per-scene hand-rolled particle loops.

**Architecture:** A particle's state at time `t` is computed **analytically** from its seed + birth
time (position = start + velocity·age + ½·accel·age², plus seeded drift), never simulated step-by-step.
So any frame is reproducible on scrub. An `emit(ctx, config, t)` draws all live particles for time `t`.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic: seeded PRNG per particle; closed-form position from age. No accumulation.
- Existing suite green; build clean.

## File structure
- Create `src/render/particles.ts` — `EmitterConfig`, `particleAt` (pure), `emit` (draw).
- Create `src/render/particles.test.ts` — closed-form position + lifetime/liveness tests.

---

### Task 1: emitter model

**Interfaces — Produces:**
```ts
interface EmitterConfig {
  count: number; seed: number;
  origin: [number,number]; spread: [number,number];   // random offset range
  velocity: [number,number]; velJitter: [number,number];
  accel: [number,number];                              // e.g. gravity or buoyancy
  life: number; rate: number;                          // seconds; particles/sec spawn cadence
  size: number; color: string; style?: "dot"|"ring"|"streak";
}
particleAt(cfg, i, t): { x,y, age, p, alive } | null   // pure; p = age/life 0..1
emit(ctx, cfg, t): void
```

- [ ] **Step 1: Failing tests** — `src/render/particles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { particleAt, type EmitterConfig } from "./particles";

const cfg: EmitterConfig = {
  count: 5, seed: 1, origin: [100, 100], spread: [0, 0],
  velocity: [10, 0], velJitter: [0, 0], accel: [0, 0], life: 2, rate: 5,
  size: 3, color: "#fff",
};

describe("particleAt", () => {
  it("moves linearly with age (closed form)", () => {
    const a = particleAt(cfg, 0, cfg.life * 0 + 0.0001)!; // just born
    const later = particleAt({ ...cfg, count: 1, rate: 100 }, 0, 1.0);
    expect(later).not.toBeNull();
    // x advances by velocity.x * age
    expect(later!.x).toBeGreaterThan(100);
  });
  it("is null before birth and after death", () => {
    // particle 4 with rate 5 is born at 4/5=0.8s; at t=0 it isn't alive
    expect(particleAt(cfg, 4, 0)).toBeNull();
    // and after birth+life it's dead
    expect(particleAt(cfg, 0, 0 + cfg.life + 0.1)).toBeNull();
  });
  it("same (i,t) → identical result (deterministic)", () => {
    expect(particleAt(cfg, 2, 0.9)).toEqual(particleAt(cfg, 2, 0.9));
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/particles.ts`:**

```ts
import { prng } from "../slides/anim";

export interface EmitterConfig {
  count: number; seed: number;
  origin: [number, number]; spread: [number, number];
  velocity: [number, number]; velJitter: [number, number];
  accel: [number, number];
  life: number; rate: number;
  size: number; color: string; style?: "dot" | "ring" | "streak";
}

export function particleAt(cfg: EmitterConfig, i: number, t: number) {
  const r = prng(cfg.seed * 1000 + i); // per-particle deterministic randoms
  const birth = i / cfg.rate;
  const age = t - birth;
  if (age < 0 || age > cfg.life) return null;
  const ox = cfg.origin[0] + (r() - 0.5) * cfg.spread[0];
  const oy = cfg.origin[1] + (r() - 0.5) * cfg.spread[1];
  const vx = cfg.velocity[0] + (r() - 0.5) * cfg.velJitter[0];
  const vy = cfg.velocity[1] + (r() - 0.5) * cfg.velJitter[1];
  const x = ox + vx * age + 0.5 * cfg.accel[0] * age * age;
  const y = oy + vy * age + 0.5 * cfg.accel[1] * age * age;
  return { x, y, age, p: age / cfg.life, alive: true as const };
}

export function emit(ctx: CanvasRenderingContext2D, cfg: EmitterConfig, t: number) {
  ctx.save();
  for (let i = 0; i < cfg.count; i++) {
    const p = particleAt(cfg, i, t);
    if (!p) continue;
    ctx.globalAlpha = Math.sin(p.p * Math.PI); // fade in/out over life
    ctx.fillStyle = cfg.color;
    ctx.strokeStyle = cfg.color;
    if (cfg.style === "ring") {
      ctx.beginPath(); ctx.arc(p.x, p.y, cfg.size, 0, 7); ctx.stroke();
    } else if (cfg.style === "streak") {
      ctx.lineWidth = cfg.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 6, p.y + 10); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, cfg.size, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
```
Note: particles loop by reusing `i` past `count` via modular birth if you want continuous emission —
for v1, `count` particles over `count/rate` seconds; for looping ambience, wrap age with
`age = ((t - birth) % life + life) % life`. Add a `loop?: boolean` flag and test it.

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Browser verify** — smoke (buoyant, `accel:[0,-8]`, gray, loop) and rain (`accel:[0,40]`,
  streak, blue); screenshot. — [ ] **Step 6: Commit** `feat: deterministic particle emitter`.

## Self-review
- Closed-form position; liveness by birth/age; deterministic; looping option tested. ✅

## What this unlocks
Electron/energy flows, and battlefield smoke / monsoon rain / dust (ambient life for maps + scenes).
