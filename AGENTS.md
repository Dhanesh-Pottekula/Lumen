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
  `FILM_CARTESIA_MODEL`, `FILM_CARTESIA_VOICE`). Without it, or if a Cartesia call fails, the OpenAI voice speaks
  and the server prints why. The key is set here since 2026-11-20, taken from AiRA's key vault (`cartesia-api-key`).
Editing `.env` restarts the dev server, which cuts any film stream that is open; the film itself still finishes
and is saved, and can be opened from Saved films.

## Layout
```
server/                    the film server (Node, mounted on Vite's dev server)
  plugin.ts                  routes: POST /api/films (event stream), GET /api/films, /film-runs/...
  film.ts                    the pipeline: streamed plan → parallel pictures → scene lanes → in-order release
  prompts.ts                 planner, part finder, scene writer and the picture look
  text.ts                    read a JSON plan while it streams; lanes; image sizes
  cutout.ts                  remove the white round a drawing (AiRA's method, no dependency); PNG read and write
  trace.ts                   the record of a film's making: every model call in full, written to calls.jsonl
  settings.ts                what a person chose: model and effort per stage, rewritten prompts (.lumen/settings.json)
  metrics.ts                 numbers read off a finished film, for comparing prompts
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
src/components/FilmStudio.tsx  the studio: player, scene track, new-film box, production panel, film shelf
src/components/RunsPage.tsx    how each film was made: totals, stages, every call, step by step, plan, log
src/components/SettingsPage.tsx  model and reasoning per stage; the prompts, each editable with a reset
src/observe.css            styles for those two pages
src/film.css               the app's styles
src/render/                canvas drawing primitives; the film uses charts, mathtext, motion and type-motion
src/slides/                anim.ts, compose.ts, types.ts: shared helpers the primitives are built on
  export.ts                  the frame-export hook the export script drives
scripts/export-film.mjs    film → MP4 with voice (and a GIF preview); `npm run export -- <run>`
docs/films/                the two exported films the README shows
runs/                      generated films (git-ignored): film.json, plan.json, log.jsonl, pictures/, voice/
```

## Rules that keep it working
- The scene writer never writes a pixel, a time or a picture address. It names pictures and `picture.part` by
  id; the server fills in `src`, `aspect` and `hotspots`. Since 2026-11-20 it is shown the step's pictures and
  each part's box, and it may put a cut-out at a point, `{"x", "y"}` as shares of the background picture.
- Plan key order is fixed (`title`, `character`, `pictures`, `steps`) so pictures start drawing while the
  steps are still being written.
- Scenes are released strictly in step order. A scene that cannot be made is dropped; indexes stay dense.
- Scenes join with hard cuts, so adding a scene never changes a frame that already existed.
- There are two kinds of picture. A background is a full film frame. A cut-out is one thing drawn alone on
  plain white; `server/cutout.ts` removes the white and the film lays the thing over a background, where it
  can be placed, moved, swapped for another pose, resized, turned and removed.
- A cut-out is only ever put somewhere by name: a found part of the background on screen, a zone, or just
  outside an edge. It belongs to that background and leaves with it. The camera, labels, marks and speech aim
  at backgrounds only.

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

## Seeing how a film was made
- Every model call of a film is recorded in full in `runs/<run>/calls.jsonl`: the stage, the step or picture it
  was for, the model and reasoning effort, every text that went in (system prompt, request, tool offered), every
  picture or clip sent (as a link to the saved file), everything that came back, each tool call with its answer,
  the token counts (input, read from cache, written to cache, output, reasoning), the cost, and how long it took.
  For the OpenAI provider it also keeps each request body and response as they went over the wire, with picture
  and sound data replaced by a note of its size.
- It works by wrapping the provider (`tracer.wrap`), so every provider is recorded the same way. A call's record
  travels with it in an `AsyncLocalStorage`: the counts a provider reports and the requests it sends are attached
  to the call they happened inside, however many are running at once. A line is written when a call starts and
  again when it ends (and, for the plan, every second or so while it is written); the last line for a number wins.
- The Runs page (`#/runs/<run>`) reads `GET /api/films/<run>/calls`, `/calls/<n>`, `/plan` and `/log`. While a
  run is being made it asks again every second and a half. A run counts as being made if this server is making
  it, or if its file says so and its log was written to in the last four minutes.
- Films made before 2026-11-21 have no `calls.jsonl`; the page says so and shows their plan and log.

