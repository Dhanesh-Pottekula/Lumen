// src/gcl/segments.ts
/**
 * Segments — the marks inside one painted component that attention can single out: a chart's bar,
 * slice, point or line, and a term of an equation. Each is the mark's exact shape where the painter
 * draws it, so a cue glows that mark and can soften its siblings instead of framing the whole thing.
 * Pure geometry from the component's data and its placement box, computed with the same domains and
 * slot maths the painters use.
 */
import type { Box } from "./anchors";
import { makePlot, seriesLines } from "../render/charts";
import { mathTermBox, measureMath } from "../render/mathtext";
import { compileExpr } from "./expr";
import type { Component, Vec2 } from "./schema";

export interface Segment {
  box: Box;
  /** The mark's own outline: closed round an area (a bar, a slice), open along a line (a series). */
  shape: Vec2[];
  closed: boolean;
  /** The colour the mark is drawn in, when a cue should keep it. */
  color?: string;
}

type Chart = Extract<Component, { type: "chart" }>;

/** The colours a painted chart hands its lines, after the chart's own. */
export interface SeriesInks {
  second: string;
  ink: string;
  muted: string;
}

/** The painter's rectangle count when a riemann chart names none. */
export const RIEMANN_DEFAULT = 10;
const BAR_GAP = 0.35;
const POINT_RING = 7;

/** The extent of a data axis, padded when it is empty or degenerate. An independent axis never starts at zero by force. */
export function dataDomain(values: number[]): [number, number] {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return [0, 1];
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  return high - low < 1e-9 ? [low - 0.5, high + 0.5] : [low, high];
}

/** The domains a line, area or scatter chart is plotted on. */
export function seriesDomains(c: Chart): { x: [number, number]; y: [number, number] } {
  const all = seriesLines(c.series ?? []).flat();
  const ys = all.map(([, y]) => y);
  return { x: c.xDomain ?? dataDomain(all.map(([x]) => x)), y: c.yDomain ?? [Math.min(0, ...ys), Math.max(1, ...ys)] };
}

/** The line colours a painted chart uses, the first its own. */
export function seriesColors(c: Chart, inks: SeriesInks): string[] {
  return [c.color ?? "#5cc8ae", inks.second, inks.ink, inks.muted];
}

/** A closed outline with no edge longer than a few units, so the glow's smoothing rounds its corners without shrinking it. */
function dense(shape: Vec2[]): Vec2[] {
  return shape.flatMap(([x, y], i): Vec2[] => {
    const [nx, ny] = shape[(i + 1) % shape.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 4));
    return Array.from({ length: steps }, (_, k): Vec2 => [x + ((nx - x) * k) / steps, y + ((ny - y) * k) / steps]);
  });
}

const rect = (x: number, y: number, w: number, h: number): Segment => ({
  box: { x, y, w, h },
  shape: dense([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]),
  closed: true,
});

function extent(points: Vec2[], pad: number): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

function ring(x: number, y: number, r: number): Segment {
  const shape = Array.from({ length: 16 }, (_, k): Vec2 => [x + Math.cos((k / 16) * Math.PI * 2) * r, y + Math.sin((k / 16) * Math.PI * 2) * r]);
  return { box: { x: x - r, y: y - r, w: r * 2, h: r * 2 }, shape, closed: true };
}

