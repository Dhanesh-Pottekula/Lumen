import { CanvasSlide } from "./components/CanvasSlide";
import { composeSlides } from "./slides/compose";
import { coimbatoreCottonSlide } from "./slides/coimbatoreCotton";
import { coimbatoreFinaleSlide } from "./slides/coimbatoreFinale";
import { coimbatoreGeographySlide } from "./slides/coimbatoreGeography";
import { coimbatoreMachinesSlide } from "./slides/coimbatoreMachines";
import { coimbatoreMillsSlide } from "./slides/coimbatoreMills";
import { coimbatoreRomanTradeSlide } from "./slides/coimbatoreRomanTrade";

const coimbatoreLesson = composeSlides([
  coimbatoreGeographySlide,
  coimbatoreRomanTradeSlide,
  coimbatoreCottonSlide,
  coimbatoreMillsSlide,
  coimbatoreMachinesSlide,
  coimbatoreFinaleSlide,
]);

export default function App() {
  return (
    <main>
      <h1>The story of Coimbatore — a generated tutorial</h1>
      <p className="sub">
        Six standalone scenes composed into one continuous lesson by composeSlides(): geography, Roman
        trade, cotton, mills, machines, and the finale recap, stitched onto a single timeline with
        crossfades. The scrubber stands in for the narration audio clock.
      </p>

      <CanvasSlide
        slide={coimbatoreLesson}
        title={<>★ The Coimbatore lesson — six scenes, one timeline</>}
        tag={
          <>
            <b className="good">The composed film.</b> Scrub anywhere — scene crossfades and captions are
            all pure functions of t. Watch the scene dots at the bottom.
          </>
        }
        notes={[
          "Scenes crossfade over 2.5 s at each boundary.",
          "Captions hand off to the incoming scene during each crossfade.",
          "Progress dots: amber = playing, teal = finished, gray = upcoming.",
        ]}
      />
    </main>
  );
}
