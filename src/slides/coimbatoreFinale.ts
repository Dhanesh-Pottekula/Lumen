/**
 * Scene 6 — the finale: the whole Coimbatore journey recapped as a timeline strip.
 * Extracted from the retired single-file film so composeSlides() can sequence it.
 *
 * Upgraded to the engine's capability layers (Step 01+): the flat skyline sits on bg, the
 * connecting line + station icons on mid, glows / dots / sparkle / title-glow on fg, all text on
 * annotation, and a filmic vignette on fx. Still a pure, seekable function of `t`.
 */
import { breathe, fadeText, phase, prng, radialGlow, withAlpha, withGlow } from "./anim";
import type { Pt } from "../render/strokes";
import { drawOn, passingFlash } from "../render/strokeVerbs";
import { focusRings, pulseScale, sparkFlash, vignetteTo } from "../render/focus";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const finaleRand = prng(641);
const SKYLINE = Array.from({ length: 24 }, (_, i) => ({
  x: 30 + i * 37,
  w: 26 + finaleRand() * 10,
  h: 26 + finaleRand() * 78,
}));

// The journey strip geometry — the connecting line and station positions.
const LINE_Y = 220;
const LINE_X0 = 140;
const LINE_X1 = 780; // 140 + 640
const LINE_PATH: Pt[] = [
  [LINE_X0, LINE_Y],
  [LINE_X1, LINE_Y],
];

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
  render(ctx, t, frame) {
    // Layer routing: skyline → bg, connecting line + station icons → mid, glows / dots / sparkle /
    // title glow → fg, all text → annotation, filmic vignette → fx.
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const accent = frame?.theme.palette.accent ?? "#5cc8ae";

    // the skyline stays, faint, as the stage (bg) — a hair of breathe so it isn't frozen
    withAlpha(bg, 0.3 + breathe(t, 6, 0.03), () => drawSkyline(bg));

    // journey strip — the connecting line DRAWS ON left→right (mid)
    const lineIn = phase(t, 0.5, 4.5);
    if (lineIn > 0) {
      drawOn(mid, LINE_PATH, lineIn, {
        style: { color: "#48586a", width: 2, alpha: 0.8, cap: "round" },
      });
    }
    // once drawn, a light sweep runs the length of the line as the last stations settle
    const sweep = phase(t, 4.4, 5.4);
    if (sweep > 0 && sweep < 1) {
      passingFlash(fg, LINE_PATH, sweep, {
        glow: true,
        width: 0.18,
        style: { color: accent, width: 3 },
      });
    }

    const stations: [string, string, (x: number) => void][] = [
      [
        "the gap",
        "antiquity",
        (x) => {
          mid.beginPath();
          mid.moveTo(x - 16, LINE_Y - 8);
          mid.lineTo(x - 8, LINE_Y - 26);
          mid.lineTo(x - 1, LINE_Y - 8);
          mid.closePath();
          mid.moveTo(x + 1, LINE_Y - 8);
          mid.lineTo(x + 8, LINE_Y - 26);
          mid.lineTo(x + 16, LINE_Y - 8);
          mid.closePath();
          mid.fillStyle = "#39485a";
          mid.fill();
        },
      ],
      ["roman gold", "~100 CE", (x) => drawCoinShape(mid, x, LINE_Y - 18, 9, t, 0.4)],
      [
        "cotton",
        "the centuries",
        (x) => {
          for (const [dx, dy, r] of [
            [0, -22, 6],
            [-5, -16, 5],
            [5, -16, 5],
          ] as const) {
            mid.beginPath();
            mid.arc(x + dx, LINE_Y + dy, r, 0, 7);
            mid.fillStyle = "#eef2f5";
            mid.fill();
          }
        },
      ],
      [
        "the mills",
        "1932",
        (x) => {
          mid.fillStyle = "#31404f";
          mid.fillRect(x - 12, LINE_Y - 26, 24, 18);
          mid.fillStyle = "#26313d";
          mid.fillRect(x + 4, LINE_Y - 36, 6, 10);
          mid.fillStyle = "#ebcb8b";
          mid.fillRect(x - 8, LINE_Y - 21, 6, 5);
        },
      ],
      ["machines", "today", (x) => drawImpeller(mid, x, LINE_Y - 18, 0.34, t * 0.5)],
    ];

    stations.forEach(([label, when, icon], i) => {
      // staggered cascade — each station reveals after the line reaches it
      const a = phase(t, 0.8 + i * 0.85, 1.6 + i * 0.85);
      if (a <= 0) return;
      const x = LINE_X0 + i * 160;

      // icon on mid (inherits soft drop-shadow)
      withAlpha(mid, a, () => icon(x));

      // station dot on fg (inherits bloom), with a tiny glow to make it read as a node
      withAlpha(fg, a, () => {
        radialGlow(fg, x, LINE_Y, 14, "rgba(92,200,174,0.5)", a);
        fg.beginPath();
        fg.arc(x, LINE_Y, 4.5, 0, 7);
        fg.fillStyle = "#5cc8ae";
        fg.fill();
      });

      // a brief spark as each node lands — an attention beat on the fg
      const land = phase(t, 0.8 + i * 0.85, 1.4 + i * 0.85);
      if (land > 0 && land < 1) sparkFlash(fg, x, LINE_Y, land, { length: 16, inner: 5, color: accent });

      fadeText(ann, label, x, LINE_Y + 22, a, "600 12px -apple-system, sans-serif", "#e8eef2");
      fadeText(ann, when, x, LINE_Y + 38, a * 0.75, "10px -apple-system, sans-serif", "#93a4b0");
    });

    const titleIn = phase(t, 5.5, 7.5);
    if (titleIn > 0) {
      const cx = 460;
      const cy = 88;
      // converging rings land on the title as it appears — one filmic beat
      focusRings(fg, cx, cy, phase(t, 5.6, 6.6), { color: accent, maxR: 130, targetR: 26, count: 3 });
      sparkFlash(fg, cx, cy, phase(t, 5.8, 6.9), { length: 30, inner: 12, color: accent });
      // soft title glow on fg (bloom-friendly)
      withAlpha(fg, titleIn, () => radialGlow(fg, cx, 96, 150, "rgba(92,200,174,0.28)", titleIn));

      // the title itself — gentle pulseScale + inherited glow, on annotation
      withGlow(ann, { blur: 16, color: "rgba(92,200,174,0.55)" }, () => {
        pulseScale(ann, cx, 96, t, () => {
          fadeText(ann, "COIMBATORE", cx, 96, titleIn, "800 30px -apple-system, sans-serif", "#e8eef2");
        }, { amp: 0.03, period: 2.6 });
      });
      fadeText(ann, "the crossroads that never stopped trading", cx, 122, phase(t, 6.5, 8.5), "14px -apple-system, sans-serif", "#e8a13c");
    }

    // filmic close — a soft vignette settling toward the title/center on the fx layer
    const vig = phase(t, 5, 8);
    if (vig > 0) vignetteTo(fx, 460, 200, { strength: 0.42 * vig, inner: 210, outer: 640 });
  },
};
