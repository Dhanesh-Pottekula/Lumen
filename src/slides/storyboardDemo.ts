/**
 * Storyboard demo (Step 19). A lesson defined entirely as DATA (no imperative scene code) and compiled
 * to a seekable film by the storyboard interpreter — the shape an LLM would emit.
 */
import { type Storyboard, storyboardFilm } from "../render/storyboard";

const STORY: Storyboard = {
  filmGrade: true,
  transition: "zoom-through",
  scenes: [
    {
      duration: 10,
      bg: ["#16283a", "#0e1820"],
      captions: [
        { at: 0, text: "this entire scene is described as data — beats with a kind, a time, and parameters." },
        { at: 5, text: "the interpreter renders each beat through the primitive library." },
      ],
      beats: [
        { kind: "text", at: 0.4, x: 460, y: 70, text: "lessons, as data", size: 26, mode: "word" },
        { kind: "particles", at: 0.5, x: 200, y: 300, preset: "energy", seed: 3 },
        { kind: "icon", at: 1.5, dur: 0.8, x: 200, y: 210, name: "bolt", size: 60, color: "#ffd24a", filled: true },
        { kind: "callout", at: 3, dur: 3, x: 200, y: 210, title: "a beat", text: "kind: icon, at: 1.5", side: "e", route: "elbow", container: "rect" },
        { kind: "bars", at: 5.5, x: 520, y: 130, w: 300, h: 150, ymax: 100, color: "#e8a13c", data: [
          { label: "A", value: 30 }, { label: "B", value: 55 }, { label: "C", value: 80 }, { label: "D", value: 95 },
        ] },
        { kind: "text", at: 5.5, dur: 0.8, x: 670, y: 110, text: "kind: bars", size: 13, color: "#93a4b0" },
      ],
    },
    {
      duration: 10,
      bg: ["#16222c", "#0e1620"],
      captions: [
        { at: 0, text: "swap the data, get a different lesson — no code changes." },
        { at: 5, text: "this is the base for generated lessons: emit JSON, get a film." },
      ],
      beats: [
        { kind: "math", at: 0.6, dur: 3, x: 460, y: 150, tex: "E = \\frac{1}{2} m v^2", size: 46, color: "#eef5ef" },
        { kind: "ring", at: 3.5, x: 460, y: 150, r: 90, converge: true, color: "#5cc8ae" },
        { kind: "counter", at: 4, dur: 2, x: 460, y: 250, from: 0, to: 340, size: 34, color: "#5cc8ae", fmt: { suffix: " kJ" } },
        { kind: "text", at: 6.5, x: 460, y: 320, text: "generated lesson → seekable film", size: 20, mode: "slam", color: "#e8c14a" },
        { kind: "particles", at: 7, x: 460, y: 120, preset: "confetti", seed: 9 },
      ],
    },
  ],
};

export const storyboardDemoSlide = storyboardFilm(STORY);
