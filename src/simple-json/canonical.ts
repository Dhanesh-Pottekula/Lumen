import type { Component, Film, Position } from "../gcl/schema";
import type { Diagnostic, ValidationResult } from "./diagnostics";

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
  if (component.motion) {
    if (component.motion.kind === "move" || component.motion.kind === "fall") targets.push({ value: component.motion.to, field: "motion/to" });
    if (component.motion.kind === "orbit") targets.push({ value: component.motion.center, field: "motion/center" });
  }
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

    const resting = component.id ? positions.get(component.id) : undefined;
    if (resting && component.motion?.kind === "orbit" && typeof component.motion.center === "string") {
      const center = positions.get(component.motion.center);
      if (center) {
        const from = component.motion.from ?? 0;
        const rx = component.motion.rx ?? component.motion.radius ?? 80;
        const ry = component.motion.ry ?? component.motion.radius ?? 80;
        const expected: [number, number] = [center[0] + Math.cos(from) * rx, center[1] + Math.sin(from) * ry];
        const jump = Math.hypot(resting[0] - expected[0], resting[1] - expected[1]);
        if (jump > 0.5) {
          errors.push({
            code: "CANONICAL_ERROR",
            path: `/${offset + index}/motion`,
            message: `Orbit motion would jump ${jump.toFixed(1)} view units on its first frame`,
            received: component.motion,
          });
        }
      }
    }
    if (resting && component.motion?.kind === "along" && component.motion.path.length > 0) {
      const first = component.motion.path[0];
      const jump = Math.hypot(resting[0] - first[0], resting[1] - first[1]);
      if (jump > 0.5) {
        errors.push({
          code: "CANONICAL_ERROR",
          path: `/${offset + index}/motion/path/0`,
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
