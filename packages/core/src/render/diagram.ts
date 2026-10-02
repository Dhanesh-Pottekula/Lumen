/**
 * diagram — boxes joined by arrows, laid out from what they mean: numbered stages in order, a loop,
 * a hierarchy, or any boxes and arrows. Pure geometry: a figure plan whose pieces are the nodes and
 * the links, so a diagram builds node by node as it is narrated and every node can be pointed at.
 */
import type { Pt } from "./strokes";
import {
  figureTextWidth,
  figureWrap,
  lineHeight,
  textBlock,
  type FigureBox,
  type FigureOp,
  type FigurePalette,
  type FigurePiece,
  type FigurePlan,
} from "./figure";

export interface DiagramNode {
  id: string;
  label: string;
  parent?: string;
  note?: string;
}

export interface DiagramLink {
  from: string;
  to: string;
  label?: string;
  type?: "leads" | "condition" | "trigger" | "prevents";
}

export interface DiagramInput {
  layout: "sequence" | "cycle" | "tree" | "flow";
  nodes: DiagramNode[];
  links?: DiagramLink[];
}

const LABEL = 22;
const NOTE = 18;
const PAD = 14;
const GAP = 40;
const BADGE = 15;
// Narrower than this a node cannot hold a word of 20-unit writing, so a wide tree turns on its side.
const MIN_NODE = 118;

/** The links a diagram draws: its own for a tree or flow; every stage to the next for a sequence or cycle. */
export function diagramLinks(input: DiagramInput): DiagramLink[] {
  const own = input.links ?? [];
  if (input.layout === "tree")
    return input.nodes.flatMap((node) => (node.parent ? [{ from: node.parent, to: node.id, ...own.find((l) => l.from === node.parent && l.to === node.id) }] : []));
  if (input.layout === "flow") return own;
  const chain = input.nodes.slice(0, input.layout === "cycle" ? undefined : -1).map((node, i) => ({ from: node.id, to: input.nodes[(i + 1) % input.nodes.length].id }));
  return chain.map((link) => ({ ...link, ...own.find((l) => l.from === link.from && l.to === link.to) }));
}

export const linkName = (link: { from: string; to: string }): string => `${link.from}-${link.to}`;

interface Laid {
  node: DiagramNode;
  box: FigureBox;
  lines: string[];
  notes: string[];
  order: number;
  badge?: number;
}

function blockHeight(lines: string[], notes: string[]): number {
  return PAD * 2 + lines.length * lineHeight(LABEL) + notes.length * lineHeight(NOTE);
}

function measureNode(node: DiagramNode, width: number) {
  const lines = figureWrap(node.label, LABEL, width - PAD * 2);
  const notes = node.note ? figureWrap(node.note, NOTE, width - PAD * 2) : [];
  return { lines, notes, h: blockHeight(lines, notes) };
}

