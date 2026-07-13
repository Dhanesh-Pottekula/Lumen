// src/gcl/compile.ts
import { clamp01, fadeText, radialGlow, drawSvg } from "../slides/anim";
import {
  counterValue,
  drawCounter,
  drawScramble,
  drawSlam,
  drawTextAlongPath,
  drawTypewriter,
  drawWordReveal,
} from "../render/type-motion";
import { drawMath } from "../render/mathtext";
import { drawIcon, iconNames, colorSemantics } from "../render/icons";
import type { IconName } from "../render/icons";
import { axes, barChart, lineChart, makePlot, pie, plotFunction, scatter, type Datum } from "../render/charts";
import { circleShape, heartShape, polygonShape, starShape } from "../render/morph";
import { smoothPath, strokeOn, type Pt } from "../render/strokes";
import { drawBorderThenFill, erase, circumscribe } from "../render/strokeVerbs";
import { pointAt } from "../render/strokes";
import { borderAt, drawFeature, drawMap, featureCenter, fitProjection, flowArrow, geoMarker, type GeoFeature, type LonLat, type Projection } from "../render/geo";
import { events as timelineEvents, eras as timelineEras, makeTimeline, playhead as timelinePlayhead, timelineAxis } from "../render/timeline";
import { drawMorph } from "../render/morph";
import { tracerDot } from "../render/strokeVerbs";
import { callout, type CalloutOptions } from "../render/callout";
import {
  cornerBrackets,
  convergingArrows,
  dimExcept,
  focusBox,
  focusRings,
  ghost as ghostVerb,
  highlightRing,
  magnify as magnifyVerb,
  pointerArrow,
  pulseScale,
  sparkFlash,
  spotlightFocus,
  vignetteTo,
  wiggle,
} from "../render/focus";
import { predictReveal, withPunch, withShake } from "../render/sequence";
import type { CanvasSlideDefinition } from "../slides/types";
import type { ParsedScene } from "./parse";
import type { Component, DrawComponent, EnterKind, GeoPoint, Position, Vec2 } from "./schema";
import { compileExpr } from "./expr";
import { PROP_CATALOG } from "./props";
import { drawTable } from "./table";
import { layoutGroup, layoutScene, type LayoutResult, type Placement } from "./layout";
import { narrationTiming, resolveExit, resolveTiming } from "./timing";
import { applyEnterExit } from "./enterexit";
import { resolvePosition } from "./anchors";
import { attentionOpacity, attnGeom } from "./attention";
import { cameraAt, type CamDirective } from "./camera";
import { linearPhase, motionTransform, oscillateOffset } from "./motion";
import { phase, smooth } from "../render/motion";
import type { MotionSpec } from "./schema";
import { emit, type EmitterConfig } from "../render/particles";
import { resolveEmitter } from "./particles";
import type { FrameCtx } from "../render/frame";
import { TEXTBOOK, type Theme } from "../render/theme";

const W = 920;
const H = 430;

const ROLE_FONT: Record<NonNullable<Extract<Component, { type: "text" }>["role"]>, { weight: number; size: number }> = {
  title: { weight: 700, size: 30 },
  body: { weight: 500, size: 20 },
  bullet: { weight: 500, size: 18 },
  caption: { weight: 500, size: 14 },
};

function textFont(c: Extract<Component, { type: "text" }>, fontFamily: string): string {
  const role = ROLE_FONT[c.role ?? "body"];
  const size = c.size ?? role.size;
  return `${role.weight} ${size}px ${fontFamily}`;
}

/** Build a stat's unit suffix: symbol units (`%`, `+`, `°`, `‰`) attach directly (`16%`), word units
 *  get a leading space (`24,000,000 km²`, `1260 CE`) — matching the original counters. */
function statSuffix(unit: string | undefined): string {
  if (!unit) return "";
  return /^[%+°‰]/.test(unit) ? unit : ` ${unit}`;
}

/** Kinetic text kinds `enter.type` can drive when the author omits `mode`. */
const KINETIC_ENTER_KINDS = ["word", "typewriter", "slam", "scramble"] as const;
type TextMode = "fade" | "word" | "typewriter" | "slam" | "scramble";

/** Resolve a text component's kinetic style when `mode` is absent: fall back to `enter.type` when
 *  it names one of the kinetic kinds, else plain fade. `mode` (when set) always wins in the caller. */
