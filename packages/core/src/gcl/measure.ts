// src/gcl/measure.ts
/** Pure, ctx-free component sizing so layout can run identically in vitest/node and the browser. */
import { measureMath } from "../render/mathtext";
// Circular ESM import: layout.ts imports `measureComponent` from here, and `groupSize` (below) needs
// `layoutGroup` to size a group's children. Legal in ESM as long as neither side calls into the other
// at module-eval time — both here only call it from inside a function body, well after both modules
// have finished initializing.
import { layoutGroup } from "./layout";
import type { Component, DrawComponent, Vec2 } from "./schema";

export interface Size { w: number; h: number }

const ROLE_SIZE: Record<NonNullable<Extract<Component, { type: "text" }>["role"]>, number> = {
  title: 30,
  body: 20,
  bullet: 18,
  caption: 14,
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

function roleSize(role: Extract<Component, { type: "text" }>["role"]): number {
  return ROLE_SIZE[role ?? "body"];
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
    case "text": {
      const fontPx = c.size ?? roleSize(c.role);
      return { w: estimateTextWidth(c.text, fontPx), h: fontPx * 1.3 };
    }
    case "heading": {
      const fontPx = c.size ?? ROLE_SIZE.title;
      return { w: estimateTextWidth(c.text, fontPx), h: fontPx * 1.3 };
    }
    case "stat": {
      const size = c.size ?? 44;
      return { w: estimateTextWidth(String(c.value) + (c.unit ?? ""), size), h: size * 1.5 };
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
      return groupSize(c);
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
