/**
 * calculusArea — "The Area Under a Curve: calculus from rectangles to ∫".
 *
 * A six-scene lesson film on the BLUEPRINT theme (technical grid). Every scene is a pure
 * function of its LOCAL time t (0..duration); randomness is seeded once via prng, never a clock.
 * Layer routing: grid/backdrop → bg, curve + rectangles + fills → mid, glows/spotlight → fg,
 * math/labels/counters/callouts → annotation, filmic pass → fx (via frame.grade()).
 *
 * Reused engine modules: charts (plotFunction/barChart/lineChart/axes/makePlot), mathtext (drawMath),
 * sequence (buildSteps/stagger/predictReveal/emphasis), type-motion (counterValue/drawCounter/
 * drawWordReveal), morph (drawMorph for bar-width thinning), reveal (wipe/dissolve/spotlight),
 * callout, focus (flash/sparkFlash), strokes (Pt).
 */
import { clamp01, easeInOutCubic, easeOutCubic, fadeText, lerp, phase, prng } from "../slides/anim";
import { axes, lineChart, makePlot, plotFunction, type Plot } from "../render/charts";
import { drawMath } from "../render/mathtext";
import { buildSteps, emphasis, predictReveal, stepProgress } from "../render/sequence";
import { counterValue, drawCounter, drawWordReveal } from "../render/type-motion";
import { drawMorph } from "../render/morph";
import { dissolve, spotlight, wipe } from "../render/reveal";
import { callout } from "../render/callout";
import { flash, sparkFlash } from "../render/focus";
import type { Pt } from "../render/strokes";
import { composeSlides } from "../slides/compose";
import { BLUEPRINT } from "../render/theme";
import type { CanvasSlideDefinition } from "../slides/types";

const W = 920;
const H = 430;

// The curve of the whole lesson: f(x) = x², integrated on [0, 2] → area = 8/3 ≈ 2.667.
const F = (x: number) => x * x;
const A0 = 0;
const B0 = 2;
const EXACT = 8 / 3; // ∫₀² x² dx

// Shared plot geometry — the same coordinate frame across scenes for visual continuity.
const PLOT_AREA = { x: 150, y: 70, w: 470, h: 300 };
const XDOM: [number, number] = [0, 2];
const YDOM: [number, number] = [0, 4.2];
const PLOT: Plot = makePlot(PLOT_AREA, XDOM, YDOM);

const INK = BLUEPRINT.palette.ink; // "#dbe9ff"
const ACCENT = BLUEPRINT.palette.accent; // "#7fd0ff"
const MUTED = BLUEPRINT.palette.muted; // "#7f9fce"
const SURFACE = BLUEPRINT.palette.surface; // "#123a6b"
const FILL = "rgba(127,208,255,0.16)"; // translucent area fill

const rand = prng(4242);
// Seeded dust motes for the recap bloom (built ONCE, never per-frame).
const MOTES = Array.from({ length: 30 }, () => ({
  x: rand(),
  y: rand(),
  off: rand(),
  s: 0.03 + rand() * 0.05,
  r: 1.5 + rand() * 2.5,
}));

/** Blueprint backdrop: base wash + fine + major grid, painted on the bg layer (self-contained). */
function drawBlueprintGrid(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = BLUEPRINT.palette.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(150,200,255,0.14)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150,200,255,0.24)";
  for (let x = 0; x <= W; x += 140) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 140) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Filled Riemann region under the curve on [a,b] as a closed polygon (view-space points). */
function areaPolygon(plot: Plot, a: number, b: number, samples = 60): Pt[] {
  const pts: Pt[] = [];
  const base = plot.sy(0);
  pts.push([plot.sx(a), base]);
  for (let i = 0; i <= samples; i++) {
    const x = lerp(a, b, i / samples);
    pts.push([plot.sx(x), plot.sy(F(x))]);
  }
  pts.push([plot.sx(b), base]);
  return pts;
}

