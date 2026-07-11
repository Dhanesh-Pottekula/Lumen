/**
 * The Neuron Fires — anatomy of an action potential.
 *
 * A six-scene lesson film for the Lumen engine (theme TEXTBOOK), composed on one seekable timeline.
 * Every scene's render(ctx, t, frame) is a pure function of its LOCAL time t (0..duration): no clocks,
 * no Math.random. All pseudo-randomness comes from module-level prng()-seeded arrays built once.
 *
 * Layer routing follows the house model: background washes → bg, main subject → mid, glows/particles
 * → fg, labels/callouts/text → annotation, filmic grade → fx (via frame.grade()). Scenes fall back to
 * the single ctx (clearRect + return) when no frame is supplied.
 */
import {
  breathe,
  fadeText,
  lerp,
  phase,
  prng,
  radialGlow,
  wobble,
} from "../slides/anim";
import type { CanvasSlideDefinition } from "../slides/types";
import { composeSlides } from "../slides/compose";
import { TEXTBOOK } from "../render/theme";
import type { Pt } from "../render/strokes";
import { drawOn, handFollower, passingFlash, tracedPath } from "../render/strokeVerbs";
import { flash, highlightRing, sparkFlash, spotlightFocus } from "../render/focus";
import { callout } from "../render/callout";
import { emphasis, flashOverlay, predictReveal, punchScale } from "../render/sequence";
import { counterValue, drawCounter, drawSlam, drawWordReveal, formatNumber } from "../render/type-motion";
import { emit, type EmitterConfig } from "../render/particles";
import { focusOn, lerpCamera, pushIn } from "../render/camera";
import { axes, lineChart, makePlot } from "../render/charts";
import { drawMorph } from "../render/morph";
import { colorSemantics } from "../render/icons";
import { drawMath } from "../render/mathtext";

const W = 920;
const H = 430;

const DISPLAY = "-apple-system, system-ui, sans-serif";

// Semantic ion colors — one registry shared across every scene so Na⁺ and K⁺ keep their identity.
const IONS = colorSemantics();
const NA = IONS.colorFor("Na⁺ (sodium)"); // first → palette[0]
const K = IONS.colorFor("K⁺ (potassium)"); // second → palette[1]

// A small hand/pen sprite drawn to an offscreen canvas ONCE (deterministic; no external asset).
let penSprite: HTMLCanvasElement | null = null;
function pen(): CanvasImageSource | null {
  if (penSprite) return penSprite;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const g = c.getContext("2d");
  if (!g) return null;
  // a simple stylus: a slim wedge pointing to the origin (top-left in the follower's box)
  g.translate(4, 4);
  g.fillStyle = "#d7dde3";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(20, 6);
  g.lineTo(34, 30);
  g.lineTo(28, 36);
  g.lineTo(6, 20);
  g.closePath();
  g.fill();
  g.fillStyle = "#8a94a0";
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(20, 6);
  g.lineTo(12, 10);
  g.closePath();
  g.fill();
  penSprite = c;
  return penSprite;
}

// ── The action-potential curve (mV over ms) — a shared dataset every scene can draw from ────────────
// x = time index (0..1 arbitrary), y = membrane potential mV. Hand-shaped classic spike.
const AP: [number, number][] = [
  [0.0, -70],
  [0.08, -70],
  [0.16, -68],
  [0.22, -62],
  [0.27, -55], // threshold
  [0.31, -40],
  [0.35, -10],
  [0.39, 20],
  [0.43, 38],
  [0.46, 40], // peak
  [0.5, 30],
  [0.55, 5],
  [0.6, -25],
  [0.66, -55],
  [0.72, -72],
  [0.78, -82], // hyperpolarization dip
  [0.84, -80],
  [0.9, -76],
  [0.96, -72],
  [1.0, -70], // back to rest
];

// Where along AP each phase begins (x-fraction), for callouts / spotlights.
const X_THRESHOLD = 0.27;
const X_PEAK = 0.46;
const X_TROUGH = 0.78;

// ── Shared neuron geometry (used in scenes 1 & 5) ──────────────────────────────────────────────────
const SOMA: Pt = [190, 220];
const SOMA_R = 34;
// dendrites radiating from the soma (each a short branching stroke)
const DENDRITES: Pt[][] = [
  [[190, 220], [150, 180], [120, 150], [100, 132]],
  [[190, 220], [150, 210], [118, 205], [92, 210]],
  [[190, 220], [155, 250], [128, 268], [104, 288]],
  [[190, 220], [172, 178], [162, 150], [156, 126]],
  [[190, 220], [176, 262], [172, 292], [172, 320]],
];
// the long axon sweeping to the right, ending in terminals
const AXON: Pt[] = [
  [222, 224],
  [300, 220],
  [400, 214],
  [520, 220],
  [640, 214],
  [740, 220],
  [812, 216],
];
// myelin bead centers along the axon (with node gaps between them)
const MYELIN: { x: number; y: number }[] = [
  { x: 320, y: 218 },
  { x: 410, y: 216 },
  { x: 500, y: 218 },
  { x: 590, y: 216 },
  { x: 680, y: 218 },
  { x: 762, y: 217 },
];
// axon terminals at the far end
const TERMINALS: Pt[][] = [
  [[812, 216], [846, 196], [872, 184]],
  [[812, 216], [852, 216], [882, 214]],
  [[812, 216], [846, 238], [874, 250]],
];

