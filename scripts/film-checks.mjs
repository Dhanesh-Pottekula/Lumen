// Generic film checks for film-report.mjs: what the engine painted that no scene asked for, glows that
// are not on the thing they light, labels far from what they name, collisions with drawn silhouettes,
// motions that contradict what they state, jumps between scenes, symbol misuse and stale leftovers.
//
// Every paint is recorded off the engine's layer canvases with the engine function that made it and
// the component that was being drawn, so the checks read what was actually drawn, never a layout box.
import { createCanvas, Image } from "@napi-rs/canvas";

const ENGINE_FILE = /packages\/core\/dist\//;
const PAINT_OPS = new Set(["fill", "stroke", "fillRect", "strokeRect", "fillText", "strokeText", "drawImage"]);
// The draw loop reads a component's `type` from these functions just before painting it; the same read
// from inside a lookup (where another thing is, what it draws) is not the start of its paint.
const DRAW_ENTRY = new Set(["drawComponentInstance", "carried", "pinned", "map", "mapPoints"]);
const LOOKUP = /^(frameNow|live\w*|motionShift|resolveFocal|follow\w*|attnGeom|placeOf|pinCarry|markOf|halo|orbitCentre|geomOf|drawnStrokes|nothingToGlow)$/;

// ─── Recorder ────────────────────────────────────────────────────────────────────────────────────

/**
 * A canvas factory for `document.createElement` whose 2d contexts record every paint while `on`:
 * the op, its points in view units, text and font, the picture drawn, and the engine painters on
 * the stack. `owner` is the gcl component being drawn, set through `tag()`.
 */