function depthOf(nodes: DiagramNode[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map<string, number>();
  const walk = (node: DiagramNode, seen: Set<string>): number => {
    if (depth.has(node.id)) return depth.get(node.id)!;
    const parent = node.parent ? byId.get(node.parent) : undefined;
    const d = parent && !seen.has(parent.id) ? walk(parent, new Set([...seen, node.id])) + 1 : 0;
    depth.set(node.id, d);
    return d;
  };
  nodes.forEach((node) => walk(node, new Set()));
  return depth;
}

function flowLayers(input: DiagramInput): Map<string, number> {
  const layer = new Map(input.nodes.map((node) => [node.id, 0]));
  const links = (input.links ?? []).filter((l) => layer.has(l.from) && layer.has(l.to) && l.from !== l.to);
  // Longest path from the sources; a loop stops growing after one pass per node.
  for (let pass = 0; pass < input.nodes.length; pass++) {
    let grew = false;
    for (const link of links) {
      const next = layer.get(link.from)! + 1;
      if (next > layer.get(link.to)! && next < input.nodes.length) {
        layer.set(link.to, next);
        grew = true;
      }
    }
    if (!grew) break;
  }
  // A cause that nothing leads to sits just above what it acts on, so its arrow never runs past boxes.
  for (const node of input.nodes) {
    if (links.some((l) => l.to === node.id)) continue;
    const targets = links.filter((l) => l.from === node.id).map((l) => layer.get(l.to)!);
    if (targets.length) layer.set(node.id, Math.max(layer.get(node.id)!, Math.min(...targets) - 1));
  }
  return layer;
}

/** A flow's nodes a row per layer, each row ordered under the average place of what leads into it, so arrows cross as little as they can. */
function flowRows(input: DiagramInput): DiagramNode[][] {
  const layers = flowLayers(input);
  const count = Math.max(...layers.values()) + 1;
  const rows = Array.from({ length: count }, (_, i) => input.nodes.filter((node) => layers.get(node.id) === i));
  for (let level = 1; level < count; level++) {
    const above = rows.slice(0, level).flatMap((row) => row.map((node, i) => [node.id, (i + 0.5) / row.length] as const));
    const place = new Map(above);
    const weight = (node: DiagramNode) => {
      const from = (input.links ?? []).filter((l) => l.to === node.id && place.has(l.from)).map((l) => place.get(l.from)!);
      return from.length ? from.reduce((a, b) => a + b, 0) / from.length : 0.5;
    };
    rows[level] = [...rows[level]].sort((a, b) => weight(a) - weight(b));
  }
  return rows;
}

function treeLeaves(nodes: DiagramNode[]): Map<string, string[]> {
  const kids = new Map<string, DiagramNode[]>();
  for (const node of nodes) if (node.parent) kids.set(node.parent, [...(kids.get(node.parent) ?? []), node]);
  const leaves = new Map<string, string[]>();
  const collect = (node: DiagramNode, seen: Set<string>): string[] => {
    const children = (kids.get(node.id) ?? []).filter((child) => !seen.has(child.id));
    const own = children.length ? children.flatMap((child) => collect(child, new Set([...seen, child.id]))) : [node.id];
    leaves.set(node.id, own);
    return own;
  };
  nodes.filter((node) => !node.parent || !nodes.some((other) => other.id === node.parent)).forEach((root) => collect(root, new Set([root.id])));
  return leaves;
}

/** Whether a tree is too wide to stand up in `width` — a leaf narrower than its longest word — and is laid on its side instead. */
function treeSideways(input: DiagramInput, width: number): boolean {
  const leaves = treeLeaves(input.nodes);
  const leafCount = Math.max(1, ...[...leaves.values()].map((list) => list.length));
  // Measured as type is set, not as layout pads it: a word a little wide still stands the tree up.
  const longest = Math.max(...input.nodes.flatMap((node) => node.label.split(/\s+/).map((word) => word.length * LABEL * 0.52)));
  return width / leafCount - 12 < Math.max(MIN_NODE, longest + PAD * 2);
}

/** The narrowest a flow can be laid with every node holding its longest word on a line. */
export function flowMinWidth(input: DiagramInput): number {
  const widest = Math.max(...flowRows(input).map((row) => row.length));
  const longest = Math.max(...input.nodes.flatMap((node) => node.label.split(/\s+/).map((word) => figureTextWidth(word, LABEL))));
  return widest * (longest + PAD * 2 + 16);
}

/** How big a diagram wants to be at its most natural, in view units. */
export function diagramSize(input: DiagramInput, maxWidth: number): [number, number] {
  const n = input.nodes.length;
  if (input.layout === "sequence") {
    const width = Math.min(maxWidth, 470);
    const heights = input.nodes.map((node) => measureNode(node, width - BADGE * 2 - 10).h);
    return [width, heights.reduce((a, b) => a + b, 0) + GAP * (n - 1)];
  }
  if (input.layout === "cycle") {
    const side = Math.min(maxWidth, n <= 4 ? 420 : 480);
    return [side, side];
  }
  if (input.layout === "tree") {
    const depth = depthOf(input.nodes);
    const levels = Math.max(...depth.values()) + 1;
    const leaves = treeLeaves(input.nodes);
    const leafCount = Math.max(1, ...[...leaves.values()].map((list) => list.length));
    const width = leafCount >= 3 ? maxWidth : Math.min(maxWidth, Math.max(300, leafCount * 170));
    if (treeSideways(input, width)) {
      const heights = input.nodes.map((node) => measureNode(node, width - 28 * (depth.get(node.id) ?? 0)).h);
      return [width, heights.reduce((a, b) => a + b, 0) + 12 * (n - 1)];
    }
    const rowH = Math.max(...input.nodes.map((node) => measureNode(node, Math.min(240, width / leafCount - 12)).h));
    return [width, levels * rowH + (levels - 1) * 40];
  }
  const rows = flowRows(input);
  const count = rows.length;
  const widest = Math.max(...rows.map((row) => row.length));
  const width = Math.min(maxWidth, Math.max(300, widest * 170, flowMinWidth(input)));
  const rowH = Math.max(...input.nodes.map((node) => measureNode(node, Math.min(240, width / widest - 16)).h));
  return [width, count * rowH + (count - 1) * 58];
}

function nodeOps(laid: Laid, palette: FigurePalette): FigureOp[] {
  const { box } = laid;
  const ops: FigureOp[] = [
    { op: "rect", x: box.x, y: box.y, w: box.w, h: box.h, radius: 10, fill: palette.surface, stroke: palette.muted, width: 2, t: [0, 0.5] },
  ];
  if (laid.badge !== undefined) {
    const bx = box.x - BADGE - 10;
    const by = box.y + box.h / 2;
    ops.push({ op: "dot", x: bx, y: by, r: BADGE, fill: palette.accent, t: [0, 0.4] });
    ops.push({ op: "text", x: bx, y: by, text: String(laid.badge), size: LABEL, weight: 700, color: palette.bg, under: palette.accent, t: [0.2, 0.5] });
  }
  const labelTop = box.y + PAD;
  ops.push(...textBlock(laid.lines, box.x + box.w / 2, labelTop, LABEL, palette.ink, { align: "center", weight: 600, under: palette.surface, t: [0.35, 0.8] }));
  ops.push(
    ...textBlock(laid.notes, box.x + box.w / 2, labelTop + laid.lines.length * lineHeight(LABEL), NOTE, palette.muted, { align: "center", under: palette.surface, t: [0.5, 1] }),
  );
  return ops;
}

/** Where the straight run from a box's centre toward `toward` leaves the box, `gap` beyond its edge. */
function edgePoint(box: FigureBox, toward: Pt, gap = 6): Pt {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  const reach = Math.min(Math.abs(dx) < 1e-6 ? Infinity : (box.w / 2 + gap) / Math.abs(dx), Math.abs(dy) < 1e-6 ? Infinity : (box.h / 2 + gap) / Math.abs(dy));
  return Number.isFinite(reach) ? [cx + dx * reach, cy + dy * reach] : [cx, cy];
}

const inside = (box: FigureBox, [x, y]: Pt, gap: number) => x > box.x - gap && x < box.x + box.w + gap && y > box.y - gap && y < box.y + box.h + gap;

function linkOps(link: DiagramLink, pts: Pt[], palette: FigurePalette, headed: boolean): FigureOp[] {
  const style = {
    leads: { color: palette.ink, width: 2.5, dash: undefined },
    condition: { color: palette.muted, width: 2, dash: [7, 6] },
    trigger: { color: palette.accent, width: 4.5, dash: undefined },
    prevents: { color: palette.danger, width: 2.5, dash: undefined },
  }[link.type ?? "leads"];
  const ops: FigureOp[] = [{ op: "line", pts, color: style.color, width: style.width, dash: style.dash, arrow: link.type === "prevents" || !headed ? undefined : "end" }];
  if (link.type === "prevents") {
    const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [(-(b[1] - a[1]) / length) * 10, ((b[0] - a[0]) / length) * 10];
    ops.push({ op: "line", pts: [[b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], color: style.color, width: 4, t: [0.85, 1] });
  }
  if (link.label) {
    const mid = pts[Math.floor((pts.length - 1) / 2)];
    const next = pts[Math.floor((pts.length - 1) / 2) + 1] ?? mid;
    const [mx, my] = [(mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2];
    const w = link.label.length * NOTE * 0.56 + 14;
    ops.push({ op: "rect", x: mx - w / 2, y: my - 13, w, h: 26, radius: 13, fill: palette.bg, t: [0.5, 0.8] });
    ops.push({ op: "text", x: mx, y: my, text: link.label, size: NOTE, weight: 600, color: style.color === palette.muted ? palette.ink : style.color, t: [0.55, 1] });
  }
  return ops;
}

function boundsOf(pts: Pt[]): FigureBox {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x: x - 4, y: y - 4, w: Math.max(...xs) - x + 8, h: Math.max(...ys) - y + 8 };
}

function laySequence(input: DiagramInput, w: number, h: number): Laid[] {
  const width = w - BADGE * 2 - 10;
  const measured = input.nodes.map((node) => measureNode(node, width));
  const total = measured.reduce((a, m) => a + m.h, 0);
  const gap = input.nodes.length > 1 ? Math.max(24, Math.min(GAP + 30, (h - total) / (input.nodes.length - 1))) : 0;
  let y = -(total + gap * (input.nodes.length - 1)) / 2;
  return input.nodes.map((node, i) => {
    const box = { x: -w / 2 + BADGE * 2 + 10, y, w: width, h: measured[i].h };
    y += measured[i].h + gap;
    return { node, box, lines: measured[i].lines, notes: measured[i].notes, order: i, badge: i + 1 };
  });
}

/** A cycle's node width and the ellipse its node centres sit on. */
function cycleRing(input: DiagramInput, w: number, h: number) {
  const width = Math.min(170, w * (input.nodes.length <= 4 ? 0.4 : 0.34));
  const measured = input.nodes.map((node) => measureNode(node, width));
  const tallest = Math.max(...measured.map((m) => m.h));
  return { width, measured, rx: Math.max(40, (w - width) / 2 - 2), ry: Math.max(40, (h - tallest) / 2 - 2) };
}

function layCycle(input: DiagramInput, w: number, h: number): Laid[] {
  const n = input.nodes.length;
  const { width, measured, rx, ry } = cycleRing(input, w, h);
  return input.nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / n;
    const [cx, cy] = [rx * Math.cos(angle), ry * Math.sin(angle)];
    const m = measured[i];
    return { node, box: { x: cx - width / 2, y: cy - m.h / 2, w: width, h: m.h }, lines: m.lines, notes: m.notes, order: i };
  });
}

