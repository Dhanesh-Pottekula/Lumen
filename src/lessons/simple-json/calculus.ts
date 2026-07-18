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
        { id: "curve", kind: "chart", chart: "area", series: curveSeries, xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height  f(x)", size: "medium", placement: { mode: "zone", zone: "main-left" } },
        { id: "formula", kind: "equation", value: "f(x)=x^2", size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "question", kind: "text", text: "How much space lies between the curve and the x-axis?", textRole: "body", size: "tiny", placement: { mode: "relative", target: "formula", relation: "below" } },
        { id: "bounds", kind: "text", text: "Only the interval from x = 0 to x = 2 counts.", textRole: "caption", role: "support", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-curve", pace: "slow", actions: [{ do: "show", targets: ["title", "curve", "formula"], entrance: "draw" }] },
        { id: "locate-bounds", pace: "slow", actions: [{ do: "tour", labelMode: "one-at-a-time", returnTo: "overview", stops: [
          { target: "curve.first", label: "start of the measured interval: x = 0", shot: "wide" },
          { target: "curve.last", label: "end of the measured interval: x = 2", shot: "wide" },
        ] }] },
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
        { id: "estimate", kind: "stat", value: 1.75, label: "lower estimate", decimals: 2, size: "tiny", placement: { mode: "relative", target: "count", relation: "left-of" } },
        { id: "rectangle-rule", kind: "text", text: "width × left-edge height, then add", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "build-rectangles", pace: "slow", actions: [{ do: "show", targets: ["title", "rectangles", "width"], entrance: "draw" }] },
        { id: "add-areas", pace: "slow", actions: [{ do: "show", targets: ["sum", "count", "rectangle-rule"], entrance: "fade" }, { do: "attention", target: "rectangles.bar0", verb: "callout", text: "first interval has height 0", side: "north", style: "tag" }] },
        { id: "see-error", pace: "slow", actions: [{ do: "show", targets: ["estimate"], entrance: "fade" }, { do: "attention", target: "rectangles.peak", verb: "callout", title: "The curve is missed", text: "wide rectangles leave visible gaps", side: "north", route: "elbow", style: "pill" }] },
        { id: "hold-first-estimate", pace: "normal", actions: [{ do: "emphasize", target: "estimate", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "thinner-slices",
      composition: "comparison",
      objects: [
        { id: "title", kind: "text", text: "SEE THE GAPS SHRINK", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "wide", kind: "chart", chart: "riemann", function: "x*x", rectangles: "few", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "small", placement: { mode: "zone", zone: "main-left" } },
        { id: "thin", kind: "chart", chart: "riemann", function: "x*x", rectangles: "dense", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "wide-label", kind: "text", text: "4 wide rectangles", textRole: "caption", size: "small", placement: { mode: "relative", target: "wide", relation: "above" } },
        { id: "thin-label", kind: "text", text: "32 thin rectangles", textRole: "caption", size: "small", placement: { mode: "relative", target: "thin", relation: "above" } },
        { id: "wide-estimate", kind: "stat", value: 1.75, label: "visible underestimate", decimals: 2, size: "tiny", placement: { mode: "relative", target: "wide", relation: "below" } },
        { id: "thin-estimate", kind: "stat", value: 2.543, label: "closer to the curve", decimals: 3, size: "tiny", placement: { mode: "relative", target: "thin", relation: "below" } },
        { id: "limit", kind: "equation", value: "\\text{more rectangles}\\Rightarrow\\text{smaller width}\\Rightarrow\\text{smaller error}", size: "tiny", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-wide-error", pace: "slow", actions: [{ do: "show", targets: ["title", "wide", "wide-label", "wide-estimate"], entrance: "draw" }, { do: "attention", target: "wide.peak", verb: "callout", text: "large uncovered gaps", side: "north", style: "tag" }] },
        { id: "show-thin-error", pace: "slow", actions: [{ do: "show", targets: ["thin", "thin-label", "thin-estimate"], entrance: "draw" }, { do: "attention", target: "thin.bar24", verb: "callout", text: "gaps become much smaller", side: "north", style: "tag" }] },
        { id: "state-pattern", pace: "slow", actions: [{ do: "show", targets: ["limit"], entrance: "word-by-word" }] },
        { id: "hold-convergence", pace: "normal", actions: [{ do: "emphasize", target: "limit", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "integral-limit",
      composition: "split",
      objects: [
        { id: "title", kind: "text", text: "THE INTEGRAL IS THE LIMIT OF THE SUM", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "fine", kind: "chart", chart: "riemann", function: "x*x", rectangles: "dense", xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "medium", temporary: true, placement: { mode: "zone", zone: "main-left" } },
        { id: "exact-region", kind: "chart", chart: "area", series: curveSeries, xDomain: [0, 2], yDomain: [0, 4.2], axes: true, xLabel: "x", yLabel: "height", size: "medium", placement: { mode: "anchor", target: "fine.center" } },
        { id: "definition", kind: "equation", value: "\\lim_{n\\to\\infty}\\sum_{i=0}^{n-1} f(x_i)\\Delta x", size: "tiny", placement: { mode: "zone", zone: "main-right" } },
        { id: "integral", kind: "equation", value: "=\\int_0^2 x^2dx", size: "medium", placement: { mode: "relative", target: "definition", relation: "below" } },
        { id: "answer", kind: "stat", value: 2.667, label: "exact area = 8 / 3", decimals: 3, size: "small", placement: { mode: "relative", target: "integral", relation: "below" } },
        { id: "definition-caption", kind: "text", text: "As width approaches zero, the rectangle sum becomes exact.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-limit-sum", pace: "slow", actions: [{ do: "show", targets: ["title", "fine", "definition"], entrance: "draw" }] },
        { id: "name-integral", pace: "slow", actions: [{ do: "hide", targets: ["fine"], exit: "erase" }, { do: "show", targets: ["exact-region"], entrance: "draw" }, { do: "show", targets: ["integral", "definition-caption"], entrance: "fade" }] },
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
        { id: "anti", kind: "equation", value: "f(x)=x^2\\Rightarrow F(x)=\\frac{x^3}{3}", size: "tiny", placement: { mode: "relative", target: "relationship", relation: "below" } },
        { id: "theorem", kind: "equation", value: "\\int_a^b f(x)dx=F(b)-F(a)", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "result", kind: "equation", value: "F(2)-F(0)=\\frac{8}{3}-0=\\frac{8}{3}", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "connect-functions", pace: "slow", actions: [{ do: "show", targets: ["title", "area", "relationship", "anti"], entrance: "fade" }] },
        { id: "mark-start", pace: "slow", actions: [{ do: "attention", target: "area.first", verb: "callout", title: "start", text: "a = 0 gives F(0)", side: "north", style: "tag" }] },
        { id: "state-theorem", pace: "slow", actions: [{ do: "show", targets: ["theorem"], entrance: "wipe" }, { do: "attention", target: "area.last", verb: "callout", title: "finish", text: "b = 2 gives F(2)", side: "north", style: "tag" }] },
        { id: "evaluate-endpoints", pace: "slow", actions: [{ do: "show", targets: ["result"], entrance: "wipe" }, { do: "attention", target: "result", verb: "encircle" }] },
        { id: "hold-theorem", pace: "normal", actions: [{ do: "emphasize", target: "result", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "calculus-recap",
      composition: "custom-relational",
      objects: [
        { id: "title", kind: "text", text: "FROM APPROXIMATION TO EXACT AREA", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "stages",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 230">
            <g id="coarse" stroke="#77bde8" stroke-width="3" fill="#77bde8" fill-opacity="0.22">
              <line x1="30" y1="190" x2="210" y2="190" /><line x1="30" y1="190" x2="30" y2="45" />
              <rect x="30" y="178" width="45" height="12" /><rect x="75" y="148" width="45" height="42" /><rect x="120" y="100" width="45" height="90" /><rect x="165" y="35" width="45" height="155" />
              <path d="M30 190 C75 184 120 153 165 96 C184 71 198 48 210 25" fill="none" stroke="#9ed8ff" stroke-width="5" />
            </g>
            <g id="refine-arrow" fill="#9ed8ff"><path d="M230 105 H275 V91 L300 115 L275 139 V125 H230 Z" /></g>
            <g id="fine" stroke="#77bde8" stroke-width="2" fill="#77bde8" fill-opacity="0.24">
              <line x1="310" y1="190" x2="490" y2="190" /><line x1="310" y1="190" x2="310" y2="45" />
              <rect x="310" y="187" width="18" height="3" /><rect x="328" y="181" width="18" height="9" /><rect x="346" y="171" width="18" height="19" /><rect x="364" y="157" width="18" height="33" /><rect x="382" y="139" width="18" height="51" /><rect x="400" y="117" width="18" height="73" /><rect x="418" y="91" width="18" height="99" /><rect x="436" y="61" width="18" height="129" /><rect x="454" y="27" width="18" height="163" />
              <path d="M310 190 C355 184 400 153 445 96 C464 71 478 48 490 25" fill="none" stroke="#9ed8ff" stroke-width="5" />
            </g>
            <g id="limit-arrow" fill="#9ed8ff"><path d="M510 105 H555 V91 L580 115 L555 139 V125 H510 Z" /></g>
            <g id="exact" stroke="#9ed8ff" stroke-width="4">
              <path d="M590 190 C625 184 660 153 700 25 L700 190 Z" fill="#77bde8" fill-opacity="0.38" />
              <line x1="590" y1="190" x2="704" y2="190" /><line x1="590" y1="190" x2="590" y2="45" />
            </g>
          </svg>`,
        },
        { id: "coarse-label", kind: "text", text: "wide rectangles", textRole: "caption", size: "small", placement: { mode: "relative", target: "stages.coarse", relation: "below" } },
        { id: "fine-label", kind: "text", text: "thin rectangles", textRole: "caption", size: "small", placement: { mode: "relative", target: "stages.fine", relation: "below" } },
        { id: "exact-label", kind: "text", text: "exact region", textRole: "caption", size: "small", placement: { mode: "relative", target: "stages.exact", relation: "below" } },
        { id: "equation", kind: "equation", value: "\\int_0^2 x^2dx=\\frac{8}{3}", size: "medium", placement: { mode: "zone", zone: "support" } },
      ],
      beats: [
        { id: "show-coarse", pace: "slow", actions: [{ do: "show", targets: ["title", "stages.coarse", "coarse-label"], entrance: "draw" }] },
        { id: "show-refinement", pace: "slow", actions: [{ do: "show", targets: ["stages.refine-arrow", "stages.fine", "fine-label"], entrance: "draw" }] },
        { id: "show-limit", pace: "slow", actions: [{ do: "show", targets: ["stages.limit-arrow", "stages.exact", "exact-label"], entrance: "draw" }] },
        { id: "show-exact-value", pace: "slow", actions: [{ do: "show", targets: ["equation"], entrance: "fade" }, { do: "attention", target: "stages.exact", verb: "callout", text: "one shaded region, one exact value", side: "west", style: "tag" }] },
        { id: "hold-payoff", pace: "dramatic", actions: [{ do: "emphasize", target: "equation", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
  ],
};