## Choosing models and rewriting prompts
- `.lumen/settings.json` (git-ignored) holds only what differs from the defaults: per stage a model and, where
  it applies, a reasoning effort, a picture quality or a voice; and any prompt a person rewrote. The Settings
  page edits it through `GET`/`PUT /api/settings`. A stage's default is the environment's (`FILM_PLAN_MODEL`,
  `FILM_PLAN_EFFORT` and so on), else the code's.
- Six prompts can be rewritten: planner, picture look, cut-out look, part finder, scene writer, voice style
  (`PROMPT_INFO`). The two looks are the opening paragraph of a drawing request; the rest of that request is
  what the pipeline needs and stays in code. A rewrite that is empty, or equal to the default, is not kept, so
  "Reset to default" is simply forgetting it. A film records which prompts were rewritten (`made.edited`) and
  what each stage ran on (`made.stages`), and its prompt fingerprint covers the texts actually used.
- The command line (`npm run film`) reads the same settings, so both ways of making a film agree.
- With a Cartesia key set, Cartesia speaks and times its own words. The voice stage's model in Settings is then
  only the stand-in for a failed Cartesia call, and both the page and each call's record say so.

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
- There is no separate warm-up call (removed 2026-11-21, to match AiRA, which never had one). Each scene
  request carries the mark itself: the first to arrive writes the entry and later ones read it. Up to four
  writers start together, so the first few of a film may miss. Dhanesh's decision: accept that.
- Cache numbers on the Runs page are the provider's own (`cached_tokens`, `cache_write_tokens` in each
  reply's usage). Never work them out. Each call shows Hit, Wrote or Miss, and the Plan and Scenes cards
  show how many of their calls hit. Runs made before the removal still show their warm-up call.
- Measured with the warm-up in place: scene calls read 1,571 tokens from the cache and wrote 0; the part
  finder writes 0 (it wrote all 17,900 input tokens in the film before). Not yet measured without it.
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
- 2026-11-20, Cartesia now runs, the way `aira-api` uses it (`app/adapters/speech/cartesia.py`): the clip is
  asked for with `add_timestamps`, so the voice says when each word starts and `whisper-1` is not called. That
  needs Cartesia's event stream (`/tts/sse`), which sends raw sound, so a Cartesia clip is saved as a 24 kHz
  WAV, about 48 KB a second. The marks go to it as its own tags: `<emotion value="…"/>`, `<speed ratio="0.9"/>`
  for "slowly", `<volume ratio="0.8"/>` for "softly", `<break>`. Checked on one clip: 26 of 26 words timed, the
  tags are not counted as words, 1.2 s to make 9.4 s of speech. `whisper-1` still times the OpenAI voice when
  that is the one speaking. Not yet heard inside a whole film.
- 2026-11-20, Dhanesh: make the film more dynamic by moving things over a background, with the white removed
  by code as AiRA does. Built as cut-outs. The cut follows `film_picture_ent.py` `_Helper.ready`: read the
  ground's colour from the border, then spread inward from the border through that colour, so white closed
  inside an outline is kept. One step is Lumen's own: the rim where outline meets ground is made partly
  see-through with the white taken out of it, because Lumen's backgrounds are dark and a pale rim would show.
- First real cut (two drawings, about $0.11): a white-suited figure with a clear helmet and a silver ship both
  came out clean, with no gap in the outline. The known weak spot is an outline with a gap: the white inside
  leaks out. A test pins that behaviour. If it shows up in films, draw cut-outs on a colour no subject uses.
- The cut reports three things and the picture is redrawn once on any of them: nothing drawn, a whole scene
  drawn, or the thing running off the picture. This is the first check any drawing gets.
- Not built: the camera following a cut-out, labels or speech attached to one, and limbs that move. A cut-out
  slides as one piece; another pose is another cut-out. `scripts/try-cutout.mjs` draws and cuts one thing to
  look at; `--cut <png>` cuts a saved drawing for nothing.
- The first two cut-out films showed the main character twice: once drawn into the background, once as the
  cut-out laid over it. The cause was in `drawingPrompt`, which gave the character's description to every
  frame; the image model drew the character even into a frame whose brief asked for nobody. Now the description
  is given only to a picture whose brief contains the words "the main character" (`starsCharacter`), the
  planner is told to use exactly those words, and every other frame is told it has no person unless its brief
  describes one. Telling the planner not to mention the character in a background's brief did not fix it alone.
