/**
 * Draw-on / stroke-system demo (Step 04).
 *
 * A single seekable scene that exercises the stroke vocabulary: draw-on with an arrowhead + tracer,
 * a smoothed (Catmull-Rom) curve, a variable-width tapered "brush" stroke, a passing-flash comet,
 * draw-border-then-fill, a traced path with a dissipating tail, circumscribe, and a staggered
 * multi-stroke sequence. Everything is a pure function of t.
 */
import { fadeText, phase } from "./anim";
import { clamp01 } from "../render/motion";
import { pointAt, smoothPath, type Pt } from "../render/strokes";
import {
  arrowhead,
  circumscribe,
  drawBorderThenFill,
  drawOn,
  passingFlash,
  strokeSequence,
  tracedPath,
  tracerDot,
} from "../render/strokeVerbs";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const INK = "#eef5ef";
const ACCENT = "#5cc8ae";
const GOLD = "#e8c14a";
const BLUE = "#6db0e8";

// a smooth wave for the curve demos (Catmull-Rom over these control points)
const WAVE: Pt[] = smoothPath(
  [
    [70, 250],
    [180, 150],
    [300, 260],
    [420, 150],
    [540, 250],
  ],
  { curve: "catmullRom", alpha: 0.5, samples: 24 },
);

// a hexagon for draw-border-then-fill
const HEX: Pt[] = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
  return [720 + Math.cos(a) * 60, 150 + Math.sin(a) * 60] as Pt;
});

// short rays for the staggered sequence
const RAYS_CX = 150;
const RAYS_CY = 335;
const RAYS: Pt[][] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2;
  return [
    [RAYS_CX, RAYS_CY],
    [RAYS_CX + Math.cos(a) * 60, RAYS_CY + Math.sin(a) * 60],
  ] as Pt[];
});

export const strokesDemoSlide: CanvasSlideDefinition = {
  duration: 22,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the draw-on stroke system — every mark is a self-drawing path." },
    { at: 3, text: "smoothed curves (Catmull-Rom) and variable-width brush strokes draw themselves on." },
    { at: 7, text: "a passing flash sweeps a highlight along any path." },
    { at: 10, text: "draw-border-then-fill: outline first, then the fill fades in." },
    { at: 13, text: "a traced path follows a moving point, leaving a dissipating tail." },
    { at: 16, text: "circumscribe to 'circle the answer', and cascade many strokes with a stagger." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const theme = frame?.theme;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#17222c");
    g.addColorStop(1, "#111a22");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // 1 — draw-on straight arrow with arrowhead + tracer dot
    const arrow: Pt[] = [
      [70, 90],
      [520, 90],
    ];
    const ap = phase(t, 0.5, 3.5);
    if (ap > 0) {
      drawOn(mid, arrow, ap, { style: { color: ACCENT, width: 4 }, theme });
      tracerDot(fg, arrow, ap, { r: 5, color: INK, alpha: 1 - phase(t, 3.2, 3.6) });
      const tip = pointAt(arrow, ap);
      arrowhead(fg, tip, { size: 14, color: ACCENT, alpha: clamp01((ap - 0.85) / 0.15) });
    }
    fadeText(ann, "drawOn + arrowhead", 70, 70, phase(t, 0.5, 1.5), "600 13px -apple-system, sans-serif", INK, "start");

    // 2 — smoothed curve draws on, then a variable-width brush stroke traces over it
    const cp = phase(t, 3, 6);
    if (cp > 0) drawOn(mid, WAVE, cp, { style: { color: BLUE, width: 3 }, theme });
    const bp = phase(t, 5, 8);
    if (bp > 0) {
      drawOn(fg, WAVE, bp, {
        style: { color: GOLD, width: 12, taperStart: 60, taperEnd: 60 }, // variable-width brush
        theme,
      });
    }
    fadeText(ann, "Catmull-Rom curve + tapered brush", 70, 285, phase(t, 3, 4), "600 13px -apple-system, sans-serif", ACCENT, "start");

    // 3 — passing flash comet along the wave
    const fp = phase(t, 7, 10.5);
    if (fp > 0 && fp < 1) passingFlash(fg, WAVE, fp, { width: 0.18, thinning: true, glow: true, style: { color: "#ffe89a", width: 6 } });

    // 4 — draw-border-then-fill hexagon
    const hp = phase(t, 10, 13.5);
    if (hp > 0) {
      drawBorderThenFill(mid, HEX, hp, {
        style: { color: GOLD, width: 3 },
        fill: "rgba(232,193,74,0.25)",
        split: 0.6,
        theme,
      });
    }
    fadeText(ann, "drawBorderThenFill", 720, 240, phase(t, 10, 11), "600 13px -apple-system, sans-serif", GOLD);

    // 5 — traced path: a dot moving on a Lissajous curve, dissipating tail
    const trOn = phase(t, 13, 13.4) * (1 - phase(t, 19, 20));
    if (trOn > 0) {
      const mover = (tt: number): Pt => [820 + Math.cos(tt * 1.6) * 70, 340 + Math.sin(tt * 2.2) * 55];
      tracedPath(fg, mover, t, { dissipate: 2.2, step: 0.03, style: { color: ACCENT, width: 3, alpha: trOn } });
      const head = mover(t);
      tracerDot(fg, [head, head], 1, { r: 5, color: INK, alpha: trOn });
    }
    fadeText(ann, "tracedPath (dissipating)", 820, 410, phase(t, 13, 14) * (1 - phase(t, 19, 20)), "600 13px -apple-system, sans-serif", ACCENT);

    // 6 — staggered ray sequence + circumscribe on a label
    strokeSequence(mid, RAYS, t - 16, { start: 0, step: 0.25, dur: 1.2, style: { color: ACCENT, width: 3 }, theme });
    fadeText(ann, "strokeSequence (staggered)", RAYS_CX, RAYS_CY + 78, phase(t, 16.5, 17.5), "600 13px -apple-system, sans-serif", ACCENT);
    if (t > 16) {
      const label = "seekable";
      const lx = 300;
      const ly = 360;
      fadeText(fg, label, lx, ly + 5, phase(t, 16.5, 17.5), "700 18px -apple-system, sans-serif", INK);
      circumscribe(ann, { x: lx - 44, y: ly - 12, w: 88, h: 26 }, phase(t, 17.5, 20.5), {
        shape: "ellipse",
        style: { color: GOLD, width: 2.5 },
      });
    }

    // title
    fadeText(ann, "draw-on stroke system", 460, 40, phase(t, 0.3, 1.5), "700 18px -apple-system, sans-serif", INK);
  },
};
