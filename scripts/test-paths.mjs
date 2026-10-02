import assert from "node:assert/strict";
import { createCanvas, Image, Path2D } from "@napi-rs/canvas";

import { compileLessonSpec, createFilmCompiler, renderLessonSpec } from "../packages/core/dist/index.js";

const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==";

function film(objects, beats) {
  return {
    version: "1",
    title: "path probe",
    theme: "parchment",
    scenes: [
      {
        id: "s1",
        composition: "custom-relational",
        narration: "A probe scene for the engine's exact path geometry and the things built on it.",
        objects,
        beats: beats.map((actions, index) => ({ id: `b${index}`, pace: "normal", actions })),
      },
    ],
  };
}

function compiled(spec) {
  const result = compileLessonSpec(spec);
  assert.equal(result.valid, true, result.valid ? undefined : JSON.stringify(result.errors));
  return result;
}

const diagnostics = (result) => [...(result.errors ?? []), ...(result.warnings ?? [])];
const component = (result, id) => result.gcl.find((item) => item.id === id);
const resolvedObject = (result, id) => result.resolved.scenes[0].objects.find((object) => object.id === id);
const circle = (id, zone) => ({ id, kind: "shape", shape: "circle", appearance: "outline", size: "small", placement: { mode: "zone", zone } });

const leaf = compiled(
  film(
    [{ id: "leaf", kind: "path", d: "M500 40 C850 250 850 750 500 960 C150 750 150 250 500 40 Z", fill: "accent", stroke: "ink", placement: { mode: "zone", zone: "main" } }],
    [[{ do: "show", targets: ["leaf"] }]],
  ),
);
const leafShape = component(leaf, "leaf");
assert.equal(leafShape.shape, "path");
assert.equal(leafShape.smooth, false, "an authored path is drawn from its exact points, never re-smoothed");
assert.equal(leafShape.closed, true, "a Z-closed path is a closed, fillable piece");
assert.ok(typeof leafShape.fill === "string", "fill takes the theme colour its role names");
const leafBox = resolvedObject(leaf, "leaf").box;
const xs = leafShape.points.map(([x]) => x);
const ys = leafShape.points.map(([, y]) => y);
assert.ok(Math.min(...xs) >= leafBox.x - 0.5 && Math.max(...xs) <= leafBox.x + leafBox.w + 0.5, "the path fits inside its own box");
assert.ok(Math.min(...ys) >= leafBox.y - 0.5 && Math.max(...ys) <= leafBox.y + leafBox.h + 0.5, "the path fits inside its own box");

const between = compiled(
  film(
    [circle("a", "main-left"), circle("b", "main-right"), { id: "flow", kind: "path", from: "a", to: "b", d: "M0 0 C300 -250 700 -250 1000 0", arrow: "end" }],
    [[{ do: "show", targets: ["a", "b"] }], [{ do: "show", targets: ["flow"], entrance: "draw" }]],
  ),
);
const flow = component(between, "flow");
assert.deepEqual(flow.ends, ["a", "b"], "a path between two things is pinned to both, so it re-aims as they move");
assert.equal(flow.arrow, "end");
const ends = resolvedObject(between, "flow").endpoints;
const [first, last] = [flow.points[0], flow.points.at(-1)];
assert.ok(Math.hypot(first[0] - ends.from[0], first[1] - ends.from[1]) < 0.01 && Math.hypot(last[0] - ends.to[0], last[1] - ends.to[1]) < 0.01, "(0,0) lands on from and (1000,0) on to");
assert.ok(Math.min(...flow.points.map(([, y]) => y)) < Math.min(ends.from[1], ends.to[1]) - 20, "negative y bows to the left of travel — up, for a left-to-right path");

const bad = compileLessonSpec(film([{ id: "p", kind: "path", d: "M0 0 C 100 200 300 400", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["p"] }]]));
assert.ok(diagnostics(bad).some((item) => /Path command 2 'C'/.test(item.message ?? "")), "a broken path names the command at fault");
assert.equal(compiled(film([{ id: "p", kind: "path", d: "M100 500a400 400 0 01 800 0", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["p"] }]])).valid, true, "packed arc flags parse");

const lines = compiled(
  film(
    [circle("a", "main-left"), circle("c", "footer"), circle("b", "main-right"), { id: "elbow", kind: "line", from: "a", to: "c", form: "elbow" }, { id: "bow", kind: "line", from: "a", to: "b", form: "curved" }],
    [[{ do: "show", targets: ["a", "b", "c"] }], [{ do: "show", targets: ["elbow", "bow"] }]],
  ),
);
const elbow = component(lines, "elbow");
assert.equal(elbow.points.length, 3, "an elbow is exactly two straight legs");
assert.equal(elbow.smooth, false, "so its corner is a real corner");
assert.equal(elbow.points[1][0], elbow.points[0][0]);
assert.equal(elbow.points[1][1], elbow.points[2][1]);
const bow = component(lines, "bow");
const [p0, p1] = [bow.points[0], bow.points.at(-1)];
const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
const bulge = Math.max(...bow.points.map(([x, y]) => Math.abs((p1[0] - p0[0]) * (p0[1] - y) - (p0[0] - x) * (p1[1] - p0[1])) / chord));
assert.ok(Math.abs(bulge / chord - 0.18) < 0.005, `a curved line bows 0.18 of its length by default (got ${(bulge / chord).toFixed(3)})`);

const walked = compiled(
  film(
    [circle("a", "main-left"), circle("b", "main-right"), { id: "route", kind: "line", from: "a", to: "b", form: "curved", bend: 0.3 }, { id: "rider", kind: "shape", shape: "star", size: "tiny", placement: { mode: "relative", target: "a", relation: "near" } }],
    [[{ do: "show", targets: ["a", "b", "route", "rider"] }], [{ do: "motion", target: "rider", motion: "along", along: "route", face: "path" }]],
  ),
);
const along = component(walked, "rider").motions.find((motion) => motion.kind === "along");
const drawn = component(walked, "route").points;
const onDrawn = (point) => Math.min(...drawn.map(([x, y]) => Math.hypot(point[0] - x, point[1] - y)));
assert.ok(along.path.slice(1).every((point) => onDrawn(point) < 0.5), "a traveller walks exactly the line that is drawn");
assert.equal(along.face, true, "face: path turns the traveller with the route");

const sun = {
  id: "sun",
  kind: "image",
  src: PNG_1x1,
  aspect: 1,
  size: "large",
  placement: { mode: "zone", zone: "main" },
  hotspots: { core: [0.02, 0.05, 0.2, 0.2], rim: [0.6, 0.6, 0.3, 0.3] },
  outlines: { core: [[0.02, 0.05], [0.22, 0.05], [0.22, 0.25], [0.02, 0.25]] },
};
const parts = compiled(
  film(
    [sun, { id: "cap", kind: "text", text: "the core", role: "annotation", placement: { mode: "relative", target: "sun.core", relation: "below" } }],
    [[{ do: "show", targets: ["sun", "cap"] }], [{ do: "attention", target: "sun.core", verb: "outline" }, { do: "fill", target: "sun.core", to: "half", color: "danger" }]],
  ),
);
const core = resolvedObject(parts, "sun.core");
const caption = resolvedObject(parts, "cap");
assert.ok(Math.abs(caption.position[0] - (core.box.x + core.box.w / 2)) < 40 && caption.position[1] > core.box.y + core.box.h, "text placed next to a picture part lands next to that part, not the whole picture");
assert.ok(component(parts, "sun.core").outline?.length === 4, "a part with an outline carries its exact shape");
assert.ok(component(parts, "sun.core").fillLevel?.length === 1, "a fill aimed at an outlined part tints inside it");
assert.ok(parts.gcl.some((item) => item.type === "attention" && item.verb === "outline" && item.outline?.length === 4), "outline attention traces the part's shape");
const unoutlined = compileLessonSpec(film([sun], [[{ do: "show", targets: ["sun"] }], [{ do: "fill", target: "sun.rim", to: "half" }]]));
assert.ok(diagnostics(unoutlined).some((item) => /hotspot/.test(item.message ?? "")), "a part without an outline cannot be filled");

const figure = { id: "figure", kind: "image", src: PNG_1x1, aspect: 0.46, size: "hero", placement: { mode: "zone", zone: "main" } };
const standing = resolvedObject(compiled(film([figure], [[{ do: "show", targets: ["figure"] }]])), "figure");
assert.ok(standing.box.h > 960 * 0.55, `a tall picture at hero takes most of the portrait height, got ${standing.box.h}`);

const plain = ({ hotspots, outlines, ...picture }) => picture;
const turns = compiled(
  film(
    [plain(sun), figure],
    [[{ do: "show", targets: ["sun"] }], [{ do: "hide", targets: ["sun"] }, { do: "show", targets: ["figure"] }]],
  ),
);
const [before, after] = ["sun", "figure"].map((id) => resolvedObject(turns, id).position);
assert.ok(Math.hypot(before[0] - after[0], before[1] - after[1]) < 1, "two pictures that take turns share one place instead of splitting it");

const lungs = { ...plain(sun), id: "lungs", hotspots: { left: [0.3, 0.3, 0.4, 0.2], vein: [0.35, 0.33, 0.3, 0.1] } };
const tagged = compiled(
  film(
    [
      lungs,
      { id: "out", kind: "text", text: "CO2 out", role: "annotation", placement: { mode: "relative", target: "lungs.left", relation: "right-of" } },
      { id: "rich", kind: "text", text: "O2-rich", role: "annotation", placement: { mode: "relative", target: "lungs.vein", relation: "right-of" } },
    ],
    [[{ do: "show", targets: ["lungs", "out", "rich"] }]],
  ),
);
const [outBox, richBox] = ["out", "rich"].map((id) => resolvedObject(tagged, id).box);
const crossing = Math.min(outBox.x + outBox.w, richBox.x + richBox.w) - Math.max(outBox.x, richBox.x) > 1 && Math.min(outBox.y + outBox.h, richBox.y + richBox.h) - Math.max(outBox.y, richBox.y) > 1;
assert.ok(!crossing, "two labels pinned to neighbouring parts do not print over each other");

const routed = compiled(
  film(
    [
      circle("a", "main-left"),
      circle("b", "support"),
      { id: "route", kind: "path", from: "a", to: "b", d: "M0 0 C300 -250 700 -250 1000 0", arrow: "end" },
      { id: "note", kind: "text", text: "from air", role: "annotation", size: "tag", placement: { mode: "relative", target: "route", relation: "above" } },
    ],
    [[{ do: "show", targets: ["a", "b", "route", "note"] }]],
  ),
);
const note = resolvedObject(routed, "note");
const routeDrawn = component(routed, "route").points;
const routeMiddle = routeDrawn[Math.floor(routeDrawn.length / 2)];
const onRoute = routeDrawn.some(([x, y]) => x > note.box.x && x < note.box.x + note.box.w && y > note.box.y && y < note.box.y + note.box.h);
// Measured from the caption's nearest edge, so how near it sits does not hang on how large a tag is written.
const noteGap = Math.hypot(Math.max(note.box.x - routeMiddle[0], 0, routeMiddle[0] - note.box.x - note.box.w), Math.max(note.box.y - routeMiddle[1], 0, routeMiddle[1] - note.box.y - note.box.h));
assert.ok(!onRoute && note.position[1] < routeMiddle[1] && noteGap < 40, "a caption set above a route sits just off its middle on the side facing up, not where the route was before it was aimed");

const footed = compiled(
  film(
    [
      { id: "disc", kind: "shape", shape: "circle", size: "small", placement: { mode: "zone", zone: "footer" } },
      { id: "under", kind: "text", text: "a caption under the disc", role: "annotation", placement: { mode: "relative", target: "disc", relation: "below" } },
      { id: "foot", kind: "text", text: "a caption in the footer", role: "annotation", placement: { mode: "zone", zone: "footer" } },
    ],
    [[{ do: "show", targets: ["disc", "under", "foot"] }]],
  ),
);
const [under, foot] = ["under", "foot"].map((id) => resolvedObject(footed, id).box);
const shared = Math.max(0, Math.min(under.x + under.w, foot.x + foot.w) - Math.max(under.x, foot.x)) * Math.max(0, Math.min(under.y + under.h, foot.y + foot.h) - Math.max(under.y, foot.y));
const printedOver = shared > 0.12 * Math.min(under.w * under.h, foot.w * foot.h);
assert.ok(!printedOver, "a caption pinned to something never prints over a caption in a zone");

const stacked = compiled(
  film(
    [
      { id: "plant", kind: "image", src: PNG_1x1, aspect: 0.67, size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "sun", kind: "image", src: PNG_1x1, aspect: 1, size: "medium", placement: { mode: "relative", target: "plant", relation: "above" } },
    ],
    [[{ do: "show", targets: ["plant", "sun"] }]],
  ),
);
const [plant, sunAbove] = ["plant", "sun"].map((id) => resolvedObject(stacked, id).box);
assert.ok(sunAbove.y >= 0 && sunAbove.y + sunAbove.h <= plant.y && plant.y + plant.h <= 960, "two stacked pictures fit the height of the screen without touching");

const sideBySide = compiled(
  film(
    [
      { id: "earth", kind: "image", src: PNG_1x1, aspect: 1, size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "sun", kind: "image", src: PNG_1x1, aspect: 1, size: "large", placement: { mode: "relative", target: "earth", relation: "left-of" } },
    ],
    [[{ do: "show", targets: ["earth", "sun"] }]],
  ),
);
const [earthBox, sunBox] = ["earth", "sun"].map((id) => resolvedObject(sideBySide, id).box);
assert.ok(sunBox.x >= 0 && sunBox.x + sunBox.w <= earthBox.x && earthBox.x + earthBox.w <= 540, "two pictures side by side fit the width of the screen without touching");

const pushed = compiled(
  film(
    [{ id: "cart", kind: "image", src: PNG_1x1, aspect: 1, size: "large", placement: { mode: "zone", zone: "main" } }],
    [[{ do: "show", targets: ["cart"] }], [{ do: "motion", target: "cart", motion: "move", to: "main-right" }]],
  ),
);
const cartBox = resolvedObject(pushed, "cart").box;
const [arrivedX] = component(pushed, "cart").motions[0].to;
assert.ok(arrivedX + cartBox.w / 2 <= 540 && arrivedX - cartBox.w / 2 >= 0, `a moved picture arrives wholly on screen, got a centre at ${arrivedX}`);

const swinging = compiled(
  film(
    [
      { id: "pendulum", kind: "image", src: PNG_1x1, aspect: 0.5, size: "medium", placement: { mode: "zone", zone: "main" }, hotspots: { pivot: [0.45, 0, 0.1, 0.04], bob: [0.3, 0.8, 0.4, 0.2] } },
      { id: "swing-arc", kind: "curve", x: "sin(u)", y: "-cos(u)", domain: [-0.52, 0.52], placement: { mode: "anchor", target: "pendulum.pivot" } },
    ],
    [[{ do: "show", targets: ["pendulum", "swing-arc"] }], [{ do: "motion", target: "pendulum", motion: "spin", about: "pendulum.pivot", sweep: 60, repeat: "there-and-back" }]],
  ),
);
const bob = resolvedObject(swinging, "pendulum.bob").position;
const arc = component(swinging, "swing-arc").points;
const lowest = arc.reduce((best, point) => (point[1] > best[1] ? point : best));
assert.ok(Math.hypot(lowest[0] - bob[0], lowest[1] - bob[1]) < 3, `a swing arc anchored on the pivot passes through the bob, got ${lowest} vs ${bob}`);

const risen = compiled(film([{ id: "peaks", kind: "image", src: PNG_1x1, aspect: 1.3, size: "large", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["peaks"], entrance: "rise" }]]));
assert.deepEqual([component(risen, "peaks").enter.type, component(risen, "peaks").enter.dir], ["wipe", "up"], "a rise is revealed from its base upward");

const morphs = compiled(
  film(
    [{ id: "flap", kind: "path", d: "M100 900 L500 100 L900 900 Z", fill: "accent", placement: { mode: "zone", zone: "main" } }, { id: "dot", kind: "shape", shape: "circle", placement: { mode: "zone", zone: "footer" } }],
    [[{ do: "show", targets: ["flap", "dot"] }], [{ do: "motion", target: "flap", motion: "morph", d: "M100 900 L500 700 L900 900 Z" }, { do: "motion", target: "dot", motion: "morph", shape: "star" }]],
  ),
);
const flapMorph = component(morphs, "flap").motions.find((motion) => motion.kind === "morph");
assert.ok(flapMorph.toPoints?.length > 2, "a path morphs into the points of its new d");
const flapTop = Math.min(...component(morphs, "flap").points.map(([, y]) => y));
assert.ok(Math.min(...flapMorph.toPoints.map(([, y]) => y)) > flapTop + 50, "the new d is laid in the same frame, so a flatter flap sits lower");
assert.equal(component(morphs, "dot").motions.find((motion) => motion.kind === "morph").toShape, "star");
const wrongMorph = compileLessonSpec(film([sun], [[{ do: "show", targets: ["sun"] }], [{ do: "motion", target: "sun", motion: "morph", shape: "star" }]]));
assert.ok(diagnostics(wrongMorph).some((item) => /morph/i.test(item.message ?? "")), "a picture does not morph");

// A triangle moved to a new corner of the Pythagoras square must travel whole, never fold into slivers.
// Shapes are painted on offscreen layers, so every layer's context records the outlines it fills.
let recording = null;
let writing = null;
const recorded = (ctx) => {
  let path = [];
  return new Proxy(ctx, {
    get(target, key) {
      if (key === "beginPath") return () => ((path = []), target.beginPath());
      if (key === "moveTo" || key === "lineTo")
        return (x, y) => {
          const { a, b, c, d, e, f } = target.getTransform();
          path.push([a * x + c * y + e, b * x + d * y + f]);
          return target[key](x, y);
        };
      if (key === "fill") return (...args) => (recording?.push(path), target.fill(...args));
      if (key === "fillText")
        return (text, x, y, ...rest) => {
          const { a, b, c, d, e, f } = target.getTransform();
          writing?.push({ text, at: [a * x + c * y + e, b * x + d * y + f] });
          return target.fillText(text, x, y, ...rest);
        };
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
    set: (target, key, value) => ((target[key] = value), true),
  });
};
const onLayers = (draw) => {
  const before = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const canvas = createCanvas(300, 150);
      const context = recorded(canvas.getContext("2d"));
      canvas.getContext = () => context;
      return canvas;
    },
  };
  try {
    return draw();
  } finally {
    globalThis.document = before;
  }
};
const renderedValid = (spec) => {
  const rendered = renderLessonSpec(spec);
  assert.equal(rendered.valid, true, rendered.valid ? undefined : JSON.stringify(rendered.errors));
  return rendered;
};
const filledPaths = (spec, id, fractions) => {
  const rendered = renderedValid(spec);
  const { at, dur } = component(rendered, id).motions.find((motion) => motion.kind === "morph");
  return onLayers(() =>
    fractions.map((fraction) => {
      recording = [];
      rendered.slide.render(recorded(createCanvas(540, 960).getContext("2d")), at + dur * fraction);
      const shape = recording.filter((one) => one.length >= 3).at(-1);
      recording = null;
      return shape;
    }),
  );
};
const crossesItself = (shape) => {
  const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const edges = shape.map((point, i) => [point, shape[(i + 1) % shape.length]]);
  return edges.some(([p, q], i) => edges.some(([r, t], j) => j > i + 1 && !(i === 0 && j === edges.length - 1) && side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0));
};
const sidesOf = (shape) => shape.map((point, i) => Math.hypot(shape[(i + 1) % shape.length][0] - point[0], shape[(i + 1) % shape.length][1] - point[1])).sort((x, y) => x - y);
const moved = (d) => film([{ id: "tri", kind: "path", d: "M280 340 L400 340 L280 500 Z", stroke: "ink", fill: "muted", size: "large", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["tri"] }], [{ do: "motion", target: "tri", motion: "morph", d }]]);
const midway = [0.2, 0.35, 0.5, 0.65, 0.8];
for (const shape of filledPaths(moved("M280 460 L280 620 L400 620 Z"), "tri", midway)) {
  assert.equal(shape.length, 3, "a triangle morphing into its mirror image stays a triangle, corner for corner");
  assert.ok(!crossesItself(shape), "a mirrored triangle turns over cleanly instead of folding into slivers");
}
for (const shape of filledPaths(moved("M560 340 L560 460 L400 340 Z"), "tri", midway)) {
  const [short, mid, long] = sidesOf(shape);
  assert.ok(Math.abs(mid / short - 4 / 3) < 0.02 && Math.abs(long / short - 5 / 3) < 0.02, `a turned copy of a triangle moves rigidly (sides ${short.toFixed(1)}, ${mid.toFixed(1)}, ${long.toFixed(1)})`);
}
const [reshaped] = filledPaths(moved("M280 340 L520 340 L280 420 Z"), "tri", [0.5]);
assert.ok(!crossesItself(reshaped) && reshaped.length === 3, "a triangle that changes shape blends corner to corner");

// A part's name is written on it when it fits, else right beside it: never a limb away, as it was when set
// at a fixed reach from the part's centre.
// Measured from the middle of the writing, a name set right beside a part is half its own width plus the gap away.
const writtenAt = (spec, text) => {
  const rendered = renderedValid(spec);
  const action = rendered.resolved.scenes[0].beats.flatMap((beat) => beat.actions).find((one) => one.source.do === "label" && one.source.text === text);
  return onLayers(() => {
    writing = [];
    rendered.slide.render(recorded(createCanvas(540, 960).getContext("2d")), action.end - 0.2);
    const found = writing.filter((one) => one.text === text).at(-1)?.at;
    writing = null;
    return { found, rendered };
  });
};
const reachOf = ([x, y], { x: bx, y: by, w, h }) => Math.hypot(Math.max(bx - x, 0, x - bx - w), Math.max(by - y, 0, y - by - h));
const body = { ...figure, id: "body", hotspots: { heart: [0.45, 0.26, 0.13, 0.09], "left-lung": [0.52, 0.24, 0.15, 0.13], "right-lung": [0.33, 0.24, 0.16, 0.13] } };
const chest = film([body], [[{ do: "show", targets: ["body"] }], [{ do: "label", target: "body.heart", text: "heart", style: "text" }], [{ do: "label", target: "body.left-lung", text: "lungs", style: "text" }]]);
for (const [text, part] of [["heart", "body.heart"], ["lungs", "body.left-lung"]]) {
  const { found, rendered } = writtenAt(chest, text);
  const box = resolvedObject(rendered, part).box;
  assert.ok(found && reachOf(found, box) < 60, `a part's label sits right beside its part (${text} ${found && Math.round(reachOf(found, box))} away)`);
}
const squared = writtenAt(film([{ id: "square", kind: "path", d: "M100 100 L900 100 L900 900 L100 900 Z", stroke: "ink", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["square"] }], [{ do: "label", target: "square", text: "c²", style: "text" }]]), "c²");
assert.equal(reachOf(squared.found, resolvedObject(squared.rendered, "square").box), 0, "a closed figure's name is written inside it");

const motions = compiled(
  film(
    [circle("a", "main-left"), circle("b", "support"), circle("c", "main-right"), { id: "r", kind: "shape", shape: "star", size: "tiny", placement: { mode: "zone", zone: "footer" } }, { id: "moon", kind: "shape", shape: "circle", size: "tiny", placement: { mode: "relative", target: "c", relation: "below" } }],
    [
      [{ do: "show", targets: ["a", "b", "c", "r", "moon"] }],
      [{ do: "motion", target: "r", motion: "along", through: ["a", "b", "c"] }, { do: "motion", target: "moon", motion: "orbit", around: "c", ratio: 0.4 }],
      [{ do: "camera", target: "b", shot: "close", movement: "arc" }],
    ],
  ),
);
const through = component(motions, "r").motions.find((motion) => motion.kind === "along");
for (const id of ["a", "b", "c"]) {
  const [x, y] = resolvedObject(motions, id).position;
  assert.ok(Math.min(...through.path.map(([px, py]) => Math.hypot(px - x, py - y))) < 1, `a through route passes through '${id}'`);
}
const orbit = component(motions, "moon").motions.find((motion) => motion.kind === "orbit");
assert.ok(Math.abs(orbit.ry / orbit.rx - 0.4) < 1e-9, "ratio flattens the orbit into an ellipse");
const centre = resolvedObject(motions, "c").position;
const moon = resolvedObject(motions, "moon").position;
const start = [centre[0] + orbit.rx * Math.cos(orbit.from), centre[1] + orbit.ry * Math.sin(orbit.from)];
assert.ok(Math.hypot(start[0] - moon[0], start[1] - moon[1]) < 0.5, "the ellipse passes through where the orbiter rests, so nothing jumps");
assert.ok(motions.gcl.some((item) => item.type === "camera" && item.kind === "arc"), "movement arc reaches the camera");

