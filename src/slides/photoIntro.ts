/**
 * Photosynthesis · scene 1 — the whole system.
 *
 * A leaf on a stem in sunlight: gold rays strike it, CO₂ drifts in, O₂ drifts out,
 * water climbs from the roots. Establishes the three inputs and one output before any zoom.
 * Pure renderFrame(t).
 */
import { img } from "../assets/photosynthesis";
import { clamp01, cycle, drawSvg, fadeText, lerp, phase, prng, radialGlow, withGlow } from "./anim";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const SUN = { x: 168, y: 96, r: 46 };
const LEAF = { x: 520, y: 190, rx: 150, ry: 82 };
const SOIL_Y = 360;
const STEM_X = 520;

const rand = prng(101);
const CO2 = Array.from({ length: 7 }, () => ({ y: 150 + rand() * 120, off: rand(), s: 0.05 + rand() * 0.04 }));
const O2 = Array.from({ length: 7 }, () => ({ x: 380 + rand() * 120, off: rand(), s: 0.06 + rand() * 0.05 }));
const WATER = Array.from({ length: 6 }, () => ({ off: rand(), s: 0.08 + rand() * 0.05 }));

function drawLeaf(ctx: CanvasRenderingContext2D, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp01(alpha);
  // blade
  const g = ctx.createLinearGradient(LEAF.x - LEAF.rx, LEAF.y, LEAF.x + LEAF.rx, LEAF.y);
  g.addColorStop(0, "#2c6b3a");
  g.addColorStop(1, "#3a8a4a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(LEAF.x - LEAF.rx, LEAF.y);
  ctx.quadraticCurveTo(LEAF.x, LEAF.y - LEAF.ry, LEAF.x + LEAF.rx, LEAF.y);
  ctx.quadraticCurveTo(LEAF.x, LEAF.y + LEAF.ry, LEAF.x - LEAF.rx, LEAF.y);
  ctx.fill();
  // midrib + veins
  ctx.strokeStyle = "#1f4f2a";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(LEAF.x - LEAF.rx, LEAF.y);
  ctx.lineTo(LEAF.x + LEAF.rx, LEAF.y);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    const bx = LEAF.x + i * 34;
    ctx.beginPath();
    ctx.moveTo(bx, LEAF.y);
    ctx.quadraticCurveTo(bx + 12, LEAF.y - i * 3 - 20 * Math.sign(1), bx + 20, LEAF.y - (LEAF.ry - 22) * (1 - Math.abs(i) / 4));
    ctx.moveTo(bx, LEAF.y);
    ctx.quadraticCurveTo(bx + 12, LEAF.y + 20, bx + 20, LEAF.y + (LEAF.ry - 22) * (1 - Math.abs(i) / 4));
    ctx.stroke();
  }
  ctx.restore();
}

