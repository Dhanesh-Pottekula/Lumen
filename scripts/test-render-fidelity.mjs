import assert from "node:assert/strict";

import {
  compileLessonSpec,
  getSimpleJsonCapabilities,
  renderLessonSpec,
} from "../packages/core/dist/index.js";

function lesson(objects, actions, composition = "hero") {
  return {
    version: "1",
    title: "fidelity probe",
    theme: "textbook",
    scenes: [
      {
        id: "s1",
        composition,
        objects,
        beats: [{ id: "b1", pace: "instant", actions }],
      },
    ],
  };
}

function shown(objects, composition) {
  return lesson(
    objects,
    [
      {
        do: "show",
        targets: objects
          .filter((object) => object.initial !== "visible")
          .map((object) => object.id),
        entrance: "instant",
      },
    ],
    composition,
  );
}

function compiled(spec, timing) {
  const result = compileLessonSpec(spec, timing);
  assert.equal(
    result.valid,
    true,
    result.valid ? undefined : JSON.stringify(result.errors),
  );
  return result;
}

// The host surface mirrors the engine's own view space (gcl/viewport.ts).
const VIEW = { width: 960, height: 540 };

function recordingCanvas(records) {
  const canvas = {
    width: VIEW.width,
    height: VIEW.height,
    clientWidth: VIEW.width,
    clientHeight: VIEW.height,
  };
  const stack = [];
  let path = [];
  const state = {
    canvas,
    fillStyle: "#000",
    strokeStyle: "#000",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    lineWidth: 1,
  };
  const noOp = () => {};
  const context = new Proxy(state, {
    get(target, property) {
      if (property === "save") return () => stack.push({ ...target });
      if (property === "restore")
        return () => Object.assign(target, stack.pop() ?? {});
      if (property === "getTransform")
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (property === "beginPath")
        return () => {
          path = [];
        };
      if (property === "moveTo") return (x, y) => path.push(["M", x, y]);
      if (property === "lineTo") return (x, y) => path.push(["L", x, y]);
      if (property === "bezierCurveTo")
        return (...values) => path.push(["C", ...values]);
      if (property === "quadraticCurveTo")
        return (...values) => path.push(["Q", ...values]);
      if (property === "arc") return (...values) => path.push(["A", ...values]);
      if (property === "rect" || property === "roundRect")
        return (...values) => path.push(["R", ...values]);
      if (property === "stroke") {
        return () =>
          records.push({
            op: "stroke",
            strokeStyle: target.strokeStyle,
            lineWidth: target.lineWidth,
            path: [...path],
          });
      }
      if (property === "fill")
        return () =>
          records.push({
            op: "fill",
            fillStyle: target.fillStyle,
            path: [...path],
          });
      if (property === "fillText" || property === "strokeText") {
        return (text, x, y) =>
          records.push({
            op: String(property),
            text: String(text),
            x,
            y,
            alpha: target.globalAlpha,
            font: target.font,
          });
      }
      if (property === "drawImage")
        return (...values) => records.push({ op: "drawImage", values });
      if (
        property === "translate" ||
        property === "rotate" ||
        property === "scale" ||
        property === "transform" ||
        property === "setTransform"
      ) {
        return (...values) => records.push({ op: String(property), values });
      }
      if (
        property === "createLinearGradient" ||
        property === "createRadialGradient"
      ) {
        return () => ({
          addColorStop(offset, color) {
            records.push({ op: "gradient-stop", offset, color });
          },
        });
      }
      if (property === "createPattern") return () => null;
      if (property === "measureText") {
        return (value) => ({
          width: String(value).length * 7,
          actualBoundingBoxAscent: 9,
          actualBoundingBoxDescent: 3,
        });
      }
      if (property in target) return target[property];
      return noOp;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  canvas.getContext = () => context;
  return { canvas, context };
}

function renderRecords(spec) {
  const records = [];
  globalThis.document = {
    createElement(name) {
      assert.equal(name, "canvas");
      return recordingCanvas(records).canvas;
    },
  };
  const main = recordingCanvas(records);
  const rendered = renderLessonSpec(spec);
  assert.equal(
    rendered.valid,
    true,
    rendered.valid ? undefined : JSON.stringify(rendered.errors),
  );
  rendered.slide.render(main.context, rendered.slide.duration);
  return { records, rendered };
}

const headingAndChart = compiled(
  shown([
    {
      id: "heading",
      kind: "text",
      text: "A clear heading",
      textRole: "heading",
      placement: { mode: "zone", zone: "main" },
    },
    {
      id: "chart",
      kind: "chart",
      chart: "bar",
      data: [{ label: "A", value: 1 }],
      placement: { mode: "zone", zone: "main-left" },
    },
  ]),
);
const heading = headingAndChart.resolved.scenes[0].objects.find(
  (object) => object.id === "heading",
);
const chart = headingAndChart.resolved.scenes[0].objects.find(
  (object) => object.id === "chart",
);
assert.ok(
  heading.position[1] < chart.position[1],
  "overlap separation must keep the heading above the chart",
);

const measurement = compiled(
  shown([
    { id: "text", kind: "text", text: "MEASURED", size: "large" },
    {
      id: "equation",
      kind: "equation",
      value: "\\frac{1}{2}",
      size: "large",
      placement: { mode: "zone", zone: "support" },
    },
    {
      id: "stat",
      kind: "stat",
      value: 1234,
      prefix: "$",
      unit: "kg",
      label: "total mass",
      commas: true,
      size: "large",
      placement: { mode: "zone", zone: "footer" },
    },
  ]),
);
const byId = new Map(
  measurement.resolved.scenes[0].objects.map((object) => [object.id, object]),
);
const text = byId.get("text");
assert.equal(
  text.box.w,
  text.source.text.length * text.size * 0.62 + text.size,
  "text layout must use the renderer estimate",
);
const equation = byId.get("equation");
assert.ok(
  equation.box.w < equation.source.value.length * equation.size * 0.55,
  "equation layout must measure rendered math, not raw TeX length",
);
const stat = byId.get("stat");
const expectedStatWidth = Math.max(
  "$1,234 kg".length * stat.size * 0.62 + stat.size,
  "total mass".length * 14 * 0.62 + 14,
);
assert.equal(
  stat.box.w,
  expectedStatWidth,
  "stat layout must include formatted prefix, grouping, unit, and label",
);

const spinning = compiled(
  lesson(
    [{ id: "spinner", kind: "shape", shape: "star" }],
    [
      { do: "show", targets: ["spinner"], entrance: "instant" },
      { do: "motion", target: "spinner", motion: "spin" },
    ],
  ),
);
const spin = spinning.gcl.find((item) => item.id === "spinner").motions[0];
assert.ok(
  Math.abs(Math.abs(spin.omega * spin.dur) - Math.PI * 2) < 1e-9,
  "normal spin must complete one revolution",
);

const outlined = compiled(
  shown([{ id: "disc", kind: "shape", shape: "disc", appearance: "outline" }]),
);
const outlinedComponent = outlined.gcl.find((item) => item.id === "disc");
assert.equal(
  outlinedComponent.shape,
  "circle",
  "an outlined disc must use the non-gradient circle painter",
);
assert.doesNotThrow(() =>
  renderRecords(
    shown([
      { id: "disc", kind: "shape", shape: "disc", appearance: "outline" },
    ]),
  ),
);

for (const [index, expression] of ["sqrt(x)", "log(x)"].entries()) {
  const { records } = renderRecords(
    shown(
      [
        {
          id: `function-chart-${index}`,
          kind: "chart",
          chart: "function",
          function: expression,
          xDomain: [-4, 4],
          yDomain: [-2, 4],
        },
      ],
      "data",
    ),
  );
  // Match the plotted curve specifically. The axes are also a stroke carrying `L` segments, so a
  // bare "some stroke has a line-to" assertion passes even when the curve is dropped entirely.
  const curves = records.filter(
    (record) =>
      record.op === "stroke" &&
      record.path.filter((entry) => entry[0] === "L").length >= 10,
  );
  assert.equal(
    curves.length,
    1,
    `${expression} must plot exactly one multi-point curve, not just chart furniture`,
  );
  assert.ok(
    curves[0].path.every((entry) =>
      entry.slice(1).every((value) => Number.isFinite(value)),
    ),
    `${expression} must not emit a non-finite coordinate into the curve path`,
  );
}

const lineRender = renderRecords(
  shown(
    [
      {
        id: "century",
        kind: "chart",
        chart: "line",
        series: [
          [1900, 1],
          [1950, 4],
          [2000, 2],
        ],
        yDomain: [0, 5],
      },
    ],
    "data",
  ),
);
const lineSpans = lineRender.records
  .filter((record) => record.op === "stroke" && record.lineWidth > 2)
  .map((record) =>
    record.path
      .filter((entry) => entry[0] === "M" || entry[0] === "L")
      .map((entry) => entry[1]),
  )
  .filter((xs) => xs.length >= 3)
  .map((xs) => Math.max(...xs) - Math.min(...xs));
assert.ok(
  lineSpans.some((span) => span > 200),
  "1900..2000 series must span the plot rather than its final sliver",
);

const visibleHeading = lesson(
  [
    {
      id: "visible",
      kind: "text",
      text: "Always visible",
      textRole: "heading",
      initial: "visible",
    },
  ],
  [{ do: "emphasize", target: "visible", emphasis: "pulse" }],
);
const visibleRecords = renderRecords(visibleHeading).records.filter(
  (record) => record.op === "fillText" && record.text === "Always visible",
);
assert.ok(
  visibleRecords.some((record) => record.alpha === 1),
  "zero-duration visible content must receive a final full-strength paint",
);

const capabilities = getSimpleJsonCapabilities();
for (const tag of ["linearGradient", "radialGradient", "clipPath"])
  assert.ok(capabilities.svg.tags.includes(tag));
for (const attribute of ["viewBox", "gradientUnits", "gradientTransform"])
  assert.ok(capabilities.svg.attributes.includes(attribute));
assert.deepEqual(capabilities.expressionConstants, ["pi", "e"]);
assert.ok(capabilities.expressionFunctions.includes("sqrt"));
const orbit =
  capabilities.schema.properties.scenes.items.properties.beats.items.properties.actions.items.oneOf.find(
    (variant) => variant.properties?.motion?.const === "orbit",
  );
assert.equal(
  "orbit" in orbit.properties,
  false,
  "orbit radius is derived from drawn geometry, not a size token",
);

const timed = compileLessonSpec(
  {
    version: "1",
    title: "timed",
    theme: "textbook",
    scenes: [
      {
        id: "first",
        composition: "hero",
        objects: [{ id: "a", kind: "shape", shape: "circle" }],
        beats: [
          {
            id: "a1",
            pace: "instant",
            actions: [{ do: "show", targets: ["a"], entrance: "instant" }],
          },
        ],
      },
      {
        id: "second",
        composition: "hero",
        objects: [{ id: "b", kind: "shape", shape: "circle" }],
        beats: [
          {
            id: "b1",
            pace: "instant",
            actions: [{ do: "show", targets: ["b"], entrance: "instant" }],
          },
        ],
      },
    ],
  },
  { sceneFloors: [4, 8] },
);
assert.equal(
  timed.valid,
  true,
  timed.valid ? undefined : JSON.stringify(timed.errors),
);
assert.deepEqual(
  timed.resolved.scenes.map((scene) => scene.duration),
  [4, 8],
  "wire-format floors must resolve by scene order",
);

const untimed = compileLessonSpec(timed.lesson);
assert.equal(untimed.valid, true);
for (const badFloors of [[4], [4, 8, 12], [4, -1], [4, Number.NaN]]) {
  const malformedTiming = compileLessonSpec(timed.lesson, {
    sceneFloors: badFloors,
  });
  assert.equal(malformedTiming.valid, true);
  assert.deepEqual(
    malformedTiming.resolved.scenes.map((scene) => scene.duration),
    untimed.resolved.scenes.map((scene) => scene.duration),
    `malformed ordered floors must be ignored as one atomic timing value: ${String(badFloors)}`,
  );
}
const malformedKeyedTiming = compileLessonSpec(timed.lesson, {
  sceneFloors: new Map([
    ["first", -1],
    ["second", Number.POSITIVE_INFINITY],
  ]),
});
assert.equal(malformedKeyedTiming.valid, true);
assert.deepEqual(
  malformedKeyedTiming.resolved.scenes.map((scene) => scene.duration),
  untimed.resolved.scenes.map((scene) => scene.duration),
  "invalid keyed floors must also be ignored at the engine boundary",
);

console.log("render fidelity: ok");
