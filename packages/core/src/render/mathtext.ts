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
  alpha: "α", beta: "β", gamma: "γ", Gamma: "Γ", delta: "δ", Delta: "Δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", Theta: "Θ", iota: "ι", kappa: "κ", lambda: "λ", Lambda: "Λ", mu: "μ", nu: "ν", xi: "ξ", Xi: "Ξ",
  omicron: "ο", pi: "π", Pi: "Π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", upsilon: "υ", Upsilon: "Υ", phi: "φ", varphi: "φ",
  Phi: "Φ", chi: "χ", psi: "ψ", Psi: "Ψ", omega: "ω", Omega: "Ω", ell: "ℓ", hbar: "ℏ", aleph: "ℵ",
  times: "×", cdot: "·", bullet: "•", ast: "∗", star: "⋆", div: "÷", pm: "±", mp: "∓", oplus: "⊕", otimes: "⊗",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", ll: "≪", gg: "≫", approx: "≈", sim: "∼", simeq: "≃", cong: "≅",
  equiv: "≡", propto: "∝", to: "→", rightarrow: "→", longrightarrow: "⟶", Rightarrow: "⇒", implies: "⟹", leftarrow: "←",
  gets: "←", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔", iff: "⟺", uparrow: "↑", downarrow: "↓",
  updownarrow: "↕", mapsto: "↦", rightleftharpoons: "⇌", leftrightarrows: "⇄", nearrow: "↗", searrow: "↘",
  infty: "∞", partial: "∂", nabla: "∇", int: "∫", iint: "∬", oint: "∮", sum: "∑", prod: "∏", cdots: "⋯", ldots: "…",
  dots: "…", vdots: "⋮", deg: "°", degree: "°", circ: "°", prime: "′", in: "∈", notin: "∉", ni: "∋", subset: "⊂",
  supset: "⊃", subseteq: "⊆", supseteq: "⊇", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", neg: "¬",
  wedge: "∧", vee: "∨", cup: "∪", cap: "∩", angle: "∠", measuredangle: "∡", perp: "⊥", bot: "⊥", parallel: "∥",
  nparallel: "∦", mid: "∣", triangle: "△", square: "□", therefore: "∴", because: "∵", Re: "ℜ", Im: "ℑ",
  lim: "lim", ln: "ln", log: "log", exp: "exp", sin: "sin", cos: "cos", tan: "tan", cot: "cot",
  sec: "sec", csc: "csc", arcsin: "arcsin", arccos: "arccos", arctan: "arctan", sinh: "sinh",
  cosh: "cosh", tanh: "tanh", min: "min", max: "max", det: "det", gcd: "gcd", bmod: "mod",
  quad: "  ", qquad: "    ", "!": "", ":": " ", "%": "%", "$": "$", "#": "#", "&": "&", "_": "_", "{": "{", "}": "}", left: "", right: "", displaystyle: "", ",": " ", ";": " ", " ": " ",
};

/** Commands that set their argument in a face of its own: upright (names and units), bold, or italic. */
const FACES: Record<string, Face> = {
  mathrm: { upright: true },
  textrm: { upright: true },
  operatorname: { upright: true },
  mbox: { upright: true },
  mathbf: { upright: true, bold: true },
  textbf: { upright: true, bold: true },
  boldsymbol: { bold: true },
  mathit: { italic: true },
  textit: { italic: true },
};

/** Marks set over their argument: a vector's arrow, a unit vector's hat, a mean's bar, a time derivative's dots. */
const ACCENTS = ["vec", "overrightarrow", "hat", "widehat", "bar", "overline", "dot", "ddot", "tilde", "widetilde", "underline"] as const;
type Accent = (typeof ACCENTS)[number];

export const MATH_TEXT_COMMANDS = [...Object.keys(SYMBOLS), ...Object.keys(FACES), ...ACCENTS, "frac", "dfrac", "tfrac", "sqrt", "text"] as const;

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

