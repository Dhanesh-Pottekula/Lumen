import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packages = [
  "@aira/lumen",
  "@aira/lumen-react",
  "@aira/lumen-cartesia",
  "@aira/lumen-mp4",
];

const allowedRoots = new Set(["dist", "LICENSE", "package.json", "README.md"]);
const forbidden = [
  /^\.claude(?:\/|$)/,
  /^\.env(?:\.|$)/,
  /(?:^|\/)App\.tsx$/,
  /(?:^|\/)main\.tsx$/,
  /(?:^|\/)index\.html$/,
  /future_of_ai\.md$/,
  /(?:^|\/)lessons(?:\/|$)/,
  /(?:^|\/)prompts(?:\/|$)/,
];
const npmCache = process.env.LUMEN_NPM_CACHE ?? join(tmpdir(), "lumen-npm-cache");

let failed = false;
for (const workspace of packages) {
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--cache", npmCache, "--workspace", workspace],
    {
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: npmCache },
    },
  );
  const [manifest] = JSON.parse(output);
  const files = manifest.files.map(({ path }) => path);
  const violations = files.filter((path) => {
    const root = path.split("/")[0];
    return !allowedRoots.has(root) || forbidden.some((pattern) => pattern.test(path));
  });

  console.log(`${workspace}: ${files.length} files, ${manifest.size} bytes packed`);
  if (violations.length) {
    failed = true;
    console.error(`  forbidden package content: ${violations.join(", ")}`);
  }
}

if (failed) process.exit(1);
