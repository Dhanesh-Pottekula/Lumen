/**
 * The offline provider: no network and no key. It plays the part of every model with canned replies and
 * drawn SVG frames, so the whole pipeline (streamed plan, parallel pictures, part boxes, scene lanes, in-order
 * release) runs and can be watched and tested for free.
 *
 * It misbehaves on purpose, the way real models do, so the pipeline's recovery paths are always exercised:
 *   - later steps finish writing before earlier ones (release must still be in order)
 *   - step s2's first reply is not JSON (one repair turn)
 *   - step s3's first reply aims at a part that was never found (one corrective retry)
 *   - the picture "rooftop-dawn" fails to draw (its scene plays without it)
 */
import type { ImageBytes, Message, PartsFound, Provider } from "./types";

const W = 1536;
const H = 1024;

const PLAN = {
  title: "What if the Moon vanished tonight?",
  character: "A thin stick figure in a mustard-yellow beanie and a dark teal coat, with a red scarf.",
  pictures: [
    {
      id: "bedroom-night",
      brief:
        "A dark bedroom at night, lit only by moonlight from a tall window on the right. The character stands in the middle of the room looking out at a full Moon. An unmade bed fills the lower left.",
      parts: [
        { id: "moon", where: "the full Moon seen through the window, upper right" },
        { id: "bed", where: "the unmade bed, lower left" },
        { id: "person", where: "the character standing in the middle" },
      ],
    },
    {
      id: "earth-space",
      brief: "Deep space full of stars. The Earth, large and blue, sits on the left. The small grey Moon sits far to the right on a faint dashed orbit.",
      parts: [
        { id: "earth", where: "the large blue planet on the left" },
        { id: "moon", where: "the small grey Moon on the right" },
      ],
    },
    {
      id: "beach-dusk",
      brief: "A wide beach at dusk under an orange and purple sky. The sea fills the middle of the frame, dark wet rocks sit on the right, and the character stands on the sand at the left.",
      parts: [
        { id: "sea", where: "the band of sea across the middle" },
        { id: "rocks", where: "the dark rocks on the right" },
      ],
    },
    {
      id: "street-dark",
      brief: "An empty city street on a moonless night. Dark buildings line both sides. One streetlamp on the right throws a cone of warm light, and the character stands under it looking up.",
      parts: [
        { id: "streetlamp", where: "the tall streetlamp on the right" },
        { id: "person", where: "the character under the lamp" },
      ],
    },
    {
      id: "rooftop-dawn",
      brief: "A flat rooftop at dawn. The character sits at the edge watching a pale sunrise over the city.",
      parts: [],
    },
  ],
  steps: [
    {
      id: "s1",
      narration:
        "You wake up in the middle of the night and something feels wrong. The room is darker than it has ever been. You walk to the window and look up for the Moon. It has simply vanished, and for a moment the whole sky looks empty.",
      show: 'opens on bedroom-night. "to the window" camera moves to bedroom-night.person. "for the Moon" camera closes on bedroom-night.moon. "simply vanished" a flash and the word GONE.',
      screen: ["bedroom-night"],
    },
    {
      id: "s2",
      narration:
        "The Moon sits about three hundred and eighty four thousand kilometres away, and its gravity has been tugging on our planet for four billion years. Take it away and the Earth does not fall or fly off. It keeps circling the Sun exactly as before.",
      show: 'opens on earth-space. "kilometres away" camera closes on earth-space.moon and a counter of the distance. "the Earth" camera moves to earth-space.earth.',
      screen: ["earth-space"],
    },
    {
      id: "s3",
      narration:
        "The first thing you would notice is the sea. The Moon raises most of our tides, so without it they shrink to about a third of their size. The Sun still pulls on the water, but far more gently, and the shoreline barely moves.",
      show: 'opens on beach-dusk. "the sea" camera pushes to beach-dusk.sea. "a third" a bar chart of tide size with and without the Moon. "the shoreline" camera moves to beach-dusk.rocks.',
      screen: ["beach-dusk"],
    },
    {
      id: "s4",
      narration:
        "Nights become truly dark. A full Moon is hundreds of thousands of times brighter than the brightest star, and animals that hunt, hide and travel by its light lose their guide. Outside the glow of a streetlamp you can barely see your own hands.",
      show: 'opens on street-dark. "times brighter" the words NO MOONLIGHT. "a streetlamp" camera closes on street-dark.streetlamp and it is dimmed around.',
      screen: ["street-dark"],
    },
    {
      id: "s5",
      narration:
        "The slowest change is the one that matters most. The Moon steadies the tilt of the Earth, and without it that tilt would wander over millions of years, reshaping the seasons. You would survive the night. The planet would simply never be quite the same.",
      show: 'opens on bedroom-night. "the tilt" the words TILT WANDERS. "survive the night" cut to rooftop-dawn.',
      screen: ["bedroom-night", "rooftop-dawn"],
    },
  ],
};

