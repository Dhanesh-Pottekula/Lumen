# Two-Stage Activity Planning + Tutorial Activity — Implementation Plan

Status: PROPOSED
Scope: `app/entities/pipeline_live_activity.py`, `app/entities/tools_live_activity.py`,
`app/entities/activity_ent.py`, `app/adapters/cartesia_adp.py`, `app/entities/prompt_ent.py`,
`app/entities/prompts/*`, `app/entities/skills/*`

---

## 0. Corrections to the current-state assumptions

Before the plan, three facts about the codebase as it stands today:

1. **The existing planner LLM is OpenAI 5.4, not DeepSeek.** `execute_openai()` in
   `pipeline_live_activity.py` drives the whole build/replan loop on `self._llm.OpenAI.stream(...,
   model="5.4")`. DeepSeek V4 Flash is only used for progress labels
   (`_generate_progress_labels`) and the post-activity recap. In this plan, "Stage-2 assembler"
   refers to this existing OpenAI loop; whether it stays on OpenAI 5.4 or moves to DeepSeek is a
   one-line model swap and is left as a config decision.
2. **Video search already exists** — `ImageSearchToolEntityClass.video_search()`
   (`tools_image_search.py:334`) via the Serper adapter (`serper_adp.py`, VIDEOS endpoint). It is
   just not registered in the activity tool registry today. The `general_video` component already
   accepts a YouTube URL.
3. **Image generation already exists** — `GeminiLLM.generate_image(model, prompt) -> bytes`
   (`gemini_llm.py:283`). It is not exposed as an activity tool and there is no activity image
   *upload* helper yet (only `upload_activity_audio`, `activity_ent.py:1796`).

---

## 1. Goal

Split activity planning into two LLM stages and add a new **tutorial** activity family.

```
 user request ("teach me how a jet engine works")
        │
        ▼
 ┌───────────────────────────────────────────────┐
 │ STAGE 1 — Script Architect (NEW)              │
 │ • agentic: get_skill, web_search,             │
 │   cosmos_search, ltm_search                   │
 │ • thinks, researches, writes the FULL script  │
 │ • terminal: submit_script (structured output) │
 │ • output: ActivityScript — steps, narration,  │
 │   and every media description (searched image,│
 │   generated image, video)                     │
 └───────────────────────────────────────────────┘
        │  ActivityScript (validated Pydantic)
        ▼
 ┌───────────────────────────────────────────────┐
 │ STAGE 2 — UI Assembler (EXISTING loop,        │
 │ re-scoped)                                    │
 │ • NO planning/creative responsibility         │
 │ • stitches components from the script         │
 │ • terminal: commit_activity                   │
 │ • media resolution stays in commit_activity   │
 │   exactly as today                            │
 └───────────────────────────────────────────────┘
        │  commit_activity → inflate → resolve media → save → activity_ready
        ▼
      frontend
```

Division of responsibility:

| Concern | Stage 1 Architect | Stage 2 Assembler |
|---|---|---|
| Understand the user, recall memory | ✅ | ❌ |
| Research facts (web_search) | ✅ | ❌ |
| Read craft skills (get_skill) | ✅ | ❌ |
| Write narration / cue text / SSML | ✅ | ❌ |
| Decide every image/video/gen-image description | ✅ | ❌ |
| Pick components, build the flat plan JSON | ❌ | ✅ |
| Call commit_activity | ❌ | ✅ |
| Resolve media (search, generate, voice) | ❌ | ❌ (backend does it inside commit, as today) |

> Design note: the user's framing was "the next LLM will use these descriptions to make the
> respective tool calls like video search / image generation / search calls". Two options:
>
> - **Option A (recommended):** keep media resolution *inside* `commit_activity` /
>   `_resolve_media` as it works today — deterministic Python fan-out, concurrency-capped,
>   vision-verified, no LLM tokens burnt on mechanical work. The assembler only copies the
>   architect's descriptions into the right component fields. Video resolution is added to the
>   same batch (`video_description` → `video_search` → first YouTube URL).
> - **Option B:** expose `image_search` / `video_search` / `generate_image` as assembler tools
>   and have it resolve media itself before committing. Slower (serial LLM round-trips), more
>   expensive, and the model can mis-paste URLs. Only choose this if the assembler must *see*
>   the resolved media to make layout decisions.
>
> The rest of this document assumes **Option A**. Everything is written so switching to B later
> is additive (register the three tools in the assembler tool set).

