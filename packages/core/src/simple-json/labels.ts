/**
 * Where a scene's labels are written, decided once for the whole scene rather than frame by frame:
 * on the shape they name when they fit (shrunk first, never below the smallest writing), right beside
 * it on free space, or in a tidy column beside the picture with a pointer line to the part — in rows
 * over or under it when the picture is as wide as the frame. A part of a picture is never written on
 * unless asked: its name goes beside it or to the column, so the part itself stays seen. Every label of one picture that goes to a
 * column is stacked with the others, in the order of what they name, so a many-part diagram reads as a
 * key rather than a scatter.
 */
import { MIN_TEXT } from "../gcl/viewport";
import { BESIDE_REACH, meets, placeAnywhere, placeBeside, reachOf, rectAt, referentPoint, segmentMeets, type Drawn, type Pt, type Rect } from "../geometry/place";
import { PAD as PLATE_PAD, PLAIN_PAD, wrapWidth } from "../render/callout";

export type LabelPlace = "inside" | "beside" | "pointer";

export interface LabelRequest {
  key: string;
  /** The picture whose labels share a pointer column. */
  owner: string;
  /** What the named thing is drawn as: its outline, its stroke, or its box. */
  drawn: Drawn[];
  /** Whether the named thing is a closed shape a label may be written inside. */
  writable: boolean;
  /** Whether it is a part of a picture, written inside only when `place` asks for it. */
  region: boolean;
  /** The owner's drawn extent, which a pointer column stands beside. */
  ownerBox: Rect;
  /** The owner's own outline when it is a cut-out, whose notches are open page a name may stand in. */
  ownerShape?: Pt[];
  text: string;
  title?: string;
  /** The font sizes it is tried at, largest first; its last is the least it may be drawn at. */
  sizes?: number[];
  plated: boolean;
  place?: LabelPlace;
  /** When it is on screen. */
  window: [number, number];
  /** What else is drawn while it is: writing, other pictures, the owner's other parts. */
  obstacles: Drawn[];
  /** What a label beside the part must also keep off: the drawing a part sits inside of. */
  around: Drawn[];
  /** Where the name of what is named is conventionally written: out from `origin` along `direction`, just past `reach` (an angle's value inside it on its bisector, past its arc). */
  ray?: { origin: Pt; direction: Pt; reach: number };
}

export interface LabelLayout {
  centre: Pt;
  size: [number, number];
  fontPx: number;
  place: LabelPlace;
  /** Where its pointer line meets the thing it names. */
  point: Pt;
  /** No open space was left for it anywhere near what it names: it is written across a drawing. */
  blocked?: boolean;
}

/** The size labels are first tried at; a crowded one shrinks a step at a time to the smallest writing. */
const LABEL_TEXT = 20;
const SIZES = Array.from({ length: LABEL_TEXT - MIN_TEXT + 1 }, (_, step) => LABEL_TEXT - step);
// Average advance of a label glyph, in ems: the painter measures exactly and centres on the spot given.
const GLYPH = 0.55;
const COLUMN_GAP = 14;
// How far at a time rows of labels step out past what is drawn beside a picture.
const ROW_STEP = 8;
// How far a name stood in a cut-out's notch keeps off its outline.
const OWNER_MARGIN = 8;
// A larger label is kept while it stands at most this many times as far off as the nearest smaller one.
const NEAR_ENOUGH = 1.25;
// Rows of labels give way to open spots near each part whose pointers run, all told, under this share of the rows' own.
const ROWS_GIVE_WAY = 0.75;
// Rows standing on average no further than this from what they name are kept without looking elsewhere.
const ROWS_NEAR = 120;
// The grid an open spot for a label is looked for on: a pointer takes up the last few units.
const SPOT_STEP = 16;
const ROW_GAP = 4;