const PARTS: Record<string, PartsFound> = {
  "bedroom-night": {
    parts: [
      { part: "moon", box: [1106, 226, 1254, 374] },
      { part: "bed", box: [96, 640, 760, 930] },
      { part: "person", box: [770, 410, 930, 880] },
    ],
    missing: [],
  },
  "earth-space": {
    parts: [
      { part: "earth", box: [200, 232, 760, 792] },
      { part: "moon", box: [1168, 328, 1312, 472] },
    ],
    missing: [],
  },
  "beach-dusk": {
    parts: [
      { part: "sea", box: [0, 470, 1536, 690] },
      { part: "rocks", box: [1010, 560, 1450, 800] },
    ],
    missing: [],
  },
  "street-dark": {
    parts: [
      { part: "streetlamp", box: [1050, 150, 1240, 900] },
      { part: "person", box: [940, 520, 1080, 900] },
    ],
    missing: [],
  },
};

const SCENES: Record<string, string[]> = {
  s1: [
    JSON.stringify({
      objects: [
        { id: "bedroom-night", kind: "image" },
        { id: "gone", kind: "text", text: "GONE", zone: "top", size: "large", color: "danger" },
      ],
      beats: [
        { id: "open", pace: "slow", actions: [{ do: "camera", target: "bedroom-night", shot: "wide" }] },
        { id: "window", say: "to the window", pace: "normal", actions: [{ do: "camera", target: "bedroom-night.person", shot: "medium", movement: "move" }] },
        {
          id: "moon",
          say: "for the Moon",
          pace: "slow",
          actions: [
            { do: "camera", target: "bedroom-night.moon", shot: "close", movement: "push" },
            { do: "label", target: "bedroom-night.moon", text: "the Moon" },
          ],
        },
        { id: "vanish", say: "simply vanished", pace: "quick", actions: [{ do: "flash" }, { do: "shake", strength: "subtle" }, { do: "show", targets: ["gone"], entrance: "slam" }] },
        { id: "empty", say: "looks empty", pace: "slow", actions: [{ do: "hide", targets: ["gone"] }, { do: "camera", target: "bedroom-night", shot: "wide", movement: "move" }] },
      ],
    }),
  ],
  s2: [
    // Not JSON: the pipeline asks once for the scene again.
    'Here is the scene you asked for:\n{"objects": [{"id": "earth-space", "kind": "image"}], "beats": [',
    JSON.stringify({
      objects: [
        { id: "earth-space", kind: "image" },
        { id: "distance", kind: "counter", from: 0, to: 384000, suffix: " km", label: "Earth to Moon", zone: "top" },
        { id: "law", kind: "equation", value: "F = G \\frac{m_1 m_2}{r^2}", zone: "bottom-left" },
      ],
      beats: [
        { id: "open", actions: [{ do: "camera", target: "earth-space", shot: "wide" }] },
        {
          id: "far",
          say: "kilometres away",
          pace: "slow",
          actions: [
            { do: "camera", target: "earth-space.moon", shot: "close", movement: "push" },
            { do: "show", targets: ["distance"], entrance: "fade" },
          ],
        },
        { id: "tug", say: "its gravity", pace: "normal", actions: [{ do: "attention", target: "earth-space.moon", verb: "encircle" }, { do: "show", targets: ["law"] }] },
        { id: "earth", say: "the Earth", pace: "normal", actions: [{ do: "hide", targets: ["distance", "law"] }, { do: "camera", target: "earth-space.earth", shot: "medium", movement: "move" }] },
        { id: "circling", say: "circling the Sun", pace: "slow", actions: [{ do: "camera", target: "earth-space", shot: "wide", movement: "move" }, { do: "label", target: "earth-space.earth", text: "same orbit" }] },
      ],
    }),
  ],
  s3: [
    // Aims at a boat that is not among the picture's parts: the pipeline lists the problem and asks again.
    JSON.stringify({
      objects: [
        { id: "beach-dusk", kind: "image" },
        { id: "tides", kind: "chart", chart: "bar", title: "Tide height", zone: "top-left", data: [{ label: "With Moon", value: 100 }, { label: "Sun only", value: 33 }] },
      ],
      beats: [
        { id: "open", actions: [{ do: "camera", target: "beach-dusk", shot: "wide" }] },
        { id: "boat", say: "the sea", actions: [{ do: "camera", target: "beach-dusk.boat", shot: "close" }] },
        { id: "third", say: "a third", actions: [{ do: "show", targets: ["tides"] }] },
      ],
    }),
    JSON.stringify({
      objects: [
        { id: "beach-dusk", kind: "image" },
        { id: "tides", kind: "chart", chart: "bar", title: "Tide height", zone: "top-left", data: [{ label: "With Moon", value: 100 }, { label: "Sun only", value: 33 }] },
      ],
      beats: [
        { id: "open", actions: [{ do: "camera", target: "beach-dusk", shot: "wide" }] },
        { id: "sea", say: "the sea", pace: "slow", actions: [{ do: "camera", target: "beach-dusk.sea", shot: "medium", movement: "push" }, { do: "attention", target: "beach-dusk.sea", verb: "dim" }] },
        { id: "third", say: "a third", pace: "normal", actions: [{ do: "show", targets: ["tides"], entrance: "fade" }] },
        { id: "shore", say: "the shoreline", pace: "slow", actions: [{ do: "hide", targets: ["tides"] }, { do: "camera", target: "beach-dusk.rocks", shot: "close", movement: "move" }, { do: "label", target: "beach-dusk.rocks", text: "low tide line" }] },
      ],
    }),
  ],
  s4: [
    JSON.stringify({
      objects: [
        { id: "street-dark", kind: "image" },
        { id: "dark", kind: "text", text: "NO MOONLIGHT", zone: "top", size: "large", color: "accent" },
      ],
      beats: [
        { id: "open", pace: "slow", actions: [{ do: "camera", target: "street-dark", shot: "wide" }] },
        { id: "bright", say: "times brighter", pace: "quick", actions: [{ do: "show", targets: ["dark"], entrance: "word-by-word" }] },
        { id: "lamp", say: "a streetlamp", pace: "slow", actions: [{ do: "hide", targets: ["dark"] }, { do: "camera", target: "street-dark.streetlamp", shot: "medium", movement: "push" }, { do: "attention", target: "street-dark.streetlamp", verb: "dim" }] },
        { id: "hands", say: "your own hands", pace: "normal", actions: [{ do: "camera", target: "street-dark.person", shot: "close", movement: "move" }, { do: "attention", target: "street-dark.person", verb: "pulse" }] },
      ],
    }),
  ],
  s5: [
    JSON.stringify({
      objects: [
        { id: "bedroom-night", kind: "image" },
        { id: "rooftop-dawn", kind: "image", initial: "hidden" },
        { id: "tilt", kind: "text", text: "TILT WANDERS", zone: "top", size: "medium", color: "white" },
      ],
      beats: [
        { id: "open", pace: "slow", actions: [{ do: "camera", target: "bedroom-night.person", shot: "medium" }] },
        { id: "tilt", say: "the tilt", pace: "normal", actions: [{ do: "show", targets: ["tilt"], entrance: "fade" }] },
        { id: "dawn", say: "survive the night", pace: "slow", actions: [{ do: "hide", targets: ["tilt"] }, { do: "cut", to: "rooftop-dawn" }] },
        { id: "end", say: "quite the same", pace: "dramatic", actions: [{ do: "camera", target: "bedroom-night", shot: "wide", movement: "move" }] },
      ],
    }),
  ],
};

