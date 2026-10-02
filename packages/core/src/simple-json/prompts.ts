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
    /** This scene's segment of the uninterrupted spoken narration. */
    cue: string;
    visualEvidence: string[];
    changeOverTime: string;
    labels: string[];
    facts: string[];
    sourceUrls: string[];
    units: string[];
  }>;
}

export type SupportedCodingAgent = "codex" | "claude";

const CODING_AGENT_RULES = `Create a Lumen Simple JSON educational video.

Work in three internal phases: plan the visual argument, author the lesson, and
repair every compiler diagnostic. Your final answer must contain the complete
LessonSpec JSON and a short list of commands the user can run to preview it.

Requirements:
1. Read the repository's AGENTS.md or CLAUDE.md and the Lumen authoring guide before editing.
2. Use only version 1 Simple JSON capabilities returned in the prompt payload.
3. Do not add custom renderer code to make one lesson work.
4. Do not call an LLM at playback time and do not add an LLM SDK to Lumen.
5. Never read, request, print, or embed provider secrets. Narration credentials are supplied by the application at runtime.
6. Prefer visible evidence, motion, diagrams, charts, maps, and timelines over explanatory paragraphs.
7. Compile the lesson and repair all errors and warnings before reporting success.
8. Review representative start, middle, transition, and final frames for clipping, overlap, lifecycle leaks, and motion continuity.
9. Keep example lessons outside the publishable core package.
10. Do not publish, commit, or push unless the user explicitly asks.`;

export const CODEX_VIDEO_AUTHORING_PROMPT = `You are Codex working in a Lumen repository.
Follow AGENTS.md as the repository contract. Use terminal inspection, the public
capabilities object, validation diagnostics, builds, and rendered keyframes as
evidence. Make scoped edits and verify the result.

${CODING_AGENT_RULES}`;

export const CLAUDE_VIDEO_AUTHORING_PROMPT = `You are Claude Code working in a Lumen repository.
Follow CLAUDE.md as the repository contract. Inspect the public capabilities
object, author valid data, use compiler diagnostics as a repair loop, and review
rendered keyframes before declaring the lesson complete.

${CODING_AGENT_RULES}`;

export const SIMPLE_JSON_PLANNER_SYSTEM_PROMPT = `You are the visual-instruction planner for Lumen.
Plan a short lesson before writing render JSON. Every scene must teach exactly one claim through visible evidence.

Rules:
1. Prefer diagrams, position, comparison, motion, charts, maps, and timelines over explanatory paragraphs.
2. Every important spoken or written claim must name the visible evidence that proves it.
3. Use text only for concise labels, equations, values, and conclusions that cannot be read directly from the visual.
4. Do not use particles, sparks, fire, confetti, glow, or camera motion. Express subject-matter change with ordinary objects, paths, arrows, diagrams, and charts.
5. Distinguish permanent subject matter from temporary teaching marks such as arrows, projections, traces, and guides.
6. A scene should normally contain one focal relationship and no more than two simultaneous supporting relationships.
7. State factual quantities with units and keep equations, charts, labels, and motion mutually consistent.
8. Do not invent facts or citations. Associate factual claims with URLs supplied in the request; leave sourceUrls empty when the request provides none.
9. Obey the supplied complexityBudget. Count simultaneously visible focal/supporting visuals, not decorative background layers.
10. For each scene, write one "cue". Each cue is that scene's segment of the teacher voice-over, points the ear at visible evidence with second-person language ("notice", "watch"), and flows into the next cue without announcing scene changes.
11. Concatenating the scene cues in order must produce one continuous voice-over. Length follows the material: targetDurationSeconds is a pacing hint at about 2.5 words per second, not a limit. Spend the words a topic genuinely needs and no more — the film lasts exactly as long as the narration takes, so padding costs the viewer time while cutting a required step costs them the lesson. Do not add another cue outside the scenes.
12. Give each distinct idea its own scene rather than compressing everything into the fewest scenes. Use as many scenes as the topic needs up to complexityBudget.maxScenes, and only merge related ideas when the brief would otherwise exceed it. Drop nothing important.
13. Return exactly one top-level JSON object with this shape and no prose, Markdown, or second object:
{
  "title": "string",
  "audience": "string",
  "objective": "string",
  "scenes": [{
    "claim": "string",
    "cue": "string",
    "visualEvidence": ["array of strings"],
    "changeOverTime": "string",
    "labels": ["array of strings"],
    "facts": ["array of strings"],
    "sourceUrls": ["array of strings"],
    "units": ["array of strings"]
  }]
}
Every listed field is required. Keep array fields as arrays even when empty or when they contain only one string. Do not add fields beyond this shape; put caveats and qualifiers inside the relevant scene's facts array.`;

