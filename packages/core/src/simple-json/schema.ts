import { VIEW_HEIGHT, VIEW_WIDTH } from "../gcl/viewport";
import type { ZoneToken } from "./types";

const enumOf = (...values: string[]) => ({ type: "string", enum: values });
const id = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]*$" } as const;

/** Every zone a thing can be placed in, and so sent to. */
export const ZONE_NAMES: readonly ZoneToken[] = ["main", "main-left", "main-right", "support", "footer", "background", "overlay", "hud", "strip", "badge"];

const placement = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "zone"],
      properties: {
        mode: { const: "zone" },
        zone: enumOf(...ZONE_NAMES),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "target", "relation"],
      properties: {
        mode: { const: "relative" },
        target: { type: "string", minLength: 1 },
        relation: enumOf("above", "below", "left-of", "right-of", "near", "on", "inside"),
        gap: { type: "number", minimum: 0, maximum: 400 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "target"],
      properties: {
        mode: { const: "anchor" },
        target: { type: "string", minLength: 1 },
      },
    },
  ],
};

const dimension = enumOf("width", "height");
const edge = enumOf("top", "bottom", "left", "right", "center");
const direction = { oneOf: [enumOf("up", "down", "left", "right"), { type: "number", minimum: -360, maximum: 360 }] };

const objectBase = {
  id,
  role: enumOf("background", "support", "primary", "hero", "annotation", "hud"),
  placement,
  size: {
    oneOf: [
      enumOf("tiny", "mini", "small", "compact", "medium", "large", "hero", "fill"),
      {
        type: "object",
        additionalProperties: false,
        required: ["like"],
        properties: { like: { type: "string", minLength: 1 }, dimension, times: { type: "number", exclusiveMinimum: 0, maximum: 50 } },
      },
    ],
  },
  rotate: { type: "number", minimum: -360, maximum: 360 },
  attach: {
    type: "object",
    additionalProperties: false,
    required: ["self", "to", "at"],
    properties: { self: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, at: edge },
  },
  initial: enumOf("hidden", "visible"),
  space: enumOf("world", "screen"),
  temporary: { type: "boolean" },
  category: { type: "string", minLength: 1 },
  tint: enumOf("faint", "strong"),
};

const textEmphasis = enumOf("attention", "quiet");
const textSize = enumOf("term", "name", "tag", "number");

const strictObject = (
  required: string[],
  properties: Record<string, unknown>,
) => ({
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", ...required],
  properties: { ...objectBase, ...properties },
});

const numberPair = {
  type: "array",
  minItems: 2,
  maxItems: 2,
  prefixItems: [{ type: "number" }, { type: "number" }],
} as const;

const geoPair = {
  type: "array",
  minItems: 2,
  maxItems: 2,
  prefixItems: [
    { type: "number", minimum: -180, maximum: 180 },
    { type: "number", minimum: -90, maximum: 90 },
  ],
} as const;

const ring = { type: "array", minItems: 3, items: geoPair } as const;

const numberQuad = {
  type: "array",
  minItems: 4,
  maxItems: 4,
  prefixItems: [
    { type: "number" },
    { type: "number" },
    { type: "number", exclusiveMinimum: 0 },
    { type: "number", exclusiveMinimum: 0 },
  ],
} as const;

const categoryDatum = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value"],
  properties: {
    label: { type: "string", minLength: 1 },
    value: { type: "number" },
    category: { type: "string", minLength: 1 },
  },
} as const;

export const SIMPLE_JSON_MAP_ICONS = [
  "check",
  "cross",
  "plus",
  "minus",
  "star",
  "heart",
  "circle",
  "square",
  "triangle",
  "gear",
  "bolt",
  "drop",
  "sun",
  "leaf",
  "flame",
  "factory",
  "home",
  "person",
  "book",
  "flask",
  "atom",
  "clock",
  "pin",
  "warning",
  "info",
  "search",
  "cloud",
  "mountain",
  "seed",
] as const;

const chartBase = {
  xDomain: numberPair,
  yDomain: numberPair,
  axes: { type: "boolean" },
  xLabel: { type: "string" },
  yLabel: { type: "string" },
  title: { type: "string", minLength: 1, maxLength: 90 },
  source: { type: "string", minLength: 1, maxLength: 90 },
};

