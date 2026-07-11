/**
 * Map / geo demo (Step 16). A small inline feature set (no fetch — deterministic/offline): three
 * regions draw on with themed fills, cities pin, a trade route flows, a border shifts over time, and
 * the camera zooms to a region.
 */
import { clamp01, fadeText, lerp, phase } from "./anim";
import { focusOn, pushIn } from "../render/camera";
import { borderAt, drawMap, featureCenter, fitProjection, flowArrow, type GeoFeature, geoMarker, type LonLat } from "../render/geo";
import { colorSemantics } from "../render/icons";
import { strokeOn } from "../render/strokes";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const NORTH: LonLat[] = [[20, 95], [70, 92], [78, 72], [60, 62], [30, 64], [15, 74]];
const CENTRAL_A: LonLat[] = [[30, 64], [60, 62], [78, 72], [74, 44], [50, 40], [26, 46]];
const CENTRAL_B: LonLat[] = [[30, 64], [60, 62], [78, 72], [82, 40], [50, 34], [26, 46]]; // border shifts east/south
const SOUTH: LonLat[] = [[26, 46], [50, 40], [74, 44], [64, 20], [48, 8], [38, 22]];

const FEATURES: GeoFeature[] = [
  { id: "north", rings: [NORTH], props: { name: "Highlands" } },
  { id: "central", rings: [CENTRAL_A], props: { name: "Plains" } },
  { id: "south", rings: [SOUTH], props: { name: "Coast" } },
];

const AREA = { x: 250, y: 70, w: 420, h: 320 };
const PROJ = fitProjection(FEATURES, AREA);
const sem = colorSemantics();

const PORT: LonLat = [16, 74];
const CAPITAL: LonLat = [50, 50];
const SOUTH_TOWN: LonLat = [48, 20];

export const geoDemoSlide: CanvasSlideDefinition = {
  duration: 18,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the map subsystem — projected regions with borders that draw themselves on." },
    { at: 4, text: "cities pin to coordinates; a trade route flows between them." },
    { at: 9, text: "borders change over time — interpolated between keyframes." },
    { at: 13, text: "and the camera zooms to a region, on the same map." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#12202c");
    g.addColorStop(1, "#0d161d");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // camera: hold, then zoom to the south region (t 13→17)
    if (frame) {
      if (t > 13) {
        const c = PROJ.project(featureCenter(FEATURES[2]));
        frame.setCamera(pushIn(W, H, c[0], c[1], 1, 2.1, t, 13, 3.5));
      }
      frame.layer.set("annotation", { screenspace: true });
    }

    // regions draw on, staggered, filled by color-semantics
    drawMap(mid, FEATURES, PROJ, (f, i) => ({
      fill: sem.colorFor(f.id),
      stroke: "#cfe0ea",
      width: 1.6,
      p: phase(t, 0.5 + i * 1.2, 3 + i * 1.2),
      fillAlpha: 0.5,
    }));

    // region labels
    FEATURES.forEach((f, i) => {
      const c = PROJ.project(featureCenter(f));
      fadeText(mid, String(f.props?.name ?? f.id), c[0], c[1], phase(t, 2 + i * 1.2, 3.2 + i * 1.2), "600 12px -apple-system, sans-serif", "#0e141a");
    });

    // border-over-time on central region (t 9→13): highlight the shifting border
    if (t > 9) {
      const bp = phase(t, 9.2, 12.5);
      const border = borderAt(CENTRAL_A, CENTRAL_B, bp, PROJ);
      strokeOn(fg, [...border, border[0]], 1, { color: "#ffd24a", width: 3, dash: [6, 5] });
    }

    // trade route flow (t 4→8)
    if (t > 4 && t < 13.5) flowArrow(fg, PORT, CAPITAL, PROJ, phase(t, 4.5, 7.5), { color: "#e8a13c", bend: 0.3 });

    // city markers
    geoMarker(fg, PORT, PROJ, { icon: "pin", color: "#e24b4a", label: "Muziris", alpha: phase(t, 4, 5) });
    geoMarker(fg, CAPITAL, PROJ, { icon: "home", color: "#5cc8ae", label: "Capital", alpha: phase(t, 5, 6) });
    geoMarker(fg, SOUTH_TOWN, PROJ, { icon: "factory", color: "#6db0e8", label: "Port town", alpha: phase(t, 6, 7) });

    // title + border caption (screenspace)
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("map / geo subsystem", 460, 44);
    ann.restore();
    if (t > 9.2) fadeText(ann, "border, 1792 → 1805", 120, 210, phase(t, 9.4, 10.4) * (1 - phase(t, 13, 13.6)), "600 12px -apple-system, sans-serif", "#e8c14a", "start");
  },
};
