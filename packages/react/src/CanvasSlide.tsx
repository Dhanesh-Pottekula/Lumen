/**
 * Generic canvas slide player — renders any CanvasSlideDefinition into a real <canvas>.
 *
 * The player owns the clock (play/pause/seek) via requestAnimationFrame; the slide owns only its
 * pure render(t). Captions are shown as on-screen subtitles. Playback is time-based, so the film
 * runs at the same speed on any refresh rate and any frame is reproducible on scrub.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  drawSlideFrame,
  type CanvasSlideDefinition,
  type Theme,
  TEXTBOOK,
} from "@aira/lumen";

export interface CanvasSlideProps {
  slide: CanvasSlideDefinition;
  title: ReactNode;
  tag: ReactNode;
  notes?: string[];
  /** Label shown before the active caption. Defaults to a provider-neutral "Narration". */
  speakerLabel?: ReactNode;
  /** Accessible label for the rendered canvas. */
  canvasLabel?: string;
  /** Art-direction theme. Defaults to TEXTBOOK (unchanged look). */
  theme?: Theme;
}

export function CanvasSlide({
  slide,
  title,
  tag,
  notes,
  speakerLabel = "Narration",
  canvasLabel = "Animated lesson",
  theme = TEXTBOOK,
}: CanvasSlideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clockRef = useRef({ raf: 0, wallStart: 0, tStart: 0 });
  const tRef = useRef(0); // the currently-displayed time — so resize/preload repaint the right frame
  const scrubbing = useRef(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);

  /** Paint the frame for time `seconds` — HiDPI-aware, scaled to the slide's view space. */
  const draw = useCallback(
    (seconds: number) => {
      tRef.current = seconds;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1); // cap at 2× — 3× phones gain nothing visible
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return; // not laid out yet; the ResizeObserver redraws once it has a size
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform((dpr * w) / slide.viewW, 0, 0, (dpr * h) / slide.viewH, 0, 0);
      drawSlideFrame(ctx, slide, seconds, theme);
    },
    [slide, theme],
  );

  // initial frame + repaint on container resize
  useEffect(() => {
    draw(0);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw(tRef.current));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const pause = useCallback(() => {
    setPlaying(false);
    cancelAnimationFrame(clockRef.current.raf);
    audioRef.current?.pause();
  }, []);

  // When the slide has narration audio, the AUDIO is the master clock: each frame we draw whatever time the
  // audio is currently at, so the picture can never drift from the voice — they are the same clock. Without
  // audio we fall back to a wall clock. Playback ends when the audio ends (or the film's length is reached).
  const tick = useCallback(
    (now: number) => {
      const clock = clockRef.current;
      const audio = audioRef.current;
      const audioMaster = !!(audio && slide.audioUrl);
      let next = audioMaster ? audio!.currentTime : clock.tStart + (now - clock.wallStart) / 1000;
      const ended = audioMaster ? audio!.ended || next >= slide.duration : next >= slide.duration;
      if (ended) {
        next = Math.min(next, slide.duration);
        setPlaying(false);
        if (audioMaster) audio!.pause();
      } else {
        clock.raf = requestAnimationFrame(tick);
      }
      draw(next);
      if (!scrubbing.current) setT(next);
    },
    [slide.duration, slide.audioUrl, draw],
  );

  const play = useCallback(() => {
    cancelAnimationFrame(clockRef.current.raf); // kill any prior loop so two Plays can't run two clocks
    const startAt = t >= slide.duration ? 0 : t;
    setT(startAt);
    setPlaying(true);
    const audio = audioRef.current;
    if (audio && slide.audioUrl) {
      audio.currentTime = startAt;
      void audio.play().catch(() => {}); // autoplay can reject; the picture still runs
    }
    clockRef.current = { raf: 0, wallStart: performance.now(), tStart: startAt };
    clockRef.current.raf = requestAnimationFrame(tick);
  }, [t, slide.duration, slide.audioUrl, tick]);

  const seek = useCallback(
    (value: number) => {
      setT(value);
      clockRef.current = { ...clockRef.current, wallStart: performance.now(), tStart: value };
      const audio = audioRef.current;
      if (audio && slide.audioUrl) audio.currentTime = value;
      draw(value);
    },
    [slide.audioUrl, draw],
  );

  useEffect(() => () => cancelAnimationFrame(clockRef.current.raf), []);

  const caption = slide.captions?.reduce((acc, c) => (c.at <= t ? c.text : acc), slide.captions[0]?.text ?? "");

  return (
    <section className="lumen-card">
      <h2>{title}</h2>
      <p className="lumen-tag">{tag}</p>

      <div className="lumen-stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={canvasLabel}
          style={{ aspectRatio: `${slide.viewW} / ${slide.viewH}` }}
        />
      </div>

      {slide.audioUrl && <audio ref={audioRef} src={slide.audioUrl} preload="auto" hidden />}

      <div className="lumen-player">
        <button type="button" onClick={playing ? pause : play}>
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          aria-label="Lesson timeline"
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
        <span className="lumen-clock">
          {t.toFixed(2)} / {slide.duration.toFixed(2)} s
        </span>
      </div>

      {caption !== undefined && (
        <div className="lumen-caption">
          <span className="lumen-speaker">{speakerLabel}</span>
          {caption}
        </div>
      )}

      {notes && notes.length > 0 && (
        <ul className="lumen-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
