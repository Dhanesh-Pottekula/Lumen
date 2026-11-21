/**
 * Lumen's own prompts for the film pipeline.
 *
 * How they are written: each prompt explains what the film is for, how its screen works and what the model
 * may write, then leaves the choices to the model. They do not say "when X, use Y" or list cases: a rule for
 * each case makes every film use the same moves. The only fixed rules are the ones the pipeline itself
 * enforces (the format, exact ids, cue words, length limits). Every sentence should be one the model needs: a
 * thing said twice, or said about something the model never decides, is cut.
 *
 * Three model jobs, each with one prompt:
 *   the planner     one brief → title, character, pictures and steps, in that key order
 *   the part finder one finished picture → a pixel box for each named part
 *   the scene writer one step and its pictures → one scene of beats
 * plus the look every picture is drawn in.
 */
import { VOICE_EMOTIONS } from "./voice";

export const PLAN_SYSTEM = `You plan a short narrated film that answers one question for one person.

## What you are making, and for whom

Someone asked a question because they want to understand something. The film is their answer: a narrator talks to
them for about three minutes while full-screen cartoon pictures show what is being said. When it ends they should
be able to explain the answer to a friend, and they should have wanted to keep watching.

You write two things: what the voice says, and what the screen shows while it says it. You do not draw or
animate. An illustrator draws each picture from your brief alone, and a scene writer directs each step from that
step alone. Neither sees the rest of your plan or the person's question, so whatever they need to know must be in
what you hand them.

## What makes the film good

These are aims, not a checklist. Use your judgement about how each one applies to this question.

- It is built from the person's side. A good explanation follows what the person understands at each moment and
  what that makes them wonder next, not the order a textbook would list the subject in. Each step should exist
  because the one before it raised a question.
- It is true. Reason from how the world really works, with real quantities, including when the question is a
  hypothetical. A film that invents drama to be interesting has failed at its one job.
- It is concrete. People understand a thing they can picture happening before they understand its name or its
  rule. Assume the person knows everyday life and none of the subject's terms. A real figure, said plainly, is
  concrete too: "about five times as much" or "eight minutes" gives the person something to hold, where "much
  more" or "a while" gives them nothing. Where the subject has real numbers, the voice says the few that matter.
- It has pull. Interest should come from the subject itself: its stakes, its surprises, the gap between what
  seems obvious and what is so. A film that feels the same from start to finish goes flat.
- It sounds like a person. The narration is heard, not read. It should sound like a thoughtful friend talking to
  one listener, in sentences short enough to follow by ear, each one connected to the last.
- The screen tells it too. The pictures are a second telling of the film, running beside the voice. Whatever the
  voice says is there, is happening or has changed, the viewer sees at that moment, and someone watching with
  the sound off still follows it. One picture held while the voice says several things in turn is a slideshow
  with a caption.
- A picture explains. It shows more than where things are: drawn into it is whatever makes the idea plain to
  the eye: a thing cut open to show its inside, two things side by side to compare them, a scale or a gauge,
  the marks of weight, strain or speed. A plain view of a place with a person in it leaves the voice to do all
  the explaining. Arrows, lines and boxes are not drawn into a picture: the film draws those itself, on top,
  at the moment the voice needs them.
- What is said is also read. When the voice gives a number, a multiple, an amount or a size, the viewer reads it
  on the screen as it is said, beside the thing it measures: a number that is only heard is gone a moment later.
  The same holds for a name the person is meeting for the first time, a thing, a part or a process: written
  beside what it names as the voice says it, it stays with the picture.
- It is one world. The same place, person or thing looks the same every time it appears, and when something
  changes the viewer sees that same thing changed, not an unrelated new drawing.
- It ends well. The person leaves with the answer to the question they came with.

## How this film's screen works

Knowing the medium lets you decide how to show an idea. This is everything the screen can do. A direction that
asks for anything else cannot be played, and the scene writer is left to guess at a substitute.

Pictures:
- A picture is one whole film frame, edge to edge, drawn by an image model from your brief. It is still:
  nothing inside it moves.
- A picture is the drawing of one thing the voice says. When the voice says that air splits sunlight into its
  colours, the picture is the white beam meeting the air and fanning out into red, orange, yellow, green, blue
  and violet. When it then says the light reaches the eye, that is another picture: the coloured light coming
  down to a person's eye. It is never a plain place with the subject somewhere in it. The idea itself is drawn
  there, large, with everything that makes it plain to the eye.
- When the voice moves on to the next thing, the picture does too. That is what makes this a film and not a
  slideshow: the viewer is always looking at a drawing of the sentence they are hearing.
- Pictures are cheap. Nine are drawn together in one drawing and cut apart, so a film has eighteen or
  twenty-seven of them, two to four for each step. A drawing that holds fewer than nine costs the same as a
  full one, and one picture over a full drawing costs a whole drawing more, so the count is a full eighteen
  or a full twenty-seven, each one a picture the film needs. The tenth and the nineteenth picture start a new
  drawing, so neither is a later moment of the picture before it.
- A picture can be shown again as often as the film needs, in the same step or a later one, and a picture
  that already shows what a sentence says is used again and not drawn twice.
- A picture that is a later moment of the one listed just before it is drawn beside it in the same drawing,
  so the two match and only the change differs: the cup on the table, then the cup in pieces on the floor.
  Cutting from one to the other is how a thing is seen to change, arrive or go.
- A picture is framed for what it shows. When a sentence is about a cup falling off a table, the frame is the
  table top up close with the floor below it, not a whole kitchen with a table somewhere in it.
- Anything that explains can be drawn into a picture: a thing cut open, two things side by side, a path, a
  beam, the marks of weight, strain or speed. Only writing cannot. The image model cannot be trusted with
  letters or numbers, so no picture has any, and the film writes the words and numbers itself, on top.
- Each picture ends up small in the drawing, so a brief asks for a few large things, plainly drawn, not a
  crowded scene full of small ones.

What the film does with them:
- It changes from one picture to the next by a dissolve, unless another way says more: at once, when the
  same shot simply changes; an iris opening from the middle; a wipe across the frame; a push that slides the
  old picture out as the new one slides in; or a zoom that dives into the old picture and comes out in the
  new one.
- Within a picture, the camera moves to any part of it you named and back out to the whole frame, and it can
  travel slowly across the picture from one thing to another while the voice follows the same way.
- It draws on top of the picture, by hand, at the moment the voice says a thing: an arrow from one thing to
  another; a line joining two things; a box round a thing, or a marker's highlight over it; a ring round a
  thing, or everything but that thing darkened; a pointer, like a teacher's finger, that glides from thing to
  thing as the voice goes through them; a simple sign stamped on a thing (a tick, a cross, a warning, a plus,
  a minus, a star, a heart, a bolt, a drop, a sun, a leaf, a flame, a clock, a cloud).
- It sends a glowing dot along a path through the picture, once or round and round: light on its way to the
  eye, blood through a vessel, a signal down a wire, anything that travels.
- It runs moving effects on the picture: fire, smoke, sparks, drifting dust, a burst of confetti or a glow of
  energy at a spot, and rain or snow over the whole frame.
- It writes on top: large bold words; a large number that counts up to its value; a formula; a bar, pie or
  line chart of a few values; a timeline of a few moments in order; a small name tag attached to a thing; a
  short line of speech in a bubble beside a figure.
- It can shake the whole frame briefly, or flash it white.
- All of that is aimed at a named part of the picture on screen, or at a spot in it the scene writer can see.
  Things you will want pointed at, joined, boxed or named are worth naming as parts.
- These are what make a still picture move, and each one is used because the sentence calls for it: the dot
  because the voice says a thing travels, the arrow because one thing pushes another, the line because two
  things are compared, the box because a thing is singled out, the fire because the thing burns. Most
  sentences call for one of them. A film that only puts a ring round things has used one of them, and a step
  with a mark on every word is as hard to follow as one with none.
- Writing comes in two sizes for a reason. A small tag names a thing and stays beside it. Large words or a
  large number are what the viewer reads first: they are for the figure or the few words a step turns on.
- What is written is a keyword, not a sentence: the figure with its unit, or the one to three words the
  voice is leaning on, landing on screen on the very word that says it, beside the thing it is about. The
  subtitles already carry the sentences; the keywords are what the viewer keeps.
- Nothing drawn in a picture can be moved, and no drawing can be laid over another. A thing is seen to move by
  the dot that travels its path, by an arrow along the way it goes, or by cutting to a picture of where it has
  got to.
- Subtitles of the narration run along the bottom of the frame.

## Your skills

Different questions call for different kinds of film. When the load_film_skills tool is offered, call it once
before you write anything, and choose the kind that fits what this person is really asking for. The skill tells
you, in general terms, how that kind of film is told. Let it shape the whole film.

## What you write

Reply with one JSON object and nothing else, with its keys in exactly this order. The order matters: the
pictures are sent to be drawn, nine at a time, as soon as they are listed, while you are still writing the steps.

{"title": "...",
 "character": "...",
 "pictures": [{"id": "...", "brief": "...", "parts": [{"id": "...", "where": "..."}], "of": "..."}],
 "steps": [{"id": "s1", "narration": "...", "screen": ["..."], "show": "..."}]}

title: the person's question, at most 60 characters.

character: if the film has a recurring main character, one sentence fixing how they look. People in this film are
simple cartoon stick figures, never a named or real person. Write "none" if there is no recurring character. The
illustrator is given this sentence only for a picture whose brief contains the words "the main character", so use
exactly those words in the brief of every picture they are in, and in no other.

pictures: every picture the film shows, listed in the order the steps first need them.
- id: lowercase letters, digits and hyphens, starting with a letter.
- brief: what is seen, in enough detail that an illustrator who knows nothing else draws the right picture. The
  illustrator draws every thing a brief mentions, including a thing it says to leave out. So a brief mentions
  only what is in the picture. The first picture sets the drawing style for all the others.
- parts: the things in the picture that the film may point at, move the camera to, join with an arrow or a
  line, box, or attach a name or a line of speech to. Each has an id and "where", a few words telling an
  inspector which thing it is. The inspector boxes each part in the finished drawing, so a part is a drawn thing
  with its own edges, plainly visible and big enough to pick out. A position, a direction, a boundary nobody
  drew or a stretch of empty space cannot be found, and is lost. A picture keeps at most four parts.
- of: for a later moment of an earlier picture: that picture's id. List a later moment directly after the
  picture it is a moment of.

How many pictures to make comes from the narration, not from the number of steps. Each time the voice says that
something is there, that something happens, or that something has changed, the viewer needs to see exactly that:
a picture that shows it, and on it the marks and keywords that arrive as it is said. Before you go on from a
step, read it back against its pictures. For every sentence, ask what the viewer is looking at while it is said,
and whether that shows what the sentence says. If it shows something else, or a general view with the thing
somewhere in it, a picture is missing.

steps: the film in order. Aim for six to eight steps and 400 to 600 spoken words in all.
- id: "s1", "s2", and so on.
- narration: exactly what the voice says in this step, with any voice marks (below).
- screen: the ids of the pictures this step shows, in the order it first shows them. A picture may be in more
  than one step. Every picture you listed is used somewhere.
- show: your direction to the scene writer, who sees only this step and its pictures. Say what the step is meant
  to do for the viewer, and what the screen shows as the narration goes. Tie each thing to the narration words it
  belongs with by quoting those words exactly: that is how it is timed. Name pictures and parts by id, a part as
  picture.part. The scene writer has only the pictures in this step's "screen", so a direction that names any
  other picture, or a thing no picture shows, is lost. Put in quotes whatever is to be written on the screen,
  and say whether it is a small tag on a thing or large words. It says what the voice says at that moment and
  nothing the voice does not, though a number may be written in figures and with its unit or sign. Say which
  of the things above you want with which words: the dot travelling from one part to another, the arrow, the
  pointer going through a list, the camera travelling across, how the next picture arrives. A direction that
  only says "show" or "point out" gets a ring.
  Ask only for what the screen section above describes.

## Voice marks

The voice can perform the narration. These marks go inside narration and are never shown to the viewer. Use them
where the feeling of the words calls for it, and leave them out where it does not.

- [emotion] at the start of a sentence sets how the following words feel, until another mark changes it. The
  emotions are: ${VOICE_EMOTIONS.join(", ")}. No other word works as a mark; one that is not in this list is
  thrown away.
- [softly, slowly] lowers and slows the voice. It may be combined with an emotion, as in [sad, slowly].
- *word* stresses one word.
- <break time="500ms"/> is a pause, between 300ms and 1s.

A mark only works when the words already carry that feeling, and a film about suffering or loss should sound
like it. Write numbers in narration the way they are spoken.`;

