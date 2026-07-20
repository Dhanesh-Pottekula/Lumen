import type { LessonSpec } from "../../simple-json";

/**
 * Science — "Why the Sky Is Blue (and Sunsets Red)". Authored ONE-SHOT from the visual script
 * (docs/skills/scripts/why-the-sky-is-blue.md) and SIMPLE-JSON-LLM-CONTEXT.md.
 * Anchor: a ray of sunlight and the sky it paints. One custom diagram + title + caption per scene, each
 * with its own spoken narration (scene-level `narration`) that rides the beats.
 * Every drawn SVG child sits in a named <g> so callouts can target it. Flat fills only (no gradients).
 */

// Palette: red #e0503a · orange #e8894a · yellow #f2c94c · green #6fbf7f · blue #4a9ae0 · violet #9b6fd0
// sky-blue #6fa8dc · light-sky #a9cdec · sun #ffcf4a · molecule #8aa0b0 · ground #5f7d46 · ink #33404a

const SKIES =
  "<svg viewBox='0 0 320 160'><g id='daysky' fill='#6fa8dc'><rect x='0' y='0' width='160' height='160'/><circle cx='40' cy='34' r='15' fill='#ffe89a'/></g><g id='sunsetsky'><rect x='160' y='0' width='160' height='110' fill='#e8894a'/><rect x='160' y='110' width='160' height='50' fill='#c85234'/><circle cx='238' cy='104' r='24' fill='#e04a2f'/></g><g id='divider'><line x1='160' y1='0' x2='160' y2='160' stroke='#ffffff' stroke-width='2'/></g></svg>";

const PRISM =
  "<svg viewBox='0 0 320 160'><g id='sun' fill='#ffcf4a'><circle cx='26' cy='80' r='16'/></g><g id='beam'><line x1='42' y1='80' x2='150' y2='80' stroke='#dfe8ef' stroke-width='6' stroke-linecap='round'/></g><g id='prism' fill='#bcd3dc'><polygon points='150,118 150,42 202,80'/></g><g id='spectrum' stroke-width='4' stroke-linecap='round'><line x1='196' y1='78' x2='306' y2='50' stroke='#e0503a'/><line x1='197' y1='79' x2='306' y2='62' stroke='#e8894a'/><line x1='198' y1='80' x2='306' y2='74' stroke='#f2c94c'/><line x1='198' y1='81' x2='306' y2='88' stroke='#6fbf7f'/><line x1='197' y1='82' x2='306' y2='102' stroke='#4a9ae0'/><line x1='196' y1='83' x2='306' y2='114' stroke='#9b6fd0'/></g></svg>";

const AIR =
  "<svg viewBox='0 0 320 170'><g id='molecules'><circle cx='30' cy='40' r='6' fill='#8aa0b0'/><circle cx='72' cy='28' r='5' fill='#9fb3c2'/><circle cx='112' cy='52' r='6' fill='#8aa0b0'/><circle cx='152' cy='34' r='5' fill='#9fb3c2'/><circle cx='192' cy='58' r='6' fill='#8aa0b0'/><circle cx='232' cy='40' r='5' fill='#9fb3c2'/><circle cx='272' cy='30' r='6' fill='#8aa0b0'/><circle cx='300' cy='58' r='5' fill='#9fb3c2'/><circle cx='50' cy='92' r='6' fill='#9fb3c2'/><circle cx='96' cy='100' r='5' fill='#8aa0b0'/><circle cx='140' cy='86' r='6' fill='#9fb3c2'/><circle cx='186' cy='104' r='5' fill='#8aa0b0'/><circle cx='226' cy='92' r='6' fill='#9fb3c2'/><circle cx='266' cy='86' r='5' fill='#8aa0b0'/><circle cx='300' cy='108' r='6' fill='#9fb3c2'/><circle cx='40' cy='142' r='5' fill='#8aa0b0'/><circle cx='86' cy='132' r='6' fill='#9fb3c2'/><circle cx='132' cy='150' r='5' fill='#8aa0b0'/><circle cx='178' cy='138' r='6' fill='#9fb3c2'/><circle cx='218' cy='150' r='5' fill='#8aa0b0'/><circle cx='258' cy='140' r='6' fill='#9fb3c2'/><circle cx='298' cy='146' r='5' fill='#8aa0b0'/></g></svg>";

