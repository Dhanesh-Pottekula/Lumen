/**
 * Engagement-grammar demo (Step 08).
 *
 * Left: progressive disclosure — a worked example builds line by line (current bright, prior dimmed).
 * Right: predict-and-reveal — a question poses, a thinking pause, then the answer lands with a punch,
 * a flash, and a shake. All pure functions of t.
 */
import { clamp01, fadeText, phase } from "./anim";
import { flashOverlay, predictReveal, stepState, withPunch, withShake } from "../render/sequence";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const STEPS = [
  "1.  gather the givens",
  "2.  write the relation",
  "3.  substitute the numbers",
  "4.  solve for the unknown",
  "5.  check the units",
];

export const sequenceDemoSlide: CanvasSlideDefinition = {
  duration: 18,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the engagement grammar — how a lesson is paced, not just what it shows." },
    { at: 1, text: "progressive disclosure: build the method one line at a time, the current step bright, prior steps dimmed." },
    { at: 9, text: "predict-and-reveal: pose the question, give a beat to think..." },
    { at: 12, text: "...then land the answer with a punch, a flash, and a shake." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141c24");
    g.addColorStop(1, "#0f151b");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // divider
    mid.save();
    mid.strokeStyle = "rgba(255,255,255,0.08)";
    mid.lineWidth = 1;
    mid.beginPath();
    mid.moveTo(470, 90);
    mid.lineTo(470, 360);
    mid.stroke();
    mid.restore();

    fadeText(ann, "progressive disclosure", 235, 80, phase(t, 0.5, 1.5), "600 14px -apple-system, sans-serif", "#8fd0b4");
    fadeText(ann, "predict & reveal", 700, 80, phase(t, 8, 9), "600 14px -apple-system, sans-serif", "#e8c14a");

    // LEFT — build steps, current bright, past dim
    const st = stepState(t, STEPS.length, { start: 1.5, step: 1.4, dur: 0.5 });
    STEPS.forEach((text, i) => {
      const s = st.item(i);
      if (s.p <= 0) return;
      const y = 130 + i * 40 + (1 - s.p) * 12;
      const alpha = s.active ? 1 : s.focus > 0 ? s.focus : s.p;
      // a little bullet that fills when the step is/was active
      ann.save();
      ann.globalAlpha = clamp01(alpha);
      ann.fillStyle = i <= st.index ? "#5cc8ae" : "#3a4650";
      ann.beginPath();
      ann.arc(70, y - 4, 4, 0, 7);
      ann.fill();
      ann.restore();
      fadeText(ann, text, 88, y, clamp01(alpha), s.active ? "600 16px -apple-system, sans-serif" : "15px -apple-system, sans-serif", s.active ? "#eef5ef" : "#9fb0bd", "start");
    });

    // RIGHT — predict & reveal
    const pr = predictReveal(t, { poseAt: 9, revealAt: 12.2 });
    fadeText(ann, "7  ×  8  =  ?", 700, 190, pr.question, "700 30px -apple-system, sans-serif", "#eef5ef");

    // thinking dots during the gap
    if (pr.thinking > 0 && !pr.revealed) {
      for (let i = 0; i < 3; i++) {
        const on = (t * 2) % 3 >= i ? 1 : 0.25;
        ann.save();
        ann.globalAlpha = 0.6 * on;
        ann.fillStyle = "#e8c14a";
        ann.beginPath();
        ann.arc(672 + i * 28, 240, 5, 0, 7);
        ann.fill();
        ann.restore();
      }
    }

    // answer lands with punch + shake + flash
    if (pr.answer > 0) {
      withShake(ann, t, 12.2, (c) => {
        withPunch(c, 700, 245, t, 12.2, (cc) => {
          fadeText(cc, "56", 700, 258, pr.answer, "800 52px -apple-system, sans-serif", "#5cc8ae");
        }, { amp: 0.5, width: 0.5 });
      }, { mag: 5 });
    }
    flashOverlay(fx, t, 12.2, W, H, { color: "rgba(255,240,180,0.5)", dur: 0.3 });

    // title
    fadeText(ann, "engagement grammar", 460, 44, phase(t, 0.3, 1.4), "700 18px -apple-system, sans-serif", "#eef5ef");
  },
};
