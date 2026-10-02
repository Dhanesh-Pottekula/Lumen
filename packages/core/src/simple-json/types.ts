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
/** A colour a drawn path may take, by its role in the theme — never a raw colour. */
export type PaintRole = "ink" | "accent" | "muted" | "danger" | "none";
/** A colour by meaning: good is green, bad is red. A rise is not always good: a price rising is bad. */
export type ToneToken = "good" | "bad";
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
/** How large writing is drawn, by how much it matters: the term taught, a name that orients, a small tag, one big figure. */
export type TextSizeToken = "term" | "name" | "tag" | "number";
export type RoleToken =
  | "background"
  | "support"
  | "primary"
  | "hero"
  | "annotation"
  | "hud";
export type ZoneToken =
  | "main"
  | "main-left"
  | "main-right"
  | "support"
  | "footer"
  | "background"
  | "overlay"
  | "hud"
  | "strip"
  | "badge";
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
  | "scramble"
  | "rise";
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
      relation: "above" | "below" | "left-of" | "right-of" | "near" | "on" | "inside";
      /** Clearance from the target's drawn edge, in view units. */
      gap?: number;
    }
  | { mode: "anchor"; target: string };

/** An edge of a thing's drawn shape, or its middle. */
export type EdgeToken = "top" | "bottom" | "left" | "right" | "center";

/** A size stated against another thing: `times` × that thing's `dimension`. */
export interface RelativeSizeSpec {
  like: string;
  dimension?: "width" | "height";
  times?: number;
}

/** The thing's own point `self` (an edge or one of its parts) set on `to`'s point `at`. */
export interface AttachSpec {
  self: string;
  to: string;
  at: EdgeToken;
}

/** A way on screen: a compass word, or degrees anticlockwise from right (90 is up). */
export type DirectionToken = "up" | "down" | "left" | "right" | number;

/** How far a move goes: view units, or `times` × a thing's `dimension`. */
export type DistanceSpec = number | { times: number; of: string; dimension?: "width" | "height" };

/**
 * A coordinate frame something is drawn in, named by what sets it: a path's id (its own grid, so the
 * pieces of one figure line up); any other object or `object.part` (0–1000 across its box's width and
 * down its height); a figure's corner `fig.v<i>`, side `fig.s<i>` or point along a side `fig.s<i>@t`
 * (in the figure's grid units, axes as `geometry/figure.ts` sets them).
 */
export type FrameRef = string;

/**
 * Writing set at an exact point of a frame: its centre sits on `at` (frame units, default the origin).
 * In a side frame a y other than 0 instead keeps the whole of it that far off the side, on that side.
 */
export interface FramedWriting {
  in?: FrameRef;
  at?: [number, number];
}

export interface ObjectBase {
  id: string;
  role?: RoleToken;
  placement?: PlacementSpec;
  /** A size word sets a default by the thing's role; a relative size sets it exactly and wins. */
  size?: SizeToken | RelativeSizeSpec;
  /** Degrees clockwise about its centre: the state it starts the scene in. */
  rotate?: number;
  attach?: AttachSpec;
  initial?: "hidden" | "visible";
  space?: "world" | "screen";
  /** Teaching aid that must be explicitly hidden before the scene finishes. */
  temporary?: boolean;
  /** One of the film's `categories`: the thing takes that category's colour, the same in every scene. */
  category?: string;
  /** How strongly a category colours a picture or its parts: a faint still wash, or a strong one. */
  tint?: TintToken;
}

export type TintToken = "faint" | "strong";

/** A colour a film category takes, by its role in the theme. */
export type CategoryColorToken = "accent" | "second" | "ink" | "muted" | "danger";

/** One group the film codes by colour (allies and axis, reactants and products), declared once for the whole film. */
export interface FilmCategorySpec {
  id: string;
  name: string;
  color?: CategoryColorToken;
}

/** How much a piece of writing asks for the eye: on a plate, or blended quietly onto what it names. */
export type TextEmphasisToken = "attention" | "quiet";

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
  /** A quantity for the region: the map shades every valued region on one light-to-dark scale. */
  value?: number;
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
  boundsPrecision?: "exact" | "viewbox-fallback";
  /** Why automatic targeting had to use whole-artwork bounds. */
  boundsReason?: string;
}