/** Every mark of a painted chart by name: `bar<i>`, `slice<i>`, `series<i>` and `pt<i>`. */
export function chartSegments(c: Chart, box: Box, inks: SeriesInks): Map<string, Segment> {
  const out = new Map<string, Segment>();
  if (c.chart === "bar") {
    const data = c.data ?? [];
    const plot = makePlot(box, [0, 1], [0, Math.max(1, ...data.map((d) => d.value))]);
    const slot = plot.w / Math.max(1, data.length);
    const bw = slot * (1 - BAR_GAP);
    const base = plot.sy(0);
    data.forEach((d, i) => {
      const top = Math.min(base, plot.sy(d.value));
      out.set(`bar${i}`, { ...rect(plot.x + i * slot + (slot - bw) / 2, top, bw, Math.max(1, base - top)), color: d.color });
    });
  } else if (c.chart === "riemann") {
    const [a, b] = c.xDomain ?? [0, 1];
    const n = Math.max(1, Math.floor(c.n ?? RIEMANN_DEFAULT));
    const f = compileExpr(c.fn ?? "x");
    const dx = (b - a) / n;
    const samples = Array.from({ length: n + 1 }, (_, i) => f({ x: a + i * dx })).filter((v) => Number.isFinite(v));
    const plot = makePlot(box, [a, b], c.yDomain ?? [Math.min(0, ...samples), Math.max(0, ...samples, 1e-6)]);
    const base = plot.sy(0);
    for (let i = 0; i < n; i++) {
      const v = f({ x: a + i * dx });
      const top = plot.sy(Number.isFinite(v) ? v : 0);
      const [x0, x1] = [plot.sx(a + i * dx), plot.sx(a + (i + 1) * dx)];
      out.set(`bar${i}`, rect(Math.min(x0, x1), Math.min(top, base), Math.abs(x1 - x0), Math.max(1, Math.abs(base - top))));
    }
  } else if (c.chart === "pie") {
    const data = c.data ?? [];
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
    const r = Math.min(box.w, box.h) / 2;
    const inner = (c.donut ?? 0) * r;
    let from = -Math.PI / 2;
    data.forEach((d, i) => {
      const sweep = (d.value / total) * Math.PI * 2;
      const steps = Math.max(3, Math.ceil(sweep / (Math.PI / 24)));
      const arc = (radius: number, reverse: boolean): Vec2[] =>
        Array.from({ length: steps + 1 }, (_, k): Vec2 => {
          const angle = from + sweep * ((reverse ? steps - k : k) / steps);
          return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
        });
      const shape = inner > 0 ? [...arc(r, false), ...arc(inner, true)] : [[cx, cy] as Vec2, ...arc(r, false)];
      out.set(`slice${i}`, { box: extent(shape, 0), shape: dense(shape), closed: true, color: d.color });
      from += sweep;
    });
  } else if (c.chart === "line" || c.chart === "area" || c.chart === "scatter") {
    const { x, y } = seriesDomains(c);
    const plot = makePlot(box, x, y);
    const lines = seriesLines(c.series ?? []);
    const colours = seriesColors(c, inks);
    if (c.chart !== "scatter")
      lines.forEach((line, i) => {
        const shape = line.map(([px, py]): Vec2 => [plot.sx(px), plot.sy(py)]);
        if (shape.length > 1) out.set(`series${i}`, { box: extent(shape, 4), shape, closed: false, color: colours[i % colours.length] });
      });
    (c.chart === "scatter" ? lines.flat() : (lines[0] ?? [])).forEach(([px, py], i) => out.set(`pt${i}`, ring(plot.sx(px), plot.sy(py), POINT_RING)));
  }
  return out;
}

/** Where `term` is drawn in an equation laid in `box`, or undefined when the equation does not write it. */
export function equationTerm(c: Extract<Component, { type: "equation" }>, box: Box, term: string): Segment | undefined {
  const size = c.size ?? 30;
  const local = mathTermBox(c.tex, size, term);
  if (!local) return undefined;
  const width = measureMath(c.tex, size).w;
  const cx = box.x + box.w / 2;
  const left = c.align === "center" ? cx - width / 2 : c.align === "right" ? cx - width : cx;
  const top = box.y + box.h / 2 - measureMath(c.tex, size).h / 2;
  return rect(left + local.x - 2, top + local.y - 2, local.w + 4, local.h + 4);
}

/** The family a chart mark belongs to: `bar3` → `bar`. Only marks of one family are siblings. */
const family = (name: string) => name.replace(/\d+$/, "");

/**
 * The mark `name` inside component `c` laid in `box`, and the siblings a cue on it softens: the other
 * marks of its family on a chart, none on an equation.
 */
export function segmentOf(c: Component, box: Box, name: string, inks: SeriesInks): { segment: Segment; siblings: Segment[] } | undefined {
  if (c.type === "equation") {
    const segment = equationTerm(c, box, name);
    return segment && { segment, siblings: [] };
  }
  if (c.type !== "chart") return undefined;
  const marks = chartSegments(c, box, inks);
  const segment = marks.get(name);
  if (!segment) return undefined;
  return { segment, siblings: [...marks].filter(([other]) => other !== name && family(other) === family(name)).map(([, mark]) => mark) };
}
