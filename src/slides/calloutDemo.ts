/**
 * Callout / leader-line demo (Step 07).
 *
 * A subject sits center-stage; callouts of different container styles, leader routes, and markers
 * animate in and point at parts of it — leader draws on, then the label pops, with typewriter body.
 */
import { clamp01, phase } from "./anim";
import { callout } from "../render/callout";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

// target points on a simple "device" diagram
const T = {
  core: [460, 220] as [number, number],
  topRing: [460, 150] as [number, number],
  left: [360, 250] as [number, number],
  right: [560, 250] as [number, number],
  bottom: [460, 300] as [number, number],
};

export const calloutDemoSlide: CanvasSlideDefinition = {
  duration: 20,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the annotation layer — labels that point at things, with leader lines that draw themselves on." },
    { at: 4, text: "pills, boxes, speech bubbles and badges; straight, elbow, or curved leaders." },
    { at: 10, text: "endpoint dots, rings and arrowheads; subject markers that circle or bracket the target." },
    { at: 15, text: "multi-line title + body with a typewriter reveal — all themed and seekable." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#15202a");
    g.addColorStop(1, "#0f161d");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // subject: a simple concentric "device"
    mid.save();
    mid.strokeStyle = "#4a6070";
    mid.lineWidth = 2;
    mid.fillStyle = "#22303c";
    mid.beginPath();
    mid.arc(T.core[0], T.core[1], 58, 0, 7);
    mid.fill();
    mid.stroke();
    mid.fillStyle = "#2f7d68";
    mid.beginPath();
    mid.arc(T.core[0], T.core[1], 26, 0, 7);
    mid.fill();
    for (const p of [T.topRing, T.left, T.right, T.bottom]) {
      mid.fillStyle = "#e8a13c";
      mid.beginPath();
      mid.arc(p[0], p[1], 5, 0, 7);
      mid.fill();
    }
    mid.restore();

    if (!frame) return; // callouts need the annotation layer

    // 1 — pill + straight + dot, points right
    callout(frame, {
      target: T.right,
      text: "output port",
      container: "pill",
      route: "straight",
      side: "e",
      offset: 120,
      targetMarker: "dot",
      leaderP: phase(t, 0.5, 2),
      labelP: phase(t, 1.5, 2.5),
    });

    // 2 — speech bubble + curve + arrow, points to the core
    callout(frame, {
      target: T.core,
      title: "the core",
      text: "everything routes through here",
      container: "bubble",
      route: "curve",
      side: "nw",
      offset: 120,
      maxWidth: 150,
      targetMarker: "arrow",
      subject: "circle",
      subjectR: 64,
      leaderP: phase(t, 4, 5.5),
      labelP: phase(t, 5, 6),
      typeP: phase(t, 6, 8),
    });

    // 3 — rect + elbow + ring + bracket subject, points left
    callout(frame, {
      target: T.left,
      text: "intake",
      container: "rect",
      route: "elbow",
      side: "w",
      offset: 130,
      targetMarker: "ring",
      subject: "bracket",
      subjectR: 18,
      leaderP: phase(t, 8, 9.5),
      labelP: phase(t, 9, 10),
    });

    // 4 — badge (number chip) + straight, points at top ring
    callout(frame, {
      target: T.topRing,
      text: "1",
      container: "badge",
      route: "straight",
      side: "n",
      offset: 60,
      targetMarker: "dot",
      leaderP: phase(t, 11, 12.5),
      labelP: phase(t, 11.5, 12.5),
    });

    // 5 — title+body pill + curve + crosshair, points at bottom, typewriter
    callout(frame, {
      target: T.bottom,
      title: "exhaust",
      text: "spent working fluid leaves the cycle here and is recovered downstream",
      container: "pill",
      route: "curve",
      curveBend: -40,
      side: "se",
      offset: 120,
      maxWidth: 190,
      targetMarker: "crosshair",
      leaderP: phase(t, 14, 15.5),
      labelP: phase(t, 15, 16),
      typeP: phase(t, 16, 19),
    });

    // title
    const ann = frame.layer.ctx("annotation");
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("callouts & leader lines", 460, 40);
    ann.restore();
  },
};
