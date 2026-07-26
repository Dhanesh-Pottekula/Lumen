import { drawSlideFrame, renderLessonSpec, TEXTBOOK } from "@aira/lumen";
import { lesson } from "./lesson";

const canvas = document.querySelector<HTMLCanvasElement>("#lesson")!;
const diagnostics = document.querySelector<HTMLElement>("#diagnostics")!;
const result = renderLessonSpec(lesson);

if (!result.valid) {
  diagnostics.textContent = JSON.stringify(result.errors, null, 2);
  throw new Error("Lesson validation failed");
}

canvas.width = result.slide.viewW;
canvas.height = result.slide.viewH;
const context = canvas.getContext("2d")!;
const started = performance.now();

function render(now: number) {
  const seconds = Math.min(result.slide.duration, (now - started) / 1000);
  drawSlideFrame(context, result.slide, seconds, TEXTBOOK);
  if (seconds < result.slide.duration) requestAnimationFrame(render);
}

requestAnimationFrame(render);
