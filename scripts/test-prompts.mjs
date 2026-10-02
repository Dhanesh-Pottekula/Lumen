import assert from "node:assert/strict";
import fs from "node:fs";

import {
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
} from "../packages/core/dist/index.js";

assert.match(
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  /each scene.+"cue"/is,
  "the planner must request one cue string per planned scene",
);
assert.match(
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  /concatenat(?:e|ing).+one continuous voice-over/is,
  "ordered scene cues must form one continuous voice-over",
);
for (const field of [
  "visualEvidence",
  "labels",
  "facts",
  "sourceUrls",
  "units",
]) {
  assert.match(
    SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
    new RegExp(`${field}[^\\n]+array of strings`, "i"),
    `the planner must identify ${field} as an array of strings`,
  );
}
assert.match(
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  /exactly one top-level JSON object/i,
  "the planner must require exactly one top-level JSON object",
);
assert.match(
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  /compress.+complexityBudget\.maxScenes/is,
  "the planner must compress oversized briefs into the scene budget",
);
assert.doesNotMatch(
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  /top-level cue/is,
  "the planner must not duplicate narration in a top-level cue",
);
assert.doesNotMatch(
  SIMPLE_JSON_PLANNER_SYSTEM_PROMPT,
  /camera motion unless/i,
  "the planner must not conditionally allow camera motion",
);
assert.match(
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  /along.+visible line, span, curve or path.+walks exactly the route it draws/is,
  "the author must define along routes as the drawn line, span, curve or path the traveller walks",
);
assert.match(
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  /destination.+already visible/is,
  "motion references must be visible before their motion beat",
);
assert.match(
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  /maxWordsPerFrame/,
  "the author must obey the supplied word budget",
);
assert.match(
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  /one authoring call.+no diagnostic loop/is,
  "the author prompt must reflect the production one-call contract",
);
assert.match(
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  /Never put <text> or <tspan> inside svg-artwork markup/,
  "the canonical author prompt must retain the validator safeguards",
);

const bundler = fs.readFileSync(
  new URL("./bundle-lumen.mjs", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  bundler,
  /packages\/core\/dist\/index\.js/,
  "prompt snapshots must not come from a potentially stale dist build",
);
assert.match(
  bundler,
  /bundledLumen\.getSimpleJsonCapabilities\(\)/,
  "the film contract must come from the fresh source bundle",
);
assert.match(
  bundler,
  /WITHHELD_KINDS = new Set\(\[[^\]]*"svg-artwork"[^\]]*\]\)/,
  "films are drawn as pictures and paths, so the contract withholds svg-artwork",
);
assert.match(
  bundler,
  /WITHHELD_KINDS = new Set\(\[[^\]]*"question"[^\]]*\]\)/,
  "a film's words name things, so the contract withholds the question chip",
);
const catalog = fs.readFileSync(
  new URL("../packages/core/src/simple-json/catalog.ts", import.meta.url),
  "utf8",
);
assert.match(
  catalog,
  /Only when the step asks for a timeline/,
  "the catalog offers a timeline only to a step that asks for one",
);
assert.match(
  bundler,
  /WITHHELD_VERBS = new Set\(\[[^\]]*"tour"[^\]]*\]\)/,
  "a tour's stops escape the backend's name check, so the contract withholds it",
);
assert.match(
  bundler,
  /renderCatalog\(contract\)/,
  "the writer reads the catalog rendered from the filtered contract, not the raw schema",
);
assert.doesNotMatch(
  SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT,
  /svg-composite|"turns": "many"/,
  "the author prompt must not teach kinds or values the schema no longer accepts",
);

console.log("prompt contract passed");
