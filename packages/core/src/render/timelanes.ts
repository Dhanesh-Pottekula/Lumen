/**
 * timelanes — what a timeline carries beyond its axis: named lanes for themes that run side by side
 * (politics, economy, daily life), so overlapping eras and events read as overlap, and cause links
 * drawn as arrows from one event to the event it led to, carrying the verb that links them.
 */
import { paintFigure, type FigureOp } from "./figure";
import type { Pt } from "./strokes";
import type { Timeline } from "./timeline";

export interface LaneSpec {
  lanes?: string[];
  links?: Array<{ from: number; to: number; label?: string }>;
  events?: Array<{ at: number; track?: number }>;
}

export function timelineLanes(
  ctx: CanvasRenderingContext2D,
  tl: Timeline,
  spec: LaneSpec,
  p: number,
  style: { ink: string; muted: string; accent: string; bg: string; font: string },
): void {
  const ops: FigureOp[] = [];
  (spec.lanes ?? []).forEach((name, i) => {
    const y = tl.trackY(i);
    ops.push({ op: "line", pts: [[tl.x, y], [tl.x + tl.w, y]], color: style.muted, width: 1, dash: [3, 6], t: [0, 0.4] });
    ops.push({ op: "text", x: tl.x, y: y - 22, text: name, size: 18, weight: 700, color: style.muted, align: "left", t: [0.1, 0.4] });
  });
  const events = spec.events ?? [];
  const links = spec.links ?? [];
  links.forEach((link, k) => {
    const a = events[link.from];
    const b = events[link.to];
    if (!a || !b) return;
    const from: Pt = [tl.sx(a.at), tl.trackY(a.track ?? 0)];
    const to: Pt = [tl.sx(b.at), tl.trackY(b.track ?? 0)];
    // Bowed clear of the markers and labels on the lanes, so a cause reads as an arc from one to the other.
    const lift = Math.max(26, Math.abs(to[0] - from[0]) * 0.18);
    const control: Pt = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift];
    const pts: Pt[] = Array.from({ length: 25 }, (_, i) => {
      const s = i / 24;
      return [(1 - s) ** 2 * from[0] + 2 * (1 - s) * s * control[0] + s ** 2 * to[0], (1 - s) ** 2 * (from[1] - 6) + 2 * (1 - s) * s * control[1] + s ** 2 * (to[1] - 6)];
    });
    const t: [number, number] = [0.5 + (0.4 * k) / Math.max(1, links.length), Math.min(1, 0.7 + (0.3 * (k + 1)) / Math.max(1, links.length))];
    ops.push({ op: "line", pts, color: style.accent, width: 2.5, arrow: "end", t });
    if (link.label) {
      const [mx, my] = pts[12];
      const w = link.label.length * 18 * 0.56 + 14;
      ops.push({ op: "rect", x: mx - w / 2, y: my - 13, w, h: 26, radius: 13, fill: style.bg, t });
      ops.push({ op: "text", x: mx, y: my, text: link.label, size: 18, weight: 600, color: style.accent, t });
    }
  });
  if (ops.length) paintFigure(ctx, ops, 0, 0, p, { bg: style.bg, font: style.font });
}
