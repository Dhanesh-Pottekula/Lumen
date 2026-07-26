# @aira/lumen-react

React player for a compiled `@aira/lumen` canvas slide.

```bash
npm install @aira/lumen @aira/lumen-react react react-dom
```

```tsx
import { CanvasSlide } from "@aira/lumen-react";
import "@aira/lumen-react/style.css";

<CanvasSlide
  slide={result.slide}
  title="My lesson"
  tag="Deterministic Simple JSON"
  speakerLabel="Teacher"
  canvasLabel="Animated lesson about gravity"
/>
```

The player provides responsive Canvas 2D rendering, play/pause, seeking,
captions, and optional synchronized `slide.audioUrl` playback.
