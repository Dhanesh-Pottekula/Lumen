# Cartesia narration + timestamp-driven timing — design

**Date:** 2026-07-08
**Status:** approved design, pending implementation

## Problem

The films narrate with the browser's `speechSynthesis`, whose pace is unpredictable, so the
player has to gate the timeline to keep visuals from outrunning the voice. Instead, generate
real narration audio once via Cartesia (through the existing `aira-api` adapter), capture
per-word timestamps, and use them to (a) play real audio and (b) drive scene/caption timing
precisely. First film: photosynthesis.

## Decisions made during brainstorming

- **Generation reuses aira-api's tested Cartesia code**, run as a one-off build-time Python
  script that writes static artifacts into `aira_canvas/`. The app has no runtime dependency
  on Python or Cartesia; the API key never reaches the browser.
- **One continuous audio file per film** ("upload the text once"); the film timeline becomes
  the audio clock; caption and scene timings are derived from the returned word timestamps.
- **Photosynthesis only** this round. Coimbatore is untouched (keeps speechSynthesis).
- **Key supplied via `CARTESIA_API_KEY` env var** at generation time. The design never reads
  aira-api's protected secret file.

## Existing building blocks (verified in aira-api)

- `app/adapters/cartesia_adp.py` · `CartesiaAdapterClass(api_key: SecretStr)` — default voice
  `sonic-3.5`, voice id `30135558-ca1f-4c85-b059-3ac96fdd6a34`, 24000 Hz, `pcm_s16le`.
- `app/entities/speech_ent.py` · `SpeechEntityClass(cartesia_adapter)` ·
  `async synthesize_audio_with_timestamps(text) -> (wav_bytes, list[{word,start,end}])`.
  Drives the streaming TTS WebSocket with `add_timestamps=True`, wraps collected PCM into a
  self-describing WAV (24000 Hz mono 16-bit). This is the single call the generator uses.

Both classes take only what a standalone script can provide, so the generator constructs them
directly from the env key — no Azure Key Vault / secrets bootstrap.

## Design

### 1. Narration extraction (canvas → JSON handoff)

`scripts/extract-narration.ts` (run with `npx tsx`), imports the seven photosynthesis scene
definitions and writes `narration/photosynthesis.script.json`:

```json
{
  "film": "photosynthesis",
  "sampleRate": 24000,
  "scenes": [
    { "index": 0, "authoredDuration": 18, "captions": ["sentence 1", "sentence 2"] }
  ]
}
```

Sentences are taken from each scene's `captions` in `at` order; scenes in film order. This
JSON is the seam Python reads (it cannot import TS).

### 2. Generation (Python, aira-api)

`aira-api/scripts/generate_canvas_narration.py` (run with `uv run`):

1. Read the script JSON (path via `--script`), and an output root (`--out`, the aira_canvas dir).
2. Build one transcript by joining all captions in order. Keep a parallel list of
   `(scene_index, caption_index, text)` and each caption's tokenized word count.
3. `adapter = CartesiaAdapterClass(SecretStr(os.environ["CARTESIA_API_KEY"]))`;
   `await adapter.initialize()`; `speech = SpeechEntityClass(adapter)`;
   `wav, words = await speech.synthesize_audio_with_timestamps(transcript)`;
   `await adapter.close()`.
4. **Align** `words` (ordered `{word,start,end}`) to captions with a pure, punctuation-tolerant
   greedy matcher: normalize (lowercase, strip non-alphanumerics), walk the word stream, and
   consume each caption's expected word count in order. `caption.start` = first consumed word's
   `start`; `caption.end` = last consumed word's `end`. If token counts drift, the matcher
   realigns on the next caption's first normalized word. The aligner is a module-level pure
   function `align_words_to_captions(words, captions)` unit-tested with synthetic input.
5. Scene timings: `scene.start` = its first caption's `start`; `scene.end` = the next scene's
   `start`; the last scene's `end` = audio duration (`= len(pcm)/2/sample_rate`, also equals the
   last word's `end` rounded up).
