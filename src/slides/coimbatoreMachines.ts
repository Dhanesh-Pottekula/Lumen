/**
 * Coimbatore tutorial · slide 5 — "The city that makes things".
 * A pump impeller spins water outward, a constellation of small family workshops
 * lights up, and the skyline of the modern city rises. Pure renderFrame(t).
 */
import { cycle, fadeText, lerp, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const rand = prng(641);

/* The SME constellation — dozens of small workshops, no giants. */
const SHOPS = Array.from({ length: 40 }, () => ({
  x: 470 + rand() * 400,
  y: 70 + rand() * 220,
  size: 7 + rand() * 8,
  order: rand(),
}));
/* A few faint links between shops — the cluster, not a hierarchy. */
const LINKS = Array.from({ length: 18 }, () => {
  const a = Math.floor(rand() * SHOPS.length);
  let b = Math.floor(rand() * SHOPS.length);
  if (b === a) b = (b + 7) % SHOPS.length;
  return [a, b] as const;
});

/* Skyline heights for the finale. */
const SKYLINE = Array.from({ length: 24 }, (_, i) => ({
  x: 30 + i * 37,
  w: 26 + rand() * 10,
  h: 26 + rand() * 78,
  order: rand(),
}));

function drawPump(ctx: CanvasRenderingContext2D, t: number, alpha: number) {
  if (alpha <= 0) return;
  const cx = 210;
  const cy = 190;
  ctx.save();
  ctx.globalAlpha = alpha;

  // water particles spiralling outward — each a pure cycle of t
  for (let k = 0; k < 26; k++) {
    const c = cycle(t * 0.45 + k / 26);
    const a = (k / 26) * Math.PI * 2 + t * 2.2 + c * 1.5;
    const r = 18 + c * 92;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, 7);
    ctx.fillStyle = `rgba(125, 179, 204, ${(1 - c) * 0.8})`;
    ctx.fill();
  }

  // casing
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, 7);
  ctx.strokeStyle = "#93a4b0";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, 7);
  ctx.fillStyle = "rgba(31, 40, 48, 0.85)";
  ctx.fill();

  // outlet pipe
  ctx.fillStyle = "#2b3640";
  ctx.fillRect(cx + 48, cy - 92, 22, 52);
  ctx.strokeStyle = "#93a4b0";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx + 48, cy - 92, 22, 52);

  // impeller — five curved blades
  const angle = t * 3.4;
  for (let b = 0; b < 5; b++) {
    const a0 = angle + (b * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * 10, cy + Math.sin(a0) * 10);
    ctx.quadraticCurveTo(
      cx + Math.cos(a0 + 0.55) * 34,
      cy + Math.sin(a0 + 0.55) * 34,
      cx + Math.cos(a0 + 0.95) * 50,
      cy + Math.sin(a0 + 0.95) * 50,
    );
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();

  ctx.restore();
  fadeText(ctx, "the coimbatore pump", 210, 292, alpha, "600 13px -apple-system, sans-serif", "#93a4b0");
  fadeText(ctx, "over half of india's pumps & motors", 210, 310, alpha * 0.85, "11px -apple-system, sans-serif", "#5d7186");
}

function drawShops(ctx: CanvasRenderingContext2D, t: number) {
  const stage = phase(t, 10, 18);
  if (stage <= 0) return;

  // links first, faint
  const linkIn = phase(t, 15, 19);
  if (linkIn > 0) {
    ctx.save();
    ctx.globalAlpha = linkIn * 0.25;
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 1;
    for (const [a, b] of LINKS) {
      ctx.beginPath();
      ctx.moveTo(SHOPS[a].x, SHOPS[a].y);
      ctx.lineTo(SHOPS[b].x, SHOPS[b].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const s of SHOPS) {
    const on = phase(stage, s.order * 0.8, s.order * 0.8 + 0.2);
    if (on <= 0) continue;
    ctx.save();
    ctx.globalAlpha = on;
    ctx.translate(s.x, s.y);
    const half = (s.size / 2) * on;
    ctx.fillStyle = "#31404f";
    ctx.fillRect(-half, -half, half * 2, half * 2);
    // one small lit window each — a family firm, lights on
    ctx.fillStyle = "#ebcb8b";
    ctx.fillRect(-half * 0.35, -half * 0.35, half * 0.7, half * 0.7);
    ctx.restore();
  }

  fadeText(ctx, "thousands of small family firms — no giants", 665, 320, phase(t, 14, 16), "600 13px -apple-system, sans-serif", "#93a4b0");
}

function drawSkyline(ctx: CanvasRenderingContext2D, t: number) {
  const stage = phase(t, 20, 26);
  if (stage <= 0) return;
  for (const b of SKYLINE) {
    const rise = phase(stage, b.order * 0.5, b.order * 0.5 + 0.5);
    if (rise <= 0) continue;
    const h = b.h * rise;
    ctx.fillStyle = "#26313d";
    ctx.fillRect(b.x, H - h, b.w, h);
    // sparse lit windows, deterministic per building
    const wr = prng(Math.round(b.x));
    for (let k = 0; k < 5; k++) {
      if (wr() > 0.5) continue;
      const wx = b.x + 4 + wr() * (b.w - 10);
      const wy = H - h + 6 + wr() * (h - 14);
      ctx.fillStyle = "rgba(235, 203, 139, 0.7)";
      ctx.fillRect(wx, wy, 3.4, 3.4);
    }
  }
}

export const coimbatoreMachinesSlide: CanvasSlideDefinition = {
  duration: 30,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "here's the twist. the workshops that repaired the mills' machines got good enough to build their own — and the machinists outgrew the mills." },
    { at: 10, text: "that's the coimbatore pattern: not one giant company, but thousands of small family-run firms — foundries, motor shops, machine tools — trading with each other." },
    { at: 18, text: "quiet money, reinvested. make the machine, sell it modestly, build the next one. pumps, motors, wet grinders, and now software." },
    { at: 25, text: "from a gap in the mountains to roman gold to cotton to mills to machines — the trade never stopped. it just kept changing shape." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    drawSkyline(ctx, t);
    drawPump(ctx, t, phase(t, 0.5, 2.5));
    drawShops(ctx, t);

    // rolling trade-identity badges
    const words = ["pumps", "motors", "yarn", "wet grinders", "castings", "software"];
    const badgeIn = phase(t, 18, 20);
    if (badgeIn > 0) {
      words.forEach((word, i) => {
        const a = phase(t, 18 + i * 0.6, 19 + i * 0.6);
        fadeText(ctx, word, 130 + i * 135, 396, a * badgeIn, "600 14px -apple-system, sans-serif", i % 2 ? "#5cc8ae" : "#e8a13c");
      });
    }

    // title
    const finale = phase(t, 25, 27);
    if (finale > 0) {
      fadeText(ctx, "the city that makes things", 460, 40, finale, "800 21px -apple-system, sans-serif", "#e8eef2");
    } else {
      fadeText(ctx, "after the mills: machines", 460, 40, phase(t, 0.3, 1.6) * (1 - phase(t, 23, 25)), "700 18px -apple-system, sans-serif", "#e8eef2");
    }
  },
};