/** Draw n midpoint-ish Riemann rectangles (left-endpoint heights) on [a,b], each rect faded by rp[i]. */
function riemannRects(
  ctx: CanvasRenderingContext2D,
  plot: Plot,
  a: number,
  b: number,
  n: number,
  heights: (x: number) => number,
  opts: { rp?: number[]; fill?: string; stroke?: string; alpha?: number },
) {
  const base = plot.sy(0);
  const dx = (b - a) / n;
  ctx.save();
  ctx.globalAlpha *= clamp01(opts.alpha ?? 1);
  for (let i = 0; i < n; i++) {
    const rp = opts.rp ? clamp01(opts.rp[i] ?? 1) : 1;
    if (rp <= 0) continue;
    const xL = a + i * dx;
    const h = heights(xL + dx / 2); // sample at the interval midpoint (midpoint rule — visually centered)
    const yTop = plot.sy(h);
    const px = plot.sx(xL);
    const pw = plot.sx(xL + dx) - px;
    // grow from the baseline as rp 0→1
    const grown = lerp(base, yTop, easeOutCubic(rp));
    ctx.fillStyle = opts.fill ?? FILL;
    ctx.globalAlpha = (opts.alpha ?? 1) * (0.55 + 0.45 * rp);
    ctx.beginPath();
    ctx.rect(px + 0.5, grown, pw - 1, base - grown);
    ctx.fill();
    ctx.globalAlpha = (opts.alpha ?? 1) * rp;
    ctx.strokeStyle = opts.stroke ?? ACCENT;
    ctx.lineWidth = n > 12 ? 0.6 : 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Riemann sum (midpoint) for n rectangles — the number the counter chases. */
function riemannSum(a: number, b: number, n: number): number {
  const dx = (b - a) / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += F(a + i * dx + dx / 2) * dx;
  return s;
}

/** Scene scaffold: bg grid + axes + the f(x)=x² curve drawn on to progress `curveP`. */
function drawStage(bg: CanvasRenderingContext2D, mid: CanvasRenderingContext2D, ann: CanvasRenderingContext2D, curveP: number, axesP: number) {
  drawBlueprintGrid(bg);
  axes(ann, PLOT, {
    grid: false,
    color: MUTED,
    ink: MUTED,
    p: axesP,
    xTicks: [0, 0.5, 1, 1.5, 2],
    yTicks: [0, 1, 2, 3, 4],
    fontPx: 10,
  });
  if (curveP > 0) {
    plotFunction(mid, PLOT, F, curveP, { color: ACCENT, width: 2.6, samples: 120 });
    // f(x)=x² tag riding the drawn tip
    if (curveP > 0.55) {
      const tipX = lerp(A0, B0, clamp01((curveP - 0.55) / 0.45));
      fadeText(ann, "f(x) = x²", PLOT.sx(tipX) + 34, PLOT.sy(F(tipX)) - 6, clamp01((curveP - 0.55) / 0.3), "italic 15px Georgia, serif", ACCENT, "left");
    }
  }
}

// ── Scene 1 — The problem ───────────────────────────────────────────────────────────────────────
const s1: CanvasSlideDefinition = {
  duration: 13,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0.5, text: "here is a curve: f of x equals x squared." },
    { at: 4.5, text: "how much area sits underneath it, between x = 0 and x = 2?" },
    { at: 8.5, text: "for a rectangle or a triangle there's a formula. for a curve — not yet." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const axesP = phase(t, 0.3, 1.6);
    const curveP = phase(t, 1.4, 4.2);
    drawStage(bg, mid, ann, curveP, axesP);

    // title
    fadeText(ann, "The Area Under a Curve", 150, 40, phase(t, 0.2, 1.4), "700 22px -apple-system, sans-serif", INK, "left");

    // the region wipes in beneath the curve (left→right) once the curve is drawn
    const fillP = phase(t, 4.4, 7);
    if (fillP > 0) {
      wipe(
        mid,
        fillP,
        W,
        H,
        (c) => {
          const poly = areaPolygon(PLOT, A0, B0);
          c.beginPath();
          c.moveTo(poly[0][0], poly[0][1]);
          for (const p of poly) c.lineTo(p[0], p[1]);
          c.closePath();
          c.fillStyle = FILL;
          c.fill();
        },
        { dir: "left", feather: 8 },
      );
      // "A = ?" hovering over the filled region
      fadeText(ann, "A = ?", PLOT.sx(1.15), PLOT.sy(0.9), fillP, "italic 26px Georgia, serif", INK, "center");
    }

    // a soft glow pulse under the region to draw the eye (fg)
    const glowP = emphasis(t, 6.2, 1.4);
    if (glowP > 0) flash(fg, PLOT.sx(1.1), PLOT.sy(0.6), 150, 1 - glowP, { color: "rgba(127,208,255,0.5)" });

    // callout: "No simple formula… yet"
    if (frame) {
      const cp = phase(t, 8.6, 10);
      callout(frame, {
        target: [PLOT.sx(1.5), PLOT.sy(F(1.5)) + 30],
        title: "No simple formula",
        text: "…yet.",
        side: "ne",
        offset: 46,
        container: "rect",
        route: "elbow",
        targetMarker: "crosshair",
        color: ACCENT,
        accent: ACCENT,
        leaderP: cp,
        labelP: phase(t, 9.2, 10.4),
        maxWidth: 150,
      });
    }

    frame?.grade({ vignette: 0.3, grain: 0.03 });
  },
};

// ── Scene 2 — Approximate with rectangles (build-steps showpiece) ────────────────────────────────
const s2: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0.5, text: "here's the trick: cover the region with rectangles we CAN measure." },
    { at: 4, text: "four of them, each of width delta-x, rising one at a time." },
    { at: 8, text: "some overshoot the curve, some fall short — but add them up and we get an estimate." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    drawStage(bg, mid, ann, 1, 1);
    fadeText(ann, "Approximate with rectangles", 150, 40, phase(t, 0.2, 1.2), "700 20px -apple-system, sans-serif", INK, "left");

    // four rectangles rise ONE AT A TIME (staggered build-steps — engagement grammar)
    const N = 4;
    const rp = buildSteps(t, N, { start: 1.6, step: 0.75, dur: 0.7 });
    riemannRects(mid, PLOT, A0, B0, N, F, { rp, fill: FILL, stroke: ACCENT });

    // Δx width label + bracket under the first fully-risen rectangle
    const dxIn = phase(t, 2.6, 3.4);
    if (dxIn > 0) {
      const base = PLOT.sy(0);
      const x0 = PLOT.sx(0);
      const x1 = PLOT.sx((B0 - A0) / N);
      ann.save();
      ann.globalAlpha *= dxIn;
      ann.strokeStyle = MUTED;
      ann.lineWidth = 1.4;
      ann.beginPath();
      ann.moveTo(x0, base + 22);
      ann.lineTo(x0, base + 30);
      ann.lineTo(x1, base + 30);
      ann.lineTo(x1, base + 22);
      ann.stroke();
      ann.restore();
      fadeText(ann, "Δx", (x0 + x1) / 2, base + 46, dxIn, "italic 14px Georgia, serif", INK, "center");
    }

    // counter: "n = 4, area ≈ …" converging to the 4-rect sum as the bars land
    const cIn = phase(t, 2, 3);
    if (cIn > 0) {
      const target = riemannSum(A0, B0, N);
      const val = counterValue(t, 2.2, 3.8, 0, target);
      const bx = 700;
      fadeText(ann, "n = 4", bx, 130, cIn, "700 20px ui-monospace, monospace", ACCENT, "center");
      fadeText(ann, "area ≈", bx, 168, cIn, "15px -apple-system, sans-serif", MUTED, "center");
      drawCounter(ann, bx, 202, val, { font: "700 30px ui-monospace, monospace", color: INK, align: "center", alpha: cIn }, { decimals: 3 });
      fadeText(ann, `exact = ${EXACT.toFixed(3)}`, bx, 236, phase(t, 6, 7), "13px ui-monospace, monospace", MUTED, "center");
    }

    // over/under-shoot callout with a bracket subject, once all four are up
    if (frame) {
      callout(frame, {
        target: [PLOT.sx(1.75), PLOT.sy(F(1.75)) - 8],
        text: "over- and under-shoot",
        side: "n",
        offset: 30,
        container: "pill",
        route: "straight",
        subject: "bracket",
        subjectR: 24,
        color: MUTED,
        accent: ACCENT,
        leaderP: phase(t, 8.2, 9.2),
        labelP: phase(t, 8.6, 9.6),
        maxWidth: 130,
      });
    }

    frame?.grade({ vignette: 0.3, grain: 0.03 });
  },
};

