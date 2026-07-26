// src/gcl/expr.ts
/**
 * A safe, deterministic expression evaluator for author-supplied math strings (chart `fn`,
 * parametric `fx`/`fy`). NO `eval`/`Function` — hand-rolled tokenizer + shunting-yard → RPN,
 * then a pure evaluator closure over the RPN program. Parse errors never throw; the compiled
 * function simply yields `NaN` at call time so a bad author string degrades to "nothing drawn"
 * rather than crashing the render loop.
 */

type TokKind = "num" | "ident" | "op" | "lparen" | "rparen" | "comma";
interface Tok { kind: TokKind; text: string; value?: number }

const FUNCS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  exp: Math.exp,
  log: Math.log10,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (a, b) => Math.pow(a, b),
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

const OP_PREC: Record<string, number> = { "+": 2, "-": 2, "*": 3, "/": 3, "u-": 5, "^": 6 };
const OP_RIGHT_ASSOC: Record<string, boolean> = { "^": true, "u-": true };

// ── Tokenizer ────────────────────────────────────────────────────────────────────────────────────

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9" || (ch === "." && src[i + 1] >= "0" && src[i + 1] <= "9")) {
      let j = i;
      while (j < n && src[j] >= "0" && src[j] <= "9") j++;
      if (src[j] === ".") {
        j++;
        while (j < n && src[j] >= "0" && src[j] <= "9") j++;
      }
      // scientific notation: e/E followed by optional sign then digits
      if (src[j] === "e" || src[j] === "E") {
        let k = j + 1;
        if (src[k] === "+" || src[k] === "-") k++;
        if (src[k] >= "0" && src[k] <= "9") {
          k++;
          while (k < n && src[k] >= "0" && src[k] <= "9") k++;
          j = k;
        }
      }
      const text = src.slice(i, j);
      const value = Number(text);
      if (!isFinite(value)) throw new Error(`bad number literal: ${text}`);
      toks.push({ kind: "num", text, value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ kind: "ident", text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === "(") { toks.push({ kind: "lparen", text: ch }); i++; continue; }
    if (ch === ")") { toks.push({ kind: "rparen", text: ch }); i++; continue; }
    if (ch === ",") { toks.push({ kind: "comma", text: ch }); i++; continue; }
    if ("+-*/^".includes(ch)) { toks.push({ kind: "op", text: ch }); i++; continue; }
    throw new Error(`unexpected character "${ch}" at ${i}`);
  }
  return toks;
}

/** Insert an explicit "*" token wherever implicit multiplication is implied: 2x, 2(x+1), )(, )x, x( . */
function insertImplicitMultiplication(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const cur = toks[i];
    if (out.length > 0) {
      const prev = out[out.length - 1];
      const prevEndsValue = prev.kind === "num" || prev.kind === "rparen" || (prev.kind === "ident" && !(prev.text in FUNCS));
      const curStartsValue = cur.kind === "num" || cur.kind === "lparen" || cur.kind === "ident";
      if (prevEndsValue && curStartsValue) out.push({ kind: "op", text: "*" });
    }
    out.push(cur);
  }
  return out;
}

// ── Shunting-yard → RPN ──────────────────────────────────────────────────────────────────────────

type RpnItem =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "const"; value: number }
  | { kind: "op"; op: string }
  | { kind: "func"; name: string; argc: number };

