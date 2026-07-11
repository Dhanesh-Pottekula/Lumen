# Step 09 — Kinetic Typography (full-capacity)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Text and numbers as animated citizens — counters/number tickers (with formatting), typewriter
& word-by-word reveals, big-number/date "slams", scramble/decode, and text-along-a-path. Themed, pure,
seekable.

**Architecture:** `src/render/type-motion.ts` — pure value/format helpers + themed draw helpers; reuses
`flashAlpha` (Step 08), `easeOutBack`, and `pointAt` (Step 04).

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/type-motion.ts`; **new** `src/slides/typeMotionDemo.ts` + card.

## The surface (implemented)
- **Values/format (pure):** `counterValue(t,at,dur,from,to,ease?)`, `formatNumber(n,{decimals,commas,prefix,suffix})`,
  `formatCurrency`, `formatPercent`, `wordsShown`, `charsShown`, `scrambleText`.
- **Draw:** `drawCounter` (formatted ticker), `drawTypewriter` (chars + blinking cursor),
  `drawWordReveal` (per-word staggered `fade|rise|pop`, measured layout), `drawSlam` (oversized→settle
  with overshoot + impact ring), `drawScramble` (decode), `drawTextAlongPath` (glyphs on a path, reveal p).

**Noted as addable:** odometer/rolling-digit counter, letter-by-letter 3D flip, highlighter-swipe on a
word (reveal `wipe` + `withBlend("multiply")`), variable-font weight animation.

## Tasks
- [ ] Implement `type-motion.ts` (above). Verify: `formatNumber(1234567)==="1,234,567"`,
  `counterValue(6,2,4,0,100)===100`, `wordsShown("a b c d",0.5)==="a b"`; build clean.
- [ ] `typeMotionDemo.ts` + card: word-reveal headline, counter to 1,247,000, "1932" slam, "COIMBATORE"
  decode, text on a curve. Browser-verify. **Uncommitted.**

## Self-review
- Interpolation/format/word-reveal pure; draws themed; counters/slams/scramble/path all covered. ✅

## What this unlocks
Dramatic dates/numbers for history and data for every subject; pairs with charts (12) and timeline (13).
