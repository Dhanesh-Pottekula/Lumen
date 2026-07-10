/**
 * Themed backdrops. Paints the whole view with the theme's base color plus a texture pass
 * (parchment grain, blueprint grid, chalk dust). Deterministic — grain uses a seeded PRNG so
 * scrubbing stays exact. Called by the player before the scene renders.
 */
import { prng } from "../slides/anim";
import type { Theme } from "./theme";

export function paintTexture(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = theme.palette.bg;
  ctx.fillRect(0, 0, w, h);

  if (theme.texture === "parchment") {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.72);
    g.addColorStop(0, "rgba(255,248,224,0.35)");
    g.addColorStop(1, "rgba(120,90,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // aged edges
    const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
    edge.addColorStop(0, "rgba(90,60,20,0)");
    edge.addColorStop(1, "rgba(70,45,15,0.35)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    // fibre grain
    const r = prng(11);
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#5a3a1a";
    for (let i = 0; i < 260; i++) ctx.fillRect(r() * w, r() * h, 1.4, 1.4);
  } else if (theme.texture === "blueprint") {
    ctx.strokeStyle = "rgba(150,200,255,0.16)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // heavier major grid
    ctx.strokeStyle = "rgba(150,200,255,0.26)";
    for (let x = 0; x <= w; x += 140) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 140) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (theme.texture === "chalkboard") {
    const r = prng(23);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 320; i++) ctx.fillRect(r() * w, r() * h, 1.2, 1.2);
  }
  ctx.restore();
}
