import type { Base, Component, EnterKind, ExitKind, Film, SceneMarker, Vec2 } from "../gcl/schema";
import { categoryColor, resolvePace, resolveSize, resolveVisualStyle } from "./registry";
import type { ResolvedAction, ResolvedLesson, ResolvedObject, ResolvedScene, ResolvedSimpleAction } from "./resolve";
import type { EntranceToken, ExitToken, ObjectSpec } from "./types";
import { parseSvgArtwork, svgPartMarkup } from "./svg";

const ENTRANCES: Record<EntranceToken, EnterKind> = {
  instant: "none",
  fade: "fade",
  draw: "draw",
  wipe: "wipe",
  iris: "iris",
  slam: "slam",
  "word-by-word": "word",
  typewriter: "typewriter",
  scramble: "scramble",
};

const EXITS: Record<ExitToken, ExitKind> = {
  instant: "none",
  fade: "fade",
  erase: "erase",
  wipe: "wipe",
  iris: "iris",
  dissolve: "dissolve",
  slide: "slide",
  shrink: "shrink",
};

function objectAction(scene: ResolvedScene, object: ResolvedObject, kind: "show" | "hide"): ResolvedSimpleAction | undefined {
  for (const beat of scene.beats) {
    for (const action of beat.actions) {
      if (action.kind !== kind) continue;
      const source = action.source;
      if (
        (source.do === "show" || source.do === "hide")
        && (source.targets.includes(object.id) || (object.compositeParent !== undefined && source.targets.includes(object.compositeParent)))
      ) return action;
    }
  }
  return undefined;
}

function targetedAction(scene: ResolvedScene, id: string, kind: "motion" | "emphasize"): ResolvedSimpleAction | undefined {
  for (const beat of scene.beats) {
    for (const action of beat.actions) {
      if (action.kind !== kind) continue;
      if ((action.source.do === "motion" || action.source.do === "emphasize") && action.source.target === id) return action;
    }
  }
  return undefined;
}

const ORBIT_RADII = { small: 70, medium: 112, large: 156 } as const;
const TURN_COUNTS = { half: 0.5, one: 1, two: 2, many: 4 } as const;
const STRENGTH = { subtle: 0.55, normal: 1, strong: 1.55 } as const;

function motionFor(scene: ResolvedScene, object: ResolvedObject): Base["motion"] {
  const action = targetedAction(scene, object.id, "motion");
  if (!action || action.source.do !== "motion") return undefined;
  const source = action.source;
  const direction = source.direction === "counterclockwise" ? -1 : 1;
  if (source.motion === "move") return { kind: "move", to: source.to ?? object.id, at: action.start, dur: action.duration };
  if (source.motion === "fall") {
    const bounce = source.bounce === "strong" ? 14 : source.bounce === "soft" ? 7 : 0;
    return { kind: "fall", to: source.to, gravity: 420, bounce, at: action.start, dur: action.duration };
  }
  if (source.motion === "orbit") {
    const centerObject = scene.objects.find((candidate) => candidate.id === source.around);
    const from = centerObject
      ? Math.atan2(object.position[1] - centerObject.position[1], object.position[0] - centerObject.position[0])
      : 0;
    return {
      kind: "orbit",
      center: source.around ?? "center",
      radius: ORBIT_RADII[source.orbit ?? "medium"],
      from,
      turns: TURN_COUNTS[source.turns ?? "one"] * direction,
      at: action.start,
      dur: action.duration,
    };
  }
  if (source.motion === "along") {
    const pathObject = scene.objects.find((candidate) => candidate.id === source.along);
    const endpoints = pathObject?.endpoints;
    const path = endpoints ? curvedPoints(endpoints.from, endpoints.to, pathObject?.source.kind === "line" && pathObject.source.form !== "straight") : [object.position, object.position];
    return { kind: "along", path, at: action.start, dur: action.duration };
  }
  return { kind: "spin", omega: direction * 2.2, at: action.start, dur: action.duration };
}

