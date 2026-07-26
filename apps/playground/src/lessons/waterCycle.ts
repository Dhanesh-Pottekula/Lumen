import type { LessonSpec } from "@aira/lumen";

const WATER_CYCLE =
  "<svg viewBox='0 0 360 190'>" +
  "<g id='sun' fill='#f6c453'><circle cx='55' cy='42' r='24'/></g>" +
  "<g id='water' fill='#4a9ae0'><path d='M0 142 Q90 126 180 142 T360 142 L360 190 L0 190 Z'/></g>" +
  "<g id='cloud' fill='#d9e6ed'><circle cx='244' cy='48' r='24'/><circle cx='275' cy='41' r='32'/><circle cx='308' cy='52' r='25'/><rect x='240' y='50' width='72' height='28' rx='14'/></g>" +
  "<g id='evaporation' fill='none' stroke='#e8894a' stroke-width='4' stroke-linecap='round'><path d='M92 136 C72 112 112 99 92 76'/><path d='M132 136 C112 112 152 99 132 76'/></g>" +
  "<g id='precipitation' stroke='#4a9ae0' stroke-width='4' stroke-linecap='round'><line x1='252' y1='84' x2='244' y2='112'/><line x1='278' y1='84' x2='270' y2='116'/><line x1='304' y1='84' x2='296' y2='110'/></g>" +
  "<g id='flow' fill='none' stroke='#5cc8ae' stroke-width='4' stroke-linecap='round'><path d='M322 124 Q336 102 330 84'/><path d='M324 88 L330 78 L338 88'/></g>" +
  "</svg>";

const EVAPORATION =
  "<svg viewBox='0 0 360 190'>" +
  "<g id='sun' fill='#f6c453'><circle cx='64' cy='42' r='28'/></g>" +
  "<g id='sunrays' stroke='#f6c453' stroke-width='4' stroke-linecap='round'><line x1='64' y1='4' x2='64' y2='0'/><line x1='30' y1='18' x2='20' y2='10'/><line x1='98' y1='18' x2='108' y2='10'/><line x1='25' y1='50' x2='10' y2='54'/><line x1='103' y1='50' x2='118' y2='54'/></g>" +
  "<g id='water' fill='#4a9ae0'><path d='M0 140 Q90 124 180 140 T360 140 L360 190 L0 190 Z'/></g>" +
  "<g id='water-molecules' fill='#8bd3dd'><circle cx='150' cy='130' r='7'/><circle cx='190' cy='132' r='7'/><circle cx='230' cy='128' r='7'/></g>" +
  "<g id='rising-water' fill='#8bd3dd'><circle cx='155' cy='102' r='6'/><circle cx='188' cy='88' r='6'/><circle cx='218' cy='66' r='6'/></g>" +
  "<g id='up-arrows' fill='none' stroke='#e8894a' stroke-width='4' stroke-linecap='round'><path d='M150 120 C140 98 162 88 154 68'/><path d='M210 118 C198 96 220 82 214 56'/><path d='M148 73 L154 64 L160 73'/><path d='M208 61 L214 52 L220 61'/></g>" +
  "</svg>";

const CONDENSATION =
  "<svg viewBox='0 0 360 190'>" +
  "<g id='warm-vapor' fill='#8bd3dd'><circle cx='70' cy='145' r='8'/><circle cx='105' cy='125' r='8'/><circle cx='140' cy='105' r='8'/><circle cx='175' cy='88' r='8'/></g>" +
  "<g id='cool-air' fill='#cfe2f3'><rect x='205' y='0' width='155' height='190'/></g>" +
  "<g id='temperature-boundary' stroke='#7fb7c8' stroke-width='3'><line x1='205' y1='12' x2='205' y2='178'/></g>" +
  "<g id='droplets' fill='#4a9ae0'><circle cx='236' cy='78' r='7'/><circle cx='260' cy='68' r='7'/><circle cx='286' cy='76' r='7'/><circle cx='250' cy='98' r='7'/><circle cx='277' cy='99' r='7'/></g>" +
  "<g id='cloud' fill='#d9e6ed'><circle cx='238' cy='112' r='25'/><circle cx='270' cy='104' r='33'/><circle cx='306' cy='115' r='27'/><rect x='236' y='112' width='76' height='28' rx='14'/></g>" +
  "<g id='movement' fill='none' stroke='#5cc8ae' stroke-width='4' stroke-linecap='round'><path d='M90 150 Q150 98 220 80'/><path d='M209 75 L222 79 L214 90'/></g>" +
  "</svg>";

