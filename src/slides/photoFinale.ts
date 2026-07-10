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
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1c3324");
    g.addColorStop(1, "#14241a");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // the connecting line
    const lineIn = phase(t, 0.5, 4.5);
    mid.save();
    mid.globalAlpha = 0.8;
    mid.strokeStyle = "#3a6b48";
    mid.lineWidth = 2;
    mid.beginPath();
    mid.moveTo(90, Y);
    mid.lineTo(90 + 740 * lineIn, Y);
    mid.stroke();
    mid.restore();

    const stations: Station[] = [
      // sun
      ["sunlight", (x) => {
        const el = img("sun");
        if (el) {
          drawSvg(mid, el, x, Y - 20, 40, 40, { rotate: t * 0.25 });
          return;
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t * 0.4;
          mid.strokeStyle = "#e8c14a";
          mid.lineWidth = 2;
          mid.beginPath();
          mid.moveTo(x + Math.cos(a) * 12, Y - 20 + Math.sin(a) * 12);
          mid.lineTo(x + Math.cos(a) * 18, Y - 20 + Math.sin(a) * 18);
          mid.stroke();
        }
        mid.fillStyle = "#f6e08a";
        mid.beginPath();
        mid.arc(x, Y - 20, 9, 0, 7);
        mid.fill();
      }],
      // leaf
      ["leaf", (x) => {
        const el = img("leaf");
        if (el) {
          drawSvg(mid, el, x, Y - 20, 42, 26);
          return;
        }
        mid.fillStyle = "#3a8a4a";
        mid.beginPath();
        mid.moveTo(x - 16, Y - 20);
        mid.quadraticCurveTo(x, Y - 34, x + 16, Y - 20);
        mid.quadraticCurveTo(x, Y - 6, x - 16, Y - 20);
        mid.fill();
      }],
      // cell
      ["cell", (x) => {
        mid.strokeStyle = "#6db06a";
        mid.lineWidth = 3;
        mid.beginPath();
        mid.arc(x, Y - 20, 13, 0, 7);
        mid.stroke();
        mid.fillStyle = "#3a8a4a";
        mid.beginPath();
        mid.arc(x - 4, Y - 22, 3, 0, 7);
        mid.arc(x + 5, Y - 17, 3, 0, 7);
        mid.fill();
      }],
      // chloroplast
      ["chloroplast", (x) => {
        const el = img("chloroplast");
        if (el) {
          drawSvg(mid, el, x, Y - 20, 40, 24);
          return;
        }
        mid.fillStyle = "#3a8a4a";
        mid.strokeStyle = "#2c6b3a";
        mid.lineWidth = 1.5;
        mid.beginPath();
        mid.ellipse(x, Y - 20, 16, 9, 0, 0, 7);
        mid.fill();
        mid.stroke();
        mid.fillStyle = "#1f4f2a";
        for (let i = -1; i <= 1; i++) {
          mid.beginPath();
          mid.arc(x + i * 7, Y - 20, 2, 0, 7);
          mid.fill();
        }
      }],
      // light reactions (ATP)
      ["light rxn", (x) => {
        mid.fillStyle = "#e8c14a";
        mid.beginPath();
        mid.roundRect(x - 16, Y - 28, 32, 16, 4);
        mid.fill();
        mid.fillStyle = "#412402";
        mid.font = "600 9px -apple-system, sans-serif";
        mid.textAlign = "center";
        mid.fillText("ATP", x, Y - 17);
      }],
      // Calvin cycle
      ["Calvin cycle", (x) => {
        mid.strokeStyle = "#5cc87a";
        mid.lineWidth = 3;
        mid.beginPath();
        mid.arc(x, Y - 20, 12, 0.4, 0.4 + Math.PI * 1.6);
        mid.stroke();
      }],
      // sugar
      ["sugar", (x) => {
        const el = img("glucose");
        if (el) {
          drawSvg(mid, el, x, Y - 20, 34, 34);
          return;
        }
        mid.strokeStyle = "#f0d878";
        mid.fillStyle = "rgba(240,216,120,0.16)";
        mid.lineWidth = 2;
        mid.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hx = x + Math.cos(a) * 13;
          const hy = Y - 20 + Math.sin(a) * 13;
          if (i === 0) mid.moveTo(hx, hy);
          else mid.lineTo(hx, hy);
        }
        mid.closePath();
        mid.fill();
        mid.stroke();
      }],
    ];

    stations.forEach(([label, icon], i) => {
      const a = phase(t, 0.8 + i * 0.55, 1.6 + i * 0.55);
      if (a <= 0) return;
      const x = 90 + i * (740 / (stations.length - 1));
      mid.save();
      mid.globalAlpha = a;
      mid.beginPath();
      mid.arc(x, Y, 4.5, 0, 7);
      mid.fillStyle = "#5cc87a";
      mid.fill();
      icon(x);
      mid.restore();
      fadeText(ann, label, x, Y + 26, a, "600 12px -apple-system, sans-serif", "#eef5ef");
    });

    // title
    const titleIn = phase(t, 6, 8);
    if (titleIn > 0) {
      const pulse = 1 + 0.03 * Math.sin(t * 2.4);
      fadeText(ann, "PHOTOSYNTHESIS", 460, 110, titleIn, `800 ${Math.round(30 * pulse)}px -apple-system, sans-serif`, "#eef5ef");
      fadeText(ann, "how the living world runs on light", 460, 138, phase(t, 7, 9), "14px -apple-system, sans-serif", "#8fe0a8");
    }
  },
};
