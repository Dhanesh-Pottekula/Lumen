/**
 * Runs: how each film was made. Every model call of a run, stage by stage, with what went in, what came out,
 * how long it took and what it used. A run still being made is read again every second or two, so its stages
 * can be watched as they work.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CallRecord, CallSummary, FilmFile, TracePart, UsageStage } from "../film/types";

interface FilmRow {
  run: string;
  title: string;
  brief: string;
  status: FilmFile["status"];
  scenes: number;
  provider: string;
  poster: string | null;
  cost: number | null;
  making: boolean;
}

interface LogEvent {
  t?: number;
  stage?: string;
  status?: string;
  text?: string;
  id?: string;
  [key: string]: unknown;
}

/** The stages in the order a film goes through them. */
const STAGES: { stage: UsageStage; label: string; what: string }[] = [
  { stage: "plan", label: "Plan", what: "Writes the narration, every picture's brief and each step's direction" },
  { stage: "picture", label: "Pictures", what: "Draws each background and cut-out" },
  { stage: "parts", label: "Parts", what: "Finds the named parts in each picture" },
  { stage: "voice", label: "Voice", what: "Speaks each step" },
  { stage: "timing", label: "Timing", what: "Finds when each word is said" },
  { stage: "warm-up", label: "Cache", what: "Puts the scene writer's prompt in the cache" },
  { stage: "scene", label: "Scenes", what: "Directs each step from its pictures" },
];
const labelOf = (stage: string) => STAGES.find((s) => s.stage === stage)?.label ?? stage;

