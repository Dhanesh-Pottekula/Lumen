# Lumen

**Goal:** a text-to-video engine for explainers. A model plans a film and writes scenes as JSON; Lumen draws
them live on an HTML5 canvas, where every frame is a pure function of time. It teaches how to turn LLM output
into a seekable film without a video model or a render server.
**Status:** in-progress

## Source material
- AiRA's film pipeline (`aira-api`: `app/entities/film.py`, `film_picture.py`) and its local replica
  `film-lab`. The film server here follows the same stages; the prompts and the renderer are Lumen's own.
- Design notes for the canvas engine: `docs/plans/00-INDEX.md` (steps 01–19).

## Stack
TypeScript 5.9, React 19, Vite 7, Vitest 4. No runtime dependencies besides React. The film server is a Vite
plugin in Node (built-in `fetch`, no SDK).

## How to run
```bash
npm install
npm run dev      # player + film server on one port
npm test         # vitest
npm run build    # tsc --noEmit && vite build
npm run metrics  # numbers read off the films in runs/ (no model call); -- <run> for one, -- --json for all
```
From the workspace, the browser pane entry is `lumen-dev` (port 5199) in `GFV/.claude/launch.json`.

Films are made with OpenAI when `OPENAI_API_KEY` is set in the environment or in `.env` here (git-ignored).
With no key, new films cannot be made and the app says so; saved films still play. `FILM_PROVIDER=offline`
swaps in a canned film with drawn stand-in pictures, for working on the pipeline itself (the tests use it). Model overrides: `FILM_PLAN_MODEL`, `FILM_WRITE_MODEL`,
`FILM_IMAGE_MODEL`, `FILM_IMAGE_QUALITY`, `FILM_INSPECT_MODEL`, `FILM_TTS_MODEL`, `FILM_TTS_VOICE`, `FILM_HEAR_MODEL`.

Two optional settings in `.env`:
- `FILM_SKILLS_DIR`: a folder of AiRA film skills (`narrative/` and `visual/` Markdown). The planner then loads
  one narrative and up to four visual skills through the `load_film_skills` tool before it plans, as AiRA does.
  The skills are read at run time and are not copied into this repo. On this Mac it points at
  `aira-api/prompts/film_skills`.
- `CARTESIA_API_KEY`: use AiRA's voice (Cartesia `sonic-3.6`, AiRA's "female" voice id; override with
  `FILM_CARTESIA_MODEL`, `FILM_CARTESIA_VOICE`). Without it, or if a Cartesia call fails, the OpenAI voice speaks.
Editing `.env` restarts the dev server, which cuts any film stream that is open; the film itself still finishes
and is saved, and can be opened from Saved films.

## Layout
```
server/                    the film server (Node, mounted on Vite's dev server)
  plugin.ts                  routes: POST /api/films (event stream), GET /api/films, /film-runs/...
  film.ts                    the pipeline: streamed plan → parallel pictures → scene lanes → in-order release
  prompts.ts                 planner, part finder, scene writer and the picture look
  text.ts                    read a JSON plan while it streams; lanes; image sizes
  skills.ts                  loads AiRA film skills and answers the load_film_skills tool
  voice.ts                   voice marks: plain words, Cartesia form, delivery notes
  providers/                 openai.ts (real), offline.ts (canned, misbehaves on purpose), types.ts
src/film/                  the film engine (browser)
  types.ts                   the wire format: header, scene, objects, beats, actions, events
  validate.ts                the verdict on one scene; shared by the server (retry) and the player (safety)
  words.ts                   narration words, say-cues, subtitle lines
  resolve.ts                 scene + narration length → a timeline in seconds
  render.ts                  draws one scene at time t: full-bleed picture, camera, labels, overlays
  compiler.ts                scenes added one by one; one stable slide that grows
  store.ts                   receives events, admits scenes in order once their pictures and voice load
src/components/FilmStudio.tsx  the whole app: player, scene track, new-film box, production panel, film shelf
src/film.css               the app's styles
src/render/                canvas drawing primitives; the film uses charts, mathtext, motion and type-motion
src/slides/                anim.ts, compose.ts, types.ts: shared helpers the primitives are built on
  export.ts                  the frame-export hook the export script drives
scripts/export-film.mjs    film → MP4 with voice (and a GIF preview); `npm run export -- <run>`
docs/films/                the two exported films the README shows
runs/                      generated films (git-ignored): film.json, plan.json, log.jsonl, pictures/, voice/
```

