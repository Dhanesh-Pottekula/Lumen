// Print every prompt exactly as a model receives it: node scripts/show-prompts.mjs
import { createServer } from "vite";
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const P = await vite.ssrLoadModule("/server/prompts.ts");
const show = (title, text) => console.log(`\n\n########## ${title}\n${text}`);
show("PLANNER", P.PLAN_SYSTEM);
show("SCENE WRITER", P.SCENE_SYSTEM);
show("PART FINDER", P.PARTS_SYSTEM);
show("PART FINDER, the note before one picture", P.partsNote("sunset", "A red sun low over a field.", 500, 333, [{ id: "sun", where: "the red sun" }]));
show("PICTURE LOOK", P.BACKGROUND_LOOK);
show("DRAWING OF NINE", P.sheetPrompt(Array.from({ length: 9 }, (_, i) => ({ brief: `Brief ${i + 1}.`, ...(i === 1 ? { laterOf: 1 } : {}) })), "none", 3, 3, true));
show("DRAWING OF ONE", P.drawingPrompt("A red sun low over a field.", "none", "styled"));
show("VOICE STYLE", P.VOICE_STYLE);
show("SCENE RETRY", P.sceneRetry(["beats[2]: example problem"], "- picture sunset: its parts are sunset.sun"));
await vite.close();