// ── Scene 3 — More rectangles (n: 4 → 8 → 16 → 32) ───────────────────────────────────────────────
const NS = [4, 8, 16, 32];
const s3: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0.5, text: "now make the rectangles thinner. four becomes eight, sixteen, thirty-two." },
    { at: 6, text: "watch the error slivers between the bars and the curve shrink away." },
    { at: 10, text: "the estimate is converging on a single number. so… as n goes to infinity?" },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    drawStage(bg, mid, ann, 1, 1);
    fadeText(ann, "More rectangles, thinner slices", 150, 40, phase(t, 0.2, 1.2), "700 20px -apple-system, sans-serif", INK, "left");

    // Step through the doubling schedule. Each step lasts STEP seconds; bars morph thinner by
    // rendering the *target* count with an eased transition of widths via drawMorph per bar-pair.
    const STEP = 2.6;
    const START = 1.2;
    // current index & blend to next
    const raw = (t - START) / STEP;
    const idx = Math.max(0, Math.min(NS.length - 1, Math.floor(raw)));
    const blend = clamp01(raw - idx);
    const nNow = NS[idx];
    const nNext = NS[Math.min(NS.length - 1, idx + 1)];

    // Morph bar widths: draw nNext rectangles, but each grouped under its parent nNow-rect so the
    // split animates. Simpler + robust: crossfade the two rectangle sets by blend.
    const base = PLOT.sy(0);
    const drawSet = (n: number, a: number) => {
      if (a <= 0) return;
      const rp = Array.from({ length: n }, () => 1);
      riemannRects(mid, PLOT, A0, B0, n, F, { rp, fill: FILL, stroke: ACCENT, alpha: a });
    };
    if (t < START) {
      drawSet(NS[0], phase(t, 0.4, 1.2));
    } else if (idx === NS.length - 1) {
      drawSet(nNow, 1);
    } else {
      // one bar-edge morph so the split reads as "thinning", plus a crossfade of the fills
      drawSet(nNow, 1 - easeInOutCubic(blend));
      drawSet(nNext, easeInOutCubic(blend));
      // a representative morphing bar outline (leftmost group) using drawMorph for the width change
      const bw = (PLOT.w) / nNow;
      const bwN = (PLOT.w) / nNext;
      const parent: Pt[] = [
        [PLOT.x, base], [PLOT.x, PLOT.sy(F(0.5 * (B0 / nNow)))], [PLOT.x + bw, PLOT.sy(F(0.5 * (B0 / nNow)))], [PLOT.x + bw, base],
      ];
      const child: Pt[] = [
        [PLOT.x, base], [PLOT.x, PLOT.sy(F(0.5 * (B0 / nNext)))], [PLOT.x + bwN, PLOT.sy(F(0.5 * (B0 / nNext)))], [PLOT.x + bwN, base],
      ];
      drawMorph(mid, parent, child, easeInOutCubic(blend), { stroke: ACCENT, width: 1.4, closed: true, align: false });
    }

    // error slivers spotlighted then dissolved: highlight the gap between bars and curve near the
    // end of each step, then let them dissolve away as the next, finer set arrives.
    if (frame && idx < NS.length - 1) {
      const slP = clamp01((blend - 0.15) / 0.5);
      if (slP > 0 && slP < 1) {
        // spotlight the sliver band on the fg layer
        const cx = PLOT.sx(1.5);
        const cy = PLOT.sy(F(1.5));
        spotlight(fg, cx, cy, 70, (c) => {
          // the thin error region for the CURRENT (coarser) set
          c.save();
          c.globalAlpha = 0.9 * (1 - slP);
          c.fillStyle = BLUEPRINT.palette.danger;
          const nn = nNow;
          const dx = (B0 - A0) / nn;
          for (let i = 0; i < nn; i++) {
            const xL = A0 + i * dx;
            const hMid = F(xL + dx / 2);
            const yBar = PLOT.sy(hMid);
            // area between flat bar top and the curve across this interval
            c.beginPath();
            c.moveTo(PLOT.sx(xL), yBar);
            for (let s = 0; s <= 8; s++) {
              const xx = lerp(xL, xL + dx, s / 8);
              c.lineTo(PLOT.sx(xx), PLOT.sy(F(xx)));
            }
            c.lineTo(PLOT.sx(xL + dx), yBar);
            c.closePath();
            c.fill();
          }
          c.restore();
        }, { feather: 34, dim: { color: "rgba(6,20,42,0.55)", strength: 0.4 } });
      }
    }

    // counter converging toward the exact value
    const cIn = phase(t, 0.6, 1.5);
    if (cIn > 0) {
      const shown = nNext === nNow ? nNow : Math.round(lerp(nNow, nNext, blend));
      const sumNow = riemannSum(A0, B0, nNow);
      const sumNext = riemannSum(A0, B0, nNext);
      const val = lerp(sumNow, sumNext, easeInOutCubic(blend));
      const bx = 700;
      fadeText(ann, `n = ${shown}`, bx, 130, cIn, "700 20px ui-monospace, monospace", ACCENT, "center");
      fadeText(ann, "area ≈", bx, 168, cIn, "15px -apple-system, sans-serif", MUTED, "center");
      drawCounter(ann, bx, 202, val, { font: "700 30px ui-monospace, monospace", color: INK, align: "center", alpha: cIn }, { decimals: 4 });
      fadeText(ann, `exact = ${EXACT.toFixed(4)}`, bx, 236, cIn, "13px ui-monospace, monospace", MUTED, "center");
    }

    // predict-reveal: "As n → ∞?"
    const pr = predictReveal(t, { poseAt: 10.5, revealAt: 13, dur: 0.7 });
    if (pr.question > 0) {
      drawMath(ann, "n \\to \\infty \\; ?", 700, 300, { size: 30, color: ACCENT, align: "center", alpha: pr.question });
    }
    if (pr.answer > 0) {
      fadeText(ann, "the slivers vanish", 700, 336, pr.answer, "italic 14px Georgia, serif", INK, "center");
    }

    frame?.grade({ vignette: 0.3, grain: 0.03 });
  },
};

