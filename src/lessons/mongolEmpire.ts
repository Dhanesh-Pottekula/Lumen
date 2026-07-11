/**
 * The Mongol Empire — the largest contiguous land empire in history.
 *
 * A six-scene lesson film on the PARCHMENT theme (aged map). Every scene is a pure function of its
 * LOCAL time t (0..duration): all motion derives from `phase(t, a, b)`, oscillators, and seeded
 * randomness — never a clock — so the whole film seeks like a video.
 *
 * Layer routing: parchment base + landmass → bg; regions/borders/timeline bands → mid; flow arrows,
 * dust, glows, playhead → fg; titles, callouts, counters, legends → annotation. Every scene routes
 * through `frame.layer.ctx(...)` so it inherits the theme's cinematic treatment; if no frame is
 * supplied it degrades to a plain clear-and-return.
 *
 * Geo data is authored in this file as coarse, illustrative lon/lat polygons (they only need to READ
 * as a map). Borders-over-time are three keyframe outer rings interpolated with `borderAt`.
 */
import { breathe, cycle, fadeText, lerp, phase } from "../slides/anim";
import { composeSlides } from "../slides/compose";
import { PARCHMENT } from "../render/theme";
import {
  borderAt,
  drawFeature,
  drawMap,
  featureCenter,
  fitProjection,
  flowArrow,
  geoMarker,
  type GeoFeature,
  type LonLat,
  type Projection,
} from "../render/geo";
import { callout } from "../render/callout";
import { focusOn, move, centerCamera, type Camera } from "../render/camera";
import { dustEmitter, emit } from "../render/particles";
import { spotlight } from "../render/reveal";
import { colorSemantics, drawIcon, type IconName } from "../render/icons";
import { eras, events, makeTimeline, playhead, timelineAxis, formatYear, type TimelineEvent } from "../render/timeline";
import { counterValue, drawCounter, drawSlam, drawTypewriter, drawWordReveal, formatNumber } from "../render/type-motion";
import type { Pt } from "../render/strokes";
import type { CanvasSlideDefinition } from "../slides/types";

const W = 920;
const H = 430;

// ── Geo data (coarse, illustrative lon/lat polygons — read as a map, not accurate) ────────────────

/** A rough Eurasia landmass outline (lon 25..140, lat 15..62). */
const EURASIA: LonLat[] = [
  [26, 46], [34, 55], [50, 60], [66, 61], [82, 60], [98, 58], [112, 56], [126, 55], [138, 50],
  [136, 42], [128, 36], [122, 30], [118, 22], [108, 20], [96, 22], [88, 27], [78, 24], [70, 26],
  [60, 25], [52, 30], [44, 34], [36, 38], [28, 40],
];

/** The Mongolia homeland region on the steppe. */
const MONGOLIA: LonLat[] = [
  [96, 50], [104, 52], [112, 51], [116, 47], [113, 43], [106, 42], [99, 44], [95, 47],
];

const KARAKORUM: LonLat = [102.5, 47.2];

/** Four khanate regions (coarse). Golden Horde (NW), Ilkhanate (SW), Chagatai (center), Yuan (E). */
const GOLDEN_HORDE: GeoFeature = {
  id: "golden-horde",
  rings: [[[30, 46], [40, 56], [58, 58], [72, 55], [76, 48], [66, 44], [52, 43], [38, 44]]],
  props: { name: "Golden Horde" },
};
const ILKHANATE: GeoFeature = {
  id: "ilkhanate",
  rings: [[[42, 42], [58, 43], [70, 40], [72, 33], [64, 27], [52, 28], [44, 33], [40, 38]]],
  props: { name: "Ilkhanate" },
};
const CHAGATAI: GeoFeature = {
  id: "chagatai",
  rings: [[[62, 50], [76, 51], [88, 49], [92, 43], [86, 38], [74, 38], [66, 42], [61, 46]]],
  props: { name: "Chagatai" },
};
const YUAN: GeoFeature = {
  id: "yuan",
  rings: [[[92, 52], [106, 53], [120, 52], [128, 45], [124, 36], [114, 30], [102, 33], [94, 40], [90, 46]]],
  props: { name: "Yuan" },
};
const KHANATES: GeoFeature[] = [GOLDEN_HORDE, ILKHANATE, CHAGATAI, YUAN];