function layTree(input: DiagramInput, w: number, h: number): Laid[] {
  const depth = depthOf(input.nodes);
  const leaves = treeLeaves(input.nodes);
  const leafOrder = [...new Set([...leaves.values()].flat())];
  const slot = w / Math.max(1, leafOrder.length);
  const order = (node: DiagramNode) => (depth.get(node.id) ?? 0) * 100 + input.nodes.indexOf(node);
  if (treeSideways(input, w)) {
    // On its side: one node a row, indented under its parent, in depth-first order.
    const kids = (id: string | undefined) => input.nodes.filter((node) => (id === undefined ? !node.parent || !input.nodes.some((o) => o.id === node.parent) : node.parent === id));
    const rows: DiagramNode[] = [];
    const visit = (node: DiagramNode) => {
      if (rows.includes(node)) return;
      rows.push(node);
      kids(node.id).forEach(visit);
    };
    kids(undefined).forEach(visit);
    input.nodes.forEach(visit);
    const room = (node: DiagramNode) => w - 28 * (depth.get(node.id) ?? 0);
    const snug = (node: DiagramNode) => Math.min(room(node), Math.max(160, figureTextWidth(node.label, LABEL) + PAD * 2));
    const measured = rows.map((node) => measureNode(node, snug(node)));
    const total = measured.reduce((a, m) => a + m.h, 0);
    const gap = rows.length > 1 ? Math.max(10, Math.min(20, (h - total) / (rows.length - 1))) : 0;
    let y = -(total + gap * (rows.length - 1)) / 2;
    // The indented column is centred in its box; set from the left edge it left the right half empty.
    const reach = Math.max(...rows.map((node) => 28 * (depth.get(node.id) ?? 0) + snug(node)));
    const left = -reach / 2;
    return rows.map((node, i) => {
      const indent = 28 * (depth.get(node.id) ?? 0);
      const box = { x: left + indent, y, w: snug(node), h: measured[i].h };
      y += measured[i].h + gap;
      return { node, box, lines: measured[i].lines, notes: measured[i].notes, order: order(node) };
    });
  }
  const levels = Math.max(...depth.values()) + 1;
  const widthOf = (node: DiagramNode) => Math.min(240, (leaves.get(node.id)?.length ?? 1) * slot - 12);
  const measured = new Map(input.nodes.map((node) => [node.id, measureNode(node, widthOf(node))]));
  const rowH = Math.max(...[...measured.values()].map((m) => m.h));
  const gap = levels > 1 ? Math.max(28, Math.min(60, (h - levels * rowH) / (levels - 1))) : 0;
  const top = -(levels * rowH + (levels - 1) * gap) / 2;
  return input.nodes.map((node) => {
    const mine = leaves.get(node.id) ?? [node.id];
    const slots = mine.map((leaf) => leafOrder.indexOf(leaf)).filter((i) => i >= 0);
    const cx = -w / 2 + slot * ((Math.min(...slots) + Math.max(...slots)) / 2 + 0.5);
    const m = measured.get(node.id)!;
    const width = widthOf(node);
    const d = depth.get(node.id) ?? 0;
    return { node, box: { x: cx - width / 2, y: top + d * (rowH + gap) + (rowH - m.h) / 2, w: width, h: m.h }, lines: m.lines, notes: m.notes, order: order(node) };
  });
}

