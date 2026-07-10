/**
 * Photosynthesis · scene 5 — the Calvin cycle.
 *
 * In the stroma: a circular cycle with three stages — carbon fixation (CO₂ + RuBP → 3-PGA
 * via RuBisCO), reduction (3-PGA → G3P, spending ATP + NADPH), and regeneration (RuBP
 * remade). A G3P molecule exits toward glucose; ATP/NADPH feed in. Pure renderFrame(t).
 */
import { img } from "../assets/photosynthesis";
import { cycle, drawSvg, fadeText, phase } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const CX = 470;
const CY = 220;
const R = 128;

// three stage anchor angles around the ring (top, lower-right, lower-left)
const STAGES = [
  { ang: -Math.PI / 2, label: "1 · carbon fixation", sub: "CO₂ + RuBP → 3-PGA", color: "#8a94a0" },
  { ang: Math.PI / 6, label: "2 · reduction", sub: "3-PGA → G3P", color: "#6db0e8" },
  { ang: (5 * Math.PI) / 6, label: "3 · regeneration", sub: "RuBP remade", color: "#5cc87a" },
];

function pt(ang: number, r = R) {
  return { x: CX + Math.cos(ang) * r, y: CY + Math.sin(ang) * r };
}

export const photoCalvinCycleSlide: CanvasSlideDefinition = {
  duration: 26,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "now the second half — the calvin cycle, running in the stroma. it doesn't need light directly." },
    { at: 5, text: "it spends the ATP and NADPH the light reactions just made." },
    { at: 10, text: "step one: an enzyme called rubisco grabs carbon dioxide from the air and sticks it onto a sugar, RuBP." },
    { at: 15, text: "step two: using ATP and NADPH, that's converted into G3P — the first real sugar." },
    { at: 19, text: "step three: most G3P is recycled to rebuild RuBP, so the cycle can turn again." },
    { at: 23, text: "the rest leaves as G3P and joins up into glucose. that's the food the whole plant runs on." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);
    // stroma backdrop
    const g = bg.createRadialGradient(CX, CY, 30, CX, CY, 340);
    g.addColorStop(0, "#2a5c38");
    g.addColorStop(1, "#1c3f28");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);
    fadeText(ann, "in the stroma", 60, 30, phase(t, 1, 2.5), "italic 12px -apple-system, sans-serif", "#a8d0b4", "start");

    // the ring — SVG backdrop (slowly rotating), with a primitive fallback
    const ringIn = phase(t, 0.5, 3);
    const ringImg = img("calvinRing");
    if (ringImg) {
      drawSvg(mid, ringImg, CX, CY, R * 2 + 64, R * 2 + 64, { alpha: ringIn, rotate: t * 0.12 });
    } else {
      mid.save();
      mid.globalAlpha = ringIn;
      mid.strokeStyle = "#4aa062";
      mid.lineWidth = 4;
      mid.beginPath();
      mid.arc(CX, CY, R, 0, 7);
      mid.stroke();
      for (let i = 0; i < 3; i++) {
        const a = t * 0.5 + (i / 3) * Math.PI * 2;
        const p = pt(a);
        mid.save();
        mid.translate(p.x, p.y);
        mid.rotate(a + Math.PI / 2);
        mid.fillStyle = "#6dd07a";
        mid.beginPath();
        mid.moveTo(0, -7);
        mid.lineTo(6, 4);
        mid.lineTo(-6, 4);
        mid.closePath();
        mid.fill();
        mid.restore();
      }
      mid.restore();
    }

    // stage nodes appear in sequence
    STAGES.forEach((s, i) => {
      const sIn = phase(t, 10 + i * 4.5, 12 + i * 4.5);
      if (sIn <= 0) return;
      const p = pt(s.ang);
      mid.save();
      mid.globalAlpha = sIn;
      mid.fillStyle = s.color;
      mid.beginPath();
      mid.arc(p.x, p.y, 13, 0, 7);
      mid.fill();
      mid.restore();
      // labels pushed outward from the centre
      const lx = CX + Math.cos(s.ang) * (R + 30);
      const ly = CY + Math.sin(s.ang) * (R + 30);
      const align = Math.cos(s.ang) < -0.3 ? "end" : Math.cos(s.ang) > 0.3 ? "start" : "center";
      fadeText(ann, s.label, lx, ly, sIn, "600 13px -apple-system, sans-serif", "#eef5ef", align as CanvasTextAlign);
      fadeText(ann, s.sub, lx, ly + 16, sIn * 0.85, "11px -apple-system, sans-serif", "#b8d8c0", align as CanvasTextAlign);
    });

    // CO2 entering at stage 1 (top)
    const co2In = phase(t, 10, 12);
    if (co2In > 0) {
      const c = cycle(t * 0.5);
      const p1 = pt(STAGES[0].ang);
      const a = co2In * (1 - phase(t, 22, 24));
      const sx = p1.x;
      const sy = 20 + c * (p1.y - 34);
      const co2Img = img("co2");
      if (co2Img) {
        drawSvg(fg, co2Img, sx, sy, 40, 22, { alpha: a });
      } else {
        fg.save();
        fg.globalAlpha = a;
        fg.fillStyle = "#8a94a0";
        for (const dx of [-6, 0, 6]) {
          fg.beginPath();
          fg.arc(sx + dx, sy, 4, 0, 7);
          fg.fill();
        }
        fg.restore();
      }
      fadeText(ann, "CO₂", p1.x, 16, co2In, "600 12px -apple-system, sans-serif", "#aab2bc");
    }

    // ATP + NADPH feeding into stage 2 (from the left, the previous scene's products)
    const fuelIn = phase(t, 15, 17);
    if (fuelIn > 0) {
      const p2 = pt(STAGES[1].ang);
      const fuelAlpha = fuelIn * (1 - phase(t, 22, 24));
      fg.save();
      fg.globalAlpha = fuelAlpha;
      fg.strokeStyle = "rgba(240,216,120,0.6)";
      fg.lineWidth = 2;
      fg.beginPath();
      fg.moveTo(CX + 20, CY + 150);
      fg.lineTo(p2.x, p2.y + 12);
      fg.stroke();
      fg.restore();
      const atpImg = img("atp");
      const nadphImg = img("nadph");
      if (atpImg && nadphImg) {
        drawSvg(fg, atpImg, CX + 2, CY + 160, 50, 24, { alpha: fuelAlpha });
        drawSvg(fg, nadphImg, CX + 62, CY + 160, 66, 24, { alpha: fuelAlpha });
      } else {
        fg.save();
        fg.globalAlpha = fuelAlpha;
        fg.fillStyle = "#e8c14a";
        fg.beginPath();
        fg.roundRect(CX - 20, CY + 150, 44, 20, 5);
        fg.fill();
        fg.fillStyle = "#6db0e8";
        fg.beginPath();
        fg.roundRect(CX + 30, CY + 150, 60, 20, 5);
        fg.fill();
        fg.restore();
        fadeText(ann, "ATP", CX + 2, CY + 164, fuelIn, "600 11px -apple-system, sans-serif", "#412402");
        fadeText(ann, "NADPH", CX + 60, CY + 164, fuelIn, "600 11px -apple-system, sans-serif", "#0c447c");
      }
    }

    // G3P exiting toward glucose (from stage 2 outward to the right)
    const exitIn = phase(t, 23, 25);
    if (exitIn > 0) {
      const p2 = pt(STAGES[1].ang);
      const c = cycle(t * 0.6);
      const ex = p2.x + c * (W - 120 - p2.x);
      fg.save();
      fg.globalAlpha = exitIn;
      fg.fillStyle = "#f0d878";
      fg.beginPath();
      fg.arc(ex, p2.y + 20 + c * 40, 5, 0, 7);
      fg.fill();
      fg.restore();
      // glucose target — SVG hexagon with a primitive fallback
      const glucoseImg = img("glucose");
      if (glucoseImg) {
        drawSvg(mid, glucoseImg, W - 90, CY + 70, 64, 64, { alpha: exitIn });
      } else {
        mid.save();
        mid.globalAlpha = exitIn;
        mid.strokeStyle = "#f0d878";
        mid.fillStyle = "rgba(240,216,120,0.15)";
        mid.lineWidth = 2.5;
        mid.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hx = W - 90 + Math.cos(a) * 26;
          const hy = CY + 70 + Math.sin(a) * 26;
          if (i === 0) mid.moveTo(hx, hy);
          else mid.lineTo(hx, hy);
        }
        mid.closePath();
        mid.fill();
        mid.stroke();
        mid.restore();
      }
      fadeText(ann, "glucose", W - 90, CY + 116, exitIn, "600 13px -apple-system, sans-serif", "#f0d878");
      fadeText(ann, "G3P", (p2.x + W - 90) / 2, p2.y + 70, exitIn, "11px -apple-system, sans-serif", "#f0d878");
    }

    // title
    fadeText(ann, "the Calvin cycle", 460, 402, phase(t, 0.5, 2) * (1 - phase(t, 23, 25)), "700 17px -apple-system, sans-serif", "#eef5ef");
  },
};