function wrapped(text: string, fontPx: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word;
    if (line && longer.length * fontPx * GLYPH > wrapWidth(fontPx)) {
      lines.push(line);
      line = word;
    } else line = longer;
  }
  return line ? [...lines, line] : lines;
}

/** The box a label takes at a size, padded as the callout pads it: its words alone when it has no plate. */
function labelSize(text: string, title: string | undefined, fontPx: number, plated: boolean): [number, number] {
  const lines = [...(title ? [title] : []), ...wrapped(text, fontPx)];
  const width = Math.max(...lines.map((line) => line.length * fontPx * GLYPH));
  const lineH = fontPx * 1.32;
  const pad = plated ? PLATE_PAD : PLAIN_PAD;
  return [width + pad * 2, lines.length * lineH - (lineH - fontPx) + pad * 2];
}

const during = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

const clearOf = (rect: Rect, obstacles: Drawn[], frame: Rect) =>
  rect.x >= frame.x && rect.y >= frame.y && rect.x + rect.w <= frame.x + frame.w && rect.y + rect.h <= frame.y + frame.h && !obstacles.some((one) => meets(one, rect));

// How far past its reach a label on a ray may step out to find a clear spot, a step at a time.
const RAY_STEPS = [6, 14, 22, 30, 38, 46, 54];

/** Whether anything drawn lies across the way from `a` to `b`: a label there would sit on the far side of a line. */
function crossesBetween(a: Pt, b: Pt, taken: Drawn[]): boolean {
  const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
  for (let k = 1; k < steps; k++) {
    const at: Pt = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
    if (taken.some((one) => !("box" in one) && meets(one, rectAt(at, [1, 1])))) return true;
  }
  return false;
}

/** One label written on its ray, the first spot along it clear of what is drawn. */
function onRay(request: LabelRequest, taken: Drawn[], frame: Rect): LabelLayout | undefined {
  const ray = request.ray;
  if (!ray) return undefined;
  const [ux, uy] = ray.direction;
  for (const fontPx of request.sizes ?? SIZES) {
    const size = labelSize(request.text, request.title, fontPx, request.plated);
    // Out far enough that the box's nearest edge, not its centre, clears the reach.
    const half = Math.abs(ux) * (size[0] / 2) + Math.abs(uy) * (size[1] / 2);
    for (const step of RAY_STEPS) {
      const out = ray.reach + step + half;
      const centre: Pt = [ray.origin[0] + ux * out, ray.origin[1] + uy * out];
      const start: Pt = [ray.origin[0] + ux * ray.reach, ray.origin[1] + uy * ray.reach];
      if (clearOf(rectAt(centre, size), taken, frame) && !crossesBetween(start, centre, taken)) return { centre, size, fontPx, place: "inside", point: centre };
    }
  }
  return undefined;
}

/** One label inside or beside what it names, or undefined when it must go to a pointer column. */
function inPlace(request: LabelRequest, taken: Drawn[], frame: Rect): LabelLayout | undefined {
  if (request.place !== "pointer") {
    const conventional = onRay(request, taken, frame);
    if (conventional) return conventional;
  }
  const referent = { drawn: request.drawn };
  const point = referentPoint(referent);
  if (request.writable && (request.place === "inside" || (request.place === undefined && !request.region))) {
    for (const fontPx of request.sizes ?? SIZES) {
      const size = labelSize(request.text, request.title, fontPx, request.plated);
      const spot = placeBeside(referent, size, taken, "inside", { frame });
      if (spot.clear) return { centre: spot.at, size, fontPx, place: "inside", point };
    }
  }
  if (request.place === "pointer" || request.place === "inside") return undefined;
  for (const fontPx of request.sizes ?? SIZES) {
    const size = labelSize(request.text, request.title, fontPx, request.plated);
    const spot = placeBeside(referent, size, [...taken, ...request.around], "near", { frame, gap: 8 });
    if (spot.clear && reachOf(request.drawn, rectAt(spot.at, size)) <= BESIDE_REACH) return { centre: spot.at, size, fontPx, place: "beside", point };
  }
  return undefined;
}