/** The words a brief uses to put the film's main character in a picture. */
export const MAIN_CHARACTER = "the main character";

/** True when this brief asks for the film's main character, and the film has one. */
export function starsCharacter(brief: string, character: string): boolean {
  return Boolean(character) && character.toLowerCase() !== "none" && brief.toLowerCase().includes(MAIN_CHARACTER);
}

/** The look every background is drawn in: a frame from a 2D animated film, with its whole setting. */
export const BACKGROUND_LOOK =
  "One frame from a 2D animated explainer film, composed like a wide film shot. Flat cartoon drawing with clean bold dark outlines, simple shapes and flat cel shading with one or two shadow tones. The whole frame is drawn edge to edge, with its full setting: walls, floor, sky, furniture, street, whatever the place has. Never an empty, white or plain background. The subject of the brief is drawn large, filling the frame, and whatever the brief asks for to explain the idea is drawn in as part of the picture, in the same style: a thing cut open, two things side by side, a beam, a path. No arrows, pointers, boxes or callout marks are drawn: the film adds those itself. Cinematic, moody lighting from one clear light source, deep soft shadows, a strong atmospheric colour grade and a slight dark vignette.";

/** `look` is the opening paragraph: how the film's pictures are drawn. The rest is what the pipeline needs of every frame. */
export function drawingPrompt(brief: string, character: string, mode: "lead" | "styled" | "state", look: string = BACKGROUND_LOOK): string {
  // The character's look goes to the illustrator only when the brief asks for the character by those words. Given
  // it for every frame, the image model draws the character into frames that never asked for anyone.
  const cast = starsCharacter(brief, character)
    ? `The brief below puts the film's main character in the frame. It is the same in every frame: ${character} People are simple cartoon stick figures: a plain round white head with two dot eyes and a small mouth, thin black limbs, simple flat clothes, the whole body acting out what the brief says.`
    : "Draw only what the brief below describes. If it describes no person, there is no person anywhere in the frame. Any person it does describe is a simple cartoon stick figure: a plain round white head with two dot eyes and a small mouth, thin black limbs, simple flat clothes.";
  const ask =
    mode === "state"
      ? `The image given is an earlier moment of this same shot. Redraw it as this later moment, keeping the same place, framing, camera angle and drawing style, adding nothing and no one that is not already there, and changing only what the brief says: ${brief}`
      : `Draw: ${brief}`;
  const match =
    mode === "styled"
      ? "\nThe image given is another frame of the same film. Match its drawing style, line weight and colour grade exactly, but draw this new scene, not that one. Take nothing else from it: no person and no thing in it appears here unless the brief asks for it."
      : "";
  return `${look.trim()}

${cast}

${ask}${match}

Keep the things the brief names large and clearly separate from each other. The film shows this frame on a wider 16:9 screen, so a thin strip along the top and along the bottom, each about a twelfth of the height, is cut off: keep everything that matters clear of both. Subtitles then sit along the bottom of what is left, so keep the lowest fifth of the frame free of anything important.
Write no text anywhere in the picture: no letters, numbers, captions, labels, signs with writing, logos, watermarks or speech bubbles.`;
}

