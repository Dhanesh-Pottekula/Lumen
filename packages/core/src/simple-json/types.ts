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
export type SizeToken =
  | "tiny"
  | "mini"
  | "small"
  | "compact"
  | "medium"
  | "large"
  | "hero"
  | "fill";
export type RoleToken =
  | "background"
  | "support"
  | "primary"
  | "hero"
  | "annotation"
  | "hud";
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
export type ExitToken =
  | "instant"
  | "fade"
  | "erase"
  | "wipe"
  | "iris"
  | "dissolve"
  | "slide"
  | "shrink";

export type PlacementSpec =
  | { mode: "zone"; zone: ZoneToken }
  | {
      mode: "relative";
      target: string;
      relation: "above" | "below" | "left-of" | "right-of" | "near";
    }
  | { mode: "anchor"; target: string };

export interface ObjectBase {
  id: string;
  role?: RoleToken;
  placement?: PlacementSpec;
  size?: SizeToken;
  initial?: "hidden" | "visible";
  space?: "world" | "screen";
  /** Teaching aid that must be explicitly hidden before the scene finishes. */
  temporary?: boolean;
}

export interface CategoryDatumSpec {
  label: string;
  value: number;
  category?: string;
}

export type MapIconToken =
  | "check"
  | "cross"
  | "plus"
  | "minus"
  | "star"
  | "heart"
  | "circle"
  | "square"
  | "triangle"
  | "gear"
  | "bolt"
  | "drop"
  | "sun"
  | "leaf"
  | "flame"
  | "factory"
  | "home"
  | "person"
  | "book"
  | "flask"
  | "atom"
  | "clock"
  | "pin"
  | "warning"
  | "info"
  | "search"
  | "cloud"
  | "mountain"
  | "seed";

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

export interface SvgCompositePartSpec {
  id: string;
  /** SVG element markup only; the compiler supplies the shared root <svg> and viewBox. */
  svg: string;
  /** Padded [x, y, width, height] inside the composite viewBox used for rendering and targeting. */
  bounds: [number, number, number, number];
  initial?: "hidden" | "visible";
  /** Teaching aid that must be explicitly hidden before the scene finishes. */
  temporary?: boolean;
  /** Compiler-produced targeting confidence. Not accepted in authored svg-composite JSON. */
  boundsPrecision?: "exact" | "conservative" | "viewbox-fallback";
  /** Why automatic targeting had to use conservative or whole-artwork bounds. */
  boundsReason?: string;
}

interface ChartBase {
  xDomain?: [number, number];
  yDomain?: [number, number];
  axes?: boolean;
  xLabel?: string;
  yLabel?: string;
}

export type ChartObjectSpec = ObjectBase &
  ChartBase &
  (
    | {
        kind: "chart";
        chart: "bar" | "pie" | "donut";
        data: CategoryDatumSpec[];
      }
    | {
        kind: "chart";
        chart: "line" | "area" | "scatter";
        series: [number, number][];
      }
    | { kind: "chart"; chart: "function"; function: string }
    | {
        kind: "chart";
        chart: "riemann";
        function: string;
        rectangles?: "few" | "several" | "many" | "dense";
      }
  );