// ── Scene 4 — The limit / the integral ───────────────────────────────────────────────────────────
const s4: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0.5, text: "in the limit, the sum of infinitely many, infinitely thin slices IS the area." },
    { at: 5, text: "we write that limit with a new symbol: the integral sign." },
    { at: 9, text: "the rectangles melt into one smooth region, and the sum lands on eight over three." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    drawStage(bg, mid, ann, 1, 1);
    fadeText(ann, "The limit", 150, 40, phase(t, 0.2, 1.2), "700 20px -apple-system, sans-serif", INK, "left");

    // Many fine rectangles dissolve into the smooth filled area.
    const melt = phase(t, 2.2, 5.5);
    // fine bars fade out
    if (melt < 1) {
      const n = 48;
      const rp = Array.from({ length: n }, () => 1);
      riemannRects(mid, PLOT, A0, B0, n, F, { rp, fill: FILL, stroke: ACCENT, alpha: 1 - melt });
    }
    // smooth area dissolves in
    if (melt > 0) {
      dissolve(
        mid,
        melt,
        W,
        H,
        (c) => {
          const poly = areaPolygon(PLOT, A0, B0);
          c.beginPath();
          c.moveTo(poly[0][0], poly[0][1]);
          for (const p of poly) c.lineTo(p[0], p[1]);
          c.closePath();
          c.fillStyle = FILL;
          c.fill();
        },
        { seed: 7, cell: 10 },
      );
    }

    // the definition writes on (annotation): Area = lim Σ f(xᵢ)Δx = ∫ f(x) dx
    const defP = phase(t, 5.2, 8.4);
    drawMath(
      ann,
      "Area = \\lim_{n \\to \\infty} \\sum_{i=1}^{n} f(x_i)\\,\\Delta x = \\int_{a}^{b} f(x)\\,dx",
      W / 2,
      404,
      { size: 22, color: INK, align: "center", p: defP },
    );

    // the ∫ glows as it takes over from Σ (fg bloom via lighter flash on the integral glyph area)
    const glowP = phase(t, 7.6, 9);
    if (glowP > 0) {
      // approximate position of the ∫ in the centered expression — pulse a glow there
      const gx = W / 2 + 150;
      const gy = 404;
      flash(fg, gx, gy, 46, 1 - emphasis(t, 8.6, 1.2), { color: "rgba(127,208,255,0.7)" });
    }

    // counter lands on the exact value 8/3
    const cIn = phase(t, 8.6, 9.4);
    if (cIn > 0) {
      const val = counterValue(t, 8.8, 2.4, 2.55, EXACT);
      const bx = 705;
      fadeText(ann, "= 8 / 3", bx, 120, cIn, "700 22px ui-monospace, monospace", ACCENT, "center");
      drawCounter(ann, bx, 160, val, { font: "700 34px ui-monospace, monospace", color: INK, align: "center", alpha: cIn }, { decimals: 4 });
    }

    frame?.grade({ vignette: 0.3, grain: 0.03 });
  },
};

