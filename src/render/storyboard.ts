/**
 * storyboard — a declarative lesson format: scenes and beats as plain data that the primitive library
 * renders. This is the base for LLM-generated lessons: emit JSON, get a seekable film. Every beat maps
 * to a primitive from steps 04–17, gated by its own time window (p = phase(t, at, at+dur)).
 */
import { clamp01, fadeText, phase } from "../slides/anim";
import { callout, type Container, type LeaderRoute, type Side } from "./callout";
import { barChart, type Datum, lineChart, makePlot, pie } from "./charts";
import { drawIcon, type IconName } from "./icons";
import { drawMath } from "./mathtext";
import {
  confettiEmitter,
  emit,
  type EmitterConfig,
  energyEmitter,
  fireEmitter,
  smokeEmitter,
  sparksEmitter,
} from "./particles";
import { focusRings, highlightRing } from "./focus";
import { counterValue, drawCounter, drawSlam, drawWordReveal, type NumberFormat } from "./type-motion";
import type { CanvasSlideDefinition, CaptionSegment } from "../slides/types";
import { composeSlides, type ComposeOptions } from "../slides/compose";

// ── Beat schema ──────────────────────────────────────────────────────────────────────────────────

interface Base {
  at: number;
  dur?: number;
  layer?: "bg" | "mid" | "fg" | "annotation" | "fx";
}

export type Beat =
  | (Base & { kind: "text"; x: number; y: number; text: string; size?: number; color?: string; align?: CanvasTextAlign; mode?: "plain" | "word" | "slam" })
  | (Base & { kind: "math"; x: number; y: number; tex: string; size?: number; color?: string; align?: "left" | "center" | "right" })
  | (Base & { kind: "counter"; x: number; y: number; from: number; to: number; size?: number; color?: string; fmt?: NumberFormat })
  | (Base & { kind: "bars"; x: number; y: number; w: number; h: number; data: Datum[]; ymax: number; color?: string })
  | (Base & { kind: "pie"; x: number; y: number; r: number; data: Datum[]; donut?: number })
  | (Base & { kind: "line"; x: number; y: number; w: number; h: number; series: [number, number][]; xDomain: [number, number]; yDomain: [number, number]; area?: boolean; color?: string })
  | (Base & { kind: "icon"; x: number; y: number; name: IconName; size?: number; color?: string; filled?: boolean })
  | (Base & { kind: "callout"; x: number; y: number; text: string; title?: string; side?: Side; route?: LeaderRoute; container?: Container })
  | (Base & { kind: "particles"; x: number; y: number; preset: "fire" | "smoke" | "sparks" | "energy" | "confetti"; seed?: number })
  | (Base & { kind: "ring"; x: number; y: number; r: number; color?: string; converge?: boolean })
  | (Base & { kind: "rect"; x: number; y: number; w: number; h: number; color: string; radius?: number });

export interface StoryScene {
  duration: number;
  bg?: [string, string]; // gradient stops
  captions?: CaptionSegment[];
  beats: Beat[];
}

export interface Storyboard extends ComposeOptions {
  scenes: StoryScene[];
}

// ── Beat renderer ────────────────────────────────────────────────────────────────────────────────

const PRESETS: Record<string, (x: number, y: number, s: number) => EmitterConfig> = {
  fire: fireEmitter,
  smoke: smokeEmitter,
  sparks: sparksEmitter,
  energy: energyEmitter,
  confetti: (x, y, s) => ({ ...confettiEmitter(x, y, s), rate: 22, loop: true }),
};

