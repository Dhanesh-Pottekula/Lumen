// src/gcl/schema.ts
/** The generic-component-layer authoring schema (Phase 0 subset). Flat stream of scene markers + components. */
import type { Side as CalloutSide, LeaderRoute as CalloutRoute, Container as CalloutContainer } from "../render/callout";

export type Vec2 = [number, number];

/** Named layout slots inside the 920×430 view. */
export type Slot =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right"
  | "ground" | "sky";

/** A geographic point in lon/lat — projected to screen through the scene's map (see gcl/compile.ts
 *  `buildSceneGeo`). Written as an object so it's never confused with a pixel `[x,y]` Vec2. */
export interface GeoPoint { lon: number; lat: number }

/** A position: a slot name, an [x,y] pixel pair, a `{lon,lat}` geo point, a named place/region
 *  (resolved via the scene's map), or another component's id (anchor). */
export type Position = Slot | Vec2 | GeoPoint | string;

export type ThemeName = "TEXTBOOK" | "PARCHMENT" | "BLUEPRINT" | "CHALKBOARD";

/** How a component enters — the full Family C vocabulary (Phase 2). */
export type EnterKind = "none" | "fade" | "draw" | "wipe" | "iris" | "radialWipe"
  | "blinds" | "checkerboard" | "dissolve" | "clip" | "slam" | "word" | "typewriter"
  | "scramble" | "build" | "borderThenFill";

export interface EnterSpec {
  type: EnterKind;
  dur?: number;
  dir?: "left" | "right" | "up" | "down";      // wipe/blinds
  shape?: "circle" | "ellipse" | "rect" | "diamond"; // iris
  count?: number;                               // blinds slats
  seed?: number;                                // dissolve/checkerboard
  points?: Vec2[];                              // clip polygon (absolute coords)
  pen?: boolean;                                // draw: ride a pen nib along the stroke
}

/** How a component exits — independent of its enter, driven by absolute-time (or scene-relative) windows. */
export type ExitKind = "none" | "fade" | "erase" | "wipe" | "iris" | "dissolve" | "slide" | "shrink";
export interface ExitSpec {
  type: ExitKind;
  out?: number;    // absolute start of the exit (seconds); default = scene end - dur
  until?: number;  // alt: exit finishes at this time
  dur?: number;    // default 0.6
  dir?: "left" | "right" | "up" | "down"; // wipe/slide direction
}

/** Per-component object motion (Family B) — move/fall/orbit/along/spin/trace/morph, pure fns of t. */
export type MotionSpec =
  | { kind: "move"; to: Position; from?: Position; at?: number; cue?: number; start?: "with" | "after" | number; dur?: number }
  | { kind: "fall"; to?: Position; from?: Position; gravity?: number; at?: number; dur?: number; bounce?: number }
  | { kind: "orbit"; center: Position; radius?: number; rx?: number; ry?: number; from?: number; turns?: number; at?: number; dur?: number }
  | { kind: "along"; path: Vec2[]; loop?: boolean; at?: number; dur?: number }
  | { kind: "spin"; omega?: number; at?: number; dur?: number }
  | { kind: "trace"; path: Vec2[]; color?: string; dissipate?: number; at?: number; dur?: number }
  | { kind: "morph"; toShape: "circle" | "polygon" | "star" | "heart"; sides?: number; at?: number; dur?: number };

/** Idle continuous oscillation (breathe/wobble/pulse) layered additively atop motion/placement. */
export interface OscillateSpec {
  axis?: "x" | "y" | "rot" | "scale";
  amp: number;
  period: number;
  mode?: "breathe" | "wobble" | "pulse";
}

export interface EmphasisSpec {
  kind?: "punch" | "shake" | "pulse" | "wiggle";
  at?: number;
  cue?: number;
  dur?: number;
  amp?: number;
}

/** Fields shared by every component. Most are plumbed now, exercised in later phases. */
export interface Base {
  id?: string;
  at?: Position;
  cue?: number;                    // narration sentence index this appears with
  start?: "with" | "after" | number; // relative or absolute start (overrides cue)
  dur?: number;                    // entrance duration
  enter?: EnterSpec;
  exit?: ExitSpec;
  layer?: "bg" | "mid" | "fg" | "annotation" | "fx";
  // Screen-fixed HUD: when true, this component ignores the scene camera (pan/zoom) and stays put in
  // screen space — for legends/titles/counters that should not move during a camera move. Implemented
  // by routing it to a dedicated screenspace overlay layer (see compile.ts). Per-scene, so it never
  // affects camera tracking of other components or other lessons.
  fixed?: boolean;
  motion?: MotionSpec;
  oscillate?: OscillateSpec;
  // Subject modifiers (Family D, Phase 4) — wrap THIS component's own content draw via the (A)-class
  // verbs (withPunch/withShake/pulseScale/wiggle/ghost/magnify) and predictReveal gating.
  emphasis?: EmphasisSpec | EmphasisSpec[];
  ghost?: number;   // 0..1 residual opacity (de-emphasize this element)
  magnify?: { zoom?: number; r?: number };
  predict?: { revealAt?: number; revealCue?: number; poseAt?: number };
}

