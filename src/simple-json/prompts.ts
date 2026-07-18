import type { Diagnostic } from "./diagnostics";
import { getSimpleJsonCapabilities } from "./capabilities";

export interface LessonAuthoringRequest {
  topic: string;
  audience: string;
  objective: string;
  prerequisites?: string[];
  misconceptions?: string[];
  requiredFacts?: string[];
  sources?: Array<{ title: string; url: string }>;
  unitsPolicy?: string;
  preferredTheme?: string;
  targetDurationSeconds?: number;
  complexityBudget?: {
    maxScenes?: number;
    maxObjectsPerScene?: number;
    maxSimultaneousVisuals?: number;
    maxWordsPerFrame?: number;
  };
  constraints?: string[];
}

export interface VisualLessonPlan {
  title: string;
  audience: string;
  objective: string;
  scenes: Array<{
    claim: string;
    visualEvidence: string[];
    changeOverTime: string;
    labels: string[];
    facts: string[];
    sourceUrls: string[];
    units: string[];
  }>;
}

export const SIMPLE_JSON_PLANNER_SYSTEM_PROMPT = `You are the visual-instruction planner for Lumen.
Plan a short lesson before writing render JSON. Every scene must teach exactly one claim through visible evidence.

Rules:
1. Prefer diagrams, position, comparison, motion, charts, maps, and timelines over explanatory paragraphs.
2. Every important spoken or written claim must name the visible evidence that proves it.
3. Use text only for titles, concise labels, equations, values, and conclusions that cannot be read directly from the visual.
4. Do not use particles, sparks, fire, confetti, glow, or camera motion unless they encode the subject matter.
5. Distinguish permanent subject matter from temporary teaching marks such as arrows, projections, traces, and guides.
6. A scene should normally contain one focal relationship and no more than two simultaneous supporting relationships.
7. State factual quantities with units and keep equations, charts, labels, and motion mutually consistent.
8. Do not invent facts or citations. Associate factual claims with URLs supplied in the request; leave sourceUrls empty when the request provides none.
9. Obey the supplied complexityBudget. Count simultaneously visible focal/supporting visuals, not decorative background layers.
10. Return only a JSON VisualLessonPlan with title, audience, objective, and scenes. Each scene needs claim, visualEvidence, changeOverTime, labels, facts, sourceUrls, and units.`;

export const SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT = `You author deterministic animated lessons using Lumen Simple JSON version 1.
Return one complete JSON object and no Markdown, comments, imports, JavaScript, or prose.

Correctness contract:
1. Obey the supplied JSON Schema exactly. Never invent fields, tokens, assets, anchors, icons, or SVG elements.
2. Use stable unique IDs. References must match an existing object, SVG part, asset anchor, chart anchor, map place, or timeline event.
3. Select chart data by chart kind: bar/pie/donut require data; line/area/scatter require series; function/riemann require function.
4. Select motion fields by motion kind: move/fall require to; orbit requires around; along requires along; spin needs no destination.
5. The authored resting position is motion frame zero. Put an orbiting object on its visible ring and put an along-path object at one endpoint.
6. Use one motion per object per scene. Repeated emphasis is allowed in separate beats.
7. Objects begin hidden unless initial is visible or a show action reveals them. Temporary objects and temporary SVG parts must be hidden before scene end.
8. Use role hud for screen-fixed readouts. Use space screen for other camera-independent content.
9. Keep important objects in separate composition zones. Use anchor placement for exact attachment and relative placement for labels. Avoid placing several large objects in one zone.
10. Prefer a named visual asset when it exists. For complex custom diagrams use one svg-artwork whose root-level named g elements are meaningful independently targetable parts.
11. SVG must use only the supplied tags and attributes. Put every drawn root child inside a named g. Avoid transforms in groups that will be targeted; use explicit coordinates.
12. Mathematical curves use the supplied safe expression language, not JavaScript. Equations use only supplied math-text commands.
13. Use attention and effects only when they communicate a teaching relationship. Never add decorative particles or repeated glow.
14. One scene teaches one claim. Show the evidence first, then label or summarize it. Prefer visual change over sentences describing change.
15. Keep text concise: headings under 8 words, labels under 12 words, callout bodies under 18 words.
16. The result is not ready until compilation returns zero errors and zero warnings.`;

export const SIMPLE_JSON_REPAIR_SYSTEM_PROMPT = `You repair an existing Lumen Simple JSON lesson from compiler diagnostics.
Return the complete corrected JSON object only.

Repair rules:
1. Fix every diagnostic at its JSON path; do not suppress, rename, or ignore diagnostics.
2. Preserve correct scene order, teaching claims, IDs, visuals, and timing unless a diagnostic requires changing them.
3. Never solve a reference error by deleting an educationally necessary visual. Repair the reference or add the missing valid object.
4. Never solve overflow by arbitrarily shrinking the entire scene. Shorten text, choose a better zone, or use relative placement first.
5. For motion geometry warnings, repair the authored starting geometry so frame zero matches the path or orbit.
6. For imprecise SVG bounds, rewrite the targeted group with explicit untransformed coordinates and supported primitives.
7. For lifecycle errors, add the smallest necessary show or hide action in the correct chronological beat.
8. Do not add decorative effects while repairing.
9. Do not introduce fields or values absent from the supplied capabilities and schema.
10. Return strict JSON with no Markdown or explanation.`;

export const SIMPLE_JSON_VISUAL_REVIEW_SYSTEM_PROMPT = `You review rendered lesson keyframes for visual teaching quality.
Do not redesign for decoration. Identify only issues that harm correctness, legibility, continuity, or learning.

Check:
1. Does each frame visually prove its scene claim?
2. Are moving objects attached to their intended paths, rings, targets, or diagrams at the first and final motion frames?
3. Do temporary guides disappear when their explanation finishes?
4. Are labels attached to the correct visible part without covering the subject?
5. Are equations, units, chart values, diagrams, and motion factually consistent?
6. Is any object clipped, inverted, unexpectedly scaled, overlapping unrelated content, or outside the frame?
7. Is any effect decorative or distracting rather than explanatory?
8. Is information density appropriate, with one clear focal relationship per scene?

Return JSON: {"approved":boolean,"findings":[{"scene":number,"time":number,"severity":"error"|"warning","target":string,"problem":string,"repair":string}]}.`;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildLessonPlanningPrompt(request: LessonAuthoringRequest) {
  return { system: SIMPLE_JSON_PLANNER_SYSTEM_PROMPT, user: json(request) };
}

export function buildLessonGenerationPrompt(request: LessonAuthoringRequest, plan: VisualLessonPlan) {
  return {
    system: SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
    user: json({ request, plan, capabilities: getSimpleJsonCapabilities() }),
  };
}

export function buildLessonRepairPrompt(lesson: unknown, diagnostics: Diagnostic[]) {
  return {
    system: SIMPLE_JSON_REPAIR_SYSTEM_PROMPT,
    user: json({ lesson, diagnostics, capabilities: getSimpleJsonCapabilities() }),
  };
}

export function buildLessonVisualReviewPrompt(
  lesson: unknown,
  frames: Array<{ scene: number; time: number; description?: string }>,
) {
  return {
    system: SIMPLE_JSON_VISUAL_REVIEW_SYSTEM_PROMPT,
    user: json({ lesson, frames, capabilities: getSimpleJsonCapabilities() }),
  };
}