/**
 * Centres for boxes of these lengths along one line (a column down, a row across), each as near what
 * it names as the line allows: in order, never overlapping, between `top` and `bottom`.
 */
function stackColumn(wanted: number[], heights: number[], top: number, bottom: number, gap = ROW_GAP): number[] {
  const order = wanted.map((_, index) => index).sort((a, b) => wanted[a] - wanted[b]);
  const ys = new Array<number>(wanted.length);
  let floor = top;
  for (const index of order) {
    ys[index] = Math.max(wanted[index], floor + heights[index] / 2);
    floor = ys[index] + heights[index] / 2 + gap;
  }
  // Run past the bottom, the column rises as one, then is pressed together from the top if it must be.
  const last = order[order.length - 1];
  const overflow = last === undefined ? 0 : ys[last] + heights[last] / 2 - bottom;
  if (overflow > 0) {
    let ceiling = bottom;
    for (const index of [...order].reverse()) {
      ys[index] = Math.min(ys[index] - overflow, ceiling - heights[index] / 2);
      ceiling = ys[index] - heights[index] / 2 - gap;
    }
    let below = top;
    for (const index of order) {
      ys[index] = Math.max(ys[index], below + heights[index] / 2);
      below = ys[index] + heights[index] / 2 + gap;
    }
  }
  return ys;
}

type Laid = { layouts: Map<string, LabelLayout>; fits: boolean };

/** The pointer labels of one picture as a column beside it, on the side (or both sides) with room. */
function sideColumns(requests: LabelRequest[], sizes: [number, number][], points: Pt[], frame: Rect, taken: Drawn[], fontPx: number): Laid {
  const box = requests[0].ownerBox;
  const roomLeft = box.x - COLUMN_GAP - frame.x;
  const roomRight = frame.x + frame.w - (box.x + box.w + COLUMN_GAP);
  const middle = box.x + box.w / 2;
  const widest = Math.max(...sizes.map(([w]) => w));
  const both = requests.length > 1 && roomLeft >= widest && roomRight >= widest;
  const lone: "left" | "right" = roomRight >= roomLeft ? "right" : "left";
  const sideOf = (index: number): "left" | "right" => (both ? (points[index][0] < middle ? "left" : "right") : lone);
  const layouts = new Map<string, LabelLayout>();
  let fits = true;
  for (const side of ["left", "right"] as const) {
    const members = requests.map((_, index) => index).filter((index) => sideOf(index) === side);
    if (members.length === 0) continue;
    if ((side === "left" ? roomLeft : roomRight) < widest) fits = false;
    const edge = side === "right" ? Math.min(box.x + box.w + COLUMN_GAP, frame.x + frame.w - widest) : Math.max(box.x - COLUMN_GAP, frame.x + widest);
    // The column keeps below and above the writing laid across the frame's top and foot.
    const span = { x: side === "right" ? edge : edge - widest, w: widest };
    const shelves = taken.flatMap((one) => ("box" in one && one.box.x < span.x + span.w && span.x < one.box.x + one.box.w ? [one.box] : []));
    const top = Math.max(frame.y, ...shelves.filter((one) => one.y + one.h <= box.y + 1).map((one) => one.y + one.h + ROW_GAP));
    const bottom = Math.min(frame.y + frame.h, ...shelves.filter((one) => one.y >= box.y + box.h - 1).map((one) => one.y - ROW_GAP));
    const heights = members.map((index) => sizes[index][1]);
    if (heights.reduce((sum, h) => sum + h + ROW_GAP, -ROW_GAP) > bottom - top) fits = false;
    const ys = stackColumn(members.map((index) => points[index][1]), heights, top, bottom);
    members.forEach((index, k) => {
      const [w, h] = sizes[index];
      const x = side === "right" ? edge + w / 2 : edge - w / 2;
      layouts.set(requests[index].key, { centre: [x, ys[k]], size: [w, h], fontPx, place: "pointer", point: points[index] });
    });
  }
  return { layouts, fits: fits && allClear(layouts, taken) };
}

