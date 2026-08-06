import { useMemo, useState, type FormEvent } from "react";

import { renderLessonSpec } from "@aira/lumen";
import { canExportMp4, exportLessonMp4 } from "@aira/lumen-mp4";
import { CanvasSlide } from "@aira/lumen-react";
import { NarratedLesson } from "./components/NarratedLesson";
import { waterCycleLessonSpec } from "./lessons";

const SESSION_KEY = "lumen.playground.cartesia-key";

function readSessionKey(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const [apiKey, setApiKey] = useState(readSessionKey);
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [silentPreview, setSilentPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const silentResult = useMemo(() => renderLessonSpec(waterCycleLessonSpec), []);

  async function downloadSilentPreview() {
    if (!silentResult.valid) return;
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportLessonMp4(silentResult.slide, null, {
        fps: 30,
        scale: 1,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lumen-water-cycle-demo.mp4";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  }

  function saveKey(event: FormEvent) {
    event.preventDefault();
    const key = draft.trim();
    if (!key) return;
    try {
      sessionStorage.setItem(SESSION_KEY, key);
    } catch {
      // A privacy-restricted browser can still use the key for this component session.
    }
    setApiKey(key);
    setSilentPreview(false);
    setDraft("");
  }

  function forgetKey() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Best effort only.
    }
    setApiKey("");
    setDraft("");
    setSilentPreview(false);
  }

  if (!apiKey && !silentPreview) {
    return (
      <main className="playground-shell">
        <section className="key-card">
          <p className="eyebrow">Optional narration adapter</p>
          <h1>Use your own Cartesia key</h1>
          <p>
            Lumen does not include an AiRA key. The playground sends this key
            directly to Cartesia and keeps it only in this browser tab&apos;s
            session storage.
          </p>
          <form onSubmit={saveKey}>
            <label htmlFor="cartesia-key">Cartesia API key</label>
            <div className="key-row">
              <input
                id="cartesia-key"
                type={visible ? "text" : "password"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your Cartesia API key"
                required
              />
              <button type="button" className="secondary" onClick={() => setVisible((value) => !value)}>
                {visible ? "Hide" : "Show"}
              </button>
              <button type="submit">Continue</button>
            </div>
          </form>
          <button
            type="button"
            className="silent-preview"
            onClick={() => setSilentPreview(true)}
          >
            Preview without narration
          </button>
          <p className="security-note">
            For a public production application, call Cartesia from your own
            backend instead of accepting a permanent provider key in the browser.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <div>
          <p className="eyebrow">Lumen playground</p>
          <h1>Simple JSON → narrated canvas video</h1>
        </div>
        <button className="secondary" onClick={forgetKey}>
          {apiKey ? "Change Cartesia key" : "Add Cartesia narration"}
        </button>
      </header>
      {apiKey ? (
        <NarratedLesson spec={waterCycleLessonSpec} apiKey={apiKey} />
      ) : silentResult.valid ? (
        <>
          <CanvasSlide
            slide={silentResult.slide}
            title={<>💧 {waterCycleLessonSpec.title}</>}
            tag="Silent preview — add your Cartesia key only if you want narration."
            notes={[
              "A fresh four-scene lesson authored entirely with public Simple JSON.",
              "No provider key or network request is required for this preview.",
            ]}
          />
          {canExportMp4() && (
            <div className="silent-export">
              {exportError && <span>{exportError}</span>}
              <button
                type="button"
                onClick={() => void downloadSilentPreview()}
                disabled={exporting}
              >
                {exporting ? "Encoding MP4…" : "Download silent MP4"}
              </button>
            </div>
          )}
        </>
      ) : (
        <pre>{JSON.stringify(silentResult.errors, null, 2)}</pre>
      )}
    </main>
  );
}
