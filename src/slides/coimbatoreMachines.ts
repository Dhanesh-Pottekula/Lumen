/**
 * Coimbatore tutorial · slide 5 — "The city that makes things".
 * A pump impeller spins water outward, a constellation of small family workshops
 * lights up, and the skyline of the modern city rises. Pure renderFrame(t).
 *
 * Layer routing (Step 01): flat backdrop → bg; pump body / shops / skyline (main art) → mid;
 * flowing water, moving impeller sparkle, lit-window glows → fg (bloom); all text → annotation;
 * attention marks (focus rings / converging arrows on the "pump city" payoff) → fx.
 */
import { cycle, fadeText, phase, prng } from "./anim";
import { convergingArrows, focusRings, highlightRing } from "../render/focus";
import { drawOn } from "../render/strokeVerbs";
import type { Pt } from "../render/strokes";
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

const PUMP = { cx: 210, cy: 190 };

/** The pump body (casing, outlet pipe, impeller) → mid layer for the theme drop-shadow. */
function drawPumpBody(mid: CanvasRenderingContext2D, t: number, alpha: number) {
  const { cx, cy } = PUMP;
  mid.save();
  mid.globalAlpha = alpha;

  // outlet pipe — draw-on as the casing arrives, then settle to a solid pipe
  const pipeIn = phase(t, 0.7, 1.8);
  const pipe: Pt[] = [
    [cx + 59, cy - 40],
    [cx + 59, cy - 92],
  ];
  if (pipeIn > 0 && pipeIn < 1) {
    drawOn(mid, pipe, pipeIn, { style: { color: "#93a4b0", width: 22 } });
  } else if (pipeIn >= 1) {
    mid.fillStyle = "#2b3640";
    mid.fillRect(cx + 48, cy - 92, 22, 52);
    mid.strokeStyle = "#93a4b0";
    mid.lineWidth = 2;
    mid.strokeRect(cx + 48, cy - 92, 22, 52);
  }

  // casing
  mid.beginPath();
  mid.arc(cx, cy, 62, 0, 7);
  mid.fillStyle = "rgba(31, 40, 48, 0.85)";
  mid.fill();
  mid.beginPath();
  mid.arc(cx, cy, 62, 0, 7);
  mid.strokeStyle = "#93a4b0";
  mid.lineWidth = 4;
  mid.stroke();

  // impeller — five curved blades
  const angle = t * 3.4;
  for (let b = 0; b < 5; b++) {
    const a0 = angle + (b * Math.PI * 2) / 5;
    mid.beginPath();
    mid.moveTo(cx + Math.cos(a0) * 10, cy + Math.sin(a0) * 10);
    mid.quadraticCurveTo(
      cx + Math.cos(a0 + 0.55) * 34,
      cy + Math.sin(a0 + 0.55) * 34,
      cx + Math.cos(a0 + 0.95) * 50,
      cy + Math.sin(a0 + 0.95) * 50,
    );
    mid.strokeStyle = "#5cc8ae";
    mid.lineWidth = 5;
    mid.lineCap = "round";
    mid.stroke();
  }
  mid.beginPath();
  mid.arc(cx, cy, 9, 0, 7);
  mid.fillStyle = "#e8eef2";
  mid.fill();

  mid.restore();
}

/** Water spiralling outward + a bright hub glint — energy/moving parts → fg for bloom. */
function drawPumpFlow(fg: CanvasRenderingContext2D, t: number, alpha: number) {
  const { cx, cy } = PUMP;
  fg.save();
  fg.globalAlpha = alpha;
  for (let k = 0; k < 26; k++) {
    const c = cycle(t * 0.45 + k / 26);
    const a = (k / 26) * Math.PI * 2 + t * 2.2 + c * 1.5;
    const r = 18 + c * 92;
    fg.beginPath();
    fg.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.6, 0, 7);
    fg.fillStyle = `rgba(125, 179, 204, ${(1 - c) * 0.8})`;
    fg.fill();
  }
  // spinning impeller hub glint
  fg.beginPath();
  fg.arc(cx, cy, 5, 0, 7);
  fg.fillStyle = "rgba(232, 238, 242, 0.9)";
  fg.fill();
  fg.restore();
}

/** Shop boxes + faint links → mid; their lit windows → fg (glow). */
function drawShops(mid: CanvasRenderingContext2D, fg: CanvasRenderingContext2D, t: number) {
  const stage = phase(t, 10, 18);
  if (stage <= 0) return;

  // links first, faint (mid)
  const linkIn = phase(t, 15, 19);
  if (linkIn > 0) {
    mid.save();
    mid.globalAlpha = linkIn * 0.25;
    mid.strokeStyle = "#5cc8ae";
    mid.lineWidth = 1;
    for (const [a, b] of LINKS) {
      mid.beginPath();
      mid.moveTo(SHOPS[a].x, SHOPS[a].y);
      mid.lineTo(SHOPS[b].x, SHOPS[b].y);
      mid.stroke();
    }
    mid.restore();
  }

  for (const s of SHOPS) {
    const on = phase(stage, s.order * 0.8, s.order * 0.8 + 0.2);
    if (on <= 0) continue;
    const half = (s.size / 2) * on;

    // body (mid)
    mid.save();
    mid.globalAlpha = on;
    mid.translate(s.x, s.y);
    mid.fillStyle = "#31404f";
    mid.fillRect(-half, -half, half * 2, half * 2);
    mid.restore();

    // one small lit window each — a family firm, lights on (fg glow)
    fg.save();
    fg.globalAlpha = on;
    fg.translate(s.x, s.y);
    fg.fillStyle = "#ebcb8b";
    fg.fillRect(-half * 0.35, -half * 0.35, half * 0.7, half * 0.7);
    fg.restore();
  }
}

