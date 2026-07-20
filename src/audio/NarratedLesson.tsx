import { useCallback, useEffect, useRef, useState } from "react";

import { CanvasSlide } from "../components/CanvasSlide";
import { renderLessonSpec, type LessonSpec } from "../simple-json";
import type { CanvasSlideDefinition } from "../slides/types";
import { fullNarration, hasNarration, sceneFloors } from "./align";
import { clearCachedNarration, getCachedNarration, narrationKey, putCachedNarration } from "./cache";
import { canExportMp4, exportLessonMp4 } from "./export-mp4";
import { synthesizeNarration, type CartesiaVoice, type NarrationResult } from "./tts";

/**
 * Narrated lesson. On mount it gets the narration audio — from the IndexedDB cache if this exact narration
 * was synthesized before, otherwise synthesized once via Cartesia and then cached — times every scene to its
 * spoken span (scene ≥ audio, never shorter), and attaches the audio to the slide. Pressing Play runs the
 * video and the voice-over together (audio is the master clock inside CanvasSlide). Reloads are instant and
 * free; only editing the narration (or changing voice) triggers a fresh synthesis.
 */
export function NarratedLesson({ spec, voice = "female" }: { spec: LessonSpec; voice?: CartesiaVoice }) {
  const [status, setStatus] = useState<"preparing" | "ready" | "error">("preparing");
  const [error, setError] = useState<string | null>(null);
  const [slide, setSlide] = useState<CanvasSlideDefinition | null>(null);
  const [audioSec, setAudioSec] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [exportPct, setExportPct] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const prepare = useCallback(
    async (forceResynth: boolean) => {
      setStatus("preparing");
      setError(null);
      try {
        if (!hasNarration(spec)) throw new Error("This lesson has no scene narration to speak.");
        const text = fullNarration(spec);
        const key = narrationKey(text, voice);

        if (forceResynth) await clearCachedNarration(key);
        let narration: NarrationResult | null = forceResynth ? null : await getCachedNarration(key);
        const cached = narration !== null;
        if (!narration) {
          narration = await synthesizeNarration(text, { voice });
          await putCachedNarration(key, narration);
        }

        const floors = sceneFloors(spec, narration.words);
        const result = renderLessonSpec(spec, { sceneFloors: floors, audioUrl: narration.audioUrl });
        if (!result.valid) throw new Error(result.errors.map((e) => `${e.path} ${e.message}`).join("; "));
        setSlide(result.slide);
        setAudioSec(narration.durationSec);
        setAudioBlob(narration.audioBlob);
        setFromCache(cached);
        setStatus("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [spec, voice],
  );

  useEffect(() => {
    // Guard React StrictMode's double-invoke so we hit the cache/synth path exactly once per mount.
    if (startedRef.current) return;
    startedRef.current = true;
    void prepare(false);
  }, [prepare]);

  const downloadMp4 = useCallback(async () => {
    if (!slide) return;
    setExportError(null);
    setExportPct(0);
    try {
      const blob = await exportLessonMp4(slide, audioBlob, { onProgress: setExportPct });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${spec.title.replace(/[^\w-]+/g, "-")}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportPct(null);
    }
  }, [slide, audioBlob, spec.title]);

  if (status === "ready" && slide) {
    const exporting = exportPct !== null;
    return (
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <CanvasSlide
          slide={slide}
          title={<>🌤️ {spec.title}</>}
          tag={<>Press Play — the voice-over plays locked to the video.</>}
          notes={[
            `Narrated · audio ${audioSec.toFixed(1)}s · film ${slide.duration.toFixed(1)}s (never shorter than the voice-over).`,
            fromCache ? "Audio loaded from cache (synthesized earlier)." : "Audio synthesized now and cached for next time.",
          ]}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, fontFamily: "system-ui, sans-serif" }}>
          {exportError && <span style={{ color: "#ffb4b4", fontSize: 13 }}>{exportError}</span>}
          {exporting && (
            <span style={{ color: "#9db3c0", fontSize: 13 }}>Encoding MP4… {Math.round((exportPct ?? 0) * 100)}%</span>
          )}
          {canExportMp4() && (
            <button
              onClick={() => void downloadMp4()}
              disabled={exporting}
              style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: exporting ? "#33465a" : "#4a9ae0", color: "#fff", cursor: exporting ? "default" : "pointer", fontSize: 13, fontWeight: 600 }}
            >
              {exporting ? "Encoding…" : "⬇ Download MP4"}
            </button>
          )}
          <button
            onClick={() => void prepare(true)}
            disabled={exporting}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #33465a", background: "#16222c", color: "#e8eef5", cursor: exporting ? "default" : "pointer", fontSize: 13 }}
          >
            ↻ Re-synthesize voice
          </button>
        </div>
      </div>
    );
  }

  return (
    <section style={{ maxWidth: 920, margin: "24px auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8eef5", border: "1px solid #33465a", borderRadius: 12, textAlign: "center" }}>
      <h2 style={{ margin: "0 0 8px" }}>🌤️ {spec.title}</h2>
      {status === "preparing" && (
        <p style={{ margin: 0, color: "#9db3c0", fontSize: 15 }}>
          🎙️ Preparing the narration and timing the scenes… (first time only; cached after that)
        </p>
      )}
      {status === "error" && (
        <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: "#3a1c1c", color: "#ffb4b4", fontSize: 14 }}>
          Couldn't prepare the audio: {error}
        </div>
      )}
    </section>
  );
}
