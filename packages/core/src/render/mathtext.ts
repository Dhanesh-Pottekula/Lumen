/**
 * mathtext — a compact, canvas-native math typesetter. Handles the math a lesson actually needs:
 * runs, super/subscripts, fractions, square roots, and a LaTeX-style symbol dictionary (Greek,
 * operators, arrows, ∑ ∫ ∏ …). Fully deterministic and offline (no KaTeX/DOM/fonts pipeline), so it
 * renders and scrubs reliably; `drawMath` supports a left-to-right draw-on reveal.
 *
 * It is a pragmatic subset, not full LaTeX. For arbitrary LaTeX you would bundle KaTeX and render to an
 * offscreen SVG image (with bundled fonts) then drawImage — that path is heavier and font-fragile; this
 * covers chemistry/physics/algebra display math without those risks.
 */
import { clamp01 } from "../slides/anim";

const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", Theta: "Θ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", Pi: "Π", rho: "ρ",
  sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", Phi: "Φ", chi: "χ", psi: "ψ", omega: "ω", Omega: "Ω",
  times: "×", cdot: "·", div: "÷", pm: "±", mp: "∓", leq: "≤", geq: "≥", neq: "≠", approx: "≈",
  equiv: "≡", to: "→", rightarrow: "→", Rightarrow: "⇒", leftarrow: "←", leftrightarrow: "↔",
  infty: "∞", partial: "∂", nabla: "∇", int: "∫", sum: "∑", prod: "∏", cdots: "⋯", ldots: "…",
  deg: "°", propto: "∝", in: "∈", forall: "∀", exists: "∃", angle: "∠", perp: "⊥", cup: "∪", cap: "∩",
  lim: "lim", ln: "ln", ",": " ", ";": " ", " ": " ",
};

export const MATH_TEXT_COMMANDS = [...Object.keys(SYMBOLS), "frac", "sqrt", "text"] as const;

export type MathTextValidationResult = { valid: true } | { valid: false; error: string };

/** Validate the deterministic math-text subset before the renderer sees it. */
export function validateMathText(src: string): MathTextValidationResult {
  let depth = 0;
  for (let index = 0; index < src.length; index++) {
    const char = src[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth < 0) return { valid: false, error: `unexpected '}' at position ${index}` };
    }
    if (char !== "\\") continue;
    let end = index + 1;
    while (end < src.length && /[A-Za-z]/.test(src[end])) end += 1;
    const command = end > index + 1 ? src.slice(index + 1, end) : src[index + 1];
    if (!command) return { valid: false, error: "trailing backslash" };
    if (!(MATH_TEXT_COMMANDS as readonly string[]).includes(command)) {
      return { valid: false, error: `unsupported command \\${command} at position ${index}` };
    }
    index = end > index + 1 ? end - 1 : end;
  }
  return depth === 0 ? { valid: true } : { valid: false, error: `${depth} unclosed math group${depth === 1 ? "" : "s"}` };
}

const SCRIPT = 0.85; // script-style shrink for fraction numerator/denominator (real math typesetting)

interface Box {
  w: number;
  ascent: number; // above baseline
  descent: number; // below baseline
  render: (ctx: CanvasRenderingContext2D, x: number, baseY: number) => void;
}

interface Token {
  kind: "char" | "text" | "cmd" | "^" | "_" | "{" | "}";
  v: string;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      let j = i + 1;
      let name = "";
      while (j < src.length && /[a-zA-Z]/.test(src[j])) name += src[j++];
      if (name) {
        if (name === "text" && src[j] === "{") {
          let depth = 1;
          let end = j + 1;
          while (end < src.length && depth > 0) {
            if (src[end] === "{") depth += 1;
            else if (src[end] === "}") depth -= 1;
            end += 1;
          }
          if (depth === 0) {
            out.push({ kind: "text", v: src.slice(j + 1, end - 1) });
            i = end - 1;
            continue;
          }
        }
        out.push({ kind: "cmd", v: name });
        i = j - 1;
      } else if (j < src.length) {
        out.push({ kind: "cmd", v: src[j] }); // single-char command like \, or \{
        i = j;
      } // else: lone trailing backslash — ignore
    } else if (c === "^" || c === "_" || c === "{" || c === "}") {
      out.push({ kind: c as Token["kind"], v: c });
    } else if (c === " ") {
      // skip literal spaces (use ~ or explicit for spacing); keep thin space between atoms visually via layout
    } else {
      out.push({ kind: "char", v: c });
    }
  }
  return out;
}

