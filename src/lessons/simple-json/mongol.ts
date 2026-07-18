import type { LessonSpec, MapFeatureSpec, MapPlaceSpec } from "../../simple-json";

const EURASIA: [number, number][] = [
  [26, 46], [34, 55], [50, 60], [66, 61], [82, 60], [98, 58], [112, 56], [126, 55], [138, 50],
  [136, 42], [128, 36], [122, 30], [118, 22], [108, 20], [96, 22], [88, 27], [78, 24], [70, 26],
  [60, 25], [52, 30], [44, 34], [36, 38], [28, 40], [26, 46],
];
const MONGOLIA: [number, number][] = [[96, 50], [104, 52], [112, 51], [116, 47], [113, 43], [106, 42], [99, 44], [95, 47], [96, 50]];
const BORDER_1227: [number, number][] = [[72, 52], [88, 55], [104, 55], [118, 52], [124, 45], [120, 37], [108, 33], [92, 35], [80, 40], [70, 45], [67, 49], [72, 52]];
const BORDER_1260: [number, number][] = [[32, 48], [50, 58], [72, 59], [96, 58], [116, 55], [128, 48], [126, 38], [116, 30], [100, 30], [82, 34], [66, 34], [52, 34], [40, 38], [32, 42], [32, 48]];
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
        {
          id: "map",
          kind: "map",
          features: LAND,
          places: PLACES,
          outline: EURASIA,
          growth: [MONGOLIA, MONGOLIA],
          size: "small",
          placement: { mode: "zone", zone: "main" },
          flows: [
            { from: [88, 51], to: "karakorum", category: "tribes", bend: "right", pace: "slow" },
            { from: [112, 54], to: "karakorum", category: "tribes", bend: "left", pace: "slow" },
            { from: [116, 44], to: "karakorum", category: "tribes", bend: "right", pace: "slow" },
            { from: [96, 40], to: "karakorum", category: "tribes", bend: "left", pace: "slow" },
          ],
        },
        { id: "title", kind: "text", text: "RIVAL TRIBES UNITE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "year", kind: "stat", value: 1206, unit: "CE", label: "one Mongol state", size: "small", placement: { mode: "zone", zone: "hud" }, space: "screen" },
        { id: "subtitle", kind: "text", text: "The four incoming routes converge into one state around Karakorum.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "steppe", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "year"], entrance: "draw" }] },
        { id: "converge", pace: "slow", actions: [{ do: "attention", target: "map.karakorum", verb: "converge", text: "power concentrates on the steppe" }] },
        { id: "unified", pace: "slow", actions: [{ do: "show", targets: ["subtitle"], entrance: "word-by-word" }] },
        { id: "hold-unification", pace: "normal", actions: [{ do: "emphasize", target: "year", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "conquest",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [MONGOLIA, BORDER_1227], growthPace: "dramatic", size: "small", placement: { mode: "zone", zone: "main" }, flows: [
          { from: "karakorum", to: "beijing", category: "conquest", bend: "right", pace: "normal" },
          { from: "karakorum", to: "samarkand", category: "conquest", bend: "right", pace: "normal" },
          { from: "karakorum", to: "baghdad", category: "conquest", bend: "right", pace: "slow" },
          { from: "karakorum", to: "kiev", category: "conquest", bend: "right", pace: "slow" },
        ] },
        { id: "title", kind: "text", text: "EXPANSION EAST AND WEST", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "year", kind: "stat", value: 1227, unit: "CE", label: "at Genghis Khan's death", size: "small", placement: { mode: "zone", zone: "hud" }, space: "screen" },
        { id: "direction-note", kind: "text", text: "east into northern China  •  west through Central Asia toward Europe", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "sweep", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "year"], entrance: "draw" }] },
        { id: "follow-routes", pace: "dramatic", actions: [{ do: "tour", labelMode: "one-at-a-time", returnTo: "overview", stops: [
          { target: "map.beijing", label: "east: northern China", shot: "wide" },
          { target: "map.samarkand", label: "west: Central Asia", shot: "wide" },
          { target: "map.baghdad", label: "southwest: Persia and Baghdad", shot: "wide" },
          { target: "map.kiev", label: "farther west: the Rus' lands", shot: "wide" },
        ] }] },
        { id: "directions", pace: "slow", actions: [{ do: "show", targets: ["direction-note"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "borders-over-time",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [MONGOLIA, BORDER_1227, BORDER_1260], growthPace: "dramatic", size: "small", placement: { mode: "zone", zone: "main" } },
        { id: "title", kind: "text", text: "54 YEARS TO PEAK EXTENT", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "peak", kind: "stat", value: 24000000, unit: "km²", label: "at peak extent", commas: true, size: "small", placement: { mode: "zone", zone: "hud" }, space: "screen" },
        { id: "timeline", kind: "timeline", from: 1200, to: 1280, eras: [
          { from: 1206, to: 1227, label: "Genghis Khan", category: "founding" },
          { from: 1227, to: 1260, label: "expansion", category: "growth" },
          { from: 1260, to: 1280, label: "peak", category: "peak" },
        ], events: [{ at: 1206, label: "Empire founded" }, { at: 1227, label: "Genghis dies" }, { at: 1260, label: "Peak extent" }], playhead: { from: 1206, to: 1260, pace: "dramatic" }, size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "grow", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "timeline"], entrance: "draw" }] },
        { id: "peak", pace: "slow", actions: [{ do: "show", targets: ["peak"], entrance: "fade" }, { do: "attention", target: "map.center", verb: "brackets", text: "a regional state becomes a continent-spanning empire", side: "south" }] },
        { id: "hold-peak", pace: "normal", actions: [{ do: "emphasize", target: "peak", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "four-khanates",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: KHANATES, places: PLACES, outline: EURASIA, stagger: "normal", size: "small", placement: { mode: "zone", zone: "main" } },
        { id: "title", kind: "text", text: "FOUR SUCCESSOR KHANATES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "legend", kind: "legend", categories: ["Golden Horde", "Ilkhanate", "Chagatai", "Yuan"], size: "small", space: "screen", placement: { mode: "zone", zone: "support" } },
        { id: "split-note", kind: "text", text: "Genghis Khan's descendants rule separate successor states.", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "split", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "legend"], entrance: "fade" }] },
        { id: "tour-successors", pace: "dramatic", actions: [{ do: "tour", labelMode: "one-at-a-time", returnTo: "overview", stops: [
          { target: "map.yuan", label: "Yuan: China and Mongolia", shot: "wide" },
          { target: "map.chagatai", label: "Chagatai: Central Asia", shot: "wide" },
          { target: "map.ilkhanate", label: "Ilkhanate: Persia", shot: "wide" },
          { target: "map.golden-horde", label: "Golden Horde: western steppe and Rus'", shot: "wide" },
        ] }] },
        { id: "successors", pace: "slow", actions: [{ do: "show", targets: ["split-note"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "pax-mongolica",
      composition: "map",
      objects: [
        { id: "map", kind: "map", features: LAND, places: PLACES, outline: EURASIA, growth: [BORDER_1260, BORDER_1260], size: "small", placement: { mode: "zone", zone: "main" }, flows: [
          { from: "beijing", to: "samarkand", category: "trade", bend: "right", pace: "normal" },
          { from: "samarkand", to: "beijing", category: "knowledge", bend: "left", pace: "normal" },
          { from: "samarkand", to: "baghdad", category: "trade", bend: "right", pace: "slow" },
          { from: "beijing", to: "kiev", category: "disease", bend: "left", pace: "slow" },
        ] },
        { id: "title", kind: "text", text: "EXCHANGE ACROSS EURASIA", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "legend", kind: "legend", categories: ["trade", "knowledge", "disease"], size: "small", space: "screen", placement: { mode: "zone", zone: "hud" } },
        { id: "message", kind: "text", text: "trade • knowledge • disease", textRole: "caption", role: "annotation", size: "tiny", placement: { mode: "zone", zone: "support" } },
        { id: "timeline", kind: "timeline", from: 1250, to: 1350, events: [{ at: 1271, label: "Marco Polo travels east" }, { at: 1300, label: "Silk Road at its height" }, { at: 1347, label: "Plague spreads west", side: "below" }], playhead: { from: 1250, to: 1350, pace: "dramatic" }, size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "network", pace: "dramatic", actions: [{ do: "show", targets: ["map", "title", "legend", "timeline"], entrance: "draw" }] },
        { id: "crossroads", pace: "slow", actions: [{ do: "label", target: "map.samarkand", title: "Samarkand", text: "a Silk Road crossroads", style: "tag" }] },
        { id: "exchange", pace: "slow", actions: [{ do: "show", targets: ["message"], entrance: "typewriter" }] },
        { id: "plague-route", pace: "slow", actions: [{ do: "effect", effect: "flow", from: "map.beijing", to: "map.kiev", intensity: "subtle" }, { do: "attention", target: "map.kiev", verb: "callout", text: "connection also spreads disease", side: "east", route: "elbow", style: "tag" }] },
      ],
    },
    {
      id: "legacy-decline",
      composition: "comparison",
      objects: [
        { id: "title", kind: "text", text: "ONE EMPIRE SPLITS INTO FOUR STATES", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "peak-map", kind: "map", features: LAND, outline: EURASIA, growth: [BORDER_1260, BORDER_1260], size: "tiny", placement: { mode: "zone", zone: "main-left" } },
        { id: "later-map", kind: "map", features: KHANATES, outline: EURASIA, stagger: "quick", size: "tiny", placement: { mode: "zone", zone: "main-right" } },
        { id: "peak-label", kind: "text", text: "1260 — one imperial system", textRole: "caption", size: "small", placement: { mode: "relative", target: "peak-map", relation: "above" } },
        { id: "later-label", kind: "text", text: "four separately ruled khanates", textRole: "caption", size: "small", placement: { mode: "relative", target: "later-map", relation: "above" } },
        { id: "split-arrow", kind: "line", from: "peak-map.right", to: "later-map.left", form: "arrow", role: "annotation" },
        { id: "successor-legend", kind: "legend", categories: ["Golden Horde", "Ilkhanate", "Chagatai", "Yuan"], size: "small", temporary: true, placement: { mode: "zone", zone: "support" } },
        { id: "decline-timeline", kind: "timeline", from: 1255, to: 1380, events: [{ at: 1260, label: "succession crisis" }, { at: 1335, label: "Ilkhanate fragments" }, { at: 1368, label: "Yuan loses China", side: "below" }], playhead: { from: 1260, to: 1368, pace: "dramatic" }, size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "compare-borders", pace: "dramatic", actions: [{ do: "show", targets: ["title", "peak-map", "later-map", "peak-label", "later-label", "split-arrow", "successor-legend"], entrance: "fade" }] },
        { id: "mark-peak", pace: "slow", actions: [{ do: "attention", target: "peak-map", verb: "brackets", text: "continent-spanning rule", side: "south" }] },
        { id: "mark-fragments", pace: "slow", actions: [{ do: "attention", target: "later-map", verb: "brackets", text: "the colors now mark separate governments", side: "south" }] },
        { id: "trace-fragmentation", pace: "slow", actions: [{ do: "hide", targets: ["successor-legend"], exit: "fade" }, { do: "show", targets: ["decline-timeline"], entrance: "draw" }] },
        { id: "hold-legacy", pace: "normal", actions: [{ do: "emphasize", target: "later-map", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
  ],
};
