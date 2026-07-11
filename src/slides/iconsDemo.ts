/**
 * Iconography & color-semantics demo (Step 15). A grid of the icon kit (staggered pop-in) and a
 * color-semantics legend where each category keeps a consistent color + icon.
 */
import { clamp01, fadeText, phase } from "./anim";
import { colorSemantics, drawIcon, type IconName, iconNames } from "../render/icons";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const COLS = 10;
const sem = colorSemantics();
const CATS = ["cotton", "water", "power", "steel", "trade"];
const CAT_ICON: Record<string, IconName> = { cotton: "seed", water: "drop", power: "bolt", steel: "gear", trade: "arrow" };

export const iconsDemoSlide: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "an icon kit — reusable vector glyphs that scale and theme cleanly, and can draw-on." },
    { at: 4, text: "outline or filled, any size, any color." },
    { at: 7, text: "and a color-semantics registry: each concept keeps one consistent color across the whole lesson." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    const g = bg.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#141c24");
    g.addColorStop(1, "#0f151b");
    bg.fillStyle = g;
    bg.fillRect(0, 0, W, H);

    // icon grid
    const gx = 90;
    const gy = 90;
    const cell = 62;
    iconNames.forEach((name, i) => {
      const p = clamp01(phase(t, 0.5 + i * 0.06, 1.2 + i * 0.06));
      if (p <= 0) return;
      const col = gx + (i % COLS) * cell;
      const row = gy + Math.floor(i / COLS) * cell;
      const filled = i % 3 === 0;
      mid.save();
      mid.globalAlpha = p;
      mid.translate(col, row);
      mid.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
      mid.translate(-col, -row);
      drawIcon(mid, name, col, row, 30, { color: "#8fd0b4", filled, width: 2 });
      mid.restore();
    });

    // color-semantics legend
    if (t > 7) {
      const a = clamp01(phase(t, 7, 8));
      fadeText(ann, "color semantics", 690, 300, a, "600 13px -apple-system, sans-serif", "#aebbc6");
      ann.save();
      ann.globalAlpha = a;
      sem.legend(ann, CATS, 660, 322, { rowH: 22, swatch: 16, icon: (c) => CAT_ICON[c], ink: "#cdd8e2" });
      ann.restore();
    }
    // show the same colors used on a mini bar row to prove consistency
    if (t > 9) {
      const a = clamp01(phase(t, 9, 10));
      CATS.forEach((cat, i) => {
        mid.save();
        mid.globalAlpha = a;
        mid.fillStyle = sem.colorFor(cat);
        mid.fillRect(120 + i * 70, 340 - (i + 1) * 8, 44, (i + 1) * 8 + 20);
        mid.restore();
      });
      fadeText(ann, "same category → same color, everywhere", 260, 375, a, "12px -apple-system, sans-serif", "#93a4b0");
    }

    // title
    ann.save();
    ann.globalAlpha = clamp01(phase(t, 0.3, 1.4));
    ann.fillStyle = "#eef5ef";
    ann.font = "700 18px -apple-system, sans-serif";
    ann.textAlign = "center";
    ann.fillText("iconography & color semantics", 460, 44);
    ann.restore();
  },
};
