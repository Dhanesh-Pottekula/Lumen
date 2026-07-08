# Cartesia Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development or executing-plans.

**Goal:** Real Cartesia narration for the photosynthesis film, with scene/caption timing driven by returned word timestamps.

**Architecture:** A Python generator (in aira-api, reusing `SpeechEntityClass.synthesize_audio_with_timestamps`) turns the film's caption text into one WAV + a timings JSON. The canvas composer gains a timings mode (real scene windows + piecewise time-remap); the player gains an audio-clock mode with wall-clock + speechSynthesis fallback (no regression before generation).

**Tech Stack:** TS/React/Vite/vitest (canvas), Python/uv/pytest (aira-api), Web Audio `<audio>`, Cartesia via aira-api adapter.

**Spec:** `docs/superpowers/specs/2026-07-08-cartesia-narration-design.md`

## Global Constraints

- Composer/player behavior unchanged when no `timings`/`audioSrc` (Coimbatore untouched; existing 20 tests green).
- Pure logic (remap, window math, aligner) unit-tested; Cartesia call + browser playback manual.
- Generation key from `CARTESIA_API_KEY` env only; never read aira-api's secret file.
- `render(ctx, t)` stays pure. Stage explicit git paths only.

---

### Task 1: Timings types + `remapSceneTime` + composer audio mode (canvas, vitest)
- `src/slides/timings.ts`: `FilmTimings` type; pure `remapSceneTime(authoredCaps:number[], realCaps:number[], authoredDuration:number, realStart:number, realEnd:number) => (t:number)=>number` (piecewise-linear, monotonic, exact endpoints).
- `src/slides/compose.ts`: `ComposeOptions.timings?`; when present, windows from `timings.scenes`, duration from `timings.duration`, captions from `timings.captions`, each scene rendered at `remapSceneTime(...)(t-start)`.
- Tests: remap identity/monotonic/endpoints; composer duration+window+caption from timings.

### Task 2: Extract script + bootstrap timings (canvas)
- `scripts/extract-narration.ts` (run `npx tsx`): import the 7 photo scenes, write `narration/photosynthesis.script.json` (per-scene authored duration + caption sentences) AND a bootstrap `src/narration/photosynthesis.timings.json` derived from authored times (windows = composeSlides math), with `"generated": false`, `"audio": "/narration/photosynthesis.wav"`.
- Add `tsx` devDep + `npm run extract-narration`.

### Task 3: Player audio mode (canvas)
- `src/components/CanvasSlide.tsx`: optional `audioSrc?`. When set, render `<audio preload="auto">`; track `audioReady` (canplaythrough) / `audioFailed` (error). Clock = `audio.currentTime` when ready, else wall clock. Play/pause/seek drive audio when ready. speechSynthesis + speech-gate active ONLY in the wall-clock fallback. 🔊 toggles `audio.muted` (audio ready) or mute (fallback).

### Task 4: App wiring (canvas)
- Import bootstrap timings JSON; `composeSlides(photoScenes, { timings })`; pass `audioSrc="/narration/photosynthesis.wav"`. Coimbatore unchanged. Build + tests green (film plays via fallback until real audio generated).

### Task 5: Python generator + aligner (aira-api, pytest)
- `aira-api/scripts/generate_canvas_narration.py`: read script JSON, concat transcript, build adapter/entity from `CARTESIA_API_KEY`, `synthesize_audio_with_timestamps`, align, write WAV (public/) + timings JSON (src/, `"generated": true`).
- Pure `align_words_to_captions(words, captions)`; pytest with synthetic words (punctuation drift, count mismatch). No network in tests.

### Task 6: Verify
- Canvas build + vitest green; pytest green. Browser: film plays on fallback (voice via speechSynthesis) pre-generation. Document the generation command for the user to run with their key.
