/**
 * Reveal-grammar demo (Step 05).
 *
 * Six tiles, each showing the SAME content revealed by a different verb (wipe, iris, clock,
 * blinds, checkerboard, dissolve), staggered over the timeline; then a moving spotlight dims the
 * surround (attention / fog-of-war) and a `withBlend(multiply)` swatch stains like ink. Seekable.
 */
import { clamp01, phase } from "./anim";
import {
  blinds,
  checkerboard,
  dissolve,
  iris,
  radialWipe,
  spotlight,
  wipe,
  withBlend,
} from "../render/reveal";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const COLS = [40, 330, 620];
const ROWS = [78, 250];
const TW = 260;
const TH = 148;

/** The content each tile reveals — a gradient card with a label — drawn in tile-local coords. */
function tileContent(c: CanvasRenderingContext2D, hueA: string, hueB: string) {
  const g = c.createLinearGradient(0, 0, TW, TH);
  g.addColorStop(0, hueA);
  g.addColorStop(1, hueB);
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, 0, TW, TH, 12);
  c.fill();
  // a couple of shapes so the reveal edge is obvious
  c.fillStyle = "rgba(255,255,255,0.22)";
  c.beginPath();
  c.arc(TW * 0.72, TH * 0.32, 34, 0, 7);
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.18)";
  c.beginPath();
  c.roundRect(20, TH - 46, TW - 40, 26, 6);
  c.fill();
}

type Tile = { col: number; row: number; label: string; a: string; b: string; reveal: (c: CanvasRenderingContext2D, p: number) => void };

const TILES: Tile[] = [
  {
    col: 0, row: 0, label: "wipe → (feathered)", a: "#3a7bd5", b: "#2b5876",
    reveal: (c, p) => wipe(c, p, TW, TH, (cc) => tileContent(cc, "#3a7bd5", "#2b5876"), { dir: "left", feather: 14 }),
  },
  {
    col: 1, row: 0, label: "iris (circle)", a: "#c94b4b", b: "#4b134f",
    reveal: (c, p) => iris(c, p, TW / 2, TH / 2, Math.hypot(TW, TH) / 2, (cc) => tileContent(cc, "#c94b4b", "#4b134f"), { feather: 10 }),
  },
  {
    col: 2, row: 0, label: "radialWipe (clock)", a: "#11998e", b: "#38ef7d",
    reveal: (c, p) => radialWipe(c, p, TW / 2, TH / 2, Math.hypot(TW, TH) / 2, (cc) => tileContent(cc, "#11998e", "#38ef7d")),
  },
  {
    col: 0, row: 1, label: "blinds", a: "#f7971e", b: "#ffd200",
    reveal: (c, p) => blinds(c, p, TW, TH, (cc) => tileContent(cc, "#f7971e", "#ffd200"), { count: 6 }),
  },
  {
    col: 1, row: 1, label: "checkerboard (diagonal)", a: "#654ea3", b: "#eaafc8",
    reveal: (c, p) => checkerboard(c, p, TW, TH, (cc) => tileContent(cc, "#654ea3", "#eaafc8"), { rows: 4, cols: 7, order: "diagonal" }),
  },
  {
    col: 2, row: 1, label: "dissolve (seeded)", a: "#e65c00", b: "#f9d423",
    reveal: (c, p) => dissolve(c, p, TW, TH, (cc) => tileContent(cc, "#e65c00", "#f9d423"), { seed: 5, cell: 12 }),
  },
];

export const revealDemoSlide: CanvasSlideDefinition = {
  duration: 22,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the reveal grammar — content enters by shape, not just by fading." },
    { at: 3, text: "wipes, irises, clock sweeps, blinds, checkerboards, and organic dissolves." },
    { at: 12, text: "a soft spotlight dims the surround to direct attention — the fog-of-war primitive." },
    { at: 17, text: "and blend modes: multiply stains like ink on paper. every mask is a pure function of t." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141c24");
    g.addColorStop(1, "#0e141a");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // each tile reveals on a staggered window
    TILES.forEach((tile, i) => {
      const x = COLS[tile.col];
      const y = ROWS[tile.row];
      const p = phase(t, 0.5 + i * 1.6, 3.5 + i * 1.6);
      if (p > 0) {
        mid.save();
        mid.translate(x, y);
        tile.reveal(mid, p);
        mid.restore();
      }
      // border + label (always visible)
      ann.save();
      ann.strokeStyle = "rgba(255,255,255,0.14)";
      ann.lineWidth = 1;
      ann.beginPath();
      ann.roundRect(x, y, TW, TH, 12);
      ann.stroke();
      ann.restore();
      const labelIn = phase(t, i * 1.6, 0.6 + i * 1.6);
      ann.save();
      ann.globalAlpha = labelIn;
      ann.fillStyle = "#cdd8e2";
      ann.font = "600 12px -apple-system, sans-serif";
      ann.textAlign = "center";
      ann.fillText(tile.label, x + TW / 2, y + TH + 16);
      ann.restore();
    });

    // moving spotlight over the grid (attention / fog-of-war), t 12→20
    const spotIn = phase(t, 12, 13) * (1 - phase(t, 19.5, 20.5));
    if (spotIn > 0) {
      const sweep = clamp01((t - 12) / 7);
      const cx = 120 + sweep * 680;
      const cy = 220 + Math.sin(sweep * Math.PI * 2) * 90;
      spotlight(mid, cx, cy, 150, () => {}, { dim: { color: "#0b1016", strength: 0.72 * spotIn } });
    }

    // withBlend(multiply) ink stain, t 17+
    const stainIn = phase(t, 17, 18.5);
    if (stainIn > 0) {
      withBlend(mid, "multiply", () => {
        mid.globalAlpha = stainIn;
        const rg = mid.createRadialGradient(770, 60, 4, 770, 60, 46);
        rg.addColorStop(0, "#8a3b2e");
        rg.addColorStop(1, "rgba(138,59,46,0)");
        mid.fillStyle = rg;
        mid.beginPath();
        mid.arc(770, 60, 46, 0, 7);
        mid.fill();
      });
      ann.save();
      ann.globalAlpha = stainIn;
      ann.fillStyle = "#c9a";
      ann.font = "600 12px -apple-system, sans-serif";
      ann.textAlign = "center";
      ann.fillText("withBlend(multiply)", 770, 120);
      ann.restore();
    }

    // title
    ann.save();
    ann.globalAlpha = phase(t, 0.3, 1.5);
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("reveal grammar", 460, 40);
    ann.restore();
  },
};
