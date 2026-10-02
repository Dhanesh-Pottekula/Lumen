import type { ThemeName } from "../gcl/schema";
import { VIEW_INSET, VIEW_WIDTH } from "../gcl/viewport";
import { bandHeight, chartPieceNames, figureChart, figureChartSize, planChart } from "../render/datachart";
import { compareSize, evidenceSize, planCompare, planEvidence, planQuestion, planScale, questionSize, scaleSize } from "../render/cards";
import { diagramLinks, diagramSize, flowMinWidth, linkName, planDiagram } from "../render/diagram";
import { validateMathText } from "../render/mathtext";
import { FORCES_MIN_SIDE, forcesSize, planForces, planWorking, workingSize } from "../render/physics";
import type { FigurePalette, FigurePlan } from "../render/figure";
import { BLUEPRINT, CHALKBOARD, PARCHMENT, TEXTBOOK } from "../render/theme";
import { seriesLines } from "../render/charts";
import type { Diagnostic } from "./diagnostics";
import type { ObjectSpec } from "./types";

/**
 * Objects the engine draws as figures: laid out once from what they mean, then built up piece by
 * piece. Each piece is `<id>.<name>`, shown on its own beat or in turn when the whole is shown, and
 * a target for attention, labels and placement like any other thing on screen.
 */

const MAX_WIDTH = VIEW_WIDTH - VIEW_INSET * 2;

const PALETTES: Record<ThemeName, FigurePalette> = {
  TEXTBOOK: TEXTBOOK.palette,
  PARCHMENT: PARCHMENT.palette,
  BLUEPRINT: BLUEPRINT.palette,
  CHALKBOARD: CHALKBOARD.palette,
};

export function themePalette(theme: ThemeName): FigurePalette {
  return PALETTES[theme];
}

export function drawnAsFigure(object: ObjectSpec): boolean {
  return object.kind === "chart" ? figureChart(object) : FIGURE_KINDS.has(object.kind);
}

const FIGURE_KINDS: ReadonlySet<ObjectSpec["kind"]> = new Set(["diagram", "compare", "scale", "evidence", "question", "forces", "working"]);

/** The names of an object's pieces, known without laying it out. */
export function pieceNames(object: ObjectSpec): string[] {
  if (object.kind === "diagram") return [...object.nodes.map((node) => node.id), ...diagramLinks(object).map(linkName)];
  if (object.kind === "chart") return chartPieceNames(object);
  if (object.kind === "compare") return ["left", "right", ...object.rows.map((_, i) => `row${i}`)];
  if (object.kind === "scale") return object.items.map((_, i) => `item${i}`);
  if (object.kind === "evidence") return ["header", "excerpt"];
  if (object.kind === "question") return ["tick"];
  if (object.kind === "forces") return object.forces.flatMap((force) => [force.id, ...(force.resolve ? [`${force.id}-parts`] : [])]);
  if (object.kind === "working")
    return object.lines.flatMap((line, i) => [`l${i}`, ...((line.cancel ?? []).some((term) => line.tex.includes(term)) ? [`l${i}-cancel`] : [])]);
  return [];
}

/** Pieces only a `show` of their own draws: the tick answers the question, so the chip is never drawn answered. */
export function lonePieces(object: ObjectSpec): string[] {
  return object.kind === "question" ? ["tick"] : [];
}

/** The box a figure-drawn object wants at its size word, before any fitting. */
export function figureDimensions(object: ObjectSpec, size: number): [number, number] {
  const scale = Math.min(1.3, Math.max(0.85, size / 1.15));
  if (object.kind === "diagram") return diagramSize(object, Math.min(MAX_WIDTH, MAX_WIDTH * scale));
  if (object.kind === "chart") {
    const s = Math.min(size, 1.65);
    const [w, h] = figureChart(object) ? figureChartSize(object, Math.min(MAX_WIDTH, 470 * scale), s) : [340 * s, 220 * s];
    return [w, h + bandHeight(object, w)];
  }
  const width = Math.min(MAX_WIDTH, 490 * scale);
  if (object.kind === "compare") return compareSize(object, MAX_WIDTH);
  if (object.kind === "scale") return scaleSize(object, width);
  if (object.kind === "evidence") return evidenceSize(object, Math.min(MAX_WIDTH, 480));
  if (object.kind === "question") return questionSize(object.text, MAX_WIDTH);
  if (object.kind === "forces") return forcesSize(scale);
  if (object.kind === "working") return workingSize(object, MAX_WIDTH);
  return [1, 1];
}

/** The narrowest a figure can be drawn before its writing no longer fits its boxes, or its arrows stop reading as pushes, in view units. */
export function figureMinWidth(object: ObjectSpec): number {
  if (object.kind === "forces") return FORCES_MIN_SIDE;
  return object.kind === "diagram" && object.layout === "flow" ? Math.min(MAX_WIDTH, flowMinWidth(object)) : 0;
}

const plans = new WeakMap<ObjectSpec, Map<string, FigurePlan>>();