## Rules that keep it working
- The scene writer never writes a coordinate, a time or a picture address. It names pictures and
  `picture.part` by id; the server fills in `src`, `aspect` and `hotspots`.
- Plan key order is fixed (`title`, `character`, `pictures`, `steps`) so pictures start drawing while the
  steps are still being written.
- Scenes are released strictly in step order. A scene that cannot be made is dropped; indexes stay dense.
- Scenes join with hard cuts, so adding a scene never changes a frame that already existed.
- Pictures are full film frames. Nothing is cut out and no background is removed.

## How the prompts are written
- Dhanesh's rule (2026-11-17): prompts explain the intention and the medium, then leave the choices to the
  model. Do not add "when X, use Y" rules, lists of cases, or examples to copy: a rule per case makes every
  film use the same moves. `PLAN_SYSTEM` says what a good film is and how the screen works; `SCENE_SYSTEM`
  describes the actions as a neutral vocabulary (what each does, never when to use it).
- The only fixed rules in a prompt are the ones the pipeline enforces: the JSON shape and key order, exact
  ids, `say` copied from the narration, length limits, and hidden pictures needing a cut.
- If a film comes out wrong, first ask what the model did not understand about the goal or the screen, and
  explain that. Add a hard rule only when the pipeline itself must enforce it.
- Skills are one per kind of film, in `skills/narrative/`: `study`, `story`, `movie`. The planner picks one
  with the `load_film_skills` tool. Each is about 140 words and says only the general way that kind of film is
  told: who it is for, how to tell it, how it should feel, what the screen is for. Keep them that general. To
  add a kind, add one more file in the same shape; a test fails if a skill grows past about 220 words.
- AiRA's skills are written the other way, with many specific rules. Setting `FILM_SKILLS_DIR` to AiRA's
  folder loads those instead of Lumen's own. It is not set by default.

## Measuring a prompt change
- `npm run metrics` reads `film.json`, `plan.json` and `log.jsonl` and prints what can be counted: seconds per
  picture, the longest time nothing changes, cameras that aim where they already are, on-screen words the
  narration does not say, text used as drawing, voice marks the voice does not know, parts not found, dropped
  beats, time and cost. It uses `resolveScene`, so its times are the film's own. It measures; it does not judge.
- "text not spoken" also catches a number written in digits where the voice says words ("1 day"). "text with
  new words" is the stricter signal: a word the narration never uses.
- `scripts/baseline/briefs.json` holds six fixed briefs, two per kind of film. Make them again after a prompt
  change and compare; change one thing at a time. They have not been run yet under the current prompts.
- Each film records `made.prompts`, a fingerprint of the prompt texts, and the skills it loaded. Two films with
  the same fingerprint were written by the same prompts. Films made before 2026-11-20 show "unknown".
- The log keeps every scene writer reply in full, and the retry's reply, its problems and whether it was kept.

## Usage, cost and the prompt cache
- Every model call reports what it consumed (`provider.report`). `server/usage.ts` adds the calls up by stage
  and model, estimates cost from the list prices in `RATES`, and the total is sent as `film_usage` events and
  saved in `film.json` under `usage`. The app shows it under the player.
- Prices: the two text models are the rates AiRA's usage ledger records as verified. The image, voice and
  transcription rates came from public pricing summaries on 2026-11-17 and are marked approximate. A model
  with no rate is counted and shown as "no price", never guessed. Update `RATES` when prices change.
- How the provider's cache bills (OpenAI guide, checked 2026-11-17, and measured): a cache write costs 1.25
  times the normal input rate, a read costs 0.05 times on Sol. Left in its default mode the provider marks
  the end of every request, so the whole prompt is billed as a write, including text that is never sent again.
- So every text request sets `prompt_cache_options.mode: "explicit"`. Then only what comes before our own
  mark (`prompt_cache_breakpoint` on a content part) is written, and the rest is billed at the normal rate.
  The marks sit on one fixed opening line in the planner and scene requests (`PLAN_LEAD`, `SCENE_LEAD`), so
  the cached part is the system prompt, the tool and that line: the same for every user and film.
- The part finder sends explicit mode with no mark, which means no caching and no write at all: each of its
  requests is a short prompt and a new picture, so nothing could be read back.
