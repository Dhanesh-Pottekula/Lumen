// src/gcl/index.ts
import { composeSlides } from "../slides/compose";
import {
  BLUEPRINT,
  CHALKBOARD,
  PARCHMENT,
  TEXTBOOK,
  type Theme,
} from "../render/theme";
import type { CanvasSlideDefinition } from "../slides/types";
import { compileScene } from "./compile";
import { parseFilm } from "./parse";
import { VIEW_HEIGHT, VIEW_WIDTH } from "./viewport";
import type { Film, ThemeName } from "./schema";

export type { Component, Film, SceneMarker } from "./schema";

const THEMES: Record<ThemeName, Theme> = {
  TEXTBOOK,
  PARCHMENT,
  BLUEPRINT,
  CHALKBOARD,
};

export interface FilmRenderOptions {
  /** Solid host background that replaces Lumen's automatic scene backdrop. */
  backgroundColor?: string;
}

/** The theme a film is drawn in; over a host background, its palette without the cinematic passes. */
export function filmTheme(themeName: ThemeName | undefined, options: FilmRenderOptions = {}): Theme {
  const theme = themeName ? THEMES[themeName] : TEXTBOOK;
  const backgroundColor = options.backgroundColor?.trim() || undefined;
  // A host-supplied background is the clean embedded-card presentation: retain the selected
  // palette/type treatment, but remove renderer-seeded bloom, blur, shadow, grain, and vignette.
  // Authored visuals remain unchanged; only automatic cinematic compositing is disabled.
  return backgroundColor
    ? {
        ...theme,
        palette: { ...theme.palette, bg: backgroundColor },
        fx: { glow: false, grain: 0, vignette: 0 },
      }
    : theme;
}

/** Each scene of a flat-stream film compiled on its own, in the theme the film is drawn in. */
export function renderScenes(film: Film, theme: Theme, options: FilmRenderOptions = {}): CanvasSlideDefinition[] {
  const backgroundColor = options.backgroundColor?.trim() || undefined;
  return parseFilm(film).map((scene) => compileScene(scene, theme, { backgroundColor }));
}

/** Compiled scenes played back to back as one composed, seekable CanvasSlideDefinition. */
export function composeFilm(scenes: CanvasSlideDefinition[], theme: Theme, options: FilmRenderOptions = {}): CanvasSlideDefinition {
  if (scenes.length === 0) {
    // A film whose every scene so far was dropped is a blank, zero-length slide rather than a throw.
    return {
      duration: 0,
      viewW: VIEW_WIDTH,
      viewH: VIEW_HEIGHT,
      render: (ctx) => ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT),
    };
  }
  const plain = Boolean(options.backgroundColor?.trim());
  // Dense instructional scenes should hand off with a clean cut. Any overlap can
  // leave two diagrams, titles, and equation stacks legible in the same frame.
  return composeSlides(scenes, {
    theme,
    filmGrade: !plain,
    crossfade: 0,
    progressDotColors: plain
      ? {
          active: theme.palette.accent,
          completed: theme.palette.ink,
          pending: theme.palette.muted,
        }
      : undefined,
  });
}
