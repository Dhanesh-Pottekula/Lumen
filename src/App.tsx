import { FilmStudio } from "./components/FilmStudio";

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Lumen
        </div>
        <span className="tagline">Ask a question. Get a film.</span>
      </header>
      <FilmStudio />
    </>
  );
}