const drawing = compiled(
  film(
    [{ id: "art", kind: "svg-artwork", size: "large", placement: { mode: "zone", zone: "main" }, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g id="ring"><circle cx="100" cy="100" r="80" fill="#f3c969"/></g><g id="cross"><path d="M40 100 L160 100 M100 40 L100 160" stroke="#000" fill="none"/></g></svg>' }],
    [[{ do: "show", targets: ["art"], entrance: "draw" }]],
  ),
);
assert.ok(drawing.gcl.find((item) => item.id === "art.ring")?.strokes?.length === 1, "an svg part draws its outline on");
assert.ok(drawing.gcl.find((item) => item.id === "art.cross")?.strokes?.length === 2, "each sub-path is its own stroke");

const escaped = compiled(
  film(
    [{ id: "rate", kind: "equation", value: "10\\% \\times \\text{₹}1{,}100 = \\{110\\}", placement: { mode: "zone", zone: "main" } }],
    [[{ do: "show", targets: ["rate"] }]],
  ),
);
assert.ok(resolvedObject(escaped, "rate"), "an escaped percent sign or brace is written, not refused");

const queue = compiled(
  film(
    [
      circle("map", "main"),
      ...["first", "second", "third"].map((id) => ({ id, kind: "text", text: `the ${id} caption under the map`, role: "annotation", placement: { mode: "relative", target: "map", relation: "below" } })),
    ],
    [[{ do: "show", targets: ["map", "first", "second", "third"] }]],
  ),
);
const queued = ["first", "second", "third"].map((id) => resolvedObject(queue, id).box);
for (const [upper, lower] of [[queued[0], queued[1]], [queued[1], queued[2]]]) {
  assert.ok(upper.y + upper.h <= lower.y + 1, "captions set below one thing line up in the order written, none over another");
}

const footer = compiled(
  film(
    [
      { id: "coins", kind: "image", src: PNG_1x1, aspect: 0.8, size: "fill", placement: { mode: "zone", zone: "main" } },
      ...["one", "two", "three"].map((id) => ({ id, kind: "text", text: `footer line ${id}`, role: "annotation", placement: { mode: "zone", zone: "footer" } })),
    ],
    [[{ do: "show", targets: ["coins", "one", "two", "three"] }]],
  ),
);
const footerLines = ["one", "two", "three"].map((id) => resolvedObject(footer, id).box);
for (const [upper, lower] of [[footerLines[0], footerLines[1]], [footerLines[1], footerLines[2]]]) {
  assert.ok(upper.y + upper.h <= lower.y + 1, "footer lines that run past the bottom rise together, never onto each other");
}

const cornered = compiled(
  film(
    [
      { id: "tri", kind: "path", d: "M200 100 L900 800 L100 800 Z", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "top", kind: "angle", at: "tri.v0", from: "tri.v1", to: "tri.v2" },
    ],
    [[{ do: "show", targets: ["tri", "top"] }]],
  ),
);
const triangle = resolvedObject(cornered, "tri").box;
const apex = resolvedObject(cornered, "top");
assert.ok(Math.abs(apex.position[1] - triangle.y) < 1, "a figure's corner v0 is the first point its path passes through");
assert.ok(Math.hypot(apex.endpoints.to[0] - triangle.x, apex.endpoints.to[1] - (triangle.y + triangle.h)) < 1, "an angle's arms run to the figure's other corners");

const column = compiled(
  film(
    [
      circle("stage", "main"),
      { id: "c0", kind: "text", text: "Reign of Terror", role: "annotation", placement: { mode: "zone", zone: "footer" } },
      ...["c1", "c2", "c3"].map((id, index) => ({ id, kind: "text", text: `line ${id}`, role: "annotation", placement: { mode: "relative", target: `c${index}`, relation: "below" } })),
    ],
    [[{ do: "show", targets: ["stage", "c0", "c1", "c2", "c3"] }]],
  ),
);
const hung = ["c0", "c1", "c2", "c3"].map((id) => resolvedObject(column, id).box);
for (let index = 1; index < hung.length; index++) {
  assert.ok(hung[index - 1].y + hung[index - 1].h <= hung[index].y + 1, "a column of writing hung below a footer line rises as one, no line over another");
}

const figureTargets = compiled(
  film(
    [
      { id: "tri", kind: "path", d: "M200 100 L900 800 L100 800 Z", stroke: "ink", placement: { mode: "zone", zone: "main" } },
      { id: "dot", kind: "shape", shape: "disc", size: "tiny", placement: { mode: "zone", zone: "footer" } },
      { id: "sum", kind: "equation", value: "a + b + c = 180^\\circ", placement: { mode: "zone", zone: "support" } },
    ],
    [
      [{ do: "show", targets: ["tri", "dot", "sum"] }],
      [{ do: "attention", target: "tri.v1", verb: "encircle" }, { do: "motion", target: "dot", motion: "move", to: "tri.v0" }],
    ],
  ),
);
assert.ok(figureTargets.gcl.some((item) => item.type === "attention"), "a figure's corner is a target for attention and motion");

const built = compiled(
  film(
    [
      { id: "tri", kind: "path", d: "M300 300 L300 600 L700 600 Z", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "square", kind: "path", in: "tri", d: "M300 600 L700 600 L700 1000 L300 1000 Z", stroke: "accent" },
      { id: "area", kind: "text", text: "16", role: "annotation", placement: { mode: "relative", target: "square", relation: "below" } },
      { id: "corner", kind: "angle", at: "tri.v1", from: "tri.v0", to: "tri.v2" },
    ],
    [[{ do: "show", targets: ["tri", "corner"] }], [{ do: "show", targets: ["square", "area"] }, { do: "attention", target: "square.v2", verb: "encircle" }]],
  ),
);
const triBox = resolvedObject(built, "tri").box;
const squareBox = resolvedObject(built, "square").box;
assert.ok(Math.abs(squareBox.y - (triBox.y + triBox.h)) < 1, "a piece drawn on a figure's grid starts exactly where the figure's side is");
assert.ok(Math.abs(squareBox.x - triBox.x) < 1 && Math.abs(squareBox.w - squareBox.h) < 1, "the square on the side is as wide as the side, and square");
assert.ok(resolvedObject(built, "area").box.y >= squareBox.y + squareBox.h, "a caption below a piece sits below where the piece is drawn");

const forgiving = compiled(
  film(
    [
      { id: "note", kind: "text", text: "a caption", textRole: "annotation", placement: { mode: "zone", zone: "main" } },
      { id: "arrowless", kind: "path", d: "M0 0 L1000 0", arrow: "none", placement: { mode: "zone", zone: "footer" } },
      { id: "rule", kind: "equation", value: "a \\foo b", placement: { mode: "zone", zone: "support" } },
      { id: "on-rule", kind: "text", text: "the rule", placement: { mode: "relative", target: "rule", relation: "above" } },
    ],
    [[{ do: "show", targets: ["note", "arrowless", "rule", "on-rule"] }], [{ do: "attention", target: "note", verb: "pulse" }]],
  ),
);
const kept = forgiving.resolved.scenes[0].objects.map((object) => object.id);
assert.ok(kept.includes("note") && kept.includes("arrowless"), "a word outside a field's list costs that field, never the object");
assert.ok(!kept.includes("rule") && !kept.includes("on-rule"), "an object with a fault of its own leaves with what hangs on it, and the scene plays");
const intent = compiled(
  film(
    [
      { id: "dates", kind: "timeline", from: 1914, to: 1914, events: [{ at: 1914.5, label: "war" }], playhead: { from: 1914.5, to: 1914 }, placement: { mode: "zone", zone: "main" } },
      { id: "grid", kind: "table", rows: [["a", "b"], ["1", "2", "3"]], placement: { mode: "zone", zone: "footer" } },
    ],
    [[{ do: "show", targets: ["dates", "grid"] }]],
  ),
);
const read = (id) => resolvedObject(intent, id).source;
assert.ok(read("dates").from === 1914 && read("dates").to === 1914.5 && read("dates").playhead.from === 1914.5 && read("dates").playhead.to === 1914, "a timeline spans the dates it marks, and a playhead going back in time keeps its direction");
assert.deepEqual(read("grid").rows[0], ["a", "b", ""], "a table's short row ends in an empty cell");
const digitBeat = film([circle("c", "main")], [[{ do: "show", targets: ["c"] }]]);
digitBeat.scenes[0].beats[0].id = "1951-value";
compiled(digitBeat);

const market = compiled(
  film(
    [{ id: "market", kind: "chart", chart: "line", series: [[[1, 9], [5, 5], [9, 1]], [[9, 9], [1, 1], [5, 5]]], names: ["demand", "supply"], xLabel: "quantity", yLabel: "price", placement: { mode: "zone", zone: "main" } }],
    [[{ do: "show", targets: ["market"], entrance: "draw" }]],
  ),
);
const marketChart = component(market, "market");
assert.equal(marketChart.series.length, 2, "a chart draws every line it is given on one pair of axes");
assert.deepEqual(marketChart.series[1].map(([x]) => x), [1, 5, 9], "a line chart reads left to right, however its points were listed");

const wordy = compiled(
  film(
    [
      { id: "short", kind: "text", text: "Reign of Terror", placement: { mode: "zone", zone: "footer" } },
      { id: "long", kind: "text", text: "Revolutionary authorities executed many accused opponents of the revolution in Paris", placement: { mode: "zone", zone: "footer" } },
    ],
    [[{ do: "show", targets: ["short", "long"], entrance: "word-by-word" }]],
  ),
);
const longText = component(wordy, "long");
assert.equal(longText.size, component(wordy, "short").size, "long writing keeps the size of short writing");
assert.ok(longText.text.split("\n").length >= 2 && resolvedObject(wordy, "long").box.w <= 524, "long writing breaks into lines that fit the screen");

const settled = compiled(
  film(
    [circle("first", "main"), { ...circle("second", "footer"), initial: "visible" }],
    [
      [{ do: "hide", targets: ["first"] }, { do: "show", targets: ["first", "second"] }],
      [{ do: "show", targets: ["first"] }, { do: "hide", targets: ["second"] }],
      [{ do: "hide", targets: ["second"] }],
    ],
  ),
);
assert.equal(settled.resolved.scenes[0].objects.length, 2, "a show or hide that changes nothing is removed, never the scene");

const categories = compiled(
  film(
    [{ id: "growth", kind: "chart", chart: "line", data: [{ label: "Year 0", value: 1000 }, { label: "Year 1", value: 1100 }], placement: { mode: "zone", zone: "main" } }],
    [[{ do: "show", targets: ["growth"] }]],
  ),
);
assert.equal(component(categories, "growth").chart, "bar", "a line chart given labelled values draws them as bars");
const flash = compiled(
  film([circle("packet", "main")], [[{ do: "show", targets: ["packet"] }, { do: "hide", targets: ["packet"] }], [{ do: "motion", target: "packet", motion: "move", to: "footer" }]]),
);
assert.ok(flash.gcl.some((item) => item.id === "packet"), "a hide in the beat that shows the thing changes nothing");

const onOneSpot = compiled(
  film(
    [circle("sun", "main"), ...["mercury", "venus", "earth"].map((id) => ({ id, kind: "text", text: id, role: "annotation", placement: { mode: "anchor", target: "sun" } }))],
    [[{ do: "show", targets: ["sun", "mercury", "venus", "earth"] }]],
  ),
);
const spot = ["mercury", "venus", "earth"].map((id) => resolvedObject(onOneSpot, id).box);
assert.ok(spot[0].y + spot[0].h <= spot[1].y + 1 && spot[1].y + spot[1].h <= spot[2].y + 1, "writing set on one spot lines up under it, none over another");

const marked = compiled(
  film(
    [
      { id: "pizza", kind: "image", src: PNG_1x1, aspect: 1, size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "slice", kind: "path", in: "pizza", d: "M500 500 L1000 500 A500 500 0 0 0 500 0 Z", fill: "accent" },
      { id: "page-note", kind: "text", text: "A school garden helps students learn about plants and bees", placement: { mode: "anchor", target: "pizza" } },
    ],
    [[{ do: "show", targets: ["pizza", "slice", "page-note"] }]],
  ),
);
const pizzaBox = resolvedObject(marked, "pizza").box;
const sliceBox = resolvedObject(marked, "slice").box;
assert.ok(Math.abs(sliceBox.x - (pizzaBox.x + pizzaBox.w / 2)) < 1 && Math.abs(sliceBox.y - pizzaBox.y) < 1 && Math.abs(sliceBox.w - pizzaBox.w / 2) < 1, "a path framed on a picture is drawn in the picture's own coordinates");
assert.ok(resolvedObject(marked, "page-note").box.w <= pizzaBox.w + 1, "writing set on a picture breaks at the picture's width");

const sheet = compiled(
  film(
    [
      { id: "shape", kind: "path", d: "M500 200 L800 800 L200 800 Z", stroke: "ink", placement: { mode: "zone", zone: "main" } },
      { id: "through-top", kind: "path", d: "M100 200 L900 200", stroke: "accent", placement: { mode: "zone", zone: "main" } },
    ],
    [[{ do: "show", targets: ["shape", "through-top"] }]],
  ),
);
const shapeBox = resolvedObject(sheet, "shape").box;
const topLine = resolvedObject(sheet, "through-top").box;
assert.ok(Math.abs(topLine.y - shapeBox.y) < 1 && topLine.w > shapeBox.w, "paths written into one zone are one drawing: the line runs through the apex, wider than the triangle");

const pair = compiled(
  film(
    [
      { id: "upper", kind: "image", src: PNG_1x1, aspect: 0.6, size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "lower", kind: "image", src: PNG_1x1, aspect: 0.6, size: "large", placement: { mode: "relative", target: "upper", relation: "below" } },
      { id: "dated", kind: "text", text: "23 July 1914", placement: { mode: "zone", zone: "footer" } },
    ],
    [[{ do: "show", targets: ["upper", "lower", "dated"] }]],
  ),
);
const lowerBox = resolvedObject(pair, "lower").box;
assert.ok(lowerBox.y + lowerBox.h <= resolvedObject(pair, "dated").box.y, "two stacked pictures end above the writing set beneath them");

const arrows = compiled(
  film(
    [
      circle("west", "main-left"),
      circle("east", "main-right"),
      ...["first", "second", "third"].flatMap((id) => [
        { id: `${id}-route`, kind: "path", from: "west", to: "east", d: "M0 0 L1000 0", arrow: "end" },
        { id: `${id}-caption`, kind: "text", text: `${id} arrow caption`, role: "annotation", placement: { mode: "relative", target: `${id}-route`, relation: "near" } },
      ]),
    ],
    [[{ do: "show", targets: ["west", "east", "first-route", "first-caption", "second-route", "second-caption", "third-route", "third-caption"] }]],
  ),
);
const arrowCaptions = ["first", "second", "third"].map((id) => resolvedObject(arrows, `${id}-caption`).box);
for (let i = 0; i < arrowCaptions.length; i++) for (let j = i + 1; j < arrowCaptions.length; j++) {
  const [a, b] = [arrowCaptions[i], arrowCaptions[j]];
  const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
  assert.ok(apart, "captions of arrows that start at one spot never print over each other");
}

const spokenScene = (id, narration, says) => ({
  id,
  composition: "custom-relational",
  narration,
  objects: says.map((_, index) => circle(`${id}-c${index}`, index === 0 ? "main" : "support")),
  beats: says.map((say, index) => ({ id: `${id}-b${index}`, pace: "quick", ...(say ? { say } : {}), actions: [{ do: "show", targets: [`${id}-c${index}`] }] })),
});
const voiced = renderLessonSpec(
  {
    version: "1",
    title: "timing probe",
    theme: "parchment",
    scenes: [
      spokenScene("s1", "First the sun rises over the hills, and much later the moon appears in the dark sky.", [null, "the moon appears"]),
      spokenScene("s2", "Then the tide comes in.", [null, "the tide"]),
    ],
  },
  { sceneFloors: [8, 2] },
);
assert.equal(voiced.valid, true, voiced.valid ? undefined : JSON.stringify(voiced.errors));
const [sunrise, tide] = voiced.resolved.scenes;
assert.equal(sunrise.beats[1].word, 10, "a beat's say is found among the narration's words");
assert.ok(Math.abs(sunrise.beats[1].start - (10 / 17) * 8) < 1e-9, "a beat begins as its words come round, across the scene's floor");
assert.equal(tide.beats[1].start, tide.beats[0].end, "a beat never begins before the one before it has played");
assert.ok(tide.beats[0].duration < sunrise.beats[0].duration, "a beat with little room before the next word is shortened, not pushed");
assert.deepEqual(voiced.slide.scenes.map((scene) => [scene.start, scene.end]), [[0, sunrise.duration], [sunrise.duration, sunrise.duration + tide.duration]], "scene windows run back to back");
assert.equal(voiced.slide.scenes.at(-1).end, voiced.slide.duration, "the scene windows span the whole film");
assert.deepEqual(voiced.slide.scenes[0].cues, [{ word: 10, at: sunrise.beats[1].start }], "only beats tied to a word become cues");
assert.equal(voiced.slide.scenes[0].words, 17);
const hurried = renderLessonSpec(
  {
    version: "1",
    title: "squeeze probe",
    theme: "parchment",
    scenes: [
      {
        ...spokenScene("s1", "One two three four five six seven eight nine ten.", [null, null, "nine ten"]),
        beats: spokenScene("s1", "One two three four five six seven eight nine ten.", [null, null, "nine ten"]).beats.map((beat, index) => (index < 2 ? { ...beat, pace: "slow" } : beat)),
      },
    ],
  },
  { sceneFloors: [4] },
);
assert.equal(hurried.valid, true, hurried.valid ? undefined : JSON.stringify(hurried.errors));
const [lead, follow, named] = hurried.resolved.scenes[0].beats;
const nameDue = (8 / 10) * 4;
assert.ok(Math.abs(named.start - nameDue) < 1e-9, "a long run before a spoken word is shortened to end on that word");
assert.ok(Math.abs(follow.end - named.start) < 1e-9, "the shortened run still plays back to back");
assert.ok(lead.actions.every((action) => action.end <= lead.end + 1e-9), "a shortened beat's actions fit inside it");

const unsaid = renderLessonSpec({ version: "1", title: "t", theme: "parchment", scenes: [spokenScene("s1", "A short line.", [null, "words never spoken"])] }, { sceneFloors: [6] });
assert.equal(unsaid.valid, true);
assert.equal(unsaid.resolved.scenes[0].beats[1].word, undefined, "a say the narration never speaks leaves the beat in sequence");

const spokenLines = (hold) => {
  const result = compiled({
    version: "1",
    title: "speech probe",
    theme: "parchment",
    scenes: [
      {
        id: "s1",
        composition: "custom-relational",
        narration: "Some families bought on borrowed money. The bank wanted it back, and they could not pay. Investors also borrowed to buy shares.",
        objects: [
          { id: "family", kind: "image", src: PNG_1x1, aspect: 0.5, size: "medium", placement: { mode: "zone", zone: "main-left" } },
          ...["bank", "debt", "shares"].map((id) => circle(id, "main-right")),
        ],
        beats: [
          { id: "b0", pace: "normal", say: "Some families", actions: [{ do: "show", targets: ["family"] }] },
          { id: "b1", pace: "normal", say: "borrowed money", actions: [{ do: "speak", target: "family", text: "I need time to pay.", ...(hold ? { hold } : {}) }] },
          { id: "b2", pace: "normal", say: "The BANK wanted", actions: [{ do: "show", targets: ["bank"] }] },
          { id: "b3", pace: "normal", actions: [{ do: "show", targets: ["debt"] }] },
          { id: "b4", pace: "normal", say: "investors, also", actions: [{ do: "show", targets: ["shares"] }] },
        ],
      },
    ],
  });
  return { beats: result.resolved.scenes[0].beats, line: result.gcl.find((item) => item.verb === "speech") };
};
const cued = spokenLines(false);
assert.deepEqual(cued.beats.map((beat) => beat.sentence), [0, 0, 1, 1, 2], "each beat plays in the sentence its say is found in, and a beat with none in the one before");
assert.ok(cued.line && Math.abs(cued.line.exit.out - cued.beats[2].start) < 1e-9, "a spoken line is wiped as the first beat of the next sentence starts");
assert.equal(cued.line.exit.dur, 0.25, "it leaves with the wipe the next line uses");
assert.equal(spokenLines(true).line.exit, undefined, "a held line stays past its sentence while nobody speaks again");

const crowd = compiled(
  film(
    [
      { id: "noble", kind: "image", src: PNG_1x1, aspect: 0.4, size: "medium", placement: { mode: "zone", zone: "main-left" } },
      { id: "peasant", kind: "image", src: PNG_1x1, aspect: 0.4, size: "medium", placement: { mode: "zone", zone: "main" } },
      { id: "note", kind: "text", text: "the noble family lives comfortably", textRole: "caption", role: "annotation", placement: { mode: "relative", target: "noble", relation: "right-of" } },
    ],
    [[{ do: "show", targets: ["noble", "peasant", "note"] }]],
  ),
);
const [noteBox, peasantBox] = [resolvedObject(crowd, "note").box, resolvedObject(crowd, "peasant").box];
const clear = noteBox.x + noteBox.w <= peasantBox.x + 3 || peasantBox.x + peasantBox.w <= noteBox.x + 3 || noteBox.y + noteBox.h <= peasantBox.y + 3 || peasantBox.y + peasantBox.h <= noteBox.y + 3;
assert.ok(clear, "a caption beside one picture never prints across another");

const courtroom = compileLessonSpec(
  film(
    [
      { id: "deputies", kind: "image", src: PNG_1x1, aspect: 1, size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "court", kind: "path", d: "M120 60 L880 60 L880 940 L120 940 Z", stroke: "ink", placement: { mode: "zone", zone: "support" } },
      { id: "assembly-border", kind: "path", in: "deputies", d: "M580 140 L950 140 L950 900 L580 900 Z", stroke: "accent" },
    ],
    [[{ do: "show", targets: ["deputies", "court", "assembly-border"] }]],
  ),
);
assert.equal(courtroom.valid, true, courtroom.valid ? undefined : JSON.stringify(courtroom.errors));
const handDrawn = courtroom.warnings.filter((w) => w.code === "DROPPED_OBJECT").map((w) => w.path);
assert.ok(handDrawn.some((p) => p.includes("objects/1")), "a building drawn by hand beside pictures is dropped");
assert.ok(handDrawn.some((p) => p.includes("objects/2")), "an empty box drawn over a picture is dropped");
const lessonSquare = compiled(film([{ id: "square", kind: "path", d: "M100 100 L900 100 L900 900 L100 900 Z", stroke: "ink", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["square"] }]]));
assert.ok(resolvedObject(lessonSquare, "square"), "a figure drawn in a scene with no pictures is the lesson, and stays");

const question = { question: "Which part makes food?", answer: "The leaf", why: "Leaves hold the chlorophyll that turns light into sugar.", wrong: [{ text: "The root", why: "Roots take in water, they make no food." }], place: "below" };
const asked = film([circle("a", "main")], [[{ do: "show", targets: ["a"] }]]);
asked.scenes[0].check = question;
const askedFilm = renderLessonSpec(asked);
assert.equal(askedFilm.valid, true, askedFilm.valid ? undefined : JSON.stringify(askedFilm.errors));
assert.deepEqual(askedFilm.slide.scenes[0].check, question, "a scene's question reaches the player untouched");
const garbled = film([circle("a", "main")], [[{ do: "show", targets: ["a"] }]]);
garbled.scenes[0].check = { question: "Which part?", answer: "The leaf", why: "It makes food.", wrong: [] };
const garbledFilm = renderLessonSpec(garbled);
assert.equal(garbledFilm.valid, true, "a malformed question never costs the scene");
assert.equal(garbledFilm.slide.scenes[0].check, undefined, "a malformed question is dropped");
assert.ok(garbledFilm.warnings.some((w) => w.code === "DROPPED_CHECK"), "and the drop is reported");
// A real decision question fits: 160 characters asked, 120 per option, 200 per reason; one past any of them is dropped.
const sized = (n, word) => `${word} `.repeat(Math.ceil(n / (word.length + 1))).slice(0, n);
const decision = { question: sized(160, "Britain"), answer: sized(120, "guarantee"), why: sized(200, "because"), wrong: [{ text: sized(120, "appease"), why: sized(200, "since") }] };
const fits = film([circle("a", "main")], [[{ do: "show", targets: ["a"] }]]);
fits.scenes[0].check = decision;
assert.deepEqual(renderLessonSpec(fits).slide.scenes[0].check, decision, "a decision question at every limit reaches the player");
for (const [field, over] of [["question", { question: sized(161, "x") }], ["answer", { answer: sized(121, "x") }], ["why", { why: sized(201, "x") }], ["wrong", { wrong: [{ text: sized(121, "x"), why: "no" }] }], ["wrong why", { wrong: [{ text: "no", why: sized(201, "x") }] }]]) {
  const past = film([circle("a", "main")], [[{ do: "show", targets: ["a"] }]]);
  past.scenes[0].check = { ...decision, ...over };
  assert.equal(renderLessonSpec(past).slide.scenes[0].check, undefined, `a check whose ${field} runs past its limit is dropped`);
}
assert.equal(compiled(film([circle("a", "main")], [[{ do: "show", targets: ["a"] }]])).lesson.scenes[0].check, undefined);

// ── Figures: data charts, diagrams, cards and physics marks drawn as built-up figures ────────────

const pieceIds = (result, id) => result.gcl.filter((item) => typeof item.id === "string" && item.id.startsWith(`${id}.`)).map((item) => item.id);
const figureOps = (result) => result.gcl.filter((item) => item.type === "figure").flatMap((item) => item.ops);
const assertFigureSane = (result, id, label) => {
  const parent = resolvedObject(result, id);
  assert.ok(parent, `${label}: laid out`);
  assert.ok(parent.box.y >= 0 && parent.box.y + parent.box.h <= 960, `${label}: stays inside the frame's height`);
  assert.ok(parent.box.x >= 0 && parent.box.x + parent.box.w <= 540, `${label}: stays inside the frame`);
  for (const piece of result.resolved.scenes[0].objects.filter((o) => o.compositeParent === id)) {
    assert.ok(piece.box.y + piece.box.h <= 960.5, `${label}: piece ${piece.id} stays inside the frame's height`);
    assert.ok(piece.box.x >= parent.box.x - 1 && piece.box.x + piece.box.w <= parent.box.x + parent.box.w + 1, `${label}: piece ${piece.id} lies inside its figure`);
  }
  for (const op of figureOps(result).filter((op) => op.op === "text")) assert.ok(op.size >= 18, `${label}: writing '${op.text}' is at least 18 units`);
};
const figureFilms = [];
const figured = (spec) => {
  figureFilms.push(spec);
  return compiled(spec);
};
const renderEvery = (spec) => {
  const rendered = renderLessonSpec(spec);
  assert.equal(rendered.valid, true, rendered.valid ? undefined : JSON.stringify(rendered.errors));
  const ctx = createCanvas(540, 960).getContext("2d");
  for (const window of rendered.slide.scenes) for (const m of [0.1, 0.4, 0.7, 0.99]) rendered.slide.render(ctx, window.start + (window.end - window.start) * m);
  return rendered;
};

const stages = film(
  [
    { id: "d", kind: "diagram", layout: "sequence", nodes: [{ id: "soak", label: "The seed takes in water", note: "it swells" }, { id: "root", label: "A root pushes down" }, { id: "shoot", label: "A shoot rises" }], links: [{ from: "root", to: "shoot", label: "then" }] },
  ],
  [[{ do: "show", targets: ["d.soak"] }], [{ do: "show", targets: ["d.root"] }], [{ do: "show", targets: ["d.shoot"] }, { do: "attention", target: "d.shoot", verb: "box" }]],
);
const staged = figured(stages);
assertFigureSane(staged, "d", "sequence");
assert.deepEqual(pieceIds(staged, "d").sort(), ["d.root", "d.root-shoot", "d.shoot", "d.soak", "d.soak-root"], "every stage and every arrow between stages is a piece");
const startOf = (result, id) => component(result, id).start;
assert.ok(startOf(staged, "d.soak") < startOf(staged, "d.root") && startOf(staged, "d.root") < startOf(staged, "d.shoot"), "stages shown on their own beats enter on those beats");
assert.equal(startOf(staged, "d.root-shoot"), startOf(staged, "d.shoot"), "an arrow enters with the stage it points at");
assert.ok(staged.gcl.some((item) => item.type === "attention" && item.target === "d.shoot"), "a stage is a target for attention");
assert.ok(figureOps(staged).some((op) => op.op === "text" && op.text === "then"), "a link's verb is written on it");
const wrongLink = compileLessonSpec(film([{ id: "d", kind: "diagram", layout: "sequence", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], links: [{ from: "b", to: "a" }] }], [[{ do: "show", targets: ["d"] }]]));
assert.ok(diagnostics(wrongLink).some((d) => /draws its own arrows/.test(d.message)), "a sequence refuses an arrow it does not draw");

