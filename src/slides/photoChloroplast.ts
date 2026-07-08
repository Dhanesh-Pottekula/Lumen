/**
 * Photosynthesis · scene 3 — chloroplast structure.
 *
 * Zoom into one chloroplast: outer + inner membranes, stroma fluid, thylakoid discs
 * stacked into grana, and lamellae connecting the stacks. Each part labelled.
 * Pure renderFrame(t).
 */
import { fadeText, phase, prng } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const CX = 470;
const CY = 215;
const RX = 300;
const RY = 150;

const rand = prng(303);
// grana stacks: position along the chloroplast interior, each a stack of discs
const GRANA = Array.from({ length: 5 }, (_, i) => {
  const gx = CX - 150 + i * 78 + (rand() - 0.5) * 16;
  const gy = CY + (rand() - 0.5) * 120;
  const discs = 3 + Math.floor(rand() * 3);
  return { gx, gy, discs, order: i * 0.4 };
});

export const photoChloroplastSlide: CanvasSlideDefinition = {
  duration: 22,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "here's a single chloroplast, blown up huge. it has a double outer membrane like a sealed pouch." },
    { at: 5, text: "inside floats a thick fluid called the stroma — that's where sugar gets built." },
    { at: 10, text: "suspended in it are stacks of green discs. each disc is a thylakoid; a stack of them is a granum." },
    { at: 15, text: "thin tubes called lamellae connect the stacks. the green discs are packed with chlorophyll, the pigment that catches light." },
    { at: 19, text: "two homes for two jobs: the discs catch light, the fluid builds sugar. let's watch each one." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#14201a";
    ctx.fillRect(0, 0, W, H);

    // outer + inner membrane
    const bodyIn = phase(t, 0.3, 2.5);
    ctx.save();
    ctx.globalAlpha = bodyIn;
    // stroma fill
    const stroma = ctx.createRadialGradient(CX, CY, 20, CX, CY, RX);
    stroma.addColorStop(0, "#2a5c38");
    stroma.addColorStop(1, "#1f4a2c");
    ctx.fillStyle = stroma;
    ctx.strokeStyle = "#6db06a";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX, RY, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    // inner membrane
    ctx.strokeStyle = "#8fd08a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(CX, CY, RX - 8, RY - 8, 0, 0, 7);
    ctx.stroke();
    ctx.restore();

    // stroma label
    const strLab = phase(t, 5, 7);
    if (strLab > 0) fadeText(ctx, "stroma (fluid)", CX + 120, CY - 96, strLab, "italic 13px -apple-system, sans-serif", "#a8d0a8");

    // grana stacks
    const granaIn = phase(t, 10, 13.5);
    if (granaIn > 0) {
      for (const g of GRANA) {
        const gin = phase(t, 10 + g.order, 12 + g.order);
        if (gin <= 0) continue;
        ctx.save();
        ctx.globalAlpha = gin;
        for (let d = 0; d < g.discs; d++) {
          const y = g.gy - (g.discs - 1) * 5 + d * 10;
          ctx.fillStyle = "#3a9a54";
          ctx.strokeStyle = "#2c7a40";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(g.gx, y, 26, 5, 0, 0, 7);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // lamellae connecting stacks
    const lamIn = phase(t, 15, 17);
    if (lamIn > 0) {
      ctx.save();
      ctx.globalAlpha = lamIn * 0.8;
      ctx.strokeStyle = "#4aa062";
      ctx.lineWidth = 3;
      for (let i = 0; i < GRANA.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(GRANA[i].gx + 22, GRANA[i].gy);
        ctx.quadraticCurveTo((GRANA[i].gx + GRANA[i + 1].gx) / 2, (GRANA[i].gy + GRANA[i + 1].gy) / 2 - 18, GRANA[i + 1].gx - 22, GRANA[i + 1].gy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // labels for thylakoid / granum / lamellae
    const lab = phase(t, 12, 14);
    if (lab > 0) {
      const g0 = GRANA[0];
      fadeText(ctx, "thylakoid (one disc)", g0.gx - 30, g0.gy - 30, lab, "12px -apple-system, sans-serif", "#9fe0a8", "start");
      const g2 = GRANA[2];
      fadeText(ctx, "granum (a stack)", g2.gx, g2.gy + 34, lab, "12px -apple-system, sans-serif", "#9fe0a8");
    }
    const lamLab = phase(t, 16.5, 18);
    if (lamLab > 0) fadeText(ctx, "lamellae (connectors)", CX, CY + RY - 24, lamLab, "12px -apple-system, sans-serif", "#7fc090");

    // title
    fadeText(ctx, "inside a chloroplast", 460, 40, phase(t, 0.5, 2) * (1 - phase(t, 18, 20)), "700 18px -apple-system, sans-serif", "#eef5ef");
  },
};