/** Three keyframe outer rings for borders-over-time (1206 small → 1227 medium → 1260 peak). */
const BORDER_1206: LonLat[] = [
  [96, 50], [106, 52], [113, 50], [116, 46], [112, 43], [104, 42], [97, 45], [94, 48],
];
const BORDER_1227: LonLat[] = [
  [72, 52], [88, 55], [104, 55], [118, 52], [124, 45], [120, 37], [108, 33], [92, 35],
  [80, 40], [70, 45], [67, 49],
];
const BORDER_1260: LonLat[] = [
  [32, 48], [50, 58], [72, 59], [96, 58], [116, 55], [128, 48], [126, 38], [116, 30],
  [100, 30], [82, 34], [66, 34], [52, 34], [40, 38], [32, 42],
];
const BORDER_1368: LonLat[] = [
  [88, 52], [102, 54], [116, 53], [126, 47], [122, 37], [110, 31], [96, 34], [88, 42], [84, 47],
];

/** Cities along the empire / Silk Road (lon/lat). */
const CITY: Record<string, LonLat> = {
  beijing: [116, 40], // Yuan capital (Khanbaliq)
  samarkand: [67, 39.5],
  baghdad: [44.4, 33.3],
  kiev: [30.5, 50.5],
  bukhara: [64.4, 39.8],
  tabriz: [46.3, 38.1],
};

// A single projection fit to all features so every scene shares the same map geometry. Karakorum,
// khanates, and border keyframes all sit inside Eurasia's bounding box, so this frames them together.
const MAP_AREA = { x: 40, y: 46, w: W - 80, h: H - 120 };
const PROJ: Projection = fitProjection(
  [{ id: "eurasia", rings: [EURASIA] }, ...KHANATES, { id: "b", rings: [BORDER_1260] }],
  MAP_AREA,
  20,
);

const proj = (ll: LonLat): Pt => PROJ.project(ll);

// Densely-sampled Eurasia outline (Pt[]) for a hand-drawn coastline stroke.
const EURASIA_POLY: Pt[] = EURASIA.map(proj);

const th = PARCHMENT.palette;

/** Paint the aged-paper base + a soft landmass silhouette on the given (bg) ctx. */
function drawBase(bg: CanvasRenderingContext2D, landIn: number) {
  bg.fillStyle = th.bg;
  bg.fillRect(0, 0, W, H);
  // faint sea wash so land reads against it
  bg.save();
  bg.globalAlpha = 0.5;
  bg.fillStyle = "#dcc8a0";
  bg.fillRect(0, 0, W, H);
  bg.restore();
  // landmass silhouette, fading up
  if (landIn > 0) {
    bg.save();
    bg.globalAlpha = 0.55 * landIn;
    bg.fillStyle = th.surface;
    bg.beginPath();
    bg.moveTo(EURASIA_POLY[0][0], EURASIA_POLY[0][1]);
    for (let i = 1; i < EURASIA_POLY.length; i++) bg.lineTo(EURASIA_POLY[i][0], EURASIA_POLY[i][1]);
    bg.closePath();
    bg.fill();
    bg.restore();
  }
}