export const photoIntroSlide: CanvasSlideDefinition = {
  duration: 18,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "every green leaf is a tiny solar-powered factory. it turns light, air, and water into food." },
    { at: 5, text: "sunlight pours in from above, and carbon dioxide drifts in from the air through tiny pores in the leaf." },
    { at: 10, text: "water climbs up from the roots. light, carbon dioxide, and water — those are the three raw ingredients." },
    { at: 14, text: "and the leaf hands back oxygen, the air we breathe. now let's go inside and watch it happen." },
  ],
  render(ctx, t, frame) {
    // Layer routing (Step 01): sky/soil on bg, sun/beams/stem/leaf on mid, molecules on fg,
    // labels on annotation. Falls back to the single ctx when no frame is supplied.
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // sky (bg)
    const sky = bg.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#213445");
    sky.addColorStop(1, "#18242e");
    bg.fillStyle = sky;
    bg.fillRect(0, 0, W, H);

    // soil (bg)
    bg.fillStyle = "#241d16";
    bg.fillRect(0, SOIL_Y, W, H - SOIL_Y);
    bg.strokeStyle = "#3a2e22";
    bg.lineWidth = 2;
    bg.beginPath();
    bg.moveTo(0, SOIL_Y);
    bg.lineTo(W, SOIL_Y);
    bg.stroke();

    // sun with rotating rays (mid)
    const sunIn = phase(t, 0.3, 2);
    const sunImg = img("sun");
    radialGlow(mid, SUN.x, SUN.y, 150, "rgba(255,214,120,0.55)", sunIn * (0.85 + 0.15 * Math.sin(t * 2)));
    if (sunImg) {
      drawSvg(mid, sunImg, SUN.x, SUN.y, 168, 168, { alpha: sunIn, rotate: t * 0.18 });
    } else {
      mid.save();
      mid.globalAlpha = sunIn;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.25;
        const r1 = SUN.r + 8;
        const r2 = SUN.r + 22 + 6 * Math.sin(t * 2 + i);
        mid.strokeStyle = "#e8c14a";
        mid.lineWidth = 3;
        mid.beginPath();
        mid.moveTo(SUN.x + Math.cos(a) * r1, SUN.y + Math.sin(a) * r1);
        mid.lineTo(SUN.x + Math.cos(a) * r2, SUN.y + Math.sin(a) * r2);
        mid.stroke();
      }
      const sg = mid.createRadialGradient(SUN.x, SUN.y, 4, SUN.x, SUN.y, SUN.r);
      sg.addColorStop(0, "#f6e08a");
      sg.addColorStop(1, "#e8c14a");
      mid.fillStyle = sg;
      mid.beginPath();
      mid.arc(SUN.x, SUN.y, SUN.r, 0, 7);
      mid.fill();
      mid.restore();
    }

    // light beams from sun to leaf (mid, additive)
    const beamIn = phase(t, 2, 4);
    if (beamIn > 0) {
      mid.save();
      mid.globalCompositeOperation = "lighter";
      mid.globalAlpha = beamIn * (0.3 + 0.12 * Math.sin(t * 3));
      mid.strokeStyle = "#f0d878";
      mid.lineWidth = 3;
      for (let i = -2; i <= 2; i++) {
        mid.beginPath();
        mid.moveTo(SUN.x + i * 10, SUN.y + SUN.r);
        mid.lineTo(LEAF.x - 60 + i * 26, LEAF.y - 30);
        mid.stroke();
      }
      mid.restore();
    }

    // stem + roots (mid)
    const stemIn = phase(t, 1, 3);
    mid.save();
    mid.globalAlpha = stemIn;
    mid.strokeStyle = "#3a6b34";
    mid.lineWidth = 6;
    mid.beginPath();
    mid.moveTo(STEM_X, LEAF.y + 40);
    mid.lineTo(STEM_X, SOIL_Y);
    mid.stroke();
    mid.lineWidth = 2.4;
    mid.strokeStyle = "#2c5228";
    for (const dx of [-1, 1]) {
      mid.beginPath();
      mid.moveTo(STEM_X, SOIL_Y);
      mid.quadraticCurveTo(STEM_X + dx * 30, SOIL_Y + 24, STEM_X + dx * 60, H - 14);
      mid.moveTo(STEM_X, SOIL_Y);
      mid.quadraticCurveTo(STEM_X + dx * 14, SOIL_Y + 30, STEM_X + dx * 24, H - 8);
      mid.stroke();
    }
    mid.restore();

    // leaf (mid)
    const leafIn = phase(t, 1.5, 3.5);
    const leafImg = img("leaf");
    if (leafImg) drawSvg(mid, leafImg, LEAF.x, LEAF.y, 320, 200, { alpha: leafIn });
    else drawLeaf(mid, leafIn);

    // CO2 in (fg) + label (annotation)
    const co2In = phase(t, 5, 7);
    if (co2In > 0) {
      const co2Img = img("co2");
      for (const p of CO2) {
        const c = cycle(t * p.s + p.off);
        const x = lerp(W - 30, LEAF.x + LEAF.rx - 30, c);
        const a = co2In * (0.35 + 0.5 * Math.sin(c * Math.PI));
        if (co2Img) {
          drawSvg(fg, co2Img, x, p.y, 42, 24, { alpha: a });
        } else {
          fg.save();
          fg.globalAlpha = a;
          fg.fillStyle = "#8a94a0";
          fg.beginPath();
          fg.arc(x, p.y, 4, 0, 7);
          fg.arc(x + 7, p.y, 4, 0, 7);
          fg.arc(x - 7, p.y, 4, 0, 7);
          fg.fill();
          fg.restore();
        }
      }
      fadeText(ann, "CO₂ in", W - 74, 140, co2In, "600 13px -apple-system, sans-serif", "#aab2bc");
    }

    // water up (fg) + label (annotation)
    const waterIn = phase(t, 10, 12);
    if (waterIn > 0) {
      const dropImg = img("waterDrop");
      for (const p of WATER) {
        const c = cycle(t * p.s + p.off);
        const y = lerp(SOIL_Y - 4, LEAF.y + 42, c);
        const a = waterIn * (0.4 + 0.5 * Math.sin(c * Math.PI));
        const x = STEM_X + (p.off - 0.5) * 6;
        if (dropImg) {
          drawSvg(fg, dropImg, x, y, 12, 16, { alpha: a });
        } else {
          fg.save();
          fg.globalAlpha = a;
          fg.fillStyle = "#4a90d8";
          fg.beginPath();
          fg.arc(x, y, 3.4, 0, 7);
          fg.fill();
          fg.restore();
        }
      }
      fadeText(ann, "H₂O up", STEM_X + 46, SOIL_Y - 40, waterIn, "600 13px -apple-system, sans-serif", "#7fb0e8");
    }

    // O2 out (fg) + label (annotation)
    const o2In = phase(t, 14, 15.5);
    if (o2In > 0) {
      const o2Img = img("o2");
      for (const p of O2) {
        const c = cycle(t * p.s + p.off);
        const y = lerp(LEAF.y - 20, 60, c);
        const x = p.x - c * 40;
        const a = o2In * (0.4 + 0.5 * Math.sin(c * Math.PI));
        if (o2Img) {
          drawSvg(fg, o2Img, x, y, 34, 22, { alpha: a });
        } else {
          fg.save();
          fg.globalAlpha = a;
          fg.strokeStyle = "#7fe0d8";
          fg.lineWidth = 2;
          fg.beginPath();
          fg.arc(x, y, 5, 0, 7);
          fg.stroke();
          fg.restore();
        }
      }
      fadeText(ann, "O₂ out", 360, 48, o2In, "600 13px -apple-system, sans-serif", "#8fe8e0");
    }

    // title (annotation)
    const titleIn = phase(t, 0.4, 2);
    withGlow(ann, { blur: 18, color: "rgba(120,220,150,0.6)" }, () => {
      fadeText(ann, "PHOTOSYNTHESIS", 460, 402, titleIn * (1 - phase(t, 15, 17)), "800 26px -apple-system, sans-serif", "#eef5ef");
    });
  },
};