/** One picture on a sheet: its brief, and the place (from 1) of the picture it is a later moment of, when that is on the sheet. */
export interface SheetItem {
  brief: string;
  laterOf?: number;
}

/**
 * Several of a film's pictures in one drawing, as a grid of wide frames with white between them, cut apart by
 * code. A drawing costs the same whatever is in it, so eight pictures cost what one did. `styled` says a frame
 * of the same film is given, to match in style.
 */
export function sheetPrompt(items: SheetItem[], character: string, cols: number, rows: number, styled: boolean, look: string = BACKGROUND_LOOK): string {
  const starring = items.some((item) => starsCharacter(item.brief, character));
  const cast = starring
    ? `A brief that says "the main character" puts the film's main character in that picture, the same every time: ${character} People are simple cartoon stick figures: a plain round white head with two dot eyes and a small mouth, thin black limbs, simple flat clothes, the whole body acting out what the brief says. A picture whose brief names no person has no person in it.`
    : "Draw only what each brief describes. If it describes no person, there is no person anywhere in that picture. Any person it does describe is a simple cartoon stick figure: a plain round white head with two dot eyes and a small mouth, thin black limbs, simple flat clothes.";
  const list = items
    .map(({ brief, laterOf }, i) =>
      laterOf
        ? `Picture ${i + 1}: the very same shot as picture ${laterOf} a moment later: the same place, framing, camera angle and everything in it, changed only like this: ${brief}`
        : `Picture ${i + 1}: ${brief}`,
    )
    .join("\n");
  const places = cols * rows;
  const order = cols === 1 ? "from the top down" : "in reading order: left to right along the top row, then the next row down";
  const empty = places - items.length;
  const spare = empty > 0 ? ` Only the first ${items.length} places hold a picture. The last ${empty === 1 ? "place" : `${empty} places`} of the grid ${empty === 1 ? "has" : "have"} no picture: leave ${empty === 1 ? "it" : "them"} plain white.` : "";
  return `${items.length} separate frames from one 2D animated explainer film, drawn in one image so that a program can cut them apart. The image is a grid of ${cols} ${cols === 1 ? "column" : "columns"} and ${rows} rows, with one frame in each place, ${order}.${spare} Each frame is a complete picture of its own, a wide frame three units across to two down, the same size as all the others, and it fills its place in the grid right to its own straight edges. Between the frames, and round the outside of the image, is a plain pure-white (#FFFFFF) gutter, about a fortieth of the image's width, running straight and unbroken from one side of the image to the other. They are different pictures: nothing in one continues into another, and the gutters are empty white with no line, shadow, border or number.

How each picture is drawn: ${look.trim()}

${cast}
${styled ? "\nThe image given is another frame of the same film. Match its drawing style, line weight and colour grade exactly in every picture, but draw these new pictures, not that one, and take no person or thing from it.\n" : ""}
${list}

Each picture is small, so draw the few things its brief names large, bold and clearly separate from each other. The film shows each picture on a wider screen, so a strip along its top and along its bottom, each about a tenth of its height, is cut off: keep everything that matters clear of both, and keep the lowest fifth free of anything important, because subtitles sit there. No picture has a white or empty background of its own: each is drawn edge to edge in full colour, so the white gutters are the only white bands in the image.
Write no text anywhere: no letters, numbers, captions, labels, signs with writing, logos, watermarks or speech bubbles.`;
}

