/**
 * Generic canvas slide player — renders any CanvasSlideDefinition into a real <canvas>.
 *
 * The player owns the clock (play/pause/seek); the slide owns only its pure render(t).
 * Two clock sources:
 *  - Audio mode: when `audioSrc` is given and the file loads, the narration <audio> element's
 *    currentTime IS the clock. Timings were derived from this exact audio, so visuals and voice
 *    are synced by construction — no speech gating needed.
 *  - Fallback: no audioSrc (or the file failed) → wall-clock rAF + browser speechSynthesis, with
 *    the film held at each caption boundary until the utterance finishes.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { CanvasSlideDefinition } from "../slides/types";
import { useSpeechNarration } from "./useSpeechNarration";

interface CanvasSlideProps {
  slide: CanvasSlideDefinition;
  title: ReactNode;
  tag: ReactNode;
  notes?: string[];
  /** Optional narration audio URL. When it loads, it becomes the master clock. */
  audioSrc?: string;
}
// slide is the canvas slide code that we show, title is the heading, tag is the subheading, notes are optional bullet points
export function CanvasSlide({ slide, title, tag, notes, audioSrc }: CanvasSlideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clockRef = useRef({ raf: 0, wallStart: 0, tStart: 0 }); // to track the animation frame, timing of the browser and the current time of the slide
  const scrubbing = useRef(false);// to know if the user is dragging the timeline slider to change the time of video or not
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const audioReadyRef = useRef(false);
  const endedNaturally = useRef(false);
  const holdSince = useRef(0); // wall time when a speech-gate hold began (0 = not holding)

  const hasAudio = !!audioSrc;
  /** The narration <audio> element when it's loaded and usable as the clock, else null. */
  const audioClock = useCallback(
    (): HTMLAudioElement | null => (hasAudio && audioReadyRef.current ? audioRef.current : null),
    [hasAudio],
  );

  /** Paint the frame for time `seconds` — HiDPI-aware, scaled to the slide's view space. */
  const draw = useCallback(
    (seconds: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1; // css pixel to real physical pixel ratio
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform((dpr * w) / slide.viewW, 0, 0, (dpr * h) / slide.viewH, 0, 0);
      slide.render(ctx, seconds);
    },
    [slide],
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
    endedNaturally.current = false;
    holdSince.current = 0;
    setPlaying(false);
    cancelAnimationFrame(clockRef.current.raf);
    audioClock()?.pause();
  }, [audioClock]);

  const tick = useCallback(
    (now: number) => {
      const clock = clockRef.current;
      const audio = audioClock();

      // Audio mode: the <audio> element is the clock; no speech gating (synced by construction).
      if (audio) {
        let next = audio.currentTime;
        if (audio.ended || next >= slide.duration) {
          next = slide.duration;
          endedNaturally.current = true;
          setPlaying(false);
        } else {
          clock.raf = requestAnimationFrame(tick);
        }
        draw(next);
        if (!scrubbing.current) setT(next);
        return;
      }

      // Fallback: wall-clock + speech gating.
      let next = clock.tStart + (now - clock.wallStart) / 1000;

      // Speech-gated sync: the clock re-anchors at every caption boundary, so
      // tStart always lies inside the current caption's span. If this frame
      // would cross into the next caption while the voice is still reading,
      // hold just before the boundary until the utterance ends (max 15 s).
      const boundary = slide.captions?.find((c) => c.at > clock.tStart && c.at <= next)?.at;
      if (boundary !== undefined) {
        const voiceBusy =
          "speechSynthesis" in window &&
          window.speechSynthesis.speaking &&
          (holdSince.current === 0 || now - holdSince.current < 15000);
        if (voiceBusy) {
          if (holdSince.current === 0) holdSince.current = now;
          next = Math.max(clock.tStart, boundary - 0.001);
          clock.tStart = next; // freeze: elapsed time restarts from the held frame
          clock.wallStart = now;
        } else {
          holdSince.current = 0;
          // crossed cleanly — re-anchor at the boundary, preserving overshoot
          clock.tStart = boundary;
          clock.wallStart = now - (next - boundary) * 1000;
        }
      } else {
        holdSince.current = 0;
      }

      if (next >= slide.duration) {
        next = slide.duration;
        endedNaturally.current = true; // let the final utterance finish
        setPlaying(false);
      } else {
        clock.raf = requestAnimationFrame(tick);
      }
      draw(next);
      if (!scrubbing.current) setT(next);
    },
    [slide.duration, slide.captions, draw, audioClock],
  );

  const play = useCallback(() => {
    endedNaturally.current = false;
    holdSince.current = 0;
    const startAt = t >= slide.duration ? 0 : t;
    setT(startAt);
    setPlaying(true);
    const audio = audioClock();
    if (audio) {
      audio.currentTime = startAt;
      audio.muted = muted;
      void audio.play();
    }
    clockRef.current = { raf: 0, wallStart: performance.now(), tStart: startAt };
    clockRef.current.raf = requestAnimationFrame(tick);
  }, [t, slide.duration, tick, audioClock, muted]);

  const seek = useCallback(
    (value: number) => {
      endedNaturally.current = false;
      holdSince.current = 0;
      setT(value); // update the state with the new time to show in ui
      clockRef.current = { ...clockRef.current, wallStart: performance.now(), tStart: value }; // update the clockRef with the new time and wallStart
      const audio = audioClock();
      if (audio) audio.currentTime = value;
      draw(value); // draw immediately, even if paused
    },
    [draw, audioClock],
  );

  useEffect(() => () => cancelAnimationFrame(clockRef.current.raf), []);
  // keep the audio element's mute in sync with the toggle
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const caption = slide.captions?.reduce((acc, c) => (c.at <= t ? c.text : acc), slide.captions[0]?.text ?? "");
  // Speech synthesis only when the audio clock isn't driving playback.
  const speechSupported = useSpeechNarration(caption, playing && !muted && !audioReady, endedNaturally);
  const showVoiceToggle = hasAudio || speechSupported;
  const narratorLabel = audioReady ? "AiRA · NARRATION" : "AiRA · NARRATION (simulated)";

  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="tag">{tag}</p>

      <div className="stage">
        <canvas ref={canvasRef} style={{ aspectRatio: `${slide.viewW} / ${slide.viewH}` }} />
      </div>

      {hasAudio && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
          onCanPlayThrough={() => {
            audioReadyRef.current = true;
            setAudioReady(true);
          }}
          onError={() => {
            audioReadyRef.current = false;
            setAudioReady(false);
          }}
        />
      )}

      <div className="player">
        <button onClick={playing ? pause : play}>{playing ? "Pause" : "Play"}</button>
        {showVoiceToggle && (
          <button
            className={muted ? "voice is-muted" : "voice"}
            aria-pressed={!muted}
            onClick={() => setMuted((m) => !m)}
          >
            {muted ? "🔇 Muted" : "🔊 Voice"}
          </button>
        )}
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
          <span className="who">{narratorLabel}</span>
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
