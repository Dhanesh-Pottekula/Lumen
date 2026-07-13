import type { LessonSpec, MapFeatureSpec, MapPlaceSpec } from "../../simple-json";

const EURASIA: [number, number][] = [
  [26, 46], [34, 55], [50, 60], [66, 61], [82, 60], [98, 58], [112, 56], [126, 55], [138, 50],
  [136, 42], [128, 36], [122, 30], [118, 22], [108, 20], [96, 22], [88, 27], [78, 24], [70, 26],
  [60, 25], [52, 30], [44, 34], [36, 38], [28, 40], [26, 46],
];
const MONGOLIA: [number, number][] = [[96, 50], [104, 52], [112, 51], [116, 47], [113, 43], [106, 42], [99, 44], [95, 47], [96, 50]];
const BORDER_1227: [number, number][] = [[72, 52], [88, 55], [104, 55], [118, 52], [124, 45], [120, 37], [108, 33], [92, 35], [80, 40], [70, 45], [67, 49], [72, 52]];
const BORDER_1260: [number, number][] = [[32, 48], [50, 58], [72, 59], [96, 58], [116, 55], [128, 48], [126, 38], [116, 30], [100, 30], [82, 34], [66, 34], [52, 34], [40, 38], [32, 42], [32, 48]];
const BORDER_1368: [number, number][] = [[88, 52], [102, 54], [116, 53], [126, 47], [122, 37], [110, 31], [96, 34], [88, 42], [84, 47], [88, 52]];

const PLACES: MapPlaceSpec[] = [
  { name: "beijing", lon: 116, lat: 40 }, { name: "samarkand", lon: 67, lat: 39.5 },
  { name: "baghdad", lon: 44.4, lat: 33.3 }, { name: "kiev", lon: 30.5, lat: 50.5 },
  { name: "karakorum", lon: 102.5, lat: 47.2 }, { name: "mongolia", lon: 105.1, lat: 47 },
];

const LAND: MapFeatureSpec[] = [{ id: "eurasia", rings: [EURASIA], category: "land" }];
const KHANATES: MapFeatureSpec[] = [
  { id: "golden-horde", category: "Golden Horde", rings: [[[30, 46], [40, 56], [58, 58], [72, 55], [76, 48], [66, 44], [52, 43], [38, 44], [30, 46]]] },
  { id: "ilkhanate", category: "Ilkhanate", rings: [[[42, 42], [58, 43], [70, 40], [72, 33], [64, 27], [52, 28], [44, 33], [40, 38], [42, 42]]] },
  { id: "chagatai", category: "Chagatai", rings: [[[62, 50], [76, 51], [88, 49], [92, 43], [86, 38], [74, 38], [66, 42], [61, 46], [62, 50]]] },
  { id: "yuan", category: "Yuan", rings: [[[92, 52], [106, 53], [120, 52], [128, 45], [124, 36], [114, 30], [102, 33], [94, 40], [90, 46], [92, 52]]] },
];

