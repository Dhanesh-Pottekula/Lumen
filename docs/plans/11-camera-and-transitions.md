# Step 11 — Camera & Transitions (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A `camera(t)` (pan/zoom/rotate) applied to the whole world, the signature continuous
zoom-through, parallax + depth-of-field via layers, and scene-to-scene transition variety in the
composer. Scenes keep drawing in normal view coords; the camera moves the world.

**Architecture:** `src/render/camera.ts` (pure `Camera` + interpolation with **log-zoom**). The camera
lives on `FrameCtx` and is applied **at composite time in `finish()`** to every non-`screenspace` layer
(device-space transform), so it's opt-in (undefined ⇒ no transform ⇒ existing films untouched) and
composes with HiDPI + the layer FX. A scene sets it with `frame.setCamera(cam)`.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic (`camera(t)` pure); camera undefined = zero regression; `npm run build` clean.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/camera.ts`; modify `src/render/frame.ts` (camera in `finish()`, `setCamera`,
  `screenspace` layer opt-out); modify `src/slides/compose.ts` (transition kinds); **new**
  `src/slides/cameraDemo.ts` + card.

## The surface (implemented)
- **camera.ts:** `Camera {x,y,zoom,rot}`, `centerCamera`, `lerpCamera` (log-zoom dolly), `focusOn`,
  `move(from,to,t,at,dur)`, `pushIn(...)`, `applyCamera`, `isNeutral`.
- **frame.ts:** `createFrame(..., camera?)` + `frame.setCamera(cam)`; `finish()` applies the camera in
  device space (zoom/rotate about frame center, pan to cam.x/y) to all layers except `screenspace`.
- **Parallax + DOF:** per-layer `offsetX` (counter-drift) + `blur` (background depth-of-field) — reuses
  Step 03 layer options.
- **Composer transitions:** `composeSlides({ transition: "crossfade" | "zoom-through" | "whip-pan" })`
  via pure `transitionParams(kind, fadeIn, fadeOut, w)`; crossfade is the default (existing films unchanged).

## Tasks
- [ ] `camera.ts` (log-zoom lerp; pushIn/move). Verify `lerpCamera` endpoints + log midpoint.
- [ ] Thread camera into `finish()` (opt-in) + `setCamera` + `screenspace`. Build clean; existing films
  unaffected (verified in browser).
- [ ] Composer `transition` option + `transitionParams`. 
- [ ] `cameraDemo.ts` + card: push-in → pan (parallax + DOF) → zoom-through+rotate → pull-back; fixed title.
  Browser-verify + confirm photosynthesis/coimbatore non-regressed. **Uncommitted.**

## Self-review
- Camera pure + log-zoom; applied uniformly at composite; parallax/DOF via layers; transitions default-unchanged. ✅

## What this unlocks
The zoom-through-scales hero move, cinematic push-ins/pans, varied transitions; foundational for the map
subsystem's region zooms (16).