function emphasisFor(scene: ResolvedScene, object: ResolvedObject): Base["emphasis"] {
  const action = targetedAction(scene, object.id, "emphasize");
  if (!action || action.source.do !== "emphasize") return undefined;
  const strength = STRENGTH[action.source.strength ?? "normal"];
  return { kind: action.source.emphasis, at: action.start, amp: strength };
}

function entranceFor(object: ResolvedObject, action: ResolvedSimpleAction | undefined) {
  if (!action || action.source.do !== "show") return { type: "none" as const, dur: 0 };
  const fallback: EntranceToken = object.kind === "line" ? "draw" : object.kind === "text" ? "fade" : "fade";
  const token = action.source.entrance ?? fallback;
  return { type: ENTRANCES[token], dur: token === "instant" ? 0 : action.duration };
}

function exitFor(action: ResolvedSimpleAction | undefined) {
  if (!action || action.source.do !== "hide") return undefined;
  const token = action.source.exit ?? "fade";
  return { type: EXITS[token], out: action.start, dur: token === "instant" ? 0 : action.duration };
}

function curvedPoints(from: Vec2, to: Vec2, curved: boolean): Vec2[] {
  if (!curved) return [from, to];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return [from, [(from[0] + to[0]) / 2 - dy * 0.18, (from[1] + to[1]) / 2 + dx * 0.18], to];
}

type ContentBase = Pick<Base, "id" | "at" | "start" | "dur" | "enter" | "exit" | "layer" | "fixed">;

const RECTANGLE_COUNTS = { few: 4, several: 8, many: 16, dense: 32 } as const;

function inlineObject(source: ObjectSpec): ResolvedObject {
  const size = resolveSize(source.size ?? "medium", source.kind) ?? 1;
  return {
    id: source.id,
    kind: source.kind,
    source,
    position: [0, 0],
    box: { x: 0, y: 0, w: 1, h: 1 },
    size,
  };
}