export type ObjectSpec =
  | (ObjectBase & {
      kind: "text";
      text: string;
      textRole?: "heading" | "title" | "body" | "bullet" | "caption";
    })
  | (ObjectBase & { kind: "equation"; value: string })
  | (ObjectBase & {
      kind: "measure";
      value: number;
      /** Counts from here to `value` as it appears. Defaults to 0, so a figure always rolls up. */
      countFrom?: number;
      unit?: string;
      label?: string;
      decimals?: number;
      commas?: boolean;
      prefix?: string;
      /** The range the figure lives in. Give one and the meter shows how big the number IS, which
       *  digits alone never do; two measures sharing a scale are directly comparable by length. */
      scale?: [number, number];
      meter?: "bar" | "ring";
    })
  | (ObjectBase & {
      kind: "visual";
      asset: string;
      color?: string;
      orientation?: "left" | "right" | "up" | "down";
    })
  | (ObjectBase & {
      kind: "vector";
      d: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      width?: number;
      height?: number;
      scale?: number;
      rotate?: number;
    })
  | (ObjectBase & {
      kind: "svg-composite";
      viewBox: [number, number, number, number];
      width: number;
      height: number;
      parts: SvgCompositePartSpec[];
    })
  | (ObjectBase & {
      /** LLM-facing conventional SVG. Root-level named <g> elements become addressable parts. */
      kind: "svg-artwork";
      svg: string;
      /** Root-level group ids that are teaching aids and must be hidden before the scene finishes. */
      temporaryParts?: string[];
      /** Rendered width in view units, when the author needs a size the six size words cannot
       *  express — an apple beside a planet. Overrides `size`; the height follows the viewBox. */
      width?: number;
      /** How the drawing was asked for, carried through so a stored film still says what it meant
       *  to draw. Provenance only — the engine draws `svg` and never reads these. */
      draw?: string;
      parts?: string[];
      pixels?: [number, number];
    })
  | (ObjectBase & {
      /** The arc between two directions out of a shared corner — the mark geometry and optics need
       *  to say "thirty degrees" in a picture rather than only in the narration. */
      kind: "angle";
      at: string;
      from: string;
      to: string;
    })
  | (ObjectBase & {
      /** A measured distance: a line with a cap at each end, meaning HOW FAR APART rather than
       *  CONNECTED TO. A plain line already means the second thing. */
      kind: "span";
      from: string;
      to: string;
    })
  | (ObjectBase & {
      kind: "line";
      from: string;
      to: string;
      form?: "straight" | "elbow" | "curved" | "traced";
    })
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
      /** Lay the shape BETWEEN two things instead of dropping it in a zone: the formula is drawn in
       *  its own frame, then turned and stretched so its start sits on `from` and its end on `to`.
       *  A sine wave from the sun to a leaf is the wave's shape along the sun-to-leaf axis. */
      from?: string;
      to?: string;
      domain?: [number, number];
      appearance?: "solid" | "dashed";
    })
  | ChartObjectSpec
  | (ObjectBase & { kind: "legend"; categories: string[] })
  | (ObjectBase & {
      kind: "map";
      features: MapFeatureSpec[];
      markers?: Array<{
        lon: number;
        lat: number;
        label?: string;
        icon?: MapIconToken;
        category?: string;
      }>;
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
      eras?: Array<{
        from: number;
        to: number;
        label: string;
        category?: string;
      }>;
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

/** How full a thing is, in the only steps a reader can actually tell apart. */
export type FillToken = "empty" | "quarter" | "half" | "three-quarters" | "full";

export type ActionSpec =
  | {
      do: "fill";
      target: string;
      to: FillToken;
      direction?: "up" | "down" | "left" | "right";
    }
  | { do: "show"; targets: string[]; entrance?: EntranceToken }
  | { do: "hide"; targets: string[]; exit?: ExitToken }
  | {
      do: "camera";
      target: string;
      shot?: ShotToken;
      movement?: "cut" | "move" | "push";
    }
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
      /** Pieces that ride rigidly with the target — a rod with its bob, a cup in a hand — named as parts or objects. */
      with?: string[];
      motion: "move";
      to: string;
      /** Where the mover stops: against the target's edge (default) or all the way in. */
      land?: "surface" | "centre";
      gait?: "walk" | "run" | "hop";
    }
  | {
      do: "motion";
      target: string;
      /** Pieces that ride rigidly with the target — a rod with its bob, a cup in a hand — named as parts or objects. */
      with?: string[];
      motion: "fall";
      to: string;
      /** Where the mover stops: against the target's edge (default) or all the way in. */
      land?: "surface" | "centre";
      bounce?: "none" | "soft" | "strong";
    }
  | {
      do: "motion";
      target: string;
      /** Pieces that ride rigidly with the target — a rod with its bob, a cup in a hand — named as parts or objects. */
      with?: string[];
      motion: "orbit";
      around: string;
      turns?: number;
      direction?: "clockwise" | "counterclockwise";
    }
  | {
      do: "motion";
      target: string;
      /** Pieces that ride rigidly with the target — a rod with its bob, a cup in a hand — named as parts or objects. */
      with?: string[];
      motion: "along";
      along: string;
      gait?: "walk" | "run" | "hop";
      repeat?: "once" | "there-and-back" | "loop";
    }
  | {
      do: "motion";
      target: string;
      /** Pieces that ride rigidly with the target — a rod with its bob, a cup in a hand — named as parts or objects. */
      with?: string[];
      motion: "spin";
      direction?: "clockwise" | "counterclockwise";
      /** The point it turns about when not its own centre: a pendulum about `clock.pivot`. */
      about?: string;
      /** Turn through this many degrees instead of going round and round. */
      sweep?: number;
      /** How a bounded sweep plays: open once, swing to either side of rest, or ratchet round. */
      repeat?: "once" | "there-and-back" | "loop";
    }
  | {
      do: "emphasize";
      target: string;
      emphasis: "punch" | "shake" | "pulse" | "wiggle";
      strength?: "subtle" | "normal" | "strong";
    }
  | {
      do: "attention";
      target: string;
      verb:
        | "callout"
        | "spotlight"
        | "dim"
        | "box"
        | "brackets"
        | "encircle"
        | "converge"
        | "spark"
        | "vignette"
        | "rings";
      from?: string;
      text?: string;
      title?: string;
      side?: "auto" | "north" | "south" | "east" | "west";
      route?: "auto" | "straight" | "elbow" | "curve";
      style?: "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
    }
  | {
      do: "attention";
      target: string;
      verb: "pointer";
      from: string;
      text?: string;
      title?: string;
      side?: "auto" | "north" | "south" | "east" | "west";
      route?: "auto" | "straight" | "elbow" | "curve";
      style?: "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
    }
  | {
      do: "effect";
      effect: "particles";
      target: string;
      preset?:
        | "fire"
        | "smoke"
        | "sparks"
        | "rain"
        | "snow"
        | "dust"
        | "confetti"
        | "energy";
      intensity?: "subtle" | "normal" | "strong";
    }
  | {
      do: "effect";
      effect: "glow";
      target: string;
      intensity?: "subtle" | "normal" | "strong";
    }
  | {
      do: "effect";
      effect: "flow";
      from: string;
      to: string;
      intensity?: "subtle" | "normal" | "strong";
    };

export interface BeatSpec {
  id: string;
  pace?: PaceToken;
  actions: ActionSpec[];
}

export interface SceneSpec {
  id: string;
  composition: CompositionToken;
  /**
   * The spoken narration for this scene (its voice-over lines). All scenes' narration, concatenated
   * in order, is the full text sent to TTS. The per-scene word-timestamp span is used as the REFERENCE
   * that sets this scene's minimum on-screen duration (scene ≥ its audio, a little longer, never shorter).
   */
  narration?: string;
  objects: ObjectSpec[];
  beats: BeatSpec[];
}

export interface LessonSpec {
  version: "1";
  title: string;
  theme: ThemeToken;
  scenes: SceneSpec[];
}
