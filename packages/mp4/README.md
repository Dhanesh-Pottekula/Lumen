# @aira/lumen-mp4

Optional browser MP4 export for a compiled `@aira/lumen` slide.

```bash
npm install @aira/lumen @aira/lumen-mp4
```

```ts
import { canExportMp4, exportLessonMp4 } from "@aira/lumen-mp4";

if (canExportMp4()) {
  const video = await exportLessonMp4(result.slide, narrationBlob);
}
```

Export uses WebCodecs and `mp4-muxer`. Feature-detect it and provide a server
fallback when export must work in every browser.
