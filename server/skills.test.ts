import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSkills, skillTool } from "./skills";
import { deliveryNotes, forCartesia, plainOf } from "./voice";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-skills-"));
  fs.mkdirSync(path.join(dir, "narrative"));
  fs.mkdirSync(path.join(dir, "visual"));
  fs.writeFileSync(path.join(dir, "narrative/explain.md"), "---\nname: explain\ndescription: The default narrative.\n---\n\n# Explain\n\nTeach only what is needed.\n");
  fs.writeFileSync(
    path.join(dir, "visual/mechanism.md"),
    "---\nname: mechanism\ndescription: How a thing works.\n---\n\n## Explaining it well\n- One pair at a time.\n\n## Rules and conventions\n- Fixed pieces never move.\n\n## Preferred visuals\n- The machine whole.\n\n## Preferred engine components\n- `diagram` for the parts.\n",
  );
  return dir;
}

describe("film skills", () => {
  it("reads each skill, keeps the rules for the scene writer and leaves the other engine's advice out", () => {
    const skills = loadSkills(fixture());
    expect(skills.map((s) => `${s.layer}/${s.name}`)).toEqual(["narrative/explain", "visual/mechanism"]);
    const mechanism = skills[1];
    expect(mechanism.plan).toContain("One pair at a time");
    expect(mechanism.plan).not.toContain("Preferred engine components");
    expect(mechanism.scene).toBe("## Rules and conventions\n- Fixed pieces never move.");
    expect(skills[0].scene).toBe("");
  });

  it("is empty when there is no folder", () => {
    expect(loadSkills(undefined)).toEqual([]);
    expect(loadSkills("/no/such/folder")).toEqual([]);
    expect(skillTool([], () => undefined)).toBeNull();
  });

  it("refuses a wrong call, then loads once", () => {
    const chosen: string[][] = [];
    const tool = skillTool(loadSkills(fixture()), (names) => chosen.push(names))!;
    expect(tool.description).toContain("- mechanism: How a thing works.");
    expect(tool.load({ narrative: "story", visuals: ["mechanism"] })).toContain("refused: no such skill");
    expect(tool.load({ narrative: "explain", visuals: [] })).toContain("refused: name exactly one narrative");
    expect(chosen).toEqual([]);
    const loaded = tool.load({ narrative: "explain", visuals: ["mechanism"] });
    expect(loaded).toContain("<skill name='explain' layer='narrative'>");
    expect(loaded).toContain("Write the plan now.");
    expect(chosen).toEqual([["explain", "mechanism"]]);
    expect(tool.load({ narrative: "explain", visuals: ["mechanism"] })).toContain("loaded already");
  });

  it("reads AiRA's real skills when FILM_SKILLS_DIR points at them", () => {
    const dir = process.env.FILM_SKILLS_DIR;
    if (!dir || !fs.existsSync(dir)) return;
    const skills = loadSkills(dir);
    expect(skills.filter((s) => s.layer === "narrative").map((s) => s.name)).toEqual(["explain", "how-to", "story", "weigh"]);
    expect(skills.filter((s) => s.layer === "visual").length).toBeGreaterThan(10);
    expect(skills.every((s) => s.layer === "narrative" || s.scene.startsWith("## Rules and conventions"))).toBe(true);
  });
});

describe("voice marks", () => {
  const marked = '[curious] You wake before dawn. <break time="500ms"/> [surprised] Your arm feels *twice* as heavy. [softly, slowly] Nothing else has changed.';

  it("gives the plain words for captions and cues", () => {
    expect(plainOf(marked)).toBe("You wake before dawn. Your arm feels twice as heavy. Nothing else has changed.");
  });

  it("keeps only the pause for Cartesia", () => {
    expect(forCartesia(marked)).toBe('You wake before dawn. <break time="500ms"/> Your arm feels twice as heavy. Nothing else has changed.');
    expect(forCartesia('One. <break time="5s"/> Two.')).toBe("One. Two.");
  });

  it("turns the marks into delivery notes for a voice that takes directions", () => {
    const notes = deliveryNotes(marked);
    expect(notes).toContain("curious, then surprised, then softly, slowly");
    expect(notes).toContain('Lean on the word "twice"');
    expect(notes).toContain("one short pause");
    expect(deliveryNotes("Plain words.")).toBe("");
  });
});