interface ChartBase {
  xDomain?: [number, number];
  yDomain?: [number, number];
  axes?: boolean;
  xLabel?: string;
  yLabel?: string;
  /** The chart's takeaway, written left-aligned over it ("Bread prices doubled by 1789"). */
  title?: string;
  /** Where the numbers come from, in a small grey line under it. */
  source?: string;
}

/** One row compared at two moments, or across two sides: before and after, men and women. */
export interface PairDatumSpec {
  label: string;
  from: number;
  to: number;
}

/** A point riding a plotted line from one x to another as its beat plays, in step with whatever moves then. */
export interface ChartMarkerSpec {
  from: number;
  to: number;
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
        /** One line of points, or several lines on one pair of axes. */
        series: [number, number][] | [number, number][][];
        /** Each line's name, written at its end. */
        names?: string[];
        /** scatter: the least-squares line through the points. */
        trend?: boolean;
        marker?: ChartMarkerSpec;
      }
    | {
        kind: "chart";
        chart: "hbar" | "seats";
        data: CategoryDatumSpec[];
        /** seats: a tick at half the seats, so a majority reads at a glance. */
        majority?: boolean;
      }
    | {
        kind: "chart";
        chart: "units";
        data: CategoryDatumSpec[];
        /** How many units the whole is drawn as — 10 or 100 for a chance; the rest stay empty. */
        total?: number;
        icon?: MapIconToken;
        /** What one unit stands for, written under the array ("1 figure = 1,000 people"). */
        per?: string;
      }
    | {
        kind: "chart";
        chart: "slope" | "dumbbell" | "pyramid";
        pairs: PairDatumSpec[];
        /** The two moments (slope, dumbbell) or the two sides (pyramid) being compared. */
        columns?: [string, string];
      }
    | { kind: "chart"; chart: "stack"; series: [number, number][][]; names?: string[] }
    | { kind: "chart"; chart: "histogram"; values: number[]; bins?: number; marks?: "bars" | "dots" }
    | { kind: "chart"; chart: "sparkline"; series: [number, number][] }
    | {
        kind: "chart";
        chart: "function";
        function: string;
        /** A secant from `from` whose far point slides down the curve onto `at`, turning into the tangent there. */
        tangent?: { at: number; from: number };
        marker?: ChartMarkerSpec;
      }
    | {
        kind: "chart";
        chart: "riemann";
        function: string;
        rectangles?: "few" | "several" | "many" | "dense";
      }
  );

