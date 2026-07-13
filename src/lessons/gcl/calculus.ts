/**
 * calculus — "The Area Under a Curve: calculus from rectangles to ∫", re-authored in the generic
 * component layer (GCL).
 *
 * Faithful re-telling of src/lessons/calculusArea.ts's pedagogical arc (NOT pixel-identical — the
 * original is bespoke hand-drawn art) using the flat-stream authoring schema: the harvested `riemann`
 * chart mode for the rectangle approximation, `function`/`area` chart modes for the smooth curve and
 * filled region, the `∫` definition and FTC as `equation`s, and converging `stat` counters as n grows.
 * BLUEPRINT theme (technical grid), matching the original.
 *
 * Every scene fills the full 920×430 frame — curve/rectangles on one side, worked notation and
 * converging counters on the other, callouts/brackets kept on-screen. Scene 4 ("the limit") in
 * particular carries the full n→∞ story: the finite riemann lattice, the limit definition, the melt
 * into a smooth filled area, and the counter landing on 8/3 — so the frame is never empty.
 *
 * Pure data — `renderFilm` compiles this to a seekable CanvasSlideDefinition. No clocks/Math.random.
 */
import { renderFilm } from "../../gcl";
import type { Film } from "../../gcl";
import type { CanvasSlideDefinition } from "../../slides/types";

const EXACT = 8 / 3; // ∫₀² x² dx ≈ 2.667