- Third film (same brief): one character throughout, 8 cut-outs, 11 moves, 7 pose swaps, every cut good on the
  first try, no scene or beat dropped, $1.07. Seen in its frames and still open: a cut-out placed "huge" can
  run off the frame, and cameras that aim where they already are (4).
- Cut-out sizes (2026-11-20): a size is the cut-out's height, but a thing much wider than tall is fitted by its
  width (`cutoutBox`), and every placed, moved, swapped or resized cut-out is nudged so the whole of it is inside
  the frame and above the subtitles (`keptInFrame`). Only a place just outside an edge is exempt. This is in the
  player, so it applies to saved films too. Sizes between things (a person beside a ship) are still the scene
  writer's choice from five named steps; nothing knows real proportions.
- Measured sizes (2026-11-20, Dhanesh's idea): a cut-out's size can be `{"of": "<picture>.<part>", "times": n}`,
  n times as tall as that part's box in the drawing (`sizeShare`), or a number, its share of the frame's height.
  A move can carry a size, so a thing shrinks on its way to a far part. The five names still play. A size is
  capped at 0.8 of the frame so the whole cut-out always fits above the subtitles.
- First film with it ("What if gravity doubled overnight?"): the planner and scene writer used measured sizes
  where there was furniture and shares in open sky. A figure at 1.8 times a mattress and a cup at 0.18 times a
  counter came out in proportion. Two faults seen in its frames, both about where "on" puts a thing, not about
  the boxes: drawn over the pictures, the part finder's boxes were tight. (An earlier note here blamed the
  counter's box for taking in the cupboards. That was wrong.) The counter is near the viewer, so it is tall in
  the picture, and a figure 1.7 times it is rightly large; but "on the floor" stood that figure at the top of
  the floor's box, which is the floor's far end, where a near-sized figure looks giant. And "on the sofa" stood
  a lying figure on the top of the sofa's box, its backrest.
- So "on" now reads the part's box three ways (`placeOf`): a wide part reaching the bottom of the picture is
  ground, and a thing stands in the middle of it; a thing about as wide as the part is lying or sitting in it,
  and rests at seat height; anything else stands a tenth of the way down the box, on the upper surface a table
  or counter shows when seen slightly from above. The writers are told that a measured size holds only at the
  depth of the part measured. Re-rendered on that film: the figure lies on the sofa's seat and stands in the
  kitchen's foreground. Depth itself is still not modelled: nothing shrinks a thing as it moves up a floor.
- Cut-outs are cropped to the thing plus two pixels, not AiRA's 3% of the picture: that margin was 7% to 21%
  of a thing's height, so every size came out small by a different amount and feet hung above the ground. Also: the camera zooming in scales cut-outs with the picture, so a large one can
  leave the frame during a close shot.
- 2026-11-20, Dhanesh: show the pictures to the scene writer so it can judge sizes and places, and the rings
  look bad. Done: each scene writer request now carries its step's pictures at 768 pixels wide (`shrinkPng`), a
  cut-out as drawn on white, after the text so the cached prefix is unchanged; the list gives each part's box
  and each cut-out's shape. A place may be a point in the picture. Re-asked on two saved steps: with the
  pictures it put a figure at a point on the floor and took a cup to the counter's edge, over it and down to
  the floor, which named parts alone could not say. This is why the scene writer waits for its pictures: it
  needs them now, so the idea of starting it before they are drawn no longer applies.
- Attention marks redrawn (`drawAttention`): encircle is a thin marker ring with a slight wobble that ends just
  past where it began; dim is a soft pool of light in the part's own oval with no border; pulse is two ripples
  that settle to a faint ring. The old ones were a heavy double ring, a hard yellow box, and rings that never
  stopped.
- 2026-11-20, Dhanesh after watching the latest film: it is good; use movement only when it is actually needed,
  and more connected pictures (the same scene again with one thing changed: standing, then bent to the floor);
  put more information into the pictures and show a number when the voice says it; keep the hand-drawn look.
  `PLAN_SYSTEM` now says the film is told mainly in connected pictures and that a cut-out is for when the
  movement itself is what the voice describes; two aims were added, "a picture explains" and "a quantity is
  seen". Planner check on the gravity brief: 19 pictures of which 10 are later moments of another, no
  cut-outs, arrows and cut-aways drawn into 15 of them, and the spoken numbers quoted for the screen. Not yet
  made as a film. Numbers are still written by the film on top, not drawn by the image model.
- 2026-11-20, Dhanesh liked the connected-pictures film, in particular the words, numbers and information put
  on the pictures, and asked for the prompts to be made stronger with anything unnecessary removed. Both were
  rewritten: the planner's screen section is grouped (pictures, what the film does with them, things that
  move) and its six cut-out bullets are four; the scene writer's places and sizes are each described once in
  their own list, not inside the `place` action. Planner 2,589 to 2,308 words, scene writer 1,880 to 1,749.
  Added, each from a fault seen in the day's films: a beat is a change the viewer sees, and the camera aimed
  where it already is is not one; what is written on screen says what the voice says, though a number may be
  in figures with its unit or sign (which is what he liked); a voice mark outside the list is thrown away
  (`knownMarksOnly` now does that before the voice speaks). Removed a contradiction: the picture look said
  "never a diagram" while the planner was asked for arrows, cut-open views and comparisons.