const causes = figured(
  film(
    [
      {
        id: "f",
        kind: "diagram",
        layout: "flow",
        nodes: [{ id: "debt", label: "Royal debt" }, { id: "bread", label: "Bread prices" }, { id: "anger", label: "Anger" }, { id: "necker", label: "Necker dismissed" }, { id: "riot", label: "Bastille stormed" }],
        links: [{ from: "debt", to: "anger", type: "condition" }, { from: "bread", to: "anger" }, { from: "anger", to: "riot" }, { from: "necker", to: "riot", type: "trigger", label: "sparks" }],
      },
    ],
    [[{ do: "show", targets: ["f"] }]],
  ),
);
assertFigureSane(causes, "f", "flow");
const flowStarts = ["f.debt", "f.anger", "f.riot"].map((id) => startOf(causes, id));
assert.ok(flowStarts[0] < flowStarts[1] && flowStarts[1] < flowStarts[2], "shown whole, a flow builds cause before effect");
const riot = resolvedObject(causes, "f.riot").box;
const necker = resolvedObject(causes, "f.necker").box;
assert.ok(necker.y + necker.h < riot.y && riot.y - (necker.y + necker.h) < 120, "a cause nothing leads to sits just above what it acts on");
const dashed = figureOps(causes).filter((op) => op.op === "line" && op.dash);
assert.ok(dashed.length >= 1, "a standing condition is drawn dashed, apart from the trigger");
// A flow set over a map to help it was shrunk with the map's share of the screen while its writing kept
// its size, so words ran out of their boxes and the boxes across the map.
const helper = figured(
  film(
    [
      { id: "europe", kind: "image", src: PNG_1x1, aspect: 1.32, role: "primary", placement: { mode: "zone", zone: "main" } },
      {
        id: "causes",
        kind: "diagram",
        layout: "flow",
        role: "annotation",
        placement: { mode: "zone", zone: "overlay" },
        nodes: [{ id: "takeovers", label: "earlier takeovers" }, { id: "pledge", label: "pledge to Poland" }, { id: "invasion", label: "invasion" }, { id: "declaration", label: "declaration of war" }],
        links: [{ from: "takeovers", to: "pledge" }, { from: "pledge", to: "declaration" }, { from: "invasion", to: "declaration" }],
      },
    ],
    [[{ do: "show", targets: ["europe", "causes"] }]],
  ),
);
assertFigureSane(helper, "causes", "helping flow");
const [mapBox, flowBox] = ["europe", "causes"].map((id) => resolvedObject(helper, id).box);
assert.ok(mapBox.y + mapBox.h <= flowBox.y || flowBox.y + flowBox.h <= mapBox.y, "a flow helping a picture shares the screen with it rather than printing across it");
const wordRoom = "declaration".length * 22 * 0.6 + 22 * 0.4;
assert.ok(resolvedObject(helper, "causes.declaration").box.w >= wordRoom + 28, "every flow node holds its longest word inside its box");

const tree = figured(film([{ id: "t", kind: "diagram", layout: "tree", nodes: [{ id: "life", label: "Life" }, { id: "plants", label: "Plants", parent: "life" }, { id: "animals", label: "Animals", parent: "life" }] }], [[{ do: "show", targets: ["t"] }]]));
assertFigureSane(tree, "t", "tree");
assert.ok(startOf(tree, "t.life") < startOf(tree, "t.plants"), "a tree builds level by level");
assert.ok(resolvedObject(tree, "t.plants").box.y > resolvedObject(tree, "t.life").box.y + resolvedObject(tree, "t.life").box.h, "children hang below their parent");
const cycle = figured(film([{ id: "c", kind: "diagram", layout: "cycle", nodes: ["Evaporation", "Condensation", "Rain", "Collection"].map((label, i) => ({ id: `n${i}`, label })) }], [[{ do: "show", targets: ["c"] }]]));
assertFigureSane(cycle, "c", "cycle");
assert.ok(pieceIds(cycle, "c").includes("c.n3-n0"), "a cycle closes its loop");

const wage = figured(
  film(
    [{ id: "c", kind: "chart", chart: "hbar", title: "Bread took over half the wage", source: "Labrousse, 1944", data: [{ label: "Rent", value: 15 }, { label: "Bread", value: 58 }, { label: "Fuel", value: 6 }] }],
    [[{ do: "show", targets: ["c"] }], [{ do: "attention", target: "c.bar1", verb: "box" }]],
  ),
);
assertFigureSane(wage, "c", "hbar");
assert.ok(resolvedObject(wage, "c.bar1").box.y < resolvedObject(wage, "c.bar0").box.y, "bars are sorted by value, the largest first");
assert.ok(startOf(wage, "c.bar1") < startOf(wage, "c.bar0"), "and grow in that order");
assert.ok(startOf(wage, "c.title") > startOf(wage, "c.bar2"), "the takeaway is written once the data it sums up is drawn");
const bars = figureOps(wage).filter((op) => op.op === "rect" && op.grow === "right");
assert.equal(bars.length, 3, "every bar grows out of its baseline");
const lengths = bars.map((b) => b.w).sort((a, b) => b - a);
assert.ok(Math.abs(lengths[0] / lengths[1] - 58 / 15) < 0.01, "a bar's length is linear in its value (no lie factor)");
const plotted = figured(film([{ id: "g", kind: "chart", chart: "line", title: "Prices doubled", source: "INSEE", series: [[1780, 10], [1790, 20]] }], [[{ do: "show", targets: ["g"] }]]));
const graph = component(plotted, "g");
const graphBox = resolvedObject(plotted, "g").box;
assert.ok(graph.at[1] - graph.h / 2 > graphBox.y + 22 && graph.at[1] + graph.h / 2 < graphBox.y + graphBox.h - 18, "a chart's title and source take bands, and the plot keeps the rest");
assert.ok(graph.at[0] - graph.w / 2 > graphBox.x + 20 && graph.at[0] + graph.w / 2 < graphBox.x + graphBox.w, "a plotted chart keeps room inside its own box for the values its axes write");
assert.ok(pieceIds(plotted, "g").includes("g.title") && pieceIds(plotted, "g").includes("g.source"), "any chart's title and source are pieces");

const pairs = [{ label: "Bread", from: 12, to: 30 }, { label: "Wine", from: 20, to: 24 }];
for (const chart of ["slope", "dumbbell", "pyramid"]) {
  const result = figured(film([{ id: "c", kind: "chart", chart, columns: ["1789", "1799"], pairs }], [[{ do: "show", targets: ["c"] }]]));
  assertFigureSane(result, "c", chart);
  assert.deepEqual(pieceIds(result, "c").sort(), ["c.row0", "c.row1"], `${chart}: a piece per row`);
}
const chance = figured(film([{ id: "u", kind: "chart", chart: "units", icon: "person", total: 6, data: [{ label: "fell ill", value: 1 }] }], [[{ do: "show", targets: ["u"] }]]));
assertFigureSane(chance, "u", "units");
assert.equal(figureOps(chance).filter((op) => op.op === "icon").length, 7, "an icon array draws the whole (6) and fills the part (1)");
const house = figured(film([{ id: "s", kind: "chart", chart: "seats", majority: true, data: [{ label: "Clergy", value: 291 }, { label: "Nobles", value: 270 }, { label: "Third estate", value: 578 }] }], [[{ do: "show", targets: ["s.group0"] }], [{ do: "show", targets: ["s.group1", "s.group2"] }]]));
assertFigureSane(house, "s", "seats");
assert.equal(figureOps(house).filter((op) => op.op === "dot").length, 291 + 270 + 578, "one dot per seat");
for (const [chart, extra] of [["stack", { names: ["coal", "oil"], series: [[[1900, 1], [2000, 3]], [[1900, 2], [2000, 5]]] }], ["histogram", { values: [1, 2, 2, 3, 3, 3, 4, 4, 5], marks: "dots" }], ["sparkline", { series: [[1, 1], [2, 3], [3, 2]], size: "small" }]]) {
  const result = figured(film([{ id: "c", kind: "chart", chart, ...extra }], [[{ do: "show", targets: ["c"] }]]));
  assertFigureSane(result, "c", chart);
}
const tangled = figured(film([{ id: "c", kind: "chart", chart: "line", names: ["a", "b", "c", "d"], series: [0, 1, 2, 3].map((k) => [[0, k], [1, k + 1]]) }], [[{ do: "show", targets: ["c"] }]]));
assert.equal(component(tangled, "c").type, "figure", "more than three lines become small multiples");
assert.equal(pieceIds(tangled, "c").length, 4, "one panel per line");
const secant = figured(film([{ id: "c", kind: "chart", chart: "function", function: "x^2", xDomain: [-2, 2], yDomain: [0, 4], tangent: { at: 1, from: -1.5 } }], [[{ do: "show", targets: ["c"] }], [{ do: "show", targets: ["c.tangent"] }]]));
const tangentLine = component(secant, "c.tangent").ops.find((op) => op.op === "line" && op.frames);
assert.ok(tangentLine.frames.length > 10, "the secant turns through its in-between positions");
const [q0, q1] = tangentLine.frames.at(-1);
const slope = -(q1[1] - q0[1]) / (q1[0] - q0[0]);
const plotC = component(secant, "c");
assert.ok(Math.abs(slope / (plotC.h / 4) / (1 / (plotC.w / 4)) - 2) < 0.05, "it settles on the true tangent (slope 2 at x = 1)");
assert.ok(component(secant, "c.tangent").enter.dur >= 2, "a sliding mark plays across its whole beat");
const trend = figured(film([{ id: "c", kind: "chart", chart: "scatter", trend: true, series: [[1, 1], [2, 2], [3, 3.2]] }], [[{ do: "show", targets: ["c"] }]]));
assert.equal(component(trend, "c").trend, true, "a scatter can carry its trend line");

const analogy = figured(film([{ id: "c", kind: "compare", titles: ["Pipes", "Circuit"], rows: [{ left: "Pump", right: "Battery", match: "maps" }, { left: "Leaks", right: "No leak", match: "fails" }] }], [[{ do: "show", targets: ["c.left", "c.right"] }], [{ do: "show", targets: ["c.row0"] }], [{ do: "show", targets: ["c.row1"] }]]));
assertFigureSane(analogy, "c", "compare");
assert.ok(component(analogy, "c.row1").ops.filter((op) => op.op === "line").length >= 3, "a mapping that fails is struck through");
const pamphlet = figured(film([{ id: "e", kind: "evidence", author: "Sieyès", date: "1789", place: "Paris", audience: "the public", excerpt: "What is the Third Estate? Everything." }, { id: "q", kind: "question", text: "Why did Paris rise?" }], [[{ do: "show", targets: ["q", "e"] }], [{ do: "show", targets: ["q.tick"] }]]));
assertFigureSane(pamphlet, "e", "evidence");
assert.ok(startOf(pamphlet, "e.header") < startOf(pamphlet, "e.excerpt"), "who, when and where come before the words");
const chip = resolvedObject(pamphlet, "q").box;
assert.ok(chip.y >= 12 && chip.y < 260, "the open question is held along the top, under the app's dots");
const lineup = figured(film([{ id: "s", kind: "scale", unit: "µm", items: [{ label: "Cell", size: 8 }, { label: "Sand", size: 500 }] }], [[{ do: "show", targets: ["s"] }]]));
assertFigureSane(lineup, "s", "scale");
const [cell, sand] = [0, 1].map((i) => component(lineup, `s.item${i}`).ops.find((op) => op.op === "dot").r);
assert.ok(Math.abs(sand / cell - 500 / 8) < 1 || cell === 1.5, "things keep their true relative size");

const fbd = figured(film([{ id: "f", kind: "forces", forces: [{ id: "g", label: "F_{g}", angle: 270, size: 10, resolve: { axis: -30, labels: ["mg\\sin\\theta", "mg\\cos\\theta"] } }, { id: "n", label: "F_{N}", angle: 60, size: 5 }] }], [[{ do: "show", targets: ["f.g", "f.n"] }], [{ do: "show", targets: ["f.g-parts"] }]]));
assertFigureSane(fbd, "f", "forces");
const arrowLength = (id) => {
  const shaft = component(fbd, id).ops.find((op) => op.op === "line");
  return Math.hypot(shaft.pts[1][0] - shaft.pts[0][0], shaft.pts[1][1] - shaft.pts[0][1]);
};
assert.ok(Math.abs(arrowLength("f.g") / arrowLength("f.n") - 2) < 0.01, "an arrow is as long as its force is big");
const working = figured(film([{ id: "w", kind: "working", lines: [{ tex: "2x + 3 = 11" }, { tex: "2x + 3 - 3 = 11 - 3", note: "−3", cancel: ["+ 3 - 3"] }, { tex: "x = 4" }] }], [[{ do: "show", targets: ["w.l0"] }], [{ do: "show", targets: ["w.l1"] }], [{ do: "show", targets: ["w.l1-cancel"] }], [{ do: "show", targets: ["w.l2"] }]]));
assertFigureSane(working, "w", "working");
assert.equal(component(working, "w.l0").dimAt, startOf(working, "w.l1"), "a line dims as the next one is written");
assert.equal(component(working, "w.l2").dimAt, undefined, "the newest line stays bright");
const equals = ["w.l0", "w.l2"].map((id) => {
  const op = component(working, id).ops.find((one) => one.math);
  return op;
});
assert.ok(equals.every(Boolean), "each line is written as maths");
assert.ok(diagnostics(compileLessonSpec(film([{ id: "w", kind: "working", lines: [{ tex: "x = 4", cancel: ["y"] }] }], [[{ do: "show", targets: ["w"] }]]))).some((d) => /nothing to strike/.test(d.message)), "a cancel names a term the line has");

const lanes = figured(film([{ id: "t", kind: "timeline", role: "primary", from: 1770, to: 1800, lanes: ["Politics", "Economy"], events: [{ at: 1788, label: "Harvest", lane: 1 }, { at: 1789, label: "Bastille", lane: 0 }], links: [{ from: 0, to: 1, label: "fuels" }] }], [[{ do: "show", targets: ["t"] }]]));
assert.deepEqual(component(lanes, "t").lanes, ["Politics", "Economy"]);
assert.equal(component(lanes, "t").events[0].track, 1, "an event sits on its lane");
assert.ok(diagnostics(compileLessonSpec(film([{ id: "t", kind: "timeline", from: 1, to: 9, events: [{ at: 2, label: "x", lane: 2 }], lanes: ["a", "b"] }], [[{ do: "show", targets: ["t"] }]]))).some((d) => /Lane 2 does not exist/.test(d.message)));
const molecules = figured(film([circle("site", "main-right"), { id: "m", kind: "shape", shape: "disc", size: "tiny", placement: { mode: "zone", zone: "main-left" } }], [[{ do: "show", targets: ["site", "m"] }], [{ do: "motion", target: "m", motion: "wander", to: "site", trail: "dots" }]]));
const walk = component(molecules, "m").motions[0];
const site = resolvedObject(molecules, "site").position;
const straight = Math.hypot(walk.path.at(-1)[0] - walk.path[0][0], walk.path.at(-1)[1] - walk.path[0][1]);
const walked2 = walk.path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - walk.path[i][0], p[1] - walk.path[i][1]), 0);
assert.equal(walk.trail, "dots", "a journey can leave a dotted trail");
assert.ok(walked2 > straight * 1.5, "a molecule wanders rather than beelining");
assert.ok(Math.hypot(walk.path.at(-1)[0] - site[0], walk.path.at(-1)[1] - site[1]) < Math.hypot(walk.path[0][0] - site[0], walk.path[0][1] - site[1]), "and still arrives at its partner");
const changed = figured(film([{ id: "p", kind: "path", d: "M0 0 L400 0 L400 600 L0 600 Z", fill: "accent", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["p"] }], [{ do: "motion", target: "p", motion: "morph", ghost: true, d: "M0 0 L400 200 L400 400 L0 600 Z" }]]));
assert.equal(component(changed, "p~was")?.ghost, 0.3, "a shape changing form leaves a ghost of its old form");
const shaded = figured(film([{ id: "m", kind: "map", features: [{ id: "a", value: 1, rings: [[[0, 0], [1, 0], [1, 1]]] }, { id: "b", value: 9, rings: [[[1, 0], [2, 0], [2, 1]]] }] }], [[{ do: "show", targets: ["m"] }]]));
const shades = component(shaded, "m").featureColors;
assert.notEqual(shades[0], shades[1], "a data map shades regions by their values");

globalThis.Path2D ??= Path2D;
globalThis.Image ??= Image;
globalThis.document ??= { createElement: () => createCanvas(300, 150) };
for (const spec of figureFilms) renderEvery(spec);

const picture = (id, role, size, placement) => ({ id, kind: "image", src: PNG_1x1, aspect: 1, role, size, placement });
const ranked = compiled(
  film(
    [picture("subject", "primary", "medium", { mode: "zone", zone: "main" }), picture("helper", "support", "large", { mode: "relative", target: "subject", relation: "below" }), picture("rider", "support", "small", { mode: "anchor", target: "subject" })],
    [[{ do: "show", targets: ["subject", "helper", "rider"] }]],
  ),
);
const [subjectBox, helperBox, riderBox] = ["subject", "helper", "rider"].map((id) => resolvedObject(ranked, id));
assert.equal(subjectBox.rank, "lead");
assert.equal(helperBox.rank, "second");
assert.equal(riderBox.rank, "traveller");
assert.ok(helperBox.box.w <= subjectBox.box.w * 0.61, "a picture helping the subject is at most 60% of it, whatever size it was given or room it grew into");
assert.ok(riderBox.box.w <= subjectBox.box.w * 0.19, "a thing travelling on the subject is at most 18% of it");
const compared = compiled(
  film(
    [picture("left", "primary", "small", { mode: "zone", zone: "main-left" }), picture("right", "primary", "large", { mode: "zone", zone: "main-right" })],
    [[{ do: "show", targets: ["left", "right"] }]],
  ),
);
assert.deepEqual(["left", "right"].map((id) => resolvedObject(compared, id).rank).sort(), ["colead", "lead"], "two subjects side by side are compared, not ranked");
assert.ok(Math.abs(resolvedObject(compared, "left").box.w - resolvedObject(compared, "right").box.w) < resolvedObject(compared, "right").box.w * 0.25, "compared subjects are drawn near one size");

const cues = compiled(
  film(
    [circle("a", "main-left"), circle("b", "main-right"), { id: "link", kind: "line", from: "a", to: "b", arrow: "end" }],
    [[{ do: "show", targets: ["a", "b", "link"], entrance: "draw" }], [{ do: "attention", target: "a", verb: "outline", with: ["b"] }, { do: "attention", target: "link", verb: "trace" }]],
  ),
);
const attention = cues.gcl.filter((c) => c.type === "attention");
assert.deepEqual(attention.filter((c) => c.verb === "outline").map((c) => c.target).sort(), ["a", "b"], "a linked cue lights every thing it names at once");
assert.ok(attention.find((c) => c.verb === "trace")?.course?.length >= 2, "a trace runs along the points its connector draws");
assert.equal(component(cues, "link").enter?.type, "draw", "a stroke enters by drawing on, and nothing rides it");

const truncated = compileLessonSpec(
  film([{ id: "prices", kind: "chart", chart: "bar", data: [{ label: "1780", value: 60 }, { label: "1789", value: 80 }], yDomain: [50, 100], placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["prices"] }]]),
);
assert.ok(truncated.warnings.some((w) => w.code === "LIE_FACTOR"), "bars measured from a baseline above zero are reported");

const eraFilm = (label) => ({ id: "era", kind: "timeline", from: 1700, to: 1900, eras: [{ from: 1700, to: 1750, label: "Before" }, { from: 1750, to: 1800, label }], placement: { mode: "zone", zone: "main" } });
const twoScenes = film([eraFilm("War")], [[{ do: "show", targets: ["era"] }]]);
twoScenes.scenes.push({ ...twoScenes.scenes[0], id: "s2", objects: [{ ...eraFilm("War"), eras: [{ from: 1750, to: 1800, label: "War" }] }] });
const eras = compiled(twoScenes).gcl.filter((c) => c.type === "timeline").map((c) => c.eras.find((era) => era.label === "War").color);
assert.equal(eras[0], eras[1], "a category keeps its colour in every scene of the film");

const captioned = compiled(
  film(
    [picture("scene", "primary", "large", { mode: "zone", zone: "main" }), { id: "tag", kind: "text", text: "here", textRole: "caption", role: "annotation", placement: { mode: "anchor", target: "scene" } }],
    [[{ do: "show", targets: ["scene", "tag"] }]],
  ),
);
assert.equal(component(captioned, "tag").plate, true, "writing printed across a picture sits on a plate of the page");

{
  const chip = (extra) => ({ id: "chip", kind: "question", text: "Why did the river matter?", role: "hud", placement: { mode: "zone", zone: "strip" }, ...extra });
  const beatStart = (result, index) => result.resolved.scenes[0].beats[index].start;
  const answered = compiled(film([chip({ initial: "visible" }), circle("a", "main")], [[{ do: "show", targets: ["a"] }], [{ do: "show", targets: ["chip.tick"] }]]));
  assert.equal(answered.lesson.scenes.length, 1, "a piece of a figure on screen from the start can still be shown on its own beat");
  assert.equal(component(answered, "chip").start, 0, "the chip stays on screen from the start when its tick arrives");
  assert.equal(component(answered, "chip.tick").start, beatStart(answered, 1), "the tick is drawn on the beat that shows it");
  for (const initial of ["visible", undefined]) {
    const open = compiled(film([chip(initial ? { initial } : {}), circle("a", "main")], [[{ do: "show", targets: ["a", ...(initial ? [] : ["chip"])] }], [{ do: "attention", target: "chip", verb: "outline" }]]));
    assert.equal(component(open, "chip.tick"), undefined, "a question is never drawn answered until its tick is shown");
  }
  const tickOnly = compiled(film([chip(), circle("a", "main")], [[{ do: "show", targets: ["a"] }], [{ do: "show", targets: ["chip.tick"] }, { do: "attention", target: "chip", verb: "outline" }]]));
  assert.equal(component(tickOnly, "chip").start, beatStart(tickOnly, 1), "a figure never shown whole arrives with its first piece");
  assert.ok(!diagnostics(tickOnly).some((d) => d.code === "DROPPED_ACTION"), "the figure that arrived with its piece can be pointed at");
  const market = { id: "market", kind: "chart", chart: "line", series: [[[15, 3], [20, 2], [25, 1]], [[15, 1], [20, 2], [25, 3]]], names: ["demand", "supply"], marker: { from: 20, to: 20 }, xDomain: [0, 30], yDomain: [0, 4], xLabel: "loaves", yLabel: "price", placement: { mode: "zone", zone: "main" } };
  const marked = compiled(film([{ ...market, initial: "visible" }, circle("a", "footer")], [[{ do: "show", targets: ["a"] }], [{ do: "show", targets: ["market.marker"] }]]));
  assert.equal(component(marked, "market").start, 0);
  assert.equal(component(marked, "market.marker").start, beatStart(marked, 1), "a chart on screen from the start places its marker on the marker's own beat");
  const axes = compiled(film([market, circle("a", "footer")], [[{ do: "show", targets: ["a"] }], [{ do: "show", targets: ["market.yLabel"] }], [{ do: "show", targets: ["market.xLabel"] }]]));
  assert.equal(component(axes, "market").start, beatStart(axes, 1), "showing a place on a chart that has no window of its own shows the chart");

  const reshaped = compiled(
    film(
      [{ id: "tri", kind: "path", d: "M150 150 L500 150 L150 450 Z", fill: "accent", placement: { mode: "zone", zone: "main" } }],
      [[{ do: "show", targets: ["tri"] }], [{ do: "motion", target: "tri", motion: "morph", d: "M150 150 L350 150 L150 450 Z", ghost: true }], [{ do: "motion", target: "tri", motion: "morph", d: "M150 150 L700 150 L150 450 Z", ghost: true }]],
    ),
  );
  const ghosts = reshaped.gcl.filter((c) => c.ghost !== undefined);
  assert.deepEqual(ghosts.map((c) => c.id), ["tri~was", "tri~was2"], "every ghosted morph of one thing leaves a ghost of its own");
  assert.equal(ghosts[0].motions, undefined, "the first ghost is the form the thing was drawn in");
  assert.deepEqual(ghosts[1].motions?.map((m) => m.kind), ["morph"], "a later ghost keeps the form the morph before it left");

  const sent = compiled(film([circle("a", "main")], [[{ do: "show", targets: ["a"] }], [{ do: "motion", target: "a", motion: "move", to: "strip" }]]));
  assert.ok(component(sent, "a").motions?.some((m) => m.kind === "move"), "every zone a thing can be placed in is a destination");
}

{
  const narrated = (scene) => ({ version: "1", title: "carried", theme: "parchment", scenes: [{ id: "s1", composition: "custom-relational", narration: "The heart pumps blood. It never rests.", objects: [circle("heart", "main")], ...scene }] });
  const beats = [
    { id: "b0", actions: [{ do: "show", targets: ["heart"] }] },
    { id: "b1", say: "never rests", actions: [{ do: "attention", target: "heart", verb: "outline" }] },
  ];
  const stored = renderLessonSpec(narrated({ key: "It never rests.", beats }));
  assert.equal(stored.valid, true, "a stored film that still carries a scene `key` plays");
  assert.equal(stored.slide.scenes.length, 1, "the scene carrying it is kept");
  assert.equal("key" in stored.slide.scenes[0], false, "the field is stripped, never carried to the player");

  const chartSpec = { id: "rise", kind: "chart", chart: "bar", data: [{ label: "2020", value: 3 }, { label: "2024", value: 5 }], role: "primary", placement: { mode: "zone", zone: "main" } };
  const alone = resolvedObject(compiled(film([chartSpec], [[{ do: "show", targets: ["rise"] }]])), "rise");
  const shared = compiled(film([picture("rocket", "primary", "hero", { mode: "zone", zone: "main" }), chartSpec], [[{ do: "show", targets: ["rocket", "rise"] }], [{ do: "attention", target: "rocket", verb: "outline" }]]));
  assert.equal(resolvedObject(shared, "rocket").rank, "lead", "a hero-sized picture leads over a primary chart");
  assert.equal(resolvedObject(shared, "rise").rank, "second", "one lead at a time: the chart helps it");
  assert.ok(resolvedObject(shared, "rise").box.w < alone.box.w, "a chart that helps the subject is drawn smaller than it would lead");
  const softened = shared.gcl.find((c) => c.type === "attention" && c.verb === "dim" && c.quiet);
  assert.deepEqual(softened?.others, ["rise"], "while the subject is explained, what helps it softens");
  assert.equal(softened.start, shared.resolved.scenes[0].beats[1].start);

  const headlined = { ...film([{ id: "headline", kind: "text", text: "Pumping blood round the body", textRole: "heading", role: "hud", placement: { mode: "zone", zone: "title" }, initial: "visible" }, circle("heart", "main")], [[{ do: "show", targets: ["heart"] }]]), sections: ["Pump", "Vessels", "Lungs"] };
  Object.assign(headlined.scenes[0], { section: 1, terms: ["heart"] });
  const unheaded = compiled(headlined);
  assert.deepEqual(unheaded.resolved.scenes[0].objects.map((o) => o.id), ["heart"], "a scene draws no headline and no step counter");
  assert.ok(unheaded.warnings.some((w) => w.code === "DROPPED_OBJECT" && w.path.startsWith("/scenes/0/objects/0")), "a headline costs only itself, with a warning");

  const quiet = film([circle("a", "main")], [[{ do: "show", targets: ["a"] }], [{ do: "attention", target: "a", verb: "outline" }]]);
  quiet.scenes[0].beats = [{ ...quiet.scenes[0].beats[0], say: "A probe" }, { ...quiet.scenes[0].beats[1], pace: "instant" }];
  const silent = compiled(quiet);
  assert.ok(silent.resolved.scenes[0].beats[1].duration >= 0.6, "a silent beat after the last spoken one holds long enough to look");
}