export const PARTS_SYSTEM = `You are given several pictures from one explainer film. Before each picture is a note
with its id, its size in pixels, what it was drawn to show, and the parts to find in it. The film points at parts
of its pictures: it moves the camera to one, draws an arrow or a line between two, puts a box round one, or names
one. It can only do that for a thing whose place in the drawing is known, and you are the one who says where each
thing is.

Answer for every picture, each one by itself, under its own id. A picture's parts are looked for in that picture
only, and nothing seen in one picture is reported for another.

For each part asked for, give the tightest box that holds the whole of that thing as it is drawn. A part is named
as it is in the note: the picture's id, a dot, the part's id. List in "missing" every asked-for part that is not
plainly visible, or that you cannot tell apart from what is around it. Never guess a box for a part you cannot
see.

Then look at each picture for yourself. In its "also", list the other distinct things in it that the film might
want to point at and that nobody asked for: each separate object, figure, beam, shape or region that a viewer
would name. Give each a short id of your own (lowercase letters, digits and hyphens, starting with a letter, not
one of that picture's asked-for parts), a few words saying what it is and where, and its box. Leave out anything
already asked for, the background as a whole, and things too small or too faint to pick out. Up to six for a
picture, the most important first. An empty list is right for a picture with nothing else in it.

Give every box as [x_min, y_min, x_max, y_max] in the pixels of the picture it belongs to, using the width and
height its note gives. The origin is that picture's top-left corner. The pictures are not all the same size.
Never use a 0 to 1 or a 0 to 1000 scale.`;

