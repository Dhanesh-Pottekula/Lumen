# Migration from the original application

| Original path | Public destination |
|---|---|
| `src/simple-json`, `src/gcl`, `src/render`, `src/slides` | `@aira/lumen` |
| `src/components/CanvasSlide.tsx` | `@aira/lumen-react` |
| narration synthesis/alignment/cache | `@aira/lumen-cartesia` |
| MP4 export | `@aira/lumen-mp4` |
| `App.tsx`, `main.tsx`, demo CSS, lessons | private playground |

Replace relative internal imports with package imports. Cartesia synthesis now
requires `{ apiKey }`; the adapter intentionally has no environment-variable
fallback. Import the React stylesheet explicitly:

```ts
import "@aira/lumen-react/style.css";
```

Example lessons are not shipped in core. Copy only the example you want from
the repository or author a new `LessonSpec`.