/** How long each canned job takes, in ticks. Later steps are faster on purpose. */
const DRAW_TICKS: Record<string, number> = { "bedroom-night": 40, "earth-space": 25, "beach-dusk": 30, "street-dark": 20, "rooftop-dawn": 15 };
const WRITE_TICKS: Record<string, number> = { s1: 90, s2: 30, s3: 30, s4: 10, s5: 5 };

export interface OfflineOptions {
  /** Milliseconds in one tick. 60 by default, so the stream is slow enough to watch; tests use 1. */
  tick?: number;
}

export function offlineProvider(options: OfflineOptions = {}): Provider {
  const tick = options.tick ?? 60;
  const wait = (ticks: number) => new Promise<void>((resolve) => setTimeout(resolve, ticks * tick));
  const replies = new Map<string, number>();

  const provider: Provider = {
    name: "offline",

    async plan(_system, _brief, onText) {
      const text = JSON.stringify(PLAN);
      provider.report?.("plan", "offline-text", { input: 4200, cached: 0, output: Math.round(text.length / 4), reasoning: 600 });
      for (let at = 0; at < text.length; at += 90) {
        onText(text.slice(at, at + 90));
        await wait(0.3);
      }
    },

    async draw(_prompt, _reference, pictureId) {
      await wait(DRAW_TICKS[pictureId] ?? 20);
      const svg = FRAMES[pictureId]?.();
      if (!svg) throw new Error(`offline: the drawing of "${pictureId}" failed`);
      provider.report?.("picture", "offline-image", { input: 300, output: 4160, images: 1 });
      return { bytes: new TextEncoder().encode(svg), type: "image/svg+xml" };
    },

    async findParts(_system, _context, _image, pictureId) {
      await wait(8);
      provider.report?.("parts", "offline-text", { input: 900, output: 80 });
      return PARTS[pictureId] ?? { parts: [], missing: [] };
    },

    async write(_system, messages: Message[], stepId) {
      const turn = replies.get(stepId) ?? 0;
      replies.set(stepId, turn + 1);
      await wait(turn === 0 ? (WRITE_TICKS[stepId] ?? 10) : 6);
      const canned = SCENES[stepId] ?? [];
      // As with a real cache: the fixed prompt and the film's stable text are read, the step's own text is new.
      provider.report?.("scene", "offline-text", { input: 3400 + messages.length * 250, cached: 3000, output: 420 });
      return canned[Math.min(turn, canned.length - 1)] ?? "{}";
    },

    async speak(): Promise<ImageBytes | null> {
      return null;
    },

    async hear() {
      return null;
    },

    async warm() {
      provider.report?.("warm-up", "offline-text", { input: 3010, cached: 0, cacheWrite: 3000, output: 4 });
    },
  };
  return provider;
}

