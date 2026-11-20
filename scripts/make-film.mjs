// Make one film from the command line, without the app: the same pipeline `POST /api/films` runs.
//
//   npm run film -- "What if gravity doubled overnight?"
//   npm run film -- "<brief>" --tag new            the run folder's name ends in -new
//   npm run film -- "<brief>" --code <checkout>    use the server code of another checkout of this repo
//   npm run film -- "<brief>" --plan-only          only the plan (one text call, a few cents), saved to runs/
//
// --code is for comparing prompts: point it at a checkout of an older commit and the same brief is planned and
// directed by that commit's prompts. The key (.env) and the runs/ folder are always this checkout's.
// This calls the real models and costs money (about $0.60 a film in November 2026).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
const tag = option("tag");
const planOnly = args.includes("--plan-only") && args.splice(args.indexOf("--plan-only"), 1).length > 0;
const code = path.resolve(option("code") ?? root);
const brief = args.join(" ").trim();
if (!brief) {
  console.error('Give a brief: npm run film -- "Why is the sky blue?"');
  process.exit(1);
}

const vite = await createServer({ root: code, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
let status = 1;
try {
  const { chooseProvider } = await vite.ssrLoadModule("/server/plugin.ts");
  const { makeFilm } = await vite.ssrLoadModule("/server/film.ts");
  const { slug } = await vite.ssrLoadModule("/server/text.ts");
  const provider = chooseProvider(root);
  if (!provider) throw new Error("No OPENAI_API_KEY is set in .env, so a film cannot be made.");

  if (planOnly) {
    // Only the planner runs: one text call, no pictures, no voice. For checking a prompt before paying for a film.
    const { PLAN_SYSTEM } = await vite.ssrLoadModule("/server/prompts.ts");
    const { loadSkills, skillTool } = await vite.ssrLoadModule("/server/skills.ts");
    const tool = skillTool(loadSkills(process.env.FILM_SKILLS_DIR || path.join(code, "skills")), (names) => console.log(`skills: ${names.join(", ")}`));
    let text = "";
    await provider.plan(PLAN_SYSTEM, brief, (delta) => (text += delta), tool);
    const out = path.join(root, "runs", `plan-only${tag ? `-${slug(tag)}` : ""}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`plan written to ${path.relative(process.cwd(), out)}`);
    status = 0;
    throw null;
  }

  const run = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${slug(brief).slice(0, 28) || "film"}${tag ? `-${slug(tag)}` : ""}`;
  const dir = path.join(root, "runs", run);
  console.log(`${run}  (${provider.name}, code from ${path.relative(root, code) || "this checkout"})`);
  const { loadSettings } = await vite.ssrLoadModule("/server/settings.ts").catch(() => ({ loadSettings: () => ({ prompts: {} }) }));
  const film = await makeFilm({
    provider,
    // The prompts a person rewrote in the app are used here too, so both ways of making a film agree.
    prompts: loadSettings(root).prompts,
    skillsDir: process.env.FILM_SKILLS_DIR || path.join(code, "skills"),
    brief,
    run,
    dir,
    base: `/film-runs/${run}`,
    emit: (event) => {
      if (event.type === "film_progress" && ["written", "published", "failed", "dropped"].includes(event.status)) console.log(`  ${event.text}`);
    },
  });
  console.log(`${film.status}: ${film.scenes.length} scenes${film.usage ? `, $${film.usage.cost.toFixed(2)}` : ""}  →  ${path.relative(process.cwd(), dir)}`);
  status = film.status === "ready" ? 0 : 1;
} catch (error) {
  if (error !== null) console.error(String(error?.message ?? error));
} finally {
  await vite.close();
}
// The provider may leave sockets open; the film is saved, so leave now.
process.exit(status);
