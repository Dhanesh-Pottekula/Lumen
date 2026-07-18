import type { SvgCompositePartSpec } from "./types";

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "title", "desc",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "xmlns", "viewbox", "preserveaspectratio", "role", "aria-label",
  "id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "gradientunits", "gradienttransform", "offset", "stop-color", "stop-opacity",
  "clip-path", "mask", "fill-rule", "clip-rule",
]);

const MAX_MARKUP_LENGTH = 48_000;
const MAX_ELEMENTS = 220;
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

export interface ParsedSvgArtwork {
  viewBox: [number, number, number, number];
  parts: SvgCompositePartSpec[];
}

function attribute(markup: string, name: string): string | undefined {
  const match = markup.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return match?.[1] ?? match?.[2];
}

function numbers(value: string | undefined): number[] {
  return value?.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
}

function markupSafetyError(svg: string, allowRootSvg: boolean): string | undefined {
  if (!svg.trim()) return "SVG markup must not be empty";
  if (svg.length > MAX_MARKUP_LENGTH) return `SVG markup exceeds ${MAX_MARKUP_LENGTH} characters`;
  if (/<!DOCTYPE|<!ENTITY|<\?xml/i.test(svg)) return "XML declarations, doctypes, and entities are not allowed";
  if (!allowRootSvg && /<\s*svg\b/i.test(svg)) return "SVG parts must contain elements only; the compiler supplies the root <svg>";
  if (/\b(?:href|xlink:href|style)\s*=/i.test(svg)) return "External references and style attributes are not allowed";
  if (/\bon[a-z-]*\s*=/i.test(svg)) return "SVG event-handler attributes are not allowed";
  if (/url\s*\(\s*(?!['\"]?#)/i.test(svg)) return "Only local url(#id) SVG references are allowed";

  const tags = [...svg.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>/g)];
  if (tags.length === 0) return "SVG markup must contain at least one SVG element";
  if (tags.length > MAX_ELEMENTS * 2) return `SVG markup exceeds ${MAX_ELEMENTS} elements`;

  let openingElements = 0;
  let svgElements = 0;
  for (const match of tags) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return `SVG element <${match[2]}> is not allowed`;
    if (closing) continue;
    openingElements += 1;
    if (tag === "svg") svgElements += 1;
    if (openingElements > MAX_ELEMENTS) return `SVG markup exceeds ${MAX_ELEMENTS} elements`;

    const rawAttributes = match[3].replace(/\/\s*$/, "");
    const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g;
    const consumed = rawAttributes.replace(attributePattern, "").trim();
    if (consumed && consumed !== "/") return `Malformed SVG attributes on <${match[2]}>`;
    for (const found of rawAttributes.matchAll(attributePattern)) {
      const name = found[1].toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name)) return `SVG attribute '${found[1]}' is not allowed`;
    }
  }
  if (allowRootSvg && svgElements !== 1) return "SVG artwork must contain exactly one root <svg> element";
  return undefined;
}

export function svgFragmentError(svg: string): string | undefined {
  return markupSafetyError(svg, false);
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }

function union(boxes: Box[]): Box | undefined {
  if (!boxes.length) return undefined;
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function pathBox(d: string): Box | undefined {
  // Exact enough and conservative for the common LLM-authored absolute M/L/C path subset. For
  // transforms, relative commands, arcs, and other advanced paths we safely fall back to the full
  // artwork viewBox rather than risk clipping the rendered layer.
  if (/[a-zAHVQSTA]/.test(d.replace(/[eE][-+]?\d+/g, ""))) return undefined;
  const values = numbers(d);
  if (values.length < 2 || values.length % 2 !== 0) return undefined;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < values.length; index += 2) {
    xs.push(values[index]);
    ys.push(values[index + 1]);
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function primitiveBox(tag: string, markup: string): Box | undefined {
  const n = (name: string, fallback = 0) => Number(attribute(markup, name) ?? fallback);
  if (tag === "circle") {
    const cx = n("cx"); const cy = n("cy"); const r = n("r");
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if (tag === "ellipse") {
    const cx = n("cx"); const cy = n("cy"); const rx = n("rx"); const ry = n("ry");
    return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
  }
  if (tag === "rect") {
    const x = n("x"); const y = n("y"); const width = n("width"); const height = n("height");
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  if (tag === "line") {
    const x1 = n("x1"); const y1 = n("y1"); const x2 = n("x2"); const y2 = n("y2");
    return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
  }
  if (tag === "polyline" || tag === "polygon") {
    const values = numbers(attribute(markup, "points"));
    if (values.length < 2 || values.length % 2 !== 0) return undefined;
    const xs = values.filter((_value, index) => index % 2 === 0);
    const ys = values.filter((_value, index) => index % 2 === 1);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  if (tag === "path") return pathBox(attribute(markup, "d") ?? "");
  return undefined;
}

function inferredBounds(markup: string, viewBox: [number, number, number, number]): [number, number, number, number] {
  if (/\btransform\s*=/i.test(markup)) return [...viewBox];
  const withoutDefs = markup.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, "");
  const boxes: Box[] = [];
  let uncertain = false;
  for (const match of withoutDefs.matchAll(/<\s*(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gi)) {
    const box = primitiveBox(match[1].toLowerCase(), match[0]);
    if (box) boxes.push(box);
    else uncertain = true;
  }
  const combined = uncertain ? undefined : union(boxes);
  if (!combined) return [...viewBox];
  const strokeWidths = [...withoutDefs.matchAll(/\bstroke-width\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)]
    .flatMap((match) => numbers(match[1] ?? match[2]));
  const padding = Math.max(3, ...(strokeWidths.map((width) => width / 2 + 2)));
  const [vx, vy, vw, vh] = viewBox;
  const minX = Math.max(vx, combined.minX - padding);
  const minY = Math.max(vy, combined.minY - padding);
  const maxX = Math.min(vx + vw, combined.maxX + padding);
  const maxY = Math.min(vy + vh, combined.maxY + padding);
  return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)];
}

interface RootChild { tag: string; markup: string; opening: string }

function rootChildren(inner: string): RootChild[] {
  const tokenPattern = /<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>/g;
  const stack: Array<{ tag: string; start: number; opening: string }> = [];
  const children: RootChild[] = [];
  for (const token of inner.matchAll(tokenPattern)) {
    const closing = token[1] === "/";
    const tag = token[2].toLowerCase();
    const selfClosing = /\/\s*>$/.test(token[0]);
    if (!closing) {
      if (stack.length === 0 && selfClosing) children.push({ tag, markup: token[0], opening: token[0] });
      else if (!selfClosing) stack.push({ tag, start: token.index!, opening: token[0] });
      continue;
    }
    const opened = stack.pop();
    if (!opened || opened.tag !== tag) return [];
    if (stack.length === 0) children.push({ tag, markup: inner.slice(opened.start, token.index! + token[0].length), opening: opened.opening });
  }
  return stack.length === 0 ? children : [];
}

export function parseSvgArtwork(svg: string): { value?: ParsedSvgArtwork; error?: string } {
  const safeError = markupSafetyError(svg, true);
  if (safeError) return { error: safeError };
  const root = svg.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i);
  if (!root) return { error: "SVG artwork must be one complete root <svg> element" };
  const viewBoxValues = numbers(attribute(root[1], "viewBox"));
  if (viewBoxValues.length !== 4 || viewBoxValues.some((value) => !Number.isFinite(value)) || viewBoxValues[2] <= 0 || viewBoxValues[3] <= 0) {
    return { error: "The root <svg> must declare a valid four-number viewBox" };
  }
  const viewBox = viewBoxValues as [number, number, number, number];
  const children = rootChildren(root[2]);
  if (!children.length) return { error: "SVG artwork must contain root-level named <g> parts" };
  const defs = children.filter((child) => child.tag === "defs").map((child) => child.markup).join("");
  const groups = children.filter((child) => child.tag === "g");
  if (!groups.length) return { error: "SVG artwork must contain at least one root-level named <g> part" };
  const parts: SvgCompositePartSpec[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const id = attribute(group.opening, "id");
    if (!id || !ID_PATTERN.test(id)) return { error: "Every root-level <g> part must have a valid id" };
    if (seen.has(id)) return { error: `Duplicate SVG part id '${id}'` };
    seen.add(id);
    parts.push({ id, svg: `${defs}${group.markup}`, bounds: inferredBounds(group.markup, viewBox) });
  }
  const unsupported = children.filter((child) => !["defs", "g", "title", "desc"].includes(child.tag));
  if (unsupported.length) return { error: `Root-level <${unsupported[0].tag}> must be placed inside a named <g> part` };
  return { value: { viewBox, parts } };
}

export function svgArtworkError(svg: string): string | undefined {
  return parseSvgArtwork(svg).error;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

export function svgPartMarkup(part: SvgCompositePartSpec): string {
  const [x, y, width, height] = part.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" role="img" aria-label="${escapeAttribute(part.id)}">${part.svg}</svg>`;
}
