/**
 * Domain-kit demo (Step 18) — a short 3-scene themed lesson that proves the whole stack works together:
 * geo + camera + kinetic type + callouts + particles (scene 1), timeline + charts + counters (scene 2),
 * math + particles + kinetic + confetti (scene 3). Composed with a theme, film grade, and transitions.
 *
 * Subject: "Water becomes power becomes yarn" — Coimbatore's hydro-industrial rise.
 */
import { clamp01, phase } from "./anim";
import { callout } from "../render/callout";
import { pushIn } from "../render/camera";
import { barChart, type Datum, makePlot, pie } from "../render/charts";
import { featureCenter, fitProjection, type GeoFeature, geoMarker, type LonLat } from "../render/geo";
import { colorSemantics } from "../render/icons";
import { drawMath } from "../render/mathtext";
import { confettiEmitter, emit, energyEmitter } from "../render/particles";
import { eras, events, makeTimeline, playhead, timelineAxis, type TimelineEvent } from "../render/timeline";
import { counterValue, drawCounter, drawWordReveal } from "../render/type-motion";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

// ── Scene 1 — where ────────────────────────────────────────────────────────────────────────────────
const REGION: GeoFeature[] = [
  { id: "ghats", rings: [[[10, 90], [40, 92], [46, 55], [30, 30], [12, 42]]], props: { name: "Nilgiris" } },
  { id: "plain", rings: [[[46, 55], [30, 30], [12, 42], [20, 8], [60, 12], [70, 48]]], props: { name: "Kongu plain" } },
];
const AREA = { x: 470, y: 90, w: 380, h: 300 };
const PROJ = fitProjection(REGION, AREA);
const sem = colorSemantics();
const FALLS: LonLat = [30, 78];

const scene1: CanvasSlideDefinition = {
  duration: 11,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "in the hills above Coimbatore, the Pykara river falls hundreds of metres." },
    { at: 5, text: "that fall is energy — and in 1932, engineers turned it into electricity." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);
    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#16283a");
    g.addColorStop(1, "#0e1820");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    if (frame && t > 5.5) {
      const c = PROJ.project(FALLS);
      frame.setCamera(pushIn(W, H, c[0], c[1], 1, 1.7, t, 5.5, 4));
      frame.layer.set("annotation", { screenspace: true });
    }

    REGION.forEach((f, i) => {
      const p = phase(t, 1 + i * 0.8, 3.5 + i * 0.8);
      const pts = f.rings[0].map((ll) => PROJ.project(ll));
      mid.save();
      mid.globalAlpha = p * 0.6;
      mid.fillStyle = sem.colorFor(f.id);
      mid.beginPath();
      mid.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) mid.lineTo(pts[k][0], pts[k][1]);
      mid.closePath();
      mid.fill();
      mid.restore();
    });
    // falls energy
    if (t > 4) emit(fg, energyEmitter(PROJ.project(FALLS)[0], PROJ.project(FALLS)[1], 41), t - 4);
    geoMarker(fg, FALLS, PROJ, { icon: "drop", color: "#8fe8ff", label: "Pykara Falls", alpha: phase(t, 4, 5) });

    drawWordReveal(ann, "water becomes power", 70, 120, t, { font: "700 30px -apple-system, sans-serif", color: "#eef5ef" }, { start: 0.5, step: 0.16, mode: "rise" });
    if (t > 6.5) callout(frame!, { target: PROJ.project(FALLS) as [number, number], title: "600 m drop", text: "gravity → turbines", container: "bubble", route: "curve", side: "w", offset: 90, leaderP: phase(t, 6.5, 8), labelP: phase(t, 7, 8), typeP: phase(t, 8, 9.5) });
  },
};

// ── Scene 2 — the numbers ────────────────────────────────────────────────────────────────────────
const BARS: Datum[] = [
  { label: "1920", value: 12 },
  { label: "1935", value: 40 },
  { label: "1950", value: 72 },
  { label: "1970", value: 120 },
];
const SHARE: Datum[] = [
  { label: "cotton", value: 45 },
  { label: "pumps", value: 35 },
  { label: "other", value: 20 },
];

const scene2: CanvasSlideDefinition = {
  duration: 12,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "cheap power plus cotton meant mills — and the mills multiplied." },
    { at: 6, text: "by the 1970s the city had pivoted to pumps and motors: over a million made a year." },
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

    const plot = makePlot({ x: 90, y: 110, w: 320, h: 160 }, [0, 1], [0, 130]);
    barChart(mid, plot, BARS, { t, start: 1, step: 0.25, color: "#e8a13c", showValues: true });
    drawWordReveal(ann, "mills, then machines", 90, 90, t, { font: "700 20px -apple-system, sans-serif", color: "#eef5ef" }, { start: 0.3, step: 0.12 });

    if (t > 6) {
      const v = counterValue(t, 6, 2.2, 0, 1_050_000);
      drawCounter(mid, 640, 170, v, { font: "800 34px -apple-system, sans-serif", color: "#5cc8ae", align: "center" });
      pie(mid, 640, 300, 56, SHARE, phase(t, 8, 10.5), { donut: 0.55, labels: true });
      ann.save();
      ann.globalAlpha = clamp01(phase(t, 6.3, 7));
      ann.fillStyle = "#93a4b0";
      ann.font = "12px -apple-system, sans-serif";
      ann.textAlign = "center";
      ann.fillText("pumps & motors / year", 640, 194);
      ann.restore();
    }
  },
};

// ── Scene 3 — the physics + finale ──────────────────────────────────────────────────────────────
const scene3: CanvasSlideDefinition = {
  duration: 12,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the whole story is one equation: power is density times gravity times flow times height." },
    { at: 6, text: "water, gravity, and geography — turned into a city that runs the south." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);
    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#16222c");
    g.addColorStop(1, "#0e1620");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    if (t > 0.5) emit(fg, energyEmitter(460, 250, 7), t);
    drawMath(mid, "P = \\rho \\cdot g \\cdot Q \\cdot H", 460, 170, { size: 44, color: "#eef5ef", align: "center", p: phase(t, 0.8, 4.5) });

    // finale headline + confetti
    if (t > 6) {
      drawWordReveal(ann, "Coimbatore: water, made into work", 460 - 250, 300, t, { font: "700 22px -apple-system, sans-serif", color: "#5cc8ae" }, { start: 6, step: 0.1, mode: "pop" });
    }
    if (t > 8) emit(fx, { ...confettiEmitter(460, 120, 21), rate: 26, loop: true }, t - 8);

    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.2));
    ann.fillStyle = "#93a4b0";
    ann.font = "12px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("hydro power", 460, 120);
    ann.restore();
  },
};

export const DOMAIN_SCENES = [scene1, scene2, scene3];
