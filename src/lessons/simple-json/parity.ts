import type { Component, Film } from "../../gcl/schema";

export interface LessonParityManifest {
  scenes: number;
  required: Record<string, number>;
}

export const LESSON_PARITY_MANIFESTS = {
  calculus: {
    scenes: 6,
    required: { "type:chart": 6, "chart:riemann": 3, "chart:function": 1, "chart:area": 2, "type:equation": 6, "type:stat": 4, "type:attention": 4, "type:camera": 1, "type:glow": 1 },
  },
  gravity: {
    scenes: 6,
    required: { "type:prop": 3, "type:parametric": 3, "chart:function": 1, "chart:scatter": 1, "motion:fall": 1, "motion:orbit": 3, "type:particles": 3, "type:glow": 4, "type:attention": 4, "type:camera": 3 },
  },
  mongol: {
    scenes: 6,
    required: { "type:map": 6, "type:timeline": 2, "type:legend": 1, "type:camera": 6, "type:attention": 5, "type:flow": 1, "type:stat": 4 },
  },
  neuron: {
    scenes: 6,
    required: { "type:prop": 6, "chart:line": 3, "type:particles": 4, "type:flow": 2, "type:glow": 1, "motion:along": 1, "type:group": 1, "type:attention": 6, "type:camera": 3 },
  },
} as const satisfies Record<string, LessonParityManifest>;

function componentTokens(component: Component): string[] {
  const tokens = [`type:${component.type}`];
  if (component.type === "chart") tokens.push(`chart:${component.chart}`);
  if (component.type === "prop") tokens.push(`prop:${component.name}`);
  if (component.type === "attention") tokens.push(`attention:${component.verb}`);
  if (component.motion) tokens.push(`motion:${component.motion.kind}`);
  return tokens;
}

export function checkLessonParity(film: Film, manifest: LessonParityManifest): string[] {
  const sceneCount = film.filter((item) => item.type === "scene").length;
  const counts = new Map<string, number>();
  for (const item of film) {
    if (item.type === "scene") continue;
    for (const token of componentTokens(item)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const failures: string[] = [];
  if (sceneCount !== manifest.scenes) failures.push(`scenes: expected ${manifest.scenes}, received ${sceneCount}`);
  for (const [token, minimum] of Object.entries(manifest.required)) {
    const actual = counts.get(token) ?? 0;
    if (actual < minimum) failures.push(`${token}: expected at least ${minimum}, received ${actual}`);
  }
  return failures;
}
