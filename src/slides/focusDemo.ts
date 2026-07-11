/**
 * Attention-direction demo (Step 06).
 *
 * A row of chips is the "scene"; the eye is directed to one chip at a time with a different technique
 * per segment: dim+ring, box+brackets, arrow+bounce pointer, focusRings+converging arrows+pulse, and a
 * magnifier+vignette. Every effect is a pure function of t.
 */
import { clamp01, phase } from "./anim";
import {
  bouncePointer,
  convergingArrows,
  cornerBrackets,
  dimExcept,
  focusBox,
  focusRings,
  highlightRing,
  magnify,
  pointerArrow,
  pulseScale,
  sparkFlash,
  vignetteTo,
} from "../render/focus";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const CHIPS = [
  { x: 130, y: 210, label: "A", a: "#3a7bd5", b: "#2b5876" },
  { x: 290, y: 210, label: "B", a: "#c94b4b", b: "#4b134f" },
  { x: 450, y: 210, label: "C", a: "#11998e", b: "#38ef7d" },
  { x: 610, y: 210, label: "D", a: "#f7971e", b: "#ffd200" },
  { x: 770, y: 210, label: "E", a: "#654ea3", b: "#eaafc8" },
];
const R = 36;

function drawScene(c: CanvasRenderingContext2D) {
  for (const chip of CHIPS) {
    const g = c.createRadialGradient(chip.x - 10, chip.y - 10, 4, chip.x, chip.y, R);
    g.addColorStop(0, chip.a);
    g.addColorStop(1, chip.b);
    c.fillStyle = g;
    c.beginPath();
    c.arc(chip.x, chip.y, R, 0, 7);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.font = "700 22px -apple-system, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(chip.label, chip.x, chip.y);
    c.textBaseline = "alphabetic";
  }
}

function label(ann: CanvasRenderingContext2D, text: string, alpha: number) {
  ann.save();
  ann.globalAlpha = clamp01(alpha);
  ann.fillStyle = "#eef5ef";
  ann.font = "600 15px -apple-system, sans-serif";
  ann.textAlign = "center";
  ann.fillText(text, 460, 340);
  ann.restore();
}

export const focusDemoSlide: CanvasSlideDefinition = {
  duration: 22,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "attention direction — the #1 teaching skill: send the eye exactly where it should look." },
    { at: 1, text: "spotlight one element and dim the rest, with a gently pulsing ring." },
    { at: 5, text: "a focus box and camera-style corner brackets frame the target." },
    { at: 9, text: "a draw-on arrow and a bouncing pointer aim straight at it." },
    { at: 13, text: "converging rings and arrows collapse onto it, with a heartbeat pulse." },
    { at: 17, text: "and a magnifier enlarges fine detail in place, edges dimmed toward the focus." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    const fx = frame?.layer.ctx("fx") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141c24");
    g.addColorStop(1, "#0e141a");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    drawScene(mid);

    // title
    ann.save();
    ann.globalAlpha = phase(t, 0.3, 1.5);
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("attention direction", 460, 44);
    ann.restore();

    // A — dim everything except chip 0 + pulsing ring
    if (t >= 1 && t < 5) {
      const c = CHIPS[0];
      const inten = phase(t, 1, 2) * (1 - phase(t, 4.4, 5));
      dimExcept(fg, [{ cx: c.x, cy: c.y, r: R + 26 }], { intensity: 0.68 * inten, feather: 30 });
      highlightRing(ann, c.x, c.y, R + 12, t, { amp: 3, period: 1.2, alpha: phase(t, 1.2, 2) * (1 - phase(t, 4.4, 5)) });
      label(ann, "dimExcept + highlightRing", phase(t, 1.2, 2) * (1 - phase(t, 4.5, 5)));
    }

    // B — focus box + corner brackets + a spark on arrival
    if (t >= 5 && t < 9) {
      const c = CHIPS[1];
      const inA = phase(t, 5, 5.8);
      const outA = 1 - phase(t, 8.4, 9);
      focusBox(ann, c.x - R, c.y - R, R * 2, R * 2, t, { pad: 8, corner: 12, amp: 2, dash: [7, 6], dashSpin: 30, color: "#7fd0ff" });
      cornerBrackets(ann, c.x - R, c.y - R, R * 2, R * 2, { pad: 16, length: 18, p: inA * outA, color: "#7fd0ff" });
      sparkFlash(fx, c.x, c.y, phase(t, 5, 6));
      label(ann, "focusBox + cornerBrackets", inA * outA);
    }

    // C — draw-on arrow + bouncing pointer
    if (t >= 9 && t < 13) {
      const c = CHIPS[2];
      const p = phase(t, 9, 10.5);
      const outA = 1 - phase(t, 12.4, 13);
      pointerArrow(ann, c.x - 150, c.y - 120, c.x - 46, c.y - 40, p * 1, { color: "#5cc8ae", width: 3 });
      if (t > 10.5) bouncePointer(ann, c.x, c.y - R, t, { color: "#5cc8ae" });
      label(ann, "pointerArrow + bouncePointer", phase(t, 9.2, 10) * outA);
    }

    // D — converging rings + arrows + heartbeat pulse
    if (t >= 13 && t < 17) {
      const c = CHIPS[3];
      const p = phase(t, 13, 15.5);
      const outA = 1 - phase(t, 16.4, 17);
      focusRings(ann, c.x, c.y, p, { count: 3, maxR: 110, targetR: R + 8, color: "#ffd24a" });
      convergingArrows(ann, c.x, c.y, p, { count: 4, ring: 100, targetR: R + 12, color: "#ffd24a" });
      // pulse the chip itself (redraw one chip scaled)
      pulseScale(ann, c.x, c.y, t, (cc) => {
        const gg = cc.createRadialGradient(c.x - 10, c.y - 10, 4, c.x, c.y, R);
        gg.addColorStop(0, c.a);
        gg.addColorStop(1, c.b);
        cc.fillStyle = gg;
        cc.beginPath();
        cc.arc(c.x, c.y, R, 0, 7);
        cc.fill();
        cc.fillStyle = "rgba(255,255,255,0.92)";
        cc.font = "700 22px -apple-system, sans-serif";
        cc.textAlign = "center";
        cc.textBaseline = "middle";
        cc.fillText(c.label, c.x, c.y);
        cc.textBaseline = "alphabetic";
      });
      label(ann, "focusRings + convergingArrows + pulse", phase(t, 13.2, 14) * outA);
    }

    // E — magnifier loupe + vignette toward the focus
    if (t >= 17) {
      const c = CHIPS[4];
      const inA = phase(t, 17, 18);
      vignetteTo(fx, c.x, c.y, { strength: 0.5 * inA, inner: 150, outer: 640 });
      magnify(ann, c.x, c.y, 62, 1.9, drawScene, { ringColor: "#eef5ef", ringWidth: 2 });
      label(ann, "magnify + vignetteTo", inA);
    }
  },
};
