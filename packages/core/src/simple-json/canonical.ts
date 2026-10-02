import type { Component, Film, Position } from "../gcl/schema";
import type { Diagnostic, ValidationResult } from "./diagnostics";
import { polylineLengths, sampleAtLength } from "../geometry/path";

const SLOTS = new Set(["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right", "ground", "sky"]);

function finiteDiagnostics(value: unknown, path: string): Diagnostic[] {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return [{ code: "CANONICAL_ERROR", path, message: "Generated canonical numbers must be finite", received: value }];
  }
  if (Array.isArray(value)) return value.flatMap((entry, index) => finiteDiagnostics(entry, `${path}/${index}`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => finiteDiagnostics(entry, `${path}/${key}`));
}

function stringTargets(component: Component): Array<{ value: Position | undefined; field: string }> {
  const targets: Array<{ value: Position | undefined; field: string }> = [];
  if (component.type === "camera") targets.push({ value: component.to, field: "to" });
  if (component.type === "attention") {
    targets.push({ value: component.target, field: "target" });
    targets.push({ value: component.from, field: "from" });
  }
  if (component.type === "flow") {
    targets.push({ value: component.from, field: "from" });
    targets.push({ value: component.to, field: "to" });
  }
  (component.motions ?? []).forEach((motion, index) => {
    if (motion.kind === "move" || motion.kind === "fall") targets.push({ value: motion.to, field: `motions/${index}/to` });
    if (motion.kind === "orbit" || motion.kind === "spin") targets.push({ value: motion.center, field: `motions/${index}/center` });
  });
  return targets;
}

function validateScene(components: Component[], offset: number): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const ids = new Set<string>();
  const geo = new Set<string>();
  const positions = new Map<string, [number, number]>();
  components.forEach((component, index) => {
    if (component.id) {
      if (ids.has(component.id)) errors.push({ code: "CANONICAL_ERROR", path: `/${offset + index}/id`, message: `Duplicate canonical id '${component.id}'`, received: component.id });
      ids.add(component.id);
      if (Array.isArray(component.at) && component.at.length === 2) positions.set(component.id, component.at);
    }
    if (component.type === "map") {
      component.features.forEach((feature) => geo.add(feature.id));
      component.places?.forEach((place) => geo.add(place.name));
      component.markers?.forEach((marker) => { if (marker.label) geo.add(marker.label); });
    }
  });

  const known = (target: string) => SLOTS.has(target) || ids.has(target) || geo.has(target) || (target.includes(".") && ids.has(target.slice(0, target.indexOf("."))));
  components.forEach((component, index) => {
    for (const target of stringTargets(component)) {
      if (typeof target.value === "string" && !known(target.value)) {
        errors.push({ code: "CANONICAL_ERROR", path: `/${offset + index}/${target.field}`, message: `Unknown generated canonical target '${target.value}'`, received: target.value });
      }
    }

    // Later journeys start where the one before left the thing, so only the first can jump from rest;
    // a thing carried in another's frame (`pin`) starts it wherever that frame has taken it.
    const resting = component.id && !component.pin ? positions.get(component.id) : undefined;
    const journeyIndex = (component.motions ?? []).findIndex((motion) => motion.kind !== "spin");
    const journey = journeyIndex < 0 ? undefined : component.motions![journeyIndex];
    if (resting && journey?.kind === "orbit" && typeof journey.center === "string") {
      const center = positions.get(journey.center);
      if (center) {
        const from = journey.from ?? 0;
        const rx = journey.rx ?? journey.radius ?? 80;
        const ry = journey.ry ?? journey.radius ?? 80;
        const expected: [number, number] = [center[0] + Math.cos(from) * rx, center[1] + Math.sin(from) * ry];
        const jump = Math.hypot(resting[0] - expected[0], resting[1] - expected[1]);
        if (jump > 0.5) {
          errors.push({
            code: "CANONICAL_ERROR",
            path: `/${offset + index}/motions/${journeyIndex}`,
            message: `Orbit motion would jump ${jump.toFixed(1)} view units on its first frame`,
            received: journey,
          });
        }
      }
    }
    if (resting && journey?.kind === "along" && journey.path.length > 0) {
      // The traveller enters the path at `startAt` — where it already rests — so that is the point
      // the first frame is measured against, not the path's first sample.
      const path = journey.path;
      const entry = Math.min(1, Math.max(0, journey.startAt ?? 0));
      const lengths = polylineLengths(path);
      const at = sampleAtLength(path, lengths, entry * lengths[lengths.length - 1]);
      const first = [at.x, at.y];
      const jump = Math.hypot(resting[0] - first[0], resting[1] - first[1]);
      if (jump > 0.5) {
        errors.push({
          code: "CANONICAL_ERROR",
          path: `/${offset + index}/motions/${journeyIndex}/path/0`,
          message: `Along-path motion would jump ${jump.toFixed(1)} view units on its first frame`,
          received: first,
        });
      }
    }
  });
  return errors;
}