function compileContent(scene: ResolvedScene, object: ResolvedObject, base: ContentBase): Component {
  const source = object.source;
  const style = resolveVisualStyle(scene.theme, source.role);

  if (object.kind === "svg-part" && object.svgPart) {
    return {
      ...base,
      type: "svg",
      markup: svgPartMarkup(object.svgPart),
      w: object.box.w,
      h: object.box.h,
    };
  }

  switch (source.kind) {
    case "text": {
      if (source.textRole === "heading") return { ...base, type: "heading", text: source.text, size: object.size, color: style.color };
      const role = source.textRole === "title" ? "title" : source.textRole ?? "body";
      return { ...base, type: "text", text: source.text, role, size: object.size, color: style.color };
    }
    case "equation":
      return { ...base, type: "equation", tex: source.value, size: object.size, color: style.color, align: "center" };
    case "stat":
      return { ...base, type: "stat", value: source.value, from: source.from, unit: source.unit, label: source.label, decimals: source.decimals, commas: source.commas, prefix: source.prefix, size: object.size, color: style.color };
    case "visual":
      return {
        ...base,
        type: "prop",
        name: source.asset,
        size: object.size,
        angle: object.angle,
        color: source.color ?? style.color,
        w: object.box.w,
        h: object.box.h,
      };
    case "vector":
      return {
        ...base,
        type: "vector",
        d: source.d,
        fill: source.fill,
        stroke: source.stroke ?? style.color,
        width: source.strokeWidth,
        w: source.width,
        h: source.height,
        scale: source.scale,
        rotate: source.rotate,
      };
    case "svg-composite": {
      const [x, y, width, height] = source.viewBox;
      return {
        ...base,
        type: "svg",
        markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}"></svg>`,
        w: object.box.w,
        h: object.box.h,
      };
    }
    case "svg-artwork": {
      const [x, y, width, height] = parseSvgArtwork(source.svg).value?.viewBox ?? [0, 0, 16, 9];
      return {
        ...base,
        type: "svg",
        markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}"></svg>`,
        w: object.box.w,
        h: object.box.h,
      };
    }
    case "line": {
      const endpoints = object.endpoints ?? { from: [0, 0] as Vec2, to: [120, 0] as Vec2 };
      const points = source.form === "elbow"
        ? [endpoints.from, [endpoints.from[0], endpoints.to[1]] as Vec2, endpoints.to]
        : curvedPoints(endpoints.from, endpoints.to, source.form === "curved" || source.form === "arrow" || source.form === "traced");
      if (source.form === "arrow") {
        return {
          ...base,
          type: "group",
          children: [
            { type: "shape", shape: "path", points, stroke: style.color, width: object.size },
            { type: "shape", shape: "polygon", sides: 3, r: Math.max(8, object.size * 3), fill: style.color },
          ],
          layer: style.layer,
        };
      }
      return { ...base, type: "shape", shape: "path", points, stroke: style.color, width: object.size };
    }
    case "shape": {
      const outline = source.appearance === "outline";
      const shaded = source.appearance === "shaded" || source.shape === "disc";
      return {
        ...base,
        type: "shape",
        shape: source.shape,
        sides: source.sides,
        r: 34 * object.size,
        fill: outline ? "none" : shaded ? [style.color, categoryColor(scene.theme, `${source.id}-shade`, 3)] : style.color,
        stroke: style.color,
        width: style.lineWidth,
        shine: source.shape === "disc" && shaded,
      };
    }
    case "curve": {
      const scale = 52 * object.size;
      return {
        ...base,
        type: "parametric",
        fx: `(${source.x}) * ${scale}`,
        fy: `-(${source.y}) * ${scale}`,
        uDomain: source.domain,
        samples: 96,
        color: style.color,
        width: style.lineWidth * (source.appearance === "dashed" ? 0.85 : 1),
      };
    }
    case "chart": {
      const data = source.data?.map((datum, index) => ({ ...datum, color: categoryColor(scene.theme, datum.category ?? datum.label, index) }));
      const scale = Math.min(object.size, 1.65);
      return {
        ...base,
        type: "chart",
        chart: source.chart === "donut" ? "pie" : source.chart,
        data,
        series: source.series,
        fn: source.function,
        n: source.rectangles ? RECTANGLE_COUNTS[source.rectangles] : undefined,
        xDomain: source.xDomain,
        yDomain: source.yDomain,
        axes: source.axes,
        xLabel: source.xLabel,
        yLabel: source.yLabel,
        donut: source.chart === "donut" ? 0.56 : undefined,
        w: 330 * scale,
        h: 205 * scale,
        color: style.color,
      };
    }
    case "legend":
      return { ...base, type: "legend", categories: source.categories, rowH: 22 * Math.min(object.size, 1.4) };
    case "map": {
      const scale = Math.min(object.size, 1.2);
      const stagger = resolvePace(source.stagger ?? "quick")!;
      const growth = resolvePace(source.growthPace ?? "slow")!;
      return {
        ...base,
        type: "map",
        features: source.features.map(({ id, rings }) => ({ id, rings })),
        featureColors: source.features.map((feature, index) => categoryColor(scene.theme, feature.category ?? feature.id, index)),
        markers: source.markers?.map(({ lon, lat, label, icon }) => ({ lon, lat, label, icon })),
        places: source.places,
        flows: source.flows?.map((flow, index) => {
          const pace = resolvePace(flow.pace ?? "normal")!;
          return {
            from: flow.from,
            to: flow.to,
            color: categoryColor(scene.theme, flow.category ?? `flow-${index}`, index),
            width: style.lineWidth * 1.4,
            bend: flow.bend === "left" ? -0.24 : flow.bend === "right" ? 0.24 : 0,
            at: index * pace.transition,
            dur: pace.duration,
          };
        }),
        outline: source.outline,
        grow: source.growth,
        growDur: growth.duration,
        growFill: categoryColor(scene.theme, "growth", 0),
        growStroke: style.color,
        outlineStroke: style.color,
        featureStagger: source.stagger ? stagger.transition : undefined,
        featureDur: source.stagger ? stagger.duration : undefined,
        w: 540 * scale,
        h: 290 * scale,
      };
    }
    case "timeline": {
      const scale = Math.min(object.size, 1.2);
      const animated = typeof source.playhead === "object" ? source.playhead : undefined;
      const pace = resolvePace(animated?.pace ?? "slow")!;
      return {
        ...base,
        type: "timeline",
        from: source.from,
        to: source.to,
        events: source.events?.map((event) => ({ at: event.at, label: event.label, above: event.side !== "below" })),
        eras: source.eras?.map((era, index) => ({ ...era, color: categoryColor(scene.theme, era.category ?? era.label, index) })),
        playhead: typeof source.playhead === "number" ? source.playhead : undefined,
        playheadFrom: animated?.from,
        playheadTo: animated?.to,
        playheadOver: animated ? pace.duration : undefined,
        w: 610 * scale,
        h: 112 * scale,
      };
    }
    case "table": {
      const scale = Math.min(object.size, 1.2);
      return { ...base, type: "table", rows: source.rows, header: source.header, w: 500 * scale, rowH: 32 * scale, colColor: categoryColor(scene.theme, "table-column", 0), ink: style.color };
    }
    case "group": {
      const pace = resolvePace(source.build ?? "normal")!;
      const children = source.children.map((child) => {
        const resolved = inlineObject(child);
        return compileContent(scene, resolved, { id: child.id, start: 0, dur: pace.transition, enter: { type: "fade", dur: pace.transition }, layer: resolveVisualStyle(scene.theme, child.role).layer });
      });
      return { ...base, type: "group", children, layout: source.layout, gap: 18 * Math.min(object.size, 1.3), cols: source.columns, build: source.build ? { step: pace.transition } : undefined, clip: source.clip };
    }
  }
}

