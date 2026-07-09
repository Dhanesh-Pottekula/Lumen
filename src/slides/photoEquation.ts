/**
 * Photosynthesis · scene 6 — inputs and outputs.
 *
 * The summary equation assembles piece by piece:
 *   6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂
 * Each term is echoed by a small icon. Pure renderFrame(t).
 */
import { img, type PhotoAssetName } from "../assets/photosynthesis";
import { drawSvg, fadeText, phase } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;
const ROW = 250; // baseline for the equation icons

function molecule(
  ctx: CanvasRenderingContext2D,
  x: number,
  asset: PhotoAssetName,
  color: string,
  label: string,
  alpha: number,
  w = 48,
  h = 30,
) {
  if (alpha <= 0) return;
  const el = img(asset);
  if (el) {
    drawSvg(ctx, el, x, ROW, w, h, { alpha });
  } else {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, ROW, 16, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  fadeText(ctx, label, x, ROW + 40, alpha, "600 15px -apple-system, sans-serif", "#eef5ef");
}

export const photoEquationSlide: CanvasSlideDefinition = {
  duration: 18,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "so here's the whole thing in one line." },
    { at: 3, text: "six carbon dioxide, plus six water, plus the energy of light..." },
    { at: 9, text: "...become one glucose molecule, and six oxygen released to the air." },
    { at: 13, text: "light and simple raw materials in; food and breathable air out. that's photosynthesis." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1c3324");
    g.addColorStop(1, "#152a1d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    fadeText(ctx, "the balance sheet", 460, 90, phase(t, 0.3, 2), "700 20px -apple-system, sans-serif", "#eef5ef");

    // inputs
    molecule(ctx, 120, "co2", "#8a94a0", "6 CO₂", phase(t, 3, 4.5), 52, 30);
    fadeText(ctx, "+", 200, ROW + 6, phase(t, 3.5, 5), "700 24px -apple-system, sans-serif", "#9fb0a4");
    molecule(ctx, 280, "h2o", "#4a90d8", "6 H₂O", phase(t, 4, 5.5), 44, 38);
    fadeText(ctx, "+", 360, ROW + 6, phase(t, 4.5, 6), "700 24px -apple-system, sans-serif", "#9fb0a4");

    // light (sun icon)
    const lightIn = phase(t, 5, 6.5);
    if (lightIn > 0) {
      const sunImg = img("sun");
      if (sunImg) {
        drawSvg(ctx, sunImg, 440, ROW, 52, 52, { alpha: lightIn, rotate: t * 0.25 });
      } else {
        ctx.save();
        ctx.globalAlpha = lightIn;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t * 0.4;
          ctx.strokeStyle = "#e8c14a";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(440 + Math.cos(a) * 18, ROW + Math.sin(a) * 18);
          ctx.lineTo(440 + Math.cos(a) * 26, ROW + Math.sin(a) * 26);
          ctx.stroke();
        }
        ctx.fillStyle = "#f6e08a";
        ctx.beginPath();
        ctx.arc(440, ROW, 14, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      fadeText(ctx, "light", 440, ROW + 40, lightIn, "600 15px -apple-system, sans-serif", "#f0d878");
    }

    // arrow
    const arrowIn = phase(t, 8, 9.5);
    if (arrowIn > 0) {
      ctx.save();
      ctx.globalAlpha = arrowIn;
      ctx.strokeStyle = "#eef5ef";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(500, ROW);
      ctx.lineTo(560, ROW);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(560, ROW);
      ctx.lineTo(551, ROW - 6);
      ctx.moveTo(560, ROW);
      ctx.lineTo(551, ROW + 6);
      ctx.stroke();
      ctx.restore();
    }

    // outputs: glucose hexagon + O2
    const glucoseIn = phase(t, 9, 10.5);
    if (glucoseIn > 0) {
      const glucoseImg = img("glucose");
      if (glucoseImg) {
        drawSvg(ctx, glucoseImg, 640, ROW, 54, 54, { alpha: glucoseIn });
      } else {
        ctx.save();
        ctx.globalAlpha = glucoseIn;
        ctx.strokeStyle = "#f0d878";
        ctx.fillStyle = "rgba(240,216,120,0.16)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hx = 640 + Math.cos(a) * 20;
          const hy = ROW + Math.sin(a) * 20;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      fadeText(ctx, "C₆H₁₂O₆", 640, ROW + 42, glucoseIn, "600 15px -apple-system, sans-serif", "#f0d878");
      fadeText(ctx, "(glucose)", 640, ROW + 60, glucoseIn * 0.8, "11px -apple-system, sans-serif", "#c8b878");
    }
    fadeText(ctx, "+", 720, ROW + 6, phase(t, 9.5, 11), "700 24px -apple-system, sans-serif", "#9fb0a4");
    const o2In = phase(t, 10, 11.5);
    if (o2In > 0) {
      const o2Img = img("o2");
      if (o2Img) {
        drawSvg(ctx, o2Img, 792, ROW, 46, 30, { alpha: o2In });
      } else {
        ctx.save();
        ctx.globalAlpha = o2In;
        ctx.strokeStyle = "#7fe0d8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(792, ROW, 15, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
      fadeText(ctx, "6 O₂", 792, ROW + 40, o2In, "600 15px -apple-system, sans-serif", "#8fe8e0");
    }

    // summary line
    const sumIn = phase(t, 13, 15);
    if (sumIn > 0) {
      fadeText(ctx, "raw materials + light  →  food + oxygen", 460, 350, sumIn, "italic 16px -apple-system, sans-serif", "#b8d8c0");
    }
  },
};