6. Write:
   - `aira_canvas/public/narration/photosynthesis.wav` — the audio.
   - `aira_canvas/src/narration/photosynthesis.timings.json`:
     ```json
     {
       "film": "photosynthesis",
       "audio": "/narration/photosynthesis.wav",
       "duration": 129.3,
       "scenes": [{ "index": 0, "start": 0.0, "end": 18.4 }],
       "captions": [{ "scene": 0, "at": 0.0, "text": "..." }]
     }
     ```
7. Print a summary (per-scene start/end, total duration) for a sanity check.

The `.wav` lives in `public/` (served at `/narration/...` by Vite, loaded by `<audio>`); the
`.timings.json` lives in `src/narration/` (imported synchronously by the app — no async load UI).

### 3. Composer audio mode (`src/slides/compose.ts`)

Extend `ComposeOptions` with `timings?: FilmTimings` (the shape of the JSON above). Existing
behavior is unchanged when `timings` is absent (all current tests stay green).

When `timings` is present:
- Total `duration` = `timings.duration`.
- Scene windows = `timings.scenes[i].{start,end}` (crossfade still overlaps adjacent windows by
  the default 2.5 s, clamped so a window is never inverted).
- `captions` = `timings.captions` (real `at` times), not the merged authored captions.
- Each scene renders at a **piecewise-linearly remapped** local time: build a monotonic map from
  the scene's authored caption times (`0`, authored `at`s, `authoredDuration`) to the real
  spoken times (`start`, real caption `at`s, `end`), and pass the scene `remap(t)` so each
  authored beat lands on the sentence that narrates it. `remapSceneTime(authoredCaps, realCaps,
  authoredDuration, realStart, realEnd)` is a pure, unit-tested helper.

`FilmTimings` and the remap helper are exported from `compose.ts` (or a small `timings.ts`
sibling if `compose.ts` grows past one clear responsibility).

### 4. Player audio mode (`src/components/CanvasSlide.tsx`)

Add optional prop `audioSrc?: string`.

- When `audioSrc` is set: create an `<audio preload="auto" src={audioSrc}>`. The clock is
  `audio.currentTime`. Play → `audio.play()` then an rAF loop calling `draw(audio.currentTime)`
  and updating the slider; pause → `audio.pause()`; seek → set `audio.currentTime`; the audio's
  `ended` event stops playback. The 🔊/🔇 toggle sets `audio.muted`. The speechSynthesis hook and
  the speech-gating branch in `tick` are **skipped** entirely (guarded by `audioSrc` absence).
- When `audioSrc` is absent: current behavior (wall clock + `useSpeechNarration` + speech-gate),
  unchanged — Coimbatore is unaffected.

### 5. App wiring (`src/App.tsx`)

- `import photosynthesisTimings from "./narration/photosynthesis.timings.json"`.
- `const photosynthesisLesson = composeSlides(photoScenes, { timings: photosynthesisTimings })`.
- Pass `audioSrc="/narration/photosynthesis.wav"` to the photosynthesis `<CanvasSlide>`.
- Coimbatore card unchanged.

Because `timings.json` is committed, the app builds and runs even before generation is re-run;
if the file is a committed real artifact, playback works offline.

### 6. Error handling

- Generator: missing `CARTESIA_API_KEY` → exit with a clear message; Cartesia error →
  propagate the adapter's `RuntimeError`; alignment leftover/shortfall → warn with counts but
  still write best-effort timings (never silently mis-time).
- App: `<audio>` `error` event → fall back to no-audio (slider still scrubs the visuals);
  logged once. Missing timings import is a build error (intentional — the artifact is required).

### 7. Testing

- Canvas unit tests (vitest): composer timings-mode window math; `remapSceneTime` (identity when
  authored == real; monotonic; endpoints exact). Existing 20 tests stay green.
- Python unit test (pytest, no network): `align_words_to_captions` with synthetic words,
  including punctuation drift and a token-count mismatch.
- Manual: run the generator with a real key; confirm the WAV plays; scrub/play the photosynthesis
  card and check each caption is spoken as its scene shows, and scene visuals fill their spoken
  span.

## Out of scope

- Coimbatore narration (later, same pipeline).
- Runtime/browser Cartesia calls; live regeneration.
- MP3 transcoding (WAV is what the adapter yields; acceptable size for a demo).
- Word-level caption highlighting (karaoke).
- Changes to aira-api beyond adding the one generation script.
