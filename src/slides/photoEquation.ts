/**
 * Photosynthesis · scene 6 — inputs and outputs.
 *
 * The summary equation assembles piece by piece:
 *   6 CO₂ + 6 H₂O + light → C₆H₁₂O₆ + 6 O₂
 * Each term is echoed by a small icon. Pure renderFrame(t).
 */
import { img, type PhotoAssetName } from "../assets/photosynthesis";
import { drawSvg, fadeText, phase, radialGlow, withGlow } from "./anim";
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
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1c3324");
    g.addColorStop(1, "#152a1d");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    withGlow(ann, { blur: 16, color: "rgba(120,220,150,0.55)" }, () => {
      fadeText(ann, "the balance sheet", 460, 90, phase(t, 0.3, 2), "700 20px -apple-system, sans-serif", "#eef5ef");
    });

    // inputs
    molecule(mid, 120, "co2", "#8a94a0", "6 CO₂", phase(t, 3, 4.5), 52, 30);
    fadeText(ann, "+", 200, ROW + 6, phase(t, 3.5, 5), "700 24px -apple-system, sans-serif", "#9fb0a4");
    molecule(mid, 280, "h2o", "#4a90d8", "6 H₂O", phase(t, 4, 5.5), 44, 38);
    fadeText(ann, "+", 360, ROW + 6, phase(t, 4.5, 6), "700 24px -apple-system, sans-serif", "#9fb0a4");

    // light (sun icon)
    const lightIn = phase(t, 5, 6.5);
    if (lightIn > 0) {
      radialGlow(mid, 440, ROW, 40, "rgba(255,214,120,0.6)", lightIn);
      const sunImg = img("sun");
      if (sunImg) {
        drawSvg(mid, sunImg, 440, ROW, 52, 52, { alpha: lightIn, rotate: t * 0.25 });
      } else {
        mid.save();
        mid.globalAlpha = lightIn;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t * 0.4;
          mid.strokeStyle = "#e8c14a";
          mid.lineWidth = 2.5;
          mid.beginPath();
          mid.moveTo(440 + Math.cos(a) * 18, ROW + Math.sin(a) * 18);
          mid.lineTo(440 + Math.cos(a) * 26, ROW + Math.sin(a) * 26);
          mid.stroke();
        }
        mid.fillStyle = "#f6e08a";
        mid.beginPath();
        mid.arc(440, ROW, 14, 0, 7);
        mid.fill();
        mid.restore();
      }
      fadeText(ann, "light", 440, ROW + 40, lightIn, "600 15px -apple-system, sans-serif", "#f0d878");
    }

    // arrow
    const arrowIn = phase(t, 8, 9.5);
    if (arrowIn > 0) {
      mid.save();
      mid.globalAlpha = arrowIn;
      mid.strokeStyle = "#eef5ef";
      mid.lineWidth = 3;
      mid.beginPath();
      mid.moveTo(500, ROW);
      mid.lineTo(560, ROW);
      mid.stroke();
      mid.beginPath();
      mid.moveTo(560, ROW);
      mid.lineTo(551, ROW - 6);
      mid.moveTo(560, ROW);
      mid.lineTo(551, ROW + 6);
      mid.stroke();
      mid.restore();
    }

    // outputs: glucose hexagon + O2
    const glucoseIn = phase(t, 9, 10.5);
    if (glucoseIn > 0) {
      radialGlow(mid, 640, ROW, 42, "rgba(242,193,78,0.5)", glucoseIn);
      const glucoseImg = img("glucose");
      if (glucoseImg) {
        drawSvg(mid, glucoseImg, 640, ROW, 54, 54, { alpha: glucoseIn });
      } else {
        mid.save();
        mid.globalAlpha = glucoseIn;
        mid.strokeStyle = "#f0d878";
        mid.fillStyle = "rgba(240,216,120,0.16)";
        mid.lineWidth = 2.5;
        mid.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hx = 640 + Math.cos(a) * 20;
          const hy = ROW + Math.sin(a) * 20;
          if (i === 0) mid.moveTo(hx, hy);
          else mid.lineTo(hx, hy);
        }
        mid.closePath();
        mid.fill();
        mid.stroke();
        mid.restore();
      }
      fadeText(ann, "C₆H₁₂O₆", 640, ROW + 42, glucoseIn, "600 15px -apple-system, sans-serif", "#f0d878");
      fadeText(ann, "(glucose)", 640, ROW + 60, glucoseIn * 0.8, "11px -apple-system, sans-serif", "#c8b878");
    }
    fadeText(ann, "+", 720, ROW + 6, phase(t, 9.5, 11), "700 24px -apple-system, sans-serif", "#9fb0a4");
    const o2In = phase(t, 10, 11.5);
    if (o2In > 0) {
      const o2Img = img("o2");
      if (o2Img) {
        drawSvg(mid, o2Img, 792, ROW, 46, 30, { alpha: o2In });
      } else {
        mid.save();
        mid.globalAlpha = o2In;
        mid.strokeStyle = "#7fe0d8";
        mid.lineWidth = 3;
        mid.beginPath();
        mid.arc(792, ROW, 15, 0, 7);
        mid.stroke();
        mid.restore();
      }
      fadeText(ann, "6 O₂", 792, ROW + 40, o2In, "600 15px -apple-system, sans-serif", "#8fe8e0");
    }

    // summary line
    const sumIn = phase(t, 13, 15);
    if (sumIn > 0) {
      fadeText(ann, "raw materials + light  →  food + oxygen", 460, 350, sumIn, "italic 16px -apple-system, sans-serif", "#b8d8c0");
    }
  },
};
