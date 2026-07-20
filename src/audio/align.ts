import type { LessonSpec } from "../simple-json/types";
import type { WordTimestamp } from "./tts";

/**
 * Align a lesson's per-scene narration against the word timestamps of the ONE audio synthesized from all
 * scenes' narration concatenated. The result is each scene's reference time span on that audio, which the
 * compiler turns into a per-scene minimum duration (scene ≥ its audio, a little longer, never shorter).
 *
 * The audio is a single continuous stream, so alignment is purely sequential: we walk the returned words in
 * order and hand each scene enough of them to cover its narration text. Matching is done on a normalized
 * (alphanumeric, lowercased) form so it is robust to punctuation and to Cartesia splitting words
 * differently than our whitespace tokenization.
 */

/** The full text sent to TTS: every scene's narration, in order, space-joined. */
export function fullNarration(spec: LessonSpec): string {
  return spec.scenes
    .map((scene) => (scene.narration ?? "").trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

/** True when at least one scene carries narration (so audio timing is meaningful). */
export function hasNarration(spec: LessonSpec): boolean {
  return spec.scenes.some((scene) => (scene.narration ?? "").trim().length > 0);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface SceneSpan {
  startSec: number;
  endSec: number;
  span: number;
}

/**
 * Map each narrated scene id to its span on the audio timeline. Scenes with no narration are omitted.
 * If the words run out before a scene is covered (shouldn't happen for well-formed input), the scene gets
 * whatever remains.
 */
export function alignSceneNarration(spec: LessonSpec, words: WordTimestamp[]): Map<string, SceneSpan> {
  const spans = new Map<string, SceneSpan>();
  let wordIndex = 0;
  for (const scene of spec.scenes) {
    const target = normalize(scene.narration ?? "").length;
    if (target === 0) continue;

    const startWord = wordIndex;
    let covered = 0;
    while (wordIndex < words.length && covered < target) {
      covered += normalize(words[wordIndex].word).length;
      wordIndex++;
    }
    const endWord = Math.max(startWord, wordIndex - 1);
    if (startWord >= words.length) {
      // Ran out of audio for this scene — no reliable span; leave it unmapped so it keeps its paced duration.
      continue;
    }
    const startSec = words[startWord].start;
    const endSec = words[Math.min(endWord, words.length - 1)].end;
    spans.set(scene.id, { startSec, endSec, span: Math.max(0, endSec - startSec) });
  }
  return spans;
}

/**
 * Per-scene minimum on-screen duration in seconds, derived from the audio TIMELINE (not just the spoken
 * span). Each narrated scene lasts from where its narration begins to where the NEXT scene's narration
 * begins — so the silence/pause between scenes is held on the current scene's final frame, and cumulative
 * film time tracks the audio exactly. The last scene runs to the end of the audio plus a small tail pad.
 *
 * Because these boundaries sum to (audio duration + pad), the film is guaranteed ≥ the audio — never shorter
 * — and each scene stays aligned with its own narration. Scenes without narration are absent from the map
 * and keep whatever duration their beat pacing produced.
 */
export function sceneFloors(spec: LessonSpec, words: WordTimestamp[], tailPad = 0.4): Map<string, number> {
  const spans = alignSceneNarration(spec, words);
  const narrated = spec.scenes.map((scene) => scene.id).filter((id) => spans.has(id));
  const audioEnd = words.length ? words[words.length - 1].end : 0;

  const floors = new Map<string, number>();
  for (let i = 0; i < narrated.length; i++) {
    // First scene starts at timeline 0 (absorbs any lead-in silence); each other scene starts where its
    // narration begins. The boundary is the next scene's narration start, or the audio end for the last.
    const start = i === 0 ? 0 : spans.get(narrated[i])!.startSec;
    const boundary = i + 1 < narrated.length ? spans.get(narrated[i + 1])!.startSec : audioEnd;
    const duration = boundary - start + (i === narrated.length - 1 ? tailPad : 0);
    floors.set(narrated[i], Math.max(0, duration));
  }
  return floors;
}