/** Whether every label laid lies off what is drawn: a column beside a cell's helper was written across the cell. */
function allClear(layouts: Map<string, LabelLayout>, taken: Drawn[]): boolean {
  return [...layouts.values()].every((layout) => !taken.some((one) => meets(one, rectAt(layout.centre, layout.size))));
}

/**
 * The pointer labels of one picture as rows across the frame above or below it (or both), for a picture
 * as wide as the frame: each as near over or under what it names as the row allows, in order across.
 */
function sideRows(requests: LabelRequest[], sizes: [number, number][], points: Pt[], frame: Rect, taken: Drawn[], fontPx: number): Laid {
  const box = requests[0].ownerBox;
  // Writing laid across the frame bounds the rows; a word to one side is stepped past instead.
  const shelves = taken.flatMap((one) => ("box" in one && one.box.w >= frame.w / 2 ? [one.box] : []));
  const top = Math.max(frame.y, ...shelves.filter((one) => one.y + one.h <= box.y + 1).map((one) => one.y + one.h + ROW_GAP));
  const bottom = Math.min(frame.y + frame.h, ...shelves.filter((one) => one.y >= box.y + box.h - 1).map((one) => one.y - ROW_GAP));
  const [roomAbove, roomBelow] = [box.y - COLUMN_GAP - top, bottom - (box.y + box.h + COLUMN_GAP)];
  const tallest = Math.max(...sizes.map(([, h]) => h));
  const both = requests.length > 1 && roomAbove >= tallest && roomBelow >= tallest;
  const middle = box.y + box.h / 2;
  const laidOn = (lone: "above" | "below" | "split"): Laid => {
    const sideOf = (index: number): "above" | "below" => (lone === "split" ? (points[index][1] < middle ? "above" : "below") : lone);
    const layouts = new Map<string, LabelLayout>();
    let fits = true;
    for (const side of ["above", "below"] as const) {
      const members = requests.map((_, index) => index).filter((index) => sideOf(index) === side).sort((a, b) => points[a][0] - points[b][0]);
      if (members.length === 0) continue;
      // Members fill a row left to right; one that would run past the frame starts the next row out.
      const rows: number[][] = [[]];
      let used = 0;
      for (const index of members) {
        const width = sizes[index][0] + COLUMN_GAP;
        if (rows[rows.length - 1].length > 0 && used + width - COLUMN_GAP > frame.w) {
          rows.push([]);
          used = 0;
        }
        rows[rows.length - 1].push(index);
        used += width;
      }
      const rowH = tallest + ROW_GAP;
      const room = (side === "above" ? roomAbove : roomBelow) - (rows.length * rowH - ROW_GAP);
      if (room < 0) fits = false;
      const xs = rows.map((row) => stackColumn(row.map((index) => points[index][0]), row.map((index) => sizes[index][0]), frame.x, frame.x + frame.w, COLUMN_GAP));
      const rowsAt = (out: number) =>
        rows.flatMap((row, depth) => {
          const y = side === "below" ? box.y + box.h + COLUMN_GAP + out + depth * rowH + tallest / 2 : box.y - COLUMN_GAP - out - depth * rowH - tallest / 2;
          return row.map((index, k): [string, LabelLayout] => [requests[index].key, { centre: [xs[depth][k], y], size: sizes[index], fontPx, place: "pointer", point: points[index] }]);
        });
      // Rows kept off what is drawn beside the picture step out past it, while there is room.
      const steps = Array.from({ length: Math.max(0, Math.floor(room / ROW_STEP)) + 1 }, (_, k) => k * ROW_STEP);
      const clear = steps.find((out) => allClear(new Map(rowsAt(out)), taken));
      if (clear === undefined) fits = false;
      for (const [key, layout] of rowsAt(clear ?? 0)) layouts.set(key, layout);
    }
    return { layouts, fits };
  };
  // The rows whose pointers run shortest, stepped past what is drawn there: chosen by room alone, "border"
  // on a map's top edge went under the whole map.
  const tried = (both ? (["split", "above", "below"] as const) : (["above", "below"] as const)).map(laidOn);
  const fitting = tried.filter((one) => one.fits).sort((a, b) => pointerReach(a.layouts) - pointerReach(b.layouts));
  return fitting[0] ?? tried[0];
}

