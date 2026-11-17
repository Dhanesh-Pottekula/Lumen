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
