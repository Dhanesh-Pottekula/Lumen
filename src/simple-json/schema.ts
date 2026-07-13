import { CINEMATIC_RECIPE_IDS } from "./types";

const enumOf = (...values: string[]) => ({ type: "string", enum: values });
const id = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]*$" } as const;

const placement = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "zone"],
      properties: {
        mode: { const: "zone" },
        zone: enumOf("title", "main", "main-left", "main-right", "support", "footer", "background", "overlay", "hud"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "target", "relation"],
      properties: {
        mode: { const: "relative" },
        target: { type: "string", minLength: 1 },
        relation: enumOf("above", "below", "left-of", "right-of", "near"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["mode", "target"],
      properties: { mode: { const: "anchor" }, target: { type: "string", minLength: 1 } },
    },
  ],
};

const objectBase = {
  id,
  role: enumOf("background", "support", "primary", "hero", "annotation", "hud"),
  placement,
  size: enumOf("tiny", "small", "medium", "large", "hero", "fill"),
  initial: enumOf("hidden", "visible"),
  space: enumOf("world", "screen"),
};

const strictObject = (required: string[], properties: Record<string, unknown>) => ({
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

const ring = { type: "array", minItems: 3, items: numberPair } as const;

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

const object = {
  oneOf: [
    strictObject(["text"], {
      kind: { const: "text" },
      text: { type: "string", minLength: 1 },
      textRole: enumOf("heading", "title", "body", "bullet", "caption"),
    }),
    strictObject(["value"], { kind: { const: "equation" }, value: { type: "string", minLength: 1 } }),
    strictObject(["value"], {
      kind: { const: "stat" }, value: { type: "number" }, from: { type: "number" }, unit: { type: "string" },
      label: { type: "string" }, decimals: { type: "integer", minimum: 0, maximum: 8 }, commas: { type: "boolean" }, prefix: { type: "string" },
    }),
    strictObject(["asset"], {
      kind: { const: "visual" }, asset: { type: "string", minLength: 1 }, orientation: enumOf("left", "right", "up", "down"),
    }),
    strictObject(["from", "to"], {
      kind: { const: "line" }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 },
      form: enumOf("straight", "elbow", "curved", "arrow", "traced"),
    }),
    strictObject(["shape"], {
      kind: { const: "shape" }, shape: enumOf("circle", "polygon", "star", "heart", "disc"),
      sides: { type: "integer", minimum: 3, maximum: 12 }, appearance: enumOf("solid", "outline", "shaded"),
    }),
    strictObject(["x", "y"], {
      kind: { const: "curve" }, x: { type: "string", minLength: 1 }, y: { type: "string", minLength: 1 },
      domain: numberPair, appearance: enumOf("solid", "dashed"),
    }),
    strictObject(["chart"], {
      kind: { const: "chart" }, chart: enumOf("bar", "line", "area", "scatter", "pie", "donut", "function", "riemann"),
      data: { type: "array", minItems: 1, items: categoryDatum },
      series: { type: "array", minItems: 2, items: numberPair },
      function: { type: "string", minLength: 1 }, rectangles: enumOf("few", "several", "many", "dense"),
      xDomain: numberPair, yDomain: numberPair, axes: { type: "boolean" }, xLabel: { type: "string" }, yLabel: { type: "string" },
    }),
    strictObject(["categories"], {
      kind: { const: "legend" }, categories: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
    }),
    strictObject(["features"], {
      kind: { const: "map" },
      features: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["id", "rings"], properties: { id, rings: { type: "array", minItems: 1, items: ring }, category: { type: "string", minLength: 1 } } } },
      markers: { type: "array", items: { type: "object", additionalProperties: false, required: ["lon", "lat"], properties: { lon: { type: "number" }, lat: { type: "number" }, label: { type: "string" }, icon: { type: "string" }, category: { type: "string" } } } },
      places: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "lon", "lat"], properties: { name: { type: "string", minLength: 1 }, lon: { type: "number" }, lat: { type: "number" } } } },
      flows: { type: "array", items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { oneOf: [{ type: "string", minLength: 1 }, numberPair] }, to: { oneOf: [{ type: "string", minLength: 1 }, numberPair] }, category: { type: "string" }, bend: enumOf("left", "right", "direct"), pace: enumOf("instant", "quick", "normal", "slow", "dramatic") } } },
      outline: ring, growth: { type: "array", minItems: 2, items: ring }, growthPace: enumOf("instant", "quick", "normal", "slow", "dramatic"), stagger: enumOf("instant", "quick", "normal", "slow", "dramatic"),
    }),
    strictObject(["from", "to"], {
      kind: { const: "timeline" }, from: { type: "number" }, to: { type: "number" },
      events: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "label"], properties: { at: { type: "number" }, label: { type: "string", minLength: 1 }, side: enumOf("above", "below") } } },
      eras: { type: "array", items: { type: "object", additionalProperties: false, required: ["from", "to", "label"], properties: { from: { type: "number" }, to: { type: "number" }, label: { type: "string", minLength: 1 }, category: { type: "string" } } } },
      playhead: { oneOf: [{ type: "number" }, { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "number" }, to: { type: "number" }, pace: enumOf("instant", "quick", "normal", "slow", "dramatic") } }] },
    }),
    strictObject(["rows"], {
      kind: { const: "table" }, rows: { type: "array", minItems: 1, items: { type: "array", minItems: 1, items: { type: "string" } } }, header: { type: "boolean" },
    }),
    strictObject(["children"], {
      kind: { const: "group" }, children: { type: "array", minItems: 1, items: { $ref: "#/$defs/object" } },
      layout: enumOf("row", "stack", "grid"), columns: { type: "integer", minimum: 1, maximum: 6 },
      build: enumOf("instant", "quick", "normal", "slow", "dramatic"), clip: { type: "boolean" },
    }),
  ],
} as const;

