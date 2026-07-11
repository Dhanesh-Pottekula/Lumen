/**
 * Kinetic-typography demo (Step 09).
 *
 * Word-by-word headline, a number counting up, a date slam, a scramble/decode, and text along a curve.
 */
import { clamp01, phase } from "./anim";
import { smoothPath, type Pt } from "../render/strokes";
import {
  counterValue,
  drawCounter,
  drawScramble,
  drawSlam,
  drawTextAlongPath,
  drawWordReveal,
} from "../render/type-motion";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const ARC: Pt[] = smoothPath(
  [
    [180, 360],
    [340, 330],
    [500, 348],
    [660, 322],
    [760, 350],
  ],
  { curve: "catmullRom", samples: 20 },
);

export const typeMotionDemoSlide: CanvasSlideDefinition = {
  duration: 17,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "kinetic typography — text and numbers as animated citizens." },
    { at: 1, text: "words arrive one at a time..." },
    { at: 4, text: "numbers count up, formatted with commas..." },
    { at: 7, text: "dates slam in with impact..." },
    { at: 10, text: "names decode from noise, and text can ride a curve." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#151d26");
    g.addColorStop(1, "#0f151b");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // word-by-word headline (rise mode)
    drawWordReveal(ann, "the town that spun the south", 210, 96, t, { font: "700 26px -apple-system, sans-serif", color: "#eef5ef" }, { start: 1, step: 0.14, mode: "rise" });

    // counter (population) counting up
    if (t > 4) {
      const v = counterValue(t, 4, 2.4, 0, 1247000);
      drawCounter(fg, 250, 220, v, { font: "800 44px -apple-system, sans-serif", color: "#5cc8ae", align: "center" });
      ann.save();
      ann.globalAlpha = clamp01(phase(t, 4.3, 5.3));
      ann.fillStyle = "#93a4b0";
      ann.font = "13px -apple-system, sans-serif";
      ann.textAlign = "center";
      ann.fillText("spindles by 1935", 250, 246);
      ann.restore();
    }

    // date slam
    drawSlam(fg, "1932", 670, 210, t, 7, { font: "800 60px -apple-system, sans-serif", color: "#e8c14a" });
    if (t > 8) {
      ann.save();
      ann.globalAlpha = clamp01(phase(t, 8, 9));
      ann.fillStyle = "#93a4b0";
      ann.font = "13px -apple-system, sans-serif";
      ann.textAlign = "center";
      ann.fillText("Pykara power arrives", 670, 246);
      ann.restore();
    }

    // scramble / decode
    drawScramble(ann, "COIMBATORE", 250, 300, t, 10, { font: "700 24px -apple-system, sans-serif", color: "#eef5ef", align: "center" }, { dur: 1.6, seed: 9 });

    // text along a curve
    drawTextAlongPath(ann, "spun into thread, woven into a city", ARC, phase(t, 12, 15.5), { font: "600 15px -apple-system, sans-serif", color: "#8fd0b4" });

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("kinetic typography", 460, 44);
    ann.restore();
  },
};
