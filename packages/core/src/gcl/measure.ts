// src/gcl/measure.ts
/** Pure, ctx-free component sizing so layout can run identically in vitest/node and the browser. */
import { measureMath } from "../render/mathtext";
import { formatNumber } from "../render/type-motion";
import { MIN_TEXT } from "./viewport";
// Circular ESM import: layout.ts imports `measureComponent` from here, and `groupSize` (below) needs
// `layoutGroup` to size a group's children. Legal in ESM as long as neither side calls into the other
// at module-eval time — both here only call it from inside a function body, well after both modules
// have finished initializing.
import { layoutGroup } from "./layout";
import type { Component, DrawComponent, Vec2 } from "./schema";

export interface Size { w: number; h: number }

/** A measure's unit as the painter writes it after the digits: a sign hugs them, a word stands apart. */
export function measureSuffix(unit: string | undefined): string {
  if (!unit) return "";
  return /^[%+°‰]/.test(unit) ? unit : ` ${unit}`;
}

const ROLE_SIZE: Record<NonNullable<Extract<Component, { type: "text" }>["role"]>, number> = {
  body: 20,
  bullet: 18,
  caption: MIN_TEXT,
};

/**
 * Analytic text width estimate (ctx-free). Uppercase/bold display text runs ≈0.62–0.64× font size per
 * glyph (measured against -apple-system); lowercase is narrower. We deliberately estimate on the HIGH
 * side (0.62 × size + one em of slack) because this box also drives masked entrances (wipe/iris/…):
 * an over-estimate just reveals a little empty margin, but an UNDER-estimate permanently clips the
 * glyphs at both ends. Erring wide keeps text fully on-screen; auto-layout spacing loosens slightly.
 */
export function estimateTextWidth(text: string, fontPx: number): number {
  return text.length * fontPx * 0.62 + fontPx;
}

/**
 * Break writing into lines no wider than `maxWidth` at `fontPx`, whole words only, keeping the
 * writer's own line breaks. Layout, measurement and painting all break here, so a box always holds
 * exactly the lines drawn in it.
 */
