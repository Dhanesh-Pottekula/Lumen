// src/gcl/compile.ts
import { clamp01, fadeText, radialGlow, drawSvg } from "../slides/anim";
import { estimateTextWidth, measureSuffix } from "./measure";
import {
  counterValue,
  drawCounter,
  drawScramble,
  drawSlam,
  drawTextAlongPath,
  drawTypewriter,
  drawWordReveal,
} from "../render/type-motion";
import { drawMath, drawMathTerm } from "../render/mathtext";
import { drawIcon, iconNames, colorSemantics } from "../render/icons";
import type { IconName } from "../render/icons";
import {
  axes,
  barChart,
  lineChart,
  makePlot,
  pie,
  plotFunction,
  scatter,
  seriesLines,
  type Datum,
} from "../render/charts";
import {
  circleShape,
  heartShape,
  polygonShape,
  starShape,
} from "../render/morph";
import { smoothPath, strokeOn, type Pt } from "../render/strokes";
import { arrowheadSize, drawBorderThenFill, erase, circumscribe, glowBorder, glowLine, pathArrowheads, strokeSequence } from "../render/strokeVerbs";
import { pointAt } from "../render/strokes";
import {
  borderAt,
  drawFeature,
  drawMap,
  featureCenter,
  flowArrow,
  geoMarker,
  circleRadius,
  circleReach,
  mapLegend,
  proportionalMark,
  type GeoFeature,
  type Projection,
} from "../render/geo";
import { formatValue } from "../render/datachart";
import {
  events as timelineEvents,
  eras as timelineEras,
  makeTimeline,
  playhead as timelinePlayhead,
  playheadChip as timelineChip,
  timelineAxis,
} from "../render/timeline";
import { drawMorph, morph as morph2, morphCorners } from "../render/morph";
import { angleArc, carryBetween, handleCourse, handleFrame, handleOutward, handlePoint, ringCourse, splitHandle, type Frame } from "../geometry/figure";
import { polylineLengths } from "../geometry/path";
import { boxPolygon } from "../geometry/place";
import { tracerDot } from "../render/strokeVerbs";
import { callout, pointerLine, type CalloutOptions } from "../render/callout";
import { speechLine } from "../render/speech";
import {
  cornerBrackets,
  convergingArrows,
  dimExcept,
  focusBox,
  focusRings,
  ghost as ghostVerb,
  highlightHalo,
  magnify as magnifyVerb,
  pointerArrow,
  sparkFlash,
} from "../render/focus";
import { predictReveal, withPunch } from "../render/sequence";
import type { CanvasSlideDefinition } from "../slides/types";
import type { ParsedScene } from "./parse";
import type {
  AttnVerb,
  Component,
  DrawComponent,
  EnterKind,
  FillStep,
  GeoPoint,
  Position,
  Vec2,
} from "./schema";
import { compileExpr } from "./expr";
import { PROP_CATALOG } from "./props";
import { drawTable } from "./table";
import { paintFigure } from "../render/figure";
import { timelineLanes } from "../render/timelanes";
import {
  layoutGroup,
  layoutScene,
  type LayoutResult,
  type Placement,
} from "./layout";
import { narrationTiming, resolveExit, resolveTiming } from "./timing";
import { applyEnterExit } from "./enterexit";
import { resolvePosition } from "./anchors";
import { attentionOpacity, attnGeom } from "./attention";
import { cameraAt, type CamDirective } from "./camera";
import { LOOP_LIMIT, linearPhase, motionsTransform, mutedAt, oscillateOffset } from "./motion";
import { getImage, primeImage } from "./images";
import { mapLegendFoot, mapProjection } from "./subanchors";
import { FLASH_MIN, GLOW_MAX_R, flashKept } from "./flash";
import { RIEMANN_DEFAULT, segmentOf, seriesColors, seriesDomains, type Segment } from "./segments";
import type { AttnGeom } from "./attention";
import { easeInOutCubic, phase, smooth } from "../render/motion";
import { masked } from "../render/reveal";
import { paintMask, type MaskOpts } from "./mask";
import type { MotionSpec } from "./schema";
import { emit, type EmitterConfig } from "../render/particles";
import { resolveEmitter } from "./particles";
import type { FrameCtx } from "../render/frame";
import { TEXTBOOK, type Theme } from "../render/theme";
import { MIN_TEXT, VIEW_HEIGHT, VIEW_WIDTH } from "./viewport";

const W = VIEW_WIDTH;
const H = VIEW_HEIGHT;

/** One stroke a thing draws, in view units. */
type Stroke = { points: Vec2[]; closed: boolean };

// A glow round drawn pixels: a wide soft blur under a tight one, so it reads at a glance and hugs the shape.
const HALO_BLURS = [18, 6];

/** The strokes a component paints with — a shape's outline, a curve, a diagram's lines and boxes, an SVG part's outlines. */
function drawnStrokes(c: Component, rc: RenderCtx): Stroke[] {
  if (c.type === "group") return c.children.flatMap((child) => drawnStrokes(child, rc));
  if (c.type === "svg") return (c.strokes ?? []).map((points) => ({ points, closed: false }));
  if (c.type === "figure") {
    return c.ops.flatMap((op): Stroke[] => {
      const at = ([x, y]: Pt): Vec2 => [rc.cx + x, rc.cy + y];
      if (op.op === "line") return [{ points: op.pts.map(at), closed: false }];
      if (op.op === "area") return [{ points: op.pts.map(at), closed: true }];
      if (op.op === "rect" && (op.stroke || op.fill)) return [{ points: [at([op.x, op.y]), at([op.x + op.w, op.y]), at([op.x + op.w, op.y + op.h]), at([op.x, op.y + op.h])], closed: true }];
      return [];
    });
  }
  if (c.type !== "shape" && c.type !== "parametric" && c.type !== "textPath") return [];
  if (c.type === "shape" && c.shape === "disc") return [];
  const closed = c.type === "shape" && (c.shape !== "path" || c.closed === true);
  const morphs = c.type === "shape" ? (c.motions ?? []).filter((spec): spec is Extract<MotionSpec, { kind: "morph" }> => spec.kind === "morph").sort((one, other) => (one.at ?? 0) - (other.at ?? 0)) : [];
  const shape = c.type === "shape" && morphs.length ? morphedShape(c, rc, morphs) : pointsFor(c as DrawComponent, rc);
  return shape && shape.length > 1 ? [{ points: shape.map(([x, y]): Vec2 => [x, y]), closed }] : [];
}

/** A morphing shape's outline at `rc.t`, the same one `paintShape` draws. */
function morphedShape(c: Extract<Component, { type: "shape" }>, rc: RenderCtx, morphs: Extract<MotionSpec, { kind: "morph" }>[]): Pt[] {
  const { cx, cy, w, h } = rc;
  const r = c.r ?? Math.min(w, h) / 2;
  const current = Math.max(0, morphs.filter((spec) => (spec.at ?? 0) <= rc.t).length - 1);
  const formOf = (spec: (typeof morphs)[number]) => spec.toPoints ?? morphTargetShape(spec.toShape ?? "circle", spec.sides, cx, cy, r);
  const morph = morphs[current];
  const a = current > 0 ? formOf(morphs[current - 1]) : (pointsFor(c, rc) ?? circleShape(cx, cy, r));
  return morph2(a, formOf(morph), linearPhase(rc.t, morph.at ?? 0, morph.dur ?? 1), { closed: c.shape !== "path" || c.closed === true });
}

/** A component with every point it draws carried by `f`: its outline, its children's, the shapes it morphs into. */
function mapPoints<T extends Component>(c: T, f: (p: Vec2) => Vec2): T {
  const node = c as Component & { points?: Vec2[]; children?: Component[]; path?: Vec2[] };
  return {
    ...c,
    ...(Array.isArray(node.points) ? { points: node.points.map(f) } : {}),
    ...(c.type === "textPath" ? { path: c.path.map(f) } : {}),
    ...(Array.isArray(node.children) ? { children: node.children.map((child) => mapPoints(child, f)) } : {}),
    ...(c.motions?.some((m) => m.kind === "morph")
      ? { motions: c.motions.map((m) => (m.kind === "morph" ? { ...m, ...(m.toPoints ? { toPoints: m.toPoints.map(f) } : {}), ...(m.toCorners ? { toCorners: m.toCorners.map(f) } : {}) } : m)) }
      : {}),
  };
}

/** A linear map [xx, xy, yx, yy] a pinned picture is drawn under about its own centre: the turn and stretch of its frame. */
type PinTurn = [number, number, number, number];

const sameFrame = (a: Frame, b: Frame) => [[a.o, b.o], [a.x, b.x], [a.y, b.y]].every(([p, q]) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6);

/** A frame moved as `f` moves the points in it. */
function carryFrame(frame: Frame, f: (p: Vec2) => Vec2): Frame {
  const o = f(frame.o);
  const x = f([frame.o[0] + frame.x[0], frame.o[1] + frame.x[1]]);
  const y = f([frame.o[0] + frame.y[0], frame.o[1] + frame.y[1]]);
  return { o, x: [x[0] - o[0], x[1] - o[1]], y: [y[0] - o[0], y[1] - o[1]] };
}

/** Applies a pinned picture's turn and stretch about its centre. */
function turnAbout(ctx: CanvasRenderingContext2D, turn: PinTurn, cx: number, cy: number): void {
  ctx.translate(cx, cy);
  ctx.transform(turn[0], turn[1], turn[2], turn[3], 0, 0);
  ctx.translate(-cx, -cy);
}

/** How much `f` scales lengths near `at`. */
function mapScale(f: ((p: Vec2) => Vec2) | undefined, at: Vec2): number {
  if (!f) return 1;
  const frame = carryFrame({ o: at, x: [1, 0], y: [0, 1] }, f);
  return Math.sqrt(Math.abs(frame.x[0] * frame.y[1] - frame.x[1] * frame.y[0])) || 1;
}

function boxAround(points: Vec2[]): { x: number; y: number; w: number; h: number } {
  const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Where a cue on drawn strokes stands: their middle, and the box they span. */
function geomOf(strokes: Stroke[]): AttnGeom {
  const box = boxAround(strokes.flatMap((one) => one.points));
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, r: Math.max(box.w, box.h) / 2, box };
}

