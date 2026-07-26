import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const scratch = mkdtempSync(join(tmpdir(), "lumen-install-smoke-"));
const archives = join(scratch, "archives");
const npmCache = process.env.LUMEN_NPM_CACHE ?? join(tmpdir(), "lumen-npm-cache");
const offline = process.env.LUMEN_SMOKE_OFFLINE === "1";
mkdirSync(archives);

const workspaces = [
  "@aira/lumen",
  "@aira/lumen-react",
  "@aira/lumen-cartesia",
  "@aira/lumen-mp4",
];

const tarballs = new Map();
for (const workspace of workspaces) {
  const output = execFileSync(
    "npm",
    [
      "pack",
      "--json",
      "--cache",
      npmCache,
      "--pack-destination",
      archives,
      "--workspace",
      workspace,
    ],
    { cwd: root, encoding: "utf8" },
  );
  const [{ filename }] = JSON.parse(output);
  tarballs.set(workspace, join(archives, filename));
}

function install(project, dependencies) {
  mkdirSync(project);
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "lumen-install-smoke", private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--cache",
      npmCache,
      ...(offline ? ["--offline"] : []),
      ...dependencies,
    ],
    { cwd: project, stdio: "inherit" },
  );
}

const vanilla = join(scratch, "vanilla");
install(vanilla, [tarballs.get("@aira/lumen")]);
writeFileSync(
  join(vanilla, "smoke.mjs"),
  `
import {
  CODEX_VIDEO_AUTHORING_PROMPT,
  compileLessonSpec,
  getSimpleJsonCapabilities,
  renderLessonSpec
} from "@aira/lumen";

const lesson = {
  version: "1",
  title: "Install smoke test",
  theme: "textbook",
  scenes: [{
    id: "scene",
    composition: "hero",
    objects: [{
      id: "title",
      kind: "text",
      text: "LOCAL PACKAGE WORKS",
      textRole: "heading",
      placement: { mode: "zone", zone: "main" }
    }],
    beats: [{
      id: "show",
      actions: [{ do: "show", targets: ["title"], entrance: "fade" }]
    }]
  }]
};

const compiled = compileLessonSpec(lesson);
if (!compiled.valid || compiled.warnings.length) {
  throw new Error(JSON.stringify(compiled));
}
const rendered = renderLessonSpec(lesson);
if (!rendered.valid || rendered.slide.duration <= 0) {
  throw new Error(JSON.stringify(rendered));
}
if (!getSimpleJsonCapabilities().version || !CODEX_VIDEO_AUTHORING_PROMPT) {
  throw new Error("Expected public authoring exports");
}
console.log("vanilla install: ok");
`,
);
execFileSync("node", ["smoke.mjs"], { cwd: vanilla, stdio: "inherit" });

const react = join(scratch, "react");
install(react, [
  tarballs.get("@aira/lumen"),
  tarballs.get("@aira/lumen-react"),
  tarballs.get("@aira/lumen-cartesia"),
  tarballs.get("@aira/lumen-mp4"),
  "react",
  "react-dom",
]);
writeFileSync(
  join(react, "smoke.mjs"),
  `
import { CanvasSlide } from "@aira/lumen-react";
import { synthesizeNarration } from "@aira/lumen-cartesia";
import { canExportMp4 } from "@aira/lumen-mp4";

if (typeof CanvasSlide !== "function") throw new Error("CanvasSlide missing");
if (typeof synthesizeNarration !== "function") throw new Error("Cartesia adapter missing");
if (typeof canExportMp4 !== "function") throw new Error("MP4 adapter missing");
console.log("react + optional adapters install: ok");
`,
);
execFileSync("node", ["smoke.mjs"], { cwd: react, stdio: "inherit" });

const packageNames = [...tarballs.values()].map((path) => {
  const packageJson = execFileSync(
    "tar",
    ["-xOf", path, "package/package.json"],
    { encoding: "utf8" },
  );
  return JSON.parse(packageJson).name;
});

console.log(`clean install smoke passed: ${packageNames.join(", ")}`);
console.log(`temporary project: ${scratch}`);
