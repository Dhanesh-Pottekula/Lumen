import type { LessonSpec } from "../../simple-json";

const curveSeries: [number, number][] = [
  [0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1],
  [1.25, 1.5625], [1.5, 2.25], [1.75, 3.0625], [2, 4],
];

export const calculusLessonSpec: LessonSpec = {
  version: "1",
  title: "The Area Under a Curve",
  theme: "blueprint",
  scenes: [
    {
      id: "curve-question",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "THE AREA UNDER A CURVE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "curve", kind: "chart", chart: "function", function: "x*x", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "f(x)", size: "large", placement: { mode: "zone", zone: "main-left" } },
        { id: "formula", kind: "equation", value: "f(x)=x^2", placement: { mode: "zone", zone: "main-right" } },
        { id: "question", kind: "text", text: "A = ?", textRole: "title", placement: { mode: "relative", target: "formula", relation: "below" } },
        { id: "bounds", kind: "text", text: "between x = 0 and x = 2", textRole: "caption", role: "support", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "reveal", pace: "dramatic", actions: [{ do: "show", targets: ["title", "curve", "formula", "question", "bounds"], entrance: "wipe" }] },
        { id: "ask", pace: "slow", actions: [{ do: "attention", target: "curve", verb: "callout", title: "No simple formula", text: "…yet.", side: "east", route: "elbow", style: "pill" }] },
      ],
    },
    {
      id: "four-rectangles",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "Approximate with rectangles", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "rectangles", kind: "chart", chart: "riemann", function: "x*x", rectangles: "few", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "f(x)", size: "large", placement: { mode: "zone", zone: "main-left" } },
        { id: "sum", kind: "equation", value: "\\sum_{i=1}^{4} f(x_i)\\,\\Delta x", placement: { mode: "zone", zone: "main-right" } },
        { id: "count", kind: "stat", value: 4, label: "n (rectangles)", decimals: 0, placement: { mode: "relative", target: "sum", relation: "below" } },
        { id: "estimate", kind: "stat", value: 2.75, label: "area ≈", decimals: 3, placement: { mode: "relative", target: "count", relation: "below" } },
      ],
      beats: [
        { id: "build", pace: "dramatic", actions: [{ do: "show", targets: ["title", "rectangles", "sum", "count", "estimate"], entrance: "draw" }] },
        { id: "compare", pace: "slow", actions: [{ do: "attention", target: "rectangles.peak", verb: "brackets", text: "over- and under-shoot", side: "north" }] },
      ],
    },
    {
      id: "thinner-slices",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "More rectangles, thinner slices", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "rectangles", kind: "chart", chart: "riemann", function: "x*x", rectangles: "dense", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, size: "large", placement: { mode: "zone", zone: "main-left" } },
        { id: "count", kind: "stat", from: 4, value: 32, label: "n (rectangles)", decimals: 0, placement: { mode: "zone", zone: "main-right" } },
        { id: "estimate", kind: "stat", from: 2.75, value: 2.667, label: "area ≈", decimals: 4, placement: { mode: "relative", target: "count", relation: "below" } },
        { id: "limit", kind: "equation", value: "n \\to \\infty", placement: { mode: "relative", target: "estimate", relation: "below" } },
      ],
      beats: [
        { id: "refine", pace: "dramatic", actions: [{ do: "show", targets: ["title", "rectangles", "count", "estimate"], entrance: "fade" }] },
        { id: "predict", pace: "slow", actions: [{ do: "show", targets: ["limit"], entrance: "word-by-word" }, { do: "attention", target: "rectangles.last", verb: "spark" }] },
      ],
    },
    {
      id: "integral-limit",
      composition: "split",
      objects: [
        { id: "title", kind: "text", text: "The limit", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "fine", kind: "chart", chart: "riemann", function: "x*x", rectangles: "dense", xDomain: [0, 2], yDomain: [0, 4.2], size: "large", placement: { mode: "zone", zone: "main-left" } },
        { id: "integral", kind: "equation", value: "\\int_0^2 x^2\\,dx", size: "large", placement: { mode: "zone", zone: "main-right" } },
        { id: "definition", kind: "equation", value: "\\lim_{n\\to\\infty}\\sum f(x_i)\\Delta x", placement: { mode: "relative", target: "integral", relation: "above" } },
        { id: "answer", kind: "stat", value: 2.667, label: "= 8 / 3", decimals: 3, placement: { mode: "relative", target: "integral", relation: "below" } },
      ],
      beats: [
        { id: "limit", pace: "dramatic", actions: [{ do: "show", targets: ["title", "fine", "definition"], entrance: "draw" }] },
        { id: "symbol", pace: "slow", actions: [{ do: "show", targets: ["integral"], entrance: "word-by-word" }, { do: "attention", target: "integral", verb: "spark" }] },
        { id: "land", pace: "slow", actions: [{ do: "show", targets: ["answer"], entrance: "slam" }, { do: "attention", target: "answer", verb: "encircle" }, { do: "camera", target: "fine", shot: "wide", movement: "push" }] },
      ],
    },
    {
      id: "fundamental-theorem",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "The Fundamental Theorem", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "area", kind: "chart", chart: "area", series: curveSeries, xDomain: [0, 2], yDomain: [0, 4.2], axes: true, size: "large", placement: { mode: "zone", zone: "main-left" } },
        { id: "theorem", kind: "equation", value: "\\int_a^b f(x)\\,dx=F(b)-F(a)", placement: { mode: "zone", zone: "main-right" } },
        { id: "anti", kind: "equation", value: "F(x)=\\frac{x^3}{3}", placement: { mode: "relative", target: "theorem", relation: "below" } },
        { id: "result", kind: "equation", value: "F(2)-F(0)=\\frac{8}{3}", placement: { mode: "relative", target: "anti", relation: "below" } },
      ],
      beats: [
        { id: "reveal", pace: "dramatic", actions: [{ do: "show", targets: ["title", "area", "theorem"], entrance: "fade" }] },
        { id: "solve", pace: "slow", actions: [{ do: "show", targets: ["anti", "result"], entrance: "wipe" }, { do: "attention", target: "anti", verb: "encircle" }] },
      ],
    },
    {
      id: "calculus-recap",
      composition: "hero",
      objects: [
        { id: "title", kind: "text", text: "Rectangles, refined without end, become area", textRole: "title", size: "large", placement: { mode: "zone", zone: "title" } },
        { id: "area", kind: "chart", chart: "area", series: curveSeries, xDomain: [0, 2], yDomain: [0, 4.2], axes: true, size: "large", placement: { mode: "zone", zone: "main" } },
        { id: "equation", kind: "equation", value: "\\int_0^2 x^2\\,dx=\\frac{8}{3}", size: "large", placement: { mode: "zone", zone: "support" } },
        { id: "summary", kind: "text", text: "four rectangles → infinitely many → one exact number", textRole: "caption", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "recap", pace: "dramatic", actions: [{ do: "show", targets: ["title", "area", "equation", "summary"], entrance: "word-by-word" }] },
        { id: "payoff", pace: "slow", actions: [{ do: "effect", effect: "glow", target: "area", intensity: "normal" }, { do: "emphasize", target: "equation", emphasis: "pulse" }] },
      ],
    },
  ],
};
