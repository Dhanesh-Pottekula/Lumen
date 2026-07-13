export type ThemeToken = "textbook" | "parchment" | "blueprint" | "chalkboard";
export type CompositionToken =
  | "hero"
  | "hero-diagram"
  | "equation"
  | "overview-detail"
  | "split"
  | "comparison"
  | "process"
  | "equation-plot"
  | "data"
  | "map"
  | "timeline"
  | "table"
  | "custom-relational";
export type PaceToken = "instant" | "quick" | "normal" | "slow" | "dramatic";
export type SizeToken = "tiny" | "small" | "medium" | "large" | "hero" | "fill";
export type RoleToken = "background" | "support" | "primary" | "hero" | "annotation" | "hud";
export type ZoneToken =
  | "title"
  | "main"
  | "main-left"
  | "main-right"
  | "support"
  | "footer"
  | "background"
  | "overlay"
  | "hud";
export type ShotToken = "overview" | "wide" | "medium" | "close" | "detail";
export type EntranceToken =
  | "instant"
  | "fade"
  | "draw"
  | "wipe"
  | "iris"
  | "slam"
  | "word-by-word"
  | "typewriter"
  | "scramble";
export type ExitToken = "instant" | "fade" | "erase" | "wipe" | "iris" | "dissolve" | "slide" | "shrink";

export type PlacementSpec =
  | { mode: "zone"; zone: ZoneToken }
  | { mode: "relative"; target: string; relation: "above" | "below" | "left-of" | "right-of" | "near" }
  | { mode: "anchor"; target: string };

export interface ObjectBase {
  id: string;
  role?: RoleToken;
  placement?: PlacementSpec;
  size?: SizeToken;
  initial?: "hidden" | "visible";
  space?: "world" | "screen";
}

export interface CategoryDatumSpec {
  label: string;
  value: number;
  category?: string;
}

export interface MapFeatureSpec {
  id: string;
  rings: [number, number][][];
  category?: string;
}

export interface MapPlaceSpec {
  name: string;
  lon: number;
  lat: number;
}

export interface MapFlowSpec {
  from: string | [number, number];
  to: string | [number, number];
  category?: string;
  bend?: "left" | "right" | "direct";
  pace?: PaceToken;
}

export type ObjectSpec =
  | (ObjectBase & {
      kind: "text";
      text: string;
      textRole?: "heading" | "title" | "body" | "bullet" | "caption";
    })
  | (ObjectBase & { kind: "equation"; value: string })
  | (ObjectBase & {
      kind: "stat";
      value: number;
      from?: number;
      unit?: string;
      label?: string;
      decimals?: number;
      commas?: boolean;
      prefix?: string;
    })
  | (ObjectBase & { kind: "visual"; asset: string; orientation?: "left" | "right" | "up" | "down" })
  | (ObjectBase & { kind: "line"; from: string; to: string; form?: "straight" | "elbow" | "curved" | "arrow" | "traced" })
  | (ObjectBase & {
      kind: "shape";
      shape: "circle" | "polygon" | "star" | "heart" | "disc";
      sides?: number;
      appearance?: "solid" | "outline" | "shaded";
    })
  | (ObjectBase & {
      kind: "curve";
      x: string;
      y: string;
      domain?: [number, number];
      appearance?: "solid" | "dashed";
    })
  | (ObjectBase & {
      kind: "chart";
      chart: "bar" | "line" | "area" | "scatter" | "pie" | "donut" | "function" | "riemann";
      data?: CategoryDatumSpec[];
      series?: [number, number][];
      function?: string;
      rectangles?: "few" | "several" | "many" | "dense";
      xDomain?: [number, number];
      yDomain?: [number, number];
      axes?: boolean;
      xLabel?: string;
      yLabel?: string;
    })
  | (ObjectBase & { kind: "legend"; categories: string[] })
  | (ObjectBase & {
      kind: "map";
      features: MapFeatureSpec[];
      markers?: Array<{ lon: number; lat: number; label?: string; icon?: string; category?: string }>;
      places?: MapPlaceSpec[];
      flows?: MapFlowSpec[];
      outline?: [number, number][];
      growth?: [number, number][][];
      growthPace?: PaceToken;
      stagger?: PaceToken;
    })
  | (ObjectBase & {
      kind: "timeline";
      from: number;
      to: number;
      events?: Array<{ at: number; label: string; side?: "above" | "below" }>;
      eras?: Array<{ from: number; to: number; label: string; category?: string }>;
      playhead?: number | { from: number; to: number; pace?: PaceToken };
    })
  | (ObjectBase & { kind: "table"; rows: string[][]; header?: boolean })
  | (ObjectBase & {
      kind: "group";
      children: ObjectSpec[];
      layout?: "row" | "stack" | "grid";
      columns?: number;
      build?: PaceToken;
      clip?: boolean;
    });

