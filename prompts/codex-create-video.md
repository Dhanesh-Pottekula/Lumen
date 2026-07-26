# Prompt for Codex

Copy the text below into Codex, then append your lesson brief.

---

Create a complete Lumen Simple JSON educational video in this repository.

First read `AGENTS.md`, `docs/SIMPLE-JSON-LLM-CONTEXT.md`, and the current
`getSimpleJsonCapabilities()` output. Inspect how the private playground
registers lessons. Do not add lesson-specific logic to a renderer package.

Work through these stages:

1. Turn my objective into a visual plan where each scene proves one claim.
2. Author a version 1 `LessonSpec` under `apps/playground/src/lessons/`.
3. Register the lesson in the private playground.
4. Compile it and repair every error and warning at its diagnostic path.
5. Review the first, midpoint, transition, and final frames. Fix clipping,
   overlap, incorrect attachment, motion discontinuity, stale temporary
   objects, and visual claims that do not match narration.
6. Run type checking and the production build.

Prefer diagrams, spatial relationships, motion, charts, maps, and timelines
over explanatory paragraphs. Use effects only when they encode the concept.
Keep temporary guides temporary. Use only documented fields, tokens, assets,
anchors, and SVG elements.

Do not add an OpenAI, Anthropic, or other LLM API call to Lumen. Do not read or
embed provider keys. Narration must remain optional and the user supplies their
own Cartesia key through the playground. Do not commit, push, or publish.

At the end, report the lesson file, what each scene teaches visually,
diagnostic/build results, and any remaining browser limitation.

Lesson brief:

[TOPIC, AUDIENCE, OBJECTIVE, REQUIRED FACTS, SOURCES, MISCONCEPTIONS, DURATION]
