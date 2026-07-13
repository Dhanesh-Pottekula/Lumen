// src/gcl/index.ts
import { composeSlides } from "../slides/compose";
import { BLUEPRINT, CHALKBOARD, PARCHMENT, TEXTBOOK, type Theme } from "../render/theme";
import type { CanvasSlideDefinition } from "../slides/types";
import { compileScene } from "./compile";
import { parseFilm } from "./parse";
import type { Film, ThemeName } from "./schema";

export type { Component, Film, SceneMarker } from "./schema";

const THEMES: Record<ThemeName, Theme> = { TEXTBOOK, PARCHMENT, BLUEPRINT, CHALKBOARD };

/** Compile a flat-stream film into one composed, seekable CanvasSlideDefinition. */
export function renderFilm(film: Film): CanvasSlideDefinition {
  const scenes = parseFilm(film);
  if (scenes.length === 0) {
    // Degrade gracefully: an empty film is a blank, zero-length slide rather than a throw
    // (parseFilm tolerates []; keep the public entry point equally tolerant).
    return { duration: 0, viewW: 920, viewH: 430, render: (ctx) => ctx.clearRect(0, 0, 920, 430) };
  }
  const themeName = scenes[0]?.marker.theme;
  const theme = themeName ? THEMES[themeName] : TEXTBOOK;
  return composeSlides(scenes.map((s) => compileScene(s, theme)), { theme, filmGrade: true });
}
