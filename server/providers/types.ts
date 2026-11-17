/**
 * What the pipeline needs from the outside world. The pipeline owns every prompt and every rule; a provider only
 * carries the calls. Two exist: `openai` (real models) and `offline` (canned replies and drawn SVGs, used when no
 * key is set and by the tests).
 */

import type { SkillTool } from "../skills";

export interface ImageBytes {
  bytes: Uint8Array;
  /** MIME type, such as image/png. */
  type: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface PartsFound {
  parts: { part: string; box: number[] }[];
  missing: string[];
}

export interface Provider {
  name: string;
  /**
   * Stream the plan as text. `onText` sees every delta as it arrives. When `skills` is given, the model must
   * call that tool first; its answer is fed back and the plan is then written.
   */
  plan(system: string, brief: string, onText: (delta: string) => void, skills?: SkillTool | null): Promise<void>;
  /** Draw one picture. `reference` is the film's lead picture, or the earlier moment this one redraws. */
  draw(prompt: string, reference: ImageBytes | null, pictureId: string): Promise<ImageBytes>;
  /** Find parts in a finished picture. Boxes are in the picture's own pixels. */
  findParts(system: string, context: string, image: ImageBytes, pictureId: string, partIds: string[]): Promise<PartsFound>;
  /** One reply from the scene writer, given the conversation so far. */
  write(system: string, messages: Message[], stepId: string): Promise<string>;
  /** Speak a narration; null when this provider has no voice. */
  speak(text: string, style: string, stepId: string): Promise<ImageBytes | null>;
  /** The words heard in a voice clip with their times, and the clip's length; null when it cannot be measured. */
  hear(audio: ImageBytes, text: string): Promise<{ words: { word: string; start: number; end: number }[]; duration: number } | null>;
}
