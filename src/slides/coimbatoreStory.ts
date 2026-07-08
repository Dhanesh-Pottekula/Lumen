/**
 * Coimbatore — the full story as ONE continuous film. Pure renderFrame(t), ~152 s.
 *
 * Five chapters with connective tissue between them:
 *   geography (0–32)  → a caravan gold dot flies up and BECOMES the first Roman coin
 *   roman trade (30–58) → the coins SINK into the rising black soil
 *   cotton (56–84)      → one boll spins a THREAD that pulls us into the mill era
 *   mills (82–114)      → the spinning TURBINE morphs into the pump IMPELLER
 *   machines (112–142)  → the skyline stays up as the FINALE recaps the whole journey (140–152)
 *
 * Every element — chapter fades, bridges, morphs — derives from t. Scrub anywhere.
 */
import { clamp01, cycle, fadeText, lerp, makePath, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

/* ────────────────────────── chapter windows ────────────────────────── */

const GEO = { start: 0, end: 32 };
const ROME = { start: 30, end: 58 };
const COTTON = { start: 56, end: 84 };
const MILLS = { start: 82, end: 114 };
const CITY = { start: 112, end: 142 };
const FINALE = { start: 140, end: 152 };

/** Fade-in/out envelope for a chapter window. */
const envelope = (t: number, win: { start: number; end: number }) =>
  phase(t, win.start, win.start + 2.2) * (1 - phase(t, win.end - 2.2, win.end));

function withAlpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  draw();
  ctx.restore();
}

/* ─────────────────────── chapter 1 · geography ─────────────────────── */

const geoRand = prng(41);
interface Peak {
  x: number;
  y: number;
  size: number;
  order: number;
}
const PEAKS: Peak[] = [];
for (let y = 55; y <= 185; y += 26) PEAKS.push({ x: 292 + (geoRand() - 0.5) * 44, y, size: 15 + geoRand() * 12, order: geoRand() });
for (let y = 258; y <= 392; y += 26) PEAKS.push({ x: 296 + (geoRand() - 0.5) * 44, y, size: 15 + geoRand() * 12, order: geoRand() });

const ROUTE = makePath([
  [92, 150],
  [190, 195],
  [300, 222],
  [430, 216],
  [640, 228],
  [880, 232],
]);
const CBE: [number, number] = [430, 216];

