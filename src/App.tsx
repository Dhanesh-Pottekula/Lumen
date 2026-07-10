import { CanvasSlide } from "./components/CanvasSlide";
import { composeSlides } from "./slides/compose";
import { coimbatoreCottonSlide } from "./slides/coimbatoreCotton";
import { coimbatoreFinaleSlide } from "./slides/coimbatoreFinale";
import { coimbatoreGeographySlide } from "./slides/coimbatoreGeography";
import { coimbatoreMachinesSlide } from "./slides/coimbatoreMachines";
import { coimbatoreMillsSlide } from "./slides/coimbatoreMills";
import { coimbatoreRomanTradeSlide } from "./slides/coimbatoreRomanTrade";
import { photoCalvinCycleSlide } from "./slides/photoCalvinCycle";
import { photoChloroplastSlide } from "./slides/photoChloroplast";
import { photoEquationSlide } from "./slides/photoEquation";
import { photoFinaleSlide } from "./slides/photoFinale";
import { photoIntroSlide } from "./slides/photoIntro";
import { photoLeafCellSlide } from "./slides/photoLeafCell";
import { photoLightReactionsSlide } from "./slides/photoLightReactions";
import type { FilmTimings } from "./slides/timings";
import photosynthesisTimings from "./narration/photosynthesis.timings.json";
import { PHOTO_ASSET_URLS } from "./assets/photosynthesis";

const coimbatoreLesson = composeSlides([
  coimbatoreGeographySlide,
  coimbatoreRomanTradeSlide,
  coimbatoreCottonSlide,
  coimbatoreMillsSlide,
  coimbatoreMachinesSlide,
  coimbatoreFinaleSlide,
]);

const photosynthesisLesson = composeSlides(
  [
    photoIntroSlide,
    photoLeafCellSlide,
    photoChloroplastSlide,
    photoLightReactionsSlide,
    photoCalvinCycleSlide,
    photoEquationSlide,
    photoFinaleSlide,
  ],
  { timings: photosynthesisTimings as FilmTimings, filmGrade: true },
);

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

      <h1 style={{ marginTop: 56 }}>Photosynthesis — a cellular deep dive</h1>
      <p className="sub">
        Seven scenes composed the same way, zooming one level deeper each time: the whole leaf, into a
        cell, into a chloroplast, the light-dependent reactions, the Calvin cycle, the summary equation,
        and a recap. Turn the voice on and press play.
      </p>

      <CanvasSlide
        slide={photosynthesisLesson}
        audioSrc={photosynthesisTimings.audio}
        assetUrls={PHOTO_ASSET_URLS}
        title={<>★ How a leaf makes food — seven scenes, one timeline</>}
        tag={
          <>
            <b className="good">The science film.</b> Sunlight, air, and water become sugar — followed
            from the whole plant all the way down to the thylakoid membrane and back.
          </>
        }
        notes={[
          "Leaf → cell → chloroplast → light reactions → Calvin cycle → equation → recap.",
          "The film holds at each caption until the narration finishes the sentence.",
          "Seven progress dots: amber = playing, teal = finished, gray = upcoming.",
        ]}
      />
    </main>
  );
}
