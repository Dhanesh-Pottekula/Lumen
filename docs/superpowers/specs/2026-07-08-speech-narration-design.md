# Spoken narration — browser SpeechSynthesis design

**Date:** 2026-07-08
**Status:** approved design, pending implementation

## Problem

The lesson player shows narration captions as text on the timeline, but nothing speaks them.
The player should read each caption aloud using the browser's built-in text-to-speech
(SpeechSynthesis, default voice) — no audio files, no external services.

## Decisions made during brainstorming

- **Timeline is master.** The film plays exactly as now (scrubbable, fixed duration). Speech
  follows the caption changes; it never drives the clock. A long sentence may be cut off when
  the next caption arrives — accepted.
- **On by default, with a mute toggle.** Speech starts with Play (the click satisfies browser
  autoplay rules). A speaker button next to Play toggles it. Pause and scrubbing silence
  speech immediately.
- **Browser default voice, default rate/pitch.** No voice picker, no configuration.
- **Player-level feature.** No changes to slide definitions, the composer, or captions —
  narration is a concern of the `<CanvasSlide>` player only.

## Design

### 1. The hook — `src/components/useSpeechNarration.ts`

```ts
function useSpeechNarration(
  caption: string | undefined, // the active caption text (player already computes it)
  speaking: boolean,           // playing && !muted
  endedNaturally: React.RefObject<boolean>, // true when playback stopped by reaching duration
): boolean;                    // returns whether SpeechSynthesis is supported
```

Behavior (one `useEffect` keyed on `[caption, speaking]`):

- Unsupported (`typeof window === "undefined" || !("speechSynthesis" in window)`) → do
  nothing, return `false` so the player hides the toggle.
- `speaking` false → `speechSynthesis.cancel()`, **except** when `endedNaturally.current` is
  true (film reached its end): let the in-flight utterance finish so the final line isn't
  clipped mid-word.
- `speaking` true and caption non-empty → `speechSynthesis.cancel()` then
  `speechSynthesis.speak(new SpeechSynthesisUtterance(caption))`. Default voice, rate, pitch.
- Unmount cleanup → `speechSynthesis.cancel()` unconditionally.

The hook holds no state beyond the effect; utterances are fire-and-forget (no `onend`
bookkeeping — the caption timeline decides what happens next).

### 2. Player changes — `src/components/CanvasSlide.tsx`

- New state: `muted` (default `false`).
- New ref: `endedNaturally` — set `true` in `tick()` where `next >= slide.duration` stops
  playback; reset to `false` in `play()`, `pause()`, and `seek()`.
- Hook call: `const speechSupported = useSpeechNarration(caption, playing && !muted, endedNaturally)`.
- New button beside Play, rendered only when `speechSupported`:
  `🔊 Voice` / `🔇 Muted`, `aria-pressed={!muted}`, toggles `muted`.
- No other player behavior changes. Scrubbing while playing: the seek cancels nothing itself;
  speech switches when the derived caption changes (and pause-during-scrub already silences
  via `speaking` going false — scrubbing while paused stays silent).

Note: this file carries the user's staged annotation-comment edit; the feature commit
includes it deliberately.

### 3. Styling — `src/styles.css`

Reuse the existing `.player button` styling; add a modifier for the muted state
(dimmed text) — nothing more.

### 4. Error handling / support

- Feature-detect once; unsupported browsers see the player exactly as today (no toggle).
- `speechSynthesis.cancel()` before every `speak()` prevents utterance queue pile-up.
- No error surface for utterance failures — a failed utterance is silent, which is the
  feature's off state; nothing to handle.

### 5. Testing

- The hook is thin glue over a browser API — unit tests would only exercise mocks, so no
  vitest coverage is added for it. Existing suite (20 tests) must stay green;
  `npm run build` must pass.
- Manual browser verification: play from 0 → captions are spoken and switch at caption
  boundaries; pause silences immediately; mute toggle silences/resumes on next caption;
  scrubbing doesn't chatter; the final line at ~141 s finishes speaking after playback stops;
  toggle absent in a browser without speechSynthesis (verified by temporarily stubbing it out
  in devtools, not a required test environment).

## Out of scope

- Voice/rate/pitch selection, per-scene voices
- Word-level caption highlighting (karaoke)
- Speech-driven clock (narration audio as master)
- Recording/exporting audio
