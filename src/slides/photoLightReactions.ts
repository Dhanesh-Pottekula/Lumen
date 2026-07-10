/**
 * Photosynthesis · scene 4 — the light-dependent reactions.
 *
 * A thylakoid-membrane cross-section with embedded complexes: Photosystem II,
 * the electron transport chain, Photosystem I, and ATP synthase. Photons hit PSII,
 * water splits (→ O₂ + H⁺ + e⁻), electrons hop the chain, H⁺ build in the lumen and
 * flow through ATP synthase (ATP), NADPH forms at PSI. Pure renderFrame(t).
 */
import { img } from "../assets/photosynthesis";
import { cycle, drawSvg, fadeText, lerp, phase, radialGlow } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const MEM_TOP = 150;
const MEM_BOT = 250; // membrane band between these; lumen below, stroma above
// complex x-positions along the membrane
const PSII = 210;
const ETC = 400;
const PSI = 570;
const SYNTH = 760;

function complex(ctx: CanvasRenderingContext2D, x: number, w: number, color: string, label: string, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, MEM_TOP - 6, w, MEM_BOT - MEM_TOP + 12, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  fadeText(ctx, label, x, MEM_BOT + 24, alpha, "600 12px -apple-system, sans-serif", "#dfe8ea");
}

export const photoLightReactionsSlide: CanvasSlideDefinition = {
  duration: 26,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "first, the light reactions, right on the thylakoid membrane. these green machines are embedded in it." },
    { at: 5, text: "sunlight strikes photosystem two and energizes electrons. to replace them, it splits water apart." },
    { at: 10, text: "splitting water releases oxygen — the gas we breathe out — plus hydrogen ions and those electrons." },
    { at: 14, text: "the excited electrons hop down a chain of carriers, and their energy pumps hydrogen ions into the inner space." },
    { at: 19, text: "photosystem one re-energizes them with more light to build NADPH, an energy carrier." },
    { at: 22, text: "and the crowded hydrogen ions rush back out through ATP synthase, spinning it to make ATP. two fuels, ready." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const cIn = phase(t, 0.5, 2.5);
    const membrane = img("thylakoidMembrane");
    if (membrane) {
      // SVG hero (bands + complexes), aligned 1:1 to scene geometry
      drawSvg(mid, membrane, W / 2, H / 2, W, H, { alpha: cIn });
    } else {
      // stroma (top) and lumen (bottom) regions
      mid.fillStyle = "#25543a";
      mid.fillRect(0, 0, W, MEM_TOP);
      mid.fillStyle = "#153a4a";
      mid.fillRect(0, MEM_BOT, W, H - MEM_BOT);
      mid.fillStyle = "#2f6b46";
      mid.fillRect(0, MEM_TOP, W, MEM_BOT - MEM_TOP);
      complex(mid, PSII, 70, "#3a9a54", "Photosystem II", cIn);
      complex(mid, ETC, 56, "#4a8a70", "electron chain", cIn);
      complex(mid, PSI, 70, "#3a9a54", "Photosystem I", cIn);
      complex(mid, SYNTH, 60, "#c8a23a", "ATP synthase", cIn);
    }

    fadeText(ann, "stroma", 60, 30, phase(t, 1, 2.5), "italic 12px -apple-system, sans-serif", "#a8d0b4", "start");
    fadeText(ann, "thylakoid lumen", 60, MEM_BOT + 60, phase(t, 1, 2.5), "italic 12px -apple-system, sans-serif", "#8fc0d8", "start");

    // complex labels (always, over the SVG or the fallback rects)
    if (membrane) {
      fadeText(ann, "Photosystem II", PSII, MEM_BOT + 24, cIn, "600 12px -apple-system, sans-serif", "#dfe8ea");
      fadeText(ann, "electron chain", ETC, MEM_BOT + 24, cIn, "600 12px -apple-system, sans-serif", "#dfe8ea");
      fadeText(ann, "Photosystem I", PSI, MEM_BOT + 24, cIn, "600 12px -apple-system, sans-serif", "#dfe8ea");
      fadeText(ann, "ATP synthase", SYNTH, MEM_BOT + 24, cIn, "600 12px -apple-system, sans-serif", "#dfe8ea");
    }

    // photons striking PSII and PSI
    const photonIn = phase(t, 4, 5.5);
    if (photonIn > 0) {
      fg.save();
      fg.globalCompositeOperation = "lighter";
      fg.strokeStyle = "#ffe89a";
      fg.lineWidth = 2.5;
      for (const px of [PSII, PSI]) {
        for (let i = 0; i < 3; i++) {
          const c = cycle(t * 0.6 + i / 3 + px);
          const y = lerp(10, MEM_TOP - 8, c);
          fg.globalAlpha = photonIn * (1 - c) * 0.9;
          fg.beginPath();
          fg.moveTo(px - 20 + i * 14, y);
          fg.lineTo(px - 26 + i * 14, y + 12);
          fg.stroke();
        }
      }
      fg.restore();
    }

    // water splitting at PSII (in the lumen) → O2 bubbles up
    const splitIn = phase(t, 10, 12);
    if (splitIn > 0) {
      fadeText(ann, "H₂O split", PSII, MEM_BOT + 48, splitIn * (1 - phase(t, 20, 22)), "11px -apple-system, sans-serif", "#8fc0d8");
      for (let i = 0; i < 3; i++) {
        const c = cycle(t * 0.4 + i / 3);
        fg.save();
        fg.globalAlpha = splitIn * Math.sin(c * Math.PI) * 0.9;
        fg.strokeStyle = "#7fe0d8";
        fg.lineWidth = 2;
        fg.beginPath();
        fg.arc(PSII - 30 - i * 6, lerp(MEM_BOT + 40, 20, c), 5, 0, 7);
        fg.stroke();
        fg.restore();
      }
      fadeText(ann, "O₂", PSII - 44, 24, splitIn, "600 13px -apple-system, sans-serif", "#8fe8e0");
    }

    // electrons hopping PSII → ETC → PSI (along the membrane, in the stroma side)
    const eIn = phase(t, 14, 16);
    if (eIn > 0) {
      const path = [PSII, ETC, PSI];
      for (let i = 0; i < 4; i++) {
        const c = cycle(t * 0.3 + i / 4);
        const seg = c * (path.length - 1);
        const k = Math.min(path.length - 2, Math.floor(seg));
        const x = lerp(path[k], path[k + 1], seg - k);
        fg.save();
        fg.globalAlpha = eIn;
        fg.fillStyle = "#fff0b0";
        fg.beginPath();
        fg.arc(x, MEM_TOP - 16, 4, 0, 7);
        fg.fill();
        fg.restore();
        radialGlow(fg, x, MEM_TOP - 16, 12, "rgba(240,216,120,0.8)", eIn);
      }
      fadeText(ann, "e⁻", (PSII + ETC) / 2, MEM_TOP - 26, eIn, "11px -apple-system, sans-serif", "#f0d878");
    }

    // H+ pumped into lumen (down through ETC), accumulating
    const hIn = phase(t, 15, 17);
    if (hIn > 0) {
      for (let i = 0; i < 3; i++) {
        const c = cycle(t * 0.5 + i / 3 + 0.2);
        fg.save();
        fg.globalAlpha = hIn * Math.sin(c * Math.PI);
        fg.fillStyle = "#e88a8a";
        fg.beginPath();
        fg.arc(ETC, lerp(MEM_TOP - 10, MEM_BOT + 40, c), 4, 0, 7);
        fg.fill();
        fg.restore();
      }
      // lumen H+ crowd
      for (let i = 0; i < 6; i++) {
        fg.save();
        fg.globalAlpha = hIn * 0.7;
        fg.fillStyle = "#e88a8a";
        fg.beginPath();
        fg.arc(300 + i * 60 + Math.sin(t * 2 + i) * 4, MEM_BOT + 46 + (i % 2) * 16, 3.4, 0, 7);
        fg.fill();
        fg.restore();
      }
      fadeText(ann, "H⁺", ETC + 22, MEM_BOT + 40, hIn, "11px -apple-system, sans-serif", "#f0a0a0", "start");
    }

    // NADPH forms at PSI (stroma side)
    const nadphIn = phase(t, 19, 21);
    if (nadphIn > 0) {
      const nadphImg = img("nadph");
      if (nadphImg) {
        drawSvg(fg, nadphImg, PSI + 61, MEM_TOP - 33, 74, 30, { alpha: nadphIn });
      } else {
        fg.save();
        fg.globalAlpha = nadphIn;
        fg.fillStyle = "#6db0e8";
        fg.beginPath();
        fg.roundRect(PSI + 30, MEM_TOP - 44, 62, 22, 6);
        fg.fill();
        fg.restore();
        fadeText(ann, "NADPH", PSI + 61, MEM_TOP - 29, nadphIn, "600 12px -apple-system, sans-serif", "#0c447c");
      }
    }

    // ATP made at synthase (H+ flowing back up through it)
    const atpIn = phase(t, 22, 24);
    if (atpIn > 0) {
      for (let i = 0; i < 3; i++) {
        const c = cycle(t * 0.7 + i / 3);
        fg.save();
        fg.globalAlpha = atpIn * Math.sin(c * Math.PI);
        fg.fillStyle = "#e88a8a";
        fg.beginPath();
        fg.arc(SYNTH, lerp(MEM_BOT + 40, MEM_TOP - 10, c), 4, 0, 7);
        fg.fill();
        fg.restore();
      }
      const atpImg = img("atp");
      if (atpImg) {
        drawSvg(fg, atpImg, SYNTH - 4, MEM_TOP - 33, 56, 28, { alpha: atpIn });
      } else {
        fg.save();
        fg.globalAlpha = atpIn;
        fg.fillStyle = "#e8c14a";
        fg.beginPath();
        fg.roundRect(SYNTH - 30, MEM_TOP - 44, 52, 22, 6);
        fg.fill();
        fg.restore();
        fadeText(ann, "ATP", SYNTH - 4, MEM_TOP - 29, atpIn, "600 12px -apple-system, sans-serif", "#412402");
      }
    }

    // title
    fadeText(ann, "the light reactions", 460, 400, phase(t, 0.5, 2) * (1 - phase(t, 23, 25)), "700 17px -apple-system, sans-serif", "#eef5ef");
  },
};