/** Stroke a projected ring (Pt[]) as an ink border with fill. */
function fillRing(ctx: CanvasRenderingContext2D, ring: Pt[], fill: string, stroke: string, alpha: number, width = 2) {
  if (ring.length < 3 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

const DISPLAY = PARCHMENT.type.display;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Scene 1 — 1206, the steppe
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const s1: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "1206. On the Mongolian steppe, the tribes are united under one khan — Genghis." },
    { at: 7, text: "From a capital at Karakorum, an empire is about to unfold across a continent." },
  ],
  render(ctx, t, frame) {
    if (!frame) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const bg = frame.layer.ctx("bg");
    const mid = frame.layer.ctx("mid");
    const fg = frame.layer.ctx("fg");
    const ann = frame.layer.ctx("annotation");

    const landIn = phase(t, 0.3, 3);
    drawBase(bg, landIn);

    // coastline draws on (hand-drawn ink border)
    const coastP = phase(t, 0.8, 4.5);
    fillRing(mid, EURASIA_POLY.slice(0, Math.max(2, Math.ceil(EURASIA_POLY.length * coastP))), "rgba(0,0,0,0)", th.muted, coastP, 2);

    // Mongolia glows under a moving-in spotlight, homeland region draws on
    const homeP = phase(t, 3, 6);
    const homeRing = MONGOLIA.map(proj);
    const cx = homeRing.reduce((s, p) => s + p[0], 0) / homeRing.length;
    const cy = homeRing.reduce((s, p) => s + p[1], 0) / homeRing.length;
    if (homeP > 0) {
      spotlight(fg, cx, cy, 150 * homeP, (c) => {
        c.save();
        c.globalAlpha = 0.9;
        const g = c.createRadialGradient(cx, cy, 4, cx, cy, 130 * breathe(t, 3, 0.06));
        g.addColorStop(0, "rgba(232,161,60,0.55)");
        g.addColorStop(1, "rgba(232,161,60,0)");
        c.fillStyle = g;
        c.fillRect(cx - 160, cy - 160, 320, 320);
        c.restore();
      }, { dim: { color: "rgba(74,47,26,0.5)", strength: homeP * 0.55 } });
      fillRing(mid, homeRing, "rgba(154,59,46,0.28)", th.accent, homeP, 2.4);
      fadeText(ann, "MONGOLIA", cx, cy - 6, homeP, `600 12px ${DISPLAY}`, th.ink);
    }

    // Karakorum marker pins
    const pinP = phase(t, 6, 8);
    if (pinP > 0) {
      geoMarker(fg, KARAKORUM, PROJ, { icon: "pin", color: th.danger, label: "Karakorum", size: 16, alpha: pinP });
    }

    // "1206" slams
    drawSlam(ann, "1206", 250, 130, t, 5, { font: `800 66px ${DISPLAY}`, color: th.accent }, { dur: 0.6, from: 2 });

    // Title reveals word by word
    if (t > 8.2) {
      drawWordReveal(ann, "The Mongol Empire", 300, 355, t, { font: `700 34px ${DISPLAY}`, color: th.ink }, { start: 8.4, step: 0.28, mode: "rise" });
      drawWordReveal(ann, "the largest land empire in history", 302, 388, t, { font: `500 16px ${DISPLAY}`, color: th.muted }, { start: 9.6, step: 0.09, mode: "fade" });
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Scene 2 — The conquest begins
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const s2: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "The conquest begins. Mongol cavalry sweeps out of the steppe — east into China, west across Central Asia." },
    { at: 8, text: "City after city falls. Within a generation the empire spans millions of square kilometres." },
  ],
  render(ctx, t, frame) {
    if (!frame) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const bg = frame.layer.ctx("bg");
    const mid = frame.layer.ctx("mid");
    const fg = frame.layer.ctx("fg");
    const ann = frame.layer.ctx("annotation");

    drawBase(bg, 1);
    fillRing(mid, EURASIA_POLY, "rgba(0,0,0,0)", th.muted, 0.7, 1.5);

    // camera pans east→west across the continent
    const panP = phase(t, 1, 12);
    const camEast = focusOn(660, H / 2, 1.25);
    const camWest = focusOn(300, H / 2, 1.25);
    const cam: Camera = move(camEast, camWest, t, 1, 11);
    frame.setCamera(panP > 0.02 && panP < 0.99 ? cam : centerCamera(W, H));

    // fog-of-war: conquered land lights up inside a growing spotlight over the homeland+expansion
    const conqP = phase(t, 1.5, 10);
    fillRing(mid, MONGOLIA.map(proj), "rgba(154,59,46,0.3)", th.accent, 0.9, 2);

    // flow arrows sweep out of Mongolia (draw-on with arrowheads)
    const arrowTargets: [LonLat, number][] = [
      [CITY.beijing, 2],
      [CITY.samarkand, 4],
      [CITY.baghdad, 6.5],
      [CITY.kiev, 8.5],
    ];
    for (const [dest, at] of arrowTargets) {
      const p = phase(t, at, at + 2.2);
      if (p <= 0) continue;
      flowArrow(fg, KARAKORUM, dest, PROJ, p, { color: th.danger, width: 2.6, bend: 0.28 });
      // dust trails the cavalry at the arrow head
      if (p > 0.5) {
        const head = proj(dest);
        emit(fg, dustEmitter(head[0], head[1], Math.floor(at * 13) + 1), t - at);
      }
    }

    // fog-of-war reveal: a spotlight over conquered territory keeps the surround dim
    if (conqP > 0) {
      const kx = proj(CITY.samarkand)[0];
      spotlight(fg, kx, H / 2, 220 * conqP, () => {}, { dim: { color: "rgba(74,47,26,0.34)", strength: (1 - conqP) * 0.4 } });
    }

    // cities get leader callouts
    const cityCallouts: [LonLat, string, number][] = [
      [CITY.beijing, "Beijing 1215", 3],
      [CITY.samarkand, "Samarkand 1220", 5.5],
      [CITY.baghdad, "Baghdad 1258", 8],
    ];
    for (const [ll, label, at] of cityCallouts) {
      const lp = phase(t, at, at + 1.6);
      if (lp <= 0) continue;
      const [x, y] = proj(ll);
      callout(frame, {
        target: [x, y],
        title: label,
        side: y < H / 2 ? "s" : "n",
        offset: 40,
        container: "tag",
        route: "elbow",
        targetMarker: "ring",
        color: th.muted,
        ink: th.ink,
        accent: th.danger,
        fontPx: 12,
        leaderP: lp,
        labelP: lp,
      });
    }

    // territory counts up in km²
    const count = counterValue(t, 2, 11, 0, 13_500_000);
    drawCounter(ann, W - 30, 42, count, { font: `700 26px ${DISPLAY}`, color: th.accent, align: "end" }, { commas: true, suffix: " km²" });
    fadeText(ann, "territory conquered", W - 30, 60, phase(t, 2, 3.5), `500 12px ${DISPLAY}`, th.muted, "end");
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Scene 3 — Borders over time (geo showpiece)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const TL3 = makeTimeline({ x: 70, y: H - 74, w: W - 140, h: 44 }, 1200, 1280, 1);
const ERAS3 = [
  { from: 1206, to: 1227, label: "Genghis Khan", color: "#8a5a2b" },
  { from: 1227, to: 1260, label: "expansion", color: "#2f6b57" },
  { from: 1260, to: 1280, label: "peak", color: "#3a5a7a" },
];
const EVENTS3: TimelineEvent[] = [
  { at: 1206, label: "Empire founded", above: true },
  { at: 1227, label: "Genghis dies", above: true },
  { at: 1260, label: "Peak extent", above: true },
];
const s3: CanvasSlideDefinition = {
  duration: 17,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "Watch the borders grow. 1206 to 1227 to 1260 — a homeland becomes a continent." },
    { at: 9, text: "At its peak the empire covered around twenty-four million square kilometres." },
  ],
  render(ctx, t, frame) {
    if (!frame) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const bg = frame.layer.ctx("bg");
    const mid = frame.layer.ctx("mid");
    const fg = frame.layer.ctx("fg");
    const ann = frame.layer.ctx("annotation");

    drawBase(bg, 1);
    fillRing(mid, EURASIA_POLY, "rgba(0,0,0,0)", th.muted, 0.6, 1.5);

    // borders morph across keyframes: 1206 → 1227 (first half) → 1260 (second half)
    const grow = phase(t, 1.5, 12);
    const year = Math.round(lerp(1206, 1260, grow));
    let ring: Pt[];
    if (grow < 0.5) ring = borderAt(BORDER_1206, BORDER_1227, grow / 0.5, PROJ);
    else ring = borderAt(BORDER_1227, BORDER_1260, (grow - 0.5) / 0.5, PROJ);
    fillRing(mid, ring, "rgba(154,59,46,0.32)", th.accent, 1, 2.6);
    // a soft breathing glow band along the frontier
    fg.save();
    fg.globalAlpha = 0.4 * breathe(t, 2.5, 0.2);
    fg.strokeStyle = "rgba(232,161,60,0.9)";
    fg.lineWidth = 3;
    fg.beginPath();
    fg.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) fg.lineTo(ring[i][0], ring[i][1]);
    fg.closePath();
    fg.stroke();
    fg.restore();

    // homeland marker stays pinned
    geoMarker(fg, KARAKORUM, PROJ, { icon: "star", color: th.danger, size: 13, alpha: 0.9 });

    // running year label
    fadeText(ann, formatYear(year), W / 2, 40, phase(t, 1.5, 2.5), `800 40px ${DISPLAY}`, th.ink);

    // timeline below: eras + events + sweeping playhead
    const tlP = phase(t, 1, 4);
    eras(mid, TL3, ERAS3, tlP, { height: 20 });
    timelineAxis(mid, TL3, { p: tlP, color: th.muted, ink: th.muted });
    events(ann, TL3, EVENTS3, t, { start: 2, step: 0.6, ink: th.ink });
    if (grow > 0) playhead(fg, TL3, year, { color: th.accent, label: true });

    // peak size counts to 24,000,000 km²
    const peak = counterValue(t, 3, 10, 0, 24_000_000);
    drawCounter(ann, 70, 48, peak, { font: `700 24px ${DISPLAY}`, color: th.accent, align: "start" }, { commas: true, suffix: " km²" });
    fadeText(ann, "at peak extent", 72, 66, phase(t, 3, 4.5), `500 12px ${DISPLAY}`, th.muted, "start");
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Scene 4 — The four khanates
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const SEM = colorSemantics();
const KHAN_NAMES = ["Golden Horde", "Ilkhanate", "Chagatai", "Yuan"];
const s4: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "After Genghis, the empire splits into four khanates — each ruled by his heirs." },
    { at: 7, text: "Golden Horde in the west, Ilkhanate in Persia, Chagatai in the center, Yuan in China." },
  ],
  render(ctx, t, frame) {
    if (!frame) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const bg = frame.layer.ctx("bg");
    const mid = frame.layer.ctx("mid");
    const fg = frame.layer.ctx("fg");
    const ann = frame.layer.ctx("annotation");

    drawBase(bg, 1);
    fillRing(mid, EURASIA_POLY, "rgba(0,0,0,0)", th.muted, 0.55, 1.5);

    // regions fill by semantic color, staggered draw-on
    drawMap(mid, KHANATES, PROJ, (f, i) => {
      const rp = phase(t, 1 + i * 1.1, 3.5 + i * 1.1);
      const name = String(f.props?.name ?? f.id);
      return { fill: SEM.colorFor(name), stroke: th.ink, width: 2, p: rp, fillAlpha: 0.55 };
    });

    // camera zooms to each khanate in turn, then pulls back
    const zoomIn = phase(t, 7.5, 9);
    const zoomHold = phase(t, 12, 13.5);
    const order = [YUAN, GOLDEN_HORDE, ILKHANATE, CHAGATAI];
    const idx = Math.min(order.length - 1, Math.floor(phase(t, 7.5, 12.5) * order.length + 1e-6));
    const target = order[idx];
    const [flon, flat] = featureCenter(target);
    const [fx, fy] = proj([flon, flat]);
    const near = focusOn(fx, fy, 1.9);
    let cam: Camera;
    if (zoomHold > 0.5) cam = move(near, centerCamera(W, H), t, 12.5, 1.5);
    else cam = move(centerCamera(W, H), near, t, 7.5, 1.5);
    frame.setCamera(zoomIn > 0.02 ? cam : centerCamera(W, H));

    // per-khanate label callout on the focused region
    if (zoomIn > 0.1 && zoomHold < 0.5) {
      const name = String(target.props?.name);
      callout(frame, {
        target: [fx, fy],
        title: name,
        side: "s",
        offset: 30,
        container: "pill",
        route: "straight",
        color: SEM.colorFor(name),
        accent: SEM.colorFor(name),
        ink: th.ink,
        fontPx: 14,
        leaderP: 1,
        labelP: zoomIn,
      });
    }

    // drawn legend (color semantics) — screen-fixed so it stays put during the zoom
    frame.layer.set("annotation", { screenspace: true });
    const legP = phase(t, 3, 5);
    if (legP > 0) {
      ann.save();
      ann.globalAlpha = legP;
      ann.fillStyle = "rgba(230,211,168,0.9)";
      ann.strokeStyle = th.muted;
      ann.lineWidth = 1;
      ann.beginPath();
      ann.roundRect(30, 30, 190, 96, 8);
      ann.fill();
      ann.stroke();
      ann.fillStyle = th.ink;
      ann.font = `700 13px ${DISPLAY}`;
      ann.textAlign = "start";
      ann.fillText("The Four Khanates", 42, 50);
      ann.restore();
      SEM.legend(ann, KHAN_NAMES, 42, 66, { rowH: 18, swatch: 11, font: `12px ${DISPLAY}`, ink: th.ink });
    }
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Scene 5 — Pax Mongolica
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const TL5 = makeTimeline({ x: 70, y: H - 60, w: W - 140, h: 34 }, 1250, 1350, 1);
const EVENTS5: TimelineEvent[] = [
  { at: 1271, label: "Marco Polo travels east", above: true },
  { at: 1300, label: "Silk Road at its height", above: true },
  { at: 1347, label: "Plague spreads west", above: false },
];
/** goods carried along the road, with an icon each. */
const GOODS: { from: LonLat; to: LonLat; icon: IconName; at: number }[] = [
  { from: CITY.beijing, to: CITY.samarkand, icon: "book", at: 3 },
  { from: CITY.samarkand, to: CITY.baghdad, icon: "flask", at: 4.5 },
  { from: CITY.baghdad, to: CITY.beijing, icon: "star", at: 6 },
];
const s5: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "Pax Mongolica — the Mongol Peace. One rule from China to Persia makes the Silk Road safe again." },
    { at: 8, text: "Ideas, wealth, and plague travel west along the roads the Mongols secured." },
  ],
  render(ctx, t, frame) {
    if (!frame) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const bg = frame.layer.ctx("bg");
    const mid = frame.layer.ctx("mid");
    const fg = frame.layer.ctx("fg");
    const ann = frame.layer.ctx("annotation");

    drawBase(bg, 1);
    fillRing(mid, EURASIA_POLY, "rgba(0,0,0,0)", th.muted, 0.6, 1.5);
    fillRing(mid, borderAt(BORDER_1260, BORDER_1260, 0, PROJ), "rgba(154,59,46,0.16)", th.muted, 0.7, 1.4);

    // trade cities as pins
    const pinP = phase(t, 1, 3);
    for (const key of ["beijing", "samarkand", "baghdad"]) {
      geoMarker(fg, CITY[key], PROJ, { icon: "circle", color: th.danger, size: 10, alpha: pinP });
    }

    // two-way flow arrows carrying goods (bidirectional pairs)
    for (const g of GOODS) {
      const p = phase(t, g.at, g.at + 2.2);
      if (p <= 0) continue;
      flowArrow(fg, g.from, g.to, PROJ, p, { color: "#2f6b57", width: 2.4, bend: 0.22 });
      flowArrow(fg, g.to, g.from, PROJ, p, { color: "#8a5a2b", width: 2.2, bend: -0.22 });
      // goods icon rides the road (constant-speed loop once the arrow is drawn)
      if (p > 0.85) {
        const a = proj(g.from);
        const b = proj(g.to);
        const u = cycle((t - g.at) * 0.22);
        const gx = lerp(a[0], b[0], u);
        const gy = lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * 26;
        drawIcon(fg, g.icon, gx, gy, 15, { color: th.ink, filled: true, alpha: 0.95 });
      }
    }

    // "Ideas, wealth, and plague travel west" — typewriter
    const typeP = phase(t, 8, 12);
    drawTypewriter(ann, "Ideas, wealth, and plague travel west.", 70, 70, typeP, { font: `600 20px ${DISPLAY}`, color: th.ink, align: "start" }, { cursor: true, t });

    fadeText(ann, "PAX MONGOLICA", W / 2, 40, phase(t, 0.5, 2), `800 30px ${DISPLAY}`, th.accent);

    // timeline events tick
    const tlP = phase(t, 2, 4);
    timelineAxis(mid, TL5, { p: tlP, color: th.muted, ink: th.muted });
    events(ann, TL5, EVENTS5, t, { start: 3, step: 1.4, ink: th.ink });
    if (tlP > 0.3) playhead(fg, TL5, lerp(1250, 1350, phase(t, 3, 12)), { color: th.accent });
  },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Scene 6 — Legacy & decline
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const s6: CanvasSlideDefinition = {
  duration: 15,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "By 1368 the khanates fracture and recede. The great empire fades." },
    { at: 7, text: "But its scale endures — 16% of Earth's land, over a hundred million people ruled as one." },
  ],
  render(ctx, t, frame) {
    if (!frame) {
      ctx.clearRect(0, 0, W, H);
      return;
    }
    const bg = frame.layer.ctx("bg");
    const mid = frame.layer.ctx("mid");
    const fg = frame.layer.ctx("fg");
    const ann = frame.layer.ctx("annotation");

    drawBase(bg, 1);
    fillRing(mid, EURASIA_POLY, "rgba(0,0,0,0)", th.muted, 0.55, 1.5);

    // borders recede (morph shrink) from peak 1260 toward 1368
    const shrink = phase(t, 1, 8);
    const ring = borderAt(BORDER_1260, BORDER_1368, shrink, PROJ);
    // fade the fill as it recedes
    fillRing(mid, ring, "rgba(154,59,46,0.26)", th.muted, lerp(1, 0.4, shrink), 2.2);
    geoMarker(fg, KARAKORUM, PROJ, { icon: "star", color: th.danger, size: 12, alpha: lerp(0.9, 0.3, shrink) });

    // big stats count up
    const statsP = phase(t, 6, 8);
    if (statsP > 0) {
      const pct = counterValue(t, 6, 3, 0, 16);
      drawCounter(ann, W / 2, 150, pct, { font: `800 56px ${DISPLAY}`, color: th.accent, align: "center" }, { suffix: "%", commas: false });
      fadeText(ann, "of Earth's land area", W / 2, 178, statsP, `500 16px ${DISPLAY}`, th.muted);

      const people = counterValue(t, 7.5, 4, 0, 100_000_000);
      drawCounter(ann, W / 2, 238, people, { font: `800 44px ${DISPLAY}`, color: th.ink, align: "center" }, { commas: true, suffix: "+" });
      fadeText(ann, "people ruled as one", W / 2, 264, phase(t, 8, 9.5), `500 16px ${DISPLAY}`, th.muted);
    }

    // word-by-word close
    drawWordReveal(ann, "The largest contiguous empire the world has ever known.", 150, 330, t, { font: `600 20px ${DISPLAY}`, color: th.ink }, { start: 10, step: 0.16, mode: "fade" });

    // slow fade to close: a warm veil rises on fg over the last ~3s
    const fade = phase(t, 12, 15);
    if (fade > 0) {
      fg.save();
      fg.globalAlpha = fade * 0.8;
      fg.fillStyle = th.bg;
      fg.fillRect(0, 0, W, H);
      fg.restore();
    }
  },
};

export const mongolLesson = composeSlides([s1, s2, s3, s4, s5, s6], {
  theme: PARCHMENT,
  filmGrade: true,
  transition: "whip-pan",
});
