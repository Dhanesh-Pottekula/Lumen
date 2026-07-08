/**
 * Two-pendulum lesson as a pure renderFrame(t) canvas slide.
 * Real small-angle physics: theta(t) = A * cos(2π t / T) — time is a parameter, never a clock.
 */
import type { CanvasSlideDefinition } from "./types";

const G = 9.8;
const A = (25 * Math.PI) / 180; // release angle 25°
const PIVOT_Y = 60;
const SCALE = 180; // px per metre

interface Pendulum {
  x: number;
  T: number;
  len: number;
  color: string;
  label: string;
}

const makePendulum = (x: number, T: number, color: string, label: string): Pendulum => ({
  x,
  T,
  len: G * (T / (2 * Math.PI)) ** 2 * SCALE,
  color,
  label,
});

const P1 = makePendulum(300, 2.0, "#e8a13c", "L = 1.0 m  ·  T ≈ 2.0 s");
const P2 = makePendulum(620, 2.5, "#5cc8ae", "L = 1.55 m  ·  T ≈ 2.5 s");

const theta = (p: Pendulum, t: number) => A * Math.cos((2 * Math.PI * t) / p.T);

const bob = (p: Pendulum, t: number) => {
  const th = theta(p, t);
  return { x: p.x + p.len * Math.sin(th), y: PIVOT_Y + p.len * Math.cos(th) };
};

function drawPendulum(ctx: CanvasRenderingContext2D, p: Pendulum, t: number) {
  // deterministic motion trail — past positions recomputed from t, never accumulated
  for (let i = 12; i >= 1; i--) {
    const bt = bob(p, Math.max(0, t - i * 0.045));
    ctx.beginPath();
    ctx.arc(bt.x, bt.y, 4, 0, 7);
    ctx.fillStyle = p.color + Math.round(10 + (12 - i) * 5).toString(16).padStart(2, "0");
    ctx.fill();
  }

  const b = bob(p, t);
  ctx.beginPath();
  ctx.moveTo(p.x, PIVOT_Y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = "#93a4b0";
  ctx.lineWidth = 3;
  ctx.stroke();

  const g = ctx.createRadialGradient(b.x - 6, b.y - 6, 3, b.x, b.y, 22);
  g.addColorStop(0, "#ffffff55");
  g.addColorStop(0.25, p.color);
  g.addColorStop(1, p.color);
  ctx.beginPath();
  ctx.arc(b.x, b.y, 22, 0, 7);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(p.x, PIVOT_Y, 6, 0, 7);
  ctx.fillStyle = "#e8eef2";
  ctx.fill();

  ctx.fillStyle = "#93a4b0";
  ctx.font = "15px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(p.label, p.x, PIVOT_Y + p.len + 88);
}

function drawPhaseBadge(ctx: CanvasRenderingContext2D, t: number) {
  if (t < 0.2) return;
  const since = t % 10;
  const near = Math.min(since, 10 - since);
  ctx.font = "600 17px -apple-system, sans-serif";
  ctx.textAlign = "center";
  if (near < 0.55) {
    ctx.fillStyle = `rgba(92, 200, 174, ${1 - near / 0.55})`;
    ctx.fillText("in phase again", 460, 40);
  } else if (Math.abs(since - 5) < 0.55) {
    ctx.fillStyle = `rgba(232, 161, 60, ${1 - Math.abs(since - 5) / 0.55})`;
    ctx.fillText("fully out of phase", 460, 40);
  }
}

export const pendulumSlide: CanvasSlideDefinition = {
  duration: 30,
  viewW: 920,
  viewH: 430,
  captions: [
    { at: 0, text: "two pendulums, released together from the same angle. the only difference between them is length." },
    { at: 6, text: "the shorter one swings faster. period grows with the square root of length — that's the whole secret." },
    { at: 12, text: "watch them drift apart… by now one has finished laps the other hasn't. same start, different clocks." },
    { at: 19, text: "but the drift isn't chaos. every ten seconds their rhythms line up again — exactly." },
    { at: 26, text: "same release, different lengths, and a beat pattern you can set your watch to." },
  ],
  render(ctx, t) {
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // ceiling
    ctx.fillStyle = "#2b3640";
    ctx.fillRect(140, PIVOT_Y - 8, 640, 8);

    drawPendulum(ctx, P1, t);
    drawPendulum(ctx, P2, t);
    drawPhaseBadge(ctx, t);

    // time ruler along the bottom — a dot at each 10 s phase-alignment moment
    ctx.strokeStyle = "#2b3640";
    ctx.beginPath();
    ctx.moveTo(60, 415);
    ctx.lineTo(860, 415);
    ctx.stroke();
    for (let s = 0; s <= 30; s += 10) {
      const x = 60 + (s / 30) * 800;
      ctx.fillStyle = "#5cc8ae";
      ctx.beginPath();
      ctx.arc(x, 415, 3.5, 0, 7);
      ctx.fill();
    }
    const px = 60 + (Math.min(t, 30) / 30) * 800;
    ctx.fillStyle = "#e8eef2";
    ctx.beginPath();
    ctx.arc(px, 415, 5, 0, 7);
    ctx.fill();
  },
};
