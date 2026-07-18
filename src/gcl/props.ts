// src/gcl/props.ts
/** Named prop catalog for the `{type:"prop"}` component (see schema.ts/compile.ts). Each entry is a
 *  pure function of (size, color) returning a flat list of Path2D-ready parts — all coordinates
 *  centered near the origin so the caller's `size`/`angle`/`at` alone place & orient the whole prop
 *  (compile.ts translates to the placement point, rotates by `angle` degrees, THEN draws each part's
 *  `d` unscaled — the parts below are already pre-scaled by `size` at authoring time, matching the
 *  vector handler's own translate/rotate/(optional)scale order). Deterministic: no Date.now/Math.random
 *  anywhere in this module. */

export interface PropPart { d: string; fill?: string; stroke?: string; width?: number }
export type PropFn = (size: number, color?: string) => PropPart[];

/** Cannon — a tapered barrel flared at the muzzle, angled up-to-the-left (firing direction), sitting
 *  on a solid wooden gun-carriage block, with two spoked wheels on a shared axle. `size=1` spans
 *  roughly 60–70px across. Origin sits at the carriage's center-ground so `at` drops it right onto a
 *  surface; barrel breech is behind/below the carriage, muzzle out to the upper-left. */
const cannon: PropFn = (size, color) => {
  const s = size;
  const metal = color ?? "#7d8b82";
  const metalDark = "#4d564f";
  const wood = "#5a4326";
  const woodDark = "#3c2e18";
  const wheelRim = "#39423c";
  const wheelHub = "#8a948c";

  return [
    // axle (thin bar spanning under the carriage, behind the wheels)
    { d: `M ${-20 * s} ${6 * s} L ${20 * s} ${6 * s}`, stroke: metalDark, width: 5 * s },

    // wheel A (left) — rim, hub, spokes
    { d: `M ${-16 * s} ${6 * s} m ${-11 * s} 0 a ${11 * s} ${11 * s} 0 1 0 ${22 * s} 0 a ${11 * s} ${11 * s} 0 1 0 ${-22 * s} 0`, fill: wheelRim, stroke: metalDark, width: 1.5 * s },
    { d: `M ${-16 * s} ${-3 * s} L ${-16 * s} ${15 * s} M ${-25 * s} ${6 * s} L ${-7 * s} ${6 * s} M ${-22.4 * s} ${-0.4 * s} L ${-9.6 * s} ${12.4 * s} M ${-22.4 * s} ${12.4 * s} L ${-9.6 * s} ${-0.4 * s}`, stroke: metalDark, width: 1.2 * s },
    { d: `M ${-16 * s} ${6 * s} m ${-3.5 * s} 0 a ${3.5 * s} ${3.5 * s} 0 1 0 ${7 * s} 0 a ${3.5 * s} ${3.5 * s} 0 1 0 ${-7 * s} 0`, fill: wheelHub, stroke: metalDark, width: 1 * s },

    // wheel B (right) — rim, hub, spokes
    { d: `M ${16 * s} ${6 * s} m ${-11 * s} 0 a ${11 * s} ${11 * s} 0 1 0 ${22 * s} 0 a ${11 * s} ${11 * s} 0 1 0 ${-22 * s} 0`, fill: wheelRim, stroke: metalDark, width: 1.5 * s },
    { d: `M ${16 * s} ${-3 * s} L ${16 * s} ${15 * s} M ${7 * s} ${6 * s} L ${25 * s} ${6 * s} M ${9.6 * s} ${-0.4 * s} L ${22.4 * s} ${12.4 * s} M ${9.6 * s} ${12.4 * s} L ${22.4 * s} ${-0.4 * s}`, stroke: metalDark, width: 1.2 * s },
    { d: `M ${16 * s} ${6 * s} m ${-3.5 * s} 0 a ${3.5 * s} ${3.5 * s} 0 1 0 ${7 * s} 0 a ${3.5 * s} ${3.5 * s} 0 1 0 ${-7 * s} 0`, fill: wheelHub, stroke: metalDark, width: 1 * s },

    // gun-carriage block (solid trapezoid, sits above the axle, cradles the barrel's breech)
    { d: `M ${-14 * s} ${2 * s} L ${14 * s} ${2 * s} L ${11 * s} ${-16 * s} L ${-11 * s} ${-16 * s} Z`, fill: wood, stroke: woodDark, width: 1.5 * s },
    // carriage cheek trim line (reads as a plank seam)
    { d: `M ${-9 * s} ${0 * s} L ${8 * s} ${-13 * s}`, stroke: woodDark, width: 1 * s },

    // barrel — tapered tube from breech (lower-right, thick) to muzzle (upper-left, flared ring),
    // drawn as a filled quadrilateral tapering from wide to narrower before the flare.
    { d: `M ${2 * s} ${-10 * s} L ${9 * s} ${-3 * s} L ${-30 * s} ${-32 * s} L ${-24 * s} ${-38 * s} Z`, fill: metal, stroke: metalDark, width: 1.5 * s },
    // barrel top highlight seam
    { d: `M ${4 * s} ${-11.5 * s} L ${-25.5 * s} ${-36.5 * s}`, stroke: "#a9b3ab", width: 1 * s },
    // muzzle flare ring at the barrel's business end
    { d: `M ${-27 * s} ${-35 * s} m ${-5.5 * s} ${-5.5 * s} a ${5.5 * s} ${5.5 * s} 0 1 0 ${11 * s} ${11 * s} a ${5.5 * s} ${5.5 * s} 0 1 0 ${-11 * s} ${-11 * s}`, fill: metalDark, stroke: metal, width: 1.8 * s },
    // muzzle bore (dark inner circle)
    { d: `M ${-27 * s} ${-35 * s} m ${-2.6 * s} 0 a ${2.6 * s} ${2.6 * s} 0 1 0 ${5.2 * s} 0 a ${2.6 * s} ${2.6 * s} 0 1 0 ${-5.2 * s} 0`, fill: "#14171a" },

    // breech cap (small knob at the back of the barrel)
    { d: `M ${9 * s} ${-3 * s} m ${-3 * s} 0 a ${3 * s} ${3 * s} 0 1 0 ${6 * s} 0 a ${3 * s} ${3 * s} 0 1 0 ${-6 * s} 0`, fill: metalDark, stroke: metal, width: 1 * s },
  ];
};

