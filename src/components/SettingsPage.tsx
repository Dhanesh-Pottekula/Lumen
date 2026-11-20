/**
 * Settings: which model each stage of a film runs on, how hard it should think, and the prompts themselves.
 * Everything here applies to the next film that is made. Each choice can be put back to its default on its own.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SettingStage, StageSetting } from "../film/types";

interface StageRow {
  stage: SettingStage;
  title: string;
  about: string;
  has: ("effort" | "quality" | "voice")[];
  setting: StageSetting;
  default: StageSetting;
  changed: boolean;
  /** Something a person should know before changing this stage. */
  note?: string;
}

interface PromptRow {
  key: string;
  title: string;
  stage: string;
  about: string;
  default: string;
  text: string;
  edited: boolean;
}

interface SettingsBody {
  provider: string;
  stages: StageRow[];
  choices: { efforts: string[]; qualities: string[]; priced: string[] };
  prompts: PromptRow[];
}

const EFFORT_NAME: Record<string, string> = { "": "Model's default", minimal: "Minimal", low: "Low", medium: "Medium", high: "High" };
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Only what differs from the default is saved, so a default that changes later is picked up. */
function payloadOf(stages: StageRow[], drafts: Record<string, StageSetting>, prompts: PromptRow[], texts: Record<string, string>) {
  const outStages: Record<string, Partial<StageSetting>> = {};
  for (const row of stages) {
    const draft = drafts[row.stage];
    const differs: Partial<StageSetting> = {};
    for (const field of ["model", "effort", "quality", "voice"] as const) {
      if (draft[field] !== undefined && draft[field] !== row.default[field]) differs[field] = draft[field];
    }
    if (Object.keys(differs).length) outStages[row.stage] = differs;
  }
  const outPrompts: Record<string, string> = {};
  for (const row of prompts) if (texts[row.key].trim() && texts[row.key] !== row.default) outPrompts[row.key] = texts[row.key];
  return { stages: outStages, prompts: outPrompts };
}

