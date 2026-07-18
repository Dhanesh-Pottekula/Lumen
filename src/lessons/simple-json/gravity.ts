import type { LessonSpec } from "../../simple-json";

/** Gravity and orbits authored entirely with public Simple JSON and named-group SVG artwork. */
export const gravityLessonSpec: LessonSpec = {
  version: "1",
  title: "Why the Moon Doesn't Fall",
  theme: "chalkboard",
  scenes: [
    {
      id: "falling-apple",
      composition: "hero",
      objects: [
        { id: "apple-title", kind: "text", text: "GRAVITY CHANGES MOTION", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "falling-art",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 220">
            <g id="tree">
              <rect x="238" y="96" width="28" height="92" rx="7" fill="#7d6246" stroke="#d8e4db" stroke-width="3" />
              <line x1="252" y1="120" x2="350" y2="96" stroke="#d8e4db" stroke-width="8" stroke-linecap="round" />
              <circle cx="215" cy="79" r="46" fill="#4d8f61" stroke="#b8d8c0" stroke-width="3" />
              <circle cx="263" cy="70" r="51" fill="#5aa06c" stroke="#b8d8c0" stroke-width="3" />
              <circle cx="307" cy="98" r="41" fill="#4d8f61" stroke="#b8d8c0" stroke-width="3" />
            </g>
            <g id="apple">
              <circle cx="370" cy="101" r="18" fill="#d65a4f" stroke="#f0a39a" stroke-width="3" />
              <line x1="370" y1="84" x2="376" y2="72" stroke="#f0a39a" stroke-width="3" stroke-linecap="round" />
              <path d="M376 75 C389 67 400 73 401 84 C390 85 382 82 376 75 Z" fill="#7fbf83" stroke="#b8d8c0" stroke-width="2" />
            </g>
            <g id="fall-trace" fill="#d65a4f" fill-opacity="0.2" stroke="#f0a39a" stroke-width="2">
              <line x1="370" y1="116" x2="370" y2="173" />
              <circle cx="370" cy="119" r="13" /><circle cx="370" cy="137" r="13" /><circle cx="370" cy="164" r="13" />
            </g>
            <g id="time-ticks" fill="none" stroke="#9bb1a2" stroke-width="3" stroke-linecap="round">
              <line x1="405" y1="99" x2="405" y2="177" />
              <line x1="397" y1="101" x2="413" y2="101" /><line x1="397" y1="119" x2="413" y2="119" />
              <line x1="397" y1="137" x2="413" y2="137" /><line x1="397" y1="164" x2="413" y2="164" />
            </g>
            <g id="gravity-arrow">
              <line x1="370" y1="126" x2="370" y2="169" stroke="#ffe08a" stroke-width="5" stroke-linecap="round" />
              <path d="M370 178 L359 160 L381 160 Z" fill="#ffe08a" />
            </g>
            <g id="ground">
              <path d="M100 192 C240 184 350 199 470 191 C560 185 630 196 690 190" fill="none" stroke="#9bb1a2" stroke-width="4" stroke-linecap="round" />
            </g>
            <g id="ground-target" opacity="0">
              <circle cx="370" cy="171" r="2" fill="#ffffff" />
            </g>
          </svg>`,
        },
        { id: "gravity-statement", kind: "text", text: "Equal time steps produce larger and larger downward distances.", textRole: "caption", placement: { mode: "zone", zone: "support" } },
        { id: "fall-equation", kind: "equation", value: "a=g\\approx9.8\\,m/s^2\\;\\text{downward}", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "establish-apple", pace: "slow", actions: [{ do: "show", targets: ["apple-title", "falling-art.tree", "falling-art.apple", "falling-art.ground", "falling-art.ground-target"], entrance: "fade" }] },
        { id: "show-cause", pace: "slow", actions: [{ do: "show", targets: ["falling-art.gravity-arrow", "gravity-statement"], entrance: "fade" }] },
        { id: "apple-falls", pace: "dramatic", actions: [{ do: "hide", targets: ["falling-art.gravity-arrow"], exit: "fade" }, { do: "show", targets: ["falling-art.fall-trace", "falling-art.time-ticks"], entrance: "draw" }, { do: "motion", target: "falling-art.apple", motion: "fall", to: "falling-art.ground-target", bounce: "soft" }, { do: "attention", target: "falling-art.fall-trace", verb: "callout", text: "equal clock ticks, growing gaps", side: "east", style: "tag" }] },
        { id: "quantify-gravity", pace: "slow", actions: [{ do: "show", targets: ["fall-equation"], entrance: "fade" }] },
        { id: "hold-acceleration", pace: "normal", actions: [{ do: "emphasize", target: "fall-equation", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "newtons-cannon",
      composition: "hero",
      objects: [
        { id: "cannon-title", kind: "text", text: "NEWTON'S CANNONBALL", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "cannon-art",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          temporaryParts: ["shot-slow", "shot-fast"],
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 270">
            <g id="earth">
              <circle cx="420" cy="145" r="90" fill="#4c82b8" stroke="#b9d8f0" stroke-width="4" />
              <path d="M358 116 C376 87 407 87 423 112 C446 103 468 118 470 142 C442 134 423 150 414 170 C389 160 366 145 358 116 Z" fill="#76a66f" stroke="#cfe5c8" stroke-width="3" />
              <path d="M438 184 C457 166 485 173 493 197 C470 211 448 205 438 184 Z" fill="#76a66f" stroke="#cfe5c8" stroke-width="3" />
            </g>
            <g id="mountain">
              <path d="M357 88 L420 30 L484 88 C464 67 446 57 420 55 C393 57 376 68 357 88 Z" fill="#71837a" stroke="#d8e4db" stroke-width="4" stroke-linejoin="round" />
            </g>
            <g id="cannon">
              <path d="M424 43 L446 52 L440 62 L416 53 Z" fill="#71837a" stroke="#d8e4db" stroke-width="3" stroke-linejoin="round" />
              <line x1="430" y1="48" x2="400" y2="36" stroke="#d8e4db" stroke-width="12" stroke-linecap="round" />
              <line x1="430" y1="48" x2="400" y2="36" stroke="#52645c" stroke-width="7" stroke-linecap="round" />
              <circle cx="426" cy="58" r="7" fill="#52645c" stroke="#d8e4db" stroke-width="3" />
            </g>
            <g id="shot-slow">
              <path d="M397 35 C367 29 342 48 348 83" fill="none" stroke="#96aaa7" stroke-width="3" stroke-linecap="round" />
              <circle cx="348" cy="83" r="4" fill="#96aaa7" />
            </g>
            <g id="shot-fast">
              <path d="M397 35 C306 7 271 77 330 145" fill="none" stroke="#d6b36a" stroke-width="3.5" stroke-linecap="round" />
              <circle cx="330" cy="145" r="4.5" fill="#d6b36a" />
            </g>
            <g id="trajectory">
              <circle cx="420" cy="145" r="112" fill="none" stroke="#7fc3c8" stroke-width="4" />
            </g>
            <g id="projectile">
              <circle cx="397" cy="35" r="7" fill="#d65a4f" stroke="#f0a39a" stroke-width="3" />
            </g>
          </svg>`,
        },
        { id: "cannon-caption", kind: "text", text: "more speed  →  farther fall  →  closed orbit", textRole: "caption", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "aim-cannon", pace: "slow", actions: [{ do: "show", targets: ["cannon-title", "cannon-art.earth", "cannon-art.mountain", "cannon-art.cannon"], entrance: "fade" }] },
        { id: "slow-shot", pace: "slow", actions: [{ do: "show", targets: ["cannon-art.shot-slow"], entrance: "draw" }, { do: "attention", target: "cannon-art.shot-slow", verb: "callout", text: "slow: lands nearby", side: "west", route: "curve", style: "tag" }] },
        { id: "fast-shot", pace: "slow", actions: [{ do: "show", targets: ["cannon-art.shot-fast"], entrance: "draw" }, { do: "attention", target: "cannon-art.shot-fast", verb: "callout", text: "faster: lands farther away", side: "west", route: "curve", style: "tag" }] },
        { id: "orbital-shot", pace: "dramatic", actions: [{ do: "hide", targets: ["cannon-art.shot-slow", "cannon-art.shot-fast"], exit: "erase" }, { do: "show", targets: ["cannon-art.trajectory", "cannon-art.projectile", "cannon-caption"], entrance: "draw" }, { do: "motion", target: "cannon-art.projectile", motion: "orbit", around: "cannon-art.earth", orbit: "medium", turns: "one", direction: "counterclockwise" }, { do: "attention", target: "cannon-art.trajectory", verb: "callout", text: "same cannonball — continuous free fall", side: "south", route: "curve", style: "tag" }] },
      ],
    },
    {
      id: "inverse-square-law",
      composition: "equation-plot",
      objects: [
        { id: "inverse-title", kind: "text", text: "DISTANCE CHANGES THE PULL", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "inverse-art",
          kind: "svg-artwork",
          size: "medium",
          placement: { mode: "zone", zone: "main-left" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 240">
            <g id="near-system">
              <circle cx="80" cy="66" r="30" fill="#4c82b8" stroke="#b9d8f0" stroke-width="4" />
              <circle cx="180" cy="66" r="12" fill="#d5d8d6" stroke="#f2f3ef" stroke-width="3" />
              <line x1="80" y1="102" x2="180" y2="102" stroke="#9bb1a2" stroke-width="2" />
              <line x1="80" y1="96" x2="80" y2="108" stroke="#9bb1a2" stroke-width="2" />
              <line x1="180" y1="96" x2="180" y2="108" stroke="#9bb1a2" stroke-width="2" />
            </g>
            <g id="near-force">
              <line x1="164" y1="66" x2="124" y2="66" stroke="#ffe08a" stroke-width="7" stroke-linecap="round" />
              <path d="M112 66 L131 55 L131 77 Z" fill="#ffe08a" />
            </g>
            <g id="far-system">
              <circle cx="80" cy="174" r="30" fill="#4c82b8" stroke="#b9d8f0" stroke-width="4" />
              <circle cx="280" cy="174" r="12" fill="#d5d8d6" stroke="#f2f3ef" stroke-width="3" />
              <line x1="80" y1="210" x2="280" y2="210" stroke="#9bb1a2" stroke-width="2" />
              <line x1="80" y1="204" x2="80" y2="216" stroke="#9bb1a2" stroke-width="2" />
              <line x1="280" y1="204" x2="280" y2="216" stroke="#9bb1a2" stroke-width="2" />
            </g>
            <g id="far-force">
              <line x1="264" y1="174" x2="253" y2="174" stroke="#ffe08a" stroke-width="3" stroke-linecap="round" />
              <path d="M244 174 L257 166 L257 182 Z" fill="#ffe08a" />
            </g>
            <g id="force-ratio" fill="#ffe08a" stroke="#9b7838" stroke-width="1">
              <rect x="212" y="45" width="12" height="12" rx="2" /><rect x="228" y="45" width="12" height="12" rx="2" />
              <rect x="244" y="45" width="12" height="12" rx="2" /><rect x="260" y="45" width="12" height="12" rx="2" />
              <rect x="314" y="168" width="12" height="12" rx="2" />
            </g>
          </svg>`,
        },
        { id: "inverse-chart", kind: "chart", chart: "function", function: "1/(x*x)", xDomain: [1, 4], yDomain: [0, 1.05], axes: true, xLabel: "distance r", yLabel: "relative pull", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "inverse-formula", kind: "equation", value: "F\\propto\\frac{1}{r^2}", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "inverse-caption", kind: "text", text: "twice as far → one quarter the pull", textRole: "caption", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "compare-distance", pace: "slow", actions: [{ do: "show", targets: ["inverse-title", "inverse-art.near-system", "inverse-art.near-force", "inverse-art.far-system", "inverse-art.far-force"], entrance: "fade" }] },
        { id: "plot-distance", pace: "slow", actions: [{ do: "show", targets: ["inverse-chart"], entrance: "draw" }, { do: "attention", target: "inverse-art.near-force", verb: "callout", text: "nearer means a stronger pull", side: "east", style: "tag" }] },
        { id: "state-law", pace: "slow", actions: [{ do: "show", targets: ["inverse-art.force-ratio", "inverse-formula", "inverse-caption"], entrance: "fade" }, { do: "attention", target: "inverse-art.force-ratio", verb: "callout", text: "four force blocks become one", side: "east", style: "tag" }] },
        { id: "hold-inverse-law", pace: "normal", actions: [{ do: "emphasize", target: "inverse-formula", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "keplers-orbits",
      composition: "data",
      objects: [
        { id: "kepler-title", kind: "text", text: "KEPLER'S TWO ORBIT RULES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "kepler-art",
          kind: "svg-artwork",
          size: "medium",
          placement: { mode: "zone", zone: "main-left" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260">
            <g id="outer-orbit"><ellipse cx="230" cy="130" rx="170" ry="90" fill="none" stroke="#8bb5c7" stroke-width="4" /></g>
            <g id="inner-orbit"><ellipse cx="180" cy="130" rx="105" ry="47" fill="none" stroke="#8bb5c7" stroke-opacity="0.58" stroke-width="3" /></g>
            <g id="orbit-centers" fill="none" stroke="#9bb1a2" stroke-width="2" stroke-linecap="round">
              <line x1="222" y1="130" x2="238" y2="130" /><line x1="230" y1="122" x2="230" y2="138" />
              <line x1="173" y1="130" x2="187" y2="130" /><line x1="180" y1="123" x2="180" y2="137" />
            </g>
            <g id="sun"><circle cx="86" cy="130" r="24" fill="#f0c66b" stroke="#ffe6a8" stroke-width="4" /><line x1="86" y1="91" x2="86" y2="73" stroke="#ffe6a8" stroke-width="3" /><line x1="86" y1="169" x2="86" y2="187" stroke="#ffe6a8" stroke-width="3" /><line x1="47" y1="130" x2="29" y2="130" stroke="#ffe6a8" stroke-width="3" /><line x1="125" y1="130" x2="143" y2="130" stroke="#ffe6a8" stroke-width="3" /></g>
            <g id="outer-planet"><circle cx="400" cy="130" r="13" fill="#77a9d1" stroke="#c9e5f5" stroke-width="4" /></g>
            <g id="inner-planet"><circle cx="285" cy="130" r="10" fill="#9d78bd" stroke="#e4d2f2" stroke-width="3" /></g>
          </svg>`,
        },
        { id: "kepler-chart", kind: "chart", chart: "scatter", series: [[0.24, 0.24], [0.62, 0.62], [1, 1], [1.88, 1.88], [11.86, 11.86]], xDomain: [0, 12], yDomain: [0, 12], axes: true, xLabel: "a³  (AU³)", yLabel: "T²  (years²)", size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "focus-note", kind: "text", text: "Sun at one focus — not the center", textRole: "caption", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "kepler-law", kind: "equation", value: "T^2\\propto a^3", size: "small", placement: { mode: "relative", target: "kepler-chart", relation: "below" } },
      ],
      beats: [
        { id: "draw-ellipse", pace: "slow", actions: [{ do: "show", targets: ["kepler-title", "kepler-art.outer-orbit", "kepler-art.orbit-centers", "kepler-art.sun", "kepler-art.outer-planet", "focus-note"], entrance: "draw" }, { do: "attention", target: "kepler-art.sun", verb: "callout", text: "shared focus; the crosses mark geometric centers", side: "south", style: "tag" }] },
        { id: "compare-orbits", pace: "slow", actions: [{ do: "hide", targets: ["focus-note"], exit: "fade" }, { do: "show", targets: ["kepler-art.inner-orbit", "kepler-art.inner-planet"], entrance: "draw" }, { do: "attention", target: "kepler-art.outer-planet", verb: "callout", text: "farther path → longer trip", side: "north", style: "tag" }] },
        { id: "measure-period", pace: "slow", actions: [{ do: "show", targets: ["kepler-chart", "kepler-law"], entrance: "fade" }] },
        { id: "connect-period", pace: "slow", actions: [{ do: "emphasize", target: "kepler-law", emphasis: "pulse", strength: "subtle" }] },
        { id: "hold-kepler-law", pace: "normal", actions: [{ do: "emphasize", target: "kepler-law", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "moon-free-fall",
      composition: "split",
      objects: [
        { id: "moon-title", kind: "text", text: "WHY THE MOON KEEPS MISSING EARTH", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "moon-art",
          kind: "svg-artwork",
          size: "medium",
          placement: { mode: "zone", zone: "main-left" },
          temporaryParts: ["velocity-arrow", "gravity-arrow", "tangent-path"],
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 430 300">
            <g id="orbit"><circle cx="190" cy="155" r="112" fill="none" stroke="#7898aa" stroke-width="4" /></g>
            <g id="earth"><circle cx="190" cy="155" r="56" fill="#4d83b8" stroke="#c3e1f3" stroke-width="4" /><path d="M151 137 C171 108 202 116 210 139 C230 131 247 146 242 167 C221 160 204 173 194 192 C172 182 155 163 151 137 Z" fill="#76a66f" stroke="#cfe5c8" stroke-width="3" /></g>
            <g id="moon"><circle cx="302" cy="155" r="20" fill="#d5d8d6" stroke="#f2f3ef" stroke-width="4" /><circle cx="295" cy="149" r="5" fill="#aeb5b1" /><circle cx="309" cy="162" r="4" fill="#aeb5b1" /></g>
            <g id="velocity-arrow">
              <line x1="302" y1="128" x2="302" y2="70" stroke="#7fc3c8" stroke-width="5" stroke-linecap="round" />
              <path d="M302 60 L291 79 L313 79 Z" fill="#7fc3c8" />
            </g>
            <g id="gravity-arrow">
              <line x1="277" y1="155" x2="238" y2="155" stroke="#ffe08a" stroke-width="5" stroke-linecap="round" />
              <path d="M228 155 L247 144 L247 166 Z" fill="#ffe08a" />
            </g>
            <g id="tangent-path">
              <line x1="328" y1="155" x2="328" y2="63" stroke="#9bb1a2" stroke-width="2" />
            </g>
            <g id="fall-steps" fill="#d5d8d6" fill-opacity="0.22" stroke="#f2f3ef" stroke-opacity="0.65" stroke-width="2">
              <circle cx="269" cy="76" r="11" /><circle cx="190" cy="43" r="11" /><circle cx="111" cy="76" r="11" />
              <path d="M263 86 L246 103 M185 55 L185 79 M119 85 L137 102" fill="none" stroke="#ffe08a" stroke-width="3" />
            </g>
          </svg>`,
        },
        { id: "moon-equation", kind: "equation", value: "v_{orbit}=\\sqrt{\\frac{GM}{r}}", size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "velocity-label", kind: "text", text: "sideways velocity", textRole: "caption", size: "small", placement: { mode: "relative", target: "moon-art.velocity-arrow", relation: "right-of" } },
        { id: "gravity-label", kind: "text", text: "gravity turns the velocity inward", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-moon", pace: "slow", actions: [{ do: "show", targets: ["moon-title", "moon-art.earth", "moon-art.moon"], entrance: "fade" }] },
        { id: "show-velocity", pace: "slow", actions: [{ do: "show", targets: ["moon-art.velocity-arrow", "moon-art.tangent-path", "velocity-label"], entrance: "draw" }] },
        { id: "show-gravity", pace: "slow", actions: [{ do: "show", targets: ["moon-art.gravity-arrow", "gravity-label"], entrance: "draw" }, { do: "attention", target: "moon-art.gravity-arrow", verb: "callout", text: "inward acceleration", side: "south", style: "tag" }] },
        { id: "orbit-moon", pace: "dramatic", actions: [{ do: "hide", targets: ["moon-art.velocity-arrow", "moon-art.gravity-arrow", "moon-art.tangent-path", "velocity-label"], exit: "fade" }, { do: "show", targets: ["moon-art.orbit", "moon-art.fall-steps", "moon-equation"], entrance: "draw" }, { do: "motion", target: "moon-art.moon", motion: "orbit", around: "moon-art.earth", orbit: "medium", turns: "two" }] },
        { id: "hold-orbit", pace: "normal", actions: [{ do: "attention", target: "moon-art.orbit", verb: "rings", text: "continuous free fall" }] },
      ],
    },
    {
      id: "gravity-recap",
      composition: "custom-relational",
      objects: [
        { id: "gravity-title", kind: "text", text: "ONE FORCE — THREE OUTCOMES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "outcomes",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 230">
            <g id="apple" stroke="#d8e4db" stroke-width="4" stroke-linecap="round">
              <line x1="40" y1="190" x2="210" y2="190" /><circle cx="125" cy="62" r="18" fill="#d65a4f" stroke="#f0a39a" />
              <line x1="125" y1="92" x2="125" y2="161" stroke="#ffe08a" /><path d="M125 176 L113 155 H137 Z" fill="#ffe08a" stroke="none" />
              <circle cx="125" cy="112" r="12" fill="#d65a4f" fill-opacity="0.22" /><circle cx="125" cy="154" r="12" fill="#d65a4f" fill-opacity="0.22" />
            </g>
            <g id="cannonball" stroke="#d8e4db" stroke-width="4" fill="none" stroke-linecap="round">
              <path d="M270 190 H445" /><path d="M283 172 L307 151 L327 170" /><line x1="304" y1="153" x2="324" y2="132" stroke-width="9" />
              <path d="M324 130 Q380 53 438 150" stroke="#ffe08a" /><circle cx="438" cy="150" r="9" fill="#d65a4f" stroke="#f0a39a" />
            </g>
            <g id="moon" stroke="#c3e1f3" stroke-width="4" fill="none">
              <circle cx="610" cy="126" r="47" fill="#4d83b8" /><ellipse cx="610" cy="126" rx="88" ry="68" stroke="#7898aa" />
              <circle cx="698" cy="126" r="13" fill="#d5d8d6" stroke="#f2f3ef" />
              <path d="M685 72 L672 84 M672 84 L677 68 M672 84 L690 84" stroke="#ffe08a" stroke-width="4" />
            </g>
          </svg>`,
        },
        { id: "recap-law", kind: "equation", value: "\\text{same inward gravity}+\\text{different sideways speed}=\\text{different path}", size: "tiny", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "show-impact", pace: "slow", actions: [{ do: "show", targets: ["gravity-title", "outcomes.apple"], entrance: "draw" }] },
        { id: "show-arc", pace: "slow", actions: [{ do: "show", targets: ["outcomes.cannonball"], entrance: "draw" }] },
        { id: "show-orbit", pace: "slow", actions: [{ do: "show", targets: ["outcomes.moon"], entrance: "draw" }] },
        { id: "compare-paths", pace: "dramatic", actions: [{ do: "tour", labelMode: "one-at-a-time", returnTo: "overview", stops: [
          { target: "outcomes.apple", label: "no sideways speed: impact", shot: "wide" },
          { target: "outcomes.cannonball", label: "some sideways speed: an arc", shot: "wide" },
          { target: "outcomes.moon", label: "orbital speed: keeps missing Earth", shot: "wide" },
        ] }] },
        { id: "one-force", pace: "dramatic", actions: [{ do: "show", targets: ["recap-law"], entrance: "word-by-word" }, { do: "attention", target: "outcomes.moon", verb: "rings" }] },
      ],
    },
  ],
};