export const calculusFilm: Film = [
  // ── Scene 1 — The problem: a curve, an unknown area ─────────────────────────────────────────────
  {
    type: "scene",
    theme: "BLUEPRINT",
    bg: ["#0a1e3d", "#061426"],
    duration: 13,
    narration: [
      "Here is a curve: f of x equals x squared.",
      "How much area sits underneath it, between x = 0 and x = 2?",
      "For a rectangle or a triangle there's a formula. For a curve — not yet.",
    ],
  },
  { type: "heading", id: "title1", text: "THE AREA UNDER A CURVE", size: 28, cue: 0, at: [460, 34], enter: { type: "wipe", dir: "right" } },
  { type: "equation", id: "fx", tex: "f(x) = x^2", size: 24, cue: 0, at: [790, 80] },
  {
    type: "chart", id: "curve1", chart: "function", cue: 1, at: [370, 250], w: 480, h: 300,
    fn: "x*x", xDomain: [0, 2], yDomain: [0, 4.2], xLabel: "x", yLabel: "f(x)", color: "#7fd0ff",
  },
  {
    type: "chart", id: "area1", chart: "area", cue: 1, at: [370, 250], w: 480, h: 300, axes: false,
    series: [[0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1], [1.25, 1.5625], [1.5, 2.25], [1.75, 3.0625], [2, 4]],
    xDomain: [0, 2], yDomain: [0, 4.2], color: "#7fd0ff",
  },
  { type: "text", id: "areaQ", text: "A = ?", role: "title", size: 26, mode: "fade", cue: 1, at: [340, 300] },
  { type: "text", id: "bounds1", text: "between x = 0 and x = 2", role: "caption", mode: "fade", cue: 1, at: [370, 400] },
  {
    type: "stat", id: "unknownStat", value: 0, label: "no formula for this — yet", decimals: 0, cue: 2, at: [790, 200], color: "#7f9fce",
  },
  {
    type: "attention", verb: "callout", target: "curve1", title: "No simple formula", text: "…yet.",
    side: "e", route: "elbow", cue: 2, color: "#7fd0ff",
  },

  // ── Scene 2 — Approximate with rectangles (riemann n=4 build) ──────────────────────────────────
  {
    type: "scene",
    theme: "BLUEPRINT",
    duration: 14,
    narration: [
      "Here's the trick: cover the region with rectangles we CAN measure.",
      "Four of them, each of width delta-x, rising one at a time.",
      "Some overshoot the curve, some fall short — but add them up and we get an estimate.",
    ],
  },
  { type: "heading", id: "title2", text: "Approximate with rectangles", size: 22, cue: 0, at: [460, 34] },
  {
    type: "chart", id: "riemann4", chart: "riemann", cue: 0, at: [340, 250], w: 460, h: 300,
    fn: "x*x", xDomain: [0, 2], n: 4, yDomain: [0, 4.2], xLabel: "x", yLabel: "f(x)", color: "#7fd0ff",
  },
  { type: "text", id: "dxLabel", text: "Δx  (width of each strip)", role: "caption", mode: "fade", cue: 1, at: [340, 400] },
  {
    type: "equation", id: "sumApprox4", tex: "\\sum_{i=1}^{4} f(x_i)\\,\\Delta x", size: 22, cue: 1, at: [770, 110],
  },
  {
    type: "stat", id: "n4stat", value: 4, label: "n (rectangles)", decimals: 0, cue: 1, at: [770, 175], color: "#7fd0ff",
  },
  {
    type: "stat", id: "areaN4", value: 2.75, label: "area ≈", decimals: 3, cue: 2, at: [770, 250],
  },
  { type: "text", id: "exact4", text: "exact = 2.667", role: "caption", mode: "fade", cue: 2, at: [770, 300] },
  {
    type: "attention", verb: "brackets", target: "riemann4.peak", text: "over- and under-shoot", side: "n", cue: 2, color: "#7f9fce",
  },

  // ── Scene 3 — More, thinner rectangles: n = 4 → 8 → 16 → 32 ─────────────────────────────────────
  {
    type: "scene",
    theme: "BLUEPRINT",
    duration: 15,
    narration: [
      "Now make the rectangles thinner. Four becomes eight, sixteen, thirty-two.",
      "Watch the error slivers between the bars and the curve shrink away.",
      "The estimate is converging on a single number. So — as n goes to infinity?",
    ],
  },
  { type: "heading", id: "title3", text: "More rectangles, thinner slices", size: 22, cue: 0, at: [460, 34] },
  // Only one riemann chart (the current n) is ever on screen at a time: each finer chart's cue/start
  // lines up with the exit of the previous one (fade out/in over 0.4s), stepping n=8→16→32 in sequence
  // rather than stacking three overlapping charts + tripled axes at the same [340,250] box (backlog D1).
  { type: "chart", id: "riemann8", chart: "riemann", cue: 0, at: [340, 250], w: 460, h: 300, fn: "x*x", xDomain: [0, 2], n: 8, yDomain: [0, 4.2], xLabel: "x", yLabel: "f(x)", color: "#7fd0ff", exit: { type: "fade", out: 3.846, dur: 0.4 } },
  { type: "chart", id: "riemann16", chart: "riemann", cue: 1, at: [340, 250], w: 460, h: 300, fn: "x*x", xDomain: [0, 2], n: 16, yDomain: [0, 4.2], color: "#7fd0ff", exit: { type: "fade", out: 8.462, dur: 0.4 } },
  { type: "chart", id: "riemann32", chart: "riemann", start: 8.462, at: [340, 250], w: 460, h: 300, fn: "x*x", xDomain: [0, 2], n: 32, yDomain: [0, 4.2], color: "#7fd0ff" },
  { type: "stat", id: "nCounter", value: 32, label: "n (rectangles)", decimals: 0, cue: 1, at: [770, 110], color: "#7fd0ff" },
  { type: "stat", id: "areaCounter", value: 2.667, label: "area ≈", decimals: 4, cue: 1, at: [770, 190] },
  { type: "text", id: "exact3", text: "exact = 2.6667", role: "caption", mode: "fade", cue: 1, at: [770, 250] },
  { type: "text", id: "sliverNote", text: "error slivers shrinking to nothing", role: "caption", mode: "fade", cue: 1, at: [770, 300] },
  {
    type: "equation", id: "limitQ", tex: "n \\to \\infty \\; ?", size: 26, cue: 2, at: [770, 370],
    predict: { revealCue: 2, poseAt: 0 },
  },
  { type: "text", id: "slivers", text: "the slivers vanish", role: "caption", mode: "fade", cue: 2, at: [340, 400] },

  // ── Scene 4 — The limit: n → ∞, the ∫ definition (FULL FRAME — the anchor scene) ────────────────
  {
    type: "scene",
    theme: "BLUEPRINT",
    duration: 16,
    narration: [
      "In the limit, the sum of infinitely many, infinitely thin slices IS the area.",
      "We write that limit with a new symbol: the integral sign.",
      "The rectangles melt into one smooth region, and the sum lands on eight over three.",
    ],
  },
  { type: "heading", id: "title4", text: "The limit", size: 24, cue: 0, at: [460, 34] },
  // left: a very fine riemann lattice (n=64) standing in for "infinitely many, infinitely thin" slices
  {
    type: "chart", id: "riemannFine", chart: "riemann", cue: 0, at: [330, 200], w: 440, h: 232,
    fn: "x*x", xDomain: [0, 2], n: 64, yDomain: [0, 4.2], xLabel: "x", yLabel: "f(x)", color: "#7fd0ff",
  },
  { type: "text", id: "fineLbl", text: "n = 64 — vanishingly thin strips", role: "caption", mode: "fade", cue: 0, at: [330, 358] },
  // the smooth filled area dissolves in on top, replacing the lattice visually as "the limit"
  // (axes:false — riemannFine already draws the axis; a second set here would double the tick labels)
  {
    type: "chart", id: "curve4smooth", chart: "area", cue: 1, at: [330, 200], w: 440, h: 232, axes: false,
    series: [[0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1], [1.25, 1.5625], [1.5, 2.25], [1.75, 3.0625], [2, 4]],
    xDomain: [0, 2], yDomain: [0, 4.2], color: "#7fd0ff", enter: { type: "dissolve", dur: 1.4, seed: 7 },
  },
  { type: "text", id: "smoothLbl", text: "the smooth region — the actual area", role: "caption", mode: "fade", cue: 1, at: [330, 382] },
  // right: the limit definition, building line by line, ending in the ∫ notation
  {
    type: "equation", id: "sumDef", tex: "\\lim_{n\\to\\infty} \\sum_{i=1}^{n} f(x_i)\\,\\Delta x", size: 20, cue: 0, at: [770, 110],
  },
  { type: "text", id: "eqArrow", text: "=", role: "body", size: 22, mode: "fade", cue: 1, at: [770, 150] },
  {
    type: "equation", id: "intDef", tex: "\\int_0^2 x^2\\,dx", size: 30, align: "center", cue: 1, at: [770, 200],
    enter: { type: "word" },
  },
  { type: "attention", verb: "spark", target: "intDef", cue: 1 },
  { type: "text", id: "newSymbol", text: "∫ — \"the integral of\"", role: "caption", mode: "fade", cue: 1, at: [770, 240] },
  // the counter lands on the exact value — the payoff of "the limit"
  { type: "stat", id: "finalArea", value: 2.667, label: "= 8 / 3", decimals: 4, cue: 2, at: [770, 320], color: "#7fd0ff" },
  { type: "text", id: "landedLbl", text: "the limit exists — and equals this", role: "caption", mode: "fade", cue: 2, at: [770, 370] },
  { type: "attention", verb: "encircle", target: "finalArea", cue: 2, color: "#7fd0ff" },
  { type: "camera", to: [330, 200], zoom: 1.08, kind: "pushIn", cue: 1 },

  // ── Scene 5 — The fundamental theorem ────────────────────────────────────────────────────────────
  {
    type: "scene",
    theme: "BLUEPRINT",
    duration: 14,
    narration: [
      "There's an even faster way — the Fundamental Theorem of Calculus.",
      "Find an antiderivative, evaluate it at the endpoints, and subtract.",
      "No rectangles required: x cubed over three, from 0 to 2, gives eight-thirds instantly.",
    ],
  },
  { type: "heading", id: "title5", text: "The Fundamental Theorem", size: 22, cue: 0, at: [460, 34] },
  {
    type: "chart", id: "curve5", chart: "area", cue: 0, at: [330, 250], w: 440, h: 280,
    series: [[0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1], [1.25, 1.5625], [1.5, 2.25], [1.75, 3.0625], [2, 4]],
    xDomain: [0, 2], yDomain: [0, 4.2], color: "#7fd0ff", xLabel: "x", yLabel: "f(x)",
  },
  { type: "text", id: "curve5Lbl", text: "f(x) = x²  on [0, 2]", role: "caption", mode: "fade", cue: 0, at: [330, 400] },
  { type: "equation", id: "ftc", tex: "\\int_a^b f(x)\\,dx = F(b) - F(a)", size: 22, align: "center", cue: 1, at: [770, 110] },
  { type: "equation", id: "ftcApplied", tex: "F(x) = \\frac{x^3}{3}", size: 22, cue: 2, at: [770, 180] },
  {
    type: "equation", id: "ftcEval", tex: "F(2) - F(0) = \\frac{8}{3} - 0", size: 20, cue: 2, at: [770, 240],
  },
  { type: "stat", id: "ftcResult", value: 2.667, label: "= 8/3 exactly", decimals: 3, cue: 2, at: [770, 320], color: "#7fd0ff" },
  { type: "attention", verb: "encircle", target: "ftcApplied", cue: 2, color: "#7fd0ff" },

  // ── Scene 6 — Recap ──────────────────────────────────────────────────────────────────────────────
  {
    type: "scene",
    theme: "BLUEPRINT",
    duration: 13,
    narration: [
      "From four rectangles to infinitely many — that's the leap from arithmetic to calculus.",
      "The integral sign is just a very patient sum.",
      "Rectangles, refined without end, become area — exactly.",
    ],
  },
  { type: "text", id: "recapHead", text: "Rectangles, refined without end, become area", role: "title", size: 22, mode: "word", cue: 0, at: [460, 60] },
  {
    type: "chart", id: "recapCurve", chart: "area", cue: 0, at: [460, 260], w: 560, h: 300,
    series: [[0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1], [1.25, 1.5625], [1.5, 2.25], [1.75, 3.0625], [2, 4]],
    xDomain: [0, 2], yDomain: [0, 4.2], color: "#7fd0ff", xLabel: "x", yLabel: "f(x)",
  },
  { type: "equation", id: "recapEq", tex: "\\int_0^2 x^2\\,dx = \\frac{8}{3}", size: 30, align: "center", cue: 1, at: [460, 130] },
  { type: "glow", id: "recapGlow", r: 90, color: "#7fd0ff", at: [460, 260], cue: 1 },
  { type: "stat", id: "recapStat", value: 2.667, label: "area under the curve", decimals: 3, cue: 2, at: [130, 260], color: "#7fd0ff" },
  { type: "text", id: "recapFoot", text: "four rectangles → infinitely many → one exact number", role: "caption", mode: "fade", cue: 2, at: [460, 400] },
];

/** Compiled, seekable CanvasSlideDefinition — this is what App.tsx renders. */
export const calculusLessonGCL: CanvasSlideDefinition = renderFilm(calculusFilm);
