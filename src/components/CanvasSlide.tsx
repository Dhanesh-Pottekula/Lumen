/**
 * Generic canvas slide player — renders any CanvasSlideDefinition into a real <canvas>.
 *
 * The player owns the clock (play/pause/seek) via requestAnimationFrame; the slide owns only its
 * pure render(t). Captions are shown as on-screen subtitles. Playback is time-based, so the film
 * runs at the same speed on any refresh rate and any frame is reproducible on scrub.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { preloadImages } from "../assets/imageRegistry";
import { createFrame } from "../render/frame";
import { type Theme, TEXTBOOK } from "../render/theme";
import { paintTexture } from "../render/texture";
import type { CanvasSlideDefinition } from "../slides/types";

interface CanvasSlideProps {
  slide: CanvasSlideDefinition;
  title: ReactNode;
  tag: ReactNode;
  notes?: string[];
  /** Optional SVG asset URLs to preload; the paused frame repaints once they decode. */
  assetUrls?: string[];
  /** Art-direction theme. Defaults to TEXTBOOK (unchanged look). */
  theme?: Theme;
}

export function CanvasSlide({ slide, title, tag, notes, assetUrls, theme = TEXTBOOK }: CanvasSlideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef({ raf: 0, wallStart: 0, tStart: 0 });
  const scrubbing = useRef(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  /** Paint the frame for time `seconds` — HiDPI-aware, scaled to the slide's view space. */
  const draw = useCallback(
    (seconds: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1); // cap at 2× — 3× phones gain nothing visible
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform((dpr * w) / slide.viewW, 0, 0, (dpr * h) / slide.viewH, 0, 0);
      const frame = createFrame(ctx, seconds, slide.viewW, slide.viewH, theme);
      if (theme.texture !== "none") paintTexture(ctx, theme, slide.viewW, slide.viewH);
      slide.render(ctx, seconds, frame);
      frame.finish();
    },
    [slide, theme],
  );

  // initial frame + repaint on container resize
  useEffect(() => {
    draw(0);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw(clockRef.current.tStart));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const pause = useCallback(() => {
    setPlaying(false);
    cancelAnimationFrame(clockRef.current.raf);
  }, []);

  const tick = useCallback(
    (now: number) => {
      const clock = clockRef.current;
      let next = clock.tStart + (now - clock.wallStart) / 1000;
      if (next >= slide.duration) {
        next = slide.duration;
        setPlaying(false);
      } else {
        clock.raf = requestAnimationFrame(tick);
      }
      draw(next);
      if (!scrubbing.current) setT(next);
    },
    [slide.duration, draw],
  );

  const play = useCallback(() => {
    const startAt = t >= slide.duration ? 0 : t;
    setT(startAt);
    setPlaying(true);
    clockRef.current = { raf: 0, wallStart: performance.now(), tStart: startAt };
    clockRef.current.raf = requestAnimationFrame(tick);
  }, [t, slide.duration, tick]);

  const seek = useCallback(
    (value: number) => {
      setT(value);
      clockRef.current = { ...clockRef.current, wallStart: performance.now(), tStart: value };
      draw(value);
    },
    [draw],
  );

  // preload SVG assets, then repaint the current (paused) frame so they appear immediately
  useEffect(() => {
    if (!assetUrls || assetUrls.length === 0) return;
    let cancelled = false;
    void preloadImages(assetUrls).then(() => {
      if (!cancelled) draw(clockRef.current.tStart);
    });
    return () => {
      cancelled = true;
    };
  }, [assetUrls, draw]);

  useEffect(() => () => cancelAnimationFrame(clockRef.current.raf), []);

  const caption = slide.captions?.reduce((acc, c) => (c.at <= t ? c.text : acc), slide.captions[0]?.text ?? "");

  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="tag">{tag}</p>

      <div className="stage">
        <canvas ref={canvasRef} style={{ aspectRatio: `${slide.viewW} / ${slide.viewH}` }} />
      </div>

      <div className="player">
        <button onClick={playing ? pause : play}>{playing ? "Pause" : "Play"}</button>
        <input
          type="range"
          min={0}
          max={slide.duration}
          step={0.01}
          value={t}
          onPointerDown={() => {
            scrubbing.current = true;
          }}
          onPointerUp={() => {
            scrubbing.current = false;
          }}
          onChange={(e) => seek(parseFloat(e.target.value))}
        />
        <span className="clock">
          {t.toFixed(2)} / {slide.duration.toFixed(2)} s
        </span>
      </div>

      {caption !== undefined && (
        <div className="caption">
          <span className="who">AiRA</span>
          {caption}
        </div>
      )}

      {notes && notes.length > 0 && (
        <ul className="notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
