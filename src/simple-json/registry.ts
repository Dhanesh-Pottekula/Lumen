import { PROP_ANCHORS, PROP_CATALOG } from "../gcl/props";
import { BLUEPRINT, CHALKBOARD, PARCHMENT, TEXTBOOK } from "../render/theme";
import type { ThemeName } from "../gcl/schema";
import type { ObjectSpec, RoleToken } from "./types";
import type { PaceToken, ShotToken, SizeToken, ThemeToken } from "./types";

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

const GENERIC_ANCHORS = ["center", "top", "bottom", "left", "right"] as const;

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

const sizeRow = (text: number, equation: number, stat: number, visual: number, line: number): Record<ObjectSpec["kind"], number> => ({
  text, equation, stat, visual, line,
  shape: visual,
  curve: visual,
  chart: visual,
  legend: visual,
  map: visual,
  timeline: visual,
  table: visual,
  group: visual,
});

const SIZES: Record<SizeToken, Record<ObjectSpec["kind"], number>> = {
  tiny: sizeRow(14, 20, 22, 0.55, 2),
  small: sizeRow(18, 26, 30, 0.8, 2.5),
  medium: sizeRow(24, 34, 42, 1.15, 3),
  large: sizeRow(32, 46, 56, 1.65, 4),
  hero: sizeRow(42, 60, 72, 2.3, 5),
  fill: sizeRow(52, 72, 88, 3.2, 6),
};

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
  if (!Object.hasOwn(PROP_CATALOG, name)) return undefined;
  return [...new Set([...GENERIC_ANCHORS, ...Object.keys(PROP_ANCHORS[name] ?? {})])];
}

export function resolveAsset(name: string): AssetDefinition | undefined {
  const anchors = assetAnchors(name);
  return anchors ? { type: "prop", name, anchors: [...anchors] } : undefined;
}

export function availableAssets(): string[] {
  return Object.keys(PROP_CATALOG).sort();
}

const THEME_DATA = { TEXTBOOK, PARCHMENT, BLUEPRINT, CHALKBOARD };

export function resolveVisualStyle(theme: ThemeName, role: RoleToken = "primary") {
  const value = THEME_DATA[theme];
  const color = role === "hero" || role === "primary" ? value.palette.accent : role === "support" || role === "background" ? value.palette.muted : value.palette.ink;
  const layer = role === "background" ? "bg" : role === "annotation" || role === "hud" ? "annotation" : role === "hero" ? "fg" : "mid";
  return { color, lineWidth: value.lineStyle.width, layer } as const;
}

/** Stable semantic category colors shared by charts, maps, legends, and timelines. */
export function categoryColor(theme: ThemeName, category: string, index = 0): string {
  const palette = THEME_DATA[theme].palette;
  const colors = [palette.accent, palette.ink, palette.muted, palette.danger, palette.surface];
  let hash = index;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}
