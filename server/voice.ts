/**
 * Voice marks. The planner performs each step's feeling with AiRA's four marks inside the narration:
 *   [curious]                 how the words after it feel
 *   [softly, slowly]          a lowered, slowed voice for a hard sentence
 *   *word*                    one stressed word
 *   <break time="500ms"/>     a short pause, 300 ms to 1 s
 * The viewer never sees a mark: captions and on-screen words use the plain text. Each voice provider gets the
 * marks in the form it understands.
 */

const BRACKET = /\[([^\[\]]{1,40})\]/g;
const BREAK = /<break\s+time\s*=\s*["'](\d+(?:\.\d+)?)\s*(ms|s)["']\s*\/?>/gi;
const TAG = /<[^<>]*>/g;

const tidy = (text: string) => text.split(/\s+/).filter(Boolean).join(" ").replace(/\s+([.,!?;:])/g, "$1");

/** The words alone: what is captioned, matched against `say`, and counted. */
export function plainOf(marked: string): string {
  return tidy(marked.replace(BREAK, " ").replace(TAG, " ").replace(BRACKET, " ").replace(/\*/g, ""));
}

/** For Cartesia: pauses are kept in its own tag; feeling and stress marks, which it would read aloud, are removed. */
export function forCartesia(marked: string): string {
  const pauses: string[] = [];
  const held = marked.replace(BREAK, (_m, amount: string, unit: string) => {
    const ms = Math.round(Number(amount) * (unit.toLowerCase() === "s" ? 1000 : 1));
    if (ms < 300 || ms > 1000) return " ";
    pauses.push(`<break time="${ms}ms"/>`);
    return ` @@${pauses.length - 1}@@ `;
  });
  return tidy(held.replace(TAG, " ").replace(BRACKET, " ").replace(/\*/g, "")).replace(/@@(\d+)@@/g, (_m, i: string) => pauses[Number(i)]);
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
