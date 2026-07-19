import type { SvgCompositePartSpec } from "./types";

export const SIMPLE_JSON_SVG_TAGS = [
  "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "defs",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "title", "desc",
] as const;
const ALLOWED_TAGS = new Set<string>(SIMPLE_JSON_SVG_TAGS);

export const SIMPLE_JSON_SVG_ATTRIBUTES = [
  "xmlns", "viewbox", "preserveaspectratio", "role", "aria-label",
  "id", "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "opacity", "fill-opacity", "stroke-opacity",
  "transform", "gradientunits", "gradienttransform", "offset", "stop-color", "stop-opacity",
  "clip-path", "mask", "fill-rule", "clip-rule",
] as const;
const ALLOWED_ATTRIBUTES = new Set<string>(SIMPLE_JSON_SVG_ATTRIBUTES);

export const SIMPLE_JSON_SVG_MAX_MARKUP_LENGTH = 48_000;
export const SIMPLE_JSON_SVG_MAX_ELEMENTS = 220;
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

/**
 * Forgiving sanitizer: strip any attribute outside the whitelist (e.g. `stroke-dasharray`, `style`,
 * `class`, event handlers, external `href`) from every element, so a single stray presentation
 * attribute degrades gracefully instead of rejecting the whole SVG (which would also drop all its
 * anchors). Structural rules — allowed tags, one root `<svg>`, valid viewBox, size limits — still apply.
 */
export function sanitizeSvg(svg: string): string {
  return svg.replace(/<\s*(\/?)([A-Za-z][\w:-]*)([^>]*)>/g, (_full, closing: string, tag: string, rawAttrs: string) => {
    if (closing) return `</${tag}>`;
    const selfClose = /\/\s*$/.test(rawAttrs);
    const attrs = rawAttrs.replace(/\/\s*$/, "");
    const kept: string[] = [];
    for (const found of attrs.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g)) {
      const name = found[1].toLowerCase();
      if (name.startsWith("on")) continue; // event handlers
      if (name === "style" || name === "class" || name === "href" || name === "xlink:href") continue;
      if (!ALLOWED_ATTRIBUTES.has(name)) continue; // e.g. stroke-dasharray — dropped, not fatal
      kept.push(`${found[1]}=${found[2]}`);
    }
    return `<${tag}${kept.length ? " " + kept.join(" ") : ""}${selfClose ? " /" : ""}>`;
  });
}