- One small warm-up call writes the scene writers' shared prompt before they start. Four writers start
  together; without it each would pay to write the same text. An entry is not readable in the first seconds
  after it is written, which is another reason to warm it early.
- Measured after the fix: scene calls read 1,571 tokens from the cache and write 0; a cold warm-up writes only
  the 1,581-token prefix; the part finder writes 0 (it wrote all 17,900 input tokens in the film before).
- `FILM_CACHE_BREAKPOINT=0` turns all of this off; it also turns itself off if the API refuses the fields.
  `FILM_CACHE_TTL=12h` keeps entries for twelve hours instead of thirty minutes, at 2.5 times the write rate.
- Do not put anything that changes per step (ids, times, the step's text) before the stable text, and do not
  reword `SCENE_SYSTEM` casually: either breaks every cache read.

## Notes / findings
- AiRA's newer engine (`aira_canvas`, the `simple-json` and `gcl` layers) is not on this machine, only as a
  minified bundle. It is portrait and built around cut-out pictures, so this repo has its own small scene
  grammar instead of that bundle.
- First real run (2026-11-17, "What if gravity doubled overnight?"): 7 pictures, 8 scenes, no failures; first
  scene ready at 72 s, whole film at 158 s. Passing the lead picture as a reference kept one character and one
  style without copying the lead's composition.
- The part finder sometimes returns the name as "id: where it is". Its answer is now limited to the exact ids
  (JSON-schema enum), and the echoed form is accepted too.
- An even speaking rate is off by up to about 1.8 s against the real voice. Each clip is transcribed for word
  times (`audio.wordTimes`), and beats and subtitles are timed from those.
- 2026-11-17: the Engine lab (the hand-coded demo lessons, their player and image assets) was removed at
  Dhanesh's request; the app is the film studio only. The old demos are in git history before this change.
- The planner is taught story craft adapted from AiRA's film planner (plan from what the viewer understands,
  felt before named, a payoff per step, one recap) and to brief two to four shots per step, 14 to 22 pictures
  a film. The scene writer must cut to every picture it is given; an unshown picture is reported for retry.
- 2026-11-17: read AiRA's planner, scene-writer, generic rules, scene-catalog camera section and the story
  skill in full. Carried over: the skill layers and tool, voice marks, figures' spoken lines (speech bubbles),
  AiRA's camera rules (move only to a thing too small to read or to go inside a part, at most one push a shot,
  back to overview, iris into a closer picture), the show format and timing rules. Not carried over: separate
  cut-out pictures that are placed, sized and moved on one screen (Lumen's pictures are whole frames), question
  cards, categories and found photos. The Cartesia voice is written from its public API and has not been run:
  AiRA's speech keys are in a key vault, not on this machine.
- 2026-11-20: compared with the `creator-generalist` skill pack. Its script advice matches what `PLAN_SYSTEM`
  already aims for; what it has and Lumen lacks is checks on the result. From the black hole film (the only one
  made by the intent-based prompts): the planner asked for a dashed line, a gradual dim and a fade to black,
  none of which the screen has, and named an undrawn boundary as a part; the scene writer built the line from
  text characters. So `PLAN_SYSTEM` now says everything the screen can do and that nothing else exists, what a
  part must be, and the limit of four; the look prompt says the frame is cropped top and bottom (pictures are
  drawn 3:2 and cover a 16:9 view). These are facts about the medium, not rules for cases. Not yet tested on a
  real film.
- 2026-11-20, Dhanesh after watching that film: it still felt like a carousel, one picture held per sentence
  or more. He wants the screen to show each thing as the voice says it (rays on their way, the Sun dimmer, a
  figure mid-jump), with as many pictures as that takes and pictures reused. `PLAN_SYSTEM` now says the pictures
  are a second telling beside the voice, that a still can show a thing in the middle of happening, that the
  number of pictures comes from the narration and not from the steps, and that a drawn picture can be shown
  again. The line that each picture "costs time and money" is gone: it was asking for fewer. Same brief, before
  and after: 8 pictures to 18, 22 s to 10 s per showing, cost $0.61 to $1.19, 170 s to 252 s to make. Idle
  cameras rose from 2 to 8, which is the next thing to check.
- `npm run film -- "<brief>"` makes a film without the app; `--plan-only` runs just the planner (a few cents)
  to read a plan before paying for pictures; `--code <checkout>` uses another checkout's prompts.
