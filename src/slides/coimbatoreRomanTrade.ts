/**
 * Coimbatore tutorial · slide 2 — "Roman gold on the Noyyal".
 * A Roman ship arrives, gold coins pile up along the river, and the exports —
 * pepper, cloth, beryl — flow back. Pure renderFrame(t).
 *
 * Layer routing (Step 01): timeline rule + river ribbon on bg; ship + coins art on mid;
 * coin shine / spice motes / glows on fg (bloom); all text on annotation; a landfall
 * flash overlay on fx. Entrances use reveal wipes; the sea route draws on; the coin
 * beat lands with focus rings using the theme accent. Falls back to the single ctx.
 */
import { breathe, cycle, easeOutCubic, fadeText, lerp, phase, prng } from "./anim";
import { focusRings, highlightRing } from "../render/focus";
import { wipe } from "../render/reveal";
import { smoothPath } from "../render/strokes";
import { drawOn, passingFlash, tracedPath } from "../render/strokeVerbs";
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

/* The sea route the ship traces in — a curved approach toward the anchorage. */
const SEA_ROUTE = smoothPath([
  [-90, 96],
  [-10, 118],
  [70, 138],
  [140, 150],
  [172, 150],
]);

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

/** The static coin disc (goes on mid) — emperor's profile and rim. */
function drawCoinBody(ctx: CanvasRenderingContext2D, c: Coin, t: number) {
  const p = phase(t, c.at, c.at + 1.1);
  if (p <= 0) return;
  const fall = easeOutCubic(p);
  const y = lerp(40, c.y, fall);
  ctx.save();
  ctx.translate(c.x, y);
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
  ctx.restore();
}