---

## 2. Stage 1 — the Script Architect

### 2.1 New structured-output models (`activity_ent.py`, under `_Types`)

```python
class ScriptMedia(BaseModel):
    """One media directive authored by the architect."""
    kind: Literal["search_image", "generate_image", "video"]
    description: str = Field(description=(
        "For search_image: the laser-specific photo description (existing image_description "
        "rules apply). For generate_image: the full generation prompt — subject, style, "
        "composition, lighting. For video: what the clip must show; resolved via video search."
    ))

class ScriptSlide(BaseModel):
    """One tutorial slide: a visual plus the words spoken over it."""
    media: ScriptMedia
    cue_text: str = Field(description=(
        "Exactly what AiRA speaks while this visual is on screen. Natural spoken English. "
        "The slide's duration IS this audio's duration."
    ))

class ScriptStep(BaseModel):
    """One step of the scripted activity."""
    purpose: str            # what this step achieves in the arc
    heading: str | None
    body: str | None
    narration: list[str]    # play-cue lines for this step (non-tutorial kinds)
    media: list[ScriptMedia]
    slides: list[ScriptSlide] | None  # tutorial only
    checkpoint: str | None  # ask_user question when a gate is needed (non-tutorial)

class ActivityScript(BaseModel):
    """Stage-1 output: the complete creative plan, ready to be assembled into components."""
    kind: Literal["cooking", "meditation", "general", "tutorial"]
    goal: str
    title: str
    subtitle: str
    icon: str
    cover: ScriptMedia
    outcome: str
    total_minutes: int
    difficulty: Literal["easy", "medium", "hard"]
    meditation_script: str | None   # meditation only: the full SSML script
    steps: list[ScriptStep]
    notes_for_assembler: str | None # layout hints, accents, anything structural
```

### 2.2 New pipeline method (`pipeline_live_activity.py`)

```python
async def execute_script_architect(
    self, user_id, session_id, scratchpad, transcription, prior_turns,
) -> ActivityTypes.ActivityScript | None:
```

- Same agentic shape as `execute_openai` but with the **architect tool set**:
  `web_search`, `cosmos_search`, `ltm_search`, `get_skill`, and one **terminal structured tool**
  `submit_script` whose args model IS `ActivityScript` (mirroring how `commit_activity`'s args
  are the plan). Loop cap: reuse `self._max_iterations`.
- The loop ends when `submit_script` is called with a payload that validates; validation
  errors are folded back as errored tool results so the model self-corrects (same mechanic
  as `commit_activity` today).
- `submit_script`'s implementation does nothing but echo success — the pipeline captures the
  validated `ActivityScript` from the parsed arguments (register it in a new
  `_script_tools` set on `ActivityToolEntityClass`).
- Model: start with the same `OpenAI "5.4"`; keep the model id a constructor `Final` so it can
  be swapped independently of the assembler.
- Returns `None` after `_max_iterations` without a valid script → the caller fails the build
  (`_fail_build`), same as today.

> Why a terminal tool instead of a one-shot `.structured()` call: the architect must interleave
> research tool calls with authoring, and the existing `DeepSeek.structured` /
> `Gemini.structured` paths are single-shot without tools. A terminal structured tool keeps the
> proven `execute_openai` loop mechanics (round-tripping, retries, redaction).

### 2.3 Wiring into `_run_single_turn` (planning branch)

```python
# BEFORE (today):
planner_parts = await self.execute_openai(..., run=None, build_run_id=run_id)

# AFTER:
script = await self.execute_script_architect(user_id, session_id, scratchpad,
                                             args.transcription, prior_turns)
if script is None:
    await self._fail_build(...); return
planner_parts = await self.execute_openai(          # stage 2 — assembler
    user_id, session_id, scratchpad, args.transcription,
    run=None, prior_turns=prior_turns, build_run_id=run_id,
    script=script,                                   # NEW parameter
)
```

