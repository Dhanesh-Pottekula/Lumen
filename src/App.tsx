import { useCallback, useEffect, useState } from "react";

import { FilmStudio } from "./components/FilmStudio";
import { RunsPage } from "./components/RunsPage";
import { SettingsPage } from "./components/SettingsPage";

type Page = "studio" | "runs" | "settings";

/** Where the address says we are: #/runs/<run>, #/settings, or the studio. */
function placeOf(hash: string): { page: Page; run: string | null } {
  const [, page, run] = hash.replace(/^#/, "").split("/");
  if (page === "runs") return { page: "runs", run: run && /^[a-z0-9-]+$/.test(run) ? run : null };
  if (page === "settings") return { page: "settings", run: null };
  return { page: "studio", run: null };
}

export default function App() {
  const [place, setPlace] = useState(() => placeOf(window.location.hash));
  /** A film the studio was asked to open from another page. */
  const [wanted, setWanted] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setPlace(placeOf(window.location.hash));
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = useCallback((hash: string) => {
    if (window.location.hash !== hash) window.location.hash = hash;
    window.scrollTo({ top: 0 });
  }, []);
  const pickRun = useCallback((run: string) => go(`#/runs/${run}`), [go]);

  const tab = (page: Page, label: string, hash: string) => (
    <a href={hash} className={place.page === page ? "on" : ""} aria-current={place.page === page ? "page" : undefined}>
      {label}
    </a>
  );

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true" />
          Lumen
        </a>
        <nav className="pages" aria-label="Pages">
          {tab("studio", "Studio", "#/")}
          {tab("runs", "Runs", "#/runs")}
          {tab("settings", "Settings", "#/settings")}
        </nav>
        <span className="tagline">Ask a question. Get a film.</span>
      </header>
      {/* The studio stays alive behind the other pages, so a film being made or played is not lost by looking away. */}
      <div hidden={place.page !== "studio"}>
        <FilmStudio wanted={wanted} onInspect={pickRun} />
      </div>
      {place.page === "runs" && (
        <RunsPage
          run={place.run}
          onPick={pickRun}
          onOpenInStudio={(run) => {
            setWanted(run);
            go("#/");
          }}
        />
      )}
      {place.page === "settings" && <SettingsPage />}
    </>
  );
}