function textBox(str: string, size: number, italic = false): Box {
  return {
    w: 0, // measured at render via a cached measure; compute lazily below
    ascent: size * 0.72,
    descent: size * 0.22,
    render(ctx, x, baseY) {
      ctx.save();
      ctx.font = `${italic ? "italic " : ""}${size}px "Georgia", "Times New Roman", serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(str, x, baseY);
      ctx.restore();
    },
  };
}

// measure a text box's width using a shared canvas
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(str: string, size: number, italic = false): number {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return str.length * size * 0.5;
  measureCtx.font = `${italic ? "italic " : ""}${size}px "Georgia", "Times New Roman", serif`;
  return measureCtx.measureText(str).width;
}

function hbox(children: Box[]): Box {
  const w = children.reduce((s, c) => s + c.w, 0);
  const ascent = Math.max(0, ...children.map((c) => c.ascent));
  const descent = Math.max(0, ...children.map((c) => c.descent));
  return {
    w,
    ascent,
    descent,
    render(ctx, x, baseY) {
      let cx = x;
      for (const c of children) {
        c.render(ctx, cx, baseY);
        cx += c.w;
      }
    },
  };
}

function atom(str: string, size: number, italic = false): Box {
  const b = textBox(str, size, italic);
  b.w = measure(str, size, italic);
  return b;
}

function supBox(base: Box, exp: Box): Box {
  const rise = base.ascent * 0.5;
  return {
    w: base.w + exp.w,
    ascent: Math.max(base.ascent, rise + exp.ascent),
    descent: base.descent,
    render(ctx, x, baseY) {
      base.render(ctx, x, baseY);
      exp.render(ctx, x + base.w, baseY - rise);
    },
  };
}

function subBox(base: Box, sub: Box): Box {
  const drop = base.descent + sub.ascent * 0.4;
  return {
    w: base.w + sub.w,
    ascent: base.ascent,
    descent: Math.max(base.descent, drop + sub.descent),
    render(ctx, x, baseY) {
      base.render(ctx, x, baseY);
      sub.render(ctx, x + base.w, baseY + drop);
    },
  };
}

function fracBox(num: Box, den: Box, size: number): Box {
  const w = Math.max(num.w, den.w) + size * 0.5;
  const gap = size * 0.18;
  const barY = size * 0.28; // above baseline
  return {
    w,
    ascent: barY + gap + num.ascent + num.descent,
    descent: den.ascent + den.descent + gap - barY,
    render(ctx, x, baseY) {
      const cy = baseY - barY;
      num.render(ctx, x + (w - num.w) / 2, cy - gap - num.descent);
      den.render(ctx, x + (w - den.w) / 2, cy + gap + den.ascent);
      ctx.save();
      ctx.strokeStyle = (ctx.fillStyle as string) || "#fff";
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.1, cy);
      ctx.lineTo(x + w - size * 0.1, cy);
      ctx.stroke();
      ctx.restore();
    },
  };
}

function sqrtBox(body: Box, size: number): Box {
  const lead = size * 0.55;
  const pad = size * 0.14;
  const w = lead + body.w + pad;
  const ascent = body.ascent + size * 0.16;
  return {
    w,
    ascent,
    descent: body.descent,
    render(ctx, x, baseY) {
      body.render(ctx, x + lead, baseY);
      ctx.save();
      ctx.strokeStyle = (ctx.fillStyle as string) || "#fff";
      ctx.lineWidth = Math.max(1, size * 0.05);
      const top = baseY - ascent + size * 0.06;
      ctx.beginPath();
      ctx.moveTo(x, baseY - body.descent * 0.4);
      ctx.lineTo(x + lead * 0.35, baseY + body.descent);
      ctx.lineTo(x + lead * 0.7, top);
      ctx.lineTo(x + w, top);
      ctx.stroke();
      ctx.restore();
    },
  };
}

// parse a run until a closing } (or end); returns box + next index
function parseRun(tokens: Token[], start: number, size: number, stopAtBrace: boolean): { box: Box; next: number } {
  const atoms: Box[] = [];
  let i = start;
  const tokenToBox = (idx: number): { box: Box; next: number } => {
    const tk = tokens[idx];
    if (tk.kind === "{") {
      const r = parseRun(tokens, idx + 1, size, true);
      return { box: r.box, next: r.next };
    }
    if (tk.kind === "cmd") {
      if (tk.v === "frac") {
        const a = parseArg(tokens, idx + 1, size * SCRIPT);
        const b = parseArg(tokens, a.next, size * SCRIPT);
        return { box: fracBox(a.box, b.box, size), next: b.next };
      }
      if (tk.v === "sqrt") {
        const a = parseArg(tokens, idx + 1, size);
        return { box: sqrtBox(a.box, size), next: a.next };
      }
      const sym = SYMBOLS[tk.v];
      return { box: atom(sym ?? tk.v, size), next: idx + 1 };
    }
    if (tk.kind === "text") return { box: atom(tk.v, size, false), next: idx + 1 };
    return { box: atom(tk.v, size, /[a-zA-Z]/.test(tk.v)), next: idx + 1 };
  };
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk.kind === "}") {
      if (stopAtBrace) return { box: hbox(atoms), next: i + 1 };
      i++;
      continue;
    }
    if (tk.kind === "^" || tk.kind === "_") {
      const base = atoms.pop() ?? atom("", size);
      const arg = parseArg(tokens, i + 1, size * 0.72);
      atoms.push(tk.kind === "^" ? supBox(base, arg.box) : subBox(base, arg.box));
      i = arg.next;
      continue;
    }
    const r = tokenToBox(i);
    atoms.push(r.box);
    i = r.next;
  }
  return { box: hbox(atoms), next: i };
}

// parse a single argument (a {group} or one token/command, incl. nested frac/sqrt)
function parseArg(tokens: Token[], start: number, size: number): { box: Box; next: number } {
  const tk = tokens[start];
  if (!tk) return { box: atom("", size), next: start };
  if (tk.kind === "{") return parseRun(tokens, start + 1, size, true);
  if (tk.kind === "cmd") {
    if (tk.v === "frac") {
      const a = parseArg(tokens, start + 1, size * SCRIPT);
      const b = parseArg(tokens, a.next, size * SCRIPT);
      return { box: fracBox(a.box, b.box, size), next: b.next };
    }
    if (tk.v === "sqrt") {
      const a = parseArg(tokens, start + 1, size);
      return { box: sqrtBox(a.box, size), next: a.next };
    }
    const sym = SYMBOLS[tk.v];
    return { box: atom(sym ?? tk.v, size), next: start + 1 };
  }
  if (tk.kind === "text") return { box: atom(tk.v, size, false), next: start + 1 };
  return { box: atom(tk.v, size, /[a-zA-Z]/.test(tk.v)), next: start + 1 };
}

/** Measure a math expression at font `size`. Returns width/height and a render fn (top-left origin). */
export function measureMath(src: string, size: number): { w: number; h: number; render: (ctx: CanvasRenderingContext2D, xTop: number, yTop: number) => void } {
  const { box } = parseRun(tokenize(src), 0, size, false);
  const h = box.ascent + box.descent;
  return {
    w: box.w,
    h,
    render: (ctx, xTop, yTop) => box.render(ctx, xTop, yTop + box.ascent),
  };
}

export interface MathStyle {
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  p?: number; // draw-on: reveal left→right
  alpha?: number;
}

/** Draw a math expression. `align` positions it at (x,y); `p` reveals it left→right (writing on). */
export function drawMath(ctx: CanvasRenderingContext2D, src: string, x: number, y: number, style: MathStyle = {}) {
  const size = style.size ?? 28;
  const m = measureMath(src, size);
  const ax = style.align === "center" ? x - m.w / 2 : style.align === "right" ? x - m.w : x;
  const ay = y - m.h / 2;
  ctx.save();
  ctx.globalAlpha *= clamp01(style.alpha ?? 1);
  ctx.fillStyle = style.color ?? "#eef5ef";
  const p = clamp01(style.p ?? 1);
  if (p < 1) {
    ctx.beginPath();
    ctx.rect(ax - 4, ay - 4, m.w * p + 8, m.h + 8);
    ctx.clip();
  }
  m.render(ctx, ax, ay);
  ctx.restore();
}