- `execute_openai` gains an optional `script: ActivityScript | None = None` parameter. When
  present, `_build_prompts` selects the **assembler** prompt pair instead of the planning pair
  and injects `script.model_dump_json()` into a new `{{script}}` slot.
- **Replanning is unchanged for now** (single-stage, existing prompt + step-edit tools). A
  follow-up can add a "script patch" stage; out of scope here.
- **Progress phases** (`_publish_activity_loading_progress` ranges) re-weighted:
  `context 0→12`, `scripting 12→45` (NEW phase, label from a new `ProgressLabels.scripting`
  field), `planning 45→60` (assembler), then `images/voice/save/open` unchanged. Add
  `scripting: str = "Writing your activity script"` to `_Types.ProgressLabels` and one label to
  the `_generate_progress_labels` example JSON.

### 2.4 Tool registry changes for stage 1 (`tools_live_activity.py`)

- New args model `_Types.SubmitScriptArgs(BaseModel)` with a single field
  `script: ActivityTypes.ActivityScript`.
- New method `async def submit_script(self, args) -> ResultDict` returning
  `{"response": "Script accepted.", "errored": False}`.
- New frozensets:
  ```python
  self._architect_tools = frozenset({"web_search", "cosmos_search", "ltm_search",
                                     "get_skill", "submit_script"})
  ```
- New projection `architect_openai_tools` built in `load_tool_specs_into_cache()` the same way
  as `build_openai_tools` (exclude everything not in `_architect_tools`).
- `submit_script` joins the pipeline's `_redacted_inputs` (its args ARE the script — don't
  store twice) but NOT `_mutating_tools` (it writes nothing).

---

## 3. Stage 2 — the re-scoped Assembler

No structural code change beyond the `script` parameter — the change is almost entirely
**prompt + tool-set**:

- Tool set for a scripted build: `commit_activity` only (drop `web_search`/`cosmos_search`/
  `ltm_search`/`get_skill` — the architect already did all of that; removing them removes the
  temptation to re-plan). New frozenset:
  ```python
  self._assemble_tools = frozenset({"commit_activity"})
  ```
  projected as `assemble_openai_tools`; `execute_openai` picks it when `script is not None`.
- The assembler's ONLY job: translate `ActivityScript` → `FlatActivityPlan`, mapping:
  - `script.cover.description` → `activity.image_description`
    (if `cover.kind == "generate_image"`, into the new `generated_image_description` field —
    see §5)
  - each `ScriptStep` → one `FlatActivityStep`; `narration[i]` → `play` cues; `media[]` →
    `cooking_image`/`general_image`/`general_video` components; `checkpoint` → `ask_user` step
  - `kind == "meditation"` → single `meditation_session` with `text = meditation_script`
  - `kind == "tutorial"` → single `tutorial_session` (see §4) with `slides` copied 1:1
- It must copy descriptions **verbatim** — the prompt forbids rewriting the architect's words.

---

## 4. The new `tutorial` activity family

### 4.1 UX contract

- One step in the stepper (exactly like meditation — enforced the same way).
- Top half of the screen: an auto-advancing image/visual region.
- Each slide = one visual + one narrated audio clip. The slide shows for **exactly the duration
  of its audio**; when the next slide appears its audio starts instantly.
- The FE **downloads all slide audio before starting** the activity (the committed plan carries
  every `playback_key` up front, same delivery as meditation narration).
- Each slide also carries a **`transcription`** field — the word-level timestamps captured from
  Cartesia during synthesis — which the FE uses for scrubbing (jump forward/backward maps a
  timeline position to a word boundary / slide offset).

### 4.2 New flat models (`activity_ent.py`, `_Types`)

