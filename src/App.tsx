import { CanvasSlide } from "./components/CanvasSlide";
import { calloutDemoSlide } from "./slides/calloutDemo";
import { cameraDemoSlide } from "./slides/cameraDemo";
import { chartsDemoSlide } from "./slides/chartsDemo";
import { composeSlides } from "./slides/compose";
import { DOMAIN_SCENES } from "./slides/domainLesson";
import { timelineDemoSlide } from "./slides/timelineDemo";
import { focusDemoSlide } from "./slides/focusDemo";
import { geoDemoSlide } from "./slides/geoDemo";
import { iconsDemoSlide } from "./slides/iconsDemo";
import { mathDemoSlide } from "./slides/mathDemo";
import { morphDemoSlide } from "./slides/morphDemo";
import { particlesDemoSlide } from "./slides/particlesDemo";
import { revealDemoSlide } from "./slides/revealDemo";
import { sequenceDemoSlide } from "./slides/sequenceDemo";
import { storyboardDemoSlide } from "./slides/storyboardDemo";
import { strokesDemoSlide } from "./slides/strokesDemo";
import { typeMotionDemoSlide } from "./slides/typeMotionDemo";
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

const coimbatoreLesson = composeSlides(
  [
    coimbatoreGeographySlide,
    coimbatoreRomanTradeSlide,
    coimbatoreCottonSlide,
    coimbatoreMillsSlide,
    coimbatoreMachinesSlide,
    coimbatoreFinaleSlide,
  ],
  { filmGrade: true },
);