// ── Small formatters ────────────────────────────────────────────────────────────────────────────────
const count = (n: number) => n.toLocaleString("en");
const money = (n: number | null | undefined) => (n === null || n === undefined ? "no price" : n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const took = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
/** A run's name begins with when it started, in UTC: 20261120174350-… */
function startedOf(run: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(run);
  if (!m) return "";
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────────────────────────────
function Status({ status }: { status: string }) {
  const word = status === "ok" ? "Done" : status === "running" || status === "generating" ? "Running" : status === "failed" ? "Failed" : status === "ready" ? "Ready" : status;
  const tone = status === "ok" || status === "ready" ? "good" : status === "failed" ? "bad" : "live";
  return (
    <span className={`pill ${tone}`}>
      {tone === "live" && <span className="dot" aria-hidden="true" />}
      {word}
    </span>
  );
}

/**
 * Whether a call found its prompt in the provider's cache. The numbers are the ones the provider sent back with
 * the reply (cached_tokens and cache_write_tokens); nothing here is worked out by Lumen.
 */
function CacheCell({ call }: { call: CallSummary }) {
  if (!["plan", "scene", "parts", "warm-up"].includes(call.stage) || call.status !== "ok") return <span className="quiet">—</span>;
  const { input, cached, cacheWrite } = call.usage;
  if (cached > 0)
    return (
      <span className="pill good" title={`The provider reported ${count(cached)} of ${count(input)} input tokens read from its cache`}>
        Hit · {count(cached)}
        {cacheWrite > 0 ? ` · wrote ${count(cacheWrite)}` : ""}
      </span>
    );
  if (cacheWrite > 0)
    return (
      <span className="pill live" title={`Nothing was read from the cache. The provider reported ${count(cacheWrite)} tokens written to it for later calls`}>
        Wrote · {count(cacheWrite)}
      </span>
    );
  if (call.stage === "parts") return <span className="quiet" title="The part finder sends nothing that repeats, so it does not use the cache">not used</span>;
  return (
    <span className="pill bad" title="The provider reported no tokens read from its cache and none written to it">
      Miss · 0
    </span>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ghost small"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** One text, whole. A long one opens folded, with its length said, so a page of calls stays readable. */
function TextBlock({ title, text, open = false }: { title: string; text: string; open?: boolean }) {
  const lines = text.split("\n").length;
  const long = text.length > 1800 || lines > 28;
  const [shown, setShown] = useState(open || !long);
  return (
    <section className="block">
      <header>
        <h4>{title}</h4>
        <span className="quiet">
          {count(text.length)} characters · {count(text.split(/\s+/).filter(Boolean).length)} words
        </span>
        <span className="grow" />
        {long && (
          <button type="button" className="ghost small" onClick={() => setShown((v) => !v)} aria-expanded={shown}>
            {shown ? "Fold" : "Show all"}
          </button>
        )}
        <CopyButton text={text} />
      </header>
      <pre className={shown ? "" : "folded"}>{text || "(empty)"}</pre>
      {!shown && (
        <button type="button" className="unfold" onClick={() => setShown(true)}>
          Show all {count(lines)} lines
        </button>
      )}
    </section>
  );
}

function Part({ part }: { part: TracePart }) {
  if (part.kind === "text") return <TextBlock title={part.title} text={part.text ?? ""} />;
  return (
    <section className="block media">
      <header>
        <h4>{part.title}</h4>
        <span className="quiet">{part.note}</span>
      </header>
      {part.src ? (
        part.kind === "image" ? (
          <a href={part.src} target="_blank" rel="noreferrer" title="Open the picture">
            <img src={part.src} alt={part.title} loading="lazy" />
          </a>
        ) : (
          <audio controls preload="none" src={part.src} />
        )
      ) : (
        <p className="quiet">Not kept as a file, so it cannot be shown here.</p>
      )}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="tile">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
    </div>
  );
}

// ── One call, in full ───────────────────────────────────────────────────────────────────────────────
function CallDetail({ run, n, onClose, live }: { run: string; n: number; onClose: () => void; live: boolean }) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [tab, setTab] = useState<"input" | "output" | "wire">("input");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setCall(null);
    const load = () => void getJson<CallRecord>(`/api/films/${run}/calls/${n}`).then((got) => alive && got && setCall(got));
    load();
    // A call still running is read again until it ends.
    const timer = live ? setInterval(load, 1500) : undefined;
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [run, n, live]);

  useEffect(() => {
    panel.current?.focus();
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const usage = call?.usage;
  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-label="One model call" tabIndex={-1} ref={panel} onClick={(event) => event.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <span className="quiet">
              Call {n} · {call ? labelOf(call.stage) : ""}
            </span>
            <h3>{call?.title ?? "Loading…"}</h3>
          </div>
          <span className="grow" />
          {call && <Status status={call.status} />}
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>

        {call && usage && (
          <div className="drawer-body">
            {call.error && <p className="failure">{call.error}</p>}

            <dl className="facts">
              <div>
                <dt>Model</dt>
                <dd>{call.model}</dd>
              </div>
              {call.effort && (
                <div>
                  <dt>Reasoning</dt>
                  <dd>{call.effort}</dd>
                </div>
              )}
              {Object.entries(call.settings).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <div>
                <dt>Started</dt>
                <dd>{clock(call.at)} into the run</dd>
              </div>
              <div>
                <dt>Took</dt>
                <dd>{call.status === "running" ? "still running" : took(call.ms)}</dd>
              </div>
              <div>
                <dt>Requests</dt>
                <dd>{call.requests || call.exchanges.length || "—"}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{money(call.cost)}</dd>
              </div>
            </dl>

            <div className="tiles compact">
              <Tile label="Input tokens" value={count(usage.input)} />
              <Tile label="Read from cache" value={count(usage.cached)} hint={usage.input ? `${Math.round((usage.cached / usage.input) * 100)}% of input, as the provider reported` : undefined} />
              <Tile label="Written to cache" value={count(usage.cacheWrite)} />
              <Tile label="Output tokens" value={count(usage.output)} hint={usage.reasoning ? `${count(usage.reasoning)} of them reasoning` : undefined} />
              {usage.images > 0 && <Tile label="Pictures" value={count(usage.images)} />}
              {usage.characters > 0 && <Tile label="Characters spoken" value={count(usage.characters)} />}
              {usage.seconds > 0 && <Tile label="Seconds of sound" value={usage.seconds.toFixed(1)} />}
            </div>

            <nav className="tabs" aria-label="What to show">
              <button type="button" className={tab === "input" ? "on" : ""} onClick={() => setTab("input")}>
                What went in <span className="quiet">{call.input.length}</span>
              </button>
              <button type="button" className={tab === "output" ? "on" : ""} onClick={() => setTab("output")}>
                What came out <span className="quiet">{call.output.length + call.tools.length}</span>
              </button>
              <button type="button" className={tab === "wire" ? "on" : ""} onClick={() => setTab("wire")}>
                On the wire <span className="quiet">{call.exchanges.length}</span>
              </button>
            </nav>

            {tab === "input" && (call.input.length ? call.input.map((part, i) => <Part key={i} part={part} />) : <p className="quiet">Nothing was sent.</p>)}

            {tab === "output" && (
              <>
                {call.tools.map((tool, i) => (
                  <div key={i} className="tool">
                    <TextBlock title={`The model called ${tool.name}`} text={tool.arguments} />
                    <TextBlock title="What the tool answered" text={tool.result} />
                  </div>
                ))}
                {call.output.map((part, i) => (
                  <Part key={i} part={part} />
                ))}
                {call.output.length === 0 && call.tools.length === 0 && <p className="quiet">{call.status === "running" ? "Nothing has come back yet." : call.status === "failed" ? "The call failed before anything came back." : "This call has nothing to show for its answer."}</p>}
              </>
            )}

            {tab === "wire" &&
              (call.exchanges.length ? (
                call.exchanges.map((exchange, i) => (
                  <div key={i} className="tool">
                    <p className="wire-line">
                      <code>POST {exchange.path}</code>
                      <span className={`pill ${exchange.status >= 200 && exchange.status < 300 ? "good" : "bad"}`}>{exchange.status || "no answer"}</span>
                      <span className="quiet">{took(exchange.ms)}</span>
                    </p>
                    <TextBlock title="Request body, as sent" text={JSON.stringify(exchange.request, null, 2)} />
                    <TextBlock title="Response, as received" text={typeof exchange.response === "string" ? exchange.response : JSON.stringify(exchange.response, null, 2)} />
                  </div>
                ))
              ) : (
                <p className="quiet">This provider does not report its requests. What went in and what came out are on the other two tabs.</p>
              ))}
          </div>
        )}
      </aside>
    </div>
  );
}

// ── Step by step ────────────────────────────────────────────────────────────────────────────────────
interface PlanShape {
  pictures?: { id?: string; kind?: string; of?: string }[];
  steps?: { id?: string; narration?: string; screen?: string[] }[];
}

/** A button for one call, or a quiet mark where no call was made. */
function CallChip({ calls, label, onOpen }: { calls: CallSummary[]; label?: string; onOpen: (n: number) => void }) {
  if (calls.length === 0) return <span className="cell-none">—</span>;
  const last = calls[calls.length - 1];
  const state = calls.some((c) => c.status === "running") ? "running" : last.status;
  return (
    <button type="button" className={`cell ${state}`} onClick={() => onOpen(last.n)} title={`${last.title}: ${state === "ok" ? "done" : state}${calls.length > 1 ? `, ${calls.length} calls` : ""}`}>
      <span className="dot" aria-hidden="true" />
      {label ?? (state === "ok" ? took(last.ms) : state)}
      {calls.length > 1 && <span className="quiet"> ×{calls.length}</span>}
    </button>
  );
}

/**
 * Every step of the film with the work done for it: its pictures drawn and searched, its voice, its scene.
 * It answers "where is the film up to?" and "what went wrong, and for which step?" at a glance.
 */
function StepBoard({ plan, calls, film, onOpen }: { plan: string | null; calls: CallSummary[]; film: FilmFile | null; onOpen: (n: number) => void }) {
  const shape = useMemo<PlanShape | null>(() => {
    if (!plan) return null;
    try {
      return JSON.parse(plan) as PlanShape;
    } catch {
      return null;
    }
  }, [plan]);
  if (plan === null) return <p className="quiet">Loading…</p>;
  if (!shape?.steps?.length) return <p className="quiet">The plan is not finished yet, or was not kept, so its steps cannot be listed.</p>;
  const of = (stage: UsageStage, id: string) => calls.filter((c) => c.stage === stage && c.id === id);
  const onScreen = new Set(film?.scenes.map((scene) => scene.id) ?? []);
  return (
    <div className="table-wrap">
      <table className="calls steps">
        <thead>
          <tr>
            <th>Step</th>
            <th>What the voice says</th>
            <th>Pictures: drawn, then searched for parts</th>
            <th>Voice</th>
            <th>Timing</th>
            <th>Scene</th>
            <th>In the film</th>
          </tr>
        </thead>
        <tbody>
          {shape.steps.map((step) => {
            const id = step.id ?? "";
            return (
              <tr key={id}>
                <td>
                  <code>{id}</code>
                </td>
                <td className="said">{(step.narration ?? "").replace(/\[[^\]]*\]|<[^>]*>|\*/g, "").trim()}</td>
                <td>
                  <div className="pics">
                    {(step.screen ?? []).map((picture, at) => (
                      <span key={`${picture}-${at}`} className="pic">
                        <code>{picture}</code>
                        <CallChip calls={of("picture", picture)} label="drawn" onOpen={onOpen} />
                        {of("parts", picture).length > 0 && <CallChip calls={of("parts", picture)} label="parts" onOpen={onOpen} />}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <CallChip calls={of("voice", id)} onOpen={onOpen} />
                </td>
                <td>
                  <CallChip calls={of("timing", id)} onOpen={onOpen} />
                </td>
                <td>
                  <CallChip calls={of("scene", id)} onOpen={onOpen} />
                </td>
                <td>{onScreen.has(id) ? <span className="pill good">On screen</span> : <span className="pill">Not yet</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────────────────────────────
export function RunsPage({ run, onPick, onOpenInStudio }: { run: string | null; onPick: (run: string) => void; onOpenInStudio: (run: string) => void }) {
  const [films, setFilms] = useState<FilmRow[] | null>(null);
  const [film, setFilm] = useState<FilmFile | null>(null);
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [making, setMaking] = useState(false);
  /** Seconds the run has been going, while it is still being made. */
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [view, setView] = useState<"calls" | "steps" | "plan" | "log">("calls");
  const [stage, setStage] = useState<UsageStage | "all">("all");
  const [find, setFind] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [log, setLog] = useState<LogEvent[] | null>(null);

  const loadFilms = useCallback(() => void getJson<{ films: FilmRow[] }>("/api/films?all=1").then((got) => got && setFilms(got.films)), []);
  useEffect(() => {
    loadFilms();
    const timer = setInterval(loadFilms, 5000);
    return () => clearInterval(timer);
  }, [loadFilms]);

  // With no run chosen, show the newest.
  useEffect(() => {
    if (!run && films?.length) onPick(films[0].run);
  }, [run, films, onPick]);

  // The server says whether the run is still being made: it knows a run that stopped from one that is working.
  const live = making;
  useEffect(() => {
    if (!run) return;
    let alive = true;
    const load = () => {
      void getJson<FilmFile>(`/api/films/${run}`).then((got) => alive && setFilm(got));
      void getJson<{ calls: CallSummary[]; making: boolean; elapsed: number | null }>(`/api/films/${run}/calls`).then((got) => {
        if (!alive || !got) return;
        setCalls(got.calls);
        setMaking(got.making);
        setElapsed(got.elapsed);
      });
    };
    load();
    const timer = setInterval(() => (document.hidden ? undefined : load()), live ? 1500 : 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [run, live]);

  // A different run starts with a clean view.
  useEffect(() => {
    setOpen(null);
    setStage("all");
    setFind("");
    setPlan(null);
    setLog(null);
    setFilm(null);
    setCalls([]);
  }, [run]);

  useEffect(() => {
    if (!run) return;
    if (view === "plan" || view === "steps") void getJson<{ text: string }>(`/api/films/${run}/plan`).then((got) => setPlan(got?.text ?? ""));
    if (view === "log") void getJson<{ events: LogEvent[] }>(`/api/films/${run}/log`).then((got) => setLog(got?.events ?? []));
  }, [run, view, live && calls.length]);

  const byStage = useMemo(() => {
    const map = new Map<UsageStage, CallSummary[]>();
    for (const call of calls) map.set(call.stage, [...(map.get(call.stage) ?? []), call]);
    return map;
  }, [calls]);

  const totals = useMemo(() => {
    const sum = { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0, images: 0, cost: 0, unpriced: 0, end: 0, failed: 0, running: 0 };
    for (const call of calls) {
      sum.input += call.usage.input;
      sum.cached += call.usage.cached;
      sum.cacheWrite += call.usage.cacheWrite;
      sum.output += call.usage.output;
      sum.reasoning += call.usage.reasoning;
      sum.images += call.usage.images;
      if (call.cost === null) sum.unpriced += call.status === "ok" ? 1 : 0;
      else sum.cost += call.cost;
      sum.end = Math.max(sum.end, call.at + call.ms / 1000);
      if (call.status === "failed") sum.failed++;
      if (call.status === "running") sum.running++;
    }
    // A call still running has no length yet: while the run is live, the run's own clock says how far it has got.
    if (elapsed !== null) sum.end = Math.max(sum.end, elapsed);
    return sum;
  }, [calls, elapsed]);

  /** The run's length so far, for placing each call on a shared line of time. */
  const span = Math.max(1, totals.end);
  const shown = calls.filter((call) => (stage === "all" || call.stage === stage) && (!find.trim() || `${call.id} ${call.title} ${call.model}`.toLowerCase().includes(find.trim().toLowerCase())));
  const selected = films?.find((f) => f.run === run);
  const prettyPlan = useMemo(() => {
    if (!plan) return plan;
    try {
      return JSON.stringify(JSON.parse(plan), null, 2);
    } catch {
      return plan;
    }
  }, [plan]);

  return (
    <div className="observe">
      <aside className="run-list" aria-label="Films">
        <h2>Runs</h2>
        {films === null && <p className="quiet">Loading…</p>}
        {films?.length === 0 && <p className="quiet">No film has been made yet. Make one in the Studio and its record appears here.</p>}
        {films?.map((item) => (
          <button key={item.run} type="button" className={`run-item${item.run === run ? " on" : ""}`} onClick={() => onPick(item.run)}>
            <span className="thumb">{item.poster ? <img src={item.poster} alt="" loading="lazy" /> : null}</span>
            <span className="run-text">
              <strong>{item.title}</strong>
              <small>
                {startedOf(item.run)} · {item.scenes} scenes{item.cost !== null ? ` · ${money(item.cost)}` : ""}
              </small>
            </span>
            {(item.making || item.status === "generating") && <span className="dot live" aria-label="Being made" />}
            {item.status === "failed" && <span className="dot bad" aria-label="Failed" />}
          </button>
        ))}
      </aside>

      <main className="run">
        {!run || !selected ? (
          films !== null && <p className="quiet empty">Choose a run on the left.</p>
        ) : (
          <>
            <header className="run-head">
              <div>
                <h1>{selected.title}</h1>
                <p className="quiet">
                  “{selected.brief}” · started {startedOf(run)} · <code>{run}</code>
                </p>
              </div>
              <span className="grow" />
              <Status status={live ? "running" : selected.status} />
              <button type="button" className="ghost" onClick={() => onOpenInStudio(run)}>
                Watch the film
              </button>
            </header>

            {film?.made && (
              <p className="made">
                <span>
                  Prompts <code>{film.made.prompts}</code>
                </span>
                {film.made.edited?.length ? <span className="pill warn">Rewritten: {film.made.edited.join(", ")}</span> : <span className="pill">Default prompts</span>}
                {film.made.skills.length > 0 && <span>Skill: {film.made.skills.join(", ")}</span>}
                <span>Provider: {film.provider}</span>
              </p>
            )}

            {calls.length === 0 ? (
              <p className="notice">{live ? "The run has started. Its first call will appear here in a moment." : "This film was made before model calls were recorded, so only its log and its plan are kept. Films made from now on record every call."}</p>
            ) : (
              <>
                <div className="tiles">
                  <Tile label="Model calls" value={count(calls.length)} hint={[totals.running ? `${totals.running} running` : "", totals.failed ? `${totals.failed} failed` : ""].filter(Boolean).join(" · ") || undefined} />
                  <Tile label="Input tokens" value={count(totals.input)} />
                  <Tile label="Read from cache" value={count(totals.cached)} hint={totals.input ? `${Math.round((totals.cached / totals.input) * 100)}% of input` : undefined} />
                  <Tile label="Written to cache" value={count(totals.cacheWrite)} />
                  <Tile label="Output tokens" value={count(totals.output)} hint={totals.reasoning ? `${count(totals.reasoning)} reasoning` : undefined} />
                  <Tile label="Pictures drawn" value={count(totals.images)} />
                  <Tile label="Estimated cost" value={money(totals.cost)} hint={totals.unpriced ? `${totals.unpriced} calls have no price` : "at list prices"} />
                  <Tile label={live ? "Running for" : "Took"} value={took(totals.end * 1000)} />
                </div>

                <ol className="pipeline" aria-label="Stages">
                  {STAGES.filter((s) => s.stage !== "warm-up" || byStage.has("warm-up")).map((s) => {
                    const list = byStage.get(s.stage) ?? [];
                    const running = list.filter((c) => c.status === "running").length;
                    const failed = list.filter((c) => c.status === "failed").length;
                    const done = list.filter((c) => c.status === "ok").length;
                    const cost = list.reduce((sum, c) => sum + (c.cost ?? 0), 0);
                    const tokens = list.reduce((sum, c) => sum + c.usage.input + c.usage.output, 0);
                    // Calls of this stage that could read the cache, and how many the provider says did.
                    const cacheable = s.stage === "plan" || s.stage === "scene" ? list.filter((c) => c.status === "ok") : [];
                    const hits = cacheable.filter((c) => c.usage.cached > 0).length;
                    const about = film?.made?.stages?.[s.stage];
                    const state = running ? "running" : list.length === 0 ? "idle" : failed && !done ? "failed" : "done";
                    return (
                      <li key={s.stage}>
                        <button type="button" className={`stage ${state}${stage === s.stage ? " on" : ""}`} onClick={() => setStage(stage === s.stage ? "all" : s.stage)} title={s.what} aria-pressed={stage === s.stage}>
                          <span className="stage-top">
                            <strong>{s.label}</strong>
                            {running > 0 && <span className="dot live" aria-hidden="true" />}
                          </span>
                          <span className="stage-model">
                            {list[0]?.model ?? about?.model ?? "—"}
                            {(list[0]?.effort ?? about?.effort) ? ` · ${list[0]?.effort ?? about?.effort}` : ""}
                          </span>
                          <span className="stage-count">
                            {list.length === 0 ? "not run" : [done ? `${done} done` : "", running ? `${running} running` : "", failed ? `${failed} failed` : ""].filter(Boolean).join(" · ")}
                          </span>
                          <span className="stage-cost">
                            {tokens > 0 ? `${count(tokens)} tokens · ` : ""}
                            {list.length ? money(cost) : ""}
                          </span>
                          {cacheable.length > 0 && (
                            <span className={`stage-cache ${hits === cacheable.length ? "good" : hits === 0 && !cacheable.some((c) => c.usage.cacheWrite > 0) ? "bad" : ""}`}>
                              Cache hit on {hits} of {cacheable.length}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}

            <nav className="tabs" aria-label="What to show">
              <button type="button" className={view === "calls" ? "on" : ""} onClick={() => setView("calls")}>
                Calls <span className="quiet">{calls.length}</span>
              </button>
              <button type="button" className={view === "steps" ? "on" : ""} onClick={() => setView("steps")}>
                Step by step
              </button>
              <button type="button" className={view === "plan" ? "on" : ""} onClick={() => setView("plan")}>
                The plan
              </button>
              <button type="button" className={view === "log" ? "on" : ""} onClick={() => setView("log")}>
                Log
              </button>
            </nav>

            {view === "calls" && calls.length > 0 && (
              <>
                <div className="filters">
                  <button type="button" className={`chip-b${stage === "all" ? " on" : ""}`} onClick={() => setStage("all")}>
                    All stages
                  </button>
                  {STAGES.filter((s) => byStage.has(s.stage)).map((s) => (
                    <button key={s.stage} type="button" className={`chip-b${stage === s.stage ? " on" : ""}`} onClick={() => setStage(s.stage)}>
                      {s.label} <span className="quiet">{byStage.get(s.stage)!.length}</span>
                    </button>
                  ))}
                  <span className="grow" />
                  <input type="search" placeholder="Find a step, picture or model" value={find} onChange={(event) => setFind(event.target.value)} aria-label="Find a call" />
                </div>
                <div className="table-wrap">
                  <table className="calls">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Stage</th>
                        <th>For</th>
                        <th>Model</th>
                        <th>Status</th>
                        <th>When</th>
                        <th className="num">Took</th>
                        <th className="num">Input</th>
                        <th>Cache</th>
                        <th className="num">Output</th>
                        <th className="num">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((call) => (
                        <tr key={call.n} className={open === call.n ? "on" : ""} onClick={() => setOpen(call.n)} tabIndex={0} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setOpen(call.n)}>
                          <td className="quiet">{call.n}</td>
                          <td>{labelOf(call.stage)}</td>
                          <td>
                            {call.id ? <code>{call.id}</code> : <span className="quiet">the film</span>}
                            {call.requests > 1 && <span className="quiet"> · {call.requests} requests</span>}
                          </td>
                          <td>
                            {call.model}
                            {call.effort && <span className="quiet"> · {call.effort}</span>}
                          </td>
                          <td>
                            <Status status={call.status} />
                          </td>
                          <td className="when" title={`Started ${clock(call.at)} into the run`}>
                            <span className="when-clock quiet">{clock(call.at)}</span>
                            {/* Where the call sits in the run, and how long it ran: calls side by side overlap here. */}
                            <span className="when-track" aria-hidden="true">
                              <span className={`when-bar ${call.status}`} style={{ left: `${(call.at / span) * 100}%`, width: `${Math.max(1.5, ((call.status === "running" ? Math.max(0, totals.end - call.at) : call.ms / 1000) / span) * 100)}%` }} />
                            </span>
                          </td>
                          <td className="num">{call.status === "running" ? "…" : took(call.ms)}</td>
                          <td className="num">{call.usage.input ? count(call.usage.input) : "—"}</td>
                          <td>
                            <CacheCell call={call} />
                          </td>
                          <td className="num">{call.usage.output ? count(call.usage.output) : "—"}</td>
                          <td className="num">{call.status === "ok" ? money(call.cost) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shown.length === 0 && <p className="quiet empty">No call matches.</p>}
                </div>
                <p className="quiet foot">
                  Choose a call to read everything that was sent to the model and everything it sent back.{" "}
                  <a className="link" href={`/film-runs/${run}/calls.jsonl`} download={`${run}-calls.jsonl`}>
                    Download every call of this run
                  </a>
                </p>
              </>
            )}

            {view === "steps" && <StepBoard plan={plan} calls={calls} film={film} onOpen={setOpen} />}

            {view === "plan" && (prettyPlan === null ? <p className="quiet">Loading…</p> : prettyPlan ? <TextBlock title="The plan, as the planner wrote it" text={prettyPlan} open /> : <p className="quiet">No plan was kept for this run.</p>)}

            {view === "log" &&
              (log === null ? (
                <p className="quiet">Loading…</p>
              ) : (
                <ol className="log">
                  {log
                    .filter((event) => event.stage !== "usage")
                    .map((event, i) => {
                      // An event without a sentence is a check's result: the parts found, a cut-out's cut, a scene's problems.
                      const { t, stage: at, status, text, id, index: _index, src: _src, ...rest } = event;
                      const problems = Array.isArray(rest.problems) ? (rest.problems as unknown[]) : null;
                      const bad = status === "failed" || status === "dropped" || Boolean(rest.error) || Boolean(problems?.length);
                      const what = text ? String(text) : problems ? (problems.length ? `The checker found ${problems.length} thing${problems.length === 1 ? "" : "s"} it could not play${rest.attempt === "retry" ? ` in the rewrite (${rest.kept ? "kept" : "not kept"})` : ""}` : "The rewrite passed the checker") : rest.found ? "What the part finder answered" : rest.cut ? "How the cut-out was cut" : rest.error ? String(rest.error) : rest.chars ? `A reply of ${count(Number(rest.chars))} characters arrived` : "";
                      const detail = text ? null : problems?.length ? problems.map(String).join("\n") : rest.found ? JSON.stringify(rest.found) : rest.cut ? JSON.stringify(rest.cut) : null;
                      return (
                        <li key={i} className={bad ? "bad" : ""}>
                          <span className="quiet">{clock(Number(t ?? 0))}</span>
                          <span className="log-stage">{String(at ?? "")}</span>
                          <span className="log-status">{String(status ?? rest.attempt ?? "")}</span>
                          <span>
                            {id && !String(what).includes(String(id)) ? <code>{String(id)}</code> : null} {what}
                            {detail && <pre className="log-detail">{detail}</pre>}
                          </span>
                        </li>
                      );
                    })}
                </ol>
              ))}
          </>
        )}
      </main>

      {run && open !== null && <CallDetail run={run} n={open} onClose={() => setOpen(null)} live={calls.find((c) => c.n === open)?.status === "running"} />}
    </div>
  );
}
