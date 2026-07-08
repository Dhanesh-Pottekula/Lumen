/**
 * Coimbatore tutorial · slide 2 — "Roman gold on the Noyyal".
 * A Roman ship arrives, gold coins pile up along the river, and the exports —
 * pepper, cloth, beryl — flow back. Pure renderFrame(t).
 */
import { cycle, easeOutCubic, fadeText, lerp, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

/* Coin pile layout — seeded once, identical forever. */
const rand = prng(77);
interface Coin {
  x: number;
  y: number;
  at: number;
  spin: number;
}
const COINS: Coin[] = Array.from({ length: 12 }, (_, i) => ({
  x: 330 + rand() * 130,
  y: 298 + rand() * 34,
  at: 8 + i * 0.75,
  spin: rand() * Math.PI,
}));

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // hull
  ctx.beginPath();
  ctx.moveTo(-52, 0);
  ctx.quadraticCurveTo(-40, 26, 0, 28);
  ctx.quadraticCurveTo(46, 26, 60, -4);
  ctx.lineTo(44, 2);
  ctx.lineTo(-46, 2);
  ctx.closePath();
  ctx.fillStyle = "#7a5a3a";
  ctx.fill();
  // mast + square Roman sail
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
  // sail stripe
  ctx.fillStyle = "#b0413e";
  ctx.fillRect(-34, -48, 68, 7);
  ctx.restore();
}

function drawCoin(ctx: CanvasRenderingContext2D, c: Coin, t: number) {
  const p = phase(t, c.at, c.at + 1.1);
  if (p <= 0) return;
  const fall = easeOutCubic(p);
  const y = lerp(40, c.y, fall);
  ctx.save();
  ctx.translate(c.x, y);
  // shine sweep passes over the pile
  const shine = Math.max(0, Math.sin(t * 0.9 + c.spin)) * 0.35;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, 7);
  ctx.fillStyle = "#d9a73a";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, 7);
  ctx.strokeStyle = "#f3d27a";
  ctx.lineWidth = 2;
  ctx.stroke();
  // emperor's profile, suggested
  ctx.beginPath();
  ctx.arc(-1, 0, 4.5, -1.9, 1.6);
  ctx.strokeStyle = "#8a6420";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  if (shine > 0) {
    ctx.globalAlpha = shine;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, 7);
    ctx.fillStyle = "#fff3cf";
    ctx.fill();
  }
  ctx.restore();
}

/** One export item drifting toward the ship — pepper, cloth, or beryl. */
function drawExport(ctx: CanvasRenderingContext2D, kind: number, cyc: number, alpha: number) {
  if (alpha <= 0) return;
  const x = lerp(760, 210, cyc);
  const y = 178 + kind * 26 + Math.sin(cyc * 9) * 3;
  ctx.save();
  ctx.globalAlpha = alpha * Math.min(1, (1 - cyc) * 4) * Math.min(1, cyc * 4);
  if (kind === 0) {
    // peppercorns — a tight cluster of dark dots
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + (i % 3) * 6 - 6, y + Math.floor(i / 3) * 6 - 3, 3, 0, 7);
      ctx.fillStyle = "#3d2f28";
      ctx.fill();
      ctx.strokeStyle = "#6b5344";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (kind === 1) {
    // folded cotton cloth
    ctx.fillStyle = "#e8eef2";
    ctx.fillRect(x - 14, y - 8, 28, 16);
    ctx.fillStyle = "#c3d0da";
    ctx.fillRect(x - 14, y - 2, 28, 3);
  } else {
    // beryl crystal — the Kongu green stone
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x + 8, y - 4);
    ctx.lineTo(x + 5, y + 9);
    ctx.lineTo(x - 5, y + 9);
    ctx.lineTo(x - 8, y - 4);
    ctx.closePath();
    ctx.fillStyle = "#4fbfa2";
    ctx.fill();
    ctx.strokeStyle = "#9fe8d6";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();
}

export const coimbatoreRomanTradeSlide: CanvasSlideDefinition = {
  duration: 26,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "two thousand years ago, roman ships were already anchoring off the kerala coast, chasing pepper." },
    { at: 8, text: "their gold walked in through the gap. hoards of roman coins still turn up along the noyyal — farmers plough them out of the fields." },
    { at: 15, text: "and what walked back: pepper, fine kongu cotton, and beryl — the green gemstone rome adored, mined right here." },
    { at: 21, text: "this is coimbatore's oldest habit: sit on the route, make what travels well, and trade it far." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    // timeline across the top
    const tlIn = phase(t, 0.5, 2.5);
    if (tlIn > 0) {
      ctx.save();
      ctx.globalAlpha = tlIn;
      ctx.strokeStyle = "#2b3640";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(150, 40);
      ctx.lineTo(770, 40);
      ctx.stroke();
      const marker = lerp(150, 770, Math.min(1, t / 24));
      ctx.beginPath();
      ctx.arc(marker, 40, 5, 0, 7);
      ctx.fillStyle = "#e8a13c";
      ctx.fill();
      ctx.restore();
      fadeText(ctx, "300 BCE", 150, 62, tlIn, "11px -apple-system, sans-serif", "#93a4b0");
      fadeText(ctx, "SANGAM ERA", 460, 26, tlIn, "600 11px -apple-system, sans-serif", "#7d90a5");
      fadeText(ctx, "300 CE", 770, 62, tlIn, "11px -apple-system, sans-serif", "#93a4b0");
    }

    // the Noyyal — a flowing ribbon along the bottom
    const riverIn = phase(t, 1, 3);
    if (riverIn > 0) {
      ctx.save();
      ctx.globalAlpha = riverIn;
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
      ctx.restore();
      fadeText(ctx, "the Noyyal", 60, 358, riverIn * 0.9, "italic 12px -apple-system, sans-serif", "#5d8a99", "left");
    }

    // ship sails in, bobbing
    const shipIn = phase(t, 1.5, 8);
    drawShip(ctx, lerp(-90, 170, easeOutCubic(shipIn)), 150 + Math.sin(t * 1.1) * 4, phase(t, 1.5, 3));

    // coins fall into a pile
    for (const c of COINS) drawCoin(ctx, c, t);
    fadeText(ctx, "roman gold hoards, found along the river", 395, 352, phase(t, 11, 13) * 0.9, "11px -apple-system, sans-serif", "#b08a3c");

    // exports flow to the ship
    const exportsIn = phase(t, 15, 17);
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 3; j++) {
        drawExport(ctx, k, cycle(t * 0.13 + j / 3 + k * 0.11), exportsIn);
      }
    }
    if (exportsIn > 0) {
      fadeText(ctx, "→ to Rome:  pepper · cotton · beryl", 480, 148, exportsIn, "600 13px -apple-system, sans-serif", "#5cc8ae");
    }

    // title
    fadeText(ctx, "the first customers were roman", 460, lerp(220, 96, phase(t, 0.5, 2)), phase(t, 0.2, 1.4), "700 19px -apple-system, sans-serif", "#e8eef2");
  },
};
