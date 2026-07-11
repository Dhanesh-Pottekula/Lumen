/**
 * Coimbatore tutorial · slide 3 — "Black soil, white gold".
 * Monsoon rain, the black regur soil drinking it in, and cotton growing out of it —
 * stem by stem, boll by boll. Pure renderFrame(t).
 *
 * Layer routing (Step 01): sky wash + rain veil on bg, soil cross-section + stems/leaves/bolls on
 * mid (soft drop-shadow for depth), rain streaks + drifting cotton fluff + glows on fg (bloom),
 * all labels/badges on annotation, filmic grade on fx. Falls back to the single ctx with no frame.
 */
import { breathe, cycle, fadeText, lerp, phase, prng, wobble } from "./anim";
import { drawOn } from "../render/strokeVerbs";
import { dissolve, wipe } from "../render/reveal";
import { highlightRing, sparkFlash } from "../render/focus";
import type { Pt } from "../render/strokes";
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

/* Drifting cotton fluff — motes that float free once the bolls have burst. */
const FLUFF = Array.from({ length: 14 }, () => ({
  x: 90 + rand() * 760,
  y: 90 + rand() * 170,
  off: rand(),
  s: 0.04 + rand() * 0.05,
  r: 2.5 + rand() * 3,
  sway: 12 + rand() * 22,
}));

/* The hero plant to spotlight for "white gold" — the tallest, most central boll. */
const HERO = PLANTS[4];

/** The plant's growing tip at grow-progress g — shared by stem, leaves, and boll. */
function plantTip(plant: Plant, g: number): Pt {
  return [plant.x + plant.lean * g, SOIL_Y - plant.height * g];
}

