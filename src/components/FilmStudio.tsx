/**
 * FilmStudio — watch a saved film, or commission a new one and watch it while it is still being made.
 *
 * Playback follows a cursor (which scene, how far into it). The clock is the scene's own voice when it has one,
 * and elapsed time otherwise. When the cursor reaches a scene that has not arrived yet, the player holds the
 * last frame and waits; it finishes only when the server has said the film is complete.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createExporter } from "../film/export";
import { advance, type Cursor, type Phase } from "../film/playback";
import { VIEW_H, VIEW_W } from "../film/render";
import { FilmStore } from "../film/store";

interface SavedFilm {
  run: string;
  title: string;
  brief: string;
  scenes: number;
  poster: string | null;
  words: number;
}

const store = new FilmStore();

/**
 * One audio element speaks every scene. Browsers only let a page play sound after the viewer has clicked, and
 * some (Safari) grant that per element; a single element that was started by a click keeps the right to play
 * as the film moves from scene to scene.
 */
const voice = new Audio();
let voiceScene = -1;
let unlocked = false;
/** A tenth of a second of silence, played inside a click so the element is allowed to speak later. */
const SILENCE =
  "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

/** Call from a click handler. Earns the right to play sound for scenes that will start seconds from now. */
function unlockSound() {
  if (unlocked) return;
  voice.src = SILENCE;
  voice
    .play()
    .then(() => {
      unlocked = true;
      if (voice.src === SILENCE) voice.pause();
    })
    .catch(() => undefined);
}

// In development the store and the voice are reachable from the console, to inspect a film while it plays.
if (import.meta.env.DEV) Object.assign(window, { lumenFilm: store, lumenVoice: voice, lumenExport: createExporter() });