{
  // Render-level cues: equation terms, chart marks, data maps, dated journeys, the carried question, flash and loop limits.
  const surface = () => createCanvas(540, 960).getContext("2d");
  const frameAt = (rendered, t) => {
    const ctx = surface();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 540, 960);
    rendered.slide.render(ctx, t);
    return ctx;
  };
  const luminance = (ctx, box) => {
    const data = ctx.getImageData(Math.round(box.x), Math.round(box.y), Math.max(1, Math.round(box.w)), Math.max(1, Math.round(box.h))).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return sum / (data.length / 4) / 255;
  };
  const rendered = (spec, timing) => {
    const result = renderLessonSpec(spec, timing);
    assert.equal(result.valid, true, result.valid ? undefined : JSON.stringify(result.errors));
    return result;
  };
  const attentionOn = (result, target) => result.gcl.find((item) => item.type === "attention" && item.target === target);
  const beatWindow = (result, index) => result.resolved.scenes[0].beats[index];

  const equation = (value, extra = {}) => ({ id: "eq", kind: "equation", value, size: "large", placement: { mode: "zone", zone: "main" }, ...extra });
  const lit = rendered(film([equation("F = ma")], [[{ do: "show", targets: ["eq"] }], [{ do: "attention", target: "eq.F", verb: "spotlight" }], [{ do: "attention", target: "eq.a", verb: "cancel" }]]));
  assert.equal(attentionOn(lit, "eq.F")?.verb, "spotlight", "a term of an equation is a target, named by its own TeX");
  assert.equal(attentionOn(lit, "eq.a")?.exit, undefined, "a struck term stays struck while its equation is shown");
  const eqBox = resolvedObject(lit, "eq").box;
  const band = { x: eqBox.x - 20, y: eqBox.y - 20, w: eqBox.w + 40, h: eqBox.h + 40 };
  const lighting = beatWindow(lit, 1);
  assert.ok(Math.abs(luminance(frameAt(lit, lighting.end - 0.05), band) - luminance(frameAt(lit, lighting.start - 0.05), band)) > 0.002, "lighting one term changes the equation's pixels");
  const hidden = compiled(film([equation("F = ma"), circle("a", "footer")], [[{ do: "show", targets: ["eq", "a"] }], [{ do: "attention", target: "eq.m", verb: "cancel" }], [{ do: "hide", targets: ["eq"] }]]));
  assert.equal(attentionOn(hidden, "eq.m").exit.out, hidden.resolved.scenes[0].beats[2].start, "a struck term leaves when its equation is hidden");
  assert.equal(compiled(film([equation("E = 0.5mv^2")], [[{ do: "show", targets: ["eq"] }], [{ do: "attention", target: "eq.0.5mv^2", verb: "outline" }]])).valid, true, "a term may hold dots of its own");
  const fraction = compileLessonSpec(film([equation("\\frac{b}{c}")], [[{ do: "show", targets: ["eq"] }], [{ do: "attention", target: "eq.a", verb: "outline" }]]));
  assert.ok(diagnostics(fraction).some((d) => /is not written in 'eq'/.test(d.message ?? "")), "a term is matched token by token, never inside a command's name");

  const bars = { id: "c", kind: "chart", chart: "bar", data: [{ label: "A", value: 3 }, { label: "B", value: 7 }, { label: "C", value: 5 }], placement: { mode: "zone", zone: "main" } };
  const lines = { id: "l", kind: "chart", chart: "line", series: [[[0, 1], [1, 3], [2, 2]], [[0, 2], [1, 1], [2, 3]]], names: ["x", "y"], placement: { mode: "zone", zone: "footer" } };
  const marked = rendered(film([bars, lines], [[{ do: "show", targets: ["c", "l"] }], [{ do: "attention", target: "c.bar1", verb: "outline" }], [{ do: "attention", target: "l.series1", verb: "outline" }]]));
  const chartBox = resolvedObject(marked, "c").box;
  const firstBar = { x: chartBox.x + chartBox.w * 0.1, y: chartBox.y + chartBox.h * 0.75, w: chartBox.w * 0.12, h: chartBox.h * 0.12 };
  const cue = beatWindow(marked, 1);
  assert.ok(Math.abs(luminance(frameAt(marked, cue.end - 0.05), firstBar) - luminance(frameAt(marked, cue.start - 0.05), firstBar)) > 0.02, "a cue on one bar fades the other bars back toward the page");
  assert.ok(diagnostics(compileLessonSpec(film([lines], [[{ do: "show", targets: ["l"] }], [{ do: "attention", target: "l.series2", verb: "outline" }]]))).some((d) => d.code === "INVALID_ANCHOR" || d.code === "DROPPED_ACTION"), "a line chart names only the lines it draws");
  const ranked = compiled(film([{ id: "h", kind: "chart", chart: "hbar", title: "Grain", data: [{ label: "Wheat", value: 30 }, { label: "Rye", value: 12 }, { label: "Oats", value: 20 }], placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["h"] }], [{ do: "attention", target: "h.bar0", verb: "outline" }]]));
  assert.deepEqual(attentionOn(ranked, "h.bar0").soften?.sort(), ["h.bar1", "h.bar2"], "a cue on a figure chart's bar fades its other bars, never its title");

  const square = (id, x, value) => ({ id, value, rings: [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]]] });
  const data = compiled(film([{ id: "m", kind: "map", legend: "People, millions", features: [square("a", 0, 1), square("b", 10, 9)], markers: [{ lon: 5, lat: 5, label: "Ur", value: 40 }, { lon: 15, lat: 5, label: "Kish", value: 10 }], placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["m"] }]]));
  const drawnMap = component(data, "m");
  assert.deepEqual(drawnMap.markers.map((m) => m.value), [40, 10], "a valued marker carries its quantity to the painter");
  assert.equal(drawnMap.legend.title, "People, millions");
  assert.deepEqual([drawnMap.legend.ramp.low, drawnMap.legend.ramp.high, drawnMap.legend.ramp.colors.length], [1, 9, 5], "the key's ramp runs over the shaded values in five shades");
  renderEvery(film([{ id: "m", kind: "map", legend: "People, millions", features: [square("a", 0, 1), square("b", 10, 9)], markers: [{ lon: 5, lat: 5, label: "Ur", value: 40 }], placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["m"] }]]));

  const march = compiled(film([circle("army", "main-left"), circle("moscow", "main-right")], [[{ do: "show", targets: ["army", "moscow"] }], [{ do: "motion", target: "army", motion: "move", to: "moscow", dates: ["June", "Sept", "Dec"] }]]));
  const marched = component(march, "army").motions.find((m) => m.kind === "move");
  assert.deepEqual([marched.trail, marched.dates], ["ghosts", ["June", "Sept", "Dec"]], "a dated journey leaves dated ghosts");
  renderEvery(film([circle("army", "main-left"), circle("moscow", "main-right")], [[{ do: "show", targets: ["army", "moscow"] }], [{ do: "motion", target: "army", motion: "move", to: "moscow", dates: ["June", "Sept", "Dec"] }]]));
  // Faded copies of writing say its words again, so a word moving leaves no ghosts and no dates; a dotted route is kept.
  const word = { id: "rate", kind: "text", text: "interest rates", placement: { mode: "zone", zone: "main" } };
  for (const [left, kept] of [[{ trail: "ghosts" }, undefined], [{ dates: ["May", "June"] }, undefined], [{ trail: "dots" }, "dots"]]) {
    const raised = compiled(film([word], [[{ do: "show", targets: ["rate"] }], [{ do: "motion", target: "rate", motion: "move", direction: "up", by: 55, ...left }]]));
    const rising = component(raised, "rate").motions?.find((m) => m.kind === "move");
    assert.ok(rising, "writing still rises");
    assert.deepEqual([rising.trail, rising.dates], [kept, undefined], `writing moved with ${JSON.stringify(left)} keeps trail ${kept}`);
    if (!kept) assert.ok(diagnostics(raised).some((d) => d.code === "DROPPED_FIELD"), `writing's ${Object.keys(left)[0]} is reported as dropped`);
  }

  const chipScene = (id, objects, beats) => ({ id, composition: "custom-relational", narration: "A scene of the film with its open question.", objects, beats: beats.map((actions, index) => ({ id: `b${index}`, pace: "normal", actions })) });
  const asked = compiled({
    version: "1",
    title: "carried",
    theme: "parchment",
    scenes: [
      chipScene("s1", [{ id: "q", kind: "question", text: "Why did the river matter?", persist: true, placement: { mode: "zone", zone: "strip" } }, circle("a", "main")], [[{ do: "show", targets: ["q", "a"] }]]),
      chipScene("s2", [circle("b", "main")], [[{ do: "show", targets: ["b"] }]]),
      chipScene("s3", [circle("c", "main")], [[{ do: "show", targets: ["c"] }], [{ do: "show", targets: ["q.tick"] }]]),
      chipScene("s4", [circle("d", "main")], [[{ do: "show", targets: ["d"] }]]),
    ],
  });
  const chipIn = asked.resolved.scenes.map((scene) => scene.objects.some((object) => object.id === "q"));
  assert.equal(asked.lesson.scenes.length, 4, "a film still written with `persist` plays every scene");
  assert.deepEqual(chipIn, [true, false, false, false], "`persist` is ignored: a scene shows exactly what it declares");
  const ticked = compiled({ version: "1", title: "ticked", theme: "parchment", scenes: [chipScene("s1", [{ id: "q", kind: "question", text: "Why did the river matter?", placement: { mode: "zone", zone: "strip" } }, circle("a", "main")], [[{ do: "show", targets: ["q", "a"] }], [{ do: "show", targets: ["q.tick"] }]])] });
  assert.ok(ticked.gcl.find((item) => item.id === "q.tick")?.start > 0, "the tick is drawn on the beat that shows it");

  const shuttle = film(
    [circle("a", "main-left"), circle("b", "main-right"), { id: "track", kind: "line", from: "a", to: "b" }, { id: "bead", kind: "shape", shape: "disc", size: "tiny", placement: { mode: "anchor", target: "a" } }],
    [[{ do: "show", targets: ["a", "b", "track", "bead"] }], [{ do: "motion", target: "bead", motion: "along", along: "track", repeat: "there-and-back" }], [{ do: "emphasize", target: "b", emphasis: "pulse" }]],
  );
  shuttle.scenes[0].beats[1].pace = "quick";
  const looped = rendered(shuttle, { sceneFloors: [16], backgroundColor: "#16222c" });
  const loopStart = beatWindow(looped, 1).start;
  const pixels = (t) => Buffer.from(frameAt(looped, t).getImageData(0, 0, 540, 960).data.buffer);
  const still = (a, b) => pixels(a).equals(pixels(b));
  assert.ok(!still(loopStart + 0.2, loopStart + 0.4), "a shuttle moves");
  assert.ok(still(loopStart + 6, loopStart + 9), "a looping motion has stopped within five seconds");

  const pendulum = film(
    [circle("pin", "main"), { id: "bob", kind: "shape", shape: "disc", size: "small", placement: { mode: "relative", target: "pin", relation: "below" } }],
    [[{ do: "show", targets: ["pin", "bob"] }], [{ do: "motion", target: "bob", motion: "spin", about: "pin", sweep: 60, repeat: "there-and-back" }]],
  );
  const swung = rendered(pendulum, { sceneFloors: [16], backgroundColor: "#16222c" });
  const swing = component(swung, "bob").motions.find((motion) => motion.kind === "spin");
  const swingFrame = (t) => Buffer.from(frameAt(swung, t).getImageData(0, 0, 540, 960).data.buffer);
  const [swingStart, swingCycle] = [swing.at, swing.dur ?? 1];
  assert.ok(!swingFrame(swingStart).equals(swingFrame(swingStart + 1.25 * swingCycle)), "a there-and-back swing is still swinging in its second cycle");
  assert.ok(swingFrame(swingStart).equals(swingFrame(swingStart + 6)), "a there-and-back swing stops by five seconds where it began");

  const quick = film([circle("a", "main")], [[{ do: "show", targets: ["a"] }], ...Array.from({ length: 6 }, () => [{ do: "attention", target: "a", verb: "rings" }])]);
  quick.scenes[0].beats.forEach((beat) => (beat.pace = "instant"));
  const bursts = rendered(quick, { backgroundColor: "#16222c" });
  const around = resolvedObject(bursts, "a").box;
  const region = { x: around.x - 150, y: around.y - 150, w: around.w + 300, h: around.h + 300 };
  const samples = [];
  for (let t = 0; t < bursts.slide.duration; t += 1 / 30) samples.push([t, luminance(frameAt(bursts, t), region)]);
  const [low, high] = [Math.min(...samples.map(([, l]) => l)), Math.max(...samples.map(([, l]) => l))];
  const peaks = samples.filter(([, l], i) => i > 0 && i < samples.length - 1 && l > low + (high - low) * 0.3 && l >= samples[i - 1][1] && l > samples[i + 1][1]).map(([t]) => t);
  assert.ok(peaks.length >= 1 && peaks.every((t) => peaks.filter((other) => other >= t && other < t + 1).length <= 3), `no more than three flashes in any second, got peaks at ${peaks.map((t) => t.toFixed(2))}`);
}

