/**
 * neuron — "The Neuron Fires", re-authored in the generic component layer (GCL).
 *
 * Faithful re-telling of src/lessons/neuronActionPotential.ts's pedagogical arc (NOT pixel-identical —
 * the original is bespoke hand-drawn art) using the flat-stream authoring schema: a membrane diagram
 * (shapes + callouts targeting sub-anchors), the action-potential curve (a `chart` line, built across
 * scenes 3/4/6), ion motion (`particles`), a camera push-in onto the membrane and a pull-back over the
 * travelling wave, the Nernst equation, and a semantic ion `legend`. TEXTBOOK theme, matching the
 * original. Six scenes: anatomy → resting membrane → threshold & depolarization → repolarization &
 * the travelling wave → recap.
 *
 * Pure data — `renderFilm` compiles this to a seekable CanvasSlideDefinition. No clocks/Math.random.
 */
import { renderFilm } from "../../gcl";
import type { Film } from "../../gcl";
import type { CanvasSlideDefinition } from "../../slides/types";

// Semantic ion colors, matching the original bespoke lesson's registry order (Na⁺ first → teal-ish,
// K⁺ second → amber-ish) — kept as literal hex here since GCL components take plain color strings.
const NA = "#5cc8ae";
const K = "#e8a13c";

// The classic action-potential curve (mV vs. normalized time), shared by scenes 3, 4 and 6's charts.
const AP_CURVE: [number, number][] = [
  [0.0, -70], [0.08, -70], [0.16, -68], [0.22, -62], [0.27, -55], [0.31, -40],
  [0.35, -10], [0.39, 20], [0.43, 38], [0.46, 40], [0.5, 30], [0.55, 5],
  [0.6, -25], [0.66, -55], [0.72, -72], [0.78, -82], [0.84, -80], [0.9, -76],
  [0.96, -72], [1.0, -70],
];
// The rising portion only (rest → threshold → peak) for scene 3's live-building curve.
const AP_RISE: [number, number][] = AP_CURVE.filter(([x]) => x <= 0.46);
// The falling portion (peak → trough → rest) for scene 4's live-building curve.
const AP_FALL: [number, number][] = AP_CURVE.filter(([x]) => x >= 0.46);

