# SVG image-asset system for canvas films — design

**Date:** 2026-07-09
**Status:** approved, pending implementation

## Problem

The photosynthesis scenes are drawn entirely from canvas primitives. Richer, hand-authored SVG
art would make the films look far better. We want authored SVGs stored as files, preloaded, and
drawn into scenes — while keeping the deterministic, seekable code-driven motion.

## Decisions

- I author rich SVGs (you can swap any file later — same name, no code change).
- SVG hero art + code motion: SVGs are the detailed subjects; code keeps animating them.
- All seven photosynthesis scenes get the upgrade. Coimbatore untouched.

## Design

### 1. Storage & manifest

- SVG files in `public/images/photosynthesis/` (served at `/images/photosynthesis/<name>.svg`).
- `src/assets/photosynthesis.ts`: a manifest object mapping logical names → URLs, a `PHOTO_ASSET_URLS`
  array (all URLs, for preload), and `img(name)` returning the decoded element or `undefined`.

### 2. Image registry — `src/assets/imageRegistry.ts`

- Module-singleton `Map<url, HTMLImageElement>`.
- `preloadImages(urls: string[]): Promise<void>` — create an `HTMLImageElement` per URL, set `src`,
  await `decode()` (fall back to `onload`); ignore failures (scene fallback covers them).
- `getImage(url): HTMLImageElement | undefined` — returns the element only when
  `complete && naturalWidth > 0`, else `undefined`. Guards `typeof Image === "undefined"` (tests/SSR).
- Pure readiness helper `isDrawable(el): boolean` unit-tested with a fake element.

### 3. Draw helper — `src/slides/anim.ts`

`drawSvg(ctx, img, cx, cy, w, h, opts?: { alpha?; rotate? })` — draw `img` centered at `(cx,cy)` at
`w×h`, with optional alpha (save/restore) and rotation. No-op when `img` is falsy.

### 4. Scene integration

Each `photo*.ts` scene imports `img` + `drawSvg` and replaces its primitive hero shapes with the
SVG, keeping all staging/motion (`phase`, `cycle`, path travel, rotation). Every SVG draw has a
fallback: `const el = img("chloroplast"); if (el) drawSvg(...); else <existing primitive>`. Labels
stay code-drawn (`fadeText`) for crispness.

Asset usage:
- intro: `sun` (rotating), `leaf`, molecule chips drifting (`co2`, `o2`, `water-drop`).
- leaf cell: `mesophyll-cell` hero; `chloroplast` small, placed/rotated around the ring.
- chloroplast: `chloroplast-cutaway` hero; labels code-drawn.
- light reactions: `thylakoid-membrane` hero; electrons/photons/H⁺/O₂ + `atp`/`nadph` tokens animated in code.
- calvin cycle: `calvin-ring` backdrop; `co2`/`glucose`/`atp`/`nadph` chips + rotating markers in code.
- equation: molecule chips `co2`,`h2o`,`sun`,`glucose`,`o2` assembled in a row.
- finale: small icons reuse `sun`,`leaf`,`chloroplast`,`glucose` etc. along the journey strip.

### 5. Player & app

- `<CanvasSlide>` gains `assetUrls?: string[]`: a mount effect calls `preloadImages(assetUrls)` then
  repaints the paused frame when done. No change when the prop is absent.
- `App.tsx` passes `PHOTO_ASSET_URLS` to the photosynthesis card.

### 6. Asset set (authored SVGs, gradient-polished, self-contained — no external refs, no scripts)

`sun`, `leaf`, `mesophyll-cell`, `chloroplast`, `chloroplast-cutaway`, `thylakoid-membrane`,
`calvin-ring`, `co2`, `h2o`, `o2`, `glucose`, `atp`, `nadph`, `water-drop`.

Each root `<svg>` carries `width`/`height` + `viewBox`. Physical palette matches the scenes
(gold light, greens, blue water, cyan O₂, gray CO₂).

### 7. Error handling

- Missing/failed SVG → `getImage` returns `undefined` → scene draws its primitive fallback.
- Preload rejects are swallowed; the film still plays.

### 8. Testing

- `imageRegistry` readiness (`isDrawable`) + manifest URL completeness: vitest.
- Existing 37 vitest stay green (scenes take the fallback path under the stub ctx).
- Visuals verified in-browser per scene (screenshots), iterated until they look great.

## Out of scope

- Coimbatore SVG upgrade.
- Runtime SVG generation; raster (PNG) assets.
- Changing the narration/timings pipeline.
