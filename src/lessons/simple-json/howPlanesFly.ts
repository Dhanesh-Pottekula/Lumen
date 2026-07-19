import type { LessonSpec } from "../../simple-json";

/**
 * Physics/engineering — "How Airplanes Fly". Authored ONE-SHOT from the visual script
 * (docs/skills/scripts/how-planes-fly.md) and SIMPLE-JSON-LLM-CONTEXT.md — no compiler, no validation.
 * Anchor: the airfoil, built up scene by scene. One main object + a short caption per scene.
 */

const PLANE = "<svg viewBox='0 0 320 150'><g id='plane' fill='#5c9bd6'><path d='M40 82 L230 74 Q258 74 268 80 Q258 86 230 88 L40 90 Z'/><path d='M120 84 L152 44 L168 44 L146 86 Z'/><path d='M56 84 L42 52 L56 52 L78 84 Z'/><path d='M228 78 L250 56 L262 58 L242 82 Z'/></g></svg>";
const FORCES = "<svg viewBox='0 0 320 210'><g id='plane' fill='#5c9bd6'><path d='M90 104 L230 100 Q252 100 260 104 Q252 108 230 110 L90 112 Z'/><path d='M150 106 L178 80 L192 80 L170 108 Z'/></g><g id='lift' stroke='#6fbf7f' stroke-width='4'><line x1='170' y1='98' x2='170' y2='40'/><polygon points='170,32 162,48 178,48' fill='#6fbf7f'/></g><g id='weight' stroke='#e05a4a' stroke-width='4'><line x1='170' y1='114' x2='170' y2='172'/><polygon points='170,180 162,164 178,164' fill='#e05a4a'/></g><g id='thrust' stroke='#ffd24a' stroke-width='4'><line x1='252' y1='106' x2='305' y2='106'/><polygon points='313,106 297,98 297,114' fill='#ffd24a'/></g><g id='drag' stroke='#a878d0' stroke-width='4'><line x1='90' y1='106' x2='36' y2='106'/><polygon points='28,106 44,98 44,114' fill='#a878d0'/></g></svg>";
const AIRFOIL = "<svg viewBox='0 0 300 140'><g id='wing' fill='#cfe0e6'><path d='M40 86 Q120 48 200 70 Q252 86 264 90 Q180 102 100 98 Q60 94 40 86 Z'/></g></svg>";
const AIRFLOW = "<svg viewBox='0 0 320 160'><g id='wing' fill='#cfe0e6'><path d='M50 96 Q130 58 210 80 Q262 96 274 100 Q190 112 110 108 Q70 104 50 96 Z'/></g><g id='topflow' stroke='#6fbf7f' stroke-width='3' fill='none'><path d='M10 70 Q140 38 306 66'/></g><g id='bottomflow' stroke='#9fc6e8' stroke-width='3' fill='none'><path d='M10 122 Q160 120 306 120'/></g></svg>";
const PRESSURE = "<svg viewBox='0 0 300 160'><g id='wing' fill='#cfe0e6'><path d='M40 92 Q120 54 200 76 Q252 92 264 96 Q180 108 100 104 Q60 100 40 92 Z'/></g><g id='low' stroke='#e05a4a' stroke-width='2'><line x1='90' y1='44' x2='90' y2='64'/><line x1='140' y1='38' x2='140' y2='58'/><line x1='190' y1='44' x2='190' y2='64'/></g><g id='high' stroke='#6fbf7f' stroke-width='3'><line x1='100' y1='150' x2='100' y2='112'/><line x1='150' y1='152' x2='150' y2='112'/><line x1='200' y1='150' x2='200' y2='112'/></g></svg>";
const ANGLE = "<svg viewBox='0 0 320 170'><g id='wing' fill='#cfe0e6'><path d='M50 74 Q130 64 210 100 Q256 116 266 120 Q186 112 106 92 Q72 84 50 74 Z'/></g><g id='inflow' stroke='#9fc6e8' stroke-width='3'><line x1='8' y1='84' x2='60' y2='84'/></g><g id='downwash' stroke='#6fbf7f' stroke-width='3'><line x1='256' y1='116' x2='308' y2='150'/><polygon points='314,154 298,148 304,136' fill='#6fbf7f'/></g></svg>";