const PRECIPITATION =
  "<svg viewBox='0 0 360 190'>" +
  "<g id='cloud' fill='#aebfca'><circle cx='120' cy='48' r='27'/><circle cx='156' cy='39' r='35'/><circle cx='194' cy='51' r='29'/><rect x='118' y='50' width='82' height='30' rx='15'/></g>" +
  "<g id='rain' stroke='#4a9ae0' stroke-width='5' stroke-linecap='round'><line x1='126' y1='90' x2='116' y2='126'/><line x1='154' y1='90' x2='144' y2='134'/><line x1='184' y1='90' x2='174' y2='124'/></g>" +
  "<g id='mountain' fill='#7d8a63'><path d='M155 165 L270 65 L360 165 Z'/></g>" +
  "<g id='snow' fill='#eef6fa'><path d='M238 93 L270 65 L301 99 L286 93 L275 104 L263 92 L250 101 Z'/></g>" +
  "<g id='runoff' fill='none' stroke='#5cc8ae' stroke-width='6' stroke-linecap='round'><path d='M270 110 C248 132 230 146 206 165 C170 176 112 174 60 165'/></g>" +
  "<g id='collection' fill='#4a9ae0'><path d='M0 164 Q90 148 180 164 T360 164 L360 190 L0 190 Z'/></g>" +
  "</svg>";

export const waterCycleLessonSpec: LessonSpec = {
  version: "1",
  title: "The Water Cycle",
  theme: "textbook",
  scenes: [
    {
      id: "cycle-overview",
      composition: "hero-diagram",
      narration:
        "Where does rain come from, and where does it go? Follow the same water as sunlight lifts it, clouds gather it, rain returns it, and rivers carry it back.",
      objects: [
        { id: "overview-title", kind: "text", text: "WATER MOVES IN A CYCLE", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "overview-diagram", kind: "svg-artwork", svg: WATER_CYCLE, size: "large", placement: { mode: "zone", zone: "main" } },
        { id: "overview-caption", kind: "text", text: "evaporation → condensation → precipitation → collection", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "overview-show", pace: "slow", actions: [{ do: "show", targets: ["overview-title", "overview-diagram"], entrance: "fade" }] },
        { id: "overview-label", actions: [{ do: "show", targets: ["overview-caption"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "evaporation",
      composition: "hero-diagram",
      narration:
        "Start at the surface. Sunlight transfers energy to liquid water. Some molecules move fast enough to escape upward as invisible water vapor. That change is evaporation.",
      objects: [
        { id: "evaporation-title", kind: "text", text: "1. EVAPORATION", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "evaporation-diagram", kind: "svg-artwork", svg: EVAPORATION, size: "large", placement: { mode: "zone", zone: "main" } },
        { id: "evaporation-caption", kind: "text", text: "sunlight adds energy • liquid water becomes vapor", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "evaporation-show", pace: "slow", actions: [{ do: "show", targets: ["evaporation-title", "evaporation-diagram"], entrance: "draw" }] },
        { id: "evaporation-label", actions: [{ do: "show", targets: ["evaporation-caption"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "condensation",
      composition: "hero-diagram",
      narration:
        "Higher air is cooler. As vapor rises and loses energy, water molecules crowd together into tiny liquid droplets. Many droplets together become a visible cloud. That is condensation.",
      objects: [
        { id: "condensation-title", kind: "text", text: "2. CONDENSATION", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "condensation-diagram", kind: "svg-artwork", svg: CONDENSATION, size: "large", placement: { mode: "zone", zone: "main" } },
        { id: "condensation-caption", kind: "text", text: "cooling vapor → tiny liquid droplets → cloud", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "condensation-show", pace: "slow", actions: [{ do: "show", targets: ["condensation-title", "condensation-diagram"], entrance: "fade" }] },
        { id: "condensation-label", actions: [{ do: "show", targets: ["condensation-caption"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "return",
      composition: "hero-diagram",
      narration:
        "Cloud droplets collide and grow. When they become too heavy to stay aloft, precipitation falls. Water then collects in soil, rivers, lakes, and oceans, ready for sunlight to begin the cycle again.",
      objects: [
        { id: "return-title", kind: "text", text: "3. RETURN AND COLLECT", textRole: "heading", placement: { mode: "zone", zone: "title" } },
        { id: "return-diagram", kind: "svg-artwork", svg: PRECIPITATION, size: "large", placement: { mode: "zone", zone: "main" } },
        { id: "return-caption", kind: "text", text: "droplets grow → rain falls → water collects and flows", textRole: "caption", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "return-show", pace: "slow", actions: [{ do: "show", targets: ["return-title", "return-diagram"], entrance: "draw" }] },
        { id: "return-label", actions: [{ do: "show", targets: ["return-caption"], entrance: "word-by-word" }] },
      ],
    },
  ],
};
