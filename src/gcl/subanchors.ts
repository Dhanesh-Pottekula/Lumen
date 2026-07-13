// src/gcl/subanchors.ts
/**
 * Sub-anchors — named points a rich component publishes inside its own placement box, so attention/
 * motion/callout can target a chart's peak, a map's region, a shape's edge, or a timeline's event
 * without any new plumbing: `layout.ts` registers each returned point as `"<id>.<handle>"` in the
 * same `boxes` map the ordinary anchor resolver (`resolvePosition`/`attnGeom`) already reads.
 *
 * PURE + ctx-free: every helper it calls (`makePlot`, `fitProjection`, `makeTimeline`) computes
 * geometry from data alone, no `CanvasRenderingContext2D` — so this runs once during layout, without
 * a canvas, and is exact on re-seek.
 */
import type { Box } from "./anchors";
import { makePlot } from "../render/charts";
import { circleShape, heartShape, polygonShape, starShape } from "../render/morph";
import { fitProjection, featureCenter } from "../render/geo";
import { makeTimeline } from "../render/timeline";
import type { Component } from "./schema";
import { compileExpr } from "./expr";
import { PROP_ANCHORS } from "./props";

export type Vec2 = [number, number];

function boxCenter(box: Box): Vec2 {
  return [box.x + box.w / 2, box.y + box.h / 2];
}

function genericBoxAnchors(box: Box): Record<string, Vec2> {
  const [cx, cy] = boxCenter(box);
  return {
    center: [cx, cy],
    top: [cx, box.y],
    bottom: [cx, box.y + box.h],
    left: [box.x, cy],
    right: [box.x + box.w, cy],
  };
}