// A point along the axon at fraction f (arc-approx via lerp over control points) — for scene 5's tracer.
function axonAt(f: number): Pt {
  const seg = Math.max(0, Math.min(0.9999, f)) * (AXON.length - 1);
  const i = Math.floor(seg);
  const u = seg - i;
  const a = AXON[i];
  const b = AXON[Math.min(AXON.length - 1, i + 1)];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// SCENE 1 — THE MESSENGER
// ────────────────────────────────────────────────────────────────────────────────────────────────
const s1: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "meet the neuron — the messenger cell of the nervous system." },
    { at: 5, text: "dendrites listen, the soma decides, and one long axon carries the signal away." },
    { at: 10, text: "when it speaks, it speaks in a single electrical pulse: the action potential." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // backdrop wash
    const grad = bg.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#182634");
    grad.addColorStop(1, "#101a22");
    bg.fillStyle = grad;
    bg.fillRect(0, 0, W, H);

    const img = pen();

    // draw-on the whole neuron: dendrites → soma → axon → myelin → terminals, staged.
    // dendrites cascade in first
    DENDRITES.forEach((d, i) => {
      const p = phase(t, 0.5 + i * 0.28, 1.9 + i * 0.28);
      if (p > 0) drawOn(mid, d, p, { style: { color: "#7fb7c8", width: 2.6, cap: "round" } });
    });

    // the soma: a breathing, softly glowing cell body
    const somaIn = phase(t, 1.6, 2.6);
    if (somaIn > 0) {
      const br = breathe(t, 3.0, 0.05); // gentle in/out around 1
      const r = SOMA_R * somaIn * br;
      // soft glow behind it
      radialGlow(fg, SOMA[0], SOMA[1], r * 2.1, "rgba(92,200,174,0.5)", 0.5 * somaIn);
      mid.save();
      mid.globalAlpha = somaIn;
      const sg = mid.createRadialGradient(SOMA[0] - 8, SOMA[1] - 8, 4, SOMA[0], SOMA[1], r);
      sg.addColorStop(0, "#8fe8d4");
      sg.addColorStop(1, "#2f7d6a");
      mid.fillStyle = sg;
      mid.beginPath();
      mid.arc(SOMA[0], SOMA[1], r, 0, 7);
      mid.fill();
      // nucleus
      mid.fillStyle = "#1e5245";
      mid.beginPath();
      mid.arc(SOMA[0] + 4, SOMA[1] + 3, r * 0.34, 0, 7);
      mid.fill();
      mid.restore();
    }

    // the axon draws on with a hand-follower riding the pen tip
    const axonP = phase(t, 2.6, 6.2);
    if (axonP > 0) {
      drawOn(mid, AXON, axonP, { style: { color: "#cfe0e6", width: 4.2, cap: "round", taperEnd: 8, minWidth: 2 } });
      if (img && axonP < 1) handFollower(fg, AXON, axonP, img, { w: 30, h: 30, offsetX: -4, offsetY: -26 });
    }

    // myelin beads pop on along the drawn axon
    MYELIN.forEach((m, i) => {
      const p = phase(t, 4.2 + i * 0.24, 4.9 + i * 0.24);
      if (p <= 0) return;
      mid.save();
      mid.globalAlpha = p;
      mid.translate(m.x, m.y);
      const bw = 30;
      const bh = 20 * p;
      const bgrad = mid.createLinearGradient(0, -bh, 0, bh);
      bgrad.addColorStop(0, "#e8c98a");
      bgrad.addColorStop(1, "#a9803f");
      mid.fillStyle = bgrad;
      mid.beginPath();
      mid.ellipse(0, 0, bw / 2, bh, 0, 0, 7);
      mid.fill();
      mid.strokeStyle = "rgba(70,45,20,0.4)";
      mid.lineWidth = 1;
      mid.stroke();
      mid.restore();
    });

    // terminals sprout at the end
    TERMINALS.forEach((tm, i) => {
      const p = phase(t, 6.0 + i * 0.18, 6.9 + i * 0.18);
      if (p > 0) drawOn(mid, tm, p, { style: { color: "#cfe0e6", width: 2.4, cap: "round" } });
    });

    // labels point at the parts, staggered
    const labelIn = phase(t, 7.2, 8.2);
    if (labelIn > 0 && frame) {
      callout(frame, { target: [104, 205], text: "dendrites", side: "w", route: "elbow", container: "text", offset: 40, leaderP: labelIn, labelP: labelIn, color: "#7fb7c8", ink: "#cfe0e6" });
      callout(frame, { target: SOMA, text: "soma", side: "s", route: "straight", container: "text", offset: 74, leaderP: phase(t, 7.6, 8.6), labelP: phase(t, 7.6, 8.6), subject: "circle", subjectR: SOMA_R + 8, color: "#5cc8ae", accent: "#5cc8ae", ink: "#cfe0e6" });
      callout(frame, { target: [500, 200], text: "axon + myelin", side: "n", route: "elbow", container: "text", offset: 52, leaderP: phase(t, 8.2, 9.2), labelP: phase(t, 8.2, 9.2), color: "#e8c98a", ink: "#e8c98a" });
    }

    // TITLE slam-in
    drawSlam(ann, "THE NEURON FIRES", W / 2, 70, t, 9.6, { font: `800 40px ${DISPLAY}`, color: "#eef5ef" }, { dur: 0.6, from: 1.9 });
    fadeText(ann, "anatomy of an action potential", W / 2, 100, phase(t, 10.4, 11.6), `italic 15px ${DISPLAY}`, "#93a4b0");

    frame?.grade({ vignette: 0.32, grain: 0.035 });
  },
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// SCENE 2 — AT REST, −70 mV
// ────────────────────────────────────────────────────────────────────────────────────────────────
const MEM_Y = 250; // membrane midline in the pushed-in view
// static ion positions built ONCE from a seeded prng (deterministic clusters)
const restRnd = prng(4242);
const NA_OUT = Array.from({ length: 26 }, () => ({ x: 120 + restRnd() * 680, y: 120 + restRnd() * 70, ph: restRnd() }));
const K_IN = Array.from({ length: 22 }, () => ({ x: 130 + restRnd() * 660, y: 300 + restRnd() * 78, ph: restRnd() }));

