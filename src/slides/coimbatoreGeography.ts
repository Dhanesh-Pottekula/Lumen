/**
 * Coimbatore tutorial · slide 1 — "The gap in the mountains".
 * A stylised top-down map: the Western Ghats wall, the Palghat Gap, and the trade
 * route that squeezed through it. Pure renderFrame(t) — all motion derives from t.
 */
import { cycle, fadeText, lerp, makePath, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

/* Mountain chain along x ≈ 300, with the gap at y 195..250. */
const rand = prng(41);
interface Peak {
  x: number;
  y: number;
  size: number;
  order: number;
}
const PEAKS: Peak[] = [];
for (let y = 55; y <= 185; y += 26) {
  PEAKS.push({ x: 292 + (rand() - 0.5) * 44, y, size: 15 + rand() * 12, order: rand() });
}
for (let y = 258; y <= 392; y += 26) {
  PEAKS.push({ x: 296 + (rand() - 0.5) * 44, y, size: 15 + rand() * 12, order: rand() });
}

/* The trade route: Muziris (coast) → through the gap → Coimbatore → Karur → east. */
const ROUTE = makePath([
  [92, 150],
  [190, 195],
  [300, 222],
  [430, 216],
  [640, 228],
  [880, 232],
]);
const COIMBATORE: [number, number] = [430, 216];

function drawPeak(ctx: CanvasRenderingContext2D, p: Peak, rise: number) {
  if (rise <= 0) return;
  const s = p.size * rise;
  ctx.beginPath();
  ctx.moveTo(p.x - s, p.y + s * 0.6);
  ctx.lineTo(p.x, p.y - s);
  ctx.lineTo(p.x + s, p.y + s * 0.6);
  ctx.closePath();
  ctx.fillStyle = "#39485a";
  ctx.fill();
  // snow-lit ridge edge
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - s);
  ctx.lineTo(p.x + s * 0.45, p.y - s * 0.25);
  ctx.strokeStyle = "#5d7186";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCaravan(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // gold flowing inland (west → east), goods flowing to the coast (east → west)
  for (let i = 0; i < 9; i++) {
    const dGold = cycle(t * 0.045 + i / 9) * ROUTE.length;
    const gold = ROUTE.at(dGold);
    ctx.beginPath();
    ctx.arc(gold.x, gold.y - 4, 3.4, 0, 7);
    ctx.fillStyle = "#e8a13c";
    ctx.fill();

    const dGoods = (1 - cycle(t * 0.045 + i / 9 + 0.5)) * ROUTE.length;
    const goods = ROUTE.at(dGoods);
    ctx.beginPath();
    ctx.arc(goods.x, goods.y + 5, 3.4, 0, 7);
    ctx.fillStyle = "#5cc8ae";
    ctx.fill();
  }
  ctx.restore();
}

export const coimbatoreGeographySlide: CanvasSlideDefinition = {
  duration: 30,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "start with the map. coimbatore sits at the mouth of the palghat gap — the only real break in the western ghats for sixteen hundred kilometres." },
    { at: 7, text: "north of the gap, the nilgiris. south, the anaimalais. everything moving between the kerala coast and the tamil plains had to squeeze through here." },
    { at: 13, text: "so it did — for two thousand years. gold and spices moving one way, cotton and cloth the other, caravan after caravan." },
    { at: 24, text: "the town waiting at the gap's mouth taxed it, traded it, and grew. geography made coimbatore a crossroads before anyone planned one." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    const landIn = phase(t, 0, 2.5);

    // land
    ctx.globalAlpha = landIn;
    ctx.fillStyle = "#232c33";
    ctx.fillRect(0, 0, W, H);

    // sea along the west with a wavy coastline
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(118, 0);
    for (let y = 0; y <= H; y += 8) ctx.lineTo(114 + Math.sin(y * 0.045) * 10, y);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = "#1b3442";
    ctx.fill();
    fadeText(ctx, "A R A B I A N   S E A", 56, 220, landIn * 0.8, "11px -apple-system, sans-serif", "#4d7286");
    ctx.globalAlpha = 1;

    // mountains rise, staggered
    const mountainsIn = phase(t, 1.5, 7);
    for (const p of PEAKS) drawPeak(ctx, p, phase(mountainsIn, p.order * 0.55, p.order * 0.55 + 0.45));
    fadeText(ctx, "WESTERN GHATS", 296, 34, phase(t, 5, 7) * 0.9, "600 12px -apple-system, sans-serif", "#7d90a5");

    // the gap: a pulsing pass between the ranges
    const gapIn = phase(t, 7, 10);
    if (gapIn > 0) {
      ctx.save();
      ctx.globalAlpha = gapIn * (0.5 + 0.3 * Math.sin(t * 2.2));
      const glow = ctx.createRadialGradient(300, 222, 4, 300, 222, 56);
      glow.addColorStop(0, "rgba(232, 161, 60, 0.55)");
      glow.addColorStop(1, "rgba(232, 161, 60, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(230, 160, 150, 124);
      ctx.restore();
      fadeText(ctx, "PALGHAT GAP", 300, 268, gapIn, "700 12px -apple-system, sans-serif", "#e8a13c");
      fadeText(ctx, "~30 km wide", 300, 283, gapIn * 0.8, "10px -apple-system, sans-serif", "#93a4b0");
    }

    // route line dashes flowing
    const routeIn = phase(t, 12, 15);
    if (routeIn > 0) {
      ctx.save();
      ctx.globalAlpha = routeIn * 0.5;
      ctx.setLineDash([7, 9]);
      ctx.lineDashOffset = -t * 26;
      ctx.beginPath();
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const p = ROUTE.at((i / steps) * ROUTE.length);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = "#8ea2b5";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    }
    drawCaravan(ctx, t, phase(t, 13, 16));

    // ports and towns
    const cities: [string, number, number, number][] = [
      ["Muziris (port)", 92, 150, 3],
      ["Karur", 640, 228, 14],
      ["to Madurai →", 848, 260, 15],
    ];
    for (const [label, x, y, appear] of cities) {
      const a = phase(t, appear, appear + 1.5);
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 7);
      ctx.fillStyle = "#c3d0da";
      ctx.fill();
      ctx.restore();
      fadeText(ctx, label, x, y - 10, a, "11px -apple-system, sans-serif", "#aebbc6");
    }

    // Coimbatore — the star of the show
    const cbeIn = phase(t, 10, 12);
    if (cbeIn > 0) {
      const pulse = 1 + 0.25 * Math.sin(t * 3);
      const finale = phase(t, 24, 27);
      ctx.save();
      ctx.globalAlpha = cbeIn;
      const halo = ctx.createRadialGradient(COIMBATORE[0], COIMBATORE[1], 2, COIMBATORE[0], COIMBATORE[1], 26 * pulse * (1 + finale));
      halo.addColorStop(0, "rgba(92, 200, 174, 0.8)");
      halo.addColorStop(1, "rgba(92, 200, 174, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(COIMBATORE[0] - 60, COIMBATORE[1] - 60, 120, 120);
      ctx.beginPath();
      ctx.arc(COIMBATORE[0], COIMBATORE[1], 5.5, 0, 7);
      ctx.fillStyle = "#5cc8ae";
      ctx.fill();
      ctx.restore();
      fadeText(
        ctx,
        "COIMBATORE",
        COIMBATORE[0],
        COIMBATORE[1] - 16,
        cbeIn,
        `700 ${13 + finale * 5}px -apple-system, sans-serif`,
        "#e8eef2",
      );
      fadeText(ctx, "the crossroads town", COIMBATORE[0], COIMBATORE[1] + 30, finale, "12px -apple-system, sans-serif", "#93a4b0");
    }

    // legend for the caravan colors
    const legendIn = phase(t, 15, 17);
    if (legendIn > 0) {
      ctx.save();
      ctx.globalAlpha = legendIn * 0.9;
      ctx.fillStyle = "#e8a13c";
      ctx.beginPath();
      ctx.arc(560, 388, 4, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#5cc8ae";
      ctx.beginPath();
      ctx.arc(560, 406, 4, 0, 7);
      ctx.fill();
      ctx.restore();
      fadeText(ctx, "gold & spices moving inland", 572, 392, legendIn, "11px -apple-system, sans-serif", "#93a4b0", "left");
      fadeText(ctx, "cotton & cloth moving to the coast", 572, 410, legendIn, "11px -apple-system, sans-serif", "#93a4b0", "left");
    }

    // title
    fadeText(ctx, "why here?", 460, lerp(210, 26, phase(t, 0.8, 2.5)), phase(t, 0.3, 1.4), "700 20px -apple-system, sans-serif", "#e8eef2");
  },
};
