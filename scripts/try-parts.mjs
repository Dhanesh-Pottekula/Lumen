// Try the part finder alone, on the pictures of a film already made: `count` pictures in one call.
//
//   node scripts/try-parts.mjs [run] [count] [out.json]    (the effort is FILM_INSPECT_EFFORT, low by default)
//
// For each call it prints how many of the asked-for parts came back, how long it took and what it cost, the
// parts whose box differs from the one saved in the film (overlap under 0.9), and the parts the finder added.
import fs from "node:fs";
import { createServer } from "vite";

const run = process.argv[2] ?? "20261121072800-why-is-the-sky-blue-g1";
const dir = `runs/${run}`;
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { chooseProvider } = await vite.ssrLoadModule("/server/plugin.ts");
const P = await vite.ssrLoadModule("/server/prompts.ts");
const { seenParts, hotspotsOf } = await vite.ssrLoadModule("/server/film.ts");

const plan = JSON.parse(fs.readFileSync(`${dir}/plan.json`, "utf8"));
const film = JSON.parse(fs.readFileSync(`${dir}/film.json`, "utf8"));
const saved = {};
for (const scene of film.scenes) for (const object of scene.objects) if (object.kind === "image") saved[object.id] = object.hotspots;

/** How much two boxes overlap: 1 is the same box, 0 is no overlap. */
const overlap = (a, b) => {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return (x * y) / (a[2] * a[3] + b[2] * b[3] - x * y);
};

// How many pictures go in the one call. Past the film's own pictures, the first ones are sent again under a new
// id ("<id>-again"), which also shows whether the finder keeps two look-alike pictures apart.
const count = Number(process.argv[3] ?? 10);
const pool = Array.from({ length: count }, (_, n) => {
  const picture = plan.pictures[n % plan.pictures.length];
  return n < plan.pictures.length ? { ...picture, file: picture.id } : { ...picture, file: picture.id, id: `${picture.id}-again` };
});
const record = [];

for (const [from, to] of [[0, count]]) {
  const provider = chooseProvider(process.cwd());
  const used = [];
  provider.report = (_stage, _model, usage) => used.push(usage);
  const asks = pool.slice(from, to).map((picture) => {
    const bytes = new Uint8Array(fs.readFileSync(`${dir}/pictures/${picture.file}.png`));
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { id: picture.id, file: picture.file, note: P.partsNote(picture.id, picture.brief, w, h, picture.parts), image: { bytes, type: "image/png" }, partIds: picture.parts.map((p) => p.id), w, h };
  });
  const started = Date.now();
  const found = await provider.findParts(P.PARTS_SYSTEM, asks, "try-parts");
  const usage = used[0];
  let asked = 0;
  let got = 0;
  const off = [];
  const added = [];
  for (const ask of asks) {
    asked += ask.partIds.length;
    const answer = found[ask.id];
    if (!answer) {
      off.push(`${ask.id} NOT ANSWERED`);
      continue;
    }
    const boxes = hotspotsOf(answer, ask.partIds, ask.w, ask.h);
    got += Object.keys(boxes).length;
    record.push({ id: ask.id, file: `${dir}/pictures/${ask.file}.png`, w: ask.w, h: ask.h, asked: boxes, missing: answer.missing, added: Object.fromEntries(seenParts(answer, ask.partIds, ask.w, ask.h).map((e) => [e.id, e.box])) });
    for (const part of ask.partIds) {
      if (!boxes[part]) off.push(`${ask.id}.${part} MISSING`);
      else if (saved[ask.file]?.[part]) {
        const score = overlap(boxes[part], saved[ask.file][part]);
        if (score < 0.9) off.push(`${ask.id}.${part} ${score.toFixed(2)}`);
      }
    }
    const extra = seenParts(answer, ask.partIds, ask.w, ask.h);
    if (extra.length) added.push(`${ask.id}: ${extra.map((e) => e.id).join(",")}`);
  }
  const cost = (usage.input * 0.1 + usage.output * 0.5) / 1e6;
  console.log(`${process.env.FILM_INSPECT_EFFORT ?? "low"}, pictures ${from + 1}-${to}: found ${got}/${asked}, ${((Date.now() - started) / 1000).toFixed(1)} s, in ${usage.input} out ${usage.output} reasoning ${usage.reasoning}, cost $${cost.toFixed(5)}`);
  console.log(`  below 0.9 or missing: ${off.join("; ") || "none"}`);
  console.log(`  added: ${added.join(" | ") || "none"}`);
}
if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(record, null, 1));
await vite.close();