{
  const onPicture = (picture, points) => points.map(([x, y]) => [picture.box.x + x * picture.box.w, picture.box.y + y * picture.box.h]);
  const inside = ([px, py], polygon) => polygon.reduce((odd, [xi, yi], i) => {
    const [xj, yj] = polygon[(i + polygon.length - 1) % polygon.length];
    return yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi ? !odd : odd;
  }, false);
  const meets = (polygon, { x, y, w, h }) => {
    const samples = Array.from({ length: 11 }, (_, i) => i / 10).flatMap((t) => [[x + w * t, y], [x + w * t, y + h], [x, y + h * t], [x + w, y + h * t]]);
    return samples.some((point) => inside(point, polygon)) || polygon.some(([px, py]) => px > x && px < x + w && py > y && py < y + h);
  };
  const framed = ({ x, y, w, h }) => x >= 0 && y >= 0 && x + w <= 540 && y + h <= 960;
  const square = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  // Writing "near" a part of a picture stands off the picture's drawn silhouette, not over the body round the part.
  const person = { id: "person", kind: "image", src: PNG_1x1, aspect: 0.46, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { heart: [0.45, 0.3, 0.12, 0.08] }, outlines: { heart: square(0.45, 0.3, 0.12, 0.08) }, silhouette: [[0.35, 0], [0.65, 0], [0.9, 0.25], [0.75, 1], [0.25, 1], [0.1, 0.25]] };
  const rate = compiled(film([person, { id: "rate", kind: "measure", value: 70, unit: "beats a minute", role: "annotation", placement: { mode: "relative", target: "person.heart", relation: "near" } }], [[{ do: "show", targets: ["person", "rate"] }]]));
  const [personObject, rateBox] = [resolvedObject(rate, "person"), resolvedObject(rate, "rate").box];
  assert.ok(!meets(onPicture(personObject, person.silhouette), rateBox) && framed(rateBox), "writing near a part inside a body stands off the body's silhouette, inside the frame");

  // A picture made of its parts: writing near one part stays off that part and off the others, as part labels do.
  const rocket = { id: "rocket", kind: "image", src: PNG_1x1, aspect: 0.43, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { nose: [0.3, 0, 0.4, 0.25], body: [0.1, 0.25, 0.8, 0.5], nozzle: [0.25, 0.75, 0.5, 0.25] }, outlines: { nose: square(0.3, 0, 0.4, 0.25), body: square(0.1, 0.25, 0.8, 0.5), nozzle: square(0.25, 0.75, 0.5, 0.25) }, silhouette: [[0.3, 0], [0.7, 0], [0.9, 0.25], [0.9, 0.75], [0.75, 1], [0.25, 1], [0.1, 0.75], [0.1, 0.25]] };
  const weighed = compiled(film([rocket, { id: "mass", kind: "measure", value: 4, unit: "kg", role: "annotation", placement: { mode: "relative", target: "rocket.body", relation: "near" } }], [[{ do: "show", targets: ["rocket", "mass"] }]]));
  const [rocketObject, massBox] = [resolvedObject(weighed, "rocket"), resolvedObject(weighed, "mass").box];
  assert.ok(Object.values(rocket.outlines).every((outline) => !meets(onPicture(rocketObject, outline), massBox)), "a mass near a rocket's body is printed on none of its parts");

  // A lead sent up the screen is sized for the journey: at least half of it is seen once its arrival is held on screen.
  const launch = compiled(film([{ id: "tall", kind: "image", src: PNG_1x1, aspect: 0.43, role: "primary", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["tall"] }], [{ do: "motion", target: "tall", motion: "move", to: "strip" }]]));
  const tall = resolvedObject(launch, "tall");
  const [, arrivedY] = component(launch, "tall").motions[0].to;
  // The strip's middle, 56 down, is where it was sent.
  const journey = tall.position[1] - 56;
  assert.ok(tall.position[1] - arrivedY >= journey / 2 - 1, `a travelling lead is seen covering half its journey, moved ${Math.round(tall.position[1] - arrivedY)} of ${Math.round(journey)}`);

  // A close-up fits what is drawn at its target when it lands, with a margin: a heart irised in over the body is not cropped.
  const closeUp = compiled(
    film(
      [
        { id: "body", kind: "image", src: PNG_1x1, aspect: 0.46, role: "primary", placement: { mode: "zone", zone: "main" }, initial: "visible", hotspots: { heart: [0.45, 0.25, 0.1, 0.08] } },
        { id: "heart", kind: "image", src: PNG_1x1, aspect: 0.9, role: "primary", placement: { mode: "zone", zone: "main" } },
      ],
      [[{ do: "camera", target: "body.heart", shot: "close", movement: "push" }, { do: "hide", targets: ["body"], exit: "fade" }, { do: "show", targets: ["heart"], entrance: "iris" }]],
    ),
  );
  const heartBox = resolvedObject(closeUp, "heart").box;
  const push = closeUp.gcl.find((item) => item.type === "camera");
  assert.ok(heartBox.w * push.zoom <= 540 && heartBox.h * push.zoom <= 960, `a close-up keeps the picture it lands on whole, zoom ${push.zoom.toFixed(2)}`);

  // The date-and-place badge hangs from the bottom-left corner of the main picture.
  const dated = compiled(film([{ id: "map", kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" } }, { id: "where", kind: "text", text: "Munich", textRole: "caption", role: "hud", placement: { mode: "zone", zone: "badge" } }], [[{ do: "show", targets: ["map", "where"] }]]));
  const [mapBox, badgeBox] = [resolvedObject(dated, "map").box, resolvedObject(dated, "where").box];
  assert.ok(Math.abs(badgeBox.x - mapBox.x) < 2 && badgeBox.y >= mapBox.y + mapBox.h && badgeBox.y - (mapBox.y + mapBox.h) < 20, "the badge sits just under the main picture's bottom-left corner");

  // The question chip takes the same strip slot in every scene that declares it, where it is authored after the timeline or before it.
  const clockScene = (id, objects) => ({ id, composition: "custom-relational", narration: "A scene of the film with its timeline.", objects: [...objects, { id: "years", kind: "timeline", from: 1938, to: 1940, role: "annotation", placement: { mode: "zone", zone: "strip" } }, circle("a", "main")], beats: [{ id: "b0", pace: "normal", actions: [{ do: "show", targets: ["years", "a"] }] }] });
  const chip = { id: "q", kind: "question", text: "Why then?", placement: { mode: "zone", zone: "strip" } };
  const clocked = compiled({ version: "1", title: "strip", theme: "parchment", scenes: [clockScene("s1", []), clockScene("s2", [])].map((scene, index) => ({ ...scene, objects: index === 0 ? [...scene.objects, chip] : [chip, ...scene.objects] })) });
  const slots = clocked.resolved.scenes.map((scene) => ["q", "years"].map((id) => scene.objects.find((object) => object.id === id).box.y));
  assert.ok(slots.every(([q, years]) => q < years) && Math.abs(slots[0][0] - slots[1][0]) < 0.5 && Math.abs(slots[0][1] - slots[1][1]) < 0.5, "the chip and the timeline keep their strip slots from scene to scene");

  // A figure set near a part of a map stands on that part, and a name set below the figure stays right under it.
  const europe = { id: "europe", kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" }, initial: "visible", hotspots: { britain: [0.05, 0.05, 0.2, 0.35], france: [0.1, 0.45, 0.35, 0.4] }, outlines: { britain: square(0.05, 0.05, 0.2, 0.35), france: square(0.1, 0.45, 0.35, 0.4) }, silhouette: square(0, 0, 1, 1) };
  const stood = compiled(
    film(
      [europe, { id: "official", kind: "image", src: PNG_1x1, aspect: 0.4, role: "support", placement: { mode: "relative", target: "europe.britain", relation: "near" } }, { id: "name", kind: "text", text: "Britain", textRole: "caption", role: "annotation", size: "tag", placement: { mode: "relative", target: "official", relation: "below" } }],
      [[{ do: "show", targets: ["official", "name"] }]],
    ),
  );
  const [britainBox, officialObject, nameBox, europeBox] = [resolvedObject(stood, "europe.britain").box, resolvedObject(stood, "official"), resolvedObject(stood, "name").box, resolvedObject(stood, "europe").box];
  const [ox, oy] = officialObject.position;
  assert.ok(ox > britainBox.x && ox < britainBox.x + britainBox.w && oy > britainBox.y && oy < britainBox.y + britainBox.h, "a figure near a map part stands on it");
  assert.ok(Math.abs(nameBox.x + nameBox.w / 2 - ox) < 4 && nameBox.y >= officialObject.box.y + officialObject.box.h && nameBox.y < europeBox.y + europeBox.h, "the figure's name sits under it on the map, not pushed off the map");

  // The name of a figure's side sits off the middle of that side, on the side its relation faces.
  const sides = compiled(
    film(
      [
        { id: "tri", kind: "path", d: "M280 340 L400 340 L280 500 Z", stroke: "ink", size: "large", role: "primary", placement: { mode: "zone", zone: "main" } },
        { id: "ac", kind: "path", frame: "tri", d: "M280 340 L280 500", stroke: "muted" },
        { id: "bc", kind: "path", frame: "tri", d: "M400 340 L280 500", stroke: "muted" },
        { id: "b", kind: "text", text: "b", textRole: "caption", role: "annotation", size: "small", placement: { mode: "relative", target: "ac", relation: "left-of" } },
        { id: "c", kind: "text", text: "c", textRole: "caption", role: "annotation", size: "small", placement: { mode: "relative", target: "bc", relation: "right-of" } },
      ],
      [[{ do: "show", targets: ["tri", "ac", "bc", "b", "c"] }]],
    ),
  );
  for (const [side, name, sign] of [["ac", "b", -1], ["bc", "c", 1]]) {
    const points = component(sides, side).points;
    const [[x0, y0], [x1, y1]] = [points[0], points.at(-1)];
    const label = resolvedObject(sides, name);
    const [lx, ly] = label.position;
    const length = Math.hypot(x1 - x0, y1 - y0);
    const offset = ((x1 - x0) * (ly - y0) - (y1 - y0) * (lx - x0)) / length;
    const along = ((lx - x0) * (x1 - x0) + (ly - y0) * (y1 - y0)) / length / length;
    assert.ok(Math.abs(along - 0.5) < 0.1 && Math.abs(offset) < Math.hypot(label.box.w, label.box.h) / 2 + 14, `side ${name} is named off its middle, ${offset.toFixed(1)} from it at ${along.toFixed(2)} along`);
    assert.equal(Math.sign(lx - (x0 + x1) / 2), sign, `side ${name} is named on the side its relation faces`);
  }
}

// State carries, labels are laid out once per scene, and categories keep one colour across the film.
{
  const MIN_TEXT = 18;
  const sceneOf = (id, objects, beats, extra = {}) => ({ id, composition: "custom-relational", narration: "A scene of the film that carries what it showed.", objects, beats: beats.map((actions, index) => ({ id: `b${index}`, pace: "normal", actions })), ...extra });
  const lessonOf = (scenes, extra = {}) => ({ version: "1", title: "carry", theme: "parchment", scenes, ...extra });
  const perScene = (result) => {
    const out = [];
    result.gcl.forEach((item) => (item.type === "scene" ? out.push([]) : out.at(-1).push(item)));
    return out;
  };
  const objectIn = (result, index, id) => result.resolved.scenes[index].objects.find((object) => object.id === id);
  const near = (a, b, tolerance = 0.5) => Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance && Math.abs(a.w - b.w) <= tolerance && Math.abs(a.h - b.h) <= tolerance;
  const callouts = (items) => items.filter((item) => item.type === "attention" && item.verb === "callout");
  const map = (id, hotspots, outlines, extra = {}) => ({ id, kind: "image", src: PNG_1x1, aspect: 1, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots, outlines, ...extra });
  const square = ([x, y, w, h]) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  // `persist` is read as nothing: a thing is on screen only in the scenes that declare it, and one declared again keeps where and how large it stood.
  const kinds = [
    { id: "p", kind: "text", text: "A note that stays", role: "annotation", placement: { mode: "zone", zone: "footer" } },
    { id: "p", kind: "shape", shape: "circle", size: "small", placement: { mode: "zone", zone: "main-left" } },
    { id: "p", kind: "path", d: "M0 0 L1000 1000", stroke: "ink", size: "small", placement: { mode: "zone", zone: "main-right" } },
    { id: "p", kind: "image", src: PNG_1x1, aspect: 1, size: "small", placement: { mode: "zone", zone: "main-right" } },
    { id: "p", kind: "equation", value: "a^2+b^2=c^2", placement: { mode: "zone", zone: "support" } },
    { id: "p", kind: "measure", value: 70, unit: "bpm", placement: { mode: "zone", zone: "support" } },
    { id: "p", kind: "diagram", layout: "sequence", nodes: [{ id: "a", label: "Seed" }, { id: "b", label: "Plant" }], placement: { mode: "zone", zone: "support" } },
    { id: "p", kind: "timeline", from: 1930, to: 1945, events: [{ at: 1939, label: "War" }] },
  ];
  for (const object of kinds) {
    const result = compiled(lessonOf([
      sceneOf("s1", [{ ...object, persist: true }, circle("a", "main")], [[{ do: "show", targets: ["a", "p"] }]]),
      sceneOf("s2", [circle("b", "main")], [[{ do: "show", targets: ["b"] }], [{ do: "hide", targets: ["p"] }]]),
      sceneOf("s3", [object, circle("c", "main")], [[{ do: "show", targets: ["c", "p"] }]]),
      sceneOf("s4", [object, circle("d", "main")], [[{ do: "show", targets: ["d", "p"] }]]),
    ]));
    assert.equal(result.lesson.scenes.length, 4, `a film still marking a ${object.kind} persist plays every scene`);
    assert.ok(!objectIn(result, 1, "p"), `a ${object.kind} marked persist is not carried into a scene that does not declare it`);
    const [third, fourth] = [objectIn(result, 2, "p"), objectIn(result, 3, "p")];
    assert.ok(third && fourth && near(third.box, fourth.box) && Math.abs(third.size - fourth.size) < 1e-6, `a ${object.kind} declared again keeps where and as large as it stood`);
  }

  // A thing declared again starts from where the scene before's motions left it: moved, and turned.
  const ball = { id: "ball", kind: "shape", shape: "disc", size: "small", category: "allies", placement: { mode: "zone", zone: "main-left" } };
  const rocket = { id: "rocket", kind: "image", src: PNG_1x1, aspect: 0.5, size: "medium", tint: "strong", category: "allies", placement: { mode: "zone", zone: "main" } };
  const moved = compiled(lessonOf([
    sceneOf("s1", [ball, circle("goal", "main-right"), rocket],
      [[{ do: "show", targets: ["ball", "goal", "rocket"] }], [{ do: "motion", target: "ball", motion: "move", to: "goal", land: "centre" }], [{ do: "motion", target: "rocket", motion: "spin", sweep: 180 }]]),
    sceneOf("s2", [ball, rocket, circle("other", "footer")], [[{ do: "show", targets: ["ball", "rocket", "other"] }]]),
    sceneOf("s3", [{ id: "rocket", kind: "image", src: PNG_1x1, aspect: 0.5, size: "medium", placement: { mode: "zone", zone: "main" } }, circle("goal", "main-right")], [[{ do: "show", targets: ["rocket", "goal"] }], [{ do: "motion", target: "rocket", motion: "spin", sweep: 90 }]]),
  ]));
  const goal = objectIn(moved, 0, "goal");
  const ballAgain = objectIn(moved, 1, "ball");
  assert.ok(Math.hypot(ballAgain.position[0] - goal.position[0], ballAgain.position[1] - goal.position[1]) < 1, "a thing declared again starts the next scene where its motion left it");
  assert.equal(Math.round(Math.abs(objectIn(moved, 1, "rocket").turned)), 180, "a picture declared again starts turned as its spin left it");
  assert.ok(Math.abs(Math.abs(perScene(moved)[1].find((item) => item.id === "rocket").rotate) - Math.PI) < 1e-3, "the turn is drawn");
  assert.equal(Math.round(Math.abs(objectIn(moved, 2, "rocket").turned)), 180, "the same picture declared again keeps the turn the scene before left it in");
  assert.ok(near(objectIn(moved, 2, "rocket").box, objectIn(moved, 1, "rocket").box), "the same picture declared again keeps its place and size");
  const tinted = (items, id) => items.find((item) => item.type === "region" && item.id === id);
  assert.ok(tinted(perScene(moved)[1], "rocket.~tint")?.wash.alpha === 0.42, "a picture declared again with its tint keeps it");
  assert.equal(perScene(moved)[1].find((item) => item.id === "ball").stroke, tinted(perScene(moved)[1], "rocket.~tint").wash.color, "a category keeps its colour from scene to scene");

  // A label stays until it or its target is hidden, or the scene ends: a `hide` naming its `id` takes it
  // off, `persist` is read as nothing, and the next scene showing the picture writes no name it did not ask for.
  const parts = { france: [0.1, 0.5, 0.35, 0.3], germany: [0.5, 0.2, 0.35, 0.35] };
  const outlines = Object.fromEntries(Object.entries(parts).map(([name, box]) => [name, square(box)]));
  const named = compiled(lessonOf([
    sceneOf("s1", [map("europe", parts, outlines, { persist: true })], [[{ do: "show", targets: ["europe"] }], [{ do: "label", id: "france-name", target: "europe.france", text: "France", persist: true, emphasis: "quiet" }, { do: "label", target: "europe.germany", text: "Germany" }], [{ do: "hide", targets: ["france-name"] }, { do: "attention", target: "europe", verb: "outline" }]]),
    sceneOf("s2", [map("europe", parts, outlines)], [[{ do: "show", targets: ["europe"] }]]),
  ]));
  assert.equal(named.lesson.scenes.length, 2, "a film still written with label ids and `persist` plays every scene");
  const [kept, fading] = [callouts(perScene(named)[0]).find((c) => c.text === "France"), callouts(perScene(named)[0]).find((c) => c.text === "Germany")];
  const [firstScene] = named.resolved.scenes;
  const offBeat = firstScene.beats[2];
  assert.ok(kept.exit && Math.abs(kept.exit.out + kept.exit.dur - offBeat.actions.find((a) => a.source.do === "hide").end) < 1e-6, "a label hidden by its id leaves on that hide");
  assert.ok(fading.exit && Math.abs(fading.exit.out + fading.exit.dur - firstScene.duration) < 1e-6, "a label stays to the end of its scene");
  assert.equal(callouts(perScene(named)[1]).length, 0, "no label is written again in the next scene");

  // Quiet writing has no plate, is drawn over every picture and reads at lower contrast than attention.
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const page = "#efe2c4";
  assert.ok(kept.subdued === true && kept.container === "text" && kept.layer === "annotation", "a quiet label has no plate and is drawn over the picture");
  assert.ok(contrast(kept.ink, page) < contrast(fading.ink, page), "a quiet label is lower in contrast than an attention label");
  const captions = compiled(lessonOf([sceneOf("s1", [map("europe", parts, outlines), { id: "q", kind: "text", text: "Europe", emphasis: "quiet", placement: { mode: "anchor", target: "europe.germany" } }, { id: "a", kind: "text", text: "Europe", placement: { mode: "anchor", target: "europe.france" } }], [[{ do: "show", targets: ["europe", "q", "a"] }]])]));
  const [quietText, loudText] = [component(captions, "q"), component(captions, "a")];
  assert.ok(quietText.plate === undefined && loudText.plate === true && quietText.layer === "annotation", "quiet writing on a picture has no plate and is drawn over it");
  assert.ok(contrast(quietText.color, page) < contrast(loudText.color ?? "#38352f", page), "quiet writing is lower in contrast");

  // Pointer labels of one picture stack in a column beside it that never overlaps and stays in frame.
  for (let count = 2; count <= 12; count++) {
    const many = Object.fromEntries(Array.from({ length: count }, (_, i) => [`p${i}`, [0.4 + (i % 3) * 0.05, 0.1 + (0.8 * i) / count, 0.04, 0.03]]));
    const body = map("body", many, Object.fromEntries(Object.entries(many).map(([name, box]) => [name, square(box)])), { size: "large" });
    const result = compiled(lessonOf([sceneOf("s1", [body], [[{ do: "show", targets: ["body"] }], Object.keys(many).map((name, i) => ({ do: "label", target: `body.${name}`, text: `Part number ${i}`, place: "pointer" }))])]));
    const boxes = callouts(result.gcl).map((c) => {
      const [w, h] = [c.text.length * c.fontPx * 0.55 + 18, c.fontPx + 18];
      return { x: c.spot[0] - w / 2, y: c.spot[1] - h / 2, w, h, fontPx: c.fontPx };
    });
    assert.equal(boxes.length, count, `${count} pointer labels are all written`);
    for (const box of boxes) {
      assert.ok(box.x >= 8 - 0.5 && box.y >= 8 - 0.5 && box.x + box.w <= 532 + 0.5 && box.y + box.h <= 952 + 0.5, `a pointer label of ${count} stays in frame`);
      assert.ok(box.fontPx >= MIN_TEXT, "a pointer label never shrinks below the smallest writing");
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const apart = a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
        assert.ok(apart, `pointer labels ${i} and ${j} of ${count} never overlap`);
      }
    assert.ok(callouts(result.gcl).every((c) => c.leader === true && c.point), "every pointer label has a line to its part");
  }

  // A name asked inside its part shrinks to fit there, and never below the smallest writing.
  const probe = compiled(lessonOf([sceneOf("s1", [map("land", { a: [0.1, 0.1, 0.5, 0.2] }, { a: square([0.1, 0.1, 0.5, 0.2]) })], [[{ do: "show", targets: ["land"] }]])]));
  const landBox = objectIn(probe, 0, "land").box;
  const word = "Abcdefghijkl";
  // Wide enough for the word at 23 units, not at 24: between a tag's size and its floor.
  const wide = (word.length * 23.5 * 0.55 + 4) / landBox.w;
  const tight = map("land", { a: [0.1, 0.4, wide, 0.12] }, { a: square([0.1, 0.4, wide, 0.12]) });
  const shrunk = callouts(compiled(lessonOf([sceneOf("s1", [tight], [[{ do: "show", targets: ["land"] }], [{ do: "label", target: "land.a", text: word, size: "tag", emphasis: "quiet", place: "inside" }]])])).gcl)[0];
  assert.ok(shrunk.leader === false && shrunk.fontPx < 24 && shrunk.fontPx >= MIN_TEXT, `a name that fits only smaller is shrunk to fit inside its part (${shrunk.fontPx})`);
  const sliver = map("land", { a: [0.1, 0.4, 0.05, 0.02] }, { a: square([0.1, 0.4, 0.05, 0.02]) });
  const outside = callouts(compiled(lessonOf([sceneOf("s1", [sliver], [[{ do: "show", targets: ["land"] }], [{ do: "label", target: "land.a", text: word, size: "tag", place: "inside" }]])])).gcl)[0];
  assert.ok(outside.leader === true && outside.fontPx >= MIN_TEXT, "a name that fits inside at no readable size takes a pointer line instead");

  // Categories: one colour per category in every scene and every kind of thing, and a key in exactly those colours.
  const coded = compiled(lessonOf([
    sceneOf("s1", [map("europe", parts, outlines), { id: "key", kind: "legend", categories: "film", tint: "faint", placement: { mode: "zone", zone: "footer" } }, { id: "t", kind: "text", text: "Allies", category: "allies", placement: { mode: "zone", zone: "support" } }],
      [[{ do: "show", targets: ["europe", "key", "t"] }]], { categories_of: { "europe.france": "allies", "europe.germany": "axis" } }),
    sceneOf("s2", [{ id: "bars", kind: "chart", chart: "bar", data: [{ label: "Germany", value: 3, category: "axis" }, { label: "France", value: 2, category: "allies" }], placement: { mode: "zone", zone: "main" } }, { id: "years", kind: "timeline", from: 1939, to: 1945, eras: [{ from: 1939, to: 1942, label: "Early war", category: "allies" }] }],
      [[{ do: "show", targets: ["bars", "years"] }]]),
  ], { categories: [{ id: "allies", name: "Allies" }, { id: "axis", name: "Axis", color: "danger" }] }));
  const [one, two] = perScene(coded);
  const allies = tinted(one, "europe.france~tint").wash;
  const axis = tinted(one, "europe.germany~tint").wash;
  assert.ok(allies.alpha === 0.25 && axis.alpha === 0.25, "a part's category is a faint still wash by default");
  assert.equal(axis.color, "#e08a80", "a declared category colour is used as declared");
  assert.equal(one.find((item) => item.id === "t").color, allies.color, "writing in a category takes its colour");
  const chart = two.find((item) => item.id === "bars");
  assert.deepEqual(chart.data.map((d) => d.color), [axis.color, allies.color], "a chart's categories take the film's colours in a later scene");
  const era = two.find((item) => item.id === "years");
  assert.ok(JSON.stringify(era).includes(allies.color), "a timeline era takes its category's colour");
  const key = one.find((item) => item.id === "key");
  assert.deepEqual(key.categories, ["Allies", "Axis"], "a key of the film lists its declared categories by name");
  assert.deepEqual(key.colors, [allies.color, axis.color], "the key's swatches are the tints' own colours");
  assert.equal(key.swatchAlpha, allies.alpha, "a key to faint tints is faint");
  assert.ok(diagnostics(compileLessonSpec(lessonOf([sceneOf("s1", [map("europe", parts, outlines)], [[{ do: "show", targets: ["europe"] }]], { categories_of: { "europe.spain": "allies" } })]))).some((d) => d.code === "DROPPED_FIELD"), "a colour for a part the scene does not have is dropped and reported");
  const flow = compiled(lessonOf([sceneOf("s1", [{ id: "d", kind: "diagram", layout: "sequence", nodes: [{ id: "a", label: "Treaty" }, { id: "b", label: "Invasion" }], placement: { mode: "zone", zone: "main" } }, { id: "k", kind: "legend", categories: ["axis", "allies"], placement: { mode: "zone", zone: "footer" } }], [[{ do: "show", targets: ["d", "k"] }]], { categories_of: { "d.a": "allies", "d.b": "axis" } })], { categories: [{ id: "allies", name: "Allies" }, { id: "axis", name: "Axis", color: "danger" }] }));
  const [nodeA, nodeB] = [tinted(flow.gcl, "d.a~tint"), tinted(flow.gcl, "d.b~tint")];
  assert.deepEqual([nodeA?.wash.color, nodeB?.wash.color], [allies.color, axis.color], "a diagram's nodes take the same category colours as a picture's parts");
  assert.deepEqual(component(flow, "k").colors, [axis.color, allies.color], "a key naming its categories shows them in the film's colours");

  // The strip's band is kept clear only in a scene that shows a strip; names and captions set on the main picture never move it.
  const slot = compiled(lessonOf([
    sceneOf("s1", [map("m1939", parts, outlines), { id: "years", kind: "timeline", from: 1938, to: 1945, events: [{ at: 1939, label: "War" }] }], [[{ do: "show", targets: ["m1939", "years"] }]]),
    sceneOf("s2", [map("m1940", parts, outlines)], [[{ do: "show", targets: ["m1940"] }], [{ do: "label", target: "m1940.france", text: "France" }]]),
    sceneOf("s3", [map("m1941", parts, outlines), { id: "cap", kind: "text", text: "Britain stands alone", role: "annotation", placement: { mode: "relative", target: "m1941.germany", relation: "above" } }], [[{ do: "show", targets: ["m1941", "cap"] }]]),
  ]));
  const slots = ["m1939", "m1940", "m1941"].map((id, index) => objectIn(slot, index, id).box);
  assert.ok(slots[1].y < slots[0].y - 20 && Math.abs(slots[1].w - slots[0].w) < 1, `without a strip the main picture rises into the band, as large: ${JSON.stringify(slots)}`);
  assert.ok(near(slots[1], slots[2], 1), `a caption set on the main picture never moves it: ${JSON.stringify(slots)}`);
}

{
  // Frames, handles, glows and notation — properties over many random figures and every kind, not cases.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const unit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  const inside = (point, polygon) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  // Star-shaped polygons: convex and concave, wound either way round.
  const polygon = (n, clockwise) => {
    const angles = Array.from({ length: n }, () => random() * Math.PI * 2).sort((a, b) => a - b);
    const ring = angles.map((a) => { const r = 150 + random() * 300; return [Math.round(500 + Math.cos(a) * r), Math.round(500 + Math.sin(a) * r)]; });
    return clockwise ? ring : ring.reverse();
  };

  {
    // ── Frames: a figure's corners and sides set frames a writer composes any real mark in ─────────
    let checked = 0;
    for (let trial = 0; trial < 24; trial++) {
      const ring = polygon(3 + (trial % 5), trial % 2 === 0);
      const d = `M${ring.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
      const n = ring.length;
      const i = trial % n;
      const result = compileLessonSpec(film(
        [
          { id: "fig", kind: "path", d, stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } },
          { id: "mark", kind: "path", in: `fig.v${i}`, d: "M30 0 L30 30 L0 30", stroke: "accent" },
          { id: "tick", kind: "path", in: `fig.s${i}@0.5`, d: "M0 0 L0 40", stroke: "accent" },
          { id: "label", kind: "equation", value: "c", in: `fig.s${i}@0.5`, at: [0, 24] },
        ],
        [[{ do: "show", targets: ["fig", "mark", "tick", "label"] }], [{ do: "attention", target: `fig.s${i}`, verb: "outline" }, { do: "label", target: `fig.s${i}`, text: "side" }]],
      ));
      if (!result.valid) continue;
      const fig = component(result, "fig");
      const corners = fig.figure.corners;
      const scale = fig.figure.unit;
      const [v, next, prev] = [corners[i], corners[(i + 1) % n], corners[(i - 1 + n) % n]];
      const [along, back] = [unit(sub(next, v)), unit(sub(prev, v))];
      const [p0, p1, p2] = component(result, "mark").points;
      const near = (a, b, tol = 0.01) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
      assert.ok(near(p0, [v[0] + along[0] * 30 * scale, v[1] + along[1] * 30 * scale]), `trial ${trial}: x of a corner frame runs along the side to the next corner`);
      assert.ok(near(p2, [v[0] + back[0] * 30 * scale, v[1] + back[1] * 30 * scale]), `trial ${trial}: y of a corner frame runs along the side to the previous corner`);
      assert.ok(near(p1, [p0[0] + p2[0] - v[0], p0[1] + p2[1] - v[1]]), `trial ${trial}: the mark closes on the corner's own parallelogram`);
      const [t0, t1] = [component(result, "tick").points[0], component(result, "tick").points.at(-1)];
      assert.ok(near(t0, [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2]), `trial ${trial}: s${i}@0.5 is the side's middle`);
      const step = unit(sub(t1, t0));
      const [outPoint, inPoint] = [[t0[0] + step[0] * 2, t0[1] + step[1] * 2], [t0[0] - step[0] * 2, t0[1] - step[1] * 2]];
      assert.ok(!inside(outPoint, corners) && inside(inPoint, corners), `trial ${trial}: y of a side frame points out of the figure (concave or convex, either winding)`);
      assert.ok(Math.abs(Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) - 40 * scale) < 0.01 && Math.abs((t1[0] - t0[0]) * along[0] + (t1[1] - t0[1]) * along[1]) < 0.01, `trial ${trial}: the side frame's y is square to the side, in grid units`);
      const label = resolvedObject(result, "label").box;
      const normal = step;
      const middle = t0;
      const offs = [[label.x, label.y], [label.x + label.w, label.y], [label.x, label.y + label.h], [label.x + label.w, label.y + label.h]].map(([x, y]) => (x - middle[0]) * normal[0] + (y - middle[1]) * normal[1]);
      const clamped = label.x <= 28 || label.x + label.w >= 512 || label.y <= 30 || label.y + label.h >= 930;
      assert.ok(clamped || Math.abs(Math.min(...offs) - 24 * scale) < 0.5, `trial ${trial}: writing set off a side keeps its whole box that far outside the side (${Math.min(...offs).toFixed(2)} vs ${(24 * scale).toFixed(2)})`);
      checked++;
    }
    assert.ok(checked >= 20, `most random figures are valid (${checked})`);

    // A span laid along a side is a dimension line on the figure's outside; anywhere else, the distance itself.
    for (let trial = 0; trial < 8; trial++) {
      const ring = polygon(3 + (trial % 4), trial % 2 === 1);
      const d = `M${ring.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
      const n = ring.length;
      const i = trial % n;
      const result = compileLessonSpec(film(
        [{ id: "fig", kind: "path", d, stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } }, { id: "len", kind: "span", from: `fig.v${i}`, to: `fig.v${(i + 1) % n}` }, { id: "back", kind: "span", from: `fig.v${(i + 1) % n}`, to: `fig.v${i}` }],
        [[{ do: "show", targets: ["fig", "len", "back"] }]],
      ));
      if (!result.valid) continue;
      const corners = component(result, "fig").figure.corners;
      for (const id of ["len", "back"]) {
        const line = component(result, id).children.find((child) => child.arrow === "both");
        const [a, b] = [corners[i], corners[(i + 1) % n]];
        const [la, lb] = id === "len" ? line.points : [...line.points].reverse();
        const shift = [la[0] - a[0], la[1] - a[1]];
        const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const toward = unit([(la[0] + lb[0]) / 2 - middle[0], (la[1] + lb[1]) / 2 - middle[1]]);
        assert.ok(Math.abs(lb[0] - b[0] - shift[0]) < 0.01 && Math.abs(lb[1] - b[1] - shift[1]) < 0.01 && Math.abs(Math.hypot(...shift) - 16) < 0.01, `trial ${trial}: the dimension line is the side moved 16 units square off it`);
        assert.ok(!inside([middle[0] + toward[0], middle[1] + toward[1]], corners), `trial ${trial}: it stands on the figure's outside, whichever way it is named`);
        assert.deepEqual(component(result, id).ends0.map((p) => p.map(Math.round)), [corners[id === "len" ? i : (i + 1) % n], corners[id === "len" ? (i + 1) % n : i]].map((p) => p.map(Math.round)), "its ends are the corners exactly, never pulled in");
      }
    }

    // A frame on a box runs 0–1000 down its height whatever its shape; `frame` still reads as `in`.
    const tall = compiled(film(
      [
        { id: "pic", kind: "image", src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==", aspect: 0.4, size: "large", placement: { mode: "zone", zone: "main" } },
        { id: "down", kind: "path", in: "pic", d: "M500 0 L500 1000", stroke: "accent" },
        { id: "old", kind: "path", frame: "pic", d: "M0 500 L1000 500", stroke: "accent" },
      ],
      [[{ do: "show", targets: ["pic", "down", "old"] }]],
    ));
    const pic = resolvedObject(tall, "pic").box;
    const [top, bottom] = [component(tall, "down").points[0], component(tall, "down").points.at(-1)];
    assert.ok(Math.abs(top[1] - pic.y) < 0.5 && Math.abs(bottom[1] - (pic.y + pic.h)) < 0.5, "y 0–1000 spans the picture's height, not its width");
    assert.ok(Math.abs(component(tall, "old").points[0][1] - (pic.y + pic.h / 2)) < 0.5, "a stored `frame` is read as `in`");
  }


  {
    // ── Rendering: no injected marks, glows on own geometry, handles follow the figure ───────────
    const W = 540, H = 960;
    const frameAt = (spec, t) => {
      const rendered = renderLessonSpec(spec);
      assert.equal(rendered.valid, true, rendered.valid ? undefined : JSON.stringify(rendered.errors));
      const ctx = createCanvas(W, H).getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      rendered.slide.render(ctx, t);
      return { data: ctx.getImageData(0, 0, W, H).data, rendered };
    };
    // Pixels that differ between two frames, as a mask.
    const differ = (a, b, threshold = 40) => {
      const mask = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) {
        const k = p * 4;
        if (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]) > threshold) mask[p] = 1;
      }
      return mask;
    };
    // Chamfer distance from every pixel to the nearest set pixel of a mask.
    const distance = (mask) => {
      const d = new Float32Array(W * H).fill(1e9);
      for (let p = 0; p < W * H; p++) if (mask[p]) d[p] = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (x > 0) d[p] = Math.min(d[p], d[p - 1] + 1);
        if (y > 0) d[p] = Math.min(d[p], d[p - W] + 1, x > 0 ? d[p - W - 1] + 1.414 : 1e9, x < W - 1 ? d[p - W + 1] + 1.414 : 1e9);
      }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
        const p = y * W + x;
        if (x < W - 1) d[p] = Math.min(d[p], d[p + 1] + 1);
        if (y < H - 1) d[p] = Math.min(d[p], d[p + W] + 1, x < W - 1 ? d[p + W + 1] + 1.414 : 1e9, x > 0 ? d[p + W - 1] + 1.414 : 1e9);
      }
      return d;
    };
    const count = (mask) => mask.reduce((sum, v) => sum + v, 0);
    const farthest = (mask, to) => { const d = distance(to); let worst = 0; for (let p = 0; p < W * H; p++) if (mask[p]) worst = Math.max(worst, d[p]); return worst; };
    const centroid = (mask) => { let [sx, sy, n] = [0, 0, 0]; for (let p = 0; p < W * H; p++) if (mask[p]) { sx += p % W; sy += Math.floor(p / W); n++; } return [sx / n, sy / n]; };

    // Nothing a stroke paints while it draws on lies outside the stroke it becomes: no pen tip, no head.
    const strokes = [
      { id: "s", kind: "path", d: "M100 800 C300 100 700 100 900 800", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } },
      { id: "s", kind: "path", d: "M100 100 L900 900", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } },
    ];
    for (const stroke of strokes) {
      const empty = film([{ ...stroke, id: "other", initial: "hidden" }], [[{ do: "show", targets: ["other"] }]]);
      const drawing = film([stroke], [[{ do: "show", targets: ["s"], entrance: "draw" }]]);
      const { rendered } = frameAt(drawing, 0);
      const beat = rendered.resolved.scenes[0].beats[0];
      const [blank, mid, done] = [frameAt(empty, 0).data, frameAt(drawing, beat.start + (beat.end - beat.start) * 0.4).data, frameAt(drawing, rendered.slide.duration - 0.05).data];
      const painted = differ(blank, mid);
      const whole = differ(blank, done);
      assert.ok(count(painted) > 20, "the stroke is part drawn");
      assert.ok(farthest(painted, whole) <= 1.5, `a stroke drawing on paints only the stroke it becomes (stray ${farthest(painted, whole).toFixed(1)}px)`);
    }

    // Every kind glows along what it draws: nothing lit lies far from its own pixels, and no box stands in.
    const triangle = { id: "tri", kind: "path", d: "M200 200 L800 800 L200 800 Z", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } };
    const kinds = [
      { target: "tri", objects: [triangle] },
      { target: "tri.s1", objects: [triangle] },
      { target: "corner", objects: [triangle, { id: "corner", kind: "angle", at: "tri.v1", from: "tri.v0", to: "tri.v2" }] },
      { target: "side", objects: [triangle, { id: "side", kind: "span", from: "tri.v0", to: "tri.v1" }] },
      { target: "link", objects: [{ id: "a", kind: "shape", shape: "circle", appearance: "outline", size: "small", placement: { mode: "zone", zone: "main-left" } }, { id: "b", kind: "shape", shape: "circle", appearance: "outline", size: "small", placement: { mode: "zone", zone: "main-right" } }, { id: "link", kind: "line", from: "a", to: "b", arrow: "end" }] },
      { target: "words", objects: [{ id: "words", kind: "text", text: "Pressure", placement: { mode: "zone", zone: "main" } }] },
      { target: "eq", objects: [{ id: "eq", kind: "equation", value: "F = ma", placement: { mode: "zone", zone: "main" } }] },
      { target: "f.g", objects: [{ id: "f", kind: "forces", forces: [{ id: "g", label: "F_{g}", angle: 270, size: 10 }, { id: "n", label: "F_{N}", angle: 90, size: 10 }], placement: { mode: "zone", zone: "main" } }] },
      { target: "d.b", objects: [{ id: "d", kind: "diagram", layout: "sequence", nodes: [{ id: "a", label: "Seed" }, { id: "b", label: "Sprout" }], placement: { mode: "zone", zone: "main" } }] },
    ];
    for (const { target, objects } of kinds) {
      const shown = objects.map((object) => object.id);
      const lit = film(objects, [[{ do: "show", targets: shown }], [{ do: "attention", target, verb: "outline" }]]);
      const { rendered } = frameAt(lit, 0);
      const cue = rendered.resolved.scenes[0].beats[1];
      const at = cue.start + (cue.end - cue.start) * 0.6;
      const plain = frameAt(lit, cue.start - 0.02).data;
      const glowing = frameAt(lit, at).data;
      const glow = differ(plain, glowing, 60);
      const drawn = differ(frameAt(lit, 0).data, plain, 30);
      assert.ok(count(glow) > 30, `${target}: the cue lights something`);
      const reach = farthest(glow, drawn);
      assert.ok(reach <= 10, `${target}: every lit pixel lies on or beside what is drawn (farthest ${reach.toFixed(1)}px)`);
    }

    // A side's glow lights that side alone; its label stands outside the figure.
    {
      const tri = { id: "tri", kind: "path", d: "M200 200 L800 800 L200 800 Z", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } };
      for (const side of [0, 1, 2]) {
        const lit = film([tri], [[{ do: "show", targets: ["tri"] }], [{ do: "attention", target: `tri.s${side}`, verb: "outline" }]]);
        const named = film([tri], [[{ do: "show", targets: ["tri"] }], [{ do: "label", target: `tri.s${side}`, text: "side" }]]);
        const { rendered } = frameAt(lit, 0);
        const cue = rendered.resolved.scenes[0].beats[1];
        const corners = component(compiled(lit), "tri").figure.corners;
        const [a, b] = [corners[side], corners[(side + 1) % 3]];
        const toSide = (x, y) => {
          const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
          return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        };
        const at = cue.start + (cue.end - cue.start) * 0.6;
        const glow = differ(frameAt(lit, cue.start - 0.02).data, frameAt(lit, at).data, 60);
        let worst = 0;
        for (let p = 0; p < W * H; p++) if (glow[p]) worst = Math.max(worst, toSide(p % W, Math.floor(p / W)));
        assert.ok(count(glow) > 30 && worst < 12, `s${side}: the glow runs along that side only (${worst.toFixed(1)}px off it)`);
        const label = differ(frameAt(named, cue.start - 0.02).data, frameAt(named, at).data, 60);
        assert.ok(count(label) > 30 && !inside(centroid(label), corners), `s${side}: a side's label is set on the figure's outside`);
      }
    }

    // A mark on a corner, a dimension line on a side and a glow on a side all go with the figure as it changes shape.
    const morphing = (extra, actions) => film(
      [{ id: "tri", kind: "path", d: "M200 200 L800 800 L200 800 Z", stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } }, ...extra],
      [[{ do: "show", targets: ["tri", ...extra.map((o) => o.id)] }], [{ do: "motion", target: "tri", motion: "morph", d: "M200 200 L900 400 L200 800 Z" }, ...actions]],
    );
    const base = morphing([], []);
    const marked = morphing([{ id: "mark", kind: "path", in: "tri.v1", d: "M60 0 L60 60 L0 60", stroke: "accent" }], []);
    const { rendered } = frameAt(base, 0);
    const end = rendered.slide.duration - 0.05;
    const triangleNow = compiled(base).gcl.find((c) => c.id === "tri").motions.find((m) => m.kind === "morph").toCorners;
    const markPixels = differ(frameAt(base, end).data, frameAt(marked, end).data);
    const [mx, my] = centroid(markPixels);
    const scale = compiled(base).gcl.find((c) => c.id === "tri").figure.unit;
    const centreOf = (corners) => {
      const [v, next, prev] = [corners[1], corners[2], corners[0]];
      const toward = (p) => { const l = Math.hypot(p[0] - v[0], p[1] - v[1]); return [(p[0] - v[0]) / l, (p[1] - v[1]) / l]; };
      const [x, y] = [toward(next), toward(prev)];
      return [v[0] + 45 * scale * (x[0] + y[0]), v[1] + 45 * scale * (x[1] + y[1])];
    };
    const [after, before] = [centreOf(triangleNow), centreOf(compiled(base).gcl.find((c) => c.id === "tri").figure.corners)];
    const offNew = Math.hypot(mx - after[0], my - after[1]);
    const offOld = Math.hypot(mx - before[0], my - before[1]);
    assert.ok(offNew < 6 && offNew < offOld, `a mark drawn on a corner is redrawn on the corner as the figure changes shape (${offNew.toFixed(1)} vs ${offOld.toFixed(1)} px)`);

    const moving = (extra) => film(
      [{ id: "tri", kind: "path", d: "M200 200 L800 800 L200 800 Z", stroke: "ink", size: "medium", placement: { mode: "zone", zone: "main" } }, { id: "spot", kind: "shape", shape: "circle", size: "tiny", appearance: "outline", placement: { mode: "zone", zone: "footer" } }, ...extra],
      [[{ do: "show", targets: ["tri", "spot", ...extra.map((o) => o.id)] }], [{ do: "motion", target: "tri", motion: "move", to: "spot" }]],
    );
    const still = moving([]);
    const carried = moving([{ id: "mark", kind: "path", in: "tri.v1", d: "M60 0 L60 60 L0 60", stroke: "accent" }]);
    const length = frameAt(still, 0).rendered;
    assert.ok(component(compiled(still), "tri").motions?.length, "the figure moves");
    const cueStart = length.resolved.scenes[0].beats[1].start;
    const [rest, last] = [cueStart - 0.02, length.slide.duration - 0.05];
    const markAt = (t) => centroid(differ(frameAt(still, t).data, frameAt(carried, t).data));
    const [m0, m1] = [markAt(rest), markAt(last)];
    const to = component(compiled(still), "tri").motions[0].to;
    const from = resolvedObject(compiled(still), "tri").position;
    const slip = Math.hypot(m1[0] - m0[0] - (to[0] - from[0]), m1[1] - m0[1] - (to[1] - from[1]));
    assert.ok(Math.hypot(to[0] - from[0], to[1] - from[1]) > 40 && slip < 2, `a mark on a corner travels with its figure (slip ${slip.toFixed(1)}px)`);
  }


  {
    // ── Maths: names and units upright, variables italic, whatever the letter ─────────────────────
    const W = 540, H = 960;
    const draw = (value) => {
      const rendered = renderLessonSpec(film([{ id: "eq", kind: "equation", value, size: "large", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["eq"], entrance: "instant" }]]));
      assert.equal(rendered.valid, true, rendered.valid ? undefined : JSON.stringify(rendered.errors));
      const ctx = createCanvas(W, H).getContext("2d");
      rendered.slide.render(ctx, rendered.slide.duration - 0.05);
      return Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    };
    for (const letter of ["m", "N", "kg", "s", "x"]) {
      const upright = draw(`\\mathrm{${letter}}`);
      assert.ok(upright.equals(draw(`\\text{${letter}}`)), `\\mathrm{${letter}} is set like \\text{${letter}}: upright`);
      assert.ok(upright.equals(draw(`\\operatorname{${letter}}`)), `\\operatorname{${letter}} is upright`);
      assert.ok(!upright.equals(draw(letter)), `${letter} alone is an italic variable, not the upright unit`);
      assert.ok(draw(letter).equals(draw(`\\mathit{${letter}}`)), `\\mathit{${letter}} is the variable's italic`);
    }
    for (const accent of ["vec", "hat", "bar", "dot", "overline"]) assert.ok(!draw(`\\${accent}{v}`).equals(draw("v")), `\\${accent} draws its mark over the letter`);
    for (const symbol of ["\\Delta", "\\angle", "\\perp", "\\parallel", "\\infty", "\\pm", "\\times", "\\cdot", "\\to", "\\theta", "\\sqrt[3]{x}", "x_{1}^{2}", "\\frac{a}{b}"])
      assert.equal(compileLessonSpec(film([{ id: "eq", kind: "equation", value: symbol, placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["eq"] }]])).valid, true, `${symbol} is notation the engine writes`);
  }
}