const SCATTER =
  "<svg viewBox='0 0 320 170'><g id='molecule' fill='#8aa0b0'><circle cx='160' cy='86' r='14'/></g><g id='arrows' stroke='#4a9ae0' stroke-width='3' stroke-linecap='round'><line x1='160' y1='86' x2='212' y2='86'/><line x1='160' y1='86' x2='197' y2='49'/><line x1='160' y1='86' x2='160' y2='34'/><line x1='160' y1='86' x2='123' y2='49'/><line x1='160' y1='86' x2='123' y2='123'/><line x1='160' y1='86' x2='160' y2='138'/><line x1='160' y1='86' x2='197' y2='123'/></g><g id='inwave' fill='none' stroke='#f2c94c' stroke-width='3' stroke-linecap='round'><path d='M20 86 q9 -12 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0'/></g></svg>";

const WAVES =
  "<svg viewBox='0 0 320 150'><g id='field'><circle cx='44' cy='30' r='5' fill='#8aa0b0'/><circle cx='112' cy='26' r='5' fill='#9fb3c2'/><circle cx='184' cy='32' r='5' fill='#8aa0b0'/><circle cx='252' cy='28' r='5' fill='#9fb3c2'/><circle cx='66' cy='120' r='5' fill='#9fb3c2'/><circle cx='134' cy='122' r='5' fill='#8aa0b0'/><circle cx='202' cy='118' r='5' fill='#9fb3c2'/><circle cx='270' cy='120' r='5' fill='#8aa0b0'/></g><g id='redwave' fill='none' stroke='#e0503a' stroke-width='3' stroke-linecap='round'><path d='M8 46 q22 -14 44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0'/></g><g id='bluewave' fill='none' stroke='#4a9ae0' stroke-width='3' stroke-linecap='round'><path d='M8 98 q7 -10 14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 t14 0 q14 -6 24 -18 q8 -6 14 -14'/></g></svg>";

const DOME =
  "<svg viewBox='0 0 340 180'><g id='sky' fill='#a9cdec'><rect x='0' y='0' width='340' height='150'/></g><g id='sun' fill='#ffcf4a'><circle cx='306' cy='24' r='18'/></g><g id='beam' fill='#ffe89a' fill-opacity='0.28'><polygon points='306,24 300,10 150,150 214,150'/></g><g id='bluespray' stroke='#4a9ae0' stroke-width='2' stroke-linecap='round'><line x1='40' y1='40' x2='30' y2='58'/><line x1='90' y1='30' x2='96' y2='50'/><line x1='150' y1='44' x2='140' y2='62'/><line x1='210' y1='36' x2='220' y2='54'/><line x1='270' y1='50' x2='262' y2='68'/><line x1='60' y1='92' x2='52' y2='110'/><line x1='120' y1='86' x2='128' y2='104'/><line x1='180' y1='92' x2='172' y2='110'/><line x1='240' y1='84' x2='248' y2='102'/><line x1='100' y1='120' x2='94' y2='136'/><line x1='200' y1='118' x2='208' y2='134'/></g><g id='ground' fill='#7d8a63'><rect x='0' y='150' width='340' height='30'/></g><g id='observer' fill='#33404a'><circle cx='170' cy='148' r='6'/><rect x='167' y='150' width='6' height='20'/></g><g id='eyerays' stroke='#4a9ae0' stroke-width='1.5' stroke-opacity='0.7'><line x1='40' y1='40' x2='170' y2='150'/><line x1='120' y1='30' x2='170' y2='150'/><line x1='200' y1='36' x2='170' y2='150'/><line x1='280' y1='44' x2='170' y2='150'/><line x1='90' y1='92' x2='170' y2='150'/><line x1='250' y1='90' x2='170' y2='150'/></g></svg>";

const VIOLET_BAND =
  "<svg viewBox='0 0 320 150'><g id='spectrum'><rect x='34' y='64' width='44' height='34' fill='#e0503a'/><rect x='80' y='64' width='44' height='34' fill='#e8894a'/><rect x='126' y='64' width='44' height='34' fill='#f2c94c'/><rect x='172' y='64' width='44' height='34' fill='#6fbf7f'/><rect x='218' y='64' width='44' height='34' fill='#4a9ae0'/><rect x='264' y='64' width='44' height='34' fill='#9b6fd0'/></g><g id='violet'><rect x='262' y='50' width='48' height='62' fill='none' stroke='#9b6fd0' stroke-width='3'/></g></svg>";