const pairDatum = {
  type: "object",
  additionalProperties: false,
  required: ["label", "from", "to"],
  properties: {
    label: { type: "string", minLength: 1 },
    from: { type: "number" },
    to: { type: "number" },
  },
} as const;

const chartMarker = {
  type: "object",
  additionalProperties: false,
  required: ["from", "to"],
  properties: { from: { type: "number" }, to: { type: "number" } },
} as const;

const trail = enumOf("dots", "ghosts");
const dates = { type: "array", minItems: 2, maxItems: 6, items: { type: "string", minLength: 1, maxLength: 16 } };

const frameRef = { type: "string", minLength: 1 };
const framedWriting = { in: frameRef, at: numberPair };

const object = {
  oneOf: [
    strictObject(["text"], {
      kind: { const: "text" },
      text: { type: "string", minLength: 1 },
      textRole: enumOf("body", "bullet", "caption"),
      size: { oneOf: [textSize, ...objectBase.size.oneOf] },
      emphasis: textEmphasis,
      ...framedWriting,
    }),
    strictObject(["value"], {
      kind: { const: "equation" },
      value: { type: "string", minLength: 1 },
      ...framedWriting,
    }),
    strictObject(["value"], {
      kind: { const: "measure" },
      value: { type: "number" },
      countFrom: { type: "number" },
      unit: { type: "string" },
      label: { type: "string" },
      decimals: { type: "integer", minimum: 0, maximum: 8 },
      commas: { type: "boolean" },
      prefix: { type: "string" },
      scale: numberPair,
      meter: enumOf("bar", "ring"),
      tone: enumOf("good", "bad"),
      quiet: { type: "boolean" },
      icon: { type: "string", minLength: 1 },
    }),
    strictObject(["asset"], {
      kind: { const: "visual" },
      asset: { type: "string", minLength: 1 },
      color: { type: "string", minLength: 1 },
      orientation: enumOf("left", "right", "up", "down"),
    }),
    strictObject(["svg"], {
      kind: { const: "svg-artwork" },
      svg: { type: "string", minLength: 1, pattern: "\\S" },
      width: { type: "number", minimum: 40, maximum: 492 },
      draw: { type: "string", minLength: 1 },
      parts: { type: "array", minItems: 1, maxItems: 32, items: { type: "string" } },
      pixels: numberPair,
      temporaryParts: {
        type: "array",
        minItems: 1,
        maxItems: 32,
        uniqueItems: true,
        items: id,
      },
    }),
    strictObject(["src"], {
      kind: { const: "image" },
      src: {
        type: "string",
        minLength: 12,
        pattern: "^(data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\\s]+|blob:\\S+)$",
      },
      alt: { type: "string", maxLength: 300 },
      aspect: { type: "number", exclusiveMinimum: 0.05, exclusiveMaximum: 20 },
      hotspots: {
        type: "object",
        maxProperties: 24,
        propertyNames: { pattern: "^[a-z][a-z0-9-]{0,31}$" },
        additionalProperties: numberQuad,
      },
      outlines: {
        type: "object",
        maxProperties: 24,
        propertyNames: { pattern: "^[a-z][a-z0-9-]{0,31}$" },
        additionalProperties: {
          type: "array",
          minItems: 3,
          maxItems: 128,
          items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
        },
      },
      // The whole subject's own border, as fractions of the picture, traced from its cut-out.
      silhouette: {
        type: "array",
        minItems: 3,
        maxItems: 160,
        items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
      },
      facing: direction,
    }),
    strictObject(["d"], {
      kind: { const: "path" },
      d: { type: "string", minLength: 3, maxLength: 4000, pattern: "^\\s*[Mm]" },
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
      in: frameRef,
      stroke: enumOf("ink", "accent", "muted", "danger", "none"),
      fill: enumOf("ink", "accent", "muted", "danger", "none"),
      arrow: enumOf("start", "end", "both"),
      appearance: enumOf("solid", "dashed"),
    }),
    strictObject(["at", "from", "to"], {
      kind: { const: "angle" },
      at: { type: "string", minLength: 1 },
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
    }),
    strictObject(["from", "to"], {
      kind: { const: "span" },
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
    }),
    strictObject(["from", "to"], {
      kind: { const: "line" },
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
      form: enumOf("straight", "elbow", "curved", "traced"),
      bend: { type: "number", minimum: -1, maximum: 1 },
      arrow: enumOf("start", "end", "both"),
    }),
    strictObject(["shape"], {
      kind: { const: "shape" },
      shape: enumOf("circle", "polygon", "star", "heart", "disc"),
      sides: { type: "integer", minimum: 3, maximum: 12 },
      appearance: enumOf("solid", "outline", "shaded"),
    }),
    strictObject(["x", "y"], {
      kind: { const: "curve" },
      x: { type: "string", minLength: 1 },
      y: { type: "string", minLength: 1 },
      domain: numberPair,
      appearance: enumOf("solid", "dashed"),
      from: { type: "string", minLength: 1 },
      to: { type: "string", minLength: 1 },
    }),
    strictObject(["chart", "data"], {
      kind: { const: "chart" },
      chart: enumOf("bar", "pie", "donut"),
      data: { type: "array", minItems: 1, items: categoryDatum },
      ...chartBase,
    }),
    strictObject(["chart", "series"], {
      kind: { const: "chart" },
      chart: enumOf("line", "area", "scatter"),
      // One line of `[x, y]` points, or up to four lines drawn together on one pair of axes.
      series: {
        anyOf: [
          { type: "array", minItems: 2, items: numberPair },
          { type: "array", minItems: 1, maxItems: 4, items: { type: "array", minItems: 2, items: numberPair } },
        ],
      },
      names: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1 } },
      trend: { type: "boolean" },
      marker: chartMarker,
      ...chartBase,
    }),
    strictObject(["chart", "function"], {
      kind: { const: "chart" },
      chart: { const: "function" },
      function: { type: "string", minLength: 1 },
      tangent: {
        type: "object",
        additionalProperties: false,
        required: ["at", "from"],
        properties: { at: { type: "number" }, from: { type: "number" } },
      },
      marker: chartMarker,
      ...chartBase,
    }),
    strictObject(["chart", "data"], {
      kind: { const: "chart" },
      chart: enumOf("hbar", "seats"),
      data: { type: "array", minItems: 1, maxItems: 12, items: categoryDatum },
      majority: { type: "boolean" },
      ...chartBase,
    }),
    strictObject(["chart", "data"], {
      kind: { const: "chart" },
      chart: { const: "units" },
      data: { type: "array", minItems: 1, maxItems: 4, items: categoryDatum },
      total: { type: "integer", minimum: 2, maximum: 100 },
      icon: enumOf(...SIMPLE_JSON_MAP_ICONS),
      per: { type: "string", minLength: 1, maxLength: 60 },
      ...chartBase,
    }),
    strictObject(["chart", "pairs"], {
      kind: { const: "chart" },
      chart: enumOf("slope", "dumbbell", "pyramid"),
      pairs: { type: "array", minItems: 1, maxItems: 10, items: pairDatum },
      columns: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        prefixItems: [{ type: "string", minLength: 1 }, { type: "string", minLength: 1 }],
      },
      ...chartBase,
    }),
    strictObject(["chart", "series"], {
      kind: { const: "chart" },
      chart: { const: "stack" },
      series: { type: "array", minItems: 2, maxItems: 4, items: { type: "array", minItems: 2, items: numberPair } },
      names: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1 } },
      ...chartBase,
    }),
    strictObject(["chart", "values"], {
      kind: { const: "chart" },
      chart: { const: "histogram" },
      values: { type: "array", minItems: 2, maxItems: 400, items: { type: "number" } },
      bins: { type: "integer", minimum: 2, maximum: 16 },
      marks: enumOf("bars", "dots"),
      ...chartBase,
    }),
    strictObject(["chart", "series"], {
      kind: { const: "chart" },
      chart: { const: "sparkline" },
      series: { type: "array", minItems: 2, items: numberPair },
      ...chartBase,
    }),
    strictObject(["chart", "function"], {
      kind: { const: "chart" },
      chart: { const: "riemann" },
      function: { type: "string", minLength: 1 },
      rectangles: enumOf("few", "several", "many", "dense"),
      ...chartBase,
    }),
    strictObject(["categories"], {
      kind: { const: "legend" },
      categories: {
        oneOf: [
          { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
          { const: "film" },
        ],
      },
    }),
    strictObject(["features"], {
      kind: { const: "map" },
      features: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "rings"],
          properties: {
            id,
            rings: { type: "array", minItems: 1, items: ring },
            category: { type: "string", minLength: 1 },
            value: { type: "number" },
          },
        },
      },
      markers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["lon", "lat"],
          properties: {
            lon: { type: "number", minimum: -180, maximum: 180 },
            lat: { type: "number", minimum: -90, maximum: 90 },
            label: { type: "string" },
            icon: enumOf(...SIMPLE_JSON_MAP_ICONS),
            category: { type: "string" },
            value: { type: "number", minimum: 0 },
          },
        },
      },
      legend: { type: "string", minLength: 1, maxLength: 40 },
      places: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "lon", "lat"],
          properties: {
            name: { type: "string", minLength: 1 },
            lon: { type: "number", minimum: -180, maximum: 180 },
            lat: { type: "number", minimum: -90, maximum: 90 },
          },
        },
      },
      flows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to"],
          properties: {
            from: { oneOf: [{ type: "string", minLength: 1 }, geoPair] },
            to: { oneOf: [{ type: "string", minLength: 1 }, geoPair] },
            category: { type: "string" },
            bend: enumOf("left", "right", "direct"),
            pace: enumOf("instant", "quick", "normal", "slow", "dramatic"),
          },
        },
      },
      outline: ring,
      growth: { type: "array", minItems: 2, items: ring },
      growthPace: enumOf("instant", "quick", "normal", "slow", "dramatic"),
      stagger: enumOf("instant", "quick", "normal", "slow", "dramatic"),
    }),
    strictObject(["from", "to"], {
      kind: { const: "timeline" },
      from: { type: "number" },
      to: { type: "number" },
      events: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["at", "label"],
          properties: {
            at: { type: "number" },
            label: { type: "string", minLength: 1 },
            side: enumOf("above", "below"),
            lane: { type: "integer", minimum: 0, maximum: 2 },
          },
        },
      },
      eras: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to", "label"],
          properties: {
            from: { type: "number" },
            to: { type: "number" },
            label: { type: "string", minLength: 1 },
            category: { type: "string" },
            lane: { type: "integer", minimum: 0, maximum: 2 },
          },
        },
      },
      lanes: { type: "array", minItems: 2, maxItems: 3, items: { type: "string", minLength: 1, maxLength: 16 } },
      links: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to"],
          properties: {
            from: { type: "integer", minimum: 0 },
            to: { type: "integer", minimum: 0 },
            label: { type: "string", minLength: 1, maxLength: 24 },
          },
        },
      },
      playhead: {
        oneOf: [
          { type: "number" },
          {
            type: "object",
            additionalProperties: false,
            required: ["from", "to"],
            properties: {
              from: { type: "number" },
              to: { type: "number" },
              pace: enumOf("instant", "quick", "normal", "slow", "dramatic"),
            },
          },
        ],
      },
    }),
    strictObject(["rows"], {
      kind: { const: "table" },
      rows: {
        type: "array",
        minItems: 1,
        items: { type: "array", minItems: 1, items: { type: "string" } },
      },
      header: { type: "boolean" },
    }),
    strictObject(["layout", "nodes"], {
      kind: { const: "diagram" },
      layout: enumOf("sequence", "cycle", "tree", "flow"),
      nodes: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label"],
          properties: {
            id,
            label: { type: "string", minLength: 1, maxLength: 48 },
            parent: { type: "string", minLength: 1 },
            note: { type: "string", minLength: 1, maxLength: 60 },
          },
        },
      },
      links: {
        type: "array",
        maxItems: 14,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to"],
          properties: {
            from: { type: "string", minLength: 1 },
            to: { type: "string", minLength: 1 },
            label: { type: "string", minLength: 1, maxLength: 20 },
            type: enumOf("leads", "condition", "trigger", "prevents"),
          },
        },
      },
    }),
    strictObject(["titles", "rows"], {
      kind: { const: "compare" },
      titles: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        prefixItems: [{ type: "string", minLength: 1, maxLength: 24 }, { type: "string", minLength: 1, maxLength: 24 }],
      },
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["left", "right"],
          properties: {
            left: { type: "string", minLength: 1, maxLength: 48 },
            right: { type: "string", minLength: 1, maxLength: 48 },
            match: enumOf("same", "different", "maps", "fails"),
          },
        },
      },
    }),
    strictObject(["unit", "items"], {
      kind: { const: "scale" },
      unit: { type: "string", minLength: 1, maxLength: 12 },
      items: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "size"],
          properties: {
            label: { type: "string", minLength: 1, maxLength: 24 },
            size: { type: "number", exclusiveMinimum: 0 },
          },
        },
      },
    }),
    strictObject(["excerpt"], {
      kind: { const: "evidence" },
      excerpt: { type: "string", minLength: 1, maxLength: 320 },
      author: { type: "string", minLength: 1, maxLength: 60 },
      date: { type: "string", minLength: 1, maxLength: 30 },
      place: { type: "string", minLength: 1, maxLength: 40 },
      audience: { type: "string", minLength: 1, maxLength: 40 },
    }),
    strictObject(["text"], {
      kind: { const: "question" },
      text: { type: "string", minLength: 1, maxLength: 80 },
    }),
    strictObject(["forces"], {
      kind: { const: "forces" },
      forces: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "angle", "size"],
          properties: {
            id,
            label: { type: "string", minLength: 1, maxLength: 40 },
            angle: { type: "number", minimum: -360, maximum: 360 },
            size: { type: "number", exclusiveMinimum: 0 },
            resolve: {
              type: "object",
              additionalProperties: false,
              required: ["axis", "labels"],
              properties: {
                axis: { type: "number", minimum: -360, maximum: 360 },
                labels: {
                  type: "array",
                  minItems: 2,
                  maxItems: 2,
                  prefixItems: [{ type: "string", minLength: 1 }, { type: "string", minLength: 1 }],
                },
              },
            },
          },
        },
      },
    }),
    strictObject(["lines"], {
      kind: { const: "working" },
      lines: {
        type: "array",
        minItems: 1,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tex"],
          properties: {
            tex: { type: "string", minLength: 1, maxLength: 80 },
            note: { type: "string", minLength: 1, maxLength: 24 },
            cancel: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1 } },
          },
        },
      },
    }),
    strictObject(["children"], {
      kind: { const: "group" },
      children: {
        type: "array",
        minItems: 1,
        items: { $ref: "#/$defs/object" },
      },
      layout: enumOf("row", "stack", "grid"),
      columns: { type: "integer", minimum: 1, maximum: 6 },
      build: enumOf("instant", "quick", "normal", "slow", "dramatic"),
      clip: { type: "boolean" },
    }),
  ],
} as const;

