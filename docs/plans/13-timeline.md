# Step 13 — Timeline Primitive (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** A timeline primitive — a date axis, eras (colored bands), events (markers + labels) on one or
more parallel tracks, and a moving playhead. Dates are plain numbers (years; negative = BCE).

**Architecture:** `src/render/timeline.ts` — `makeTimeline` (date→x + tracks), then draw helpers reusing
`strokeOn` (axis draw-on), `niceTicks` (charts), and sequence stagger.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/timeline.ts`; **new** `src/slides/timelineDemo.ts` + card.

## The surface (implemented)
- `makeTimeline(area, from, to, tracks)` → `{sx(date), trackY(i)}`; `formatYear` (BCE/CE).
- `timelineAxis(ctx, tl, {p, ticks, baselineFrac})` — baseline draws on, ticks reveal as it reaches them.
- `eras(ctx, tl, eras[], p, {height, step})` — colored bands grow in from their start edge, labeled.
- `events(ctx, tl, events[], t, {start, step})` — pin+dot markers with labels, staggered, above/below, per track.
- `playhead(ctx, tl, atDate, {label})` — sweeping "now" marker with a date chip.

**Noted as addable:** axis zoom/pan (reuse camera 11), log/relative time, duration bars vs point events,
connectors between events, collision-declutter of dense labels.

## Tasks
- [ ] Implement `timeline.ts` (above). Verify: `sx` maps dates; `formatYear(-100)==="100 BCE"`; build clean.
- [ ] `timelineDemo.ts` + card: eras + events on tracks + sweeping playhead. Browser-verify. **Uncommitted.**

## Self-review
- Axis + eras + events (tracks) + playhead; draw-on + staggered; seekable. ✅

## What this unlocks
History eras and battle/process sequences; pairs with maps (16) and kinetic type (09); used by domain kits (18).