function layFlow(input: DiagramInput, w: number, h: number): Laid[] {
  const rows = flowRows(input);
  const count = rows.length;
  const widest = Math.max(...rows.map((row) => row.length));
  const width = Math.min(240, w / widest - 16);
  const measured = new Map(input.nodes.map((node) => [node.id, measureNode(node, width)]));
  const rowH = Math.max(...[...measured.values()].map((m) => m.h));
  const gap = count > 1 ? Math.max(44, Math.min(80, (h - count * rowH) / (count - 1))) : 0;
  const top = -(count * rowH + (count - 1) * gap) / 2;
  return rows.flatMap((row, level) =>
    row.map((node, i) => {
      const cx = -w / 2 + (w / row.length) * (i + 0.5);
      const m = measured.get(node.id)!;
      return { node, box: { x: cx - width / 2, y: top + level * (rowH + gap) + (rowH - m.h) / 2, w: width, h: m.h }, lines: m.lines, notes: m.notes, order: level * 100 + i };
    }),
  );
}

function linkRoute(input: DiagramInput, from: Laid, to: Laid, w: number, h: number, sideways: boolean): Pt[] {
  const fc: Pt = [from.box.x + from.box.w / 2, from.box.y + from.box.h / 2];
  const tc: Pt = [to.box.x + to.box.w / 2, to.box.y + to.box.h / 2];
  if (input.layout === "cycle") {
    // Round the loop, on the ellipse through the node centres, from where it leaves one node to where it meets the next.
    const { rx, ry } = cycleRing(input, w, h);
    const a0 = Math.atan2(fc[1] / ry, fc[0] / rx);
    let a1 = Math.atan2(tc[1] / ry, tc[0] / rx);
    while (a1 <= a0) a1 += Math.PI * 2;
    const pts: Pt[] = [];
    for (let k = 0; k <= 48; k++) {
      const a = a0 + ((a1 - a0) * k) / 48;
      const pt: Pt = [rx * Math.cos(a), ry * Math.sin(a)];
      if (!inside(from.box, pt, 8) && !inside(to.box, pt, 10)) pts.push(pt);
    }
    return pts.length >= 2 ? pts : [edgePoint(from.box, tc), edgePoint(to.box, fc)];
  }
  if (input.layout === "tree") {
    if (sideways) {
      const x = from.box.x + 14;
      return [[x, from.box.y + from.box.h], [x, tc[1]], [to.box.x - 2, tc[1]]];
    }
    const [x0, y0] = [fc[0], from.box.y + from.box.h];
    const [x1, y1] = [tc[0], to.box.y];
    const mid = (y0 + y1) / 2;
    return Math.abs(x1 - x0) < 1 ? [[x0, y0], [x1, y1 - 4]] : [[x0, y0], [x0, mid], [x1, mid], [x1, y1 - 4]];
  }
  if (input.layout === "sequence") return [[fc[0], from.box.y + from.box.h + 5], [tc[0], to.box.y - 6]];
  // A link back up the flow runs round the right-hand side, clear of the boxes between.
  if (to.box.y + to.box.h < from.box.y) {
    const x = Math.min(w / 2 - 4, Math.max(from.box.x + from.box.w, to.box.x + to.box.w) + 16);
    return [[from.box.x + from.box.w + 4, fc[1]], [x, fc[1]], [x, tc[1]], [to.box.x + to.box.w + 6, tc[1]]];
  }
  return [edgePoint(from.box, tc, 4), edgePoint(to.box, fc)];
}

/** A diagram laid out in a `w` × `h` box about its centre. */
export function planDiagram(input: DiagramInput, w: number, h: number, palette: FigurePalette): FigurePlan {
  const laid =
    input.layout === "sequence" ? laySequence(input, w, h) : input.layout === "cycle" ? layCycle(input, w, h) : input.layout === "tree" ? layTree(input, w, h) : layFlow(input, w, h);
  const byId = new Map(laid.map((one) => [one.node.id, one]));
  const pieces: FigurePiece[] = laid.map((one) => ({ name: one.node.id, box: one.box, ops: nodeOps(one, palette), order: one.order }));
  for (const link of diagramLinks(input)) {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) continue;
    const pts = linkRoute(input, from, to, w, h, input.layout === "tree" && treeSideways(input, w));
    // The arrow draws in just before the thing it points at, so a stage arrives as the arrow reaches it.
    pieces.push({ name: linkName(link), box: boundsOf(pts), ops: linkOps(link, pts, palette, input.layout !== "tree" || link.type !== undefined), order: to.order - 0.5, follows: to.node.id });
  }
  return { ops: [], pieces };
}