export const neuronFilm: Film = [
  // ── Scene 1 — The messenger: full neuron anatomy, labeled ──────────────────────────────────────
  {
    type: "scene",
    theme: "TEXTBOOK",
    bg: ["#182634", "#101a22"],
    duration: 13,
    narration: [
      "The neuron.",
      "Dendrites listen, the soma decides, and one long axon carries the signal away.",
      "When it speaks, it speaks in a single electrical pulse: the action potential.",
    ],
  },
  { type: "particles", id: "ambient1", preset: "dust", seed: 4242, at: [460, 215], layer: "bg", cue: 0, config: { count: 40 } },
  { type: "heading", id: "title1", text: "THE NEURON FIRES", size: 34, cue: 0, at: [460, 46], enter: { type: "slam" } },
  { type: "text", id: "sub1", text: "anatomy of an action potential", role: "caption", mode: "fade", cue: 0, at: [460, 72] },
  // soma + dendrites as ONE reusable `neuronCell` prop (was 5 hand-plotted shapes) — the whole cell
  // breathes; its published sub-anchors (soma, dendriteTip1-4, axonRoot) let callouts/camera target
  // parts by name instead of raw pixels.
  {
    type: "prop", id: "cell1", name: "neuronCell", at: [190, 220], size: 1.2, cue: 1,
    enter: { type: "fade", dur: 0.8 }, oscillate: { axis: "scale", amp: 0.05, period: 3, mode: "breathe" },
  },
  {
    type: "shape", id: "axon", shape: "path", stroke: "#cfe0e6", width: 4.2, at: [0, 0], cue: 1,
    points: [[222, 224], [320, 218], [410, 216], [500, 218], [590, 216], [680, 218], [762, 217], [812, 216]],
    enter: { type: "draw", dur: 2.2 },
  },
  { type: "shape", id: "myelin1", shape: "disc", r: 15, fill: ["#e8c98a", "#a9803f"], at: [320, 218], cue: 1, start: "after", enter: { type: "fade" } },
  { type: "shape", id: "myelin2", shape: "disc", r: 15, fill: ["#e8c98a", "#a9803f"], at: [410, 216], cue: 1, start: "after", enter: { type: "fade" } },
  { type: "shape", id: "myelin3", shape: "disc", r: 15, fill: ["#e8c98a", "#a9803f"], at: [500, 218], cue: 1, start: "after", enter: { type: "fade" } },
  { type: "shape", id: "myelin4", shape: "disc", r: 15, fill: ["#e8c98a", "#a9803f"], at: [590, 216], cue: 1, start: "after", enter: { type: "fade" } },
  { type: "shape", id: "myelin5", shape: "disc", r: 15, fill: ["#e8c98a", "#a9803f"], at: [680, 218], cue: 1, start: "after", enter: { type: "fade" } },
  {
    type: "shape", id: "terminal1", shape: "path", stroke: "#cfe0e6", width: 2.4, at: [0, 0], cue: 1,
    points: [[812, 216], [846, 196], [872, 184]], enter: { type: "draw" },
  },
  {
    type: "shape", id: "terminal2", shape: "path", stroke: "#cfe0e6", width: 2.4, at: [0, 0], cue: 1,
    points: [[812, 216], [852, 216], [882, 214]], enter: { type: "draw" },
  },
  {
    type: "shape", id: "terminal3", shape: "path", stroke: "#cfe0e6", width: 2.4, at: [0, 0], cue: 1,
    points: [[812, 216], [846, 238], [874, 250]], enter: { type: "draw" },
  },
  { type: "attention", verb: "callout", target: "cell1.dendriteTip1", text: "dendrites — listen", side: "n", route: "elbow", container: "text", color: "#7fb7c8", cue: 2 },
  { type: "attention", verb: "callout", target: "cell1.soma", title: "soma", text: "decides whether to fire", side: "s", route: "straight", container: "pill", color: "#5cc8ae", cue: 2 },
  { type: "attention", verb: "callout", target: [500, 232], title: "axon + myelin", text: "carries the pulse away, insulated in fatty sheaths", side: "s", route: "elbow", container: "pill", color: "#e8c98a", cue: 2 },
  { type: "attention", verb: "callout", target: [780, 200], text: "axon terminals", side: "nw", route: "elbow", container: "text", color: "#9fc7d6", cue: 2 },
  { type: "camera", to: "cell1.soma", zoom: 1.12, kind: "pushIn", cue: 2 },
  { type: "text", id: "flowCaption1", text: "signal flow:  dendrites  →  soma  →  axon  →  terminals", role: "caption", size: 14, color: "#93a4b0", mode: "fade", cue: 2, at: [460, 388] },

  // ── Scene 2 — At rest, −70 mV: the membrane, ion gradients, Nernst equation ─────────────────────
  {
    type: "scene",
    theme: "TEXTBOOK",
    bg: ["#16303a", "#221a2c"],
    duration: 14,
    narration: [
      "At rest, the neuron sits at about minus seventy millivolts.",
      "Sodium waits outside, potassium sits inside — a charged truce across the membrane.",
      "The Nernst equation sets that resting voltage from the ion gradients.",
    ],
  },
  { type: "text", id: "outsideLbl", text: "OUTSIDE THE CELL", role: "caption", size: 13, color: "#7fb7c8", cue: 0, at: [200, 66] },
  { type: "text", id: "insideLbl", text: "INSIDE THE CELL", role: "caption", size: 13, color: "#b58ad6", cue: 0, at: [200, 372] },
  {
    type: "shape", id: "membrane", shape: "path", stroke: "#d6b36a", width: 10, at: [0, 0], cue: 0,
    points: [[70, 220], [220, 219], [370, 221], [520, 219], [670, 220], [850, 220]],
    enter: { type: "draw", dur: 1.6 },
  },
  { type: "particles", id: "naOut1", preset: "energy", seed: 101, at: [180, 130], cue: 1, config: { count: 10, size: [4, 5], color: NA } },
  { type: "particles", id: "naOut2", preset: "energy", seed: 102, at: [420, 110], cue: 1, config: { count: 10, size: [4, 5], color: NA } },
  { type: "particles", id: "naOut3", preset: "energy", seed: 103, at: [660, 130], cue: 1, config: { count: 10, size: [4, 5], color: NA } },
  { type: "particles", id: "kIn1", preset: "energy", seed: 201, at: [220, 320], cue: 1, config: { count: 9, size: [4, 5], color: K } },
  { type: "particles", id: "kIn2", preset: "energy", seed: 202, at: [480, 340], cue: 1, config: { count: 9, size: [4, 5], color: K } },
  { type: "particles", id: "kIn3", preset: "energy", seed: 203, at: [700, 320], cue: 1, config: { count: 9, size: [4, 5], color: K } },
  { type: "legend", id: "ionLegend", categories: ["Na⁺ (sodium)", "K⁺ (potassium)"], cue: 1, at: [800, 90] },
  { type: "stat", id: "restStat", value: -70, unit: "mV", label: "resting membrane potential", cue: 1, at: [460, 96], color: "#e8a13c" },
  {
    type: "equation", id: "nernst", tex: "E_{ion} = \\frac{RT}{zF}\\ln\\frac{[ion]_{out}}{[ion]_{in}}",
    size: 24, align: "center", cue: 2, at: [460, 388],
  },
  { type: "attention", verb: "callout", target: [370, 221], title: "lipid bilayer", text: "the membrane wall", side: "s", route: "elbow", container: "pill", color: "#d6b36a", cue: 2 },
  { type: "camera", to: [460, 220], zoom: 1.14, kind: "pushIn", cue: 0 },

  // ── Scene 3 — Threshold & the spike: Na⁺ channels open, depolarization ──────────────────────────
  {
    type: "scene",
    theme: "TEXTBOOK",
    bg: ["#14212b", "#221a2c"],
    duration: 15,
    narration: [
      "A stimulus arrives, nudging the voltage upward toward the threshold.",
      "At minus fifty-five millivolts — will it fire? It crosses. Sodium channels snap open.",
      "The membrane rockets to plus forty millivolts. This is depolarization.",
    ],
  },
  { type: "heading", id: "title3", text: "THRESHOLD & THE SPIKE", size: 22, cue: 0, at: [230, 44] },
  {
    type: "shape", id: "stimPath", shape: "path", stroke: "#5b7686", width: 3, at: [0, 0], cue: 0,
    points: [[120, 120], [190, 170], [250, 210], [300, 230]], enter: { type: "draw" },
  },
  {
    type: "shape", id: "membrane3", shape: "path", stroke: "#3a5560", width: 3, at: [0, 0], cue: 0,
    points: [[60, 250], [200, 250], [340, 250], [440, 250]], enter: { type: "draw" },
  },
  { type: "particles", id: "stimFlash", preset: "sparks", seed: 55, at: [250, 210], cue: 0, config: { color: "#8fe8ff" } },
  { type: "text", id: "thresholdQ", text: "threshold −55 mV — will it fire?", role: "body", size: 16, color: "#e8a13c", mode: "fade", cue: 1, at: [250, 90], exit: { type: "fade", out: 9.2, dur: 0.6 } },
  { type: "stat", id: "voltMeter", value: -55, unit: "mV", label: "membrane voltage", cue: 1, at: [250, 170], color: "#e8a13c", decimals: 0 },
  {
    type: "shape", id: "naChannelClosed", shape: "polygon", sides: 4, r: 20, stroke: NA, width: 3, fill: "none",
    at: [300, 250], cue: 1, exit: { type: "fade", out: 9.2, dur: 0.6 },
  },
  { type: "particles", id: "naFlood", preset: "energy", seed: 77, at: [300, 220], cue: 2, config: { count: 30, rate: 34, speed: [70, 130], angle: Math.PI / 2, spread: 0.5, color: NA, blend: "lighter" } },
  {
    type: "chart", id: "apChart3", chart: "line", cue: 1, at: [660, 230], w: 420, h: 210,
    series: AP_RISE, xDomain: [0, 0.46], yDomain: [-90, 50], color: "#5cc8ae", xLabel: "time", yLabel: "mV",
  },
  { type: "text", id: "peakLbl", text: "+40 mV — peak", role: "caption", size: 14, color: "#8fe8ff", mode: "fade", cue: 2, at: [780, 100] },
  { type: "attention", verb: "callout", target: "apChart3.last", title: "Depolarization", text: "Na⁺ rushes in", side: "w", route: "elbow", container: "pill", color: "#5cc8ae", cue: 2 },
  { type: "attention", verb: "spark", target: "apChart3.last", cue: 2 },

  // ── Scene 4 — Repolarization, hyperpolarization & recovery ──────────────────────────────────────
  {
    type: "scene",
    theme: "TEXTBOOK",
    bg: ["#16222c", "#101820"],
    duration: 14,
    narration: [
      "Now potassium channels open, and potassium leaves the cell — the voltage falls.",
      "That dip below rest is hyperpolarization; during it the neuron cannot fire again.",
      "Then it settles back to minus seventy, ready once more.",
    ],
  },
  { type: "heading", id: "title4", text: "REPOLARIZATION & RECOVERY", size: 22, cue: 0, at: [460, 40] },
  {
    type: "chart", id: "apChart4", chart: "line", cue: 0, at: [460, 240], w: 700, h: 220,
    series: AP_FALL, xDomain: [0.46, 1.0], yDomain: [-90, 50], color: "#e8a13c", xLabel: "time", yLabel: "mV",
  },
  {
    type: "shape", id: "kChannel", shape: "polygon", sides: 4, r: 18, stroke: K, width: 3, fill: "none",
    at: [560, 370], cue: 0, exit: { type: "fade", out: 13.0, dur: 0.6 },
  },
  { type: "particles", id: "kOutflow", preset: "energy", seed: 91, at: [560, 350], cue: 0, config: { count: 26, rate: 26, speed: [55, 110], angle: -Math.PI / 2, spread: 0.6, color: K, blend: "lighter" } },
  { type: "attention", verb: "callout", target: "apChart4.pt3", title: "Repolarization", text: "K⁺ flows out", side: "ne", route: "elbow", container: "pill", color: K, cue: 0 },
  { type: "attention", verb: "callout", target: "apChart4.pt7", title: "Hyperpolarization", text: "dips below rest", side: "nw", route: "elbow", container: "pill", color: "#a06be8", cue: 1 },
  { type: "attention", verb: "spotlight", target: "apChart4.pt7", radius: 60, cue: 1 },
  { type: "text", id: "refractoryLbl", text: "refractory period — can't fire again yet", role: "caption", size: 13, color: "#c9a6ee", mode: "fade", cue: 1, at: [700, 370] },
  { type: "attention", verb: "callout", target: "apChart4.last", text: "back to rest, −70 mV", side: "n", route: "elbow", container: "text", color: "#5cc8ae", cue: 2 },

  // ── Scene 5 — The wave travels: saltatory conduction down the axon ──────────────────────────────
  {
    type: "scene",
    theme: "TEXTBOOK",
    bg: ["#17242f", "#0f1720"],
    duration: 13,
    narration: [
      "And the spike does not stay put — it travels.",
      "It leaps from node to node down the myelinated axon, fast and clean.",
      "Reaching the terminals, it hands the message to the next cell.",
    ],
  },
  { type: "particles", id: "ambient5", preset: "dust", seed: 909, at: [460, 300], layer: "bg", cue: 0, config: { count: 30 } },
  { type: "heading", id: "title5", text: "THE WAVE TRAVELS", size: 22, cue: 0, at: [460, 40] },
  // the cell body, dimmer here (it has already fired) — same reusable `neuronCell` prop as scene 1
  { type: "prop", id: "cell5", name: "neuronCell", at: [190, 220], size: 1.2, color: "#4f9a86", cue: 0, enter: { type: "fade", dur: 0.6 } },
  {
    type: "shape", id: "axon5", shape: "path", stroke: "#b9ccd4", width: 4, at: [0, 0], cue: 0,
    points: [[222, 224], [320, 218], [410, 216], [500, 218], [590, 216], [680, 218], [762, 217], [812, 216]],
  },
  { type: "shape", id: "myelin5a", shape: "disc", r: 14, fill: ["#e8c98a", "#a9803f"], at: [320, 218], cue: 0 },
  { type: "shape", id: "myelin5b", shape: "disc", r: 14, fill: ["#e8c98a", "#a9803f"], at: [410, 216], cue: 0 },
  { type: "shape", id: "myelin5c", shape: "disc", r: 14, fill: ["#e8c98a", "#a9803f"], at: [500, 218], cue: 0 },
  { type: "shape", id: "myelin5d", shape: "disc", r: 14, fill: ["#e8c98a", "#a9803f"], at: [590, 216], cue: 0 },
  { type: "shape", id: "myelin5e", shape: "disc", r: 14, fill: ["#e8c98a", "#a9803f"], at: [680, 218], cue: 0 },
  {
    type: "shape", id: "terminal1b", shape: "path", stroke: "#b9ccd4", width: 2.2, at: [0, 0], cue: 0,
    points: [[812, 216], [846, 196], [872, 184]],
  },
  {
    type: "shape", id: "terminal2b", shape: "path", stroke: "#b9ccd4", width: 2.2, at: [0, 0], cue: 0,
    points: [[812, 216], [852, 216], [882, 214]],
  },
  {
    type: "shape", id: "spike", shape: "circle", r: 8, fill: "#eaffff", at: [222, 224], cue: 1,
    motion: { kind: "along", path: [[222, 224], [320, 218], [410, 216], [500, 218], [590, 216], [680, 218], [762, 217], [812, 216]], at: 0, dur: 6.4 },
  },
  { type: "glow", id: "spikeGlow", r: 24, color: "#8fe8ff", at: "spike", cue: 1 },
  { type: "attention", verb: "spark", target: "myelin5a", cue: 1 },
  { type: "attention", verb: "spark", target: "myelin5c", cue: 2 },
  { type: "attention", verb: "spark", target: "myelin5e", cue: 2 },
  { type: "text", id: "saltatoryLbl", text: "saltatory conduction — node to node", role: "caption", size: 14, color: "#9fc7d6", mode: "fade", cue: 1, at: [460, 380] },
  { type: "attention", verb: "callout", target: [846, 190], text: "message handed to the next cell", side: "w", route: "elbow", container: "text", color: "#5cc8ae", cue: 2 },
  { type: "camera", to: "cell5.soma", zoom: 1.35, kind: "pushIn", cue: 0 },
  { type: "camera", to: [460, 220], zoom: 1.0, kind: "move", cue: 1 },

  // ── Scene 6 — Recap: the full curve, the equation, the scale of it ─────────────────────────────
  {
    type: "scene",
    theme: "TEXTBOOK",
    bg: ["#16222c", "#0e1720"],
    duration: 14,
    narration: [
      "So that is the action potential — one clean electrical pulse.",
      "You carry roughly eighty-six billion neurons, each able to fire up to a thousand times a second.",
      "Eighty-six billion messengers, firing in the dark. That is you, thinking.",
    ],
  },
  { type: "text", id: "recapHead", text: "One electrical pulse, eighty-six billion messengers", role: "title", size: 20, mode: "word", cue: 0, at: [460, 32] },
  {
    type: "chart", id: "apChart6", chart: "line", cue: 0, at: [460, 200], w: 700, h: 180,
    series: AP_CURVE, xDomain: [0, 1], yDomain: [-90, 50], color: "#5cc8ae", xLabel: "time", yLabel: "mV",
  },
  { type: "attention", verb: "callout", target: "apChart6.pt4", text: "threshold", side: "n", route: "none", container: "tag", color: "#e8a13c", cue: 0 },
  { type: "attention", verb: "callout", target: "apChart6.peak", text: "depolarize", side: "e", route: "none", container: "tag", color: "#5cc8ae", cue: 0 },
  { type: "attention", verb: "callout", target: "apChart6.pt15", text: "hyperpolarize", side: "s", route: "none", container: "tag", color: "#a06be8", cue: 0 },
  {
    type: "equation", id: "recapEq", tex: "E_{ion} = \\frac{RT}{zF}\\ln\\frac{[ion]_{out}}{[ion]_{in}}",
    size: 16, align: "center", cue: 1, at: [250, 350], emphasis: { kind: "pulse", cue: 1 },
  },
  { type: "stat", id: "neuronStat", value: 86000000000, unit: "neurons", label: "up to 1,000 spikes/sec each", commas: true, cue: 1, at: [670, 350], size: 20, color: "#eef5ef" },
  { type: "text", id: "closing", text: "eighty-six billion messengers, firing in the dark.", role: "caption", size: 15, color: "#dfe8ef", mode: "word", cue: 2, at: [460, 410] },
];

/** Compiled, seekable CanvasSlideDefinition — this is what App.tsx renders. */
export const neuronLessonGCL: CanvasSlideDefinition = renderFilm(neuronFilm);
