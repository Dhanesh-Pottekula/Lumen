/**
 * Coimbatore tutorial · slide 4 — "Manchester of the South".
 * 1932: Pykara's water spins a turbine, power pulses down the wire, and mills rise
 * one after another — windows lighting, chimneys smoking. Pure renderFrame(t).
 */
import { clamp01, cycle, fadeText, lerp, makePath, phase, prng } from "./anim";
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

function drawTurbine(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  // the cliff and falling water
  ctx.fillStyle = "#2b3640";
  ctx.fillRect(74, 130, 60, 200);
  const flow = phase(t, 1, 2.5);
  if (flow > 0) {
    ctx.globalAlpha = alpha * flow * 0.85;
    for (let s = 0; s < 4; s++) {
      const off = cycle(t * 1.6 + s * 0.25) * 44;
      for (let y = 138 + off; y < 300; y += 44) {
        ctx.beginPath();
        ctx.moveTo(104 + s * 7, y);
        ctx.lineTo(104 + s * 7, y + 22);
        ctx.strokeStyle = "#7db3cc";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = alpha;
  }

  // turbine wheel
  const cx = 170;
  const cy = 322;
  const angle = turbineAngle(t);
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, 7);
  ctx.fillStyle = "#1f2830";
  ctx.fill();
  ctx.strokeStyle = "#93a4b0";
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let b = 0; b < 6; b++) {
    const a = angle + (b * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();
  ctx.restore();
}

function drawPowerLine(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  for (const px of PYLONS) {
    ctx.strokeStyle = "#48586a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, GROUND);
    ctx.lineTo(px, 205 + (px === 420 ? 24 : px === 540 ? 2 : 0));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 10, 224);
    ctx.lineTo(px + 10, 224);
    ctx.stroke();
  }

  // the wire
  ctx.beginPath();
  const steps = 50;
  for (let i = 0; i <= steps; i++) {
    const p = WIRE.at((i / steps) * WIRE.length);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = "#5d7186";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // energy pulses once the turbine is up to speed
  const live = phase(t, 6, 7.5);
  if (live > 0) {
    for (let k = 0; k < 3; k++) {
      const p = WIRE.at(cycle(t * 0.34 + k / 3) * WIRE.length);
      ctx.globalAlpha = alpha * live;
      const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 12);
      glow.addColorStop(0, "rgba(235, 203, 139, 0.95)");
      glow.addColorStop(1, "rgba(235, 203, 139, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 12, p.y - 12, 24, 24);
    }
  }
  ctx.restore();
}

function drawMill(ctx: CanvasRenderingContext2D, mill: Mill, t: number) {
  const rise = phase(t, mill.at, mill.at + 2.6);
  if (rise <= 0) return;
  const h = mill.h * rise;
  const top = GROUND - h;

  // body
  ctx.fillStyle = "#31404f";
  ctx.fillRect(mill.x, top, mill.w, h);

  // sawtooth roof
  ctx.beginPath();
  for (let s = 0; s < 3; s++) {
    const sx = mill.x + (s * mill.w) / 3;
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + mill.w / 6, top - 13 * rise);
    ctx.lineTo(sx + mill.w / 3, top);
  }
  ctx.fillStyle = "#3d4f61";
  ctx.fill();

  // chimney + smoke
  const chimneyX = mill.x + mill.w - 14;
  ctx.fillStyle = "#26313d";
  ctx.fillRect(chimneyX, top - 34 * rise, 10, 34 * rise);
  const smokeIn = phase(t, mill.at + 3, mill.at + 4.5);
  if (smokeIn > 0) {
    for (let s = 0; s < 4; s++) {
      const c = cycle(t * 0.22 + s * 0.29);
      ctx.save();
      ctx.globalAlpha = smokeIn * (1 - c) * 0.3;
      ctx.beginPath();
      ctx.arc(chimneyX + 5 + Math.sin(c * 5 + s) * 7, top - 40 * rise - c * 52, 6 + c * 9, 0, 7);
      ctx.fillStyle = "#9aa7b3";
      ctx.fill();
      ctx.restore();
    }
  }

  // windows lighting up in a shuffled order
  const litCount = phase(t, mill.at + 2.2, mill.at + 6) * 12;
  for (let k = 0; k < 12; k++) {
    const col = k % 3;
    const row = Math.floor(k / 3);
    const wx = mill.x + 11 + col * 20;
    const wy = top + 14 + row * (mill.h / 4.8);
    if (wy + 9 > GROUND) continue;
    const lit = mill.windowOrder[k] < litCount;
    ctx.fillStyle = lit ? "#ebcb8b" : "#222c36";
    ctx.fillRect(wx, wy, 12, 9);
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
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    // ground
    ctx.fillStyle = "#232c33";
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = "#39434d";
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();

    drawTurbine(ctx, t, phase(t, 0, 1.5));
    fadeText(ctx, "Pykara Falls", 150, 118, phase(t, 0.5, 2), "12px -apple-system, sans-serif", "#93a4b0");
    fadeText(ctx, "1932", 150, 100, phase(t, 1, 3) * (1.2 - 0.2 * Math.sin(t)), "800 22px -apple-system, sans-serif", "#ebcb8b");

    drawPowerLine(ctx, t, phase(t, 4, 6));

    for (const mill of MILLS) drawMill(ctx, mill, t);
    fadeText(ctx, "spinning mills", 750, 410, phase(t, 12, 14), "12px -apple-system, sans-serif", "#93a4b0");

    // flowing cloth ribbon — the output
    const cloth = phase(t, 20, 24);
    if (cloth > 0) {
      ctx.save();
      ctx.globalAlpha = cloth * 0.9;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const y = 415 + Math.sin(x * 0.025 - t * 2.2) * 6 * cloth;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#e8eef2";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.lineDashOffset = -t * 40;
      ctx.setLineDash([2, 26]);
      ctx.strokeStyle = "#e8a13c";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }

    // title
    const finale = phase(t, 23, 25.5);
    if (finale > 0) {
      fadeText(ctx, "MANCHESTER OF SOUTH INDIA", 460, 52, finale, `800 ${lerp(16, 24, finale)}px -apple-system, sans-serif`, "#e8eef2");
    } else {
      fadeText(ctx, "water becomes power becomes yarn", 500, 52, phase(t, 0.3, 1.6) * (1 - phase(t, 21, 23)), "700 18px -apple-system, sans-serif", "#e8eef2");
    }
  },
};