function compileObject(scene: ResolvedScene, object: ResolvedObject): Component | undefined {
  const show = objectAction(scene, object, "show");
  const initiallyVisible = object.kind === "svg-part"
    ? object.svgPart?.initial === "visible" || (object.svgPart?.initial === undefined && object.source.initial === "visible")
    : object.source.initial === "visible";
  if (!initiallyVisible && !show) return undefined;
  const hide = objectAction(scene, object, "hide");
  const enter = entranceFor(object, show);
  const exit = exitFor(hide);
  const start = show?.start ?? 0;
  const style = resolveVisualStyle(scene.theme, object.source.role);
  const base = {
    id: object.id,
    at: object.position,
    start,
    dur: enter.dur,
    enter: { type: enter.type, dur: enter.dur },
    exit,
    layer: style.layer,
    fixed: object.source.space === "screen",
    motion: motionFor(scene, object),
    emphasis: emphasisFor(scene, object),
  } as const;

  return compileContent(scene, object, base);
}

function labelDirective(action: ResolvedAction, scene: ResolvedScene): Component[] {
  if (action.kind !== "label" || action.source.do !== "label") return [];
  const exitDur = Math.min(0.45, action.duration / 4);
  return [
    {
      type: "attention",
      verb: "callout",
      target: canonicalTarget(scene, action.source.target),
      text: action.source.text,
      title: action.source.title,
      container: action.source.style ?? "pill",
      start: action.start,
      dur: Math.min(0.6, action.duration / 3),
      exit: { type: "fade", out: action.end - exitDur, dur: exitDur },
      layer: "annotation",
    },
  ];
}

