import { CanvasSlide } from "./components/CanvasSlide";
import { coimbatoreCottonSlide } from "./slides/coimbatoreCotton";
import { coimbatoreGeographySlide } from "./slides/coimbatoreGeography";
import { coimbatoreMachinesSlide } from "./slides/coimbatoreMachines";
import { coimbatoreMillsSlide } from "./slides/coimbatoreMills";
import { coimbatoreRomanTradeSlide } from "./slides/coimbatoreRomanTrade";
import { coimbatoreStorySlide } from "./slides/coimbatoreStory";
import { crowdSlide } from "./slides/crowdSlide";
import { pendulumSlide } from "./slides/pendulumSlide";

export default function App() {
  return (
    <main>
      <h1>The story of Coimbatore — a generated tutorial</h1>
      <p className="sub">
        One continuous film: five chapters on a single 152-second timeline, with bridges connecting each story —
        a caravan gold piece becomes a Roman coin, the coins sink into the soil that grows the cotton, a thread
        pulls us into the mill era, and the turbine morphs into the pump. The scrubber stands in for the
        narration audio clock.
      </p>

      <CanvasSlide
        slide={coimbatoreStorySlide}
        title={<>★ The full film — five chapters, one timeline</>}
        tag={
          <>
            <b className="good">The single-video version.</b> Scrub anywhere in ~61 seconds — chapter fades,
            bridges, and morphs are all pure functions of t. Watch the chapter dots at the bottom.
          </>
        }
        notes={[
          "~12–14 s: a gold caravan dot arcs up and becomes the first Roman coin.",
          "~21–23 s: the coin hoard sinks as the black soil rises to become the cotton field.",
          "~32–35 s: one boll spins a thread that pulls the story into the mill era.",
          "~44–46 s: the spinning turbine wheel travels and morphs into the pump impeller.",
          "~56 s: the finale recaps the whole journey as a timeline strip.",
        ]}
      />

      <h1 style={{ fontSize: "1.1rem", marginTop: 48 }}>The chapters, individually</h1>
      <p className="sub">The same five stories as standalone slides.</p>

      <CanvasSlide
        slide={coimbatoreGeographySlide}
        title={<>1 · The gap in the mountains</>}
        tag={
          <>
            <b className="good">Geography first.</b> The Palghat Gap — the only break in 1,600 km of the Western
            Ghats — and the trade route that squeezed through it.
          </>
        }
      />

      <CanvasSlide
        slide={coimbatoreRomanTradeSlide}
        title={<>2 · Roman gold on the Noyyal</>}
        tag={
          <>
            <b className="good">Sangam-era trade.</b> Roman coin hoards, and the pepper, cotton, and beryl that
            paid for them.
          </>
        }
      />

      <CanvasSlide
        slide={coimbatoreCottonSlide}
        title={<>3 · Black soil, white gold</>}
        tag={
          <>
            <b className="good">The crop that set the identity.</b> Regur soil drinks the monsoon; cotton grows
            out of it.
          </>
        }
      />

      <CanvasSlide
        slide={coimbatoreMillsSlide}
        title={<>4 · Manchester of the South</>}
        tag={
          <>
            <b className="good">1932.</b> Pykara hydroelectric power meets a cotton belt — and the mills rise.
          </>
        }
      />

      <CanvasSlide
        slide={coimbatoreMachinesSlide}
        title={<>5 · The city that makes things</>}
        tag={
          <>
            <b className="good">Trade behaviour.</b> Thousands of small family firms — pumps, motors, castings,
            software — quiet capital, endlessly reinvested.
          </>
        }
      />

      <h1 style={{ fontSize: "1.1rem", marginTop: 48 }}>Earlier prototypes</h1>
      <p className="sub">The pendulum physics demo and the SVG-art-in-canvas crowd.</p>

      <CanvasSlide
        slide={pendulumSlide}
        title={
          <>
            Canvas — <code>renderFrame(t)</code> contract
          </>
        }
        tag={
          <>
            <b className="good">The contract demo.</b> Two pendulums, real physics, exact seeking.
          </>
        }
      />

      <CanvasSlide
        slide={crowdSlide}
        title={<>SVG art inside canvas — 10 wandering humans</>}
        tag={
          <>
            <b className="good">Both together.</b> Path2D figures + seeded deterministic wander.
          </>
        }
      />
    </main>
  );
}