export function SettingsPage() {
  const [body, setBody] = useState<SettingsBody | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StageSetting>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"models" | "prompts">("models");
  const [openPrompt, setOpenPrompt] = useState("plan");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<string | null>(null);

  const take = useCallback((got: SettingsBody) => {
    setBody(got);
    setDrafts(Object.fromEntries(got.stages.map((row) => [row.stage, { ...row.setting }])));
    setTexts(Object.fromEntries(got.prompts.map((row) => [row.key, row.text])));
  }, []);

  useEffect(() => {
    void fetch("/api/settings")
      .then((res) => res.json())
      .then(take)
      .catch(() => setNote("The settings could not be read. Is the film server running?"));
  }, [take]);

  const saved = useMemo(() => (body ? JSON.stringify(payloadOf(body.stages, Object.fromEntries(body.stages.map((r) => [r.stage, r.setting])), body.prompts, Object.fromEntries(body.prompts.map((r) => [r.key, r.text])))) : ""), [body]);
  const current = useMemo(() => (body && Object.keys(drafts).length ? JSON.stringify(payloadOf(body.stages, drafts, body.prompts, texts)) : saved), [body, drafts, texts, saved]);
  const dirty = current !== saved;

  // Leaving with changes unsaved asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(
    async (payload: string, done: string) => {
      setSaving(true);
      setNote("");
      try {
        const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload });
        if (!res.ok) throw new Error(String(res.status));
        take((await res.json()) as SettingsBody);
        setNote(done);
      } catch {
        setNote("That could not be saved. Nothing was changed.");
      } finally {
        setSaving(false);
      }
    },
    [take],
  );

  if (!body) return <div className="settings">{note ? <p className="notice">{note}</p> : <p className="quiet">Loading…</p>}</div>;

  const setStage = (stage: string, field: keyof StageSetting, value: string) => setDrafts((all) => ({ ...all, [stage]: { ...all[stage], [field]: value } }));
  const prompt = body.prompts.find((row) => row.key === openPrompt) ?? body.prompts[0];
  const text = texts[prompt.key] ?? "";
  const promptDiffers = text !== prompt.default;
  const promptUnsaved = text !== prompt.text;
  const changedStages = body.stages.filter((row) => JSON.stringify(drafts[row.stage]) !== JSON.stringify(row.default)).length;
  const editedPrompts = body.prompts.filter((row) => (texts[row.key] ?? "") !== row.default).length;

  return (
    <div className="settings">
      <header className="settings-head">
        <div>
          <h1>Settings</h1>
          <p className="quiet">What you choose here is used for the next film you make. Films already made keep what they were made with, and each one's record says what that was.</p>
        </div>
      </header>

      {body.provider !== "openai" && body.provider !== "openai+cartesia" && (
        <p className="notice">{body.provider === "none" ? "No OpenAI key is set, so no film can be made yet. You can still choose models and edit prompts for when one is." : `Films are being made by the "${body.provider}" provider, which ignores the models chosen here. The prompts are still used.`}</p>
      )}

      <nav className="tabs" aria-label="Settings sections">
        <button type="button" className={tab === "models" ? "on" : ""} onClick={() => setTab("models")}>
          Models and reasoning {changedStages > 0 && <span className="pill warn">{changedStages} changed</span>}
        </button>
        <button type="button" className={tab === "prompts" ? "on" : ""} onClick={() => setTab("prompts")}>
          Prompts {editedPrompts > 0 && <span className="pill warn">{editedPrompts} rewritten</span>}
        </button>
      </nav>

      {tab === "models" && (
        <>
          <datalist id="known-models">
            {body.choices.priced.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <div className="stage-cards">
            {body.stages.map((row, i) => {
              const draft = drafts[row.stage];
              const isDefault = JSON.stringify(draft) === JSON.stringify(row.default);
              const priced = body.choices.priced.includes(draft.model);
              return (
                <section key={row.stage} className={`stage-card${isDefault ? "" : " changed"}`}>
                  <header>
                    <span className="step-no">{i + 1}</span>
                    <div>
                      <h3>{row.title}</h3>
                      <p className="quiet">{row.about}</p>
                    </div>
                  </header>
                  {row.note && <p className="stage-note">{row.note}</p>}
                  <label>
                    <span>Model</span>
                    <input type="text" list="known-models" value={draft.model} spellCheck={false} onChange={(event) => setStage(row.stage, "model", event.target.value)} />
                  </label>
                  {row.has.includes("effort") && (
                    <label>
                      <span>Reasoning effort</span>
                      <select value={draft.effort ?? ""} onChange={(event) => setStage(row.stage, "effort", event.target.value)}>
                        {body.choices.efforts.map((effort) => (
                          <option key={effort} value={effort}>
                            {EFFORT_NAME[effort] ?? effort}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {row.has.includes("quality") && (
                    <label>
                      <span>Picture quality</span>
                      <select value={draft.quality ?? "medium"} onChange={(event) => setStage(row.stage, "quality", event.target.value)}>
                        {body.choices.qualities.map((quality) => (
                          <option key={quality} value={quality}>
                            {quality[0].toUpperCase() + quality.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {row.has.includes("voice") && (
                    <label>
                      <span>Voice</span>
                      <input type="text" value={draft.voice ?? ""} spellCheck={false} onChange={(event) => setStage(row.stage, "voice", event.target.value)} />
                    </label>
                  )}
                  <footer>
                    <span className="quiet">
                      Default: {row.default.model}
                      {row.default.effort !== undefined ? ` · ${EFFORT_NAME[row.default.effort]?.toLowerCase() ?? row.default.effort}` : ""}
                      {row.default.quality ? ` · ${row.default.quality}` : ""}
                      {row.default.voice ? ` · ${row.default.voice}` : ""}
                    </span>
                    <span className="grow" />
                    {!priced && draft.model.trim() && <span className="pill warn" title="Its calls are counted, but no cost can be shown for them.">no price known</span>}
                    {!isDefault && (
                      <button type="button" className="ghost small" onClick={() => setDrafts((all) => ({ ...all, [row.stage]: { ...row.default } }))}>
                        Use default
                      </button>
                    )}
                  </footer>
                </section>
              );
            })}
          </div>
          <p className="quiet foot">A model is typed by its id, so any model your key can use works here, listed or not. If a model does not accept the reasoning effort you chose, its calls fail and the run's record shows the provider's own message.</p>
        </>
      )}

      {tab === "prompts" && (
        <div className="prompt-edit">
          <nav className="prompt-list" aria-label="Prompts">
            {body.prompts.map((row) => {
              const differs = (texts[row.key] ?? "") !== row.default;
              const unsaved = (texts[row.key] ?? "") !== row.text;
              return (
                <button key={row.key} type="button" className={row.key === prompt.key ? "on" : ""} onClick={() => setOpenPrompt(row.key)}>
                  <strong>{row.title}</strong>
                  <small>
                    {words(texts[row.key] ?? "").toLocaleString("en")} words
                    {unsaved ? " · not saved" : ""}
                  </small>
                  {differs ? <span className="pill warn">Rewritten</span> : <span className="pill">Default</span>}
                </button>
              );
            })}
          </nav>
          <section className="prompt-body">
            <header>
              <div>
                <h3>{prompt.title}</h3>
                <p className="quiet">{prompt.about}</p>
              </div>
            </header>
            <textarea value={text} spellCheck={false} onChange={(event) => setTexts((all) => ({ ...all, [prompt.key]: event.target.value }))} aria-label={`${prompt.title} prompt`} />
            <footer>
              <span className="quiet">
                {text.length.toLocaleString("en")} characters · {words(text).toLocaleString("en")} words
                {promptDiffers ? ` · default is ${words(prompt.default).toLocaleString("en")} words` : " · this is the default"}
              </span>
              <span className="grow" />
              {promptUnsaved && (
                <button type="button" className="ghost small" onClick={() => setTexts((all) => ({ ...all, [prompt.key]: prompt.text }))}>
                  Undo my edits
                </button>
              )}
              <button
                type="button"
                className={`ghost small${asking === prompt.key ? " danger" : ""}`}
                disabled={!promptDiffers}
                onBlur={() => setAsking(null)}
                onClick={() => {
                  if (asking !== prompt.key) return setAsking(prompt.key);
                  setAsking(null);
                  // Reset is saved at once: it is the way back when a rewrite has broken something.
                  const next = { ...texts, [prompt.key]: prompt.default };
                  setTexts(next);
                  void save(JSON.stringify(payloadOf(body.stages, drafts, body.prompts, next)), `${prompt.title} is back to its default.`);
                }}
              >
                {asking === prompt.key ? "Reset it now?" : "Reset to default"}
              </button>
            </footer>
            <p className="quiet foot">
              This prompt also carries what the film needs in order to play: the shape of the JSON, the ids, the exact words a beat waits for. Change the wording and the judgement freely; if a film stops working after a rewrite, Reset to default
              puts it right.
            </p>
          </section>
        </div>
      )}

      {/* The bar is only there when there is something to save or something to say. */}
      <div className={`save-bar${dirty ? " on" : ""}${dirty || note ? "" : " away"}`} role="status">
        <span>{note || (dirty ? "You have changes that are not saved." : "Everything is saved.")}</span>
        <span className="grow" />
        {dirty && (
          <button type="button" className="ghost" disabled={saving} onClick={() => take(body)}>
            Discard
          </button>
        )}
        <button type="button" className="primary-b" disabled={!dirty || saving} onClick={() => void save(current, "Saved. The next film will use this.")}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
