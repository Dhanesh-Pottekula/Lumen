# GCL Phase 7 — Validation, Lessons, Docs

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Prove the layer is complete and usable: a headless render regression net (the coverage vitest couldn't give per-phase), a kitchen-sink scene exercising every component, the 4 hand-authored lessons re-created in the GCL flat-stream format (the definition-of-done), an LLM authoring guide matching the real schema, and a coverage-audit checklist mapping every engine family to a GCL surface.

**Architecture:** Two work streams. (1) **Validation** — a stub `CanvasRenderingContext2D` + `FrameCtx` lets `compileScene(...).render(stubCtx, t, stubFrame)` run in node/vitest, so a kitchen-sink film can be smoke-tested (no-throw + determinism) across the timeline, closing the render-pipeline coverage gap flagged in P4. (2) **Authoring/docs** — re-author the 4 lessons as `renderFilm([...])` GCL films, wire them into `App.tsx`, and write `docs/GCL-AUTHORING-GUIDE.md` + a coverage audit.

**Tech Stack:** TS, Canvas 2D; vitest (headless render harness); browser preview for the lessons.

## Global Constraints
- DO NOT COMMIT. Deterministic/seekable throughout. REUSE-ONLY for the engine (only add/modify under `src/render/gcl/`), EXCEPT: this phase MAY add new lesson files under `src/lessons/gcl/` and modify `src/App.tsx` (to show the re-authored lessons) and add docs under `docs/`. View 920×430.
- Read the ACTUAL implemented schema `src/render/gcl/schema.ts` (do not trust the plans — the schema is the source of truth after P1–P6). Reference all `.superpowers/sdd/p*-signatures.md`.

---

### Task 1: Headless render harness + smoke-test suite

**Files:** Create `src/render/gcl/testkit.ts` (stub ctx/frame) + `src/render/gcl/render.test.ts`.

- [ ] **Step 1:** `testkit.ts` — export `stubCtx()` returning an object implementing the `CanvasRenderingContext2D` surface the handlers touch, as no-ops that RECORD a call log: methods (save/restore/beginPath/moveTo/lineTo/arc/rect/roundRect/fill/stroke/clip/fillText/translate/rotate/scale/setTransform/measureText→`{width: text.length*8}`/createLinearGradient+createRadialGradient→a stub gradient with `addColorStop`/drawImage/quadraticCurveTo/bezierCurveTo/ellipse/closePath/setLineDash) and settable props (fillStyle/strokeStyle/globalAlpha/font/lineWidth/lineCap/lineJoin/globalCompositeOperation/shadowBlur/shadowColor/shadowOffsetX/shadowOffsetY/textAlign/textBaseline/filter). Also `stubFrame(t, W, H)` returning a `FrameCtx` whose `layer.ctx(name)` returns a (shared or per-name) stubCtx, `layer.set/clear` no-op, `grade`/`setCamera` record, `theme` = imported TEXTBOOK. Record every call as `{op, args}` in an array retrievable via `ctx.__log`.
- [ ] **Step 2:** `render.test.ts` — build a KITCHEN-SINK film (`renderFilm([...])`) with, across a few scenes, at least one of EVERY component type (heading, text w/ each mode, stat, equation, chart of each kind, shape of each kind incl disc, parametric, textPath, icon, image, legend, map, timeline, table, particles, flow, glow, group, camera, attention of several verbs) and a spread of universal props (enter, exit, motion, oscillate, emphasis, ghost, magnify, predict, fx, expr where applicable). Tests:
  - `render(stub, t, frame)` does NOT throw for t ∈ {0, 0.5, 1, 3, 7, midpoint, duration-0.01, duration}. 
  - DETERMINISM: two renders at the same t produce identical `__log` (deep-equal). 
  - render at t=0 with `frame=undefined` clears and returns (no throw).
  Keep the film in a shared export so the audit (Task 4) can import it.
- [ ] **Step 3:** Also add the small deferred P4 tests: `attnGeom("unknown-id", …)` falls back (no throw). `npx vitest run src/render/gcl` → all pass; `npx tsc --noEmit` → 0.

---

### Task 2: Re-author the 4 lessons in GCL

**Files:** Create `src/lessons/gcl/{neuron,gravity,calculus,mongol}.ts` (each exports a `renderFilm([...])` CanvasSlideDefinition). Do NOT modify the original `src/lessons/*.ts`.

- [ ] **Step 1:** For EACH lesson, study the original (`src/lessons/<name>.ts`) for its beats/theme/narration, and author a GCL flat-stream film capturing the same pedagogical arc (scenes, narration, headings, the key visuals) using the GCL vocabulary — NOT pixel-identical (the originals are bespoke), but faithful in content and using the breadth of families:
  - neuron: theme, membrane diagram (shapes + labels via callout/sub-anchors), the AP curve (chart line), ion particles (flow/particles), camera push-in, Nernst equation.
  - gravity: apple fall (motion fall), cannonball→orbit (motion morph/orbit), 1/r² plot (chart function), Kepler scatter, camera log-zoom, starfield particles.
  - calculus: riemann sum (the harvested riemann), building rectangles (group build), the ∫ definition (equation), converging counters (stat), BLUEPRINT theme.
  - mongol: projected map (map + regions), draw-on borders, conquest flow arrows (flow), timeline with eras/events, khanate legend, whip-pan camera pans, PARCHMENT theme.
- [ ] **Step 2:** Each film must compile + render (verify via the headless harness: import each, `render(stubCtx, t, stubFrame)` across its timeline without throwing — add these to render.test.ts or a lessons.test.ts).
- [ ] **Step 3:** `npx tsc --noEmit` → 0; `npx vitest run src/render/gcl` → all pass.

---

### Task 3: Wire lessons into App + browser-verify

**Files:** Modify `src/App.tsx`.

- [ ] **Step 1:** Add the 4 GCL lessons as `CanvasSlide` cards (alongside or replacing the originals — keep the originals importable for comparison; show GCL versions with a "GCL" tag). 
- [ ] **Step 2 (browser verify):** Start the dev server; for each of the 4 GCL lessons, play/seek across the full timeline and confirm it renders a coherent film (theme, narration-timed beats, the key visuals), no console errors, deterministic on re-seek. Screenshot each. This is the definition-of-done proof.
- [ ] **Step 3:** Leave the App showing the 4 GCL lessons (this is a real feature now, not a temp card — do NOT revert App.tsx). Note in the report the App.tsx diff is intentional and part of this phase's deliverable.

---

### Task 4: LLM authoring guide + coverage audit

**Files:** Create `docs/GCL-AUTHORING-GUIDE.md` and `docs/GCL-COVERAGE-AUDIT.md`.

- [ ] **Step 1:** `GCL-AUTHORING-GUIDE.md` — the LLM-facing spec of the ACTUAL schema: the flat-stream format; scene markers; every component type with its fields; universal props (id, at/anchors incl. `<id>.<subanchor>`, cue/start, enter, exit, motion, oscillate, emphasis, ghost, magnify, predict, fx, expr); the enter/exit vocab; camera directives; the group container; particles/flow/glow; worked examples (excerpt the 4 re-authored lessons). No engine internals — only what an author/LLM needs to emit valid films. Correct the known doc-accuracy items: (a) parametric fx/fy are relative to the component center; (b) measurement is deterministic within the render environment (measureMath uses canvas metrics in-browser, analytic in node) — not "ctx-free"; (c) the draw-on "pen" is an asset-free nib.
- [ ] **Step 2:** `GCL-COVERAGE-AUDIT.md` — a table mapping every engine family (strokes, strokeVerbs, reveal, focus, callout, sequence, type-motion, particles, camera, morph, charts, timeline, icons, geo, mathtext, frame/layers, themes) to the GCL component/prop that reaches it, with a ✅/partial/gap column and notes. Explicitly list anything still NOT reachable (if any) as known gaps.
- [ ] **Step 3:** Fix the design spec's inaccurate "ctx-free measurement" wording (docs/superpowers/specs/2026-07-12-generic-component-layer-design.md) to match reality.

---

## Self-Review
- Render regression net (headless stub ctx/frame, kitchen-sink, determinism) — closes P4's coverage gap: Task 1. ✅
- 4 lessons re-authored in GCL (definition-of-done) + browser-verified: Tasks 2–3. ✅
- LLM authoring guide (real schema) + coverage audit + doc-accuracy fixes: Task 4. ✅
- Determinism: harness asserts same-t identical call log. ✅
- Scope note: App.tsx + docs changes are intentional deliverables this phase (the only allowed out-of-gcl/ changes).
- If the coverage audit finds a genuine gap (a family no component reaches), record it as a known gap in the audit doc and surface it to the controller — do not silently claim 100%.