function drawBilayer(ctx: CanvasRenderingContext2D, p: number) {
  // two rows of phospholipid heads with tails between — drawn on left→right
  const cols = 34;
  const shown = Math.floor(p * cols);
  const gap = 780 / cols;
  ctx.save();
  for (let i = 0; i < shown; i++) {
    const x = 70 + i * gap + gap / 2;
    // upper head
    ctx.fillStyle = "#d6b36a";
    ctx.beginPath();
    ctx.arc(x, MEM_Y - 16, 5.5, 0, 7);
    ctx.fill();
    // lower head
    ctx.beginPath();
    ctx.arc(x, MEM_Y + 16, 5.5, 0, 7);
    ctx.fill();
    // tails
    ctx.strokeStyle = "rgba(180,150,90,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, MEM_Y - 11);
    ctx.lineTo(x, MEM_Y - 1);
    ctx.moveTo(x, MEM_Y + 11);
    ctx.lineTo(x, MEM_Y + 1);
    ctx.stroke();
  }
  ctx.restore();
}

const s2: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "at rest, the neuron sits at about minus seventy millivolts." },
    { at: 5, text: "sodium waits outside, potassium sits inside — a charged truce across the membrane." },
    { at: 10, text: "the nernst equation sets that resting voltage from the ion gradients." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // camera pushes in onto the membrane patch over the first ~3s
    frame?.setCamera(pushIn(W, H, W / 2, MEM_Y, 1.0, 1.35, t, 0.2, 3.0));

    // outside/inside washes
    bg.fillStyle = "#16303a"; // extracellular (top)
    bg.fillRect(0, 0, W, MEM_Y);
    bg.fillStyle = "#221a2c"; // intracellular (bottom)
    bg.fillRect(0, MEM_Y, W, H - MEM_Y);

    // the lipid bilayer draws on
    drawBilayer(mid, phase(t, 0.6, 3.2));

    // side labels for the two compartments
    fadeText(ann, "OUTSIDE", 70, 40, phase(t, 1.2, 2.2), `700 12px ${DISPLAY}`, "#7fb7c8");
    fadeText(ann, "INSIDE", 70, H - 26, phase(t, 1.2, 2.2), `700 12px ${DISPLAY}`, "#b58ad6");

    // Na⁺ ions cluster outside (drift gently), K⁺ inside — each a distinct semantic color
    const naIn = phase(t, 2.4, 4.2);
    if (naIn > 0) {
      fg.save();
      for (const ion of NA_OUT) {
        const x = ion.x + wobble(t + ion.ph * 6, 3.2, 5);
        const y = ion.y + wobble(t + ion.ph * 4, 2.6, 4);
        radialGlow(fg, x, y, 11, "rgba(92,200,174,0.35)", naIn * 0.6);
        fg.globalAlpha = naIn;
        fg.fillStyle = NA;
        fg.beginPath();
        fg.arc(x, y, 5.5, 0, 7);
        fg.fill();
        fg.fillStyle = "#0e1c18";
        fg.font = `700 8px ${DISPLAY}`;
        fg.textAlign = "center";
        fg.fillText("+", x, y + 3);
      }
      fg.restore();
    }
    const kIn = phase(t, 3.0, 4.8);
    if (kIn > 0) {
      fg.save();
      for (const ion of K_IN) {
        const x = ion.x + wobble(t + ion.ph * 5, 3.6, 5);
        const y = ion.y + wobble(t + ion.ph * 7, 3.0, 4);
        fg.globalAlpha = kIn;
        fg.fillStyle = K;
        fg.beginPath();
        fg.arc(x, y, 5.5, 0, 7);
        fg.fill();
        fg.fillStyle = "#2a1a08";
        fg.font = `700 8px ${DISPLAY}`;
        fg.textAlign = "center";
        fg.fillText("+", x, y + 3);
      }
      fg.restore();
    }

    // legend (screen-fixed so it doesn't ride the camera zoom)
    const legIn = phase(t, 4.2, 5.2);
    if (legIn > 0 && frame) {
      frame.layer.set("annotation", { screenspace: true });
      ann.save();
      ann.globalAlpha = legIn;
      ann.fillStyle = "rgba(14,22,28,0.72)";
      ann.beginPath();
      ann.roundRect(700, 30, 176, 58, 8);
      ann.fill();
      IONS.legend(ann, ["Na⁺ (sodium)", "K⁺ (potassium)"], 714, 48, { ink: "#cdd8e2", rowH: 22 });
      ann.restore();
    }

    // resting-potential counter, screen-fixed, holding at −70 mV
    if (legIn > 0) {
      const v = counterValue(t, 4.4, 1.1, 0, -70);
      drawCounter(ann, W / 2, 60, v, { font: `800 30px ${DISPLAY}`, color: "#e8a13c", align: "center", alpha: legIn }, { decimals: 0, suffix: " mV" });
      fadeText(ann, "resting membrane potential", W / 2, 84, legIn, `12px ${DISPLAY}`, "#93a4b0");
    }

    // the Nernst equation writes on (screen-fixed, lower band)
    const eqP = phase(t, 8.4, 11.4);
    if (eqP > 0) {
      ann.save();
      ann.globalAlpha = 1;
      drawMath(ann, "E_{ion} = \\frac{RT}{zF} \\ln \\frac{[ion]_{out}}{[ion]_{in}}", W / 2, 388, {
        size: 26,
        color: "#eef5ef",
        align: "center",
        p: eqP,
      });
      ann.restore();
    }

    frame?.grade({ vignette: 0.34, grain: 0.035 });
  },
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// SCENE 3 — THRESHOLD & THE SPIKE
// ────────────────────────────────────────────────────────────────────────────────────────────────
// a stimulus travels down this dendrite path toward the soma
const STIM_PATH: Pt[] = [
  [120, 120],
  [190, 170],
  [250, 210],
  [300, 230],
];
// plot region for the live action-potential curve
const PLOT3 = makePlot({ x: 470, y: 110, w: 380, h: 220 }, [0, 1], [-90, 50]);
// closed channel (a narrow slit) → open channel (a funnel) for the morph
function channelClosed(cx: number, cy: number): Pt[] {
  return [
    [cx - 8, cy - 22],
    [cx - 3, cy - 22],
    [cx - 3, cy + 22],
    [cx - 8, cy + 22],
    [cx + 8, cy + 22],
    [cx + 3, cy + 22],
    [cx + 3, cy - 22],
    [cx + 8, cy - 22],
  ];
}
function channelOpen(cx: number, cy: number): Pt[] {
  return [
    [cx - 20, cy - 22],
    [cx - 9, cy - 22],
    [cx - 6, cy + 22],
    [cx - 16, cy + 22],
    [cx + 16, cy + 22],
    [cx + 6, cy + 22],
    [cx + 9, cy - 22],
    [cx + 20, cy - 22],
  ];
}
const CH_X = 300;
const CH_Y = 250;

