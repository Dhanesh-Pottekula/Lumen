/**
 * The film store: receives a film's events and decides what the player may play.
 *
 * Scenes arrive with an index and are accepted strictly in order: a duplicate is ignored, a scene that arrives
 * early is parked until the gap before it is filled. A scene only counts as arrived once its pictures and its
 * voice have loaded, so the player is handed the longest ready prefix and never cuts to a blank frame.
 */
import { createFilmCompiler, type FilmCompiler } from "./compiler";
import { loadPicture } from "./render";
import type { FilmEvent, FilmFile, FilmHeader, FilmProgressEvent, FilmScene, FilmUsage } from "./types";
import { validateScene, withPictures } from "./validate";
import { floorOf } from "./words";

export type FilmStatus = "idle" | "generating" | "ready" | "failed";

export interface PictureProgress {
  id: string;
  status: "planned" | "drawing" | "measuring" | "ready" | "failed";
  src?: string;
}

export interface StepProgress {
  id: string;
  index: number;
  status: "planned" | "writing" | "checking" | "ready" | "published" | "dropped";
}

export interface FilmSnapshot {
  run: string | null;
  status: FilmStatus;
  header: FilmHeader | null;
  /** Scenes received from the server. */
  received: number;
  /** Scenes loaded, compiled and ready to play: always a prefix of what was received. */
  playable: number;
  pictures: PictureProgress[];
  steps: StepProgress[];
  /** The latest line of progress, for the status bar. */
  note: string;
  /** What making the film consumed so far. Null for a film made before usage was recorded. */
  usage: FilmUsage | null;
  error: string | null;
}

export interface ReadyScene {
  scene: FilmScene;
  /** The scene's voice, loaded, or null when it has none. */
  audio: HTMLAudioElement | null;
  start: number;
  end: number;
}

const EMPTY: FilmSnapshot = { run: null, status: "idle", header: null, received: 0, playable: 0, pictures: [], steps: [], note: "", usage: null, error: null };

/** Load a scene's voice far enough to know its length. Resolves with null if it cannot be loaded. */
function loadAudio(src: string): Promise<HTMLAudioElement | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "auto";
    const done = (value: HTMLAudioElement | null) => {
      audio.oncanplaythrough = audio.onerror = null;
      resolve(value);
    };
    audio.oncanplaythrough = () => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio : null);
    audio.onerror = () => done(null);
    setTimeout(() => done(Number.isFinite(audio.duration) && audio.duration > 0 ? audio : null), 15_000);
    audio.src = src;
    audio.load();
  });
}

export class FilmStore {
  private snapshot: FilmSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private parked = new Map<number, FilmScene>();
  private loading: Promise<void> = Promise.resolve();
  private abort: AbortController | null = null;
  /** Bumped on every reset, so work started for an older film cannot touch a newer one. */
  private take = 0;
  compiler: FilmCompiler | null = null;
  scenes: ReadyScene[] = [];

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;