function drawPlant(ctx: CanvasRenderingContext2D, plant: Plant, t: number) {
  const g = phase(t, plant.grow, plant.grow + 3.2);
  if (g <= 0) return;

  const [topX, topY] = plantTip(plant, g);

  // stem — drawn on as an organic brush stroke that tapers from base to growing tip.
  // Sampled from the same quadratic the original used, so the shape is unchanged.
  const midX = plant.x + plant.lean * 0.3;
  const midY = SOIL_Y - plant.height * g * 0.6;
  const stem: Pt[] = [];
  const SEG = 10;
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    const x = (1 - u) * (1 - u) * plant.x + 2 * (1 - u) * u * midX + u * u * topX;
    const y = (1 - u) * (1 - u) * SOIL_Y + 2 * (1 - u) * u * midY + u * u * topY;
    stem.push([x, y]);
  }
  drawOn(ctx, stem, 1, {
    style: { color: "#5a7d4a", width: 3.4, cap: "round", taperStart: 6, taperEnd: 10, minWidth: 1.2 },
  });

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

  // the boll: pops open, its white fluff dissolving on in seeded flecks (organic burst)
  const boll = phase(t, plant.grow + 3.6, plant.grow + 5.2);
  if (boll > 0) {
    const drawBoll = (c: CanvasRenderingContext2D) => {
      c.save();
      c.translate(topX, topY - 4);
      c.scale(boll, boll);
      for (const [dx, dy, r] of [
        [0, -4, 7],
        [-6, 2, 6],
        [6, 2, 6],
        [0, 4, 6.5],
      ] as const) {
        c.beginPath();
        c.arc(dx, dy, r, 0, 7);
        c.fillStyle = "#eef2f5";
        c.fill();
      }
      // the husk peeking through
      c.beginPath();
      c.arc(0, 1, 2.6, 0, 7);
      c.fillStyle = "#7a5a3a";
      c.fill();
      c.restore();
    };
    // seed the dissolve per-plant so each boll flecks in independently
    dissolve(ctx, boll, W, H, drawBoll, { seed: Math.floor(plant.x), cell: 4 });
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
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);
    const accent = frame?.theme.palette.accent ?? "#5cc8ae";

    // sky wash (bg)
    bg.fillStyle = "#20303c";
    bg.fillRect(0, 0, W, SOIL_Y);

    // monsoon rain — fades in, then clears (fg, so the bloom gives streaks a wet shimmer)
    const rainStrength = phase(t, 0.5, 2) * (1 - phase(t, 6, 9));
    if (rainStrength > 0) {
      fg.save();
      fg.globalAlpha = rainStrength * 0.7;
      fg.strokeStyle = "#6d94ad";
      fg.lineWidth = 1.4;
      for (const d of DROPS) {
        const c = (t * d.speed + d.offset) % 1;
        const y = c * (SOIL_Y - 20);
        fg.beginPath();
        fg.moveTo(d.x, y);
        fg.lineTo(d.x - 3, y + 14);
        fg.stroke();
      }
      fg.restore();
    }

    // the soil cross-section — wipes down from the ground line as the layer is revealed (mid)
    const soilIn = phase(t, 0, 1.5);
    if (soilIn > 0) {
      wipe(
        mid,
        soilIn,
        W,
        H,
        (c) => {
          const soil = c.createLinearGradient(0, SOIL_Y, 0, H);
          soil.addColorStop(0, "#1c1a17");
          soil.addColorStop(1, "#0f0e0c");
          c.fillStyle = soil;
          c.fillRect(0, SOIL_Y, W, H - SOIL_Y);
          // moisture sheen after the rain has soaked in
          const soak = phase(t, 4, 8);
          if (soak > 0) {
            c.save();
            c.globalAlpha = soak * 0.18;
            c.fillStyle = "#4d7286";
            c.fillRect(0, SOIL_Y, W, 30);
            c.restore();
          }
          c.save();
          c.globalAlpha = 0.5;
          c.fillStyle = "#332e28";
          for (const p of PEBBLES) {
            c.beginPath();
            c.arc(p.x, p.y, p.r, 0, 7);
            c.fill();
          }
          c.restore();
        },
        { dir: "down", feather: 40 },
      );
    }
    fadeText(ann, "black cotton soil (regur)", 800, 336, phase(t, 2, 4), "italic 12px -apple-system, sans-serif", "#8a7f6a");

    // ground line — drawn on left→right as the field establishes (mid)
    drawOn(mid, [[0, SOIL_Y], [W, SOIL_Y]] as Pt[], phase(t, 0.4, 2), {
      style: { color: "#3a352c", width: 2 },
    });

    // cotton plants (mid — inherits the soft drop shadow for depth)
    for (const plant of PLANTS) drawPlant(mid, plant, t);

    // drifting cotton fluff — motes floating free once the field is in bloom (fg, bloom)
    const fluffIn = phase(t, 12, 15);
    if (fluffIn > 0) {
      fg.save();
      for (const f of FLUFF) {
        const c = cycle(t * f.s + f.off);
        const x = f.x + Math.sin((f.off + c) * Math.PI * 2) * f.sway;
        const y = f.y - c * 60 + breathe(t + f.off * 5, 3.2, 6);
        const a = fluffIn * (0.25 + 0.5 * Math.sin(c * Math.PI));
        fg.globalAlpha = a;
        fg.fillStyle = "#eef2f5";
        fg.beginPath();
        fg.arc(x, y, f.r, 0, 7);
        fg.fill();
      }
      fg.restore();
    }

    // "white gold" attention: ring the hero boll once it has burst, with a one-beat spark (fg)
    const heroBurst = HERO.grow + 5.2;
    const markIn = phase(t, heroBurst, heroBurst + 1);
    if (markIn > 0) {
      const [hx, hy] = plantTip(HERO, 1);
      highlightRing(fg, hx, hy - 4, 20 + wobble(t, 1.6, 2), t, { color: accent, width: 2.2, alpha: markIn * 0.9, amp: 3, period: 1.6 });
      sparkFlash(fg, hx, hy - 4, phase(t, heroBurst, heroBurst + 0.7), { color: accent, count: 10, length: 22 });
    }

    // closing badge (annotation)
    const badge = phase(t, 20, 22.5);
    if (badge > 0) {
      fadeText(ann, "cotton — the region's white gold", 460, 60, badge, "700 19px -apple-system, sans-serif", "#e8eef2");
      fadeText(ann, "soil + monsoon + the gap to move it through", 460, 84, badge * 0.85, "13px -apple-system, sans-serif", "#93a4b0");
    } else {
      fadeText(ann, "black soil, white gold", 460, 60, phase(t, 0.3, 1.5) * (1 - phase(t, 18, 20)), "700 19px -apple-system, sans-serif", "#e8eef2");
    }

    // filmic grade — vignette + grain for a cinematic finish (fx)
    frame?.grade({ vignette: 0.32, grain: 0.035 });
  },
};