const COMPASS: Exclude<CalloutOptions["side"], undefined | "auto">[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

/** The callout side a direction on screen points to. */
function compassOf([x, y]: Vec2): CalloutOptions["side"] {
  return COMPASS[((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8];
}

const unlit = new Set<string>();
/** A cue aimed at something with nothing drawn to glow along and no box to glow round: reported once, and nothing stands in for it. */
function nothingToGlow(target: unknown): void {
  const name = JSON.stringify(target);
  if (unlit.has(name)) return;
  unlit.add(name);
  console.warn(`gcl: nothing is drawn for ${name} to glow along`);
}

/** A mark inside a painted chart or equation, by its name there, the siblings a cue on it softens, and the thing it is drawn in. */
type Mark = { name: string; segment: Segment; siblings: Segment[]; owner: Extract<DrawComponent, { type: "chart" | "equation" }> };

/** Cues that light one thing and so fade its sibling pieces back; the rest point, label, grey or strike. */
const SOFTENING: ReadonlySet<AttnVerb> = new Set(["highlight", "spotlight", "box", "brackets", "encircle", "outline", "converge", "spark", "vignette", "rings", "trace"]);
/** How far a softened sibling fades back toward the page. */
const SOFTENED_BY = 0.6;
// How much zoom a shot takes before writing its edge cuts has wholly stepped back.
const SHOT_RAMP = 0.3;
const WRITING_TYPES: ReadonlySet<DrawComponent["type"]> = new Set(["text", "equation", "measure"]);

/** About the box a label's plate takes round its spot, for telling whether a shot's edge cuts it. */
function plateAround([x, y]: Vec2, text: string, fontPx = 20): { x: number; y: number; w: number; h: number } {
  const [w, h] = [text.length * fontPx * 0.55 + 16, fontPx * 1.4 + 12];
  return { x: x - w / 2, y: y - h / 2, w, h };
}
// Anything this small or smaller is a point to ring, not a thing to glow round.
const POINT_SIZE = 48;

type Rect = { x: number; y: number; w: number; h: number };
// A trend arrow stands a third of what it marks high, kept between sizes a phone reads at a glance.
const TREND_SHARE = 1 / 3;
const TREND_PX: readonly [number, number] = [36, 72];
const TREND_GAP = 12;
const TREND_WIDE = 0.72;
// How long a trend takes to settle from the accent to ink once its beat ends.
const TREND_SETTLE = 0.4;
// A bold up arrow in a unit box: a triangle head over a thick stem, tip at the top.
const TREND_GLYPH: readonly Vec2[] = [[0.5, 0], [1, 0.5], [0.69, 0.5], [0.69, 1], [0.31, 1], [0.31, 0.5], [0, 0.5]];

/**
 * Where a trend arrow stands beside `box`: right, left, above or below, the first inside the view and clear
 * of `avoid`, shrinking from its own height to the smallest readable one before it settles for any side in view.
 */
function trendSpot(box: Rect, tall: number, avoid: Rect[], viewW: number, viewH: number): Rect {
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  const sidesAt = (h: number): Rect[] => {
    const w = h * TREND_WIDE;
    return [
      { x: box.x + box.w + TREND_GAP, y: cy - h / 2, w, h },
      { x: box.x - TREND_GAP - w, y: cy - h / 2, w, h },
      { x: cx - w / 2, y: box.y - TREND_GAP - h, w, h },
      { x: cx - w / 2, y: box.y + box.h + TREND_GAP, w, h },
    ];
  };
  const inView = (spot: Rect) => spot.x >= 8 && spot.y >= 8 && spot.x + spot.w <= viewW - 8 && spot.y + spot.h <= viewH - 8;
  const clear = (spot: Rect) => !avoid.some((one) => spot.x < one.x + one.w && one.x < spot.x + spot.w && spot.y < one.y + one.h && one.y < spot.y + spot.h);
  const heights = [tall, ...Array.from({ length: Math.ceil((tall - TREND_PX[0]) / 6) }, (_, k) => Math.max(TREND_PX[0], tall - 6 * (k + 1)))];
  const open = heights.flatMap(sidesAt).find((spot) => inView(spot) && clear(spot)) ?? sidesAt(TREND_PX[0]).find(inView);
  if (open) return open;
  const [right] = sidesAt(TREND_PX[0]);
  return { ...right, x: Math.min(right.x, viewW - 8 - right.w), y: Math.max(8, Math.min(right.y, viewH - 8 - right.h)) };
}

const ROLE_FONT: Record<
  NonNullable<Extract<Component, { type: "text" }>["role"]>,
  { weight: number; size: number }
> = {
  body: { weight: 500, size: 20 },
  bullet: { weight: 500, size: 18 },
  caption: { weight: 600, size: MIN_TEXT },
};

/** Each line of a wrapped text as a text of its own, centred in its row of the text's box. */
function eachLine(
  c: Extract<Component, { type: "text" }>,
  rc: RenderCtx,
  draw: (line: Extract<Component, { type: "text" }>, lineRc: RenderCtx, index: number, count: number) => void,
) {
  const lines = c.text.split("\n");
  const size = c.size ?? ROLE_FONT[c.role ?? "body"].size;
  lines.forEach((text, index) =>
    draw(
      { ...c, text },
      { ...rc, cy: rc.cy + (index - (lines.length - 1) / 2) * size * 1.3, w: estimateTextWidth(text, size), h: size * 1.3 },
      index,
      lines.length,
    ),
  );
}

function textFont(
  c: Extract<Component, { type: "text" }>,
  fontFamily: string,
): string {
  const role = ROLE_FONT[c.role ?? "body"];
  const size = c.size ?? role.size;
  return `${role.weight} ${size}px ${fontFamily}`;
}

/** Build a measure's unit suffix: symbol units (`%`, `+`, `°`, `‰`) attach directly (`16%`), word units
 *  get a leading space (`24,000,000 km²`, `1260 CE`) — matching the original counters. */
/**
 * Draw the meter that turns a figure into a quantity you can see.
 *
 * `filled` is where the value sits between the scale's bounds, already eased in step with the
 * digits, so the length and the number are one fact told twice. The whole track is a thick hollow
 * outline and the filled share of it is solid, both in the meter's colour, so half a meter reads as
 * half hollow and half full on any page. A bar sits in the row under the figure; a ring round it.
 */
function drawMeter(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, filled: number, meter: "bar" | "ring", color: string) {
  const p = Math.max(0, Math.min(1, filled));
  const rim = Math.max(2.5, size * 0.06);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (meter === "ring") {
    const [r, thickness] = [size * 1.32, size * 0.3];
    ctx.lineWidth = rim;
    for (const edge of [r - thickness / 2, r + thickness / 2]) {
      ctx.beginPath();
      ctx.arc(cx, cy, edge, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p > 0) {
      const start = -Math.PI / 2;
      ctx.lineWidth = thickness;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + Math.PI * 2 * p);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const { width, thickness, middle } = meterBar(size);
  const [x, y] = [cx - width / 2, cy + middle - thickness / 2];
  ctx.beginPath();
  ctx.roundRect(x, y, width, thickness, thickness / 2);
  if (p > 0) {
    ctx.save();
    ctx.clip();
    ctx.fillRect(x, y, width * p, thickness);
    ctx.restore();
  }
  ctx.lineWidth = rim;
  ctx.stroke();
  ctx.restore();
}

/** A bar meter's track for a figure of `size`: its length, its thickness, and how far under the figure's middle it runs. */
const meterBar = (size: number) => ({ width: size * 4.5, thickness: Math.max(14, size * 0.4), middle: size * 0.28 });

/** Where a measure writes its figure and its label, as baselines: a bar meter takes the row between them. */
function measureRows(c: { scale?: [number, number]; meter?: "bar" | "ring" }, cy: number, size: number): { digits: number; label: number } {
  if (!c.scale || c.meter === "ring") return { digits: cy, label: cy + size * 0.6 };
  const { thickness, middle } = meterBar(size);
  return { digits: cy - size * 0.16, label: cy + middle + thickness / 2 + size * 0.18 + MIN_TEXT * 0.75 };
}

const meterFill = (c: { value: number; scale?: [number, number] }, reading: number): number | undefined => {
  if (!c.scale) return undefined;
  const span = c.scale[1] - c.scale[0];
  return span === 0 ? 0 : (reading - c.scale[0]) / span;
};

/** Kinetic text kinds `enter.type` can drive when the author omits `mode`. */
const KINETIC_ENTER_KINDS = ["word", "typewriter", "slam", "scramble"] as const;
type TextMode = "fade" | "word" | "typewriter" | "slam" | "scramble";

/** Resolve a text component's kinetic style when `mode` is absent: fall back to `enter.type` when
 *  it names one of the kinetic kinds, else plain fade. `mode` (when set) always wins in the caller. */
function textModeFromEnter(enterType: EnterKind | undefined): TextMode {
  if (
    enterType &&
    (KINETIC_ENTER_KINDS as readonly string[]).includes(enterType)
  ) {
    return enterType as TextMode;
  }
  return "fade";
}

/** Resolve a motion spec's effective start time and return a normalized copy with `at` filled in, so
 *  `motionTransform` never has to reason about `cue`/`start` itself (it only ever reads `spec.at`).
 *  Priority mirrors `resolveTiming`'s component-level rule: explicit `spec.at` wins; else `spec.cue`
 *  (via the scene's narration `cueTimes`); else a numeric `spec.start`; else fall back to the
 *  component's own resolved start time (`componentAt`), so an un-timed motion begins when its
 *  component does. Only `move` currently declares `cue`/`start` in the schema, but this resolves any
 *  motion kind uniformly (future kinds gain the same wiring for free). */
export function resolveMotionAt(
  spec: MotionSpec,
  cueTimes: number[],
  componentAt: number,
): number {
  if (spec.at !== undefined) return spec.at;
  const cue = "cue" in spec ? spec.cue : undefined;
  if (cue != null && cueTimes[cue] !== undefined) return cueTimes[cue];
  const start = "start" in spec ? spec.start : undefined;
  if (typeof start === "number") return start;
  return componentAt;
}

type LayerName = "bg" | "mid" | "fg" | "annotation" | "fx";

/** Default layer for a component type when it doesn't specify one explicitly. */
function defaultLayerFor(type: Component["type"]): LayerName {
  switch (type) {
    case "text":
    case "equation":
    case "measure":
    case "legend":
    case "icon":
      return "annotation";
    case "chart":
    case "shape":
    case "parametric":
    case "map":
    case "timeline":
    case "textPath":
    case "table":
    case "figure":
      return "mid";
    case "image":
    case "vector":
    case "svg":
    case "prop":
      return "bg";
    default:
      return "annotation";
  }
}

/** Named lon/lat points a `map` exposes for targeting: explicit `places`, plus every feature `id`
 *  (→ its centroid) and every marker `label`. Keys are lowercased. Used to resolve a place NAME to a
 *  lon/lat both for scene-wide targets (`buildSceneGeo`) and for a map's own `flows`. */
function mapPlaceNames(
  m: Extract<Component, { type: "map" }>,
): Map<string, [number, number]> {
  const names = new Map<string, [number, number]>();
  for (const p of m.places ?? [])
    names.set(p.name.toLowerCase(), [p.lon, p.lat]);
  for (const mk of m.markers ?? [])
    if (mk.label) names.set(mk.label.toLowerCase(), [mk.lon, mk.lat]);
  for (const f of m.features)
    names.set(
      f.id.toLowerCase(),
      featureCenter(f as GeoFeature) as [number, number],
    );
  return names;
}

/** Strip an optional `place:`/`region:`/`khanate:`/`city:`/`geo:` prefix and look a name up. */
function lookupPlace(
  names: Map<string, [number, number]>,
  key: string,
): [number, number] | undefined {
  return names.get(
    key.replace(/^(place|region|khanate|city|geo):/i, "").toLowerCase(),
  );
}

/** Build the scene's geographic resolver from its `map`(s): a function that projects a `{lon,lat}`
 *  point or a named place/region/feature to a screen point (returns null for anything non-geographic,
 *  so plain strings still fall through to id-anchor resolution). The projection comes from the first
 *  map with an explicit pixel box + geometry, through the same `mapProjection` the painter uses, so
 *  a targeted place lands exactly where the map draws it. Undefined when the scene has no such map. */
function buildSceneGeo(
  components: DrawComponent[],
): ((pos: Position) => Vec2 | null) | undefined {
  const maps = components.filter(
    (c): c is Extract<Component, { type: "map" }> => c.type === "map",
  );
  let proj: Projection | null = null;
  const names = new Map<string, [number, number]>();
  for (const m of maps) {
    if (!Array.isArray(m.at)) continue; // need an explicit pixel box to derive the projection
    const [cx, cy] = m.at as [number, number];
    const w = m.w ?? W - 80;
    const h = m.h ?? H - 120;
    const mp = mapProjection(m, { x: cx - w / 2, y: cy - h / 2, w, h });
    if (!proj) proj = mp;
    for (const [k, v] of mapPlaceNames(m)) if (!names.has(k)) names.set(k, v);
  }
  if (!proj) return undefined;
  const P = proj;
  return (pos: Position): Vec2 | null => {
    if (
      typeof pos === "object" &&
      !Array.isArray(pos) &&
      typeof (pos as GeoPoint).lon === "number"
    ) {
      const gp = pos as GeoPoint;
      return P.project([gp.lon, gp.lat]);
    }
    if (typeof pos === "string") {
      const ll = lookupPlace(names, pos);
      if (ll) return P.project(ll);
    }
    return null;
  };
}

/** Compile one parsed scene into a seekable CanvasSlideDefinition. Phase 1a: content family + layout + narration timing.
 *  Phase 2: every component's draw is routed through `applyEnterExit`, which composes the entrance/exit
 *  vocabulary (native/masked/transform) around the component's own content paint.
 *  Phase 3: `{type:"camera"}` items are directives (excluded from the draw loop & layout auto-flow),
 *  resolved once into a pure `cameraAt(t)` and applied via `frame.setCamera`. Every drawn component's
 *  own placement is wrapped in a `motionTransform`/`oscillateOffset` transform (the OUTER save/
 *  translate/rotate/scale), with `applyEnterExit` painted INNER — motion carries the box, enter/exit
 *  animates the content within it.
 *  Phase 4: `{type:"attention"}` items are ALSO directives (excluded from the draw loop & layout
 *  auto-flow, like camera) but timed like any component; each resolves its `target`/`from` anchor via
 *  `attnGeom` against the layout's `boxes` map and dispatches to a (B)-class overlay verb on the
 *  annotation layer (spotlight/dim/vignette use the fx layer so the scrim sits above content).
 *  Subject modifiers (`emphasis`/`ghost`/`magnify`/`predict`, Base props on any drawn component) wrap
 *  that component's own content paint in the (A)-class verbs — composed just inside the motion
 *  transform, around `applyEnterExit`. */
export interface CompileSceneOptions {
  /** Solid host-supplied backdrop used instead of the scene's theme gradient. */
  backgroundColor?: string;
}

export function compileScene(
  scene: ParsedScene,
  theme: Theme = TEXTBOOK,
  options: CompileSceneOptions = {},
): CanvasSlideDefinition {
  const { marker, components } = scene;
  const cueTimes = narrationTiming(marker.narration ?? []);

  // Camera and attention directives are excluded from layout auto-flow and the draw loop; split them
  // out up front (attention items have no measured content, same as camera).
  const drawComponents = components.filter(
    (c): c is DrawComponent => c.type !== "camera" && c.type !== "attention",
  );
  // Start decoding embedded SVGs while the slide is being assembled instead of waiting for paint.
  // The data URLs are still cached by markup, and seeking never creates a second image instance.
  drawComponents.forEach((component) => {
    if (component.type === "svg") primeSvgImage(component.markup);
    if (component.type === "image") void primeImage(component.src).catch(() => undefined);
  });
  const cameraComponents = components.filter(
    (c): c is Extract<Component, { type: "camera" }> => c.type === "camera",
  );
  const cues = components.filter(
    (c): c is Extract<Component, { type: "attention" }> =>
      c.type === "attention",
  );

  // Scene-wide geographic resolver (pure, from the scene's map geometry) — lets camera `to`, attention
  // `target`, and any component `at` reference a `{lon,lat}` point or a place/region/feature name.
  const geo = buildSceneGeo(drawComponents);

  const timings = resolveTiming(drawComponents, { cueTimes });
  const camTimings = resolveTiming(cameraComponents, { cueTimes });
  // The flash ceiling: a burst too soon after the one before it is left out (see ./flash.ts).
  const cueTimings = resolveTiming(cues, { cueTimes });
  const flashes = flashKept(cues.map((c) => c.verb), cueTimings);
  const attnComponents = cues.filter((_, i) => flashes[i]);
  const attnTimings = cueTimings.filter((_, i) => flashes[i]);
  // A component's own entrance (`at + dur`) isn't the only thing that can outlast the scene: a
  // bounded-dur `motion` (orbit/along/fall/trace/morph/a dur'd move) can run well past the
  // entrance window and would otherwise get cut off mid-flight. Fold each such motion's own end
  // time (resolved start + its `dur`) into the same max used for the entrance-only `lastEnd`.
  // Continuous motions (`spin`/`orbit` with no `dur`) have no natural end, so they don't extend it.
  const motionEnd = drawComponents.reduce(
    (m, c, i) =>
      (c.motions ?? []).reduce(
        (end, spec) => (spec.dur === undefined ? end : Math.max(end, resolveMotionAt(spec, cueTimes, timings[i].at) + spec.dur)),
        m,
      ),
    0,
  );
  const lastEnd = Math.max(
    timings.reduce((m, t) => Math.max(m, t.at + t.dur), 0),
    camTimings.reduce((m, t) => Math.max(m, t.at + t.dur), 0),
    attnTimings.reduce((m, t) => Math.max(m, t.at + t.dur), 0),
    motionEnd,
  );
  const duration = marker.duration ?? Math.max(4, lastEnd + 1.5);

  // Layout + the camera's directive list are both pure/ctx-free, so both are computed once and
  // cached in a closure — independent of `t`, safe for a seekable/scrubbable render.
  let laid: LayoutResult | null = null;
  let camDirectives: CamDirective[] | null = null;
  const marks = new Map<string, Mark | undefined>();
  /** The mark a `<id>.<mark>` target names inside a painted chart or equation, at rest; undefined for anything with a box of its own. */
  const markOf = (target: unknown): Mark | undefined => {
    if (typeof target !== "string" || drawComponents.some((c) => c.id === target)) return undefined;
    if (marks.has(target)) return marks.get(target);
    const owner = drawComponents
      .filter((c) => c.id && (c.type === "chart" || c.type === "equation") && target.startsWith(`${c.id}.`))
      .sort((a, b) => b.id!.length - a.id!.length)[0];
    const place = owner && laid ? laid.placements[drawComponents.indexOf(owner)] : undefined;
    const name = owner ? target.slice(owner.id!.length + 1) : "";
    const found = owner && place ? segmentOf(owner, { x: place.cx - place.w / 2, y: place.cy - place.h / 2, w: place.w, h: place.h }, name, theme.palette) : undefined;
    const mark = found && owner ? { ...found, name, owner: owner as Mark["owner"] } : undefined;
    marks.set(target, mark);
    return mark;
  };

  return {
    duration,
    viewW: W,
    viewH: H,
    render(ctx, t, frame) {
      if (!frame) {
        ctx.clearRect(0, 0, W, H);
        return;
      }
      if (!laid) {
        laid = layoutScene(drawComponents, W, H, geo);
        // A mark inside a painted thing — an equation's term, a chart's line — has no box of its own
        // until something aims at it: registered here, labels and the camera find it like any id.
        for (const target of [...attnComponents.flatMap((c) => [c.target, c.from]), ...cameraComponents.map((c) => c.to)]) {
          const mark = typeof target === "string" && !laid.boxes.has(target) ? markOf(target) : undefined;
          if (mark) laid.boxes.set(target as string, mark.segment.box);
        }
        // A point along a side (`fig.s1@0.3`) is named by its own fraction, so it is registered where aimed at.
        const aimed = [
          ...attnComponents.flatMap((c) => [c.target, c.from]),
          ...cameraComponents.map((c) => c.to),
          ...drawComponents.flatMap((c) => [...(c.ends ?? []), ...(c.arc ? [c.arc.at, c.arc.from, c.arc.to] : []), ...(c.motions ?? []).flatMap((m) => ("to" in m ? [m.to] : "center" in m ? [m.center] : []))]),
        ];
        for (const target of aimed) {
          const handle = typeof target === "string" && !laid.boxes.has(target) ? splitHandle(target) : undefined;
          const figure = handle && drawComponents.find((c) => c.id === handle.owner)?.figure;
          const point = handle && figure ? handlePoint(figure, figure.corners, handle.name) : undefined;
          if (point) laid.boxes.set(target as string, { x: point[0] - 16, y: point[1] - 16, w: 32, h: 32 });
        }
      }
      const placements = laid.placements;
      const boxes = laid.boxes;

      if (!camDirectives) {
        camDirectives = cameraComponents.map((c, i) => {
          const { at, dur } = camTimings[i];
          const [fx, fy] = resolvePosition(c.to, {
            viewW: W,
            viewH: H,
            boxes,
            geo,
          });
          return {
            at,
            dur,
            focal: [fx, fy] as [number, number],
            zoom: c.zoom ?? 1,
            rot: c.rot ?? 0,
            kind: c.kind ?? "move",
          };
        });
      }
      const cam = cameraAt(camDirectives, t, W, H);
      frame.setCamera(cam);
      // In a close shot, writing the shot's edge cuts through reads as a stray fragment ("miles"); it steps
      // back while the shot holds, and comes back as the camera lets go. Writing wholly in the shot stays.
      const shotIn = clamp01((cam.zoom - 1) / SHOT_RAMP);
      const shot = { x: cam.x - W / 2 / cam.zoom, y: cam.y - H / 2 / cam.zoom, w: W / cam.zoom, h: H / cam.zoom };
      const cutByShot = (box: { x: number; y: number; w: number; h: number }): number => {
        if (shotIn <= 0) return 1;
        const meets = box.x < shot.x + shot.w && shot.x < box.x + box.w && box.y < shot.y + shot.h && shot.y < box.y + box.h;
        const within = box.x >= shot.x - 1 && box.y >= shot.y - 1 && box.x + box.w <= shot.x + shot.w + 1 && box.y + box.h <= shot.y + shot.h + 1;
        return meets && !within ? 1 - shotIn : 1;
      };

      // Screen-fixed HUD: any `fixed` component renders on `fg`, which we pin to screen space so it
      // ignores the camera (mirrors the original's `frame.layer.set("annotation",{screenspace:true})`).
      // Set only when this scene actually has a fixed component, so no other scene/lesson is affected.
      if (drawComponents.some((c) => c.fixed))
        frame.layer.set("fg", { screenspace: true });

      const bg = frame.layer.ctx("bg");
      if (options.backgroundColor) {
        bg.fillStyle = options.backgroundColor;
      } else {
        const [c0, c1] = marker.bg ?? [theme.palette.bg, theme.palette.surface];
        const g = bg.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, c0);
        g.addColorStop(1, c1);
        bg.fillStyle = g;
      }
      bg.fillRect(0, 0, W, H);

      const resolveFocal = (pos: unknown): [number, number] =>
        resolvePosition(pos as Component["at"], {
          viewW: W,
          viewH: H,
          boxes,
          geo,
        });

      // Every anchor in the layout is a RESTING box, so anything aimed at a thing that has travelled
      // points where it started — labels at empty space, a string left hanging beside its bob. A
      // component's motion is a pure function of `t`, so the same displacement is applied to both.
      const motionShift = (target: unknown, now: number): [number, number] => {
        if (typeof target !== "string") return [0, 0];
        // A part that travels on its own carries its own motion; one that only rides along with its
        // artwork has none of its own and takes the artwork's.
        const own = drawComponents.findIndex((d) => d.id === target && d.motions?.length);
        const index = own >= 0 ? own : drawComponents.findIndex((d) => d.id === target.split(".")[0]);
        const moving = index < 0 ? undefined : drawComponents[index].motions;
        if (!moving?.length) return [0, 0];
        const specs = moving.map((spec) => ({ ...spec, at: resolveMotionAt(spec, cueTimes, timings[index].at) }) as MotionSpec);
        const place = placements[index];
        const box = { x: place.cx - place.w / 2, y: place.cy - place.h / 2, w: place.w, h: place.h };
        const { dx, dy } = motionsTransform(specs, box, now, resolveFocal);
        return [dx, dy];
      };

      // Where everything is NOW. A thing drawn in another's frame (`pin`) is carried with that frame; a
      // figure's corners and sides go with it as it moves, turns and changes shape; every connector,
      // angle, mark, label and glow aimed at them is drawn from these, never from where they rested.
      const indexOf = new Map<string, number>();
      drawComponents.forEach((d, i) => {
        if (d.id !== undefined && !indexOf.has(d.id)) indexOf.set(d.id, i);
      });
      let depth = 0;
      const guarded = <T,>(fallback: T, work: () => T): T => {
        if (depth > 12) return fallback;
        depth++;
        try {
          return work();
        } finally {
          depth--;
        }
      };
      const pinCarry = (index: number, now: number): ((p: Vec2) => Vec2) | undefined =>
        guarded(undefined, () => {
          const pin = drawComponents[index].pin;
          const live = pin && frameNow(pin.ref, pin, now);
          if (!pin || !live || sameFrame(live, pin)) return undefined;
          return carryBetween(pin, live);
        });
      const placeOf = (index: number, now: number): Placement => {
        const place = placements[index];
        const carry = pinCarry(index, now);
        if (!carry) return place;
        const [cx, cy] = carry([place.cx, place.cy]);
        return { ...place, cx, cy };
      };
      // A point on a pinned thing or on what it is pinned to rides the pin: wings spun about the bee's
      // back read the back where the bee rested, and swung wide of a bee that had moved.
      const focalOf = (index: number, now: number): ((pos: unknown) => [number, number]) => {
        const c = drawComponents[index];
        const carry = pinCarry(index, now);
        if (!carry || !c.pin) return resolveFocal;
        const owners = new Set([c.id, c.pin.ref.split(".")[0]]);
        return (pos) => {
          const rest = resolveFocal(pos);
          return typeof pos === "string" && owners.has(pos.split(".")[0]) ? carry(rest) : rest;
        };
      };
      /** The turn and stretch a picture pinned in another's frame takes from that frame now, as a matrix about its own centre. */
      const pinTurn = (index: number, now: number): PinTurn | undefined => {
        const c = drawComponents[index];
        const carry = c.type === "image" ? pinCarry(index, now) : undefined;
        if (!carry) return undefined;
        const place = placements[index];
        const { x, y } = carryFrame({ o: [place.cx, place.cy], x: [1, 0], y: [0, 1] }, carry);
        const turn: PinTurn = [x[0], x[1], y[0], y[1]];
        return Math.abs(turn[0] - 1) < 1e-4 && Math.abs(turn[1]) < 1e-4 && Math.abs(turn[2]) < 1e-4 && Math.abs(turn[3] - 1) < 1e-4 ? undefined : turn;
      };
      /** The component's own motion at `now`, as the draw applies it: about its placement's centre. */
      const motionMap = (index: number, now: number): ((p: Vec2) => Vec2) | undefined => {
        const c = drawComponents[index];
        if (!c.motions?.length && !c.oscillate) return undefined;
        const place = placeOf(index, now);
        const specs = (c.motions ?? []).map((spec) => ({ ...spec, at: resolveMotionAt(spec, cueTimes, timings[index].at) }) as MotionSpec);
        const box = { x: place.cx - place.w / 2, y: place.cy - place.h / 2, w: place.w, h: place.h };
        const mt = motionsTransform(specs, box, now, focalOf(index, now), orbitCentre(now));
        const osc = oscillateOffset(c.oscillate, now, timings[index].at);
        const [dx, dy, rot, scale] = [mt.dx + osc.dx, mt.dy + osc.dy, mt.rot + osc.rot, mt.scale * (1 + osc.scale)];
        if (dx === 0 && dy === 0 && rot === 0 && scale === 1) return undefined;
        const [cos, sin] = [Math.cos(rot) * scale, Math.sin(rot) * scale];
        return ([x, y]) => [place.cx + dx + cos * (x - place.cx) - sin * (y - place.cy), place.cy + dy + sin * (x - place.cx) + cos * (y - place.cy)];
      };
      const liveMap = (index: number, now: number): ((p: Vec2) => Vec2) | undefined => {
        const [carry, move] = [pinCarry(index, now), motionMap(index, now)];
        if (!carry) return move;
        return move ? (point) => move(carry(point)) : carry;
      };
      /** The component that carries `target`: itself when it moves or is drawn in a frame, else the thing it is a part of. */
      const carrierOf = (target: unknown): number | undefined => {
        if (typeof target !== "string") return undefined;
        const own = indexOf.get(target);
        if (own !== undefined && (drawComponents[own].motions?.length || drawComponents[own].pin || drawComponents[own].oscillate)) return own;
        return indexOf.get(target.split(".")[0]) ?? own;
      };
      const followOf = (target: unknown, now: number): ((p: Vec2) => Vec2) | undefined => {
        const index = carrierOf(target);
        return index === undefined ? undefined : liveMap(index, now);
      };
      /** A figure's corners at `now`: carried in its frame, part of the way through any change of shape, moved as it moves. */
      const liveCorners = (index: number, now: number): Vec2[] => {
        const c = drawComponents[index];
        const figure = c.figure!;
        const carry = pinCarry(index, now);
        const pinnedCorners = (corners: Vec2[]) => (carry ? corners.map(carry) : corners);
        let corners = pinnedCorners(figure.corners);
        const morphs = (c.motions ?? [])
          .filter((spec): spec is Extract<MotionSpec, { kind: "morph" }> => spec.kind === "morph" && spec.toCorners !== undefined)
          .sort((one, other) => (one.at ?? 0) - (other.at ?? 0));
        const current = Math.max(0, morphs.filter((spec) => (spec.at ?? 0) <= now).length - 1);
        const morph = morphs[current];
        if (morph && now >= (morph.at ?? 0) - 1e-9) {
          const from = current > 0 ? pinnedCorners(morphs[current - 1].toCorners!) : corners;
          const to = pinnedCorners(morph.toCorners!);
          const p = linearPhase(now, morph.at ?? 0, morph.dur ?? 1);
          const next = from.map((point, i): Vec2 => [...(to[i] ?? point)] as Vec2);
          for (const ring of figure.rings) {
            const moved = morphCorners(ring.at.map((i) => from[i]), ring.at.map((i) => to[i] ?? from[i]), p, ring.closed);
            ring.at.forEach((i, k) => (next[i] = [moved[k][0], moved[k][1]]));
          }
          corners = next;
        }
        const move = motionMap(index, now);
        return move ? corners.map(move) : corners;
      };
      const liveHandle = (target: unknown, now: number) => {
        const handle = typeof target === "string" ? splitHandle(target) : undefined;
        const index = handle ? indexOf.get(handle.owner) : undefined;
        const figure = index === undefined ? undefined : drawComponents[index].figure;
        if (!handle || index === undefined || !figure) return undefined;
        const corners = guarded(figure.corners, () => liveCorners(index, now));
        const point = handlePoint(figure, corners, handle.name);
        if (!point) return undefined;
        const rest = handlePoint(figure, figure.corners, handle.name) ?? point;
        return { index, figure, corners, name: handle.name, point, rest, course: handleCourse(figure, corners, handle.name) };
      };
      /** The frame `ref` sets at `now`: a figure's live corner or side, or the thing it names carried as that thing moves. */
      const frameNow = (ref: string, rest: Frame, now: number): Frame | undefined => {
        const handle = liveHandle(ref, now);
        if (handle) {
          const move = liveMap(handle.index, now);
          return handleFrame(handle.figure, handle.corners, handle.name, handle.figure.unit * mapScale(move, handle.point));
        }
        const move = followOf(ref, now);
        return move ? carryFrame(rest, move) : rest;
      };

      const livePoint = (target: Position, now: number): [number, number] => {
        const handle = liveHandle(target, now);
        if (handle) return handle.point;
        const rest = resolveFocal(target);
        const move = followOf(target, now);
        return move ? move(rest) : rest;
      };

      const followTarget = (g: AttnGeom, target: unknown, now: number): AttnGeom => {
        const move = followOf(target, now);
        if (!move) return g;
        const [cx, cy] = move([g.cx, g.cy]);
        return { ...g, cx, cy, box: boxAround(([[g.box.x, g.box.y], [g.box.x + g.box.w, g.box.y], [g.box.x, g.box.y + g.box.h], [g.box.x + g.box.w, g.box.y + g.box.h]] as Vec2[]).map(move)) };
      };

      /** Rigidly carry a pinned connector onto its live endpoints: turn and stretch about the end
       *  that has not moved, so shaft, arrowhead and caps travel together. */
      // Each end rides with the thing it meets: its resting point (where layout met that thing's drawn
      // edge) carried by that thing's own move and turn. A corner or a side is a point on a stroke, so
      // the connector meets it exactly.
      const liveEnd = (end: Position, rest: Vec2, now: number): Vec2 => {
        const handle = liveHandle(end, now);
        if (handle) return handle.point;
        const move = followOf(end, now);
        return move ? move(rest) : rest;
      };

      const pinTransform = (c: DrawComponent, now: number) => {
        if (!c.ends || !c.ends0) return undefined;
        const [a0, b0] = c.ends0;
        const [a1, b1] = [liveEnd(c.ends[0], a0, now), liveEnd(c.ends[1], b0, now)];
        const was = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
        const now2 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
        // An arrow pinned to one thing only — a magnitude and a direction — has no second end to
        // aim at, so it simply travels with the thing it reads from.
        if (was < 0.001) return a1[0] === a0[0] && a1[1] === a0[1] ? undefined : { a0, a1, rot: 0, scale: 1 };
        const rot = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
        const scale = now2 / was;
        if (Math.abs(rot) < 1e-4 && Math.abs(scale - 1) < 1e-4 && a1[0] === a0[0] && a1[1] === a0[1])
          return undefined;

        return { a0, a1, rot, scale };
      };

      /** A component redrawn where what it is drawn on is now: in its frame, on its connector's ends, between its angle's arms. */
      const pinned = (c: DrawComponent, now: number, index: number): DrawComponent => {
        let out = c;
        const carry = pinCarry(index, now);
        if (carry) out = mapPoints(out, carry);
        if (out.arc) {
          const live = [livePoint(out.arc.at, now), livePoint(out.arc.from, now), livePoint(out.arc.to, now)];
          const moved = live.some((point, k) => Math.hypot(point[0] - out.arc!.rest[k][0], point[1] - out.arc!.rest[k][1]) > 0.01);
          if (moved) out = { ...out, points: angleArc(live[0], live[1], live[2], out.arc.reach) } as DrawComponent;
        }
        const pin = pinTransform(out, now);
        if (!pin) return out;
        const { a0, a1, rot, scale } = pin;
        const cos = Math.cos(rot) * scale;
        const sin = Math.sin(rot) * scale;
        return mapPoints(out, (point: Vec2): Vec2 => {
          const x = point[0] - a0[0];
          const y = point[1] - a0[1];
          return [a1[0] + x * cos - y * sin, a1[1] + x * sin + y * cos];
        });
      };

      // An orbit rides round where its centre is NOW, so a moon keeps circling a planet that travels.
      // A centre that is itself orbiting is read at rest, so two bodies circling each other settle.
      let following = false;
      const orbitCentre = (now: number) => (pos: unknown): [number, number] => {
        const rest = resolveFocal(pos);
        if (following) return rest;
        following = true;
        try {
          const [dx, dy] = motionShift(pos, now);
          return [rest[0] + dx, rest[1] + dy];
        } finally {
          following = false;
        }
      };

      /** A picture part's outline carried along with its picture, which is the only thing that moves or turns it. */
      const carried = (c: DrawComponent, now: number): DrawComponent => {
        if (c.type !== "region" || !c.outline) return c;
        const move = followOf(c.id, now);
        return move ? { ...c, outline: c.outline.map(move) } : c;
      };

      /** The strokes a drawn thing paints at `now`, exactly as drawn: in its frame, mid-change of shape, moved. */
      const liveStrokes = (target: unknown, now: number): Stroke[] | undefined => {
        const index = typeof target === "string" ? indexOf.get(target) : undefined;
        if (index === undefined) return undefined;
        const c = pinned(drawComponents[index], now, index);
        const place = placeOf(index, now);
        const rc = { t: now, at: timings[index].at, dur: timings[index].dur, cx: place.cx, cy: place.cy, w: place.w, h: place.h, theme } as RenderCtx;
        const found = drawnStrokes(c, rc);
        const move = motionMap(index, now);
        if (!found.length) return undefined;
        return move ? found.map((one) => ({ ...one, points: one.points.map(move) })) : found;
      };

      /**
       * A thing with no strokes of its own — writing, a picture, a node of a diagram — lit by a glow
       * round its own drawn pixels: painted into a buffer with a coloured blur, then cut out of it.
       */
      const halo = (into: CanvasRenderingContext2D, index: number, p: number, color: string): boolean => {
        const c = drawComponents[index];
        if (c.type === "region" || c.type === "particles" || c.type === "flow" || c.type === "glow") return false;
        const shown = clamp01(p / 0.3);
        if (shown <= 0) return true;
        const place = placeOf(index, t);
        const drawn = pinned(c, t, index);
        const rc: RenderCtx = { t, at: timings[index].at, dur: timings[index].dur, cx: place.cx, cy: place.cy, w: place.w, h: place.h, frame, cueTimes, resolveFocal: focalOf(index, t), sceneDuration: duration, theme };
        const move = motionMap(index, t);
        const turn = pinTurn(index, t);
        const paint = (ctx: CanvasRenderingContext2D) => {
          ctx.save();
          if (move) {
            const [o, x, y] = [move([0, 0]), move([1, 0]), move([0, 1])];
            ctx.transform(x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]);
          }
          if (turn) turnAbout(ctx, turn, place.cx, place.cy);
          paintFinal(ctx, drawn, rc);
          ctx.restore();
        };
        masked(
          into,
          W,
          H,
          (buffer) => {
            buffer.save();
            buffer.globalAlpha *= shown;
            buffer.shadowColor = color;
            for (const blur of HALO_BLURS) {
              buffer.shadowBlur = blur;
              paint(buffer);
            }
            buffer.restore();
          },
          paint,
          { invert: true },
        );
        return true;
      };

      // Within a layer the biggest thing paints first, so whatever sits on it — a molecule on a cell,
      // a caravan on a map — is never buried under it.
      const drawOrder = drawComponents
        .map((_c, i) => i)
        .sort((a, b) => placements[b].w * placements[b].h - placements[a].w * placements[a].h);
      // A cue on one piece of a chart fades the chart's other pieces back while it plays.
      const softened = new Map<string, number>();
      attnComponents.forEach((c, i) => {
        if (!c.soften?.length || !SOFTENING.has(c.verb)) return;
        const k = attentionOpacity(t, attnTimings[i].at, attnTimings[i].dur, c.exit, duration);
        for (const id of c.soften) softened.set(id, Math.max(softened.get(id) ?? 0, k));
      });

      for (const i of drawOrder) {
        const c = drawComponents[i];
        const timing = timings[i];
        if (t < timing.at) continue;
        const place = placeOf(i, t);
        const cut = WRITING_TYPES.has(c.type) && !c.fixed ? cutByShot({ x: place.cx - place.w / 2, y: place.cy - place.h / 2, w: place.w, h: place.h }) : 1;
        if (cut <= 0) continue;
        drawComponentInstance(
          frame,
          carried(pinned(c, t, i), t),
          place,
          timing,
          duration,
          t,
          cueTimes,
          focalOf(i, t),
          theme,
          orbitCentre(t),
          (1 - SOFTENED_BY * (softened.get(c.id ?? "") ?? 0)) * cut,
          pinTurn(i, t),
        );
      }

      // Attention overlays (Phase 4): timed like any component but not part of the draw-loop's
      // placement/index alignment above — each resolves its own anchor geometry independently.
      attnComponents.forEach((c, i) => {
        const { at, dur } = attnTimings[i];
        const plate =
          c.verb === "callout" && c.spot && c.text
            ? plateAround(c.spot, c.text, c.fontPx)
            : c.verb === "speech" && c.spot && c.speech
              ? { x: c.spot[0] - c.speech.size[0] / 2, y: c.spot[1] - c.speech.size[1] / 2, w: c.speech.size[0], h: c.speech.size[1] }
              : undefined;
        const opacity = attentionOpacity(t, at, dur, c.exit, duration) * (plate ? cutByShot(plate) : 1);
        if (opacity <= 0) return;
        const mark = markOf(c.target);
        const rest: AttnGeom = mark
          ? { cx: mark.segment.box.x + mark.segment.box.w / 2, cy: mark.segment.box.y + mark.segment.box.h / 2, r: Math.max(mark.segment.box.w, mark.segment.box.h) / 2, box: mark.segment.box }
          : attnGeom(c.target, boxes, W, H, geo);
        // Everything is lit along what is actually drawn: a marked line or a traced border, a figure's
        // corner or side, the strokes of a drawn thing, or else the drawn pixels themselves.
        const handle = mark ? undefined : liveHandle(c.target, t);
        const strokes = mark ? undefined : handle?.course ? [{ points: handle.course, closed: false }] : liveStrokes(c.target, t);
        const move = handle ? undefined : followOf(c.target, t);
        const follow = (point: Vec2): [number, number] => {
          if (handle) return [point[0] + handle.point[0] - handle.rest[0], point[1] + handle.point[1] - handle.rest[1]];
          return move ? move(point) : [point[0], point[1]];
        };
        const g: AttnGeom = handle
          ? { cx: handle.point[0], cy: handle.point[1], r: rest.r, box: boxAround(handle.course ?? [handle.point]) }
          : strokes && !c.outline
            ? geomOf(strokes)
            : followTarget(rest, c.target, t);
        const shifted = (points: Vec2[]) => points.map(follow);
        const line = mark && !mark.segment.closed ? shifted(mark.segment.shape) : undefined;
        const outline = mark ? (line ? undefined : shifted(mark.segment.shape)) : c.outline && shifted(c.outline);
        const course = strokes?.[0]?.points ?? (c.course && shifted(c.course));
        const p = phase(t, at, at + dur);
        const color = c.color;
        const defaultLayer =
          c.verb === "spotlight" || c.verb === "dim" || c.verb === "vignette"
            ? "fx"
            : "annotation";
        const layer = frame.layer.ctx(c.layer ?? defaultLayer);
        const glow = () => {
          if (line) return glowLine(layer, line, p, { color: mark?.segment.color ?? color });
          if (outline) return glowBorder(layer, outline, p, { color });
          if (strokes) return strokes.forEach((one) => glowLine(layer, one.closed ? [...one.points, one.points[0]] : one.points, p, { color }));
          const index = typeof c.target === "string" ? indexOf.get(c.target) : undefined;
          if (index !== undefined && halo(layer, index, p, color ?? frame.theme.palette.accent)) return;
          // A part measured but never traced is lit round its box, rounded by the border's own smoothing.
          if (g.box.w > 0 && g.box.h > 0) return glowBorder(layer, boxPolygon(g.box), p, { color });
          nothingToGlow(c.target);
        };

        layer.save();
        layer.globalAlpha *= opacity;

        try {
          if (mark) paintMarkCue(layer, mark, c.verb, clamp01(p / 0.3), [g.cx - rest.cx, g.cy - rest.cy], boxes.get(mark.owner.id!), color ?? frame.theme.palette.accent, frame.theme);
          switch (c.verb) {
            case "callout": {
              // A figure's corner or side is named on the figure's outside, clear of everything it encloses.
              const outside = handle ? handle.figure.rings.filter((ring) => ring.closed).map((ring) => ringCourse(handle.figure, handle.corners, ring)) : undefined;
              const facing = handle && !c.side ? handleOutward(handle.figure, handle.corners, handle.name) : undefined;
              callout(frame, {
                target: [g.cx, g.cy],
                text: c.text,
                title: c.title,
                side: (c.side ?? (facing ? compassOf(facing) : undefined)) as CalloutOptions["side"],
                route: c.route as CalloutOptions["route"],
                container: c.container as CalloutOptions["container"],
                color,
                avoid: c.avoid,
                within: outline,
                near: g.box,
                along: handle?.course ?? (c.course ? course : undefined),
                ...(outside?.length ? { clear: outside } : {}),
                leaderP: p,
                labelP: phase(t, at + dur * 0.3, at + dur),
                ...(c.spot ? { spot: shifted([c.spot])[0], leader: c.leader } : {}),
                ...(c.point ? { point: shifted([c.point])[0] } : {}),
                ...(c.fontPx ? { fontPx: c.fontPx } : {}),
                ...(c.ink ? { ink: c.ink } : {}),
                ...(c.subdued ? { subdued: true, layer: c.layer ?? "mid" } : {}),
              });
              return;
            }
            case "highlight":
              highlightHalo(layer, g.cx, g.cy, c.radius ?? g.r, { color });
              return;
            case "spotlight":
              glow();
              return;
            case "dim": {
              // Nothing on the page darkens: what is not the subject softens toward the page, and the subject glows.
              const page = frame.theme.palette.bg;
              const shown = (index: number) => {
                const gone = resolveExit(drawComponents[index].exit, duration);
                return t >= timings[index].at && (!gone || t < gone.out + gone.dur);
              };
              // An equation whose term is the subject is softened round that term, not kept whole as writing.
              const writing = drawComponents
                .flatMap((w, index) => (w.id && w !== mark?.owner && (w.type === "text" || w.type === "equation" || w.type === "measure") && shown(index) ? [boxes.get(w.id)] : []))
                .filter((w) => w !== undefined);
              const owner = mark ? boxes.get(mark.owner.id!) : typeof c.target === "string" && c.target.includes(".") ? boxes.get(c.target.split(".")[0]) : undefined;
              // Drawn opaque and faded as one sheet, so a picture lying on the subject is not softened twice.
              const veil = (into: CanvasRenderingContext2D, alpha: number, cut: boolean) => {
                into.save();
                into.globalAlpha = alpha;
                into.fillStyle = page;
                for (const other of c.others ?? []) {
                  const box = boxes.get(other);
                  if (box) into.fillRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
                }
                if (owner) {
                  const within = { x: owner.x + g.cx - rest.cx, y: owner.y + g.cy - rest.cy, w: owner.w, h: owner.h };
                  dimExcept(into, [outline ? { points: outline } : { cx: g.cx, cy: g.cy, r: c.radius ?? g.r }], { within, color: page, intensity: alpha, feather: 8 });
                }
                // Writing keeps full contrast: the veil is cut away wherever words sit on a softened picture.
                if (cut) {
                  into.globalAlpha = 1;
                  into.globalCompositeOperation = "destination-out";
                  for (const w of writing) into.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6);
                }
                into.restore();
              };
              // Laid over the pictures and under the labels, cut in a buffer of its own so its holes never
              // erase what is already drawn; with no buffer to cut in, it is laid on the overlay instead.
              const strength = 0.5 * p;
              if (typeof document === "undefined") veil(layer, strength, false);
              else {
                const pictures = frame.layer.ctx("mid");
                pictures.save();
                pictures.globalAlpha *= opacity * strength;
                masked(pictures, W, H, (buffer) => veil(buffer, 1, true), () => {}, { invert: true });
                pictures.restore();
              }
              if (!c.quiet) glow();
              return;
            }
            case "pointer": {
              const from =
                c.from !== undefined
                  ? resolvePosition(c.from, { viewW: W, viewH: H, boxes, geo })
                  : ([g.cx, g.cy - (c.radius ?? g.r) - 60] as [number, number]);
              pointerArrow(layer, from[0], from[1], g.cx, g.cy, p, { color });
              return;
            }
            case "box":
              focusBox(layer, g.box.x, g.box.y, g.box.w, g.box.h, t, { color });
              return;
            case "brackets":
              cornerBrackets(layer, g.box.x, g.box.y, g.box.w, g.box.h, {
                color,
                p,
              });
              return;
            case "encircle":
              // A ring is for a point, a city on a map; anything with a size glows round its own border.
              if (Math.max(g.box.w, g.box.h) <= POINT_SIZE) circumscribe(layer, { x: g.box.x, y: g.box.y, w: g.box.w, h: g.box.h }, p, { style: { color } });
              else glow();
              return;
            case "outline":
              glow();
              return;
            case "converge":
              convergingArrows(layer, g.cx, g.cy, p, { color });
              return;
            case "spark":
              sparkFlash(layer, g.cx, g.cy, p, { color });
              return;
            case "vignette":
              glow();
              return;
            case "rings":
              focusRings(layer, g.cx, g.cy, p, { color });
              return;
            case "trace": {
              // The colour runs from the route's first point to its last and stays lit behind its head.
              if (!course || course.length < 2) {
                glow();
                return;
              }
              // A soft wide band under a firm core: lit, not merely redrawn, on a line already in the accent.
              layer.save();
              layer.globalAlpha *= 0.35;
              strokeOn(layer, course, p, { color, width: 14 });
              layer.restore();
              strokeOn(layer, course, p, { color, width: 5 });
              if (p < 1) {
                const head = pointAt(course, p);
                const lit = color ?? frame.theme.palette.accent;
                layer.save();
                layer.fillStyle = lit;
                layer.shadowColor = lit;
                layer.shadowBlur = 12;
                layer.beginPath();
                layer.arc(head.x, head.y, 6, 0, Math.PI * 2);
                layer.fill();
                layer.restore();
              }
              return;
            }
            case "underline": {
              const y = g.box.y + g.box.h + 5;
              strokeOn(layer, [[g.box.x, y], [g.box.x + g.box.w, y]], p, { color, width: 3.5 });
              return;
            }
            case "hold": {
              // Held constant: it greys toward the page and wears a tag, so what stays fixed reads apart from what changes.
              const page = frame.theme.palette.bg;
              layer.save();
              layer.globalAlpha *= 0.55 * clamp01(p / 0.4);
              layer.fillStyle = page;
              layer.beginPath();
              if (outline) outline.forEach(([x, y], index) => (index === 0 ? layer.moveTo(x, y) : layer.lineTo(x, y)));
              else layer.rect(g.box.x - 4, g.box.y - 4, g.box.w + 8, g.box.h + 8);
              layer.fill();
              layer.restore();
              const tag = c.text ?? "fixed";
              layer.save();
              layer.globalAlpha *= clamp01((p - 0.2) / 0.4);
              layer.font = `600 ${MIN_TEXT}px ${frame.theme.type.body}`;
              const w = layer.measureText(tag).width + 16;
              const h = MIN_TEXT + 8;
              // Beside the thing when there is room, else above it; set on its corner it hid the thing's last letters.
              const beside = g.box.x + g.box.w + 8 + w <= W - 4;
              const x = beside ? g.box.x + g.box.w + 8 : Math.min(W - w - 4, Math.max(4, g.box.x + (g.box.w - w) / 2));
              const y = beside ? g.box.y + (g.box.h - h) / 2 : Math.max(4, g.box.y - h - 6);
              layer.fillStyle = frame.theme.palette.muted;
              layer.beginPath();
              layer.roundRect(x, y, w, h, h / 2);
              layer.fill();
              layer.fillStyle = page;
              layer.textAlign = "center";
              layer.textBaseline = "middle";
              layer.fillText(tag, x + w / 2, y + h / 2 + 1);
              layer.restore();
              return;
            }
            case "cancel": {
              // The working's cancel: struck through corner to corner, then faded back, and left so for as long as it is shown.
              const b = g.box;
              const mid = b.y + b.h / 2;
              strokeOn(layer, [[b.x - 2, mid + b.h * 0.32], [b.x + b.w + 2, mid - b.h * 0.32]], clamp01(p / 0.55), { color: frame.theme.palette.danger, width: 3 });
              layer.save();
              layer.globalAlpha *= 0.6 * clamp01((p - 0.55) / 0.45);
              layer.fillStyle = frame.theme.palette.bg;
              layer.fillRect(b.x - 3, b.y, b.w + 6, b.h);
              layer.restore();
              return;
            }
            case "strike": {
              // Writing is struck through; anything else is crossed corner to corner. Both stay while shown.
              const b = g.box;
              const red = frame.theme.palette.danger;
              if (c.through) {
                const mid = b.y + b.h / 2;
                strokeOn(layer, [[b.x - 4, mid + b.h * 0.12], [b.x + b.w + 4, mid - b.h * 0.12]], p, { color: red, width: Math.max(3.5, Math.min(8, b.h * 0.1)) });
                return;
              }
              const inset = Math.min(b.w, b.h) * 0.12;
              const width = Math.max(4, Math.min(10, Math.min(b.w, b.h) * 0.05));
              const [x0, y0, x1, y1] = [b.x + inset, b.y + inset, b.x + b.w - inset, b.y + b.h - inset];
              strokeOn(layer, [[x0, y0], [x1, y1]], clamp01(p / 0.5), { color: red, width });
              if (p > 0.5) strokeOn(layer, [[x1, y0], [x0, y1]], clamp01((p - 0.5) / 0.5), { color: red, width });
              return;
            }
            case "speech": {
              if (!c.speech || !c.spot || !c.point) return;
              const [spot, point] = shifted([c.spot, c.point]);
              speechLine(layer, {
                spot,
                point,
                size: c.speech.size,
                fontPx: c.fontPx ?? 32,
                rows: c.speech.rows,
                reveal: c.speech.reveal,
                stressed: c.speech.stressed,
                align: c.speech.align,
                t,
                ink: c.ink ?? frame.theme.palette.ink,
                key: color ?? frame.theme.palette.accent,
                page: frame.theme.palette.bg,
                face: frame.theme.type.body,
              });
              return;
            }
            case "tick": {
              // Beside the thing, on whichever side has room; with none, on its top-right corner.
              const b = g.box;
              const k = Math.max(28, Math.min(56, b.h * 0.5));
              const right = b.x + b.w + 10 + k <= W - 8;
              const left = b.x - 10 - k >= 8;
              const x = right ? b.x + b.w + 10 : left ? b.x - 10 - k : Math.min(W - 8 - k, b.x + b.w - k);
              const y = right || left ? b.y + b.h / 2 - k / 2 : Math.max(8, b.y);
              const mark: [number, number][] = [[x, y + k * 0.55], [x + k * 0.38, y + k * 0.9], [x + k, y + k * 0.1]];
              strokeOn(layer, mark, p, { color: color ?? frame.theme.palette.accent, width: Math.max(4, k * 0.13) });
              return;
            }
            case "trend": {
              // Beside the thing on its open side, growing from its tail; in the accent through its beat, then ink.
              const k = Math.max(TREND_PX[0], Math.min(TREND_PX[1], g.box.h * TREND_SHARE));
              const spot = trendSpot(g.box, k, c.avoid ?? [], W, H);
              const rising = c.way !== "down";
              const glyph = TREND_GLYPH.map(([u, v]): Vec2 => [spot.x + u * spot.w, spot.y + (rising ? v : 1 - v) * spot.h]);
              const grown = spot.h * clamp01(p);
              layer.beginPath();
              layer.rect(spot.x - 1, rising ? spot.y + spot.h - grown : spot.y, spot.w + 2, grown);
              layer.clip();
              const fill = (paint: string) => {
                layer.fillStyle = paint;
                layer.beginPath();
                glyph.forEach(([x, y], index) => (index === 0 ? layer.moveTo(x, y) : layer.lineTo(x, y)));
                layer.closePath();
                layer.fill();
              };
              const focus = c.settles === undefined ? 1 : 1 - clamp01((t - c.settles) / TREND_SETTLE);
              if (focus < 1) fill(frame.theme.palette.ink);
              layer.globalAlpha *= focus;
              if (focus > 0) fill(color ?? frame.theme.palette.accent);
              return;
            }
            default: {
              const _exhaustive: never = c.verb;
              console.warn(
                `gcl: no attention handler for verb "${_exhaustive as string}"`,
              );
              return;
            }
          }
        } finally {
          layer.restore();
        }
      });
    },
  };
}

/**
 * What a cue on a mark adds under its verb, `k` of the way in: the mark's siblings fade toward the
 * page, and a lit term of an equation changes colour so "F" glows in the equation itself — in the
 * cue's colour, or the second colour on an equation already written in it.
 */
function paintMarkCue(
  layer: CanvasRenderingContext2D,
  mark: Mark,
  verb: AttnVerb,
  k: number,
  [dx, dy]: Vec2,
  ownerBox: { x: number; y: number; w: number; h: number } | undefined,
  lit: string,
  theme: Theme,
): void {
  if (SOFTENING.has(verb) && mark.siblings.length) {
    layer.save();
    layer.globalAlpha *= SOFTENED_BY * k;
    layer.fillStyle = theme.palette.bg;
    layer.strokeStyle = theme.palette.bg;
    layer.lineWidth = 9;
    layer.lineCap = "round";
    layer.lineJoin = "round";
    for (const sibling of mark.siblings) {
      layer.beginPath();
      sibling.shape.forEach(([x, y], index) => (index === 0 ? layer.moveTo(x + dx, y + dy) : layer.lineTo(x + dx, y + dy)));
      if (sibling.closed) layer.fill();
      else layer.stroke();
    }
    layer.restore();
  }
  if (mark.owner.type !== "equation" || verb === "cancel" || verb === "hold" || !ownerBox) return;
  drawMathTerm(layer, mark.owner.tex, mark.name, ownerBox.x + ownerBox.w / 2 + dx, ownerBox.y + ownerBox.h / 2 + dy, {
    size: mark.owner.size ?? 30,
    color: lit.toLowerCase() === mark.owner.color?.toLowerCase() ? theme.palette.second : lit,
    align: mark.owner.align,
    alpha: k,
  });
}

/**
 * `group` carries extra context (frame/cueTimes/resolveFocal/sceneDuration) that no other component
 * type needs, threaded through `RenderCtx` so `paintNative`/`paintFinal` don't need a signature change
 * just to reach the one `group` case — everything else ignores these fields.
 */
interface RenderCtx {
  t: number;
  at: number;
  dur: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  frame?: FrameCtx;
  cueTimes?: number[];
  resolveFocal?: (pos: unknown) => [number, number];
  sceneDuration?: number;
  theme: Theme;
}

/**
 * Draw ONE component instance: motion transform (outer) → subject modifiers (predict/ghost/magnify/
 * emphasis, composed around `applyEnterExit`) → the trace-motion trail, if any. This is the exact body
 * of the main scene draw loop (Phase 0–4), extracted verbatim so it can be reused by the group
 * container (Phase 5) — a group's children are drawn through this same function, recursing into
 * `renderGroup` again when a child is itself a `group`. Behavior is byte-identical to the inline loop
 * it replaces: same transform math, same subject-modifier composition, same trail stroke.
 *
 * `timing` is the component's OWN resolved `{at, dur}` (already time-shifted for group children by the
 * caller — see `renderGroup`'s `childTiming`). `sceneDuration` is only used to resolve `c.exit`'s
 * default `out` (scene end - dur); group children pass the same scene duration through unchanged, so a
 * child's own explicit `exit.out`/`until` behaves exactly as it would top-level.
 */
/** How much of a writing's plate shows: it arrives with the writing and leaves with it. */
function plateAlpha(t: number, at: number, enterDur: number, exit: { out: number; dur: number } | null): number {
  const entered = enterDur > 0 ? clamp01((t - at) / enterDur) : 1;
  const leaving = exit ? 1 - clamp01((t - exit.out) / Math.max(1e-3, exit.dur)) : 1;
  return entered * leaving;
}

/** A soft-edged plate of the page colour under a box of writing. */
function paintPlate(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, alpha: number, page: string) {
  if (alpha <= 0) return;
  const pad = 6;
  ctx.save();
  ctx.globalAlpha *= 0.88 * alpha;
  ctx.fillStyle = page;
  ctx.shadowColor = page;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.roundRect(box.x - pad, box.y - pad / 2, box.w + pad * 2, box.h + pad, 8);
  ctx.fill();
  ctx.restore();
}

/** The ring a close-up is drawn in: a disc of the page colour edged in a thin line, so it reads as shown larger than it is. */
function paintLens(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, alpha: number, palette: Theme["palette"]) {
  if (alpha <= 0) return;
  const r = Math.max(box.w, box.h) / 2 + 6;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(box.x + box.w / 2, box.y + box.h / 2, r, 0, Math.PI * 2);
  ctx.globalAlpha *= 0.9;
  ctx.fillStyle = palette.bg;
  ctx.fill();
  ctx.globalAlpha /= 0.9;
  ctx.strokeStyle = palette.muted;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawComponentInstance(
  frame: FrameCtx,
  c: DrawComponent,
  placement: Placement,
  timing: { at: number; dur: number },
  sceneDuration: number,
  t: number,
  cueTimes: number[],
  resolveFocal: (pos: unknown) => [number, number],
  theme: Theme,
  resolveCentre?: (pos: unknown) => [number, number],
  fade = 1,
  turn?: PinTurn,
): void {
  const { at, dur } = timing;
  if (c.type === "region") {
    if (c.wash && c.outline) {
      const gone = resolveExit(c.exit, sceneDuration);
      const shown = (dur > 0 ? clamp01((t - at) / dur) : 1) * (gone ? 1 - clamp01((t - gone.out) / Math.max(gone.dur, 0.01)) : 1);
      if (shown > 0) paintWash(frame.layer.ctx(c.layer ?? "mid"), c.outline, c.wash.color, c.wash.alpha * shown);
    }
    const step = c.outline && c.tint ? fillAt(c.fillLevel, t) : undefined;
    if (c.outline && c.tint && step && step.level > 0) paintPartFill(frame.layer.ctx(c.layer ?? "annotation"), c.outline, c.tint, step.level, step.dir);
    return;
  }

  // particles/flow/glow are simple continuous streams keyed on `t - at`, not a progress-driven
  // enter/exit — they still respect the component's own `layer`/placement, but paint directly rather
  // than through `paintNative`/`paintFinal`/`applyEnterExit` (no notion of a "finished" pose to mask
  // or fade to). They're dispatched here, before the general motion/enterexit path below, since (per
  // the plan) they compile straight to `emit`/`radialGlow` on the fx layer.
  if (c.type === "particles" || c.type === "flow" || c.type === "glow") {
    const layer = frame.layer.ctx(c.layer ?? "fx");
    const { cx, cy } = placement;
    // A stream leaves with its cue, and a glow fades no faster than a flash may.
    const exit = resolveExit(c.exit, sceneDuration);
    const left = exit ? 1 - clamp01((t - exit.out) / Math.max(exit.dur, c.type === "glow" ? FLASH_MIN / 2 : 0.01)) : 1;
    if (left <= 0) return;
    layer.save();
    layer.globalAlpha *= left;
    // A stream is a loop: after the loop limit its particles hold where they are.
    const age = Math.min(t - at, LOOP_LIMIT);
    if (c.type === "particles") {
      const cfg: EmitterConfig = {
        ...resolveEmitter(c.preset, cx, cy, W, H, c.seed ?? 1),
        ...(c.config as Partial<EmitterConfig> | undefined),
      };
      emit(layer, cfg, age);
    } else if (c.type === "flow") {
      const [fx, fy] = resolveFocal(c.from);
      const [tx, ty] = resolveFocal(c.to);
      const angle = Math.atan2(ty - fy, tx - fx);
      const cfg: EmitterConfig = {
        count: 60,
        seed: c.seed ?? 9,
        origin: { kind: "line", x: fx, y: fy, x2: tx, y2: ty },
        rate: c.rate ?? 30,
        loop: true,
        life: [0.6, 1.1],
        angle,
        spread: 0.15,
        speed: [60, 120],
        size: [2, 4],
        color: c.color ?? "#5cc8ae",
        alpha: { in: 0.1, out: 0.3, max: 0.9 },
        shape: "dot",
        blend: "lighter",
      };
      emit(layer, cfg, age);
    } else {
      radialGlow(layer, cx, cy, Math.min(c.r ?? 60, GLOW_MAX_R), c.color ?? "#ffd24a", phase(t, at, at + Math.max(dur, FLASH_MIN / 2)));
    }
    layer.restore();
    return;
  }

  // `fixed` components render on the `fg` layer, which the scene marks screenspace (below) so they stay
  // put through camera moves — a HUD/legend overlay. Otherwise use the explicit or default layer.
  const layer = frame.layer.ctx(
    c.fixed ? "fg" : (c.layer ?? defaultLayerFor(c.type)),
  );
  const { cx, cy, w, h } = placement;
  const box = { x: cx - w / 2, y: cy - h / 2, w, h };
  const enterDur = c.enter?.dur ?? dur;
  const exitInfo = resolveExit(c.exit, sceneDuration);
  const rc: RenderCtx = {
    t,
    at,
    dur,
    cx,
    cy,
    w,
    h,
    frame,
    cueTimes,
    resolveFocal,
    sceneDuration,
    theme,
  };

  const motionSpecs = (c.motions ?? []).map((spec) => ({ ...spec, at: resolveMotionAt(spec, cueTimes, at) }) as MotionSpec);
  const mt = motionsTransform(motionSpecs, box, t, resolveFocal, resolveCentre);
  const osc = oscillateOffset(c.oscillate, t, at);
  const dx = mt.dx + osc.dx;
  const dy = mt.dy + osc.dy;
  const rot = mt.rot + osc.rot;
  const scale = mt.scale * (1 + osc.scale);

  layer.save();
  layer.globalAlpha *= fade * mutedAt(motionSpecs, t);
  if (dx !== 0 || dy !== 0 || rot !== 0 || scale !== 1) {
    layer.translate(dx, dy);
    if (rot !== 0 || scale !== 1) {
      layer.translate(cx, cy);
      layer.rotate(rot);
      layer.scale(scale, scale);
      layer.translate(-cx, -cy);
    }
  }
  if (turn) turnAbout(layer, turn, cx, cy);

  // Subject modifiers (Phase 4): `predict` gates WHICH content draws (placeholder vs real);
  // `ghost`/`magnify`/`emphasis` wrap the (possibly gated) content draw itself. Composed here so
  // they apply uniformly whether the component's own enter is native, masked, or fade.
  const predictAt = c.predict
    ? (c.predict.revealAt ??
      (c.predict.revealCue != null
        ? cueTimes[c.predict.revealCue]
        : undefined) ??
      at)
    : undefined;
  const drawSubject = (target: CanvasRenderingContext2D) => {
    const runEnterExit = (paintTarget: CanvasRenderingContext2D) => {
      if (c.pointer) pointerLine(paintTarget, box, c.pointer, plateAlpha(t, at, enterDur, exitInfo), theme.palette.muted);
      if (c.plate) paintPlate(paintTarget, box, plateAlpha(t, at, enterDur, exitInfo), theme.palette.bg);
      if (c.lens) paintLens(paintTarget, box, plateAlpha(t, at, enterDur, exitInfo), theme.palette);
      applyEnterExit(
        paintTarget,
        c.enter,
        { t, at, enterDur, exit: exitInfo, exitSpec: c.exit, box, W, H },
        (c2) => paintFinal(c2, c, rc),
        {
          native: (c2, enterP) => paintNative(c2, c, rc, enterP, enterDur),
          nativeExit: nativeEraseFor(c, rc),
        },
      );
    };

    if (predictAt !== undefined) {
      const pr = predictReveal(t, {
        poseAt: c.predict!.poseAt,
        revealAt: predictAt,
      });
      if (!pr.revealed) {
        const pulse = 0.55 + 0.25 * Math.sin(pr.thinking * Math.PI * 3);
        target.save();
        target.globalAlpha *= pulse;
        fadeText(
          target,
          "?",
          cx,
          cy,
          1,
          `700 ${Math.round(Math.min(w, h) * 0.6)}px ${theme.type.display}`,
          theme.palette.muted,
          "center",
        );
        target.restore();
        return;
      }
      withPunch(target, cx, cy, t, predictAt, runEnterExit, { amp: 0.15 });
      return;
    }
    runEnterExit(target);
  };

  const drawFilled = (target: CanvasRenderingContext2D) => {
    const step = fillAt(c.fillLevel, t);
    if (step === undefined) {
      drawSubject(target);
      return;
    }
    if (step.level >= 1) {
      drawSubject(target);
      return;
    }
    if (step.level <= 0) return;

    masked(
      target,
      W,
      H,
      (inner) => drawSubject(inner),
      (inner) => paintMask(inner, "wipe", box, step.level, { dir: step.dir }),
    );
  };

  const drawGhostMagnify = (target: CanvasRenderingContext2D) => {
    if (c.magnify) {
      const r = c.magnify.r ?? Math.hypot(w, h) / 2;
      magnifyVerb(target, cx, cy, r, c.magnify.zoom ?? 1.6, drawFilled);
    } else if (c.ghost != null) {
      ghostVerb(target, c.ghost, drawFilled);
    } else {
      drawFilled(target);
    }
  };

  const drawEmphasized = (target: CanvasRenderingContext2D) => {
    const emphasisWindows = c.emphasis
      ? Array.isArray(c.emphasis)
        ? c.emphasis
        : [c.emphasis]
      : [];
    const activeEmphasis = [...emphasisWindows].reverse().find((candidate) => {
      const candidateAt =
        candidate.at ??
        (candidate.cue != null ? cueTimes[candidate.cue] : undefined) ??
        at;
      return (
        t >= candidateAt &&
        (candidate.dur === undefined || t <= candidateAt + candidate.dur)
      );
    });
    if (!activeEmphasis) {
      drawGhostMagnify(target);
      return;
    }
    const kind = activeEmphasis.kind ?? "punch";
    const emAt =
      activeEmphasis.at ??
      (activeEmphasis.cue != null ? cueTimes[activeEmphasis.cue] : undefined) ??
      at;
    const strength = activeEmphasis.amp ?? 1;
    // `punch` is a single settling beat at the moment of emphasis, so it still reads as a gesture.
    // Everything else used to breathe for as long as it was on screen, which pulled the eye to the
    // effect rather than the thing. They now simply mark it.
    if (kind === "punch")
      withPunch(target, cx, cy, t, emAt, drawGhostMagnify, {
        amp: 0.12 * strength,
      });
    else drawGhostMagnify(target);
  };

  drawEmphasized(layer);
  layer.restore();

  const trailed = motionSpecs.find((spec) => "trail" in spec && spec.trail !== undefined);
  if (trailed && "trail" in trailed && trailed.at !== undefined && t > trailed.at) {
    const from = trailed.at;
    const until = Math.min(t, from + (trailed.dur ?? 0));
    const centreAt = (time: number): [number, number] => {
      const m = motionsTransform(motionSpecs, box, time, resolveFocal, resolveCentre);
      return [m.dx, m.dy];
    };
    if (trailed.trail === "ghosts") {
      // Fixed moments along the journey, so a copy stays where it was left rather than sliding. Dated,
      // the moments run from the start to the arrival: a copy is left at each but the last, which the
      // traveller reaches itself, and every one is written where the traveller was then.
      const dates = "dates" in trailed && trailed.dates && trailed.dates.length > 1 ? trailed.dates : undefined;
      const moments = dates ? dates.map((_, k) => k / (dates.length - 1)) : [0.2, 0.4, 0.6, 0.8, 1];
      const journey = trailed.dur ?? 0;
      // An undated copy is left only a clear step from the last one and from the traveller, so a short
      // journey leaves a few copies apart instead of a smear of overlapping ones.
      const apart = (a: [number, number], b: [number, number]) => Math.max(Math.abs(a[0] - b[0]) / Math.max(1, w), Math.abs(a[1] - b[1]) / Math.max(1, h)) >= 0.6;
      const now = centreAt(until);
      let left = centreAt(from);
      moments.forEach((share, k) => {
        const time = from + journey * share;
        const date = dates?.[k];
        const [gx, gy] = centreAt(time);
        const ghost = k < moments.length - 1 && time < until && (dates !== undefined || (apart([gx, gy], left) && apart([gx, gy], now)));
        if (!ghost && !(date && t >= time)) return;
        if (ghost && !dates) left = [gx, gy];
        if (ghost) {
          layer.save();
          layer.globalAlpha *= 0.28;
          layer.translate(gx, gy);
          drawGhostMagnify(layer);
          layer.restore();
        }
        if (!date || t < time) return;
        const shown = clamp01((t - time) / 0.3) * (exitInfo ? 1 - clamp01((t - exitInfo.out) / Math.max(0.01, exitInfo.dur)) : 1);
        fadeText(layer, date, cx + gx, cy + gy + h / 2 + MIN_TEXT * 0.9, shown, `600 ${MIN_TEXT}px ${theme.type.body}`, theme.palette.ink, "center", theme.palette.bg);
      });
    } else {
      layer.save();
      layer.fillStyle = theme.palette.muted;
      let last: [number, number] | undefined;
      for (let time = from; time <= until; time += 1 / 60) {
        const [ox, oy] = centreAt(time);
        const point: [number, number] = [cx + ox + (c.carriedBy?.[0] ?? 0), cy + oy + (c.carriedBy?.[1] ?? 0)];
        if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < 14) continue;
        layer.beginPath();
        layer.arc(point[0], point[1], 3, 0, Math.PI * 2);
        layer.fill();
        last = point;
      }
      layer.restore();
    }
  }

  if (mt.trail && mt.trail.length > 1) {
    const trace = c.motions?.find((spec): spec is Extract<MotionSpec, { kind: "trace" }> => spec.kind === "trace");
    const color = trace?.color ?? "#5cc8ae";
    layer.save();
    layer.strokeStyle = color;
    layer.lineWidth = 2;
    layer.beginPath();
    layer.moveTo(mt.trail[0][0], mt.trail[0][1]);
    for (let k = 1; k < mt.trail.length; k++)
      layer.lineTo(mt.trail[k][0], mt.trail[k][1]);
    layer.stroke();
    layer.restore();
    tracerDot(layer, mt.trail, 1, { color });
  }
}

/** Bridge `paintNative`/`paintFinal`'s `(layer, c, rc, ...)` shape to `renderGroup` — both entrance
 *  paths for a `group` just render its children (a group has no native progress of its own; `build`'s
 *  per-child stagger and each child's own `enter` are what actually animate the group's insides). */
function paintGroup(c: Extract<Component, { type: "group" }>, rc: RenderCtx) {
  if (!rc.frame) return; // no frame context (e.g. a bare unit test calling paintNative/paintFinal directly) — nothing to draw onto
  const { cx, cy, w, h } = rc;
  const groupBox = { x: cx - w / 2, y: cy - h / 2, w, h };
  renderGroup(
    rc.frame,
    c,
    groupBox,
    { at: rc.at, dur: rc.dur },
    rc.sceneDuration ?? rc.t,
    rc.t,
    rc.cueTimes ?? [],
    rc.resolveFocal ?? ((_pos) => [cx, cy]),
    rc.theme,
  );
}

/** Default a child's `enter` to the group's `childEnter` when the child declares none of its own —
 *  the group-level default entrance (plan Task 4 Step 2). A child with an explicit `enter` (even
 *  `{type:"none"}`) always keeps it. */
function withDefaultEnter<T extends Component>(
  kid: T,
  childEnter: Component["enter"] | undefined,
): T {
  if (kid.enter || !childEnter) return kid;
  return { ...kid, enter: childEnter };
}

/** The layer(s) a component ACTUALLY paints to, mirroring the real dispatch in `drawComponentInstance`:
 *  particles/flow/glow paint to `c.layer ?? "fx"` (not `defaultLayerFor`, which reports "annotation" for
 *  these types as a layout-time fallback — see that function's comment); a nested `group` paints nothing
 *  itself, only its children, so it recurses into them; everything else paints to `c.layer ??
 *  defaultLayerFor(type)`. Used to compute the exact set of layers a `clip:true` group must clip —
 *  clipping the wrong (default) layer for particles/flow/glow/group children left them unclipped, able
 *  to bleed outside the group's box. */
function actualLayers(c: Component): LayerName[] {
  if (c.type === "particles" || c.type === "flow" || c.type === "glow")
    return [c.layer ?? "fx"];
  if (c.type === "group") return c.children.flatMap(actualLayers);
  return [c.layer ?? defaultLayerFor(c.type)];
}

/**
 * Render a group's children as a unit: `layoutGroup` places them inside `groupBox` (row/stack/grid),
 * each child then draws through `drawComponentInstance` — the same seam every other component renders
 * through, so a child that is itself a `group` recurses naturally. Child start times are relative to
 * the group's OWN resolved start (`groupTiming.at`): `build.step` staggers them sequentially from
 * there; without `build`, children are timed via `resolveTiming` (their own `cue`/`start`/`dur`)
 * shifted so time 0 in that resolution lands on the group's start. `clip` clips all child painting to
 * the group's box. The group's own motion/enter/exit/emphasis are NOT re-implemented here — they
 * already wrap this whole call via the ordinary `drawComponentInstance` chain the caller invoked us
 * through (see `paintGroup`).
 */
function renderGroup(
  frame: FrameCtx,
  group: Extract<Component, { type: "group" }>,
  groupBox: { x: number; y: number; w: number; h: number },
  groupTiming: { at: number; dur: number },
  sceneDuration: number,
  t: number,
  cueTimes: number[],
  resolveFocal: (pos: unknown) => [number, number],
  theme: Theme,
): void {
  const kids = group.children.filter(
    (k): k is DrawComponent => k.type !== "camera" && k.type !== "attention",
  );
  if (kids.length === 0) return;
  const placements = layoutGroup(kids, groupBox, group);

  // Child timing, relative to the group's own start: `build.step` staggers children sequentially;
  // otherwise each child's own cue/start/dur resolves normally (via `resolveTiming`, same as the
  // top-level scene, but with `gap:0` — a group's children default to appearing TOGETHER as a unit,
  // not staggered by the top-level scene's sequential-authoring gap; an explicit `cue`/`start`/
  // `start:"after"` on a child still overrides that default exactly as it would top-level), then the
  // whole batch is shifted so its cursor position lands on the group's start — so an untimed child
  // batch begins exactly when the group begins.
  const childTimings = group.build
    ? kids.map((_k, i) => ({
        at: groupTiming.at + i * (group.build!.step ?? 0.5),
        dur: kids[i].dur ?? 0.6,
      }))
    : resolveTiming(kids, { cueTimes, gap: 0 }).map((tm) => ({
        at: groupTiming.at + tm.at,
        dur: tm.dur,
      }));

  // Clip must cover every layer a child ACTUALLY paints to — not `defaultLayerFor`, which reports
  // "annotation" for particles/flow/glow/group as a layout-time placeholder (see `actualLayers`).
  // Walks into nested groups so a clip:true group also clips its grandchildren's real layers.
  const clipLayerNames = new Set(kids.flatMap(actualLayers));

  if (group.clip) {
    for (const name of clipLayerNames) {
      const layer = frame.layer.ctx(name);
      layer.save();
      layer.beginPath();
      layer.rect(groupBox.x, groupBox.y, groupBox.w, groupBox.h);
      layer.clip();
    }
  }

  try {
    kids.forEach((kid, i) => {
      const kt = childTimings[i];
      if (t < kt.at) return;
      const kidWithEnter = withDefaultEnter(kid, group.childEnter);
      drawComponentInstance(
        frame,
        kidWithEnter,
        placements[i],
        kt,
        sceneDuration,
        t,
        cueTimes,
        resolveFocal,
        theme,
      );
    });
  } finally {
    if (group.clip) {
      for (const name of clipLayerNames) frame.layer.ctx(name).restore();
    }
  }
}

/** Lazily-loaded inline-SVG-markup cache, keyed by the raw markup string, for `{type:"svg"}`
 *  components, which embed markup directly rather than referencing a `src` URL. */
const svgMarkupCache = new Map<string, HTMLImageElement>();

function primeSvgImage(markup: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = svgMarkupCache.get(markup);
  if (!img) {
    img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
    svgMarkupCache.set(markup, img);
    if (typeof img.decode === "function")
      void img.decode().catch(() => undefined);
  }
  return img;
}

function getSvgImage(markup: string): HTMLImageElement | null {
  const img = primeSvgImage(markup);
  if (!img) return null; // no DOM (e.g. pure node/vitest) — skip gracefully
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Draw a `{type:"vector"}` component's raw Path2D `d` string at `(cx,cy)` — fill/stroke/rotate/scale
 *  per the authored fields, faded in by `enterP`. No-ops under environments without `Path2D` (node/
 *  vitest) so the smoke tests never throw. */
function paintVector(
  layer: CanvasRenderingContext2D,
  c: Extract<Component, { type: "vector" }>,
  cx: number,
  cy: number,
  enterP: number,
) {
  if (typeof Path2D === "undefined") return;
  const path = new Path2D(c.d);
  layer.save();
  layer.globalAlpha *= enterP;
  layer.translate(cx, cy);
  if (c.rotate) layer.rotate(c.rotate);
  if (c.scale && c.scale !== 1) layer.scale(c.scale, c.scale);
  if (c.fill) {
    layer.fillStyle = c.fill;
    layer.fill(path);
  }
  if (c.stroke) {
    layer.strokeStyle = c.stroke;
    layer.lineWidth = c.width ?? 2;
    layer.lineJoin = "round";
    layer.lineCap = "round";
    layer.stroke(path);
  }
  layer.restore();
}

/** Draw a `{type:"svg"}` component — embedded SVG markup rendered via a lazily-loaded/cached `Image`
 *  (see `getSvgImage`), same async-load pattern as `{type:"image"}`. If the image hasn't finished
 *  loading yet this frame, it's simply skipped (drawn on a later frame once ready). */
const SVG_STROKES_DONE = 0.7;
const SVG_STROKE_DUR = 0.35;
const SVG_FILL_FROM = 0.55;

/** Paint an SVG; with strokes and a draw entrance, its outlines draw on first and the picture fades in over them. */
function paintSvg(
  layer: CanvasRenderingContext2D,
  c: Extract<Component, { type: "svg" }>,
  cx: number,
  cy: number,
  enterP: number,
  ink: string,
) {
  const drawing = c.strokes && enterP < 1;
  if (drawing && c.strokes) {
    const step = (SVG_STROKES_DONE - SVG_STROKE_DUR) / Math.max(1, c.strokes.length - 1);
    strokeSequence(layer, c.strokes, enterP, { step, dur: SVG_STROKE_DUR, style: { color: ink, width: 2 } });
  }
  if (typeof Image === "undefined") return;
  const img = getSvgImage(c.markup);
  const alpha = drawing ? Math.max(0, (enterP - SVG_FILL_FROM) / (1 - SVG_FILL_FROM)) : enterP;
  if (img && alpha > 0) drawSvg(layer, img, cx, cy, c.w, c.h, { alpha, rotate: c.rotate });
}

/**
 * The fill level one component has reached at time `t`, easing between the steps it was given.
 *
 * Returns undefined when the component has no fill, which is every component that was never the
 * target of a `fill` action — those draw whole, as they always did. A component that IS filled starts
 * empty, because the emptiness is half of what a filling teaches.
 */
function fillAt(
  steps: FillStep[] | undefined,
  t: number,
): { level: number; dir: MaskOpts["dir"] } | undefined {
  if (!steps || steps.length === 0) return undefined;

  let level = 0;
  let dir: MaskOpts["dir"] = steps[0].dir ?? "up";
  for (const step of steps) {
    if (t < step.at) break;

    dir = step.dir ?? dir;
    const span = Math.max(1e-6, step.dur);
    const progress = Math.min(1, (t - step.at) / span);
    level = level + (step.to - level) * easeInOutCubic(progress);
    if (progress < 1) break;

    level = step.to;
  }

  return { level: Math.max(0, Math.min(1, level)), dir };
}

const PART_TINT_ALPHA = 0.55;

/** Tint the inside of a picture part's outline, risen to `level` from the side `dir` names. */
function paintWash(layer: CanvasRenderingContext2D, outline: Vec2[], color: string, alpha: number) {
  layer.save();
  layer.beginPath();
  outline.forEach(([x, y], index) => (index === 0 ? layer.moveTo(x, y) : layer.lineTo(x, y)));
  layer.closePath();
  layer.globalAlpha *= alpha;
  layer.fillStyle = color;
  layer.fill();
  layer.restore();
}

function paintPartFill(
  layer: CanvasRenderingContext2D,
  outline: Vec2[],
  color: string,
  level: number,
  dir: MaskOpts["dir"],
) {
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [w, h] = [x1 - x0, y1 - y0];
  layer.save();
  layer.beginPath();
  outline.forEach(([x, y], index) => (index === 0 ? layer.moveTo(x, y) : layer.lineTo(x, y)));
  layer.closePath();
  layer.clip();
  layer.globalAlpha *= PART_TINT_ALPHA;
  layer.fillStyle = color;
  if (dir === "down") layer.fillRect(x0, y0, w, h * level);
  else if (dir === "left") layer.fillRect(x1 - w * level, y0, w * level, h);
  else if (dir === "right") layer.fillRect(x0, y0, w * level, h);
  else layer.fillRect(x0, y1 - h * level, w, h * level);
  layer.restore();
}

/** Draw a `{type:"prop"}` component — a named prop from `PROP_CATALOG`, rendered as its list of
 *  Path2D parts (each with its own fill/stroke), rotated as a whole by `angle` (DEGREES). No-ops
 *  under environments without `Path2D` (node/vitest), same guard as `paintVector`. */
function paintProp(
  layer: CanvasRenderingContext2D,
  c: Extract<Component, { type: "prop" }>,
  cx: number,
  cy: number,
  enterP: number,
) {
  const parts = PROP_CATALOG[c.name]?.(c.size ?? 1, c.color);
  if (!parts) return;
  if (typeof Path2D === "undefined") return;
  layer.save();
  layer.globalAlpha *= enterP;
  layer.translate(cx, cy);
  if (c.angle) layer.rotate((c.angle * Math.PI) / 180);
  for (const part of parts) {
    const path = new Path2D(part.d);
    if (part.fill) {
      layer.fillStyle = part.fill;
      layer.fill(path);
    }
    if (part.stroke) {
      layer.strokeStyle = part.stroke;
      layer.lineWidth = part.width ?? 2;
      layer.lineJoin = "round";
      layer.lineCap = "round";
      layer.stroke(path);
    }
  }
  layer.restore();
}

/** A shape's `fill` is `string | [light,dark]` (the tuple form is disc-only, for the shaded-sphere
 *  gradient — see `paintShape`). Everywhere else just wants a single representative color; take the
 *  first stop of a tuple. `"none"` (and `""`) mean "no fill" — treat them as absent rather than as a
 *  literal (and truthy) CSS color, so a `{fill:"none", stroke:"X"}` shape neither runs the no-op fill
 *  path nor loses its stroke to a falsely-truthy `fill`. */
function fillColor(
  fill: string | [string, string] | undefined,
): string | undefined {
  const c = Array.isArray(fill) ? fill[0] : fill;
  return c && c !== "none" ? c : undefined;
}

/** Resolve the stroke color/width an eraser should use for a stroke/path component's exit — mirrors
 *  the color each type's own native-enter draw uses, so the erase reads as "the same stroke, undone". */
function strokeStyleFor(
  c: DrawComponent,
): { color: string; width?: number } | null {
  switch (c.type) {
    case "shape":
      if (c.shape === "disc") return null;
      return {
        color: c.stroke ?? fillColor(c.fill) ?? "#eef5ef",
        width: c.width,
      };
    case "parametric":
      return { color: c.color ?? "#5cc8ae", width: c.width };
    case "textPath":
      return { color: c.color ?? "#eef5ef" };
    default:
      return null;
  }
}

/** Build the native `erase` exit for stroke/path content (shape path/polygon-family, parametric,
 *  textPath) — anything `pointsFor`/`strokeStyleFor` can resolve a point array + stroke style for.
 *  Returns undefined for non-stroke content, so callers fall back to the fade exit treatment. */
function nativeEraseFor(
  c: DrawComponent,
  rc: RenderCtx,
): ((layer: CanvasRenderingContext2D, exitP: number) => void) | undefined {
  const pts = pointsFor(c, rc);
  const style = strokeStyleFor(c);
  if (!pts || pts.length < 2 || !style) return undefined;
  return (layer, exitP) =>
    erase(layer, pts, exitP, {
      style: { color: style.color, width: style.width },
    });
}

/** The point array a stroke component draws along: path/shape/parametric/textPath content exposes
 *  one; everything else returns null. */
function pointsFor(c: DrawComponent, rc: RenderCtx): Pt[] | null {
  const { cx, cy, w, h } = rc;
  const r = "r" in c ? (c.r ?? Math.min(w, h) / 2) : Math.min(w, h) / 2;
  switch (c.type) {
    case "shape": {
      if (c.shape === "path")
        return c.smooth === false ? (c.points ?? []) : smoothPath(c.points ?? [], { curve: "catmullRom" });
      if (c.shape === "circle") return circleShape(cx, cy, r);
      if (c.shape === "star") return starShape(cx, cy, r);
      if (c.shape === "heart") return heartShape(cx, cy, r);
      if (c.shape === "disc") return null;
      return polygonShape(cx, cy, r, c.sides ?? 5);
    }
    case "parametric": {
      const [u0, u1] = c.uDomain ?? [0, 1];
      const samples = c.samples ?? 120;
      const evalFx = compileExpr(c.fx);
      const evalFy = compileExpr(c.fy);
      const pts: Pt[] = [];
      for (let i = 0; i <= samples; i++) {
        const u = u0 + ((u1 - u0) * i) / samples;
        pts.push([cx + evalFx({ u }), cy + evalFy({ u })]);
      }
      return pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    }
    case "textPath":
      return c.path;
    default:
      return null;
  }
}

/**
 * Shared `map` painter used by both `paintNative` (mid-entrance, `enterP` in [0,1]) and `paintFinal`
 * (steady-state, `enterP` fixed at 1). Builds ONE projection fit to every lon/lat ring the map will
 * ever draw — features, the max-extent `outline`, every `grow` keyframe, and marker points (as tiny
 * degenerate rings) — so everything shares the same geometry, mirroring the original bespoke lesson's
 * single shared `PROJ`. Draw order: outline (thin stroke) → grow (filled, morphing over `growDur`) →
 * features (existing drawMap) → markers/flows (existing geoMarker/flowArrow).
 *
 * `growT` is the elapsed seconds since the map's own entrance start (`rc.t - rc.at` in paintNative;
 * a large constant in paintFinal so the grow animation always reads as complete at steady state).
 */
function paintMapComponent(
  layer: CanvasRenderingContext2D,
  c: Extract<Component, { type: "map" }>,
  area: { x: number; y: number; w: number; h: number },
  enterP: number,
  growT: number,
  theme: Theme,
) {
  const growKeyframes = c.grow ?? [];
  const proj = mapProjection(c, area);

  // 0. The sea: a backdrop map is the whole scene, so the water is painted before any land.
  if (c.backdrop && c.water) {
    layer.save();
    layer.globalAlpha *= enterP;
    layer.fillStyle = c.water;
    layer.fillRect(area.x, area.y, area.w, area.h);
    layer.restore();
  }

  // 1. max-extent outline — stroke only, no fill.
  if (c.outline) {
    drawFeature(layer, { id: "outline", rings: [c.outline] }, proj, {
      stroke: c.outlineStroke ?? "#8a7048",
      width: 1,
      p: enterP,
    });
  }

  // 2. borders-over-time: morph through `grow`'s keyframes over `growDur` seconds, filled.
  const n = growKeyframes.length;
  if (n >= 2) {
    const growDur = c.growDur ?? 8;
    // Smoothstep the morph (matches the original's `grow = phase(t, …)`), so borders ease in/out and
    // stay in lockstep with a `from` year counter + animated playhead that ease the same way.
    const growP = smooth(clamp01(growT / growDur));
    const seg = growP * (n - 1);
    const i = Math.min(Math.floor(seg), n - 2);
    const local = seg - i;
    const ring = borderAt(growKeyframes[i], growKeyframes[i + 1], local, proj);
    if (ring.length >= 3) {
      layer.save();
      layer.globalAlpha *= enterP;
      layer.beginPath();
      layer.moveTo(ring[0][0], ring[0][1]);
      for (let k = 1; k < ring.length; k++)
        layer.lineTo(ring[k][0], ring[k][1]);
      layer.closePath();
      layer.fillStyle = c.growFill ?? "rgba(154,59,46,0.28)";
      layer.fill();
      layer.strokeStyle = c.growStroke ?? "#9a3b2e";
      layer.lineWidth = 1.6;
      layer.lineJoin = "round";
      layer.stroke();
      layer.restore();
    }
  }

  // 3. features (existing region fills). `featureColors[i]`, when given, gives each feature its own
  // fill+stroke (same order as `features`) instead of the single shared teal — e.g. the four khanates
  // rendering in four distinct legend-matching colors. Semi-opaque fillAlpha so overlaps still read.
  // Water regions go down first and unstroked: a named gulf is the sea it sits in, not a polygon
  // floating on it, and the land drawn over it keeps a clean coast.
  const order = c.features.map((_f, i) => i).sort((a, b) => Number(c.featureColors?.[b] === c.water) - Number(c.featureColors?.[a] === c.water));
  drawMap(layer, order.map((i) => c.features[i]), proj, (_f, k) => {
    const i = order[k];
    // Staggered draw-on when `featureStagger` is set: feature `i` animates over its own window; else
    // every feature rides the map's shared `enterP`.
    const fp =
      c.featureStagger != null
        ? clamp01((growT - i * c.featureStagger) / (c.featureDur ?? 2.5))
        : enterP;
    const color = c.featureColors?.[i];
    if (color !== undefined && color === c.water) return { fill: color, fillAlpha: 1, p: fp };
    // Land on a backdrop is solid ground things stand on; an inset map keeps its translucent overlaps.
    return color
      ? { stroke: c.ink ?? color, fill: color, fillAlpha: c.backdrop ? 0.92 : 0.48, width: c.backdrop ? 1.2 : 1.5, p: fp }
      : { stroke: "#5b6b78", fill: "rgba(92,200,174,0.18)", p: fp };
  });

  // 3b. named places: a dot and its name, so a city is a point the reader can find and a label can aim at.
  for (const place of c.places ?? []) {
    const [x, y] = proj.project([place.lon, place.lat]);
    layer.save();
    layer.globalAlpha *= enterP;
    layer.fillStyle = c.ink ?? "#eef5ef";
    layer.beginPath();
    layer.arc(x, y, 3.2, 0, Math.PI * 2);
    layer.fill();
    layer.font = `600 ${MIN_TEXT}px -apple-system, sans-serif`;
    layer.textAlign = "left";
    layer.textBaseline = "middle";
    layer.fillText(place.name, x + 7, y);
    layer.restore();
  }

  // 4. markers + flows (existing). Each flow can carry its own `at`/`dur` draw-on window (seconds
  // since the map entrance, via `growT`); without them it rides the map's shared `enterP`.
  // A valued marker is a circle whose area is its value; the biggest go down first, so none hides a smaller one.
  const valued = (c.markers ?? []).filter((m) => m.value !== undefined).sort((a, b) => b.value! - a.value!);
  const largest = Math.max(0, ...valued.map((m) => m.value!));
  const reach = circleReach(area);
  for (const m of valued) {
    const [x, y] = proj.project([m.lon, m.lat]);
    const r = circleRadius(m.value!, largest, reach);
    proportionalMark(layer, x, y, r, enterP, { color: m.color ?? theme.palette.accent, ink: c.ink ?? theme.palette.ink });
    if (m.label) fadeText(layer, m.label, x, y + r + MIN_TEXT * 0.7, enterP, `600 ${MIN_TEXT}px ${theme.type.body}`, c.ink ?? theme.palette.ink, "center", theme.palette.bg);
  }
  for (const m of c.markers ?? []) {
    if (m.value !== undefined) continue;
    geoMarker(layer, [m.lon, m.lat], proj, {
      icon:
        m.icon && iconNames.includes(m.icon as IconName)
          ? (m.icon as IconName)
          : undefined,
      label: m.label,
      ink: c.ink,
      alpha: enterP,
    });
  }
  // `flows` endpoints may be a `[lon,lat]` pair OR a place name (a `places` entry / feature id /
  // marker label on this same map) — resolve names against the map's own place table.
  const flowNames = (c.flows ?? []).some(
    (f) => typeof f.from === "string" || typeof f.to === "string",
  )
    ? mapPlaceNames(c)
    : null;
  const flowLL = (v: [number, number] | string): [number, number] | null =>
    Array.isArray(v)
      ? v
      : flowNames
        ? (lookupPlace(flowNames, v) ?? null)
        : null;
  for (const f of c.flows ?? []) {
    const fp =
      f.at != null || f.dur != null
        ? clamp01((growT - (f.at ?? 0)) / (f.dur ?? 2.2))
        : enterP;
    if (fp <= 0) continue;
    const from = flowLL(f.from);
    const to = flowLL(f.to);
    if (!from || !to) continue;
    flowArrow(layer, from, to, proj, fp, {
      color: f.color,
      width: f.width,
      bend: f.bend,
    });
  }

  // 5. the key, in the band at the map's foot that its land is fitted above.
  if (c.legend) {
    const circles = valued.length ? { largest, reach, color: valued[0].color ?? theme.palette.accent } : undefined;
    mapLegend(layer, { ...c.legend, circles }, area.x + 8, mapLegendFoot(area), enterP, {
      ink: c.ink ?? theme.palette.ink,
      plate: theme.palette.surface,
      font: theme.type.body,
      format: formatValue,
    });
  }
}

/** The stretch of the tick row the playhead's year covers, which the tick labels leave to it. */
function chipSpan(
  layer: CanvasRenderingContext2D,
  tl: ReturnType<typeof makeTimeline>,
  c: Extract<Component, { type: "timeline" }>,
  ph: number | null | undefined,
): [number, number] | undefined {
  if (ph == null || c.playheadLabel === false) return undefined;
  const chip = timelineChip(layer, tl, ph);
  return [chip.x, chip.x + chip.w];
}

/**
 * Resolve a `timeline` component's effective playhead year for THIS instant. Backward-compatible: a
 * plain numeric `playhead` (no `playheadFrom`/`playheadTo`) still renders as a fixed marker exactly as
 * before. When `playheadFrom`/`playheadTo` ARE given, the marker sweeps linearly across that window —
 * `elapsed` is the seconds since the component's own `at` (mirrors `paintMapComponent`'s `growT`), and
 * `over` defaults to the component's own entrance `dur` so authors can reuse the SAME timing they
 * already pass for e.g. a `map`'s `growDur` (see mongol.ts scene 3, which keys both off `growDur`).
 * Returns `undefined` when there's no playhead to draw at all.
 */
function resolvePlayhead(
  c: Extract<Component, { type: "timeline" }>,
  elapsed: number,
  defaultOver: number,
): number | undefined {
  if (c.playheadFrom != null && c.playheadTo != null) {
    const over = c.playheadOver ?? defaultOver;
    // Smoothstep (matches the original's `phase`-driven playhead), so it stays in lockstep with a
    // `grow` map morph + a `from` year counter that also ease this way.
    const p = over > 0 ? smooth(clamp01(elapsed / over)) : 1;
    return lerpNum(c.playheadFrom, c.playheadTo, p);
  }
  return c.playhead ?? undefined;
}

/**
 * Native entrances: thread `enterP` into the content's own progress-driven draw. Used for
 * slam/word/typewriter/scramble/draw/build/borderThenFill/none. `enterDur` is the entrance window;
 * we synthesize `t' = at + enterP*enterDur` so every primitive's own `(t-at)/dur` math reproduces
 * `enterP` exactly, whether it takes raw t/at (drawSlam/drawWordReveal/drawScramble/barChart/scatter)
 * or a pre-clamped p (drawTypewriter/drawMath/chart line-area/shape/parametric/textPath).
 */
function paintNative(
  layer: CanvasRenderingContext2D,
  c: DrawComponent,
  rc: RenderCtx,
  enterP: number,
  enterDur: number,
) {
  if (c.type === "text" && c.text.includes("\n")) {
    // A wrapped text enters line after line, each in its share of the entrance.
    eachLine(c, rc, (line, lineRc, index, count) =>
      paintNative(layer, line, { ...lineRc, at: rc.at + (index * enterDur) / count }, clamp01(enterP * count - index), enterDur / count),
    );
    return;
  }
  const { at, cx, cy, w, h } = rc;
  // A zero-length entrance (`initial: "visible"`, or `entrance: "instant"`) carries its progress only
  // in enterP — `tPrime` collapses to `at`, which every native primitive reads back as progress 0 and
  // refuses to draw. That is what left a text set visible from frame zero as a permanent ghost.
  // Fully-entered content is exactly what paintFinal draws.
  if (enterDur <= 0) {
    paintFinal(layer, c, rc);
    return;
  }
  const tPrime = at + enterP * enterDur;
  const syntheticRc: RenderCtx = { ...rc, t: tPrime, dur: enterDur };
  const area = { x: cx - w / 2, y: cy - h / 2, w, h };

  switch (c.type) {
    case "text": {
      const font = textFont(c, rc.theme.type.display);
      const color = c.color ?? rc.theme.palette.ink;
      const align = c.align ?? "center";
      const leftX = cx - w / 2;
      const mode = c.mode ?? textModeFromEnter(c.enter?.type);
      if (mode === "word") {
        const wordCount = Math.max(
          1,
          c.text.split(/\s+/).filter(Boolean).length,
        );
        const wordDur = Math.max(0.08, Math.min(0.35, enterDur * 0.35));
        const wordStep = Math.max(
          0,
          (enterDur - wordDur) / Math.max(1, wordCount - 1),
        );
        drawWordReveal(
          layer,
          c.text,
          leftX,
          cy,
          tPrime,
          { font, color, align },
          { start: at, step: wordStep, dur: wordDur, mode: "rise" },
        );
      } else if (mode === "typewriter") {
        drawTypewriter(
          layer,
          c.text,
          leftX,
          cy,
          enterP,
          { font, color, align },
          { cursor: true, t: tPrime },
        );
      } else if (mode === "slam") {
        drawSlam(layer, c.text, cx, cy, tPrime, at, { font, color });
      } else if (mode === "scramble") {
        drawScramble(layer, c.text, cx, cy, tPrime, at, { font, color });
      } else {
        fadeText(layer, c.text, cx, cy, enterP, font, color, align, c.role === "caption" ? rc.theme.palette.bg : undefined);
      }
      return;
    }
    case "equation": {
      drawMath(layer, c.tex, cx, cy, {
        size: c.size ?? 30,
        color: c.color ?? "#eef5ef",
        align: c.align,
        p: enterP,
      });
      return;
    }
    case "measure": {
      const size = c.size ?? 44;
      const font = `800 ${size}px ${rc.theme.type.display}`;
      const suffix = measureSuffix(c.unit);
      // `countFrom` readouts (e.g. a running year counter) smoothstep across their window so they stay in
      // lockstep with other `phase`-eased content (the map's `grow` morph + the timeline playhead,
      // which now ease the same way) — mirroring the original's single `grow = phase(t, …)` driving
      // year/ring/playhead together. Plain 0→value stats keep the default cubic ease (`c.from` unset).
      const countEase = c.countFrom != null ? smooth : undefined;
      // Use the RAW scene time `rc.t` (like the map `grow` + timeline playhead), NOT `tPrime` — `tPrime`
      // is `at + enterP*enterDur`, and since `enterP` is already smoothstep-eased, feeding it to
      // `counterValue` (which eases again) would DOUBLE-ease the count and drift ahead of the
      // playhead/border it should stay locked to.
      const reading = counterValue(rc.t, at, enterDur, c.countFrom ?? 0, c.value, countEase);
      const filled = meterFill(c, reading);
      if (filled !== undefined)
        drawMeter(layer, cx, cy, size, filled, c.meter ?? "bar", c.color ?? rc.theme.palette.accent);
      const rows = measureRows(c, cy, size);
      if (!c.quiet)
        drawCounter(
          layer,
          cx,
          rows.digits,
          reading,
          { font, color: c.color ?? rc.theme.palette.accent, align: "center" },
          {
            commas: c.commas ?? true,
            decimals: c.decimals,
            prefix: c.prefix,
            suffix,
          },
        );
      if (c.label)
        fadeText(
          layer,
          c.label,
          cx,
          rows.label,
          enterP,
          `600 ${MIN_TEXT}px ` + rc.theme.type.display,
          rc.theme.palette.muted,
          "center",
        );
      return;
    }
    case "chart": {
      paintChart(layer, c, syntheticRc, enterP);
      return;
    }
    case "shape": {
      paintShape(layer, c, rc, enterP);
      return;
    }
    case "parametric": {
      const pts = pointsFor(c, rc);
      if (!pts || pts.length < 2) return;
      strokeOn(layer, pts, enterP, {
        color: c.color ?? "#5cc8ae",
        width: c.width,
        dash: c.dash,
      });
      return;
    }
    case "textPath": {
      drawTextAlongPath(layer, c.text, c.path, enterP, {
        font: `500 ${c.size ?? 18}px ${rc.theme.type.display}`,
        color: c.color ?? rc.theme.palette.ink,
      });
      return;
    }
    case "icon": {
      if (!iconNames.includes(c.name as IconName)) return;
      drawIcon(layer, c.name as IconName, cx, cy, c.size ?? 28, {
        color: c.color,
        filled: c.filled,
        alpha: enterP,
      });
      return;
    }
    case "legend": {
      colorSemantics().legend(
        layer,
        c.categories,
        cx - w / 2,
        cy - (c.categories.length * (c.rowH ?? 20)) / 2,
        { rowH: c.rowH, colors: c.colors, swatchAlpha: c.swatchAlpha, ink: c.ink ?? rc.theme.palette.ink },
      );
      return;
    }
    case "image": {
      const img = getImage(c.src);
      if (img)
        drawSvg(layer, img, cx, cy, w, h, { alpha: enterP, rotate: c.rotate });
      return;
    }
    case "vector": {
      paintVector(layer, c, cx, cy, enterP);
      return;
    }
    case "svg": {
      paintClipped(layer, c.clipBox, () => paintSvg(layer, c, cx, cy, enterP, rc.theme.palette.ink));
      return;
    }
    case "prop": {
      paintProp(layer, c, cx, cy, enterP);
      return;
    }
    case "map": {
      paintMapComponent(layer, c, area, enterP, rc.t - at, rc.theme);
      return;
    }
    case "timeline": {
      const tl = makeTimeline(area, c.from, c.to, c.lanes?.length ?? 1);
      const pal = rc.theme.palette;
      const ph = resolvePlayhead(c, rc.t - at, enterDur);
      timelineAxis(layer, tl, { p: enterP, color: pal.muted, ink: pal.muted, clear: chipSpan(layer, tl, c, ph), ...laneAxis(c) });
      timelineLanes(layer, tl, c, enterP, { ...pal, font: rc.theme.type.body });
      timelineEras(layer, tl, c.eras ?? [], enterP);
      timelineEvents(layer, tl, c.events ?? [], tPrime, {
        start: at,
        ink: pal.ink,
      });
      if (ph != null)
        timelinePlayhead(layer, tl, ph, {
          label: c.playheadLabel ?? true,
          color: pal.accent,
        });
      return;
    }
    case "table": {
      drawTable(layer, c.rows, area.x, area.y, area.w, {
        header: c.header,
        rowH: c.rowH,
        ink: c.ink,
        p: enterP,
      });
      return;
    }
    case "figure": {
      paintFigure(layer, c.ops, cx, cy, enterP, figureStyle(c, rc));
      return;
    }
    case "group": {
      paintGroup(c, rc);
      return;
    }
    // particles/flow/glow are dispatched earlier in `drawComponentInstance` (they paint continuously
    // via `emit`/`radialGlow`, not a progress-driven native entrance) — unreachable here at runtime,
    // but still part of the `DrawComponent` union so the exhaustiveness check needs a case.
    case "particles":
    case "flow":
    case "glow":
    case "region":
      return;
    default: {
      const _exhaustive: never = c;
      console.warn(
        `gcl: no native-enter handler for component type "${(_exhaustive as Component).type}"`,
      );
      return;
    }
  }
}

/**
 * Duplicate tick-label guard: `niceTicks` (charts.ts) picks fractional steps (e.g. 0.5) for small
 * spans, which the default 0-decimal `fmt` then rounds to the same integer for adjacent ticks
 * (0, 0.5, 1, 1.5, 2 → "0","0","1","1","2"). For small integer domains we instead want one tick per
 * integer. Returns `undefined` (defer to `niceTicks`) when the domain isn't a small integer range,
 * so larger/non-integer domains keep their existing "nice" tick behavior.
 */
/** A timeline with lanes keeps its years along the foot, clear of every lane. */
function laneAxis(c: Extract<Component, { type: "timeline" }>): { baselineFrac?: number } {
  return c.lanes?.length ? { baselineFrac: 0.96 } : {};
}

/** A figure's page colour and type, and how far it has faded back once later work took the eye. */
function figureStyle(c: Extract<Component, { type: "figure" }>, rc: RenderCtx) {
  const dim = c.dimAt === undefined ? 0 : clamp01((rc.t - c.dimAt) / 0.5);
  return { bg: rc.theme.palette.bg, font: rc.theme.type.body, dim };
}

/** Run a paint inside a rectangular clip when one is given, leaving the context as it was. */
function paintClipped(
  layer: CanvasRenderingContext2D,
  clip: { x: number; y: number; w: number; h: number } | undefined,
  paint: () => void,
): void {
  if (!clip) {
    paint();
    return;
  }
  layer.save();
  layer.beginPath();
  layer.rect(clip.x, clip.y, clip.w, clip.h);
  layer.clip();
  paint();
  layer.restore();
}

export function integerTicks([a, b]: [number, number]): number[] | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span = hi - lo;
  if (span <= 0 || span > 6 || !Number.isInteger(lo) || !Number.isInteger(hi))
    return undefined;
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}


/** Bar/line/area/scatter/pie/function chart entrance — each family's own native stagger/progress. */
function paintChart(
  layer: CanvasRenderingContext2D,
  c: Extract<Component, { type: "chart" }>,
  rc: RenderCtx,
  enterP: number,
) {
  const { at, cx, cy, w, h } = rc;
  const area = { x: cx - w / 2, y: cy - h / 2, w, h };
  const color = c.color ?? "#5cc8ae";
  const showAxes = c.axes !== false;
  // The axes are written in the page's own quiet ink, so they hold on a light page as on a dark one.
  const inks = { color: rc.theme.palette.muted, ink: rc.theme.palette.muted };
  if (c.chart === "bar") {
    const data: Datum[] = c.data ?? [];
    const ymax = Math.max(1, ...data.map((d) => d.value));
    const plot = makePlot(area, [0, 1], [0, ymax]);
    // Bars are named under themselves, so the category axis carries no numbers.
    if (showAxes)
      axes(layer, plot, { ...inks, p: enterP, xLabel: c.xLabel, yLabel: c.yLabel, xTicks: [] });
    // The cascade is paced by the entrance itself, so the last bar is at full height as the entrance ends.
    barChart(layer, plot, data, { t: at + enterP, start: at, step: 0.4 / Math.max(1, data.length - 1), dur: 0.6, showValues: true, color });
  } else if (c.chart === "line" || c.chart === "area") {
    const lines = seriesLines(c.series ?? []);
    const { x: xDomain, y: yDomain } = seriesDomains(c);
    const plot = makePlot(area, xDomain, yDomain);
    if (showAxes)
      axes(layer, plot, {
        ...inks,
        p: enterP,
        xLabel: c.xLabel,
        yLabel: c.yLabel,
        xTicks: integerTicks(xDomain),
        yTicks: integerTicks(yDomain),
      });
    // Each line its own colour, the first the chart's own, so two curves that cross stay two curves.
    const colours = seriesColors(c, rc.theme.palette);
    // A line is drawn heavy enough to read as the chart's subject, and where it ends now is marked with its value.
    lines.forEach((line, index) => {
      const colour = colours[index % colours.length];
      lineChart(layer, plot, line, enterP, { area: c.chart === "area" && lines.length === 1, color: colour, width: lines.length === 1 ? 5 : 3.5, markers: line.length <= LINE_DOTS });
      const name = c.names?.[index];
      const [x, y] = line[line.length - 1];
      const latest = lines.length === 1 ? formatValue(y) : undefined;
      const tag = name && latest ? `${name}: ${latest}` : (name ?? latest);
      if (enterP >= 1) lastPoint(layer, plot.sx(x), plot.sy(y), colour, rc.theme.palette.bg);
      if (tag) fadeText(layer, tag, plot.sx(x) - 10, plot.sy(y) - 14, enterP, `700 ${MIN_TEXT}px ${rc.theme.type.body}`, colour, "right", rc.theme.palette.bg);
    });
  } else if (c.chart === "scatter") {
    const series = seriesLines(c.series ?? []).flat();
    const { x: xDomain, y: yDomain } = seriesDomains(c);
    const plot = makePlot(area, xDomain, yDomain);
    if (showAxes)
      axes(layer, plot, {
        ...inks,
        p: enterP,
        xLabel: c.xLabel,
        yLabel: c.yLabel,
        xTicks: integerTicks(xDomain),
        yTicks: integerTicks(yDomain),
      });
    scatter(layer, plot, series, at + enterP, { color, start: at, step: 0.5 / Math.max(1, series.length - 1) });
    const fit = c.trend ? leastSquares(series) : undefined;
    if (fit) {
      const [x0, x1] = xDomain;
      const ends: Pt[] = [[plot.sx(x0), plot.sy(fit.a + fit.b * x0)], [plot.sx(x1), plot.sy(fit.a + fit.b * x1)]];
      layer.save();
      layer.beginPath();
      layer.rect(plot.x, plot.y, plot.w, plot.h);
      layer.clip();
      strokeOn(layer, ends, clamp01((enterP - 0.5) / 0.5), { color: rc.theme.palette.second, width: 2.5, dash: [8, 6] });
      layer.restore();
    }
  } else if (c.chart === "pie") {
    const data: Datum[] = c.data ?? [];
    pie(layer, cx, cy, Math.min(w, h) / 2, data, enterP, {
      donut: c.donut,
      labels: true,
    });
  } else if (c.chart === "function") {
    const xDomain = c.xDomain ?? [-1, 1];
    const yDomain = c.yDomain ?? [-1, 1];
    const plot = makePlot(area, xDomain, yDomain);
    const evalFn = compileExpr(c.fn ?? "x");
    if (showAxes)
      axes(layer, plot, {
        ...inks,
        p: enterP,
        xLabel: c.xLabel,
        yLabel: c.yLabel,
        xTicks: integerTicks(xDomain),
        yTicks: integerTicks(yDomain),
      });
    plotFunction(layer, plot, (x) => evalFn({ x }), enterP, { color });
  } else if (c.chart === "riemann") {
    paintRiemann(layer, area, c, enterP);
  }
}

// A line of more points than this is a trend read as one stroke, with no dot on every point.
const LINE_DOTS = 12;

/** The point a line ends on, now: a dot ringed in the page's colour so it stands off the line. */
function lastPoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, ring: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = ring;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** The straight line nearest a cloud of points, `y = a + b·x`; undefined when every x is the same. */
function leastSquares(points: [number, number][]): { a: number; b: number } | undefined {
  const n = points.length;
  if (n < 2) return undefined;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (sxx < 1e-12) return undefined;
  const b = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return { a: my - b * mx, b };
}

/**
 * Riemann-sum harvest (Phase 6): `n` rectangles under `fn` over `xDomain`, left-endpoint height,
 * building in one-by-one (staggered by the reveal progress `enterP`, same cascade style as
 * `barChart`) — the classic "area under a curve" calculus visual, generalized into a reusable chart
 * mode. Pure/deterministic: `compileExpr` is a ctx-free evaluator (see ./expr).
 */
function paintRiemann(
  layer: CanvasRenderingContext2D,
  area: { x: number; y: number; w: number; h: number },
  c: Extract<Component, { type: "chart" }>,
  enterP: number,
) {
  const [a, b] = c.xDomain ?? [0, 1];
  const n = Math.max(1, Math.floor(c.n ?? RIEMANN_DEFAULT));
  const evalFn = compileExpr(c.fn ?? "x");
  const color = c.color ?? "#5cc8ae";
  const dx = (b - a) / n;

  // Sample the curve to find a sensible yDomain (baseline 0 always included so bars read from axis).
  const samples: number[] = [];
  for (let i = 0; i <= n; i++) samples.push(evalFn({ x: a + i * dx }));
  const finiteSamples = samples.filter((v) => Number.isFinite(v));
  const yMax = Math.max(0, ...finiteSamples, 1e-6);
  const yMin = Math.min(0, ...finiteSamples);
  const yDomain: [number, number] = c.yDomain ?? [yMin, yMax];
  const plot = makePlot(area, [a, b], yDomain);
  const showAxes = c.axes !== false;
  if (showAxes)
    axes(layer, plot, {
      p: enterP,
      xLabel: c.xLabel,
      yLabel: c.yLabel,
      xTicks: integerTicks([a, b]),
      yTicks: integerTicks(yDomain),
    });

  const baseY = plot.sy(0);
  const step = 0.6 / n; // stagger so the whole cascade fits within the entrance window
  layer.save();
  for (let i = 0; i < n; i++) {
    const gp = clamp01(
      (enterP - i * step) / Math.max(1e-3, 1 - (n - 1) * step),
    );
    if (gp <= 0) continue;
    const x0 = a + i * dx;
    const fx = evalFn({ x: x0 });
    if (!Number.isFinite(fx)) continue;
    const rx0 = plot.sx(x0);
    const rx1 = plot.sx(x0 + dx);
    const topFull = plot.sy(fx);
    const top = fx >= 0 ? lerpNum(baseY, topFull, gp) : baseY;
    const bottom = fx >= 0 ? baseY : lerpNum(baseY, topFull, gp);
    layer.globalAlpha = 0.55 + 0.35 * gp;
    layer.fillStyle = color;
    layer.fillRect(
      Math.min(rx0, rx1),
      Math.min(top, bottom),
      Math.abs(rx1 - rx0),
      Math.max(1, Math.abs(bottom - top)),
    );
    layer.strokeStyle = "rgba(255,255,255,0.35)";
    layer.lineWidth = 1;
    layer.strokeRect(
      Math.min(rx0, rx1),
      Math.min(top, bottom),
      Math.abs(rx1 - rx0),
      Math.max(1, Math.abs(bottom - top)),
    );
  }
  layer.restore();

  // The curve itself draws on last, riding the same overall progress, so it reads as "the rectangles
  // approximate this line".
  plotFunction(layer, plot, (x) => evalFn({ x }), enterP, {
    color: color,
    width: 2,
  });
}

function lerpNum(a: number, b: number, p: number): number {
  return a + (b - a) * clamp01(p);
}

/** Shape a→b target point list for a `motion.kind==="morph"` component — same center/r as the shape's
 *  own points, per the target `toShape`/`sides`. */
function morphTargetShape(
  toShape: "circle" | "polygon" | "star" | "heart",
  sides: number | undefined,
  cx: number,
  cy: number,
  r: number,
): Pt[] {
  switch (toShape) {
    case "circle":
      return circleShape(cx, cy, r);
    case "star":
      return starShape(cx, cy, r);
    case "heart":
      return heartShape(cx, cy, r);
    default:
      return polygonShape(cx, cy, r, sides ?? 5);
  }
}

/**
 * `disc` harvest (Phase 6): render as a shaded sphere — a radial gradient sweeping light→dark
 * (light source at upper-left, ~35% in from the rim) plus a soft rim glow — instead of a flat filled
 * circle, so it reads as a planet/cell/atom body. `c.fill` may be a single color (a dark shade is
 * derived automatically) or an explicit `[light, dark]` pair; `c.shine` adds a small specular
 * highlight. Deterministic (no randomness, pure function of enterP/geometry).
 */
function paintDisc(
  layer: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  c: Extract<Component, { type: "shape" }>,
  enterP: number,
) {
  if (r <= 0) return;
  const [light, dark] = discColors(c.fill);
  radialGlow(layer, cx, cy, r * 1.3, light, enterP * 0.6);

  layer.save();
  layer.globalAlpha *= enterP;
  const lx = cx - r * 0.35;
  const ly = cy - r * 0.35;
  const grad = layer.createRadialGradient(lx, ly, r * 0.05, cx, cy, r);
  grad.addColorStop(0, light);
  grad.addColorStop(0.55, blendColor(light, dark, 0.5));
  grad.addColorStop(1, dark);
  layer.fillStyle = grad;
  layer.beginPath();
  layer.arc(cx, cy, r, 0, Math.PI * 2);
  layer.fill();

  // Rim glow: a thin bright arc opposite the light source, reading as atmosphere/limb light.
  layer.save();
  layer.globalCompositeOperation = "lighter";
  layer.strokeStyle = light;
  layer.globalAlpha *= 0.35;
  layer.lineWidth = Math.max(1.5, r * 0.06);
  layer.beginPath();
  layer.arc(cx, cy, r - layer.lineWidth / 2, 0, Math.PI * 2);
  layer.stroke();
  layer.restore();

  if (c.shine) {
    const shineR = r * 0.22;
    const sx = cx - r * 0.4;
    const sy = cy - r * 0.4;
    const shineGrad = layer.createRadialGradient(sx, sy, 0, sx, sy, shineR);
    shineGrad.addColorStop(0, "rgba(255,255,255,0.85)");
    shineGrad.addColorStop(1, "rgba(255,255,255,0)");
    layer.fillStyle = shineGrad;
    layer.beginPath();
    layer.arc(sx, sy, shineR, 0, Math.PI * 2);
    layer.fill();
  }
  layer.restore();
}

/** Resolve a disc's [light, dark] gradient stops: an explicit tuple wins; a single color derives a
 *  darker shade automatically (multiply toward black); the default is the standard accent teal. */
function discColors(
  fill: string | [string, string] | undefined,
): [string, string] {
  if (Array.isArray(fill)) return fill;
  const light = fill ?? "#5cc8ae";
  return [light, blendColor(light, "#000000", 0.65)];
}

/** Linear-blend two hex colors (`p`=0 → a, `p`=1 → b). Falls back to `a` for non-hex input (named
 *  CSS colors, rgba() strings) rather than attempting to parse them — good enough for the disc's own
 *  authored palette, which is expected to be hex. */
function blendColor(a: string, b: string, p: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(lerpNum(pa[0], pb[0], p));
  const g = Math.round(lerpNum(pa[1], pb[1], p));
  const bl = Math.round(lerpNum(pa[2], pb[2], p));
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

// How many of its heads' lengths an arrow must run to read as an arrow.
const ARROW_LEAST_HEADS = 3;

function arrowTooShort(pts: Pt[], width: number | undefined): boolean {
  const lengths = polylineLengths(pts);
  return (lengths[lengths.length - 1] ?? 0) < ARROW_LEAST_HEADS * arrowheadSize(width);
}

/** Shape entrance: draw-on stroke or fill fade-in, matching P1 behavior.
 *  When `motion.kind === "morph"`, content-level shape A→B interpolation (drawMorph) takes over —
 *  the motion window's phase drives the morph, independent of the enter/exit progress `enterP`. */
function paintShape(
  layer: CanvasRenderingContext2D,
  c: Extract<Component, { type: "shape" }>,
  rc: RenderCtx,
  enterP: number,
) {
  const { cx, cy, w, h } = rc;
  const r = c.r ?? Math.min(w, h) / 2;
  const morphs = (c.motions ?? [])
    .filter((spec): spec is Extract<MotionSpec, { kind: "morph" }> => spec.kind === "morph")
    .sort((one, other) => (one.at ?? 0) - (other.at ?? 0));
  // Until its first change of shape it is drawn as itself: drawn on, and with its arrowheads.
  if (morphs.length && rc.t >= (morphs[0].at ?? 0)) {
    // Each morph starts from the form the one before left, so a second change of shape is drawn too.
    const current = Math.max(0, morphs.filter((spec) => (spec.at ?? 0) <= rc.t).length - 1);
    const formOf = (spec: (typeof morphs)[number]) => spec.toPoints ?? morphTargetShape(spec.toShape ?? "circle", spec.sides, cx, cy, r);
    const morph = morphs[current];
    const { at = 0, dur = 1 } = morph;
    const p = linearPhase(rc.t, at, dur);
    const a = current > 0 ? formOf(morphs[current - 1]) : (pointsFor(c, rc) ?? circleShape(cx, cy, r));
    const b = formOf(morph);
    const fill = fillColor(c.fill);
    layer.save();
    layer.globalAlpha *= enterP;
    const stroke = c.stroke ?? (fill ? undefined : "#eef5ef");
    const open = c.shape === "path" && c.closed !== true;
    const drawn = drawMorph(layer, a, b, p, { fill, stroke, width: c.width, closed: !open });
    // A force arrow that grows keeps its head: without it, the stretched arrow read as a bare line.
    if (open && c.arrow) pathArrowheads(layer, drawn, 1, c.arrow, { color: stroke ?? fill, width: c.width });
    layer.restore();
    return;
  }
  if (c.shape === "disc") {
    paintDisc(layer, cx, cy, r, c, enterP);
    return;
  }
  const pts = pointsFor(c, rc);
  if (!pts) return;
  const useBorderThenFill = c.enter?.type === "borderThenFill";
  const fill = fillColor(c.fill);
  if (c.shape === "path" && !c.closed) {
    if (useBorderThenFill) {
      drawBorderThenFill(layer, pts, enterP, {
        style: { color: c.stroke ?? fill ?? "#eef5ef", width: c.width },
        fill,
      });
      return;
    }
    // Shorter than its head could point along, an arrow was drawn as a lone blot of a head: it is not drawn.
    if (c.arrow && arrowTooShort(pts, c.width)) return;
    const color = c.stroke ?? fill ?? "#eef5ef";
    strokeOn(layer, pts, enterP, { color, width: c.width, dash: c.dash });
    if (c.arrow) pathArrowheads(layer, pts, enterP, c.arrow, { color, width: c.width });
    return;
  }
  if (useBorderThenFill) {
    const closed: Pt[] = [...pts, pts[0]];
    drawBorderThenFill(layer, closed, enterP, {
      style: { color: c.stroke ?? "#eef5ef", width: c.width },
      fill,
    });
    return;
  }
  if (fill) {
    layer.save();
    layer.globalAlpha *= enterP;
    layer.fillStyle = fill;
    layer.beginPath();
    layer.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) layer.lineTo(pts[k][0], pts[k][1]);
    layer.closePath();
    layer.fill();
    layer.restore();
  }
  if (c.stroke || !fill) {
    const closed: Pt[] = [...pts, pts[0]];
    strokeOn(layer, closed, enterP, {
      color: c.stroke ?? "#eef5ef",
      width: c.width,
      dash: c.dash,
    });
  }
}

/**
 * Paint a component's FINISHED content (as if p=1) in absolute coords — used by masked/fade/transform
 * entrance+exit wrappers, which animate visibility around the content rather than the content's own
 * progress. Mirrors `paintNative`'s per-type drawing but always at full completion.
 */
function paintFinal(
  layer: CanvasRenderingContext2D,
  c: DrawComponent,
  rc: RenderCtx,
) {
  if (c.type === "text" && c.text.includes("\n")) {
    eachLine(c, rc, (line, lineRc) => paintFinal(layer, line, lineRc));
    return;
  }
  const { cx, cy, w, h } = rc;
  const area = { x: cx - w / 2, y: cy - h / 2, w, h };
  switch (c.type) {
    case "text": {
      const font = textFont(c, rc.theme.type.display);
      const color = c.color ?? rc.theme.palette.ink;
      const align = c.align ?? "center";
      fadeText(layer, c.text, cx, cy, 1, font, color, align, c.role === "caption" ? rc.theme.palette.bg : undefined);
      return;
    }
    case "equation": {
      drawMath(layer, c.tex, cx, cy, {
        size: c.size ?? 30,
        color: c.color ?? "#eef5ef",
        align: c.align,
        p: 1,
      });
      return;
    }
    case "measure": {
      const size = c.size ?? 44;
      const font = `800 ${size}px ${rc.theme.type.display}`;
      const suffix = measureSuffix(c.unit);
      const resting = meterFill(c, c.value);
      if (resting !== undefined)
        drawMeter(layer, cx, cy, size, resting, c.meter ?? "bar", c.color ?? rc.theme.palette.accent);
      const rows = measureRows(c, cy, size);
      if (!c.quiet)
        drawCounter(
          layer,
          cx,
          rows.digits,
          c.value,
          { font, color: c.color ?? rc.theme.palette.accent, align: "center" },
          {
            commas: c.commas ?? true,
            decimals: c.decimals,
            prefix: c.prefix,
            suffix,
          },
        );
      if (c.label)
        fadeText(
          layer,
          c.label,
          cx,
          rows.label,
          1,
          `600 ${MIN_TEXT}px ` + rc.theme.type.display,
          rc.theme.palette.muted,
          "center",
        );
      return;
    }
    case "chart": {
      paintChart(layer, c, rc, 1);
      return;
    }
    case "shape": {
      paintShape(layer, c, rc, 1);
      return;
    }
    case "parametric": {
      const pts = pointsFor(c, rc);
      if (!pts || pts.length < 2) return;
      strokeOn(layer, pts, 1, { color: c.color ?? "#5cc8ae", width: c.width, dash: c.dash });
      return;
    }
    case "textPath": {
      drawTextAlongPath(layer, c.text, c.path, 1, {
        font: `500 ${c.size ?? 18}px ${rc.theme.type.display}`,
        color: c.color ?? rc.theme.palette.ink,
      });
      return;
    }
    case "icon": {
      if (!iconNames.includes(c.name as IconName)) return;
      drawIcon(layer, c.name as IconName, cx, cy, c.size ?? 28, {
        color: c.color,
        filled: c.filled,
        alpha: 1,
      });
      return;
    }
    case "legend": {
      colorSemantics().legend(
        layer,
        c.categories,
        cx - w / 2,
        cy - (c.categories.length * (c.rowH ?? 20)) / 2,
        { rowH: c.rowH, colors: c.colors, swatchAlpha: c.swatchAlpha, ink: c.ink ?? rc.theme.palette.ink },
      );
      return;
    }
    case "image": {
      const img = getImage(c.src);
      if (img)
        drawSvg(layer, img, cx, cy, w, h, { alpha: 1, rotate: c.rotate });
      return;
    }
    case "vector": {
      paintVector(layer, c, cx, cy, 1);
      return;
    }
    case "svg": {
      paintClipped(layer, c.clipBox, () => paintSvg(layer, c, cx, cy, 1, rc.theme.palette.ink));
      return;
    }
    case "prop": {
      paintProp(layer, c, cx, cy, 1);
      return;
    }
    case "map": {
      // `paintFinal` is reached on every frame once the map's own (short, default 0.6s) fade-in enter
      // completes — which is almost always, since `grow`'s multi-second `growDur` outlives that fade.
      // So `growT` here must be the REAL elapsed time since the map's `at` (mirrors the native path's
      // `rc.t - at`), not a constant "already complete" sentinel — otherwise `grow` would always
      // render at its final keyframe instead of animating across `growDur` (the borders-over-time bug).
      paintMapComponent(layer, c, area, 1, rc.t - rc.at, rc.theme);
      return;
    }
    case "timeline": {
      const tl = makeTimeline(area, c.from, c.to, c.lanes?.length ?? 1);
      const palF = rc.theme.palette;
      // Steady-state (reached on almost every frame past the short default fade-in — see the `map`
      // case above for the same shape of bug): use REAL elapsed time, not "already complete", so an
      // animated playhead (`playheadFrom`/`playheadTo`) keeps sweeping for as long as `playheadOver`
      // lasts instead of snapping straight to `playheadTo`.
      const ph = resolvePlayhead(c, rc.t - rc.at, c.enter?.dur ?? rc.dur);
      timelineAxis(layer, tl, { p: 1, color: palF.muted, ink: palF.muted, clear: chipSpan(layer, tl, c, ph), ...laneAxis(c) });
      timelineLanes(layer, tl, c, 1, { ...palF, font: rc.theme.type.body });
      timelineEras(layer, tl, c.eras ?? [], 1);
      timelineEvents(layer, tl, c.events ?? [], rc.t, {
        start: rc.at - 1e6,
        ink: palF.ink,
      }); // force-fired: all events already elapsed
      if (ph != null)
        timelinePlayhead(layer, tl, ph, {
          label: c.playheadLabel ?? true,
          color: palF.accent,
        });
      return;
    }
    case "table": {
      drawTable(layer, c.rows, area.x, area.y, area.w, {
        header: c.header,
        rowH: c.rowH,
        ink: c.ink,
        p: 1,
      });
      return;
    }
    case "figure": {
      paintFigure(layer, c.ops, cx, cy, 1, figureStyle(c, rc));
      return;
    }
    case "group": {
      paintGroup(c, rc);
      return;
    }
    // particles/flow/glow are dispatched earlier in `drawComponentInstance` — see the matching note
    // in `paintNative` above.
    case "particles":
    case "flow":
    case "glow":
    case "region":
      return;
    default: {
      const _exhaustive: never = c;
      console.warn(
        `gcl: no compile handler yet for component type "${(_exhaustive as Component).type}"`,
      );
      return;
    }
  }
}