  private set(patch: Partial<FilmSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  reset() {
    this.abort?.abort();
    this.abort = null;
    this.take++;
    for (const ready of this.scenes) ready.audio?.pause();
    this.parked.clear();
    this.loading = Promise.resolve();
    this.compiler = null;
    this.scenes = [];
    this.snapshot = EMPTY;
    for (const listener of this.listeners) listener();
  }

  /** Commission a film and follow its event stream. */
  async generate(brief: string) {
    this.reset();
    const take = this.take;
    this.abort = new AbortController();
    this.set({ status: "generating", note: "Starting" });
    try {
      const res = await fetch("/api/films", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`the film server answered ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          if (block.startsWith("data: ") && take === this.take) this.receive(JSON.parse(block.slice(6)) as FilmEvent);
        }
      }
      // A stream that ends without saying so was cut: fetch the saved film and take what is missing.
      if (take === this.take && this.snapshot.status === "generating" && this.snapshot.run) await this.resync(this.snapshot.run);
    } catch (error) {
      if (take !== this.take || (error as Error).name === "AbortError") return;
      this.set({ status: "failed", error: String((error as Error).message ?? error) });
    }
  }

  /** Open a saved film. */
  async open(run: string) {
    this.reset();
    this.set({ status: "generating", note: "Opening" });
    await this.resync(run);
  }

  private async resync(run: string) {
    const take = this.take;
    try {
      const res = await fetch(`/api/films/${run}`);
      if (!res.ok) throw new Error(`the film server answered ${res.status}`);
      const film = (await res.json()) as FilmFile;
      if (take !== this.take) return;
      film.scenes.forEach((scene, index) => this.receive({ type: "film_scene", run, index, header: film.header, scene }));
      if (film.usage) this.receive({ type: "film_usage", run, usage: film.usage });
      if (film.status !== "generating") this.receive({ type: "film_done", run, status: film.status, scenes: film.scenes.length });
      else this.set({ status: "failed", error: "the film was still being made when the connection was lost" });
    } catch (error) {
      if (take === this.take) this.set({ status: "failed", error: String((error as Error).message ?? error) });
    }
  }

  receive(event: FilmEvent) {
    if (this.snapshot.run && event.run !== this.snapshot.run) return; // an older take's event
    if (!this.snapshot.run) this.set({ run: event.run });
    switch (event.type) {
      case "film_progress":
        this.progress(event);
        break;
      case "film_scene": {
        const have = this.snapshot.received;
        if (event.index < have || this.parked.has(event.index)) return; // a duplicate
        this.parked.set(event.index, event.scene);
        if (!this.compiler) this.compiler = createFilmCompiler(event.header);
        this.compiler.header = event.header;
        // Take every scene that is now next in line.
        let next = have;
        while (this.parked.has(next)) {
          const scene = this.parked.get(next) as FilmScene;
          this.parked.delete(next);
          this.admit(scene);
          next++;
        }
        this.set({ header: event.header, received: next });
        break;
      }
      case "film_usage":
        this.set({ usage: event.usage });
        break;
      case "film_done": {
        // "ready" only once every scene has loaded, so the player does not finish early.
        const take = this.take;
        void this.loading.then(() => {
          if (take !== this.take) return;
          this.set({ status: event.status, error: event.error ?? null, note: event.status === "ready" ? `Film ready: ${event.scenes} scenes` : "The film could not be made" });
        });
        break;
      }
    }
  }

  /** Load one scene's pictures and voice, then hand it to the compiler. Scenes are admitted one after another. */
  private admit(raw: FilmScene) {
    const take = this.take;
    this.loading = this.loading.then(async () => {
      // The scene is checked again here, so nothing the server let through can break the renderer.
      const images = raw.objects.filter((o) => o.kind === "image");
      const rows = images.map((o) => ({ id: o.id, parts: Object.keys(o.hotspots ?? {}), cutout: o.cutout }));
      const verdict = validateScene(raw, rows, raw.id, raw.narration);
      const scene = withPictures(verdict.scene, Object.fromEntries(images.map((o) => [o.id, { src: o.src, aspect: o.aspect, hotspots: o.hotspots, cutout: o.cutout }])));
      const [audio] = await Promise.all([
        raw.audio ? loadAudio(raw.audio.src) : Promise.resolve(null),
        ...images.map((o) => (o.src ? loadPicture(o.src) : Promise.resolve())),
      ]);
      if (take !== this.take || !this.compiler) return;
      const floor = audio ? audio.duration + 0.3 : floorOf(scene.narration);
      const span = this.compiler.add(scene, floor, audio ? raw.audio?.wordTimes : undefined);
      this.scenes.push({ scene: raw.audio ? { ...scene, audio: raw.audio } : scene, audio, start: span.start, end: span.end });
      this.set({ playable: this.scenes.length });
    });
  }

  private progress(event: FilmProgressEvent) {
    const patch: Partial<FilmSnapshot> = { note: event.text };
    if (event.stage === "picture" && event.id) {
      const pictures = this.snapshot.pictures.filter((p) => p.id !== event.id);
      const before = this.snapshot.pictures.find((p) => p.id === event.id);
      const at = before ? this.snapshot.pictures.indexOf(before) : pictures.length;
      pictures.splice(at, 0, { id: event.id, status: event.status as PictureProgress["status"], src: event.src ?? before?.src });
      patch.pictures = pictures;
    }
    if ((event.stage === "step" || event.stage === "scene") && event.id !== undefined && event.index !== undefined) {
      const steps = this.snapshot.steps.filter((s) => s.id !== event.id);
      steps.push({ id: event.id, index: event.index, status: event.status as StepProgress["status"] });
      steps.sort((a, b) => a.index - b.index);
      patch.steps = steps;
    }
    this.set(patch);
  }
}