```python
class FlatTutorialSlide(BaseModel):
    """One slide of a tutorial: a visual and the words spoken over it."""
    image_description: str | None = Field(default=None, description=(
        "Photo to FIND for this slide (existing image_description rules: laser-specific, "
        "full instruction of the exact photo). Provide exactly one of image_description / "
        "generated_image_description / video_description."))
    generated_image_description: str | None = Field(default=None, description=(
        "Image to GENERATE for this slide when no real photo can exist (diagrams, cutaways, "
        "abstract concepts). A complete generation prompt: subject, labels, style, composition."))
    video_description: str | None = Field(default=None, description=(
        "Video to find for this slide (resolved to a public YouTube URL by the backend)."))
    cue: str = Field(description=(
        "Exactly what AiRA speaks while this slide is visible — natural spoken English. The "
        "backend synthesises it; the audio's length IS the slide's duration. You write only "
        "the words, never an audio file or key."))

    @model_validator(mode="after")
    def _exactly_one_media(self) -> "FlatTutorialSlide": ...  # enforce exactly one description

class FlatTutorialSession(BaseModel):
    """The single block a kind:'tutorial' activity is built from."""
    kind: Literal["tutorial_session"] = Field(description=(
        "Component type discriminator. Must be the exact literal string 'tutorial_session'. "
        "A tutorial activity is exactly ONE step holding only this one block — no ask_user, "
        "no second step, never multi-step. Do not mix cooking_*/general_* blocks in."))
    slides: list[FlatTutorialSlide] = Field(min_length=1)
    label: str | None = None
```

Registered into the `FlatStepComponent` union and the component-kind literals list
(`activity_ent.py:1427` area), plus `ActivityTypes` exports.

Stored (inflated) side — the resolved slide the FE receives:

```python
class TutorialTranscriptionWord(TypedDict):
    word: str
    start: float
    end: float

# component.data after resolution:
{
  "kind": "tutorial_session",
  "slides": [
    {
      "url": "https://...",                     # resolved image / generated-image blob / video URL
      "media_kind": "image" | "generated_image" | "video",
      "cue_text": "...",                        # kept for accessibility / captions
      "playback": {"playback_key": "<azure blob key>"},
      "duration_s": 14.32,                      # from the last word's end timestamp
      "transcription": [                        # NEW — word-level timestamps
        {"word": "The", "start": 0.0, "end": 0.11},
        {"word": "compressor", "start": 0.12, "end": 0.68},
        ...
      ]
    },
    ...
  ]
}
```

### 4.3 Kind literal + family rules

- `ActivityPlan.kind` / `FlatActivityPlan.kind` / `ActivityScript.kind` literals gain
  `"tutorial"`: `Literal["cooking", "meditation", "general", "tutorial"]`
  (`activity_ent.py:183` and the flat counterpart).
- `_Helper.activity_mood()` (`tools_live_activity.py:288`): tutorial rides the idle
  fall-through (same rationale as general) unless design wants a dedicated mood — no code
  change needed, but add a comment line.
- Family rule (mirrors meditation): a tutorial is exactly one step holding one
  `tutorial_session`; no general_*/cooking_* components; no `ask_user`.

---

## 5. Cartesia: WebSocket synthesis with timestamps

### 5.1 New adapter method (`cartesia_adp.py`)

The REST `tts.generate` endpoint cannot return timestamps — that is WebSocket-only. Add:

```python
async def synthesize_audio_with_timestamps(
    self,
    text: str,
    *,
    voice_id: str | None = None,
    model_id: str | None = None,
    sample_rate: _Types.SampleRate = 24000,
    encoding: _Types.Encoding = "pcm_s16le",
) -> tuple[bytes, list[_Types.WordWithTimestamps]]:
    """One-shot synthesis over the persistent WS context, returning (wav_bytes, words)."""
```

Implementation notes:

- `context = await self.get_new_context(add_timestamps=True, ...)` — reuses the persistent
  multiplexed connection and the self-healing `_CartesiaConnectionManager`.
- Push the full text once, call `no_more_inputs()`, then consume `context.receive()` exactly
  like `process_websocket_responses` does — but **collect instead of publish**:
  - `type == "timestamps"` → zip `words/start/end` into the accumulated word list
    (same zip as `cartesia_adp.py:376`).
  - `type == "chunk"` → append `response.audio` bytes.
  - `type == "error"` → raise `RuntimeError` (content-level, do NOT `mark_dirty`).
  - transport failure / idle timeout → `self._manager.mark_dirty()` then raise
    (same rule as the streaming path).