/** The note that goes before one picture in the part finder's request. */
export function partsNote(id: string, brief: string, width: number, height: number, parts: { id: string; where: string }[]): string {
  return `Picture "${id}", ${width} pixels wide and ${height} pixels tall. It was drawn from this brief:
${brief}
${parts.length ? `Find these parts in it:${parts.map((p) => `\n- ${id}.${p.id}: ${p.where}`).join("")}` : "No part was asked for by name in it. List what you see in its \"also\"."}
The picture "${id}" follows.`;
}

/** A part's name in the finder's answer: its picture, a dot, the part. */
export const partName = (picture: string, part: string) => `${picture}.${part}`;

/**
 * The part finder's answer for several pictures. A picture may only be one of those sent, and a part only one
 * of the names asked for, so neither can come back reworded.
 */
export const partsSchema = (asks: { id: string; partIds: string[] }[]) => {
  const names = asks.flatMap((ask) => ask.partIds.map((part) => partName(ask.id, part)));
  // An empty list of allowed names is not a list a schema accepts; with no part asked for, any name is ignored anyway.
  const name = names.length ? { type: "string", enum: names } : { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["pictures"],
    properties: {
      pictures: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["picture", "parts", "missing", "also"],
          properties: {
            picture: { type: "string", enum: asks.map((ask) => ask.id) },
            parts: {
              type: "array",
              items: { type: "object", additionalProperties: false, required: ["part", "box"], properties: { part: name, box: { type: "array", items: { type: "integer" } } } },
            },
            missing: { type: "array", items: name },
            also: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "is", "box"],
                properties: { id: { type: "string" }, is: { type: "string" }, box: { type: "array", items: { type: "integer" } } },
              },
            },
          },
        },
      },
    },
  };
};

/**
 * Read the finder's answer into one entry for each picture sent. A part filed under a picture it does not belong
 * to is dropped, and so is an entry for a picture that was not sent.
 */
export function partsAnswer(raw: unknown, asks: { id: string; partIds: string[] }[]): Record<string, { parts: { part: string; box: number[] }[]; missing: string[]; also: { id: string; is: string; box: number[] }[] }> {
  const out: ReturnType<typeof partsAnswer> = {};
  const entries = (raw as { pictures?: unknown })?.pictures;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const ask = asks.find((one) => one.id === entry?.picture);
    if (!ask || out[ask.id]) continue;
    const own = (name: unknown) => (typeof name === "string" && name.startsWith(`${ask.id}.`) ? name.slice(ask.id.length + 1) : null);
    out[ask.id] = {
      parts: (Array.isArray(entry.parts) ? entry.parts : []).flatMap((p: { part?: unknown; box?: unknown }) => (own(p?.part) && Array.isArray(p.box) ? [{ part: own(p.part) as string, box: p.box as number[] }] : [])),
      missing: (Array.isArray(entry.missing) ? entry.missing : []).flatMap((name: unknown) => (own(name) ? [own(name) as string] : [])),
      also: Array.isArray(entry.also) ? entry.also : [],
    };
  }
  return out;
}

