import type { LessonSpec, ObjectSpec } from "@aira/lumen";

/**
 * Storytelling — "The Tortoise and the Hare". Authored ONE-SHOT from the visual script
 * (docs/skills/scripts/tortoise-and-hare.md). Movement is the point: characters cross the frame with
 * `motion: move` toward a visible destination (usually the oak at the finish), speed set by the beat's
 * pace — the Hare on `quick` beats (dashes), the Tortoise on `slow`/`dramatic` beats (a patient plod).
 * `orbit` for the show-off loop, `spin` for the look-back, `emphasize` for boasting/panic/bobbing, and
 * particle dust/confetti + a camera push at the finish. Dialogue is a `label` speech bubble on a character.
 */

// Reusable characters/props (flat fills; every drawn child in a named <g>).
const HARE =
  "<svg viewBox='0 0 100 100'><g id='hare'><ellipse cx='44' cy='66' rx='30' ry='19' fill='#e08a4a'/><circle cx='70' cy='52' r='15' fill='#e08a4a'/><ellipse cx='64' cy='24' rx='5' ry='18' fill='#e08a4a'/><ellipse cx='76' cy='26' rx='5' ry='17' fill='#e08a4a'/><ellipse cx='64' cy='26' rx='2' ry='12' fill='#f2c9a8'/><circle cx='16' cy='64' r='8' fill='#f2ded0'/><ellipse cx='26' cy='80' rx='11' ry='6' fill='#c9743a'/><circle cx='75' cy='49' r='2.5' fill='#2a2a2a'/><circle cx='82' cy='55' r='2.5' fill='#c05a4a'/></g></svg>";

const TORTOISE =
  "<svg viewBox='0 0 100 100'><g id='tortoise'><ellipse cx='20' cy='70' rx='7' ry='4' fill='#4f8a3f'/><ellipse cx='40' cy='80' rx='7' ry='4' fill='#4f8a3f'/><ellipse cx='64' cy='80' rx='7' ry='4' fill='#4f8a3f'/><ellipse cx='50' cy='58' rx='34' ry='22' fill='#4f8a3f'/><ellipse cx='50' cy='53' rx='26' ry='15' fill='#6fae5f'/><ellipse cx='50' cy='53' rx='14' ry='8' fill='#8ac47a'/><circle cx='84' cy='58' r='9' fill='#7fae6f'/><circle cx='87' cy='56' r='2.2' fill='#2a2a2a'/></g></svg>";

const SUN = "<svg viewBox='0 0 100 100'><g id='sun'><circle cx='50' cy='50' r='24' fill='#f2c24a'/></g></svg>";

const TREE =
  "<svg viewBox='0 0 100 120'><g id='tree'><rect x='45' y='66' width='12' height='46' fill='#8a5a38'/><circle cx='50' cy='44' r='32' fill='#5f9e5f'/><circle cx='28' cy='56' r='20' fill='#6fae6f'/><circle cx='72' cy='56' r='20' fill='#6fae6f'/></g></svg>";

const OWL =
  "<svg viewBox='0 0 100 100'><g id='owl'><ellipse cx='50' cy='58' rx='22' ry='28' fill='#8a6a4a'/><circle cx='41' cy='44' r='9' fill='#f2efe6'/><circle cx='59' cy='44' r='9' fill='#f2efe6'/><circle cx='41' cy='44' r='3.5' fill='#2a2a2a'/><circle cx='59' cy='44' r='3.5' fill='#2a2a2a'/><polygon points='50,50 45,56 55,56' fill='#e0a84a'/></g></svg>";

const MEADOW =
  "<svg viewBox='0 0 320 120'><g id='ground'><rect x='0' y='64' width='320' height='56' fill='#8fbf6f'/></g><g id='tufts'><ellipse cx='40' cy='64' rx='14' ry='7' fill='#7cb35c'/><ellipse cx='150' cy='66' rx='16' ry='7' fill='#7cb35c'/><ellipse cx='260' cy='64' rx='14' ry='7' fill='#7cb35c'/></g></svg>";

const FINISH =
  "<svg viewBox='0 0 60 120'><g id='pole'><rect x='8' y='6' width='6' height='108' fill='#9a9a9a'/></g><g id='flag'><rect x='14' y='8' width='16' height='10' fill='#333'/><rect x='30' y='8' width='16' height='10' fill='#eee'/><rect x='14' y='18' width='16' height='10' fill='#eee'/><rect x='30' y='18' width='16' height='10' fill='#333'/></g></svg>";

const MEDAL =
  "<svg viewBox='0 0 60 100'><g id='ribbon'><polygon points='20,6 40,6 34,44 26,44' fill='#c0504a'/></g><g id='disc'><circle cx='30' cy='62' r='22' fill='#f2c24a'/><circle cx='30' cy='62' r='14' fill='#e0ad33'/></g></svg>";