export function createRecorder() {
  const rec = { on: false, ops: [], owner: null, unit: 1, warnings: new Set() };

  const painterNames = () => {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 24;
    const stack = new Error().stack ?? "";
    Error.stackTraceLimit = limit;
    const names = [];
    for (const line of stack.split("\n").slice(3)) {
      if (!ENGINE_FILE.test(line)) continue;
      const name = line.match(/at (?:async )?([\w$.<>]+) \(/)?.[1];
      if (name && names.at(-1) !== name) names.push(name.replace(/^Object\./, ""));
    }
    return names;
  };

  const wrap = (real) => {
    let path = [];
    let closed = false;
    const view = (x, y) => {
      const m = real.getTransform();
      return [(m.a * x + m.c * y + m.e) / rec.unit, (m.b * x + m.d * y + m.f) / rec.unit];
    };
    const current = () => path.at(-1)?.at(-1);
    const sampleArc = (cx, cy, rx, ry, rot, a0, a1, ccw) => {
      let sweep = a1 - a0;
      if (!ccw && sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI;
      if (ccw && sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI;
      if (Math.abs(sweep) > 2 * Math.PI) sweep = Math.sign(sweep) * 2 * Math.PI;
      const steps = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
      const out = [];
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (sweep * i) / steps;
        const [ux, uy] = [rx * Math.cos(a), ry * Math.sin(a)];
        out.push(view(cx + ux * Math.cos(rot) - uy * Math.sin(rot), cy + ux * Math.sin(rot) + uy * Math.cos(rot)));
      }
      return out;
    };
    const push = (points, fresh = false) => {
      if (fresh || path.length === 0) path.push([]);
      path.at(-1).push(...points);
    };
    const record = (op, args) => {
      const entry = { op, owner: rec.owner, painters: painterNames(), alpha: real.globalAlpha, lw: real.lineWidth };
      if (op === "fill" || op === "stroke") {
        const given = args[0];
        if (given && typeof given === "object" && typeof given.getBounds === "function") {
          const [l, t, r, b] = given.getBounds();
          entry.subpaths = [[view(l, t), view(r, t), view(r, b), view(l, b)]];
          entry.bounded = true;
        } else entry.subpaths = path.map((sub) => sub.slice());
        entry.closed = closed;
        entry.style = String(op === "fill" ? real.fillStyle : real.strokeStyle);
      } else if (op === "fillRect" || op === "strokeRect") {
        const [x, y, w, h] = args;
        entry.subpaths = [[view(x, y), view(x + w, y), view(x + w, y + h), view(x, y + h)]];
        entry.closed = true;
        entry.style = String(op === "fillRect" ? real.fillStyle : real.strokeStyle);
      } else if (op === "fillText" || op === "strokeText") {
        const [text, x, y] = args;
        const m = real.measureText(String(text));
        const left = -(m.actualBoundingBoxLeft ?? 0);
        const right = m.actualBoundingBoxRight ?? m.width;
        const top = -(m.actualBoundingBoxAscent ?? 0);
        const bottom = m.actualBoundingBoxDescent ?? 0;
        entry.text = String(text);
        entry.font = real.font;
        entry.subpaths = [[view(x + left, y + top), view(x + right, y + top), view(x + right, y + bottom), view(x + left, y + bottom)]];
        entry.style = String(real.fillStyle);
      } else if (op === "drawImage") {
        const [image, ...rest] = args;
        const src = typeof image?.src === "string" ? image.src : undefined;
        if (!src) return;
        const [dx, dy, dw, dh] = rest.length >= 8 ? rest.slice(4) : rest.length >= 4 ? rest : [rest[0], rest[1], image.width, image.height];
        entry.src = src;
        entry.image = image;
        entry.crop = rest.length >= 8 ? rest.slice(0, 4) : undefined;
        entry.natural = [image.width, image.height];
        entry.quad = [view(dx, dy), view(dx + dw, dy), view(dx + dw, dy + dh), view(dx, dy + dh)];
        entry.subpaths = [entry.quad];
      }
      rec.ops.push(entry);
    };
    const pathOps = {
      beginPath: () => {
        path = [];
        closed = false;
      },
      moveTo: (x, y) => push([view(x, y)], true),
      lineTo: (x, y) => push([view(x, y)]),
      closePath: () => {
        closed = true;
        const first = path.at(-1)?.[0];
        if (first) push([first]);
      },
      rect: (x, y, w, h) => push([view(x, y), view(x + w, y), view(x + w, y + h), view(x, y + h), view(x, y)], true),
      roundRect: (x, y, w, h) => push([view(x, y), view(x + w, y), view(x + w, y + h), view(x, y + h), view(x, y)], true),
      arc: (x, y, r, a0, a1, ccw) => push(sampleArc(x, y, r, r, 0, a0, a1, ccw)),
      ellipse: (x, y, rx, ry, rot, a0, a1, ccw) => push(sampleArc(x, y, rx, ry, rot, a0, a1, ccw)),
      arcTo: (x1, y1, x2, y2) => push([view(x1, y1), view(x2, y2)]),
      quadraticCurveTo: (cx, cy, x, y) => {
        const from = current();
        const to = view(x, y);
        const c = view(cx, cy);
        if (!from) return push([to]);
        const out = [];
        for (let i = 1; i <= 6; i++) {
          const u = i / 6;
          out.push([(1 - u) ** 2 * from[0] + 2 * (1 - u) * u * c[0] + u * u * to[0], (1 - u) ** 2 * from[1] + 2 * (1 - u) * u * c[1] + u * u * to[1]]);
        }
        push(out);
      },
      bezierCurveTo: (ax, ay, bx, by, x, y) => {
        const from = current();
        const [a, b, to] = [view(ax, ay), view(bx, by), view(x, y)];
        if (!from) return push([to]);
        const out = [];
        for (let i = 1; i <= 8; i++) {
          const u = i / 8;
          const k = [(1 - u) ** 3, 3 * (1 - u) ** 2 * u, 3 * (1 - u) * u * u, u ** 3];
          out.push([k[0] * from[0] + k[1] * a[0] + k[2] * b[0] + k[3] * to[0], k[0] * from[1] + k[1] * a[1] + k[2] * b[1] + k[3] * to[1]]);
        }
        push(out);
      },
    };
    const bound = new Map();
    return new Proxy(real, {
      get(target, prop) {
        const value = target[prop];
        if (typeof value !== "function") return value;
        let fn = bound.get(prop);
        if (!fn) {
          const native = value.bind(target);
          const tracked = pathOps[prop];
          fn = PAINT_OPS.has(prop)
            ? (...args) => {
                if (rec.on) record(prop, args);
                return native(...args);
              }
            : tracked
              ? (...args) => {
                  if (rec.on) tracked(...args);
                  return native(...args);
                }
              : native;
          bound.set(prop, fn);
        }
        return fn;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  };

  rec.canvas = (width = 300, height = 150) => {
    const canvas = createCanvas(width, height);
    const real = canvas.getContext.bind(canvas);
    let context;
    canvas.getContext = (kind, options) => (kind === "2d" ? (context ??= wrap(real(kind, options))) : real(kind, options));
    return canvas;
  };

  /** Marks every gcl component so a paint is credited to the component the draw loop was on. */
  rec.tag = (gcl) => {
    gcl.forEach((component, index) => {
      if (component.type === "scene") return;
      Object.defineProperty(component, "__index", { value: index, enumerable: false });
      // A cue reads its own layer just before it paints; a drawn thing is entered through its type.
      const cue = component.type === "attention";
      const key = cue ? ("layer" in component ? "layer" : "verb") : "type";
      const value = component[key];
      Object.defineProperty(component, key, {
        enumerable: true,
        configurable: true,
        get() {
          if (!rec.on) return value;
          if (cue) {
            rec.owner = component;
            return value;
          }
          const limit = Error.stackTraceLimit;
          Error.stackTraceLimit = 16;
          const names = (new Error().stack ?? "").split("\n").slice(2).map((line) => line.match(/at (?:Object\.)?([\w$]+) \(/)?.[1]);
          Error.stackTraceLimit = limit;
          if (DRAW_ENTRY.has(names[0]) && !names.some((name) => name && LOOKUP.test(name))) rec.owner = component;
          return value;
        },
      });
    });
  };

  /** Runs `paint` with recording on and returns what it painted. */
  rec.capture = (paint, unit) => {
    rec.ops = [];
    rec.owner = null;
    rec.unit = unit;
    rec.on = true;
    try {
      paint();
    } finally {
      rec.on = false;
    }
    return rec.ops;
  };

  // The engine warns once per thing, whoever was rendering then, so every warning is kept as it passes.
  const warn = console.warn;
  console.warn = (...args) => {
    rec.warnings.add(args.map(String).join(" "));
    warn(...args);
  };
  return rec;
}

// ─── Geometry ────────────────────────────────────────────────────────────────────────────────────

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const centre = (box) => [box.x + box.w / 2, box.y + box.h / 2];
const cosine = (a, b) => (a[0] * b[0] + a[1] * b[1]) / (len(a) * len(b) || 1);
const degreesBetween = (a, b) => (Math.acos(Math.max(-1, Math.min(1, cosine(a, b)))) * 180) / Math.PI;

function boxOf(points) {
  if (points.length === 0) return undefined;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : undefined;
}

function segmentDistance(p, a, b) {
  const ab = sub(b, a);
  const span = ab[0] ** 2 + ab[1] ** 2;
  const t = span ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / span)) : 0;
  return Math.hypot(p[0] - (a[0] + t * ab[0]), p[1] - (a[1] + t * ab[1]));
}

function pointBoxDistance(p, box) {
  const dx = Math.max(box.x - p[0], 0, p[0] - (box.x + box.w));
  const dy = Math.max(box.y - p[1], 0, p[1] - (box.y + box.h));
  return Math.hypot(dx, dy);
}

/** Points every `step` units along polylines, so distances are taken along the drawn line, not its corners. */
function densify(polylines, step = 3) {
  const out = [];
  for (const line of polylines) {
    for (let i = 0; i < line.length; i++) {
      out.push(line[i]);
      const next = line[i + 1];
      if (!next) continue;
      const n = Math.floor(len(sub(next, line[i])) / step);
      for (let k = 1; k < n; k++) out.push([line[i][0] + ((next[0] - line[i][0]) * k) / n, line[i][1] + ((next[1] - line[i][1]) * k) / n]);
    }
  }
  return out;
}

function segmentsCross(a, b, c, d) {
  const r = sub(b, a);
  const s = sub(d, c);
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denominator;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, at: [a[0] + t * r[0], a[1] + t * r[1]] } : undefined;
}

function insidePolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const shrink = (box, by) => ({ x: box.x + by, y: box.y + by, w: Math.max(0, box.w - 2 * by), h: Math.max(0, box.h - 2 * by) });
const boxCorners = (box) => [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]];

function lineCrossesBox(line, box) {
  for (let i = 0; i + 1 < line.length; i++) {
    if (pointBoxDistance(line[i], box) === 0 || pointBoxDistance(line[i + 1], box) === 0) return true;
    const corners = boxCorners(box);
    for (let k = 0; k < 4; k++) if (segmentsCross(line[i], line[i + 1], corners[k], corners[(k + 1) % 4])) return true;
  }
  return false;
}

function gridIn(box, columns, rows) {
  const out = [];
  for (let i = 0; i < columns; i++) for (let k = 0; k < rows; k++) out.push([box.x + ((i + 0.5) * box.w) / columns, box.y + ((k + 0.5) * box.h) / rows]);
  return out;
}

function directionVector(direction) {
  if (direction === "up") return [0, -1];
  if (direction === "down") return [0, 1];
  if (direction === "left") return [-1, 0];
  if (direction === "right") return [1, 0];
  // Degrees anticlockwise from pointing right, 90 up — the engine's DirectionToken.
  if (typeof direction === "number") return [Math.cos((direction * Math.PI) / 180), -Math.sin((direction * Math.PI) / 180)];
  return undefined;
}

// ─── Pictures: what of a drawn picture is opaque, from its own pixels ────────────────────────────

const masks = new WeakMap();
const MASK_SIDE = 72;

function maskOf(image) {
  let mask = masks.get(image);
  if (mask) return mask;
  const scale = MASK_SIDE / Math.max(image.width, image.height, 1);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  let opaque = 0;
  for (let i = 0; i < w * h; i++) {
    alpha[i] = data[i * 4 + 3] > 110 ? 1 : 0;
    opaque += alpha[i];
  }
  mask = { w, h, alpha, fraction: opaque / (w * h) };
  masks.set(image, mask);
  return mask;
}

/** A picture as drawn this frame: its quad on screen and a test for whether a point lands on ink. */
function pictureOf(op) {
  const mask = maskOf(op.image);
  const [c0, c1, , c3] = op.quad;
  const U = sub(c1, c0);
  const V = sub(c3, c0);
  const det = U[0] * V[1] - U[1] * V[0];
  const [sx, sy, sw, sh] = op.crop ?? [0, 0, op.natural[0], op.natural[1]];
  const uv = (p) => {
    const d = sub(p, c0);
    return [(d[0] * V[1] - d[1] * V[0]) / det, (U[0] * d[1] - U[1] * d[0]) / det];
  };
  const cell = (u, v) => {
    const x = Math.floor(((sx + u * sw) / op.natural[0]) * mask.w);
    const y = Math.floor(((sy + v * sh) / op.natural[1]) * mask.h);
    return x >= 0 && y >= 0 && x < mask.w && y < mask.h ? mask.alpha[y * mask.w + x] : 0;
  };
  const at = (u, v) => [c0[0] + u * U[0] + v * V[0], c0[1] + u * U[1] + v * V[1]];
  const box = boxOf(op.quad);
  const picture = {
    box,
    area: Math.abs(det) * mask.fraction,
    centre: at(0.5, 0.5),
    width: len(U),
    height: len(V),
    turn: (Math.atan2(U[1], U[0]) * 180) / Math.PI,
    inkAt: (p) => {
      if (!det) return 0;
      const [u, v] = uv(p);
      return u < 0 || v < 0 || u > 1 || v > 1 ? 0 : cell(u, v);
    },
  };
  let edge;
  picture.edge = () => {
    if (edge) return edge;
    edge = [];
    const n = 56;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const [u, v] = [(i + 0.5) / n, (k + 0.5) / n];
        if (!cell(u, v)) continue;
        const rim = [[u - 1 / n, v], [u + 1 / n, v], [u, v - 1 / n], [u, v + 1 / n]].some(([a, b]) => a < 0 || b < 0 || a > 1 || b > 1 || !cell(a, b));
        if (rim) edge.push(at(u, v));
      }
    }
    return edge;
  };
  return picture;
}