const EXAMPLES = ["What if the Sun went out for one day?", "How does a vaccine teach your body to fight?", "Why did the Roman Empire fall?"];

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function FilmStudio() {
  const film = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cursor = useRef<Cursor & { last: number }>({ scene: 0, local: 0, started: false, playing: false, last: 0 });
  /** Whether the film now loading should start by itself: yes after a click, no for the one shown on arrival. */
  const autoplay = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [brief, setBrief] = useState("");
  const [subtitles, setSubtitles] = useState(true);
  const [provider, setProvider] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedFilm[] | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);

  /** Speak scene `index` from `at` seconds. If the browser refuses, say so instead of playing silently. */
  const startVoice = useCallback((index: number, at: number) => {
    const src = store.scenes[index]?.audio?.src;
    if (!src) {
      if (voice.src !== SILENCE) voice.pause();
      voiceScene = -1;
      return;
    }
    voiceScene = index;
    if (voice.src !== src) voice.src = src;
    voice.currentTime = at;
    voice
      .play()
      .then(() => setSoundBlocked(false))
      .catch((error: Error) => {
        if (error.name === "NotAllowedError") setSoundBlocked(true);
      });
  }, []);

  const refreshSaved = useCallback(
    () =>
      fetch("/api/films")
        .then((res) => res.json())
        .then((body: { films: SavedFilm[] }) => {
          setSaved(body.films);
          return body.films;
        })
        .catch(() => {
          setSaved([]);
          return [] as SavedFilm[];
        }),
    [],
  );

  // On arrival: learn whether new films can be made, and put the newest saved film on the screen, paused.
  useEffect(() => {
    void fetch("/api/provider")
      .then((res) => res.json())
      .then((body: { name: string }) => setProvider(body.name))
      .catch(() => setProvider("none"));
    void refreshSaved().then((films) => {
      if (films.length === 0 || store.getSnapshot().status !== "idle") return;
      setOpenRun(films[0].run);
      void store.open(films[0].run);
    });
  }, [refreshSaved]);

  useEffect(() => {
    if (film.status === "ready") void refreshSaved();
  }, [film.status, refreshSaved]);

  /** Paint the film at this instant. */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
    const slide = store.compiler?.slide;
    if (!slide || store.scenes.length === 0) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      return;
    }
    const c = cursor.current;
    // Past the last arrived scene, hold that scene's final frame.
    const index = Math.min(c.scene, store.scenes.length - 1);
    const ready = store.scenes[index];
    // Before the film has started, show a still from just after the opening fade rather than a black frame.
    const waiting = !c.playing && !c.started && c.local === 0;
    const local = index !== c.scene ? ready.end - ready.start : waiting ? 0.6 : c.local;
    slide.render(ctx, Math.min(ready.start + local, ready.end - 0.001));
  }, []);

  // One loop for the whole life of the player: advance the cursor, then paint.
  useEffect(() => {
    let raf = 0;
    let shown = -1;
    const tick = (now: number) => {
      const c = cursor.current;
      // Real elapsed time, so a slow or throttled display still keeps pace; capped so waking a sleeping tab cannot skip a scene.
      const dt = Math.min(0.5, (now - (c.last || now)) / 1000);
      c.last = now;
      const voiceTime = voiceScene === c.scene && !voice.paused && !voice.ended ? voice.currentTime : null;
      const lengths = store.scenes.map((ready) => ready.end - ready.start);
      const moved = advance(c, dt, lengths, store.getSnapshot().status === "generating", voiceTime);
      setPhase(moved.phase);
      if (moved.end !== undefined && voiceScene === moved.end) voice.pause();
      if (moved.begin !== undefined) {
        setSceneIndex(moved.begin);
        startVoice(moved.begin, c.local);
      }
      // The clock readout changes a few times a second, not on every frame.
      const at = (store.scenes[Math.min(c.scene, store.scenes.length - 1)]?.start ?? 0) + (c.scene < store.scenes.length ? c.local : lengths.at(-1) ?? 0);
      if (Math.abs(at - shown) > 0.2) {
        shown = at;
        setElapsed(at);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, startVoice]);

  // A film opened by a click starts as soon as its first scene is ready.
  useEffect(() => {
    const c = cursor.current;
    if (autoplay.current && film.playable > 0 && !c.playing && !c.started && c.scene === 0 && c.local === 0) c.playing = true;
  }, [film.playable]);

  useEffect(() => {
    if (store.compiler) store.compiler.subtitles = subtitles;
  }, [subtitles, film.playable]);

  /** Always called from a click, so it is also where sound earns the right to play. */
  const rewind = (scene = 0, playing = false) => {
    if (voice.src !== SILENCE) voice.pause();
    unlockSound();
    cursor.current = { scene, local: 0, started: false, playing, last: 0 };
    setSceneIndex(scene);
  };

  const generate = (event: FormEvent) => {
    event.preventDefault();
    if (!brief.trim() || provider === "none") return;
    autoplay.current = true;
    rewind();
    setOpenRun(null);
    void store.generate(brief.trim());
  };

  const open = (run: string) => {
    autoplay.current = true;
    rewind();
    setOpenRun(run);
    void store.open(run);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggle = () => {
    const c = cursor.current;
    if (film.playable === 0) return;
    if (phase === "finished") return rewind(0, true);
    if (c.playing) {
      c.playing = false;
      voice.pause();
    } else {
      unlockSound();
      c.playing = true;
      if (c.started) startVoice(c.scene, c.local);
    }
  };

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  const busy = film.status === "generating" && openRun === null;
  // While the film is being made the plan says how many scenes to expect; afterwards only what arrived counts.
  const total = busy ? Math.max(film.steps.length, film.received) : film.received;
  const lengths = store.scenes.map((ready) => ready.end - ready.start);
  const known = lengths.reduce((sum, length) => sum + length, 0);
  const playing = phase === "playing" || phase === "buffering";
  const local = cursor.current.local;
  const picturesReady = film.pictures.filter((p) => p.status === "ready").length;
  const current = saved?.find((item) => item.run === openRun);

  const veil =
    film.status === "failed" && film.playable === 0
      ? { title: "This film could not be made", text: film.error ?? "" }
      : film.playable === 0 && film.status === "generating"
        ? { title: busy ? "Making your film" : "Opening", text: film.note }
        : film.status === "idle"
          ? saved === null
            ? null
            : { title: "No film yet", text: provider === "none" ? "Add an OpenAI key to make one." : "Ask a question on the right to make your first film." }
          : null;

  return (
    <div className="studio">
      <div className="studio-main">
        <section className="theatre" aria-label="Film">
          <div className="screen" ref={stageRef}>
            <canvas ref={canvasRef} onClick={toggle} />
            {veil && (
              <div className="veil">
                {film.status === "generating" && <span className="spinner" aria-hidden="true" />}
                <strong>{veil.title}</strong>
                <span>{veil.text}</span>
              </div>
            )}
            {!veil && !playing && (
              <button className="big-play" onClick={toggle} aria-label={phase === "finished" ? "Replay" : "Play"}>
                {phase === "finished" ? "↻" : "▶"}
              </button>
            )}
            {phase === "buffering" && <div className="waiting">Drawing the next scene…</div>}
            {soundBlocked && (
              <button className="unmute" onClick={() => (cursor.current.playing && cursor.current.started ? startVoice(cursor.current.scene, cursor.current.local) : setSoundBlocked(false))}>
                Sound is blocked by the browser. Click to turn it on
              </button>
            )}
          </div>

          <div className="transport">
            <button className="play" onClick={toggle} disabled={film.playable === 0} aria-label={playing ? "Pause" : "Play"}>
              {phase === "finished" ? "↻" : playing ? "❚❚" : "▶"}
            </button>
            <div className="track" role="group" aria-label="Scenes">
              {Array.from({ length: Math.max(total, 1) }, (_, i) => {
                const ready = i < film.playable;
                const fill = !ready ? 0 : i < sceneIndex || phase === "finished" ? 1 : i === sceneIndex ? Math.min(1, local / (lengths[i] || 1)) : 0;
                return (
                  <button
                    key={i}
                    className={`seg${ready ? "" : " pending"}`}
                    style={{ flexGrow: ready ? lengths[i] : (known / Math.max(1, film.playable) || 1) }}
                    disabled={!ready}
                    onClick={() => rewind(i, true)}
                    aria-label={`Scene ${i + 1}`}
                    title={`Scene ${i + 1}`}
                  >
                    <i style={{ width: `${fill * 100}%` }} />
                  </button>
                );
              })}
            </div>
            <span className="time">
              {clock(elapsed)} / {clock(known)}
            </span>
            <button className={`chip${subtitles ? " on" : ""}`} onClick={() => setSubtitles(!subtitles)} aria-pressed={subtitles}>
              CC
            </button>
            <button className="chip" onClick={fullscreen} aria-label="Full screen">
              ⛶
            </button>
          </div>

          <div className="now">
            <h1>{film.header?.title ?? (busy ? "Planning your film…" : "Lumen")}</h1>
            <p>
              {film.playable > 0
                ? `Scene ${Math.min(sceneIndex + 1, film.playable)} of ${total}${busy ? ` · ${film.playable} ready` : ""}`
                : "Films are planned, drawn and narrated from one question."}
              {current?.brief ? ` · “${current.brief}”` : ""}
              {film.playable > 0 && film.status === "ready" && store.scenes.every((ready) => !ready.audio) ? " · no voice in this film" : ""}
            </p>
          </div>
        </section>

        <aside className="side">
          <form className="compose" onSubmit={generate}>
            <h2>New film</h2>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ask a question. What if… How does… Why did…" maxLength={400} rows={3} aria-label="Your question" />
            <div className="examples">
              {EXAMPLES.map((example) => (
                <button type="button" key={example} onClick={() => setBrief(example)}>
                  {example}
                </button>
              ))}
            </div>
            {provider === "none" ? (
              <p className="notice">
                New films need an OpenAI key. Add <code>OPENAI_API_KEY</code> to <code>.env</code> in the Lumen folder. Saved films play without it.
              </p>
            ) : (
              <button className="primary" type="submit" disabled={film.status === "generating" || !brief.trim() || provider === null}>
                {busy ? "Making…" : "Make film"}
              </button>
            )}
            {provider === "offline" && <p className="notice">Stand-in mode: a canned film with drawn pictures, for testing the pipeline.</p>}
          </form>

          {openRun === null && film.status !== "idle" && (
            <div className="production">
              <h2>Production</h2>
              <ol>
                <li className={film.steps.length > 0 || film.pictures.length > 0 ? (film.note.startsWith("Plan done") || film.status !== "generating" || film.received > 0 ? "done" : "live") : "live"}>
                  <b>Plan</b>
                  <span>{film.steps.length ? `${film.steps.length} steps` : "writing"}</span>
                </li>
                <li className={film.pictures.length === 0 ? "" : picturesReady === film.pictures.length ? "done" : "live"}>
                  <b>Pictures</b>
                  <span>
                    {picturesReady} of {film.pictures.length || "?"}
                  </span>
                </li>
                <li className={film.received === 0 ? (film.steps.length ? "live" : "") : film.status === "generating" ? "live" : "done"}>
                  <b>Scenes</b>
                  <span>
                    {film.playable} of {total || "?"}
                  </span>
                </li>
              </ol>
              {film.status === "generating" && film.note && <p className="note">{film.note}</p>}
              {film.status === "failed" && film.playable > 0 && <p className="note">Stopped early: {film.error}</p>}
              {film.pictures.length > 0 && (
                <div className="strip">
                  {film.pictures.map((picture) => (
                    <figure key={picture.id} className={picture.status} title={`${picture.id}: ${picture.status}`}>
                      {picture.src ? <img src={picture.src} alt="" /> : <div />}
                    </figure>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {saved && saved.length > 0 && (
        <section className="library" aria-label="Your films">
          <h2>Your films</h2>
          <div className="shelf">
            {saved.map((item) => (
              <button key={item.run} className={`card-film${item.run === openRun ? " on" : ""}`} onClick={() => open(item.run)}>
                <span className="poster">{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : null}</span>
                <strong>{item.title}</strong>
                <small>
                  {item.scenes} scenes · about {Math.max(1, Math.round((item.words * 0.42) / 60))} min
                </small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