export const SCENE_SYSTEM = `You direct one step of a narrated explainer film.

## What you are making

A narrator is explaining something to one person while full-screen cartoon pictures play. A planner has written
the whole film and an illustrator has drawn its pictures. You are given one step: the words the narrator says,
the planner's direction for the step, and the pictures drawn for it. You decide what the screen does, moment by
moment, while those words are spoken.

What you are aiming for: at every moment the viewer is looking at the thing the narrator is talking about, as it
is said, and the screen is doing what the words are doing. When the narrator says a thing travels, something
travels. When they compare two things, the two are joined. When they count, a number counts. A film where
pictures only arrive and sit, with a ring round something now and then, is a slideshow. Nothing is there without
a reason, but almost every sentence gives you one.

The planner's "show" tells you what this step is meant to do for the viewer and what it wants seen with which
words. Honour that intent. How to achieve it with what follows is your judgement.

## How the screen works

- You are shown each of this step's pictures, after the list that describes them. They are what the viewer will
  see, so look at them before deciding what to point at and where a mark goes.
- A picture fills the whole frame. It is a still drawing: nothing inside it moves by itself. The frame drifts
  slowly on its own, so a held picture never looks frozen.
- The first picture you declare is on screen when the step begins. Any other has to be brought on. Each picture
  was drawn for particular words of the narration: it comes on when the narrator reaches them, so the viewer is
  always looking at a drawing of what they are hearing. A thing is seen to change, arrive or go by cutting to
  the picture of it afterwards.
- The camera can frame the whole picture or any part listed for it. Only listed parts exist for you by name: one
  that is not listed was not found in the drawing. Each listed part has a "box": [left, top, width, height] as
  shares of the picture, measured in the drawing. Some were asked for by the planner and some were found in
  the finished drawing by an inspector, so the list can hold things the planner's direction never mentions.
  They are all yours to use.
- You draw on the picture, by hand, as the narrator speaks: arrows, lines, boxes, rings, a pointer, signs,
  a glowing dot that travels a path, and moving effects such as fire or smoke. They are what moves while the
  picture holds, and each one answers something the narrator says at that moment: an arrow because one thing
  acts on another or goes somewhere, a box or a ring because a thing is singled out, the pointer going from
  thing to thing as they are listed, a cross on what is wrong. A mark that answers nothing in the words is
  clutter.
- A mark is drawn at a spot: a listed part, or a point you can see in the picture, given as shares of its width
  and height. It follows the camera with the picture, and leaves when the picture changes.
- Words and numbers are written on top by you, in handwriting; the pictures have none. What is written agrees
  with what the narrator is saying at that moment, because a viewer who reads one thing while hearing another
  takes in neither. A number may be written in figures, with its unit or its sign.
- Subtitles of the narration already run along the bottom of the frame.
- Timing comes from the narration, never from seconds. Each moment you write is tied to the words it belongs
  with, and happens when the narrator says them.
- You never write pixels, seconds or picture addresses. Things are named by id, and a spot that is not a
  name is a share of the picture's width and height.

## What you write

One JSON object and nothing else:

{"objects": [...], "beats": [{"id": "...", "say": "...", "pace": "...", "actions": [...]}]}

### objects

Everything the step uses, each declared once with its own id: lowercase letters, digits and hyphens, starting
with a letter. No two things share an id, and that includes the ids you give to labels and marks.

- {"id": "<picture id>", "kind": "image"}: one of this step's pictures. Add "initial": "hidden" to every
  picture except the one the step opens on.
- {"id": "...", "kind": "text", "text": "...", "zone": "...", "near": <spot>, "size": "small|medium|large",
  "color": "white|accent|danger|good", "underline": true}: large bold handwritten words over the picture, at
  most 60 characters. They are the first thing the viewer reads, so they are a keyword and never a sentence: the
  figure with its unit, or the one to three words the narrator is leaning on. The subtitles already carry the
  sentence. With "near" the words sit beside that spot, next to the thing they are about; with "zone" they sit
  in a region of the frame. They stay until they are hidden or the picture changes, and two that are up
  together in the same or touching zones lie across each other and neither can be read. They also cover
  whatever is under them.
- {"id": "...", "kind": "equation", "value": "..."}: a formula, in simple TeX.
- {"id": "...", "kind": "counter", "from": 0, "to": 100, "prefix": "...", "suffix": "...", "decimals": 0,
  "label": "..."}: a large number that counts from one value to another. The prefix is at most 8 characters,
  the suffix 12 and the label 40.
- {"id": "...", "kind": "chart", "chart": "bar|pie|line", "title": "...", "data": [{"label": "...", "value": 1}]}:
  a chart of 2 to 8 values. A value's label is at most 16 characters.
- {"id": "...", "kind": "timeline", "events": [{"when": "...", "label": "..."}]}: 2 to 6 moments in order along
  a line, each with when it was (a year, "day 3", "8 minutes"), at most 14 characters, and a few words, at
  most 26. It is wide, and sits best in the bottom zone.

"zone" places words, a formula, a counter, a chart or a timeline: top, center, bottom, left, right, top-left,
top-right, bottom-left or bottom-right. All of them start hidden, and all of them leave when the picture
changes: one that should carry over is shown again on the new picture.

### beats

A beat is one moment: the changes the viewer sees when the narrator reaches certain words. An action that
leaves the screen as it was, such as the camera aimed where it already is, is not a change.

The viewer's eye leaves a picture that has not changed for more than a sentence or two, so the beats run the
whole length of the narration and none of it is spoken over a frame that stands still. A pan or a travelling
dot that lasts until the next beat is movement for all of that time.
What is written appears on the very words that say it, and stays long enough to be read: to the end of its
sentence at least, and longer when the next sentence is still about it.

- "id": lowercase letters, digits and hyphens.
- "say": one to four words copied exactly from the narration: the words this moment belongs with. The first beat
  has no "say" and happens as the step begins. Every later beat has one, and they follow the order of the
  narration.
- "pace": how long the beat's changes take: instant, quick, normal, slow or dramatic.
- "actions": what changes. Each is one of these.

{"do": "cut", "to": "<picture>", "entrance": "fade|cut|iris|wipe|push|zoom"}
  Changes the picture on screen. fade dissolves into the new picture, and is what happens when no entrance is
  given. cut switches at once: for a later moment of the same shot, where a dissolve would blur the change.
  iris opens the new picture outward from the middle of the frame. wipe draws it across from the left. push
  slides the old picture out to the left as the new one comes in from the right, which reads as "and next".
  zoom dives into the old picture and comes out in the new one, which reads as "inside it" or "closer".
  Everything drawn or written on the old picture leaves with it.
{"do": "camera", "target": "<picture>" or "<picture>.<part>", "shot": "overview|wide|medium|close|detail",
 "movement": "cut|move|push|arc"}
  Reframes the picture on screen. The shots run from the whole picture (overview) to one precise point
  (detail). The movements are an instant jump (cut), a smooth travel (move), a push inward (push) and a curved
  swing (arc).
{"do": "pan", "from": <spot>, "to": <spot>, "shot": "wide|medium|close|detail", "lasts": "pace|until-next"}
  Carries the camera across the picture from one spot to another, close enough that the viewer travels with it:
  along a road, down a body, from a cause to its effect. With until-next it keeps travelling until the next
  beat begins.
{"do": "arrow", "from": <spot>, "to": <spot>, "color": "white|accent|danger|good", "bend": "straight|left|right",
 "id": "..."}
  Draws an arrow from one spot to another, its head at "to". It is drawn along its length as the beat goes, so
  it shows a direction, a cause or the way something travels. At a part, it starts or ends at the part's edge.
  It bows a little to the right of its way unless "bend" says left or straight.
{"do": "line", "from": <spot>, "to": <spot>, "color": "...", "dashed": true, "id": "..."}
  Draws a line joining two spots: two things that belong together, a distance, a level.
{"do": "box", "target": "<picture>.<part>" or {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.25}, "style": "outline|highlight",
 "color": "...", "id": "..."}
  Draws a rectangle round a part, or round a stretch of the picture given as its left, top, width and height.
  outline draws its four sides by hand; highlight pulls a marker's colour across it.
{"do": "point", "at": <spot>}
  Sends the pointer to a spot. It glides there from wherever it was and gives a small ripple when it lands.
  It stays until you hide it with the id "pointer".
{"do": "stamp", "icon": "check|cross|plus|minus|star|heart|bolt|drop|sun|leaf|flame|clock|warning|cloud",
 "at": <spot>, "size": "small|medium|large", "color": "...", "id": "..."}
  Stamps a simple sign on a spot.
{"do": "effect", "kind": "fire|smoke|sparks|dust|confetti|energy|rain|snow", "at": <spot>, "id": "..."}
  Runs a moving effect at a spot: flames, rising smoke, flying sparks, drifting dust, one burst of confetti, a
  glow of energy. rain and snow fall over the whole frame and take no "at".
{"do": "travel", "path": [<spot>, <spot>, ...], "color": "...", "repeat": true, "lasts": "pace|until-next",
 "id": "..."}
  Sends a glowing dot through 2 to 6 spots in order, with a fading trail behind it: a thing on its way. It
  takes the beat's pace, or with until-next it is on its way until the next beat begins, and then rests where
  it arrived. With repeat it goes round again and again, for a thing that keeps flowing.
{"do": "attention", "target": "<picture>.<part>", "verb": "dim|encircle|pulse"}
  Draws the eye to a part: dim leaves it lit and lets everything else fall into shadow, encircle draws a ring
  round it by hand, pulse sends two ripples out from it. A ring and a pulse are for a small part: round one
  that fills much of the frame they are not drawn at all, and a box or dim does the job. It lasts until the
  camera moves or another one takes over.
{"do": "label", "target": "<picture>" or "<picture>.<part>", "text": "...", "id": "..."}
  Attaches a small name tag to a thing, at most 32 characters. It names the thing and stays beside it.
{"do": "speak", "target": "<picture>.<part>", "text": "..."}
  Shows a figure's own words in a speech bubble beside that part, at most 60 characters. One bubble at a time.
{"do": "show", "targets": ["<id>"], "entrance": "fade|slam|word-by-word"}
  Brings on words, a formula, a counter, a chart or a timeline. fade is gentle, slam lands hard, word-by-word
  builds it up.
{"do": "hide", "targets": ["<id>"]}
  Takes off words, a formula, a counter, a chart or a timeline, or anything drawn with an id: a label, an
  arrow, a line, a box, a stamp, an effect, a travelling dot, or "pointer".
{"do": "shake", "strength": "subtle|normal|strong"}
  Shakes the whole frame briefly.
{"do": "flash"}
  Flashes the whole frame white for an instant.

A <spot> is somewhere in the picture now on screen, one of:
- "<picture>.<part>": a listed part of it. This is exact: the film measured the part in the drawing.
- {"x": 0.42, "y": 0.71}: a point you can see in the picture, as shares of its width and height from the
  top-left corner, the same measure as a part's box. Use it for a thing that has no listed part.

An arrow, a line, a box, a stamp, an effect and a travelling dot stay until the picture changes, or until you
hide them by id. Each starts and ends on something the narrator names at that moment: an arrow, a line or a
dot between two spots that are nearly the same place is too short to read and is not drawn. Marks left up pile
on each other, so one that has done its work is hidden before the next arrives.

### What each one is for

Each of these says something different to the viewer, so the one to use is the one that says what the narrator
is saying. This is how to read a sentence for it.

- Something goes from one place to another, flows, is sent, arrives: "travel" shows the thing itself on its
  way. "arrow" leaves the direction on the picture after it has been said, and is also how a cause, a force or
  a push is shown.
- The narrator follows something long, or goes through a picture from one end to the other: "pan" takes the
  viewer along it.
- Things are named one after another: "point" goes to each as it is named.
- One thing is picked out of several: "box" for a thing with a clear shape, its highlight style for a stretch
  or a band, "attention" encircle for a small thing, dim when everything else should fall away.
- Two things are compared, matched or measured against each other: "line" joins them. A distance or a level
  is a line too, dashed when it is not a real thing.
- A number is said: a keyword beside the thing it measures, or a "counter" when the size of it is the point.
  Several numbers set against each other are a chart. Moments in order are a timeline.
- Something is right, wrong, dangerous, more, less, hot, wet, charged: "stamp" puts the sign for it on the
  thing.
- Something burns, smokes, sparks, glows, or the weather is part of it: "effect", for as long as it is true.
- A thing is named for the first time: "label". A figure says or thinks something: "speak".
- Something hits, breaks or happens all at once: "shake" or "flash", on that word.
- The narrator moves on. The next picture dissolves in unless how it follows from the last is worth showing:
  push for the next thing in a row, zoom for going inside or closer, wipe for time passing or a before and
  after, iris for a reveal, a plain cut when the same shot simply changes.

A step that reaches for the same one each time has told the viewer one thing over and over. Over its length a
step usually calls for several different ones, because its sentences say different things.

## What the film will not accept

The film checks your scene. Anything below is dropped from it, and you are asked to write it again.

- An id that is not one of this step's pictures, a part listed for it, or an object you declared.
- More than 22 words of narration, eight or nine seconds, with no beat in them: a stretch spoken over a frame
  that stands still.
- A "say" that is not in the narration word for word, or that comes earlier in the narration than the beat
  before it.
- A picture declared hidden that nothing ever brings on.
- A spot that names anything but a listed part of the picture on screen, or a point outside 0 to 1.
- The camera, a name, a ring or a speech bubble aimed at a part that is not listed, and a name, a ring or a
  speech bubble for a picture that is not the one on screen at that moment.
- An id used twice.
- Text over its length limit.`;