const domainLesson = composeSlides(DOMAIN_SCENES, { filmGrade: true, transition: "zoom-through" });

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

      <CanvasSlide
        slide={strokesDemoSlide}
        title={<>★ Step 04 — the draw-on stroke system</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Every mark is a self-drawing path built on one
            primitive — an arc-length window. Scrub anywhere; each verb is a pure function of t.
          </>
        }
        notes={[
          "drawOn · passingFlash · drawBorderThenFill · tracedPath · circumscribe · staggered sequence.",
          "Curves: Catmull-Rom smoothing; brush: variable-width taper.",
          "All deterministic and seekable — the spine for callouts, plots, maps, and math.",
        ]}
      />

      <CanvasSlide
        slide={revealDemoSlide}
        title={<>★ Step 05 — the reveal grammar</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Content enters by shape — wipes, irises, clock
            sweeps, blinds, checkerboards, dissolves — plus spotlight and blend modes. Scrub anywhere.
          </>
        }
        notes={[
          "One primitive: mask = shape(p); hard via clip(), soft via offscreen destination-in + blur.",
          "wipe · iris · radialWipe · blinds · checkerboard · dissolve · spotlight · withBlend.",
          "Unlocks fog-of-war (maps), focus spotlight, and transition variety.",
        ]}
      />

      <CanvasSlide
        slide={focusDemoSlide}
        title={<>★ Step 06 — attention direction</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Send the eye where it should look — spotlight/dim,
            rings, boxes, brackets, pointers, converging arrows, magnifier. Scrub anywhere.
          </>
        }
        notes={[
          "isolate (dim/spotlight) · mark (ring/box/brackets/flash) · point (arrow/bounce/converge).",
          "de-emphasize (ghost/desaturate) · magnify (loupe) · motion (wiggle/pulse) — all pure fns of t.",
          "Every complex scene can now guide the viewer; pairs with callouts (07) and maps (16).",
        ]}
      />

      <CanvasSlide
        slide={calloutDemoSlide}
        title={<>★ Step 07 — callouts &amp; leader lines</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Labels that point at things — containers, leader
            routing, endpoint &amp; subject markers, typewriter body. Themed &amp; seekable.
          </>
        }
        notes={[
          "Three toggleable sub-parts: subject marker · connector (leader) · note (box+text).",
          "pill/rect/tag/bubble/badge · straight/elbow/curve · dot/ring/arrow/crosshair · circle/bracket subject.",
          "Consistent labelling everywhere; pairs with attention (06); used by every domain kit.",
        ]}
      />

      <CanvasSlide
        slide={sequenceDemoSlide}
        title={<>★ Step 08 — engagement grammar</>}
        tag={
          <>
            <b className="good">Capability demo.</b> How a lesson is paced — progressive disclosure,
            predict-and-reveal, and emphasis (punch/shake/flash). Pure functions of t.
          </>
        }
        notes={[
          "build steps (current bright, prior dimmed) · predict→pause→reveal · punch/shake/flash beats.",
          "stepProgress · stepState · predictReveal · emphasis/beat · shakeOffset · flashAlpha · sequencer.",
          "Scenes reveal in narrated steps and land key moments; used by kinetic type, maps, worked examples.",
        ]}
      />

      <CanvasSlide
        slide={typeMotionDemoSlide}
        title={<>★ Step 09 — kinetic typography</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Text &amp; numbers as animated citizens — counters,
            date slams, word-by-word, scramble/decode, text-along-a-path. Themed &amp; seekable.
          </>
        }
        notes={[
          "counterValue/formatNumber (commas/currency/percent) · typewriter · word reveal (fade/rise/pop).",
          "drawSlam (impact) · drawScramble (decode) · drawTextAlongPath.",
          "Dramatic dates/numbers for history & data; pairs with charts (12) and timeline (13).",
        ]}
      />

      <CanvasSlide
        slide={particlesDemoSlide}
        title={<>★ Step 10 — particle system</>}
        tag={
          <>
            <b className="good">Capability demo.</b> One deterministic emitter — fire, smoke, sparks,
            energy, confetti, dust, rain, snow. Analytic (closed-form), so it scrubs exactly.
          </>
        }
        notes={[
          "origin shapes · angle/spread · gravity · wander · size/color-over-life · spin · shapes · blend · loop.",
          "particleAt (pure closed-form) + emit; presets fire/smoke/sparks/rain/snow/dust/confetti/energy.",
          "Electron/energy flows + battlefield smoke / monsoon rain / dust for maps & scenes.",
        ]}
      />

      <CanvasSlide
        slide={cameraDemoSlide}
        title={<>★ Step 11 — camera &amp; transitions</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Pan/zoom/rotate the whole world (log-zoom dolly),
            with depth-of-field and parallax; plus composer transitions (zoom-through/whip-pan).
          </>
        }
        notes={[
          "frame.setCamera(pan/zoom/rot) applied to all non-screenspace layers at composite; scenes draw normally.",
          "camera.ts: lerpCamera (log zoom) · pushIn · move · focusOn; bg blur = DOF, counter-offset = parallax.",
          "composeSlides transition: crossfade | zoom-through | whip-pan. Foundational for map region zooms (16).",
        ]}
      />

      <CanvasSlide
        slide={chartsDemoSlide}
        title={<>★ Step 12 — plots, charts &amp; counters</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Coordinate mapper + axes/grid, animated function
            plot, bar / line / area / scatter / pie — all data-bound and seekable.
          </>
        }
        notes={[
          "makePlot (data→pixel) · axes/niceTicks/grid · plotFunction (draw-on) · barChart (stagger).",
          "lineChart (+area +markers) · scatter · pie/donut (sweeping wedges) · formatted labels.",
          "Data for every subject; pairs with kinetic counters (09) and the timeline (13).",
        ]}
      />

      <CanvasSlide
        slide={timelineDemoSlide}
        title={<>★ Step 13 — timeline</>}
        tag={
          <>
            <b className="good">Capability demo.</b> A date axis with era bands, event markers on
            parallel tracks, and a sweeping playhead. Deterministic &amp; seekable.
          </>
        }
        notes={[
          "makeTimeline (date→x, tracks) · timelineAxis (draw-on + ticks) · eras (growing bands).",
          "events (staggered pins on tracks) · playhead (sweeping now-marker) · formatYear (BCE/CE).",
          "History eras and battle sequences; pairs with maps (16) and kinetic type (09).",
        ]}
      />

      <CanvasSlide
        slide={morphDemoSlide}
        title={<>★ Step 14 — shape morph</>}
        tag={
          <>
            <b className="good">Capability demo.</b> One form flows into another — resample to a common
            point count, align correspondence, interpolate. Circle → square → star → heart → triangle.
          </>
        }
        notes={[
          "resample (arc-length) · align (min-travel correspondence) · morph / drawMorph (fill+stroke).",
          "shape generators: circle/polygon/star/heart. Closed shapes or open paths.",
          "Reactant→product, border→border (maps 16), letter→letter; pairs with draw-on (04).",
        ]}
      />

      <CanvasSlide
        slide={iconsDemoSlide}
        title={<>★ Step 15 — iconography &amp; color semantics</>}
        tag={
          <>
            <b className="good">Capability demo.</b> A vector icon kit (30 glyphs, outline/filled, any
            size/color) + a color-semantics registry so each concept keeps one consistent color.
          </>
        }
        notes={[
          "drawIcon(name,x,y,size,{color,filled,width}) · 30 icons · pure paths (scale/theme/draw-on).",
          "colorSemantics(): colorFor(category) stable + cached · legend() auto-key with swatch/icon.",
          "Consistent visual language across a lesson; used by maps (16) and domain kits (18).",
        ]}
      />

      <CanvasSlide
        slide={geoDemoSlide}
        title={<>★ Step 16 — map / geo subsystem</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Projected regions with draw-on borders, city
            markers, flow arrows, borders-over-time (keyframe morph), and a camera region-zoom.
          </>
        }
        notes={[
          "fitProjection (lon/lat→view) · drawMap/drawFeature (border-then-fill) · borderAt (over-time morph).",
          "flowArrow (curved, draw-on + head) · geoMarker (icon pins) · featureCenter → camera zoom.",
          "Deterministic/offline (data passed in, no fetch); composes camera (11), morph (14), icons (15).",
        ]}
      />

      <CanvasSlide
        slide={mathDemoSlide}
        title={<>★ Step 17 — math typesetting</>}
        tag={
          <>
            <b className="good">Capability demo.</b> Canvas-native math — fractions, roots,
            super/subscripts, Greek &amp; operators. Equations fade in; one writes itself on.
          </>
        }
        notes={[
          "measureMath / drawMath(src,{size,color,align,p}) — LaTeX-subset parser + box layout.",
          "\\frac \\sqrt ^ _ + symbol dictionary (Greek, ∑ ∫ ∏ → ± ≤ …); deterministic, no fonts/DOM/fetch.",
          "Chemistry/physics/algebra display math; full LaTeX via a bundled-KaTeX→SVG-image path if ever needed.",
        ]}
      />

      <CanvasSlide
        slide={domainLesson}
        title={<>★ Step 18 — domain kit: the whole stack in one lesson</>}
        tag={
          <>
            <b className="good">Integration demo.</b> A 3-scene themed film — geo + camera + kinetic type
            + callouts + particles, then timeline/charts/counters, then math + confetti. Zoom-through cuts.
          </>
        }
        notes={[
          "Proves every primitive composes: layers/theme/grade (01–03), strokes/reveal/attention (04–06),",
          "callouts/engagement/type/particles (07–10), camera/charts/timeline/morph/icons/maps/math (11–17).",
          "This is the template an authored/generated lesson (19) targets.",
        ]}
      />

      <CanvasSlide
        slide={storyboardDemoSlide}
        title={<>★ Step 19 — authoring storyboard (lessons as data)</>}
        tag={
          <>
            <b className="good">The payoff.</b> This whole film is defined as a JSON-like storyboard —
            scenes of typed beats — compiled by the interpreter into a seekable film. The base for
            LLM-generated lessons.
          </>
        }
        notes={[
          "Beat kinds: text/math/counter/bars/line/pie/icon/callout/particles/ring/rect — each with {at,dur,layer}.",
          "storyboardFilm(story) → composeSlides; renderBeat maps each beat to a primitive (04–17).",
          "Emit JSON → get a film. Deterministic & seekable like every hand-authored scene.",
        ]}
      />
    </main>
  );
}