// ── Drawn frames ─────────────────────────────────────────────────────────────────────────────────────────
// Plain SVG stand-ins for the image model, in the look the real prompt asks for: a full scene edge to edge,
// bold dark outlines, flat shading, one light source, a dark vignette.

const INK = "#10131a";

/** The film's character: yellow beanie, teal coat, red scarf. (x, y) is the feet; `s` scales it. */
function person(x: number, y: number, s = 1, lookUp = false): string {
  const headY = y - 400 * s;
  const eyeY = headY + (lookUp ? 2 : 8) * s;
  return `<g stroke="${INK}" stroke-width="${7 * s}" stroke-linecap="round" stroke-linejoin="round">
    <line x1="${x - 22 * s}" y1="${y - 150 * s}" x2="${x - 30 * s}" y2="${y}" />
    <line x1="${x + 22 * s}" y1="${y - 150 * s}" x2="${x + 30 * s}" y2="${y}" />
    <path d="M${x - 50 * s},${y - 330 * s} L${x + 50 * s},${y - 330 * s} L${x + 58 * s},${y - 140 * s} L${x - 58 * s},${y - 140 * s} Z" fill="#1f5d63" />
    <line x1="${x - 52 * s}" y1="${y - 310 * s}" x2="${x - 78 * s}" y2="${y - 190 * s}" />
    <line x1="${x + 52 * s}" y1="${y - 310 * s}" x2="${x + 78 * s}" y2="${y - 190 * s}" />
    <path d="M${x - 46 * s},${y - 336 * s} h${92 * s} v${26 * s} h${-92 * s} Z" fill="#c2392f" />
    <circle cx="${x}" cy="${headY}" r="${58 * s}" fill="#f4f1ea" />
    <path d="M${x - 60 * s},${headY - 14 * s} Q${x},${headY - 110 * s} ${x + 60 * s},${headY - 14 * s} Z" fill="#e2a52c" />
    <circle cx="${x - 20 * s}" cy="${eyeY}" r="${5 * s}" fill="${INK}" />
    <circle cx="${x + 20 * s}" cy="${eyeY}" r="${5 * s}" fill="${INK}" />
    <line x1="${x - 12 * s}" y1="${headY + 30 * s}" x2="${x + 12 * s}" y2="${headY + 30 * s}" stroke-width="${5 * s}" />
  </g>`;
}

