import type { LessonSpec } from "../../simple-json";

const curveSeries: [number, number][] = [
  [0, 0], [0.25, 0.0625], [0.5, 0.25], [0.75, 0.5625], [1, 1],
  [1.25, 1.5625], [1.5, 2.25], [1.75, 3.0625], [2, 4],
];

/** Calculus taught as a visible refinement: question -> approximation -> limit -> exact evaluation. */
export const calculusLessonSpec: LessonSpec = {
  version: "1",
  title: "The Area Under a Curve",
  theme: "blueprint",
  scenes: [
    {
      id: "curve-question",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "WHAT DOES AREA UNDER A CURVE MEAN?", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "curve", kind: "chart", chart: "function", function: "x*x", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height  f(x)", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "formula", kind: "equation", value: "f(x)=x^2", size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "question", kind: "text", text: "How much space lies between the curve and the x-axis?", textRole: "body", size: "small", placement: { mode: "relative", target: "formula", relation: "below" } },
        { id: "bounds", kind: "text", text: "Only the interval from x = 0 to x = 2 counts.", textRole: "caption", role: "support", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-curve", pace: "slow", actions: [{ do: "show", targets: ["title", "curve", "formula"], entrance: "draw" }] },
        { id: "mark-region", pace: "slow", actions: [{ do: "show", targets: ["question", "bounds"], entrance: "fade" }, { do: "attention", target: "curve", verb: "brackets", text: "area from x = 0 to x = 2", side: "south" }] },
        { id: "hold-question", pace: "normal", actions: [{ do: "emphasize", target: "question", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "four-rectangles",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "REPLACE THE CURVED REGION WITH RECTANGLES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "rectangles", kind: "chart", chart: "riemann", function: "x*x", rectangles: "few", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "width", kind: "equation", value: "\\Delta x=\\frac{2-0}{4}=0.5", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "sum", kind: "equation", value: "A_4=\\sum_{i=0}^{3}f(x_i)\\Delta x", size: "small", placement: { mode: "relative", target: "width", relation: "below" } },
        { id: "count", kind: "stat", value: 4, label: "rectangles", decimals: 0, size: "tiny", placement: { mode: "relative", target: "sum", relation: "below" } },
        { id: "estimate", kind: "stat", value: 1.75, label: "lower estimate", decimals: 2, size: "tiny", placement: { mode: "relative", target: "count", relation: "below" } },
        { id: "rectangle-rule", kind: "text", text: "width × left-edge height, then add", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "build-rectangles", pace: "slow", actions: [{ do: "show", targets: ["title", "rectangles", "width"], entrance: "draw" }] },
        { id: "add-areas", pace: "slow", actions: [{ do: "show", targets: ["sum", "count", "rectangle-rule"], entrance: "fade" }] },
        { id: "see-error", pace: "slow", actions: [{ do: "show", targets: ["estimate"], entrance: "fade" }, { do: "attention", target: "rectangles.peak", verb: "callout", title: "The curve is missed", text: "wide rectangles leave visible gaps", side: "north", route: "elbow", style: "pill" }] },
        { id: "hold-first-estimate", pace: "normal", actions: [{ do: "emphasize", target: "estimate", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "thinner-slices",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "THINNER RECTANGLES REDUCE THE ERROR", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "rectangles", kind: "chart", chart: "riemann", function: "x*x", rectangles: "dense", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "count", kind: "stat", from: 4, value: 32, label: "rectangles", decimals: 0, size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "width", kind: "equation", value: "\\Delta x=\\frac{2}{32}=0.0625", size: "small", placement: { mode: "relative", target: "count", relation: "below" } },
        { id: "estimate", kind: "stat", from: 1.75, value: 2.543, label: "lower estimate", decimals: 3, size: "small", placement: { mode: "relative", target: "width", relation: "below" } },
        { id: "limit", kind: "equation", value: "n\\to\\infty\\Rightarrow\\Delta x\\to0\\Rightarrow error\\to0", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "refine", pace: "slow", actions: [{ do: "show", targets: ["title", "rectangles", "count"], entrance: "draw" }] },
        { id: "shrink-width", pace: "slow", actions: [{ do: "show", targets: ["width", "estimate"], entrance: "fade" }, { do: "attention", target: "rectangles.bar24", verb: "callout", text: "smaller gaps", side: "north", style: "tag" }] },
        { id: "state-pattern", pace: "slow", actions: [{ do: "show", targets: ["limit"], entrance: "word-by-word" }] },
        { id: "hold-convergence", pace: "normal", actions: [{ do: "emphasize", target: "limit", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "integral-limit",
      composition: "split",
      objects: [
        { id: "title", kind: "text", text: "THE INTEGRAL IS THE LIMIT OF THE SUM", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "fine", kind: "chart", chart: "riemann", function: "x*x", rectangles: "dense", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "definition", kind: "equation", value: "\\lim_{n\\to\\infty}\\sum_{i=0}^{n-1} f(x_i)\\Delta x", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "integral", kind: "equation", value: "=\\int_0^2 x^2dx", size: "medium", placement: { mode: "relative", target: "definition", relation: "below" } },
        { id: "answer", kind: "stat", value: 2.667, label: "exact area = 8 / 3", decimals: 3, size: "small", placement: { mode: "relative", target: "integral", relation: "below" } },
        { id: "definition-caption", kind: "text", text: "As width approaches zero, the rectangle sum becomes exact.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-limit-sum", pace: "slow", actions: [{ do: "show", targets: ["title", "fine", "definition"], entrance: "draw" }] },
        { id: "name-integral", pace: "slow", actions: [{ do: "show", targets: ["integral", "definition-caption"], entrance: "fade" }, { do: "attention", target: "integral", verb: "callout", text: "one symbol for the limiting sum", side: "south", route: "elbow", style: "tag" }] },
        { id: "land-exact-area", pace: "slow", actions: [{ do: "show", targets: ["answer"], entrance: "fade" }, { do: "attention", target: "answer", verb: "encircle" }] },
        { id: "hold-integral", pace: "normal", actions: [{ do: "emphasize", target: "answer", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "fundamental-theorem",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "ANTIDERIVATIVES COMPUTE THE AREA", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "area", kind: "chart", chart: "area", series: curveSeries, xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "x²", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "relationship", kind: "equation", value: "F'(x)=f(x)", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "anti", kind: "equation", value: "f(x)=x^2\\Rightarrow F(x)=\\frac{x^3}{3}", size: "small", placement: { mode: "relative", target: "relationship", relation: "below" } },
        { id: "theorem", kind: "equation", value: "\\int_a^b f(x)dx=F(b)-F(a)", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "result", kind: "equation", value: "F(2)-F(0)=\\frac{8}{3}-0=\\frac{8}{3}", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "connect-functions", pace: "slow", actions: [{ do: "show", targets: ["title", "area", "relationship", "anti"], entrance: "fade" }] },
        { id: "state-theorem", pace: "slow", actions: [{ do: "show", targets: ["theorem"], entrance: "wipe" }, { do: "attention", target: "relationship", verb: "callout", title: "Reverse differentiation", text: "find F whose derivative is f", side: "south", style: "pill" }] },
        { id: "evaluate-endpoints", pace: "slow", actions: [{ do: "show", targets: ["result"], entrance: "wipe" }, { do: "attention", target: "result", verb: "encircle" }] },
        { id: "hold-theorem", pace: "normal", actions: [{ do: "emphasize", target: "result", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "calculus-recap",
      composition: "equation-plot",
      objects: [
        { id: "title", kind: "text", text: "FROM APPROXIMATION TO EXACT AREA", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "area", kind: "chart", chart: "area", series: curveSeries, xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "x²", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "equation", kind: "equation", value: "\\int_0^2 x^2dx=\\frac{8}{3}", size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "summary", kind: "text", text: "rectangles approximate → thinner rectangles reduce error → the limit is the integral", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-exact-region", pace: "slow", actions: [{ do: "show", targets: ["title", "area"], entrance: "draw" }] },
        { id: "show-exact-value", pace: "slow", actions: [{ do: "show", targets: ["equation", "summary"], entrance: "fade" }, { do: "attention", target: "area", verb: "callout", text: "the shaded region has one exact value", side: "east", style: "tag" }] },
        { id: "hold-payoff", pace: "dramatic", actions: [{ do: "emphasize", target: "equation", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
  ],
};
