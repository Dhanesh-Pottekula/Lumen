/**
 * Coimbatore tutorial · slide 4 — "Manchester of the South".
 * 1932: Pykara's water spins a turbine, power pulses down the wire, and mills rise
 * one after another — windows lighting, chimneys smoking. Pure renderFrame(t).
 *
 * Layer routing (Step 01): ground/sky wash → bg; cliff, turbine, pylons, mill bodies,
 * chimneys, cloth ribbon → mid (soft drop-shadow, for depth); falling water, wire energy,
 * lit windows, glows, sparks → fg (bloom); all text + attention marks → annotation;
 * vignette → fx. Falls back to the single ctx when no frame is supplied.
 */
import { clamp01, cycle, fadeText, lerp, makePath, phase, prng, radialGlow } from "./anim";
import { focusRings, highlightRing, sparkFlash } from "../render/focus";
import { passingFlash } from "../render/strokeVerbs";
import type { Pt } from "../render/strokes";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;
const GROUND = 380;

const rand = prng(1932);

/* The power line from the turbine to the mills. */
const WIRE = makePath([
  [212, 300],
  [300, 208],
  [420, 232],
  [540, 210],
  [640, 240],
]);
const WIRE_PTS: Pt[] = [
  [212, 300],
  [300, 208],
  [420, 232],
  [540, 210],
  [640, 240],
];
const PYLONS = [300, 420, 540] as const;