export type ActionSpec =
  | { do: "show"; targets: string[]; entrance?: EntranceToken }
  | { do: "hide"; targets: string[]; exit?: ExitToken }
  | { do: "camera"; target: string; shot?: ShotToken; movement?: "cut" | "move" | "push" }
  | {
      do: "label";
      target: string;
      text: string;
      title?: string;
      style?: "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
    }
  | {
      do: "tour";
      labelMode?: "one-at-a-time";
      returnTo?: "overview";
      stops: Array<{ target: string; label: string; shot?: ShotToken }>;
    }
  | {
      do: "motion";
      target: string;
      motion: "move" | "fall" | "orbit" | "along" | "spin";
      to?: string;
      around?: string;
      along?: string;
      orbit?: "small" | "medium" | "large";
      turns?: "half" | "one" | "two" | "many";
      bounce?: "none" | "soft" | "strong";
      direction?: "clockwise" | "counterclockwise";
    }
  | { do: "emphasize"; target: string; emphasis: "punch" | "shake" | "pulse" | "wiggle"; strength?: "subtle" | "normal" | "strong" }
  | {
      do: "attention";
      target: string;
      verb: "callout" | "highlight" | "spotlight" | "dim" | "pointer" | "box" | "brackets" | "encircle" | "converge" | "spark" | "vignette" | "rings";
      from?: string;
      text?: string;
      title?: string;
      side?: "auto" | "north" | "south" | "east" | "west";
      route?: "auto" | "straight" | "elbow" | "curve";
      style?: "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
    }
  | { do: "effect"; effect: "particles"; target: string; preset?: "fire" | "smoke" | "sparks" | "rain" | "snow" | "dust" | "confetti" | "energy"; intensity?: "subtle" | "normal" | "strong" }
  | { do: "effect"; effect: "glow"; target: string; intensity?: "subtle" | "normal" | "strong" }
  | { do: "effect"; effect: "flow"; from: string; to: string; intensity?: "subtle" | "normal" | "strong" };

export interface BeatSpec {
  id: string;
  pace?: PaceToken;
  actions: ActionSpec[];
}

export interface SceneSpec {
  id: string;
  composition: CompositionToken;
  objects: ObjectSpec[];
  beats: BeatSpec[];
}

export interface LessonSpec {
  version: "1";
  title: string;
  theme: ThemeToken;
  scenes: SceneSpec[];
}

export const CINEMATIC_RECIPE_IDS = [
  "biology.neuron-action-potential.original.v1",
  "physics.gravity-orbits.original.v1",
] as const;

export type CinematicRecipeId = (typeof CINEMATIC_RECIPE_IDS)[number];

/**
 * A small, closed LLM-facing request for an audited film. The recipe registry owns every
 * implementation value so JSON cannot smuggle in pixels, timing, paths, or callbacks.
 */
export interface CinematicLessonSpec {
  version: "1";
  mode: "cinematic-recipe";
  title: string;
  recipe: CinematicRecipeId;
}

export type LessonInputSpec = LessonSpec | CinematicLessonSpec;
