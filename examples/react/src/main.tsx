import React from "react";
import { createRoot } from "react-dom/client";
import { renderLessonSpec, type LessonSpec } from "@aira/lumen";
import { CanvasSlide } from "@aira/lumen-react";
import "@aira/lumen-react/style.css";

const lesson: LessonSpec = {
  version: "1",
  title: "React example",
  theme: "textbook",
  scenes: [{
    id: "hello",
    composition: "hero",
    objects: [{
      id: "title",
      kind: "text",
      text: "LUMEN IN REACT",
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

const result = renderLessonSpec(lesson);
createRoot(document.querySelector("#root")!).render(
  result.valid
    ? <CanvasSlide slide={result.slide} title={lesson.title} tag="React example" />
    : <pre>{JSON.stringify(result.errors, null, 2)}</pre>
);
