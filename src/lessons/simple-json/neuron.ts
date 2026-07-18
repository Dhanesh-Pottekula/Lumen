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
            { do: "tour", labelMode: "one-at-a-time", returnTo: "overview", stops: [
              { target: "anatomy-neuron.dendrites", label: "Dendrites receive inputs", shot: "wide" },
              { target: "anatomy-neuron.soma", label: "The soma combines those inputs", shot: "wide" },
              { target: "anatomy-neuron.myelin", label: "Myelin insulates the long axon", shot: "wide" },
              { target: "anatomy-neuron.axon", label: "Terminals pass the signal onward", shot: "wide" },
            ] },
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
          actions: [{ do: "effect", effect: "flow", from: "anatomy-neuron.dendrites", to: "anatomy-neuron.soma", intensity: "subtle" }],
        },
        {
          id: "hold-signal-path",
          pace: "dramatic",
          actions: [
            { do: "effect", effect: "flow", from: "anatomy-neuron.soma", to: "anatomy-neuron.axon", intensity: "subtle" },
          ],
        },
      ],
    },
    {
      id: "resting-membrane",
      composition: "custom-relational",
      objects: [
        { id: "rest-title", kind: "text", text: "AT REST: INSIDE IS NEGATIVE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
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
            <g id="negative-proteins" fill="#9d78bd" fill-opacity="0.24" stroke="#c9a7e2" stroke-width="3" stroke-linecap="round">
              <polygon points="63,158 76,151 89,158 89,174 76,181 63,174" /><line x1="69" y1="166" x2="83" y2="166" />
              <polygon points="260,175 273,168 286,175 286,191 273,198 260,191" /><line x1="266" y1="183" x2="280" y2="183" />
              <polygon points="527,158 540,151 553,158 553,174 540,181 527,174" /><line x1="533" y1="166" x2="547" y2="166" />
            </g>
            <g id="channel" fill="#16222c" stroke="#5cc8ae" stroke-width="5" stroke-linejoin="round">
              <polygon points="287,88 304,101 304,139 287,152 270,139 270,101" />
              <polygon points="333,88 350,101 350,139 333,152 316,139 316,101" />
              <rect x="302" y="111" width="16" height="18" rx="8" fill="#5cc8ae" stroke="none" />
            </g>
            <g id="charge-separation" fill="none" stroke-linecap="round" stroke-width="4">
              <path d="M64 64 H82 M73 55 V73 M286 64 H304 M295 55 V73 M506 64 H524 M515 55 V73" stroke="#8de0cc" />
              <path d="M64 184 H82 M286 184 H304 M506 184 H524" stroke="#c9a7e2" />
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
            { do: "show", targets: ["rest-title", "membrane-diagram.compartments", "membrane-diagram.bilayer", "membrane-diagram.channel"], entrance: "fade" },
          ],
        },
        {
          id: "separate-ions",
          pace: "slow",
          actions: [
            { do: "show", targets: ["membrane-diagram.sodium", "membrane-diagram.potassium", "membrane-diagram.negative-proteins", "rest-explanation"], entrance: "fade" },
          ],
        },
        {
          id: "inspect-gradients",
          pace: "dramatic",
          actions: [
            { do: "tour", labelMode: "one-at-a-time", returnTo: "overview", stops: [
              { target: "membrane-diagram.sodium", label: "more Na⁺ outside", shot: "wide" },
              { target: "membrane-diagram.potassium", label: "more K⁺ inside", shot: "wide" },
              { target: "membrane-diagram.negative-proteins", label: "large negative proteins remain inside", shot: "wide" },
            ] },
          ],
        },
        {
          id: "quantify-rest",
          pace: "slow",
          actions: [
            { do: "show", targets: ["membrane-diagram.charge-separation", "rest-value", "nernst"], entrance: "wipe" },
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
        { id: "threshold-title", kind: "text", text: "THRESHOLD OPENS Na⁺ GATES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
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
            <g id="inside" fill="none" stroke="#b58ad6" stroke-width="3"><ellipse cx="160" cy="205" rx="77" ry="25" /></g>
            <g id="entered-sodium" fill="#5cc8ae" stroke="#a5ead8" stroke-width="3">
              <circle cx="135" cy="205" r="8" fill="#5cc8ae" stroke="#a5ead8" /><circle cx="160" cy="205" r="8" fill="#5cc8ae" stroke="#a5ead8" /><circle cx="185" cy="205" r="8" fill="#5cc8ae" stroke="#a5ead8" />
            </g>
            <g id="positive-inside" fill="none" stroke="#8de0cc" stroke-width="4" stroke-linecap="round">
              <path d="M91 207 H107 M99 199 V215 M213 207 H229 M221 199 V215" />
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
        { id: "peak-value", kind: "stat", value: 40, prefix: "+", unit: "mV", label: "peak voltage", size: "small", role: "hud", placement: { mode: "zone", zone: "hud" } },
      ],
      beats: [
        {
          id: "approach-threshold",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["threshold-title", "threshold-diagram.compartments", "threshold-diagram.stimulus", "threshold-diagram.stimulus-path", "threshold-diagram.membrane", "threshold-diagram.sodium", "threshold-diagram.channel", "threshold-diagram.inside", "threshold-value"], entrance: "fade" },
            { do: "attention", target: "threshold-diagram.channel", verb: "callout", title: "Will it fire?", text: "the membrane reaches threshold", side: "east", route: "elbow", style: "pill" },
          ],
        },
        {
          id: "open-sodium-gates",
          pace: "slow",
          actions: [
            { do: "effect", effect: "flow", from: "threshold-diagram.sodium", to: "threshold-diagram.inside", intensity: "subtle" },
            { do: "show", targets: ["threshold-diagram.entered-sodium"], entrance: "fade" },
            { do: "attention", target: "threshold-diagram.channel", verb: "callout", title: "Na⁺ enters", text: "positive charge flows inside", side: "east", route: "elbow", style: "pill" },
          ],
        },
        {
          id: "voltage-rises",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["threshold-diagram.positive-inside", "depolarization-chart"], entrance: "draw" },
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
            <g id="negative-inside" fill="none" stroke="#c9a7e2" stroke-width="4" stroke-linecap="round">
              <path d="M88 205 H108 M151 220 H171 M215 204 H235" />
            </g>
          </svg>`,
        },
        { id: "recovery-cause", kind: "text", text: "Sodium gates close; potassium gates open and K⁺ leaves the cell.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
        { id: "refractory", kind: "text", text: "The brief undershoot is the refractory period: the neuron is not ready yet.", textRole: "caption", size: "small", placement: { mode: "anchor", target: "recovery-cause.center" } },
        { id: "recovered-value", kind: "stat", value: -70, unit: "mV", label: "ready to fire again", size: "small", role: "hud", placement: { mode: "zone", zone: "hud" } },
      ],
      beats: [
        {
          id: "show-potassium-gates",
          pace: "slow",
          actions: [
            { do: "show", targets: ["recovery-title", "recovery-diagram.compartments", "recovery-diagram.membrane", "recovery-diagram.potassium", "recovery-diagram.channel", "recovery-diagram.outside", "recovery-cause"], entrance: "fade" },
            { do: "effect", effect: "flow", from: "recovery-diagram.potassium", to: "recovery-diagram.outside", intensity: "subtle" },
            { do: "attention", target: "recovery-diagram.channel", verb: "callout", text: "K⁺ exits through open gates", side: "west", style: "tag" },
          ],
        },
        {
          id: "voltage-falls",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["recovery-diagram.negative-inside", "recovery-chart"], entrance: "draw" },
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
          temporaryParts: ["active-1", "active-2", "active-3", "active-4"],
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
            <g id="nodes" fill="#173f35" stroke="#7fe0c7" stroke-width="2">
              <circle cx="283" cy="110" r="6" /><circle cx="334" cy="110" r="6" /><circle cx="385" cy="110" r="6" /><circle cx="436" cy="110" r="6" />
            </g>
            <g id="active-1"><circle cx="283" cy="110" r="15" fill="#7fe0c7" fill-opacity="0.35" stroke="#d7fff4" stroke-width="4" /></g>
            <g id="active-2"><circle cx="334" cy="110" r="15" fill="#7fe0c7" fill-opacity="0.35" stroke="#d7fff4" stroke-width="4" /></g>
            <g id="active-3"><circle cx="385" cy="110" r="15" fill="#7fe0c7" fill-opacity="0.35" stroke="#d7fff4" stroke-width="4" /></g>
            <g id="active-4"><circle cx="436" cy="110" r="15" fill="#7fe0c7" fill-opacity="0.35" stroke="#d7fff4" stroke-width="4" /></g>
            <g id="terminals" fill="none" stroke="#cfe0e6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M515 110 C543 83 565 69 596 57 M515 110 C550 110 572 110 607 108 M515 110 C543 137 566 150 598 164 M557 76 L579 86 M562 145 L582 134" />
            </g>
          </svg>`,
        },
        { id: "wave-caption", kind: "text", text: "Each active gap opens channels in the next gap: the pulse moves node to node.", textRole: "caption", size: "small", temporary: true, placement: { mode: "zone", zone: "footer" } },
        { id: "terminal-caption", kind: "text", text: "message handed to the next cell", textRole: "caption", size: "small", placement: { mode: "anchor", target: "wave-caption.center" } },
      ],
      beats: [
        {
          id: "show-wave-path",
          pace: "slow",
          actions: [
            { do: "show", targets: ["wave-title", "wave-neuron.dendrites", "wave-neuron.axon", "wave-neuron.soma", "wave-neuron.nucleus", "wave-neuron.myelin", "wave-neuron.nodes", "wave-neuron.terminals", "wave-caption"], entrance: "fade" },
            { do: "attention", target: "wave-neuron.nodes", verb: "callout", text: "nodes of Ranvier", side: "north", style: "tag" },
          ],
        },
        { id: "activate-node-1", pace: "quick", actions: [{ do: "show", targets: ["wave-neuron.active-1"], entrance: "iris" }] },
        { id: "activate-node-2", pace: "quick", actions: [{ do: "hide", targets: ["wave-neuron.active-1"], exit: "fade" }, { do: "show", targets: ["wave-neuron.active-2"], entrance: "iris" }] },
        { id: "activate-node-3", pace: "quick", actions: [{ do: "hide", targets: ["wave-neuron.active-2"], exit: "fade" }, { do: "show", targets: ["wave-neuron.active-3"], entrance: "iris" }] },
        { id: "activate-node-4", pace: "quick", actions: [{ do: "hide", targets: ["wave-neuron.active-3"], exit: "fade" }, { do: "show", targets: ["wave-neuron.active-4"], entrance: "iris" }] },
        {
          id: "terminal-handoff",
          pace: "slow",
          actions: [
            { do: "hide", targets: ["wave-neuron.active-4"], exit: "fade" },
            { do: "hide", targets: ["wave-caption"], exit: "fade" },
            { do: "show", targets: ["terminal-caption"], entrance: "word-by-word" },
            { do: "attention", target: "wave-neuron.terminals", verb: "callout", title: "Axon terminals", text: "pass the message onward", side: "west", route: "elbow", style: "pill" },
          ],
        },
        { id: "hold-handoff", pace: "normal", actions: [{ do: "emphasize", target: "terminal-caption", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "neuron-recap",
      composition: "overview-detail",
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
        {
          id: "cycle-diagram",
          kind: "svg-artwork",
          size: "medium",
          placement: { mode: "zone", zone: "main-right" },
          svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 240">
            <g id="membrane" stroke="#d6b36a" stroke-width="4" fill="#d6b36a" fill-opacity="0.18">
              <rect x="34" y="103" width="232" height="34" rx="17" /><circle cx="58" cy="108" r="7" /><circle cx="94" cy="108" r="7" /><circle cx="130" cy="108" r="7" /><circle cx="170" cy="108" r="7" /><circle cx="206" cy="108" r="7" /><circle cx="242" cy="108" r="7" />
              <circle cx="58" cy="132" r="7" /><circle cx="94" cy="132" r="7" /><circle cx="130" cy="132" r="7" /><circle cx="170" cy="132" r="7" /><circle cx="206" cy="132" r="7" /><circle cx="242" cy="132" r="7" />
            </g>
            <g id="sodium-in" stroke="#a5ead8" stroke-width="5" fill="#5cc8ae">
              <circle cx="105" cy="48" r="12" /><circle cx="142" cy="66" r="12" /><line x1="124" y1="77" x2="124" y2="176" /><path d="M124 194 L111 171 L137 171 Z" />
            </g>
            <g id="potassium-out" stroke="#f1d69a" stroke-width="5" fill="#d6b36a">
              <circle cx="190" cy="190" r="12" /><circle cx="226" cy="174" r="12" /><line x1="207" y1="162" x2="207" y2="65" /><path d="M207 47 L194 70 L220 70 Z" />
            </g>
          </svg>`,
        },
        { id: "recap-equation", kind: "equation", value: "-70\\rightarrow+40\\rightarrow-70mV", size: "small", placement: { mode: "zone", zone: "support" } },
        { id: "na-label", kind: "text", text: "Na⁺ enters: voltage rises", textRole: "caption", size: "small", placement: { mode: "relative", target: "cycle-diagram.sodium-in", relation: "left-of" } },
        { id: "k-label", kind: "text", text: "K⁺ exits: voltage recovers", textRole: "caption", size: "tiny", placement: { mode: "relative", target: "cycle-diagram.potassium-out", relation: "above" } },
        { id: "recap-closing", kind: "text", text: "The same electrical cycle carries each signal from input to axon terminals.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        {
          id: "draw-complete-pulse",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["recap-title", "recap-chart", "cycle-diagram.membrane"], entrance: "draw" },
            { do: "attention", target: "recap-chart.pt4", verb: "callout", text: "threshold", side: "north", style: "tag" },
          ],
        },
        {
          id: "show-sodium-phase",
          pace: "slow",
          actions: [
            { do: "show", targets: ["cycle-diagram.sodium-in", "na-label"], entrance: "draw" },
            { do: "attention", target: "recap-chart.peak", verb: "callout", text: "positive charge enters", side: "east", style: "tag" },
          ],
        },
        {
          id: "show-potassium-phase",
          pace: "slow",
          actions: [
            { do: "show", targets: ["cycle-diagram.potassium-out", "k-label"], entrance: "draw" },
            { do: "attention", target: "recap-chart.pt15", verb: "callout", text: "positive charge leaves", side: "south", style: "tag" },
          ],
        },
        {
          id: "land-closing",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["recap-equation", "recap-closing"], entrance: "word-by-word" },
            { do: "attention", target: "cycle-diagram.membrane", verb: "rings" },
          ],
        },
        { id: "hold-cycle", pace: "normal", actions: [{ do: "emphasize", target: "recap-equation", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
  ],
};