const tree: PropFn = (size, color) => {
  const s = size;
  const trunk = "#5a4632";
  const leaf = color ?? "#3f6b46";
  return [
    { d: `M ${-4 * s} ${20 * s} L ${-3 * s} ${-6 * s} L ${3 * s} ${-6 * s} L ${4 * s} ${20 * s} Z`, fill: trunk, stroke: "#3c2e18", width: 1 * s },
    { d: `M 0 ${-34 * s} m ${-22 * s} 0 a ${22 * s} ${22 * s} 0 1 0 ${44 * s} 0 a ${22 * s} ${22 * s} 0 1 0 ${-44 * s} 0`, fill: leaf, stroke: "#1e3a22", width: 1 * s },
    { d: `M ${-16 * s} ${-10 * s} m ${-13 * s} 0 a ${13 * s} ${13 * s} 0 1 0 ${26 * s} 0 a ${13 * s} ${13 * s} 0 1 0 ${-26 * s} 0`, fill: leaf, stroke: "#1e3a22", width: 1 * s },
    { d: `M ${16 * s} ${-10 * s} m ${-13 * s} 0 a ${13 * s} ${13 * s} 0 1 0 ${26 * s} 0 a ${13 * s} ${13 * s} 0 1 0 ${-26 * s} 0`, fill: leaf, stroke: "#1e3a22", width: 1 * s },
  ];
};

const apple: PropFn = (size, color) => {
  const s = size;
  const body = color ?? "#d1453f";
  return [
    { d: `M 0 ${-2 * s} m ${-13 * s} 0 a ${13 * s} ${13 * s} 0 1 0 ${26 * s} 0 a ${13 * s} ${13 * s} 0 1 0 ${-26 * s} 0`, fill: body, stroke: "#8a2622", width: 1 * s },
    { d: `M 0 ${-15 * s} L ${1.5 * s} ${-22 * s}`, stroke: "#5a4632", width: 2 * s },
    { d: `M ${1.5 * s} ${-21 * s} q ${8 * s} ${-4 * s} ${10 * s} ${2 * s}`, fill: "#3f6b46" },
  ];
};