function toRpn(toks: Tok[]): RpnItem[] {
  const output: RpnItem[] = [];
  const stack: (Tok & { argc?: number })[] = [];
  const argCounts: number[] = []; // tracks arg count for the function at the matching paren depth

  let prevKind: TokKind | "start" | "unary" = "start";

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === "num") {
      output.push({ kind: "num", value: t.value! });
      prevKind = "num";
    } else if (t.kind === "ident") {
      if (t.text in FUNCS) {
        stack.push({ ...t, argc: 1 });
        // will be incremented by commas encountered at this paren depth
        prevKind = "ident";
      } else if (t.text in CONSTS) {
        output.push({ kind: "const", value: CONSTS[t.text] });
        prevKind = "num";
      } else {
        output.push({ kind: "var", name: t.text });
        prevKind = "num";
      }
    } else if (t.kind === "op") {
      let opText = t.text;
      // unary minus: at start, after another operator, or after '(' or ','
      if (opText === "-" && (prevKind === "start" || prevKind === "op" || prevKind === "unary")) {
        opText = "u-";
      } else if (opText === "+" && (prevKind === "start" || prevKind === "op" || prevKind === "unary")) {
        // unary plus is a no-op; skip emitting anything
        prevKind = "unary";
        continue;
      }
      // Unary prefix operators (currently just "u-") must NOT run the normal pop loop: they are
      // right-associative prefix operators still waiting for their operand, so popping a
      // higher-precedence operator (e.g. a pending "^") here would corrupt the RPN — the "^"
      // would be emitted before its right operand exists. Just push and move on.
      if (opText === "u-") {
        stack.push({ kind: "op", text: opText });
        prevKind = "unary";
        continue;
      }
      while (
        stack.length > 0 &&
        stack[stack.length - 1].kind === "op" &&
        (OP_PREC[stack[stack.length - 1].text] > OP_PREC[opText] ||
          (OP_PREC[stack[stack.length - 1].text] === OP_PREC[opText] && !OP_RIGHT_ASSOC[opText]))
      ) {
        const top = stack.pop()!;
        output.push({ kind: "op", op: top.text });
      }
      stack.push({ kind: "op", text: opText });
      prevKind = opText === "u-" ? "unary" : "op";
    } else if (t.kind === "lparen") {
      stack.push(t);
      argCounts.push(1);
      prevKind = "start";
    } else if (t.kind === "comma") {
      if (argCounts.length === 0) throw new Error("unexpected comma");
      argCounts[argCounts.length - 1]++;
      while (stack.length > 0 && stack[stack.length - 1].kind !== "lparen") {
        const top = stack.pop()!;
        if (top.kind === "op") output.push({ kind: "op", op: top.text });
        else throw new Error("mismatched parens around comma");
      }
      prevKind = "op";
    } else if (t.kind === "rparen") {
      while (stack.length > 0 && stack[stack.length - 1].kind !== "lparen") {
        const top = stack.pop()!;
        if (top.kind === "op") output.push({ kind: "op", op: top.text });
        else throw new Error("mismatched parens");
      }
      if (stack.length === 0) throw new Error("mismatched parens");
      stack.pop(); // discard the lparen
      const argc = argCounts.pop() ?? 1;
      if (stack.length > 0 && stack[stack.length - 1].kind === "ident" && stack[stack.length - 1].text in FUNCS) {
        const fn = stack.pop()!;
        output.push({ kind: "func", name: fn.text, argc });
      }
      prevKind = "num";
    }
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.kind === "op") output.push({ kind: "op", op: top.text });
    else throw new Error("mismatched parens");
  }
  return output;
}

// ── Evaluator ────────────────────────────────────────────────────────────────────────────────────

function evalRpn(rpn: RpnItem[], vars: Record<string, number>): number {
  const st: number[] = [];
  for (const item of rpn) {
    if (item.kind === "num" || item.kind === "const") {
      st.push(item.value);
    } else if (item.kind === "var") {
      const v = vars[item.name];
      st.push(typeof v === "number" && isFinite(v) ? v : 0);
    } else if (item.kind === "op") {
      if (item.op === "u-") {
        const a = st.pop();
        if (a === undefined) throw new Error("stack underflow");
        st.push(-a);
        continue;
      }
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("stack underflow");
      switch (item.op) {
        case "+": st.push(a + b); break;
        case "-": st.push(a - b); break;
        case "*": st.push(a * b); break;
        case "/": st.push(a / b); break;
        case "^": st.push(Math.pow(a, b)); break;
        default: throw new Error(`unknown operator "${item.op}"`);
      }
    } else if (item.kind === "func") {
      const fn = FUNCS[item.name];
      if (!fn) throw new Error(`unknown function "${item.name}"`);
      const args: number[] = [];
      for (let k = 0; k < item.argc; k++) {
        const v = st.pop();
        if (v === undefined) throw new Error("stack underflow");
        args.unshift(v);
      }
      st.push(fn(...args));
    }
  }
  if (st.length !== 1) throw new Error("malformed expression");
  return st[0];
}

/**
 * Compile a math expression string into a pure `(vars) => number` evaluator. Parsing (tokenize +
 * shunting-yard) happens once, up front; the returned closure only walks the pre-built RPN program,
 * so repeated calls are cheap and deterministic (no shared mutable state between calls).
 *
 * On any parse error, returns a function that always yields `NaN` — callers (chart/parametric
 * render paths) should treat NaN samples as "nothing to draw" rather than throwing.
 */
export type ExpressionParseResult =
  | { valid: true; evaluate: (vars: Record<string, number>) => number }
  | { valid: false; error: string };

/** Parse an authored expression without hiding the failure from validators and LLM repair loops. */
export function parseExpr(src: string): ExpressionParseResult {
  let rpn: RpnItem[];
  try {
    const toks = insertImplicitMultiplication(tokenize(src));
    rpn = toRpn(toks);
    if (rpn.length === 0) throw new Error("empty expression");
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "invalid expression" };
  }
  return { valid: true, evaluate: (vars: Record<string, number>) => {
    try {
      return evalRpn(rpn, vars);
    } catch {
      return NaN;
    }
  } };
}

export function compileExpr(src: string): (vars: Record<string, number>) => number {
  const parsed = parseExpr(src);
  return parsed.valid ? parsed.evaluate : () => NaN;
}
