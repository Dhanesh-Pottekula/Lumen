# Step 17 — Math Typesetting (full-capacity, canvas-native)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.

**Goal:** Render display math on the canvas — fractions, roots, super/subscripts, Greek, and operators —
deterministically, offline, and seekably, with a draw-on ("writing") reveal.

**Design decision:** the plan originally called for runtime KaTeX → offscreen image → drawImage. Under
this project's hard constraints (pure `render(t)`, no async at render, offline, no font/DOM fragility) a
KaTeX→foreignObject→Image pipeline is unreliable (web-font tainting, async load, cache invalidation). So
Step 17 ships a **canvas-native math typesetter** (`mathtext.ts`): a LaTeX-subset parser + a box-layout
engine drawn with canvas text. It covers chemistry/physics/algebra display math without those risks. A
full-LaTeX path (bundle KaTeX, render to an SVG image with bundled fonts, cache, drawImage) is documented
as the upgrade if arbitrary LaTeX is ever required.

**Architecture:** `src/render/mathtext.ts` — `tokenize` → recursive `parseRun`/`parseArg` → `Box` tree
(hbox/atom/sup/sub/frac/sqrt) → measure + render.

**Tech Stack:** TypeScript, Canvas 2D.

## Global Constraints
- Deterministic/offline/seekable; `npm run build` clean; additive.
- **Project overrides:** tests removed → scratch eval + browser demo; **leave uncommitted**.

## File structure
- **New** `src/render/mathtext.ts`; **new** `src/slides/mathDemo.ts` + card.

## The surface (implemented)
- Parser subset: runs, `^`/`_` (single token or `{group}`), `\frac{}{}`, `\sqrt{}`, `{group}` nesting.
- Symbol dictionary: Greek (α…Ω), operators (× · ÷ ± ∓ ≤ ≥ ≠ ≈ ≡), arrows (→ ⇒ ← ↔), big ops (∑ ∫ ∏),
  and misc (∞ ∂ ∇ ° ∝ ∈ ∀ ∃ …).
- Layout boxes: `hbox`, `atom` (italic for letters), `supBox`, `subBox`, `fracBox` (bar), `sqrtBox` (radical).
- API: `measureMath(src, size)` → `{w, h, render}`; `drawMath(ctx, src, x, y, {size, color, align, p, alpha})`
  where `p` reveals left→right (writing on).

**Noted as addable:** matrices, big delimiters that scale, `\overline`/`\vec`/accents, multiline align,
and the full-LaTeX bundled-KaTeX→SVG-image path.

## Tasks
- [ ] Implement `mathtext.ts` (above). Verify: quadratic formula lays out (frac+sqrt+sup); build clean.
- [ ] `mathDemo.ts` + card: quadratic formula writes on; E=mc², chem eq, Σ, ∫, Pythagoras fade in.
  Browser-verify. **Uncommitted.**

## Self-review
- Fractions/roots/sub-sup/symbols typeset; deterministic; draw-on; no DOM/font/fetch risk. ✅

## What this unlocks
Equations for science/maths lessons (pairs with draw-on 04 and kinetic type 09); used by domain kits (18).