function textModeFromEnter(enterType: EnterKind | undefined): TextMode {
  if (enterType && (KINETIC_ENTER_KINDS as readonly string[]).includes(enterType)) {
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
export function resolveMotionAt(spec: MotionSpec, cueTimes: number[], componentAt: number): number {
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
    case "heading":
    case "equation":
    case "stat":
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
function mapPlaceNames(m: Extract<Component, { type: "map" }>): Map<string, [number, number]> {
  const names = new Map<string, [number, number]>();
  for (const p of m.places ?? []) names.set(p.name.toLowerCase(), [p.lon, p.lat]);
  for (const mk of m.markers ?? []) if (mk.label) names.set(mk.label.toLowerCase(), [mk.lon, mk.lat]);
  for (const f of m.features) names.set(f.id.toLowerCase(), featureCenter(f as GeoFeature) as [number, number]);
  return names;
}

/** Strip an optional `place:`/`region:`/`khanate:`/`city:`/`geo:` prefix and look a name up. */
function lookupPlace(names: Map<string, [number, number]>, key: string): [number, number] | undefined {
  return names.get(key.replace(/^(place|region|khanate|city|geo):/i, "").toLowerCase());
}

/** Build the scene's geographic resolver from its `map`(s): a function that projects a `{lon,lat}`
 *  point or a named place/region/feature to a screen point (returns null for anything non-geographic,
 *  so plain strings still fall through to id-anchor resolution). The projection comes from the first
 *  map with an explicit pixel box + geometry — mirroring `paintMapComponent`'s own `fitProjection`, so
 *  a targeted place lands exactly where the map draws it. Undefined when the scene has no such map. */
function buildSceneGeo(components: DrawComponent[]): ((pos: Position) => Vec2 | null) | undefined {
  const maps = components.filter((c): c is Extract<Component, { type: "map" }> => c.type === "map");
  let proj: Projection | null = null;
  const names = new Map<string, [number, number]>();
  for (const m of maps) {
    if (!Array.isArray(m.at)) continue; // need an explicit pixel box to derive the projection
    const [cx, cy] = m.at as [number, number];
    const w = m.w ?? W - 80;
    const h = m.h ?? H - 120;
    const area = { x: cx - w / 2, y: cy - h / 2, w, h };
    const markerRings: GeoFeature[] = (m.markers ?? []).map((mk, i) => ({ id: `__m${i}`, rings: [[[mk.lon, mk.lat]]] }));
    const outlineFeature: GeoFeature[] = m.outline ? [{ id: "__o", rings: [m.outline] }] : [];
    const growFeatures: GeoFeature[] = (m.grow ?? []).map((r, i) => ({ id: `__g${i}`, rings: [r as LonLat[]] }));
    const mp = fitProjection([...(m.features as GeoFeature[]), ...outlineFeature, ...growFeatures, ...markerRings], area, 20);
    if (!proj) proj = mp;
    for (const [k, v] of mapPlaceNames(m)) if (!names.has(k)) names.set(k, v);
  }
  if (!proj) return undefined;
  const P = proj;
  return (pos: Position): Vec2 | null => {
    if (typeof pos === "object" && !Array.isArray(pos) && typeof (pos as GeoPoint).lon === "number") {
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
export function compileScene(scene: ParsedScene, theme: Theme = TEXTBOOK): CanvasSlideDefinition {
  const { marker, components } = scene;
  const cueTimes = narrationTiming(marker.narration ?? []);

  // Camera and attention directives are excluded from layout auto-flow and the draw loop; split them
  // out up front (attention items have no measured content, same as camera).
  const drawComponents = components.filter(
    (c): c is DrawComponent => c.type !== "camera" && c.type !== "attention",
  );
  const cameraComponents = components.filter((c): c is Extract<Component, { type: "camera" }> => c.type === "camera");
  const attnComponents = components.filter((c): c is Extract<Component, { type: "attention" }> => c.type === "attention");

  // Scene-wide geographic resolver (pure, from the scene's map geometry) — lets camera `to`, attention
  // `target`, and any component `at` reference a `{lon,lat}` point or a place/region/feature name.
  const geo = buildSceneGeo(drawComponents);

  const timings = resolveTiming(drawComponents, { cueTimes });
  const camTimings = resolveTiming(cameraComponents, { cueTimes });
  const attnTimings = resolveTiming(attnComponents, { cueTimes });
  // A component's own entrance (`at + dur`) isn't the only thing that can outlast the scene: a
  // bounded-dur `motion` (orbit/along/fall/trace/morph/a dur'd move) can run well past the
  // entrance window and would otherwise get cut off mid-flight. Fold each such motion's own end
  // time (resolved start + its `dur`) into the same max used for the entrance-only `lastEnd`.
  // Continuous motions (`spin`/`orbit` with no `dur`) have no natural end, so they don't extend it.
  const motionEnd = drawComponents.reduce((m, c, i) => {
    if (!c.motion || c.motion.dur === undefined) return m;
    const motionStart = resolveMotionAt(c.motion, cueTimes, timings[i].at);
    return Math.max(m, motionStart + c.motion.dur);
  }, 0);
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

  return {
    duration,
    viewW: W,
    viewH: H,
    render(ctx, t, frame) {
      if (!frame) { ctx.clearRect(0, 0, W, H); return; }
      if (!laid) laid = layoutScene(drawComponents, W, H, geo);
      const placements = laid.placements;
      const boxes = laid.boxes;

      if (!camDirectives) {
        camDirectives = cameraComponents.map((c, i) => {
          const { at, dur } = camTimings[i];
          const [fx, fy] = resolvePosition(c.to, { viewW: W, viewH: H, boxes, geo });
          return { at, dur, focal: [fx, fy] as [number, number], zoom: c.zoom ?? 1, rot: c.rot ?? 0, kind: c.kind ?? "move" };
        });
      }
      frame.setCamera(cameraAt(camDirectives, t, W, H));

      // Screen-fixed HUD: any `fixed` component renders on `fg`, which we pin to screen space so it
      // ignores the camera (mirrors the original's `frame.layer.set("annotation",{screenspace:true})`).
      // Set only when this scene actually has a fixed component, so no other scene/lesson is affected.
      if (drawComponents.some((c) => c.fixed)) frame.layer.set("fg", { screenspace: true });

      const bg = frame.layer.ctx("bg");
      const [c0, c1] = marker.bg ?? [theme.palette.bg, theme.palette.surface];
      const g = bg.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      bg.fillStyle = g;
      bg.fillRect(0, 0, W, H);

      const resolveFocal = (pos: unknown): [number, number] => resolvePosition(pos as Component["at"], { viewW: W, viewH: H, boxes, geo });

      drawComponents.forEach((c, i) => {
        const timing = timings[i];
        if (t < timing.at) return;
        drawComponentInstance(frame, c, placements[i], timing, duration, t, cueTimes, resolveFocal, theme);
      });

      // Attention overlays (Phase 4): timed like any component but not part of the draw-loop's
      // placement/index alignment above — each resolves its own anchor geometry independently.
      attnComponents.forEach((c, i) => {
        const { at, dur } = attnTimings[i];
        const opacity = attentionOpacity(t, at, dur, c.exit, duration);
        if (opacity <= 0) return;
        const g = attnGeom(c.target, boxes, W, H, geo);
        const p = phase(t, at, at + dur);
        const color = c.color;
        const defaultLayer = c.verb === "spotlight" || c.verb === "dim" || c.verb === "vignette" ? "fx" : "annotation";
        const layer = frame.layer.ctx(c.layer ?? defaultLayer);

        layer.save();
        layer.globalAlpha *= opacity;

        try { switch (c.verb) {
          case "callout": {
            callout(frame, {
              target: [g.cx, g.cy],
              text: c.text,
              title: c.title,
              side: c.side as CalloutOptions["side"],
              route: c.route as CalloutOptions["route"],
              container: c.container as CalloutOptions["container"],
              color,
              leaderP: p,
              labelP: phase(t, at + dur * 0.3, at + dur),
            });
            return;
          }
          case "highlight":
            highlightRing(layer, g.cx, g.cy, c.radius ?? g.r, t, { color });
            return;
          case "spotlight":
            spotlightFocus(layer, g.cx, g.cy, c.radius ?? g.r);
            return;
          case "dim":
            dimExcept(layer, [{ cx: g.cx, cy: g.cy, r: c.radius ?? g.r }]);
            return;
          case "pointer": {
            const from = c.from !== undefined ? resolvePosition(c.from, { viewW: W, viewH: H, boxes, geo }) : ([g.cx, g.cy - (c.radius ?? g.r) - 60] as [number, number]);
            pointerArrow(layer, from[0], from[1], g.cx, g.cy, p, { color });
            return;
          }
          case "box":
            focusBox(layer, g.box.x, g.box.y, g.box.w, g.box.h, t, { color });
            return;
          case "brackets":
            cornerBrackets(layer, g.box.x, g.box.y, g.box.w, g.box.h, { color, p });
            return;
          case "encircle":
            circumscribe(layer, { x: g.box.x, y: g.box.y, w: g.box.w, h: g.box.h }, p, { style: { color } });
            return;
          case "converge":
            convergingArrows(layer, g.cx, g.cy, p, { color });
            return;
          case "spark":
            sparkFlash(layer, g.cx, g.cy, p, { color });
            return;
          case "vignette":
            vignetteTo(layer, g.cx, g.cy, {});
            return;
          case "rings":
            focusRings(layer, g.cx, g.cy, p, { color });
            return;
          default: {
            const _exhaustive: never = c.verb;
            console.warn(`gcl: no attention handler for verb "${_exhaustive as string}"`);
            return;
          }
        } } finally {
          layer.restore();
        }
      });
    },
  };
}

/**
 * `group` carries extra context (frame/cueTimes/resolveFocal/sceneDuration) that no other component
 * type needs, threaded through `RenderCtx` so `paintNative`/`paintFinal` don't need a signature change
 * just to reach the one `group` case — everything else ignores these fields.
 */
interface RenderCtx {
  t: number; at: number; dur: number; cx: number; cy: number; w: number; h: number;
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
): void {
  const { at, dur } = timing;

  // particles/flow/glow are simple continuous streams keyed on `t - at`, not a progress-driven
  // enter/exit — they still respect the component's own `layer`/placement, but paint directly rather
  // than through `paintNative`/`paintFinal`/`applyEnterExit` (no notion of a "finished" pose to mask
  // or fade to). They're dispatched here, before the general motion/enterexit path below, since (per
  // the plan) they compile straight to `emit`/`radialGlow` on the fx layer.
  if (c.type === "particles" || c.type === "flow" || c.type === "glow") {
    const layer = frame.layer.ctx(c.layer ?? "fx");
    const { cx, cy } = placement;
    if (c.type === "particles") {
      const cfg: EmitterConfig = { ...resolveEmitter(c.preset, cx, cy, W, H, c.seed ?? 1), ...(c.config as Partial<EmitterConfig> | undefined) };
      emit(layer, cfg, t - at);
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
      emit(layer, cfg, t - at);
    } else {
      radialGlow(layer, cx, cy, c.r ?? 60, c.color ?? "#ffd24a", phase(t, at, at + dur));
    }
    return;
  }

  // `fixed` components render on the `fg` layer, which the scene marks screenspace (below) so they stay
  // put through camera moves — a HUD/legend overlay. Otherwise use the explicit or default layer.
  const layer = frame.layer.ctx(c.fixed ? "fg" : c.layer ?? defaultLayerFor(c.type));
  const { cx, cy, w, h } = placement;
  const box = { x: cx - w / 2, y: cy - h / 2, w, h };
  const enterDur = c.enter?.dur ?? dur;
  const exitInfo = resolveExit(c.exit, sceneDuration);
  const rc: RenderCtx = { t, at, dur, cx, cy, w, h, frame, cueTimes, resolveFocal, sceneDuration, theme };

  const motionSpec: typeof c.motion = c.motion ? { ...c.motion, at: resolveMotionAt(c.motion, cueTimes, at) } : undefined;
  const mt = motionTransform(motionSpec, box, t, resolveFocal);
  const osc = oscillateOffset(c.oscillate, t);
  const dx = mt.dx + osc.dx;
  const dy = mt.dy + osc.dy;
  const rot = mt.rot + osc.rot;
  const scale = mt.scale * (1 + osc.scale);

  layer.save();
  if (dx !== 0 || dy !== 0 || rot !== 0 || scale !== 1) {
    layer.translate(dx, dy);
    if (rot !== 0 || scale !== 1) {
      layer.translate(cx, cy);
      layer.rotate(rot);
      layer.scale(scale, scale);
      layer.translate(-cx, -cy);
    }
  }

  // Subject modifiers (Phase 4): `predict` gates WHICH content draws (placeholder vs real);
  // `ghost`/`magnify`/`emphasis` wrap the (possibly gated) content draw itself. Composed here so
  // they apply uniformly whether the component's own enter is native, masked, or fade.
  const predictAt = c.predict ? (c.predict.revealAt ?? (c.predict.revealCue != null ? cueTimes[c.predict.revealCue] : undefined) ?? at) : undefined;
  const drawSubject = (target: CanvasRenderingContext2D) => {
    const runEnterExit = (paintTarget: CanvasRenderingContext2D) =>
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

    if (predictAt !== undefined) {
      const pr = predictReveal(t, { poseAt: c.predict!.poseAt, revealAt: predictAt });
      if (!pr.revealed) {
        const pulse = 0.55 + 0.25 * Math.sin(pr.thinking * Math.PI * 3);
        target.save();
        target.globalAlpha *= pulse;
        fadeText(target, "?", cx, cy, 1, `700 ${Math.round(Math.min(w, h) * 0.6)}px ${theme.type.display}`, theme.palette.muted, "center");
        target.restore();
        return;
      }
      withPunch(target, cx, cy, t, predictAt, runEnterExit, { amp: 0.15 });
      return;
    }
    runEnterExit(target);
  };

  const drawGhostMagnify = (target: CanvasRenderingContext2D) => {
    if (c.magnify) {
      const r = c.magnify.r ?? Math.hypot(w, h) / 2;
      magnifyVerb(target, cx, cy, r, c.magnify.zoom ?? 1.6, drawSubject);
    } else if (c.ghost != null) {
      ghostVerb(target, c.ghost, drawSubject);
    } else {
      drawSubject(target);
    }
  };

  const drawEmphasized = (target: CanvasRenderingContext2D) => {
    if (!c.emphasis) {
      drawGhostMagnify(target);
      return;
    }
    const kind = c.emphasis.kind ?? "punch";
    const emAt = c.emphasis.at ?? (c.emphasis.cue != null ? cueTimes[c.emphasis.cue] : undefined) ?? at;
    const amp = c.emphasis.amp;
    if (kind === "punch") withPunch(target, cx, cy, t, emAt, drawGhostMagnify, { amp });
    else if (kind === "shake") withShake(target, t, emAt, drawGhostMagnify, { mag: amp });
    else if (kind === "pulse") pulseScale(target, cx, cy, t, drawGhostMagnify, { amp });
    else wiggle(target, cx, cy, t, drawGhostMagnify, { amp });
  };

  drawEmphasized(layer);
  layer.restore();

  if (mt.trail && mt.trail.length > 1) {
    const color = c.motion && c.motion.kind === "trace" ? c.motion.color ?? "#5cc8ae" : "#5cc8ae";
    layer.save();
    layer.strokeStyle = color;
    layer.lineWidth = 2;
    layer.beginPath();
    layer.moveTo(mt.trail[0][0], mt.trail[0][1]);
    for (let k = 1; k < mt.trail.length; k++) layer.lineTo(mt.trail[k][0], mt.trail[k][1]);
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
  renderGroup(rc.frame, c, groupBox, { at: rc.at, dur: rc.dur }, rc.sceneDuration ?? rc.t, rc.t, rc.cueTimes ?? [], rc.resolveFocal ?? ((_pos) => [cx, cy]), rc.theme);
}

/** Default a child's `enter` to the group's `childEnter` when the child declares none of its own —
 *  the group-level default entrance (plan Task 4 Step 2). A child with an explicit `enter` (even
 *  `{type:"none"}`) always keeps it. */
function withDefaultEnter<T extends Component>(kid: T, childEnter: Component["enter"] | undefined): T {
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
  if (c.type === "particles" || c.type === "flow" || c.type === "glow") return [c.layer ?? "fx"];
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
  const kids = group.children.filter((k): k is DrawComponent => k.type !== "camera" && k.type !== "attention");
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
    ? kids.map((_k, i) => ({ at: groupTiming.at + i * (group.build!.step ?? 0.5), dur: kids[i].dur ?? 0.6 }))
    : resolveTiming(kids, { cueTimes, gap: 0 }).map((tm) => ({ at: groupTiming.at + tm.at, dur: tm.dur }));

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
      drawComponentInstance(frame, kidWithEnter, placements[i], kt, sceneDuration, t, cueTimes, resolveFocal, theme);
    });
  } finally {
    if (group.clip) {
      for (const name of clipLayerNames) frame.layer.ctx(name).restore();
    }
  }
}

/** Lazily-loaded image cache, keyed by src. Load is async but pixels for a given loaded state are
 *  pure/deterministic — a scene re-seek after the image has finished loading is stable. */
const imageCache = new Map<string, HTMLImageElement>();

function getImage(src: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null; // no DOM (e.g. pure node/vitest) — skip gracefully
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Lazily-loaded inline-SVG-markup cache, keyed by the raw markup string — mirrors `imageCache`/
 *  `getImage` above (same lazy-load-then-cache shape) but for `{type:"svg"}` components, which embed
 *  markup directly rather than referencing a `src` URL. */
const svgMarkupCache = new Map<string, HTMLImageElement>();

function getSvgImage(markup: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null; // no DOM (e.g. pure node/vitest) — skip gracefully
  let img = svgMarkupCache.get(markup);
  if (!img) {
    img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
    svgMarkupCache.set(markup, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Draw a `{type:"vector"}` component's raw Path2D `d` string at `(cx,cy)` — fill/stroke/rotate/scale
 *  per the authored fields, faded in by `enterP`. No-ops under environments without `Path2D` (node/
 *  vitest) so the smoke tests never throw. */
function paintVector(layer: CanvasRenderingContext2D, c: Extract<Component, { type: "vector" }>, cx: number, cy: number, enterP: number) {
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
function paintSvg(layer: CanvasRenderingContext2D, c: Extract<Component, { type: "svg" }>, cx: number, cy: number, enterP: number) {
  if (typeof Image === "undefined") return;
  const img = getSvgImage(c.markup);
  if (img) drawSvg(layer, img, cx, cy, c.w, c.h, { alpha: enterP, rotate: c.rotate });
}

/** Draw a `{type:"prop"}` component — a named prop from `PROP_CATALOG`, rendered as its list of
 *  Path2D parts (each with its own fill/stroke), rotated as a whole by `angle` (DEGREES). No-ops
 *  under environments without `Path2D` (node/vitest), same guard as `paintVector`. */
function paintProp(layer: CanvasRenderingContext2D, c: Extract<Component, { type: "prop" }>, cx: number, cy: number, enterP: number) {
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

/** A small filled-triangle pen nib riding a path at progress `p` — the asset-free "hand follower".
 *  Only meaningful for content that exposes a points array (path/shape/parametric); see `pointsFor`. */
function drawPenNib(ctx: CanvasRenderingContext2D, pts: Pt[], p: number, color: string) {
  if (pts.length < 2) return;
  const at = pointAt(pts, p);
  const size = 9;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(at.angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.6, -size * 0.45);
  ctx.lineTo(-size * 0.6, size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A shape's `fill` is `string | [light,dark]` (the tuple form is disc-only, for the shaded-sphere
 *  gradient — see `paintShape`). Everywhere else just wants a single representative color; take the
 *  first stop of a tuple. `"none"` (and `""`) mean "no fill" — treat them as absent rather than as a
 *  literal (and truthy) CSS color, so a `{fill:"none", stroke:"X"}` shape neither runs the no-op fill
 *  path nor loses its stroke to a falsely-truthy `fill`. */
function fillColor(fill: string | [string, string] | undefined): string | undefined {
  const c = Array.isArray(fill) ? fill[0] : fill;
  return c && c !== "none" ? c : undefined;
}

/** Resolve the stroke color/width an eraser should use for a stroke/path component's exit — mirrors
 *  the color each type's own native-enter draw uses, so the erase reads as "the same stroke, undone". */
function strokeStyleFor(c: DrawComponent): { color: string; width?: number } | null {
  switch (c.type) {
    case "shape":
      if (c.shape === "disc") return null;
      return { color: c.stroke ?? fillColor(c.fill) ?? "#eef5ef", width: c.width };
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
function nativeEraseFor(c: DrawComponent, rc: RenderCtx): ((layer: CanvasRenderingContext2D, exitP: number) => void) | undefined {
  const pts = pointsFor(c, rc);
  const style = strokeStyleFor(c);
  if (!pts || pts.length < 2 || !style) return undefined;
  return (layer, exitP) => erase(layer, pts, exitP, { style: { color: style.color, width: style.width } });
}

/** Resolve the point array a "draw"-entrance component strokes on, for pen-nib placement. Only
 *  path/shape/parametric content exposes one; everything else returns null (pen silently ignored). */
function pointsFor(c: DrawComponent, rc: RenderCtx): Pt[] | null {
  const { cx, cy, w, h } = rc;
  const r = "r" in c ? c.r ?? Math.min(w, h) / 2 : Math.min(w, h) / 2;
  switch (c.type) {
    case "shape": {
      if (c.shape === "path") return smoothPath(c.points ?? [], { curve: "catmullRom" });
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
) {
  const growKeyframes = c.grow ?? [];
  const markerRings: GeoFeature[] = (c.markers ?? []).map((m, i) => ({ id: `__marker${i}`, rings: [[[m.lon, m.lat]]] }));
  const outlineFeature: GeoFeature[] = c.outline ? [{ id: "__outline", rings: [c.outline] }] : [];
  const growFeatures: GeoFeature[] = growKeyframes.map((ring, i) => ({ id: `__grow${i}`, rings: [ring] }));
  const proj = fitProjection([...c.features, ...outlineFeature, ...growFeatures, ...markerRings], area, 20);

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
      for (let k = 1; k < ring.length; k++) layer.lineTo(ring[k][0], ring[k][1]);
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
  drawMap(layer, c.features, proj, (_f, i) => {
    // Staggered draw-on when `featureStagger` is set: feature `i` animates over its own window; else
    // every feature rides the map's shared `enterP`.
    const fp = c.featureStagger != null
      ? clamp01((growT - i * c.featureStagger) / (c.featureDur ?? 2.5))
      : enterP;
    const color = c.featureColors?.[i];
    return color
      ? { stroke: color, fill: color, fillAlpha: 0.48, p: fp }
      : { stroke: "#5b6b78", fill: "rgba(92,200,174,0.18)", p: fp };
  });

  // 4. markers + flows (existing). Each flow can carry its own `at`/`dur` draw-on window (seconds
  // since the map entrance, via `growT`); without them it rides the map's shared `enterP`.
  for (const m of c.markers ?? []) {
    geoMarker(layer, [m.lon, m.lat], proj, {
      icon: m.icon && iconNames.includes(m.icon as IconName) ? (m.icon as IconName) : undefined,
      label: m.label,
      alpha: enterP,
    });
  }
  // `flows` endpoints may be a `[lon,lat]` pair OR a place name (a `places` entry / feature id /
  // marker label on this same map) — resolve names against the map's own place table.
  const flowNames = (c.flows ?? []).some((f) => typeof f.from === "string" || typeof f.to === "string") ? mapPlaceNames(c) : null;
  const flowLL = (v: [number, number] | string): [number, number] | null =>
    Array.isArray(v) ? v : (flowNames ? lookupPlace(flowNames, v) ?? null : null);
  for (const f of c.flows ?? []) {
    const fp = f.at != null || f.dur != null ? clamp01((growT - (f.at ?? 0)) / (f.dur ?? 2.2)) : enterP;
    if (fp <= 0) continue;
    const from = flowLL(f.from);
    const to = flowLL(f.to);
    if (!from || !to) continue;
    flowArrow(layer, from, to, proj, fp, { color: f.color, width: f.width, bend: f.bend });
  }
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
function resolvePlayhead(c: Extract<Component, { type: "timeline" }>, elapsed: number, defaultOver: number): number | undefined {
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
function paintNative(layer: CanvasRenderingContext2D, c: DrawComponent, rc: RenderCtx, enterP: number, enterDur: number) {
  const { at, cx, cy, w, h } = rc;
  const tPrime = at + enterP * enterDur;
  const syntheticRc: RenderCtx = { ...rc, t: tPrime, dur: enterDur };
  const area = { x: cx - w / 2, y: cy - h / 2, w, h };

  switch (c.type) {
    case "heading": {
      const size = c.size ?? 30;
      const font = `700 ${size}px ${rc.theme.type.display}`;
      drawSlam(layer, c.text, cx, cy, tPrime, at, { font, color: c.color ?? rc.theme.palette.ink });
      return;
    }
    case "text": {
      const font = textFont(c, rc.theme.type.display);
      const color = c.color ?? rc.theme.palette.ink;
      const align = c.align ?? "center";
      const leftX = cx - w / 2;
      const mode = c.mode ?? textModeFromEnter(c.enter?.type);
      if (mode === "word") {
        drawWordReveal(layer, c.text, leftX, cy, tPrime, { font, color, align }, { start: at, mode: "rise" });
      } else if (mode === "typewriter") {
        drawTypewriter(layer, c.text, leftX, cy, enterP, { font, color, align }, { cursor: true, t: tPrime });
      } else if (mode === "slam") {
        drawSlam(layer, c.text, cx, cy, tPrime, at, { font, color });
      } else if (mode === "scramble") {
        drawScramble(layer, c.text, cx, cy, tPrime, at, { font, color });
      } else {
        fadeText(layer, c.text, cx, cy, enterP, font, color, align);
      }
      return;
    }
    case "equation": {
      drawMath(layer, c.tex, cx, cy, { size: c.size ?? 30, color: c.color ?? "#eef5ef", align: c.align, p: enterP });
      return;
    }
    case "stat": {
      const size = c.size ?? 44;
      const font = `800 ${size}px ${rc.theme.type.display}`;
      const suffix = statSuffix(c.unit);
      // `from` readouts (e.g. a running year counter) smoothstep across their window so they stay in
      // lockstep with other `phase`-eased content (the map's `grow` morph + the timeline playhead,
      // which now ease the same way) — mirroring the original's single `grow = phase(t, …)` driving
      // year/ring/playhead together. Plain 0→value stats keep the default cubic ease (`c.from` unset).
      const statEase = c.from != null ? smooth : undefined;
      // Use the RAW scene time `rc.t` (like the map `grow` + timeline playhead), NOT `tPrime` — `tPrime`
      // is `at + enterP*enterDur`, and since `enterP` is already smoothstep-eased, feeding it to
      // `counterValue` (which eases again) would DOUBLE-ease the count and drift ahead of the
      // playhead/border it should stay locked to.
      drawCounter(
        layer, cx, cy,
        counterValue(rc.t, at, enterDur, c.from ?? 0, c.value, statEase),
        { font, color: c.color ?? rc.theme.palette.accent, align: "center" },
        { commas: c.commas ?? true, decimals: c.decimals, prefix: c.prefix, suffix },
      );
      if (c.label) fadeText(layer, c.label, cx, cy + size * 0.6, enterP, "600 14px " + rc.theme.type.display, rc.theme.palette.muted, "center");
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
      strokeOn(layer, pts, enterP, { color: c.color ?? "#5cc8ae", width: c.width });
      if (c.enter?.pen) drawPenNib(layer, pts, enterP, c.color ?? "#5cc8ae");
      return;
    }
    case "textPath": {
      drawTextAlongPath(layer, c.text, c.path, enterP, { font: `500 ${c.size ?? 18}px ${rc.theme.type.display}`, color: c.color ?? rc.theme.palette.ink });
      return;
    }
    case "icon": {
      if (!iconNames.includes(c.name as IconName)) return;
      drawIcon(layer, c.name as IconName, cx, cy, c.size ?? 28, { color: c.color, filled: c.filled, alpha: enterP });
      return;
    }
    case "legend": {
      colorSemantics().legend(layer, c.categories, cx - w / 2, cy - (c.categories.length * (c.rowH ?? 20)) / 2, { rowH: c.rowH });
      return;
    }
    case "image": {
      const img = getImage(c.src);
      if (img) drawSvg(layer, img, cx, cy, w, h, { alpha: enterP, rotate: c.rotate });
      return;
    }
    case "vector": {
      paintVector(layer, c, cx, cy, enterP);
      return;
    }
    case "svg": {
      paintSvg(layer, c, cx, cy, enterP);
      return;
    }
    case "prop": {
      paintProp(layer, c, cx, cy, enterP);
      return;
    }
    case "map": {
      paintMapComponent(layer, c, area, enterP, rc.t - at);
      return;
    }
    case "timeline": {
      const tl = makeTimeline(area, c.from, c.to);
      const pal = rc.theme.palette;
      timelineAxis(layer, tl, { p: enterP, color: pal.muted, ink: pal.muted });
      timelineEras(layer, tl, c.eras ?? [], enterP);
      timelineEvents(layer, tl, c.events ?? [], tPrime, { start: at, ink: pal.ink });
      const ph = resolvePlayhead(c, rc.t - at, enterDur);
      if (ph != null) timelinePlayhead(layer, tl, ph, { label: c.playheadLabel ?? true, color: pal.accent });
      return;
    }
    case "table": {
      drawTable(layer, c.rows, area.x, area.y, area.w, { header: c.header, rowH: c.rowH, ink: c.ink, p: enterP });
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
      return;
    default: {
      const _exhaustive: never = c;
      console.warn(`gcl: no native-enter handler for component type "${(_exhaustive as Component).type}"`);
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
export function integerTicks([a, b]: [number, number]): number[] | undefined {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span = hi - lo;
  if (span <= 0 || span > 6 || !Number.isInteger(lo) || !Number.isInteger(hi)) return undefined;
  const out: number[] = [];
  for (let v = lo; v <= hi; v++) out.push(v);
  return out;
}

/** Bar/line/area/scatter/pie/function chart entrance — each family's own native stagger/progress. */
function paintChart(layer: CanvasRenderingContext2D, c: Extract<Component, { type: "chart" }>, rc: RenderCtx, enterP: number) {
  const { t, at, cx, cy, w, h } = rc;
  const area = { x: cx - w / 2, y: cy - h / 2, w, h };
  const color = c.color ?? "#5cc8ae";
  const showAxes = c.axes !== false;
  if (c.chart === "bar") {
    const data: Datum[] = c.data ?? [];
    const ymax = Math.max(1, ...data.map((d) => d.value));
    const plot = makePlot(area, [0, 1], [0, ymax]);
    if (showAxes) axes(layer, plot, { p: enterP, xLabel: c.xLabel, yLabel: c.yLabel });
    barChart(layer, plot, data, { t, start: at, showValues: true, color });
  } else if (c.chart === "line" || c.chart === "area") {
    const series = c.series ?? [];
    const xs = series.map(([x]) => x);
    const ys = series.map(([, y]) => y);
    const xDomain = c.xDomain ?? [Math.min(0, ...xs), Math.max(1, ...xs)];
    const yDomain = c.yDomain ?? [Math.min(0, ...ys), Math.max(1, ...ys)];
    const plot = makePlot(area, xDomain, yDomain);
    if (showAxes) axes(layer, plot, { p: enterP, xLabel: c.xLabel, yLabel: c.yLabel, xTicks: integerTicks(xDomain), yTicks: integerTicks(yDomain) });
    lineChart(layer, plot, series, enterP, { area: c.chart === "area", color, markers: true });
  } else if (c.chart === "scatter") {
    const series = c.series ?? [];
    const xs = series.map(([x]) => x);
    const ys = series.map(([, y]) => y);
    const xDomain = c.xDomain ?? [Math.min(0, ...xs), Math.max(1, ...xs)];
    const yDomain = c.yDomain ?? [Math.min(0, ...ys), Math.max(1, ...ys)];
    const plot = makePlot(area, xDomain, yDomain);
    if (showAxes) axes(layer, plot, { p: enterP, xLabel: c.xLabel, yLabel: c.yLabel, xTicks: integerTicks(xDomain), yTicks: integerTicks(yDomain) });
    scatter(layer, plot, series, t, { color, start: at });
  } else if (c.chart === "pie") {
    const data: Datum[] = c.data ?? [];
    pie(layer, cx, cy, Math.min(w, h) / 2, data, enterP, { donut: c.donut, labels: true });
  } else if (c.chart === "function") {
    const xDomain = c.xDomain ?? [-1, 1];
    const yDomain = c.yDomain ?? [-1, 1];
    const plot = makePlot(area, xDomain, yDomain);
    const evalFn = compileExpr(c.fn ?? "x");
    if (showAxes) axes(layer, plot, { p: enterP, xLabel: c.xLabel, yLabel: c.yLabel, xTicks: integerTicks(xDomain), yTicks: integerTicks(yDomain) });
    plotFunction(layer, plot, (x) => evalFn({ x }), enterP, { color });
  } else if (c.chart === "riemann") {
    paintRiemann(layer, area, c, enterP);
  }
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
  const n = Math.max(1, Math.floor(c.n ?? 10));
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
  if (showAxes) axes(layer, plot, { p: enterP, xLabel: c.xLabel, yLabel: c.yLabel, xTicks: integerTicks([a, b]), yTicks: integerTicks(yDomain) });

  const baseY = plot.sy(0);
  const step = 0.6 / n; // stagger so the whole cascade fits within the entrance window
  layer.save();
  for (let i = 0; i < n; i++) {
    const gp = clamp01((enterP - i * step) / Math.max(1e-3, 1 - (n - 1) * step));
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
    layer.fillRect(Math.min(rx0, rx1), Math.min(top, bottom), Math.abs(rx1 - rx0), Math.max(1, Math.abs(bottom - top)));
    layer.strokeStyle = "rgba(255,255,255,0.35)";
    layer.lineWidth = 1;
    layer.strokeRect(Math.min(rx0, rx1), Math.min(top, bottom), Math.abs(rx1 - rx0), Math.max(1, Math.abs(bottom - top)));
  }
  layer.restore();

  // The curve itself draws on last, riding the same overall progress, so it reads as "the rectangles
  // approximate this line".
  plotFunction(layer, plot, (x) => evalFn({ x }), enterP, { color: color, width: 2 });
}

function lerpNum(a: number, b: number, p: number): number {
  return a + (b - a) * clamp01(p);
}

/** Shape a→b target point list for a `motion.kind==="morph"` component — same center/r as the shape's
 *  own points, per the target `toShape`/`sides`. */
function morphTargetShape(toShape: "circle" | "polygon" | "star" | "heart", sides: number | undefined, cx: number, cy: number, r: number): Pt[] {
  switch (toShape) {
    case "circle": return circleShape(cx, cy, r);
    case "star": return starShape(cx, cy, r);
    case "heart": return heartShape(cx, cy, r);
    default: return polygonShape(cx, cy, r, sides ?? 5);
  }
}

/**
 * `disc` harvest (Phase 6): render as a shaded sphere — a radial gradient sweeping light→dark
 * (light source at upper-left, ~35% in from the rim) plus a soft rim glow — instead of a flat filled
 * circle, so it reads as a planet/cell/atom body. `c.fill` may be a single color (a dark shade is
 * derived automatically) or an explicit `[light, dark]` pair; `c.shine` adds a small specular
 * highlight. Deterministic (no randomness, pure function of enterP/geometry).
 */
function paintDisc(layer: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: Extract<Component, { type: "shape" }>, enterP: number) {
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
function discColors(fill: string | [string, string] | undefined): [string, string] {
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

/** Shape entrance: draw-on stroke (with optional pen nib) or fill fade-in, matching P1 behavior.
 *  When `motion.kind === "morph"`, content-level shape A→B interpolation (drawMorph) takes over —
 *  the motion window's phase drives the morph, independent of the enter/exit progress `enterP`. */
function paintShape(layer: CanvasRenderingContext2D, c: Extract<Component, { type: "shape" }>, rc: RenderCtx, enterP: number) {
  const { cx, cy, w, h } = rc;
  const r = c.r ?? Math.min(w, h) / 2;
  if (c.motion?.kind === "morph") {
    const { toShape, sides, at = 0, dur = 1 } = c.motion;
    const p = linearPhase(rc.t, at, dur);
    const a = pointsFor(c, rc) ?? circleShape(cx, cy, r);
    const b = morphTargetShape(toShape, sides, cx, cy, r);
    const fill = fillColor(c.fill);
    layer.save();
    layer.globalAlpha *= enterP;
    drawMorph(layer, a, b, p, { fill, stroke: c.stroke ?? (fill ? undefined : "#eef5ef"), width: c.width });
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
  if (c.shape === "path") {
    if (useBorderThenFill) {
      drawBorderThenFill(layer, pts, enterP, {
        style: { color: c.stroke ?? fill ?? "#eef5ef", width: c.width },
        fill,
      });
      return;
    }
    strokeOn(layer, pts, enterP, { color: c.stroke ?? fill ?? "#eef5ef", width: c.width });
    if (c.enter?.pen) drawPenNib(layer, pts, enterP, c.stroke ?? fill ?? "#eef5ef");
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
    strokeOn(layer, closed, enterP, { color: c.stroke ?? "#eef5ef", width: c.width });
    if (c.enter?.pen) drawPenNib(layer, closed, enterP, c.stroke ?? "#eef5ef");
  }
}

/**
 * Paint a component's FINISHED content (as if p=1) in absolute coords — used by masked/fade/transform
 * entrance+exit wrappers, which animate visibility around the content rather than the content's own
 * progress. Mirrors `paintNative`'s per-type drawing but always at full completion.
 */
function paintFinal(layer: CanvasRenderingContext2D, c: DrawComponent, rc: RenderCtx) {
  const { cx, cy, w, h } = rc;
  const area = { x: cx - w / 2, y: cy - h / 2, w, h };
  switch (c.type) {
    case "heading": {
      const size = c.size ?? 30;
      const font = `700 ${size}px ${rc.theme.type.display}`;
      fadeText(layer, c.text, cx, cy, 1, font, c.color ?? rc.theme.palette.ink, "center");
      return;
    }
    case "text": {
      const font = textFont(c, rc.theme.type.display);
      const color = c.color ?? rc.theme.palette.ink;
      const align = c.align ?? "center";
      fadeText(layer, c.text, cx, cy, 1, font, color, align);
      return;
    }
    case "equation": {
      drawMath(layer, c.tex, cx, cy, { size: c.size ?? 30, color: c.color ?? "#eef5ef", align: c.align, p: 1 });
      return;
    }
    case "stat": {
      const size = c.size ?? 44;
      const font = `800 ${size}px ${rc.theme.type.display}`;
      const suffix = statSuffix(c.unit);
      drawCounter(
        layer, cx, cy, c.value,
        { font, color: c.color ?? rc.theme.palette.accent, align: "center" },
        { commas: c.commas ?? true, decimals: c.decimals, prefix: c.prefix, suffix },
      );
      if (c.label) fadeText(layer, c.label, cx, cy + size * 0.6, 1, "600 14px " + rc.theme.type.display, rc.theme.palette.muted, "center");
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
      strokeOn(layer, pts, 1, { color: c.color ?? "#5cc8ae", width: c.width });
      return;
    }
    case "textPath": {
      drawTextAlongPath(layer, c.text, c.path, 1, { font: `500 ${c.size ?? 18}px ${rc.theme.type.display}`, color: c.color ?? rc.theme.palette.ink });
      return;
    }
    case "icon": {
      if (!iconNames.includes(c.name as IconName)) return;
      drawIcon(layer, c.name as IconName, cx, cy, c.size ?? 28, { color: c.color, filled: c.filled, alpha: 1 });
      return;
    }
    case "legend": {
      colorSemantics().legend(layer, c.categories, cx - w / 2, cy - (c.categories.length * (c.rowH ?? 20)) / 2, { rowH: c.rowH });
      return;
    }
    case "image": {
      const img = getImage(c.src);
      if (img) drawSvg(layer, img, cx, cy, w, h, { alpha: 1, rotate: c.rotate });
      return;
    }
    case "vector": {
      paintVector(layer, c, cx, cy, 1);
      return;
    }
    case "svg": {
      paintSvg(layer, c, cx, cy, 1);
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
      paintMapComponent(layer, c, area, 1, rc.t - rc.at);
      return;
    }
    case "timeline": {
      const tl = makeTimeline(area, c.from, c.to);
      const palF = rc.theme.palette;
      timelineAxis(layer, tl, { p: 1, color: palF.muted, ink: palF.muted });
      timelineEras(layer, tl, c.eras ?? [], 1);
      timelineEvents(layer, tl, c.events ?? [], rc.t, { start: rc.at - 1e6, ink: palF.ink }); // force-fired: all events already elapsed
      // Steady-state (reached on almost every frame past the short default fade-in — see the `map`
      // case above for the same shape of bug): use REAL elapsed time, not "already complete", so an
      // animated playhead (`playheadFrom`/`playheadTo`) keeps sweeping for as long as `playheadOver`
      // lasts instead of snapping straight to `playheadTo`.
      const ph = resolvePlayhead(c, rc.t - rc.at, c.enter?.dur ?? rc.dur);
      if (ph != null) timelinePlayhead(layer, tl, ph, { label: c.playheadLabel ?? true, color: palF.accent });
      return;
    }
    case "table": {
      drawTable(layer, c.rows, area.x, area.y, area.w, { header: c.header, rowH: c.rowH, ink: c.ink, p: 1 });
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
      return;
    default: {
      const _exhaustive: never = c;
      console.warn(`gcl: no compile handler yet for component type "${(_exhaustive as Component).type}"`);
      return;
    }
  }
}
