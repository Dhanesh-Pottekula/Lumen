/**
 * gravityOrbits — "Why the Moon Doesn't Fall: Newton, gravity & orbits".
 *
 * A six-scene lesson film for the Lumen engine (CHALKBOARD theme, deep space). Every scene is a pure
 * `render(ctx, t, frame)` — no clocks, no Math.random. All randomness comes from module-level PRNG
 * arrays seeded once (starfields, dust, comet grit), so every frame is reproducible on any seek.
 *
 * Layer routing throughout: starfields/backdrops → bg; the physical subject (apple, Earth, orbits,
 * trajectories) → mid; glows/particles/energy → fg; equations/labels/callouts → annotation; the
 * filmic grade → fx (via frame.grade()). Scenes fall back to the raw ctx when `frame` is undefined.
 *
 * Scenes: 1 the apple · 2 Newton's cannonball (morph showpiece) · 3 the law (F = G m₁m₂/r²) ·
 * 4 ellipses & Kepler · 5 the Moon · 6 recap.
 */
import {
  breathe,
  cycle,
  fadeText,
  lerp,
  phase,
  prng,
  radialGlow,
  smooth,
  wobble,
} from "../slides/anim";
import { composeSlides } from "../slides/compose";
import { CHALKBOARD } from "../render/theme";
import type { CanvasSlideDefinition } from "../slides/types";
import type { Pt } from "../render/strokes";
import { drawOn, tracedPath } from "../render/strokeVerbs";
import { circleShape, drawMorph } from "../render/morph";
import { drawMath } from "../render/mathtext";
import { axes, makePlot, niceTicks, plotFunction, scatter } from "../render/charts";
import { lerpCamera } from "../render/camera";
import { callout } from "../render/callout";
import { predictReveal } from "../render/sequence";
import {
  counterValue,
  drawCounter,
  drawSlam,
  drawWordReveal,
  formatNumber,
} from "../render/type-motion";
import { emit, type EmitterConfig } from "../render/particles";
import { flash, focusRings, pointerArrow, sparkFlash } from "../render/focus";

const W = 920;
const H = 430;

const INK = CHALKBOARD.palette.ink; // "#eaf3ec"
const ACCENT = CHALKBOARD.palette.accent; // "#ffe08a"
const MUTED = CHALKBOARD.palette.muted; // "#9db3a6"
const EARTH = "#3d7fb0";
const EARTH_LAND = "#4f8a5a";
const MOON = "#c7cdd0";

const DISP = (px: number, weight = 700) => `${weight} ${px}px ${CHALKBOARD.type.display}`;
const BODY = (px: number, weight = 400) => `${weight} ${px}px ${CHALKBOARD.type.body}`;

// ── Shared module-level PRNG-seeded data (built ONCE, deterministic) ────────────────────────────────

const starRand = prng(70711);
/** A drifting starfield: fixed positions + per-star twinkle phase and a parallax depth. */
const STARS = Array.from({ length: 130 }, () => ({
  x: starRand() * W,
  y: starRand() * H,
  r: 0.4 + starRand() * 1.5,
  depth: 0.25 + starRand() * 1, // parallax multiplier
  tw: starRand() * Math.PI * 2, // twinkle phase
  twSpeed: 0.6 + starRand() * 1.4,
}));