/* Mill buildings — position, size, build order. */
interface Mill {
  x: number;
  w: number;
  h: number;
  at: number;
  windowOrder: number[];
}
const MILLS: Mill[] = [640, 726, 806, 640, 726].slice(0, 3).map((x, i) => {
  const order = Array.from({ length: 12 }, (_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return { x, w: 74, h: 118 + i * 22, at: 9 + i * 2.4, windowOrder: order };
});

/** Turbine spin angle — pure in t: still until 2 s, ramping into full speed by 6 s. */
function turbineAngle(t: number): number {
  const ramp = clamp01((t - 2) / 4);
  // integral of a smoothly-ramping speed: quadratic while ramping, linear after
  const spun = t < 2 ? 0 : t < 6 ? ((t - 2) * (t - 2)) / 8 : (t - 6) + 2;
  return spun * 5 * (0.2 + 0.8 * ramp);
}

function drawTurbine(
  mid: CanvasRenderingContext2D,
  fg: CanvasRenderingContext2D,
  t: number,
  alpha: number,
) {
  if (alpha <= 0) return;

  // the cliff (mid — reads as solid structure with depth)
  mid.save();
  mid.globalAlpha = alpha;
  mid.fillStyle = "#2b3640";
  mid.fillRect(74, 130, 60, 200);
  mid.restore();

  // falling water (fg — catches the bloom, so it glints)
  const flow = phase(t, 1, 2.5);
  if (flow > 0) {
    fg.save();
    fg.globalAlpha = alpha * flow * 0.85;
    fg.strokeStyle = "#7db3cc";
    fg.lineWidth = 3;
    for (let s = 0; s < 4; s++) {
      const off = cycle(t * 1.6 + s * 0.25) * 44;
      for (let y = 138 + off; y < 300; y += 44) {
        fg.beginPath();
        fg.moveTo(104 + s * 7, y);
        fg.lineTo(104 + s * 7, y + 22);
        fg.stroke();
      }
    }
    fg.restore();
  }

  // turbine wheel body (mid)
  const cx = 170;
  const cy = 322;
  const angle = turbineAngle(t);
  mid.save();
  mid.globalAlpha = alpha;
  mid.beginPath();
  mid.arc(cx, cy, 30, 0, 7);
  mid.fillStyle = "#1f2830";
  mid.fill();
  mid.strokeStyle = "#93a4b0";
  mid.lineWidth = 3;
  mid.stroke();
  for (let b = 0; b < 6; b++) {
    const a = angle + (b * Math.PI) / 3;
    mid.beginPath();
    mid.moveTo(cx, cy);
    mid.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    mid.strokeStyle = "#5cc8ae";
    mid.lineWidth = 4;
    mid.stroke();
  }
  mid.beginPath();
  mid.arc(cx, cy, 6, 0, 7);
  mid.fillStyle = "#e8eef2";
  mid.fill();
  mid.restore();

  // hub glow that grows as the wheel comes up to speed (fg)
  const speed = clamp01((t - 2) / 4);
  if (speed > 0) {
    radialGlow(fg, cx, cy, 20 + speed * 22, "rgba(92,200,174,0.5)", alpha * speed);
  }
}

function drawPowerLine(
  mid: CanvasRenderingContext2D,
  fg: CanvasRenderingContext2D,
  t: number,
  alpha: number,
) {
  if (alpha <= 0) return;

  // pylons + wire (mid — structure)
  mid.save();
  mid.globalAlpha = alpha;
  for (const px of PYLONS) {
    mid.strokeStyle = "#48586a";
    mid.lineWidth = 3;
    mid.beginPath();
    mid.moveTo(px, GROUND);
    mid.lineTo(px, 205 + (px === 420 ? 24 : px === 540 ? 2 : 0));
    mid.stroke();
    mid.beginPath();
    mid.moveTo(px - 10, 224);
    mid.lineTo(px + 10, 224);
    mid.stroke();
  }
  mid.beginPath();
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const p = WIRE.at((i / steps) * WIRE.length);
    if (i === 0) mid.moveTo(p.x, p.y);
    else mid.lineTo(p.x, p.y);
  }
  mid.strokeStyle = "#5d7186";
  mid.lineWidth = 1.8;
  mid.stroke();
  mid.restore();

  // energy pulses once the turbine is up to speed — light-sweeps along the wire (fg, bloom)
  const live = phase(t, 6, 7.5);
  if (live > 0) {
    fg.save();
    fg.globalAlpha = alpha * live;
    for (let k = 0; k < 3; k++) {
      passingFlash(fg, WIRE_PTS, cycle(t * 0.34 + k / 3), {
        width: 0.22,
        thinning: true,
        glow: true,
        style: { color: "rgba(235, 203, 139, 0.95)", width: 4 },
      });
      const p = WIRE.at(cycle(t * 0.34 + k / 3) * WIRE.length);
      radialGlow(fg, p.x, p.y, 12, "rgba(235, 203, 139, 0.95)", alpha * live);
    }
    fg.restore();
  }
}

function drawMill(
  mid: CanvasRenderingContext2D,
  fg: CanvasRenderingContext2D,
  mill: Mill,
  t: number,
) {
  const rise = phase(t, mill.at, mill.at + 2.6);
  if (rise <= 0) return;
  const h = mill.h * rise;
  const top = GROUND - h;

  // body (mid)
  mid.fillStyle = "#31404f";
  mid.fillRect(mill.x, top, mill.w, h);

  // sawtooth roof (mid)
  mid.beginPath();
  for (let s = 0; s < 3; s++) {
    const sx = mill.x + (s * mill.w) / 3;
    mid.moveTo(sx, top);
    mid.lineTo(sx + mill.w / 6, top - 13 * rise);
    mid.lineTo(sx + mill.w / 3, top);
  }
  mid.fillStyle = "#3d4f61";
  mid.fill();

  // chimney (mid)
  const chimneyX = mill.x + mill.w - 14;
  mid.fillStyle = "#26313d";
  mid.fillRect(chimneyX, top - 34 * rise, 10, 34 * rise);

  // smoke (fg — soft plume)
  const smokeIn = phase(t, mill.at + 3, mill.at + 4.5);
  if (smokeIn > 0) {
    for (let s = 0; s < 4; s++) {
      const c = cycle(t * 0.22 + s * 0.29);
      fg.save();
      fg.globalAlpha = smokeIn * (1 - c) * 0.3;
      fg.beginPath();
      fg.arc(chimneyX + 5 + Math.sin(c * 5 + s) * 7, top - 40 * rise - c * 52, 6 + c * 9, 0, 7);
      fg.fillStyle = "#9aa7b3";
      fg.fill();
      fg.restore();
    }
  }

  // windows lighting up in a shuffled order — lit ones on fg (glow), dark on mid
  const litCount = phase(t, mill.at + 2.2, mill.at + 6) * 12;
  for (let k = 0; k < 12; k++) {
    const col = k % 3;
    const row = Math.floor(k / 3);
    const wx = mill.x + 11 + col * 20;
    const wy = top + 14 + row * (mill.h / 4.8);
    if (wy + 9 > GROUND) continue;
    const lit = mill.windowOrder[k] < litCount;
    if (lit) {
      fg.fillStyle = "#ebcb8b";
      fg.fillRect(wx, wy, 12, 9);
    } else {
      mid.fillStyle = "#222c36";
      mid.fillRect(wx, wy, 12, 9);
    }
  }
}

export const coimbatoreMillsSlide: CanvasSlideDefinition = {
  duration: 30,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "1932. up in the nilgiris, pykara falls starts turning turbines — and suddenly there's cheap hydroelectric power right next to all that cotton." },
    { at: 8, text: "cotton plus power. the mills went up one after another — spinning mills, weaving sheds, each one pulling in workers from the villages." },
    { at: 17, text: "within a generation the city was spinning so much yarn that people stopped comparing it to anywhere in india." },
    { at: 23, text: "they called it the manchester of south india. the crossroads town had become a factory town." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const accent = frame?.theme.palette.accent ?? "#5cc8ae";
    if (!frame) ctx.clearRect(0, 0, W, H);

    // ground (bg)
    bg.fillStyle = "#232c33";
    bg.fillRect(0, GROUND, W, H - GROUND);
    bg.strokeStyle = "#39434d";
    bg.beginPath();
    bg.moveTo(0, GROUND);
    bg.lineTo(W, GROUND);
    bg.stroke();

    drawTurbine(mid, fg, t, phase(t, 0, 1.5));
    fadeText(ann, "Pykara Falls", 150, 118, phase(t, 0.5, 2), "12px -apple-system, sans-serif", "#93a4b0");
    fadeText(ann, "1932", 150, 100, phase(t, 1, 3) * (1.2 - 0.2 * Math.sin(t)), "800 22px -apple-system, sans-serif", "#ebcb8b");

    drawPowerLine(mid, fg, t, phase(t, 4, 6));

    for (const mill of MILLS) drawMill(mid, fg, mill, t);
    fadeText(ann, "spinning mills", 750, 410, phase(t, 12, 14), "12px -apple-system, sans-serif", "#93a4b0");

    // flowing cloth ribbon — the output. Cloth on mid, gold weft glint on fg.
    const cloth = phase(t, 20, 24);
    if (cloth > 0) {
      mid.save();
      mid.globalAlpha = cloth * 0.9;
      mid.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = 415 + Math.sin(x * 0.025 - t * 2.2) * 6 * cloth;
        if (x === 0) mid.moveTo(x, y);
        else mid.lineTo(x, y);
      }
      mid.strokeStyle = "#e8eef2";
      mid.lineWidth = 5;
      mid.stroke();
      mid.restore();

      fg.save();
      fg.globalAlpha = cloth * 0.9;
      fg.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = 415 + Math.sin(x * 0.025 - t * 2.2) * 6 * cloth;
        if (x === 0) fg.moveTo(x, y);
        else fg.lineTo(x, y);
      }
      fg.lineDashOffset = -t * 40;
      fg.setLineDash([2, 26]);
      fg.strokeStyle = "#e8a13c";
      fg.lineWidth = 5;
      fg.stroke();
      fg.restore();
    }

    // title (annotation)
    const finale = phase(t, 23, 25.5);
    if (finale > 0) {
      fadeText(ann, "MANCHESTER OF SOUTH INDIA", 460, 52, finale, `800 ${lerp(16, 24, finale)}px -apple-system, sans-serif`, "#e8eef2");
      // NEW attention marks on the headline stat — converge, spark, then hold a gentle ring.
      const conv = phase(t, 23.2, 24.4);
      focusRings(ann, 460, 46, conv, { color: accent, maxR: 210, targetR: 150, count: 3 });
      sparkFlash(fg, 460, 46, phase(t, 24.2, 25), { color: accent, count: 14, length: 30, inner: 40 });
      highlightRing(ann, 460, 46, 158, t, { color: accent, amp: 4, period: 1.6, width: 2, alpha: finale * 0.55 });
    } else {
      fadeText(ann, "water becomes power becomes yarn", 500, 52, phase(t, 0.3, 1.6) * (1 - phase(t, 21, 23)), "700 18px -apple-system, sans-serif", "#e8eef2");
    }

    // filmic vignette to seat the scene (fx)
    frame?.grade({ vignette: 0.28, grain: 0.03 });
  },
};