const PATHS =
  "<svg viewBox='0 0 340 180'><g id='earth' fill='#5f7d46'><path d='M0 148 Q170 108 340 148 L340 180 L0 180 Z'/></g><g id='atmo' fill='#a9cdec' fill-opacity='0.45'><path d='M0 126 Q170 86 340 126 L340 150 Q170 112 0 150 Z'/></g><g id='observer2' fill='#33404a'><circle cx='170' cy='114' r='5'/><rect x='167' y='116' width='6' height='16'/></g><g id='daypath'><circle cx='170' cy='16' r='10' fill='#ffcf4a'/><line x1='170' y1='28' x2='170' y2='112' stroke='#f2c94c' stroke-width='3' stroke-linecap='round'/></g><g id='setpath'><circle cx='330' cy='118' r='12' fill='#e0663a'/><line x1='320' y1='118' x2='176' y2='117' stroke='#e0894a' stroke-width='3' stroke-linecap='round'/></g></svg>";

const SUNSET_RAY =
  "<svg viewBox='0 0 340 170'><g id='atmo' fill='#cfe1f0' fill-opacity='0.35'><rect x='0' y='44' width='340' height='86'/></g><g id='sun' fill='#e0663a'><circle cx='16' cy='90' r='14'/></g><g id='longray' stroke-width='4' stroke-linecap='round'><line x1='24' y1='90' x2='130' y2='90' stroke='#eef2f6'/><line x1='130' y1='90' x2='230' y2='90' stroke='#e8a24a'/><line x1='230' y1='90' x2='300' y2='90' stroke='#e0503a'/></g><g id='blueleak' stroke='#4a9ae0' stroke-width='2' stroke-linecap='round'><line x1='60' y1='88' x2='48' y2='64'/><line x1='90' y1='88' x2='80' y2='64'/><line x1='120' y1='88' x2='112' y2='66'/><line x1='150' y1='88' x2='142' y2='68'/></g><g id='observer3' fill='#33404a'><circle cx='312' cy='90' r='5'/><rect x='309' y='92' width='6' height='16'/></g></svg>";

const RECAP =
  "<svg viewBox='0 0 320 160'><g id='sun' fill='#ffcf4a'><circle cx='160' cy='80' r='24'/></g><g id='bluesky' fill='#6fa8dc'><rect x='24' y='52' width='72' height='58'/></g><g id='redsky' fill='#e0663a'><rect x='224' y='52' width='72' height='58'/></g><g id='arrows' fill='#6a7078' stroke='#6a7078' stroke-width='3'><line x1='132' y1='80' x2='100' y2='80'/><polygon points='100,80 112,74 112,86'/><line x1='188' y1='80' x2='220' y2='80'/><polygon points='220,80 208,74 208,86'/></g></svg>";

