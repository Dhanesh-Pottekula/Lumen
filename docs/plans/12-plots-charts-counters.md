# Step 12 — Plots, Charts & Counters (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Data-viz primitives — a coordinate mapper, axes/grid with nice ticks, animated function
plotting, and bar / line / area / scatter / pie charts bound to data. All animate from `p` (or `t` for
staggered bars) and are deterministic/seekable.

**Architecture:** `src/render/charts.ts` — `makePlot` (data→pixel), then draw helpers that reuse
`strokeOn` (draw-on), sequence stagger, and `type-motion.formatNumber` (labels).

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/charts.ts`; **new** `src/slides/chartsDemo.ts` + card.

## The surface (implemented)
- **Mapper:** `makePlot(area, xDomain, yDomain)` → `{sx, sy}`; `niceTicks(domain, count)`.
- **Axes:** `axes(ctx, plot, {grid, xTicks, yTicks, xLabel, yLabel, fmt, p})` (wipes in via `p`).
- **Function:** `plotFunction(ctx, plot, fn, p, {samples})` — y=f(x) draws on.
- **Bar:** `barChart(ctx, plot, data, {t, start, step, showValues, fmt, gap})` — staggered growth + labels.
- **Line/area:** `lineChart(ctx, plot, series, p, {area, areaColor, markers})` — draw-on line, area fill, markers.
- **Scatter:** `scatter(ctx, plot, points, t, {start, step})` — staggered pop-in.
- **Pie/donut:** `pie(ctx, cx, cy, r, data, p, {donut, labels, startAngle})` — sweeping wedges + % labels.

**Noted as addable:** log/time scales, stacked & grouped bars, multi-series legends, error bars, radar —
all compose from `makePlot` + the draw helpers.

## Tasks
- [ ] Implement `charts.ts` (above). Verify: `makePlot` maps domain→pixel; `niceTicks` sane; build clean.
- [ ] `chartsDemo.ts` + card: sin(x) plot, bar chart, line+area, donut. Browser-verify. **Uncommitted.**

## Self-review
- Mapper + axes + function + bar + line/area + scatter + pie; data-bound; animated; seekable. ✅

## What this unlocks
Data for every subject; pairs with kinetic counters (09) and the timeline (13); used by domain kits (18).