/** One drawn mark of laid-out maths — a glyph run, a fraction bar, a root sign — and the tokens `[from, to)` it was written from. */
interface MathPiece {
  from: number;
  to: number;
  x: number;
  y: number;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

interface Box {
  w: number;
  ascent: number; // above baseline
  descent: number; // below baseline
  /** Lay the box's marks out with its baseline starting at (x, baseY). */
  place: (x: number, baseY: number, out: MathPiece[]) => void;
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

interface Face {
  upright?: boolean;
  bold?: boolean;
  italic?: boolean;
}

const fontOf = (size: number, italic: boolean, bold = false) => `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px "Georgia", "Times New Roman", serif`;

function textBox(str: string, size: number, italic: boolean, at: number, bold = false): Box {
  const ascent = size * 0.72;
  const descent = size * 0.22;
  const box: Box = {
    w: 0,
    ascent,
    descent,
    place(x, baseY, out) {
      if (!str) return;
      out.push({
        from: at,
        to: at + 1,
        x,
        y: baseY - ascent,
        w: box.w,
        h: ascent + descent,
        draw(ctx) {
          ctx.save();
          ctx.font = fontOf(size, italic, bold);
          ctx.textAlign = "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(str, x, baseY);
          ctx.restore();
        },
      });
    },
  };
  return box;
}

// measure a text box's width using a shared canvas
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(str: string, size: number, italic = false, bold = false): number {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return str.length * size * (bold ? 0.55 : 0.5);
  measureCtx.font = fontOf(size, italic, bold);
  return measureCtx.measureText(str).width;
}

function hbox(children: Box[]): Box {
  return {
    w: children.reduce((s, c) => s + c.w, 0),
    ascent: Math.max(0, ...children.map((c) => c.ascent)),
    descent: Math.max(0, ...children.map((c) => c.descent)),
    place(x, baseY, out) {
      let cx = x;
      for (const c of children) {
        c.place(cx, baseY, out);
        cx += c.w;
      }
    },
  };
}

function atom(str: string, size: number, italic: boolean, at: number, bold = false): Box {
  const b = textBox(str, size, italic, at, bold);
  b.w = measure(str, size, italic, bold);
  return b;
}

/** A letter written in maths: italic, as a variable is, unless its face says otherwise. */
function letter(str: string, size: number, face: Face, at: number): Box {
  const italic = face.italic === true || (!face.upright && /[a-zA-Z]/.test(str));
  return atom(str, size, italic, at, face.bold);
}

/** A mark set over (or, for `underline`, under) a box, written from tokens `[from, to)`. */
function accentBox(body: Box, accent: Accent, size: number, from: number, to: number): Box {
  const under = accent === "underline";
  const gap = size * 0.08;
  const lift = under ? 0 : size * (accent === "vec" || accent === "overrightarrow" ? 0.3 : 0.24);
  const drop = under ? size * 0.16 : 0;
  return {
    w: body.w,
    ascent: body.ascent + lift,
    descent: body.descent + drop,
    place(x, baseY, out) {
      body.place(x, baseY, out);
      const y = under ? baseY + body.descent + drop * 0.6 : baseY - body.ascent - gap - lift * 0.35;
      const [left, right] = [x + body.w * 0.12, x + body.w * 0.88];
      const mid = x + body.w / 2;
      const reach = Math.min(body.w / 2, size * 0.24);
      const width = Math.max(1, size * 0.05);
      const draw = (ctx: CanvasRenderingContext2D) => {
        ctx.save();
        const ink = (ctx.fillStyle as string) || "#fff";
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        if (accent === "vec" || accent === "overrightarrow") {
          const head = size * 0.12;
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.moveTo(right - head, y - head * 0.7);
          ctx.lineTo(right, y);
          ctx.lineTo(right - head, y + head * 0.7);
          ctx.stroke();
        } else if (accent === "hat" || accent === "widehat") {
          const half = accent === "hat" ? reach : (right - left) / 2;
          ctx.moveTo(mid - half, y + size * 0.12);
          ctx.lineTo(mid, y - size * 0.04);
          ctx.lineTo(mid + half, y + size * 0.12);
          ctx.stroke();
        } else if (accent === "tilde" || accent === "widetilde") {
          const half = accent === "tilde" ? reach : (right - left) / 2;
          for (let k = 0; k <= 12; k++) {
            const u = k / 12;
            const px = mid - half + 2 * half * u;
            const py = y - Math.sin(u * Math.PI * 2) * size * 0.05;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        } else if (accent === "dot" || accent === "ddot") {
          const r = size * 0.05;
          for (const cx of accent === "dot" ? [mid] : [mid - size * 0.11, mid + size * 0.11]) {
            ctx.moveTo(cx + r, y);
            ctx.arc(cx, y, r, 0, Math.PI * 2);
          }
          ctx.fill();
        } else {
          ctx.moveTo(accent === "bar" ? mid - reach : x, y);
          ctx.lineTo(accent === "bar" ? mid + reach : x + body.w, y);
          ctx.stroke();
        }
        ctx.restore();
      };
      out.push({ from, to, x, y: y - size * 0.12, w: body.w, h: size * 0.24, draw });
    },
  };
}

function supBox(base: Box, exp: Box): Box {
  const rise = base.ascent * 0.5;
  return {
    w: base.w + exp.w,
    ascent: Math.max(base.ascent, rise + exp.ascent),
    descent: base.descent,
    place(x, baseY, out) {
      base.place(x, baseY, out);
      exp.place(x + base.w, baseY - rise, out);
    },
  };
}

function subBox(base: Box, sub: Box): Box {
  const drop = base.descent + sub.ascent * 0.4;
  return {
    w: base.w + sub.w,
    ascent: base.ascent,
    descent: Math.max(base.descent, drop + sub.descent),
    place(x, baseY, out) {
      base.place(x, baseY, out);
      sub.place(x + base.w, baseY + drop, out);
    },
  };
}

/** A stroke the maths draws in its own ink: a fraction bar, a root sign. */
function inkStroke(size: number, pts: [number, number][]): (ctx: CanvasRenderingContext2D) => void {
  return (ctx) => {
    ctx.save();
    ctx.strokeStyle = (ctx.fillStyle as string) || "#fff";
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
    ctx.restore();
  };
}

function fracBox(num: Box, den: Box, size: number, from: number, to: number): Box {
  const w = Math.max(num.w, den.w) + size * 0.5;
  const gap = size * 0.18;
  const barY = size * 0.28; // above baseline
  return {
    w,
    ascent: barY + gap + num.ascent + num.descent,
    descent: den.ascent + den.descent + gap - barY,
    place(x, baseY, out) {
      const cy = baseY - barY;
      num.place(x + (w - num.w) / 2, cy - gap - num.descent, out);
      den.place(x + (w - den.w) / 2, cy + gap + den.ascent, out);
      out.push({ from, to, x, y: cy - 1, w, h: 2, draw: inkStroke(size, [[x + size * 0.1, cy], [x + w - size * 0.1, cy]]) });
    },
  };
}

function sqrtBox(body: Box, size: number, from: number, to: number): Box {
  const lead = size * 0.55;
  const pad = size * 0.14;
  const w = lead + body.w + pad;
  const ascent = body.ascent + size * 0.16;
  return {
    w,
    ascent,
    descent: body.descent,
    place(x, baseY, out) {
      body.place(x + lead, baseY, out);
      const top = baseY - ascent + size * 0.06;
      const sign: [number, number][] = [[x, baseY - body.descent * 0.4], [x + lead * 0.35, baseY + body.descent], [x + lead * 0.7, top], [x + w, top]];
      out.push({ from, to, x, y: top, w, h: baseY + body.descent - top, draw: inkStroke(size, sign) });
    },
  };
}

// parse a run until a closing } (or end); returns box + next index
function parseRun(tokens: Token[], start: number, size: number, stopAtBrace: boolean, face: Face = {}): { box: Box; next: number } {
  const atoms: Box[] = [];
  let i = start;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk.kind === "}") {
      if (stopAtBrace) return { box: hbox(atoms), next: i + 1 };
      i++;
      continue;
    }
    if (tk.kind === "^" || tk.kind === "_") {
      const base = atoms.pop() ?? atom("", size, false, i);
      const arg = parseArg(tokens, i + 1, size * 0.72, face);
      atoms.push(tk.kind === "^" ? supBox(base, arg.box) : subBox(base, arg.box));
      i = arg.next;
      continue;
    }
    const r = parseArg(tokens, i, size, face);
    atoms.push(r.box);
    i = r.next;
  }
  return { box: hbox(atoms), next: i };
}

/** A root's optional index, `\sqrt[3]{x}`: the tokens between the brackets, or undefined with none. */
function rootIndex(tokens: Token[], start: number, size: number, face: Face): { box: Box; next: number } | undefined {
  if (tokens[start]?.kind !== "char" || tokens[start].v !== "[") return undefined;
  const close = tokens.findIndex((tk, k) => k > start && tk.kind === "char" && tk.v === "]");
  if (close < 0) return undefined;
  const { box } = parseRun(tokens.slice(0, close), start + 1, size * 0.55, false, face);
  return { box, next: close + 1 };
}

// parse a single argument (a {group} or one token/command, incl. nested frac/sqrt)
function parseArg(tokens: Token[], start: number, size: number, face: Face = {}): { box: Box; next: number } {
  const tk = tokens[start];
  if (!tk) return { box: atom("", size, false, start), next: start };
  if (tk.kind === "{") return parseRun(tokens, start + 1, size, true, face);
  if (tk.kind === "cmd") {
    if (tk.v === "frac" || tk.v === "dfrac" || tk.v === "tfrac") {
      const a = parseArg(tokens, start + 1, size * SCRIPT, face);
      const b = parseArg(tokens, a.next, size * SCRIPT, face);
      return { box: fracBox(a.box, b.box, size, start, b.next), next: b.next };
    }
    if (tk.v === "sqrt") {
      const index = rootIndex(tokens, start + 1, size, face);
      const a = parseArg(tokens, index?.next ?? start + 1, size, face);
      const root = sqrtBox(a.box, size, start, a.next);
      return { box: index ? hbox([raised(index.box, size * 0.35), root]) : root, next: a.next };
    }
    if (tk.v in FACES) {
      const a = parseArg(tokens, start + 1, size, { ...face, ...FACES[tk.v] });
      return { box: a.box, next: a.next };
    }
    if ((ACCENTS as readonly string[]).includes(tk.v)) {
      const a = parseArg(tokens, start + 1, size, face);
      return { box: accentBox(a.box, tk.v as Accent, size, start, a.next), next: a.next };
    }
    const sym = SYMBOLS[tk.v];
    return { box: atom(sym ?? tk.v, size, false, start, face.bold), next: start + 1 };
  }
  if (tk.kind === "text") return { box: atom(tk.v, size, false, start, face.bold), next: start + 1 };
  if (tk.v === "~") return { box: atom(" ", size, false, start), next: start + 1 };
  return { box: letter(tk.v, size, face, start), next: start + 1 };
}

/** A box set higher by `rise`, as a root's index sits over the root sign's tail. */
function raised(box: Box, rise: number): Box {
  return {
    w: box.w,
    ascent: box.ascent + rise,
    descent: Math.max(0, box.descent - rise),
    place: (x, baseY, out) => box.place(x, baseY - rise, out),
  };
}

interface LaidMath {
  w: number;
  h: number;
  /** Every mark, with the maths' top-left at (0, 0). */
  pieces: MathPiece[];
}

function layMath(src: string, size: number): LaidMath {
  const { box } = parseRun(tokenize(src), 0, size, false);
  const pieces: MathPiece[] = [];
  box.place(0, box.ascent, pieces);
  return { w: box.w, h: box.ascent + box.descent, pieces };
}

function drawPieces(ctx: CanvasRenderingContext2D, pieces: MathPiece[], xTop: number, yTop: number): void {
  ctx.save();
  ctx.translate(xTop, yTop);
  for (const piece of pieces) piece.draw(ctx);
  ctx.restore();
}

/** Measure a math expression at font `size`. Returns width/height and a render fn (top-left origin). */
export function measureMath(src: string, size: number): { w: number; h: number; render: (ctx: CanvasRenderingContext2D, xTop: number, yTop: number) => void } {
  const laid = layMath(src, size);
  return { w: laid.w, h: laid.h, render: (ctx, xTop, yTop) => drawPieces(ctx, laid.pieces, xTop, yTop) };
}

/**
 * The tokens `[from, to)` of the first place `term` is written in `src`, matched token by token — so
 * spacing never matters and `a` is never found inside `\frac` — or undefined when it is not written there.
 */
export function mathTermRange(src: string, term: string): [number, number] | undefined {
  const whole = tokenize(src);
  const part = tokenize(term);
  if (part.length === 0) return undefined;
  for (let i = 0; i + part.length <= whole.length; i++)
    if (part.every((tk, k) => whole[i + k].kind === tk.kind && whole[i + k].v === tk.v)) return [i, i + part.length];
  return undefined;
}

function termPieces(laid: LaidMath, src: string, term: string): MathPiece[] {
  const range = mathTermRange(src, term);
  return range ? laid.pieces.filter((piece) => piece.from >= range[0] && piece.to <= range[1]) : [];
}

/** The box `term` is drawn in, from the top-left of `src` laid out at `size`; undefined when it is not written there. */
export function mathTermBox(src: string, size: number, term: string): { x: number; y: number; w: number; h: number } | undefined {
  const marks = termPieces(layMath(src, size), src, term);
  if (marks.length === 0) return undefined;
  const x = Math.min(...marks.map((m) => m.x));
  const y = Math.min(...marks.map((m) => m.y));
  return { x, y, w: Math.max(...marks.map((m) => m.x + m.w)) - x, h: Math.max(...marks.map((m) => m.y + m.h)) - y };
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
  const m = layMath(src, size);
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
  drawPieces(ctx, m.pieces, ax, ay);
  ctx.restore();
}

/** Draw only `term` of a math expression, exactly where `drawMath` with the same position and style puts it. */
export function drawMathTerm(ctx: CanvasRenderingContext2D, src: string, term: string, x: number, y: number, style: MathStyle = {}) {
  const size = style.size ?? 28;
  const m = layMath(src, size);
  const ax = style.align === "center" ? x - m.w / 2 : style.align === "right" ? x - m.w : x;
  ctx.save();
  ctx.globalAlpha *= clamp01(style.alpha ?? 1);
  ctx.fillStyle = style.color ?? "#eef5ef";
  drawPieces(ctx, termPieces(m, src, term), ax, y - m.h / 2);
  ctx.restore();
}
