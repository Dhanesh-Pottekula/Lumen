/**
 * The one view space every Lumen film is composed, laid out, diagnosed, and played in.
 *
 * Layout tables, the safe-frame clamp, auto-fit, off-frame diagnostics, and the host player all
 * read these numbers, so they must come from here rather than being restated per module — a
 * viewport that disagrees between layout and playback silently places content off screen.
 */

/** 9:16 portrait — full-phone. The aspect every host surface (inline card and fullscreen alike) presents. */
export const VIEW_WIDTH = 540;
export const VIEW_HEIGHT = 960;

/** Inset the compiler keeps every object inside, so edge-authored strokes stay fully drawn. */
export const VIEW_INSET = 8;

/** The smallest writing anything draws, in view units: on a phone card one unit is about 0.68 pt, so 18 is 12 pt. */
export const MIN_TEXT = 18;