const s3: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "a stimulus arrives, nudging the voltage upward toward the threshold." },
    { at: 4, text: "at minus fifty-five millivolts — will it fire?" },
    { at: 7, text: "it crosses. sodium channels snap open and ions flood inward." },
    { at: 11, text: "the membrane rockets to plus forty millivolts. this is depolarization." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    bg.fillStyle = "#14212b";
    bg.fillRect(0, 0, W, H);
    bg.fillStyle = "#221a2c";
    bg.fillRect(0, MEM_Y, W, H - MEM_Y);

    // dendrite + membrane sketch on the left
    drawOn(mid, STIM_PATH, 1, { style: { color: "#5b7686", width: 3, cap: "round" } });
    mid.save();
    mid.strokeStyle = "#3a5560";
    mid.lineWidth = 2;
    mid.beginPath();
    mid.moveTo(60, MEM_Y);
    mid.lineTo(440, MEM_Y);
    mid.stroke();
    mid.restore();

    // stimulus flashes down the dendrite (passing flash), repeating a couple of times
    const stimWin = phase(t, 0.4, 2.6);
    if (stimWin > 0 && stimWin < 1) {
      passingFlash(fg, STIM_PATH, (t - 0.4) / 2.2, { width: 0.28, thinning: true, glow: true, style: { color: "#8fe8ff", width: 5 } });
    }

    // voltage climb to threshold, then the spike value follows the AP curve after crossing
    const crossAt = 6.6;
    let v: number;
    if (t < crossAt) {
      v = counterValue(t, 1.2, crossAt - 1.2, -70, -55); // creep up to threshold
    } else {
      // map local time onto the AP x-domain from threshold to rest
      const f = lerp(X_THRESHOLD, 1.0, phase(t, crossAt, crossAt + 6.5));
      v = apValueAt(f);
    }

    // predict-reveal "Will it fire?" gate
    const pr = predictReveal(t, { poseAt: 4.0, revealAt: crossAt, dur: 0.6 });
    if (pr.question > 0 && t < crossAt + 1.4) {
      const qa = pr.question * (1 - phase(t, crossAt + 0.6, crossAt + 1.4));
      fadeText(ann, "will it fire?", 250, 70, qa, `800 26px ${DISPLAY}`, "#e8a13c");
      // a pulsing threshold marker
      fadeText(ann, "threshold  −55 mV", 250, 96, qa * 0.9, `13px ${DISPLAY}`, "#93a4b0");
    }
    if (pr.answer > 0) {
      const ya = pr.answer * (1 - phase(t, crossAt + 2.2, crossAt + 3.0));
      if (ya > 0) fadeText(ann, "YES.", 250, 70, ya, `800 30px ${DISPLAY}`, "#5cc8ae");
    }

    // a voltmeter readout riding on the left
    drawCounter(ann, 250, 150, v, { font: `800 34px ${DISPLAY}`, color: v > -20 ? "#5cc8ae" : "#e8a13c", align: "center" }, { decimals: 0, suffix: " mV" });

    // Na⁺ channel morphs open as we cross threshold
    const openP = phase(t, crossAt, crossAt + 0.8);
    drawMorph(mid, channelClosed(CH_X, CH_Y), channelOpen(CH_X, CH_Y), openP, {
      stroke: NA,
      width: 3,
      closed: true,
      align: false,
    });

    // ions flood INWARD through the channel — a burst pulled down through the membrane
    if (openP > 0.2) {
      const floodCfg: EmitterConfig = {
        count: 46,
        seed: 77,
        origin: { kind: "line", x: CH_X - 26, y: MEM_Y - 42, x2: CH_X + 26, y2: MEM_Y - 42 },
        t0: crossAt + 0.2,
        rate: 34,
        loop: true,
        life: [0.7, 1.1],
        angle: Math.PI / 2, // downward, into the cell
        spread: 0.5,
        speed: [70, 130],
        accel: [0, 60],
        size: [4, 2],
        sizeEnd: 1.5,
        color: NA,
        alpha: { in: 0.1, out: 0.4, max: 0.95 },
        shape: "dot",
        blend: "lighter",
      };
      emit(fg, floodCfg, t);
    }

    // live action-potential curve draws on IN SYNC with the value climb
    const curveP = phase(t, crossAt - 0.2, crossAt + 6.5);
    axes(ann, PLOT3, {
      p: phase(t, crossAt - 0.6, crossAt + 0.4),
      grid: true,
      xLabel: "time",
      yLabel: "mV",
      yTicks: [-70, -55, 0, 40],
      xTicks: [],
      ink: "#93a4b0",
      color: "#5b6b78",
    });
    lineChart(ann, PLOT3, AP, curveP, { color: "#5cc8ae", width: 3, area: true, areaColor: "rgba(92,200,174,0.14)" });
    // a live head dot on the curve
    if (curveP > 0) {
      const shown = Math.min(1, curveP);
      const hf = lerp(0, 1, shown);
      const hx = PLOT3.sx(hf);
      const hy = PLOT3.sy(apValueAt(hf));
      radialGlow(fg, hx, hy, 14, "rgba(143,232,255,0.7)", 0.9);
      fg.fillStyle = "#eef5ef";
      fg.beginPath();
      fg.arc(hx, hy, 4, 0, 7);
      fg.fill();
    }

    // punch + flash at the peak
    const peakAt = crossAt + lerp(0, 6.5, (X_PEAK - X_THRESHOLD) / (1 - X_THRESHOLD));
    const px = PLOT3.sx(X_PEAK);
    const py = PLOT3.sy(40);
    if (Math.abs(t - peakAt) < 1.0) {
      flash(fg, px, py, 70, phase(t, peakAt, peakAt + 0.6), { color: "rgba(143,232,255,0.9)" });
      const s = punchScale(t, peakAt, 0.25, 0.4);
      ann.save();
      ann.translate(px, py - 30);
      ann.scale(s, s);
      fadeText(ann, "+40 mV", 0, 0, emphasis(t, peakAt, 0.9), `800 18px ${DISPLAY}`, "#8fe8ff");
      ann.restore();
    }
    flashOverlay(fg, t, peakAt, W, H, { color: "rgba(143,232,255,0.28)", dur: 0.3 });

    // callout "Depolarization" pointing at the rising limb
    if (frame) {
      const cp = phase(t, peakAt + 0.4, peakAt + 1.4);
      if (cp > 0) {
        callout(frame, {
          target: [PLOT3.sx(0.4), PLOT3.sy(0)],
          title: "Depolarization",
          text: "Na⁺ rushes in",
          side: "ne",
          route: "elbow",
          container: "pill",
          offset: 40,
          leaderP: cp,
          labelP: cp,
          color: "#5cc8ae",
          accent: "#5cc8ae",
        });
      }
    }

    frame?.grade({ vignette: 0.32, grain: 0.035 });
  },
};