/** Skyline buildings → mid; their lit windows → fg (glow). */
function drawSkyline(mid: CanvasRenderingContext2D, fg: CanvasRenderingContext2D, t: number) {
  const stage = phase(t, 20, 26);
  if (stage <= 0) return;
  for (const b of SKYLINE) {
    const rise = phase(stage, b.order * 0.5, b.order * 0.5 + 0.5);
    if (rise <= 0) continue;
    const h = b.h * rise;
    mid.fillStyle = "#26313d";
    mid.fillRect(b.x, H - h, b.w, h);
    // sparse lit windows, deterministic per building (fg glow)
    const wr = prng(Math.round(b.x));
    for (let k = 0; k < 5; k++) {
      if (wr() > 0.5) continue;
      const wx = b.x + 4 + wr() * (b.w - 10);
      const wy = H - h + 6 + wr() * (h - 14);
      fg.fillStyle = "rgba(235, 203, 139, 0.7)";
      fg.fillRect(wx, wy, 3.4, 3.4);
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
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // backdrop (bg) — a quiet industrial dusk so the lit windows and water read
    const sky = bg.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#182430");
    sky.addColorStop(1, "#12191f");
    bg.fillStyle = sky;
    bg.fillRect(0, 0, W, H);

    // skyline (mid + fg)
    drawSkyline(mid, fg, t);

    // pump (mid body + fg flow)
    const pumpIn = phase(t, 0.5, 2.5);
    if (pumpIn > 0) {
      drawPumpBody(mid, t, pumpIn);
      drawPumpFlow(fg, t, pumpIn);
    }

    // shops (mid + fg)
    drawShops(mid, fg, t);

    // pump labels (annotation)
    fadeText(ann, "the coimbatore pump", 210, 292, pumpIn, "600 13px -apple-system, sans-serif", "#93a4b0");
    fadeText(ann, "over half of india's pumps & motors", 210, 310, pumpIn * 0.85, "11px -apple-system, sans-serif", "#5d7186");
    fadeText(ann, "thousands of small family firms — no giants", 665, 320, phase(t, 14, 16), "600 13px -apple-system, sans-serif", "#93a4b0");

    // rolling trade-identity badges (annotation)
    const words = ["pumps", "motors", "yarn", "wet grinders", "castings", "software"];
    const badgeIn = phase(t, 18, 20);
    if (badgeIn > 0) {
      words.forEach((word, i) => {
        const a = phase(t, 18 + i * 0.6, 19 + i * 0.6);
        fadeText(ann, word, 130 + i * 135, 396, a * badgeIn, "600 14px -apple-system, sans-serif", i % 2 ? "#5cc8ae" : "#e8a13c");
      });
    }

    // title (annotation)
    const finale = phase(t, 25, 27);
    if (finale > 0) {
      fadeText(ann, "the city that makes things", 460, 40, finale, "800 21px -apple-system, sans-serif", "#e8eef2");
    } else {
      fadeText(ann, "after the mills: machines", 460, 40, phase(t, 0.3, 1.6) * (1 - phase(t, 23, 25)), "700 18px -apple-system, sans-serif", "#e8eef2");
    }

    // attention marks (fx) — NEW: ride the theme accent to sell the "pump city" payoff.
    if (frame) {
      const accent = frame.theme.palette.accent;
      // when the pump has settled, ring it once to name it as the anchor of the cluster
      const ringP = phase(t, 3, 6);
      if (ringP > 0 && ringP < 1) {
        focusRings(fx, PUMP.cx, PUMP.cy, ringP, { color: accent, maxR: 130, targetR: 70 });
      }
      // gentle persistent marker on the pump while shops light up around it
      const holdRing = phase(t, 6, 8) * (1 - phase(t, 12, 14));
      if (holdRing > 0) {
        highlightRing(fx, PUMP.cx, PUMP.cy, 72, t, { color: accent, alpha: holdRing * 0.5, amp: 3 });
      }
      // finale — arrows converge on the cluster as the skyline rises: the payoff beat
      const conv = phase(t, 20, 22.5) * (1 - phase(t, 27, 29));
      if (conv > 0) {
        fx.save();
        fx.globalAlpha = conv;
        convergingArrows(fx, 660, 190, phase(t, 20, 22.5), { color: accent, ring: 150, targetR: 90, count: 4 });
        fx.restore();
      }
    }
  },
};
