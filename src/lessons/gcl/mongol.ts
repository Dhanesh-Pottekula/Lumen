/**
 * mongol — "The Mongol Empire: the largest contiguous land empire in history", re-authored in the
 * generic component layer (GCL) as a FAITHFUL reproduction of the bespoke original
 * (src/lessons/mongolEmpire.ts): same six scenes, same durations (15/16/17/16/15/15), same narration,
 * same titles/labels/numbers, same PARCHMENT serif look, same timeline/camera/flows.
 *
 * Geo data (EURASIA, MONGOLIA, KARAKORUM, four khanate features, BORDER_1206/1227/1260/1368, CITY) is
 * copied verbatim from the original. Every scene's `map` uses the identical `at`/`w`/`h` box AND always
 * includes `outline: EURASIA`, so the engine's projection lands identically each scene.
 *
 * NO manual projection here: callouts, camera, glow, and flows target places by NAME (`"beijing"`,
 * `"karakorum"`, `"mongolia"`) or by `{lon,lat}`, and khanate regions by their feature id (`"yuan"`,
 * `"golden-horde"`, …). The engine projects them through the scene's map (see gcl/compile.ts
 * `buildSceneGeo`) — so the author never runs `fitProjection`/`project()` by hand.
 *
 * Pure data — `renderFilm` compiles this to a seekable CanvasSlideDefinition. No clocks/Math.random.
 */
import { renderFilm } from "../../gcl";
import type { Film } from "../../gcl";
import type { CanvasSlideDefinition } from "../../slides/types";
import { type GeoFeature, type LonLat } from "../../render/geo";
import { colorSemantics } from "../../render/icons";

const W = 920;
const H = 430;

// PARCHMENT palette (mirrors src/render/theme.ts PARCHMENT).
const INK = "#4a2f1a";
const ACCENT = "#9a3b2e";
const MUTED = "#8a7048";
const DANGER = "#8c2b1e";
const OUTLINE = "rgba(138,112,72,0.6)";

// ── Real geo data, copied verbatim from src/lessons/mongolEmpire.ts ────────────────────────────────

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
const KHAN_NAMES = ["Golden Horde", "Ilkhanate", "Chagatai", "Yuan"];

/** Border keyframe outer rings for borders-over-time (1206 → 1227 → 1260 peak → 1368 recede). */
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

/** Cities along the empire / Silk Road (lon/lat), for map markers. */
const CITY: Record<string, LonLat> = {
  beijing: [116, 40],
  samarkand: [67, 39.5],
  baghdad: [44.4, 33.3],
  kiev: [30.5, 50.5],
};

// ONE shared map box for every scene (mirrors the original's MAP_AREA → center [460,178]). Every scene's
// `map` uses this exact box AND includes `outline: EURASIA`, so the engine's projection lands identically
// each scene — which means a place name / {lon,lat} target resolves to the same screen spot the map draws.
const MAP_AT: [number, number] = [460, 178];
const MAP_W = 840;
const MAP_H = 264;

// Named lon/lat places every scene's map exposes, so callouts / camera / glow / flows can target them by
// NAME (e.g. "beijing") instead of a hand-projected pixel. Khanate regions are targetable by their
// feature id ("yuan", "golden-horde", …) automatically — no entry needed here.
const PLACES = [
  { name: "beijing", lon: 116, lat: 40 },
  { name: "samarkand", lon: 67, lat: 39.5 },
  { name: "baghdad", lon: 44.4, lat: 33.3 },
  { name: "kiev", lon: 30.5, lat: 50.5 },
  { name: "karakorum", lon: 102.5, lat: 47.2 },
  { name: "mongolia", lon: 105.1, lat: 47 },
];

const SEM = colorSemantics();
// Region fills use the SAME colorSemantics as the legend, so each khanate shape matches its swatch.
const KHANATE_FEATURE_COLORS = KHANATES.map((f) => SEM.colorFor(String(f.props?.name)));
const mapFeaturesFor = (features: GeoFeature[]) => features.map((f) => ({ id: f.id, rings: f.rings }));

