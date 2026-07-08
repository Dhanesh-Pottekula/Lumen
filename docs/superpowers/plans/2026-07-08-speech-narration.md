# Speech Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speak the lesson's narration captions aloud via the browser's built-in SpeechSynthesis (default voice), with a mute toggle in the player.

**Architecture:** One new hook (`useSpeechNarration`) owns all speech behavior; `<CanvasSlide>` passes it the already-derived active caption plus a `playing && !muted` flag and an `endedNaturally` ref, and renders a 🔊/🔇 toggle when the API is supported. Timeline stays master — speech never drives the clock.

**Tech Stack:** React 19 hooks, Web Speech API (SpeechSynthesis), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-speech-narration-design.md`

## Global Constraints

- Timeline is master: no changes to clock, seeking, or durations.
- Browser default voice/rate/pitch — no configuration options.
- Toggle hidden entirely when `speechSynthesis` is unsupported; player otherwise identical to today.
- Natural film end must NOT clip the in-flight final utterance; explicit pause/seek/mute cancels immediately.
- No new vitest tests (hook is browser-API glue); existing 20 tests and `npm run build` must stay green.
- `src/components/CanvasSlide.tsx` carries the user's staged annotation-comment edit — the feature commit includes it deliberately. Stage explicit paths only (never `git add -A`/`.`); `.claude/launch.json` (staged) is committed separately as chore, not in the feature commit.

---

### Task 1: The narration hook + player wiring + style

**Files:**
- Create: `src/components/useSpeechNarration.ts`
- Modify: `src/components/CanvasSlide.tsx`
- Modify: `src/styles.css` (after the `.player button:active` rule, line ~108)

**Interfaces:**
- Consumes: `caption: string | undefined` (already derived in CanvasSlide), React `RefObject<boolean>`.
- Produces: `useSpeechNarration(caption: string | undefined, speaking: boolean, endedNaturally: RefObject<boolean>): boolean` — returns whether SpeechSynthesis is supported.

- [ ] **Step 1: Create the hook**

Create `src/components/useSpeechNarration.ts`:

```ts
/**
 * Speak the active narration caption via the browser's SpeechSynthesis.
 *
 * Timeline is master: every caption change cancels the previous utterance and
 * speaks the new one. `speaking` false cancels immediately — except when
 * `endedNaturally.current` is true (the film reached its end), where the
 * in-flight utterance is allowed to finish so the final line isn't clipped.
 *
 * Returns whether SpeechSynthesis is supported (callers hide their toggle when not).
 */
import { useEffect, type RefObject } from "react";

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

export function useSpeechNarration(
  caption: string | undefined,
  speaking: boolean,
  endedNaturally: RefObject<boolean>,
): boolean {
  useEffect(() => {
    if (!supported) return;
    if (!speaking || !caption) {
      if (!endedNaturally.current) window.speechSynthesis.cancel();
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(caption));
  }, [caption, speaking, endedNaturally]);

  // unmount: never leave a voice talking over a dead player
  useEffect(() => {
    if (!supported) return;
    return () => window.speechSynthesis.cancel();
  }, []);

  return supported;
}
```

- [ ] **Step 2: Wire the player**

In `src/components/CanvasSlide.tsx`, apply these edits (the file contains the user's annotation comments — preserve them; anchor on code, not comments):

2a. Add the import after the existing imports (line ~10):

```ts
import { useSpeechNarration } from "./useSpeechNarration";
```

2b. After `const [playing, setPlaying] = useState(false);` add:

```ts
const [muted, setMuted] = useState(false);
const endedNaturally = useRef(false);
```

2c. In `tick`, mark natural end — change:

```ts
      if (next >= slide.duration) {
        next = slide.duration;
        setPlaying(false);
```

to:

```ts
      if (next >= slide.duration) {
        next = slide.duration;
        endedNaturally.current = true; // let the final utterance finish
        setPlaying(false);
```

2d. Reset the flag on every explicit transport action — first line inside `pause`, `play`, and `seek` callbacks:

```ts
      endedNaturally.current = false;
```

(`pause` gains it before `setPlaying(false)`; `play` before `const startAt = ...`; `seek` before `setT(value);`.)

2e. After the `const caption = ...` line add:

```ts
  const speechSupported = useSpeechNarration(caption, playing && !muted, endedNaturally);
```

2f. In the JSX, directly after the Play/Pause `<button ...>` line add:

```tsx
        {speechSupported && (
          <button
            className={muted ? "voice is-muted" : "voice"}
            aria-pressed={!muted}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? "🔇 Muted" : "🔊 Voice"}
          </button>
        )}
```

- [ ] **Step 3: Style the muted state**

In `src/styles.css`, after the `.player button:active` rule (ends line ~108), add:

```css
.player button.voice.is-muted {
  background: transparent;
  color: var(--muted);
  box-shadow: inset 0 0 0 1px var(--muted);
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build`
Expected: `Tests  20 passed (20)`; tsc + vite build clean. (No new unit tests per spec §5.)

- [ ] **Step 5: Commit (feature files only — includes the user's staged CanvasSlide annotations deliberately)**

```bash
git add src/components/useSpeechNarration.ts src/components/CanvasSlide.tsx src/styles.css
git commit -m "feat: speak narration captions via browser SpeechSynthesis with mute toggle" src/components/useSpeechNarration.ts src/components/CanvasSlide.tsx src/styles.css
```

(Pathspec commit so the separately staged `.claude/launch.json` stays out.)

---

### Task 2: Manual browser verification (spec §5)

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server** (`npm run dev`, or the preview tooling on port 5199)

- [ ] **Step 2: Verify each behavior**

- Play from 0 → captions are spoken with the browser default voice; utterance switches at each caption boundary.
- Pause mid-sentence → speech stops immediately.
- 🔇 toggle mid-playback → silence; toggle back on → speech resumes at the next caption change.
- Scrub while paused → no speech; scrub while playing → speech follows the caption changes without chattering per pixel.
- Seek near the end (~139 s), play to the finish → playback stops at 141.50 s and the final line finishes speaking (not clipped).
- Devtools check: `delete window.speechSynthesis` is not simulatable on a page reload basis — instead temporarily verify the guard by confirming the toggle renders only when `"speechSynthesis" in window` is true (visual check is sufficient per spec).

- [ ] **Step 3: Commit the chore file**

```bash
git commit -m "chore: add preview launch config" .claude/launch.json
```

## Self-review notes

- Spec coverage: hook contract (§1) → Task 1 Step 1; player changes (§2) → Step 2; styling (§3) → Step 3; support/error handling (§4) → hook guard + conditional toggle; testing (§5) → Task 1 Step 4 + Task 2.
- Names consistent: `useSpeechNarration`, `endedNaturally`, `speechSupported`, `muted`.
- No placeholders; all code shown in full.
