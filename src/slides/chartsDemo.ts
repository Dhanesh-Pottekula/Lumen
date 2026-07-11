/**
 * Charts demo (Step 12). Four data-viz primitives, staged: an animated function plot with axes/grid,
 * a bar chart (staggered growth), a line+area chart (draw-on), and a donut (sweeping wedges).
 */
import { clamp01, fadeText, phase } from "./anim";
import { axes, barChart, type Datum, lineChart, makePlot, pie, plotFunction } from "../render/charts";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const BARS: Datum[] = [
  { label: "1920", value: 12 },
  { label: "1935", value: 34 },
  { label: "1950", value: 58 },
  { label: "1970", value: 96 },
  { label: "1990", value: 140 },
];

const LINE: [number, number][] = Array.from({ length: 12 }, (_, i) => [i, 20 + 60 * Math.sin(i / 3) + i * 4]);

const SHARE: Datum[] = [
  { label: "cotton", value: 45 },
  { label: "pumps", value: 30 },
  { label: "motors", value: 15 },
  { label: "other", value: 10 },
];

export const chartsDemoSlide: CanvasSlideDefinition = {
  duration: 18,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "data-viz primitives — axes, grids, and a function plotting itself." },
    { at: 4, text: "bar charts grow in a staggered cascade..." },
    { at: 8, text: "line and area charts draw on..." },
    { at: 12, text: "and pie/donut wedges sweep in. all bound to data, all seekable." },
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

    // TL — function plot
    const p1 = makePlot({ x: 90, y: 78, w: 300, h: 120 }, [0, 6.283], [-1.2, 1.2]);
    axes(mid, p1, { grid: true, p: phase(t, 0.5, 2), yTicks: [-1, 0, 1], xTicks: [0, 3, 6] });
    plotFunction(mid, p1, (x) => Math.sin(x), phase(t, 1.5, 4), { color: "#5cc8ae" });
    fadeText(ann, "y = sin(x)", 240, 66, phase(t, 0.5, 1.5), "600 12px -apple-system, sans-serif", "#8fd0b4");

    // TR — bar chart
    const p2 = makePlot({ x: 540, y: 78, w: 300, h: 120 }, [0, 1], [0, 150]);
    axes(mid, p2, { p: phase(t, 4, 5), yTicks: [0, 50, 100, 150] });
    barChart(mid, p2, BARS, { t, start: 4.5, step: 0.18, color: "#e8a13c", showValues: true });
    fadeText(ann, "spindles (000s)", 690, 66, phase(t, 4, 5), "600 12px -apple-system, sans-serif", "#e8c14a");

    // BL — line + area
    const p3 = makePlot({ x: 90, y: 250, w: 300, h: 120 }, [0, 11], [0, 130]);
    axes(mid, p3, { grid: true, p: phase(t, 8, 9), yTicks: [0, 60, 120] });
    lineChart(mid, p3, LINE, phase(t, 8.5, 11.5), { color: "#6db0e8", area: true, markers: true });
    fadeText(ann, "output over time", 240, 238, phase(t, 8, 9), "600 12px -apple-system, sans-serif", "#8fbfe8");

    // BR — donut
    pie(mid, 690, 310, 62, SHARE, phase(t, 12, 15), { donut: 0.55, labels: true });
    fadeText(ann, "industry mix", 690, 238, phase(t, 12, 13), "600 12px -apple-system, sans-serif", "#aebbc6");
    // legend
    if (t > 13) {
      const pal = ["#5cc8ae", "#e8a13c", "#6db0e8", "#c94b6b"];
      SHARE.forEach((d, i) => {
        const ly = 288 + i * 18;
        ann.save();
        ann.globalAlpha = clamp01(phase(t, 13, 14));
        ann.fillStyle = pal[i];
        ann.fillRect(772, ly - 8, 10, 10);
        ann.fillStyle = "#aebbc6";
        ann.font = "11px -apple-system, sans-serif";
        ann.textAlign = "start";
        ann.fillText(d.label, 788, ly);
        ann.restore();
      });
    }

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("plots, charts & counters", 460, 40);
    ann.restore();
  },
};
