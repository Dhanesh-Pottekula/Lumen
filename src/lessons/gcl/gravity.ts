/**
 * gravity — "Why the Moon Doesn't Fall: Newton, gravity & orbits", re-authored in the generic
 * component layer (GCL).
 *
 * Faithful re-telling of src/lessons/gravityOrbits.ts's pedagogical arc (NOT pixel-identical — the
 * original is bespoke hand-drawn art) using the flat-stream authoring schema: the apple's fall
 * (`motion: fall`), Newton's cannonball morphing into an orbit (`motion: morph` + `motion: orbit`),
 * the inverse-square law plotted as a `chart` function, a Kepler scatter proof, a camera log-zoom
 * push/pull, and a starfield via `particles`. CHALKBOARD theme (deep space), matching the original.
 *
 * Six scenes: the apple falls straight down onto a real garden → Newton's cannonball (parabolas that
 * MORPH into a closed orbit) → the inverse-square law (a labeled `chart` function plot) → Kepler's
 * ellipses + a labeled scatter proof (camera log-zoom) → the Moon orbiting Earth (fall + sideways) →
 * recap. Every scene fills the 920×430 frame with a central visual, labels, and supporting motion —
 * no element sits static & alone for more than ~2s.
 *
 * Emphasizes breadth per the P7 plan: motion (fall/orbit/morph), camera (pushIn/move), chart
 * (function/scatter), particles (starfield preset), attention (callout/spotlight), stat counters.
 *
 * Pure data — `renderFilm` compiles this to a seekable CanvasSlideDefinition. No clocks/Math.random.
 */
import { renderFilm } from "../../gcl";
import type { Film } from "../../gcl";
import type { CanvasSlideDefinition } from "../../slides/types";

// Shared ground line for scene 1 — the apple falls straight down onto it (same x throughout).
const APPLE_X = 276;
const APPLE_Y0 = 150;
const GROUND_Y = 360;

