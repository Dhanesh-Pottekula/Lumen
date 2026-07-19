---
name: workflow-motion
layer: workflow
description: >
  Craft guidance for MOTION — making objects move so the movement *teaches*. Reusable across any
  domain (physics forces, a story's journey, a data point rising, a migration on a map). Referenced by
  domain skills; obeys the Simple JSON contract in SIMPLE-JSON-LLM-CONTEXT.md.
uses: motion action (move · fall · orbit · along · spin)
---

# Workflow: Motion — making movement teach

Motion is the strongest thing on screen — the eye can't ignore it — so spend it only where the
movement itself *carries meaning*. A good motion answers "what is changing, and why." A bad one is
decoration.

## Choose the kind by what it means

- **`move`** — a deliberate translation from A to B (needs `to`). "This goes there."
- **`fall`** — descent under a constant pull (needs `to`). Free-fall, dropping, sinking.
- **`orbit`** — a periodic path around a center (needs `around`). Anything cyclic or bound.
- **`along`** — following a designed path (needs `along`). A trajectory, a route, a pipeline.
- **`spin`** — rotation in place (no destination). Turning, cycling, emphasis on a mechanism.

If none of these represents something real in your scene, **don't move the object.**

## The three rules that make motion look right

1. **The resting position is frame zero.** Author the object where the motion *begins*: an `orbit`
   body already sitting on its ring, an `along` body at one endpoint. Otherwise it visibly jumps on the
   first frame. (The compiler warns about this — fix the geometry, not the warning.)
2. **One motion per object per scene.** Stacking motions muddies the read. Want a second emphasis? Put
   it in a later beat.
3. **Make the path legible.** Motion the eye can't trace teaches nothing. Add a faint guide line, a
   trace, or a `pointer` (from `focus` workflow) that rides the path so the viewer sees *where it goes*.

## Turn motion into measurement (the move that elevates it)

The moment motion becomes *proof* is when a number changes **with** it. Pair the moving object with a
`stat` readout (`role: hud`) or a marked point on a plot that updates as it moves — speed climbing
during a fall, a counter rising as a front advances, radius vs period on an orbit. Show the same event
as *picture + number* and the lesson lands.

## Pacing

Match `pace` to the physics of the idea: `dramatic`/`slow` for a single important motion you want
watched; `quick` for a repeated or minor move. Don't rush the one motion the whole scene is about.

## Pitfalls

- Object teleports at start → resting position wasn't on the path/ring (frame-zero rule).
- Motion feels pointless → it doesn't encode a force, a rate, or a journey; cut it.
- Eye loses the object → no trace/guide; add one.
- Two things move at once with no relation → separate beats or drop one.

Domains that lean on this: **physics** (forces), **history** (migration/conquest on a map),
**data-story** (a value moving), **narrative** (a character's journey). Read the domain skill for what
the motion should *mean* there.
