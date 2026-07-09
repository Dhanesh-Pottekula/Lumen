/**
 * Photosynthesis · scene 2 — into a cell.
 *
 * A leaf cross-section (cuticle, epidermis, palisade mesophyll) that zooms into one
 * mesophyll cell: wall, membrane, nucleus, central vacuole, and green chloroplasts.
 * Pure renderFrame(t).
 */
import { img } from "../assets/photosynthesis";
import { clamp01, drawSvg, fadeText, lerp, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const CELL = { x: 500, y: 230, r: 168 };
const rand = prng(202);
// chloroplasts inside the zoomed cell — placed in a ring inside the wall, clear of the vacuole
const CHLOROPLASTS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.4;
  const rr = CELL.r * (0.66 + rand() * 0.12);
  return { x: CELL.x + Math.cos(a) * rr, y: CELL.y + Math.sin(a) * rr, rot: a + 1.2, drift: rand() };
});

function drawChloroplast(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, wob: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot + wob * 0.15);
  ctx.fillStyle = "#3a8a4a";
  ctx.strokeStyle = "#2c6b3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 12, 0, 0, 7);
  ctx.fill();
  ctx.stroke();
  // grana dots
  ctx.fillStyle = "#1f4f2a";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * 8, 0, 2.6, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

export const photoLeafCellSlide: CanvasSlideDefinition = {
  duration: 20,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "slice a leaf open and you find layers of cells stacked like bricks, all packed with green." },
    { at: 5, text: "let's zoom into one of these mesophyll cells — the leaf's main food-making workers." },
    { at: 10, text: "it has a tough wall, a thin membrane, a nucleus, and a big watery vacuole in the middle." },
    { at: 15, text: "and scattered around the edge: dozens of little green ovals called chloroplasts. that's where the magic happens." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#16222c";
    ctx.fillRect(0, 0, W, H);

    // stage 1: leaf cross-section (fades out as we zoom in)
    const crossAlpha = 1 - phase(t, 4, 6.5);
    if (crossAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = crossAlpha;
      const layers: [string, number, number, string][] = [
        ["#3a8a4a", 70, 26, "cuticle + upper epidermis"],
        ["#2f7a40", 100, 70, "palisade mesophyll"],
        ["#347044", 176, 84, "spongy mesophyll"],
        ["#2f6a3c", 262, 40, "lower epidermis"],
      ];
      for (const [c, y, h] of layers) {
        ctx.fillStyle = c;
        ctx.fillRect(120, y, 680, h);
        ctx.strokeStyle = "#1f4f2a";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(120, y, 680, h);
      }
      // little cells in the palisade layer
      ctx.fillStyle = "#245a30";
      for (let i = 0; i < 11; i++) {
        ctx.beginPath();
        ctx.ellipse(150 + i * 60, 105, 16, 30, 0, 0, 7);
        ctx.fill();
      }
      fadeText(ctx, "a leaf, in cross-section", 460, 330, crossAlpha, "600 14px -apple-system, sans-serif", "#a8c4ac");
      ctx.restore();
    }

    // stage 2: the zoomed single cell (fades/scales in)
    const zoom = phase(t, 5, 7.5);
    if (zoom > 0) {
      ctx.save();
      ctx.globalAlpha = clamp01(zoom);
      const s = lerp(0.7, 1, zoom);
      ctx.translate(CELL.x, CELL.y);
      ctx.scale(s, s);
      ctx.translate(-CELL.x, -CELL.y);

      // cell body — SVG hero art, with a primitive fallback
      const cellImg = img("cell");
      if (cellImg) {
        drawSvg(ctx, cellImg, CELL.x, CELL.y, CELL.r * 2.08, CELL.r * 2.08);
      } else {
        ctx.fillStyle = "#20323f";
        ctx.strokeStyle = "#6db06a";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(CELL.x, CELL.y, CELL.r, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#8fd08a";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(CELL.x, CELL.y, CELL.r - 9, 0, 7);
        ctx.stroke();
        ctx.fillStyle = "rgba(74, 144, 216, 0.16)";
        ctx.strokeStyle = "rgba(109, 176, 232, 0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(CELL.x, CELL.y + 8, CELL.r * 0.5, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#7a6bb0";
        ctx.beginPath();
        ctx.arc(CELL.x - CELL.r * 0.42, CELL.y - CELL.r * 0.42, 26, 0, 7);
        ctx.fill();
        ctx.fillStyle = "#5a4b90";
        ctx.beginPath();
        ctx.arc(CELL.x - CELL.r * 0.42, CELL.y - CELL.r * 0.42, 11, 0, 7);
        ctx.fill();
      }

      // chloroplasts appear last
      const chlIn = phase(t, 13, 16);
      if (chlIn > 0) {
        ctx.globalAlpha = clamp01(zoom) * chlIn;
        const chlImg = img("chloroplast");
        for (const c of CHLOROPLASTS) {
          const wob = Math.sin(t * 1.2 + c.drift * 6);
          if (chlImg) drawSvg(ctx, chlImg, c.x, c.y, 52, 30, { rotate: c.rot + wob * 0.15 });
          else drawChloroplast(ctx, c.x, c.y, c.rot, wob);
        }
      }
      ctx.restore();

      // labels (outside the scaled group so text stays crisp)
      const lab = phase(t, 9, 11);
      if (lab > 0) {
        fadeText(ctx, "cell wall", CELL.x + CELL.r + 8, CELL.y - CELL.r + 24, lab, "12px -apple-system, sans-serif", "#8fd08a", "start");
        fadeText(ctx, "nucleus", CELL.x - CELL.r - 8, CELL.y - CELL.r * 0.5, lab, "12px -apple-system, sans-serif", "#b0a4e0", "end");
        fadeText(ctx, "vacuole", CELL.x, CELL.y + 6, lab, "12px -apple-system, sans-serif", "#7fb0e8");
      }
      const clab = phase(t, 16, 18);
      if (clab > 0) fadeText(ctx, "chloroplasts", CELL.x + CELL.r - 6, CELL.y + CELL.r + 26, clab, "600 13px -apple-system, sans-serif", "#6dd07a", "end");
    }
  },
};