export const gravityFilm: Film = [
  // ── Scene 1 — The apple falls, straight down, onto a real garden ────────────────────────────────
  {
    type: "scene",
    theme: "CHALKBOARD",
    bg: ["#141d20", "#0b1214"],
    duration: 14,
    narration: [
      "A quiet garden, a still night — and then an apple lets go.",
      "It falls straight down, faster and faster, until it hits the earth.",
      "One man asked the question no one else did: why?",
    ],
  },
  { type: "particles", id: "stars1", preset: "dust", seed: 70711, cue: 0, layer: "bg", at: [460, 150], config: { count: 60 } },
  { type: "heading", id: "title1", text: "WHY THE MOON DOESN'T FALL", size: 26, cue: 0, at: [460, 40], enter: { type: "slam" } },
  { type: "text", id: "sub1", text: "newton, gravity & orbits", role: "caption", mode: "fade", cue: 0, at: [460, 64] },
  // ground line — a real horizon, not empty space
  {
    type: "shape", id: "ground", shape: "path", stroke: "#39463f", width: 3, at: [0, 0], cue: 0,
    points: [[20, GROUND_Y], [900, GROUND_Y]], enter: { type: "draw", dur: 1.2 },
  },
  // a proper tree: trunk + branch + a couple of leaf clumps (not a lone 4-point squiggle)
  {
    type: "shape", id: "trunk", shape: "path", stroke: "#5a4632", width: 10, at: [0, 0], cue: 0,
    points: [[120, GROUND_Y], [126, 260], [132, 190]], enter: { type: "draw", dur: 1 },
  },
  {
    type: "shape", id: "branch", shape: "path", stroke: "#6d5a44", width: 5, at: [0, 0], cue: 0,
    points: [[132, 190], [190, 168], [240, 152], [APPLE_X, APPLE_Y0 - 10]],
    enter: { type: "draw", dur: 1 }, start: "after",
  },
  {
    type: "shape", id: "branch2", shape: "path", stroke: "#6d5a44", width: 4, at: [0, 0], cue: 0,
    points: [[132, 190], [104, 160], [86, 130]], enter: { type: "draw", dur: 0.8 }, start: "after",
  },
  { type: "shape", id: "leaves1", shape: "disc", r: 46, fill: ["#3f6b46", "#1e3a22"], at: [110, 140], cue: 0, start: "after", enter: { type: "fade", dur: 0.8 } },
  { type: "shape", id: "leaves2", shape: "disc", r: 34, fill: ["#4a7a51", "#22421f"], at: [186, 118], cue: 0, start: "after", enter: { type: "fade", dur: 0.8 } },
  { type: "shape", id: "leaves3", shape: "disc", r: 30, fill: ["#3f6b46", "#1e3a22"], at: [230, 128], cue: 0, start: "after", enter: { type: "fade", dur: 0.8 } },
  // the apple hangs briefly (short — this is not the whole scene), then falls STRAIGHT down to the
  // ground line at the same x, with a bit of hang-wobble via oscillate before it lets go.
  {
    type: "shape", id: "apple", shape: "circle", r: 12, fill: "#d1453f", at: [APPLE_X, APPLE_Y0], cue: 0,
    enter: { type: "fade", dur: 0.6 },
    oscillate: { axis: "y", amp: 2.5, period: 2.2, mode: "wobble" },
    motion: { kind: "fall", to: [APPLE_X, GROUND_Y - 12], gravity: 420, bounce: 10, at: 1.6, dur: 1.3 },
  },
  { type: "attention", verb: "spark", target: "apple", cue: 1 },
  { type: "attention", verb: "callout", target: [APPLE_X, GROUND_Y - 12], text: "straight down — every time, faster and faster", side: "e", route: "elbow", color: "#ffe08a", cue: 1 },
  { type: "glow", id: "impactGlow", r: 30, color: "#ffe08a", at: [APPLE_X, GROUND_Y], cue: 2 },
  { type: "particles", id: "dust1", preset: "dust", seed: 812, at: [APPLE_X, GROUND_Y], cue: 2, config: { count: 24, size: [3, 6] } },
  { type: "text", id: "why1", text: "why?", role: "title", mode: "word", cue: 2, at: [700, 320] },
  { type: "text", id: "newton1", text: "isaac newton, 1687", role: "caption", mode: "fade", cue: 2, at: [700, 350] },

  // ── Scene 2 — Newton's cannonball: parabola morphs into an orbit ──────────────────────────────────
  {
    type: "scene",
    theme: "CHALKBOARD",
    duration: 15,
    narration: [
      "Newton imagined a cannon on an impossibly tall mountain.",
      "Fire slow, and the ball arcs down and lands. Fire faster, it flies farther.",
      "Fire fast enough, and it never lands — it keeps falling AROUND the earth. That is an orbit.",
    ],
  },
  { type: "particles", id: "stars2", preset: "dust", seed: 812, cue: 0, layer: "bg", at: [300, 120], config: { count: 50 } },
  { type: "heading", id: "title2", text: "NEWTON'S CANNONBALL", size: 22, cue: 0, at: [180, 36] },
  {
    type: "shape", id: "earth2", shape: "disc", r: 90, fill: ["#5aa0d0", "#1c3f5c"], shine: true,
    at: [620, 290], cue: 0, enter: { type: "fade", dur: 1 },
  },
  { type: "text", id: "earthLbl2", text: "earth", role: "caption", mode: "fade", cue: 0, at: [620, 384] },

  {
    type: "prop", id: "cannon2", name: "cannon", at: [600, 175], size: 1.1, angle: 0, cue: 0,
    enter: { type: "fade" }, exit: { type: "fade", out: 8.6, dur: 0.8 },
  },
  // shot 1 — slow, short parabola, lands nearby (formula parabola anchored at the muzzle: u=0 is the
  // muzzle itself, since fx(0)=fy(0)=0 and parametric points are offset by the resolved `at`).
  {
    type: "parametric", id: "shot1", at: "cannon2.muzzle", fx: "-140*u", fy: "-190*u + 430*u*u",
    uDomain: [0, 1], color: "#9db3a6", width: 2.2, cue: 1,
    enter: { type: "draw", dur: 1 }, exit: { type: "fade", out: 8.6, dur: 0.8 },
  },
  // shot 2 — faster, flies farther before landing
  {
    type: "parametric", id: "shot2", at: "cannon2.muzzle", fx: "-260*u", fy: "-150*u + 300*u*u",
    uDomain: [0, 1], color: "#ffd08a", width: 2.4, cue: 1, start: "after",
    enter: { type: "draw", dur: 1 }, exit: { type: "fade", out: 8.6, dur: 0.8 },
  },
  { type: "text", id: "fasterQ", text: "fire faster still?", role: "body", size: 16, color: "#ffe08a", mode: "fade", cue: 1, at: [180, 90], exit: { type: "fade", out: 8.6, dur: 0.6 } },
  // the showpiece: fire fast enough and the ball never lands — it falls forever AROUND the earth.
  // A full ORBIT RING circle hugging the earth, drawn on, is the "orbit"; the cannonball rides it.
  {
    type: "shape", id: "orbitRing", shape: "circle", r: 124, stroke: "#ffe08a", width: 2.4, fill: "none",
    at: [620, 290], cue: 2, enter: { type: "draw", dur: 1.6 },
  },
  // the cannonball now rides the ring, rotating continuously around the earth (the cannon is gone by now)
  {
    type: "shape", id: "cannonball", shape: "circle", r: 7, fill: "#fff2c8", at: [620, 290], cue: 2,
    enter: { type: "fade" },
    motion: { kind: "orbit", center: "earth2", radius: 124, from: -1.6, turns: 4, at: 9, dur: 6 },
  },
  { type: "glow", id: "ballGlow", r: 14, color: "#fff2c8", at: "cannonball", cue: 2 },
  { type: "attention", verb: "callout", target: "orbitRing.left", text: "an orbit — perpetual free-fall", side: "w", route: "elbow", color: "#ffe08a", cue: 2 },
  { type: "text", id: "orbitLbl2", text: "faster still: the ball keeps falling AROUND the earth", role: "caption", mode: "fade", cue: 2, at: [620, 60] },

  // ── Scene 3 — The law: F = G m1 m2 / r², the inverse-square plot ─────────────────────────────────
  {
    type: "scene",
    theme: "CHALKBOARD",
    duration: 14,
    narration: [
      "He wrote it as one law of universal gravitation.",
      "Every mass pulls every other mass, proportional to both — and falling off with the square of the distance.",
      "Double the distance, and the pull drops to a quarter. That r-squared is everything.",
    ],
  },
  { type: "particles", id: "stars3", preset: "dust", seed: 33, cue: 0, layer: "bg", at: [460, 100], config: { count: 50 } },
  { type: "equation", id: "law", tex: "F = G\\frac{m_1 m_2}{r^2}", size: 32, align: "center", cue: 0, at: [460, 42] },
  {
    type: "shape", id: "m1", shape: "circle", r: 15, fill: "#d7c48a", at: [120, 300], cue: 1,
    enter: { type: "fade" }, oscillate: { axis: "scale", amp: 0.04, period: 2.6, mode: "breathe" },
  },
  { type: "text", id: "m1Lbl", text: "m₁", role: "caption", mode: "fade", cue: 1, at: [120, 328] },
  {
    type: "shape", id: "m2", shape: "disc", r: 28, fill: ["#5aa0d0", "#1c3f5c"], shine: true, at: [300, 300], cue: 1,
    enter: { type: "fade" }, oscillate: { axis: "scale", amp: 0.03, period: 3, mode: "breathe" },
  },
  { type: "text", id: "m2Lbl", text: "m₂", role: "caption", mode: "fade", cue: 1, at: [300, 336] },
  { type: "attention", verb: "pointer", target: "m2", from: "m1", cue: 1, color: "#ffe08a" },
  { type: "text", id: "rLbl", text: "r", role: "caption", mode: "fade", cue: 1, at: [210, 282] },
  {
    type: "chart", id: "invSquare", chart: "function", cue: 2, at: [700, 220], w: 340, h: 220,
    fn: "1/(x*x)", xDomain: [1, 6], yDomain: [0, 1], xLabel: "distance r", yLabel: "force F",
  },
  { type: "attention", verb: "callout", target: "invSquare.center", text: "F ∝ 1 / r²", side: "n", route: "none", color: "#ffe08a", cue: 2 },
  { type: "stat", id: "quarterStat", value: 0.25, label: "pull at double the distance", cue: 2, at: [150, 380] },

  // ── Scene 4 — Ellipses & Kepler: camera log-zoom, scatter proof ──────────────────────────────────
  {
    type: "scene",
    theme: "CHALKBOARD",
    duration: 14,
    narration: [
      "Zoom out to the whole solar system.",
      "Kepler saw that orbits aren't perfect circles — they're ellipses, with the sun at one focus.",
      "Plot the period squared against the orbit size cubed, and every planet falls on a straight line.",
    ],
  },
  { type: "particles", id: "stars4", preset: "dust", seed: 91, cue: 0, layer: "bg", at: [300, 235], config: { count: 55 } },
  { type: "camera", to: "sun", zoom: 2.2, kind: "pushIn", cue: 0 },
  { type: "camera", to: [300, 220], zoom: 1, kind: "move", cue: 1 },
  {
    type: "shape", id: "sun", shape: "disc", r: 20, fill: ["#ffe08a", "#a9803f"], shine: true, at: [300, 235], cue: 0,
    enter: { type: "fade" }, oscillate: { axis: "scale", amp: 0.06, period: 3, mode: "breathe" },
  },
  { type: "text", id: "sunLbl", text: "sun", role: "caption", mode: "fade", cue: 0, at: [300, 268] },
  // a clean, true ellipse (center [420,235], semi-axes 170×120) with the sun sitting at the LEFT
  // FOCUS [300,235] (c = √(170²−120²) ≈ 120) — Kepler's first law: a real parametric formula
  // (x,y) = center + (rx·cos(2πu), ry·sin(2πu)), not a lumpy hand-drawn loop.
  {
    type: "parametric", id: "ellipse1", at: [420, 235],
    fx: "170*cos(6.28319*u)", fy: "120*sin(6.28319*u)", uDomain: [0, 1],
    color: "#9db3a6", width: 2, cue: 1, enter: { type: "draw" },
  },
  {
    type: "shape", id: "planet4", shape: "circle", r: 7, fill: "#a8d4ff", at: [590, 235], cue: 1,
    enter: { type: "fade" },
    motion: { kind: "orbit", center: [420, 235], rx: 170, ry: 120, from: 0, turns: 1, at: 2, dur: 8 },
  },
  { type: "text", id: "planetLbl4", text: "a planet", role: "caption", mode: "fade", cue: 1, at: [590, 262] },
  { type: "attention", verb: "callout", target: [300, 235], title: "focus", text: "the sun sits at one focus", side: "n", route: "elbow", color: "#9db3a6", cue: 1 },
  { type: "equation", id: "keplerLaw", tex: "T^2 \\propto a^3", size: 26, align: "center", cue: 2, at: [700, 60] },
  {
    type: "chart", id: "keplerScatter", chart: "scatter", cue: 2, at: [700, 250], w: 330, h: 200,
    series: [[0.06, 0.06], [0.37, 0.38], [1, 1], [3.5, 3.5], [140, 140]],
    xLabel: "a³ (AU³)", yLabel: "T² (yr²)",
  },
  { type: "attention", verb: "highlight", target: "keplerScatter.peak", cue: 2 },
  { type: "text", id: "keplerFit", text: "every planet falls on a straight line", role: "caption", mode: "fade", cue: 2, at: [700, 372] },
  { type: "stat", id: "orbitalSpeed", value: 29.8, unit: " km/s", label: "earth's orbital speed", cue: 2, decimals: 1, at: [130, 380] },

  // ── Scene 5 — The Moon: fall + sideways motion = an orbit ────────────────────────────────────────
  {
    type: "scene",
    theme: "CHALKBOARD",
    duration: 14,
    narration: [
      "So back to the moon — why doesn't IT fall?",
      "It does. It's falling toward earth every instant, but it also races sideways.",
      "Fall plus sideways motion is a curve that never quite reaches the ground. It orbits.",
    ],
  },
  { type: "particles", id: "stars5", preset: "dust", seed: 55, cue: 0, layer: "bg", at: [270, 235], config: { count: 55 } },
  { type: "particles", id: "comet", preset: "sparks", seed: 12, cue: 2, at: [780, 90] },
  {
    type: "shape", id: "earth5", shape: "disc", r: 78, fill: ["#5aa0d0", "#1c3f5c"], shine: true, at: [270, 235], cue: 0,
    enter: { type: "fade" },
  },
  { type: "text", id: "earthLbl5", text: "earth", role: "caption", mode: "fade", cue: 0, at: [270, 330] },
  {
    type: "shape", id: "moonOrbitRing", shape: "circle", r: 150, fill: "none", stroke: "#4a5a55", width: 1.4, at: [270, 235], cue: 0,
    enter: { type: "draw", dur: 1.4 },
  },
  {
    type: "shape", id: "moon", shape: "disc", r: 14, fill: ["#e6ebee", "#9aa2a7"], at: [270, 85], cue: 1,
    motion: { kind: "orbit", center: "earth5", radius: 150, from: -1.5708, turns: 3, at: 0, dur: 9 },
  },
  { type: "attention", verb: "callout", target: [270, 85], text: "the moon", side: "n", route: "none", color: "#e6ebee", cue: 1 },
  { type: "attention", verb: "callout", target: "moonOrbitRing.right", text: "falling forever, missing forever", side: "e", route: "curve", color: "#a8d4ff", cue: 2 },
  { type: "text", id: "decompLbl5", text: "fall toward earth + sideways speed = orbit", role: "caption", mode: "fade", cue: 2, at: [460, 400] },

  // ── Scene 6 — Recap ──────────────────────────────────────────────────────────────────────────────
  {
    type: "scene",
    theme: "CHALKBOARD",
    duration: 14,
    narration: [
      "One law, one idea: the fall of an apple and the sweep of a galaxy are the same equation.",
      "And it reaches all the way to the moon — 384,400 kilometres away.",
      "Gravity: the thread that holds the universe together.",
    ],
  },
  { type: "particles", id: "stars6", preset: "dust", seed: 4, cue: 0, layer: "bg", at: [460, 150], config: { count: 60 } },
  { type: "text", id: "recapHead", text: "One law — from apples to galaxies", role: "title", mode: "word", cue: 0, at: [460, 40] },
  {
    type: "equation", id: "recapLaw", tex: "F = G\\frac{m_1 m_2}{r^2}", size: 38, align: "center", cue: 1, at: [460, 180],
    emphasis: { kind: "pulse", cue: 1 },
  },
  { type: "glow", id: "recapGlow", r: 110, color: "#ffe08a", at: [460, 180], cue: 1 },
  { type: "stat", id: "moonDist", value: 384400, unit: " km", label: "kilometres to the Moon", commas: true, cue: 2, at: [460, 300] },
  { type: "text", id: "closing", text: "gravity holds the universe together", role: "caption", mode: "fade", cue: 2, at: [460, 400] },
];

/** Compiled, seekable CanvasSlideDefinition — this is what App.tsx renders. */
export const gravityLessonGCL: CanvasSlideDefinition = renderFilm(gravityFilm);