const ZZZ =
  "<svg viewBox='0 0 80 80'><g id='z'><polygon points='10,58 34,58 34,64 20,64 34,44 10,44 10,38 30,38 16,58' fill='#7a8aa0'/><polygon points='40,40 58,40 58,45 48,45 58,28 40,28 40,23 55,23 45,40' fill='#8a9ab0'/></g></svg>";

const BASE: ObjectSpec[] = [
  { id: "meadow", kind: "svg-artwork", svg: MEADOW, size: "large", role: "background", placement: { mode: "zone", zone: "background" } },
  { id: "sun", kind: "svg-artwork", svg: SUN, size: "small", role: "support", placement: { mode: "zone", zone: "title" } },
];
const bg = (extra: ObjectSpec[] = []): ObjectSpec[] => [...BASE, ...extra];

export const tortoiseAndHareLessonSpec: LessonSpec = {
  version: "1",
  title: "The Tortoise and the Hare",
  theme: "parchment",
  scenes: [
    {
      id: "meet",
      composition: "split",
      narration:
        "Once upon a time, in a green and sunny meadow, there lived a hare who was very, very fast — and who knew it. In that same meadow lived a tortoise. Slow, steady, and in no hurry at all. And this is the story of the strangest race they ever ran.",
      objects: bg([
        { id: "title", kind: "text", text: "The Tortoise and the Hare", textRole: "title", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-left" } },
      ]),
      beats: [
        { id: "m-b1", actions: [{ do: "show", targets: ["meadow", "sun"], entrance: "fade" }] },
        { id: "m-b2", actions: [{ do: "show", targets: ["title"], entrance: "word-by-word" }] },
        { id: "m-b3", pace: "slow", actions: [{ do: "show", targets: ["tortoise"], entrance: "fade" }, { do: "emphasize", target: "tortoise", emphasis: "pulse" }] },
        { id: "m-b4", pace: "quick", actions: [{ do: "show", targets: ["hare"], entrance: "fade" }, { do: "motion", target: "hare", motion: "move", to: "tortoise", gait: "run" }] },
      ],
    },
    {
      id: "showoff",
      composition: "hero",
      narration:
        "The hare loved nothing more than showing off. He'd race around the tortoise in circles, just to prove how quick he was. 'Nobody in this whole meadow is faster than me!' he bragged. The tortoise just smiled, and took another slow step.",
      objects: bg([
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "relative", target: "tortoise", relation: "left-of" } },
      ]),
      beats: [
        { id: "s-b1", actions: [{ do: "show", targets: ["meadow", "sun", "tortoise", "hare"], entrance: "fade" }] },
        { id: "s-b2", pace: "quick", actions: [{ do: "motion", target: "hare", motion: "orbit", around: "tortoise", orbit: "medium", turns: "one" }] },
        { id: "s-b3", actions: [{ do: "label", target: "hare", text: "Nobody's faster than me!", style: "bubble" }, { do: "emphasize", target: "hare", emphasis: "pulse", strength: "strong" }] },
      ],
    },
    {
      id: "challenge",
      composition: "split",
      narration:
        "Then one day the tortoise said something no one expected. 'Let's have a race,' he said, 'to the old oak tree at the far end of the meadow.' The hare laughed so hard he nearly fell over. 'You? Race me? Oh, this is going to be easy.'",
      objects: bg([
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main-left" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-right" } },
      ]),
      beats: [
        { id: "c-b1", actions: [{ do: "show", targets: ["meadow", "sun", "tortoise", "hare"], entrance: "fade" }] },
        { id: "c-b2", actions: [{ do: "label", target: "tortoise", text: "Race me to the old oak tree.", style: "bubble" }, { do: "emphasize", target: "tortoise", emphasis: "pulse" }] },
        { id: "c-b3", pace: "slow", actions: [{ do: "label", target: "hare", text: "You? Ha! This'll be easy!", style: "bubble" }, { do: "emphasize", target: "hare", emphasis: "shake", strength: "strong" }] },
      ],
    },
    {
      id: "marks",
      composition: "split",
      narration:
        "So it was settled. They met at the starting line, with the old oak tree waiting far across the meadow. A wise old owl agreed to start the race, and the animals of the forest gathered to watch. Three… two… one… GO!",
      objects: bg([
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-left" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "relative", target: "hare", relation: "below" } },
        { id: "owl", kind: "svg-artwork", svg: OWL, size: "small", role: "annotation", placement: { mode: "zone", zone: "title" } },
        { id: "go", kind: "text", text: "3 · 2 · 1 · GO!", textRole: "heading", role: "hero", placement: { mode: "zone", zone: "overlay" } },
      ]),
      beats: [
        { id: "k-b1", actions: [{ do: "show", targets: ["meadow", "sun", "oak"], entrance: "fade" }] },
        { id: "k-b2", actions: [{ do: "show", targets: ["hare", "tortoise", "owl"], entrance: "fade" }, { do: "emphasize", target: "owl", emphasis: "pulse" }] },
        { id: "k-b3", pace: "dramatic", actions: [{ do: "show", targets: ["go"], entrance: "slam" }] },
        { id: "k-b4", actions: [{ do: "hide", targets: ["go"], exit: "fade" }] },
      ],
    },
    {
      id: "dash",
      composition: "split",
      narration:
        "The hare shot off the line like an arrow — a blur of fur and dust — and was halfway across the meadow before the tortoise had even finished his first step. But the tortoise wasn't worried. He just kept going. One slow step at a time.",
      objects: bg([
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-left" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "relative", target: "hare", relation: "below" } },
      ]),
      beats: [
        { id: "d-b1", actions: [{ do: "show", targets: ["meadow", "sun", "oak", "hare", "tortoise"], entrance: "fade" }] },
        { id: "d-b2", pace: "quick", actions: [{ do: "motion", target: "hare", motion: "move", to: "oak", gait: "run" }, { do: "effect", effect: "particles", target: "hare", preset: "dust", intensity: "strong" }] },
        { id: "d-b3", pace: "slow", actions: [{ do: "emphasize", target: "tortoise", emphasis: "pulse" }] },
      ],
    },
    {
      id: "lead",
      composition: "split",
      narration:
        "Soon the hare was so far ahead he could barely see the tortoise behind him — just a tiny green speck, crawling along. 'I'm miles ahead,' he thought, with a big yawn. 'There's plenty of time for a little nap. I'll still win easily.'",
      objects: bg([
        { id: "tree", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "relative", target: "tree", relation: "left-of" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "tiny", placement: { mode: "zone", zone: "main-left" } },
      ]),
      beats: [
        { id: "l-b1", actions: [{ do: "show", targets: ["meadow", "sun", "tree", "hare", "tortoise"], entrance: "fade" }] },
        { id: "l-b2", pace: "quick", actions: [{ do: "motion", target: "hare", motion: "spin", direction: "clockwise" }] },
        { id: "l-b3", actions: [{ do: "label", target: "hare", text: "Miles ahead… time for a nap.", style: "bubble" }, { do: "emphasize", target: "tortoise", emphasis: "pulse", strength: "subtle" }] },
      ],
    },
    {
      id: "nap",
      composition: "hero",
      narration:
        "He curled up in the cool shade of a tree, closed his eyes, and drifted off to sleep. And while he slept, time passed. The sun crept slowly across the sky — one hour, then two — and still the hare snored on, dreaming of his easy victory.",
      objects: bg([
        { id: "tree", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "relative", target: "tree", relation: "below" } },
        { id: "zzz", kind: "svg-artwork", svg: ZZZ, size: "tiny", role: "annotation", placement: { mode: "relative", target: "hare", relation: "above" } },
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "tiny", role: "support", placement: { mode: "zone", zone: "main-right" } },
      ]),
      beats: [
        { id: "n-b1", actions: [{ do: "show", targets: ["meadow", "sun", "tree", "oak", "hare"], entrance: "fade" }] },
        { id: "n-b2", actions: [{ do: "show", targets: ["zzz"], entrance: "word-by-word" }, { do: "emphasize", target: "hare", emphasis: "pulse", strength: "subtle" }] },
        { id: "n-b3", pace: "dramatic", actions: [{ do: "motion", target: "sun", motion: "move", to: "oak" }] },
      ],
    },
    {
      id: "overtake",
      composition: "split",
      narration:
        "But the tortoise never stopped. Slow and steady, step after step, he kept moving — up the meadow, past the flowers, and quietly, without a sound, right past the sleeping hare. He didn't slow down to gloat. He just kept going, all the way toward the oak tree.",
      objects: bg([
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "sleeptree", kind: "svg-artwork", svg: TREE, size: "small", role: "support", placement: { mode: "zone", zone: "main" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "tiny", placement: { mode: "relative", target: "sleeptree", relation: "below" } },
        { id: "zzz", kind: "svg-artwork", svg: ZZZ, size: "tiny", role: "annotation", placement: { mode: "relative", target: "hare", relation: "above" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main-left" } },
      ]),
      beats: [
        { id: "o-b1", actions: [{ do: "show", targets: ["meadow", "sun", "oak", "sleeptree", "hare", "zzz"], entrance: "fade" }] },
        { id: "o-b2", pace: "slow", actions: [{ do: "show", targets: ["tortoise"], entrance: "fade" }, { do: "motion", target: "tortoise", motion: "move", to: "oak", gait: "walk" }] },
      ],
    },
    {
      id: "nearly",
      composition: "hero-diagram",
      narration:
        "The crowd by the oak tree could hardly believe their eyes. The slow, steady tortoise was almost at the finish line! 'Go, tortoise, go!' they cheered. And the tortoise, step by patient step, kept coming.",
      objects: bg([
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "finish", kind: "svg-artwork", svg: FINISH, size: "small", role: "support", placement: { mode: "relative", target: "oak", relation: "left-of" } },
        { id: "owl", kind: "svg-artwork", svg: OWL, size: "tiny", role: "annotation", placement: { mode: "relative", target: "oak", relation: "above" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main-left" } },
      ]),
      beats: [
        { id: "y-b1", actions: [{ do: "show", targets: ["meadow", "sun", "oak", "finish", "owl", "tortoise"], entrance: "fade" }] },
        { id: "y-b2", actions: [{ do: "camera", target: "finish", shot: "close", movement: "push" }] },
        { id: "y-b3", pace: "normal", actions: [{ do: "motion", target: "tortoise", motion: "move", to: "finish", gait: "walk" }, { do: "label", target: "owl", text: "Go, tortoise, go!", style: "bubble" }] },
      ],
    },
    {
      id: "panic",
      composition: "split",
      narration:
        "Suddenly, the hare woke up! The sun was low in the sky. Hours had passed! He looked up the meadow and his heart nearly stopped — the tortoise was almost at the oak tree! The hare leapt to his feet and ran faster than he'd ever run in his life.",
      objects: bg([
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-left" } },
      ]),
      beats: [
        { id: "p-b1", actions: [{ do: "show", targets: ["meadow", "sun", "oak", "hare"], entrance: "fade" }] },
        { id: "p-b2", actions: [{ do: "label", target: "hare", text: "Oh no — WHAT?!", style: "bubble" }, { do: "emphasize", target: "hare", emphasis: "shake", strength: "strong" }] },
        { id: "p-b3", pace: "quick", actions: [{ do: "motion", target: "hare", motion: "move", to: "oak", gait: "run" }, { do: "effect", effect: "particles", target: "hare", preset: "dust", intensity: "strong" }] },
      ],
    },
    {
      id: "win",
      composition: "hero",
      narration:
        "And the tortoise crossed the finish line. He had won the race! A heartbeat later the hare came skidding in — panting, exhausted, and far, far too late. The fastest animal in the meadow had lost to the slowest.",
      objects: bg([
        { id: "oak", kind: "svg-artwork", svg: TREE, size: "medium", placement: { mode: "zone", zone: "main-right" } },
        { id: "finish", kind: "svg-artwork", svg: FINISH, size: "small", role: "support", placement: { mode: "relative", target: "oak", relation: "left-of" } },
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main" } },
        { id: "medal", kind: "svg-artwork", svg: MEDAL, size: "tiny", role: "annotation", placement: { mode: "relative", target: "tortoise", relation: "above" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-left" } },
      ]),
      beats: [
        { id: "w-b1", actions: [{ do: "show", targets: ["meadow", "sun", "oak", "finish", "tortoise"], entrance: "fade" }] },
        { id: "w-b2", pace: "normal", actions: [{ do: "motion", target: "tortoise", motion: "move", to: "finish", gait: "walk" }] },
        { id: "w-b3", actions: [{ do: "show", targets: ["medal"], entrance: "slam" }, { do: "effect", effect: "particles", target: "tortoise", preset: "confetti", intensity: "strong" }] },
        { id: "w-b4", pace: "quick", actions: [{ do: "show", targets: ["hare"], entrance: "fade" }, { do: "emphasize", target: "hare", emphasis: "shake" }] },
      ],
    },
    {
      id: "moral",
      composition: "hero",
      narration:
        "The hare learned something that day that he never forgot. It isn't always the fastest who wins. It's the one who keeps going, steadily, and never gives up. Slow and steady wins the race.",
      objects: bg([
        { id: "tortoise", kind: "svg-artwork", svg: TORTOISE, size: "small", placement: { mode: "zone", zone: "main-left" } },
        { id: "hare", kind: "svg-artwork", svg: HARE, size: "small", placement: { mode: "zone", zone: "main-right" } },
        { id: "moral", kind: "text", text: "Slow and steady wins the race.", textRole: "heading", role: "hero", placement: { mode: "zone", zone: "overlay" } },
      ]),
      beats: [
        { id: "r-b1", actions: [{ do: "show", targets: ["meadow", "sun", "tortoise", "hare"], entrance: "fade" }] },
        { id: "r-b2", actions: [{ do: "emphasize", target: "hare", emphasis: "wiggle" }, { do: "emphasize", target: "tortoise", emphasis: "pulse" }] },
        { id: "r-b3", pace: "dramatic", actions: [{ do: "show", targets: ["moral"], entrance: "word-by-word" }] },
      ],
    },
  ],
};
