import type { LessonSpec } from "../../simple-json";

/**
 * The original neuron film reconstructed entirely from the public Simple JSON grammar.
 * No recipe, visual asset, GCL component, renderer callback, or runtime helper is used here.
 */
export const neuronLessonSpec: LessonSpec = {
  version: "1",
  title: "The Neuron Fires",
  theme: "textbook",
  scenes: [
    {
      id: "neuron-anatomy",
      composition: "custom-relational",
      objects: [
        { id: "anatomy-title", kind: "text", text: "A NEURON PASSES A SIGNAL FORWARD", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "anatomy-subtitle", kind: "text", text: "First follow the message through the cell.", textRole: "caption", role: "support", size: "small", placement: { mode: "zone", zone: "support" } },
        {
          id: "anatomy-neuron",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 220">
            <defs>
              <radialGradient id="somaGlow"><stop offset="0" stop-color="#5cc8ae" stop-opacity="0.46" /><stop offset="1" stop-color="#5cc8ae" stop-opacity="0" /></radialGradient>
              <radialGradient id="somaFill"><stop offset="0" stop-color="#8de0cc" /><stop offset="0.68" stop-color="#5cc8ae" /><stop offset="1" stop-color="#2f8b74" /></radialGradient>
              <radialGradient id="nucleusFill"><stop offset="0" stop-color="#397d6b" /><stop offset="1" stop-color="#173f35" /></radialGradient>
              <linearGradient id="myelinFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d69a" /><stop offset="0.48" stop-color="#d6b36a" /><stop offset="1" stop-color="#8c6a35" /></linearGradient>
            </defs>
            <g id="dendrites" fill="none" stroke="#7fb7c8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M130 110 C104 77 80 54 44 34 M85 60 L55 72 M71 50 L65 20 M130 110 C95 99 66 100 24 82 M75 101 L46 116 M130 110 C98 132 70 154 31 184 M82 143 L48 139 M68 154 L57 194 M130 110 C112 71 111 42 106 17 M111 51 L129 27" />
            </g>
            <g id="soma-glow"><circle cx="165" cy="110" r="58" fill="url(#somaGlow)" /></g>
            <g id="axon" fill="none" stroke="#cfe0e6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M205 110 C273 106 344 114 515 110" />
              <path d="M515 110 C543 83 565 69 596 57 M515 110 C550 110 572 110 607 108 M515 110 C543 137 566 150 598 164" />
              <path d="M557 76 L579 86 M562 145 L582 134" stroke-width="4" />
            </g>
            <g id="soma"><circle cx="165" cy="110" r="49" fill="url(#somaFill)" stroke="#1e5245" stroke-width="5" /></g>
            <g id="nucleus"><circle cx="165" cy="110" r="22" fill="url(#nucleusFill)" stroke="#a5ead8" stroke-opacity="0.3" stroke-width="2" /></g>
            <g id="myelin" fill="url(#myelinFill)" stroke="#70542b" stroke-width="2">
              <rect x="239" y="82" width="36" height="56" rx="18" /><rect x="290" y="82" width="36" height="56" rx="18" />
              <rect x="341" y="82" width="36" height="56" rx="18" /><rect x="392" y="82" width="36" height="56" rx="18" />
              <rect x="443" y="82" width="26" height="56" rx="13" />
            </g>
          </svg>`,
        },
        { id: "anatomy-flow", kind: "text", text: "input at dendrites  →  decision at soma  →  electrical pulse along axon", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        {
          id: "show-complete-svg-neuron",
          pace: "slow",
          actions: [
            { do: "show", targets: ["anatomy-title", "anatomy-subtitle", "anatomy-neuron"], entrance: "fade" },
          ],
        },
        {
          id: "label-anatomy",
          pace: "slow",
          actions: [
            { do: "attention", target: "anatomy-neuron.dendrites", verb: "callout", text: "dendrites", side: "west", route: "elbow", style: "tag" },
            { do: "attention", target: "anatomy-neuron.soma", verb: "callout", text: "soma", side: "south", route: "straight", style: "tag" },
            { do: "attention", target: "anatomy-neuron.myelin", verb: "callout", text: "axon + myelin", side: "north", route: "elbow", style: "tag" },
            { do: "attention", target: "anatomy-neuron.axon", verb: "callout", text: "axon terminals", side: "east", route: "elbow", style: "tag" },
          ],
        },
        {
          id: "show-anatomy-flow",
          pace: "slow",
          actions: [{ do: "show", targets: ["anatomy-flow"], entrance: "word-by-word" }],
        },
        {
          id: "hold-connected-overview",
          pace: "slow",
          actions: [{ do: "effect", effect: "glow", target: "anatomy-neuron.soma", intensity: "subtle" }],
        },
        {
          id: "hold-signal-path",
          pace: "dramatic",
          actions: [
            { do: "effect", effect: "glow", target: "anatomy-neuron.axon", intensity: "subtle" },
          ],
        },
      ],
    },
    {
      id: "resting-membrane",
      composition: "custom-relational",
      objects: [
        { id: "rest-title", kind: "text", text: "AT REST, THE INSIDE IS MORE NEGATIVE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "membrane-diagram",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 240">
            <defs>
              <radialGradient id="naFill"><stop offset="0" stop-color="#b7f1e4" /><stop offset="0.6" stop-color="#5cc8ae" /><stop offset="1" stop-color="#286f5e" /></radialGradient>
              <radialGradient id="kFill"><stop offset="0" stop-color="#fff0bd" /><stop offset="0.62" stop-color="#d6b36a" /><stop offset="1" stop-color="#775524" /></radialGradient>
              <linearGradient id="membraneFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6b36a" stop-opacity="0.28" /><stop offset="0.5" stop-color="#70542b" stop-opacity="0.16" /><stop offset="1" stop-color="#d6b36a" stop-opacity="0.28" /></linearGradient>
            </defs>
            <g id="compartments">
              <rect x="12" y="12" width="596" height="104" rx="18" fill="#5cc8ae" fill-opacity="0.07" stroke="#5cc8ae" stroke-opacity="0.14" />
              <rect x="12" y="124" width="596" height="104" rx="18" fill="#9d78bd" fill-opacity="0.07" stroke="#9d78bd" stroke-opacity="0.14" />
            </g>
            <g id="bilayer" fill="#d6b36a" stroke="#8c6a35" stroke-width="1">
              <rect x="38" y="102" width="544" height="36" rx="18" fill="url(#membraneFill)" stroke="#d6b36a" stroke-opacity="0.35" />
              <circle cx="58" cy="105" r="7" /><circle cx="94" cy="105" r="7" /><circle cx="130" cy="105" r="7" /><circle cx="166" cy="105" r="7" /><circle cx="202" cy="105" r="7" /><circle cx="238" cy="105" r="7" /><circle cx="274" cy="105" r="7" /><circle cx="310" cy="105" r="7" /><circle cx="346" cy="105" r="7" /><circle cx="382" cy="105" r="7" /><circle cx="418" cy="105" r="7" /><circle cx="454" cy="105" r="7" /><circle cx="490" cy="105" r="7" /><circle cx="526" cy="105" r="7" /><circle cx="562" cy="105" r="7" />
              <circle cx="58" cy="135" r="7" /><circle cx="94" cy="135" r="7" /><circle cx="130" cy="135" r="7" /><circle cx="166" cy="135" r="7" /><circle cx="202" cy="135" r="7" /><circle cx="238" cy="135" r="7" /><circle cx="274" cy="135" r="7" /><circle cx="310" cy="135" r="7" /><circle cx="346" cy="135" r="7" /><circle cx="382" cy="135" r="7" /><circle cx="418" cy="135" r="7" /><circle cx="454" cy="135" r="7" /><circle cx="490" cy="135" r="7" /><circle cx="526" cy="135" r="7" /><circle cx="562" cy="135" r="7" />
            </g>
            <g id="sodium" fill="url(#naFill)" stroke="#a5ead8" stroke-width="2">
              <circle cx="86" cy="46" r="10" /><circle cx="142" cy="70" r="10" /><circle cx="204" cy="42" r="10" /><circle cx="258" cy="72" r="10" /><circle cx="322" cy="44" r="10" /><circle cx="379" cy="72" r="10" /><circle cx="438" cy="42" r="10" /><circle cx="494" cy="70" r="10" /><circle cx="548" cy="45" r="10" />
            </g>
            <g id="potassium" fill="url(#kFill)" stroke="#f1d69a" stroke-width="2">
              <circle cx="112" cy="190" r="10" /><circle cx="177" cy="166" r="10" /><circle cx="239" cy="195" r="10" /><circle cx="301" cy="170" r="10" /><circle cx="365" cy="194" r="10" /><circle cx="428" cy="168" r="10" /><circle cx="500" cy="192" r="10" />
            </g>
            <g id="channel" fill="#16222c" stroke="#5cc8ae" stroke-width="5" stroke-linejoin="round">
              <polygon points="287,88 304,101 304,139 287,152 270,139 270,101" />
              <polygon points="333,88 350,101 350,139 333,152 316,139 316,101" />
              <rect x="302" y="111" width="16" height="18" rx="8" fill="#5cc8ae" stroke="none" />
            </g>
          </svg>`,
        },
        { id: "rest-value", kind: "stat", from: 0, value: -70, unit: "mV", label: "resting membrane potential", role: "hud", placement: { mode: "zone", zone: "hud" } },
        { id: "rest-explanation", kind: "text", text: "Unequal ion concentrations store electrical potential across the membrane.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "nernst", kind: "equation", value: "E_{ion}=\\frac{RT}{zF}\\ln\\frac{[ion]_{out}}{[ion]_{in}}", size: "tiny", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        {
          id: "build-membrane",
          pace: "slow",
          actions: [
            { do: "show", targets: ["rest-title", "membrane-diagram"], entrance: "fade" },
          ],
        },
        {
          id: "separate-ions",
          pace: "slow",
          actions: [
            { do: "show", targets: ["rest-value", "rest-explanation"], entrance: "fade" },
            { do: "attention", target: "membrane-diagram.sodium", verb: "callout", text: "Na⁺ is concentrated outside", side: "north", route: "elbow", style: "tag" },
            { do: "attention", target: "membrane-diagram.potassium", verb: "callout", text: "K⁺ is concentrated inside", side: "south", route: "elbow", style: "tag" },
          ],
        },
        {
          id: "quantify-rest",
          pace: "slow",
          actions: [
            { do: "show", targets: ["nernst"], entrance: "wipe" },
            { do: "attention", target: "rest-value", verb: "callout", text: "inside is 70 mV lower than outside", side: "west", style: "tag" },
          ],
        },
        { id: "hold-resting-state", pace: "normal", actions: [{ do: "emphasize", target: "rest-value", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "threshold-depolarization",
      composition: "overview-detail",
      objects: [
        { id: "threshold-title", kind: "text", text: "THRESHOLD OPENS Na⁺ CHANNELS", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "threshold-diagram",
          kind: "svg-artwork",
          size: "medium",
          placement: { mode: "zone", zone: "main-left" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 260">
            <defs>
              <radialGradient id="thresholdNa"><stop offset="0" stop-color="#c4f5e9" /><stop offset="0.62" stop-color="#5cc8ae" /><stop offset="1" stop-color="#246553" /></radialGradient>
              <linearGradient id="thresholdChannel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fe0c7" /><stop offset="1" stop-color="#266e5b" /></linearGradient>
            </defs>
            <g id="compartments">
              <rect x="18" y="18" width="284" height="106" rx="16" fill="#5cc8ae" fill-opacity="0.07" stroke="#5cc8ae" stroke-opacity="0.18" />
              <rect x="18" y="136" width="284" height="106" rx="16" fill="#9d78bd" fill-opacity="0.07" stroke="#9d78bd" stroke-opacity="0.18" />
            </g>
            <g id="stimulus" fill="#e8a13c" stroke="#ffe0a3" stroke-width="3">
              <polygon points="48,28 56,45 75,47 61,60 65,79 48,69 31,79 35,60 21,47 40,45" />
            </g>
            <g id="stimulus-path" fill="none" stroke="#e8a13c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="67,68 98,87 126,105 147,129" />
            </g>
            <g id="membrane" fill="#d6b36a" stroke="#8c6a35" stroke-width="2">
              <rect x="34" y="119" width="252" height="34" rx="17" fill="#d6b36a" fill-opacity="0.22" />
              <circle cx="52" cy="123" r="7" /><circle cx="80" cy="123" r="7" /><circle cx="108" cy="123" r="7" /><circle cx="136" cy="123" r="7" /><circle cx="184" cy="123" r="7" /><circle cx="212" cy="123" r="7" /><circle cx="240" cy="123" r="7" /><circle cx="268" cy="123" r="7" />
              <circle cx="52" cy="149" r="7" /><circle cx="80" cy="149" r="7" /><circle cx="108" cy="149" r="7" /><circle cx="136" cy="149" r="7" /><circle cx="184" cy="149" r="7" /><circle cx="212" cy="149" r="7" /><circle cx="240" cy="149" r="7" /><circle cx="268" cy="149" r="7" />
            </g>
            <g id="sodium" fill="url(#thresholdNa)" stroke="#a5ead8" stroke-width="2">
              <circle cx="115" cy="56" r="11" /><circle cx="151" cy="82" r="11" /><circle cx="188" cy="50" r="11" /><circle cx="226" cy="80" r="11" /><circle cx="262" cy="54" r="11" />
            </g>
            <g id="channel" fill="url(#thresholdChannel)" stroke="#b7f1e4" stroke-width="3" stroke-linejoin="round">
              <polygon points="146,111 158,121 154,160 136,174 128,163 137,151 140,122" />
              <polygon points="174,111 162,121 166,160 184,174 192,163 183,151 180,122" />
            </g>
            <g id="inside" fill="none" stroke="#b58ad6" stroke-width="3">
              <ellipse cx="160" cy="205" rx="77" ry="25" />
              <circle cx="135" cy="205" r="8" fill="#5cc8ae" stroke="#a5ead8" /><circle cx="160" cy="205" r="8" fill="#5cc8ae" stroke="#a5ead8" /><circle cx="185" cy="205" r="8" fill="#5cc8ae" stroke="#a5ead8" />
            </g>
          </svg>`,
        },
        {
          id: "depolarization-chart",
          kind: "chart",
          chart: "line",
          series: [
            [0, -70], [0.08, -70], [0.16, -68], [0.22, -62], [0.27, -55],
            [0.31, -40], [0.35, -10], [0.39, 20], [0.43, 38], [0.46, 40],
          ],
          xDomain: [0, 0.46],
          yDomain: [-90, 50],
          axes: true,
          xLabel: "time",
          yLabel: "mV",
          size: "medium",
          placement: { mode: "zone", zone: "main-right" },
        },
        { id: "threshold-value", kind: "equation", value: "V_{threshold}=-55mV", size: "small", placement: { mode: "zone", zone: "footer" } },
        { id: "threshold-cause", kind: "text", text: "A strong enough stimulus reaches threshold; then sodium gates open.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "peak-value", kind: "stat", value: 40, prefix: "+", unit: "mV", label: "peak voltage", size: "small", role: "hud", placement: { mode: "zone", zone: "hud" } },
      ],
      beats: [
        {
          id: "approach-threshold",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["threshold-title", "threshold-diagram.compartments", "threshold-diagram.stimulus", "threshold-diagram.stimulus-path", "threshold-diagram.membrane", "threshold-diagram.sodium", "threshold-diagram.channel", "threshold-diagram.inside", "threshold-value", "threshold-cause"], entrance: "fade" },
            { do: "attention", target: "threshold-diagram.channel", verb: "callout", title: "Will it fire?", text: "the membrane reaches threshold", side: "east", route: "elbow", style: "pill" },
          ],
        },
        {
          id: "open-sodium-gates",
          pace: "slow",
          actions: [
            { do: "effect", effect: "flow", from: "threshold-diagram.sodium", to: "threshold-diagram.inside", intensity: "subtle" },
            { do: "attention", target: "threshold-diagram.channel", verb: "callout", title: "Na⁺ enters", text: "positive charge flows inside", side: "east", route: "elbow", style: "pill" },
          ],
        },
        {
          id: "voltage-rises",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["depolarization-chart"], entrance: "draw" },
            { do: "attention", target: "depolarization-chart.last", verb: "callout", title: "Depolarization", text: "the voltage rapidly becomes positive", side: "west", route: "elbow", style: "pill" },
          ],
        },
        {
          id: "reach-peak",
          pace: "slow",
          actions: [
            { do: "show", targets: ["peak-value"], entrance: "slam" },
          ],
        },
        { id: "hold-spike", pace: "normal", actions: [{ do: "emphasize", target: "peak-value", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "repolarization-recovery",
      composition: "overview-detail",
      objects: [
        { id: "recovery-title", kind: "text", text: "K⁺ FLOW RESTORES THE VOLTAGE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "recovery-chart",
          kind: "chart",
          chart: "line",
          series: [
            [0.46, 40], [0.5, 30], [0.55, 5], [0.6, -25], [0.66, -55],
            [0.72, -72], [0.78, -82], [0.84, -80], [0.9, -76], [0.96, -72], [1, -70],
          ],
          xDomain: [0.46, 1],
          yDomain: [-90, 50],
          axes: true,
          xLabel: "time",
          yLabel: "mV",
          size: "medium",
          placement: { mode: "zone", zone: "main-left" },
        },
        {
          id: "recovery-diagram",
          kind: "svg-artwork",
          size: "medium",
          placement: { mode: "zone", zone: "main-right" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 260">
            <defs>
              <radialGradient id="recoveryK"><stop offset="0" stop-color="#fff1c7" /><stop offset="0.62" stop-color="#d6b36a" /><stop offset="1" stop-color="#765323" /></radialGradient>
              <linearGradient id="recoveryChannel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d69a" /><stop offset="1" stop-color="#8c6a35" /></linearGradient>
            </defs>
            <g id="compartments">
              <rect x="18" y="18" width="284" height="106" rx="16" fill="#5cc8ae" fill-opacity="0.07" stroke="#5cc8ae" stroke-opacity="0.18" />
              <rect x="18" y="136" width="284" height="106" rx="16" fill="#9d78bd" fill-opacity="0.07" stroke="#9d78bd" stroke-opacity="0.18" />
            </g>
            <g id="membrane" fill="#d6b36a" stroke="#8c6a35" stroke-width="2">
              <rect x="34" y="119" width="252" height="34" rx="17" fill="#d6b36a" fill-opacity="0.22" />
              <circle cx="52" cy="123" r="7" /><circle cx="80" cy="123" r="7" /><circle cx="108" cy="123" r="7" /><circle cx="136" cy="123" r="7" /><circle cx="184" cy="123" r="7" /><circle cx="212" cy="123" r="7" /><circle cx="240" cy="123" r="7" /><circle cx="268" cy="123" r="7" />
              <circle cx="52" cy="149" r="7" /><circle cx="80" cy="149" r="7" /><circle cx="108" cy="149" r="7" /><circle cx="136" cy="149" r="7" /><circle cx="184" cy="149" r="7" /><circle cx="212" cy="149" r="7" /><circle cx="240" cy="149" r="7" /><circle cx="268" cy="149" r="7" />
            </g>
            <g id="potassium" fill="url(#recoveryK)" stroke="#f1d69a" stroke-width="2">
              <circle cx="103" cy="199" r="11" /><circle cx="137" cy="220" r="11" /><circle cx="174" cy="194" r="11" /><circle cx="210" cy="219" r="11" /><circle cx="247" cy="196" r="11" />
            </g>
            <g id="channel" fill="url(#recoveryChannel)" stroke="#fff0bd" stroke-width="3" stroke-linejoin="round">
              <polygon points="146,111 158,121 154,160 136,174 128,163 137,151 140,122" />
              <polygon points="174,111 162,121 166,160 184,174 192,163 183,151 180,122" />
            </g>
            <g id="outside" fill="url(#recoveryK)" stroke="#f1d69a" stroke-width="2">
              <circle cx="124" cy="60" r="11" /><circle cx="160" cy="40" r="11" /><circle cx="197" cy="66" r="11" />
            </g>
          </svg>`,
        },
        { id: "recovery-cause", kind: "text", text: "Sodium gates close; potassium gates open and K⁺ leaves the cell.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "refractory", kind: "text", text: "The brief undershoot is the refractory period: the neuron is not ready yet.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "recovered-value", kind: "stat", value: -70, unit: "mV", label: "ready to fire again", size: "small", role: "hud", placement: { mode: "zone", zone: "hud" } },
      ],
      beats: [
        {
          id: "show-potassium-gates",
          pace: "slow",
          actions: [
            { do: "show", targets: ["recovery-title", "recovery-diagram", "recovery-cause"], entrance: "fade" },
            { do: "effect", effect: "flow", from: "recovery-diagram.potassium", to: "recovery-diagram.outside", intensity: "subtle" },
            { do: "attention", target: "recovery-diagram.channel", verb: "callout", text: "K⁺ exits through open gates", side: "west", style: "tag" },
          ],
        },
        {
          id: "voltage-falls",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["recovery-chart"], entrance: "draw" },
            { do: "attention", target: "recovery-chart.pt3", verb: "callout", title: "Repolarization", text: "K⁺ flows out", side: "east", route: "elbow", style: "pill" },
          ],
        },
        {
          id: "refractory-dip",
          pace: "slow",
          actions: [
            { do: "hide", targets: ["recovery-cause"], exit: "fade" },
            { do: "show", targets: ["refractory"], entrance: "fade" },
            { do: "attention", target: "recovery-chart.pt6", verb: "callout", title: "Hyperpolarization", text: "the voltage dips below rest", side: "north", route: "curve", style: "pill" },
            { do: "attention", target: "recovery-chart.pt6", verb: "spotlight" },
          ],
        },
        {
          id: "return-to-rest",
          pace: "slow",
          actions: [
            { do: "show", targets: ["recovered-value"], entrance: "slam" },
            { do: "attention", target: "recovery-chart.last", verb: "callout", text: "back to rest", side: "north", route: "elbow", style: "tag" },
          ],
        },
        { id: "hold-recovery", pace: "normal", actions: [{ do: "emphasize", target: "recovered-value", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "travelling-wave",
      composition: "custom-relational",
      objects: [
        { id: "wave-title", kind: "text", text: "THE WAVE TRAVELS", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "wave-neuron",
          kind: "svg-artwork",
          size: "large",
          placement: { mode: "zone", zone: "main" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 220">
            <defs>
              <radialGradient id="waveSoma"><stop offset="0" stop-color="#9be8d5" /><stop offset="0.68" stop-color="#5cc8ae" /><stop offset="1" stop-color="#2f8b74" /></radialGradient>
              <radialGradient id="waveNucleus"><stop offset="0" stop-color="#397d6b" /><stop offset="1" stop-color="#173f35" /></radialGradient>
              <linearGradient id="waveMyelin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1d69a" /><stop offset="0.48" stop-color="#d6b36a" /><stop offset="1" stop-color="#8c6a35" /></linearGradient>
            </defs>
            <g id="dendrites" fill="none" stroke="#7fb7c8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M130 110 C104 77 80 54 44 34 M85 60 L55 72 M71 50 L65 20 M130 110 C95 99 66 100 24 82 M75 101 L46 116 M130 110 C98 132 70 154 31 184 M82 143 L48 139 M68 154 L57 194 M130 110 C112 71 111 42 106 17 M111 51 L129 27" />
            </g>
            <g id="axon" fill="none" stroke="#cfe0e6" stroke-width="6" stroke-linecap="round">
              <path d="M205 110 C273 106 344 114 515 110" />
            </g>
            <g id="soma"><circle cx="165" cy="110" r="49" fill="url(#waveSoma)" stroke="#1e5245" stroke-width="5" /></g>
            <g id="nucleus"><circle cx="165" cy="110" r="22" fill="url(#waveNucleus)" stroke="#a5ead8" stroke-opacity="0.3" stroke-width="2" /></g>
            <g id="myelin" fill="url(#waveMyelin)" stroke="#70542b" stroke-width="2">
              <rect x="239" y="82" width="36" height="56" rx="18" /><rect x="290" y="82" width="36" height="56" rx="18" />
              <rect x="341" y="82" width="36" height="56" rx="18" /><rect x="392" y="82" width="36" height="56" rx="18" /><rect x="443" y="82" width="26" height="56" rx="13" />
            </g>
            <g id="nodes" fill="#7fe0c7" stroke="#d7fff4" stroke-width="2">
              <circle cx="283" cy="110" r="5" /><circle cx="334" cy="110" r="5" /><circle cx="385" cy="110" r="5" /><circle cx="436" cy="110" r="5" />
            </g>
            <g id="terminals" fill="none" stroke="#cfe0e6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M515 110 C543 83 565 69 596 57 M515 110 C550 110 572 110 607 108 M515 110 C543 137 566 150 598 164 M557 76 L579 86 M562 145 L582 134" />
            </g>
          </svg>`,
        },
        { id: "wave-signal-path", kind: "line", from: "wave-neuron.soma.right", to: "wave-neuron.terminals.left", form: "straight", size: "tiny", role: "background" },
        { id: "signal", kind: "shape", shape: "disc", appearance: "shaded", size: "tiny", role: "hero", placement: { mode: "anchor", target: "wave-neuron.soma.right" } },
        { id: "wave-caption", kind: "text", text: "Each active gap opens channels in the next gap: the pulse moves node to node.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "terminal-caption", kind: "text", text: "message handed to the next cell", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        {
          id: "show-wave-path",
          pace: "slow",
          actions: [
            { do: "show", targets: ["wave-title", "wave-neuron", "wave-signal-path", "signal", "wave-caption"], entrance: "fade" },
            { do: "attention", target: "wave-neuron.nodes", verb: "callout", text: "nodes of Ranvier", side: "north", style: "tag" },
          ],
        },
        { id: "hold-handoff", pace: "normal", actions: [{ do: "emphasize", target: "terminal-caption", emphasis: "pulse", strength: "subtle" }] },
        {
          id: "send-wave",
          pace: "dramatic",
          actions: [
            { do: "motion", target: "signal", motion: "along", along: "wave-signal-path" },
            { do: "effect", effect: "glow", target: "signal", intensity: "strong" },
          ],
        },
        {
          id: "terminal-handoff",
          pace: "slow",
          actions: [
            { do: "show", targets: ["terminal-caption"], entrance: "word-by-word" },
            { do: "attention", target: "wave-neuron.terminals", verb: "callout", title: "Axon terminals", text: "pass the message onward", side: "west", route: "elbow", style: "pill" },
          ],
        },
      ],
    },
    {
      id: "neuron-recap",
      composition: "data",
      objects: [
        { id: "recap-title", kind: "text", text: "ONE ELECTRICAL PULSE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        {
          id: "recap-chart",
          kind: "chart",
          chart: "line",
          series: [
            [0, -70], [0.08, -70], [0.16, -68], [0.22, -62], [0.27, -55],
            [0.31, -40], [0.35, -10], [0.39, 20], [0.43, 38], [0.46, 40],
            [0.5, 30], [0.55, 5], [0.6, -25], [0.66, -55], [0.72, -72],
            [0.78, -82], [0.84, -80], [0.9, -76], [0.96, -72], [1, -70],
          ],
          xDomain: [0, 1],
          yDomain: [-90, 50],
          axes: true,
          xLabel: "time",
          yLabel: "mV",
          size: "medium",
          placement: { mode: "zone", zone: "main-left" },
        },
        { id: "recap-equation", kind: "equation", value: "-70\\rightarrow+40\\rightarrow-70mV", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "neuron-count", kind: "stat", value: 86000000000, unit: "neurons", label: "approximately in the human brain", commas: true, size: "tiny", role: "hud", placement: { mode: "zone", zone: "hud" } },
        { id: "recap-summary", kind: "text", text: "Na⁺ in → voltage rises   •   K⁺ out → voltage recovers", textRole: "caption", size: "small", placement: { mode: "relative", target: "recap-equation", relation: "below" } },
        { id: "recap-closing", kind: "text", text: "The same electrical cycle carries each signal from input to axon terminals.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        {
          id: "draw-complete-pulse",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["recap-title", "recap-chart", "recap-summary"], entrance: "draw" },
            { do: "attention", target: "recap-chart.pt4", verb: "callout", text: "threshold", side: "north", style: "tag" },
            { do: "attention", target: "recap-chart.peak", verb: "callout", text: "Na⁺ in: voltage rises", side: "east", style: "tag" },
            { do: "attention", target: "recap-chart.pt15", verb: "callout", text: "K⁺ out: recovery", side: "south", style: "tag" },
          ],
        },
        {
          id: "show-scale",
          pace: "slow",
          actions: [
            { do: "show", targets: ["recap-equation", "neuron-count"], entrance: "wipe" },
          ],
        },
        {
          id: "land-closing",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["recap-closing"], entrance: "word-by-word" },
            { do: "attention", target: "neuron-count", verb: "spotlight" },
          ],
        },
        { id: "hold-cycle", pace: "normal", actions: [{ do: "emphasize", target: "recap-summary", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
  ],
};