/**
 * The pointer labels of one picture, in a column beside it where there is room, else in rows over or
 * under it unless open spots near each part are much closer, else each on the nearest open space round
 * what it names, with its pointer. Only when none
 * of these is clear is one written across a drawing, and it is marked as having had nowhere to go.
 */
function pointerColumns(requests: LabelRequest[], frame: Rect, taken: Drawn[]): Map<string, LabelLayout> {
  const points = requests.map((request) => referentPoint({ drawn: request.drawn }));
  const tried = requests[0]?.sizes ?? SIZES;
  for (const fontPx of tried) {
    const sizes = requests.map((request) => labelSize(request.text, request.title, fontPx, request.plated));
    const columns = sideColumns(requests, sizes, points, frame, taken, fontPx);
    if (columns.fits) return columns.layouts;
    const rows = sideRows(requests, sizes, points, frame, taken, fontPx);
    if (!rows.fits) continue;
    if (pointerReach(rows.layouts) <= ROWS_NEAR * requests.length) return rows.layouts;
    // Rows across the frame from what they name give way to open spots near each part: a name under a body's feet pointed at its arm.
    const near = nearestSpots(requests, points, frame, taken);
    const clear = [...near.values()].every((layout) => !layout.blocked);
    return clear && pointerReach(near) < pointerReach(rows.layouts) * ROWS_GIVE_WAY ? near : rows.layouts;
  }
  return nearestSpots(requests, points, frame, taken);
}

/** How far a layout's labels stand off what they name, all told. */
function pointerReach(layouts: Map<string, LabelLayout>): number {
  return [...layouts.values()].reduce((sum, layout) => sum + Math.hypot(layout.centre[0] - layout.point[0], layout.centre[1] - layout.point[1]), 0);
}