/** An object laid out as a figure in a `w` × `h` box, in the colours of `theme`. */
export function figurePlan(object: ObjectSpec, w: number, h: number, theme: ThemeName = "TEXTBOOK"): FigurePlan {
  const key = `${theme}:${w.toFixed(2)}:${h.toFixed(2)}`;
  const cached = plans.get(object)?.get(key);
  if (cached) return cached;
  const palette = PALETTES[theme];
  const plan: FigurePlan =
    object.kind === "diagram"
      ? planDiagram(object, w, h, palette)
      : object.kind === "chart"
        ? planChart(object, w, h, palette)
        : object.kind === "compare"
          ? planCompare(object, w, h, palette)
          : object.kind === "scale"
            ? planScale(object, w, h, palette)
            : object.kind === "evidence"
              ? planEvidence(object, w, h, palette)
              : object.kind === "question"
                ? planQuestion(object.text, w, h, palette)
                : object.kind === "forces"
                  ? planForces(object, w, h, palette)
                  : object.kind === "working"
                    ? planWorking(object, w, h, palette)
                    : { ops: [], pieces: [] };
  plans.set(object, (plans.get(object) ?? new Map()).set(key, plan));
  return plan;
}

/** What is wrong with a figure-drawn object's own data, so the writer learns it rather than seeing a gap. */
export function figureDiagnostics(object: ObjectSpec, path: string): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const fault = (at: string, message: string, received: unknown, availableTargets?: string[]) =>
    errors.push({ code: "INVALID_DATA", path: `${path}${at}`, message, received, ...(availableTargets ? { availableTargets } : {}) });
  if (object.kind === "diagram") {
    const ids = object.nodes.map((node) => node.id);
    ids.forEach((id, index) => {
      if (ids.indexOf(id) !== index) fault(`/nodes/${index}/id`, `Duplicate diagram node '${id}'`, id);
    });
    object.nodes.forEach((node, index) => {
      if (node.parent !== undefined && object.layout !== "tree") fault(`/nodes/${index}/parent`, "Only a tree places nodes under a parent; a flow joins them with links", node.parent);
      if (node.parent !== undefined && !ids.includes(node.parent)) fault(`/nodes/${index}/parent`, `Unknown parent node '${node.parent}'`, node.parent, ids);
      if (node.parent === node.id) fault(`/nodes/${index}/parent`, "A node cannot be its own parent", node.parent);
    });
    if (object.layout === "tree" && object.nodes.every((node) => node.parent !== undefined)) fault("/nodes", "A tree needs a root: one node with no parent", ids);
    const chain = new Set(diagramLinks({ ...object, links: undefined }).map(linkName));
    object.links?.forEach((link, index) => {
      for (const end of ["from", "to"] as const)
        if (!ids.includes(link[end])) fault(`/links/${index}/${end}`, `Unknown diagram node '${link[end]}'`, link[end], ids);
      if (link.from === link.to) fault(`/links/${index}`, "A link joins two different nodes", link);
      // A sequence and a cycle join each stage to the next themselves; a link there only names or styles one of those.
      if ((object.layout === "sequence" || object.layout === "cycle" || object.layout === "tree") && !chain.has(linkName(link)))
        fault(`/links/${index}`, `A ${object.layout} draws its own arrows (${[...chain].join(", ") || "none"}); a link here can only label or style one of them — use layout 'flow' for other arrows`, link);
    });
  }
  if (object.kind === "forces") {
    const ids = object.forces.map((force) => force.id);
    ids.forEach((id, index) => {
      if (ids.indexOf(id) !== index) fault(`/forces/${index}/id`, `Duplicate force '${id}'`, id);
    });
    object.forces.forEach((force, index) => {
      for (const [at, text] of [["label", force.label], ...(force.resolve?.labels.map((label, k) => [`resolve/labels/${k}`, label]) ?? [])] as [string, string][]) {
        const math = validateMathText(text);
        if (!math.valid) errors.push({ code: "UNSUPPORTED_MATH_COMMAND", path: `${path}/forces/${index}/${at}`, message: math.error, received: text });
      }
    });
  }
  if (object.kind === "working") {
    object.lines.forEach((line, index) => {
      const math = validateMathText(line.tex);
      if (!math.valid) errors.push({ code: "UNSUPPORTED_MATH_COMMAND", path: `${path}/lines/${index}/tex`, message: math.error, received: line.tex });
      line.cancel?.forEach((term, k) => {
        if (!line.tex.includes(term)) fault(`/lines/${index}/cancel/${k}`, `'${term}' is not written in this line, so there is nothing to strike through; copy the term exactly as it appears in tex`, term);
      });
    });
  }
  if (object.kind === "timeline") {
    const lanes = object.lanes?.length ?? 1;
    [...(object.events ?? []).map((one, i) => [`/events/${i}/lane`, one.lane] as const), ...(object.eras ?? []).map((one, i) => [`/eras/${i}/lane`, one.lane] as const)].forEach(([at, lane]) => {
      if (lane !== undefined && lane >= lanes) fault(at, `Lane ${lane} does not exist; the timeline names ${lanes} lane${lanes === 1 ? "" : "s"} (from 0)`, lane);
    });
    object.links?.forEach((link, i) => {
      for (const end of ["from", "to"] as const)
        if (link[end] >= (object.events?.length ?? 0)) fault(`/links/${i}/${end}`, `A link joins events by index; there is no event ${link[end]}`, link[end]);
      if (link.from === link.to) fault(`/links/${i}`, "A cause link joins two different events", link);
    });
  }
  if (object.kind === "chart" && object.chart === "stack") {
    const xs = seriesLines(object.series).map((line) => line.map(([x]) => x).join(","));
    if (new Set(xs).size > 1) fault("/series", "Stacked layers share their x values: give every layer a point at the same xs", object.series);
  }
  return errors;
}