// ── Scene 5 — Fundamental theorem ────────────────────────────────────────────────────────────────
// A second, small accumulation plot: F(x) = x³/3, the antiderivative. Its value at x is the area so far.
const FCAP = (x: number) => (x * x * x) / 3;
const PLOT2_AREA = { x: 610, y: 250, w: 250, h: 130 };
const PLOT2: Plot = makePlot(PLOT2_AREA, [0, 2], [0, FCAP(2) * 1.1]);
const ACCUM: [number, number][] = Array.from({ length: 41 }, (_, i) => {
  const x = (i / 40) * 2;
  return [x, FCAP(x)] as [number, number];
});
const s5: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0.5, text: "and here's the payoff — the fundamental theorem of calculus." },
    { at: 4, text: "the area is just F of b minus F of a, where F is any antiderivative of f." },
    { at: 8, text: "as the sweep moves right, the area filled equals the height of the accumulation curve F." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // Left plot smaller to make room for the accumulation plot bottom-right.
    drawBlueprintGrid(bg);
    fadeText(ann, "The Fundamental Theorem", 150, 40, phase(t, 0.2, 1.2), "700 20px -apple-system, sans-serif", INK, "left");

    // main curve + axes (reuse the shared PLOT)
    axes(ann, PLOT, { grid: false, color: MUTED, ink: MUTED, p: 1, xTicks: [0, 1, 2], yTicks: [0, 2, 4], fontPx: 10 });
    plotFunction(mid, PLOT, F, 1, { color: ACCENT, width: 2.4, samples: 120 });

    // sweeping playhead left→right; area fills up to the sweep x
    const sweepP = phase(t, 2.2, 9.5);
    const xSweep = lerp(A0, B0, sweepP);
    if (sweepP > 0) {
      // filled area up to the sweep
      const poly = areaPolygon(PLOT, A0, xSweep);
      mid.save();
      mid.beginPath();
      mid.moveTo(poly[0][0], poly[0][1]);
      for (const p of poly) mid.lineTo(p[0], p[1]);
      mid.closePath();
      mid.fillStyle = FILL;
      mid.fill();
      mid.restore();
      // the sweeping marker line (fg)
      const sx = PLOT.sx(xSweep);
      fg.save();
      fg.strokeStyle = ACCENT;
      fg.lineWidth = 2;
      fg.setLineDash([5, 4]);
      fg.beginPath();
      fg.moveTo(sx, PLOT.sy(0));
      fg.lineTo(sx, PLOT.sy(F(xSweep)) - 4);
      fg.stroke();
      fg.restore();
      flash(fg, sx, PLOT.sy(F(xSweep)), 22, 0.4, { color: "rgba(127,208,255,0.7)" });
    }

    // second plot: F(x) accumulation, drawing on in lockstep with the sweep + area fill
    axes(ann, PLOT2, { grid: false, color: MUTED, ink: MUTED, p: phase(t, 1.6, 2.6), xTicks: [0, 1, 2], yTicks: [0, 2], fontPx: 9 });
    fadeText(ann, "F(x) = area so far", PLOT2.x, PLOT2.y - 10, phase(t, 1.8, 2.8), "italic 12px Georgia, serif", MUTED, "left");
    lineChart(mid, PLOT2, ACCUM, sweepP, { color: INK, width: 2, area: true, areaColor: "rgba(219,233,255,0.12)" });
    // dot riding the accumulation curve at the sweep x
    if (sweepP > 0) {
      const dx2 = PLOT2.sx(xSweep);
      const dy2 = PLOT2.sy(FCAP(xSweep));
      fg.save();
      fg.fillStyle = ACCENT;
      fg.beginPath();
      fg.arc(dx2, dy2, 4, 0, 7);
      fg.fill();
      fg.restore();
    }

    // the theorem in math, writing on
    drawMath(
      ann,
      "\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)",
      340,
      404,
      { size: 22, color: INK, align: "center", p: phase(t, 3.4, 6.4) },
    );

    // elbow callout tying the two graphs
    if (frame) {
      callout(frame, {
        target: [PLOT2.sx(1.4), PLOT2.sy(FCAP(1.4))],
        text: "height here = area there",
        side: "n",
        offset: 26,
        container: "rect",
        route: "elbow",
        targetMarker: "dot",
        color: ACCENT,
        accent: ACCENT,
        leaderP: phase(t, 9.6, 10.6),
        labelP: phase(t, 10, 11),
        maxWidth: 140,
      });
    }

    frame?.grade({ vignette: 0.3, grain: 0.03 });
  },
};

