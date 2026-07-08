/**
 * Coimbatore tutorial · slide 3 — "Black soil, white gold".
 * Monsoon rain, the black regur soil drinking it in, and cotton growing out of it —
 * stem by stem, boll by boll. Pure renderFrame(t).
 */
import { fadeText, lerp, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;
const SOIL_Y = 302;

const rand = prng(2026);

/* Rain columns — fixed x positions and phase offsets. */
const DROPS = Array.from({ length: 46 }, () => ({
  x: 40 + rand() * 840,
  offset: rand(),
  speed: 0.55 + rand() * 0.35,
}));

/* Pebbles in the soil cross-section. */
const PEBBLES = Array.from({ length: 26 }, () => ({
  x: 30 + rand() * 860,
  y: SOIL_Y + 26 + rand() * 84,
  r: 2 + rand() * 3.5,
}));

/* The cotton plants. */
interface Plant {
  x: number;
  grow: number; // when the stem starts growing
  lean: number;
  height: number;
}
const PLANTS: Plant[] = Array.from({ length: 9 }, (_, i) => ({
  x: 110 + i * 88 + (rand() - 0.5) * 18,
  grow: 5 + i * 0.55 + rand() * 0.4,
  lean: (rand() - 0.5) * 30,
  height: 78 + rand() * 26,
}));

function drawPlant(ctx: CanvasRenderingContext2D, plant: Plant, t: number) {
  const g = phase(t, plant.grow, plant.grow + 3.2);
  if (g <= 0) return;

  const topX = plant.x + plant.lean * g;
  const topY = SOIL_Y - plant.height * g;

  // stem — a quadratic curve that extends as it grows
  ctx.strokeStyle = "#5a7d4a";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(plant.x, SOIL_Y);
  ctx.quadraticCurveTo(plant.x + plant.lean * 0.3, SOIL_Y - plant.height * g * 0.6, topX, topY);
  ctx.stroke();

  // leaves appear at two heights once the stem passes them
  for (const [frac, side] of [
    [0.45, -1],
    [0.7, 1],
  ] as const) {
    const leafIn = phase(g, frac, frac + 0.18);
    if (leafIn <= 0) continue;
    const lx = lerp(plant.x, topX, frac);
    const ly = lerp(SOIL_Y, topY, frac);
    ctx.save();
    ctx.translate(lx, ly);
    ctx.scale(leafIn * side, leafIn);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(16, -10, 26, -2);
    ctx.quadraticCurveTo(14, 4, 0, 0);
    ctx.fillStyle = "#4c6b40";
    ctx.fill();
    ctx.restore();
  }

  // the boll: pops open into white fluff at the top
  const boll = phase(t, plant.grow + 3.6, plant.grow + 5.2);
  if (boll > 0) {
    ctx.save();
    ctx.translate(topX, topY - 4);
    ctx.scale(boll, boll);
    for (const [dx, dy, r] of [
      [0, -4, 7],
      [-6, 2, 6],
      [6, 2, 6],
      [0, 4, 6.5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, 7);
      ctx.fillStyle = "#eef2f5";
      ctx.fill();
    }
    // the husk peeking through
    ctx.beginPath();
    ctx.arc(0, 1, 2.6, 0, 7);
    ctx.fillStyle = "#7a5a3a";
    ctx.fill();
    ctx.restore();
  }
}

export const coimbatoreCottonSlide: CanvasSlideDefinition = {
  duration: 26,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "now look down. the plains around coimbatore are regur — black cotton soil, deep and moody, that holds monsoon rain like a sponge." },
    { at: 7, text: "so the kongu farmers grew the one crop that soil loves best. cotton. acres and acres of it." },
    { at: 14, text: "raw cotton, hand-spun yarn, woven cloth — centuries before the first mill, the region's trade identity was already fibre." },
    { at: 21, text: "remember this field. every chimney in the next chapter grows out of it." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    // sky wash
    ctx.fillStyle = "#20303c";
    ctx.fillRect(0, 0, W, SOIL_Y);

    // monsoon rain — fades in, then clears
    const rainStrength = phase(t, 0.5, 2) * (1 - phase(t, 6, 9));
    if (rainStrength > 0) {
      ctx.save();
      ctx.globalAlpha = rainStrength * 0.7;
      ctx.strokeStyle = "#6d94ad";
      ctx.lineWidth = 1.4;
      for (const d of DROPS) {
        const c = (t * d.speed + d.offset) % 1;
        const y = c * (SOIL_Y - 20);
        ctx.beginPath();
        ctx.moveTo(d.x, y);
        ctx.lineTo(d.x - 3, y + 14);
        ctx.stroke();
      }
      ctx.restore();
    }

    // the soil cross-section
    const soilIn = phase(t, 0, 1.5);
    ctx.save();
    ctx.globalAlpha = soilIn;
    const soil = ctx.createLinearGradient(0, SOIL_Y, 0, H);
    soil.addColorStop(0, "#1c1a17");
    soil.addColorStop(1, "#0f0e0c");
    ctx.fillStyle = soil;
    ctx.fillRect(0, SOIL_Y, W, H - SOIL_Y);
    // moisture sheen after the rain has soaked in
    const soak = phase(t, 4, 8);
    if (soak > 0) {
      ctx.globalAlpha = soilIn * soak * 0.18;
      ctx.fillStyle = "#4d7286";
      ctx.fillRect(0, SOIL_Y, W, 30);
    }
    ctx.globalAlpha = soilIn * 0.5;
    ctx.fillStyle = "#332e28";
    for (const p of PEBBLES) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    fadeText(ctx, "black cotton soil (regur)", 800, 336, phase(t, 2, 4), "italic 12px -apple-system, sans-serif", "#8a7f6a");

    // ground line
    ctx.strokeStyle = "#3a352c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, SOIL_Y);
    ctx.lineTo(W, SOIL_Y);
    ctx.stroke();

    // cotton plants
    for (const plant of PLANTS) drawPlant(ctx, plant, t);

    // closing badge
    const badge = phase(t, 20, 22.5);
    if (badge > 0) {
      fadeText(ctx, "cotton — the region's white gold", 460, 60, badge, "700 19px -apple-system, sans-serif", "#e8eef2");
      fadeText(ctx, "soil + monsoon + the gap to move it through", 460, 84, badge * 0.85, "13px -apple-system, sans-serif", "#93a4b0");
    } else {
      fadeText(ctx, "black soil, white gold", 460, 60, phase(t, 0.3, 1.5) * (1 - phase(t, 18, 20)), "700 19px -apple-system, sans-serif", "#e8eef2");
    }
  },
};
