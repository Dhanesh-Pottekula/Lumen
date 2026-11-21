// Split a saved sheet of things into its cut-outs and lay them on a dark ground to look at. Calls nothing.
//   node scripts/try-sheet.mjs <sheet.png> <cols> <rows> <count> <out folder>
import fs from "node:fs";
import { createServer } from "vite";
const root = "/Users/dhanesh/Desktop/GFV/projects/Lumen";
const vite = await createServer({ root, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { cutSheet, decodePng, encodePng } = await vite.ssrLoadModule("/server/cutout.ts");
const [file, cols, rows, count, out] = process.argv.slice(2);
const t = Date.now();
const things = cutSheet(new Uint8Array(fs.readFileSync(file)), +cols, +rows, +count);
console.log("ms", Date.now() - t);
// Lay the cut-outs on a dark-blue ground to judge the rims.
const W = 1800, H = 900, bg = { width: W, height: H, data: new Uint8Array(W * H * 4) };
for (let i = 0; i < W * H; i++) bg.data.set([30, 50, 110, 255], i * 4);
things.forEach((t, n) => {
  if (!t) return console.log(n + 1, "EMPTY");
  console.log(n + 1, `${t.cut.width}x${t.cut.height}`, t.cut.coverage.toFixed(2), t.cut.edges, t.cut.problem ?? "good");
  fs.writeFileSync(`${out}/out-${n + 1}.png`, t.cut.png);
  const c = decodePng(t.cut.png), s = 260 / Math.max(c.width, c.height);
  const x0 = (n % 6) * 300 + 20, y0 = Math.floor(n / 6) * 300 + 20;
  for (let y = 0; y < c.height * s; y++) for (let x = 0; x < c.width * s; x++) {
    const sI = (Math.floor(y / s) * c.width + Math.floor(x / s)) * 4, d = ((y0 + y) * W + x0 + x) * 4, a = c.data[sI + 3] / 255;
    for (let k = 0; k < 3; k++) bg.data[d + k] = Math.round(c.data[sI + k] * a + bg.data[d + k] * (1 - a));
  }
});
fs.writeFileSync(`${out}/composite.png`, encodePng(bg));
await vite.close(); process.exit(0);
