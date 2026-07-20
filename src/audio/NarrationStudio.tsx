import { useState } from "react";
import { synthesizeNarration, timestampsBlob, type CartesiaVoice, type NarrationResult } from "./tts";

/**
 * Narration Studio — paste the script's spoken text, synthesize ONE audio via Cartesia (with per-word
 * timestamps), play it, and inspect/download the audio + the timestamped transcription. Those timings
 * are the reference timeline the Simple JSON authoring step lays scenes against.
 */
export function NarrationStudio() {
  const [text, setText] = useState(
    "A loaded jumbo jet weighs four hundred tonnes. So how on earth does it stay in the sky? The answer is the shape of the wing.",
  );
  const [voice, setVoice] = useState<CartesiaVoice>("female");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NarrationResult | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await synthesizeNarration(text, { voice });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section style={{ maxWidth: 920, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#e8eef5" }}>
      <h2 style={{ margin: "0 0 8px" }}>🎙️ Narration Studio — Cartesia TTS + timestamps</h2>
      <p style={{ margin: "0 0 12px", color: "#9db3c0", fontSize: 14 }}>
        Paste the script's spoken text → one audio + per-word timestamps (the reference timeline for scene layout).
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 8, border: "1px solid #33465a", background: "#0f1720", color: "#e8eef5", fontSize: 14 }}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "10px 0" }}>
        <label style={{ fontSize: 14 }}>
          Voice:{" "}
          <select value={voice} onChange={(e) => setVoice(e.target.value as CartesiaVoice)} style={{ padding: 4 }}>
            <option value="female">female</option>
            <option value="male">male</option>
          </select>
        </label>
        <button onClick={run} disabled={busy || !text.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: busy ? "#33465a" : "#4a9ae0", color: "#fff", cursor: busy ? "default" : "pointer", fontWeight: 600 }}>
          {busy ? "Synthesizing…" : "Synthesize"}
        </button>
        {result && <span style={{ fontSize: 13, color: "#7fd08a" }}>{result.words.length} words · {result.durationSec.toFixed(2)}s</span>}
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 8, background: "#3a1c1c", color: "#ffb4b4", fontSize: 13, marginBottom: 10 }}>{error}</div>
      )}

      {result && (
        <div>
          <audio controls src={result.audioUrl} style={{ width: "100%", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => download(result.audioBlob, "narration.wav")} style={btn}>⬇ audio (wav)</button>
            <button onClick={() => download(timestampsBlob(result), "narration.timestamps.json")} style={btn}>⬇ timestamps (json)</button>
          </div>
          <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #33465a", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#16222c" }}>
                  <th style={th}>#</th><th style={th}>word</th><th style={th}>start</th><th style={th}>end</th>
                </tr>
              </thead>
              <tbody>
                {result.words.map((w, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #22303c" }}>
                    <td style={td}>{i}</td><td style={td}>{w.word}</td><td style={td}>{w.start.toFixed(3)}</td><td style={td}>{w.end.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 8, border: "1px solid #33465a", background: "#16222c", color: "#e8eef5", cursor: "pointer", fontSize: 13 };
const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", color: "#9db3c0", fontWeight: 600 };
const td: React.CSSProperties = { padding: "5px 10px" };
