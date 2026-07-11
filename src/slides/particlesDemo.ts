/**
 * Particle-system demo (Step 10).
 *
 * A grid of emitter presets (fire, smoke, sparks, energy, confetti, dust) over a faint ambient
 * snowfall — one deterministic emitter, many looks. Everything loops, so any scrub time shows life.
 */
import { clamp01, fadeText, phase } from "./anim";
import {
  confettiEmitter,
  dustEmitter,
  emit,
  energyEmitter,
  fireEmitter,
  smokeEmitter,
  snowEmitter,
  sparksEmitter,
} from "../render/particles";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const CELLS: { x: number; y: number; label: string; cfg: ReturnType<typeof fireEmitter> }[] = [
  { x: 160, y: 250, label: "fire", cfg: fireEmitter(160, 260, 11) },
  { x: 320, y: 250, label: "smoke", cfg: smokeEmitter(320, 260, 12) },
  { x: 460, y: 250, label: "sparks", cfg: sparksEmitter(460, 250, 13) },
  { x: 600, y: 250, label: "energy", cfg: energyEmitter(600, 250, 14) },
  { x: 740, y: 250, label: "confetti", cfg: { ...confettiEmitter(740, 250, 15), rate: 22, loop: true } },
  { x: 460, y: 360, label: "dust", cfg: dustEmitter(460, 355, 16) },
];

const SNOW = snowEmitter(W, H, 99);

export const particlesDemoSlide: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "one deterministic particle emitter — every frame reproducible on scrub." },
    { at: 2, text: "fire, smoke, sparks, energy, confetti, dust — all the same emitter, different config." },
    { at: 8, text: "origin shapes, gravity, wander, size/color over life, spin, blend modes, looping." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#10161d");
    g.addColorStop(1, "#0b1016");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // ambient snow behind everything (on bg so it doesn't bloom)
    emit(bg, SNOW, t);

    // grid of emitters on fg
    for (const cell of CELLS) {
      emit(fg, cell.cfg, t);
      fadeText(ann, cell.label, cell.x, cell.y + 34, phase(t, 1, 2), "600 13px -apple-system, sans-serif", "#aebbc6");
    }

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("particle system", 460, 44);
    ann.restore();
  },
};
