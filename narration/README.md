# Narration pipeline

The photosynthesis film can play with real Cartesia narration, with scene/caption timing
derived from the returned word timestamps. Until that's generated, the film falls back to
browser speech synthesis on the bootstrap (authored) timings — so it always plays.

## Files

- `photosynthesis.script.json` — extracted narration text (per-scene captions). Regenerate with
  `npm run extract-narration`. This also (re)writes the **bootstrap** timings below.
- `../src/narration/photosynthesis.timings.json` — timing data the app imports. `generated:false`
  = authored bootstrap; `generated:true` = real Cartesia timings.
- `../public/narration/photosynthesis.wav` — the narration audio (not committed until generated).

## Generate real audio + timings

Generation is self-contained in this app (Cartesia JS SDK) — no external service to run.

1. Refresh the script (only needed if captions changed):

   ```
   npm run extract-narration
   ```

2. With your Cartesia key in the environment, run the generator:

   ```
   CARTESIA_API_KEY=... npm run generate-narration
   ```

   It sends the whole transcript in one Cartesia SSE request (`add_timestamps`), aligns the
   returned words to the caption sentences, and writes `public/narration/photosynthesis.wav`
   plus `src/narration/photosynthesis.timings.json` (`generated:true`).

3. Reload the canvas app. The photosynthesis card now uses the WAV as its master clock; captions
   and scene boundaries come from the real narration timing. The 🔊 toggle mutes the audio.

The API key is read only from `CARTESIA_API_KEY` — no secret files are read by this pipeline.

## How it fits together

- `scripts/generate-narration.ts` — thin I/O + Cartesia SSE call.
- `src/narration/align.ts` — pure word→caption alignment, scene timing, WAV wrapping (unit-tested
  in `align.test.ts`).
- `src/slides/compose.ts` timings mode + `src/components/CanvasSlide.tsx` audio mode consume the
  artifacts.