- **WAV header**: the WS path emits raw PCM (`container: "raw"`), unlike REST which returns a
  WAV container. Prepend a standard 44-byte RIFF/WAVE header (`pcm_s16le`, mono, the chosen
  sample rate) before returning, so the uploaded blob is a self-describing playable file —
  identical in kind to what `upload_activity_audio` stores today. Small pure helper:
  `_wrap_wav(pcm: bytes, sample_rate: int) -> bytes`.
- Reuse the orphan-queue cleanup `finally` block from `process_websocket_responses`
  (factor it into a small private helper `_pop_context_queue(context)` used by both).
- Timeout: accept an `idle_timeout` param; the caller passes the narration-scale bound.

### 5.2 What we get

`words` is already exactly the FE contract: `[{"word": ..., "start": ..., "end": ...}]`,
seconds-based. `duration_s = words[-1]["end"]` when words exist (fall back to
`len(pcm) / (2 * sample_rate)` otherwise).

---

## 6. Media resolution changes (`tools_live_activity.py`)

### 6.1 New: `_resolve_tutorial_slides`

```python
async def _resolve_tutorial_slides(
    self, namespace: PydanticObjectId,
    flat_components: list[ActivityTypes.FlatStepComponent],
) -> dict[int, list[dict[str, Any]]]:
    """Resolve every tutorial_session's slides: visual + voiced cue + transcription.
    Returns {id(flat_session): [resolved slide dicts]}."""
```

Per slide, three concurrent-ish jobs under the existing `self._media_parallel` semaphore:

1. **Visual** — branch on which description is set:
   - `image_description` → `self._first_image(desc)` (existing path: search + vision-verify).
   - `video_description` → NEW `self._first_video(desc)`: `self._image_search.video_search(
     SerperAdapterTypes.VideoSearchArgs(q=desc))`, take the first YouTube result's `link`;
     `None` on miss (same 45s `_image_timeout`).
   - `generated_image_description` → NEW `self._generate_image(desc)`: call
     `self._llm.Gemini.generate_image(model, prompt)` → bytes → upload via a NEW
     `activity_ent.upload_activity_image(namespace, name, data)` (clone of
     `upload_activity_audio` at `activity_ent.py:1796` with an image content-type) → URL.
     Requires injecting the LLM adapter into `ActivityToolEntityClass.__init__` (new
     constructor param, wired in the DI container).
2. **Audio** — `self._cartesia.synthesize_audio_with_timestamps(slide.cue)` →
   `(wav_bytes, words)`; upload wav via `upload_activity_audio(namespace, uuid4().hex, ...)`
   → `playback_key`.
3. Assemble the resolved slide dict (`url`, `media_kind`, `cue_text`, `playback`,
   `duration_s`, `transcription`).

Failure policy — tutorial audio is the experience (like meditation narration):
**audio failures propagate** (`must_succeed` semantics → the build fails loudly rather than
committing a silent tutorial). Visual misses degrade gracefully: the slide keeps its audio and
ships without a visual (`url: None`), mirroring the "activity ships photo-less" rule for
images today. Timeout for slide audio: `self._voice_timeout` is too tight for long cues —
introduce `self._slide_voice_timeout: Final[int] = 60` (cues are per-slide, shorter than a
5-minute meditation but longer than a one-liner).

### 6.2 Wire into `_resolve_media` and the attach pass

- `_resolve_media` gains a fourth concurrent resolver:
  ```python
  image_map, cue_map, session_map, slide_map = await asyncio.gather(
      self._resolve_images(steps, cover=cover),
      self._resolve_cues(namespace, ...),
      self._resolve_sessions(namespace, ...),
      self._resolve_tutorial_slides(namespace, [c for fs in steps for c in fs.components]),
  )
  ```
  (Return type widens; `commit_activity`, `update_step`, `insert_step` destructure one more
  map.)
- New `_Helper.attach_slides(slide_map, flat_step, step)` — mirrors `attach_sessions`: for each
  `FlatTutorialSession`, write `component.data["slides"] = slide_map[id(flat_component)]`.
  Called from `commit_activity` and both step-edit tools next to the existing attaches.