const action = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "targets"],
      properties: {
        do: { const: "show" },
        targets: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
        entrance: enumOf("instant", "fade", "draw", "wipe", "iris", "slam", "word-by-word", "typewriter", "scramble"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "targets"],
      properties: {
        do: { const: "hide" },
        targets: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", minLength: 1 } },
        exit: enumOf("instant", "fade", "erase", "wipe", "iris", "dissolve", "slide", "shrink"),
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
        movement: enumOf("cut", "move", "push"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "text"],
      properties: {
        do: { const: "label" },
        target: { type: "string", minLength: 1 },
        text: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1 },
        style: enumOf("text", "pill", "rect", "tag", "bubble", "badge"),
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
      required: ["do", "target", "motion"],
      properties: {
        do: { const: "motion" }, target: { type: "string", minLength: 1 },
        motion: enumOf("move", "fall", "orbit", "along", "spin"),
        to: { type: "string", minLength: 1 }, around: { type: "string", minLength: 1 }, along: { type: "string", minLength: 1 },
        orbit: enumOf("small", "medium", "large"), turns: enumOf("half", "one", "two", "many"),
        bounce: enumOf("none", "soft", "strong"), direction: enumOf("clockwise", "counterclockwise"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "emphasis"],
      properties: {
        do: { const: "emphasize" }, target: { type: "string", minLength: 1 },
        emphasis: enumOf("punch", "shake", "pulse", "wiggle"), strength: enumOf("subtle", "normal", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "target", "verb"],
      properties: {
        do: { const: "attention" }, target: { type: "string", minLength: 1 },
        verb: enumOf("callout", "highlight", "spotlight", "dim", "pointer", "box", "brackets", "encircle", "converge", "spark", "vignette", "rings"),
        from: { type: "string", minLength: 1 }, text: { type: "string" }, title: { type: "string" },
        side: enumOf("auto", "north", "south", "east", "west"), route: enumOf("auto", "straight", "elbow", "curve"),
        style: enumOf("text", "pill", "rect", "tag", "bubble", "badge"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "effect", "target"],
      properties: {
        do: { const: "effect" }, effect: { const: "particles" }, target: { type: "string", minLength: 1 },
        preset: enumOf("fire", "smoke", "sparks", "rain", "snow", "dust", "confetti", "energy"), intensity: enumOf("subtle", "normal", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "effect", "target"],
      properties: {
        do: { const: "effect" }, effect: { const: "glow" }, target: { type: "string", minLength: 1 }, intensity: enumOf("subtle", "normal", "strong"),
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["do", "effect", "from", "to"],
      properties: {
        do: { const: "effect" }, effect: { const: "flow" }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, intensity: enumOf("subtle", "normal", "strong"),
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
    scenes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "composition", "objects", "beats"],
        properties: {
          id,
          composition: enumOf("hero", "hero-diagram", "equation", "overview-detail", "split", "comparison", "process", "equation-plot", "data", "map", "timeline", "table", "custom-relational"),
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
                id,
                pace: enumOf("instant", "quick", "normal", "slow", "dramatic"),
                actions: { type: "array", minItems: 1, items: action },
              },
            },
          },
        },
      },
    },
  },
} as const;

const { $schema: _generativeDraft, $id: _generativeId, ...GENERATIVE_LESSON_INPUT_SCHEMA } = LESSON_SPEC_SCHEMA;

export const CINEMATIC_LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "mode", "title", "recipe"],
  properties: {
    version: { const: "1" },
    mode: { const: "cinematic-recipe" },
    title: { type: "string", minLength: 1 },
    recipe: { type: "string", enum: [...CINEMATIC_RECIPE_IDS] },
  },
} as const;

/** Complete schema supplied to the LLM: reusable generation or an audited exact-film recipe. */
export const LESSON_INPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://lumen.local/schemas/lesson-input-v1.json",
  oneOf: [GENERATIVE_LESSON_INPUT_SCHEMA, CINEMATIC_LESSON_SCHEMA],
} as const;