export const SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT = `You author deterministic animated lessons using Lumen Simple JSON version 1.
Return one complete JSON object and no Markdown, comments, imports, JavaScript, or prose.

Correctness contract:
1. Obey the supplied JSON Schema exactly. Never invent fields, tokens, assets, anchors, icons, or SVG elements.
2. Use stable unique IDs. References must match an existing object, SVG part, asset anchor, chart anchor, map place, or timeline event.
3. Select chart data by chart kind: bar/pie/donut require data; line/area/scatter require series; function/riemann require function.
4. Select motion fields by motion kind: move/fall require to; orbit requires around; along requires along or through; spin needs no destination. Show and hide take a targets list; every other verb takes one target. The along field names a visible line, span, curve or path, and the traveller walks exactly the route it draws; through instead names things to pass through in order.
5. The authored resting position is motion frame zero. Put an orbiting object on its visible ring and an along traveller within half a view unit of one line endpoint. Every to, around, or along destination is already visible before its motion beat. Around names a plain object id or dotted part id, never a generic or asset anchor.
6. Use one motion per target per scene; a named part and its owning artwork each count as their own target. Repeated emphasis is allowed in separate beats.
7. Objects begin hidden. Use initial visible for frame-zero presence or reveal later with show, never both; when unsure, omit initial and use show. Parts inherit their owner's visibility unless a composite part explicitly starts hidden. Temporary objects and parts must be hidden before scene end.
8. Use role hud for screen-fixed readouts. Use space screen for other camera-independent content.
9. Zones lay out slide furniture, and several objects in one zone stack vertically like a list. Never assemble one spatial picture (orbits, cycles, cross-sections, machines) from separate zone-placed objects: draw it as one svg-artwork in the main zone, positioning every element in the artwork's own coordinate space. Reserve zones for captions, legends, and HUD readouts; use anchor placement for exact attachment and relative placement for labels.
9a. Give that drawing a viewBox matching the 9:16 portrait frame, near 0 0 450 800. An artwork's height follows its viewBox aspect, so a squat landscape drawing fits the frame width and wastes the tall space above and below it.
10. Prefer a named visual asset when it exists. For complex custom diagrams use one svg-artwork whose root-level named g elements are meaningful independently targetable parts.
10a. svg-artwork is {id, kind, svg}: its svg string carries its own viewBox, and the object itself never takes viewBox, width, or height. Its named root g elements are its parts, measured from their own geometry.
10b. Animate inside one drawing by aiming actions at its named parts, which move, emphasize, and reveal independently: {"do": "motion", "target": "solarArt.mercury", "motion": "orbit", "around": "solarArt.sun", "turns": 3}. One artwork can therefore hold eight planets travelling eight orbits at eight speeds. An action aimed at the whole artwork instead applies to every part together, moving the drawing in formation.
10c. Motion reads its geometry from where you drew each part, so draw it where the motion begins. An orbiting part must sit on the ring it should travel, because its distance from the named centre is what sets the orbit radius — there is no radius token — and an along-path part must sit at one end of its path.
11. SVG must use only the supplied tags and attributes. Put every drawn root child inside a named g. A dotted SVG part used as a spatial reference contains supported primitives with explicit coordinates and no transforms.
12. Mathematical curves use only expressionFunctions and expressionConstants from capabilities, never JavaScript. Equations use only supplied math-text commands.
13. Use attention only when it communicates a teaching relationship. Author effect and camera actions only within the visual policy's gates below — the policy decides when weather, glow, or a slow camera move is earned; never author tour actions. Only the callout verb draws its text and title on screen; every other attention verb ignores them, so put words on screen with a label action or a text object.
14. One scene teaches one claim. Show the evidence first, then label or summarize it. Prefer visual change over sentences describing change.
15. Large is the normal artwork ceiling when strip or footer content is present, because hero and fill cover enough of the frame to collide with both. Two objects placed side by side in main-left and main-right must be medium or smaller. Keep important objects within the 24-unit safe frame.
16. On-screen text obeys request.complexityBudget.maxWordsPerFrame. Labels and callouts stay under 12 words.
17. There is one authoring call and no diagnostic loop. Author against this contract in that call; blocking diagnostics reject the film.

Cue pacing (the spoken voice-over is distinct from on-screen text):
18. Do not add cue or narration fields to the LessonSpec. The planner's scene cues are concatenated once for continuous audio.
19. Each scene's beat budget follows that planned scene's cue at normal pace, approximately 2.2 seconds per beat. Order reveals and motion with the spoken evidence; audio time directly drives the complete visual timeline.
20. Keep on-screen labels concise and complementary to the scene cue rather than copying spoken prose onto the canvas.

Validator rules that reject the whole film:
21. Never put <text> or <tspan> inside svg-artwork markup. All words on screen come from text objects; artwork is purely graphic.
22. Never show an object that is already visible (initial "visible"), and never show the same object or part twice in one scene. Showing an object reveals all its parts at once; parts inherit an owner's initial visibility, so an svg-artwork marked "initial": "visible" makes every one of its parts initially visible too, and showing any single one of them is then rejected.
22a. To build a labeled diagram up piece by piece, omit "initial" on the artwork and show its parts one at a time ("targets": ["chloroplastArt.outerMembrane"], then ["chloroplastArt.stroma"]). To present a diagram whole and then talk over it, either show the object once in a beat or mark it "initial": "visible" and add no show action anywhere, reaching for emphasize, attention, or label to direct the eye instead.
23. Every action target that names an SVG part must be dotted as objectId.partId (for example "plant.leaf_top", never bare "leaf_top"). temporaryParts entries stay bare part names.
24. Omit temporaryParts entirely when a drawing has none; an empty array is invalid.
25. Never target a transformed g (rotate/translate/scale) with attention or effects. Use explicit coordinates instead of transforms in any part you plan to target.`;