- **Cover for generated images**: `FlatActivityPlan` gains an optional
  `generated_image_description: str | None` alongside `image_description`; `_resolve_images`
  branches the cover the same three ways as a slide visual. (Small, optional — can ship
  tutorial with searched covers only in v1 and defer this.)

### 6.3 `commit_activity` description update

Extend the tool description (`load_tools_specs`) and `CommitActivityArgs.activity` field
description: name the fourth family, the one-step tutorial rule, the exactly-one-media rule
per slide, and that slide cues become audio + transcription automatically.

---

## 7. Prompt changes — file by file

### 7.1 NEW `prompts/system-activity_script.md` (Stage-1 architect system prompt)

Content outline (authored in the voice/format of the existing planning prompt):

- **Role**: "You are AiRA's activity script architect. You research and write the complete
  creative script for an activity. You do NOT build UI components and you do NOT commit —
  a separate assembler turns your script into screens verbatim."
- **The four families** — cooking / meditation / general / **tutorial**, with the tutorial
  definition: "a watch-and-listen explainer: one continuous flow of visual slides, each with
  narration; the user's hands are free, their eyes are on the screen. Use it when the user
  wants something explained/shown rather than done (how X works, story of Y, tour of Z).
  Learning-by-doing still goes to general; sit-back explainers go to tutorial."
- **Skills section** — identical `{{skills_index}}` mechanic and the same routing paragraph,
  plus: "for a tutorial load `tutorial_activity`."
- **Research doctrine** — copied from the planning prompt: recall the user first
  (`cosmos_search`/`ltm_search` on the topic), then `web_search` for facts, timings, pitfalls;
  ground every concrete value.
- **Media authoring** (the new core section):
  - Three media kinds and when to use each: `search_image` (a real photo exists —
    existing laser-specific description rules, verbatim from today's prompt),
    `generate_image` (no real photo can exist: cutaways, labelled diagrams, abstract concepts —
    write a full generation prompt: subject, labels, composition, style), `video` (a clip
    genuinely teaches better than stills — describe exactly what the clip must show).
  - "You write descriptions, never URLs. The backend finds, generates, verifies, and fills."
- **Narration authoring** — voice-over-not-screen-reading and AiRA's cue register
  (both lifted from the planning prompt), plus for tutorials: "each slide's `cue_text` is the
  full narration for that slide; the audio's length is the slide's length — write to the
  moment, roughly 2–5 spoken sentences per slide"; SSML is meditation-only.
- **Terminal rule**: "Call `submit_script` exactly once with the complete script. Do not call
  it until every step and every media description is written."

### 7.2 NEW `prompts/context-activity_script.md`

Same slots as `context-activity_planning.md` (date/time, `{{user_details}}`, `{{turns}}`) —
minus the activity/states slots (nothing exists yet):

```
The user's current local date and time is {{current_date_and_time}}. ...
User: {{user_details}}
Conversation so far (the session that led into this activity):
{{turns}}
```

### 7.3 NEW `prompts/system-activity_assemble.md` (Stage-2 assembler system prompt)

- **Role**: "You are AiRA's activity assembler. A finished script for this activity is in your
  context. Your ONLY job is to translate it into the flat Activity object and commit it. You do
  not research, you do not rewrite, you do not improve."
- **Hard rules**:
  - Copy every `cue_text`, narration line, heading, body, and media description **verbatim** —
    changing the architect's words is a failure.
  - Map media by kind: `search_image` → the component's `image_description`;
    `generate_image` → `generated_image_description`; `video` → the slide's
    `video_description` (or `general_video` for non-tutorial kinds — note: `general_video`
    today takes a URL; for scripted general activities keep videos out of v1 or add a
    `video_description` variant — see Open Questions).
  - Family/component rules restated mechanically (one-step meditation, one-step tutorial,
    exactly-one-media per slide, no general_* in meditation/tutorial).
  - "Trust the commit_activity schema for every field; this prompt is about faithful
    translation."
- **Terminal**: commit once, only when the whole plan is built, never twice.

### 7.4 NEW `prompts/context-activity_assemble.md`

```
User: {{user_details}}

The finished activity script to assemble (translate this faithfully — do not rewrite):
{{script}}
```

(`{{turns}}` intentionally omitted — the assembler must not re-litigate the conversation.)

### 7.5 EDIT `prompts/system-activity_planning.md`

Kept as-is for now — it remains the fallback single-stage prompt (feature-flag path, §9) and
the base for replan context. Two minimal edits:

1. The family sentence (§"What an activity is") gains the tutorial family: "...a **tutorial**
   activity (a watch-and-listen explainer built from a single `tutorial_session`, never
   general_* blocks — one step, like meditation)". Update every "three families" mention to
   four.
2. Skills routing paragraph: add "use `tutorial_activity` when the user wants something
   explained or shown rather than done."

### 7.6 EDIT `prompts/system-activity_replanning.md`

- Family-integrity list gains: "tutorial activities are a single `tutorial_session` step and
  must stay that way — revise the slides in place with `update_step` (rewrite slide cues,
  swap slide media descriptions, add/remove slides inside the session); never add a second
  step, an `ask_user`, or general_* components."
- The image-description paragraph gains one sentence covering `generated_image_description`
  and `video_description` on slides.

### 7.7 EDIT `prompts/system-activity_converse.md`

One addition to §2 (the "what can happen" list is unchanged — questions/replan/screens work
the same). Add to §2's intro or a short §2d: "in a tutorial, playback is the experience:
answer briefly and let it resume; slide changes are owned by the app, so
`activity_change_step` is never needed to move slides — it still gates ask_user screens in
other activities only." (Tutorials have no ask_user steps, so in practice the tool goes
unused there.)

