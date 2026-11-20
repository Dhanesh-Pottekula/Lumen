/**
 * Voice marks. The planner performs each step's feeling with AiRA's four marks inside the narration:
 *   [curious]                 how the words after it feel
 *   [softly, slowly]          a lowered, slowed voice for a hard sentence
 *   *word*                    one stressed word
 *   <break time="500ms"/>     a short pause, 300 ms to 1 s
 * The viewer never sees a mark: captions and on-screen words use the plain text. Each voice provider gets the
 * marks in the form it understands.
 */

/** Every feeling the voice can be asked for. The planner's prompt lists these; anything else is not a mark the voice knows. */
export const VOICE_EMOTIONS = [
  "curious", "anticipation", "mysterious", "surprised", "amazed", "excited", "enthusiastic", "happy", "content", "calm", "serene",
  "confident", "proud", "triumphant", "determined", "contemplative", "skeptical", "sympathetic", "anxious", "alarmed", "sad",
  "melancholic", "wistful", "disappointed", "hesitant", "confused",
] as const;
/** The two words that lower and slow the voice. They may stand alone or follow an emotion. */
export const VOICE_MANNERS = ["softly", "slowly"] as const;

/** The bracketed marks in a narration that the voice does not know, in the order they appear. */
export function unknownMarks(marked: string): string[] {
  const known = new Set<string>([...VOICE_EMOTIONS, ...VOICE_MANNERS]);
  const unknown: string[] = [];
  for (const match of marked.matchAll(BRACKET)) {
    const words = match[1].split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.some((w) => !known.has(w))) unknown.push(match[1].trim());
  }
  return unknown;
}

/** The narration with every bracketed mark the voice does not know taken out, so only real marks reach it. */
export function knownMarksOnly(marked: string): string {
  const known = new Set<string>([...VOICE_EMOTIONS, ...VOICE_MANNERS]);
  return marked.replace(BRACKET, (whole, inside: string) => (inside.split(",").every((w) => known.has(w.trim().toLowerCase())) ? whole : "")).replace(/[ \t]{2,}/g, " ").trim();
}

const BRACKET = /\[([^\[\]]{1,40})\]/g;
const BREAK = /<break\s+time\s*=\s*["'](\d+(?:\.\d+)?)\s*(ms|s)["']\s*\/?>/gi;
const TAG = /<[^<>]*>/g;

const tidy = (text: string) => text.split(/\s+/).filter(Boolean).join(" ").replace(/\s+([.,!?;:])/g, "$1");

/** The words alone: what is captioned, matched against `say`, and counted. */
export function plainOf(marked: string): string {
  return tidy(marked.replace(BREAK, " ").replace(TAG, " ").replace(BRACKET, " ").replace(/\*/g, ""));
}

/**
 * For Cartesia, in the tags AiRA's planner writes for the same voice: a feeling becomes <emotion value="…"/>,
 * "slowly" becomes <speed ratio="0.9"/>, "softly" becomes <volume ratio="0.8"/>, and a pause keeps its own tag.
 * A feeling the voice does not know, and the stress stars, which it would read aloud, are removed.
 */
export function forCartesia(marked: string): string {
  const tags: string[] = [];
  const hold = (tag: string) => ` @@${tags.push(tag) - 1}@@ `;
  const known = new Set<string>(VOICE_EMOTIONS);
  const held = marked
    .replace(BREAK, (_m, amount: string, unit: string) => {
      const ms = Math.round(Number(amount) * (unit.toLowerCase() === "s" ? 1000 : 1));
      return ms < 300 || ms > 1000 ? " " : hold(`<break time="${ms}ms"/>`);
    })
    .replace(BRACKET, (_m, inside: string) => {
      const words = inside.split(",").map((w) => w.trim().toLowerCase());
      const emotion = words.find((w) => known.has(w));
      return [emotion ? hold(`<emotion value="${emotion}"/>`) : "", words.includes("slowly") ? hold('<speed ratio="0.9"/>') : "", words.includes("softly") ? hold('<volume ratio="0.8"/>') : ""].join("");
    });
  return tidy(held.replace(TAG, " ").replace(/\*/g, "")).replace(/@@(\d+)@@/g, (_m, i: string) => tags[Number(i)]);
}

/** For a voice that takes written directions: the marks, in order, as plain delivery notes. */
export function deliveryNotes(marked: string): string {
  const feelings: string[] = [];
  for (const match of marked.matchAll(BRACKET)) {
    const feeling = match[1].trim().toLowerCase();
    if (feelings.at(-1) !== feeling) feelings.push(feeling);
  }
  const stressed = [...marked.matchAll(/\*([^*\s][^*]{0,30})\*/g)].map((m) => m[1]);
  const notes: string[] = [];
  if (feelings.length) notes.push(`The feeling moves through, in order: ${feelings.join(", then ")}. Let each colour the delivery without overacting.`);
  if (stressed.length) notes.push(`Lean on the word "${stressed[0]}".`);
  if (BREAK.test(marked)) notes.push("Leave one short pause before the sentence that reveals or pays off.");
  BREAK.lastIndex = 0;
  return notes.join(" ");
}
