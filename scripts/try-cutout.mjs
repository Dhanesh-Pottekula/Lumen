// Try the cut-out step on its own: draw one thing on plain white, remove the white, and (with --on) place the
// result on a background to look at. For checking the cutter and the cut-out look before a whole film is paid for.
//
//   node scripts/try-cutout.mjs --ref <frame.png> --out <folder> "<brief>" ["<brief>" ...]   draw and cut
//   node scripts/try-cutout.mjs --cut <drawing.png> --out <folder>                           cut a saved drawing (free)
//   add --on <background.png> to also write composite.png with the cut-outs placed along its lower half
//
// Each drawing calls the image model (about $0.05). --cut calls nothing.
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
const ref = option("ref");
const out = path.resolve(option("out") ?? path.join(root, "runs", "cutout-tests"));
const on = option("on");
const saved = option("cut");
const character = option("character") ?? "none";
fs.mkdirSync(out, { recursive: true });

const vite = await createServer({ root, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const { cutOutPng, decodePng, encodePng } = await vite.ssrLoadModule("/server/cutout.ts");
  const { cutoutPrompt } = await vite.ssrLoadModule("/server/prompts.ts");
  const cuts = [];
  const cutAndSave = (name, bytes) => {
    const cut = cutOutPng(bytes);
    if (cut.png.length) fs.writeFileSync(path.join(out, `${name}.cut.png`), cut.png);
    console.log(`${name}: ${cut.width}x${cut.height}, covers ${(cut.coverage * 100).toFixed(1)}%, touches ${cut.edges} edges, ${cut.problem ?? "good"}`);
    if (cut.png.length) cuts.push(decodePng(cut.png));
  };
  if (saved) cutAndSave(path.basename(saved, ".png"), fs.readFileSync(saved));
  if (args.length) {
    const { chooseProvider } = await vite.ssrLoadModule("/server/plugin.ts");
    const provider = chooseProvider(root);
    if (!provider) throw new Error("No OPENAI_API_KEY is set in .env.");
    if (!ref) throw new Error("Give --ref <frame.png>: a frame of the film whose style the cut-out should match.");
    const reference = { bytes: new Uint8Array(fs.readFileSync(ref)), type: "image/png" };
    await Promise.all(
      args.map(async (brief, i) => {
        const image = await provider.draw(cutoutPrompt(brief, character, "styled"), reference, `cutout-${i + 1}`);
        fs.writeFileSync(path.join(out, `cutout-${i + 1}.png`), image.bytes);
        cutAndSave(`cutout-${i + 1}`, image.bytes);
      }),
    );
  }
  if (on && cuts.length) {
    // Place each cut-out along the lower half of the background, a third of its height tall, to judge the join.
    const scene = decodePng(new Uint8Array(fs.readFileSync(on)));
    cuts.forEach((cut, n) => {
      const scale = (scene.height * 0.34) / cut.height;
      const w = Math.round(cut.width * scale);
      const h = Math.round(cut.height * scale);
      const x0 = Math.round(((n + 1) / (cuts.length + 1)) * scene.width - w / 2);
      const y0 = Math.round(scene.height * 0.72 - h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = Math.min(cut.width - 1, Math.floor(x / scale));
          const sy = Math.min(cut.height - 1, Math.floor(y / scale));
          const s = (sy * cut.width + sx) * 4;
          const dx = x0 + x;
          const dy = y0 + y;
          if (dx < 0 || dy < 0 || dx >= scene.width || dy >= scene.height) continue;
          const d = (dy * scene.width + dx) * 4;
          const a = cut.data[s + 3] / 255;
          for (let c = 0; c < 3; c++) scene.data[d + c] = Math.round(cut.data[s + c] * a + scene.data[d + c] * (1 - a));
        }
      }
    });
    fs.writeFileSync(path.join(out, "composite.png"), encodePng(scene));
    console.log(`composite written to ${path.join(out, "composite.png")}`);
  }
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exitCode = 1;
} finally {
  await vite.close();
}
process.exit(process.exitCode ?? 0);
