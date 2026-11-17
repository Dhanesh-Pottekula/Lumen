/**
 * Film skills: the teaching the planner loads before it writes a plan.
 *
 * A narrative skill says how a film tells its answer (explain, story, how-to, weigh). A visual skill says how
 * one shape of idea is shown (a mechanism, a cause, a change over time, a what-if). They are AiRA's own skill
 * files, read at run time from FILM_SKILLS_DIR, a folder with `narrative/` and `visual/` subfolders of Markdown.
 * Nothing is copied into this repo. With no folder, the planner works from its own prompt alone.
 */
import fs from "node:fs";
import path from "node:path";

export interface Skill {
  name: string;
  layer: "narrative" | "visual";
  description: string;
  /** What the planner reads. */
  plan: string;
  /** What each scene writer reads: the skill's rules and conventions only. */
  scene: string;
}

const RULES = "## Rules and conventions";
/** Engine-specific advice for AiRA's own renderer; Lumen's screen is different, so it is left out. */
const ENGINE = "## Preferred engine components";

export function loadSkills(dir: string | undefined): Skill[] {
  if (!dir || !fs.existsSync(dir)) return [];
  const skills: Skill[] = [];
  for (const layer of ["narrative", "visual"] as const) {
    const folder = path.join(dir, layer);
    if (!fs.existsSync(folder)) continue;
    for (const file of fs.readdirSync(folder).filter((f) => f.endsWith(".md")).sort()) {
      const raw = fs.readFileSync(path.join(folder, file), "utf8");
      const front = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
      const meta = Object.fromEntries(
        (front?.[1] ?? "")
          .split("\n")
          .filter((line) => line.includes(":"))
          .map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]),
      );
      let body = (front ? raw.slice(front[0].length) : raw).trim();
      const engine = body.indexOf(ENGINE);
      if (engine >= 0) body = body.slice(0, engine).trim();
      const rules = body.indexOf(RULES);
      const next = rules >= 0 ? body.indexOf("\n## ", rules + RULES.length) : -1;
      skills.push({
        name: meta.name || file.replace(/\.md$/, ""),
        layer,
        description: meta.description ?? "",
        plan: body,
        scene: layer === "visual" && rules >= 0 ? body.slice(rules, next >= 0 ? next : undefined).trim() : "",
      });
    }
  }
  return skills;
}

export interface SkillTool {
  /** The tool's description, listing every skill by name. */
  description: string;
  /** Answer one call. Returns the skills' text, or a refusal that says what to fix. */
  load(args: unknown): string;
}

const MAX_VISUAL = 4;

/** The `load_film_skills` tool. `chosen` receives the names once a call succeeds. */
export function skillTool(skills: Skill[], chosen: (names: string[]) => void): SkillTool | null {
  const narratives = skills.filter((s) => s.layer === "narrative");
  const visuals = skills.filter((s) => s.layer === "visual");
  if (narratives.length === 0) return null;
  const listing = `Narratives: ${narratives.map((s) => s.name).join(", ")}. Visual skills: ${visuals.map((s) => s.name).join(", ")}.`;
  let loaded = false;
  return {
    description:
      `Load the skills this film needs. Call it once, before you write any of the plan. Name exactly one narrative: how the film explains. Name one to ${MAX_VISUAL} visual skills: one for each shape of idea its steps show.` +
      `\nNarratives:${narratives.map((s) => `\n- ${s.name}: ${s.description}`).join("")}` +
      `\nVisual skills:${visuals.map((s) => `\n- ${s.name}: ${s.description}`).join("")}`,
    load(args) {
      if (loaded) return "refused: the skills are loaded already. Write the plan now.";
      const raw = (args ?? {}) as { narrative?: unknown; visuals?: unknown };
      const named = [...new Set(Array.isArray(raw.visuals) ? raw.visuals.filter((v): v is string => typeof v === "string") : [])];
      if (typeof raw.narrative !== "string" || (visuals.length > 0 && named.length === 0)) return `refused: name exactly one narrative and one or more visual skills. ${listing}`;
      if (named.length > MAX_VISUAL) return `refused: name at most ${MAX_VISUAL} visual skills, one per shape of idea.`;
      const narrative = narratives.find((s) => s.name === raw.narrative);
      const picked = named.map((name) => visuals.find((s) => s.name === name));
      const unknown = [narrative ? null : raw.narrative, ...named.filter((_, i) => !picked[i])].filter(Boolean);
      if (!narrative || unknown.length) return `refused: no such skill in its layer: ${unknown.join(", ")}. ${listing}`;
      loaded = true;
      const all = [narrative, ...(picked as Skill[])];
      chosen(all.map((s) => s.name));
      return `${all.map((s) => `<skill name='${s.name}' layer='${s.layer}'>\n${s.plan}\n</skill>`).join("\n\n")}\n\nThe skills are loaded. They were written for a whiteboard of separate pictures; follow all of their teaching, and where they place, stack or move separate pictures, show the same idea as "How this film's screen works" says. Write the plan now.`;
    },
  };
}