### 7.8 NEW `skills/tutorial_activity.md`

Frontmatter + craft guide, structured like `meditation_activity.md`:

- **Shape**: one step, one `tutorial_session`, 6–15 slides typical; the arc is
  hook → build-up → core explanation → payoff/recap.
- **Slides are beats**: one idea per slide; the visual shows the thing, the narration explains
  it; never a slide whose narration just reads a caption.
- **Media choice per slide**: real photo when one exists (laser-specific description);
  generated image for cutaways/diagrams/impossible shots (write labels into the prompt);
  video only when motion itself teaches (a mechanism turning, a technique performed).
- **Narration craft**: spoken, warm, concrete; 2–5 sentences a slide; each slide's last line
  can hand off to the next visual ("now look at what happens inside…"); no SSML (plain lines —
  timestamps must map to visible words).
- **Pacing**: audio length = slide length; front-load the hook slide; keep the total honest in
  `total_minutes`.

### 7.9 `prompt_ent.py` registrations

- Add `"activity_script"` and `"activity_assemble"` to the system+context prompt literal set
  and the preload map (both with `("", "")`-style cache entries like the other activity
  prompts, `prompt_ent.py:138-142` area).
- New builders following the existing pattern:
  - `activity_script(user_details, turns, skills_index, timezone) -> tuple[str, str]`
  - `activity_assemble(user_details, script_json) -> tuple[str, str]`
- `activity_planning` / `activity_replanning` builders unchanged (slot shapes unchanged).

---

## 8. Frontend contract (summary for the FE team — no BE code)

- New component kind `tutorial_session` inside the standard activity payload
  (`activity_ready` / `activity_replanned` / `activity_step_updated` events unchanged).
- Per slide: `url` + `media_kind`, `playback.playback_key` (Azure blob, WAV), `duration_s`,
  `transcription: [{word, start, end}]` (seconds, monotonically increasing).
- Expected FE behaviour: prefetch every slide's audio before start; play slides sequentially,
  advancing when each clip ends; scrubbing maps timeline position ↔ slide index + intra-slide
  offset via the per-slide `duration_s` prefix-sums, and word highlighting (if built) comes
  straight from `transcription`.
- Zod note: optional fields are omitted (never null) — same `exclude_none` discipline as cues.

---

## 9. Rollout & safety

