# Step 11 — Camera & Transitions

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A `camera(t)` transform (pan / zoom / rotate) on `FrameCtx`, the signature
**continuous zoom-through-scales**, transition variety in the composer (zoom-through / whip-pan /
morph), and parallax + depth-of-field via the layer model.

**Architecture:** A `Camera` = `{ x, y, zoom, rot }` applied as a canvas transform *before* the scene's
view transform. Scenes draw in normal view coords; the camera moves the world. Parallax = per-layer
`offsetX/Y` scaled by a depth factor; DOF = per-layer `blur`. Transitions are composer-level: instead
of only cross-fading opacity, it can zoom/translate the outgoing/incoming scene buffers.

**Tech Stack:** TypeScript, Canvas 2D, vitest.

## Global Constraints
- Deterministic (`camera(t)` pure); layer model (Step 01) required; existing suite green; build clean.
- Camera composes with the existing HiDPI + view transform without breaking `drawSvg`/text.

## File structure
- Create `src/render/camera.ts` — `Camera`, `applyCamera(ctx, cam, viewW, viewH)`, `lerpCamera`, `focusOn`.
- Create `src/render/camera.test.ts` — transform math + camera interpolation.
- Modify `src/render/frame.ts` — add `camera?: Camera`; apply it when building layer contexts.
- Modify `src/components/CanvasSlide.tsx` / `src/slides/compose.ts` — accept a `camera(t)` provider.
- Modify `src/slides/compose.ts` — add transition kinds beyond crossfade.

---

### Task 1: camera transform + interpolation (pure)

**Interfaces — Produces:**
```ts
interface Camera { x: number; y: number; zoom: number; rot: number }  // x,y = view-space center to frame
lerpCamera(a: Camera, b: Camera, p: number): Camera
applyCamera(ctx, cam: Camera, viewW: number, viewH: number): void      // multiplies current transform
```

- [ ] **Step 1: Failing tests** — `src/render/camera.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lerpCamera } from "./camera";

const A = { x: 0, y: 0, zoom: 1, rot: 0 };
const B = { x: 100, y: 50, zoom: 4, rot: 0 };

describe("lerpCamera", () => {
  it("endpoints and midpoint", () => {
    expect(lerpCamera(A, B, 0)).toEqual(A);
    expect(lerpCamera(A, B, 1)).toEqual(B);
    const m = lerpCamera(A, B, 0.5);
    expect(m.x).toBeCloseTo(50); expect(m.zoom).toBeCloseTo(2.5);
  });
  it("zoom can interpolate geometrically for a natural dolly", () => {
    // if implemented log-lerp, midpoint zoom = sqrt(1*4)=2; accept either but document choice
    const m = lerpCamera({ ...A }, { ...B }, 0.5);
    expect(m.zoom).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `src/render/camera.ts`:**

```ts
import { lerp } from "../slides/anim";

export interface Camera { x: number; y: number; zoom: number; rot: number }

export const IDENTITY_CAMERA: Camera = { x: 0, y: 0, zoom: 1, rot: 0 };

/** Interpolate camera; zoom uses geometric (log) interpolation for a natural dolly feel. */
export function lerpCamera(a: Camera, b: Camera, p: number): Camera {
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), p)),
    rot: lerp(a.rot, b.rot, p),
  };
}

/** Multiply the current ctx transform so the world is zoomed to `zoom` centered on (cam.x,cam.y). */
export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number) {
  ctx.translate(viewW / 2, viewH / 2);
  ctx.rotate(cam.rot);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}
```
(Note the endpoint test: with log-lerp, `lerpCamera(A,B,0).zoom === 1` and `,1).zoom === 4` exactly;
the midpoint equals 2 not 2.5 — adjust the test's midpoint expectation to `2` to match log-lerp, and
keep `x` midpoint 50.)

- [ ] **Step 4: Run — PASS** (with the corrected zoom expectation).
- [ ] **Step 5: Commit** `feat: camera transform + log-zoom interpolation`.

---

### Task 2: thread camera through frame + player/composer

**Files:** `src/render/frame.ts`, `src/components/CanvasSlide.tsx`, `src/slides/compose.ts`.

- [ ] **Step 1:** Add `camera?: Camera` to `FrameCtx`; in `createFrame`, when a camera is supplied,
  call `applyCamera` on each layer context right after `setTransform(xform)` (so scene coords are
  camera-transformed). The main `ctx` also gets the camera applied before `slide.render` when not
  using layers.
- [ ] **Step 2:** `CanvasSlide` accepts `camera?: (t: number) => Camera`; compute `cam = camera?.(t)`
  and pass to `createFrame`. `compose.ts` accepts `options.camera?: (t)=>Camera` and threads it.
- [ ] **Step 3:** `npm run build && npm test` green.
- [ ] **Step 4: Browser verify** — a push-in on the photosynthesis intro (zoom 1→1.6 over the scene);
  confirm crisp (vector/SVG scale cleanly). Screenshot. — [ ] **Step 5: Commit** `feat: camera on FrameCtx`.

---

### Task 3: parallax + depth-of-field via layers

- [ ] **Step 1:** In a demo scene, set `frame.layer.set("bg", { offsetX: cam.x * 0.3, blur: 2 })` and a
  crisp `fg` — background drifts slower + softly blurred. Verify in browser; screenshot.
- [ ] **Step 2: Commit** `feat: parallax + depth-of-field via layer offset/blur`.

---

### Task 4: transition variety in the composer

**Files:** `src/slides/compose.ts`.

- [ ] **Step 1:** Add `transition?: "crossfade" | "zoom-through" | "whip-pan"` to `ComposeOptions`
  (default crossfade). In the buffered crossfade region, instead of only alpha, also transform the
  outgoing buffer (scale up + fade for zoom-through; translate for whip-pan) and the incoming
  (scale from 1.1→1). Keep crossfade the default so existing films are unchanged.
- [ ] **Step 2:** Unit-test the transition parameterization (a pure `transitionParams(kind, p)` →
  `{ outScale, outAlpha, inScale, inAlpha, dx }`) and assert crossfade matches current behavior.
- [ ] **Step 3:** `npm run build && npm test` green; browser-verify a zoom-through between two scenes.
- [ ] **Step 4: Commit** `feat: zoom-through + whip-pan transitions`.

## Self-review
- Camera pure + log-zoom; applied uniformly; parallax/DOF via layers; transitions default-unchanged. ✅

## What this unlocks
The zoom-through-scales hero move (biology + history), cinematic push-ins/pans, and varied transitions;
foundational for the map subsystem's region zooms (16).