export const mongolLessonSpec: LessonSpec = {
  version: "1",
  title: "The Mongol Empire",
  theme: "parchment",
  scenes: [
    {
      id: "unification-1206",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [MONGOLIA, MONGOLIA], size: "fill", placement: { mode: "zone", zone: "main" } },
        { id: "year", kind: "stat", value: 1206, unit: "CE", label: "the tribes unite", size: "large", placement: { mode: "zone", zone: "title" } },
        { id: "title", kind: "text", text: "The Mongol Empire", textRole: "title", size: "large", placement: { mode: "zone", zone: "support" } },
        { id: "subtitle", kind: "text", text: "the largest contiguous land empire in history", textRole: "caption", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "steppe", pace: "dramatic", actions: [{ do: "show", targets: ["map", "year"], entrance: "draw" }, { do: "effect", effect: "glow", target: "map.mongolia", intensity: "strong" }] },
        { id: "capital", pace: "slow", actions: [{ do: "label", target: "map.karakorum", title: "Karakorum", text: "capital on the steppe", style: "tag" }] },
        { id: "title", pace: "slow", actions: [{ do: "show", targets: ["title", "subtitle"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "conquest",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [MONGOLIA, BORDER_1227], growthPace: "dramatic", size: "fill", placement: { mode: "zone", zone: "main" }, flows: [
          { from: "karakorum", to: "beijing", category: "conquest", bend: "right", pace: "normal" },
          { from: "karakorum", to: "samarkand", category: "conquest", bend: "right", pace: "normal" },
          { from: "karakorum", to: "baghdad", category: "conquest", bend: "right", pace: "slow" },
          { from: "karakorum", to: "kiev", category: "conquest", bend: "right", pace: "slow" },
        ] },
        { id: "title", kind: "text", text: "THE CONQUEST BEGINS", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "territory", kind: "stat", value: 13500000, unit: "km²", label: "territory conquered", commas: true, placement: { mode: "zone", zone: "hud" }, space: "screen" },
      ],
      beats: [
        { id: "sweep", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "territory"], entrance: "draw" }, { do: "camera", target: "map.beijing", shot: "wide", movement: "push" }] },
        { id: "cities-east", pace: "slow", actions: [{ do: "label", target: "map.beijing", title: "Beijing 1215", text: "a city falls", style: "tag" }, { do: "camera", target: "map.samarkand", shot: "wide", movement: "move" }] },
        { id: "cities-west", pace: "slow", actions: [{ do: "label", target: "map.baghdad", title: "Baghdad 1258", text: "the empire reaches west", style: "tag" }, { do: "camera", target: "map.eurasia", shot: "overview", movement: "move" }] },
      ],
    },
    {
      id: "borders-over-time",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [MONGOLIA, BORDER_1227, BORDER_1260], growthPace: "dramatic", size: "fill", placement: { mode: "zone", zone: "main" } },
        { id: "year", kind: "stat", from: 1206, value: 1260, unit: "CE", label: "borders over time", size: "large", placement: { mode: "zone", zone: "title" } },
        { id: "peak", kind: "stat", value: 24000000, unit: "km²", label: "at peak extent", commas: true, placement: { mode: "zone", zone: "hud" }, space: "screen" },
        { id: "timeline", kind: "timeline", from: 1200, to: 1280, eras: [
          { from: 1206, to: 1227, label: "Genghis Khan", category: "founding" },
          { from: 1227, to: 1260, label: "expansion", category: "growth" },
          { from: 1260, to: 1280, label: "peak", category: "peak" },
        ], events: [{ at: 1206, label: "Empire founded" }, { at: 1227, label: "Genghis dies" }, { at: 1260, label: "Peak extent" }], playhead: { from: 1206, to: 1260, pace: "dramatic" }, size: "fill", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "grow", pace: "dramatic", actions: [{ do: "show", targets: ["map", "year", "peak", "timeline"], entrance: "draw" }] },
        { id: "peak", pace: "slow", actions: [{ do: "attention", target: "map.eurasia", verb: "encircle", text: "a homeland becomes a continent" }, { do: "emphasize", target: "peak", emphasis: "pulse" }] },
      ],
    },
    {
      id: "four-khanates",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: KHANATES, places: PLACES, outline: EURASIA, stagger: "normal", size: "fill", placement: { mode: "zone", zone: "main" } },
        { id: "title", kind: "text", text: "THE FOUR KHANATES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "legend", kind: "legend", categories: ["Golden Horde", "Ilkhanate", "Chagatai", "Yuan"], space: "screen", placement: { mode: "zone", zone: "hud" } },
      ],
      beats: [
        { id: "split", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "legend"], entrance: "fade" }] },
        { id: "tour", pace: "dramatic", actions: [{ do: "tour", returnTo: "overview", stops: [
          { target: "map.yuan", label: "Yuan", shot: "close" },
          { target: "map.golden-horde", label: "Golden Horde", shot: "close" },
          { target: "map.ilkhanate", label: "Ilkhanate", shot: "close" },
          { target: "map.chagatai", label: "Chagatai", shot: "close" },
        ] }] },
      ],
    },
    {
      id: "pax-mongolica",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [BORDER_1260, BORDER_1260], size: "fill", placement: { mode: "zone", zone: "main" }, flows: [
          { from: "beijing", to: "samarkand", category: "goods", bend: "right" }, { from: "samarkand", to: "beijing", category: "return", bend: "left" },
          { from: "samarkand", to: "baghdad", category: "goods", bend: "right" }, { from: "baghdad", to: "samarkand", category: "return", bend: "left" },
        ] },
        { id: "title", kind: "text", text: "PAX MONGOLICA", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "message", kind: "text", text: "Ideas, wealth, and plague travel west.", textRole: "title", placement: { mode: "zone", zone: "support" } },
        { id: "timeline", kind: "timeline", from: 1250, to: 1350, events: [{ at: 1271, label: "Marco Polo travels east" }, { at: 1300, label: "Silk Road at its height" }, { at: 1347, label: "Plague spreads west", side: "below" }], playhead: { from: 1250, to: 1350, pace: "dramatic" }, size: "fill", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "peace", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "timeline"], entrance: "draw" }] },
        { id: "exchange", pace: "slow", actions: [{ do: "show", targets: ["message"], entrance: "typewriter" }, { do: "effect", effect: "flow", from: "map.beijing", to: "map.baghdad", intensity: "normal" }] },
      ],
    },
    {
      id: "legacy-decline",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [BORDER_1260, BORDER_1368], growthPace: "dramatic", size: "fill", placement: { mode: "zone", zone: "main" } },
        { id: "land", kind: "stat", value: 16, unit: "%", label: "of Earth's land area", size: "large", placement: { mode: "zone", zone: "main-left" } },
        { id: "people", kind: "stat", value: 100000000, unit: "+", label: "people ruled as one", commas: true, size: "large", placement: { mode: "zone", zone: "main-right" } },
        { id: "closing", kind: "text", text: "The largest contiguous empire the world has ever known.", textRole: "title", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "recede", pace: "dramatic", actions: [{ do: "show", targets: ["map", "land", "people"], entrance: "fade" }] },
        { id: "legacy", pace: "slow", actions: [{ do: "show", targets: ["closing"], entrance: "word-by-word" }, { do: "emphasize", target: "land", emphasis: "pulse" }, { do: "emphasize", target: "people", emphasis: "pulse" }] },
      ],
    },
  ],
};