const planet: PropFn = (size, color) => {
  const s = size;
  const body = color ?? "#5aa0d0";
  return [
    { d: `M 0 0 m ${-18 * s} 0 a ${18 * s} ${18 * s} 0 1 0 ${36 * s} 0 a ${18 * s} ${18 * s} 0 1 0 ${-36 * s} 0`, fill: body, stroke: "#1c3f5c", width: 1 * s },
    { d: `M ${-30 * s} ${4 * s} L ${30 * s} ${-4 * s} L ${30 * s} ${2 * s} L ${-30 * s} ${10 * s} Z`, fill: "#e6ebee", stroke: "#9aa2a7", width: 1 * s },
  ];
};

const arrow: PropFn = (size, color) => {
  const s = size;
  const c = color ?? "#eef5ef";
  return [
    { d: `M ${-24 * s} 0 L ${16 * s} 0`, stroke: c, width: 3 * s },
    { d: `M ${16 * s} 0 L ${6 * s} ${-8 * s} L ${6 * s} ${8 * s} Z`, fill: c },
  ];
};

const star: PropFn = (size, color) => {
  const s = size;
  const c = color ?? "#ffe08a";
  const pts: [number, number][] = [];
  const spikes = 5;
  const outerR = 20 * s;
  const innerR = 8 * s;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const d = `M ${pts[0][0]} ${pts[0][1]} ` + pts.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ") + " Z";
  return [{ d, fill: c, stroke: "#a9803f", width: 1 * s }];
};

/** Neuron cell — a round soma (two-tone shaded membrane) at the origin, 4 tapered dendrites
 *  branching off its upper-left/left/lower-left "listening" side (each forking into two small
 *  twigs near the tip), and a short axon-hillock stub on the right edge where a lesson's own axon
 *  path would continue. `size=1` spans roughly 140px across (soma r=34, dendrite tips out to r=62).
 *  Origin sits at the soma's center, matching PROP_ANCHORS.center/soma below. */
const neuronCell: PropFn = (size, color) => {
  const s = size;
  const somaLight = color ?? "#5cc8ae";
  const somaDark = "#2f7d68";
  const dendrite = "#8fdcc7";
  const axon = "#3f9c85";

  // Each dendrite: [startOnSomaEdge, midBend, tip, forkTwigA, forkTwigB], authored at size=1 then
  // scaled by `s` below. Coordinates computed from the soma edge (r=34) out to tips (r=62) along
  // angles spread across the left hemisphere (145°..230°), matching PROP_ANCHORS.dendriteTip1..4.
  const dendrites: { start: [number, number]; mid: [number, number]; tip: [number, number]; fork1: [number, number]; fork2: [number, number] }[] = [
    { start: [-31.9, -11.6], mid: [-45.9, -14.0], tip: [-58.3, -21.2], fork1: [-70.3, -21.6], fork2: [-67.8, -28.6] }, // dendriteTip1 (~200°)
    { start: [-32.8, 8.8], mid: [-46.8, 10.5], tip: [-59.9, 16.0], fork1: [-70.0, 22.5], fork2: [-71.9, 15.4] },     // dendriteTip2 (~165°)
    { start: [-21.9, -26.0], mid: [-32.4, -35.4], tip: [-39.9, -47.5], fork1: [-50.1, -53.9], fork2: [-44.4, -58.6] }, // dendriteTip3 (~230°)
    { start: [-27.9, 19.5], mid: [-40.7, 25.4], tip: [-50.8, 35.6], fork1: [-58.0, 45.2], fork2: [-62.3, 39.1] },    // dendriteTip4 (~145°)
  ];

  const parts: PropPart[] = [
    // soma — two-tone round cell body (light fill, dark stroke reads as membrane edge)
    { d: `M 0 0 m ${-34 * s} 0 a ${34 * s} ${34 * s} 0 1 0 ${68 * s} 0 a ${34 * s} ${34 * s} 0 1 0 ${-68 * s} 0`, fill: somaLight, stroke: somaDark, width: 2 * s },
    // inner shade lobe (upper-right) for a two-tone shaded-sphere look, like planet/disc
    { d: `M ${-4 * s} ${-26 * s} a ${26 * s} ${26 * s} 0 0 1 ${30 * s} ${30 * s} a ${34 * s} ${34 * s} 0 0 1 ${-30 * s} ${-30 * s} Z`, fill: somaDark },

    // axon hillock stub — short tapered nub on the right edge, where the axon continues
    { d: `M ${30 * s} ${-6 * s} L ${50 * s} ${-3 * s} L ${50 * s} ${3 * s} L ${30 * s} ${6 * s} Z`, fill: axon, stroke: somaDark, width: 1 * s },
  ];

  for (const b of dendrites) {
    const [sx, sy] = b.start;
    const [mx, my] = b.mid;
    const [tx, ty] = b.tip;
    const [f1x, f1y] = b.fork1;
    const [f2x, f2y] = b.fork2;
    // tapered main branch, smoothed via a single quadratic bend through the mid point
    parts.push({ d: `M ${sx * s} ${sy * s} Q ${mx * s} ${my * s} ${tx * s} ${ty * s}`, stroke: dendrite, width: 3.2 * s });
    // two small terminal twigs forking off the tip
    parts.push({ d: `M ${tx * s} ${ty * s} L ${f1x * s} ${f1y * s}`, stroke: dendrite, width: 1.6 * s });
    parts.push({ d: `M ${tx * s} ${ty * s} L ${f2x * s} ${f2y * s}`, stroke: dendrite, width: 1.6 * s });
  }

  return parts;
};