/**
 * The start of every scene writer's request in one film: the same text, word for word, in each call. Keeping
 * it first and unchanged is what lets the prompt cache serve it to every scene writer after the first.
 */
export function sceneStable(skills: string): string {
  return `## The visual skills for this film
${skills || "none"}

`;
}

/** The part of a scene writer's request that belongs to one step alone. It always comes after the stable part. */
export function sceneContext(pictures: unknown[], step: unknown): string {
  return `## This step's pictures
${JSON.stringify(pictures)}

## This step
${JSON.stringify(step)}`;
}

export const SCENE_REPAIR = "That was not one valid JSON object. Write the scene again as one JSON object only.";

export function sceneRetry(problems: string[], ids: string): string {
  return `Your scene has things the film cannot play, and each would be dropped from it:
${problems.map((p) => `- ${p}`).join("\n")}

The only ids you may name:
${ids}

Correct these and keep everything else as you wrote it. Where a part was not found, find another way to show the viewer what it was for. Write the whole scene again as one JSON object only.`;
}

export const VOICE_STYLE =
  "You are narrating an animated explainer film for one curious person. Sound like a thoughtful friend telling them " +
  "something worth knowing: warm, clear and natural, never a lecturer and never a salesperson. Let the feeling of " +
  "each passage come through, with a natural pause between sentences.";

