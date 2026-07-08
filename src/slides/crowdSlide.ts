/**
 * Crowd slide — 10 small humans (SVG-path bodies) wandering "randomly", as a pure
 * renderFrame(t) canvas slide.
 *
 *   1. SVG inside canvas: each human's torso is SVG path data consumed via Path2D and
 *      stamped 10 times with per-human transforms — vector art, no images, no async.
 *   2. Deterministic randomness: every human's "personality" (route, speed, size, color)
 *      comes from a seeded PRNG, and its position is a pure function of t (sum of
 *      sinusoids). Looks random — but seek to any t twice and the crowd is identical.
 */
import type { CanvasSlideDefinition } from "./types";

/** Seeded PRNG (mulberry32) — "random" personalities, identical on every load. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/* The human torso as SVG path data, consumed by canvas via Path2D.
   Local coordinate space: roughly 24 wide, 60 tall, origin at top-left. */
const TORSO = new Path2D(
  "M12 18 C7 18 5 22 5 27 L5 40 C5 42 7 43 8 42 L10 34 L14 34 L16 42 C17 43 19 42 19 40 L19 27 C19 22 17 18 12 18 Z",
);
const HEAD_R = 6.5;

const PALETTE = [
  "#e8a13c", "#5cc8ae", "#7aa5d6", "#d67a7a", "#b48ead",
  "#a3be8c", "#d08770", "#8fbcbb", "#ebcb8b", "#81a1c1",
];

interface Human {
  cx: number;
  cy: number;
  ax1: number;
  ax2: number;
  ay1: number;
  w1: number;
  w2: number;
  wy: number;
  p1: number;
  p2: number;
  py: number;
  stepFreq: number;
  scale: number;
  color: string;
}

/* Build the 10 humans' personalities once, from a fixed seed. */
const rand = mulberry32(20260707);
const HUMANS: Human[] = Array.from({ length: 10 }, (_, i) => ({
  cx: 90 + rand() * 740, // home position
  cy: 150 + rand() * 200,
  ax1: 60 + rand() * 130, // wander amplitudes (px)
  ax2: 20 + rand() * 50,
  ay1: 15 + rand() * 45,
  w1: 0.15 + rand() * 0.25, // wander frequencies (rad/s)
  w2: 0.4 + rand() * 0.5,
  wy: 0.2 + rand() * 0.35,
  p1: rand() * Math.PI * 2, // phases
  p2: rand() * Math.PI * 2,
  py: rand() * Math.PI * 2,
  stepFreq: 5 + rand() * 3, // walk-cycle speed (rad/s)
  scale: 0.75 + rand() * 0.6, // body size
  color: PALETTE[i],
}));

/* Position and horizontal velocity — pure functions of t. */
const humanX = (h: Human, t: number) => h.cx + h.ax1 * Math.sin(h.w1 * t + h.p1) + h.ax2 * Math.sin(h.w2 * t + h.p2);
const humanY = (h: Human, t: number) => h.cy + h.ay1 * Math.sin(h.wy * t + h.py);
const humanVX = (h: Human, t: number) =>
  h.ax1 * h.w1 * Math.cos(h.w1 * t + h.p1) + h.ax2 * h.w2 * Math.cos(h.w2 * t + h.p2);

function drawHuman(ctx: CanvasRenderingContext2D, h: Human, t: number) {
  const x = humanX(h, t);
  const y = humanY(h, t);
  const vx = humanVX(h, t);
  const facing = vx >= 0 ? 1 : -1;
  const stride = Math.sin(h.stepFreq * t + h.p1) * Math.min(1, Math.abs(vx) / 40); // legs swing more when moving faster
  const bobY = Math.abs(Math.sin(h.stepFreq * t + h.p1)) * 1.5; // walk bounce

  ctx.save();
  ctx.translate(x, y - bobY);
  ctx.scale(facing * h.scale, h.scale);
  ctx.translate(-12, 0); // center the 24-wide figure on its position

  // ground shadow
  ctx.beginPath();
  ctx.ellipse(12, 62, 10, 3, 0, 0, 7);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();

  // legs — two lines swinging in anti-phase from the hip
  ctx.strokeStyle = h.color;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 40);
  ctx.lineTo(10 + stride * 7, 58);
  ctx.moveTo(14, 40);
  ctx.lineTo(14 - stride * 7, 58);
  ctx.stroke();

  // torso comes from SVG path data via Path2D
  ctx.fillStyle = h.color;
  ctx.fill(TORSO);

  // head
  ctx.beginPath();
  ctx.arc(12, 10, HEAD_R, 0, 7);
  ctx.fill();

  ctx.restore();
}

export const crowdSlide: CanvasSlideDefinition = {
  duration: 30,
  viewW: 920,
  viewH: 430,
  render(ctx, t) {
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    // ground
    ctx.fillStyle = "#232d36";
    ctx.fillRect(0, 320, this.viewW, this.viewH - 320);

    // draw back-to-front so nearer (lower) humans overlap farther ones
    const order = [...HUMANS].sort((a, b) => humanY(a, t) - humanY(b, t));
    for (const h of order) drawHuman(ctx, h, t);

    ctx.fillStyle = "#93a4b0";
    ctx.font = "14px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      "10 humans · SVG paths stamped via Path2D · seeded wander — scrub me, the crowd repeats exactly",
      460,
      415,
    );
  },
};
