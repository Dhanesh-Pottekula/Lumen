import { BLUEPRINT, CHALKBOARD, PARCHMENT, TEXTBOOK } from "../render/theme";
import type { ThemeName } from "../gcl/schema";
import type { ObjectSpec, PaintRole, RoleToken, ToneToken } from "./types";
import type { PaceToken, ShotToken, SizeToken, TextSizeToken, ThemeToken } from "./types";
import { availableVisualAssets, visualAssetAnchors } from "./visual-catalog";

export interface PaceDefinition {
  duration: number;
  transition: number;
  hold: number;
}

export interface ShotDefinition {
  zoom: number;
  duration: number;
}

export interface AssetDefinition {
  type: "prop";
  name: string;
  anchors: string[];
}

const THEMES: Record<ThemeToken, "TEXTBOOK" | "PARCHMENT" | "BLUEPRINT" | "CHALKBOARD"> = {
  textbook: "TEXTBOOK",
  parchment: "PARCHMENT",
  blueprint: "BLUEPRINT",
  chalkboard: "CHALKBOARD",
};

const PACES: Record<PaceToken, PaceDefinition> = {
  instant: { duration: 0.25, transition: 0, hold: 0.25 },
  quick: { duration: 1.2, transition: 0.35, hold: 0.5 },
  normal: { duration: 2.2, transition: 0.6, hold: 0.9 },
  slow: { duration: 3.4, transition: 0.9, hold: 1.5 },
  dramatic: { duration: 5, transition: 1.2, hold: 2.2 },
};

const SHOTS: Record<ShotToken, ShotDefinition> = {
  overview: { zoom: 1, duration: 0.7 },
  wide: { zoom: 1.18, duration: 0.7 },
  medium: { zoom: 1.45, duration: 0.75 },
  close: { zoom: 1.9, duration: 0.85 },
  detail: { zoom: 2.5, duration: 0.95 },
};

const sizeRow = (text: number, equation: number, measure: number, visual: number, line: number): Record<ObjectSpec["kind"], number> => ({
  text, equation, measure, visual, line,
  angle: line,
  span: line,
  vector: visual,
  "svg-composite": visual,
  "svg-artwork": visual,
  image: visual,
  path: visual,
  shape: visual,
  curve: visual,
  chart: visual,
  legend: visual,
  map: visual,
  timeline: visual,
  table: visual,
  group: visual,
  diagram: visual,
  compare: visual,
  scale: visual,
  evidence: visual,
  question: visual,
  forces: visual,
  working: visual,
});

const SIZES: Record<SizeToken, Record<ObjectSpec["kind"], number>> = {
  tiny: sizeRow(18, 20, 22, 0.55, 2),
  mini: sizeRow(18, 23, 26, 0.67, 2.25),
  small: sizeRow(18, 26, 30, 0.8, 2.5),
  compact: sizeRow(21, 30, 36, 0.97, 2.75),
  medium: sizeRow(24, 34, 42, 1.15, 3),
  large: sizeRow(32, 46, 56, 1.65, 4),
  hero: sizeRow(42, 60, 72, 2.3, 5),
  fill: sizeRow(52, 72, 88, 3.2, 6),
};

/**
 * Writing by importance, in view units on the 540-wide screen (one unit is about 0.68 pt on a phone):
 * the size it is drawn at, and the floor no fitting or crowding ever takes it below.
 */
const TEXT_SIZES: Record<TextSizeToken, { px: number; floor: number }> = {
  number: { px: 64, floor: 48 },
  term: { px: 40, floor: 32 },
  name: { px: 30, floor: 24 },
  tag: { px: 26, floor: 22 },
};

/** The size writing takes when it names none: a name, never a caption too small to read on a phone. */
export const DEFAULT_TEXT_SIZE: TextSizeToken = "name";

export function isTextSize(token: unknown): token is TextSizeToken {
  return typeof token === "string" && token in TEXT_SIZES;
}

export function resolveTextSize(token: TextSizeToken): { px: number; floor: number } {
  return TEXT_SIZES[token];
}

export function resolveTheme(token: string) {
  return THEMES[token as ThemeToken];
}

export function resolvePace(token: string): PaceDefinition | undefined {
  const value = PACES[token as PaceToken];
  return value ? { ...value } : undefined;
}

export function resolveShot(token: string): ShotDefinition | undefined {
  const value = SHOTS[token as ShotToken];
  return value ? { ...value } : undefined;
}

export function resolveSize(token: SizeToken, kind: ObjectSpec["kind"]): number | undefined {
  return SIZES[token]?.[kind];
}

export function assetAnchors(name: string): string[] | undefined {
  return visualAssetAnchors(name);
}

export function resolveAsset(name: string): AssetDefinition | undefined {
  const anchors = assetAnchors(name);
  return anchors ? { type: "prop", name, anchors: [...anchors] } : undefined;
}

export function availableAssets(): string[] {
  return availableVisualAssets();
}

const THEME_DATA = { TEXTBOOK, PARCHMENT, BLUEPRINT, CHALKBOARD };

export function resolveVisualStyle(theme: ThemeName, role: RoleToken = "primary") {
  const value = THEME_DATA[theme];
  const color = role === "hero" || role === "primary" ? value.palette.accent : role === "support" || role === "background" ? value.palette.muted : value.palette.ink;
  const layer = role === "background" ? "bg" : role === "annotation" || role === "hud" ? "annotation" : "mid";
  return { color, lineWidth: value.lineStyle.width, layer } as const;
}

/** A path's colour by theme role; `none` paints nothing. */
export function paletteColor(theme: ThemeName, role: PaintRole): string | undefined {
  return role === "none" ? undefined : THEME_DATA[theme].palette[role];
}

/** The colour a tone gives by meaning: green for good, red for bad. */
export function toneColor(theme: ThemeName, tone: ToneToken): string {
  const palette = THEME_DATA[theme].palette;
  return tone === "good" ? palette.good : palette.danger;
}

/** Whether an object is laid between two things and re-aimed as they move: a line, or a path with both ends. */
export function joinsTwo(source: ObjectSpec): boolean {
  return source.kind === "line" || (source.kind === "path" && source.from !== undefined && source.to !== undefined);
}

// What steps aside is a whole picture: it has a size of its own to give up.
export const STEPS_ASIDE: ReadonlySet<ObjectSpec["kind"]> = new Set(["image", "visual", "svg-artwork", "svg-composite", "map", "chart", "diagram", "table", "timeline", "shape", "path", "curve"]);

/** Whether a thing could take the centre a picture steps aside from: a stroke, an arrow or a connector never does. */
export function takesCentre(object: ObjectSpec | undefined): boolean {
  if (!object || !STEPS_ASIDE.has(object.kind) || object.role === "annotation" || object.role === "background") return false;
  if (object.kind !== "path") return true;
  return !(object.from && object.to) && object.arrow === undefined && (/[zZ]/.test(object.d) || (object.d.match(/[Mm]/g)?.length ?? 0) >= 2);
}

/**
 * The colour of the category that comes `ordinal`-th in a film: the accent, its colour-blind-safe
 * partner, then ink and muted. Red is never a category, since it means wrong.
 */
export function categoryColor(theme: ThemeName, ordinal: number): string {
  const palette = THEME_DATA[theme].palette;
  const colors = [palette.accent, palette.second, palette.ink, palette.muted];
  return colors[((ordinal % colors.length) + colors.length) % colors.length];
}