// helper: piecewise-linear read of the AP curve at x-fraction f
function apValueAt(f: number): number {
  f = Math.max(0, Math.min(1, f));
  for (let i = 1; i < AP.length; i++) {
    if (f <= AP[i][0]) {
      const [x0, y0] = AP[i - 1];
      const [x1, y1] = AP[i];
      const u = (f - x0) / (x1 - x0 || 1);
      return lerp(y0, y1, u);
    }
  }
  return AP[AP.length - 1][1];
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// SCENE 4 — REPOLARIZATION & RECOVERY
// ────────────────────────────────────────────────────────────────────────────────────────────────
const PLOT4 = makePlot({ x: 150, y: 90, w: 620, h: 250 }, [0, 1], [-90, 50]);

const s4: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "now potassium channels open, and potassium leaves the cell." },
    { at: 4, text: "the voltage falls — repolarization — and briefly overshoots below rest." },
    { at: 8, text: "that dip is hyperpolarization; during it the neuron cannot fire again." },
    { at: 11, text: "then it settles back to minus seventy, ready once more." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const grad = bg.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#16222c");
    grad.addColorStop(1, "#101820");
    bg.fillStyle = grad;
    bg.fillRect(0, 0, W, H);

    // full curve context on the plot (drawn, since scene 3 already built it live)
    axes(ann, PLOT4, { p: phase(t, 0, 0.8), grid: true, yTicks: [-70, -55, 0, 40], xTicks: [], ink: "#93a4b0", color: "#5b6b78", yLabel: "mV" });
    const curveP = phase(t, 0.4, 6.0);
    lineChart(ann, PLOT4, AP, curveP, { color: "#5cc8ae", width: 3, area: true, areaColor: "rgba(92,200,174,0.12)" });

    // K⁺ channel opens (a small morph near the falling limb) and K⁺ exits UPWARD (outflow)
    const chX = PLOT4.sx(0.55);
    const chY = 360;
    const kOpen = phase(t, 1.4, 2.4);
    drawMorph(mid, channelClosed(chX, chY), channelOpen(chX, chY), kOpen, { stroke: K, width: 3, closed: true, align: false });
    if (kOpen > 0.2) {
      const outCfg: EmitterConfig = {
        count: 40,
        seed: 91,
        origin: { kind: "point", x: chX, y: chY },
        t0: 1.6,
        rate: 26,
        loop: true,
        life: [0.8, 1.3],
        angle: -Math.PI / 2, // upward, out of the cell
        spread: 0.6,
        speed: [55, 110],
        size: [4, 2],
        sizeEnd: 1.5,
        color: K,
        alpha: { in: 0.1, out: 0.4, max: 0.9 },
        shape: "dot",
        blend: "lighter",
      };
      emit(fg, outCfg, t);
    }

    // a live head dot marching the falling curve
    if (curveP > 0) {
      const hx = PLOT4.sx(curveP);
      const hy = PLOT4.sy(apValueAt(curveP));
      radialGlow(fg, hx, hy, 12, "rgba(232,161,60,0.6)", 0.8);
      fg.fillStyle = "#eef5ef";
      fg.beginPath();
      fg.arc(hx, hy, 3.6, 0, 7);
      fg.fill();
    }

    // elbow-leader callouts for each phase, staggered
    if (frame) {
      const c1 = phase(t, 2.6, 3.6);
      if (c1 > 0) callout(frame, { target: [PLOT4.sx(0.55), PLOT4.sy(0)], title: "Repolarization", text: "K⁺ flows out", side: "ne", route: "elbow", offset: 44, container: "pill", leaderP: c1, labelP: c1, color: K, accent: K });
      const c2 = phase(t, 6.4, 7.4);
      if (c2 > 0) callout(frame, { target: [PLOT4.sx(X_TROUGH), PLOT4.sy(-82)], title: "Hyperpolarization", text: "dips below rest", side: "se", route: "elbow", offset: 40, container: "pill", leaderP: c2, labelP: c2, color: "#a06be8", accent: "#a06be8" });
      const c3 = phase(t, 10.2, 11.2);
      if (c3 > 0) callout(frame, { target: [PLOT4.sx(0.98), PLOT4.sy(-70)], text: "back to rest", side: "n", route: "elbow", offset: 40, container: "text", leaderP: c3, labelP: c3, color: "#5cc8ae", ink: "#5cc8ae" });
    }

    // spotlight isolates the refractory window (the hyperpolarized dip), dimming the surround
    const refIn = phase(t, 7.6, 8.6) * (1 - phase(t, 12.5, 13.5));
    if (refIn > 0) {
      const rx = PLOT4.sx(X_TROUGH);
      const ry = PLOT4.sy(-78);
      frame?.layer.set("fx", { screenspace: true });
      const fx = frame?.layer.ctx("fx") ?? fg;
      spotlightFocus(fx, rx, ry, 74, { intensity: 0.5 * refIn, feather: 40, color: "#0b0f14" });
      highlightRing(ann, rx, ry, 40 + wobble(t, 1.6, 3), t, { color: "#a06be8", width: 2, alpha: refIn * 0.9, amp: 3, period: 1.6 });
      fadeText(ann, "refractory period", rx, ry + 66, refIn, `700 12px ${DISPLAY}`, "#c9a6ee");
    }

    frame?.grade({ vignette: 0.34, grain: 0.035 });
  },
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// SCENE 5 — THE WAVE TRAVELS
// ────────────────────────────────────────────────────────────────────────────────────────────────
// node-of-Ranvier fractions along the axon (gaps between myelin beads)
const NODES = [0.16, 0.34, 0.52, 0.7, 0.86];