function drawGeo(ctx: CanvasRenderingContext2D, tau: number, t: number) {
  const landIn = phase(tau, 0, 2.5);

  withAlpha(ctx, landIn, () => {
    ctx.fillStyle = "#232c33";
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(118, 0);
    for (let y = 0; y <= H; y += 8) ctx.lineTo(114 + Math.sin(y * 0.045) * 10, y);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = "#1b3442";
    ctx.fill();
  });
  fadeText(ctx, "A R A B I A N   S E A", 56, 220, landIn * 0.8, "11px -apple-system, sans-serif", "#4d7286");

  const mountainsIn = phase(tau, 1.5, 7);
  for (const p of PEAKS) {
    const rise = phase(mountainsIn, p.order * 0.55, p.order * 0.55 + 0.45);
    if (rise <= 0) continue;
    const s = p.size * rise;
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y + s * 0.6);
    ctx.lineTo(p.x, p.y - s);
    ctx.lineTo(p.x + s, p.y + s * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#39485a";
    ctx.fill();
  }
  fadeText(ctx, "WESTERN GHATS", 296, 34, phase(tau, 5, 7) * 0.9, "600 12px -apple-system, sans-serif", "#7d90a5");

  const gapIn = phase(tau, 6, 9);
  withAlpha(ctx, gapIn * (0.5 + 0.3 * Math.sin(t * 2.2)), () => {
    const glow = ctx.createRadialGradient(300, 222, 4, 300, 222, 56);
    glow.addColorStop(0, "rgba(232, 161, 60, 0.55)");
    glow.addColorStop(1, "rgba(232, 161, 60, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(230, 160, 150, 124);
  });
  fadeText(ctx, "PALGHAT GAP", 300, 268, gapIn, "700 12px -apple-system, sans-serif", "#e8a13c");
  fadeText(ctx, "~30 km wide", 300, 283, gapIn * 0.8, "10px -apple-system, sans-serif", "#93a4b0");

  // route + caravan
  const routeIn = phase(tau, 11, 14);
  withAlpha(ctx, routeIn * 0.5, () => {
    ctx.setLineDash([7, 9]);
    ctx.lineDashOffset = -t * 26;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const p = ROUTE.at((i / 60) * ROUTE.length);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#8ea2b5";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.setLineDash([]);
  });
  withAlpha(ctx, phase(tau, 12, 15), () => {
    for (let i = 0; i < 9; i++) {
      const gold = ROUTE.at(cycle(t * 0.045 + i / 9) * ROUTE.length);
      ctx.beginPath();
      ctx.arc(gold.x, gold.y - 4, 3.4, 0, 7);
      ctx.fillStyle = "#e8a13c";
      ctx.fill();
      const goods = ROUTE.at((1 - cycle(t * 0.045 + i / 9 + 0.5)) * ROUTE.length);
      ctx.beginPath();
      ctx.arc(goods.x, goods.y + 5, 3.4, 0, 7);
      ctx.fillStyle = "#5cc8ae";
      ctx.fill();
    }
  });

  // ports and towns
  const cities: [string, number, number, number][] = [
    ["Muziris (port)", 92, 150, 3],
    ["Karur", 640, 228, 13],
    ["to Madurai →", 848, 260, 14],
  ];
  for (const [label, x, y, appear] of cities) {
    const a = phase(tau, appear, appear + 1.5);
    if (a <= 0) continue;
    withAlpha(ctx, a, () => {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 7);
      ctx.fillStyle = "#c3d0da";
      ctx.fill();
    });
    fadeText(ctx, label, x, y - 10, a, "11px -apple-system, sans-serif", "#aebbc6");
  }

  // Coimbatore
  const cbeIn = phase(tau, 9, 11);
  withAlpha(ctx, cbeIn, () => {
    const pulse = 1 + 0.25 * Math.sin(t * 3);
    const halo = ctx.createRadialGradient(CBE[0], CBE[1], 2, CBE[0], CBE[1], 26 * pulse);
    halo.addColorStop(0, "rgba(92, 200, 174, 0.8)");
    halo.addColorStop(1, "rgba(92, 200, 174, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(CBE[0] - 60, CBE[1] - 60, 120, 120);
    ctx.beginPath();
    ctx.arc(CBE[0], CBE[1], 5.5, 0, 7);
    ctx.fillStyle = "#5cc8ae";
    ctx.fill();
  });
  fadeText(ctx, "COIMBATORE", CBE[0], CBE[1] - 16, cbeIn, "700 13px -apple-system, sans-serif", "#e8eef2");

  fadeText(ctx, "why here?", 460, lerp(210, 26, phase(tau, 0.8, 2.5)), phase(tau, 0.3, 1.4), "700 20px -apple-system, sans-serif", "#e8eef2");
}

/* ─────────────────────── chapter 2 · roman trade ────────────────────── */

const romeRand = prng(77);
interface Coin {
  x: number;
  y: number;
  at: number; // local (chapter) time the coin starts falling
  spin: number;
}
const COINS: Coin[] = Array.from({ length: 12 }, (_, i) => ({
  x: 330 + romeRand() * 130,
  y: 298 + romeRand() * 34,
  at: 6 + i * 0.75,
  spin: romeRand() * Math.PI,
}));

function drawCoinShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 7);
  ctx.fillStyle = "#d9a73a";
  ctx.fill();
  ctx.strokeStyle = "#f3d27a";
  ctx.lineWidth = r * 0.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.1, 0, r * 0.45, -1.9, 1.6);
  ctx.strokeStyle = "#8a6420";
  ctx.lineWidth = r * 0.16;
  ctx.stroke();
  const shine = Math.max(0, Math.sin(t * 0.9 + spin)) * 0.3;
  if (shine > 0) {
    ctx.globalAlpha *= 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 7);
    ctx.fillStyle = `rgba(255, 243, 207, ${shine})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawRome(ctx: CanvasRenderingContext2D, tau: number, t: number) {
  // timeline
  const tlIn = phase(tau, 0.8, 2.8);
  withAlpha(ctx, tlIn, () => {
    ctx.strokeStyle = "#2b3640";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 40);
    ctx.lineTo(770, 40);
    ctx.stroke();
    const marker = lerp(150, 770, Math.min(1, tau / 26));
    ctx.beginPath();
    ctx.arc(marker, 40, 5, 0, 7);
    ctx.fillStyle = "#e8a13c";
    ctx.fill();
  });
  fadeText(ctx, "300 BCE", 150, 62, tlIn, "11px -apple-system, sans-serif", "#93a4b0");
  fadeText(ctx, "SANGAM ERA", 460, 26, tlIn, "600 11px -apple-system, sans-serif", "#7d90a5");
  fadeText(ctx, "300 CE", 770, 62, tlIn, "11px -apple-system, sans-serif", "#93a4b0");

  // the Noyyal
  const riverIn = phase(tau, 1, 3);
  withAlpha(ctx, riverIn, () => {
    for (let line = 0; line < 3; line++) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const y = 372 + line * 12 + Math.sin(x * 0.02 + t * 1.4 + line) * 6;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = line === 1 ? "#3e7c8f" : "#2f5d6d";
      ctx.lineWidth = line === 1 ? 3 : 1.6;
      ctx.stroke();
    }
  });
  fadeText(ctx, "the Noyyal", 60, 358, riverIn * 0.9, "italic 12px -apple-system, sans-serif", "#5d8a99", "left");

  // ship
  const shipIn = phase(tau, 1.5, 8);
  const shipAlpha = phase(tau, 1.5, 3);
  if (shipAlpha > 0) {
    const sx = lerp(-90, 170, 1 - (1 - shipIn) ** 3);
    const sy = 150 + Math.sin(t * 1.1) * 4;
    withAlpha(ctx, shipAlpha, () => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.beginPath();
      ctx.moveTo(-52, 0);
      ctx.quadraticCurveTo(-40, 26, 0, 28);
      ctx.quadraticCurveTo(46, 26, 60, -4);
      ctx.lineTo(44, 2);
      ctx.lineTo(-46, 2);
      ctx.closePath();
      ctx.fillStyle = "#7a5a3a";
      ctx.fill();
      ctx.strokeStyle = "#93a4b0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -66);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-34, -64);
      ctx.quadraticCurveTo(0, -50, 34, -64);
      ctx.lineTo(34, -22);
      ctx.quadraticCurveTo(0, -34, -34, -22);
      ctx.closePath();
      ctx.fillStyle = "#d9cbb2";
      ctx.fill();
      ctx.fillStyle = "#b0413e";
      ctx.fillRect(-34, -48, 68, 7);
      ctx.restore();
    });
  }

  // coins fall — and later SINK into the rising soil (the bridge to chapter 3)
  const sink = phase(t, 53, 57.5);
  for (const c of COINS) {
    const p = phase(tau, c.at, c.at + 1.1);
    if (p <= 0) continue;
    const fall = 1 - (1 - p) ** 3;
    const y = lerp(40, c.y, fall) + sink * 95;
    withAlpha(ctx, 1 - sink * 0.7, () => drawCoinShape(ctx, c.x, y, 10, t, c.spin));
  }
  fadeText(ctx, "roman gold hoards, found along the river", 395, 352, phase(tau, 9, 11) * (1 - sink), "11px -apple-system, sans-serif", "#b08a3c");

  // exports flow back to the ship
  const exportsIn = phase(tau, 14, 16);
  if (exportsIn > 0) {
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 3; j++) {
        const c = cycle(t * 0.13 + j / 3 + k * 0.11);
        const x = lerp(760, 210, c);
        const y = 178 + k * 26 + Math.sin(c * 9) * 3;
        withAlpha(ctx, exportsIn * Math.min(1, (1 - c) * 4) * Math.min(1, c * 4), () => {
          if (k === 0) {
            for (let i = 0; i < 5; i++) {
              ctx.beginPath();
              ctx.arc(x + (i % 3) * 6 - 6, y + Math.floor(i / 3) * 6 - 3, 3, 0, 7);
              ctx.fillStyle = "#3d2f28";
              ctx.fill();
            }
          } else if (k === 1) {
            ctx.fillStyle = "#e8eef2";
            ctx.fillRect(x - 14, y - 8, 28, 16);
            ctx.fillStyle = "#c3d0da";
            ctx.fillRect(x - 14, y - 2, 28, 3);
          } else {
            ctx.beginPath();
            ctx.moveTo(x, y - 11);
            ctx.lineTo(x + 8, y - 4);
            ctx.lineTo(x + 5, y + 9);
            ctx.lineTo(x - 5, y + 9);
            ctx.lineTo(x - 8, y - 4);
            ctx.closePath();
            ctx.fillStyle = "#4fbfa2";
            ctx.fill();
          }
        });
      }
    }
    fadeText(ctx, "→ to Rome:  pepper · cotton · beryl", 480, 148, exportsIn, "600 13px -apple-system, sans-serif", "#5cc8ae");
  }

  fadeText(ctx, "the first customers were roman", 460, lerp(220, 96, phase(tau, 0.5, 2)), phase(tau, 0.2, 1.4) * (1 - phase(tau, 20, 22)), "700 19px -apple-system, sans-serif", "#e8eef2");
}

/* bridge A: a caravan gold dot flies up and becomes the first coin */
function drawGoldToCoinBridge(ctx: CanvasRenderingContext2D, t: number) {
  const p = phase(t, 29, 35);
  if (p <= 0 || p >= 1) return;
  const from = ROUTE.at(0.35 * ROUTE.length);
  const x = lerp(from.x, COINS[0].x, p);
  const y = lerp(from.y, 40, p) - Math.sin(p * Math.PI) * 60; // arcs upward
  drawCoinShape(ctx, x, y, lerp(3.4, 10, p), t, 0);
}

/* ──────────────────────── chapter 3 · cotton ────────────────────────── */

const cottonRand = prng(2026);
const SOIL_Y = 302;
const DROPS = Array.from({ length: 46 }, () => ({
  x: 40 + cottonRand() * 840,
  offset: cottonRand(),
  speed: 0.55 + cottonRand() * 0.35,
}));
const PEBBLES = Array.from({ length: 26 }, () => ({
  x: 30 + cottonRand() * 860,
  y: SOIL_Y + 26 + cottonRand() * 84,
  r: 2 + cottonRand() * 3.5,
}));
interface Plant {
  x: number;
  grow: number;
  lean: number;
  height: number;
}
const PLANTS: Plant[] = Array.from({ length: 9 }, (_, i) => ({
  x: 110 + i * 88 + (cottonRand() - 0.5) * 18,
  grow: 4 + i * 0.55 + cottonRand() * 0.4,
  lean: (cottonRand() - 0.5) * 30,
  height: 78 + cottonRand() * 26,
}));
const THREAD_PLANT = PLANTS[4];

function plantTop(plant: Plant, g: number): [number, number] {
  return [plant.x + plant.lean * g, SOIL_Y - plant.height * g];
}

function drawCotton(ctx: CanvasRenderingContext2D, tau: number, t: number) {
  // sky
  withAlpha(ctx, phase(tau, 0, 1.5), () => {
    ctx.fillStyle = "#20303c";
    ctx.fillRect(0, 0, W, SOIL_Y);
  });

  // the soil RISES from the bottom — this is the bridge from the sinking coins
  const soilRise = phase(t, 53.5, 58);
  const soilTop = lerp(H, SOIL_Y, soilRise);
  const soil = ctx.createLinearGradient(0, soilTop, 0, H);
  soil.addColorStop(0, "#1c1a17");
  soil.addColorStop(1, "#0f0e0c");
  ctx.fillStyle = soil;
  ctx.fillRect(0, soilTop, W, H - soilTop);
  withAlpha(ctx, soilRise * 0.5, () => {
    ctx.fillStyle = "#332e28";
    for (const p of PEBBLES) {
      if (p.y < soilTop) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fill();
    }
  });
  ctx.strokeStyle = "#3a352c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, soilTop);
  ctx.lineTo(W, soilTop);
  ctx.stroke();

  // one half-buried coin — the callback ("farmers still plough them out")
  const buriedIn = phase(tau, 1, 3) * (1 - phase(tau, 12, 14));
  if (buriedIn > 0) {
    withAlpha(ctx, buriedIn, () => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, SOIL_Y + 6);
      ctx.clip();
      drawCoinShape(ctx, 452, SOIL_Y + 2, 9, t, 1.2);
      ctx.restore();
    });
    fadeText(ctx, "(they still plough them out)", 452, SOIL_Y + 26, buriedIn * 0.8, "italic 10px -apple-system, sans-serif", "#8a7f6a");
  }

  fadeText(ctx, "black cotton soil (regur)", 800, 336, phase(tau, 2, 4), "italic 12px -apple-system, sans-serif", "#8a7f6a");

  // monsoon rain — arrives, soaks, clears
  const rainStrength = phase(tau, 0.5, 2) * (1 - phase(tau, 6, 9));
  withAlpha(ctx, rainStrength * 0.7, () => {
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
  });
  const soak = phase(tau, 4, 8);
  withAlpha(ctx, soak * 0.18, () => {
    ctx.fillStyle = "#4d7286";
    ctx.fillRect(0, SOIL_Y, W, 30);
  });

  // plants
  for (const plant of PLANTS) {
    const g = phase(tau, plant.grow, plant.grow + 3.2);
    if (g <= 0) continue;
    const [topX, topY] = plantTop(plant, g);

    ctx.strokeStyle = "#5a7d4a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(plant.x, SOIL_Y);
    ctx.quadraticCurveTo(plant.x + plant.lean * 0.3, SOIL_Y - plant.height * g * 0.6, topX, topY);
    ctx.stroke();

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

    const boll = phase(tau, plant.grow + 3.6, plant.grow + 5.2);
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
      ctx.beginPath();
      ctx.arc(0, 1, 2.6, 0, 7);
      ctx.fillStyle = "#7a5a3a";
      ctx.fill();
      ctx.restore();
    }
  }

  fadeText(ctx, "black soil, white gold", 460, 60, phase(tau, 0.3, 1.5) * (1 - phase(tau, 18, 20)), "700 19px -apple-system, sans-serif", "#e8eef2");
}

/* bridge C: a thread pulls out of one boll and leads right, into the mill era */
function drawThreadBridge(ctx: CanvasRenderingContext2D, t: number) {
  const p = phase(t, 80, 86);
  const out = phase(t, 88, 92);
  if (p <= 0 || out >= 1) return;
  const [bx, by] = plantTop(THREAD_PLANT, 1);
  withAlpha(ctx, (1 - out) * Math.min(1, p * 3), () => {
    ctx.strokeStyle = "#eef2f5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by - 4);
    const endX = lerp(bx, W + 20, p);
    for (let x = bx; x <= endX; x += 12) {
      const sag = Math.sin((x - bx) * 0.02 + t * 1.5) * 5;
      ctx.lineTo(x, lerp(by - 4, 330, (x - bx) / Math.max(1, W - bx)) + sag);
    }
    ctx.stroke();
    // the little fluff being pulled
    const fx = lerp(bx, W + 20, p);
    const fy = lerp(by - 4, 330, (fx - bx) / Math.max(1, W - bx));
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, 7);
    ctx.fillStyle = "#eef2f5";
    ctx.fill();
  });
}

/* ──────────────────────── chapter 4 · mills ─────────────────────────── */

const millRand = prng(1932);
const GROUND = 380;
const WIRE = makePath([
  [212, 300],
  [300, 208],
  [420, 232],
  [540, 210],
  [640, 240],
]);
const PYLONS = [300, 420, 540] as const;
interface Mill {
  x: number;
  w: number;
  h: number;
  at: number;
  windowOrder: number[];
}
const MILLS_B: Mill[] = [640, 726, 806].map((x, i) => {
  const order = Array.from({ length: 12 }, (_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(millRand() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return { x, w: 74, h: 118 + i * 22, at: 8 + i * 2.4, windowOrder: order };
});

const TURBINE_POS: [number, number] = [170, 322];

function turbineAngle(tau: number): number {
  const ramp = clamp01((tau - 2) / 4);
  const spun = tau < 2 ? 0 : tau < 6 ? ((tau - 2) * (tau - 2)) / 8 : tau - 6 + 2;
  return spun * 5 * (0.2 + 0.8 * ramp);
}

function drawTurbineWheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = "#1f2830";
  ctx.fill();
  ctx.strokeStyle = "#93a4b0";
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let b = 0; b < 6; b++) {
    const a = angle + (b * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 0.87, y + Math.sin(a) * r * 0.87);
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.2, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();
}

function drawMills(ctx: CanvasRenderingContext2D, tau: number, t: number) {
  // ground
  ctx.fillStyle = "#232c33";
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.strokeStyle = "#39434d";
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(W, GROUND);
  ctx.stroke();

  // cliff + waterfall + turbine
  withAlpha(ctx, phase(tau, 0, 1.5), () => {
    ctx.fillStyle = "#2b3640";
    ctx.fillRect(74, 130, 60, 200);
    const flow = phase(tau, 1, 2.5);
    withAlpha(ctx, flow * 0.85, () => {
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
    });
    // the wheel itself is drawn by the morph layer from t=110; before that, here
    if (t < 110) drawTurbineWheel(ctx, TURBINE_POS[0], TURBINE_POS[1], 30, turbineAngle(tau));
  });
  fadeText(ctx, "Pykara Falls", 150, 118, phase(tau, 0.5, 2), "12px -apple-system, sans-serif", "#93a4b0");
  fadeText(ctx, "1932", 150, 100, phase(tau, 1, 3), "800 22px -apple-system, sans-serif", "#ebcb8b");

  // power line
  withAlpha(ctx, phase(tau, 4, 6), () => {
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
    ctx.beginPath();
    for (let i = 0; i <= 50; i++) {
      const p = WIRE.at((i / 50) * WIRE.length);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#5d7186";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    const live = phase(tau, 6, 7.5);
    if (live > 0) {
      for (let k = 0; k < 3; k++) {
        const p = WIRE.at(cycle(t * 0.34 + k / 3) * WIRE.length);
        withAlpha(ctx, live, () => {
          const glow = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 12);
          glow.addColorStop(0, "rgba(235, 203, 139, 0.95)");
          glow.addColorStop(1, "rgba(235, 203, 139, 0)");
          ctx.fillStyle = glow;
          ctx.fillRect(p.x - 12, p.y - 12, 24, 24);
        });
      }
    }
  });

  // mills
  for (const mill of MILLS_B) {
    const rise = phase(tau, mill.at, mill.at + 2.6);
    if (rise <= 0) continue;
    const h = mill.h * rise;
    const top = GROUND - h;
    ctx.fillStyle = "#31404f";
    ctx.fillRect(mill.x, top, mill.w, h);
    ctx.beginPath();
    for (let s = 0; s < 3; s++) {
      const sx = mill.x + (s * mill.w) / 3;
      ctx.moveTo(sx, top);
      ctx.lineTo(sx + mill.w / 6, top - 13 * rise);
      ctx.lineTo(sx + mill.w / 3, top);
    }
    ctx.fillStyle = "#3d4f61";
    ctx.fill();
    const chimneyX = mill.x + mill.w - 14;
    ctx.fillStyle = "#26313d";
    ctx.fillRect(chimneyX, top - 34 * rise, 10, 34 * rise);
    const smokeIn = phase(tau, mill.at + 3, mill.at + 4.5);
    for (let s = 0; s < 4 && smokeIn > 0; s++) {
      const c = cycle(t * 0.22 + s * 0.29);
      withAlpha(ctx, smokeIn * (1 - c) * 0.3, () => {
        ctx.beginPath();
        ctx.arc(chimneyX + 5 + Math.sin(c * 5 + s) * 7, top - 40 * rise - c * 52, 6 + c * 9, 0, 7);
        ctx.fillStyle = "#9aa7b3";
        ctx.fill();
      });
    }
    const litCount = phase(tau, mill.at + 2.2, mill.at + 6) * 12;
    for (let k = 0; k < 12; k++) {
      const wx = mill.x + 11 + (k % 3) * 20;
      const wy = top + 14 + Math.floor(k / 3) * (mill.h / 4.8);
      if (wy + 9 > GROUND) continue;
      ctx.fillStyle = mill.windowOrder[k] < litCount ? "#ebcb8b" : "#222c36";
      ctx.fillRect(wx, wy, 12, 9);
    }
  }

  // cloth ribbon
  const cloth = phase(tau, 18, 22);
  withAlpha(ctx, cloth * 0.9, () => {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = 415 + Math.sin(x * 0.025 - t * 2.2) * 6 * cloth;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#e8eef2";
    ctx.lineWidth = 5;
    ctx.stroke();
  });

  const manchester = phase(tau, 18, 20.5);
  if (manchester > 0) {
    fadeText(ctx, "MANCHESTER OF SOUTH INDIA", 460, 52, manchester * (1 - phase(tau, 27, 29)), "800 22px -apple-system, sans-serif", "#e8eef2");
  } else {
    fadeText(ctx, "water becomes power becomes yarn", 500, 52, phase(tau, 0.3, 1.6) * (1 - phase(tau, 16, 18)), "700 18px -apple-system, sans-serif", "#e8eef2");
  }
}

/* ─────────────────────── chapter 5 · machines ───────────────────────── */

const cityRand = prng(641);
const PUMP_POS: [number, number] = [210, 190];
const SHOPS = Array.from({ length: 40 }, () => ({
  x: 470 + cityRand() * 400,
  y: 70 + cityRand() * 220,
  size: 7 + cityRand() * 8,
  order: cityRand(),
}));
const LINKS = Array.from({ length: 18 }, () => {
  const a = Math.floor(cityRand() * SHOPS.length);
  let b = Math.floor(cityRand() * SHOPS.length);
  if (b === a) b = (b + 7) % SHOPS.length;
  return [a, b] as const;
});
const SKYLINE = Array.from({ length: 24 }, (_, i) => ({
  x: 30 + i * 37,
  w: 26 + cityRand() * 10,
  h: 26 + cityRand() * 78,
  order: cityRand(),
}));

function drawImpeller(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, t: number) {
  const angle = t * 3.4;
  for (let b = 0; b < 5; b++) {
    const a0 = angle + (b * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a0) * 10 * scale, y + Math.sin(a0) * 10 * scale);
    ctx.quadraticCurveTo(
      x + Math.cos(a0 + 0.55) * 34 * scale,
      y + Math.sin(a0 + 0.55) * 34 * scale,
      x + Math.cos(a0 + 0.95) * 50 * scale,
      y + Math.sin(a0 + 0.95) * 50 * scale,
    );
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 5 * scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, 9 * scale, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();
}

function drawSkyline(ctx: CanvasRenderingContext2D, stage: number) {
  for (const b of SKYLINE) {
    const rise = phase(stage, b.order * 0.5, b.order * 0.5 + 0.5);
    if (rise <= 0) continue;
    const h = b.h * rise;
    ctx.fillStyle = "#26313d";
    ctx.fillRect(b.x, H - h, b.w, h);
    const wr = prng(Math.round(b.x));
    for (let k = 0; k < 5; k++) {
      if (wr() > 0.5) continue;
      ctx.fillStyle = "rgba(235, 203, 139, 0.7)";
      ctx.fillRect(b.x + 4 + wr() * (b.w - 10), H - h + 6 + wr() * (h - 14), 3.4, 3.4);
    }
  }
}

function drawCity(ctx: CanvasRenderingContext2D, tau: number, t: number) {
  drawSkyline(ctx, phase(tau, 18, 24));

  // the pump assembles AROUND the wheel that arrived from the mills
  const casingIn = phase(tau, 2, 4.5);
  const [cx, cy] = PUMP_POS;

  // water particles once the casing exists
  withAlpha(ctx, phase(tau, 4, 6), () => {
    for (let k = 0; k < 26; k++) {
      const c = cycle(t * 0.45 + k / 26);
      const a = (k / 26) * Math.PI * 2 + t * 2.2 + c * 1.5;
      const r = 18 + c * 92;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, 7);
      ctx.fillStyle = `rgba(125, 179, 204, ${(1 - c) * 0.8})`;
      ctx.fill();
    }
  });

  // casing sweeps itself into existence
  if (casingIn > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, 62, -Math.PI / 2, -Math.PI / 2 + casingIn * Math.PI * 2);
    ctx.strokeStyle = "#93a4b0";
    ctx.lineWidth = 4;
    ctx.stroke();
    withAlpha(ctx, casingIn, () => {
      ctx.beginPath();
      ctx.arc(cx, cy, 60, 0, 7);
      ctx.fillStyle = "rgba(31, 40, 48, 0.85)";
      ctx.fill();
    });
    withAlpha(ctx, phase(casingIn, 0.6, 1), () => {
      ctx.fillStyle = "#2b3640";
      ctx.fillRect(cx + 48, cy - 92, 22, 52);
      ctx.strokeStyle = "#93a4b0";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 48, cy - 92, 22, 52);
    });
  }

  // impeller — same angle formula as the morph layer, so the handoff is seamless
  withAlpha(ctx, phase(tau, 1.5, 3), () => drawImpeller(ctx, cx, cy, 1, t));

  fadeText(ctx, "the coimbatore pump", cx, 292, phase(tau, 4, 6), "600 13px -apple-system, sans-serif", "#93a4b0");
  fadeText(ctx, "over half of india's pumps & motors", cx, 310, phase(tau, 4, 6) * 0.85, "11px -apple-system, sans-serif", "#5d7186");

  // the SME constellation
  const shopsStage = phase(tau, 8, 16);
  if (shopsStage > 0) {
    withAlpha(ctx, phase(tau, 13, 17) * 0.25, () => {
      ctx.strokeStyle = "#5cc8ae";
      ctx.lineWidth = 1;
      for (const [a, b] of LINKS) {
        ctx.beginPath();
        ctx.moveTo(SHOPS[a].x, SHOPS[a].y);
        ctx.lineTo(SHOPS[b].x, SHOPS[b].y);
        ctx.stroke();
      }
    });
    for (const s of SHOPS) {
      const on = phase(shopsStage, s.order * 0.8, s.order * 0.8 + 0.2);
      if (on <= 0) continue;
      withAlpha(ctx, on, () => {
        const half = (s.size / 2) * on;
        ctx.fillStyle = "#31404f";
        ctx.fillRect(s.x - half, s.y - half, half * 2, half * 2);
        ctx.fillStyle = "#ebcb8b";
        ctx.fillRect(s.x - half * 0.35, s.y - half * 0.35, half * 0.7, half * 0.7);
      });
    }
    fadeText(ctx, "thousands of small family firms — no giants", 665, 320, phase(tau, 12, 14), "600 13px -apple-system, sans-serif", "#93a4b0");
  }

  // rolling identity badges
  const words = ["pumps", "motors", "yarn", "wet grinders", "castings", "software"];
  const badgeIn = phase(tau, 16, 18);
  if (badgeIn > 0) {
    words.forEach((word, i) => {
      const a = phase(tau, 16 + i * 0.6, 17 + i * 0.6);
      fadeText(ctx, word, 130 + i * 135, 396, a * badgeIn, "600 14px -apple-system, sans-serif", i % 2 ? "#5cc8ae" : "#e8a13c");
    });
  }

  fadeText(ctx, "after the mills: machines", 460, 40, phase(tau, 0.3, 1.6) * (1 - phase(tau, 20, 22)), "700 18px -apple-system, sans-serif", "#e8eef2");
}

/* bridge D: the turbine wheel travels and MORPHS into the pump impeller */
function drawWheelMorph(ctx: CanvasRenderingContext2D, t: number) {
  const p = phase(t, 110, 115.5);
  if (p <= 0 || p >= 1) return;
  const x = lerp(TURBINE_POS[0], PUMP_POS[0], p);
  const y = lerp(TURBINE_POS[1], PUMP_POS[1], p) - Math.sin(p * Math.PI) * 40;
  const r = lerp(30, 50, p);
  // six teal spokes crossfade into five curved blades, spinning throughout
  withAlpha(ctx, 1 - p, () => drawTurbineWheel(ctx, x, y, r, turbineAngle(t - MILLS.start)));
  withAlpha(ctx, p, () => drawImpeller(ctx, x, y, r / 50, t));
  fadeText(ctx, "the turbine becomes the pump", x, y + r + 24, Math.sin(p * Math.PI), "italic 12px -apple-system, sans-serif", "#93a4b0");
}

/* ─────────────────────────── the finale ─────────────────────────────── */

function drawFinale(ctx: CanvasRenderingContext2D, tau: number, t: number) {
  // the skyline stays, faint, as the stage
  withAlpha(ctx, 0.3, () => drawSkyline(ctx, 1));

  // journey strip
  const lineIn = phase(tau, 0.5, 4.5);
  const y = 220;
  withAlpha(ctx, 0.8, () => {
    ctx.strokeStyle = "#48586a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(140, y);
    ctx.lineTo(140 + 640 * lineIn, y);
    ctx.stroke();
  });

  const stations: [string, string, (x: number) => void][] = [
    [
      "the gap",
      "antiquity",
      (x) => {
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 8);
        ctx.lineTo(x - 8, y - 26);
        ctx.lineTo(x - 1, y - 8);
        ctx.closePath();
        ctx.moveTo(x + 1, y - 8);
        ctx.lineTo(x + 8, y - 26);
        ctx.lineTo(x + 16, y - 8);
        ctx.closePath();
        ctx.fillStyle = "#39485a";
        ctx.fill();
      },
    ],
    ["roman gold", "~100 CE", (x) => drawCoinShape(ctx, x, y - 18, 9, t, 0.4)],
    [
      "cotton",
      "the centuries",
      (x) => {
        for (const [dx, dy, r] of [
          [0, -22, 6],
          [-5, -16, 5],
          [5, -16, 5],
        ] as const) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, 7);
          ctx.fillStyle = "#eef2f5";
          ctx.fill();
        }
      },
    ],
    [
      "the mills",
      "1932",
      (x) => {
        ctx.fillStyle = "#31404f";
        ctx.fillRect(x - 12, y - 26, 24, 18);
        ctx.fillStyle = "#26313d";
        ctx.fillRect(x + 4, y - 36, 6, 10);
        ctx.fillStyle = "#ebcb8b";
        ctx.fillRect(x - 8, y - 21, 6, 5);
      },
    ],
    ["machines", "today", (x) => drawImpeller(ctx, x, y - 18, 0.34, t * 0.5)],
  ];

  stations.forEach(([label, when, icon], i) => {
    const a = phase(tau, 0.8 + i * 0.85, 1.6 + i * 0.85);
    if (a <= 0) return;
    const x = 140 + i * 160;
    withAlpha(ctx, a, () => {
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, 7);
      ctx.fillStyle = "#5cc8ae";
      ctx.fill();
      icon(x);
    });
    fadeText(ctx, label, x, y + 22, a, "600 12px -apple-system, sans-serif", "#e8eef2");
    fadeText(ctx, when, x, y + 38, a * 0.75, "10px -apple-system, sans-serif", "#93a4b0");
  });

  const titleIn = phase(tau, 5.5, 7.5);
  if (titleIn > 0) {
    const pulse = 1 + 0.03 * Math.sin(t * 2.4);
    fadeText(ctx, "COIMBATORE", 460, 96, titleIn, `800 ${Math.round(30 * pulse)}px -apple-system, sans-serif`, "#e8eef2");
    fadeText(ctx, "the crossroads that never stopped trading", 460, 122, phase(tau, 6.5, 8.5), "14px -apple-system, sans-serif", "#e8a13c");
  }
}

/* ─────────────────────────── the film ───────────────────────────────── */

/** Global tempo. 1 = the authored 152 s cut; 2.5 ≈ 61 s. Everything — chapter
 *  windows, bridges, morphs, captions — compresses together, so seams stay aligned. */
const SPEED = 2.5;

export const coimbatoreStorySlide: CanvasSlideDefinition = {
  duration: 152 / SPEED,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "coimbatore. to explain this city, start with a map — and a mountain wall." },
    { at: 7, text: "the western ghats run sixteen hundred kilometres, with exactly one real break in them. the palghat gap." },
    { at: 13, text: "everything moving between the kerala coast and the tamil plains squeezed through here — gold and spices one way, cotton and cloth the other." },
    { at: 23, text: "and the town at the gap's mouth taxed it, traded it, and grew on it. now follow one of those gold pieces back in time..." },
    { at: 31, text: "...two thousand years back. roman ships anchored off the coast, hungry for pepper." },
    { at: 38, text: "their coins walked in through the gap — hoards of roman gold still turn up along the noyyal." },
    { at: 45, text: "and what went back: pepper, fine kongu cotton, and beryl, the green stone rome adored." },
    { at: 52, text: "watch the coins. they sank into the fields — and the fields are the next chapter." },
    { at: 58, text: "this is regur. black cotton soil — it drinks the monsoon and holds it like a sponge." },
    { at: 65, text: "so kongu farmers grew the crop that soil loves best. cotton, acres of it." },
    { at: 72, text: "raw cotton, hand-spun yarn, woven cloth. the trade identity was fibre, centuries before machines." },
    { at: 79, text: "now hold on to this one thread..." },
    { at: 84, text: "...because in 1932, pykara falls started spinning turbines. cheap hydroelectric power, right next to all that cotton." },
    { at: 92, text: "cotton plus electricity. mills rose one after another, windows lighting up village by village." },
    { at: 100, text: "within a generation they called it the manchester of south india." },
    { at: 107, text: "but the real story is what the mills left behind. keep your eye on the wheel." },
    { at: 113, text: "the workshops that repaired mill machines got good enough to build their own. the turbine became the pump." },
    { at: 121, text: "today the city makes over half of india's pumps and motors — in thousands of small family firms, not one giant." },
    { at: 129, text: "quiet capital, reinvested. make the machine, sell it modestly, build the next one. pumps, motors, castings, software." },
    { at: 137, text: "and the skyline keeps rising on the same old instinct." },
    { at: 141, text: "a gap in the mountains. roman gold. black soil. cheap water power. patient family firms." },
    { at: 147, text: "coimbatore — the crossroads that never stopped trading." },
  ].map((c) => ({ at: c.at / SPEED, text: c.text })),
  render(ctx, t) {
    t *= SPEED; // the film is authored on a 152 s clock; play it faster
    ctx.clearRect(0, 0, W, H);

    const aGeo = envelope(t, GEO);
    const aRome = envelope(t, ROME);
    const aCotton = envelope(t, COTTON);
    const aMills = envelope(t, MILLS);
    const aCity = envelope(t, CITY);
    const aFinale = phase(t, FINALE.start, FINALE.start + 2);

    withAlpha(ctx, aGeo, () => drawGeo(ctx, t - GEO.start, t));
    withAlpha(ctx, aRome, () => drawRome(ctx, t - ROME.start, t));
    drawGoldToCoinBridge(ctx, t);
    withAlpha(ctx, aCotton, () => drawCotton(ctx, t - COTTON.start, t));
    drawThreadBridge(ctx, t);
    withAlpha(ctx, aMills, () => drawMills(ctx, t - MILLS.start, t));
    withAlpha(ctx, aCity, () => drawCity(ctx, t - CITY.start, t));
    drawWheelMorph(ctx, t);
    withAlpha(ctx, aFinale, () => drawFinale(ctx, t - FINALE.start, t));

    // chapter progress dots along the very bottom
    const chapters = [GEO, ROME, COTTON, MILLS, CITY];
    chapters.forEach((ch, i) => {
      const active = t >= ch.start && t < ch.end;
      ctx.beginPath();
      ctx.arc(430 + i * 16, H - 8, active ? 3.4 : 2.2, 0, 7);
      ctx.fillStyle = active ? "#e8a13c" : t >= ch.end ? "#5cc8ae" : "#39434d";
      ctx.fill();
    });
  },
};