- Checked without a new film. Planner: 21 pictures, 10 later moments, no cut-outs, numbers quoted, only valid
  voice marks. Scene writer, re-asked on all seven steps of the saved film with the same pictures: cameras
  aimed where they already were fell from 13 to 1, the one caption the voice never says was gone, and the
  number captions stayed. One run of each, so some of that is chance.
- 2026-11-21, Dhanesh: full observability, a model and reasoning effort for each stage, and prompts that can be
  rewritten in the app and reset. Built as described under "Seeing how a film was made" and "Choosing models and
  rewriting prompts". Checked on three real films: each film's calls add up to its own cost to the cent; a call
  refused by the image model's safety system shows the provider's message, the prompt and the reference sent.
- Three films were made to judge the prompts, changing one thing between each.
  Film 1, "Why is the sky blue?" (study): pictures explained well, but the narration had no figure at all
  ("much more strongly") and 7 name tags. So the planner was told a real figure said plainly is concrete, and
  that a name met for the first time is written beside the thing.
  Film 2, same question: 21 name tags and a real comparison, "450 nm", "650 nm", "about 4×". But every word on
  screen was a small tag, the key figure no bigger than a label. So planner and scene writer were told what the
  two sizes of writing are for: a small tag names a thing; large words or a large number carry the figure or the
  point a step turns on.
  Film 3, "How was penicillin discovered?" (story, the first of its kind): 23 large texts (years, names,
  places) and 7 tags, no camera aimed where it already was, nothing dropped.
- Seen in film 3 and fixed: one background was refused by the image model ("rejected by the safety system"),
  and its step then showed words about fermentation tanks over a picture of a mouse. A background now gets a
  second try, as a cut-out already did. Seen and not fixed: the story has no people in it, because the planner
  may not draw a named or real person and so drew none; one caption the voice never says; large words placed
  over the subject of the picture.



## Cut-outs on one sheet, Luna, handwriting (2026-11-21)

Dhanesh's decisions, in his words where it matters:
- **Pictures were most of a film's cost** (17 backgrounds, about $0.94 of $1.27). So a film is now a few
  backgrounds and many cut-outs, and every cut-out of a film is drawn in **one drawing** (`sheet-1`, up to 12
  things, a second sheet past that) and cut apart by `cutSheet` in `server/cutout.ts`.
- Measured: a 3072x2048 sheet costs 3,184 output tokens (about $0.11) against 1,372 (about $0.056) for a
  1536x1024 picture. So a larger drawing is not free, but 18 things on it cost a ninth of 18 drawn alone.
  Every sheet is now one normal 1536x1024 drawing, whatever is on it, up to 12 things (Dhanesh, 2026-11-21:
  "make it one normal picture and that should support 12 images"). At 12 each thing is about 380 px across.
- **The grid fits the number of things** (1, 2, 4, 6, 8, 9, 12 places), at most twelve a sheet (Dhanesh's
  limit). A grid fixed at twelve with places left empty was tried at his suggestion and does not work: asked
  for 5 things on a 4x3 grid, the image model drew all five in one row across the top and left two thirds of
  the sheet empty (`lumen-fixed-grid-test.png` in the projects folder). The image model does not keep to
  places it cannot see, so the grid is only ever a full one.
- The splitter joins pieces only to bring the number of pieces down to the number of things asked for,
  nearest first. It no longer joins things just for being close: on that test sheet the arrow, dog and bench
  stood close and had been taken for one thing.