const s5: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "and the spike does not stay put — it travels." },
    { at: 4, text: "it leaps from node to node down the myelinated axon, fast and clean." },
    { at: 9, text: "reaching the terminals, it hands the message to the next cell." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // camera pulls back over the first ~2.5s from a slight zoom to the full neuron
    const camFrom = focusOn(SOMA[0] + 60, SOMA[1], 1.4, 0);
    const camTo = focusOn(W / 2, H / 2, 1.0, 0);
    frame?.setCamera(lerpCamera(camFrom, camTo, phase(t, 0.2, 2.6)));

    const grad = bg.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#17242f");
    grad.addColorStop(1, "#0f1720");
    bg.fillStyle = grad;
    bg.fillRect(0, 0, W, H);

    // draw the neuron (static this time — established earlier)
    DENDRITES.forEach((d) => drawOn(mid, d, 1, { style: { color: "#5f8494", width: 2.4, cap: "round" } }));
    // soma
    mid.save();
    const sg = mid.createRadialGradient(SOMA[0] - 8, SOMA[1] - 8, 4, SOMA[0], SOMA[1], SOMA_R);
    sg.addColorStop(0, "#6fbfaa");
    sg.addColorStop(1, "#2f7d6a");
    mid.fillStyle = sg;
    mid.beginPath();
    mid.arc(SOMA[0], SOMA[1], SOMA_R, 0, 7);
    mid.fill();
    mid.restore();
    drawOn(mid, AXON, 1, { style: { color: "#b9ccd4", width: 4, cap: "round", taperEnd: 8, minWidth: 2 } });
    MYELIN.forEach((m) => {
      mid.save();
      mid.translate(m.x, m.y);
      const bgrad = mid.createLinearGradient(0, -20, 0, 20);
      bgrad.addColorStop(0, "#e8c98a");
      bgrad.addColorStop(1, "#a9803f");
      mid.fillStyle = bgrad;
      mid.beginPath();
      mid.ellipse(0, 0, 15, 20, 0, 0, 7);
      mid.fill();
      mid.restore();
    });
    TERMINALS.forEach((tm) => drawOn(mid, tm, 1, { style: { color: "#b9ccd4", width: 2.2, cap: "round" } }));

    // the bright travelling spike: a dot that runs along the axon, jumping node to node.
    const travel = phase(t, 1.8, 8.2); // 0..1 progress down the axon
    // saltatory step: quantize the smooth progress to node positions for a "jump" feel
    const stepped = (() => {
      const raw = travel * (NODES.length + 1);
      const idx = Math.floor(raw);
      const frac = raw - idx;
      // ease within each hop so it snaps between nodes
      const eased = frac * frac * (3 - 2 * frac);
      const from = idx === 0 ? 0.06 : NODES[idx - 1];
      const to = idx >= NODES.length ? 0.99 : NODES[idx];
      return lerp(from, to, eased);
    })();

    if (travel > 0 && travel < 1) {
      // comet trail behind the spike
      tracedPath(fg, (tt) => {
        const tv = phase(tt, 1.8, 8.2);
        const raw = tv * (NODES.length + 1);
        const idx = Math.floor(raw);
        const frac = raw - idx;
        const eased = frac * frac * (3 - 2 * frac);
        const from = idx === 0 ? 0.06 : NODES[idx - 1];
        const to = idx >= NODES.length ? 0.99 : NODES[idx];
        return axonAt(lerp(from, to, eased));
      }, t, { dissipate: 0.5, step: 0.03, style: { color: "#8fe8ff", width: 4, cap: "round", blend: "lighter" } });

      const [dx, dy] = axonAt(stepped);
      radialGlow(fg, dx, dy, 22, "rgba(143,232,255,0.85)", 0.95);
      fg.fillStyle = "#eaffff";
      fg.beginPath();
      fg.arc(dx, dy, 6, 0, 7);
      fg.fill();
    }

    // a passing flash lights each node as the spike passes it
    NODES.forEach((n, i) => {
      const passAt = 1.8 + ((8.2 - 1.8) * (i + 0.5)) / (NODES.length + 1);
      const fa = emphasis(t, passAt, 0.28);
      if (fa > 0) {
        const [nx, ny] = axonAt(n);
        sparkFlash(fg, nx, ny, 1 - fa, { count: 10, length: 18, color: "#8fe8ff" });
        radialGlow(fg, nx, ny, 26 * fa, "rgba(143,232,255,0.6)", fa);
      }
    });

    // arrival flash at the terminals
    const arrive = emphasis(t, 8.4, 0.5);
    if (arrive > 0) {
      flash(fg, 860, 216, 80, 1 - arrive, { color: "rgba(92,200,174,0.9)" });
    }

    fadeText(ann, "saltatory conduction — node to node", W / 2, 380, phase(t, 4.4, 5.6) * (1 - phase(t, 11.5, 12.5)), `italic 14px ${DISPLAY}`, "#9fc7d6");

    frame?.grade({ vignette: 0.32, grain: 0.035 });
  },
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// SCENE 6 — RECAP
// ────────────────────────────────────────────────────────────────────────────────────────────────
const PLOT6 = makePlot({ x: 150, y: 70, w: 620, h: 210 }, [0, 1], [-90, 50]);

