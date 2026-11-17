/**
 * playback — where the film is and what it should do next. Pure, so it can be tested without a browser.
 *
 * The cursor is a scene index and a time inside that scene. Each frame it moves forward by the voice's own
 * clock when the scene has one, and by elapsed time otherwise. A cursor that points past the scenes that have
 * arrived waits ("buffering") while more are coming, and finishes when the film is complete.
 */

export type Phase = "idle" | "buffering" | "playing" | "paused" | "finished";

export interface Cursor {
  scene: number;
  /** Seconds into the scene. */
  local: number;
  /** True once the current scene's voice has been started. */
  started: boolean;
  playing: boolean;
}

export interface Advance {
  phase: Phase;
  /** Set on the frame a scene begins: start its voice from `cursor.local`. */
  begin?: number;
  /** Set on the frame a scene ends: stop its voice. */
  end?: number;
}

/**
 * Move the cursor forward by one frame.
 * `lengths[i]` is scene i's length in seconds, for the scenes that are ready to play.
 * `voiceTime` is the current scene's voice position while it is audibly playing, else null.
 */
export function advance(cursor: Cursor, dt: number, lengths: number[], generating: boolean, voiceTime: number | null): Advance {
  if (!cursor.playing) return { phase: cursor.scene >= lengths.length && lengths.length > 0 && !generating ? "finished" : cursor.started || cursor.local > 0 || cursor.scene > 0 ? "paused" : "idle" };

  if (cursor.scene >= lengths.length) {
    // The next scene has not arrived. Wait if more are coming; otherwise the film is over.
    if (generating) return { phase: "buffering" };
    cursor.playing = false;
    return { phase: "finished" };
  }

  const result: Advance = { phase: "playing" };
  if (!cursor.started) {
    cursor.started = true;
    result.begin = cursor.scene;
    return result; // the voice starts this frame; time moves from the next
  }
  cursor.local = voiceTime ?? cursor.local + dt;
  if (cursor.local >= lengths[cursor.scene]) {
    result.end = cursor.scene;
    cursor.scene += 1;
    cursor.local = 0;
    cursor.started = false;
  }
  return result;
}