/** Complete neuron — the reusable soma/dendrite artwork above plus an authored axon, four myelin
 *  sheaths, and a three-way terminal arbor. Unlike `neuronCell`, this prop is self-contained and
 *  does not expect the lesson to continue the axon with separate objects. */
const neuronFull: PropFn = (size, color) => {
  const s = size;
  const somaDark = "#2f7d68";
  const axon = "#cfe0e6";
  const myelin = "#d6b36a";
  const myelinDark = "#70542b";
  const parts = neuronCell(size, color);

  parts.push(
    // Nucleus, drawn after the soma shading so the complete prop reads clearly at small sizes.
    { d: `M ${4 * s} ${3 * s} m ${-8 * s} 0 a ${8 * s} ${8 * s} 0 1 0 ${16 * s} 0 a ${8 * s} ${8 * s} 0 1 0 ${-16 * s} 0`, fill: somaDark },
    // Axon continuing directly from the hillock stub to the terminal arbor.
    { d: `M ${50 * s} 0 C ${70 * s} ${-2 * s} ${96 * s} ${2 * s} ${118 * s} 0`, stroke: axon, width: 3.4 * s },
  );

  for (const x of [62, 78, 94, 110]) {
    parts.push({
      d: `M ${x * s} 0 m ${-5.5 * s} 0 a ${5.5 * s} ${9.5 * s} 0 1 0 ${11 * s} 0 a ${5.5 * s} ${9.5 * s} 0 1 0 ${-11 * s} 0`,
      fill: myelin,
      stroke: myelinDark,
      width: 1 * s,
    });
  }

  parts.push(
    { d: `M ${118 * s} 0 C ${124 * s} ${-6 * s} ${129 * s} ${-14 * s} ${134 * s} ${-20 * s}`, stroke: axon, width: 2.4 * s },
    { d: `M ${118 * s} 0 L ${134 * s} 0`, stroke: axon, width: 2.4 * s },
    { d: `M ${118 * s} 0 C ${124 * s} ${6 * s} ${129 * s} ${14 * s} ${134 * s} ${20 * s}`, stroke: axon, width: 2.4 * s },
    { d: `M ${134 * s} ${-20 * s} m ${-2.5 * s} 0 a ${2.5 * s} ${2.5 * s} 0 1 0 ${5 * s} 0 a ${2.5 * s} ${2.5 * s} 0 1 0 ${-5 * s} 0`, fill: axon },
    { d: `M ${134 * s} 0 m ${-2.5 * s} 0 a ${2.5 * s} ${2.5 * s} 0 1 0 ${5 * s} 0 a ${2.5 * s} ${2.5 * s} 0 1 0 ${-5 * s} 0`, fill: axon },
    { d: `M ${134 * s} ${20 * s} m ${-2.5 * s} 0 a ${2.5 * s} ${2.5 * s} 0 1 0 ${5 * s} 0 a ${2.5 * s} ${2.5 * s} 0 1 0 ${-5 * s} 0`, fill: axon },
  );

  return parts;
};

/** Ion channel — membrane ion-channel protein glyph in the closed state: two facing trapezoid
 *  halves (outer/membrane-facing edge wide, inner/pore-facing edge narrow) with a narrow shut pore
 *  gap between them. Origin-centered, ~24px tall at size=1 (top half y:-12..-2, bottom half
 *  y:2..12, pore gap -2..2). `color` tints the protein body. */