// One placement model and motion by meaning, checked as properties over many generated scenes.
{
  let seed = 20261001;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const inside = ([px, py], polygon) => polygon.reduce((odd, [xi, yi], i) => {
    const [xj, yj] = polygon[(i + polygon.length - 1) % polygon.length];
    return yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi ? !odd : odd;
  }, false);
  const crossesBox = (polygon, { x, y, w, h }) => {
    for (let i = 0; i < polygon.length; i++) {
      const [[ax, ay], [bx, by]] = [polygon[i], polygon[(i + 1) % polygon.length]];
      for (let k = 0; k <= 40; k++) {
        const [px, py] = [ax + ((bx - ax) * k) / 40, ay + ((by - ay) * k) / 40];
        if (px > x + 0.5 && px < x + w - 0.5 && py > y + 0.5 && py < y + h - 0.5) return true;
      }
    }
    return [[x + 1, y + 1], [x + w - 1, y + 1], [x + 1, y + h - 1], [x + w - 1, y + h - 1], [x + w / 2, y + h / 2]].some((corner) => inside(corner, polygon));
  };
  const onPicture = (picture, points) => points.map(([x, y]) => [picture.box.x + x * picture.box.w, picture.box.y + y * picture.box.h]);
  const drawnOf = (picture) => onPicture(picture, picture.source.silhouette ?? [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const boundsOfPoints = (points) => {
    const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };
  // A blob with a random silhouette: a star-shaped polygon round the middle of its frame.
  const blob = (id, zone) => {
    const count = 7 + Math.floor(random() * 6);
    const silhouette = Array.from({ length: count }, (_, k) => {
      const angle = (k / count) * Math.PI * 2;
      const reach = 0.3 + random() * 0.2;
      return [0.5 + Math.cos(angle) * reach, 0.5 + Math.sin(angle) * reach];
    });
    return { id, kind: "image", src: PNG_1x1, aspect: 0.4 + random() * 1.6, size: pick(["compact", "medium", "large"]), placement: { mode: "zone", zone }, silhouette };
  };

  // Writing set on or beside one picture never prints across another picture's drawn silhouette.
  let crossings = 0;
  for (let round = 0; round < 40; round++) {
    const pictures = ["main-left", "main", "main-right", "support"].slice(0, 3 + (round % 2)).map((zone, index) => blob(`pic${index}`, zone));
    const texts = Array.from({ length: 2 + (round % 3) }, (_, index) => ({
      id: `note${index}`,
      kind: "text",
      text: pick(["heat", "the warm side", "air rises", "cold water sinks"]),
      role: "annotation",
      placement: { mode: "relative", target: pick(pictures).id, relation: pick(["above", "below", "left-of", "right-of", "near"]) },
    }));
    const result = compiled(film([...pictures, ...texts], [[{ do: "show", targets: [...pictures, ...texts].map((one) => one.id) }]]));
    for (const text of texts) {
      const box = resolvedObject(result, text.id).box;
      for (const picture of pictures) {
        if (picture.id === text.placement.target) continue;
        if (crossesBox(drawnOf(resolvedObject(result, picture.id)), box)) crossings++;
      }
    }
  }
  assert.equal(crossings, 0, `writing placed against one picture never crosses another's silhouette (${crossings} crossings)`);

  // A picture set "below" or "beside" another keeps off every other picture's silhouette too.
  for (let round = 0; round < 20; round++) {
    const host = blob("host", "main");
    const other = blob("other", pick(["main-left", "main-right"]));
    const guest = { ...blob("guest", "main"), size: "tiny", placement: { mode: "relative", target: "host", relation: pick(["above", "below", "left-of", "right-of"]) } };
    const result = compiled(film([host, other, guest], [[{ do: "show", targets: ["host", "other", "guest"] }]]));
    const guestDrawn = boundsOfPoints(drawnOf(resolvedObject(result, "guest")));
    assert.ok(!crossesBox(drawnOf(resolvedObject(result, "other")), guestDrawn), `a picture set ${guest.placement.relation} another keeps off a third picture's silhouette`);
  }

  // `size.like` sets a drawn dimension from another's — a whole picture's or one part's — within 2%.
  for (let round = 0; round < 24; round++) {
    const base = { ...blob("base", "main"), hotspots: { part: [0.2 + random() * 0.3, 0.2 + random() * 0.3, 0.1 + random() * 0.3, 0.1 + random() * 0.3] } };
    const dimension = pick(["width", "height"]);
    const times = 0.2 + random() * 1.2;
    const like = pick(["base", "base.part"]);
    const sized = { ...blob("sized", "support"), size: { like, dimension, times } };
    const result = compiled(film([base, sized], [[{ do: "show", targets: ["base", "sized"] }]]));
    const reference = like === "base" ? boundsOfPoints(drawnOf(resolvedObject(result, "base"))) : resolvedObject(result, "base.part").box;
    const own = boundsOfPoints(drawnOf(resolvedObject(result, "sized")));
    const [wanted, got] = dimension === "width" ? [reference.w * times, own.w] : [reference.h * times, own.h];
    // Only a speck is raised: to the smallest readable size, never past three fifths of what it is sized against, ringed as a close-up when that is well past its size.
    const frame = resolvedObject(result, "sized").box;
    const [longest, against] = [Math.max(frame.w, frame.h), Math.max(resolvedObject(result, "base").box.w, resolvedObject(result, "base").box.h)];
    if (diagnostics(result).some((item) => item.code === "RAISED_TO_READABLE")) {
      assert.ok(Math.abs(longest - Math.min(90, against * 0.6)) < 0.5 && got > wanted && (longest * wanted) / got < 45.5, `only a speck is raised, to a readable size that stays smaller than its partner (${like})`);
      if (Math.abs(got / wanted - 1.25) > 0.05) assert.equal(component(result, "sized").lens === true, got / wanted > 1.25, `a picture raised well past its stated size is ringed as a close-up (${like})`);
    } else assert.ok(Math.abs(got / wanted - 1) < 0.02, `size like ${like}'s ${dimension} × ${times.toFixed(2)}: wanted ${wanted.toFixed(1)}, got ${got.toFixed(1)}`);
  }

  // A stated size that would run past the frame shrinks what it is sized from, so the two keep their sizes to each other.
  for (const times of [3, 8]) {
    const coin = { ...blob("coin", "main"), aspect: 1 };
    const boat = { ...blob("boat", "support"), aspect: 2.5, size: { like: "coin", dimension: "width", times } };
    const result = compiled(film([coin, boat], [[{ do: "show", targets: ["coin", "boat"] }]]));
    const [c, b] = [boundsOfPoints(drawnOf(resolvedObject(result, "coin"))), boundsOfPoints(drawnOf(resolvedObject(result, "boat")))];
    assert.ok(Math.abs(b.w / (c.w * times) - 1) < 0.02 && b.x >= 7 && b.x + b.w <= 533, `a boat stated ${times} coins wide is ${times} coins wide on screen (${b.w.toFixed(0)} vs ${c.w.toFixed(0)})`);
  }

  // Grown as what the step acts on, or raised to be readable, a picture never passes what carries it nor one carried with it.
  for (let round = 0; round < 12; round++) {
    const ground = { ...blob("ground", "main"), role: "primary", hotspots: { a: [0.1, 0.1, 0.2, 0.2], b: [0.6, 0.6, 0.2, 0.2] } };
    const ship = { ...blob("ship", "main"), size: undefined, role: "support", placement: { mode: "anchor", target: "ground.a" } };
    const rat = { ...blob("rat", "main"), size: undefined, role: "support", placement: { mode: "anchor", target: "ground.b" } };
    const flea = { ...blob("flea", "main"), size: undefined, role: "support", placement: { mode: "relative", target: "rat", relation: "on" } };
    const acted = pick(["flea", "rat"]);
    const result = compiled(film([ground, ship, rat, flea], [[{ do: "show", targets: ["ground", "ship", "rat", "flea"] }], [{ do: "attention", target: acted, verb: "outline" }]]));
    const length = (id) => Math.max(resolvedObject(result, id).box.w, resolvedObject(result, id).box.h);
    assert.ok(length("flea") <= length("rat") + 0.5, `a flea carried on a rat is never drawn past it (${length("flea").toFixed(0)} vs ${length("rat").toFixed(0)}, ${acted} acted on)`);
    if (acted === "rat") assert.ok(length("ship") + 0.5 >= Math.min(length("rat"), 90), "a ship on the same map is raised with the rat it was laid as large as");
  }

  // `attach` sets the thing's own point on the target's point, for every edge with every edge.
  const edges = ["top", "bottom", "left", "right", "center"];
  const edgeOf = ({ x, y, w, h }, edge) => ({ top: [x + w / 2, y], bottom: [x + w / 2, y + h], left: [x, y + h / 2], right: [x + w, y + h / 2], center: [x + w / 2, y + h / 2] })[edge];
  const rocketBox = { id: "rocket", kind: "image", src: PNG_1x1, aspect: 0.45, size: "large", placement: { mode: "zone", zone: "main" }, hotspots: { nozzle: [0.3, 0.8, 0.4, 0.2] } };
  for (const self of edges)
    for (const at of edges) {
      const plume = { id: "plume", kind: "image", src: PNG_1x1, aspect: 1.4, size: "tiny", attach: { self, to: "rocket.nozzle", at } };
      const result = compiled(film([rocketBox, plume], [[{ do: "show", targets: ["rocket", "plume"] }]]));
      const [mine, theirs] = [edgeOf(resolvedObject(result, "plume").box, self), edgeOf(resolvedObject(result, "rocket.nozzle").box, at)];
      assert.ok(Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1]) < 1, `attach ${self} to the nozzle's ${at}: ${mine.map(Math.round)} vs ${theirs.map(Math.round)}`);
    }
  // Attached to a turned thing, a thing is set in its frame and turns with it: the plume still leaves the nozzle's open end.
  const turnedRocket = compiled(film([{ ...rocketBox, rotate: 180 }, { id: "plume", kind: "image", src: PNG_1x1, aspect: 1.4, size: "tiny", attach: { self: "top", to: "rocket.nozzle", at: "bottom" } }], [[{ do: "show", targets: ["rocket", "plume"] }]]));
  const [flipped, plumeTurned, nozzleTurned] = ["rocket", "plume", "rocket.nozzle"].map((id) => resolvedObject(turnedRocket, id));
  assert.equal(plumeTurned.turned, 180, "a thing attached to a turned thing turns with it");
  assert.ok(nozzleTurned.position[1] < flipped.position[1] && plumeTurned.position[1] < nozzleTurned.position[1], "turned over, the nozzle is on top and the plume leaves it upward");

  // A figure placed on a region of a place stands with its base inside the region's outline.
  const regions = { north: [[0.1, 0.1], [0.45, 0.05], [0.5, 0.4], [0.15, 0.45]], east: [[0.55, 0.2], [0.95, 0.15], [0.9, 0.6], [0.6, 0.55]], south: [[0.2, 0.55], [0.5, 0.6], [0.45, 0.95], [0.25, 0.9]] };
  const atlas = { id: "atlas", kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" }, silhouette: [[0, 0], [1, 0], [1, 1], [0, 1]], hotspots: Object.fromEntries(Object.entries(regions).map(([name, outline]) => [name, (() => { const b = boundsOfPoints(outline); return [b.x, b.y, b.w, b.h]; })()])), outlines: regions };
  for (const [index, region] of Object.keys(regions).entries())
    for (const placement of [{ mode: "relative", target: `atlas.${region}`, relation: "on" }, { mode: "anchor", target: `atlas.${region}` }, { mode: "relative", target: `atlas.${region}`, relation: "near" }]) {
      const walkers = [0, 1].map((k) => ({ id: `walker${k}`, kind: "image", src: PNG_1x1, aspect: 0.45, size: "tiny", placement }));
      const result = compiled(film([atlas, ...walkers], [[{ do: "show", targets: ["atlas", ...walkers.map((one) => one.id)] }]]));
      const outline = onPicture(resolvedObject(result, "atlas"), regions[region]);
      const boxes = walkers.map((one) => resolvedObject(result, one.id).box);
      for (const box of boxes) assert.ok(inside([box.x + box.w / 2, box.y + box.h], outline), `a figure set ${placement.mode === "anchor" ? "anchored" : placement.relation} on ${region} stands with its base inside it (${index})`);
      const [a, b] = boxes;
      const shared = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.ok(shared < 0.2 * a.w * a.h, `two figures set on ${region} stand apart`);
    }

  // Motion by meaning: direction and distance, toward and away, opposite, zone moves from the mover's band.
  const mover = (id, zone, extra = {}) => ({ id, kind: "shape", shape: "circle", appearance: "outline", size: "tiny", placement: { mode: "zone", zone }, ...extra });
  const journeyOf = (result, id) => {
    const move = component(result, id).motions?.find((motion) => motion.kind === "move");
    const rest = resolvedObject(result, id).position;
    return move && [move.to[0] - rest[0], move.to[1] - rest[1]];
  };
  const degrees = ([x, y]) => (Math.atan2(-y, x) * 180) / Math.PI;
  const apartBy = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);
  for (let round = 0; round < 12; round++) {
    const angle = Math.round(random() * 360) - 180;
    const by = 40 + Math.round(random() * 120);
    const directed = compiled(film([mover("ball", "main"), mover("puff", "main-left")], [[{ do: "show", targets: ["ball", "puff"] }], [{ do: "motion", target: "ball", motion: "move", direction: angle, by }, { do: "motion", target: "puff", motion: "move", opposite: "ball" }]]));
    const [ball, puff] = [journeyOf(directed, "ball"), journeyOf(directed, "puff")];
    assert.ok(ball && apartBy(degrees(ball), angle) < 1 && Math.abs(Math.hypot(...ball) - by) < 1.5, `a move ${by} at ${angle}° goes exactly that way and that far`);
    assert.ok(puff && apartBy(degrees(puff), angle + 180) < 5, `an opposite move goes within 5° of the reverse of its partner's (${puff && degrees(puff).toFixed(1)} vs ${angle + 180})`);
  }
  const relative = compiled(film([mover("ball", "main"), mover("wall", "main-right"), mover("lamp", "main-left")], [[{ do: "show", targets: ["ball", "wall", "lamp"] }], [{ do: "motion", target: "ball", motion: "move", toward: "wall", by: 50 }], [{ do: "motion", target: "ball", motion: "move", away: "lamp", by: { times: 2, of: "lamp", dimension: "width" } }]]));
  const ballMoves = component(relative, "ball").motions.filter((motion) => motion.kind === "move");
  const [ballRest, wallAt, lampObject] = [resolvedObject(relative, "ball").position, resolvedObject(relative, "wall").position, resolvedObject(relative, "lamp")];
  assert.ok(Math.abs(ballMoves[0].to[0] - (ballRest[0] + 50)) < 1.5 && wallAt[0] > ballRest[0], "toward goes the way the thing lies, as far as asked");
  assert.ok(Math.abs(ballMoves[1].to[0] - ballMoves[0].to[0] - 2 * lampObject.box.w) < 1.5, "away from the lamp, by twice the lamp's width");

  const zones = compiled(film([mover("ball", "main"), mover("stone", "support")], [[{ do: "show", targets: ["ball", "stone"] }], [{ do: "motion", target: "ball", motion: "move", to: "support" }, { do: "motion", target: "stone", motion: "move", to: "support" }]]));
  const sunk = journeyOf(zones, "ball");
  const bandApart = ((345 - 215) / 430) * 960;
  assert.ok(sunk && Math.abs(sunk[0]) < 1 && Math.abs(sunk[1] - bandApart) < 1, `a move to a zone goes as far as that zone lies from the band the mover is in (${sunk?.map(Math.round)})`);
  assert.equal(journeyOf(zones, "stone"), undefined, "a move to the zone a thing is already in is not played");
  assert.ok(diagnostics(zones).some((item) => item.code === "MOTION_REFUSED" && /stone/.test(item.message)), "and the writer is told why");

  // Two things sent to one spot never end on top of each other.
  const crowding = compiled(film([mover("a", "main-left"), mover("b", "main-right"), { ...mover("goal", "support"), size: "large" }], [[{ do: "show", targets: ["a", "b", "goal"] }], [{ do: "motion", target: "a", motion: "move", to: "goal", land: "centre" }, { do: "motion", target: "b", motion: "move", to: "goal", land: "centre" }]]));
  const [endA, endB] = ["a", "b"].map((id) => component(crowding, id).motions[0].to);
  const size = resolvedObject(crowding, "a").box.w;
  assert.ok(Math.hypot(endA[0] - endB[0], endA[1] - endB[1]) >= size - 0.5, "two travellers sent to one spot end apart");

  // A route with an arrow is walked from its tail, however near its head the rider starts.
  for (const arrow of ["end", "start"]) {
    const routes = compiled(film([mover("from", "main-left"), mover("to", "main-right"), { id: "way", kind: "line", from: "from", to: "to", arrow }, { ...mover("rider", "main"), placement: { mode: "relative", target: arrow === "end" ? "to" : "from", relation: "near" } }], [[{ do: "show", targets: ["from", "to", "way", "rider"] }], [{ do: "motion", target: "rider", motion: "along", along: "way" }]]));
    const walk = component(routes, "rider").motions.find((motion) => motion.kind === "along").path;
    const ends = resolvedObject(routes, "way").endpoints;
    const [tail, head] = arrow === "end" ? [ends.from, ends.to] : [ends.to, ends.from];
    const last = walk.at(-1);
    assert.ok(Math.hypot(last[0] - head[0], last[1] - head[1]) < 1, `an arrowed route (arrow ${arrow}) is walked to its head`);
    assert.ok(walk.some((point) => Math.hypot(point[0] - tail[0], point[1] - tail[1]) < 1), `and from its tail, with a lead-in when the rider starts elsewhere`);
  }

  // Facing is a measured fact: an opposite move off a still partner goes against the way it faces.
  const faced = compiled(film([{ id: "jet", kind: "image", src: PNG_1x1, aspect: 0.5, size: "small", facing: "up", placement: { mode: "zone", zone: "main" } }, mover("smoke", "main-left")], [[{ do: "show", targets: ["jet", "smoke"] }], [{ do: "motion", target: "smoke", motion: "move", opposite: "jet", by: 60 }]]));
  const smoke = journeyOf(faced, "smoke");
  assert.ok(smoke && apartBy(degrees(smoke), -90) < 1, "opposite a still picture that faces up is straight down");
  assert.equal(resolvedObject(faced, "jet").facing, 90, "a picture's facing is reported in degrees anticlockwise from right");
}