/** Each pointer label on the open spot nearest what it names whose pointer crosses no writing, else the nearest round it. */
function nearestSpots(requests: LabelRequest[], points: Pt[], frame: Rect, taken: Drawn[]): Map<string, LabelLayout> {
  const layouts = new Map<string, LabelLayout>();
  const laid: Drawn[] = [];
  requests.forEach((request, index) => {
    const point = points[index];
    // Off the whole of its picture: a part's name in the picture's own free space reads as the name of that
    // space. A cut-out's notches are open page, so only its outline is kept off, by a margin.
    const owner: Drawn[] = request.ownerShape ? [{ area: request.ownerShape }, { stroke: [...request.ownerShape, request.ownerShape[0]], width: OWNER_MARGIN * 2 }] : [{ box: request.ownerBox }];
    const obstacles = [...taken, ...laid, ...owner];
    // A pointer drawn through other writing reads as naming that writing.
    const writing = [...taken, ...laid].flatMap((one) => ("box" in one && !meets(one, rectAt(point, [1, 1])) ? [one.box] : []));
    const leaderClear = (r: Rect) => !writing.some((box) => segmentMeets([r.x + r.w / 2, r.y + r.h / 2], point, box));
    const sizes = (request.sizes ?? SIZES).map((fontPx) => ({ fontPx, size: labelSize(request.text, request.title, fontPx, request.plated) }));
    const spotAt = ({ fontPx, size }: { fontPx: number; size: [number, number] }) => {
      const at = placeAnywhere(point, size, obstacles, frame, leaderClear, SPOT_STEP);
      return at && { fontPx, size, spot: { at, clear: true }, far: Math.hypot(at[0] - point[0], at[1] - point[1]) };
    };
    // The largest size that stands about as near as the smallest can: the largest alone went under the feet to name an arm.
    const least = spotAt(sizes[sizes.length - 1]);
    let open: { fontPx: number; size: [number, number]; spot: { at: Pt; clear: boolean } } | undefined;
    for (const one of least ? sizes.slice(0, -1) : []) {
      const tried = spotAt(one);
      if (tried && tried.far <= least!.far * NEAR_ENOUGH) {
        open = tried;
        break;
      }
    }
    open ??= least;
    // With no spot whose pointer runs clear, the nearest spot round it; with nowhere clear, the smallest size on the least covered spot.
    if (!open) {
      const tries = sizes.map(({ fontPx, size }) => ({ fontPx, size, spot: placeBeside({ drawn: request.drawn }, size, obstacles, "near", { frame, gap: 8 }) }));
      open = tries.find((one) => one.spot.clear) ?? tries[tries.length - 1];
    }
    const layout: LabelLayout = { centre: open.spot.at, size: open.size, fontPx: open.fontPx, place: "pointer", point, ...(open.spot.clear ? {} : { blocked: true }) };
    layouts.set(request.key, layout);
    laid.push({ box: rectAt(layout.centre, layout.size) }, { stroke: [layout.centre, point] });
  });
  return layouts;
}

/** Every label of a scene laid out: in the order they appear, each clear of what is on screen with it. */
export function layoutLabels(requests: LabelRequest[], frame: Rect): Map<string, LabelLayout> {
  const layouts = new Map<string, LabelLayout>();
  const written: { rect: Rect; window: [number, number] }[] = [];
  const pointers = new Map<string, LabelRequest[]>();
  for (const request of [...requests].sort((a, b) => a.window[0] - b.window[0])) {
    const taken = [...request.obstacles, ...written.filter((one) => during(one.window, request.window)).map((one): Drawn => ({ box: one.rect }))];
    const layout = inPlace(request, taken, frame);
    if (!layout) {
      pointers.set(request.owner, [...(pointers.get(request.owner) ?? []), request]);
      continue;
    }
    layouts.set(request.key, layout);
    written.push({ rect: rectAt(layout.centre, layout.size), window: request.window });
  }
  // A picture's pointer names make room only for the names on screen with them: one later in time takes its own slot.
  const groups = [...pointers.values()].flatMap((owned) =>
    owned.reduce<LabelRequest[][]>((sets, request) => {
      const meets = sets.filter((set) => set.some((other) => during(other.window, request.window)));
      return [...sets.filter((set) => !meets.includes(set)), [...meets.flat(), request]];
    }, []),
  );
  for (const group of groups) {
    const window: [number, number] = [Math.min(...group.map((request) => request.window[0])), Math.max(...group.map((request) => request.window[1]))];
    const taken = [...group.flatMap((request) => request.obstacles), ...written.filter((one) => during(one.window, window)).map((one): Drawn => ({ box: one.rect }))];
    for (const [key, layout] of pointerColumns(group, frame, taken)) {
      layouts.set(key, layout);
      written.push({ rect: rectAt(layout.centre, layout.size), window: group.find((request) => request.key === key)!.window });
    }
  }
  return layouts;
}

/** A colour part of the way from `from` to `to`, for writing blended toward the page. */
export function blend(from: string, to: string, share: number): string {
  const rgb = (hex: string) => {
    const value = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    return value ? [0, 8, 16].map((shift) => (parseInt(value[1], 16) >> (16 - shift)) & 255) : undefined;
  };
  const [a, b] = [rgb(from), rgb(to)];
  if (!a || !b) return from;
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * share).toString(16).padStart(2, "0")).join("")}`;
}