function renderBeat(frame: NonNullable<Parameters<CanvasSlideDefinition["render"]>[2]>, beat: Beat, t: number) {
  const p = phase(t, beat.at, beat.at + (beat.dur ?? 1));
  if (t < beat.at) return;
  const layerName = beat.layer ?? defaultLayer(beat.kind);
  const ctx = frame.layer.ctx(layerName);
  switch (beat.kind) {
    case "text": {
      const size = beat.size ?? 22;
      const font = `700 ${size}px -apple-system, sans-serif`;
      if (beat.mode === "word") drawWordReveal(ctx, beat.text, beat.x, beat.y, t, { font, color: beat.color ?? "#eef5ef" }, { start: beat.at, step: 0.12, mode: "rise" });
      else if (beat.mode === "slam") drawSlam(ctx, beat.text, beat.x, beat.y, t, beat.at, { font, color: beat.color ?? "#eef5ef" });
      else fadeText(ctx, beat.text, beat.x, beat.y, p, font, beat.color ?? "#eef5ef", beat.align ?? "center");
      break;
    }
    case "math":
      drawMath(ctx, beat.tex, beat.x, beat.y, { size: beat.size ?? 30, color: beat.color, align: beat.align ?? "center", p });
      break;
    case "counter":
      drawCounter(ctx, beat.x, beat.y, counterValue(t, beat.at, beat.dur ?? 2, beat.from, beat.to), { font: `800 ${beat.size ?? 40}px -apple-system, sans-serif`, color: beat.color ?? "#5cc8ae", align: "center" }, beat.fmt);
      break;
    case "bars":
      barChart(ctx, makePlot({ x: beat.x, y: beat.y, w: beat.w, h: beat.h }, [0, 1], [0, beat.ymax]), beat.data, { t, start: beat.at, step: 0.18, color: beat.color, showValues: true });
      break;
    case "pie":
      pie(ctx, beat.x, beat.y, beat.r, beat.data, p, { donut: beat.donut, labels: true });
      break;
    case "line":
      lineChart(ctx, makePlot({ x: beat.x, y: beat.y, w: beat.w, h: beat.h }, beat.xDomain, beat.yDomain), beat.series, p, { area: beat.area, color: beat.color, markers: true });
      break;
    case "icon":
      drawIcon(ctx, beat.name, beat.x, beat.y, beat.size ?? 28, { color: beat.color, filled: beat.filled, alpha: p });
      break;
    case "callout": {
      const cd = beat.dur ?? 1.5;
      callout(frame, { target: [beat.x, beat.y], text: beat.text, title: beat.title, side: beat.side, route: beat.route, container: beat.container, leaderP: p, labelP: phase(t, beat.at + Math.min(0.4, cd * 0.3), beat.at + cd) });
      break;
    }
    case "particles":
      emit(ctx, PRESETS[beat.preset](beat.x, beat.y, beat.seed ?? 1), t - beat.at);
      break;
    case "ring":
      if (beat.converge) focusRings(ctx, beat.x, beat.y, p, { color: beat.color });
      else highlightRing(ctx, beat.x, beat.y, beat.r, t, { color: beat.color });
      break;
    case "rect":
      ctx.save();
      ctx.globalAlpha *= p;
      ctx.fillStyle = beat.color;
      ctx.beginPath();
      ctx.roundRect(beat.x, beat.y, beat.w, beat.h, beat.radius ?? 0);
      ctx.fill();
      ctx.restore();
      break;
    default: {
      // compile-time exhaustiveness + runtime diagnostic for malformed (e.g. LLM-emitted) beat kinds
      const bad: { kind?: string } = beat;
      console.warn(`storyboard: unknown beat kind "${bad.kind}"`);
    }
  }
}

function defaultLayer(kind: Beat["kind"]): NonNullable<Beat["layer"]> {
  if (kind === "particles") return "fg";
  if (kind === "text" || kind === "math" || kind === "callout" || kind === "counter") return "annotation";
  if (kind === "ring") return "fg";
  if (kind === "rect") return "bg";
  return "mid";
}

// ── Compile storyboard → film ──────────────────────────────────────────────────────────────────────

/** Turn one story scene into a CanvasSlideDefinition. */
export function storyboardScene(scene: StoryScene): CanvasSlideDefinition {
  const W = 920;
  const H = 430;
  return {
    duration: scene.duration,
    viewW: W,
    viewH: H,
    captions: scene.captions,
    render(ctx, t, frame) {
      if (!frame) {
        ctx.clearRect(0, 0, W, H);
        return; // storyboard requires the layer model
      }
      const bg = frame.layer.ctx("bg");
      const [c0, c1] = scene.bg ?? ["#141c24", "#0f151b"];
      const g = bg.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      bg.fillStyle = g;
      bg.fillRect(0, 0, W, H);
      for (const beat of scene.beats) renderBeat(frame, beat, t);
    },
  };
}

/** Compile a whole storyboard (scenes as data) into a composed, seekable film. */
export function storyboardFilm(story: Storyboard): CanvasSlideDefinition {
  const { scenes, ...opts } = story;
  return composeSlides(scenes.map(storyboardScene), opts);
}