function markupSafetyError(svg: string, allowRootSvg: boolean): string | undefined {
  if (!svg.trim()) return "SVG markup must not be empty";
  if (svg.length > SIMPLE_JSON_SVG_MAX_MARKUP_LENGTH) return `SVG markup exceeds ${SIMPLE_JSON_SVG_MAX_MARKUP_LENGTH} characters`;
  if (/<!DOCTYPE|<!ENTITY|<\?xml/i.test(svg)) return "XML declarations, doctypes, and entities are not allowed";
  if (!allowRootSvg && /<\s*svg\b/i.test(svg)) return "SVG parts must contain elements only; the compiler supplies the root <svg>";
  if (/\b(?:href|xlink:href|style)\s*=/i.test(svg)) return "External references and style attributes are not allowed";
  if (/\bon[a-z-]*\s*=/i.test(svg)) return "SVG event-handler attributes are not allowed";
  if (/url\s*\(\s*(?!['\"]?#)/i.test(svg)) return "Only local url(#id) SVG references are allowed";

  const tags = [...svg.matchAll(/<\s*(\/?)\s*([A-Za-z][\w:-]*)([^>]*)>/g)];
  if (tags.length === 0) return "SVG markup must contain at least one SVG element";
  if (tags.length > SIMPLE_JSON_SVG_MAX_ELEMENTS * 2) return `SVG markup exceeds ${SIMPLE_JSON_SVG_MAX_ELEMENTS} elements`;

  let openingElements = 0;
  let svgElements = 0;
  for (const match of tags) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return `SVG element <${match[2]}> is not allowed`;
    if (closing) continue;
    openingElements += 1;
    if (tag === "svg") svgElements += 1;
    if (openingElements > SIMPLE_JSON_SVG_MAX_ELEMENTS) return `SVG markup exceeds ${SIMPLE_JSON_SVG_MAX_ELEMENTS} elements`;

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
  return markupSafetyError(sanitizeSvg(svg), false);
}

interface Box { minX: number; minY: number; maxX: number; maxY: number }
interface InferredBox {
  box: Box;
  precision: "exact" | "conservative";
  reason?: string;
}

function union(boxes: Box[]): Box | undefined {
  if (!boxes.length) return undefined;
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function pathBox(d: string): InferredBox | undefined {
  const tokens = d.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g);
  if (!tokens?.length) return undefined;
  const points: Array<[number, number]> = [];
  let index = 0;
  let command = "";
  let x = 0; let y = 0; let sx = 0; let sy = 0;
  let conservative = false;
  const isCommand = (value: string) => /^[A-Za-z]$/.test(value);
  const read = () => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error("invalid path number");
    return value;
  };
  const point = (px: number, py: number) => { points.push([px, py]); };
  const endpoint = (px: number, py: number, relative: boolean) => relative ? [x + px, y + py] as [number, number] : [px, py] as [number, number];
  try {
    while (index < tokens.length) {
      if (isCommand(tokens[index])) command = tokens[index++];
      if (!command) return undefined;
      const lower = command.toLowerCase();
      const relative = command === lower;
      if (lower === "z") {
        x = sx; y = sy; point(x, y); command = ""; continue;
      }
      if (lower === "h") {
        x = relative ? x + read() : read(); point(x, y); continue;
      }
      if (lower === "v") {
        y = relative ? y + read() : read(); point(x, y); continue;
      }
      if (lower === "m" || lower === "l" || lower === "t") {
        const [nx, ny] = endpoint(read(), read(), relative);
        x = nx; y = ny; point(x, y);
        if (lower === "m") { sx = x; sy = y; command = relative ? "l" : "L"; }
        if (lower === "t") conservative = true;
        continue;
      }
      if (lower === "c") {
        const c1 = endpoint(read(), read(), relative);
        const c2 = endpoint(read(), read(), relative);
        const end = endpoint(read(), read(), relative);
        point(...c1); point(...c2); point(...end); [x, y] = end; conservative = true; continue;
      }
      if (lower === "s" || lower === "q") {
        const control = endpoint(read(), read(), relative);
        const end = endpoint(read(), read(), relative);
        point(...control); point(...end); [x, y] = end; conservative = true; continue;
      }
      if (lower === "a") {
        const rx = Math.abs(read()); const ry = Math.abs(read());
        read(); read(); read();
        const end = endpoint(read(), read(), relative);
        point(x - rx, y - ry); point(x + rx, y + ry);
        point(end[0] - rx, end[1] - ry); point(end[0] + rx, end[1] + ry);
        point(...end); [x, y] = end; conservative = true; continue;
      }
      return undefined;
    }
  } catch {
    return undefined;
  }
  if (!points.length) return undefined;
  const xs = points.map(([px]) => px);
  const ys = points.map(([, py]) => py);
  return {
    box: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    precision: conservative ? "conservative" : "exact",
    reason: conservative ? "curve or arc bounds use a conservative control envelope" : undefined,
  };
}

function primitiveBox(tag: string, markup: string): InferredBox | undefined {
  const n = (name: string, fallback = 0) => Number(attribute(markup, name) ?? fallback);
  if (tag === "circle") {
    const cx = n("cx"); const cy = n("cy"); const r = n("r");
    return { box: { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r }, precision: "exact" };
  }
  if (tag === "ellipse") {
    const cx = n("cx"); const cy = n("cy"); const rx = n("rx"); const ry = n("ry");
    return { box: { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry }, precision: "exact" };
  }
  if (tag === "rect") {
    const x = n("x"); const y = n("y"); const width = n("width"); const height = n("height");
    return { box: { minX: x, minY: y, maxX: x + width, maxY: y + height }, precision: "exact" };
  }
  if (tag === "line") {
    const x1 = n("x1"); const y1 = n("y1"); const x2 = n("x2"); const y2 = n("y2");
    return { box: { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) }, precision: "exact" };
  }
  if (tag === "polyline" || tag === "polygon") {
    const values = numbers(attribute(markup, "points"));
    if (values.length < 2 || values.length % 2 !== 0) return undefined;
    const xs = values.filter((_value, index) => index % 2 === 0);
    const ys = values.filter((_value, index) => index % 2 === 1);
    return { box: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }, precision: "exact" };
  }
  if (tag === "path") return pathBox(attribute(markup, "d") ?? "");
  return undefined;
}

function inferredBounds(markup: string, viewBox: [number, number, number, number]): Pick<SvgCompositePartSpec, "bounds" | "boundsPrecision" | "boundsReason"> {
  if (/\btransform\s*=/i.test(markup)) {
    return { bounds: [...viewBox], boundsPrecision: "viewbox-fallback", boundsReason: "transformed SVG geometry requires whole-viewBox targeting" };
  }
  const withoutDefs = markup.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/gi, "");
  const boxes: Box[] = [];
  let conservative = false;
  let uncertain = false;
  for (const match of withoutDefs.matchAll(/<\s*(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)>/gi)) {
    const box = primitiveBox(match[1].toLowerCase(), match[0]);
    if (box) {
      boxes.push(box.box);
      conservative ||= box.precision === "conservative";
    }
    else uncertain = true;
  }
  const combined = uncertain ? undefined : union(boxes);
  if (!combined) return { bounds: [...viewBox], boundsPrecision: "viewbox-fallback", boundsReason: "bounds could not be inferred from one or more SVG elements" };
  const strokeWidths = [...withoutDefs.matchAll(/\bstroke-width\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)]
    .flatMap((match) => numbers(match[1] ?? match[2]));
  const padding = Math.max(3, ...(strokeWidths.map((width) => width / 2 + 2)));
  const [vx, vy, vw, vh] = viewBox;
  const minX = Math.max(vx, combined.minX - padding);
  const minY = Math.max(vy, combined.minY - padding);
  const maxX = Math.min(vx + vw, combined.maxX + padding);
  const maxY = Math.min(vy + vh, combined.maxY + padding);
  return {
    bounds: [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)],
    boundsPrecision: conservative ? "conservative" : "exact",
    boundsReason: conservative ? "curve or arc bounds use a conservative control envelope" : undefined,
  };
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

export function parseSvgArtwork(rawSvg: string): { value?: ParsedSvgArtwork; error?: string } {
  const svg = sanitizeSvg(rawSvg);
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
    parts.push({ id, svg: `${defs}${group.markup}`, ...inferredBounds(group.markup, viewBox) });
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" role="img" aria-label="${escapeAttribute(part.id)}">${sanitizeSvg(part.svg)}</svg>`;
}
