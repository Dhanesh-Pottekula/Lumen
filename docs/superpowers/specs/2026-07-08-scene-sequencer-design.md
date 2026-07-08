# Scene sequencer — `composeSlides()` design

**Date:** 2026-07-08
**Status:** approved design, pending implementation

## Problem

The full Coimbatore film ([src/slides/coimbatoreStory.ts](../../../src/slides/coimbatoreStory.ts), 1052 lines)
hard-codes its own sequencing: chapter windows, fade envelopes, chapter-local time offsets,
merged captions, and progress dots. The five chapters already exist as standalone
`CanvasSlideDefinition`s, but the film duplicates their content instead of reusing them.
Sequencing should be a reusable, global mechanism: give it an array of scenes, get back one
playable film with transitions between scenes.

## Decisions made during brainstorming

- **Transitions are generic only** — crossfade envelopes. No custom per-boundary bridge
  functions (the film's authored gold→coin / thread / wheel-morph bridges are retired).
- **The film is rebuilt from its chapters** — `coimbatoreStory.ts` is deleted and replaced by
  a composition of the six standalone scenes.
- **The app shows only the combined lesson** — the standalone chapter cards and the
  pendulum/crowd prototype slides are removed from the app (prototype slide files deleted).
- **Pure composer function, not a React component** — the existing `<CanvasSlide>` player is
  unchanged and plays the composed result.
- **No speed scaling** — the previous `SPEED = 2.5` global-tempo hack is removed entirely.
  The film plays at its natural authored length. No `withSpeed` utility is introduced.

## Design

### 1. The composer — `src/slides/compose.ts`

```ts
interface ComposeOptions {
  /** Seconds of overlap between consecutive scenes. Default 2.5. */
  crossfade?: number;
  /** Draw one progress dot per scene along the bottom. Default true. */
  progressDots?: boolean;
}

function composeSlides(
  scenes: CanvasSlideDefinition[],
  options?: ComposeOptions,
): CanvasSlideDefinition;
```

Window math, for scene *i* with durations `d[0..n-1]` and crossfade `x`:

- `start[i] = d[0] + … + d[i-1] − i·x`
- `end[i] = start[i] + d[i]`
- total `duration = Σd − (n−1)·x`

The returned `render(ctx, t)`:

1. Clears the full view rect.
2. For each scene whose `[start, end)` window contains `t` (at most two during a crossfade,
   drawn in array order so the incoming scene paints on top), computes the envelope
   `alpha = phase(t, start, start + x) · (1 − phase(t, end − x, end))`, and if `alpha > 0`
   draws the scene inside a saved/restored `globalAlpha *= alpha`, passing the scene its
   **local time** `t − start`.
3. If `progressDots` and `scenes.length > 1`: one dot per scene centred at the bottom
   (amber = active window, teal = finished, dim gray = upcoming) — same visual as the
   current film's chapter dots.

The envelope applies at the outer boundaries too: the first scene fades in from the page
background at `t = 0` and the last fades out at the end, matching current film behaviour.
The `phase` easing helper is reused from [anim.ts](../../../src/slides/anim.ts), and the
`withAlpha` alpha-scoping helper moves out of `coimbatoreStory.ts` into `anim.ts`.

Purity contract: `composeSlides` performs all window math once at compose time; `render`
remains a pure function of `t`, so the composed film is seekable exactly like any slide.

### 2. Captions

Each scene's captions shift by that scene's `start` and merge into one list sorted by `at`.
A caption from scene *i* whose shifted time is `≥ start[i+1]` is dropped, so an incoming
scene's first caption is never overridden during the crossfade. Scenes without captions
contribute nothing.

### 3. The finale becomes a sixth scene

Extract the film's recap ending (`drawFinale`, previously t = 140–152 s) into
`src/slides/coimbatoreFinale.ts` as a standalone ~12 s `CanvasSlideDefinition` with the same
920×430 view space, drawing its own backdrop. The rebuilt film is:

```ts
composeSlides([
  coimbatoreGeographySlide,
  coimbatoreRomanTradeSlide,
  coimbatoreCottonSlide,
  coimbatoreMillsSlide,
  coimbatoreMachinesSlide,
  coimbatoreFinaleSlide,
])
```

### 4. Validation

- Empty `scenes` array → `throw Error("composeSlides needs at least one scene")`.
- Any scene whose `viewW`/`viewH` differs from the first → throw with the offending index
  and both sizes (the composer does not rescale).
- `crossfade` greater than half the shortest scene duration → clamp to that value and
  `console.warn` (prevents window inversion). Negative crossfade → treated as 0.
- A single scene composes to itself plus (optional) one progress dot; crossfade is unused.

### 5. Migration

The app shows **only the combined Coimbatore lesson** — a single `<CanvasSlide>` card.

- [App.tsx](../../../src/App.tsx): render exactly one card, the composed film; update its
  title/tag/notes (current notes describe bridge moments that no longer exist — replace
  with crossfade-boundary descriptions and the new ~141 s duration). Remove the five
  standalone chapter cards, the "earlier prototypes" section, and their heading/sub text.
- Delete `src/slides/coimbatoreStory.ts` (replaced by the composition).
- Delete `src/slides/pendulumSlide.ts` and `src/slides/crowdSlide.ts` (no longer rendered).
- The five chapter slide files remain — they are the scene sources for the composition —
  but are no longer imported anywhere except the composed film.

### 6. Testing

Add `vitest` as a dev dependency (`npm run test` script). Unit tests for the pure parts:

- window math: starts/ends/total duration for known durations and crossfade values
- caption merge: shifting, ordering, and the drop rule at boundaries
- validation: empty array, mismatched view sizes, oversized/negative crossfade
- render dispatch: with a stub 2d-context object, assert which scenes' `render` are called
  (and with what local `t`) at representative times — before, during, and after a boundary

Manual visual verification via `npm run dev`: scrub across each of the five boundaries,
confirm crossfades, caption handoff, and progress dots.

## Out of scope

- Custom/authored transition bridges between scenes
- Speed/tempo scaling of composed films
- Rescaling scenes with mismatched view spaces
- Changes to the `<CanvasSlide>` player component