/** Draw the drifting starfield with a subtle horizontal parallax drift. */
function starfield(ctx: CanvasRenderingContext2D, t: number, alpha = 1, drift = 6) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.fillStyle = "#dfeaf2";
  for (const s of STARS) {
    const x = (s.x - t * drift * s.depth) % (W + 40);
    const px = x < -20 ? x + W + 40 : x;
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.twSpeed + s.tw));
    ctx.globalAlpha = alpha * tw * (0.4 + s.depth * 0.4);
    ctx.beginPath();
    ctx.arc(px, s.y, s.r, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

/** Deep-space vertical wash for the bg layer. */
function spaceWash(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#141d20");
  g.addColorStop(0.55, "#101a1e");
  g.addColorStop(1, "#0b1214");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** A shaded planet disc (Earth-like), lit from the upper-left. */
function drawEarth(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, "#5aa0d0");
  g.addColorStop(0.6, EARTH);
  g.addColorStop(1, "#1c3f5c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.fill();
  // a couple of continents (deterministic blobs, scaled to r)
  ctx.fillStyle = EARTH_LAND;
  ctx.globalAlpha *= 0.85;
  for (const [dx, dy, rr] of [
    [-0.3, -0.2, 0.34],
    [0.28, 0.1, 0.4],
    [-0.05, 0.4, 0.26],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * r, cy + dy * r, rr * r, rr * r * 0.7, dx, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCENE 1 — THE APPLE
// ════════════════════════════════════════════════════════════════════════════════════════════════

// The apple's traced fall arc (a gentle parabola from the tree down to the ground).
const APPLE_X0 = 250;
const APPLE_Y0 = 150;
const GROUND_Y = 352;
/** Apple position as a pure function of local drop-progress d (0..1). */
function appleAt(d: number): Pt {
  const x = APPLE_X0 + d * 26; // drifts slightly right as it falls
  const y = APPLE_Y0 + (GROUND_Y - APPLE_Y0) * d * d; // gravity: y ∝ d²
  return [x, y];
}

// Dust puff on impact.
const dustCfg: EmitterConfig = {
  count: 30,
  seed: 41,
  origin: { kind: "line", x: APPLE_X0 + 26 - 22, y: GROUND_Y, x2: APPLE_X0 + 26 + 22, y2: GROUND_Y },
  t0: 0,
  life: [0.5, 1.1],
  angle: -Math.PI / 2,
  spread: Math.PI * 0.9,
  speed: [30, 90],
  accel: [0, 120],
  wander: { amp: 4, freq: 3 },
  size: [3, 7],
  sizeEnd: 0.5,
  color: ["#c8b98a", "#6b6154"],
  alpha: { in: 0.05, out: 0.5, max: 0.7 },
  shape: "dot",
};

const scene1: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "a quiet garden, a still night. and then — an apple lets go." },
    { at: 4.5, text: "it falls. straight down, faster and faster, until it hits the earth." },
    { at: 8.5, text: "one man asked the question no one else did: why?" },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    spaceWash(bg);
    starfield(bg, t, phase(t, 0, 2), 5);

    // ground line draws on
    const groundP = phase(t, 0.6, 2.2);
    if (groundP > 0) {
      drawOn(mid, [[0, GROUND_Y], [W, GROUND_Y]] as Pt[], groundP, {
        style: { color: "#39463f", width: 2.4 },
      });
    }

    // the tree branch + apple draws on (a short stroke), then the apple hangs
    const branchP = phase(t, 1.4, 2.8);
    if (branchP > 0) {
      const branch: Pt[] = [[150, 96], [200, 118], [248, 138], [APPLE_X0, APPLE_Y0 - 12]];
      drawOn(mid, branch, branchP, {
        style: { color: "#6d5a44", width: 4.5, cap: "round", taperEnd: 30, minWidth: 1.5 },
      });
    }

    // fall timing: hangs, drops between t=4 and t=5.6, then rests on the ground
    const dropStart = 4;
    const dropEnd = 5.6;
    const dropP = phase(t, dropStart, dropEnd);
    const hangY = APPLE_Y0 + breathe(t, 3, 2); // gentle hang wobble before it lets go
    let ax = APPLE_X0;
    let ay = hangY;
    if (t >= dropStart) {
      const [px, py] = appleAt(dropP);
      ax = px;
      ay = py;
    }

    // traced fall arc — the ghost of the path, drawn behind the apple as it falls (fg, blooms)
    if (t >= dropStart && dropP > 0) {
      tracedPath(fg, (tt) => appleAt(phase(tt, dropStart, dropEnd)), t, {
        step: 0.03,
        style: { color: ACCENT, width: 1.6, alpha: 0.5, blend: "lighter" },
      });
    }

    // the apple itself (mid — inherits chalk bloom)
    const appleAlpha = phase(t, 2.6, 3.2);
    if (appleAlpha > 0) {
      mid.save();
      mid.globalAlpha *= appleAlpha;
      mid.fillStyle = "#d1453f";
      mid.beginPath();
      mid.arc(ax, ay, 11, 0, 7);
      mid.fill();
      // little highlight + stalk
      mid.fillStyle = "#e8746b";
      mid.beginPath();
      mid.arc(ax - 3.5, ay - 3.5, 3.5, 0, 7);
      mid.fill();
      mid.strokeStyle = "#6d5a44";
      mid.lineWidth = 2;
      mid.beginPath();
      mid.moveTo(ax + 2, ay - 10);
      mid.lineTo(ax + 5, ay - 17);
      mid.stroke();
      mid.restore();
    }

    // impact: dust puff + spark at the moment of landing (t ≈ dropEnd)
    if (t >= dropEnd) {
      emit(fg, { ...dustCfg, t0: dropEnd }, t);
      sparkFlash(fg, APPLE_X0 + 26, GROUND_Y, phase(t, dropEnd, dropEnd + 0.6), {
        color: ACCENT,
        count: 9,
        length: 20,
      });
    }

    // "NEWTON" slams in near the end
    drawSlam(ann, "NEWTON", W / 2, 250, t, 9.4, {
      font: DISP(66, 800),
      color: INK,
    }, { dur: 0.6, from: 2.2 });
    fadeText(ann, "1687 · Principia", W / 2, 292, phase(t, 10.4, 11.6), BODY(15), MUTED);

    frame?.grade({ vignette: 0.4, grain: 0.07 });
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCENE 2 — NEWTON'S CANNONBALL (morph showpiece)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const EC2X = 620; // Earth center for scene 2 (offset right so cannon fires leftward around it)
const EC2Y = 235;
const ER2 = 150; // Earth radius
// Cannon sits on a mountain at the top of the Earth.
const CANNON: Pt = [EC2X, EC2Y - ER2 - 6];

/**
 * A cannonball trajectory fired horizontally (leftward) from the cannon at "speed" strength s (0..1).
 * Low s → short parabola into the ground; higher s → flies farther; near 1 it would circle. Returned as
 * a projected parabola sampled into a polyline (clipped when it would dip below the surface).
 */
function trajectory(s: number): Pt[] {
  const [x0, y0] = CANNON;
  const v = lerp(120, 520, s); // horizontal launch speed
  const g = 380; // "gravity"
  const pts: Pt[] = [];
  for (let i = 0; i <= 80; i++) {
    const tt = (i / 80) * 1.9;
    const x = x0 - v * tt;
    const y = y0 + 0.5 * g * tt * tt;
    // stop when it would sink below the planet surface (a rough disc test)
    const d = Math.hypot(x - EC2X, y - EC2Y);
    if (d >= ER2 - 2 || i === 0) pts.push([x, y]);
    else break;
  }
  return pts;
}

// A closed circular orbit that hugs the surface (the morph target for the fastest shot).
const ORBIT_R = ER2 + 34;
const orbitShape = circleShape(EC2X, EC2Y, ORBIT_R, 64);
// Reorder so the orbit "starts" at the cannon (top) — the parabola launches from there too.
function orbitFromTop(): Pt[] {
  const start = -Math.PI / 2;
  return Array.from({ length: 65 }, (_, i) => {
    const a = start + (i / 64) * Math.PI * 2;
    return [EC2X + Math.cos(a) * ORBIT_R, EC2Y + Math.sin(a) * ORBIT_R] as Pt;
  });
}

// Cannon fire + smoke.
function fireCfg(at: number): EmitterConfig {
  return {
    count: 24,
    seed: 22,
    origin: { kind: "point", x: CANNON[0] - 14, y: CANNON[1] },
    t0: at,
    life: [0.3, 0.6],
    angle: Math.PI, // blast leftward
    spread: 0.7,
    speed: [120, 240],
    accel: [0, 120],
    size: [4, 8],
    sizeEnd: 1,
    color: ["#ffe08a", "#e2452b"],
    alpha: { in: 0.05, out: 0.5, max: 0.9 },
    shape: "dot",
    blend: "lighter",
  };
}
function smokeCfg(at: number): EmitterConfig {
  return {
    count: 16,
    seed: 23,
    origin: { kind: "point", x: CANNON[0] - 16, y: CANNON[1] },
    t0: at,
    life: [0.8, 1.6],
    angle: Math.PI,
    spread: 0.9,
    speed: [30, 70],
    accel: [0, -18],
    wander: { amp: 8, freq: 1.5 },
    size: 5,
    sizeEnd: 18,
    color: ["#8a94a0", "#3a4650"],
    alpha: { in: 0.2, out: 0.6, max: 0.4 },
    shape: "dot",
  };
}

// Fire beats: three parabolas at rising speed, then the orbit shot.
const SHOTS = [
  { at: 2.2, s: 0.22 },
  { at: 4.4, s: 0.5 },
  { at: 6.6, s: 0.78 },
];
const ORBIT_FIRE = 9.2;

const scene2: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "newton imagined a cannon on an impossibly tall mountain." },
    { at: 2.2, text: "fire slow, and the ball arcs down and lands." },
    { at: 4.4, text: "fire faster — it flies farther before falling." },
    { at: 8, text: "what if we fire faster still?" },
    { at: 10, text: "fast enough, and it never lands — it keeps falling AROUND the earth. that is an orbit." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    spaceWash(bg);
    starfield(bg, t, 0.8, 4);

    // the Earth (mid)
    drawEarth(mid, EC2X, EC2Y, ER2, phase(t, 0.2, 1.4));

    // the cannon — a stubby barrel on the mountain top (mid)
    const cannonP = phase(t, 0.8, 1.6);
    if (cannonP > 0) {
      mid.save();
      mid.globalAlpha *= cannonP;
      mid.strokeStyle = "#c9d3cb";
      mid.lineWidth = 8;
      mid.lineCap = "round";
      mid.beginPath();
      mid.moveTo(CANNON[0] + 6, CANNON[1]);
      mid.lineTo(CANNON[0] - 20, CANNON[1] - 4);
      mid.stroke();
      mid.restore();
    }

    // the three parabola shots — each draws on after its fire beat
    SHOTS.forEach((shot, i) => {
      const p = phase(t, shot.at, shot.at + 1.4);
      if (p <= 0) return;
      const path = trajectory(shot.s);
      const fade = 1 - phase(t, ORBIT_FIRE - 0.5, ORBIT_FIRE + 0.8) * 0.7; // dim as the orbit takes over
      drawOn(mid, path, p, {
        style: { color: i === 2 ? "#ffd08a" : MUTED, width: 2.2, alpha: fade },
      });
      // fire + smoke burst at the muzzle
      if (t >= shot.at && t < shot.at + 2) {
        emit(fg, fireCfg(shot.at), t);
        emit(fg, smokeCfg(shot.at), t);
      }
    });

    // predict-and-reveal beat: "fire faster still?" → the orbit
    const pr = predictReveal(t, { poseAt: 8, revealAt: ORBIT_FIRE, dur: 0.6 });
    if (pr.question > 0 && !pr.revealed) {
      fadeText(ann, "fire faster still?", W / 2 - 210, 60, pr.question * (1 - phase(t, ORBIT_FIRE - 0.3, ORBIT_FIRE)), DISP(24), ACCENT);
    }

    // THE MORPH: the fastest parabola morphs into a closed circular orbit.
    if (t >= ORBIT_FIRE) {
      const morphP = phase(t, ORBIT_FIRE, ORBIT_FIRE + 1.8);
      const para = trajectory(0.98);
      const orbit = orbitFromTop();
      // draw the morphing shape (open→closed loop) on mid, blooming as an orbit line
      drawMorph(mid, para, orbit, morphP, {
        stroke: ACCENT,
        width: 2.8,
        closed: false,
      });
      // fire burst on the orbit shot
      if (t < ORBIT_FIRE + 2) {
        emit(fg, fireCfg(ORBIT_FIRE), t);
        emit(fg, smokeCfg(ORBIT_FIRE), t);
      }

      // once fully an orbit, a cannonball rides it endlessly
      if (morphP > 0.9) {
        const ride = ((t - (ORBIT_FIRE + 1)) * 0.16) % 1;
        const a = -Math.PI / 2 + ride * Math.PI * 2;
        const bx = EC2X + Math.cos(a) * ORBIT_R;
        const by = EC2Y + Math.sin(a) * ORBIT_R;
        radialGlow(fg, bx, by, 16, "rgba(255,224,138,0.8)", 0.9);
        fg.save();
        fg.fillStyle = "#fff2c8";
        fg.beginPath();
        fg.arc(bx, by, 5, 0, 7);
        fg.fill();
        fg.restore();
      }

      fadeText(ann, "an orbit — perpetual free-fall", W / 2 - 190, 60, phase(t, ORBIT_FIRE + 1.4, ORBIT_FIRE + 2.6), DISP(22), INK);
    }

    frame?.grade({ vignette: 0.36, grain: 0.06 });
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCENE 3 — THE LAW  (F = G·m₁·m₂ / r²)
// ════════════════════════════════════════════════════════════════════════════════════════════════

const PLOT3 = makePlot({ x: 540, y: 120, w: 300, h: 200 }, [1, 6], [0, 1]);

const scene3: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "he wrote it as one law of universal gravitation." },
    { at: 3, text: "every mass pulls every other mass — proportional to both masses..." },
    { at: 7, text: "...and falling off with the SQUARE of the distance between them." },
    { at: 11, text: "double the distance, and the pull drops to a quarter. that r-squared is everything." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    spaceWash(bg);
    starfield(bg, t, 0.55, 3);

    // the equation writes on (annotation)
    const eqP = phase(t, 0.4, 3.4);
    drawMath(ann, "F = G\\frac{m_1 m_2}{r^2}", W / 2, 66, {
      size: 40,
      color: INK,
      align: "center",
      p: eqP,
    });

    // two bodies with a force arrow between them (mid + fg). r shrinks/grows over time.
    const b1: Pt = [130, 300];
    const rNow = lerp(220, 120, smooth(phase(t, 8, 13))); // distance changes in the back half
    const b2: Pt = [b1[0] + rNow, 300];
    const bodiesP = phase(t, 3.2, 4.4);
    if (bodiesP > 0) {
      // small body
      mid.save();
      mid.globalAlpha *= bodiesP;
      radialGlow(fg, b1[0], b1[1], 22, "rgba(255,224,138,0.4)", bodiesP * 0.7);
      mid.fillStyle = "#d7c48a";
      mid.beginPath();
      mid.arc(b1[0], b1[1], 14, 0, 7);
      mid.fill();
      // large body
      drawEarth(mid, b2[0], b2[1], 26, bodiesP);
      mid.restore();

      // force flow-arrows between them (a straight pull, drawing on) — both directions
      const arrP = phase(t, 4.4, 5.6);
      pointerArrow(fg, b1[0] + 18, b1[1], b2[0] - 30, b2[1], arrP, { color: ACCENT, width: 3, size: 11 });
      pointerArrow(fg, b2[0] - 30, b2[1], b1[0] + 18, b1[1], arrP, { color: ACCENT, width: 3, size: 11 });

      // r label + bracket
      fadeText(ann, "r", (b1[0] + b2[0]) / 2, 336, phase(t, 5, 6.2), DISP(18), MUTED);
      fadeText(ann, "m₁", b1[0], 268, phase(t, 4.4, 5.4), BODY(14), MUTED);
      fadeText(ann, "m₂", b2[0], 262, phase(t, 4.4, 5.4), BODY(14), MUTED);
    }

    // inverse-square falloff plot (annotation region on the right)
    const plotP = phase(t, 6.2, 7);
    if (plotP > 0) {
      axes(ann, PLOT3, {
        p: plotP,
        grid: true,
        xTicks: niceTicks(PLOT3.xDomain, 5),
        yTicks: niceTicks(PLOT3.yDomain, 4),
        xLabel: "distance r",
        yLabel: "force F",
        color: MUTED,
        ink: MUTED,
      });
      const curveP = phase(t, 7, 9.5);
      plotFunction(ann, PLOT3, (x) => 1 / (x * x), curveP, { color: ACCENT, width: 3 });
      fadeText(ann, "F ∝ 1 / r²", 690, 108, phase(t, 9, 10.2), DISP(18), ACCENT);
    }

    // a counter reading the force as r changes (fg/annotation). F ∝ 1/r², normalized.
    if (t >= 8) {
      const rFrac = rNow / 120; // 1 at closest
      const force = 1 / (rFrac * rFrac);
      drawCounter(ann, 220, 372, force, {
        font: DISP(22, 800),
        color: ACCENT,
        align: "center",
      }, { decimals: 2, suffix: "×" });
      fadeText(ann, "relative pull", 220, 392, phase(t, 8.4, 9.4), BODY(12), MUTED);
      // mark the current r on the curve (pulse a soft flash at the current point)
      if (t >= 8.5) {
        const rx = PLOT3.sx(Math.min(6, rFrac));
        const ry = PLOT3.sy(Math.min(1, 1 / (rFrac * rFrac)));
        flash(fg, rx, ry, 26, cycle(t * 0.8), { color: "rgba(255,224,138,0.9)" });
      }
    }

    // callout on r² — a curved leader pointing at the exponent
    if (frame && t >= 11) {
      callout(frame, {
        target: [W / 2 + 74, 60],
        title: "inverse-square",
        text: "the exponent that shapes every orbit",
        side: "ne",
        route: "curve",
        curveBend: 30,
        container: "rect",
        targetMarker: "ring",
        offset: 40,
        leaderP: phase(t, 11, 12),
        labelP: phase(t, 11.4, 12.4),
        maxWidth: 150,
        color: MUTED,
        accent: ACCENT,
      });
    }

    frame?.grade({ vignette: 0.34, grain: 0.055 });
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCENE 4 — ELLIPSES & KEPLER
// ════════════════════════════════════════════════════════════════════════════════════════════════

const SUN4: Pt = [300, 235];
// A circular planet path and its ellipse counterpart (sun at a focus).
const circlePath = circleShape(SUN4[0], SUN4[1], 130, 72);
function ellipsePath(): Pt[] {
  const a = 165; // semi-major
  const b = 108; // semi-minor
  const c = Math.sqrt(a * a - b * b); // focal distance
  const cx = SUN4[0] + c; // shift so the sun sits at the near focus
  return Array.from({ length: 72 }, (_, i) => {
    const ang = (i / 72) * Math.PI * 2;
    return [cx + Math.cos(ang) * a, SUN4[1] + Math.sin(ang) * b] as Pt;
  });
}
const ell4 = ellipsePath();

// Kepler T² ∝ a³ scatter — real-ish planet data (a in AU, T in years); plotted as T² vs a³ (a line).
const KEPLER = [
  [0.39, 0.24], // Mercury
  [0.72, 0.62], // Venus
  [1.0, 1.0], // Earth
  [1.52, 1.88], // Mars
  [5.2, 11.86], // Jupiter
].map(([a, T]) => [a ** 3, T ** 2] as [number, number]);
const KMAXX = 5.2 ** 3;
const KMAXY = 11.86 ** 2;
const PLOT4 = makePlot({ x: 610, y: 130, w: 250, h: 180 }, [0, KMAXX], [0, KMAXY]);

const scene4: CanvasSlideDefinition = {
  duration: 16,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "zoom out to the whole solar system." },
    { at: 3.5, text: "kepler saw that orbits aren't perfect circles — they're ellipses, with the sun at one focus." },
    { at: 8, text: "and he found a hidden rhythm: the period squared tracks the orbit size cubed." },
    { at: 12, text: "plot T-squared against a-cubed for every planet, and they fall on a straight line." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    spaceWash(bg);
    starfield(bg, t, 0.7, 4);

    // camera log-zoom out at the top of the scene (start pushed in on the sun, dolly out to the system)
    if (frame) {
      const zp = smooth(phase(t, 0, 3));
      const camIn = { x: SUN4[0], y: SUN4[1], zoom: 2.4, rot: 0 };
      const camOut = { x: W / 2, y: H / 2, zoom: 1, rot: 0 };
      frame.setCamera(lerpCamera(camIn, camOut, zp));
    }

    // the sun
    radialGlow(fg, SUN4[0], SUN4[1], 40 + breathe(t, 3, 4), "rgba(255,224,138,0.7)", 0.9);
    mid.save();
    mid.fillStyle = "#ffd66a";
    mid.beginPath();
    mid.arc(SUN4[0], SUN4[1], 18, 0, 7);
    mid.fill();
    mid.restore();

    // circular orbit draws on, then morphs into an ellipse
    const circP = phase(t, 1.2, 3);
    if (t < 4) {
      drawOn(mid, [...circlePath, circlePath[0]] as Pt[], circP, {
        style: { color: MUTED, width: 2, alpha: 0.9 },
      });
    } else {
      const mp = phase(t, 4, 6);
      drawMorph(mid, circlePath, ell4, mp, { stroke: ACCENT, width: 2.4, closed: true });
    }

    // a planet riding the ellipse (once formed) — faster near perihelion (Kepler's 2nd law feel)
    if (t >= 5.5) {
      const orbT = ((t - 5.5) * 0.12) % 1;
      const idx = Math.floor(orbT * ell4.length) % ell4.length;
      const [px, py] = ell4[idx];
      radialGlow(fg, px, py, 12, "rgba(140,200,255,0.8)", 0.9);
      fg.save();
      fg.fillStyle = "#a8d4ff";
      fg.beginPath();
      fg.arc(px, py, 6, 0, 7);
      fg.fill();
      fg.restore();
    }

    // perihelion / aphelion curved-leader callouts
    if (frame && t >= 6.2) {
      const a = 165;
      const b = 108;
      const c = Math.sqrt(a * a - b * b);
      const cx = SUN4[0] + c;
      const peri: [number, number] = [cx - a, SUN4[1]]; // nearest to sun (left end, sun shifted right)
      const apo: [number, number] = [cx + a, SUN4[1]]; // farthest
      callout(frame, {
        target: peri,
        text: "perihelion",
        side: "sw",
        route: "curve",
        curveBend: 26,
        container: "tag",
        offset: 34,
        leaderP: phase(t, 6.2, 7),
        labelP: phase(t, 6.6, 7.4),
        color: MUTED,
        accent: ACCENT,
        fontPx: 12,
      });
      callout(frame, {
        target: apo,
        text: "aphelion",
        side: "se",
        route: "curve",
        curveBend: -26,
        container: "tag",
        offset: 34,
        leaderP: phase(t, 6.6, 7.4),
        labelP: phase(t, 7, 7.8),
        color: MUTED,
        accent: ACCENT,
        fontPx: 12,
      });
    }

    // Kepler's law + scatter proof (annotation, screen-fixed — set fg/ann out of camera via screenspace)
    if (frame) frame.layer.set("annotation", { screenspace: true });
    const lawP = phase(t, 8.2, 10.6);
    drawMath(ann, "T^2 \\propto a^3", 735, 96, { size: 30, color: INK, align: "center", p: lawP });

    const plotP = phase(t, 10.8, 11.6);
    if (plotP > 0) {
      axes(ann, PLOT4, {
        p: plotP,
        grid: true,
        xTicks: niceTicks(PLOT4.xDomain, 4),
        yTicks: niceTicks(PLOT4.yDomain, 4),
        xLabel: "a³ (AU³)",
        yLabel: "T² (yr²)",
        color: MUTED,
        ink: MUTED,
      });
      // the straight line through the points draws on
      const lineP = phase(t, 11.8, 13.2);
      plotFunction(ann, PLOT4, (x) => x, lineP, { color: "rgba(255,224,138,0.6)", width: 2 });
      scatter(ann, PLOT4, KEPLER, phase(t, 12, 15) * 5, { color: "#a8d4ff", r: 5, step: 0.35 });
    }

    // orbital velocity & period count up (annotation)
    if (t >= 8.5) {
      const vel = counterValue(t, 8.5, 2.4, 0, 29.8, smooth);
      drawCounter(ann, 130, 372, vel, { font: DISP(20, 800), color: ACCENT, align: "center" }, { decimals: 1, suffix: " km/s" });
      fadeText(ann, "earth's orbital speed", 130, 392, phase(t, 9, 10), BODY(12), MUTED);
      const per = counterValue(t, 9, 2.4, 0, 365.25, smooth);
      drawCounter(ann, 320, 372, per, { font: DISP(20, 800), color: INK, align: "center" }, { decimals: 0, suffix: " days" });
      fadeText(ann, "one year", 320, 392, phase(t, 9.4, 10.4), BODY(12), MUTED);
    }

    frame?.grade({ vignette: 0.36, grain: 0.06 });
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCENE 5 — THE MOON
// ════════════════════════════════════════════════════════════════════════════════════════════════

const EC5: Pt = [270, 235];
const ER5 = 78;
const MOON_R = 150; // Moon orbital radius
/** Moon position on its circular orbit as a pure function of local time. */
function moonAt(tt: number): Pt {
  const a = -Math.PI / 2 + tt * 0.5;
  return [EC5[0] + Math.cos(a) * MOON_R, EC5[1] + Math.sin(a) * MOON_R];
}

// The comet + its spinning particle tail (color-over-life).
function cometTailCfg(headAt: (tt: number) => Pt, t: number): EmitterConfig {
  const head = headAt(t);
  return {
    count: 46,
    seed: 55,
    origin: { kind: "point", x: head[0], y: head[1] },
    rate: 60,
    loop: true,
    life: [0.5, 1.1],
    angle: 2.4, // trailing back-right
    spread: 0.5,
    speed: [30, 90],
    accel: [10, 6],
    wander: { amp: 6, freq: 6 },
    spin: [-10, 10],
    size: [4, 1],
    sizeEnd: 0.5,
    color: ["#bfe6ff", "#ff9a5a"], // blue near head → warm as it dies
    alpha: { in: 0.1, out: 0.5, max: 0.85 },
    shape: "star",
    blend: "lighter",
  };
}
/** Comet head travels across the top of the frame. */
function cometHead(tt: number): Pt {
  const p = phase(tt, 6, 11);
  return [lerp(-60, W + 80, p), lerp(70, 150, p) + Math.sin(p * 3) * 14];
}

const scene5: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "so back to the moon. why doesn't IT fall?" },
    { at: 3, text: "it does. it's falling toward earth every instant — but it also races sideways." },
    { at: 6, text: "fall + sideways motion = a curve that never quite reaches the ground. it orbits." },
    { at: 9.5, text: "the same law that drops an apple holds the moon, and flings a comet past on its own long fall." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    spaceWash(bg);
    starfield(bg, t, 0.85, 3);

    // Earth (mid)
    drawEarth(mid, EC5[0], EC5[1], ER5, phase(t, 0.2, 1.4));

    // the Moon's orbit path — traced as the Moon travels (fg, blooms)
    const orbP = phase(t, 1.6, 3);
    if (orbP > 0) {
      tracedPath(fg, moonAt, Math.min(t, 1.6 + 4.7), {
        step: 0.05,
        style: { color: "rgba(199,205,208,0.5)", width: 1.4, blend: "lighter" },
      });
    }

    // "falls" vs "sideways" decomposition arrows on the moon (fg)
    const moonPos = moonAt(t);
    const [mx, my] = moonPos;
    // Moon disc
    if (t >= 1.4) {
      radialGlow(fg, mx, my, 20, "rgba(199,205,208,0.5)", 0.7);
      mid.save();
      const mg = mid.createRadialGradient(mx - 4, my - 4, 2, mx, my, 13);
      mg.addColorStop(0, "#e6ebee");
      mg.addColorStop(1, "#9aa2a7");
      mid.fillStyle = mg;
      mid.beginPath();
      mid.arc(mx, my, 13, 0, 7);
      mid.fill();
      mid.restore();
    }

    // velocity (sideways) + gravity (fall) arrows around the moon
    const decompP = phase(t, 3.2, 4.2) * (1 - phase(t, 8.5, 9.5));
    if (decompP > 0) {
      // tangent direction (sideways)
      const a = -Math.PI / 2 + t * 0.5;
      const tx = -Math.sin(a);
      const ty = Math.cos(a);
      fg.save();
      fg.globalAlpha *= decompP;
      pointerArrow(fg, mx, my, mx + tx * 46, my + ty * 46, 1, { color: "#a8d4ff", width: 2.6, size: 9 });
      // fall direction (toward earth)
      const dx = EC5[0] - mx;
      const dy = EC5[1] - my;
      const dl = Math.hypot(dx, dy) || 1;
      pointerArrow(fg, mx, my, mx + (dx / dl) * 42, my + (dy / dl) * 42, 1, { color: ACCENT, width: 2.6, size: 9 });
      fg.restore();
      fadeText(ann, "sideways", mx + tx * 60, my + ty * 60, decompP, BODY(12), "#a8d4ff");
      fadeText(ann, "fall", mx + (dx / dl) * 58, my + (dy / dl) * 58, decompP, BODY(12), ACCENT);
    }

    // the comet streaks past with a spinning, color-over-life particle tail (fg)
    if (t >= 6 && t <= 11.4) {
      const head = cometHead(t);
      emit(fg, cometTailCfg(cometHead, t), t);
      radialGlow(fg, head[0], head[1], 18, "rgba(191,230,255,0.9)", 0.9);
      fg.save();
      fg.fillStyle = "#eaf6ff";
      fg.beginPath();
      fg.arc(head[0], head[1], 5, 0, 7);
      fg.fill();
      fg.restore();
    }

    fadeText(ann, "the Moon — falling forever, missing forever", W / 2, 396, phase(t, 4.6, 6), DISP(18), INK);

    frame?.grade({ vignette: 0.38, grain: 0.06 });
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCENE 6 — RECAP
// ════════════════════════════════════════════════════════════════════════════════════════════════

const scene6: CanvasSlideDefinition = {
  duration: 14,
  viewW: W,
  viewH: H,
  captions: [
    { at: 0, text: "one law. one idea." },
    { at: 3, text: "the fall of an apple and the sweep of a galaxy are the same equation." },
    { at: 7, text: "and it reaches all the way to the moon — 384,400 kilometres away." },
    { at: 11, text: "gravity: the thread that holds the universe together." },
  ],
  render(ctx, t, frame) {
    const bg = frame?.layer.ctx("bg") ?? ctx;
    const mid = frame?.layer.ctx("mid") ?? ctx;
    const fg = frame?.layer.ctx("fg") ?? ctx;
    const ann = frame?.layer.ctx("annotation") ?? ctx;
    if (!frame) ctx.clearRect(0, 0, W, H);

    spaceWash(bg);
    starfield(bg, t, 1, 4);

    // headline word-by-word
    drawWordReveal(ann, "One law — from apples to galaxies", W / 2 - 220, 120, t, {
      font: DISP(26, 800),
      color: INK,
    }, { start: 0.4, step: 0.18, dur: 0.4, mode: "rise" });

    // the equation glows / blooms in the center (mid glows via theme, plus radial bloom)
    const eqP = phase(t, 3, 5.4);
    const glowPulse = 0.5 + 0.5 * Math.sin(t * 1.5);
    if (eqP > 0) {
      radialGlow(fg, W / 2, 220, 120 + breathe(t, 3, 20), "rgba(255,224,138,0.35)", eqP * (0.4 + glowPulse * 0.4));
    }
    drawMath(mid, "F = G\\frac{m_1 m_2}{r^2}", W / 2, 220, {
      size: 46,
      color: ACCENT,
      align: "center",
      p: eqP,
    });
    // a converging focus ring beat as the equation lands
    if (t >= 4.6 && t < 6.4) {
      focusRings(fg, W / 2, 220, phase(t, 4.6, 6.2), { count: 3, maxR: 200, targetR: 110, color: "rgba(255,224,138,0.7)" });
    }

    // distance-to-Moon counter (annotation) with comma grouping
    if (t >= 7) {
      const dist = counterValue(t, 7, 3, 0, 384400, smooth);
      drawCounter(ann, W / 2, 312, dist, {
        font: DISP(38, 800),
        color: INK,
        align: "center",
      }, { commas: true });
      fadeText(ann, "kilometres to the Moon", W / 2, 340, phase(t, 7.4, 8.4), BODY(15), MUTED);
      // a little moon glyph counting-anchor
      const mp = phase(t, 7.2, 8.2);
      if (mp > 0) {
        fg.save();
        fg.globalAlpha *= mp;
        fg.fillStyle = MOON;
        fg.beginPath();
        fg.arc(W / 2 + 170, 305, 10 + wobble(t, 2, 1.5), 0, 7);
        fg.fill();
        fg.restore();
      }
    }

    // closing line word-by-word
    drawWordReveal(ann, "gravity holds the universe together", W / 2 - 195, 386, t, {
      font: BODY(18, 600),
      color: MUTED,
    }, { start: 11, step: 0.16, dur: 0.4, mode: "fade" });

    frame?.grade({ vignette: 0.42, grain: 0.07 });
  },
};

// ════════════════════════════════════════════════════════════════════════════════════════════════

export const gravityLesson = composeSlides([scene1, scene2, scene3, scene4, scene5, scene6], {
  theme: CHALKBOARD,
  filmGrade: true,
  transition: "zoom-through",
});