function stars(seed: number, count: number, maxY: number): string {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  let out = "";
  for (let i = 0; i < count; i++) out += `<circle cx="${(next() * W).toFixed(0)}" cy="${(next() * maxY).toFixed(0)}" r="${(1 + next() * 2.4).toFixed(1)}" fill="#fff" opacity="${(0.35 + next() * 0.6).toFixed(2)}" />`;
  return out;
}

const frame = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>${defs}<radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0" /><stop offset="100%" stop-color="#000" stop-opacity="0.6" /></radialGradient></defs>
  ${body}
  <rect width="${W}" height="${H}" fill="url(#vig)" />
</svg>`;

const FRAMES: Record<string, () => string> = {
  "bedroom-night": () =>
    frame(
      `<linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2440" /><stop offset="1" stop-color="#0c1022" /></linearGradient>
       <linearGradient id="beam" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fc0ff" stop-opacity="0.34" /><stop offset="1" stop-color="#9fc0ff" stop-opacity="0" /></linearGradient>`,
      `<rect width="${W}" height="${H}" fill="url(#wall)" />
       <rect y="760" width="${W}" height="264" fill="#241a1a" /><line x1="0" y1="760" x2="${W}" y2="760" stroke="${INK}" stroke-width="8" />
       <rect x="1000" y="130" width="360" height="420" fill="#0a1634" stroke="${INK}" stroke-width="12" />
       ${stars(7, 26, 1).replace(/cx="(\d+)" cy="(\d+)"/g, (_m, cx: string, cy: string) => `cx="${1010 + (Number(cx) % 340)}" cy="${140 + ((Number(cx) * 7 + Number(cy)) % 400)}"`)}
       <circle cx="1180" cy="300" r="70" fill="#f1f0e4" stroke="${INK}" stroke-width="8" /><circle cx="1158" cy="282" r="14" fill="#d3d2c4" /><circle cx="1204" cy="322" r="10" fill="#d3d2c4" />
       <line x1="1180" y1="130" x2="1180" y2="550" stroke="${INK}" stroke-width="10" /><line x1="1000" y1="340" x2="1360" y2="340" stroke="${INK}" stroke-width="10" />
       <polygon points="1000,550 1360,550 1040,1024 300,1024" fill="url(#beam)" />
       <rect x="110" y="700" width="640" height="190" rx="22" fill="#39456e" stroke="${INK}" stroke-width="10" />
       <rect x="110" y="650" width="210" height="110" rx="28" fill="#dfe3ee" stroke="${INK}" stroke-width="10" />
       <path d="M330,720 Q520,660 750,740 L750,890 L330,890 Z" fill="#56689f" stroke="${INK}" stroke-width="10" />
       <rect x="96" y="880" width="670" height="40" fill="#1a1422" stroke="${INK}" stroke-width="8" />
       ${person(850, 880, 1.1, true)}`,
    ),
  "earth-space": () =>
    frame(
      `<radialGradient id="deep" cx="35%" cy="50%" r="80%"><stop offset="0" stop-color="#131c3f" /><stop offset="1" stop-color="#04050d" /></radialGradient>
       <radialGradient id="earth" cx="38%" cy="35%" r="75%"><stop offset="0" stop-color="#4f9bf0" /><stop offset="1" stop-color="#12306e" /></radialGradient>`,
      `<rect width="${W}" height="${H}" fill="url(#deep)" />${stars(3, 150, H)}
       <ellipse cx="480" cy="512" rx="800" ry="210" fill="none" stroke="#8fa3d6" stroke-width="4" stroke-dasharray="14 18" opacity="0.6" transform="rotate(-9 480 512)" />
       <circle cx="480" cy="512" r="270" fill="url(#earth)" stroke="${INK}" stroke-width="12" />
       <path d="M330,380 q70,-60 150,-20 q40,60 -20,110 q-80,30 -130,-10 Z" fill="#3fa46a" stroke="${INK}" stroke-width="7" />
       <path d="M520,560 q90,-30 130,40 q-10,90 -90,110 q-70,-40 -40,-150 Z" fill="#3fa46a" stroke="${INK}" stroke-width="7" />
       <path d="M290,600 q50,20 60,80 q-40,30 -80,-10 Z" fill="#3fa46a" stroke="${INK}" stroke-width="7" />
       <circle cx="1240" cy="400" r="66" fill="#c9c8c0" stroke="${INK}" stroke-width="9" /><circle cx="1220" cy="382" r="13" fill="#a9a89f" /><circle cx="1262" cy="420" r="9" fill="#a9a89f" />`,
    ),
  "beach-dusk": () =>
    frame(
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a66" /><stop offset="0.6" stop-color="#d0693f" /><stop offset="1" stop-color="#f2b25a" /></linearGradient>
       <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b5f8c" /><stop offset="1" stop-color="#143352" /></linearGradient>`,
      `<rect width="${W}" height="480" fill="url(#sky)" />
       <circle cx="760" cy="470" r="90" fill="#ffe2a0" opacity="0.9" />
       <rect y="470" width="${W}" height="220" fill="url(#sea)" /><line x1="0" y1="470" x2="${W}" y2="470" stroke="${INK}" stroke-width="7" />
       <path d="M0,560 q120,-24 240,0 t240,0 t240,0 t240,0 t240,0 t240,0 t240,0" fill="none" stroke="#9cc6e6" stroke-width="6" opacity="0.7" />
       <path d="M0,620 q140,-22 280,0 t280,0 t280,0 t280,0 t280,0 t280,0" fill="none" stroke="#9cc6e6" stroke-width="6" opacity="0.5" />
       <path d="M0,690 Q760,650 ${W},700 L${W},${H} L0,${H} Z" fill="#b98a55" stroke="${INK}" stroke-width="9" />
       <path d="M1020,790 q30,-170 150,-200 q90,-40 170,40 q110,40 100,170 Z" fill="#2c2a35" stroke="${INK}" stroke-width="10" />
       <path d="M1120,660 q40,-40 90,-10" fill="none" stroke="#4d4a5c" stroke-width="8" />
       ${person(300, 900, 0.95)}`,
    ),
  "street-dark": () =>
    frame(
      `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070f" /><stop offset="1" stop-color="#151a2c" /></linearGradient>
       <radialGradient id="glow" cx="50%" cy="0%" r="100%"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.75" /><stop offset="1" stop-color="#ffcf7a" stop-opacity="0" /></radialGradient>`,
      `<rect width="${W}" height="${H}" fill="url(#night)" />${stars(11, 90, 420)}
       <path d="M0,330 h180 v-110 h170 v150 h140 v-70 h120 V780 H0 Z" fill="#0d1120" stroke="${INK}" stroke-width="9" />
       <path d="M${W},300 h-160 v-90 h-150 v170 h-120 V780 H${W} Z" fill="#0d1120" stroke="${INK}" stroke-width="9" />
       <g fill="#2a3350"><rect x="60" y="400" width="50" height="70" /><rect x="230" y="300" width="50" height="70" /><rect x="400" y="460" width="50" height="70" /><rect x="1380" y="380" width="50" height="70" /></g>
       <path d="M0,780 H${W} V${H} H0 Z" fill="#1c1f2b" stroke="${INK}" stroke-width="9" />
       <path d="M0,1010 L620,780 M${W},1010 L900,780" stroke="#343a4f" stroke-width="7" />
       <polygon points="1150,236 820,900 1400,900" fill="url(#glow)" />
       <rect x="1136" y="230" width="20" height="670" fill="#30364a" stroke="${INK}" stroke-width="8" />
       <path d="M1066,236 h170 l-24,-56 h-122 Z" fill="#ffd98c" stroke="${INK}" stroke-width="9" />
       ${person(1010, 900, 0.95, true)}`,
    ),
};