/** Ink shared by two pictures, in view units², sampled on a 3-unit grid over where their boxes meet. */
function sharedInk(a, b) {
  const x0 = Math.max(a.box.x, b.box.x);
  const y0 = Math.max(a.box.y, b.box.y);
  const x1 = Math.min(a.box.x + a.box.w, b.box.x + b.box.w);
  const y1 = Math.min(a.box.y + a.box.h, b.box.y + b.box.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  let shared = 0;
  for (let x = x0 + 1.5; x < x1; x += 3) for (let y = y0 + 1.5; y < y1; y += 3) if (a.inkAt([x, y]) && b.inkAt([x, y])) shared += 9;
  return shared;
}

// ─── Checks ──────────────────────────────────────────────────────────────────────────────────────

const LABEL_FAR = 40;
const LEADER_REACH = 12;
const GLOW_OFF = 14;
const GLOW_ON = 9;
// A picture's glow rides its traced silhouette a little outside the ink, so it is allowed further off.
const GLOW_OFF_PICTURE = 22;
const JUMP = 24;
const SLOT_JUMP = 40;
const SCALE_JUMP = 0.15;
const UNITS = new Set(["m", "s", "kg", "g", "mg", "km", "cm", "mm", "nm", "μm", "N", "kN", "J", "kJ", "W", "kW", "MW", "V", "mV", "A", "mA", "Ω", "kΩ", "mol", "K", "°C", "°F", "C", "Hz", "kHz", "Pa", "kPa", "L", "mL", "ml", "h", "min", "rad", "eV", "lb", "ft", "mph", "kWh", "m/s", "km/h", "m²", "m³", "s²", "cm²", "cm³"]);
const ARROW_KINDS = new Set(["vector", "forces", "diagram", "flow", "timeline"]);
const WRITING = new Set(["text", "equation", "measure"]);
const PANELS = new Set(["chart", "table", "timeline", "legend", "compare", "evidence", "scale", "working", "question"]);
const DIRECTION_WORDS = /\b(upwards?|up|downwards?|down|backwards?|forwards?|towards?|away|opposite)\b/gi;
// "speeds up", "slows down": a word of degree, not of direction.
const PHRASAL = /\b(speed|speeds|sped|slow|slows|set|sets|make|makes|pick|picks|add|adds|sum|sums|end|ends|show|shows|look|looks|line|lines|give|gives|take|takes|break|breaks|calm|shut|write|writes|cool|cools|settle|settles|narrow|boil|boils|wind|winds|step|steps|build|builds|heat|heats|warm|warms|use|uses|used|fill|fills|back|turn|turns|count|counts|sit|sits|stand|stands|wake|wakes|grow|grows|wrap|wraps|bring|brings|put|puts|weigh|weighs|lay|lays|wear|wears|shake|shakes|track|tracks|keep|keeps|catch|catches|let|lets|pass|passes|pay|pays|open|opens|tie|ties|hold|holds|clean|cleans|run|runs)\s*$/i;

const rootOf = (id) => String(id ?? "").split(".")[0];
const keyOf = (component) => (component ? (component.id ?? `@${component.__index}`) : "-");
const nameOf = (component) => (component?.type !== "attention" ? keyOf(component) : component.verb === "callout" ? `label "${component.text}"→${component.target}` : `${component.verb} on ${component.target}`);
const fmt = (n) => Math.round(n);

/**
 * Runs every generic check on one rendered film and reports each finding through `flag(kind, detail)`.
 * `result` is renderLessonSpec's; the recorder must be the one serving `document.createElement`, its
 * `warnings` cleared before the film was compiled.
 */
export function genericChecks({ result, recorder, flag }) {
  recorder.tag(result.gcl);
  const gclScenes = [];
  for (const component of result.gcl) {
    if (component.type === "scene") gclScenes.push([]);
    else gclScenes.at(-1)?.push(component);
  }
  if (gclScenes.length !== result.resolved.scenes.length) {
    flag("checksSkipped", `gcl has ${gclScenes.length} scenes, the lesson ${result.resolved.scenes.length}`);
    return;
  }
  const viewW = result.slide.viewW ?? 540;
  const viewH = result.slide.viewH ?? 960;
  const canvas = createCanvas(viewW, viewH);
  const ctx = canvas.getContext("2d");
  const filmIds = new Set(result.lesson.scenes.flatMap((scene) => scene.objects.map((o) => o.id)));
  const once = new Set();
  const report = (kind, detail, key = detail) => {
    if (once.has(`${kind}|${key}`)) return;
    once.add(`${kind}|${key}`);
    flag(kind, detail);
  };

  const scenes = result.lesson.scenes.map((scene, index) => sceneOf(scene, index));
  for (const scene of scenes) {
    injectedVisual(scene);
    glowFallback(scene);
    labelFar(scene);
    outlineCollision(scene);
    motionMismatch(scene);
    symbolSanity(scene);
    staleOnScreen(scene);
  }
  for (let i = 0; i + 1 < scenes.length; i++) continuityJump(scenes[i], scenes[i + 1]);

  // ─── Scene context ───

  function sceneOf(lessonScene, index) {
    const resolved = result.resolved.scenes[index];
    const window = result.slide.scenes[index];
    const duration = window.end - window.start;
    const components = gclScenes[index];
    const drawn = components.filter((c) => c.type !== "attention" && c.type !== "camera");
    const cues = components.filter((c) => c.type === "attention");
    const byId = new Map(drawn.filter((c) => c.id).map((c) => [c.id, c]));
    const sources = new Map(lessonScene.objects.map((o) => [o.id, o]));
    const actions = resolved.beats.flatMap((beat) => beat.actions.map((action) => ({ ...action, beat })));
    const frames = new Map();
    const shoot = (t) => {
      const at = Math.max(0.02, Math.min(duration - 0.02, t));
      const key = at.toFixed(2);
      if (!frames.has(key)) {
        const ops = recorder.capture(() => {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = "#FAFAFA";
          ctx.fillRect(0, 0, viewW, viewH);
          result.slide.render(ctx, window.start + at);
        }, 1);
        frames.set(key, frameOf(ops, at));
      }
      return frames.get(key);
    };
    const shown = new Map();
    const gone = new Map();
    for (const object of lessonScene.objects) if (object.initial === "visible") shown.set(object.id, 0);
    for (const action of actions) {
      for (const id of action.source.targets ?? []) {
        if (action.kind === "show" && !shown.has(id)) shown.set(id, action.start);
        if (action.kind === "hide" && !gone.has(id)) gone.set(id, action.start);
      }
    }
    const restTimes = resolved.beats.map((beat, i) => {
      const next = resolved.beats[i + 1];
      return Math.max(beat.start + 0.05, Math.min(beat.end, next ? next.start : duration) - 0.05);
    });
    const motions = [];
    for (const component of drawn) {
      const asked = actions.filter((a) => a.kind === "motion" && a.source.target === component.id);
      (component.motions ?? []).forEach((motion, j) => {
        const at = typeof motion.at === "number" ? motion.at : component.start ?? 0;
        if (typeof motion.dur !== "number") return;
        const action = asked.find((a) => Math.abs(a.start - at) < 0.06) ?? asked[j];
        motions.push({ component, motion, at, end: at + motion.dur, action });
      });
    }
    const cueAction = (cue) =>
      actions.find((a) => (a.kind === "label" || a.kind === "attention") && a.source.target === cue.target && Math.abs(a.start - (cue.start ?? 0)) < 0.06);
    const scene = { id: lessonScene.id, index, lessonScene, resolved, duration, drawn, cues, byId, sources, actions, shoot, shown, gone, restTimes, motions, cueAction };
    scene.ties = tiesOf(scene);
    return scene;
  }

  /** Everything one frame painted, grouped by the component that painted it. */
  function frameOf(ops, t) {
    const owners = new Map();
    for (const op of ops) {
      const key = keyOf(op.owner);
      if (!owners.has(key)) owners.set(key, { component: op.owner, ops: [] });
      owners.get(key).ops.push(op);
    }
    const pictures = new Map();
    const texts = new Map();
    const strokes = new Map();
    for (const [key, { component, ops: painted }] of owners) {
      if (!component) continue;
      const images = painted.filter((op) => op.op === "drawImage" && op.image);
      if (images.length) {
        const largest = images.reduce((a, b) => (boxOf(b.quad).w * boxOf(b.quad).h > boxOf(a.quad).w * boxOf(a.quad).h ? b : a));
        pictures.set(key, { ...pictureOf(largest), key, component, src: largest.src });
      }
      const writing = painted.filter((op) => op.op === "fillText" && op.text.trim());
      if (writing.length) texts.set(key, { key, component, box: boxOf(writing.flatMap((op) => op.subpaths[0])), ops: writing });
      if (component.type !== "attention") {
        const lines = painted.filter((op) => op.op === "stroke" && !op.bounded && !op.painters.includes("fadeText")).flatMap((op) => op.subpaths.filter((s) => s.length > 1));
        if (lines.length) strokes.set(key, { key, component, lines });
      }
    }
    return { t, ops, owners, pictures, texts, strokes };
  }

  /** Pairs of things that are meant to touch: anchored, attached, framed on, joined by, or riding one another. */
  function tiesOf(scene) {
    const ties = new Map();
    const tie = (a, b) => {
      if (!a || !b || a === b) return;
      for (const [x, y] of [[a, b], [b, a]]) {
        if (!ties.has(x)) ties.set(x, new Set());
        ties.get(x).add(y);
      }
    };
    // What a thing sits on: the picture whose part it is placed at, what it is anchored on or in, or the frame it is drawn in.
    const sitsOn = (object) => {
      const placement = object?.placement ?? {};
      const onPart = String(placement.target ?? "").includes(".") && scene.sources.get(rootOf(placement.target))?.kind === "image";
      if (placement.target && (onPart || placement.mode === "anchor" || placement.relation === "on" || placement.relation === "inside")) return rootOf(placement.target);
      const frame = object?.in ?? object?.frame;
      return typeof frame === "string" ? rootOf(frame) : undefined;
    };
    for (const object of scene.lessonScene.objects) {
      const placement = object.placement ?? {};
      tie(object.id, sitsOn(object));
      // Placed beside something that sits on a picture puts it on that picture too, though never on its neighbour.
      let neighbour = placement.target && !sitsOn(object) ? scene.sources.get(rootOf(placement.target)) : undefined;
      for (let hop = 0; neighbour && hop < 3; hop++) {
        const ground = sitsOn(neighbour);
        if (ground) tie(object.id, ground);
        neighbour = ground ? undefined : scene.sources.get(rootOf(neighbour.placement?.target));
      }
      for (const ref of [object.frame, object.in, object.from, object.to, object.at, object.attach?.to]) if (typeof ref === "string") tie(object.id, rootOf(ref));
    }
    for (const action of scene.actions) {
      const source = action.source;
      if (source.do === "motion") {
        // A traveller on a route is meant to reach what the route joins.
        const route = scene.sources.get(source.along);
        for (const ref of [source.along, source.to, source.around, route?.from, route?.to, ...(source.with ?? []), ...(source.through ?? [])]) if (typeof ref === "string" && scene.sources.has(rootOf(ref))) tie(source.target, rootOf(ref));
      }
    }
    // A picture hidden as another is shown in the same beat is replaced by it: what sat on one sits on the other.
    for (const hide of scene.actions.filter((a) => a.kind === "hide")) {
      for (const show of scene.actions.filter((a) => a.kind === "show" && a.beat === hide.beat)) {
        for (const old of hide.source.targets ?? []) {
          for (const fresh of show.source.targets ?? []) {
            if (scene.sources.get(old)?.kind !== "image" || scene.sources.get(fresh)?.kind !== "image") continue;
            tie(old, fresh);
            for (const other of ties.get(old) ?? []) tie(other, fresh);
          }
        }
      }
    }
    return ties;
  }
  function tied(scene, a, b) {
    return rootOf(a) === rootOf(b) || (scene.ties.get(rootOf(a))?.has(rootOf(b)) ?? false);
  }

  /** The object a piece of writing names: a label's target, or what a text is placed against. */
  function referentOf(scene, item) {
    if (item.component.type === "attention") return rootOf(item.component.target);
    const source = scene.sources.get(item.key);
    return rootOf(source?.placement?.target ?? source?.attach?.to);
  }

  /** What is actually drawn for a target this frame: a picture's ink, a traced outline or stroke, or a box. */
  function geometryOf(scene, frame, target) {
    const root = rootOf(target);
    const part = String(target).slice(root.length + 1);
    const picture = frame.pictures.get(root);
    if (part) {
      const side = part.match(/^s(\d+)(?:@([\d.]+))?$/);
      const corner = part.match(/^v(\d+)$/);
      const line = frame.strokes.get(root)?.lines[0] ?? scene.byId.get(root)?.points;
      if ((side || corner) && line?.length > 1) {
        const i = Number((side ?? corner)[1]) % line.length;
        if (corner) return { kind: "lines", lines: [[line[i], line[i]]] };
        const [a, b] = [line[i], line[(i + 1) % line.length]];
        const t = side[2] === undefined ? undefined : Number(side[2]);
        return { kind: "lines", lines: t === undefined ? [[a, b]] : [[[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]]] };
      }
      const piece = frame.texts.get(target);
      if (piece) return { kind: "box", box: piece.box, writing: true };
      const region = scene.byId.get(target);
      const owner = scene.byId.get(root);
      if (picture && region?.type === "region") {
        // A part goes wherever its picture is now: moved, turned and scaled with it from where both rested.
        const rest = owner?.at ?? picture.centre;
        const turn = ((picture.turn - ((owner?.rotate ?? 0) * 180) / Math.PI) * Math.PI) / 180;
        const scale = owner?.w ? picture.width / owner.w : 1;
        const [cos, sin] = [Math.cos(turn) * scale, Math.sin(turn) * scale];
        const live = (p) => {
          const [dx, dy] = sub(p, rest);
          return [picture.centre[0] + dx * cos - dy * sin, picture.centre[1] + dx * sin + dy * cos];
        };
        if (region.outline?.length > 2) return { kind: "lines", lines: [[...region.outline, region.outline[0]].map(live)] };
        if (region.at && region.w) {
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => live([region.at[0] + (u * region.w) / 2, region.at[1] + (v * region.h) / 2]));
          return { kind: "box", box: boxOf(corners), untraced: true };
        }
      }
      const drawnPiece = frame.strokes.get(target);
      if (drawnPiece) return { kind: "lines", lines: drawnPiece.lines };
      if (WRITING.has(scene.sources.get(root)?.kind) || scene.sources.get(root)?.kind === "working") {
        const text = frame.texts.get(root);
        if (text) return { kind: "box", box: text.box, writing: true };
      }
    }
    if (picture) return { kind: "picture", picture };
    if (PANELS.has(scene.sources.get(root)?.kind)) {
      const box = boxOf((frame.owners.get(root)?.ops ?? []).flatMap((op) => op.subpaths?.flat() ?? []));
      if (box) return { kind: "box", box };
    }
    const stroke = frame.strokes.get(root);
    if (stroke) return { kind: "lines", lines: stroke.lines };
    const text = frame.texts.get(root);
    if (text) return { kind: "box", box: text.box, writing: true };
    const laid = scene.resolved.objects.find((o) => o.id === target) ?? scene.resolved.objects.find((o) => o.id === root);
    return laid?.box ? { kind: "box", box: laid.box, layout: true } : undefined;
  }

  function boxToGeometry(box, geometry) {
    if (geometry.kind === "picture") {
      if (gridIn(box, 6, 3).some((p) => geometry.picture.inkAt(p))) return 0;
      return Math.min(...geometry.picture.edge().map((p) => pointBoxDistance(p, box)));
    }
    if (geometry.kind === "lines") {
      const points = densify(geometry.lines);
      const closed = geometry.lines.filter((line) => line.length > 3 && len(sub(line[0], line.at(-1))) < 2);
      if (closed.some((line) => insidePolygon(centre(box), line))) return 0;
      return Math.min(...points.map((p) => pointBoxDistance(p, box)));
    }
    const g = geometry.box;
    return Math.hypot(Math.max(0, g.x - (box.x + box.w), box.x - (g.x + g.w)), Math.max(0, g.y - (box.y + box.h), box.y - (g.y + g.h)));
  }

  function pointToGeometry(p, geometry, solid = false) {
    if (geometry.kind === "picture") return solid && geometry.picture.inkAt(p) ? 0 : Math.min(...geometry.picture.edge().map((q) => len(sub(p, q))));
    if (geometry.kind === "lines") {
      if (solid && geometry.lines.some((line) => line.length > 3 && len(sub(line[0], line.at(-1))) < 2 && insidePolygon(p, line))) return 0;
      let best = Infinity;
      for (const line of geometry.lines) for (let i = 0; i + 1 < line.length; i++) best = Math.min(best, segmentDistance(p, line[i], line[i + 1]));
      return best;
    }
    const b = geometry.box;
    const inside = pointBoxDistance(p, b) === 0;
    if (inside && solid) return 0;
    return inside ? Math.min(p[0] - b.x, b.x + b.w - p[0], p[1] - b.y, b.y + b.h - p[1]) : pointBoxDistance(p, b);
  }

  /** The moment a cue is fully drawn and still up. */
  function cueSettled(cue) {
    const start = cue.start ?? 0;
    const out = cue.exit?.out ?? start + (cue.dur ?? 0) + 0.5;
    return Math.max(start + 0.02, Math.min(start + (cue.dur ?? 0), out - 0.03));
  }

  function everyFrame(scene) {
    const times = [...scene.restTimes];
    for (const c of scene.drawn) if (c.enter?.dur > 0.15) times.push((c.start ?? 0) + c.enter.dur * 0.5);
    for (const cue of scene.cues) times.push(cueSettled(cue));
    for (const m of scene.motions) times.push(m.at + 0.02, m.end - 0.02);
    return [...new Set(times.map((t) => t.toFixed(2)))].map(Number).map(scene.shoot);
  }

  function restFrames(scene) {
    return [...scene.restTimes.map(scene.shoot), ...scene.motions.map((m) => scene.shoot(m.end - 0.02))];
  }

  // ─── 1. injectedVisual ───

  function injectedVisual(scene) {
    for (const frame of everyFrame(scene)) {
      for (const op of frame.ops) {
        const key = keyOf(op.owner);
        const source = scene.sources.get(rootOf(op.owner?.id));
        if (op.painters.includes("drawPenNib") && !source?.pen) report("injectedVisual", `${scene.id}:${key}: pen nib (arrowhead tip) while drawing`, `${scene.id}:${key}:nib`);
        if (op.painters.includes("drawMarker") && op.owner?.type === "attention") {
          const asked = scene.cueAction(op.owner)?.source;
          if (!asked?.marker && !asked?.targetMarker) report("injectedVisual", `${scene.id}:label "${op.owner.text ?? ""}"→${op.owner.target}: dot at the leader's end nobody asked for`, `${scene.id}:${op.owner.target}:marker`);
        }
        if (op.painters.some((p) => /fallback|placeholder/i.test(p))) report("injectedVisual", `${scene.id}:${key}: fallback paint (${op.painters[0]})`, `${scene.id}:${key}:fallback`);
      }
      for (const [key, { component }] of frame.owners) {
        if (!component?.id || component.type === "attention" || component.type === "region") continue;
        const root = rootOf(component.id);
        // An engine piece of an asked-for object (`tri~was`, a morph's ghost; `f-parts`) is that object's own.
        const base = root.split("~")[0];
        if (!filmIds.has(base) && ![...filmIds].some((id) => base.startsWith(`${id}-`))) report("injectedVisual", `${scene.id}:${key}: drawn but no scene object asked for it`, `${scene.id}:${key}:auto`);
      }
    }
  }

  // ─── 2. glowFallback ───

  function glowFallback(scene) {
    for (const cue of scene.cues) {
      const frame = scene.shoot(cueSettled(cue));
      const glow = (frame.owners.get(keyOf(cue))?.ops ?? []).filter((op) => op.painters.some((p) => /glow|halo|circumscribe/i.test(p)) && op.subpaths?.length);
      // The engine says so when a cue has nothing drawn to glow along: the viewer sees no cue at all.
      const silent = [...recorder.warnings].find((w) => w.includes(`"${cue.target}"`) && /glow/i.test(w));
      if (glow.length === 0 && silent) report("glowMissing", `${scene.id}:${cue.verb} ${cue.target}: nothing drawn to glow along, no glow shown`);
      if (glow.length === 0) continue;
      const geometry = geometryOf(scene, frame, cue.target);
      // A chart, table, timeline or key is a panel: a frame round it is its own outline.
      if (!geometry || geometry.writing || PANELS.has(scene.sources.get(rootOf(cue.target))?.kind)) continue;
      const points = densify(glow.flatMap((op) => op.subpaths), 4);
      const distances = points.map((p) => pointToGeometry(p, geometry)).filter(Number.isFinite).sort((a, b) => a - b);
      if (distances.length === 0) continue;
      const off = distances[Math.floor(distances.length * 0.8)] ?? 0;
      const box = boxOf(points);
      const onBox = points.filter((p) => Math.min(Math.abs(p[0] - box.x), Math.abs(p[0] - box.x - box.w), Math.abs(p[1] - box.y), Math.abs(p[1] - box.y - box.h)) < 3).length / points.length;
      const shape = onBox > 0.85 ? "a box" : "a traced line";
      // A box is the fallback unless the thing drawn is itself that box: most of it must lie on the drawing.
      const onDrawing = distances.filter((d) => d <= GLOW_ON).length / distances.length;
      const fallback = shape === "a box" ? onDrawing < 0.5 : off > (geometry.kind === "picture" ? GLOW_OFF_PICTURE : GLOW_OFF);
      if (geometry.untraced) report("glowFallback", `${scene.id}:${cue.verb} ${cue.target}: part has no traced outline, glow drawn as ${shape}`);
      else if (fallback) report("glowFallback", `${scene.id}:${cue.verb} ${cue.target}: glow is ${shape} ${fmt(off)}u off what is drawn`);
    }
  }

  // ─── 3. labelFar ───

  function labelFar(scene) {
    const check = (frame, item, target, what) => {
      const geometry = geometryOf(scene, frame, target);
      if (!geometry || geometry.layout) return;
      const distance = boxToGeometry(item.box, geometry);
      if (!Number.isFinite(distance) || distance <= LABEL_FAR) return;
      const leader = (frame.owners.get(item.key)?.ops ?? [])
        .filter((op) => op.op === "stroke" && (op.painters.includes("callout") || op.painters.includes("pointerLine")))
        .flatMap((op) => op.subpaths)
        .filter((line) => line.length > 1 && len(sub(line.at(-1), line[0])) > 8);
      const reach = leader.length ? Math.min(...leader.flatMap((line) => [line[0], line.at(-1)]).map((p) => pointToGeometry(p, geometry, true))) : Infinity;
      if (reach <= LEADER_REACH) return;
      report("labelFar", `${scene.id}:"${what}"→${target}: ${fmt(distance)}u from it${leader.length ? `, leader ends ${fmt(reach)}u off` : ", no leader"}`);
    };
    for (const cue of scene.cues) {
      if (cue.verb !== "callout") continue;
      const frame = scene.shoot(cueSettled(cue));
      const item = frame.texts.get(keyOf(cue));
      if (item) check(frame, item, cue.target, cue.text ?? item.ops.map((op) => op.text).join(""));
    }
    for (const component of scene.drawn) {
      const source = scene.sources.get(component.id);
      const target = source?.placement?.target ?? source?.attach?.to;
      if (!target || !WRITING.has(source.kind) || source.role === "hud") continue;
      const t = scene.restTimes.find((rest) => rest >= (scene.shown.get(component.id) ?? Infinity) && rest < (scene.gone.get(component.id) ?? Infinity));
      if (t === undefined) continue;
      const frame = scene.shoot(t);
      const item = frame.texts.get(component.id);
      if (item) check(frame, item, target, source.text ?? source.value ?? component.id);
    }
  }

  // ─── 4. outlineCollision ───

  function collisions(scene, frame) {
    const found = [];
    const writing = [...frame.texts.values()];
    const pictures = [...frame.pictures.values()];
    for (const text of writing) {
      const named = referentOf(scene, text);
      const box = shrink(text.box, 1);
      for (const picture of pictures) {
        if (picture.key === text.key || picture.key === named || tied(scene, text.key, picture.key) || (named && tied(scene, named, picture.key))) continue;
        const points = gridIn(box, 8, 3);
        const hit = points.filter((p) => picture.inkAt(p)).length / points.length;
        if (hit >= 0.25) found.push({ a: text.key, b: picture.key, what: `text on ${picture.key}'s drawing (${fmt(hit * 100)}%)`, share: hit });
      }
      for (const stroke of frame.strokes.values()) {
        if (stroke.key === text.key || stroke.key === named || rootOf(stroke.key) === named || tied(scene, text.key, stroke.key) || (named && tied(scene, named, stroke.key))) continue;
        if (stroke.lines.some((line) => lineCrossesBox(line, shrink(text.box, 2)))) found.push({ a: text.key, b: stroke.key, what: `text crossed by ${stroke.key}'s stroke`, share: 1 });
      }
    }
    for (let i = 0; i < pictures.length; i++) {
      for (let j = i + 1; j < pictures.length; j++) {
        const [p, q] = [pictures[i], pictures[j]];
        if (tied(scene, p.key, q.key)) continue;
        const ink = sharedInk(p, q);
        const share = ink / Math.max(1, Math.min(p.area, q.area));
        if (ink > 60 && share > 0.06) found.push({ a: p.key, b: q.key, what: `drawings overlap (${fmt(share * 100)}% of the smaller)`, share });
      }
    }
    for (const picture of pictures) {
      for (const stroke of frame.strokes.values()) {
        if (stroke.key === picture.key || tied(scene, picture.key, stroke.key)) continue;
        const inside = densify(stroke.lines, 3).filter((p) => picture.inkAt(p)).length * 3;
        if (inside >= 18) found.push({ a: picture.key, b: stroke.key, what: `${stroke.key}'s stroke runs ${fmt(inside)}u over the drawing`, share: inside / 100 });
      }
    }
    return found;
  }

  function outlineCollision(scene) {
    const moments = [...scene.restTimes.map((t) => ({ t, at: "rest" })), ...scene.motions.map((m) => ({ t: m.end - 0.02, at: `end of ${m.component.id}'s ${m.motion.kind}` }))];
    for (const { t, at } of moments) {
      for (const hit of collisions(scene, scene.shoot(t))) report("outlineCollision", `${scene.id}:${hit.a}×${hit.b}: ${hit.what} at ${at}`, `${scene.id}:${[hit.a, hit.b].sort().join("×")}`);
    }
  }

  // ─── 5. motionMismatch / narrationDirection ───

  function journeyOf(scene, m) {
    const key = m.component.id;
    const where = (t) => {
      const frame = scene.shoot(t);
      const picture = frame.pictures.get(key);
      if (picture) return picture.centre;
      const painted = frame.owners.get(key)?.ops.flatMap((op) => op.subpaths?.flat() ?? []) ?? [];
      const box = boxOf(painted);
      return box && centre(box);
    };
    let from = where(m.at + 0.02);
    let to = where(m.end - 0.02);
    if (!from || !to) {
      const path = m.motion.path;
      from = path?.[0] ?? m.component.at;
      to = m.motion.to ?? path?.at(-1);
    }
    return from && to ? { from, to, d: sub(to, from) } : undefined;
  }

  function placeOf(scene, frame, ref) {
    const geometry = geometryOf(scene, frame, ref);
    if (!geometry) return undefined;
    if (geometry.kind === "picture") return geometry.picture.centre;
    if (geometry.kind === "box") return centre(geometry.box);
    return centre(boxOf(geometry.lines.flat()));
  }

  function motionMismatch(scene) {
    const journeys = new Map();
    for (const m of scene.motions) {
      if (!["move", "along", "fall", "path"].includes(m.motion.kind)) continue;
      const journey = journeyOf(scene, m);
      if (journey) journeys.set(m, journey);
    }
    for (const [m, journey] of journeys) {
      const source = m.action?.source ?? {};
      const frame = scene.shoot(m.at + 0.02);
      const intents = [];
      const direction = directionVector(source.direction);
      if (direction) intents.push({ why: `direction ${source.direction}`, v: direction });
      if (source.toward) {
        const there = placeOf(scene, frame, source.toward);
        if (there) intents.push({ why: `toward ${source.toward}`, v: sub(there, journey.from) });
      }
      if (source.away) {
        const there = placeOf(scene, frame, source.away);
        if (there) intents.push({ why: `away from ${source.away}`, v: sub(journey.from, there) });
      }
      if (source.opposite) {
        const other = [...journeys].find(([n]) => n.component.id === source.opposite && Math.abs(n.at - m.at) < 1.5);
        if (other) intents.push({ why: `opposite ${source.opposite}`, v: [-other[1].d[0], -other[1].d[1]] });
      }
      const route = source.along && scene.byId.get(source.along);
      const arrow = route?.arrow ?? scene.sources.get(source.along)?.arrow;
      const routeLine = route && (scene.shoot(m.end - 0.02).strokes.get(route.id)?.lines[0] ?? route.points);
      if (routeLine?.length > 1 && (arrow === "end" || arrow === "start")) {
        const [tail, head] = arrow === "end" ? [routeLine[0], routeLine.at(-1)] : [routeLine.at(-1), routeLine[0]];
        intents.push({ why: `${source.along}'s arrow`, v: sub(head, tail) });
      }
      if (source.to && scene.sources.has(rootOf(source.to))) {
        const there = placeOf(scene, frame, source.to);
        if (there && len(sub(there, journey.from)) > 8) intents.push({ why: `to ${source.to}`, v: sub(there, journey.from) });
      }
      const moved = len(journey.d);
      const asked = source.do === "motion";
      if (asked && moved < 4) {
        report("motionMismatch", `${scene.id}:${m.component.id} ${m.motion.kind}${source.to ? ` to ${source.to}` : ""}: barely moves (${moved.toFixed(1)}u)`);
        continue;
      }
      for (const intent of intents) {
        if (len(intent.v) < 1e-3) continue;
        const angle = degreesBetween(journey.d, intent.v);
        if (angle >= 135) report("motionMismatch", `${scene.id}:${m.component.id}: reversed — ${intent.why} but moves the other way (${fmt(angle)}°)`);
        else if (angle > 45) report("motionMismatch", `${scene.id}:${m.component.id}: ${intent.why} but moves ${fmt(angle)}° off it`);
      }
    }
    narrationDirection(scene, journeys);
  }

  /** The words the voice says while a beat plays: its `say`, on to the next beat's `say` or the sentence end. */
  function clauseOf(scene, beatIndex) {
    const narration = scene.lessonScene.narration ?? "";
    const beat = scene.lessonScene.beats[beatIndex];
    const lower = narration.toLowerCase();
    const say = (beat?.say ?? "").toLowerCase();
    const start = say ? lower.indexOf(say) : -1;
    if (start === -1) return say;
    const next = scene.lessonScene.beats.slice(beatIndex + 1).map((b) => (b.say ? lower.indexOf(b.say.toLowerCase(), start + say.length) : -1)).find((i) => i > -1);
    const stop = lower.slice(start + say.length).search(/[.!?;]/);
    const end = Math.min(next ?? Infinity, stop === -1 ? Infinity : start + say.length + stop);
    return narration.slice(start, Number.isFinite(end) ? end : undefined);
  }

  function narrationDirection(scene, journeys) {
    const said = [];
    scene.lessonScene.beats.forEach((beat, beatIndex) => {
      const movers = [...journeys].filter(([m]) => m.action?.beat?.id === beat.id);
      if (movers.length === 0) return;
      const clause = clauseOf(scene, beatIndex);
      for (const hit of clause.matchAll(DIRECTION_WORDS)) {
        if (PHRASAL.test(clause.slice(0, hit.index))) continue;
        const word = { upward: "up", downward: "down", towards: "toward", backwards: "backward", forwards: "forward" }[hit[1].toLowerCase().replace(/s$/, "")] ?? hit[1].toLowerCase().replace(/s$/, "");
        const named = movers.filter(([m]) => m.component.id.split(/[-_]/).some((w) => w.length > 2 && clause.toLowerCase().includes(w)));
        for (const [m, journey] of named.length ? named : movers) said.push({ m, journey, word, clause, after: clause.slice(hit.index + hit[0].length) });
      }
    });
    const say = (entry, why) => report("narrationDirection", `${scene.id}:${entry.m.component.id}: says "${entry.clause.trim().slice(0, 60)}" but ${why}`, `${scene.id}:${entry.m.component.id}:${entry.word}:${why.split(" ").slice(0, 3).join(" ")}`);
    for (const entry of said) {
      const { d, from } = entry.journey;
      if (len(d) < 4) continue;
      if (entry.word === "up" && d[1] > 8) say(entry, `moves down ${fmt(d[1])}u`);
      if (entry.word === "down" && d[1] < -8) say(entry, `moves up ${fmt(-d[1])}u`);
      const facing = directionVector(scene.sources.get(entry.m.component.id)?.facing);
      if ((entry.word === "forward" || entry.word === "backward") && facing) {
        const along = cosine(d, facing) * (entry.word === "forward" ? 1 : -1);
        if (along < -0.3) say(entry, `moves ${entry.word === "forward" ? "against" : "along"} its facing`);
      }
      const anchor = scene.sources.get(entry.m.component.id)?.placement?.target ?? scene.sources.get(entry.m.component.id)?.attach?.to;
      const nameAfter = (text) => [...scene.sources.keys()].find((id) => id !== entry.m.component.id && id.split(/[-_]/).some((w) => w.length > 2 && text.toLowerCase().split(/\s+/).slice(0, 4).join(" ").includes(w)));
      if (entry.word === "toward") {
        const target = nameAfter(entry.after);
        const there = target && placeOf(scene, scene.shoot(entry.m.at + 0.02), target);
        if (there && cosine(d, sub(there, from)) < -0.3) say(entry, `moves away from ${target}`);
      }
      if ((entry.word === "away" || (entry.word === "backward" && !facing)) && (nameAfter(entry.after) || anchor)) {
        const target = nameAfter(entry.after) ?? rootOf(anchor);
        const there = placeOf(scene, scene.shoot(entry.m.at + 0.02), target);
        if (there && cosine(d, sub(from, there)) < -0.3) say(entry, `moves back toward ${target}`);
      }
    }
    // Forward and backward said of two movers in one scene are opposite ways; so is "opposite".
    const forward = said.filter((e) => e.word === "forward");
    const backward = said.filter((e) => e.word === "backward");
    for (const b of backward) {
      const nearest = forward
        .filter((f) => f.m.component.id !== b.m.component.id && len(f.journey.d) >= 4 && len(b.journey.d) >= 4)
        .sort((x, y) => Math.abs(x.m.at - b.m.at) - Math.abs(y.m.at - b.m.at))[0];
      if (nearest && cosine(nearest.journey.d, b.journey.d) > 0.3) say(b, `goes the same way as ${nearest.m.component.id}, said to go forward (${fmt(degreesBetween(nearest.journey.d, b.journey.d))}° apart)`);
    }
    for (const entry of said.filter((e) => e.word === "opposite")) {
      const other = [...journeys].filter(([n]) => n.component.id !== entry.m.component.id && n.at <= entry.m.at + 0.1).at(-1);
      if (other && cosine(entry.journey.d, other[1].d) > 0.3) say(entry, `goes the same way as ${other[0].component.id}`);
    }
  }

  // ─── 6. continuityJump ───

  function firstSeen(scene, id) {
    const from = scene.shown.get(id);
    if (from === undefined || from >= (scene.gone.get(id) ?? Infinity)) return undefined;
    const component = scene.byId.get(id);
    return scene.shoot(from + Math.min(0.05 + (component?.enter?.dur ?? 0), 1.2));
  }

  function continuityJump(before, after) {
    const end = before.shoot(before.duration - 0.06);
    for (const [key, was] of end.pictures) {
      const match = after.drawn.find((c) => c.type === "image" && (c.id === key || c.src === was.src));
      if (!match) continue;
      const now = firstSeen(after, match.id)?.pictures.get(match.id);
      if (!now) continue;
      const moved = len(sub(now.centre, was.centre));
      const scale = now.width / Math.max(1, was.width);
      const turned = Math.abs(((now.turn - was.turn + 540) % 360) - 180);
      const changes = [moved > JUMP && `jumps ${fmt(moved)}u`, Math.abs(scale - 1) > SCALE_JUMP && `rescales ×${scale.toFixed(2)}`, turned > 20 && `turns ${fmt(turned)}°`].filter(Boolean);
      // The same placement asked again and still moved is the engine's jump; a new placement is the writer's.
      const same = JSON.stringify(before.sources.get(key)?.placement ?? null) === JSON.stringify(after.sources.get(match.id)?.placement ?? null);
      if (changes.length) report("continuityJump", `${before.id}→${after.id}:${match.id === key ? key : `${key}→${match.id}`}: same picture ${changes.join(", ")} (${same ? "same placement" : "placement changed"})`);
    }
    for (const [key, was] of end.texts) {
      const source = before.sources.get(key);
      const next = after.sources.get(key);
      const carried = source && next && source.text !== undefined && source.text === next.text;
      if (!carried) continue;
      const now = firstSeen(after, key)?.texts.get(key);
      if (now && len(sub(centre(now.box), centre(was.box))) > JUMP) report("continuityJump", `${before.id}→${after.id}:${key}: carried text jumps ${fmt(len(sub(centre(now.box), centre(was.box))))}u`);
    }
    const lead = (scene) => scene.resolved.objects.find((o) => o.source?.kind === "image" && !o.id.includes(".") && (o.source.role === "primary" || o.source.role === "hero" || o.rank === "lead"));
    const [a, b] = [lead(before), lead(after)];
    if (!a || !b) return;
    const pa = firstSeen(before, a.id)?.pictures.get(a.id);
    const pb = firstSeen(after, b.id)?.pictures.get(b.id);
    if (!pa || !pb || pa.src === pb.src) return;
    const moved = len(sub(pa.centre, pb.centre));
    if (moved > SLOT_JUMP) report("continuityJump", `${before.id}→${after.id}: main picture slot moves ${fmt(moved)}u (${a.id}→${b.id})`);
  }

  // ─── 7. symbolSanity ───

  function symbolSanity(scene) {
    const frames = everyFrame(scene);
    for (const frame of frames) {
      for (const [key, owner] of frame.owners) {
        const writing = owner.ops.filter((op) => op.op === "fillText");
        writing.forEach((op, i) => {
          if (!/italic/i.test(op.font)) return;
          const token = op.text.trim();
          const glued = token.match(/^[\d.,]+\s*(.+)$/)?.[1];
          const before = writing.slice(0, i).reverse().find((w) => w.text.trim());
          const unit = UNITS.has(glued ?? "") || (UNITS.has(token) && /\d\s*$/.test(before?.text ?? ""));
          if (unit) report("symbolSanity", `${scene.id}:${nameOf(owner.component)}: unit "${glued ?? token}" set in italic, reads as a variable`, `${scene.id}:${key}:italic:${glued ?? token}`);
        });
        for (const op of owner.ops) {
          if (!op.painters.includes("arrowhead") || op.painters.includes("drawPenNib") || op.painters.includes("drawMarker")) continue;
          const component = owner.component;
          if (component?.type === "attention") continue;
          const source = scene.sources.get(rootOf(component?.id));
          const asked = component?.arrow || component?.children?.some((c) => c.arrow) || component?.ops?.some((o) => o.arrow) || source?.arrow || ARROW_KINDS.has(source?.kind);
          if (!asked) report("symbolSanity", `${scene.id}:${key}: arrowhead on a stroke with no arrow`, `${scene.id}:${key}:arrowhead`);
        }
      }
    }
    for (const frame of restFrames(scene)) capsInside(scene, frame);
    for (const object of scene.resolved.objects) {
      if (object.source?.kind !== "angle") continue;
      const mark = scene.byId.get(object.id);
      const points = mark?.points ?? mark?.children?.find((c) => c.points?.length > 4)?.points;
      if (!points || points.length < 5 || !mark.at) continue;
      const radii = points.map((p) => len(sub(p, mark.at)));
      const curved = Math.max(...radii) - Math.min(...radii) < 0.15 * Math.max(...radii);
      const spread = degreesBetween(sub(points[0], mark.at), sub(points.at(-1), mark.at));
      if (curved && Math.abs(spread - 90) < 3) report("symbolSanity", `${scene.id}:${object.id}: right angle marked with an arc, not a square`);
    }
  }

  /** A dimension's end cap crossing another drawn side just inside its corner reads as an equal-length tick. */
  function capsInside(scene, frame) {
    const strokes = [...frame.strokes.values()];
    const dimension = (stroke) => scene.sources.get(rootOf(stroke.key))?.kind === "span" || Boolean(stroke.component.ends);
    const side = (stroke) => ["path", "shape", "line", "angle", "curve"].includes(scene.sources.get(rootOf(stroke.key))?.kind);
    for (const short of strokes.filter(dimension)) {
      for (const line of short.lines) {
        if (line.length !== 2) continue;
        const size = len(sub(line[1], line[0]));
        if (size < 5 || size > 30) continue;
        for (const long of strokes) {
          if (long.key === short.key || !side(long)) continue;
          for (const edge of long.lines) {
            for (let i = 0; i + 1 < edge.length; i++) {
              const sideLength = len(sub(edge[i + 1], edge[i]));
              if (sideLength < 50) continue;
              const cross = segmentsCross(edge[i], edge[i + 1], line[0], line[1]);
              const inset = cross && Math.min(cross.t, 1 - cross.t) * sideLength;
              if (!cross || inset < 6 || inset > 40) continue;
              const angle = degreesBetween(sub(edge[i + 1], edge[i]), sub(line[1], line[0]));
              if (angle < 45 || angle > 135) continue;
              report("symbolSanity", `${scene.id}:${short.key}: end cap drawn ${fmt(inset)}u inside ${long.key}'s side (reads as an equal-length tick)`, `${scene.id}:${short.key}:${long.key}:cap`);
            }
          }
        }
      }
    }
  }

  // ─── 8. staleOnScreen ───

  function staleOnScreen(scene) {
    const items = (frame) => [...frame.pictures.values(), ...[...frame.texts.values()].filter((t) => t.component.type !== "attention")];
    const overlap = (a, b) => {
      if (a.inkAt && b.inkAt) return sharedInk(a, b) / Math.max(1, Math.min(a.area, b.area));
      if (a.inkAt || b.inkAt) {
        const [picture, text] = a.inkAt ? [a, b] : [b, a];
        const points = gridIn(text.box, 8, 3);
        return points.filter((p) => picture.inkAt(p)).length / points.length;
      }
      const ox = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
      const oy = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
      return ox > 0 && oy > 0 ? (ox * oy) / Math.max(1, Math.min(a.box.w * a.box.h, b.box.w * b.box.h)) : 0;
    };
    const arrivals = [];
    for (const component of scene.drawn) {
      const from = scene.shown.get(component.id);
      if (from !== undefined && from > 0.05) arrivals.push({ id: component.id, since: from, frame: firstSeen(scene, component.id), how: "placed" });
    }
    for (const m of scene.motions) arrivals.push({ id: m.component.id, since: m.at, frame: scene.shoot(m.end - 0.02), how: "moved" });
    for (const arrival of arrivals) {
      if (!arrival.frame) continue;
      const all = items(arrival.frame);
      const newcomer = all.find((item) => item.key === arrival.id);
      if (!newcomer) continue;
      for (const old of all) {
        if (old.key === newcomer.key || old.key.includes(".")) continue;
        const since = scene.shown.get(old.key);
        if (since === undefined || since >= arrival.since - 0.05 || scene.gone.has(old.key)) continue;
        if (tied(scene, old.key, newcomer.key) || referentOf(scene, newcomer) === old.key || referentOf(scene, old) === newcomer.key) continue;
        const share = overlap(old, newcomer);
        if (share > 0.15) report("staleOnScreen", `${scene.id}:${old.key}: never hidden, ${newcomer.key} ${arrival.how} onto it (${fmt(share * 100)}%)`, `${scene.id}:${old.key}:${newcomer.key}`);
      }
    }
  }
}