// A film sent one scene at a time draws exactly as the whole film does, and no scene changes once added.
{
  const shot = (id, objects, beats, narration = "A scene of a film that arrives one scene at a time.") => ({ id, composition: "custom-relational", narration, objects, beats: beats.map((actions, index) => ({ id: `b${index}`, pace: "normal", actions })) });
  const header = { version: "1", title: "arriving", theme: "parchment" };
  const scenes = [
    shot("s1", [{ id: "pic", kind: "image", src: PNG_1x1, aspect: 0.8, role: "primary", placement: { mode: "zone", zone: "main" } }, { id: "q", kind: "question", text: "Why did it change?", placement: { mode: "zone", zone: "strip" } }, { id: "t", kind: "text", text: "Allies", category: "allies", placement: { mode: "zone", zone: "support" } }, { id: "key", kind: "legend", categories: "film", placement: { mode: "zone", zone: "footer" } }], [[{ do: "show", targets: ["pic", "q", "t", "key"] }], [{ do: "label", target: "pic", text: "Start" }]]),
    { id: "s2", composition: "custom-relational", narration: "A scene the engine cannot read.", objects: 7, beats: [] },
    shot("s3", [circle("a", "main"), { id: "years", kind: "timeline", from: 1938, to: 1945, events: [{ at: 1939, label: "War" }], eras: [{ from: 1939, to: 1942, label: "Early", category: "axis" }], placement: { mode: "zone", zone: "strip" } }], [[{ do: "show", targets: ["years"] }], [{ do: "motion", target: "a", motion: "move", by: [60, 0] }]]),
    shot("s4", [circle("a", "main"), { id: "b", kind: "shape", shape: "square", appearance: "outline", size: "small", category: "allies", placement: { mode: "zone", zone: "main-right" } }], [[{ do: "show", targets: ["b"] }], [{ do: "show", targets: ["q.tick"] }]]),
  ];
  const options = { backgroundColor: "#FAFAFA", sceneFloors: [20, 30, 25, 22] };
  const sent = JSON.parse(JSON.stringify(scenes));
  const compiler = createFilmCompiler(header, options);
  const prefixes = scenes.map((scene, index) => {
    const added = compiler.add(scene);
    assert.equal(added.index, index, "every scene keeps the index it was sent at");
    assert.equal(compiler.count(), index + 1);
    return { added, slide: compiler.slide() };
  });
  assert.deepEqual(scenes, sent, "adding a scene leaves the caller's copy as it was sent");
  const nothing = createFilmCompiler(header).add(null);
  assert.ok(!nothing.valid && nothing.index === 0 && nothing.dropped, "a scene that is not even an object is dropped, not thrown on");
  const [first, broken, third, fourth] = prefixes.map((prefix) => prefix.added);
  assert.ok(first.valid && third.valid && fourth.valid, JSON.stringify([first, third, fourth].map((added) => added.errors)));
  assert.ok(!broken.valid && broken.errors.length > 0 && broken.errors.every((error) => error.path.startsWith("/scenes/1")), "a dropped scene is reported at its own index");
  const timings = compiler.slide().scenes;
  assert.equal(timings.length, 4, "a dropped scene keeps its place in the film's timings");
  assert.ok(timings[1].dropped && timings[1].start === timings[0].end && timings[1].end === timings[1].start, "with no time on screen");
  assert.ok(Math.abs(timings[2].end - timings[2].start - 25) < 1e-9, "floors are read by the index a scene was sent at, a dropped scene before it notwithstanding");
  assert.deepEqual(timings.map(({ start, end }) => [start, end]), prefixes.map(({ added }) => [added.start, added.end]), "each add returns the timing the film keeps for it");
  for (const [index, prefix] of prefixes.entries()) assert.deepEqual(prefix.slide.scenes, timings.slice(0, index + 1), "an added scene's timing never changes");

  const whole = renderLessonSpec({ ...header, scenes }, options);
  assert.equal(whole.valid, true, whole.valid ? undefined : JSON.stringify(whole.errors));
  assert.deepEqual(whole.slide.scenes, timings, "the whole film times its scenes as the scene-by-scene one does");
  assert.ok(whole.warnings.some((warning) => warning.code === "DROPPED_SCENE" && warning.path.startsWith("/scenes/1")), "the whole film reports the dropped scene by its index");

  // The deep strip of a later scene never moves the scenes before it.
  const alone = compileLessonSpec({ ...header, scenes: scenes.slice(0, 1) });
  const all = compileLessonSpec({ ...header, scenes });
  assert.deepEqual(all.resolved.scenes[0].objects.map((object) => object.box), alone.resolved.scenes[0].objects.map((object) => object.box), "a scene's layout is the same whatever scenes follow it");
  const keyed = all.gcl.find((item) => item.id === "key");
  assert.deepEqual(keyed.categories, ["allies"], "a key of the whole film lists the categories met so far, not those a later scene brings");

  const W = 540;
  const H = 960;
  // The progress dots along the top edge count the scenes the film has so far, so they are left out of the comparison.
  const DOTS = 12;
  const pixels = (slide, t, dots = true) => {
    const ctx = createCanvas(W, H).getContext("2d");
    slide.render(ctx, t);
    const data = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    return dots ? data : data.subarray(DOTS * W * 4);
  };
  const times = (timing) => (timing.dropped ? [] : [0.05, 0.3, 0.6, 0.95].map((share) => timing.start + (timing.end - timing.start) * share));
  for (const t of timings.flatMap(times)) assert.ok(pixels(whole.slide, t).equals(pixels(compiler.slide(), t)), `the whole film and the scene-by-scene one draw the same frame at ${t.toFixed(2)}s`);
  for (const [index, prefix] of prefixes.entries()) {
    for (const t of timings.slice(0, index + 1).flatMap(times)) assert.ok(pixels(prefix.slide, t, false).equals(pixels(compiler.slide(), t, false)), `a frame of a scene already added never changes (${index + 1} scenes, ${t.toFixed(2)}s)`);
  }
}

// Generic rules the films leaned on: a label ends with its beat or its picture, sits by what is drawn, pointer labels never
// cover the picture, far writing points, parts turn with their picture, trails run where the walker is
// carried, a kept picture keeps its slot, and the solver keeps cards, travellers and timelines honest.
{
  const shot = (id, objects, beats, narration = "One scene of a probe film for labels, layout and continuity.") => ({ id, composition: "custom-relational", narration, objects, beats: beats.map((actions, index) => ({ id: `b${index}`, pace: "normal", actions })) });
  const lesson = (...scenes) => ({ version: "1", title: "gaps", theme: "parchment", scenes });
  const scenesOf = (result) => {
    const out = [];
    for (const item of result.gcl) {
      if (item.type === "scene") out.push([]);
      else out.at(-1).push(item);
    }
    return out;
  };
  const callouts = (items, target) => items.filter((item) => item.type === "attention" && item.verb === "callout" && (target === undefined || item.target === target));
  const square = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const inside = ([px, py], polygon) => polygon.reduce((odd, [xi, yi], i) => {
    const [xj, yj] = polygon[(i + polygon.length - 1) % polygon.length];
    return yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi ? !odd : odd;
  }, false);
  const nearest = (points, [x, y]) => Math.min(...points.slice(1).map(([bx, by], k) => {
    const [ax, ay] = points[k];
    const length = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length)) : 0;
    return Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t));
  }));
  const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
  const boxDistance = (a, b) => Math.hypot(Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h)));
  let seed = 9091;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const between = (low, high) => low + random() * (high - low);
  const map = { id: "map", kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { a: [0.1, 0.1, 0.3, 0.3], b: [0.55, 0.5, 0.3, 0.3] }, outlines: { a: square(0.1, 0.1, 0.3, 0.3), b: square(0.55, 0.5, 0.3, 0.3) } };

  // 1. A label ends with its beat, or earlier when the picture it names leaves, and is never written on
  // another scene's picture; a film still naming old label ids in a hide plays.
  const ended = compiled(lesson(
    shot("s1", [map, { ...map, id: "other" }], [[{ do: "show", targets: ["map"] }], [{ do: "label", id: "name-a", target: "map.a", text: "Alpha", persist: true }, { do: "hide", targets: ["map"] }, { do: "show", targets: ["other"] }], [{ do: "attention", target: "other", verb: "outline" }]]),
    shot("s2", [{ ...map, id: "other" }], [[{ do: "attention", target: "other.a", verb: "outline" }], [{ do: "hide", targets: ["name-a"] }]]),
  ));
  assert.equal(ended.lesson.scenes.length, 2, "a film still written with label ids plays every scene");
  const [first, second] = scenesOf(ended);
  const leaving = ended.resolved.scenes[0].beats[1].actions.find((action) => action.source.do === "hide");
  const alpha = callouts(first, "map.a")[0];
  assert.ok(alpha?.exit && alpha.exit.out + alpha.exit.dur <= leaving.end + 0.01, "a label leaves no later than the picture it names");
  assert.equal(callouts(second).length, 0, "a label is never written again on the next scene's picture");

  // 2. A label on an angle sits by its arc: inside the angle on its bisector, else with a line to the arc.
  for (let round = 0; round < 24; round++) {
    const corners = Array.from({ length: 3 }, () => [Math.round(between(80, 920)), Math.round(between(80, 920))]);
    const twice = Math.abs((corners[1][0] - corners[0][0]) * (corners[2][1] - corners[0][1]) - (corners[2][0] - corners[0][0]) * (corners[1][1] - corners[0][1]));
    if (twice < 120000) continue;
    const d = `M${corners[0].join(" ")} L${corners[1].join(" ")} L${corners[2].join(" ")} Z`;
    const angles = [0, 1, 2].map((k) => ({ id: `at${k}`, kind: "angle", at: `tri.v${k}`, from: `tri.v${(k + 1) % 3}`, to: `tri.v${(k + 2) % 3}` }));
    const result = compiled(film([{ id: "tri", kind: "path", d, stroke: "ink", size: "large", placement: { mode: "zone", zone: "main" } }, ...angles], [[{ do: "show", targets: ["tri", "at0", "at1", "at2"] }], ...angles.map((angle) => [{ do: "label", target: angle.id, text: "40°", size: "tag", style: "text" }])]));
    const triangle = component(result, "tri").points;
    for (const angle of angles) {
      const arc = component(result, angle.id).points;
      const [label] = callouts(result.gcl, angle.id);
      if (label.leader) assert.ok(nearest(arc, label.point) < 2, `an angle's label set apart points at its arc (${d})`);
      // Measured to the label's centre, which a tag's own half-width keeps off the arc.
      else assert.ok(nearest(arc, label.spot) < 80 && inside(label.spot, triangle), `an angle's label sits inside the angle by its arc (${d}, ${angle.id})`);
    }
  }

  // 3. Pointer labels of a picture as wide as the frame stand in rows over or under it, never on it.
  for (const aspect of [1.4, 1.8, 2.4]) {
    const wide = { ...map, id: "cell", aspect, size: "hero", hotspots: { w: [0.05, 0.1, 0.2, 0.3], c: [0.36, 0.1, 0.2, 0.3], v: [0.67, 0.1, 0.2, 0.3], n: [0.05, 0.6, 0.2, 0.3] }, outlines: { w: square(0.05, 0.1, 0.2, 0.3), c: square(0.36, 0.1, 0.2, 0.3), v: square(0.67, 0.1, 0.2, 0.3), n: square(0.05, 0.6, 0.2, 0.3) } };
    const parts = Object.keys(wide.hotspots);
    const result = compiled(film([wide], [[{ do: "show", targets: ["cell"] }], ...parts.map((part) => [{ do: "label", target: `cell.${part}`, text: `part ${part}`, emphasis: "quiet", place: "pointer" }])]));
    const cell = resolvedObject(result, "cell").box;
    for (const label of callouts(result.gcl)) {
      const part = resolvedObject(result, label.target).box;
      assert.ok(label.leader && label.point[0] >= part.x && label.point[0] <= part.x + part.w && label.point[1] >= part.y && label.point[1] <= part.y + part.h, "a pointer label's line ends on its part");
      assert.ok(label.spot[1] < cell.y || label.spot[1] > cell.y + cell.h || label.spot[0] < cell.x || label.spot[0] > cell.x + cell.w, `a pointer label never stands on its picture (aspect ${aspect})`);
      assert.ok(label.spot[0] > 0 && label.spot[0] < 540 && label.spot[1] > 0 && label.spot[1] < 960, "and stays on screen");
    }
  }

  // 4. Writing set by a part with no clear spot beside it takes a pointer line to the part.
  const body = { id: "body", kind: "image", src: PNG_1x1, aspect: 0.46, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { heart: [0.45, 0.3, 0.12, 0.08] }, outlines: { heart: square(0.45, 0.3, 0.12, 0.08) }, silhouette: [[0.3, 0], [0.7, 0], [1, 0.25], [0.8, 1], [0.2, 1], [0, 0.25]] };
  for (const words of ["70 beats a minute", "the right ventricle wall", "valve"]) {
    const result = compiled(film([body, { id: "note", kind: "text", text: words, role: "annotation", placement: { mode: "relative", target: "body.heart", relation: "near" } }], [[{ do: "show", targets: ["body", "note"] }]]));
    const heart = resolvedObject(result, "body.heart").box;
    const note = resolvedObject(result, "note");
    const pointer = component(result, "note").pointer;
    if (boxDistance(note.box, heart) > 40) assert.ok(pointer && pointer[0] >= heart.x && pointer[0] <= heart.x + heart.w && pointer[1] >= heart.y && pointer[1] <= heart.y + heart.h, `writing set apart from its part ("${words}") has a pointer line to it`);
    else assert.equal(pointer, undefined, "writing right beside its part needs no line");
  }

  // 5. A turned picture's parts are where the turned drawing puts them: outline, label and part box.
  for (const turn of [90, 180, 270, 35]) {
    const result = compiled(film([{ ...map, rotate: turn }], [[{ do: "show", targets: ["map"] }], [{ do: "label", target: "map.b", text: "Beta", style: "text" }], [{ do: "attention", target: "map.b", verb: "outline" }]]));
    const picture = resolvedObject(result, "map");
    const rad = (turn * Math.PI) / 180;
    const turnAbout = ([x, y]) => {
      const [dx, dy] = [picture.box.x + x * picture.box.w - picture.position[0], picture.box.y + y * picture.box.h - picture.position[1]];
      return [picture.position[0] + dx * Math.cos(rad) - dy * Math.sin(rad), picture.position[1] + dx * Math.sin(rad) + dy * Math.cos(rad)];
    };
    const expected = map.outlines.b.map(turnAbout);
    const region = component(result, "map.b");
    assert.ok(region.outline.every((point, k) => Math.hypot(point[0] - expected[k][0], point[1] - expected[k][1]) < 0.5), `a part's outline turns with its picture (${turn}°)`);
    const [label] = callouts(result.gcl, "map.b");
    assert.ok(inside(label.point ?? label.spot, expected), `a label's line ends inside the turned part (${turn}°)`);
  }
  const spun = compiled(lesson(
    shot("s1", [{ ...map, id: "rocket" }], [[{ do: "show", targets: ["rocket"] }], [{ do: "motion", target: "rocket", motion: "spin", sweep: 180, direction: "clockwise" }]]),
    shot("s2", [{ ...map, id: "rocket" }], [[{ do: "label", target: "rocket.a", text: "Alpha", style: "text" }]]),
  ));
  const [after] = [spun.resolved.scenes[1].objects.find((object) => object.id === "rocket.a")];
  const whole = spun.resolved.scenes[1].objects.find((object) => object.id === "rocket");
  assert.ok(after.position[0] > whole.position[0] && after.position[1] > whole.position[1], "a spin's end turn carries the parts into the next scene: the top-left part is now bottom-right");

  // 6. A standing walker's dotted trail runs at its feet, the point the route carries it by.
  const europe = { id: "europe", kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { west: [0.05, 0.4, 0.3, 0.4], east: [0.6, 0.4, 0.3, 0.4] }, outlines: { west: square(0.05, 0.4, 0.3, 0.4), east: square(0.6, 0.4, 0.3, 0.4) }, silhouette: square(0, 0, 1, 1) };
  const marching = compiled(film([europe, { id: "soldier", kind: "image", src: PNG_1x1, aspect: 0.5, role: "support", placement: { mode: "anchor", target: "europe.west" } }, { id: "road", kind: "path", from: "europe.west", to: "europe.east", d: "M0 0 L1000 0", arrow: "end" }], [[{ do: "show", targets: ["europe", "soldier"] }], [{ do: "show", targets: ["road"] }, { do: "motion", target: "soldier", motion: "along", along: "road", trail: "dots" }]]));
  const soldier = resolvedObject(marching, "soldier");
  assert.ok(soldier.stands, "a picture set on a region of a place stands on it");
  assert.deepEqual(component(marching, "soldier").carriedBy, [0, soldier.box.h / 2], "its trail is drawn at its feet");
  assert.equal(component(walked, "rider").carriedBy, undefined, "a traveller that does not stand trails from its centre");
  const touring = compiled(film([{ ...europe, hotspots: { ...europe.hotspots, south: [0.35, 0.85, 0.3, 0.1] }, outlines: { ...europe.outlines, south: square(0.35, 0.85, 0.3, 0.1) } }, { id: "soldier", kind: "image", src: PNG_1x1, aspect: 0.5, role: "support", placement: { mode: "anchor", target: "europe.west" } }, { id: "road", kind: "path", from: "europe.west", to: "europe.east", d: "M0 0 L1000 0", arrow: "end" }, { id: "lane", kind: "path", from: "europe.east", to: "europe.south", d: "M0 0 L1000 0", arrow: "end" }], [[{ do: "show", targets: ["europe", "soldier"] }], [{ do: "show", targets: ["road"] }, { do: "motion", target: "soldier", motion: "along", along: "road" }], [{ do: "show", targets: ["lane"] }, { do: "motion", target: "soldier", motion: "along", along: "lane" }]]));
  const [road, lane] = ["road", "lane"].map((id) => resolvedObject(touring, id).endpoints);
  assert.ok(Math.hypot(lane.from[0] - road.to[0], lane.from[1] - road.to[1]) < 1, "a walker's next route starts where its last one ended");

  // 7. A picture re-declared as it was keeps its slot exactly, unless what the scene adds cannot fit round it.
  for (let round = 0; round < 12; round++) {
    const extra = random() < 0.5
      ? { id: "card", kind: "chart", chart: "bar", data: [{ label: "a", value: 2 }, { label: "b", value: 3 }], size: random() < 0.5 ? "small" : "large", placement: { mode: "zone", zone: random() < 0.5 ? "support" : "main" } }
      : { id: "card", kind: "diagram", layout: "sequence", nodes: Array.from({ length: 2 + Math.floor(random() * 4) }, (_, k) => ({ id: `n${k}`, label: `step ${k}` })), placement: { mode: "zone", zone: random() < 0.5 ? "support" : "main" } };
    const picture = { ...map, aspect: between(0.6, 1.8) };
    const result = compiled(lesson(shot("s1", [picture], [[{ do: "show", targets: ["map"] }]]), shot("s2", [picture, extra], [[{ do: "show", targets: ["card"] }]])));
    const [before, now] = [0, 1].map((index) => result.resolved.scenes[index].objects.find((object) => object.id === "map").box);
    const card = result.resolved.scenes[1].objects.find((object) => object.id === "card").box;
    const kept = ["x", "y", "w", "h"].every((key) => Math.abs(before[key] - now[key]) < 0.01);
    assert.ok(!kept || !overlap(now, card), `a picture kept in its slot is never covered by what the scene adds (round ${round})`);
  }
  // A card always covers what it draws, however it was squeezed to make room: every piece lies inside its box.
  for (let round = 0; round < 10; round++) {
    const nodes = Array.from({ length: 2 + Math.floor(random() * 4) }, (_, k) => ({ id: `n${k}`, label: `stage ${k} of the journey` }));
    const card = { id: "card", kind: "diagram", layout: ["sequence", "cycle", "flow"][round % 3], nodes, links: nodes.slice(1).map((node, k) => ({ from: nodes[k].id, to: node.id })), placement: { mode: "relative", target: "map", relation: random() < 0.5 ? "below" : "above" } };
    const result = compiled(film([{ ...map, size: "hero" }, card], [[{ do: "show", targets: ["map", "card"] }]]));
    const box = resolvedObject(result, "card").box;
    const pieces = result.resolved.scenes[0].objects.filter((object) => object.compositeParent === "card");
    assert.ok(pieces.every(({ box: piece }) => piece.x >= box.x - 1 && piece.y >= box.y - 1 && piece.x + piece.w <= box.x + box.w + 1 && piece.y + piece.h <= box.y + box.h + 1), `a squeezed card's pieces stay inside its box (${card.layout}, ${nodes.length} nodes)`);
  }
  // A state that replaces another on one beat takes the leaving state's slot, however it was declared,
  // and also when the leaving state was kept from the scene before.
  for (let round = 0; round < 16; round++) {
    const aspect = between(0.5, 1.8);
    const before = { id: "old", kind: "image", src: PNG_1x1, aspect, role: "primary", placement: { mode: "zone", zone: "main" } };
    const ways = [{ placement: { mode: "zone", zone: "main" } }, { attach: { self: "center", to: "old", at: "center" } }, { attach: { self: "center", to: "old", at: "center" }, size: { like: "old", dimension: "width", times: 1 } }];
    const after = { id: "new", kind: "image", src: PNG_1x1, aspect: aspect * between(0.8, 1.25), role: "primary", ...ways[round % 3] };
    const extra = random() < 0.5 ? [{ id: "note", kind: "text", text: "A caption", placement: { mode: "zone", zone: "footer" } }] : [];
    const swap = [[{ do: "attention", target: "old", verb: "outline" }], [{ do: "hide", targets: ["old"] }, { do: "show", targets: ["new"] }]];
    const result = round % 2
      ? compiled(lesson(shot("s1", [before], [[{ do: "show", targets: ["old"] }]]), shot("s2", [before, after, ...extra], swap)))
      : compiled(lesson(shot("s1", [before, after, ...extra], [[{ do: "show", targets: ["old"] }], ...swap])));
    const scene = result.resolved.scenes.at(-1);
    const [oldBox, newBox] = ["old", "new"].map((id) => scene.objects.find((object) => object.id === id).box);
    const centre = (box) => [box.x + box.w / 2, box.y + box.h / 2];
    assert.ok(Math.hypot(centre(oldBox)[0] - centre(newBox)[0], centre(oldBox)[1] - centre(newBox)[1]) < 0.5, `the arriving state is centred on the leaving one's slot (round ${round})`);
    assert.ok(newBox.w <= oldBox.w + 0.5 && newBox.h <= oldBox.h + 0.5 && (Math.abs(newBox.w - oldBox.w) < 0.5 || Math.abs(newBox.h - oldBox.h) < 0.5), `and fills that slot (round ${round})`);
  }

  // Beside pictures, a path is dropped as a hand-drawn stand-in only by its role: a free shape with nothing
  // drawn in it, on it or along it, and a free open stroke that turns, a line drawn for an amount. A stage,
  // anything drawn in a stage, a route and a single straight mark all stay.
  const scribble = (pieces, closed) => Array.from({ length: pieces }, () => {
    const points = Array.from({ length: 2 + Math.floor(random() * 8) }, () => `${Math.round(between(100, 900))} ${Math.round(between(100, 900))}`);
    return `M${points[0]} ${points.slice(1).map((point) => `L${point}`).join(" ")}${closed ? " Z" : ""}`;
  }).join(" ");
  const droppedPaths = (result) => new Set(diagnostics(result).filter((item) => item.code === "DROPPED_OBJECT").map((item) => item.path.split("/")[4]));
  for (let round = 0; round < 20; round++) {
    const objects = [
      { id: "candle", kind: "image", src: PNG_1x1, aspect: 0.4, role: "primary", placement: { mode: "zone", zone: "main-left" } },
      { id: "stage", kind: "path", d: scribble(1 + Math.floor(random() * 3), random() < 0.5), stroke: "ink", placement: { mode: "zone", zone: "main-right" } },
      { id: "lens", kind: "path", in: "stage", d: scribble(1 + Math.floor(random() * 3), true), stroke: "ink" },
      { id: "tick", kind: "path", in: "stage.s0@0.5", d: "M0 -20 L0 20", stroke: "ink" },
      { id: "route", kind: "path", d: scribble(2, random() < 0.5), stroke: "muted", placement: { mode: "zone", zone: "support" } },
      { id: "mark", kind: "path", d: `M${Math.round(between(100, 400))} 500 L${Math.round(between(600, 900))} ${Math.round(between(100, 900))}`, stroke: "accent", arrow: "end", placement: { mode: "relative", target: "candle", relation: "right-of" } },
      { id: "copy", kind: "path", d: scribble(1 + Math.floor(random() * 3), true), stroke: "ink", fill: "muted", placement: { mode: "relative", target: "candle", relation: random() < 0.5 ? "below" : "near" } },
      { id: "trend", kind: "path", d: `M100 120 L350 390 ${random() < 0.5 ? "L550 550" : "Q700 500 900 900"}`, stroke: "muted", placement: { mode: "relative", target: "candle", relation: random() < 0.5 ? "left-of" : "above" } },
      { id: "shock", kind: "path", in: "trend", d: "M300 390 L400 390", stroke: "danger" },
    ];
    const result = compileLessonSpec(film(objects, [[{ do: "show", targets: ["candle", "stage", "lens", "tick", "mark", "route", "copy", "trend", "shock"] }], [{ do: "motion", target: "candle", motion: "along", along: "route" }]]));
    const gone = droppedPaths(result);
    assert.ok(!gone.has("1") && !gone.has("2") && !gone.has("3"), `a stage and what is drawn in it stay beside pictures (round ${round})`);
    assert.ok(!gone.has("4") && !gone.has("5"), "a route walked and a single straight mark stay");
    assert.ok(gone.has("6"), "a free shape drawn beside a picture is a stand-in for a picture, and is dropped");
    assert.ok(gone.has("7"), "a free line that turns beside a picture stands for an amount, and is dropped, though a mark is drawn in it");
    assert.ok(diagnostics(result).some((item) => item.path.endsWith("/objects/7/d") && /`chart` `line`/.test(item.message) && /`measure`/.test(item.message)), "its reason names the chart and the measure");
  }
  const anchoredTrend = compileLessonSpec(film([{ id: "pic", kind: "image", src: PNG_1x1, aspect: 1, placement: { mode: "zone", zone: "main" } }, { id: "crack", kind: "path", d: "M100 100 L400 600 L900 700", stroke: "ink", placement: { mode: "anchor", target: "pic" } }], [[{ do: "show", targets: ["pic", "crack"] }]]));
  assert.ok(!droppedPaths(anchoredTrend).has("1"), "an open stroke anchored on a picture moves with it, and is kept");
  // A path beside a picture is laid out holding every shape it morphs into, so a stroke that grows never runs over the picture.
  for (const relation of ["left-of", "right-of", "above", "below"]) {
    const grows = compiled(film([{ id: "worker", kind: "image", src: PNG_1x1, aspect: 0.6, role: "primary", placement: { mode: "zone", zone: "main" } }, { id: "push", kind: "path", d: "M100 500 L300 300", stroke: "ink", arrow: "end", placement: { mode: "relative", target: "worker", relation } }], [[{ do: "show", targets: ["worker", "push"] }], [{ do: "motion", target: "push", motion: "morph", d: "M100 500 L900 100" }]]));
    const worker = resolvedObject(grows, "worker").box;
    const grown = component(grows, "push").motions.find((motion) => motion.kind === "morph").toPoints;
    const inside = ([x, y]) => x > worker.x + 1 && x < worker.x + worker.w - 1 && y > worker.y + 1 && y < worker.y + worker.h - 1;
    const along = grown.flatMap((point, k) => (k === 0 ? [] : Array.from({ length: 21 }, (_, t) => [grown[k - 1][0] + ((point[0] - grown[k - 1][0]) * t) / 20, grown[k - 1][1] + ((point[1] - grown[k - 1][1]) * t) / 20])));
    assert.ok(!along.some(inside), `a stroke ${relation} a picture never morphs across it`);
  }
  const cornered = compileLessonSpec(film([{ id: "pic", kind: "image", src: PNG_1x1, aspect: 1, placement: { mode: "zone", zone: "main-left" } }, { id: "tri", kind: "path", d: "M200 800 L800 800 L200 200 Z", stroke: "ink", placement: { mode: "zone", zone: "main-right" } }, { id: "corner", kind: "angle", at: "tri.v0", from: "tri.v1", to: "tri.v2" }], [[{ do: "show", targets: ["pic", "tri", "corner"] }]]));
  assert.ok(!droppedPaths(cornered).has("1"), "a figure whose corners are used is exact content, kept beside pictures");

  const quiet = compiled(lesson(shot("s1", [map], [[{ do: "show", targets: ["map"] }]]), shot("s2", [map, { id: "cap", kind: "text", text: "A caption", placement: { mode: "zone", zone: "footer" } }], [[{ do: "show", targets: ["cap"] }]])));
  assert.deepEqual(quiet.resolved.scenes[1].objects.find((object) => object.id === "map").box, quiet.resolved.scenes[0].objects.find((object) => object.id === "map").box, "a caption added under a kept picture never moves it");

  // A picture its size would make a speck is drawn at the smallest size that reads, with a warning.
  const speck = compiled(film([map, { id: "ship", kind: "image", src: PNG_1x1, aspect: 1.5, role: "support", size: { like: "map.a", dimension: "width", times: 0.05 }, placement: { mode: "relative", target: "map.b", relation: "near" } }], [[{ do: "show", targets: ["map", "ship"] }]]));
  const ship = resolvedObject(speck, "ship").box;
  assert.ok(Math.max(ship.w, ship.h) >= 39.9 && diagnostics(speck).some((item) => item.code === "RAISED_TO_READABLE"), "a speck of a picture is raised to a readable size and reported");

  // Years count in true time: positive years counting down are years BCE, drawn left to right.
  const years = (from, to) => compiled(film([circle("a", "main"), { id: "t", kind: "timeline", from, to, events: [{ at: from, label: "start" }], placement: { mode: "zone", zone: "strip" } }], [[{ do: "show", targets: ["a", "t"] }]]));
  const down = years(431, 395);
  const read = down.lesson.scenes[0].objects.find((object) => object.id === "t");
  assert.ok(read.from === -431 && read.to === -395 && read.events[0].at === -431 && diagnostics(down).some((item) => item.code === "READ_AS_BCE"), "a timeline counting its years down is read as BCE, earliest first");
  const signed = years(-431, -395);
  assert.ok(signed.lesson.scenes[0].objects.find((object) => object.id === "t").from === -431 && !diagnostics(signed).some((item) => item.code === "READ_AS_BCE"), "signed years are kept as written");

  // A tint given on a beat washes the part from then and is taken off by a tint without a category.
  const tinted = compiled(film([map], [[{ do: "show", targets: ["map"] }], [{ do: "tint", targets: ["map.a"], category: "allies" }], [{ do: "tint", targets: ["map.a"] }]]));
  const [given, taken] = tinted.resolved.scenes[0].beats.slice(1).map((beat) => beat.actions[0]);
  const wash = tinted.gcl.find((item) => item.id === "map.a~tint1");
  assert.ok(wash && Math.abs(wash.start - given.start) < 0.01 && Math.abs(wash.exit.out - taken.start) < 0.01 && wash.wash.alpha === 0.25, "a beat's tint comes in on its beat, leaves on the beat that takes it off, at the faint strength");
  assert.ok(!tinted.gcl.some((item) => item.id === "map.a~tint"), "a part the scene does not colour has no wash before its tint");

  // Names are drawn over every picture: every label and every piece of writing is on the top drawing layer.
  const named = compiled(film([map, { id: "ship", kind: "image", src: PNG_1x1, aspect: 1.5, role: "annotation", placement: { mode: "relative", target: "map.a", relation: "near" } }, { id: "note", kind: "text", text: "Here", placement: { mode: "relative", target: "map.b", relation: "near" } }], [[{ do: "show", targets: ["map", "ship", "note"] }], [{ do: "label", target: "map.b", text: "Beta", emphasis: "quiet" }]]));
  assert.ok(callouts(named.gcl).every((label) => label.layer === "annotation") && component(named, "note").layer === "annotation", "labels and writing are never drawn under a picture");

  // A move to a thing always goes toward it, whatever it already overlaps; a traveller set at a route's tail starts there.
  for (let round = 0; round < 16; round++) {
    const relation = ["near", "below", "above", "left-of", "right-of"][Math.floor(random() * 5)];
    const result = compiled(film([{ ...map, id: "home", size: "medium", placement: { mode: "zone", zone: "main-left" } }, { ...map, id: "away", size: "small", placement: { mode: "relative", target: "home", relation } }, { id: "bee", kind: "image", src: PNG_1x1, aspect: 1.1, role: "support", placement: { mode: "relative", target: "home", relation: "near" } }], [[{ do: "show", targets: ["home", "bee"] }], [{ do: "show", targets: ["away"] }, { do: "motion", target: "bee", motion: "move", to: "away" }]]));
    const move = component(result, "bee").motions?.[0];
    if (!move) continue;
    const [from, to, goal] = [resolvedObject(result, "bee").position, move.to, resolvedObject(result, "away").position];
    assert.ok(Math.hypot(to[0] - goal[0], to[1] - goal[1]) < Math.hypot(from[0] - goal[0], from[1] - goal[1]), `a move to a thing ends nearer it than it began (${relation})`);
  }
  const marched = compiled(film([europe, { id: "army", kind: "image", src: PNG_1x1, aspect: 1.2, role: "support", placement: { mode: "relative", target: "europe.west", relation: "near" } }, { id: "road", kind: "path", from: "europe.west", to: "europe.east", d: "M0 0 C300 -100 700 -100 1000 0", arrow: "end" }], [[{ do: "show", targets: ["europe", "army"] }], [{ do: "show", targets: ["road"] }, { do: "motion", target: "army", motion: "along", along: "road" }]]));
  const army = resolvedObject(marched, "army");
  const tail = resolvedObject(marched, "road").endpoints.from;
  assert.ok(Math.hypot((army.stands ? army.position[1] + army.box.h / 2 : army.position[1]) - tail[1], army.position[0] - tail[0]) < 1, "a traveller set at the place its route leaves from starts on the route's tail");
}