/** Attention overlay verbs (Family D, Phase 4) — a (B)-class indicator pointing at a resolved anchor. */
export type AttnVerb = "callout" | "highlight" | "spotlight" | "dim" | "pointer" | "box"
  | "brackets" | "encircle" | "converge" | "spark" | "vignette" | "rings";

export type Component =
  | (Base & { type: "heading"; text: string; size?: number; color?: string })
  // text: role drives default size/weight/placement; mode drives kinetic entrance
  | (Base & { type: "text"; text: string; role?: "title" | "body" | "bullet" | "caption"; mode?: "fade" | "word" | "typewriter" | "slam" | "scramble"; size?: number; color?: string; align?: CanvasTextAlign })
  | (Base & { type: "textPath"; text: string; path: Vec2[]; size?: number; color?: string })
  | (Base & { type: "equation"; tex: string; size?: number; color?: string; align?: "left" | "center" | "right" })
  // stat stays as defined in P0 but ALSO accept fmt passthrough:
  // `from` (optional): when set, the counter animates `from → value` (instead of the implicit `0 →
  // value`) — e.g. a running-year readout ("1206" → "1260 CE" via `unit: "CE"`). Purely additive;
  // omitting it preserves the original 0→value counting behavior everywhere else.
  | (Base & { type: "stat"; value: number; from?: number; unit?: string; label?: string; size?: number; color?: string; commas?: boolean; decimals?: number; prefix?: string })
  | (Base & {
      // "riemann" (Phase 6 harvest): n rectangles under `fn` over `xDomain`, building in one-by-one —
      // the classic Riemann-sum calculus visual, harvested as a reusable named chart mode.
      type: "chart"; chart: "bar" | "line" | "area" | "scatter" | "pie" | "function" | "riemann";
      data?: { label: string; value: number; color?: string }[];   // bar/pie
      series?: [number, number][];                                   // line/area/scatter
      fn?: string;                                                   // function (safe-expr in x) — function/riemann
      n?: number;                                                     // riemann: rectangle count
      xDomain?: [number, number]; yDomain?: [number, number];
      w?: number; h?: number; color?: string; donut?: number; axes?: boolean; xLabel?: string; yLabel?: string;
    })
  | (Base & {
      type: "shape"; shape: "circle" | "polygon" | "star" | "heart" | "path" | "disc";
      r?: number; sides?: number; points?: Vec2[]; fill?: string | [string, string]; stroke?: string; width?: number;
      shine?: boolean; // disc: render as a shaded sphere (radial gradient light→dark + rim glow)
    })
  | (Base & { type: "parametric"; fx: string; fy: string; uDomain?: [number, number]; samples?: number; color?: string; width?: number })
  | (Base & { type: "icon"; name: string; size?: number; color?: string; filled?: boolean })
  | (Base & { type: "image"; src: string; w: number; h: number; rotate?: number })
  // Family G — SVG/vector primitives: raw Path2D `d` strings, embedded SVG markup, or a named prop
  // pulled from the reusable prop catalog (see gcl/props.ts). All three are static content (no native
  // progress of their own beyond a simple fade-in via enterP) — see compile.ts's paint switch.
  | (Base & { type: "vector"; d: string; fill?: string; stroke?: string; width?: number; w?: number; h?: number; scale?: number; rotate?: number })
  | (Base & { type: "svg"; markup: string; w: number; h: number; rotate?: number })
  | (Base & { type: "prop"; name: string; size?: number; angle?: number; color?: string; w?: number; h?: number })
  | (Base & { type: "legend"; categories: string[]; rowH?: number })
  | (Base & {
      type: "map";
      features: { id: string; rings: [number, number][][] }[];
      markers?: { lon: number; lat: number; label?: string; icon?: string }[];
      // Named places this map exposes for targeting: `flows`, and any component's `at`/`target`/`to`,
      // can then reference them by name (e.g. `"beijing"`) instead of raw coords. Feature `id`s and
      // marker `label`s are auto-registered too (see compile.ts `buildSceneGeo`).
      places?: { name: string; lon: number; lat: number }[];
      // Curved flow-arrows, drawn via `flowArrow`. `from`/`to` are each a `[lon,lat]` pair OR a place
      // name (a `places` entry / feature id / marker label). `width`/`bend` shape the stroke and its
      // bezier curvature; `at`/`dur` give each arrow its own draw-on window (seconds relative to the
      // map's entrance) so a set can sweep out one-by-one. Bidirectional pairs = two opposite-`bend`
      // entries.
      flows?: { from: [number, number] | string; to: [number, number] | string; color?: string; width?: number; bend?: number; at?: number; dur?: number }[];
      // Max-extent outline: a lon/lat ring drawn as a thin stroke-only border (no fill) — e.g. a
      // continent coastline that the growing empire is read against.
      outline?: [number, number][];
      // Borders-over-time: >=2 lon/lat keyframe rings the map morphs through over `growDur` seconds
      // via `borderAt`, drawn FILLED — the classic "growing empire" showpiece.
      grow?: [number, number][][];
      growDur?: number; // seconds for `grow` to complete (default 8)
      growFill?: string;
      growStroke?: string;
      outlineStroke?: string;
      // Per-feature fill/stroke colors, same order as `features` — e.g. for the four khanates so each
      // region reads as a distinct color instead of one shared fill. Optional; when omitted every
      // feature keeps the existing single-tone style (backward-compatible).
      featureColors?: string[];
      // Staggered feature draw-on: when set, feature `i` draws over the window
      // [`i*featureStagger`, `i*featureStagger + featureDur`] (seconds since the map's entrance) so
      // regions appear one-by-one rather than all at once. Omitted → every feature uses the map's own
      // `enterP` together (backward-compatible).
      featureStagger?: number;
      featureDur?: number;
      w?: number; h?: number;
    })
  | (Base & {
      type: "timeline"; from: number; to: number;
      events?: { at: number; label: string; above?: boolean }[];
      eras?: { from: number; to: number; label: string; color?: string }[];
      // `playhead`: a fixed marker year (backward-compatible — still works as before). For an
      // ANIMATED playhead that sweeps across a window, set `playheadFrom`/`playheadTo` (+ optionally
      // `playheadOver` for the sweep duration in seconds, default = the component's own `dur`); the
      // marker then lerps `playheadFrom → playheadTo` over `clamp01((t-at)/playheadOver)`, `at` being
      // this component's own resolved start time. When both a fixed `playhead` and the animated pair
      // are given, the animated pair wins.
      playhead?: number; playheadFrom?: number; playheadTo?: number; playheadOver?: number;
      playheadLabel?: boolean; // draw the year label box on the playhead (default true)
      w?: number; h?: number;
    })
  // Family A — table: a plain data grid (Phase 6). New primitive kept in gcl/table.ts (reuse-only:
  // NOT added to render/*); measured/compiled like any other content component.
  | (Base & { type: "table"; rows: string[][]; header?: boolean; w?: number; rowH?: number; colColor?: string; ink?: string })
  // camera directive — a component-position item in the flat stream, excluded from the draw loop
  // and layout auto-flow; resolved once per scene into a pure cameraAt(t) via gcl/camera.ts.
  | (Base & { type: "camera"; to?: Position; zoom?: number; rot?: number; kind?: "move" | "pushIn" })
  // attention overlay directive — like camera, excluded from the draw loop and layout auto-flow (it
  // has no measured content of its own); resolves `target`/`from` via the layout `boxes` map through
  // gcl/attention.ts and draws a (B)-class indicator on the annotation (or fx) layer. See compile.ts.
  | (Base & {
      type: "attention"; verb: AttnVerb; target: Position; from?: Position; // pointer needs 2 pts
      text?: string; title?: string; side?: CalloutSide; route?: CalloutRoute; container?: CalloutContainer; color?: string; radius?: number;
    })
  // Family E — atmosphere: particles/flow/glow, simple stream components compiling to `emit`/
  // `radialGlow` on the fx layer (see gcl/particles.ts + compile.ts). Time is always `t - startTime`.
  | (Base & { type: "particles"; preset?: "fire" | "smoke" | "sparks" | "rain" | "snow" | "dust" | "confetti" | "energy"; seed?: number; config?: Record<string, unknown> })
  | (Base & { type: "flow"; from: Position; to: Position; color?: string; rate?: number; seed?: number })
  | (Base & { type: "glow"; r?: number; color?: string })
  // Family F — group container: a Base component with children:Component[]. Because it extends Base,
  // its own enter/exit/motion/emphasis already wrap the whole group through the existing compile
  // chain; `layout`/`gap`/`cols` arrange the children (see gcl/layout.ts's layoutGroup), `build`
  // staggers their entrance, `childEnter` is the default entrance applied to children that have none,
  // and `clip` clips child painting to the group's own box (see compile.ts's renderGroup).
  | (Base & { type: "group"; children: Component[]; layout?: "row" | "stack" | "grid"; gap?: number; cols?: number; build?: { step?: number }; childEnter?: EnterSpec; clip?: boolean });

/** Every drawable component type — `Component` minus the `camera`/`attention` directives. Layout/
 *  measure/paint only ever see this subset; camera/attention items are split out and resolved
 *  separately (see compile.ts). */
export type DrawComponent = Exclude<Exclude<Component, { type: "camera" }>, { type: "attention" }>;

export interface SceneMarker {
  type: "scene";
  duration?: number;               // explicit scene length (else derived from timing)
  theme?: ThemeName;
  narration?: string[];            // one string per sentence; index = cue
  bg?: [string, string];
}

export type Item = SceneMarker | Component;
export type Film = Item[];

/** Type guard: is this item a scene marker? */
export function isScene(item: Item): item is SceneMarker {
  return item.type === "scene";
}
