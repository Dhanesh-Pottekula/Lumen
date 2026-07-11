/**
 * Coimbatore tutorial · slide 1 — "The gap in the mountains".
 * A stylised top-down map: the Western Ghats wall, the Palghat Gap, and the trade
 * route that squeezed through it. Pure renderFrame(t) — all motion derives from t.
 *
 * Layer routing (Step 01): flat land/sea fills → bg; mountains + city dots → mid (soft shadow
 * gives depth); gap glow, drawn-on route, caravan dots, Coimbatore halo + attention marks → fg
 * (they bloom); all text → annotation; the finale spotlight scrim → fx (isolated so its holes
 * cut the scrim, not the scene). Falls back to the single ctx when no frame is supplied.
 */
import { breathe, cycle, fadeText, lerp, makePath, phase, prng, smooth } from "./anim";
import { convergingArrows, dimExcept, focusRings, highlightRing } from "../render/focus";
import { wipe } from "../render/reveal";
import { drawOn, passingFlash } from "../render/strokeVerbs";
import type { Pt } from "../render/strokes";
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
const ROUTE_PTS: [number, number][] = [
  [92, 150],
  [190, 195],
  [300, 222],
  [430, 216],
  [640, 228],
  [880, 232],
];
const ROUTE = makePath(ROUTE_PTS);
/* Densely sampled polyline for the stroke verbs (drawOn / passingFlash). */
const ROUTE_POLY: Pt[] = Array.from({ length: 81 }, (_, i) => {
  const p = ROUTE.at((i / 80) * ROUTE.length);
  return [p.x, p.y] as Pt;
});
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
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const accent = frame?.theme.palette.accent ?? "#5cc8ae";

    const landIn = phase(t, 0, 2.5);

    // land + sea wiped in from the west (the coast) instead of a flat fade (bg)
    const drawLand = (c: CanvasRenderingContext2D) => {
      c.fillStyle = "#232c33";
      c.fillRect(0, 0, W, H);
      // sea along the west with a wavy coastline
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(118, 0);
      for (let y = 0; y <= H; y += 8) c.lineTo(114 + Math.sin(y * 0.045) * 10, y);
      c.lineTo(0, H);
      c.closePath();
      c.fillStyle = "#1b3442";
      c.fill();
    };
    // reveal grammar: sweep the terrain in from the west coast (feathered edge)
    wipe(bg, landIn, W, H, drawLand, { dir: "left", feather: 60, ease: smooth });
    fadeText(ann, "A R A B I A N   S E A", 56, 220, landIn * 0.8, "11px -apple-system, sans-serif", "#4d7286");

    // mountains rise, staggered (mid — soft drop-shadow depth)
    const mountainsIn = phase(t, 1.5, 7);
    for (const p of PEAKS) drawPeak(mid, p, phase(mountainsIn, p.order * 0.55, p.order * 0.55 + 0.45));
    fadeText(ann, "WESTERN GHATS", 296, 34, phase(t, 5, 7) * 0.9, "600 12px -apple-system, sans-serif", "#7d90a5");

    // the gap: a pass between the ranges, glow gently breathing (fg — blooms)
    const gapIn = phase(t, 7, 10);
    if (gapIn > 0) {
      fg.save();
      // breathe() oscillates around 1 by ±0.3 → maps to alpha ~0.25..0.85
      fg.globalAlpha = gapIn * (breathe(t, 2.2, 0.3) * 0.55);
      const glow = fg.createRadialGradient(300, 222, 4, 300, 222, 56 * breathe(t, 2.4, 0.08));
      glow.addColorStop(0, "rgba(232, 161, 60, 0.55)");
      glow.addColorStop(1, "rgba(232, 161, 60, 0)");
      fg.fillStyle = glow;
      fg.fillRect(230, 160, 150, 124);
      fg.restore();
      fadeText(ann, "PALGHAT GAP", 300, 268, gapIn, "700 12px -apple-system, sans-serif", "#e8a13c");
      fadeText(ann, "~30 km wide", 300, 283, gapIn * 0.8, "10px -apple-system, sans-serif", "#93a4b0");
    }

    // route: draws ON through the gap, then a bright glow sliver re-energizes it (fg)
    const routeIn = phase(t, 12, 15);
    if (routeIn > 0) {
      drawOn(fg, ROUTE_POLY, routeIn, {
        from: "start",
        style: { color: "#8ea2b5", width: 1.8, alpha: 0.6, cap: "round" },
      });
      // repeating light-sweep along the drawn portion, cycling every ~3.5s
      passingFlash(fg, ROUTE_POLY, cycle(t * 0.28), {
        width: 0.16,
        thinning: true,
        glow: true,
        style: { color: "#e8c98a", width: 2.6, alpha: routeIn },
      });
    }
    drawCaravan(fg, t, phase(t, 13, 16));

    // ports and towns (dots on mid, labels on annotation)
    const cities: [string, number, number, number][] = [
      ["Muziris (port)", 92, 150, 3],
      ["Karur", 640, 228, 14],
      ["to Madurai →", 848, 260, 15],
    ];
    for (const [label, x, y, appear] of cities) {
      const a = phase(t, appear, appear + 1.5);
      if (a <= 0) continue;
      mid.save();
      mid.globalAlpha = a;
      mid.beginPath();
      mid.arc(x, y, 4, 0, 7);
      mid.fillStyle = "#c3d0da";
      mid.fill();
      mid.restore();
      fadeText(ann, label, x, y - 10, a, "11px -apple-system, sans-serif", "#aebbc6");
    }

    // Coimbatore — the star of the show
    const cbeIn = phase(t, 10, 12);
    const finale = phase(t, 24, 27);
    if (cbeIn > 0) {
      const pulse = 1 + 0.25 * Math.sin(t * 3);
      // halo + dot on fg (blooms)
      fg.save();
      fg.globalAlpha = cbeIn;
      const halo = fg.createRadialGradient(COIMBATORE[0], COIMBATORE[1], 2, COIMBATORE[0], COIMBATORE[1], 26 * pulse * (1 + finale));
      halo.addColorStop(0, "rgba(92, 200, 174, 0.8)");
      halo.addColorStop(1, "rgba(92, 200, 174, 0)");
      fg.fillStyle = halo;
      fg.fillRect(COIMBATORE[0] - 60, COIMBATORE[1] - 60, 120, 120);
      fg.beginPath();
      fg.arc(COIMBATORE[0], COIMBATORE[1], 5.5, 0, 7);
      fg.fillStyle = "#5cc8ae";
      fg.fill();
      fg.restore();
      fadeText(
        ann,
        "COIMBATORE",
        COIMBATORE[0],
        COIMBATORE[1] - 16,
        cbeIn,
        `700 ${13 + finale * 5}px -apple-system, sans-serif`,
        "#e8eef2",
      );
      fadeText(ann, "the crossroads town", COIMBATORE[0], COIMBATORE[1] + 30, finale, "12px -apple-system, sans-serif", "#93a4b0");
    }

    // finale attention: spotlight scrim + converging focus rings land on Coimbatore
    if (finale > 0) {
      // brief scrim on the isolated fx layer so its holes cut the scrim, not the scene
      const dim = Math.sin(phase(t, 24, 26.5) * Math.PI); // rises then releases
      dimExcept(fx, [{ cx: COIMBATORE[0], cy: COIMBATORE[1], r: 70 }], {
        intensity: dim * 0.45,
        feather: 40,
      });
      // rings converge onto the town, then a steady wobble ring holds the emphasis (fg)
      focusRings(fg, COIMBATORE[0], COIMBATORE[1], phase(t, 24, 26), {
        count: 3,
        maxR: 120,
        targetR: 16,
        color: accent,
      });
      highlightRing(fg, COIMBATORE[0], COIMBATORE[1], 22, t, {
        amp: 3,
        period: 1.6,
        color: accent,
        width: 2.5,
        alpha: finale * 0.9,
      });
      convergingArrows(fg, COIMBATORE[0], COIMBATORE[1], phase(t, 24.5, 26.5), {
        count: 4,
        ring: 96,
        targetR: 28,
        color: accent,
        width: 2.5,
        rotation: Math.PI / 4,
      });
    }

    // legend for the caravan colors (dots on fg, text on annotation)
    const legendIn = phase(t, 15, 17);
    if (legendIn > 0) {
      fg.save();
      fg.globalAlpha = legendIn * 0.9;
      fg.fillStyle = "#e8a13c";
      fg.beginPath();
      fg.arc(560, 388, 4, 0, 7);
      fg.fill();
      fg.fillStyle = "#5cc8ae";
      fg.beginPath();
      fg.arc(560, 406, 4, 0, 7);
      fg.fill();
      fg.restore();
      fadeText(ann, "gold & spices moving inland", 572, 392, legendIn, "11px -apple-system, sans-serif", "#93a4b0", "left");
      fadeText(ann, "cotton & cloth moving to the coast", 572, 410, legendIn, "11px -apple-system, sans-serif", "#93a4b0", "left");
    }

    // title (annotation)
    fadeText(ann, "why here?", 460, lerp(210, 26, phase(t, 0.8, 2.5)), phase(t, 0.3, 1.4), "700 20px -apple-system, sans-serif", "#e8eef2");
  },
};
