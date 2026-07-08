/**
 * Scene 6 — the finale: the whole Coimbatore journey recapped as a timeline strip.
 * Extracted from the retired single-file film so composeSlides() can sequence it.
 */
import { fadeText, phase, prng, withAlpha } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const finaleRand = prng(641);
const SKYLINE = Array.from({ length: 24 }, (_, i) => ({
  x: 30 + i * 37,
  w: 26 + finaleRand() * 10,
  h: 26 + finaleRand() * 78,
}));

function drawSkyline(ctx: CanvasRenderingContext2D) {
  for (const b of SKYLINE) {
    ctx.fillStyle = "#26313d";
    ctx.fillRect(b.x, H - b.h, b.w, b.h);
    const wr = prng(Math.round(b.x));
    for (let k = 0; k < 5; k++) {
      if (wr() > 0.5) continue;
      ctx.fillStyle = "rgba(235, 203, 139, 0.7)";
      ctx.fillRect(b.x + 4 + wr() * (b.w - 10), H - b.h + 6 + wr() * (b.h - 14), 3.4, 3.4);
    }
  }
}

function drawCoinShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 7);
  ctx.fillStyle = "#d9a73a";
  ctx.fill();
  ctx.strokeStyle = "#f3d27a";
  ctx.lineWidth = r * 0.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.1, 0, r * 0.45, -1.9, 1.6);
  ctx.strokeStyle = "#8a6420";
  ctx.lineWidth = r * 0.16;
  ctx.stroke();
  const shine = Math.max(0, Math.sin(t * 0.9 + spin)) * 0.3;
  if (shine > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 7);
    ctx.fillStyle = `rgba(255, 243, 207, ${shine})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawImpeller(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, t: number) {
  const angle = t * 3.4;
  for (let b = 0; b < 5; b++) {
    const a0 = angle + (b * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a0) * 10 * scale, y + Math.sin(a0) * 10 * scale);
    ctx.quadraticCurveTo(
      x + Math.cos(a0 + 0.55) * 34 * scale,
      y + Math.sin(a0 + 0.55) * 34 * scale,
      x + Math.cos(a0 + 0.95) * 50 * scale,
      y + Math.sin(a0 + 0.95) * 50 * scale,
    );
    ctx.strokeStyle = "#5cc8ae";
    ctx.lineWidth = 5 * scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, 9 * scale, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();
}

export const coimbatoreFinaleSlide: CanvasSlideDefinition = {
  duration: 12,
  viewW: W,
  viewH: H,
  captions: [
    { at: 1, text: "a gap in the mountains. roman gold. black soil. cheap water power. patient family firms." },
    { at: 7, text: "coimbatore — the crossroads that never stopped trading." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, W, H);

    // the skyline stays, faint, as the stage
    withAlpha(ctx, 0.3, () => drawSkyline(ctx));

    // journey strip
    const lineIn = phase(t, 0.5, 4.5);
    const y = 220;
    withAlpha(ctx, 0.8, () => {
      ctx.strokeStyle = "#48586a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(140 + 640 * lineIn, y);
      ctx.stroke();
    });

    const stations: [string, string, (x: number) => void][] = [
      [
        "the gap",
        "antiquity",
        (x) => {
          ctx.beginPath();
          ctx.moveTo(x - 16, y - 8);
          ctx.lineTo(x - 8, y - 26);
          ctx.lineTo(x - 1, y - 8);
          ctx.closePath();
          ctx.moveTo(x + 1, y - 8);
          ctx.lineTo(x + 8, y - 26);
          ctx.lineTo(x + 16, y - 8);
          ctx.closePath();
          ctx.fillStyle = "#39485a";
          ctx.fill();
        },
      ],
      ["roman gold", "~100 CE", (x) => drawCoinShape(ctx, x, y - 18, 9, t, 0.4)],
      [
        "cotton",
        "the centuries",
        (x) => {
          for (const [dx, dy, r] of [
            [0, -22, 6],
            [-5, -16, 5],
            [5, -16, 5],
          ] as const) {
            ctx.beginPath();
            ctx.arc(x + dx, y + dy, r, 0, 7);
            ctx.fillStyle = "#eef2f5";
            ctx.fill();
          }
        },
      ],
      [
        "the mills",
        "1932",
        (x) => {
          ctx.fillStyle = "#31404f";
          ctx.fillRect(x - 12, y - 26, 24, 18);
          ctx.fillStyle = "#26313d";
          ctx.fillRect(x + 4, y - 36, 6, 10);
          ctx.fillStyle = "#ebcb8b";
          ctx.fillRect(x - 8, y - 21, 6, 5);
        },
      ],
      ["machines", "today", (x) => drawImpeller(ctx, x, y - 18, 0.34, t * 0.5)],
    ];

    stations.forEach(([label, when, icon], i) => {
      const a = phase(t, 0.8 + i * 0.85, 1.6 + i * 0.85);
      if (a <= 0) return;
      const x = 140 + i * 160;
      withAlpha(ctx, a, () => {
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, 7);
        ctx.fillStyle = "#5cc8ae";
        ctx.fill();
        icon(x);
      });
      fadeText(ctx, label, x, y + 22, a, "600 12px -apple-system, sans-serif", "#e8eef2");
      fadeText(ctx, when, x, y + 38, a * 0.75, "10px -apple-system, sans-serif", "#93a4b0");
    });

    const titleIn = phase(t, 5.5, 7.5);
    if (titleIn > 0) {
      const pulse = 1 + 0.03 * Math.sin(t * 2.4);
      fadeText(ctx, "COIMBATORE", 460, 96, titleIn, `800 ${Math.round(30 * pulse)}px -apple-system, sans-serif`, "#e8eef2");
      fadeText(ctx, "the crossroads that never stopped trading", 460, 122, phase(t, 6.5, 8.5), "14px -apple-system, sans-serif", "#e8a13c");
    }
  },
};