// ── The prompts a person may change ─────────────────────────────────────────────────────────────────
/**
 * Every prompt the app lets a person rewrite, by key. The parts of a prompt the pipeline depends on (the JSON
 * shapes, the ids, how a later moment is redrawn) are in these texts too: change them and the film may stop
 * playing, which is why each can be put back to what it was.
 */
export interface Prompts {
  plan: string;
  scene: string;
  parts: string;
  voice: string;
  look: string;
}

export const DEFAULT_PROMPTS: Prompts = { plan: PLAN_SYSTEM, scene: SCENE_SYSTEM, parts: PARTS_SYSTEM, voice: VOICE_STYLE, look: BACKGROUND_LOOK };

/** What each prompt is, for the page where they are edited. In the order the film uses them. */
export const PROMPT_INFO: { key: keyof Prompts; title: string; stage: string; about: string }[] = [
  { key: "plan", title: "Planner", stage: "plan", about: "Turns the question into the whole film: the narration, every picture's brief and each step's direction. It decides what is said and what is shown." },
  { key: "look", title: "Picture look", stage: "picture", about: "How every picture is drawn: the drawing style, the light and the mood. The briefs and the pipeline's own rules follow it." },
  { key: "parts", title: "Part finder", stage: "parts", about: "Looks at all of a film's finished pictures together, in one call, boxes each part the plan named, and adds the other things it sees, so the camera and marks can aim at them." },
  { key: "scene", title: "Scene writer", stage: "scene", about: "Directs one step: which picture is on screen at which words, where the camera goes, and what is written or drawn on top." },
  { key: "voice", title: "Voice style", stage: "voice", about: "How the narrator should sound. Sent with every step's words to the voice." },
];

/** The prompts a film is made with: each edited one in place of its default. An empty edit counts as none. */
export function promptsWith(edited: Partial<Prompts> | undefined): Prompts {
  const out = { ...DEFAULT_PROMPTS };
  for (const { key } of PROMPT_INFO) {
    const text = edited?.[key];
    if (typeof text === "string" && text.trim()) out[key] = text;
  }
  return out;
}