// ── Scene 6 — Recap ──────────────────────────────────────────────────────────────────────────────
const s6: CanvasSlideDefinition = {
  duration: 13,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0.5, text: "so that's the whole idea of the integral." },
    { at: 3.5, text: "summing infinitely many, infinitely thin slices." },
    { at: 8, text: "rectangles, refined without end, become the exact area under the curve." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    drawBlueprintGrid(bg);

    // the ∫ looms large in the center and glows
    const bigP = phase(t, 0.6, 2.4);
    const cx = W / 2;
    const cy = 180;
    if (bigP > 0) {
      // glow bloom behind the symbol (fg, additive)
      const pulse = 0.6 + 0.4 * Math.sin(t * 1.4);
      flash(fg, cx, cy, 130, 1 - 0.55 * pulse, { color: "rgba(127,208,255,0.5)" });
      // drifting dust motes catching the light (seeded, pure)
      fg.save();
      fg.globalCompositeOperation = "lighter";
      for (const m of MOTES) {
        const c = ((t * m.s + m.off) % 1);
        const mx = m.x * W;
        const my = m.y * H - c * 40 + 20;
        const a = 0.18 * Math.sin(c * Math.PI) * bigP;
        if (a <= 0) continue;
        fg.globalAlpha = a;
        fg.fillStyle = ACCENT;
        fg.beginPath();
        fg.arc(mx, my, m.r, 0, 7);
        fg.fill();
      }
      fg.restore();

      // the big integral glyph (mid so the theme leaves it crisp; scaled with a gentle breathe)
      const scale = 1 + 0.03 * Math.sin(t * 1.1);
      mid.save();
      mid.globalAlpha = bigP;
      mid.translate(cx, cy);
      mid.scale(scale, scale);
      mid.translate(-cx, -cy);
      drawMath(mid, "\\int", cx, cy, { size: 150, color: ACCENT, align: "center", alpha: 1 });
      mid.restore();
    }

    // the bounds appear beside it
    const boundsP = phase(t, 2.4, 3.4);
    if (boundsP > 0) {
      drawMath(ann, "\\int_{0}^{2} x^2\\,dx = \\frac{8}{3}", cx, cy + 8, { size: 40, color: INK, align: "center", alpha: boundsP });
    }

    // closing line reveals word by word
    drawWordReveal(
      ann,
      "Summing infinitely many, infinitely thin slices.",
      190,
      330,
      t,
      { font: "600 22px -apple-system, sans-serif", color: INK, align: "left" },
      { start: 3.4, step: 0.28, dur: 0.5, mode: "rise" },
    );
    drawWordReveal(
      ann,
      "That is the integral.",
      190,
      366,
      t,
      { font: "italic 18px Georgia, serif", color: ACCENT, align: "left" },
      { start: 6.4, step: 0.24, dur: 0.5, mode: "fade" },
    );

    // final spark punctuation on the symbol
    const sp = phase(t, 8.2, 9);
    if (sp > 0 && sp < 1) sparkFlash(fg, cx, cy, sp, { color: ACCENT, count: 12, length: 40 });

    frame?.grade({ vignette: 0.34, grain: 0.03 });
  },
};

// ── Compose the film ─────────────────────────────────────────────────────────────────────────────
export const calculusLesson = composeSlides([s1, s2, s3, s4, s5, s6], {
  theme: BLUEPRINT,
  filmGrade: true,
  transition: "zoom-through",
});
