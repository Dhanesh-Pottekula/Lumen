// src/gcl/mask.ts
/**
 * Pure per-component mask geometry, in ABSOLUTE view coordinates. Every function here is a pure
 * function of (box, p, opts) — no wall-clock, no mutable state — so entrances/exits built on top
 * stay deterministic and exactly re-seekable. `maskRects` returns the filled rectangles that make
 * up the revealed region for the rect-based kinds (wipe/blinds/checkerboard/dissolve); the
 * path-based kinds (iris/radialWipe/clip) return `[]` from `maskRects` and are painted directly by
 * `paintMask` instead (a rect list can't describe a circle/sector/polygon).
 */
import { clamp01, prng } from "../slides/anim";
import type { Box } from "./anchors";

export type MaskKind = "wipe" | "iris" | "radialWipe" | "blinds" | "checkerboard" | "dissolve" | "clip";

export interface MaskOpts {
  dir?: "left" | "right" | "up" | "down";
  count?: number;
  seed?: number;
  points?: [number, number][];
  shape?: "circle" | "ellipse" | "rect" | "diamond";
}

const CHECKER_ROWS = 4;
const CHECKER_COLS = 6;

/** Stable shuffled reveal order for dissolve: a permutation of cell indices, seeded. Pure. */
function dissolveOrder(total: number, seed: number): number[] {
  const rnd = prng(seed);
  const order = Array.from({ length: total }, (_, i) => i);
  // Fisher-Yates using the seeded prng — deterministic for a given seed.
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Returns the list of filled rectangles (absolute view coords) that make up the revealed region
 *  at progress `p`. For iris/radialWipe/clip, returns [] — see `paintMask`'s path branch. */
export function maskRects(kind: MaskKind, box: Box, p: number, opts: MaskOpts = {}): [number, number, number, number][] {
  const P = clamp01(p);
  switch (kind) {
    case "wipe": {
      const dir = opts.dir ?? "left";
      if (dir === "left") return [[box.x, box.y, box.w * P, box.h]];
      if (dir === "right") return [[box.x + box.w * (1 - P), box.y, box.w * P, box.h]];
      if (dir === "up") return [[box.x, box.y, box.w, box.h * P]];
      return [[box.x, box.y + box.h * (1 - P), box.w, box.h * P]]; // down
    }
    case "blinds": {
      const count = Math.max(1, opts.count ?? 6);
      const sh = box.h / count;
      const rects: [number, number, number, number][] = [];
      for (let i = 0; i < count; i++) rects.push([box.x, box.y + i * sh, box.w, sh * P]);
      return rects;
    }
    case "checkerboard": {
      const rows = CHECKER_ROWS;
      const cols = CHECKER_COLS;
      const total = rows * cols;
      const cw = box.w / cols;
      const ch = box.h / rows;
      const rects: [number, number, number, number][] = [];
      for (let k = 0; k < total; k++) {
        if (k / total < P) {
          const r = Math.floor(k / cols);
          const col = k % cols;
          rects.push([box.x + col * cw, box.y + r * ch, cw, ch]);
        }
      }
      return rects;
    }
    case "dissolve": {
      const rows = CHECKER_ROWS;
      const cols = CHECKER_COLS;
      const total = rows * cols;
      const cw = box.w / cols;
      const ch = box.h / rows;
      const order = dissolveOrder(total, opts.seed ?? 1);
      const revealCount = Math.floor(P * total);
      const rects: [number, number, number, number][] = [];
      for (let i = 0; i < revealCount; i++) {
        const k = order[i];
        const r = Math.floor(k / cols);
        const col = k % cols;
        rects.push([box.x + col * cw, box.y + r * ch, cw, ch]);
      }
      return rects;
    }
    case "iris":
    case "radialWipe":
    case "clip":
      return [];
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Paints the revealed region for `kind` as solid white onto `c` (the mask buffer). Pure given inputs. */
export function paintMask(c: CanvasRenderingContext2D, kind: MaskKind, box: Box, p: number, opts: MaskOpts = {}): void {
  const P = clamp01(p);
  if (kind === "iris") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const maxR = Math.hypot(box.w, box.h) / 2;
    const r = P * maxR;
    if (r <= 0) return;
    const shape = opts.shape ?? "circle";
    c.beginPath();
    if (shape === "circle") {
      c.arc(cx, cy, r, 0, Math.PI * 2);
    } else if (shape === "ellipse") {
      c.ellipse(cx, cy, r, r * (box.h / Math.max(1, box.w)), 0, 0, Math.PI * 2);
    } else if (shape === "rect") {
      c.rect(cx - r, cy - r, r * 2, r * 2);
    } else {
      // diamond
      c.moveTo(cx, cy - r);
      c.lineTo(cx + r, cy);
      c.lineTo(cx, cy + r);
      c.lineTo(cx - r, cy);
      c.closePath();
    }
    c.fill();
    return;
  }
  if (kind === "radialWipe") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const radius = Math.hypot(box.w, box.h) / 2;
    if (P <= 0) return;
    const start = -Math.PI / 2;
    const sweep = Math.min(Math.PI * 2 - 1e-4, Math.PI * 2 * P);
    c.beginPath();
    c.moveTo(cx, cy);
    c.arc(cx, cy, radius, start, start + sweep);
    c.closePath();
    c.fill();
    return;
  }
  if (kind === "clip") {
    const pts = opts.points ?? [];
    if (pts.length < 3) return;
    // Scale the static polygon by p about its own centroid — "reveal the polygon growing in".
    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length;
    cy /= pts.length;
    c.beginPath();
    pts.forEach(([x, y], i) => {
      const sx = cx + (x - cx) * P;
      const sy = cy + (y - cy) * P;
      if (i === 0) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    });
    c.closePath();
    c.fill();
    return;
  }
  // rect-based kinds: paint every revealed rect
  c.beginPath();
  for (const [x, y, w, h] of maskRects(kind, box, P, opts)) c.rect(x, y, w, h);
  c.fill();
}
