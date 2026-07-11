/**
 * Shape-morph demo (Step 14). A hero shape flows through a sequence of forms (circle → square → star →
 * heart → triangle → circle); resampled + aligned + interpolated. A second row morphs a blob to a hexagon.
 */
import { clamp01, fadeText, phase } from "./anim";
import { circleShape, drawMorph, heartShape, polygonShape, starShape } from "../render/morph";
import type { Pt } from "../render/strokes";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const CX = 460;
const CY = 210;
const R = 92;

const SEQ: { pts: Pt[]; name: string }[] = [
  { pts: circleShape(CX, CY, R), name: "circle" },
  { pts: polygonShape(CX, CY, R, 4, -Math.PI / 4), name: "square" },
  { pts: starShape(CX, CY, R, 5), name: "star" },
  { pts: heartShape(CX, CY, R), name: "heart" },
  { pts: polygonShape(CX, CY, R, 3), name: "triangle" },
  { pts: circleShape(CX, CY, R), name: "circle" },
];

const SEG = 2.8; // seconds per transition

export const morphDemoSlide: CanvasSlideDefinition = {
  duration: SEQ.length * SEG,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "shape morphing — one form flows into another." },
    { at: 0.5, text: "both shapes are resampled to a common point count, their correspondence aligned, then interpolated." },
    { at: 8, text: "closed shapes or open paths; reactant becomes product, one border becomes the next." },
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

    // which transition are we in?
    const seg = Math.min(SEQ.length - 2, Math.floor(t / SEG));
    const localP = clamp01((t - seg * SEG) / SEG);
    const a = SEQ[seg];
    const b = SEQ[seg + 1];

    drawMorph(mid, a.pts, b.pts, localP, { fill: "rgba(92,200,174,0.16)", stroke: "#5cc8ae", width: 3, closed: true });

    // label the current/target form
    fadeText(ann, `${a.name}  →  ${b.name}`, CX, 350, phase(t, 0.3, 1), "600 16px -apple-system, sans-serif", "#8fd0b4");

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("shape morph", 460, 44);
    ann.restore();
  },
};