function seedFor(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function targetRadius(scene: ResolvedScene, target: string): number {
  const exact = scene.objects.find((candidate) => candidate.id === target);
  const id = target.includes(".") ? target.slice(0, target.indexOf(".")) : target;
  const object = exact ?? scene.objects.find((candidate) => candidate.id === id);
  return object ? Math.max(18, Math.min(150, Math.hypot(object.box.w, object.box.h) / 2)) : 36;
}

function canonicalTarget(scene: ResolvedScene, target: string): string {
  const split = target.indexOf(".");
  if (split < 1) return target;
  const object = scene.objects.find((candidate) => candidate.id === target.slice(0, split));
  return object?.source.kind === "map" ? target.slice(split + 1) : target;
}

function compileAction(action: ResolvedAction, scene: ResolvedScene): Component[] {
  if (action.kind === "camera" && action.source.do === "camera") {
    return [
      {
        type: "camera",
        to: canonicalTarget(scene, action.source.target),
        zoom: action.shot.zoom,
        kind: action.source.movement === "push" ? "pushIn" : "move",
        start: action.start,
        dur: action.duration,
      },
    ];
  }
  if (action.kind === "tour" && action.source.do === "tour") {
    const components: Component[] = [];
    action.stops.forEach((stop) => {
      components.push({ type: "camera", to: canonicalTarget(scene, stop.target), zoom: stop.shot.zoom, kind: "move", start: stop.moveStart, dur: stop.moveEnd - stop.moveStart });
      components.push({
        type: "attention",
        verb: "callout",
        target: canonicalTarget(scene, stop.target),
        text: stop.label,
        container: "pill",
        start: stop.labelStart,
        dur: Math.min(0.55, stop.labelEnd - stop.labelStart),
        exit: { type: "fade", out: stop.labelEnd, dur: stop.exitEnd - stop.labelEnd },
        layer: "annotation",
      });
    });
    if (action.returnStart !== undefined && action.returnEnd !== undefined) {
      components.push({ type: "camera", to: "center", zoom: 1, kind: "move", start: action.returnStart, dur: action.returnEnd - action.returnStart });
    }
    return components;
  }
  if (action.kind === "attention" && action.source.do === "attention") {
    const side = { auto: undefined, north: "n", south: "s", east: "e", west: "w" }[action.source.side ?? "auto"] as "n" | "s" | "e" | "w" | undefined;
    const route = { auto: undefined, straight: "straight", elbow: "elbow", curve: "curve" }[action.source.route ?? "auto"] as "straight" | "elbow" | "curve" | undefined;
    return [{
      type: "attention",
      verb: action.source.verb,
      target: canonicalTarget(scene, action.source.target),
      from: action.source.from ? canonicalTarget(scene, action.source.from) : undefined,
      text: action.source.text,
      title: action.source.title,
      side,
      route,
      container: action.source.style,
      color: categoryColor(scene.theme, `attention-${action.source.verb}`, 0),
      radius: targetRadius(scene, action.source.target),
      start: action.start,
      dur: action.duration,
      exit: { type: "fade", out: action.end, dur: Math.min(0.45, action.duration / 3) },
      layer: "annotation",
    }];
  }
  if (action.kind === "effect" && action.source.do === "effect") {
    const intensity = STRENGTH[action.source.intensity ?? "normal"];
    const seed = seedFor(`${scene.id}:${action.start}:${action.source.effect}`);
    const common = { start: action.start, dur: action.duration, exit: { type: "fade" as const, out: action.end, dur: Math.min(0.5, action.duration / 3) }, layer: "fx" as const };
    if (action.source.effect === "particles") {
      return [{ ...common, type: "particles", at: canonicalTarget(scene, action.source.target), preset: action.source.preset ?? "energy", seed, config: { count: Math.round(24 * intensity), rate: Math.round(20 * intensity) } }];
    }
    if (action.source.effect === "glow") {
      return [{ ...common, type: "glow", at: canonicalTarget(scene, action.source.target), r: targetRadius(scene, action.source.target) * intensity, color: categoryColor(scene.theme, "glow", 0) }];
    }
    return [{ ...common, type: "flow", from: canonicalTarget(scene, action.source.from), to: canonicalTarget(scene, action.source.to), rate: 18 * intensity, seed, color: categoryColor(scene.theme, "flow", 0) }];
  }
  return labelDirective(action, scene);
}

function compileScene(scene: ResolvedScene): Film {
  const marker: SceneMarker = { type: "scene", duration: scene.duration, theme: scene.theme };
  const objects = scene.objects.map((object) => compileObject(scene, object)).filter((object): object is Component => object !== undefined);
  const directives = scene.beats.flatMap((beat) => beat.actions.flatMap((action) => compileAction(action, scene)));
  return [marker, ...objects, ...directives];
}

export function compileResolvedLesson(lesson: ResolvedLesson): Film {
  return lesson.scenes.flatMap(compileScene);
}
