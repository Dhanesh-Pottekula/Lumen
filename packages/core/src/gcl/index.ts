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

/** Compile a flat-stream film into one composed, seekable CanvasSlideDefinition. */
export function renderFilm(
  film: Film,
  options: FilmRenderOptions = {},
): CanvasSlideDefinition {
  const scenes = parseFilm(film);
  if (scenes.length === 0) {
    // Degrade gracefully: an empty film is a blank, zero-length slide rather than a throw
    // (parseFilm tolerates []; keep the public entry point equally tolerant).
    return {
      duration: 0,
      viewW: VIEW_WIDTH,
      viewH: VIEW_HEIGHT,
      render: (ctx) => ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT),
    };
  }
  const themeName = scenes[0]?.marker.theme;
  const theme = themeName ? THEMES[themeName] : TEXTBOOK;
  const backgroundColor = options.backgroundColor?.trim() || undefined;
  // A host-supplied background is the clean embedded-card presentation: retain the selected
  // palette/type treatment, but remove renderer-seeded bloom, blur, shadow, grain, and vignette.
  // Authored visuals remain unchanged; only automatic cinematic compositing is disabled.
  const renderTheme: Theme = backgroundColor
    ? {
        ...theme,
        fx: { glow: false, grain: 0, vignette: 0 },
      }
    : theme;
  // Dense instructional scenes should hand off with a clean cut. Any overlap can
  // leave two diagrams, titles, and equation stacks legible in the same frame.
  return composeSlides(
    scenes.map((s) => compileScene(s, renderTheme, { backgroundColor })),
    {
      theme: renderTheme,
      filmGrade: backgroundColor === undefined,
      crossfade: 0,
      progressDotColors:
        backgroundColor === undefined
          ? undefined
          : {
              active: renderTheme.palette.accent,
              completed: renderTheme.palette.ink,
              pending: renderTheme.palette.muted,
            },
    },
  );
}
