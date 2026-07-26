// src/gcl/layout.ts
/** Pure auto-placement engine: measures every component then flows/anchors it into view space. */
import type { Box } from "./anchors";
import { resolvePosition } from "./anchors";
import { measureComponent } from "./measure";
import { subAnchors } from "./subanchors";
import type { Component, DrawComponent, Position, Vec2 } from "./schema";

export interface Placement { index: number; cx: number; cy: number; w: number; h: number }
export interface LayoutResult { placements: Placement[]; boxes: Map<string, Box> }

const GAP = 18;
const TITLE_Y = 70;
const WIDE_FRACTION = 0.5;

function isTitleText(c: DrawComponent): boolean {
  return (c.type === "text" && c.role === "title") || c.type === "heading";
}

function hasExplicitAt(c: DrawComponent): boolean {
  return c.at !== undefined;
}

/** True when `at` is an id-reference (not a slot name or [x,y] coord) — resolved in a second pass. */
function isIdAnchor(at: Position | undefined): at is string {
  return typeof at === "string";
}

/** Auto-lay-out (and id-anchor) every component in a scene. Pure function of its inputs. Camera
 *  directives are excluded from this list (and its auto-flow) by the caller — see compile.ts. */
export function layoutScene(components: DrawComponent[], viewW: number, viewH: number, geo?: (pos: Position) => Vec2 | null): LayoutResult {
  const sizes = components.map(measureComponent);
  const boxes = new Map<string, Box>();
  const placements: Placement[] = components.map((_c, i) => ({ index: i, cx: 0, cy: 0, w: sizes[i].w, h: sizes[i].h }));

  const anchoredIdx: number[] = [];
  const autoIdx: number[] = [];
  components.forEach((c, i) => (hasExplicitAt(c) ? anchoredIdx : autoIdx).push(i));

  // Pass 1: anchored components with a coord/slot position (id-anchors need boxes to exist first;
  // resolve them with a view-center fallback for now and fix up in the second pass below).
  const emptyBoxes = new Map<string, Box>();
  for (const i of anchoredIdx) {
    const c = components[i];
    // Defer true id-anchors to pass 3 — but a string the geo resolver recognizes (a place/region/
    // feature name) is NOT an id-anchor, so resolve it here.
    if (isIdAnchor(c.at) && !(geo && geo(c.at))) continue;
    const [cx, cy] = resolvePosition(c.at, { viewW, viewH, boxes: emptyBoxes, geo });
    placements[i].cx = cx;
    placements[i].cy = cy;
  }

  // Pass 2: auto-flow. Title-role text pins to the top band; everything else stacks centered in
  // the middle band. A single wide component (chart/map/timeline wider than half the view) centers alone.
  const titleAuto = autoIdx.filter((i) => isTitleText(components[i]));
  const restAuto = autoIdx.filter((i) => !isTitleText(components[i]));

  for (const i of titleAuto) {
    placements[i].cx = viewW / 2;
    placements[i].cy = TITLE_Y;
  }

  const wideAuto = restAuto.filter((i) => sizes[i].w > viewW * WIDE_FRACTION);
  const stackAuto = restAuto.filter((i) => !wideAuto.includes(i));

  // Wide components each get their own centered row, stacked in encounter order after any stacked group.
  const stackHeight = stackAuto.reduce((s, i) => s + sizes[i].h, 0) + Math.max(0, stackAuto.length - 1) * GAP;
  const middleTop = viewH / 2 - stackHeight / 2;
  let cursorY = middleTop;
  for (const i of stackAuto) {
    placements[i].cx = viewW / 2;
    placements[i].cy = cursorY + sizes[i].h / 2;
    cursorY += sizes[i].h + GAP;
  }
  // Wide components: center each on the view, stacked below the auto group (or centered alone if none).
  let wideY = stackAuto.length > 0 ? cursorY : viewH / 2 - (wideAuto.reduce((s, i) => s + sizes[i].h, 0) + Math.max(0, wideAuto.length - 1) * GAP) / 2;
  for (const i of wideAuto) {
    placements[i].cx = viewW / 2;
    placements[i].cy = wideY + sizes[i].h / 2;
    wideY += sizes[i].h + GAP;
  }

  // Build the id → box map from every placement computed so far, and — for components with an id —
  // also register their sub-anchors ("<id>.<handle>" → a tiny Box at that point) so the EXISTING
  // resolver (resolvePosition/attnGeom) can target a chart's peak, a map's region, etc. with zero new
  // plumbing. See ./subanchors.ts.
  components.forEach((c, i) => {
    if (!c.id) return;
    const p = placements[i];
    const box = { x: p.cx - p.w / 2, y: p.cy - p.h / 2, w: p.w, h: p.h };
    boxes.set(c.id, box);
    registerSubAnchors(c.id, c, box, boxes);
  });

  // Pass 3: re-resolve anchored components whose `at` is an id, now that boxes exist.
  for (const i of anchoredIdx) {
    const c = components[i];
    if (!isIdAnchor(c.at) || (geo && geo(c.at))) continue; // geo names already resolved in pass 1
    const [cx, cy] = resolvePosition(c.at, { viewW, viewH, boxes });
    placements[i].cx = cx;
    placements[i].cy = cy;
    if (c.id) {
      const box = { x: cx - placements[i].w / 2, y: cy - placements[i].h / 2, w: placements[i].w, h: placements[i].h };
      boxes.set(c.id, box);
      registerSubAnchors(c.id, c, box, boxes);
    }
  }

  return { placements, boxes };
}

