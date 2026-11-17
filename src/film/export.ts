/**
 * Frame export: the hook `scripts/export-film.mjs` drives from a headless browser to turn a film into a video
 * file. A film is a pure function of time, so a video is just that function sampled 24 times a second.
 */
import { VIEW_H, VIEW_W } from "./render";
import { FilmStore } from "./store";

export interface ExportInfo {
  title: string;
  duration: number;
  /** Each scene's place on the timeline and its voice file, for the sound track. */
  scenes: { start: number; end: number; audio: string | null }[];
}

export function createExporter() {
  const store = new FilmStore();
  const canvas = document.createElement("canvas");

  return {
    /** Load a saved film and wait until every scene's pictures and voice are ready. */
    async open(run: string): Promise<ExportInfo> {
      await store.open(run);
      for (let waited = 0; store.getSnapshot().status === "generating" && waited < 120_000; waited += 100) await new Promise((r) => setTimeout(r, 100));
      const film = store.getSnapshot();
      if (film.status !== "ready" || !store.compiler) throw new Error(film.error ?? "the film did not load");
      store.compiler.subtitles = true;
      return {
        title: film.header?.title ?? run,
        duration: store.compiler.slide.duration,
        scenes: store.scenes.map((ready) => ({ start: ready.start, end: ready.end, audio: ready.scene.audio?.src ?? ready.audio?.src ?? null })),
      };
    },

    /** One frame at film time `t`, as a JPEG data URL of the given width. */
    frame(t: number, width: number): string {
      const height = Math.round((width * VIEW_H) / VIEW_W);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx || !store.compiler) throw new Error("no film is open");
      ctx.setTransform(width / VIEW_W, 0, 0, height / VIEW_H, 0, 0);
      store.compiler.slide.render(ctx, t);
      return canvas.toDataURL("image/jpeg", 0.9);
    },
  };
}
