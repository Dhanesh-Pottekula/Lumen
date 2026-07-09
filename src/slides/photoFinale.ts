/**
 * Photosynthesis · scene 7 — recap.
 *
 * A journey strip mirroring the Coimbatore finale: sun → leaf → cell → chloroplast →
 * light reactions → Calvin cycle → sugar, then the title and a one-line summary.
 * Pure renderFrame(t).
 */
import { img } from "../assets/photosynthesis";
import { drawSvg, fadeText, phase } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;
const Y = 230;

type Station = [string, (x: number) => void];

export const photoFinaleSlide: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 1, text: "so that's the whole journey: sunlight to leaf, to cell, to chloroplast, through two reaction stages, into sugar." },
    { at: 8, text: "photosynthesis — how the whole living world runs on light." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1c3324");
    g.addColorStop(1, "#14241a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // the connecting line
    const lineIn = phase(t, 0.5, 4.5);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#3a6b48";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, Y);
    ctx.lineTo(90 + 740 * lineIn, Y);
    ctx.stroke();
    ctx.restore();

    const stations: Station[] = [
      // sun
      ["sunlight", (x) => {
        const el = img("sun");
        if (el) {
          drawSvg(ctx, el, x, Y - 20, 40, 40, { rotate: t * 0.25 });
          return;
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t * 0.4;
          ctx.strokeStyle = "#e8c14a";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 12, Y - 20 + Math.sin(a) * 12);
          ctx.lineTo(x + Math.cos(a) * 18, Y - 20 + Math.sin(a) * 18);
          ctx.stroke();
        }
        ctx.fillStyle = "#f6e08a";
        ctx.beginPath();
        ctx.arc(x, Y - 20, 9, 0, 7);
        ctx.fill();
      }],
      // leaf
      ["leaf", (x) => {
        const el = img("leaf");
        if (el) {
          drawSvg(ctx, el, x, Y - 20, 42, 26);
          return;
        }
        ctx.fillStyle = "#3a8a4a";
        ctx.beginPath();
        ctx.moveTo(x - 16, Y - 20);
        ctx.quadraticCurveTo(x, Y - 34, x + 16, Y - 20);
        ctx.quadraticCurveTo(x, Y - 6, x - 16, Y - 20);
        ctx.fill();
      }],
      // cell
      ["cell", (x) => {
        ctx.strokeStyle = "#6db06a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, Y - 20, 13, 0, 7);
        ctx.stroke();
        ctx.fillStyle = "#3a8a4a";
        ctx.beginPath();
        ctx.arc(x - 4, Y - 22, 3, 0, 7);
        ctx.arc(x + 5, Y - 17, 3, 0, 7);
        ctx.fill();
      }],
      // chloroplast
      ["chloroplast", (x) => {
        const el = img("chloroplast");
        if (el) {
          drawSvg(ctx, el, x, Y - 20, 40, 24);
          return;
        }
        ctx.fillStyle = "#3a8a4a";
        ctx.strokeStyle = "#2c6b3a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(x, Y - 20, 16, 9, 0, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#1f4f2a";
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(x + i * 7, Y - 20, 2, 0, 7);
          ctx.fill();
        }
      }],
      // light reactions (ATP)
      ["light rxn", (x) => {
        ctx.fillStyle = "#e8c14a";
        ctx.beginPath();
        ctx.roundRect(x - 16, Y - 28, 32, 16, 4);
        ctx.fill();
        ctx.fillStyle = "#412402";
        ctx.font = "600 9px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("ATP", x, Y - 17);
      }],
      // Calvin cycle
      ["Calvin cycle", (x) => {
        ctx.strokeStyle = "#5cc87a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, Y - 20, 12, 0.4, 0.4 + Math.PI * 1.6);
        ctx.stroke();
      }],
      // sugar
      ["sugar", (x) => {
        const el = img("glucose");
        if (el) {
          drawSvg(ctx, el, x, Y - 20, 34, 34);
          return;
        }
        ctx.strokeStyle = "#f0d878";
        ctx.fillStyle = "rgba(240,216,120,0.16)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hx = x + Math.cos(a) * 13;
          const hy = Y - 20 + Math.sin(a) * 13;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }],
    ];

    stations.forEach(([label, icon], i) => {
      const a = phase(t, 0.8 + i * 0.55, 1.6 + i * 0.55);
      if (a <= 0) return;
      const x = 90 + i * (740 / (stations.length - 1));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, Y, 4.5, 0, 7);
      ctx.fillStyle = "#5cc87a";
      ctx.fill();
      icon(x);
      ctx.restore();
      fadeText(ctx, label, x, Y + 26, a, "600 12px -apple-system, sans-serif", "#eef5ef");
    });

    // title
    const titleIn = phase(t, 6, 8);
    if (titleIn > 0) {
      const pulse = 1 + 0.03 * Math.sin(t * 2.4);
      fadeText(ctx, "PHOTOSYNTHESIS", 460, 110, titleIn, `800 ${Math.round(30 * pulse)}px -apple-system, sans-serif`, "#eef5ef");
      fadeText(ctx, "how the living world runs on light", 460, 138, phase(t, 7, 9), "14px -apple-system, sans-serif", "#8fe0a8");
    }
  },
};