// The subject fills the frame; a squeeze leaves with its cause; names stay off what they name and leave with it.
{
  let seed = 4242;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const WIDTH = 540 - 27 * 2;
  const TALL = Math.round((960 - 16) * 0.75);
  const GROWN = Math.round((960 - 16) * 0.9);
  const square = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const near = (a, b) => ["x", "y", "w", "h"].every((key) => Math.abs(a[key] - b[key]) < 0.5);
  const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
  const within = ([px, py], box) => px > box.x && px < box.x + box.w && py > box.y && py < box.y + box.h;
  const callouts = (result, target) => result.gcl.filter((item) => item.type === "attention" && item.verb === "callout" && item.target === target);
  const shot = (id, objects, beats) => ({ id, composition: "custom-relational", narration: "One scene of a probe film for the subject's size and its names.", objects, beats: beats.map((actions, index) => ({ id: `b${index}`, pace: "normal", actions })) });
  const subjectOf = (aspect, extra = {}) => ({ id: "subject", kind: "image", src: PNG_1x1, aspect, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { part: [0.4, 0.4, 0.2, 0.2] }, outlines: { part: square(0.4, 0.4, 0.2, 0.2) }, ...extra });

  // 1. With nothing beside it, whatever its size word and whatever rides on it, the subject takes the
  // width, a tall one at least three quarters of the frame's height and, where its names leave room, up to nine tenths.
  for (let round = 0; round < 40; round++) {
    const aspect = 0.3 + random() * 2.7;
    const size = ["small", "medium", "large", "hero", undefined][Math.floor(random() * 5)];
    const company = [
      { id: "rider", kind: "image", src: PNG_1x1, aspect: 1, role: "support", placement: { mode: "anchor", target: "subject.part" } },
      { id: "standing", kind: "image", src: PNG_1x1, aspect: 1, role: "support", placement: { mode: "relative", target: "subject", relation: "on" } },
      { id: "drawn", kind: "text", text: "here", in: "subject", at: [500, 500] },
      { id: "name", kind: "text", text: "the part", placement: { mode: "anchor", target: "subject.part" } },
    ].filter(() => random() < 0.5);
    const result = compiled(film([subjectOf(aspect, size ? { size } : {}), ...company], [[{ do: "show", targets: ["subject", ...company.map((one) => one.id)] }], [{ do: "label", target: "subject.part", text: "Part" }]]));
    const box = resolvedObject(result, "subject").box;
    const expected = Math.min(WIDTH, TALL * aspect);
    assert.ok(box.w > expected - 1.5 && box.w < Math.min(WIDTH, GROWN * aspect) + 1.5, `a subject with nothing beside it fills the width (aspect ${aspect.toFixed(2)}, ${size}, with ${company.map((one) => one.id)}): ${box.w.toFixed(1)} of ${expected.toFixed(1)}`);
  }
  for (const aspect of [1.2, 1.6, 2.4]) {
    const result = compiled(film([subjectOf(aspect), { id: "note", kind: "text", text: "A note under the map", placement: { mode: "zone", zone: "footer" } }], [[{ do: "show", targets: ["subject", "note"] }]]));
    assert.ok(Math.abs(resolvedObject(result, "subject").box.w - WIDTH) < 1.5, `a note under a wide subject never narrows it (aspect ${aspect})`);
  }

  // 2. Squeezed by a picture beside it, the subject is laid out afresh once that picture has gone, and
  // keeps that slot while the screen stays the same.
  for (let round = 0; round < 12; round++) {
    const aspect = 0.8 + random() * 1.8;
    const squeezer = round % 2 === 0
      ? { id: "other", kind: "image", src: PNG_1x1, aspect: 0.6, role: "support", placement: { mode: "relative", target: "subject", relation: "left-of" } }
      : { id: "other", kind: "image", src: PNG_1x1, aspect: 1, role: "primary", placement: { mode: "zone", zone: "support" } };
    const result = compiled({ version: "1", title: "squeeze", theme: "parchment", scenes: [
      shot("s1", [subjectOf(aspect), squeezer], [[{ do: "show", targets: ["subject", "other"] }]]),
      shot("s2", [subjectOf(aspect)], [[{ do: "show", targets: ["subject"] }]]),
      shot("s3", [subjectOf(aspect)], [[{ do: "show", targets: ["subject"] }], [{ do: "label", target: "subject.part", text: "Part" }]]),
    ] });
    const [squeezed, freed, again] = result.resolved.scenes.map((scene) => scene.objects.find((one) => one.id === "subject").box);
    // A picture laid under it leaves it the width when the frame's height holds both.
    const narrowed = squeezer.placement.mode === "relative" ? squeezed.w < freed.w - 1 : squeezed.w < freed.w + 0.5;
    assert.ok(narrowed, `a picture beside the subject narrows it (${squeezer.placement.mode}, aspect ${aspect.toFixed(2)})`);
    assert.ok(Math.abs(freed.w - Math.min(WIDTH, TALL * aspect)) < 1.5, `once the squeeze has left, the subject fills the width again (${squeezer.placement.mode}, aspect ${aspect.toFixed(2)}): ${freed.w.toFixed(1)}`);
    assert.ok(near(freed, again), "and keeps that slot while the screen stays the same");
  }

  // 3. A name of a picture's part is written beside it or in the pointer column, never over the part,
  // unless asked inside; writing anchored on a part is set off it.
  for (let round = 0; round < 30; round++) {
    const [w, h] = [0.1 + random() * 0.3, 0.1 + random() * 0.3];
    const [x, y] = [random() * (1 - w), random() * (1 - h)];
    const map = { id: "map", kind: "image", src: PNG_1x1, aspect: 0.7 + random() * 1.5, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { a: [x, y, w, h] }, outlines: { a: square(x, y, w, h) } };
    const labelled = compiled(film([map], [[{ do: "show", targets: ["map"] }], [{ do: "label", target: "map.a", text: "Alpha" }]]));
    const [label] = callouts(labelled, "map.a");
    assert.ok(label.leader && !within(label.spot, resolvedObject(labelled, "map.a").box), `a part's name is not written over the part (round ${round})`);
    const anchored = compiled(film([map, { id: "name", kind: "text", text: "Alpha", placement: { mode: "anchor", target: "map.a" } }], [[{ do: "show", targets: ["map", "name"] }]]));
    assert.ok(!overlap(resolvedObject(anchored, "map.a").box, resolvedObject(anchored, "name").box), `writing anchored on a part is set off it (round ${round})`);
  }
  const big = { id: "map", kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { sea: [0.1, 0.1, 0.8, 0.8] }, outlines: { sea: square(0.1, 0.1, 0.8, 0.8) } };
  const [asked] = callouts(compiled(film([big], [[{ do: "show", targets: ["map"] }], [{ do: "label", target: "map.sea", text: "Sea", place: "inside" }]])), "map.sea");
  assert.ok(asked.leader === false, "a name asked inside its part is written there");

  // 4. Writing set on, in or against a picture leaves on the beat the picture does, even when it is
  // hidden later on its own, and never stays to float over the picture that takes its place.
  const named = subjectOf(1.3, { id: "map", hotspots: { a: [0.1, 0.1, 0.3, 0.3] }, outlines: { a: square(0.1, 0.1, 0.3, 0.3) } });
  const leaving = compiled(film(
    [named, { ...named, id: "next" }, { id: "name", kind: "text", text: "Alpha", placement: { mode: "relative", target: "map.a", relation: "near" } }, { id: "inside", kind: "text", text: "here", in: "map", at: [500, 500] }, { id: "under", kind: "text", text: "a note", placement: { mode: "relative", target: "name", relation: "below" } }],
    [[{ do: "show", targets: ["map", "name", "inside", "under"] }], [{ do: "hide", targets: ["map"] }, { do: "show", targets: ["next"] }], [{ do: "attention", target: "next", verb: "outline" }], [{ do: "hide", targets: ["name"] }]],
  ));
  const hide = leaving.resolved.scenes[0].beats[1].actions.find((action) => action.source.do === "hide");
  for (const id of ["name", "inside", "under"]) {
    const exit = component(leaving, id).exit;
    assert.ok(exit && exit.out + (exit.dur ?? 0) <= hide.end + 0.01, `writing set on a picture leaves with it (${id})`);
  }
}

// Writing by importance, labels that stay, marks that hold, and a picture stepping aside.
{
  const picture = (id, extra = {}) => ({ id, kind: "image", src: PNG_1x1, aspect: 1.3, role: "primary", placement: { mode: "zone", zone: "main" }, hotspots: { core: [0.3, 0.3, 0.4, 0.4] }, ...extra });
  const sized = compiled(film(
    [{ id: "t", kind: "text", text: "osmosis", size: "term", placement: { mode: "zone", zone: "main" } }, { id: "n", kind: "text", text: "cell", placement: { mode: "zone", zone: "footer" } }, { id: "g", kind: "text", text: "1850", size: "tag", textRole: "caption", placement: { mode: "zone", zone: "support" } }, { id: "big", kind: "text", text: "70%", size: "number", placement: { mode: "zone", zone: "main-left" } }],
    [[{ do: "show", targets: ["t", "n", "g", "big"] }]],
  ));
  const px = (id) => resolvedObject(sized, id).size;
  assert.ok(px("big") > px("t") && px("t") > px("n") && px("n") > px("g"), "writing is drawn by importance: number > term > name > tag");
  assert.ok(px("g") >= 18 && px("n") >= 24, "no writing is drawn below a phone-readable size, and writing with no size is a name");

  const kept = compiled(film(
    [picture("cell"), { id: "w", kind: "text", text: "wrong idea", placement: { mode: "zone", zone: "footer" } }],
    [[{ do: "show", targets: ["cell", "w"] }], [{ do: "label", id: "cell-name", target: "cell", text: "cell", size: "term" }, { do: "strike", target: "w" }, { do: "tick", id: "ok", target: "cell.core" }], [{ do: "attention", target: "cell.core", verb: "outline" }], [{ do: "hide", targets: ["cell-name", "ok"] }], [{ do: "hide", targets: ["w"] }]],
  ));
  assert.equal(kept.valid, true);
  const [scene] = kept.resolved.scenes;
  const gone = (item) => item.exit.out + item.exit.dur;
  const name = kept.gcl.find((item) => item.type === "attention" && item.verb === "callout" && item.text === "cell");
  const offBy = scene.beats[3].actions[0].end;
  assert.ok(Math.abs(gone(name) - offBy) < 1e-6 && name.fontPx > 30, "a label stays past its beat until a hide names it, at its size word's size");
  const strike = kept.gcl.find((item) => item.type === "attention" && item.verb === "strike");
  assert.ok(strike && strike.through === true && Math.abs(strike.exit.out - scene.beats[4].actions[0].start) < 1e-6, "a strike through writing holds until its target is hidden");
  const tick = kept.gcl.find((item) => item.type === "attention" && item.verb === "tick");
  assert.ok(tick && tick.target === "cell.core" && Math.abs(gone(tick) - offBy) < 1e-6, "a tick on a part holds until a hide names it");

  const coin = { id: "coin", kind: "image", src: PNG_1x1, aspect: 1, role: "primary", placement: { mode: "zone", zone: "main" } };
  const trended = compiled(film(
    [coin, { id: "cost", kind: "measure", value: 40, unit: "%", placement: { mode: "zone", zone: "footer" } }],
    [[{ do: "show", targets: ["coin", "cost"] }], [{ do: "trend", target: "coin", way: "up" }], [{ do: "trend", id: "fall", target: "coin", way: "down" }, { do: "trend", target: "cost", way: "down" }], [{ do: "hide", targets: ["fall"] }]],
  ));
  const beats = trended.resolved.scenes[0].beats;
  const trends = trended.gcl.filter((item) => item.type === "attention" && item.verb === "trend");
  const [rise, fall] = trends.filter((item) => item.target === "coin");
  assert.ok(rise.way === "up" && fall.way === "down" && typeof rise.color === "string", "a trend carries its way and the accent");
  assert.ok(Math.abs(rise.exit.out - beats[2].start) < 1e-6, "a later trend on the same thing replaces the first");
  assert.ok(Math.abs(rise.settles - beats[1].end) < 1e-6, "a trend settles to ink when its beat ends");
  assert.ok(Math.abs(gone(fall) - beats[3].actions[0].end) < 1e-6, "a trend holds until a hide names its id");
  assert.ok(trends.some((item) => item.target === "cost") && rise.avoid.length > 0, "a measure takes a trend, and a trend keeps off the writing on screen with it");
  const refusedTrend = compileLessonSpec(film([coin, { id: "w", kind: "text", text: "price", placement: { mode: "zone", zone: "footer" } }], [[{ do: "show", targets: ["coin", "w"] }], [{ do: "trend", target: "w", way: "up" }]]));
  assert.ok(diagnostics(refusedTrend).some((d) => /A trend goes beside/.test(d.message)), "a trend on writing is refused");
  const toned = compiled(film(
    [coin, { id: "jobs", kind: "measure", value: 70, scale: [0, 100], tone: "good", quiet: true, placement: { mode: "zone", zone: "footer" } }, { id: "loose", kind: "measure", value: 3, quiet: true, placement: { mode: "zone", zone: "support" } }],
    [[{ do: "show", targets: ["coin", "jobs", "loose"] }], [{ do: "trend", target: "coin", way: "up", tone: "bad" }]],
  ));
  const priced = toned.gcl.find((item) => item.type === "attention" && item.verb === "trend");
  assert.ok(priced.color === "#e08a80" && priced.settles === undefined, "a bad trend is red, and holds its tone past its beat");
  assert.ok(component(toned, "jobs").color === "#8cc49a" && component(toned, "jobs").quiet === true, "a good measure is green, and a quiet one draws no number");
  assert.ok(component(toned, "loose").quiet === undefined && diagnostics(toned).some((d) => d.code === "DROPPED_FIELD" && /no scale/.test(d.message)), "a quiet measure with no scale shows its number");
  const painted = renderLessonSpec(film([coin], [[{ do: "show", targets: ["coin"] }], [{ do: "trend", target: "coin", way: "down" }]]));
  const sheet = createCanvas(540, 960);
  globalThis.document ??= { createElement: () => createCanvas(300, 150) };
  painted.slide.render(sheet.getContext("2d"), painted.slide.duration - 0.05);

  const swapped = compiled(film(
    [picture("old"), picture("new"), { id: "old-name", kind: "text", text: "old", placement: { mode: "relative", target: "old", relation: "below" } }],
    [[{ do: "show", targets: ["old", "old-name"] }], [{ do: "aside", target: "old" }, { do: "show", targets: ["new"] }], [{ do: "attention", target: "new.core", verb: "outline" }]],
  ));
  assert.equal(swapped.valid, true, JSON.stringify(swapped.errors));
  const [oldBox, newBox] = ["old", "new"].map((id) => resolvedObject(swapped, id).box);
  assert.ok(Math.abs(oldBox.x - newBox.x) < 1 && Math.abs(oldBox.w - newBox.w) < 1, "the new subject is laid out in the slot the stepped-aside picture leaves");
  const aside = component(swapped, "old").motions.find((motion) => motion.kind === "aside");
  const [, half] = [0, (aside.scale * oldBox.h) / 2];
  assert.ok(aside.scale < 0.6 && aside.mute < 1, "a picture stepping aside shrinks and greys back");
  assert.ok(aside.to[1] + half <= newBox.y + 1 || aside.to[1] - half >= newBox.y + newBox.h - 1, "it lands in the free band above or below the new subject");
  assert.ok(component(swapped, "old-name").motions.some((motion) => motion.kind === "aside" && motion.scale === 1), "the writing beside it goes with it at its own size");
  const refused = compileLessonSpec(film([picture("p")], [[{ do: "show", targets: ["p"] }], [{ do: "aside", target: "p.core" }]]));
  assert.ok(!refused.lesson?.scenes?.[0]?.beats?.some((beat) => beat.actions.some((action) => action.do === "aside")), "only a whole picture steps aside");
}

// A meter reads as a level: a thick track, the filled share solid and the rest a hollow outline, its
// figure above it and its label under it; a picture named as its icon stands at its left, as tall as it.
{
  const meter = (extra) => film(
    [
      { id: "worker", kind: "image", src: PNG_1x1, aspect: 0.6, role: "primary", placement: { mode: "zone", zone: "main" } },
      { id: "jobs", kind: "measure", value: 50, countFrom: 100, unit: "%", label: "jobs left", scale: [0, 100], meter: "bar", placement: { mode: "relative", target: "worker", relation: "below" }, ...extra },
      { id: "badge", kind: "image", src: PNG_1x1, aspect: 1, placement: { mode: "relative", target: "worker", relation: "above" } },
    ],
    [[{ do: "show", targets: ["worker", "jobs", "badge"] }]],
  );
  const iconed = compiled(meter({ icon: "badge" }));
  const [jobs, badge] = ["jobs", "badge"].map((id) => resolvedObject(iconed, id).box);
  assert.ok(badge.x + badge.w <= jobs.x + 0.5 && Math.abs(badge.h - jobs.h) < 1 && Math.abs(badge.y + badge.h / 2 - (jobs.y + jobs.h / 2)) < 1, "a meter's icon stands at its left, as tall as it");
  const stray = compileLessonSpec(meter({ icon: "worker-hat" }));
  assert.ok(diagnostics(stray).some((item) => item.path.endsWith("/icon")), "an icon that names no picture of the scene is refused");

  const rendered = renderedValid(meter({}));
  const { at: [cx, cy], size } = component(rendered, "jobs");
  const canvas = createCanvas(540, 960);
  const ctx = canvas.getContext("2d");
  onLayers(() => rendered.slide.render(ctx, rendered.slide.duration - 0.05));
  const accent = [0x3f, 0x5d, 0x84];
  const near = (x, y) => Math.hypot(...Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)).map((v, k) => v - accent[k])) < 60;
  const [left, width, middle, thickness] = [cx - size * 2.25, size * 4.5, cy + size * 0.28, Math.max(14, size * 0.4)];
  assert.ok(thickness >= 14, "a meter's track is thick, never a thin rule");
  assert.ok(near(left + width * 0.25, middle), "the filled half of a half-full meter is solid");
  assert.ok(!near(left + width * 0.75, middle) && near(left + width * 0.75, middle - thickness / 2), "the empty half is a hollow outline in the meter's colour");
}

// A quantity over time reads as a market graph: its axes in the page's ink, a heavy line, and where it
// ends now marked with a dot and its value.
{
  const series = [[2015, 120], [2016, 118], [2017, 104], [2018, 96], [2019, 71], [2020, 52], [2021, 47]];
  const rendered = renderedValid(film([{ id: "g", kind: "chart", chart: "line", series, yLabel: "jobs (thousands)", xLabel: "year", placement: { mode: "zone", zone: "main" } }], [[{ do: "show", targets: ["g"] }]]));
  const { at: [cx, cy], w, h } = component(rendered, "g");
  const canvas = createCanvas(540, 960);
  const ctx = canvas.getContext("2d");
  writing = [];
  onLayers(() => rendered.slide.render(recorded(ctx), rendered.slide.duration - 0.05));
  const written = writing.map((one) => one.text);
  writing = null;
  const accent = [0x3f, 0x5d, 0x84];
  const inked = (x, y) => Math.hypot(...Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)).map((v, k) => v - accent[k])) < 70;
  const [sx, sy] = [(x) => cx - w / 2 + ((x - 2015) / 6) * w, (y) => cy + h / 2 - (y / 120) * h];
  const across = Array.from({ length: 40 }, (_, k) => sy(83.5) - 20 + k).filter((y) => inked(sx(2018.5), y)).length;
  assert.ok(across >= 4, `a line chart's line is heavy, ${across} px across`);
  assert.ok(inked(sx(2021), sy(47)) && written.includes("47"), "the point the line ends on is marked, with its value");
  assert.ok(written.includes("jobs (thousands)") && written.includes("year"), "its axes name the unit and the across axis");
}

console.log("paths: ok");
