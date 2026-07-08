/**
 * Photosynthesis · scene 5 — the Calvin cycle.
 *
 * In the stroma: a circular cycle with three stages — carbon fixation (CO₂ + RuBP → 3-PGA
 * via RuBisCO), reduction (3-PGA → G3P, spending ATP + NADPH), and regeneration (RuBP
 * remade). A G3P molecule exits toward glucose; ATP/NADPH feed in. Pure renderFrame(t).
 */
import { cycle, fadeText, phase } from "./anim";
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
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);
    // stroma backdrop
    const g = ctx.createRadialGradient(CX, CY, 30, CX, CY, 340);
    g.addColorStop(0, "#2a5c38");
    g.addColorStop(1, "#1c3f28");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    fadeText(ctx, "in the stroma", 60, 30, phase(t, 1, 2.5), "italic 12px -apple-system, sans-serif", "#a8d0b4", "start");

    // the ring
    const ringIn = phase(t, 0.5, 3);
    ctx.save();
    ctx.globalAlpha = ringIn;
    ctx.strokeStyle = "#4aa062";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, 7);
    ctx.stroke();
    // rotating arrows on the ring
    for (let i = 0; i < 3; i++) {
      const a = t * 0.5 + (i / 3) * Math.PI * 2;
      const p = pt(a);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "#6dd07a";
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(6, 4);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // stage nodes appear in sequence
    STAGES.forEach((s, i) => {
      const sIn = phase(t, 10 + i * 4.5, 12 + i * 4.5);
      if (sIn <= 0) return;
      const p = pt(s.ang);
      ctx.save();
      ctx.globalAlpha = sIn;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, 7);
      ctx.fill();
      ctx.restore();
      // labels pushed outward from the centre
      const lx = CX + Math.cos(s.ang) * (R + 30);
      const ly = CY + Math.sin(s.ang) * (R + 30);
      const align = Math.cos(s.ang) < -0.3 ? "end" : Math.cos(s.ang) > 0.3 ? "start" : "center";
      fadeText(ctx, s.label, lx, ly, sIn, "600 13px -apple-system, sans-serif", "#eef5ef", align as CanvasTextAlign);
      fadeText(ctx, s.sub, lx, ly + 16, sIn * 0.85, "11px -apple-system, sans-serif", "#b8d8c0", align as CanvasTextAlign);
    });

    // CO2 entering at stage 1 (top)
    const co2In = phase(t, 10, 12);
    if (co2In > 0) {
      const c = cycle(t * 0.5);
      const p1 = pt(STAGES[0].ang);
      ctx.save();
      ctx.globalAlpha = co2In * (1 - phase(t, 22, 24));
      ctx.fillStyle = "#8a94a0";
      const sx = p1.x;
      const sy = 20 + c * (p1.y - 34);
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.arc(sx + dx, sy, 4, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      fadeText(ctx, "CO₂", p1.x, 16, co2In, "600 12px -apple-system, sans-serif", "#aab2bc");
    }

    // ATP + NADPH feeding into stage 2 (from the left, the previous scene's products)
    const fuelIn = phase(t, 15, 17);
    if (fuelIn > 0) {
      const p2 = pt(STAGES[1].ang);
      ctx.save();
      ctx.globalAlpha = fuelIn * (1 - phase(t, 22, 24));
      // ATP token
      ctx.fillStyle = "#e8c14a";
      ctx.beginPath();
      ctx.roundRect(CX - 20, CY + 150, 44, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#6db0e8";
      ctx.beginPath();
      ctx.roundRect(CX + 30, CY + 150, 60, 20, 5);
      ctx.fill();
      // arrows toward stage 2 node
      ctx.strokeStyle = "rgba(240,216,120,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CX + 20, CY + 150);
      ctx.lineTo(p2.x, p2.y + 12);
      ctx.stroke();
      ctx.restore();
      fadeText(ctx, "ATP", CX + 2, CY + 164, fuelIn, "600 11px -apple-system, sans-serif", "#412402");
      fadeText(ctx, "NADPH", CX + 60, CY + 164, fuelIn, "600 11px -apple-system, sans-serif", "#0c447c");
    }

    // G3P exiting toward glucose (from stage 2 outward to the right)
    const exitIn = phase(t, 23, 25);
    if (exitIn > 0) {
      const p2 = pt(STAGES[1].ang);
      const c = cycle(t * 0.6);
      const ex = p2.x + c * (W - 120 - p2.x);
      ctx.save();
      ctx.globalAlpha = exitIn;
      ctx.fillStyle = "#f0d878";
      ctx.beginPath();
      ctx.arc(ex, p2.y + 20 + c * 40, 5, 0, 7);
      ctx.fill();
      ctx.restore();
      // glucose hexagon target
      ctx.save();
      ctx.globalAlpha = exitIn;
      ctx.strokeStyle = "#f0d878";
      ctx.fillStyle = "rgba(240,216,120,0.15)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const hx = W - 90 + Math.cos(a) * 26;
        const hy = CY + 70 + Math.sin(a) * 26;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      fadeText(ctx, "glucose", W - 90, CY + 116, exitIn, "600 13px -apple-system, sans-serif", "#f0d878");
      fadeText(ctx, "G3P", (p2.x + W - 90) / 2, p2.y + 70, exitIn, "11px -apple-system, sans-serif", "#f0d878");
    }

    // title
    fadeText(ctx, "the Calvin cycle", 460, 402, phase(t, 0.5, 2) * (1 - phase(t, 23, 25)), "700 17px -apple-system, sans-serif", "#eef5ef");
  },
};
