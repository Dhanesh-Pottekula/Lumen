const expected = {
  "@aira/lumen": [
    "BLUEPRINT",
    "CHALKBOARD",
    "CLAUDE_VIDEO_AUTHORING_PROMPT",
    "CODEX_VIDEO_AUTHORING_PROMPT",
    "LESSON_INPUT_SCHEMA",
    "LESSON_SPEC_SCHEMA",
    "PARCHMENT",
    "SIMPLE_JSON_AUTHOR_SYSTEM_PROMPT",
    "SIMPLE_JSON_MAP_ICONS",
    "SIMPLE_JSON_PLANNER_SYSTEM_PROMPT",
    "SIMPLE_JSON_REPAIR_SYSTEM_PROMPT",
    "SIMPLE_JSON_VISUAL_REVIEW_SYSTEM_PROMPT",
    "TEXTBOOK",
    "availableVisualAssets",
    "buildCodingAgentVideoPrompt",
    "buildLessonGenerationPrompt",
    "buildLessonPlanningPrompt",
    "buildLessonRepairPrompt",
    "buildLessonVisualReviewPrompt",
    "collectLessonKeyframes",
    "compileLessonSpec",
    "drawSlideFrame",
    "getSimpleJsonCapabilities",
    "renderLessonSpec",
    "resolveVisualAsset",
    "validateCanonicalFilm",
    "validateResolvedKeyframes",
    "visualAssetAnchorMap",
    "visualAssetAnchors",
    "visualAssetBounds",
    "visualOrientationAngle",
  ],
  "@aira/lumen-react": ["CanvasSlide"],
  "@aira/lumen-cartesia": [
    "CARTESIA_VOICES",
    "alignSceneNarration",
    "clearCachedNarration",
    "fullNarration",
    "getCachedNarration",
    "hasNarration",
    "narrationKey",
    "putCachedNarration",
    "sceneFloors",
    "synthesizeNarration",
    "timestampsBlob",
  ],
  "@aira/lumen-mp4": ["canExportMp4", "exportLessonMp4"],
};

let failed = false;
for (const [packageName, expectedExports] of Object.entries(expected)) {
  const actual = Object.keys(await import(packageName)).sort();
  const wanted = [...expectedExports].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    failed = true;
    console.error(`${packageName} public exports changed.`);
    console.error(`expected: ${wanted.join(", ")}`);
    console.error(`actual:   ${actual.join(", ")}`);
  } else {
    console.log(`${packageName}: ${actual.length} frozen runtime exports`);
  }
}

if (failed) {
  console.error("Review the API change, update docs, and intentionally update this snapshot.");
  process.exit(1);
}