const ionChannel: PropFn = (size, color) => {
  const s = size;
  const body = color ?? "#6db0e8";
  const bodyDark = "#2f5f8f";
  const pore = "#1a2f42";
  return [
    // top half — trapezoid, wide outer (membrane) edge narrowing down to the pore lip
    { d: `M ${-16 * s} ${-12 * s} L ${16 * s} ${-12 * s} L ${4 * s} ${-2 * s} L ${-4 * s} ${-2 * s} Z`, fill: body, stroke: bodyDark, width: 1.5 * s },
    // bottom half — mirrored trapezoid
    { d: `M ${-16 * s} ${12 * s} L ${16 * s} ${12 * s} L ${4 * s} ${2 * s} L ${-4 * s} ${2 * s} Z`, fill: body, stroke: bodyDark, width: 1.5 * s },
    // shut pore gap between the two halves (dark, reads as closed)
    { d: `M ${-4 * s} ${-2 * s} L ${4 * s} ${-2 * s} L ${4 * s} ${2 * s} L ${-4 * s} ${2 * s} Z`, fill: pore },
  ];
};

export const PROP_CATALOG: Record<string, PropFn> = {
  cannon,
  tree,
  apple,
  planet,
  arrow,
  star,
  neuronCell,
  neuronFull,
  ionChannel,
  "physics.cannon": cannon,
  "nature.tree": tree,
  "nature.apple": apple,
  "physics.planet": planet,
  "symbols.arrow": arrow,
  "symbols.star": star,
  "biology.neuron.cell": neuronCell,
  "biology.neuron.full": neuronFull,
  "biology.ion-channel": ionChannel,
};

/** Named local anchor points per prop, in the SAME local coordinate space each prop's `d` strings use
 *  above (origin-centered, unscaled — i.e. as if `size=1`). `subAnchors` (./subanchors.ts) scales by
 *  `size`, rotates by `angle` degrees, and translates by the prop's placement point, using the EXACT
 *  same transform `paintProp` (compile.ts) applies when drawing — so e.g. `cannon2.muzzle` resolves to
 *  the drawn muzzle-flare center regardless of the prop's `size`/`angle`. */
export const PROP_ANCHORS: Record<string, Record<string, [number, number]>> = {
  cannon: { muzzle: [-27, -35], breech: [9, -3], wheels: [0, 6], center: [0, 0] },
  tree: { top: [0, -34], trunk: [0, 20], center: [0, 0] },
  apple: { stem: [1.5, -22], center: [0, -2] },
  planet: { center: [0, 0], ring: [30, -4] },
  arrow: { tip: [16, 0], tail: [-24, 0] },
  star: { center: [0, 0] },
  neuronCell: {
    center: [0, 0],
    soma: [0, 0],
    dendriteTip1: [-58.3, -21.2],
    dendriteTip2: [-59.9, 16.0],
    dendriteTip3: [-39.9, -47.5],
    dendriteTip4: [-50.8, 35.6],
    axonRoot: [34, 0],
  },
  neuronFull: {
    center: [0, 0],
    soma: [0, 0],
    dendriteTip1: [-58.3, -21.2],
    dendriteTip2: [-59.9, 16.0],
    dendriteTip3: [-39.9, -47.5],
    dendriteTip4: [-50.8, 35.6],
    axonRoot: [34, 0],
    axonEnd: [118, 0],
    terminalTop: [134, -20],
    terminalMiddle: [134, 0],
    terminalBottom: [134, 20],
  },
  ionChannel: { center: [0, 0], pore: [0, 0], top: [0, -12], bottom: [0, 12] },
};

// Namespaced aliases are the stable identifiers exposed by Simple JSON. The short names remain
// available only for older GCL-authored lessons that use the internal `prop` component directly.
PROP_ANCHORS["physics.cannon"] = PROP_ANCHORS.cannon;
PROP_ANCHORS["nature.tree"] = PROP_ANCHORS.tree;
PROP_ANCHORS["nature.apple"] = PROP_ANCHORS.apple;
PROP_ANCHORS["physics.planet"] = PROP_ANCHORS.planet;
PROP_ANCHORS["symbols.arrow"] = PROP_ANCHORS.arrow;
PROP_ANCHORS["symbols.star"] = PROP_ANCHORS.star;
PROP_ANCHORS["biology.neuron.cell"] = PROP_ANCHORS.neuronCell;
PROP_ANCHORS["biology.neuron.full"] = PROP_ANCHORS.neuronFull;
PROP_ANCHORS["biology.ion-channel"] = PROP_ANCHORS.ionChannel;