/** The travelling shine sweep over a coin (goes on fg for bloom). */
function drawCoinShine(ctx: CanvasRenderingContext2D, c: Coin, t: number) {
  const p = phase(t, c.at, c.at + 1.1);
  if (p <= 0) return;
  const fall = easeOutCubic(p);
  const y = lerp(40, c.y, fall);
  const shine = Math.max(0, Math.sin(t * 0.9 + c.spin)) * 0.35;
  if (shine <= 0) return;
  ctx.save();
  ctx.translate(c.x, y);
  ctx.globalAlpha = shine;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, 7);
  ctx.fillStyle = "#fff3cf";
  ctx.fill();
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
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    const accent = frame?.theme.palette.accent ?? "#5cc8ae";
    if (!frame) ctx.clearRect(0, 0, W, H);

    // timeline across the top — wipes on left→right (bg rule, fg marker glow, annotation labels)
    const tlIn = phase(t, 0.5, 2.5);
    if (tlIn > 0) {
      wipe(
        bg,
        tlIn,
        W,
        H,
        (c) => {
          c.save();
          c.strokeStyle = "#2b3640";
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(150, 40);
          c.lineTo(770, 40);
          c.stroke();
          c.restore();
        },
        { dir: "left", ease: easeOutCubic },
      );
      const marker = lerp(150, 770, Math.min(1, t / 24));
      fg.save();
      fg.globalAlpha = tlIn;
      fg.beginPath();
      fg.arc(marker, 40, 5, 0, 7);
      fg.fillStyle = "#e8a13c";
      fg.fill();
      fg.restore();
      fadeText(ann, "300 BCE", 150, 62, tlIn, "11px -apple-system, sans-serif", "#93a4b0");
      fadeText(ann, "SANGAM ERA", 460, 26, tlIn, "600 11px -apple-system, sans-serif", "#7d90a5");
      fadeText(ann, "300 CE", 770, 62, tlIn, "11px -apple-system, sans-serif", "#93a4b0");
    }

    // the Noyyal — a flowing ribbon along the bottom (bg)
    const riverIn = phase(t, 1, 3);
    if (riverIn > 0) {
      bg.save();
      bg.globalAlpha = riverIn;
      for (let line = 0; line < 3; line++) {
        bg.beginPath();
        for (let x = 0; x <= W; x += 10) {
          const y = 372 + line * 12 + Math.sin(x * 0.02 + t * 1.4 + line) * 6;
          if (x === 0) bg.moveTo(x, y);
          else bg.lineTo(x, y);
        }
        bg.strokeStyle = line === 1 ? "#3e7c8f" : "#2f5d6d";
        bg.lineWidth = line === 1 ? 3 : 1.6;
        bg.stroke();
      }
      bg.restore();
      fadeText(ann, "the Noyyal", 60, 358, riverIn * 0.9, "italic 12px -apple-system, sans-serif", "#5d8a99", "left");
    }

    // sea route draws on ahead of the ship (fg, faint light-blue), then the ship's wake trails behind it
    const routeIn = phase(t, 1.2, 4.5);
    if (routeIn > 0) {
      drawOn(fg, SEA_ROUTE, routeIn, {
        style: { color: "rgba(126,208,255,0.5)", width: 2, dash: [7, 8], blend: "lighter" },
      });
    }

    // ship sails in, bobbing (mid); wake it leaves is a dissipating traced trail (fg)
    const shipIn = phase(t, 1.5, 8);
    const shipX = lerp(-90, 170, easeOutCubic(shipIn));
    const shipY = 150 + Math.sin(t * 1.1) * 4;
    if (t < 8.2) {
      tracedPath(fg, (tt) => [lerp(-90, 170, easeOutCubic(phase(tt, 1.5, 8))), 172], t, {
        dissipate: 2.2,
        style: { color: "rgba(200,225,240,0.28)", width: 5, cap: "round", blend: "lighter" },
      });
    }
    drawShip(mid, shipX, shipY, phase(t, 1.5, 3));

    // coins fall into a pile — bodies on mid, travelling shine on fg (bloom)
    for (const c of COINS) drawCoinBody(mid, c, t);
    for (const c of COINS) drawCoinShine(fg, c, t);
    fadeText(ann, "roman gold hoards, found along the river", 395, 352, phase(t, 11, 13) * 0.9, "11px -apple-system, sans-serif", "#b08a3c");

    // beat: focus rings converge on the freshly-arrived hoard as the coins settle (fg, accent)
    const coinBeat = phase(t, 12.2, 13.6);
    if (coinBeat > 0 && coinBeat < 1) {
      focusRings(fg, 395, 312, coinBeat, { color: accent, maxR: 130, targetR: 44, count: 3 });
    }
    if (t >= 13.2 && t < 15.5) {
      highlightRing(fg, 395, 312, 46, t, { color: accent, amp: 3, period: 1.6, width: 2, alpha: phase(t, 13.2, 13.8) * (1 - phase(t, 14.6, 15.5)) });
    }

    // exports flow to the ship — spice motes on fg (bloom); a passing light-sweep marks the route to Rome
    const exportsIn = phase(t, 15, 17);
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < 3; j++) {
        drawExport(fg, k, cycle(t * 0.13 + j / 3 + k * 0.11), exportsIn);
      }
    }
    if (exportsIn > 0) {
      const sweep = cycle((t - 15) * 0.35);
      passingFlash(
        fg,
        smoothPath([
          [760, 172],
          [520, 168],
          [280, 190],
          [210, 210],
        ]),
        sweep,
        { width: 0.3, thinning: true, glow: true, style: { color: "rgba(92,200,174,0.7)", width: 3 } },
      );
      fadeText(ann, "→ to Rome:  pepper · cotton · beryl", 480, 148, exportsIn, "600 13px -apple-system, sans-serif", "#5cc8ae");
    }

    // a soft landfall flash on the anchorage the moment the ship settles (fx overlay)
    const landfall = phase(t, 7.2, 9.2);
    if (landfall > 0 && landfall < 1) {
      fx.save();
      fx.globalCompositeOperation = "lighter";
      fx.globalAlpha = Math.sin(landfall * Math.PI) * 0.5;
      const g = fx.createRadialGradient(170, 150, 4, 170, 150, 120);
      g.addColorStop(0, "rgba(255,240,200,0.8)");
      g.addColorStop(1, "rgba(255,240,200,0)");
      fx.fillStyle = g;
      fx.beginPath();
      fx.arc(170, 150, 120, 0, 7);
      fx.fill();
      fx.restore();
    }

    // title — enters on a wipe, then breathes gently so nothing sits frozen (annotation)
    const titleIn = phase(t, 0.2, 1.4);
    const titleY = lerp(220, 96, phase(t, 0.5, 2));
    if (titleIn > 0) {
      const bob = 1 + breathe(t, 4, 0.4);
      wipe(
        ann,
        titleIn,
        W,
        H,
        (c) => fadeText(c, "the first customers were roman", 460, titleY * bob, 1, "700 19px -apple-system, sans-serif", "#e8eef2"),
        { dir: "left", feather: 40, ease: easeOutCubic },
      );
    }
  },
};
