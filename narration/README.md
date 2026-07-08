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

1. Refresh the script (only needed if captions changed):

   ```
   npm run extract-narration
   ```

2. From the **aira-api** project, with your Cartesia key in the environment, run the generator
   (it reuses aira-api's tested Cartesia adapter):

   ```
   CARTESIA_API_KEY=... uv run python scripts/generate_canvas_narration.py \
       --script ../aira_canvas/narration/photosynthesis.script.json \
       --out ../aira_canvas
   ```

   This writes `public/narration/photosynthesis.wav` and overwrites
   `src/narration/photosynthesis.timings.json` with `generated:true`.

3. Reload the canvas app. The photosynthesis card now uses the WAV as its master clock; captions
   and scene boundaries come from the real narration timing. The 🔊 toggle mutes the audio.

The API key is read only from `CARTESIA_API_KEY` — no secret files are read by this pipeline.
