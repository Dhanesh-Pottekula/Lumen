/**
 * Camera demo (Step 11).
 *
 * A layered "world" the camera dollies into, pans across, zooms-through, and pulls back from — with
 * depth-of-field (bg blur) and parallax (bg counter-drift). The camera is set via frame.setCamera and
 * applied to all non-screenspace layers at composite; the title stays fixed (screenspace).
 */
import { clamp01, fadeText, phase, prng } from "./anim";
import { centerCamera, focusOn, move, pushIn } from "../render/camera";
import type { CanvasSlideDefinition } from "./types";

const W = 920;
const H = 430;

const rand = prng(31);
const HILLS = Array.from({ length: 6 }, (_, i) => ({ x: i * 170 + 40, r: 120 + rand() * 80 }));
const HOUSES = Array.from({ length: 7 }, (_, i) => ({ x: 120 + i * 110, w: 46 + rand() * 24, h: 60 + rand() * 60, hue: 200 + rand() * 40 }));

const FOCAL_X = 340; // the house we push in on
const FOCAL_Y = 250;
const DETAIL_X = 560; // the detail we zoom through to
const DETAIL_Y = 235;

export const cameraDemoSlide: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "the camera — pan, zoom, and rotate the whole world; scenes draw in normal coords." },
    { at: 0.5, text: "a push-in dolly onto one building..." },
    { at: 4.5, text: "...a pan across the row, with the background drifting slower (parallax) and softly blurred (depth of field)..." },
    { at: 8.5, text: "...a zoom-through to a detail, with a touch of rotation..." },
    { at: 12, text: "...then pull back to the whole scene. log-zoom keeps the dolly natural." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    // camera choreography
    let cam = centerCamera(W, H);
    if (t < 4.2) cam = pushIn(W, H, FOCAL_X, FOCAL_Y, 1, 1.9, t, 0.3, 3.6);
    else if (t < 8.4) cam = move(focusOn(FOCAL_X, FOCAL_Y, 1.9), focusOn(FOCAL_X + 260, FOCAL_Y, 1.9), t, 4.2, 3.8);
    else if (t < 11.8) cam = move(focusOn(FOCAL_X + 260, FOCAL_Y, 1.9, 0), focusOn(DETAIL_X, DETAIL_Y, 3.2, 0.12), t, 8.4, 3);
    else cam = move(focusOn(DETAIL_X, DETAIL_Y, 3.2, 0.12), centerCamera(W, H), t, 11.8, 3.4);
    if (frame) frame.setCamera(cam);

    // depth-of-field + parallax on the background
    if (frame) {
      frame.layer.set("bg", { blur: 2.5, offsetX: (W / 2 - cam.x) * 0.35 });
      frame.layer.set("annotation", { screenspace: true }); // title stays fixed
    }

    // BG — sky + far hills
    const sky = bg.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#20344a");
    sky.addColorStop(1, "#38506a");
    bg.fillStyle = sky;
    bg.fillRect(-200, -200, W + 400, H + 400);
    bg.fillStyle = "#2a3f55";
    for (const hb of HILLS) {
      bg.beginPath();
      bg.arc(hb.x, 300, hb.r, Math.PI, 0);
      bg.fill();
    }

    // MID — the row of buildings
    for (const ho of HOUSES) {
      mid.fillStyle = `hsl(${ho.hue}, 22%, 42%)`;
      mid.fillRect(ho.x, 300 - ho.h, ho.w, ho.h);
      // lit windows (fg glow)
      fg.fillStyle = "#ffe08a";
      for (let wy = 300 - ho.h + 10; wy < 296; wy += 18) {
        for (let wx = ho.x + 6; wx < ho.x + ho.w - 6; wx += 14) fg.fillRect(wx, wy, 6, 8);
      }
    }
    // ground
    mid.fillStyle = "#233042";
    mid.fillRect(-200, 300, W + 400, H);

    // FG — foreground posts (fast parallax feel via being large/near)
    fg.fillStyle = "#16202c";
    for (let i = 0; i < 5; i++) fg.fillRect(i * 230 + 30, 330, 10, 80);

    // title (screenspace — unaffected by the camera)
    fadeText(ann, "camera & transitions", 460, 44, clamp01(phase(t, 0.3, 1.4)), "700 18px -apple-system, sans-serif", "#eef5ef");
  },
};