const s6: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "so that is the action potential — one clean electrical pulse." },
    { at: 5, text: "you carry roughly eighty-six billion neurons, each able to fire up to a thousand times a second." },
    { at: 10, text: "eighty-six billion messengers, firing in the dark. that is you, thinking." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const grad = bg.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#16222c");
    grad.addColorStop(1, "#0e1720");
    bg.fillStyle = grad;
    bg.fillRect(0, 0, W, H);

    // the full labeled curve returns
    axes(ann, PLOT6, { p: phase(t, 0.2, 1.0), grid: true, yTicks: [-70, -55, 0, 40], xTicks: [], ink: "#93a4b0", color: "#5b6b78", yLabel: "mV" });
    const curveP = phase(t, 0.6, 3.4);
    lineChart(ann, PLOT6, AP, curveP, { color: "#5cc8ae", width: 3, area: true, areaColor: "rgba(92,200,174,0.14)" });

    // phase tags along the curve, staggered
    if (frame) {
      const tags: [number, number, string, string][] = [
        [X_THRESHOLD, -55, "threshold", "#e8a13c"],
        [X_PEAK, 40, "depolarize", "#5cc8ae"],
        [0.6, -20, "repolarize", "#e8a13c"],
        [X_TROUGH, -82, "hyperpolar.", "#a06be8"],
      ];
      tags.forEach(([xf, yv, label, col], i) => {
        const p = phase(t, 3.4 + i * 0.4, 4.2 + i * 0.4) * (1 - phase(t, 12.5, 13.5));
        if (p <= 0) return;
        const x = PLOT6.sx(xf);
        const y = PLOT6.sy(yv);
        fg.save();
        fg.globalAlpha = p;
        fg.fillStyle = col;
        fg.beginPath();
        fg.arc(x, y, 4, 0, 7);
        fg.fill();
        fg.restore();
        fadeText(ann, label, x, y - 12, p, `700 11px ${DISPLAY}`, col);
      });
    }

    // the Nernst equation returns and glows
    const eqIn = phase(t, 4.6, 5.6) * (1 - phase(t, 12.5, 13.5));
    if (eqIn > 0) {
      frame?.layer.set("fg", { glow: { strength: 0.5, blur: 8 } });
      const eqx = W / 2;
      const eqy = 322;
      // glow copy on fg
      drawMath(fg, "E_{ion} = \\frac{RT}{zF} \\ln \\frac{[ion]_{out}}{[ion]_{in}}", eqx, eqy, { size: 22, color: "#5cc8ae", align: "center", alpha: eqIn });
      drawMath(ann, "E_{ion} = \\frac{RT}{zF} \\ln \\frac{[ion]_{out}}{[ion]_{in}}", eqx, eqy, { size: 22, color: "#eef5ef", align: "center", alpha: eqIn });
    }

    // big stat counts up
    const statIn = phase(t, 5.4, 6.0);
    if (statIn > 0) {
      const n = counterValue(t, 5.6, 2.4, 0, 86_000_000_000);
      drawCounter(ann, W / 2, 128, n, { font: `800 40px ${DISPLAY}`, color: "#eef5ef", align: "center", alpha: statIn }, { commas: true });
      fadeText(ann, "neurons  ·  up to " + formatNumber(1000, { commas: true }) + " spikes/sec", W / 2, 156, phase(t, 7.8, 8.8), `15px ${DISPLAY}`, "#93a4b0");
    }

    // closing line reveals word by word
    const closeIn = phase(t, 10.4, 10.8);
    if (closeIn > 0) {
      ann.save();
      ann.font = `italic 20px ${DISPLAY}`;
      const line = "Eighty-six billion messengers, firing in the dark.";
      const wpx = ann.measureText(line).width;
      ann.restore();
      drawWordReveal(ann, line, W / 2 - wpx / 2, 380, t, { font: `italic 20px ${DISPLAY}`, color: "#dfe8ef" }, { start: 10.6, step: 0.16, dur: 0.4, mode: "rise" });
    }

    frame?.grade({ vignette: 0.34, grain: 0.04 });
  },
};

export const neuronLesson = composeSlides([s1, s2, s3, s4, s5, s6], {
  theme: TEXTBOOK,
  filmGrade: true,
  transition: "zoom-through",
});