- **Feature flag** `ACTIVITY_TWO_STAGE_PLANNING` (env/config): off → today's single-stage
  `execute_openai` path runs untouched; on → architect + assembler. The tutorial component and
  Cartesia method ship dark until the flag is on (the planning prompt only advertises the
  tutorial family in the new prompts).
- **Failure surfaces**:
  - Architect never submits a valid script → `_fail_build` (existing failed-state UX, card
    retries).
  - Slide audio synth/upload failure → propagates → commit_activity errors → assembler sees
    the error, may retry once within the loop → otherwise `_fail_build`.
  - Slide visual misses → slide ships without a visual; never blocks.
- **Cost/latency note**: two LLM stages add one serial round; the architect does the token-heavy
  work, the assembler is a near-mechanical translation (candidate for a cheaper model later —
  the `script` parameter keeps that a one-line change).

---

## 10. File-by-file change list

| File | Change |
|---|---|
| `app/adapters/cartesia_adp.py` | NEW `synthesize_audio_with_timestamps()` (WS, timestamps, WAV wrap); factor `_pop_context_queue` helper |
| `app/entities/activity_ent.py` | `kind` literals + `"tutorial"`; NEW `FlatTutorialSlide`, `FlatTutorialSession` (+ union/registry/exports); NEW `ActivityScript` model family; NEW `upload_activity_image()`; optional `generated_image_description` on `FlatActivityPlan` |
| `app/entities/tools_live_activity.py` | NEW `submit_script` tool + `SubmitScriptArgs`; `_architect_tools` / `_assemble_tools` sets + OpenAI projections; NEW `_resolve_tutorial_slides`, `_first_video`, `_generate_image`; `_resolve_media` fourth resolver; `_Helper.attach_slides`; `_slide_voice_timeout`; LLM adapter constructor param; description updates |
| `app/entities/pipeline_live_activity.py` | NEW `execute_script_architect()`; `execute_openai(script=...)` param + tool-set/prompt selection; `_run_single_turn` planning branch two-stage wiring behind flag; `submit_script` in `_redacted_inputs`; progress-phase re-weighting; `ProgressLabels.scripting` |
| `app/entities/prompt_ent.py` | Register + build `activity_script`, `activity_assemble` |
| `app/entities/prompts/system-activity_script.md` | NEW (architect) |
| `app/entities/prompts/context-activity_script.md` | NEW |
| `app/entities/prompts/system-activity_assemble.md` | NEW (assembler) |
| `app/entities/prompts/context-activity_assemble.md` | NEW |
| `app/entities/prompts/system-activity_planning.md` | EDIT: tutorial family + skill routing |
| `app/entities/prompts/system-activity_replanning.md` | EDIT: tutorial revision rules + new media fields |
| `app/entities/prompts/system-activity_converse.md` | EDIT: one tutorial-playback note |
| `app/entities/skills/tutorial_activity.md` | NEW skill |
| DI container (adapters/entities wiring) | Pass LLM adapter into `ActivityToolEntityClass` |

---

## 11. Open questions (decide before implementation)

1. **Assembler model** — keep OpenAI 5.4, or move the now-mechanical stage to a cheaper model
   (DeepSeek V4 Flash / GPT mini)? Recommendation: ship on 5.4, benchmark, then downgrade.
2. **Option A vs B (§1)** — confirmed backend-resolved media (A)? B changes §6 into assembler
   tools instead.
3. **Generated-image model + storage** — which Gemini image model id; blob container +
   content-type for `upload_activity_image`; any size cap.
4. **Videos outside tutorials** — `general_video` takes a raw YouTube URL today; scripted
   general activities either keep videos out of v1, or `general_video` gains a
   `video_description` alternative resolved the same way. Recommendation: defer, tutorial-only
   videos in v1.
5. **Replan for tutorials** — v1 revises slides via `update_step` on the single session
   (whole-session replacement re-voices every slide — acceptable?). A slide-level diff edit is
   a follow-up.
6. **Transcription with SSML** — tutorials forbid SSML in cues so timestamps map to visible
   words; confirm the FE never needs SSML pauses inside a slide (silence can be authored as a
   slide-final short sentence + natural gap).