- **"There should not be any fallback."** A sheet that cannot be drawn or cut, or that leaves a thing out, is
  not drawn again and its things are not drawn one by one. The run is marked failed with the reason
  (`film.error`); scenes that could be made are kept. Do not add a retry here.
- The splitter finds things by what is drawn, not by grid lines: pieces close together are one thing, and
  things are read row by row. The image model spreads a short last row across the sheet, which grid cells get
  wrong (seen in the first film).
- **Plan and scenes run on `gpt-6-luna` at medium**, not Sol. Prompts are now tuned on Luna. Luna sometimes
  closes its JSON with a bracket too many; `jsonObject` takes the first object that closes.
- Writing on the picture is in a handwriting face (Caveat 700, self-hosted through `@fontsource/caveat`).
  Subtitles stay plain. The export waits for the face to load (`handReady`).
- The record-keeper tested a regular expression against whole base64 pictures; a large sheet overflowed the
  stack and the call was recorded as failed after it had been paid for. It now tests only the start.

Three films made on 2026-11-21 (Luna, sheets): gravity $0.67 (sheet lost 1 of 11 to the grid bug, fixed),
vaccine $1.08 (the record-keeper crash above made all 12 be drawn alone, fixed), vaccine again $0.46 with
3 backgrounds and one sheet of 10, all 10 cut. Scene cache: 6 of 7 calls hit with no warm-up call.

Known and open: name tags, rings and the camera still cannot aim at a cut-out; white closed inside an outline
(a mug's handle) stays white; cut-outs are flat cartoon while backgrounds are painted.

## Three reviewed rounds on Luna medium (2026-11-21)

Two briefs (gravity, sky), each made three times, each film reviewed frame by frame (one frame every 2.5 s)
by a separate reviewer. Films cost $0.41 to $0.54 each.
- Fixed by prompt: a person standing on a table (now stands before it), a cut-out bringing its own bedding,
  dark arrows on dark walls, light beams drawn as cut-outs that could not reach from the sun to the air.
- Fixed by code, because the prompt alone did not hold on Luna: more than 22 words with no beat is a checker
  problem (`STILL_WORDS`), rings and ripples round a part that fills much of the frame are not drawn, a
  formula may hold `\text{...}` (it had come out as run-together letters), bottom-zone words clear a two-line
  subtitle.
- Still open after round three, both reviewers' verdict "mostly follows from the pictures alone": arrows and
  words put near the wrong thing or across the thing they name, a number tied to the wrong wave, an action
  that is only its end state (a jump that never lands, a fall that is one swap), cut-outs clipped at the
  frame edge after a camera move. These are placement by eye on a small model. A name tag or an arrow cannot
  yet be attached to a cut-out, which would remove most of them.

## Backgrounds that show what is said, two to a drawing (2026-11-21)

Dhanesh, after the three reviewed rounds: the background must be the picture of what the voice is saying ("if
you say air splits the sunrays then show the multi colors"); arrows, words and numbers act as keywords; objects
appear when they are named, "in real-time", and move; and backgrounds follow the grid system too, two in one
picture.
- **Backgrounds are drawn two to a drawing** (`pairPrompt`, `cutPair`, `PAIR_SIZE` 1024x1152): one above the
  other with a white band between, each cut out at about 1024 by 550, already 16:9. Measured: 1,641 output
  tokens a pair against 1,372 for one normal picture, so two backgrounds cost about 1.2 times what one did.
  They pair in plan order; a later moment listed straight after its original is drawn in the same drawing, so
  the two match. An odd last one is drawn by itself. A provider whose drawings cannot be cut sets
  `pairs: false` (the offline one).
- **No drawing is made twice.** The background's second try is gone too. Any failed drawing marks the run
  failed with the reason, and the scenes that could be made are kept.
- The planner is told the background is the idea itself, not an empty stage, and that cut-outs, words and
  numbers are the live layer on top. Six to ten backgrounds, six to twelve cut-outs.
- A direction that names a picture puts it on that step's screen even when the planner left it out of the
  list (Luna did, and two arrows were drawn and never shown).
- The still-frame check counts a beat only when it changes what is seen: aiming the camera where it already
  is does not count.
- Sky film with all of this: 9 backgrounds and 5 cut-outs in 6 drawings, 13 places and 17 moves, $0.49.
