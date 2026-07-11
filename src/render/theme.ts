/**
 * Theme — art direction as plain data (like CSS variables for the canvas). Carried on FrameCtx so
 * scenes ask for roles (ink, accent, surface) instead of hard-coded colors, and one swap reskins a
 * whole film. Themes style the explanatory layer (lines/labels/backdrop); true-color art opts out.
 */
import type { LayerName, LayerOptions } from "./frame";
import { prng } from "./motion";

export type Palette = {
  bg: string;
  surface: string;
  ink: string;
  accent: string;
  muted: string;
  danger: string;
};
export type TextureKind = "none" | "parchment" | "blueprint" | "chalkboard";

export interface Theme {
  name: string;
  palette: Palette;
  texture: TextureKind;
  lineStyle: { width: number; roughness: number }; // roughness 0 = crisp, ~2 = hand-drawn
  type: { display: string; body: string; mono: string };
  fx: {
    glow: boolean;
    grain: number;
    vignette: number;
    /**
     * Per-role FX applied automatically to each layer at composite time (bloom, drop shadow, …).
     * This is the one knob that reskins a whole film's cinematic feel: every scene that routes to a
     * layer inherits its treatment for free. Omit a role for no default treatment.
     */
    layers?: Partial<Record<LayerName, LayerOptions>>;
  };
}

const SANS = "-apple-system, system-ui, sans-serif";

export const TEXTBOOK: Theme = {
  name: "textbook",
  palette: { bg: "#16222c", surface: "#1e2c38", ink: "#eef5ef", accent: "#5cc8ae", muted: "#93a4b0", danger: "#e24b4a" },
  texture: "none",
  lineStyle: { width: 2, roughness: 0 },
  type: { display: SANS, body: SANS, mono: "ui-monospace, monospace" },
  fx: {
    glow: true,
    grain: 0.04,
    vignette: 0.3,
    // Subjects get a soft drop shadow for depth; energy/particles up front get a gentle bloom.
    layers: {
      mid: { shadow: { blur: 9, color: "rgba(0,0,0,0.28)", dy: 3 } },
      fg: { glow: { strength: 0.3, blur: 6 } },
    },
  },
};

export const PARCHMENT: Theme = {
  name: "parchment",
  palette: { bg: "#efe2c4", surface: "#e6d3a8", ink: "#4a2f1a", accent: "#9a3b2e", muted: "#8a7048", danger: "#8c2b1e" },
  texture: "parchment",
  lineStyle: { width: 2.4, roughness: 1.6 },
  type: { display: "Georgia, 'Times New Roman', serif", body: "Georgia, serif", mono: "ui-monospace, monospace" },
  // Ink-on-paper: a warm drop shadow reads as printing depth; no bloom (paper doesn't glow).
  fx: { glow: false, grain: 0.06, vignette: 0.42, layers: { mid: { shadow: { blur: 6, color: "rgba(74,47,26,0.3)", dy: 2 } } } },
};

export const BLUEPRINT: Theme = {
  name: "blueprint",
  palette: { bg: "#0d2b52", surface: "#123a6b", ink: "#dbe9ff", accent: "#7fd0ff", muted: "#7f9fce", danger: "#ff8a8a" },
  texture: "blueprint",
  lineStyle: { width: 1.6, roughness: 0 },
  type: { display: SANS, body: SANS, mono: "ui-monospace, monospace" },
  // Technical drawing: crisp lines, no bloom or shadow — clarity over cinematics.
  fx: { glow: true, grain: 0.03, vignette: 0.3 },
};

export const CHALKBOARD: Theme = {
  name: "chalkboard",
  palette: { bg: "#1f2a26", surface: "#26332e", ink: "#eaf3ec", accent: "#ffe08a", muted: "#9db3a6", danger: "#ff9a9a" },
  texture: "chalkboard",
  lineStyle: { width: 2.6, roughness: 1.2 },
  type: { display: SANS, body: SANS, mono: "ui-monospace, monospace" },
  // Chalk on slate: bright strokes bloom like chalk dust catching light.
  fx: { glow: false, grain: 0.08, vignette: 0.36, layers: { fg: { glow: { strength: 0.5, blur: 9 } }, mid: { glow: { strength: 0.35, blur: 7 } } } },
};

/** Seeded per-point jitter for a hand-drawn look. roughness 0 → unchanged. Deterministic. */
export function roughen(points: [number, number][], roughness: number, seed: number): [number, number][] {
  if (roughness <= 0) return points.map((p) => [p[0], p[1]]);
  const r = prng(seed);
  return points.map(([x, y]) => [x + (r() - 0.5) * 2 * roughness, y + (r() - 0.5) * 2 * roughness]);
}