export function wrapLines(text: string, fontPx: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const longer = line ? `${line} ${word}` : word;
      if (line && estimateTextWidth(longer, fontPx) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = longer;
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [text];
}

/** The widest of a text's lines and the height they stack to. */
export function measureLines(text: string, fontPx: number): Size {
  const lines = text.split("\n");
  return { w: Math.max(...lines.map((line) => estimateTextWidth(line, fontPx))), h: fontPx * 1.3 * lines.length };
}

function roleSize(role: Extract<Component, { type: "text" }>["role"]): number {
  return ROLE_SIZE[role ?? "body"];
}

/**
 * The box a component drawn at absolute view points covers — a path shape, a text path, a group made
 * only of them — or undefined for one drawn about the point it is placed at. Such a thing is where its
 * points are, so it is laid out there: centred on its `at` instead, a corner's arc sat mostly outside
 * the box every highlight, camera move and label read it by.
 */
export function absoluteBox(c: DrawComponent): { x: number; y: number; w: number; h: number } | undefined {
  const points = c.type === "shape" && c.shape === "path" ? c.points : c.type === "textPath" ? c.path : undefined;
  if (points?.length) {
    const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
    const [x, y] = [Math.min(...xs), Math.min(...ys)];
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (c.type !== "group") return undefined;
  const kids = c.children.filter((k): k is DrawComponent => k.type !== "camera" && k.type !== "attention").map(absoluteBox);
  if (kids.length === 0 || kids.some((kid) => kid === undefined)) return undefined;
  const boxes = kids as { x: number; y: number; w: number; h: number }[];
  const [x, y] = [Math.min(...boxes.map((b) => b.x)), Math.min(...boxes.map((b) => b.y))];
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

function bboxOf(points: Vec2[]): Size {
  if (points.length === 0) return { w: 0, h: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { w: maxX - minX, h: maxY - minY };
}

/** Size a component (pure function of its authored fields). Camera directives never reach here —
 *  compile.ts splits them out before layout runs. */
export function measureComponent(c: DrawComponent): Size {
  switch (c.type) {
    case "text":
      return measureLines(c.text, c.size ?? roleSize(c.role));
    case "measure": {
      const size = c.size ?? 44;
      // The readout as the painter writes it: sized from the raw value, "almost 1 day" was boxed as "0.97day" and its wipe cut both ends off.
      const readout = formatNumber(c.value, { commas: c.commas ?? true, decimals: c.decimals, prefix: c.prefix, suffix: measureSuffix(c.unit) });
      const digits = Math.max(estimateTextWidth(readout, size), c.label ? estimateTextWidth(c.label, MIN_TEXT) : 0);
      if (!c.scale) return { w: digits, h: size * 1.5 };
      if (c.meter === "ring") return { w: size * 3.2, h: size * 3.2 };

      return { w: Math.max(digits, size * 4.5), h: size * 1.5 + size * 0.62 + (c.label ? MIN_TEXT * 1.3 : 0) };
    }
    case "equation": {
      const m = measureMath(c.tex, c.size ?? 30);
      return { w: m.w, h: m.h };
    }
    case "icon": {
      const s = c.size ?? 28;
      return { w: s, h: s };
    }
    case "legend":
      return { w: 160, h: c.categories.length * (c.rowH ?? 20) };
    case "chart":
      return { w: c.w ?? 360, h: c.h ?? 220 };
    case "shape": {
      if (c.shape === "path") return bboxOf(c.points ?? []);
      const r = c.r ?? 60;
      return { w: r * 2, h: r * 2 };
    }
    case "parametric":
      return { w: 300, h: 220 };
    case "image":
      return { w: c.w, h: c.h };
    case "vector":
      return { w: c.w ?? 100, h: c.h ?? 100 };
    case "svg":
    case "region":
    case "figure":
      return { w: c.w, h: c.h };
    case "prop":
      return { w: c.w ?? (c.size ?? 1) * 70, h: c.h ?? (c.size ?? 1) * 70 };
    case "map":
      return { w: c.w ?? 520, h: c.h ?? 300 };
    case "timeline":
      return { w: c.w ?? 720, h: c.h ?? 120 };
    case "table":
      return { w: c.w ?? 420, h: c.rows.length * (c.rowH ?? 34) };
    case "textPath":
      return bboxOf(c.path);
    case "particles":
      // Atmosphere — no measured footprint of its own (it emits onto the fx layer at a resolved
      // anchor point); a zero-size box keeps it out of the auto-flow stack/gap math.
      return { w: 0, h: 0 };
    case "flow":
      // Stream between two anchors — likewise no footprint for layout purposes.
      return { w: 0, h: 0 };
    case "glow":
      // Sized by `r` (radius) but purely additive atmosphere; keep it out of auto-flow like particles.
      return { w: 0, h: 0 };
    case "group": {
      // A group's own footprint is the bounding box of its laid-out children — measured recursively
      // (a group's children may themselves be groups). See layout.ts's `layoutGroup`.
      const drawn = absoluteBox(c);
      return drawn ? { w: drawn.w, h: drawn.h } : groupSize(c);
    }
    default: {
      // Exhaustiveness guard: TS will flag this if a new Component variant is added without a case.
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

/** Bounding box of a group's children once arranged (row/stack/grid), in group-local units — used
 *  only to size the group itself for layout purposes (the group's own placement/anchor is resolved
 *  separately by `layoutScene`, same as any other component). */
function groupSize(c: Extract<Component, { type: "group" }>): Size {
  const kids = c.children.filter((k): k is DrawComponent => k.type !== "camera" && k.type !== "attention");
  if (kids.length === 0) return { w: 0, h: 0 };
  // Measure against a generous nominal box; layoutGroup only uses groupBox for centering, and we only
  // need the resulting placements' bbox extents (relative spread), not the absolute group position.
  const nominal = { x: 0, y: 0, w: 2000, h: 2000 };
  const placements = layoutGroup(kids, nominal, c);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of placements) {
    minX = Math.min(minX, p.cx - p.w / 2);
    maxX = Math.max(maxX, p.cx + p.w / 2);
    minY = Math.min(minY, p.cy - p.h / 2);
    maxY = Math.max(maxY, p.cy + p.h / 2);
  }
  return { w: maxX - minX, h: maxY - minY };
}