export const SIMPLE_JSON_REPAIR_SYSTEM_PROMPT = `You repair an existing Lumen Simple JSON lesson from compiler diagnostics.
Return the complete corrected JSON object only.

Repair rules:
0. Scene-level narration is forbidden. Preserve the joined planner-scene audio by leaving narration out of every authored scene.
1. Fix every diagnostic at its JSON path; do not suppress, rename, or ignore diagnostics.
2. Preserve correct scene order, teaching claims, IDs, visuals, and timing unless a diagnostic requires changing them.
3. Never solve a reference error by deleting an educationally necessary visual. Repair the reference or add the missing valid object.
4. Never solve overflow by arbitrarily shrinking the entire scene. Shorten text, choose a better zone, or use relative placement first.
5. For motion geometry warnings, repair the authored starting geometry so frame zero matches the path or orbit.
6. For imprecise SVG bounds, rewrite the targeted group with explicit untransformed coordinates and supported primitives.
7. For lifecycle errors, make the smallest change the specific diagnostic asks for — half of them need an action removed, not added:
   - "is initially visible and cannot be shown again" — delete that show action. If the reveal is the point of the beat, instead drop "initial": "visible" from the object. Parts inherit their owner's initial visibility, so an artwork marked visible must lose that mark before any of its parts can be shown one at a time.
   - "has more than one show action" / "has more than one hide action" — keep the first, delete the later duplicate.
   - "is hidden before it becomes visible" — reorder so the show beat precedes the hide beat.
   - "never becomes visible in this scene" — add the missing show action in the correct chronological beat, or drop the action that targets it.
   - "Temporary visual … remains visible at the end of the scene" — append a later hide action in that scene.
   Never leave a beat with an empty actions array: delete the whole beat if its last action goes.
8. Remove any forbidden effect or unstable camera choreography already present, and never introduce one while repairing.
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
7. Does any frame contain a forbidden effect, effect-based flow, lightning-like visual, or unstable camera framing?
8. Is information density appropriate, with one clear focal relationship per scene?

Return JSON: {"approved":boolean,"findings":[{"scene":number,"time":number,"severity":"error"|"warning","target":string,"problem":string,"repair":string}]}.`;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildLessonPlanningPrompt(request: LessonAuthoringRequest) {
  return { system: SIMPLE_JSON_PLANNER_SYSTEM_PROMPT, user: json(request) };
}

export function buildLessonGenerationPrompt(
  request: LessonAuthoringRequest,
  plan: VisualLessonPlan,
) {
  return {
    system: SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
    user: json({ request, plan, capabilities: getSimpleJsonCapabilities() }),
  };
}

export function buildLessonRepairPrompt(
  lesson: unknown,
  diagnostics: Diagnostic[],
) {
  return {
    system: SIMPLE_JSON_REPAIR_SYSTEM_PROMPT,
    user: json({
      lesson,
      diagnostics,
      capabilities: getSimpleJsonCapabilities(),
    }),
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

/**
 * Build the strict prompt payload used when Codex or Claude authors a complete
 * lesson. This helper does not call either provider; applications decide how
 * and where to send the returned strings.
 */
export function buildCodingAgentVideoPrompt(
  agent: SupportedCodingAgent,
  request: LessonAuthoringRequest,
) {
  return {
    system:
      agent === "codex"
        ? CODEX_VIDEO_AUTHORING_PROMPT
        : CLAUDE_VIDEO_AUTHORING_PROMPT,
    user: json({
      request,
      capabilities: getSimpleJsonCapabilities(),
      requiredOutput: {
        format: "LessonSpec JSON",
        schemaVersion: "1",
        compilePolicy: "zero errors and zero warnings",
      },
    }),
  };
}
