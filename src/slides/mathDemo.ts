/**
 * Math demo (Step 17). Canvas-native math typesetting — fractions, roots, super/subscripts, Greek and
 * operators — with equations fading in and one writing itself on left-to-right.
 */
import { clamp01, fadeText, phase } from "./anim";
import { drawMath } from "../render/mathtext";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

export const mathDemoSlide: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "math typesetting on the canvas — fractions, roots, sub/superscripts, Greek, operators." },
    { at: 3, text: "the quadratic formula writes itself on..." },
    { at: 7, text: "chemistry, physics, sums and integrals — all deterministic and seekable." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141c24");
    g.addColorStop(1, "#0f151b");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // quadratic formula — writes on
    drawMath(mid, "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", 460, 120, { size: 40, color: "#eef5ef", align: "center", p: phase(t, 3, 6.5) });

    // a grid of equations fading in
    const eqs: [string, number, string][] = [
      ["E = mc^2", 7, "#5cc8ae"],
      ["6CO_2 + 6H_2O \\to C_6H_{12}O_6 + 6O_2", 8.2, "#e8c14a"],
      ["\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}", 10, "#6db0e8"],
      ["\\int_0^1 x^2 dx = \\frac{1}{3}", 11.5, "#a06be8"],
      ["a^2 + b^2 = c^2", 13, "#e2726b"],
    ];
    const ys = [210, 260, 315, 370, 210];
    const xs = [230, 460, 250, 250, 690];
    eqs.forEach(([src, at, color], i) => {
      const a = phase(t, at, at + 1);
      if (a <= 0) return;
      drawMath(i === 1 ? mid : mid, src, xs[i], ys[i], { size: i === 1 ? 22 : 24, color, align: "center", alpha: a });
    });

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("KaTeX-style math", 460, 44);
    ann.restore();
  },
};
