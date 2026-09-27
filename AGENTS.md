# Lumen instructions for Codex

This repository publishes a deterministic educational-video renderer. Codex
authors lesson data; Lumen validates and renders it. Do not add an OpenAI,
Anthropic, or other LLM runtime dependency.

## Public boundaries

- `packages/core`: schema, validation, compiler, rendering, prompt builders.
- `packages/react`: optional React player.
- `packages/cartesia`: optional narration adapter. Credentials are always
  caller-supplied and must never be committed, logged, or bundled.
- `packages/mp4`: optional browser MP4 export.
- `apps/playground`: private development application and example lessons.

Keep lesson-specific work outside `packages/*`. Do not import from the private
playground into a public package.

## Authoring a lesson

1. Read `docs/SIMPLE-JSON-LLM-CONTEXT.md`.
2. Inspect `getSimpleJsonCapabilities()` instead of inventing fields or tokens.
3. Put the new lesson in `apps/playground/src/lessons/`.
4. Make each scene prove one claim with visible evidence.
5. Use effects only when they encode the subject being taught.
6. Compile and resolve every error and warning.
7. Review start, middle, transition, and final frames for clipping, overlaps,
   stale temporary objects, and motion-path continuity.
8. Run `npm run typecheck`, `npm run build`, and `npm run pack:audit`.

## Writing code here

- Write no comment by default. A comment is a last resort for a constraint or a
  browser/runtime quirk the code cannot express. A comment that says WHAT the
  code does is not allowed — fix the naming instead. Never narrate a change or a
  design that used to exist.
- Delete dead code in the change that orphaned it: unreachable exports, branches,
  parameters, table entries, and any helper left with no caller. Never leave it
  "in case".
- A derivable value is not data, and a variable that only ever holds one value is
  not state. Remove it along with every branch that tested it.
- Prefer the simplest form: an early return over a state variable threaded to a
  shared exit, a flat sequence over nested conditionals. Do not add a layer or an
  option for a case that does not exist yet.

Do not publish, commit, push, or expose a provider key unless the user
explicitly authorizes that action.
