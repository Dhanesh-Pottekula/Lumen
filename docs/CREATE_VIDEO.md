# End-to-end video workflow

Lumen separates authoring from playback. Codex or Claude writes Simple JSON;
the shipped library validates and renders it without an LLM.

## 1. Describe the learning outcome

State the audience, one objective, required facts, misconceptions, desired
duration, and sources. Ask for visible evidence rather than a narrated essay.

## 2. Give the coding agent repository context

Codex reads `AGENTS.md`; Claude Code reads `CLAUDE.md`. Both should also read
`docs/SIMPLE-JSON-LLM-CONTEXT.md` and inspect
`getSimpleJsonCapabilities()`.

## 3. Author in the private playground

Create a lesson under `apps/playground/src/lessons/` and register it in that
folder's index. Do not add the lesson to a public package.

## 4. Use diagnostics as a repair loop

Run:

```bash
npm run typecheck
npm run build
```

Compile the lesson with `compileLessonSpec`. Repair all diagnostic paths. Never
hide a problem by deleting necessary evidence or shrinking the whole scene.

## 5. Review frames

Inspect at least:

- the first visible frame of each scene;
- the midpoint of each motion;
- the end of each beat;
- both sides of scene transitions;
- the final frame.

Check attachment points, orbit/path starting geometry, label ownership,
clipping, stale temporary marks, text density, and whether the visual actually
proves the spoken claim.

## 6. Add narration

Enter your own Cartesia key in the playground. Keep narration optional so the
same lesson renders silently when Cartesia is unavailable.

## 7. Export

Use `@aira/lumen-mp4` in a WebCodecs-capable browser. For reliable audio/video
codec coverage across environments, render frames and mux media in a controlled
server pipeline.

## 8. Audit before sharing

```bash
npm run typecheck
npm run build
npm run pack:audit
npm audit
```

Confirm the npm tarballs contain only `dist`, package metadata, README, and
license files.
