import type { LessonSpec } from "@aira/lumen";

export const lesson: LessonSpec = {
  version: "1",
  title: "A visual statement",
  theme: "textbook",
  scenes: [{
    id: "statement",
    composition: "hero",
    objects: [{
      id: "title",
      kind: "text",
      text: "SIMPLE JSON → CANVAS",
      textRole: "body",
      placement: { mode: "zone", zone: "main" }
    }],
    beats: [{
      id: "show",
      pace: "slow",
      actions: [{ do: "show", targets: ["title"], entrance: "fade" }]
    }]
  }]
};