function boxArea(box: Box) {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

/** chart bar: bar0..barN at each datum's plotted (sx,sy) — sx = slot center (mirrors barChart's own
 *  slot math in ../render/charts.ts), sy = the bar's top (value height). Plus `peak` (max-value datum) and
 *  `first`/`last`. */
function chartBarAnchors(c: Extract<Component, { type: "chart" }>, box: Box): Record<string, Vec2> {
  const data = c.data ?? [];
  if (data.length === 0) return {};
  const ymax = Math.max(1, ...data.map((d) => d.value));
  const plot = makePlot(boxArea(box), [0, 1], [0, ymax]);
  const slot = plot.w / data.length;
  const out: Record<string, Vec2> = {};
  let peakIdx = 0;
  data.forEach((d, i) => {
    const cx = plot.x + i * slot + slot / 2;
    const cy = plot.sy(d.value);
    out[`bar${i}`] = [cx, cy];
    if (d.value > data[peakIdx].value) peakIdx = i;
  });
  out.peak = out[`bar${peakIdx}`];
  out.first = out.bar0;
  out.last = out[`bar${data.length - 1}`];
  return out;
}

/** chart riemann: bar0..barN at each rectangle's top-center point, mirroring `paintRiemann`'s EXACT
 *  geometry in compile.ts — riemann components have NO `data`; they draw from `fn`/`xDomain`/`n` via
 *  `compileExpr`, so this reads those fields (with the same defaults: `xDomain` [0,1], `n` 8) and
 *  reproduces the same sampling, yDomain fallback, and per-rectangle x0/dx/top math (left-endpoint
 *  height, baseline at `plot.sy(0)`). Plus `peak` (the rectangle with the largest |fn value|) and
 *  `first`/`last`. */
function chartRiemannAnchors(c: Extract<Component, { type: "chart" }>, box: Box): Record<string, Vec2> {
  const [a, b] = c.xDomain ?? [0, 1];
  const n = Math.max(1, Math.floor(c.n ?? 8));
  const evalFn = compileExpr(c.fn ?? "x");
  const dx = (b - a) / n;

  // Same yDomain-fallback sampling paintRiemann uses (baseline 0 always included).
  const samples: number[] = [];
  for (let i = 0; i <= n; i++) samples.push(evalFn({ x: a + i * dx }));
  const finiteSamples = samples.filter((v) => Number.isFinite(v));
  const yMax = Math.max(0, ...finiteSamples, 1e-6);
  const yMin = Math.min(0, ...finiteSamples);
  const yDomain: [number, number] = c.yDomain ?? [yMin, yMax];
  const plot = makePlot(boxArea(box), [a, b], yDomain);
  const baseY = plot.sy(0);

  const out: Record<string, Vec2> = {};
  let peakIdx = 0;
  let peakAbs = -Infinity;
  for (let i = 0; i < n; i++) {
    const x0 = a + i * dx;
    const fx = evalFn({ x: x0 });
    const finiteFx = Number.isFinite(fx) ? fx : 0;
    const rx0 = plot.sx(x0);
    const rx1 = plot.sx(x0 + dx);
    const topFull = plot.sy(finiteFx);
    const top = finiteFx >= 0 ? topFull : baseY;
    out[`bar${i}`] = [(rx0 + rx1) / 2, top];
    const absVal = Math.abs(finiteFx);
    if (absVal > peakAbs) {
      peakAbs = absVal;
      peakIdx = i;
    }
  }
  out.peak = out[`bar${peakIdx}`];
  out.first = out.bar0;
  out.last = out[`bar${n - 1}`];
  return out;
}

/** chart line/area/scatter: pt0..ptN at each [x,y] datum's plotted point, via the same xDomain/
 *  yDomain fallback `paintChart` uses. Plus `peak` (max-y datum) and `first`/`last`. */
function chartSeriesAnchors(c: Extract<Component, { type: "chart" }>, box: Box): Record<string, Vec2> {
  const series = c.series ?? [];
  if (series.length === 0) return {};
  const xs = series.map(([x]) => x);
  const ys = series.map(([, y]) => y);
  const xDomain = c.xDomain ?? [Math.min(0, ...xs), Math.max(1, ...xs)];
  const yDomain = c.yDomain ?? [Math.min(0, ...ys), Math.max(1, ...ys)];
  const plot = makePlot(boxArea(box), xDomain, yDomain);
  const out: Record<string, Vec2> = {};
  let peakIdx = 0;
  series.forEach(([x, y], i) => {
    out[`pt${i}`] = [plot.sx(x), plot.sy(y)];
    if (y > series[peakIdx][1]) peakIdx = i;
  });
  out.peak = out[`pt${peakIdx}`];
  out.first = out.pt0;
  out.last = out[`pt${series.length - 1}`];
  return out;
}

/** chart pie: slice0..sliceN at each wedge's mid-angle midpoint (mirrors `pie()`'s own sweep math in
 *  ../render/charts.ts, at full sweep p=1 since sub-anchors describe the FINISHED layout). */
function chartPieAnchors(c: Extract<Component, { type: "chart" }>, box: Box): Record<string, Vec2> {
  const data = c.data ?? [];
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = Math.min(box.w, box.h) / 2;
  const inner = (c.donut ?? 0) * r;
  const lr = (r + inner) / 2;
  let a = -Math.PI / 2;
  const out: Record<string, Vec2> = {};
  data.forEach((d, i) => {
    const frac = d.value / total;
    const sweep = frac * Math.PI * 2;
    const mid = a + sweep / 2;
    out[`slice${i}`] = [cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr];
    a += sweep;
  });
  return out;
}

/** Cardinal points (top/bottom/left/right/center) + vertices (v0..vN, for polygon/star/heart) for a
 *  shape, centered on its own box (matches `pointsFor`'s cx/cy/r math in compile.ts). `circle`/`disc`
 *  publish cardinals only (no discrete vertex list); `path` publishes cardinals of its own bbox. */
function shapeAnchors(c: Extract<Component, { type: "shape" }>, box: Box): Record<string, Vec2> {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = c.r ?? Math.min(box.w, box.h) / 2;
  const out: Record<string, Vec2> = {
    center: [cx, cy],
    top: [cx, cy - r],
    bottom: [cx, cy + r],
    left: [cx - r, cy],
    right: [cx + r, cy],
  };
  let verts: Vec2[] | null = null;
  if (c.shape === "polygon") verts = polygonShape(cx, cy, r, c.sides ?? 5);
  else if (c.shape === "star") verts = starShape(cx, cy, r);
  else if (c.shape === "heart") verts = heartShape(cx, cy, r);
  else if (c.shape === "path" && c.points && c.points.length > 0) verts = c.points;
  if (verts) verts.forEach((v, i) => { out[`v${i}`] = v; });
  return out;
}

/** map: `<featureId>` → that feature's bbox-center (`featureCenter`), projected via the same
 *  `fitProjection` the map's own draw path uses (../render/geo.ts) — so the anchor lands exactly where the
 *  feature is drawn. Markers publish under their `label` (the only author-supplied identifier). */
function mapAnchors(c: Extract<Component, { type: "map" }>, box: Box): Record<string, Vec2> {
  const proj = fitProjection(c.features, boxArea(box));
  const out: Record<string, Vec2> = {};
  for (const f of c.features) out[f.id] = proj.project(featureCenter(f));
  for (const m of c.markers ?? []) {
    if (m.label) {
      const [x, y] = proj.project([m.lon, m.lat]);
      // geoMarker (../render/geo.ts) draws the icon centered at y - size/2. The schema has no per-marker
      // `size` field (compile.ts never passes one to geoMarker either), so this always resolves to
      // geoMarker's own default (16) — matching draw-time behavior exactly, not just approximating it.
      const MARKER_ICON_SIZE = 16;
      out[m.label] = [x, y - MARKER_ICON_SIZE / 2];
    }
  }
  return out;
}

/** timeline: `ev0..evN` at each event's `tl.sx(at)` (x) / `tl.trackY(track)` (y), via the same
 *  `makeTimeline` the timeline's own draw path uses (../render/timeline.ts). */
function timelineAnchors(c: Extract<Component, { type: "timeline" }>, box: Box): Record<string, Vec2> {
  const tl = makeTimeline(boxArea(box), c.from, c.to);
  const out: Record<string, Vec2> = {};
  (c.events ?? []).forEach((ev, i) => {
    out[`ev${i}`] = [tl.sx(ev.at), tl.trackY(0)];
  });
  return out;
}

/** prop: named local anchor points (`PROP_ANCHORS[c.name]`) placed at the prop's own transform — the
 *  box CENTER is the point `at` resolved to (same point `paintProp` translates to), each local
 *  `[lx,ly]` is scaled by `c.size ?? 1`, rotated by `c.angle ?? 0` DEGREES, then added to that center.
 *  This EXACTLY mirrors `paintProp`'s translate→rotate→(parts pre-scaled at authoring time) order in
 *  compile.ts, so e.g. `cannon2.muzzle` lands on the drawn muzzle regardless of size/angle. Props with
 *  no catalog entry in PROP_ANCHORS fall back to `{ center: boxCenter }`. */
function propAnchors(c: Extract<Component, { type: "prop" }>, box: Box): Record<string, Vec2> {
  const anchors = PROP_ANCHORS[c.name];
  const [px, py] = boxCenter(box);
  if (!anchors) return { center: [px, py] };
  const size = c.size ?? 1;
  const angle = ((c.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: Record<string, Vec2> = {};
  for (const [handle, [lx, ly]] of Object.entries(anchors)) {
    const sx = lx * size;
    const sy = ly * size;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    out[handle] = [px + rx, py + ry];
  }
  return out;
}

/**
 * Named points a rich component publishes, in absolute view coords, given its OWN placement box
 * (same box the layout engine already computed for its `id`). Pure/ctx-free. Types without a richer
 * breakdown (text, stat, icon, table, group, ...) fall back to `{ center: boxCenter }` only.
 */
export function subAnchors(c: Component, box: Box): Record<string, Vec2> {
  const generic = genericBoxAnchors(box);
  switch (c.type) {
    case "chart": {
      if (c.chart === "bar") return { ...generic, ...chartBarAnchors(c, box) };
      if (c.chart === "riemann") return { ...generic, ...chartRiemannAnchors(c, box) };
      if (c.chart === "line" || c.chart === "area" || c.chart === "scatter") return { ...generic, ...chartSeriesAnchors(c, box) };
      if (c.chart === "pie") return { ...generic, ...chartPieAnchors(c, box) };
      return generic;
    }
    case "shape":
      return { ...generic, ...shapeAnchors(c, box) };
    case "map":
      return { ...generic, ...mapAnchors(c, box) };
    case "timeline":
      return { ...generic, ...timelineAnchors(c, box) };
    case "prop":
      return { ...generic, ...propAnchors(c, box) };
    default:
      return generic;
  }
}