export const whySkyIsBlueLessonSpec: LessonSpec = {
  version: "1",
  title: "Why the Sky Is Blue",
  theme: "textbook",
  scenes: [
    {
      id: "hook",
      composition: "hero-diagram",
      narration:
        "Look up on a clear day, and the sky is blue — a deep, endless blue, everywhere you look. But watch that same sky at sunset, and it burns orange and red. Same sun. Same sky. So why do we see two completely different colors? The answer is hiding inside the light itself.",
      objects: [
        { id: "h-title", kind: "text", text: "Same sun — why two colors?", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "skies", kind: "svg-artwork", svg: SKIES, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "h-cap", kind: "text", text: "Blue by day, red at sunset — same sun.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "h-b1", actions: [{ do: "show", targets: ["h-title"], entrance: "fade" }] },
        { id: "h-b2", pace: "slow", actions: [{ do: "show", targets: ["skies"], entrance: "fade" }] },
        { id: "h-b3", actions: [{ do: "show", targets: ["h-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "whitelight",
      composition: "hero-diagram",
      narration:
        "Start with one ray of sunlight. It looks plain and white. But send it through a prism and it splits apart — because white light is really every color layered together. Long, lazy red waves at one end, and short, tight violet waves at the other. Hold onto that — red is long, blue and violet are short. It is about to matter.",
      objects: [
        { id: "p-title", kind: "text", text: "White light is every color", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "prism", kind: "svg-artwork", svg: PRISM, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "p-cap", kind: "text", text: "White light = every color. Red long, blue short.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "p-b1", actions: [{ do: "show", targets: ["p-title"], entrance: "fade" }] },
        { id: "p-b2", pace: "slow", actions: [{ do: "show", targets: ["prism"], entrance: "draw" }] },
        { id: "p-b3", actions: [{ do: "attention", target: "prism.spectrum", verb: "callout", title: "Every color", text: "hidden in white light", side: "south", route: "elbow", style: "pill" }] },
        { id: "p-b4", actions: [{ do: "show", targets: ["p-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "air",
      composition: "hero-diagram",
      narration:
        "Now, the air between you and space looks completely empty. It isn't. Zoom in far enough and it is packed — trillions of tiny molecules of nitrogen and oxygen, drifting everywhere. And sunlight can't reach your eyes without crashing straight through all of them.",
      objects: [
        { id: "a-title", kind: "text", text: "The air isn't empty", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "air", kind: "svg-artwork", svg: AIR, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "a-cap", kind: "text", text: "Air is packed with tiny molecules.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "a-b1", actions: [{ do: "show", targets: ["a-title"], entrance: "fade" }] },
        { id: "a-b2", pace: "slow", actions: [{ do: "show", targets: ["air"], entrance: "fade" }] },
        { id: "a-b3", actions: [{ do: "attention", target: "air.molecules", verb: "callout", title: "Nitrogen + oxygen", text: "trillions of them", side: "east", route: "elbow", style: "pill" }] },
        { id: "a-b4", actions: [{ do: "show", targets: ["a-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "scattering",
      composition: "hero-diagram",
      narration:
        "Here is the key moment — what happens when light meets one of those molecules. The molecule grabs the light for a split second, then flings it back out — in every direction at once. That spray of light has a name: scattering. This one idea explains the whole sky.",
      objects: [
        { id: "s-title", kind: "text", text: "Light scatters off molecules", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "scatter", kind: "svg-artwork", svg: SCATTER, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "s-cap", kind: "text", text: "Scattering: a molecule sprays light everywhere.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "s-b1", actions: [{ do: "show", targets: ["s-title"], entrance: "fade" }] },
        { id: "s-b2", pace: "slow", actions: [{ do: "show", targets: ["scatter"], entrance: "draw" }] },
        { id: "s-b3", actions: [{ do: "attention", target: "scatter.arrows", verb: "callout", title: "Scattering", text: "sprayed everywhere", side: "east", route: "elbow", style: "pill" }] },
        { id: "s-b4", actions: [{ do: "show", targets: ["s-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "bluemore",
      composition: "split",
      narration:
        "Send a long red wave into the crowd, and it mostly slips straight past — barely bothered. But a short blue wave slams into molecule after molecule and sprays off in every direction. The shorter the wave, the more it scatters — and not by a little. Blue scatters about four times as much as red.",
      objects: [
        { id: "b-title", kind: "text", text: "Blue scatters more than red", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "waves", kind: "svg-artwork", svg: WAVES, size: "small", placement: { mode: "zone", zone: "main-left" } },
        { id: "scatter-curve", kind: "chart", chart: "function", function: "1/x^4", xDomain: [0.6, 1.8], yDomain: [0, 8], axes: true, xLabel: "wavelength", yLabel: "scattering", size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "b-cap", kind: "text", text: "Short blue waves scatter far more than red.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "b-b1", actions: [{ do: "show", targets: ["b-title"], entrance: "fade" }] },
        { id: "b-b2", pace: "slow", actions: [{ do: "show", targets: ["waves"], entrance: "draw" }] },
        { id: "b-b3", pace: "slow", actions: [{ do: "show", targets: ["scatter-curve"], entrance: "draw" }] },
        { id: "b-b4", actions: [{ do: "attention", target: "waves.bluewave", verb: "callout", title: "About 4x more", text: "blue scatters most", side: "north", route: "elbow", style: "pill" }] },
        { id: "b-b5", actions: [{ do: "show", targets: ["b-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "bluesky",
      composition: "hero-diagram",
      narration:
        "Now pull all the way back. Sunlight pours across the sky, and all that blue scatters out of the beam and bounces around the whole dome above you. So when you look up — at any patch of sky — blue light is arriving from every direction at once. The entire sky glows blue. There is your daytime answer.",
      objects: [
        { id: "d-title", kind: "text", text: "Why the whole sky is blue", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "dome", kind: "svg-artwork", svg: DOME, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "d-cap", kind: "text", text: "Blue arrives from all directions — a blue sky.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "d-b1", actions: [{ do: "show", targets: ["d-title"], entrance: "fade" }] },
        { id: "d-b2", pace: "slow", actions: [{ do: "show", targets: ["dome"], entrance: "fade" }] },
        { id: "d-b3", actions: [{ do: "attention", target: "dome.bluespray", verb: "callout", title: "From everywhere", text: "blue fills the dome", side: "south", route: "elbow", style: "pill" }] },
        { id: "d-b4", actions: [{ do: "show", targets: ["d-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "violet",
      composition: "hero-diagram",
      narration:
        "Quick puzzle — violet waves are even shorter than blue, so they scatter even more. Shouldn't the sky be violet? Two reasons it isn't: the sun sends out less violet to begin with, and our eyes are far less sensitive to it. So the color that wins — the one that floods the sky — is blue.",
      objects: [
        { id: "v-title", kind: "text", text: "Then why not violet?", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "violet-band", kind: "svg-artwork", svg: VIOLET_BAND, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "v-cap", kind: "text", text: "Less violet from the sun; eyes weak to it, so blue wins.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "v-b1", actions: [{ do: "show", targets: ["v-title"], entrance: "fade" }] },
        { id: "v-b2", pace: "slow", actions: [{ do: "show", targets: ["violet-band"], entrance: "draw" }] },
        { id: "v-b3", actions: [{ do: "attention", target: "violet-band.violet", verb: "callout", title: "Even more!", text: "yet we still see blue", side: "north", route: "elbow", style: "pill" }] },
        { id: "v-b4", actions: [{ do: "show", targets: ["v-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "sunsetpath",
      composition: "hero-diagram",
      narration:
        "So why does sunset flip to red? It comes down to how far the light has to travel through the air. At noon the sun is overhead — a short, direct path straight down to you. But at sunset the sun sits right on the horizon, and its light skims sideways through a huge, long stretch of atmosphere before it ever reaches your eyes.",
      objects: [
        { id: "pa-title", kind: "text", text: "Sunset: a longer path", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "paths", kind: "svg-artwork", svg: PATHS, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "pa-cap", kind: "text", text: "At sunset, light crosses far more air.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "pa-b1", actions: [{ do: "show", targets: ["pa-title"], entrance: "fade" }] },
        { id: "pa-b2", pace: "slow", actions: [{ do: "show", targets: ["paths"], entrance: "draw" }] },
        { id: "pa-b3", actions: [{ do: "attention", target: "paths.setpath", verb: "callout", title: "Long path", text: "more air to cross", side: "north", route: "elbow", style: "pill" }] },
        { id: "pa-b4", actions: [{ do: "show", targets: ["pa-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "redleft",
      composition: "hero-diagram",
      narration:
        "Across that long journey, the blue scatters away long before it reaches you — bounced off into other parts of the sky. What is left to travel straight through is the long-wavelength light: orange and red. And so the setting sun, and the whole sky around it, blaze red. Same scattering as the noon sky — just a much longer path.",
      objects: [
        { id: "r-title", kind: "text", text: "Red is what's left", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "sunset-ray", kind: "svg-artwork", svg: SUNSET_RAY, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "r-cap", kind: "text", text: "Blue scattered away; red is what remains.", textRole: "body", role: "support", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "r-b1", actions: [{ do: "show", targets: ["r-title"], entrance: "fade" }] },
        { id: "r-b2", pace: "slow", actions: [{ do: "show", targets: ["sunset-ray"], entrance: "draw" }] },
        { id: "r-b3", actions: [{ do: "attention", target: "sunset-ray.blueleak", verb: "callout", title: "Blue leaks away", text: "scattered off", side: "north", route: "elbow", style: "pill" }] },
        { id: "r-b4", actions: [{ do: "show", targets: ["r-cap"], entrance: "word-by-word" }] },
      ],
    },
    {
      id: "recap",
      composition: "hero",
      narration:
        "So here is the whole picture. White sunlight, full of colors, meets a sky full of tiny molecules. By day, the short blue waves scatter across the entire dome — and you get a blue sky. At sunset, the light's long path scatters that blue away and leaves the red behind. One simple rule — small things scatter short waves the most — paints both the blue of noon and the red of evening.",
      objects: [
        { id: "rc-title", kind: "text", text: "One rule, two skies", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "recap", kind: "svg-artwork", svg: RECAP, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "rc-take", kind: "text", text: "One scattering rule paints both skies.", textRole: "body", role: "primary", size: "small", placement: { mode: "zone", zone: "footer" } },
      ],
      beats: [
        { id: "rc-b1", actions: [{ do: "show", targets: ["rc-title"], entrance: "fade" }] },
        { id: "rc-b2", pace: "slow", actions: [{ do: "show", targets: ["recap"], entrance: "fade" }] },
        { id: "rc-b3", pace: "dramatic", actions: [{ do: "show", targets: ["rc-take"], entrance: "word-by-word" }] },
      ],
    },
  ],
};