export const howPlanesFlyLessonSpec: LessonSpec = {
  version: "1",
  title: "How Airplanes Fly",
  theme: "blueprint",
  scenes: [
    {
      id: "hook",
      composition: "hero",
      objects: [
        { id: "plane", kind: "svg-artwork", svg: PLANE, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "hook-title", kind: "text", text: "How does 400 tonnes stay up?", textRole: "heading", role: "hero", placement: { mode: "zone", zone: "title" } },
      ],
      beats: [
        { id: "hook-b1", pace: "slow", actions: [{ do: "show", targets: ["plane"], entrance: "fade" }] },
        { id: "hook-b2", actions: [{ do: "show", targets: ["hook-title"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "forces",
      composition: "hero-diagram",
      objects: [
        { id: "f-title", kind: "text", text: "Four forces on every plane", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "forces", kind: "svg-artwork", svg: FORCES, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "f-cap", kind: "text", text: "Lift up, weight down, thrust forward, drag back.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "f-b1", actions: [{ do: "show", targets: ["f-title"], entrance: "fade" }] },
        { id: "f-b2", pace: "slow", actions: [{ do: "show", targets: ["forces"], entrance: "draw" }] },
        { id: "f-b3", actions: [{ do: "attention", target: "forces.lift", verb: "callout", title: "Lift beats weight", text: "= you fly", side: "east", route: "elbow", style: "pill" }] },
        { id: "f-b4", actions: [{ do: "show", targets: ["f-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "wing",
      composition: "hero-diagram",
      objects: [
        { id: "w-title", kind: "text", text: "The secret is the wing's shape", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "airfoil", kind: "svg-artwork", svg: AIRFOIL, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "w-cap", kind: "text", text: "Curved and long on top, flatter underneath.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "w-b1", actions: [{ do: "show", targets: ["w-title"], entrance: "fade" }] },
        { id: "w-b2", pace: "slow", actions: [{ do: "show", targets: ["airfoil"], entrance: "draw" }] },
        { id: "w-b3", actions: [{ do: "show", targets: ["w-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "airflow",
      composition: "hero-diagram",
      objects: [
        { id: "af-title", kind: "text", text: "Air races over the top", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "airflow", kind: "svg-artwork", svg: AIRFLOW, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "af-cap", kind: "text", text: "The flow splits; the top must move faster.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "af-b1", actions: [{ do: "show", targets: ["af-title"], entrance: "fade" }] },
        { id: "af-b2", pace: "slow", actions: [{ do: "show", targets: ["airflow"], entrance: "draw" }] },
        { id: "af-b3", actions: [{ do: "attention", target: "airflow.topflow", verb: "callout", title: "Faster on top", text: "longer path", side: "north", route: "elbow", style: "pill" }] },
        { id: "af-b4", actions: [{ do: "show", targets: ["af-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "pressure",
      composition: "hero-diagram",
      objects: [
        { id: "p-title", kind: "text", text: "Faster air, lower pressure", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "pressure", kind: "svg-artwork", svg: PRESSURE, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "p-cap", kind: "text", text: "Low pressure above, high below — a net push up = lift.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "p-b1", actions: [{ do: "show", targets: ["p-title"], entrance: "fade" }] },
        { id: "p-b2", pace: "slow", actions: [{ do: "show", targets: ["pressure"], entrance: "draw" }] },
        { id: "p-b3", actions: [{ do: "attention", target: "pressure.high", verb: "callout", title: "LIFT", text: "net push upward", side: "south", route: "elbow", style: "pill" }] },
        { id: "p-b4", actions: [{ do: "show", targets: ["p-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "angle",
      composition: "hero-diagram",
      objects: [
        { id: "a-title", kind: "text", text: "Tilt the wing, push air down", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "angle", kind: "svg-artwork", svg: ANGLE, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "a-cap", kind: "text", text: "Push air down → the air pushes the wing up (Newton).", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "a-b1", actions: [{ do: "show", targets: ["a-title"], entrance: "fade" }] },
        { id: "a-b2", pace: "slow", actions: [{ do: "show", targets: ["angle"], entrance: "draw" }] },
        { id: "a-b3", actions: [{ do: "attention", target: "angle.downwash", verb: "callout", title: "Downwash", text: "air flung downward", side: "north", route: "elbow", style: "pill" }] },
        { id: "a-b4", actions: [{ do: "show", targets: ["a-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "speed",
      composition: "data",
      objects: [
        { id: "s-title", kind: "text", text: "More speed, much more lift", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "speed-chart", kind: "chart", chart: "function", function: "x^2", xDomain: [0, 10], yDomain: [0, 105], axes: true, xLabel: "Speed", yLabel: "Lift", size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "s-cap", kind: "text", text: "Lift grows with speed squared — double the speed, 4× the lift.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "s-b1", actions: [{ do: "show", targets: ["s-title"], entrance: "fade" }] },
        { id: "s-b2", pace: "slow", actions: [{ do: "show", targets: ["speed-chart"], entrance: "draw" }] },
        { id: "s-b3", actions: [{ do: "attention", target: "speed-chart.last", verb: "callout", title: "steep", text: "fast = far more lift", side: "west", route: "elbow", style: "pill" }] },
        { id: "s-b4", actions: [{ do: "show", targets: ["s-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "stall",
      composition: "data",
      objects: [
        { id: "st-title", kind: "text", text: "Too much angle: the stall", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "stall-chart", kind: "chart", chart: "line", series: [[0, 0], [4, 22], [8, 42], [12, 58], [15, 66], [17, 52], [20, 28]], xDomain: [0, 20], yDomain: [0, 72], axes: true, xLabel: "Angle (°)", yLabel: "Lift", size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "st-cap", kind: "text", text: "Tilt too far and the flow breaks — lift collapses.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "st-b1", actions: [{ do: "show", targets: ["st-title"], entrance: "fade" }] },
        { id: "st-b2", pace: "slow", actions: [{ do: "show", targets: ["stall-chart"], entrance: "draw" }] },
        { id: "st-b3", actions: [{ do: "attention", target: "stall-chart.peak", verb: "callout", title: "Stall!", text: "past here, lift drops", side: "north", route: "elbow", style: "pill" }] },
        { id: "st-b4", actions: [{ do: "show", targets: ["st-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "recap",
      composition: "hero",
      objects: [
        { id: "recap-wing", kind: "svg-artwork", svg: PRESSURE, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "recap-take", kind: "text", text: "A wing turns speed into lift — and that is flight.", textRole: "body", role: "primary", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "r-b1", pace: "slow", actions: [{ do: "show", targets: ["recap-wing"], entrance: "fade" }] },
        { id: "r-b2", pace: "dramatic", actions: [{ do: "show", targets: ["recap-take"], entrance: "word-by-word" }] },
      ],
    },
  ],
};
