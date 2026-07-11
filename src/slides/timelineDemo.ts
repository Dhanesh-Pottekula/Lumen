/**
 * Timeline demo (Step 13). A date axis with era bands, event markers on parallel tracks, and a
 * playhead that sweeps across time.
 */
import { clamp01, fadeText, lerp, phase } from "./anim";
import { type Era, eras, events, makeTimeline, playhead, timelineAxis, type TimelineEvent } from "../render/timeline";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const FROM = -300;
const TO = 2010;

const ERAS: Era[] = [
  { from: -300, to: 300, label: "Sangam era", color: "#2f6b57", track: 0 },
  { from: 300, to: 1500, label: "medieval trade", color: "#4a5a7a", track: 0 },
  { from: 1888, to: 1947, label: "mill boom", color: "#8a5a2b", track: 0 },
  { from: 1947, to: 2010, label: "engineering city", color: "#6b3a5a", track: 0 },
];

const EVENTS: TimelineEvent[] = [
  { at: -100, label: "Roman trade", track: 1, above: true },
  { at: 1888, label: "first mill", track: 1, above: true },
  { at: 1932, label: "Pykara power", track: 2, above: false },
  { at: 1947, label: "independence", track: 1, above: true },
  { at: 1970, label: "pump city", track: 2, above: false },
];

export const timelineDemoSlide: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the timeline primitive — a date axis across two thousand years." },
    { at: 2, text: "era bands grow in to mark the periods..." },
    { at: 5, text: "events pin to their dates on parallel tracks..." },
    { at: 9, text: "and a playhead sweeps across, from antiquity to today." },
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

    const tl = makeTimeline({ x: 70, y: 120, w: 780, h: 200 }, FROM, TO, 3);

    timelineAxis(mid, tl, { p: phase(t, 0.5, 3), baselineFrac: 0.5 });
    eras(mid, tl, ERAS, phase(t, 2, 5.5), { start: 0, step: 0.1 });
    events(mid, tl, EVENTS, t, { start: 5, step: 0.5 });

    // playhead sweeps from FROM→TO over t 9→15
    if (t > 9) {
      const pd = lerp(FROM, TO, clamp01((t - 9) / 6));
      playhead(mid, tl, pd, { label: true });
    }

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("timeline", 460, 44);
    ann.restore();
  },
};