// Scene 3 showpiece sync window: map `grow` morph, running year, and timeline playhead all advance
// together over this window (original: grow = phase(t, 1.5, 12)).
const S3_START = 1.5;
const S3_DUR = 10.5;

export const mongolFilm: Film = [
  // ══ Scene 1 — 1206, the steppe (dur 15) ═════════════════════════════════════════════════════════
  {
    type: "scene",
    theme: "PARCHMENT",
    duration: 15,
    narration: [
      "1206. On the Mongolian steppe, the tribes are united under one khan — Genghis.",
      "From a capital at Karakorum, an empire is about to unfold across a continent.",
    ],
  },
  // Coastline draws on (original phase 0.8–4.5). `places: PLACES` lets everything else in the scene
  // target cities/regions by name.
  {
    type: "map", id: "map1", at: MAP_AT, w: MAP_W, h: MAP_H, features: [], places: PLACES,
    outline: EURASIA, outlineStroke: OUTLINE, start: 0.8, enter: { type: "draw", dur: 3.7 },
  },
  // Mongolia homeland region fills + amber glow (original phase 3–6). Drawn as a second map that
  // shares the projection (same box + EURASIA outline, but the outline is transparent so it doesn't
  // double the coastline) and fills the homeland ring via `grow` — a real projected polygon, timed to 3s.
  { type: "glow", id: "homeGlow", at: "mongolia", r: 160, color: "rgba(232,161,60,0.5)", start: 3 },
  {
    type: "map", id: "homeMap", at: MAP_AT, w: MAP_W, h: MAP_H, features: [],
    outline: EURASIA, outlineStroke: "rgba(0,0,0,0)",
    grow: [MONGOLIA, MONGOLIA], growDur: 0.01, growFill: "rgba(154,59,46,0.28)", growStroke: ACCENT,
    start: 3, enter: { type: "fade", dur: 1.5 },
  },
  { type: "text", id: "mongoliaLbl", text: "MONGOLIA", size: 12, color: INK, align: "center", mode: "fade", start: 3.5, at: "mongolia" },
  // Karakorum pin (original phase 6–8). Label sits just south of the pin (lower lat).
  { type: "shape", id: "karakorumPin", shape: "circle", r: 5, fill: DANGER, stroke: "#2b1a10", width: 1.4, at: "karakorum", start: 6, enter: { type: "fade", dur: 0.5 } },
  { type: "text", id: "karakorumLbl", text: "Karakorum", size: 12, color: INK, align: "center", mode: "fade", start: 6, at: { lon: 102.5, lat: 44.3 } },
  // "1206" slams in (original t=5).
  { type: "heading", id: "yearSlam", text: "1206", size: 66, color: ACCENT, at: [250, 130], start: 5, enter: { type: "slam", dur: 0.6 } },
  // Title + subtitle reveal word-by-word at the bottom (original start 8.4 / 9.6).
  { type: "text", id: "title1", text: "The Mongol Empire", size: 34, color: INK, align: "center", mode: "word", start: 8.4, at: [460, 352] },
  { type: "text", id: "sub1", text: "the largest land empire in history", size: 16, color: MUTED, align: "center", mode: "word", start: 9.6, at: [460, 386] },

  // ══ Scene 2 — the conquest begins (dur 16) ══════════════════════════════════════════════════════
  {
    type: "scene",
    theme: "PARCHMENT",
    duration: 16,
    narration: [
      "The conquest begins. Mongol cavalry sweeps out of the steppe — east into China, west across Central Asia.",
      "City after city falls. Within a generation the empire spans millions of square kilometres.",
    ],
  },
  {
    type: "map", id: "map2", at: MAP_AT, w: MAP_W, h: MAP_H, features: [], places: PLACES,
    outline: EURASIA, outlineStroke: "rgba(138,112,72,0.7)",
    grow: [MONGOLIA, MONGOLIA], growDur: 0.01, growFill: "rgba(154,59,46,0.3)", growStroke: ACCENT,
    // Conquest flow-arrows sweep out of Karakorum, staggered (original beijing@2, samarkand@4,
    // baghdad@6.5, kiev@8.5; each draws over 2.2s; danger red, bend 0.28). Endpoints by place name.
    flows: [
      { from: "karakorum", to: "beijing", color: DANGER, width: 2.6, bend: 0.28, at: 2, dur: 2.2 },
      { from: "karakorum", to: "samarkand", color: DANGER, width: 2.6, bend: 0.28, at: 4, dur: 2.2 },
      { from: "karakorum", to: "baghdad", color: DANGER, width: 2.6, bend: 0.28, at: 6.5, dur: 2.2 },
      { from: "karakorum", to: "kiev", color: DANGER, width: 2.6, bend: 0.28, at: 8.5, dur: 2.2 },
    ],
  },
  // City callouts (tag + elbow + ring), original "City YEAR" at 3 / 5.5 / 8 — targeted by place name.
  { type: "attention", verb: "callout", target: "beijing", title: "Beijing 1215", side: "s", route: "elbow", container: "tag", color: MUTED, start: 3 },
  { type: "attention", verb: "callout", target: "samarkand", title: "Samarkand 1220", side: "s", route: "elbow", container: "tag", color: MUTED, start: 5.5 },
  { type: "attention", verb: "callout", target: "baghdad", title: "Baghdad 1258", side: "n", route: "elbow", container: "tag", color: MUTED, start: 8 },
  // Territory counter (original 0→13.5M km², t2–11, top-right).
  { type: "stat", id: "territory2", value: 13500000, unit: "km²", label: "territory conquered", size: 26, color: ACCENT, commas: true, at: [770, 44], start: 2, dur: 11, enter: { type: "none", dur: 11 } },
  // Camera pans east → west across the continent, then recentres (original focusOn 660→300, t1–11).
  { type: "camera", to: [640, 215], zoom: 1.2, kind: "pushIn", start: 1, dur: 1.5 },
  { type: "camera", to: [320, 215], zoom: 1.2, kind: "move", start: 3, dur: 8 },
  { type: "camera", to: "center", zoom: 1, kind: "move", start: 12, dur: 1.5 },

  // ══ Scene 3 — borders over time (showpiece, dur 17) ═════════════════════════════════════════════
  {
    type: "scene",
    theme: "PARCHMENT",
    duration: 17,
    narration: [
      "Watch the borders grow. 1206 to 1227 to 1260 — a homeland becomes a continent.",
      "At its peak the empire covered around twenty-four million square kilometres.",
    ],
  },
  {
    type: "map", id: "map3", at: MAP_AT, w: MAP_W, h: MAP_H, features: [],
    outline: EURASIA, outlineStroke: OUTLINE,
    grow: [BORDER_1206, BORDER_1227, BORDER_1260], growDur: S3_DUR,
    growFill: "rgba(154,59,46,0.32)", growStroke: ACCENT,
    markers: [{ lon: KARAKORUM[0], lat: KARAKORUM[1], icon: "star" }],
    start: S3_START,
  },
  // Running year 1206→1260, synced to the border morph (original fadeText formatYear at W/2,40).
  { type: "stat", id: "year3", value: 1260, from: 1206, unit: "CE", size: 40, color: INK, commas: false, at: [460, 40], start: S3_START, dur: S3_DUR, enter: { type: "none", dur: S3_DUR } },
  // Peak-area counter (original 0→24M km², t3–10, top-left).
  { type: "stat", id: "peak3", value: 24000000, unit: "km²", label: "at peak extent", size: 24, color: ACCENT, commas: true, at: [160, 52], start: 3, dur: 10, enter: { type: "none", dur: 10 } },
  // Timeline: eras + events + sweeping playhead (original TL3 x70 y H-74 w W-140 h44, 1200–1280).
  {
    type: "timeline", id: "tl3", from: 1200, to: 1280, at: [460, 356], w: 780, h: 44,
    eras: [
      { from: 1206, to: 1227, label: "Genghis Khan", color: "#8a5a2b" },
      { from: 1227, to: 1260, label: "expansion", color: "#2f6b57" },
      { from: 1260, to: 1280, label: "peak", color: "#3a5a7a" },
    ],
    events: [
      { at: 1206, label: "Empire founded", above: true },
      { at: 1227, label: "Genghis dies", above: true },
      { at: 1260, label: "Peak extent", above: true },
    ],
    playheadFrom: 1206, playheadTo: 1260, playheadOver: S3_DUR, start: S3_START,
  },

  // ══ Scene 4 — the four khanates (dur 16) ════════════════════════════════════════════════════════
  {
    type: "scene",
    theme: "PARCHMENT",
    duration: 16,
    narration: [
      "After Genghis, the empire splits into four khanates — each ruled by his heirs.",
      "Golden Horde in the west, Ilkhanate in Persia, Chagatai in the center, Yuan in China.",
    ],
  },
  {
    type: "map", id: "map4", at: MAP_AT, w: MAP_W, h: MAP_H,
    features: mapFeaturesFor(KHANATES), featureColors: KHANATE_FEATURE_COLORS,
    featureStagger: 1.1, featureDur: 2.5,
    outline: EURASIA, outlineStroke: OUTLINE, start: 1,
  },
  // Legend — original box (30,30) "The Four Khanates" + 4 semantic swatches. On the `fx` layer so it
  // stays SCREEN-FIXED through the camera zoom-tour (fx is the one screenspace layer), like the
  // original's `frame.layer.set("annotation", {screenspace:true})`.
  { type: "text", id: "legendTitle", text: "The Four Khanates", size: 13, color: INK, align: "start", mode: "fade", start: 3, at: [42, 44], fixed: true },
  { type: "legend", id: "khanateLegend", categories: KHAN_NAMES, rowH: 18, at: [110, 84], start: 3, fixed: true },
  // Camera tours each khanate then pulls back (original order YUAN, GOLDEN_HORDE, ILKHANATE, CHAGATAI).
  // Each khanate is targetable by its feature id — the engine centres the camera on that region.
  { type: "camera", to: "yuan", zoom: 1.9, kind: "pushIn", start: 7.5, dur: 1.5 },
  { type: "camera", to: "golden-horde", zoom: 1.9, kind: "move", start: 9, dur: 1.2 },
  { type: "camera", to: "ilkhanate", zoom: 1.9, kind: "move", start: 10.3, dur: 1.2 },
  { type: "camera", to: "chagatai", zoom: 1.9, kind: "move", start: 11.5, dur: 1.2 },
  { type: "camera", to: "center", zoom: 1, kind: "move", start: 13, dur: 1.5 },
  // Per-khanate pill callouts, each shown while its region is focused.
  { type: "attention", verb: "callout", target: "yuan", title: "Yuan", side: "s", route: "straight", container: "pill", color: SEM.colorFor("Yuan"), start: 7.8, exit: { type: "fade", out: 8.9 } },
  { type: "attention", verb: "callout", target: "golden-horde", title: "Golden Horde", side: "s", route: "straight", container: "pill", color: SEM.colorFor("Golden Horde"), start: 9.1, exit: { type: "fade", out: 10.2 } },
  { type: "attention", verb: "callout", target: "ilkhanate", title: "Ilkhanate", side: "s", route: "straight", container: "pill", color: SEM.colorFor("Ilkhanate"), start: 10.4, exit: { type: "fade", out: 11.4 } },
  { type: "attention", verb: "callout", target: "chagatai", title: "Chagatai", side: "s", route: "straight", container: "pill", color: SEM.colorFor("Chagatai"), start: 11.6, exit: { type: "fade", out: 12.8 } },

  // ══ Scene 5 — Pax Mongolica (dur 15) ════════════════════════════════════════════════════════════
  {
    type: "scene",
    theme: "PARCHMENT",
    duration: 15,
    narration: [
      "Pax Mongolica — the Mongol Peace. One rule from China to Persia makes the Silk Road safe again.",
      "Ideas, wealth, and plague travel west along the roads the Mongols secured.",
    ],
  },
  {
    type: "map", id: "map5", at: MAP_AT, w: MAP_W, h: MAP_H, features: [], places: PLACES,
    outline: EURASIA, outlineStroke: OUTLINE,
    grow: [BORDER_1260, BORDER_1260], growDur: 0.01, growFill: "rgba(154,59,46,0.16)", growStroke: MUTED,
    markers: [
      { lon: CITY.beijing[0], lat: CITY.beijing[1], icon: "circle" },
      { lon: CITY.samarkand[0], lat: CITY.samarkand[1], icon: "circle" },
      { lon: CITY.baghdad[0], lat: CITY.baghdad[1], icon: "circle" },
      { lon: KARAKORUM[0], lat: KARAKORUM[1], icon: "star" },
    ],
    // Two-way trade arrows (green out / brown back), original GOODS beijing↔samarkand@3,
    // samarkand↔baghdad@4.5, baghdad↔beijing@6 — endpoints by place name.
    flows: [
      { from: "beijing", to: "samarkand", color: "#2f6b57", width: 2.4, bend: 0.22, at: 3, dur: 2.2 },
      { from: "samarkand", to: "beijing", color: "#8a5a2b", width: 2.2, bend: -0.22, at: 3, dur: 2.2 },
      { from: "samarkand", to: "baghdad", color: "#2f6b57", width: 2.4, bend: 0.22, at: 4.5, dur: 2.2 },
      { from: "baghdad", to: "samarkand", color: "#8a5a2b", width: 2.2, bend: -0.22, at: 4.5, dur: 2.2 },
      { from: "baghdad", to: "beijing", color: "#2f6b57", width: 2.4, bend: 0.22, at: 6, dur: 2.2 },
      { from: "beijing", to: "baghdad", color: "#8a5a2b", width: 2.2, bend: -0.22, at: 6, dur: 2.2 },
    ],
  },
  { type: "heading", id: "title5", text: "PAX MONGOLICA", size: 30, color: ACCENT, at: [460, 40], start: 0.5, enter: { type: "fade", dur: 1.5 } },
  { type: "text", id: "pax5", text: "Ideas, wealth, and plague travel west.", size: 20, color: INK, align: "start", mode: "typewriter", start: 8, dur: 4, at: [230, 72] },
  {
    type: "timeline", id: "tl5", from: 1250, to: 1350, at: [460, 370], w: 780, h: 34,
    events: [
      { at: 1271, label: "Marco Polo travels east", above: true },
      { at: 1300, label: "Silk Road at its height", above: true },
      { at: 1347, label: "Plague spreads west", above: false },
    ],
    playheadFrom: 1250, playheadTo: 1350, playheadOver: 9, playheadLabel: false, start: 3,
  },

  // ══ Scene 6 — legacy & decline (dur 15) ═════════════════════════════════════════════════════════
  {
    type: "scene",
    theme: "PARCHMENT",
    duration: 15,
    narration: [
      "By 1368 the khanates fracture and recede. The great empire fades.",
      "But its scale endures — 16% of Earth's land, over a hundred million people ruled as one.",
    ],
  },
  {
    type: "map", id: "map6", at: MAP_AT, w: MAP_W, h: MAP_H, features: [],
    outline: EURASIA, outlineStroke: OUTLINE,
    grow: [BORDER_1260, BORDER_1368], growDur: 7, growFill: "rgba(154,59,46,0.26)", growStroke: MUTED,
    markers: [{ lon: KARAKORUM[0], lat: KARAKORUM[1], icon: "star" }],
  },
  // Two big centered stats count up (original pct t6→3, people t7.5→4).
  { type: "stat", id: "pct6", value: 16, unit: "%", label: "of Earth's land area", size: 56, color: ACCENT, commas: false, at: [460, 150], start: 6, dur: 3, enter: { type: "none", dur: 3 } },
  { type: "stat", id: "people6", value: 100000000, unit: "+", label: "people ruled as one", size: 44, color: INK, commas: true, at: [460, 238], start: 7.5, dur: 4, enter: { type: "none", dur: 4 } },
  { type: "text", id: "closing6", text: "The largest contiguous empire the world has ever known.", size: 20, color: INK, align: "center", mode: "word", start: 10, at: [460, 330] },
];

/** Compiled, seekable CanvasSlideDefinition — this is what App.tsx renders. */
export const mongolLessonGCL: CanvasSlideDefinition = renderFilm(mongolFilm);
