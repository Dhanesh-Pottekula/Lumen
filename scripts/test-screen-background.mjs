import assert from "node:assert/strict";

import { renderLessonSpec } from "../packages/core/dist/index.js";

// Mirrors the engine view space (see gcl/viewport.ts); test-render-fidelity pins it to the slide.
const VIEW = { width: 540, height: 960 };

const SCREEN_BACKGROUND = "#0e0d0c";
const SPEC = {
  version: "1",
  title: "Screen background contract",
  theme: "parchment",
  scenes: [
    {
      id: "scene",
      composition: "hero",
      objects: [
        {
          id: "subject",
          kind: "text",
          text: "Subject",
          role: "hero",
          placement: { mode: "zone", zone: "main" },
        },
      ],
      beats: [
        {
          id: "reveal",
          pace: "instant",
          actions: [{ do: "show", targets: ["subject"], entrance: "instant" }],
        },
      ],
    },
  ],
};

const PROGRESS_SPEC = {
  ...SPEC,
  scenes: [
    SPEC.scenes[0],
    {
      ...SPEC.scenes[0],
      id: "scene-2",
      objects: [
        {
          ...SPEC.scenes[0].objects[0],
          id: "subject-2",
        },
      ],
      beats: [
        {
          ...SPEC.scenes[0].beats[0],
          id: "reveal-2",
          actions: [
            { do: "show", targets: ["subject-2"], entrance: "instant" },
          ],
        },
      ],
    },
  ],
};

function makeCanvas(records) {
  const state = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    filter: "none",
    font: "10px sans-serif",
    textAlign: "start",
  };
  const canvas = { width: VIEW.width, height: VIEW.height };
  const gradient = (kind) => ({
    kind,
    stops: [],
    addColorStop(offset, color) {
      this.stops.push([offset, color]);
    },
  });
  const noOp = () => {};
  const context = new Proxy(state, {
    get(target, property) {
      if (property === "canvas") return canvas;
      if (property === "getTransform") {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      }
      if (property === "createLinearGradient") {
        return () => gradient("linear-gradient");
      }
      if (property === "createRadialGradient") {
        return () => gradient("radial-gradient");
      }
      if (property === "measureText") {
        return (value) => ({
          width: String(value).length * 7,
          actualBoundingBoxAscent: 9,
          actualBoundingBoxDescent: 3,
        });
      }
      if (property === "fillRect") {
        return (x, y, width, height) => {
          records.push({ fillStyle: target.fillStyle, x, y, width, height });
        };
      }
      if (property === "drawImage") {
        return () => {
          records.push({
            op: "drawImage",
            filter: target.filter,
            composite: target.globalCompositeOperation,
          });
        };
      }
      if (property === "arc") {
        return (x, y, radius) => {
          target.lastArc = { x, y, radius };
        };
      }
      if (property === "fill") {
        return () => {
          if (target.lastArc) {
            records.push({ fillStyle: target.fillStyle, ...target.lastArc });
            target.lastArc = undefined;
          }
        };
      }
      if (property === "createPattern") return () => null;
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

function renderRecords(options, spec = SPEC, time = 0) {
  const records = [];
  const main = makeCanvas(records);
  globalThis.document = {
    createElement(name) {
      assert.equal(name, "canvas");
      return makeCanvas(records).canvas;
    },
  };

  const result = renderLessonSpec(spec, options);
  assert.equal(
    result.valid,
    true,
    result.valid ? undefined : JSON.stringify(result.errors),
  );
  result.slide.render(
    main.context,
    time === "end" ? result.slide.duration : time,
  );
  return { records, result };
}

function progressDotColors(options, time = 0) {
  return renderRecords(options, PROGRESS_SPEC, time)
    .records.filter(
      (record) =>
        record.y === 5 &&
        (record.radius === 3.4 || record.radius === 2.2),
    )
    .map((record) => record.fillStyle);
}

const custom = renderRecords({
  backgroundColor: SCREEN_BACKGROUND,
  colorScheme: "dark",
});
const customRecords = custom.records;
assert.equal(
  custom.result.lesson.theme,
  "textbook",
  "dark screen presentation must select the high-contrast dark-screen palette",
);
assert.ok(
  customRecords.some(
    (record) =>
      record.fillStyle === SCREEN_BACKGROUND &&
      record.x === 0 &&
      record.y === 0 &&
      record.width === VIEW.width &&
      record.height === VIEW.height,
  ),
  "custom rendering must paint the supplied solid screen background",
);
assert.equal(
  customRecords.some((record) => record.fillStyle?.kind === "linear-gradient"),
  false,
  "custom rendering must not repaint the backdrop with a theme gradient or grade",
);
assert.equal(
  customRecords.some(
    (record) =>
      record.op === "drawImage" &&
      (record.composite === "lighter" ||
        String(record.filter).includes("blur(")),
  ),
  false,
  "custom rendering must not add automatic glow or blurred cinematic copies",
);

const defaultRender = renderRecords(undefined);
const defaultRecords = defaultRender.records;
assert.equal(
  defaultRender.result.lesson.theme,
  "parchment",
  "default rendering must retain the authored theme",
);

const lightRender = renderRecords(
  { backgroundColor: "#f2ede6", colorScheme: "light" },
  { ...SPEC, theme: "textbook" },
);
assert.equal(
  lightRender.result.lesson.theme,
  "parchment",
  "light screen presentation must select the high-contrast light-screen palette",
);
assert.deepEqual(
  progressDotColors({
    backgroundColor: SCREEN_BACKGROUND,
    colorScheme: "dark",
  }),
  ["#5cc8ae", "#93a4b0"],
  "dark screen progress dots must use the selected high-contrast theme",
);
assert.deepEqual(
  progressDotColors(
    { backgroundColor: SCREEN_BACKGROUND, colorScheme: "dark" },
    "end",
  ),
  ["#eef5ef", "#eef5ef"],
  "completed dark screen progress dots must remain readable",
);
assert.deepEqual(
  progressDotColors({ backgroundColor: "#f2ede6", colorScheme: "light" }),
  ["#1d4f8f", "#735c3a"],
  "light screen progress dots must use the selected high-contrast theme",
);
assert.deepEqual(
  progressDotColors(
    { backgroundColor: "#f2ede6", colorScheme: "light" },
    "end",
  ),
  ["#4a2f1a", "#4a2f1a"],
  "completed light screen progress dots must remain readable",
);
assert.deepEqual(
  progressDotColors(undefined),
  ["#e8a13c", "#39434d"],
  "default rendering must keep the original progress-dot colors",
);
assert.deepEqual(
  progressDotColors(undefined, "end"),
  ["#5cc8ae", "#5cc8ae"],
  "default completed progress dots must remain unchanged",
);
assert.ok(
  defaultRecords.some(
    (record) =>
      record.fillStyle?.kind === "linear-gradient" &&
      record.x === 0 &&
      record.y === 0 &&
      record.width === VIEW.width &&
      record.height === VIEW.height,
  ),
  "default rendering must retain the theme gradient backdrop",
);

console.log("screen background rendering: ok");