// A question the film asks once its scene has played; the phone shows it, the engine only carries it.
export const SCENE_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "answer", "why", "wrong"],
  properties: {
    question: { type: "string", minLength: 1, maxLength: 160 },
    answer: { type: "string", minLength: 1, maxLength: 120 },
    why: { type: "string", minLength: 1, maxLength: 200 },
    wrong: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "why"],
        properties: {
          text: { type: "string", minLength: 1, maxLength: 120 },
          why: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
    },
    place: enumOf("below", "over"),
  },
} as const;

const action = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "targets"],
      properties: {
        do: { const: "show" },
        targets: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        entrance: enumOf(
          "instant",
          "fade",
          "draw",
          "wipe",
          "iris",
          "slam",
          "word-by-word",
          "typewriter",
          "scramble",
          "rise",
        ),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "targets"],
      properties: {
        do: { const: "hide" },
        targets: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
        },
        exit: enumOf(
          "instant",
          "fade",
          "erase",
          "wipe",
          "iris",
          "dissolve",
          "slide",
          "shrink",
        ),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target"],
      properties: {
        do: { const: "strike" },
        id,
        target: { type: "string", minLength: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target"],
      properties: {
        do: { const: "tick" },
        id,
        target: { type: "string", minLength: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "way"],
      properties: {
        do: { const: "trend" },
        id,
        target: { type: "string", minLength: 1 },
        way: enumOf("up", "down"),
        tone: enumOf("good", "bad"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target"],
      properties: {
        do: { const: "aside" },
        target: { type: "string", minLength: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target"],
      properties: {
        do: { const: "camera" },
        target: { type: "string", minLength: 1 },
        shot: enumOf("overview", "wide", "medium", "close", "detail"),
        movement: enumOf("cut", "move", "push", "arc"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "text"],
      properties: {
        do: { const: "label" },
        id,
        target: { type: "string", minLength: 1 },
        text: { type: "string", minLength: 1 },
        size: textSize,
        title: { type: "string", minLength: 1 },
        style: enumOf("text", "pill", "rect", "tag", "bubble", "badge"),
        emphasis: textEmphasis,
        place: enumOf("inside", "beside", "pointer"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "text"],
      properties: {
        do: { const: "speak" },
        id,
        target: { type: "string", minLength: 1 },
        text: { type: "string", minLength: 1, maxLength: 60 },
        stress: { type: "string", minLength: 1, maxLength: 24 },
        hold: { type: "boolean" },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "stops"],
      properties: {
        do: { const: "tour" },
        labelMode: { const: "one-at-a-time" },
        returnTo: { const: "overview" },
        stops: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["target", "label"],
            properties: {
              target: { type: "string", minLength: 1 },
              label: { type: "string", minLength: 1 },
              shot: enumOf("overview", "wide", "medium", "close", "detail"),
            },
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "targets"],
      properties: {
        do: { const: "tint" },
        targets: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
        category: { type: "string", minLength: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "to"],
      properties: {
        do: { const: "fill" },
        target: { type: "string", minLength: 1 },
        to: enumOf("empty", "quarter", "half", "three-quarters", "full"),
        direction: enumOf("up", "down", "left", "right"),
        color: enumOf("ink", "accent", "muted", "danger"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "move" },
        trail,
        dates,
        to: { type: "string", minLength: 1 },
        toward: { type: "string", minLength: 1 },
        away: { type: "string", minLength: 1 },
        opposite: { type: "string", minLength: 1 },
        direction,
        by: {
          oneOf: [
            { type: "number", exclusiveMinimum: 0, maximum: 2000 },
            {
              type: "object",
              additionalProperties: false,
              required: ["times", "of"],
              properties: { times: { type: "number", exclusiveMinimum: 0, maximum: 50 }, of: { type: "string", minLength: 1 }, dimension },
            },
          ],
        },
        land: enumOf("surface", "centre"),
        gait: enumOf("walk", "run", "hop"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion", "to"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "fall" },
        trail,
        dates,
        to: { type: "string", minLength: 1 },
        land: enumOf("surface", "centre"),
        bounce: enumOf("none", "soft", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion", "around"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "orbit" },
        trail,
        dates,
        around: { type: "string", minLength: 1 },
        turns: { type: "number", exclusiveMinimum: 0, maximum: 8 },
        direction: enumOf("clockwise", "counterclockwise"),
        ratio: { type: "number", minimum: 0.15, maximum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "along" },
        trail,
        dates,
        along: { type: "string", minLength: 1 },
        through: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", minLength: 1 } },
        gait: enumOf("walk", "run", "hop"),
        repeat: enumOf("once", "there-and-back", "loop"),
        face: enumOf("path"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "spin" },
        direction: enumOf("clockwise", "counterclockwise"),
        about: { type: "string", minLength: 1 },
        sweep: { type: "number", exclusiveMinimum: 0, maximum: 360 },
        repeat: enumOf("once", "there-and-back", "loop"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "morph" },
        ghost: { type: "boolean" },
        d: { type: "string", minLength: 3, maxLength: 4000, pattern: "^\\s*[Mm]" },
        shape: enumOf("circle", "polygon", "star", "heart"),
        sides: { type: "integer", minimum: 3, maximum: 12 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "motion"],
      properties: {
        do: { const: "motion" },
        target: { type: "string", minLength: 1 },
        with: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 8 },
        motion: { const: "wander" },
        to: { type: "string", minLength: 1 },
        land: enumOf("surface", "centre"),
        trail,
        dates,
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "emphasis"],
      properties: {
        do: { const: "emphasize" },
        target: { type: "string", minLength: 1 },
        emphasis: enumOf("punch", "shake", "pulse", "wiggle"),
        strength: enumOf("subtle", "normal", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "verb"],
      properties: {
        do: { const: "attention" },
        target: { type: "string", minLength: 1 },
        verb: enumOf(
          "callout",
          "spotlight",
          "dim",
          "box",
          "brackets",
          "encircle",
          "outline",
          "converge",
          "spark",
          "vignette",
          "rings",
          "trace",
          "underline",
          "hold",
          "cancel",
        ),
        // The matching parts of other things, lit by the same cue at the same moment.
        with: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1 } },
        from: { type: "string", minLength: 1 },
        text: { type: "string" },
        title: { type: "string" },
        side: enumOf("auto", "north", "south", "east", "west"),
        route: enumOf("auto", "straight", "elbow", "curve"),
        style: enumOf("text", "pill", "rect", "tag", "bubble", "badge"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "verb", "from"],
      properties: {
        do: { const: "attention" },
        target: { type: "string", minLength: 1 },
        verb: { const: "pointer" },
        from: { type: "string", minLength: 1 },
        text: { type: "string" },
        title: { type: "string" },
        side: enumOf("auto", "north", "south", "east", "west"),
        route: enumOf("auto", "straight", "elbow", "curve"),
        style: enumOf("text", "pill", "rect", "tag", "bubble", "badge"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "effect", "target"],
      properties: {
        do: { const: "effect" },
        effect: { const: "particles" },
        target: { type: "string", minLength: 1 },
        preset: enumOf(
          "fire",
          "smoke",
          "sparks",
          "rain",
          "snow",
          "dust",
          "confetti",
          "energy",
        ),
        intensity: enumOf("subtle", "normal", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "effect", "target"],
      properties: {
        do: { const: "effect" },
        effect: { const: "glow" },
        target: { type: "string", minLength: 1 },
        intensity: enumOf("subtle", "normal", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "effect", "from", "to"],
      properties: {
        do: { const: "effect" },
        effect: { const: "flow" },
        from: { type: "string", minLength: 1 },
        to: { type: "string", minLength: 1 },
        intensity: enumOf("subtle", "normal", "strong"),
      },
    },
  ],
};

export const LESSON_SPEC_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://lumen.local/schemas/lesson-spec-v1.json",
  type: "object",
  $defs: { object },
  additionalProperties: false,
  required: ["version", "title", "theme", "scenes"],
  properties: {
    version: { const: "1" },
    title: { type: "string", minLength: 1 },
    theme: enumOf("textbook", "parchment", "blueprint", "chalkboard"),
    categories: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name"],
        properties: {
          id,
          name: { type: "string", minLength: 1, maxLength: 40 },
          color: enumOf("accent", "second", "ink", "muted", "danger"),
        },
      },
    },
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "composition", "objects", "beats"],
        properties: {
          id,
          composition: enumOf(
            "hero",
            "hero-diagram",
            "equation",
            "overview-detail",
            "split",
            "comparison",
            "process",
            "equation-plot",
            "data",
            "map",
            "timeline",
            "table",
            "custom-relational",
          ),
          narration: { type: "string", minLength: 1 },
          check: SCENE_CHECK_SCHEMA,
          categories_of: { type: "object", additionalProperties: { type: "string", minLength: 1 } },
          objects: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/$defs/object" },
          },
          beats: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "actions"],
              properties: {
                // Nothing addresses a beat by its id, so it is a label and any spelling of one will do.
                id: { type: "string", minLength: 1 },
                pace: enumOf("instant", "quick", "normal", "slow", "dramatic"),
                // The narration's own words this beat begins on, copied exactly: the beat starts as they are spoken.
                say: { type: "string", minLength: 1 },
                actions: { type: "array", minItems: 1, items: action },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Complete schema supplied to the LLM. Simple JSON has one direct generative format. */
export const LESSON_INPUT_SCHEMA = LESSON_SPEC_SCHEMA;