export function validateCanonicalFilm(film: Film): ValidationResult<Film> {
  const errors = finiteDiagnostics(film, "");
  if (film.length === 0 || film[0].type !== "scene") {
    errors.unshift({ code: "CANONICAL_ERROR", path: "/0", message: "Canonical film must begin with a scene marker", received: film[0] });
  }

  let start = -1;
  for (let index = 0; index <= film.length; index++) {
    const item = film[index];
    if (index < film.length && item.type !== "scene") continue;
    if (start >= 0) errors.push(...validateScene(film.slice(start + 1, index) as Component[], start + 1));
    if (index < film.length && item.type === "scene") {
      start = index;
      if (!(typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration > 0)) {
        errors.push({ code: "CANONICAL_ERROR", path: `/${index}/duration`, message: "Generated scene duration must be a positive finite number", received: item.duration });
      }
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: film, warnings: [] };
}

// What a canonical error names that can be taken out on its own: one motion of a component, or a
// camera, pointer or flow aimed at nothing. Anything else breaks the scene as a whole.
const MOTION_AT = /^\/(\d+)\/motions\/(\d+)(?:\/|$)/;
const LOOSE_TARGETS: ReadonlySet<Component["type"]> = new Set(["camera", "attention", "flow"]);

/**
 * The film with every recoverable canonical error taken out where it lies — the motion that would jump
 * or names nothing, the camera, pointer or flow aimed at nothing — each reported as a warning, and the
 * errors that still break it. One bad motion used to refuse the whole scene.
 */
export function repairCanonicalFilm(film: Film, errors: Diagnostic[]): { film: Film; warnings: Diagnostic[]; errors: Diagnostic[] } {
  const motions = new Map<number, Set<number>>();
  const components = new Set<number>();
  const warnings: Diagnostic[] = [];
  const fatal: Diagnostic[] = [];
  for (const error of errors) {
    const motion = MOTION_AT.exec(error.path);
    const item = Number(/^\/(\d+)\//.exec(error.path)?.[1]);
    const component = Number.isInteger(item) ? (film[item] as Component | undefined) : undefined;
    if (motion && component?.motions?.[Number(motion[2])]) {
      motions.set(item, new Set([...(motions.get(item) ?? []), Number(motion[2])]));
      warnings.push({ ...error, code: "MOTION_REFUSED", message: `${error.message}; the motion is not played` });
    } else if (component && LOOSE_TARGETS.has(component.type) && error.message.startsWith("Unknown generated canonical target")) {
      components.add(item);
      warnings.push({ ...error, code: "DROPPED_ACTION", message: `${error.message}; it is not played` });
    } else fatal.push(error);
  }
  if (fatal.length > 0 || warnings.length === 0) return { film, warnings: [], errors };
  const repaired = film.flatMap((item, index): Film => {
    if (components.has(index)) return [];
    const dropped = motions.get(index);
    const component = item as Component;
    return dropped ? [{ ...component, motions: component.motions!.filter((_, at) => !dropped.has(at)) } as Component] : [item];
  });
  const again = validateCanonicalFilm(repaired);
  return again.valid ? { film: repaired, warnings, errors: [] } : { film, warnings: [], errors: again.errors };
}
