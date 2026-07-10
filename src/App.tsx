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
  { filmGrade: true },
);

export default function App() {
  return (
    <main>
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


      <CanvasSlide
        slide={photosynthesisLesson}
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
          "Rich SVG art per scene, composited through bg/mid/fg/annotation layers.",
          "Seven progress dots: amber = playing, teal = finished, gray = upcoming.",
        ]}
      />
    </main>
  );
}