// Sub-anchor boxes are tiny (a point, not a measured region) but non-zero: attnGeom derives a
// highlight/spotlight/pointer radius from `hypot(w,h)/2`, so a literal 0×0 box would render
// zero-radius indicators. SUB_ANCHOR_SIZE keeps that math giving a small, sensible default (a
// component's own explicit `radius` on the attention item still overrides this, same as any target).
const SUB_ANCHOR_SIZE = 32;

/** Register a component's published sub-anchors ("<id>.<handle>" → a tiny Box centered at that
 *  point) into the shared `boxes` map, so `target:"chart1.peak"` / `motion.to:"map1.persia"` /
 *  `callout target:"shape1.top"` resolve through the EXISTING id-anchor path (resolvePosition/
 *  attnGeom) with no new plumbing. Only meaningful for components with an id (subAnchors itself is
 *  pure/ctx-free — see ./subanchors.ts). */
function registerSubAnchors(id: string, c: DrawComponent, box: Box, boxes: Map<string, Box>): void {
  const anchors = subAnchors(c, box);
  for (const [handle, [px, py]] of Object.entries(anchors)) {
    boxes.set(`${id}.${handle}`, { x: px - SUB_ANCHOR_SIZE / 2, y: py - SUB_ANCHOR_SIZE / 2, w: SUB_ANCHOR_SIZE, h: SUB_ANCHOR_SIZE });
  }
}

const GROUP_GAP = 18;

/**
 * Arrange a group's children (row/stack/grid) inside `groupBox`, returning per-child placements in
 * ABSOLUTE view coords (not group-local). Pure function of its inputs — no ctx, no clock; used both
 * by `measure.ts` (to size a group from its children, against a nominal box) and `compile.ts`'s
 * `renderGroup` (against the group's real resolved box).
 *   - stack (default): a vertical column, each child centered on `groupBox`'s center x.
 *   - row: a horizontal row, each child centered on `groupBox`'s center y.
 *   - grid: `cols` columns (default 2), wrapping row-major; each cell sized to the row/column's max
 *     child extent so cells stay aligned even when children differ in size.
 * `measureComponent` recurses into nested groups (a group child may itself be a group).
 */
export function layoutGroup(
  children: Component[],
  groupBox: Box,
  opts: { layout?: "row" | "stack" | "grid"; gap?: number; cols?: number },
): Placement[] {
  const gap = opts.gap ?? GROUP_GAP;
  const mode = opts.layout ?? "stack";
  const cx = groupBox.x + groupBox.w / 2;
  const cy = groupBox.y + groupBox.h / 2;

  // Children that are directives (camera/attention) never reach a group's `children` in practice —
  // measureComponent only accepts DrawComponent-shaped input — but guard defensively so a malformed
  // authored group degrades gracefully rather than throwing.
  const drawKids = children.filter((c): c is DrawComponent => c.type !== "camera" && c.type !== "attention");
  const sizes = drawKids.map(measureComponent);

  if (drawKids.length === 0) return [];

  if (mode === "row") {
    const totalW = sizes.reduce((s, sz) => s + sz.w, 0) + gap * Math.max(0, sizes.length - 1);
    let x = cx - totalW / 2;
    return sizes.map((sz, i) => {
      const p: Placement = { index: i, cx: x + sz.w / 2, cy, w: sz.w, h: sz.h };
      x += sz.w + gap;
      return p;
    });
  }

  if (mode === "grid") {
    const cols = Math.max(1, opts.cols ?? 2);
    const rows = Math.ceil(sizes.length / cols);
    // Column widths / row heights = the max extent of any child in that column/row, so cells stay
    // aligned even when children differ in size.
    const colW = new Array(cols).fill(0);
    const rowH = new Array(rows).fill(0);
    sizes.forEach((sz, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      colW[col] = Math.max(colW[col], sz.w);
      rowH[row] = Math.max(rowH[row], sz.h);
    });
    const totalW = colW.reduce((s, w) => s + w, 0) + gap * Math.max(0, cols - 1);
    const totalH = rowH.reduce((s, h) => s + h, 0) + gap * Math.max(0, rows - 1);
    const left = cx - totalW / 2;
    const top = cy - totalH / 2;
    // Cumulative column x / row y offsets (cell top-left), from the per-column/row extents above.
    const colX: number[] = [];
    let accX = left;
    for (let c = 0; c < cols; c++) { colX.push(accX); accX += colW[c] + gap; }
    const rowY: number[] = [];
    let accY = top;
    for (let r = 0; r < rows; r++) { rowY.push(accY); accY += rowH[r] + gap; }

    return sizes.map((sz, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        index: i,
        cx: colX[col] + colW[col] / 2,
        cy: rowY[row] + rowH[row] / 2,
        w: sz.w,
        h: sz.h,
      };
    });
  }

  // stack (default): vertical column, centered on groupBox center x.
  const totalH = sizes.reduce((s, sz) => s + sz.h, 0) + gap * Math.max(0, sizes.length - 1);
  let y = cy - totalH / 2;
  return sizes.map((sz, i) => {
    const p: Placement = { index: i, cx, cy: y + sz.h / 2, w: sz.w, h: sz.h };
    y += sz.h + gap;
    return p;
  });
}