export type ObjectSpec =
  | (Omit<ObjectBase, "size"> & {
      kind: "text";
      text: string;
      textRole?: "body" | "bullet" | "caption";
      /** Writing also takes a size word by importance; any other size word or a relative size still works. */
      size?: SizeToken | TextSizeToken | RelativeSizeSpec;
      emphasis?: TextEmphasisToken;
    } & FramedWriting)
  | (ObjectBase & { kind: "equation"; value: string } & FramedWriting)
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
      /** The number and its meter in green for good or red for bad. */
      tone?: ToneToken;
      /** Draws the meter with no number, for an amount the voice gives no number for. Needs a `scale`. */
      quiet?: boolean;
      /** A picture of the scene set at its left as its icon, as tall as it. */
      icon?: string;
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
      /**
       * A raster picture (a photo-like or illustrated image), drawn whole: it enters, exits, moves
       * and pulses as one thing. `src` is a `data:image/(png|jpeg|webp|gif);base64,…` URL (or a
       * `blob:` URL the host created); the engine never fetches anything.
       */
      kind: "image";
      src: string;
      /** What the picture shows, in words (accessibility, logs and review; never drawn). */
      alt?: string;
      /** Width ÷ height of the picture. Read from a data URL's header when omitted; required for a blob: URL. */
      aspect?: number;
      /**
       * Named places inside the picture, `[x, y, w, h]` as fractions of the picture (top-left
       * origin): `pic.core` is a target for attention, lines, labels and relative placement,
       * resolved after the fit and carried with the picture when it moves. Hotspots are invisible
       * and are never shown, hidden, moved or pulsed on their own.
       */
      hotspots?: Record<string, [number, number, number, number]>;
      /**
       * The exact shape of a hotspot, `[[x, y], …]` as fractions of the picture, keyed by the hotspot's
       * name: `outline` attention traces it, `dim` cuts a hole shaped like it, and `fill` tints inside it.
       */
      outlines?: Record<string, Array<[number, number]>>;
      /** The whole subject's own border, `[[x, y], …]` as fractions of the picture: a highlight on the picture follows it. */
      silhouette?: Array<[number, number]>;
      /** Which way the drawn subject faces (its front, or the way it travels), as measured from the picture. */
      facing?: DirectionToken;
    })
  | (ObjectBase & {
      /**
       * A drawn path in SVG path syntax — M L H V C S Q T A Z, absolute or relative — on a 1000-unit
       * grid, y down. On its own the grid is the path's own box, fitted into the room its size word
       * gives. With `from` and `to` it is laid between two things instead: (0,0) sits on `from`,
       * (1000,0) on `to`, and y bows sideways (positive to the right of travel); it re-aims as either
       * end moves, like a line.
       */
      kind: "path";
      d: string;
      from?: string;
      to?: string;
      /** The frame the path is drawn in: see `FrameRef`. */
      in?: FrameRef;
      stroke?: PaintRole;
      fill?: PaintRole;
      arrow?: "start" | "end" | "both";
      appearance?: "solid" | "dashed";
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
      /** How far a curved or traced line bows off the straight chord, as a fraction of its length:
       *  positive to the right of the direction of travel, negative to the left. */
      bend?: number;
      arrow?: "start" | "end" | "both";
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
  /** A key of category colours: the categories named, or `"film"` for every category the film declares. */
  | (ObjectBase & { kind: "legend"; categories: string[] | "film" })
  | (ObjectBase & {
      kind: "map";
      features: MapFeatureSpec[];
      markers?: Array<{
        lon: number;
        lat: number;
        label?: string;
        icon?: MapIconToken;
        category?: string;
        /** A quantity at the place: drawn as a circle whose AREA is the value (a proportional-symbol map). */
        value?: number;
      }>;
      /** The name of the quantity a data map shows ("Deaths per 1,000"): writes the map's key — the shading ramp of valued regions and the circle sizes of valued markers. */
      legend?: string;
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
      events?: Array<{ at: number; label: string; side?: "above" | "below"; lane?: number }>;
      eras?: Array<{
        from: number;
        to: number;
        label: string;
        category?: string;
        lane?: number;
      }>;
      playhead?: number | { from: number; to: number; pace?: PaceToken };
      /** Parallel themes the events and eras sit on (politics, economy, daily life), named at their left. */
      lanes?: string[];
      /** Causes drawn as arrows from one event to another, by event index, with the verb that links them. */
      links?: Array<{ from: number; to: number; label?: string }>;
    })
  | (ObjectBase & { kind: "table"; rows: string[][]; header?: boolean })
  | (ObjectBase & {
      /**
       * Boxes joined by arrows, laid out by the engine: numbered stages in order (sequence), a loop
       * (cycle), what belongs under what (tree, by `parent`), or any boxes and arrows (flow, by
       * `links`). Every node is a piece `<id>.<node>`, every link `<id>.<from>-<to>`, so the diagram
       * builds node by node as it is narrated.
       */
      kind: "diagram";
      layout: "sequence" | "cycle" | "tree" | "flow";
      nodes: Array<{ id: string; label: string; parent?: string; note?: string }>;
      links?: DiagramLinkSpec[];
    })
  | (ObjectBase & {
      /** Two panels side by side under their titles, row matched to row: similar and different, before
       *  and after, the analogy and the real thing. Rows are pieces `row0`, `row1`, …; the titles `left`, `right`. */
      kind: "compare";
      titles: [string, string];
      rows: Array<{ left: string; right: string; match?: "same" | "different" | "maps" | "fails" }>;
    })
  | (ObjectBase & {
      /** Things at their true relative size, on one baseline, with a scale bar: a cell beside a grain of sand. */
      kind: "scale";
      unit: string;
      items: Array<{ label: string; size: number }>;
    })
  | (ObjectBase & {
      /** A primary source: who, when, where and for whom (the piece `header`), then its words (`excerpt`). */
      kind: "evidence";
      excerpt: string;
      author?: string;
      date?: string;
      place?: string;
      audience?: string;
    })
  | (ObjectBase & {
      /** The film's open question, held on screen; its piece `tick` marks it answered. */
      kind: "question";
      text: string;
    })
  | (ObjectBase & {
      /**
       * Forces as arrows out of one point, each as long as its size: on a body when anchored to it,
       * else a free-body dot. Each force is a piece by its id; `resolve` splits it into components
       * along and across an axis (a slope), the piece `<force>-parts`.
       */
      kind: "forces";
      forces: Array<{
        id: string;
        label: string;
        /** Degrees anticlockwise from pointing right: 90 is up, 270 down. */
        angle: number;
        size: number;
        resolve?: { axis: number; labels: [string, string] };
      }>;
    })
  | (ObjectBase & {
      /**
       * A worked solution line by line: each line (`l0`, `l1`, …) appears under the last, which stays
       * but dims, with the operation that led to it in the margin. `cancel` strikes terms of a line
       * through (the piece `l<n>-cancel`).
       */
      kind: "working";
      lines: Array<{ tex: string; note?: string; cancel?: string[] }>;
    })
  | (ObjectBase & {
      kind: "group";
      children: ObjectSpec[];
      layout?: "row" | "stack" | "grid";
      columns?: number;
      build?: PaceToken;
      clip?: boolean;
    });

export interface DiagramLinkSpec {
  from: string;
  to: string;
  /** The verb the arrow carries: "raises", "causes", "blocks". */
  label?: string;
  /** How one thing acts on the next: a standing `condition` (dashed), the `trigger` that sets it off
   *  (bold), a link that `prevents` (a bar at its head), or a plain arrow. */
  type?: "leads" | "condition" | "trigger" | "prevents";
}

/** A moving thing leaves its route behind it: a dotted trail, or faded copies of itself along the way. */
export type TrailToken = "dots" | "ghosts";
/**
 * Dates along a journey, evenly spaced from its start to its arrival, each written where the traveller
 * was then; a faded copy is left at each date but the last. Implies a `ghosts` trail.
 */
export type TrailDates = string[];

/** How full a thing is, in the only steps a reader can actually tell apart. */
export type FillToken = "empty" | "quarter" | "half" | "three-quarters" | "full";

export type ActionSpec =
  | {
      /** From this beat, washes the targets (pictures, their parts, figure pieces) in a category's colour; without `category` it takes the wash off. */
      do: "tint";
      targets: string[];
      category?: string;
    }
  | {
      do: "fill";
      target: string;
      to: FillToken;
      direction?: "up" | "down" | "left" | "right";
      /** The tint a picture's outlined part fills with. */
      color?: Exclude<PaintRole, "none">;
    }
  | { do: "show"; targets: string[]; entrance?: EntranceToken }
  /** A cross over the target (a stroke through writing), in the danger colour, held until it or the mark is hidden. */
  | { do: "strike"; id?: string; target: string }
  /** A check mark beside the target, held until it or the mark is hidden. */
  | { do: "tick"; id?: string; target: string }
  /** A bold up or down arrow beside the target, for an amount of it rising or falling, held until it or the mark is hidden or the next trend on it. */
  | { do: "trend"; id?: string; target: string; way: "up" | "down"; tone?: ToneToken }
  /** The picture shrinks into the free band above or below the others and greys back, so a new subject takes the centre. */
  | { do: "aside"; target: string }
  | { do: "hide"; targets: string[]; exit?: ExitToken }
  | {
      do: "camera";
      target: string;
      shot?: ShotToken;
      movement?: "cut" | "move" | "push" | "arc";
    }
  | {
      do: "label";
      /** Names the label, so a `hide` can take it off while its target stays. */
      id?: string;
      target: string;
      text: string;
      size?: TextSizeToken;
      title?: string;
      style?: "text" | "pill" | "rect" | "tag" | "bubble" | "badge";
      emphasis?: TextEmphasisToken;
      /** On the part, right beside it, or in a column beside the picture with a pointer line; chosen by fit when absent. */
      place?: "inside" | "beside" | "pointer";
    }
  | {
      /** A character's own words, handwritten beside its head with a short tick to its mouth, written on with the voice. */
      do: "speak";
      /** Names the line, so a `hide` can take it off before anyone speaks again. */
      id?: string;
      /** The speaker: a picture, or the part of it that speaks (its head or mouth). */
      target: string;
      text: string;
      /** The word or short phrase of `text` written in the key colour. */
      stress?: string;
      /** Keeps the line past the end of its narration sentence, until the next `speak` or its speaker hides. */
      hold?: boolean;
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
      trail?: TrailToken;
      dates?: TrailDates;
      /** A thing, a part, or a zone — a zone counted from the band the mover is in. Or one of the directions below. */
      to?: string;
      toward?: string;
      away?: string;
      /** The way opposite to this object's journey in the same beat: an action and its reaction. */
      opposite?: string;
      direction?: DirectionToken;
      /** How far a directional move goes; the mover's own length that way when absent. */
      by?: DistanceSpec;
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
      trail?: TrailToken;
      dates?: TrailDates;
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
      trail?: TrailToken;
      dates?: TrailDates;
      around: string;
      turns?: number;
      direction?: "clockwise" | "counterclockwise";
      /** Height ÷ width of the orbit: 1 is a circle, less is an ellipse seen edge-on. */
      ratio?: number;
    }
  | {
      do: "motion";
      target: string;
      /** Pieces that ride rigidly with the target — a rod with its bob, a cup in a hand — named as parts or objects. */
      with?: string[];
      motion: "along";
      trail?: TrailToken;
      dates?: TrailDates;
      /** The drawn route to walk: a line, span, curve or path. */
      along?: string;
      /** Or no drawn route: a smooth one through these things in order, from where the traveller rests. */
      through?: string[];
      gait?: "walk" | "run" | "hop";
      repeat?: "once" | "there-and-back" | "loop";
      /** `path`: the traveller turns with the route, as a car follows a road. */
      face?: "path";
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
      do: "motion";
      target: string;
      with?: string[];
      motion: "morph";
      /** A faded copy of the old form stays through the beat, so the change is read against where it began. */
      ghost?: boolean;
      /** A `path` becomes this path, written on the same grid as its own `d`. */
      d?: string;
      /** A `shape` becomes this shape. */
      shape?: "circle" | "polygon" | "star" | "heart";
      sides?: number;
    }
  | {
      do: "motion";
      target: string;
      with?: string[];
      /** Jostling about at random, as molecules do — then, given `to`, arriving there after a few chance near-misses. */
      motion: "wander";
      to?: string;
      land?: "surface" | "centre";
      trail?: TrailToken;
      dates?: TrailDates;
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
        | "outline"
        | "converge"
        | "spark"
        | "vignette"
        | "rings"
        /** Colour runs along a path or connector from its start to its end: cause flowing to effect. */
        | "trace"
        /** A stroke drawn under the thing as it is said. */
        | "underline"
        /** The thing is held constant: greyed, with a small tag (its `text`, "fixed" by default). */
        | "hold"
        /** Struck through, then faded back, and left so while it is shown: a term of an equation that cancels. */
        | "cancel";
      /** The matching parts of other things, cued by the same verb at the same moment. */
      with?: string[];
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
  /** The narration's own words this beat begins on; the beat starts as they are spoken. */
  say?: string;
  actions: ActionSpec[];
}

/** Room for a real decision question: up to 160 characters asked, 120 per option, 200 per reason. */
export interface SceneCheck {
  question: string;
  answer: string;
  /** Why the answer is right. */
  why: string;
  wrong: { text: string; why: string }[];
  /** Under the frozen last frame, or over it. The player's default is "below". */
  place?: "below" | "over";
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
  /** A comprehension question asked after this scene plays. The engine carries it to the player untouched. */
  check?: SceneCheck;
  /** The film category of each picture part or figure piece the scene colours: `{"europe.france": "allies"}`. */
  categories_of?: Record<string, string>;
  objects: ObjectSpec[];
  beats: BeatSpec[];
}

export interface LessonSpec {
  version: "1";
  title: string;
  theme: ThemeToken;
  /** The groups the whole film codes by colour, each keeping one colour in every scene and every key. */
  categories?: FilmCategorySpec[];
  scenes: SceneSpec[];
}
